import urllib.request
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.face import FaceEngine
from app.main import create_app
from app.store import MemoryStore

FIXTURES = Path(__file__).parent / "fixtures"
SAME_URL = "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/obama.jpg"
OTHER_URL = "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/biden.jpg"


def _download(url: str, name: str) -> Path:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    path = FIXTURES / name
    if not path.exists() or path.stat().st_size == 0:
        urllib.request.urlretrieve(url, path)
    return path


def _jpeg(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


@pytest.fixture(scope="module")
def faces():
    same = cv2.imread(str(_download(SAME_URL, "same.jpg")))
    other = cv2.imread(str(_download(OTHER_URL, "other.jpg")))
    assert same is not None and other is not None
    height, width = same.shape[:2]
    variant = same[int(height * 0.08) : int(height * 0.92), int(width * 0.05) : int(width * 0.95)]
    blank = np.full((480, 480, 3), (210, 190, 170), dtype=np.uint8)
    left = cv2.resize(same, (320, 400))
    right = cv2.resize(other, (320, 400))
    pair = np.hstack([left, right])
    engine = FaceEngine()
    return {
        "engine": engine,
        "same": _jpeg(same),
        "variant": _jpeg(variant),
        "other": _jpeg(other),
        "blank": _jpeg(blank),
        "pair": _jpeg(pair),
    }


def test_same_person_scores_above_threshold_and_other_does_not(faces):
    engine = faces["engine"]
    enrolled = engine.embed(faces["same"])
    variant = engine.embed(faces["variant"])
    other = engine.embed(faces["other"])
    same_match, same_score = engine.matches(enrolled, variant)
    other_match, other_score = engine.matches(enrolled, other)
    assert same_match is True
    assert same_score >= 0.363
    assert other_match is False
    assert other_score < 0.363


def test_blank_and_two_faces_are_rejected(faces):
    from app.face import MultipleFacesError, NoFaceError

    with pytest.raises(NoFaceError):
        faces["engine"].embed(faces["blank"])
    with pytest.raises(MultipleFacesError):
        faces["engine"].embed(faces["pair"])


def test_close_up_that_fills_the_frame_still_matches(faces):
    raw = cv2.imdecode(np.frombuffer(faces["same"], dtype=np.uint8), cv2.IMREAD_COLOR)
    engine = faces["engine"]
    with engine._lock:
        box = engine._detect_one(raw)
    x, y, width, height = [int(value) for value in box[:4]]
    inner_x = x + int(width * 0.12)
    inner_y = y + int(height * 0.08)
    inner_w = max(1, int(width * 0.76))
    inner_h = max(1, int(height * 0.84))
    tight = raw[inner_y : inner_y + inner_h, inner_x : inner_x + inner_w]
    close = cv2.resize(tight, (1280, 1280))

    enrolled = engine.embed(faces["same"])
    close_match, close_score = engine.matches(enrolled, engine.embed(_jpeg(close)))
    assert close_match is True
    assert close_score >= 0.363


def test_api_match_inserts_and_mismatch_does_not(faces):
    store = MemoryStore()
    client = TestClient(create_app(store=store, engine=faces["engine"]))
    admin = client.post("/login", json={"username": "admin", "password": "admin123"}).json()["token"]
    created = client.post(
        "/staff",
        json={"name": "Alex Kim", "employee_id": "E200"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    staff_id = created.json()["id"]
    enrolled = client.post(
        f"/staff/{staff_id}/enroll",
        headers={"Authorization": f"Bearer {admin}"},
        files={"image": ("face.jpg", faces["same"], "image/jpeg")},
    )
    assert enrolled.status_code == 200
    assert enrolled.json()["enrolled"] is True

    staff_token = client.post(
        "/login", json={"username": "E200", "password": "staff123"}
    ).json()["token"]

    mismatch = client.post(
        f"/staff/{staff_id}/attendance",
        headers={"Authorization": f"Bearer {staff_token}"},
        files={"image": ("selfie.jpg", faces["other"], "image/jpeg")},
        data={"latitude": "19.07", "longitude": "72.87"},
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["detail"]["matched"] is False
    assert store.attendance == []

    blank = client.post(
        f"/staff/{staff_id}/attendance",
        headers={"Authorization": f"Bearer {staff_token}"},
        files={"image": ("selfie.jpg", faces["blank"], "image/jpeg")},
        data={"latitude": "19.07", "longitude": "72.87"},
    )
    assert blank.status_code == 422
    assert store.attendance == []

    pair = client.post(
        f"/staff/{staff_id}/attendance",
        headers={"Authorization": f"Bearer {staff_token}"},
        files={"image": ("selfie.jpg", faces["pair"], "image/jpeg")},
        data={"latitude": "19.07", "longitude": "72.87"},
    )
    assert pair.status_code == 422
    assert "one face" in pair.json()["detail"].lower() or "only your face" in pair.json()["detail"].lower()
    assert store.attendance == []

    matched = client.post(
        f"/staff/{staff_id}/attendance",
        headers={"Authorization": f"Bearer {staff_token}"},
        files={"image": ("selfie.jpg", faces["variant"], "image/jpeg")},
        data={"latitude": "19.076", "longitude": "72.877"},
    )
    assert matched.status_code == 200
    body = matched.json()
    assert body["matched"] is True
    assert body["attendance"]["latitude"] == 19.076
    assert body["attendance"]["selfie_url"].startswith("memory://")
    assert len(store.attendance) == 1
    assert store.files
