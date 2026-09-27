from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from uuid import uuid4

import httpx
from supabase import Client, ClientOptions, create_client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryStore:
    def __init__(self):
        self.staff: list[dict] = []
        self.templates: dict[str, dict] = {}
        self.attendance: list[dict] = []
        self.files: dict[tuple[str, str], bytes] = {}

    def list_staff(self) -> list[dict]:
        return [dict(row) for row in self.staff]

    def get_staff(self, staff_id: str) -> dict | None:
        return next((dict(row) for row in self.staff if row["id"] == staff_id), None)

    def get_staff_by_employee_id(self, employee_id: str) -> dict | None:
        return next(
            (dict(row) for row in self.staff if row["employee_id"] == employee_id),
            None,
        )

    def create_staff(self, name: str, employee_id: str) -> dict:
        if self.get_staff_by_employee_id(employee_id):
            raise ValueError("That employee ID is already in use.")
        row = {
            "id": str(uuid4()),
            "name": name,
            "employee_id": employee_id,
            "created_at": _now(),
        }
        self.staff.append(row)
        return dict(row)

    def upload(self, bucket: str, path: str, data: bytes) -> None:
        self.files[(bucket, path)] = data

    def signed_url(self, bucket: str, path: str) -> str | None:
        if (bucket, path) not in self.files:
            return None
        return f"memory://{bucket}/{path}"

    def upsert_template(self, staff_id: str, embedding: list[float], image_path: str) -> dict:
        row = {
            "staff_id": staff_id,
            "embedding": embedding,
            "image_path": image_path,
            "created_at": _now(),
        }
        self.templates[staff_id] = row
        return dict(row)

    def get_template(self, staff_id: str) -> dict | None:
        row = self.templates.get(staff_id)
        return dict(row) if row else None

    def add_attendance(
        self,
        staff_id: str,
        selfie_path: str,
        latitude: float,
        longitude: float,
        similarity: float,
    ) -> dict:
        row = {
            "id": str(uuid4()),
            "staff_id": staff_id,
            "marked_at": _now(),
            "selfie_path": selfie_path,
            "latitude": latitude,
            "longitude": longitude,
            "similarity": similarity,
        }
        self.attendance.append(row)
        return dict(row)

    def list_attendance(self, staff_id: str) -> list[dict]:
        rows = [row for row in self.attendance if row["staff_id"] == staff_id]
        return [dict(row) for row in reversed(rows)]


def _require_secret_key_support(key: str) -> None:
    if not key.startswith("sb_"):
        return
    try:
        installed = version("supabase")
    except PackageNotFoundError:
        installed = "0"
    major_text, _, minor_text = installed.partition(".")
    major = int(major_text) if major_text.isdigit() else 0
    minor = int(minor_text.split(".", 1)[0]) if minor_text[:1].isdigit() else 0
    if (major, minor) < (2, 31):
        raise RuntimeError(
            f"supabase {installed} only accepts older JWT keys, so this secret key is rejected. "
            "Start the API with backend\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
        )


class SupabaseStore:
    def __init__(self, url: str, key: str, client: Client | None = None):
        if client is None:
            _require_secret_key_support(key)
        self.client = client or create_client(
            url,
            key,
            options=ClientOptions(
                httpx_client=httpx.Client(http2=False, timeout=20.0),
            ),
        )

    def list_staff(self) -> list[dict]:
        result = self.client.table("staff").select("*").order("created_at").execute()
        return result.data or []

    def get_staff(self, staff_id: str) -> dict | None:
        result = (
            self.client.table("staff").select("*").eq("id", staff_id).limit(1).execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def get_staff_by_employee_id(self, employee_id: str) -> dict | None:
        result = (
            self.client.table("staff")
            .select("*")
            .eq("employee_id", employee_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def create_staff(self, name: str, employee_id: str) -> dict:
        try:
            result = (
                self.client.table("staff")
                .insert({"name": name, "employee_id": employee_id})
                .execute()
            )
        except Exception as error:
            text = str(error).lower()
            if "duplicate" in text or "23505" in text:
                raise ValueError("That employee ID is already in use.") from error
            raise
        return result.data[0]

    def upload(self, bucket: str, path: str, data: bytes) -> None:
        self.client.storage.from_(bucket).upload(
            path,
            data,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )

    def signed_url(self, bucket: str, path: str) -> str | None:
        result = self.client.storage.from_(bucket).create_signed_url(path, 3600)
        if isinstance(result, dict):
            return result.get("signedURL") or result.get("signedUrl")
        return None

    def upsert_template(self, staff_id: str, embedding: list[float], image_path: str) -> dict:
        result = (
            self.client.table("face_templates")
            .upsert(
                {
                    "staff_id": staff_id,
                    "embedding": embedding,
                    "image_path": image_path,
                },
                on_conflict="staff_id",
            )
            .execute()
        )
        return result.data[0]

    def get_template(self, staff_id: str) -> dict | None:
        result = (
            self.client.table("face_templates")
            .select("*")
            .eq("staff_id", staff_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def add_attendance(
        self,
        staff_id: str,
        selfie_path: str,
        latitude: float,
        longitude: float,
        similarity: float,
    ) -> dict:
        result = (
            self.client.table("attendance")
            .insert(
                {
                    "staff_id": staff_id,
                    "selfie_path": selfie_path,
                    "latitude": latitude,
                    "longitude": longitude,
                    "similarity": similarity,
                }
            )
            .execute()
        )
        return result.data[0]

    def list_attendance(self, staff_id: str) -> list[dict]:
        result = (
            self.client.table("attendance")
            .select("*")
            .eq("staff_id", staff_id)
            .order("marked_at", desc=True)
            .execute()
        )
        return result.data or []
