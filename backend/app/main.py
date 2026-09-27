from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.auth import issue_token, read_token, require_admin, require_self_or_admin
from app.config import settings
from app.face import FaceEngine, FaceError
from app.store import SupabaseStore

ENROLL_BUCKET = "enrollments"
SELFIE_BUCKET = "attendance-selfies"


class LoginBody(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class StaffBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    employee_id: str = Field(min_length=1, max_length=40)


def create_app(store=None, engine=None) -> FastAPI:
    app = FastAPI(title="Attendance")
    app.state.store = store
    app.state.engine = engine
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_store():
        if app.state.store is None:
            if not settings.supabase_url or not settings.supabase_service_role_key:
                raise HTTPException(
                    status_code=500,
                    detail="Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env",
                )
            try:
                app.state.store = SupabaseStore(
                    settings.supabase_url,
                    settings.supabase_service_role_key,
                )
            except RuntimeError as error:
                raise HTTPException(status_code=500, detail=str(error)) from error
        return app.state.store

    def get_engine() -> FaceEngine:
        if app.state.engine is None:
            app.state.engine = FaceEngine()
        return app.state.engine

    def staff_view(record: dict) -> dict:
        template = get_store().get_template(record["id"])
        image_url = None
        if template:
            image_url = get_store().signed_url(ENROLL_BUCKET, template["image_path"])
        return {
            "id": record["id"],
            "name": record["name"],
            "employee_id": record["employee_id"],
            "created_at": record["created_at"],
            "enrolled": template is not None,
            "enrollment_image_url": image_url,
        }

    def attendance_view(row: dict) -> dict:
        return {
            "id": row["id"],
            "staff_id": row["staff_id"],
            "marked_at": row["marked_at"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "similarity": row["similarity"],
            "selfie_url": get_store().signed_url(SELFIE_BUCKET, row["selfie_path"]),
        }

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/login")
    def login(body: LoginBody):
        username = body.username.strip()
        password = body.password
        if username == "admin" and password == "admin123":
            return {"token": issue_token("admin"), "role": "admin", "staff": None}
        if password != "staff123":
            raise HTTPException(status_code=401, detail="Invalid credentials.")
        staff = get_store().get_staff_by_employee_id(username)
        if staff is None:
            raise HTTPException(status_code=401, detail="Invalid credentials.")
        return {
            "token": issue_token("staff", staff),
            "role": "staff",
            "staff": staff_view(staff),
        }

    @app.get("/staff")
    def list_staff(request: Request):
        require_admin(read_token(request))
        return [staff_view(row) for row in get_store().list_staff()]

    @app.post("/staff", status_code=201)
    def add_staff(body: StaffBody, request: Request):
        require_admin(read_token(request))
        name = body.name.strip()
        employee_id = body.employee_id.strip()
        if not name or not employee_id:
            raise HTTPException(status_code=422, detail="Name and employee ID are required.")
        try:
            record = get_store().create_staff(name, employee_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return staff_view(record)

    @app.get("/staff/{staff_id}")
    def get_staff(staff_id: str, request: Request):
        require_self_or_admin(read_token(request), staff_id)
        record = get_store().get_staff(staff_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Staff member not found.")
        return staff_view(record)

    @app.post("/staff/{staff_id}/enroll")
    async def enroll(
        staff_id: str,
        request: Request,
        image: UploadFile = File(...),
    ):
        require_admin(read_token(request))
        record = get_store().get_staff(staff_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Staff member not found.")
        data = await image.read()
        try:
            embedding = get_engine().embed(data)
        except FaceError as error:
            raise HTTPException(status_code=422, detail=error.message) from error
        image_path = f"{staff_id}/{uuid4()}.jpg"
        get_store().upload(ENROLL_BUCKET, image_path, data)
        get_store().upsert_template(staff_id, embedding, image_path)
        return staff_view(record)

    @app.post("/staff/{staff_id}/attendance")
    async def mark_attendance(
        staff_id: str,
        request: Request,
        image: UploadFile = File(...),
        latitude: float = Form(...),
        longitude: float = Form(...),
    ):
        user = read_token(request)
        if user["role"] != "staff" or user.get("staff_id") != staff_id:
            raise HTTPException(status_code=403, detail="You can only mark your own attendance.")
        if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
            raise HTTPException(status_code=422, detail="A valid location is required.")
        record = get_store().get_staff(staff_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Staff member not found.")
        template = get_store().get_template(staff_id)
        if template is None:
            raise HTTPException(status_code=409, detail="Face is not enrolled yet.")
        data = await image.read()
        try:
            embedding = get_engine().embed(data)
            matched, score = get_engine().matches(template["embedding"], embedding)
        except FaceError as error:
            raise HTTPException(status_code=422, detail=error.message) from error
        score = round(score, 4)
        if not matched:
            raise HTTPException(
                status_code=422,
                detail={
                    "matched": False,
                    "similarity": score,
                    "message": "Face does not match the enrolled face.",
                },
            )
        image_path = f"{staff_id}/{uuid4()}.jpg"
        get_store().upload(SELFIE_BUCKET, image_path, data)
        row = get_store().add_attendance(staff_id, image_path, latitude, longitude, score)
        return {
            "matched": True,
            "similarity": score,
            "attendance": attendance_view(row),
        }

    @app.get("/staff/{staff_id}/attendance")
    def list_attendance(staff_id: str, request: Request):
        require_self_or_admin(read_token(request), staff_id)
        if get_store().get_staff(staff_id) is None:
            raise HTTPException(status_code=404, detail="Staff member not found.")
        return [attendance_view(row) for row in get_store().list_attendance(staff_id)]

    return app


app = create_app()
