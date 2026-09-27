import io
import threading
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.config import settings

YUNET_NAME = "face_detection_yunet_2023mar.onnx"
SFACE_NAME = "face_recognition_sface_2021dec.onnx"
YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
SFACE_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_recognition_sface/face_recognition_sface_2021dec.onnx"
)
MAX_EDGE = 1280
DETECT_EDGE = 640


class FaceError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NoFaceError(FaceError):
    pass


class MultipleFacesError(FaceError):
    pass


class UnreadableImageError(FaceError):
    pass


def ensure_models(model_dir: Path | None = None) -> Path:
    target = model_dir or settings.model_dir
    target.mkdir(parents=True, exist_ok=True)
    for name, url in ((YUNET_NAME, YUNET_URL), (SFACE_NAME, SFACE_URL)):
        path = target / name
        if path.exists() and path.stat().st_size > 0:
            continue
        import urllib.request

        urllib.request.urlretrieve(url, path)
    return target


def _decode(image_bytes: bytes) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(image_bytes)) as opened:
            upright = ImageOps.exif_transpose(opened) or opened
            rgb = np.array(upright.convert("RGB"))
    except Exception as error:
        raise UnreadableImageError("Could not read that image.") from error
    if rgb.size == 0:
        raise UnreadableImageError("Could not read that image.")
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _shrink(image: np.ndarray, edge: int) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= edge:
        return image, 1.0
    factor = edge / longest
    small = cv2.resize(
        image,
        (max(1, int(width * factor)), max(1, int(height * factor))),
        interpolation=cv2.INTER_AREA,
    )
    return small, 1.0 / factor


def _overlap(first: np.ndarray, second: np.ndarray) -> float:
    ax, ay, aw, ah = [float(value) for value in first[:4]]
    bx, by, bw, bh = [float(value) for value in second[:4]]
    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = aw * ah + bw * bh - intersection
    if union <= 0:
        return 0.0
    return intersection / union


def _limit_size(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= MAX_EDGE:
        return image
    scale = MAX_EDGE / longest
    return cv2.resize(
        image,
        (int(width * scale), int(height * scale)),
        interpolation=cv2.INTER_AREA,
    )


class FaceEngine:
    def __init__(self, model_dir: Path | None = None, threshold: float | None = None):
        directory = ensure_models(model_dir)
        self.threshold = settings.match_threshold if threshold is None else threshold
        self.detector = cv2.FaceDetectorYN.create(
            str(directory / YUNET_NAME),
            "",
            (320, 320),
            0.9,
            0.3,
            5000,
        )
        self.recognizer = cv2.FaceRecognizerSF.create(str(directory / SFACE_NAME), "")
        self._lock = threading.Lock()

    def embed(self, image_bytes: bytes) -> list[float]:
        image = _limit_size(_decode(image_bytes))
        with self._lock:
            face = self._detect_one(image)
            aligned = self.recognizer.alignCrop(image, face)
            feature = self.recognizer.feature(aligned)
        return feature.flatten().astype(float).tolist()

    def _detect_one(self, image: np.ndarray) -> np.ndarray:
        self.detector.setInputSize((image.shape[1], image.shape[0]))
        confident = self._pick(self._detect_at(image, 0.9))
        if confident is not None and float(confident[14]) >= 0.8:
            return confident

        small, scale = _shrink(image, DETECT_EDGE)
        if scale != 1.0:
            self.detector.setInputSize((small.shape[1], small.shape[0]))
            shrunk = self._pick(self._detect_at(small, 0.6), scale)
            if shrunk is not None:
                return shrunk

        self.detector.setInputSize((image.shape[1], image.shape[0]))
        fallback = self._pick(self._detect_at(image, 0.6))
        if fallback is not None:
            return fallback
        raise NoFaceError("No face found. Fit your face inside the oval and try again.")

    def _pick(self, faces, scale: float = 1.0) -> np.ndarray | None:
        if faces is None or len(faces) == 0:
            return None
        if scale != 1.0:
            faces = faces.copy()
            faces[:, :14] *= scale
        if len(faces) == 1:
            return faces[0]
        areas = faces[:, 2] * faces[:, 3]
        order = np.argsort(areas)[::-1]
        largest = faces[order[0]]
        others = [faces[index] for index in order[1:]]
        separate = [box for box in others if _overlap(largest, box) < 0.3]
        if not separate:
            return largest
        largest_area = float(areas[order[0]])
        if all(float(box[2] * box[3]) * 1.5 <= largest_area for box in separate):
            return largest
        raise MultipleFacesError(
            "More than one face found. Take a selfie with only your face."
        )

    def _detect_at(self, image: np.ndarray, score: float):
        self.detector.setScoreThreshold(score)
        _count, faces = self.detector.detect(image)
        return faces

    def similarity(self, left: list[float], right: list[float]) -> float:
        first = np.array(left, dtype=np.float32).reshape(1, -1)
        second = np.array(right, dtype=np.float32).reshape(1, -1)
        score = self.recognizer.match(first, second, cv2.FaceRecognizerSF_FR_COSINE)
        return float(score)

    def matches(self, left: list[float], right: list[float]) -> tuple[bool, float]:
        score = self.similarity(left, right)
        return score >= self.threshold, score
