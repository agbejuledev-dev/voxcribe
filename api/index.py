from flask import Flask, jsonify, render_template

app = Flask(
    __name__,
    template_folder="../templates",
    static_folder="../static",
    static_url_path="/static",
)


@app.route("/")
def index():
    return render_template("index.html")


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
