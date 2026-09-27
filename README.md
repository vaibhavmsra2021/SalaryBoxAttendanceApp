# Attendance

A small Android attendance app. An admin enrolls each staff member's face. Staff mark attendance with a selfie. The phone only captures the photo and the GPS fix. A Python service detects the face, compares it with the enrolled face, and writes the record to Supabase when the faces match.

Face detection uses OpenCV YuNet. Recognition uses OpenCV SFace (128-d embedding, cosine similarity). The match threshold is `0.363`, the LFW cosine threshold from the [OpenCV face tutorial](https://docs.opencv.org/4.13.0/d0/dd4/tutorial_dnn_face.html). Both model files are Apache-2.0 downloads from the [OpenCV model zoo](https://github.com/opencv/opencv_zoo). The public Android and vendor SDK repos on the [face-recognition-attendance-system topic](https://github.com/topics/face-recognition-attendance-system) were not used. Most of them are licensed camera SDKs, and the open ones are Java or notebooks that do not fit a React Native client with the model on a Python server.

## What it stores

When a match succeeds, the API stores the server timestamp, the selfie in a private Storage bucket, latitude, longitude, and the similarity score. A mismatch, a photo with no face, or a photo with more than one face does not insert a row.

Dummy logins:

- Admin: `admin` / `admin123`
- Staff: the employee ID / `staff123`

## Setup

1. Create a Supabase project and run [supabase/schema.sql](supabase/schema.sql) in the SQL editor.
2. Copy `backend/.env.example` to `backend/.env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `API_SECRET`. Keep the service role key on the machine that runs the API. The phone never receives it.
3. Install the API and start it so a phone on the same Wi-Fi can reach it:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The first enrollment or attendance call downloads the YuNet and SFace ONNX files into `backend/models/`.

4. Point the app at the API. For a phone on the same Wi-Fi, Expo Go guesses port 8000 on the computer that served the app. Set `EXPO_PUBLIC_API_URL` in `mobile/.env` when that guess is wrong, or when the API is the public Render URL from the next section. The Android emulator example is `http://10.0.2.2:8000`. Restart Expo after changing `.env`.

5. Start the app:

```powershell
cd mobile
npm install
npx expo start
```

Open it in Expo Go on Android. Camera and location permission are requested when you enroll a face or mark attendance.

## Tests

The API tests run without Supabase. The face tests download two public sample portraits on first run, then check a same-person match, a different person, a blank image, and a two-face image through the HTTP API.

```powershell
cd backend
.venv\Scripts\activate
pytest
```

