from flask import Flask, jsonify, request

app = Flask(__name__)


@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    return jsonify({
        "success": True,
        "text": (
            "This is a Voxcribe demo transcription. "
            "The live portfolio version demonstrates the complete "
            "recording, review, editing, and export experience. "
            "Full local Whisper transcription is available when "
            "running Voxcribe locally."
        ),
    })
