import os
import tempfile

from flask import Flask, jsonify, render_template, request
from pywhispercpp.model import Model

app = Flask(__name__)

# =========================================================
# LOCAL WHISPER
# =========================================================

print("Loading local Whisper model...")

whisper_model = Model(
    "base.en",
    n_threads=max(1, (os.cpu_count() or 4) - 1),
)

print("Local Whisper model ready.")


# =========================================================
# ROUTES
# =========================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({
            "success": False,
            "error": "No audio file was provided."
        }), 400

    audio_file = request.files["audio"]

    if not audio_file.filename:
        return jsonify({
            "success": False,
            "error": "The audio file has no filename."
        }), 400

    temp_path = None

    try:
        extension = (
            os.path.splitext(audio_file.filename)[1]
            or ".wav"
        )

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension
        ) as temp_file:
            audio_file.save(temp_file.name)
            temp_path = temp_file.name

        print(f"Transcribing: {temp_path}")

        segments = whisper_model.transcribe(
            temp_path,
            language="en",
        )

        transcript_parts = []

        for segment in segments:
            text = getattr(segment, "text", "")

            if text:
                transcript_parts.append(text.strip())

        transcript = " ".join(transcript_parts).strip()

        print(f"Transcript: {transcript}")

        return jsonify({
            "success": True,
            "text": transcript
        })

    except Exception as error:
        print("Transcription error:", error)

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


# =========================================================
# START SERVER
# =========================================================

if __name__ == "__main__":
    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )