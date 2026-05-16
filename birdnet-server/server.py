import os
import struct
import subprocess
import tempfile
import json

from birdnetlib import Recording
from birdnetlib.analyzer import Analyzer
from fastapi import FastAPI, Form, Header, HTTPException, UploadFile

app = FastAPI()
analyzer = Analyzer()

API_KEY = os.environ.get("BIRDNET_API_KEY")

# Fixed detection floor used for birdnetlib — intentionally low so all
# candidates reach the client, which applies the user's display threshold.
# The client's min_conf setting is NOT forwarded to birdnetlib.
BIRDNET_FLOOR = 0.1

DEFAULT_WEEK_48 = -1
DEFAULT_SENSITIVITY = 1.0
DEFAULT_OVERLAP = 0.0
DEFAULT_RETURN_ALL_DETECTIONS = False


def pcm_to_wav(pcm_bytes: bytes, sample_rate=16000, channels=1, bit_depth=16) -> bytes:
    byte_rate = sample_rate * channels * bit_depth // 8
    block_align = channels * bit_depth // 8
    data_size = len(pcm_bytes)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bit_depth,
        b"data",
        data_size,
    )
    return header + pcm_bytes


def parse_float(value, default=None):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_int(value, default=None):
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return default


@app.post("/analyze")
async def analyze(file: UploadFile, settings: str = Form(""), x_api_key: str = Header(None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    raw = await file.read()
    try:
        parsed_settings = json.loads(settings) if settings else {}
        if not isinstance(parsed_settings, dict):
            raise ValueError("settings must be a JSON object")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid settings payload: {exc}")

    # If client sends raw PCM (no RIFF header), wrap it in a 16 kHz WAV.
    if raw[:4] != b"RIFF":
        raw = pcm_to_wav(raw)

    tmp_in = None
    tmp_48k = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(raw)
            tmp_in = f.name

        tmp_48k = tmp_in.replace(".wav", "_48k.wav")

        # Resample to 48 kHz — birdnetlib requires this sample rate.
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in, "-ar", "48000", tmp_48k],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr.decode()}")

        lat = parse_float(parsed_settings.get("lat"))
        lon = parse_float(parsed_settings.get("lon"))
        recording_kwargs = {
            "week_48": parse_int(parsed_settings.get("week_48"), DEFAULT_WEEK_48),
            "min_conf": BIRDNET_FLOOR,
            "sensitivity": parse_float(parsed_settings.get("sensitivity"), DEFAULT_SENSITIVITY),
            "overlap": parse_float(parsed_settings.get("overlap"), DEFAULT_OVERLAP),
            "return_all_detections": parse_bool(
                parsed_settings.get("return_all_detections"), DEFAULT_RETURN_ALL_DETECTIONS
            ),
        }
        if lat is not None and lon is not None:
            recording_kwargs["lat"] = lat
            recording_kwargs["lon"] = lon

        recording = Recording(
            analyzer,
            tmp_48k,
            **recording_kwargs,
        )
        recording.analyze()
        return {"detections": recording.detections}
    finally:
        if tmp_in and os.path.exists(tmp_in):
            os.unlink(tmp_in)
        if tmp_48k and os.path.exists(tmp_48k):
            os.unlink(tmp_48k)
