import os
import struct
import subprocess
import tempfile

from birdnetlib import Recording
from birdnetlib.analyzer import Analyzer
from fastapi import FastAPI, Header, HTTPException, UploadFile

app = FastAPI()
analyzer = Analyzer()

API_KEY = os.environ.get("BIRDNET_API_KEY")


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


@app.post("/analyze")
async def analyze(file: UploadFile, x_api_key: str = Header(None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    raw = await file.read()

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

        recording = Recording(
            analyzer,
            tmp_48k,
            lat=44.0,
            lon=12.0,
            week_48=-1,
            min_conf=0.25,
        )
        recording.analyze()
        return {"detections": recording.detections}
    finally:
        if tmp_in and os.path.exists(tmp_in):
            os.unlink(tmp_in)
        if tmp_48k and os.path.exists(tmp_48k):
            os.unlink(tmp_48k)
