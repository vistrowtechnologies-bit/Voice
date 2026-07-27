FROM python:3.12-slim

WORKDIR /app

# ffmpeg only needed for ElevenLabs (MP3) voice replies on phone calls —
# see audio.py's _decode_mp3. Cheap to include, avoids a silent failure
# the first time a test agent's voice happens to be an ElevenLabs one.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
