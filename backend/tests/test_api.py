import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import create_app
from app.store import MemoryStore


def jpeg_bytes(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


class ScriptedEngine:
    """Returns a chosen embedding, or raises the configured face error."""

    def __init__(self):
        self.embedding = [0.1] * 128
        self.score = 0.9
        self.error = None
        self.threshold = 0.363

    def embed(self, image_bytes: bytes):
        if self.error:
            raise self.error
        return list(self.embedding)

    def matches(self, left, right):
        return self.score >= self.threshold, self.score


def client_with(engine=None):
    store = MemoryStore()
    app = create_app(store=store, engine=engine or ScriptedEngine())
    return TestClient(app), store, app.state.engine


def test_admin_can_add_and_list_staff():
    client, _store, _engine = client_with()
    login = client.post("/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200
    token = login.json()["token"]
    created = client.post(
        "/staff",
        json={"name": "Mina Rao", "employee_id": "E100"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert created.status_code == 201
    listed = client.get("/staff", headers={"Authorization": f"Bearer {token}"})
    assert listed.status_code == 200
    assert listed.json()[0]["employee_id"] == "E100"
    assert listed.json()[0]["enrolled"] is False


def test_duplicate_employee_id_is_rejected():
    client, _store, _engine = client_with()
    token = client.post("/login", json={"username": "admin", "password": "admin123"}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/staff", json={"name": "Mina Rao", "employee_id": "E100"}, headers=headers)
    again = client.post("/staff", json={"name": "Other", "employee_id": "E100"}, headers=headers)
    assert again.status_code == 409


def test_staff_login_and_cannot_list_everyone():
    client, store, _engine = client_with()
    store.create_staff("Mina Rao", "E100")
    login = client.post("/login", json={"username": "E100", "password": "staff123"})
    assert login.status_code == 200
    assert login.json()["role"] == "staff"
    denied = client.get("/staff", headers={"Authorization": f"Bearer {login.json()['token']}"})
    assert denied.status_code == 403


def test_unknown_staff_login_fails():
    client, _store, _engine = client_with()
    login = client.post("/login", json={"username": "missing", "password": "staff123"})
    assert login.status_code == 401


def test_attendance_without_enrollment_is_rejected():
    client, store, _engine = client_with()
    staff = store.create_staff("Mina Rao", "E100")
    login = client.post("/login", json={"username": "E100", "password": "staff123"})
    token = login.json()["token"]
    photo = jpeg_bytes(np.full((80, 80, 3), 120, dtype=np.uint8))
    response = client.post(
        f"/staff/{staff['id']}/attendance",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": ("selfie.jpg", photo, "image/jpeg")},
        data={"latitude": "12.97", "longitude": "77.59"},
    )
    assert response.status_code == 409
    assert store.attendance == []


def test_face_mismatch_does_not_insert_attendance():
    client, store, engine = client_with()
    engine.score = 0.1
    staff = store.create_staff("Mina Rao", "E100")
    store.upsert_template(staff["id"], [0.2] * 128, "enrolled.jpg")
    token = client.post("/login", json={"username": "E100", "password": "staff123"}).json()["token"]
    photo = jpeg_bytes(np.full((80, 80, 3), 30, dtype=np.uint8))
    response = client.post(
        f"/staff/{staff['id']}/attendance",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": ("selfie.jpg", photo, "image/jpeg")},
        data={"latitude": "12.97", "longitude": "77.59"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["matched"] is False
    assert store.attendance == []


def test_matching_face_stores_timestamp_selfie_and_location():
    client, store, engine = client_with()
    engine.score = 0.81
    staff = store.create_staff("Mina Rao", "E100")
    store.upsert_template(staff["id"], [0.2] * 128, "enrolled.jpg")
    token = client.post("/login", json={"username": "E100", "password": "staff123"}).json()["token"]
    photo = jpeg_bytes(np.full((80, 80, 3), 30, dtype=np.uint8))
    response = client.post(
        f"/staff/{staff['id']}/attendance",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": ("selfie.jpg", photo, "image/jpeg")},
        data={"latitude": "12.9716", "longitude": "77.5946"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["matched"] is True
    assert body["attendance"]["latitude"] == 12.9716
    assert body["attendance"]["longitude"] == 77.5946
    assert body["attendance"]["marked_at"]
    assert body["attendance"]["selfie_url"]
    assert len(store.attendance) == 1


def test_admin_cannot_mark_attendance_for_staff():
    client, store, _engine = client_with()
    staff = store.create_staff("Mina Rao", "E100")
    token = client.post("/login", json={"username": "admin", "password": "admin123"}).json()["token"]
    photo = jpeg_bytes(np.full((80, 80, 3), 30, dtype=np.uint8))
    response = client.post(
        f"/staff/{staff['id']}/attendance",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": ("selfie.jpg", photo, "image/jpeg")},
        data={"latitude": "1", "longitude": "2"},
    )
    assert response.status_code == 403
    assert store.attendance == []
