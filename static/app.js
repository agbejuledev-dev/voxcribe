"use strict";

/* =========================================================
   DOM
========================================================= */

const recordButton = document.getElementById("recordButton");
const recordButtonText = document.getElementById("recordButtonText");
const recordHint = document.getElementById("recordHint");
const recordingTitle = document.getElementById("recordingTitle");
const recordingStatus = document.getElementById("recordingStatus");
const liveTranscript = document.getElementById("liveTranscript");
const timerElement = document.getElementById("timer");
const wordCount = document.getElementById("wordCount");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const clearButton = document.getElementById("clearButton");
const newTranscriptButton =
    document.getElementById("newTranscriptBtn");
const languageSelect = document.getElementById("languageSelect");
const visualizer = document.getElementById("visualizer");

/* =========================================================
   AUDIO PLAYER
========================================================= */

const recordedAudio =
    document.getElementById("recordedAudio");

const audioPlayButton =
    document.getElementById("audioPlayButton");

const audioProgress =
    document.getElementById("audioProgress");

const audioCurrentTime =
    document.getElementById("audioCurrentTime");

const audioDuration =
    document.getElementById("audioDuration");

const audioSpeed =
    document.getElementById("audioSpeed");

const audioVolume =
    document.getElementById("audioVolume");

const audioReadyStatus =
    document.getElementById("audioReadyStatus");

/* =========================================================
   STATE
========================================================= */

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let isProcessing = false;

let finalTranscript = "";
let interimTranscript = "";

let mediaRecorder = null;
let recordedChunks = [];

let timerInterval = null;
let secondsElapsed = 0;

let microphoneStream = null;

let audioContext = null;
let analyser = null;
let microphoneSource = null;
let animationFrame = null;

let recordedAudioUrl = null;

/* =========================================================
   HELPERS
========================================================= */

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "00:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds
    ).padStart(2, "0")}`;
}

function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "00:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds
    ).padStart(2, "0")}`;
}

function getTranscriptText() {
    return liveTranscript.innerText
        .replace(/\u00a0/g, " ")
        .trim();
}

function updateWordCount() {
    const text = getTranscriptText();

    const words = text
        .split(/\s+/)
        .filter(Boolean);

    const count = text ? words.length : 0;

    wordCount.textContent =
        `${count} ${count === 1 ? "word" : "words"}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =========================================================
   TRANSCRIPT
========================================================= */

function renderTranscript() {
    const combined =
        `${finalTranscript} ${interimTranscript}`.trim();

    if (!combined) {
        liveTranscript.innerHTML = `
            <span class="placeholder">
                Your transcription will appear here as you speak...
            </span>
        `;

        updateWordCount();
        return;
    }

    liveTranscript.innerHTML = `
        <span class="final-text">
            ${escapeHtml(finalTranscript)}
        </span>
        ${
            interimTranscript
                ? `
                    <span class="interim-text">
                        ${escapeHtml(interimTranscript)}
                    </span>
                `
                : ""
        }
    `;

    updateWordCount();
}

/* =========================================================
   TIMER
========================================================= */

function startTimer() {
    secondsElapsed = 0;
    timerElement.textContent = "00:00";

    timerInterval = setInterval(() => {
        secondsElapsed += 1;
        timerElement.textContent =
            formatTime(secondsElapsed);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

/* =========================================================
   MIME TYPE
========================================================= */

function getSupportedMimeType() {
    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4"
    ];

    for (const type of types) {
        if (
            window.MediaRecorder &&
            MediaRecorder.isTypeSupported(type)
        ) {
            return type;
        }
    }

    return "";
}

/* =========================================================
   VISUALIZER
========================================================= */

async function startMicrophoneVisualizer() {
    if (!microphoneStream) {
        return;
    }

    try {
        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();

        analyser =
            audioContext.createAnalyser();

        analyser.fftSize = 64;

        microphoneSource =
            audioContext.createMediaStreamSource(
                microphoneStream
            );

        microphoneSource.connect(analyser);

        animateVisualizer();

    } catch (error) {
        console.warn(
            "Visualizer unavailable:",
            error
        );
    }
}

function animateVisualizer() {
    if (!analyser || !isRecording) {
        return;
    }

    const dataArray =
        new Uint8Array(
            analyser.frequencyBinCount
        );

    analyser.getByteFrequencyData(
        dataArray
    );

    const bars =
        visualizer.querySelectorAll("span");

    bars.forEach((bar, index) => {
        const value =
            dataArray[
                index % dataArray.length
            ] || 0;

        const height =
            Math.max(
                8,
                Math.min(70, value / 3)
            );

        bar.style.height =
            `${height}px`;
    });

    animationFrame =
        requestAnimationFrame(
            animateVisualizer
        );
}

function stopMicrophoneVisualizer() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    const bars =
        visualizer.querySelectorAll("span");

    bars.forEach((bar) => {
        bar.style.height = "8px";
    });

    if (microphoneSource) {
        try {
            microphoneSource.disconnect();
        } catch (_) {}

        microphoneSource = null;
    }

    if (analyser) {
        try {
            analyser.disconnect();
        } catch (_) {}

        analyser = null;
    }

    if (audioContext) {
        audioContext
            .close()
            .catch(() => {});

        audioContext = null;
    }
}

/* =========================================================
   MEDIA RECORDER
========================================================= */

function startAudioRecording() {
    if (!microphoneStream) {
        throw new Error(
            "Microphone stream unavailable."
        );
    }

    if (!window.MediaRecorder) {
        throw new Error(
            "Your browser does not support audio recording."
        );
    }

    const mimeType =
        getSupportedMimeType();

    const options =
        mimeType
            ? { mimeType }
            : undefined;

    mediaRecorder =
        new MediaRecorder(
            microphoneStream,
            options
        );

    recordedChunks = [];

    mediaRecorder.addEventListener(
        "dataavailable",
        (event) => {
            if (
                event.data &&
                event.data.size > 0
            ) {
                recordedChunks.push(
                    event.data
                );
            }
        }
    );

    mediaRecorder.addEventListener(
        "stop",
        processRecordedAudio
    );

    mediaRecorder.start();
}

function stopAudioRecording() {
    if (
        mediaRecorder &&
        mediaRecorder.state !== "inactive"
    ) {
        mediaRecorder.stop();
    }
}

/* =========================================================
   AUDIO PLAYER
========================================================= */

function loadRecordedAudio(blob) {
    if (!blob) {
        return;
    }

    if (recordedAudioUrl) {
        URL.revokeObjectURL(
            recordedAudioUrl
        );
    }

    recordedAudioUrl =
        URL.createObjectURL(blob);

    recordedAudio.src =
        recordedAudioUrl;

    recordedAudio.load();

    recordedAudio.currentTime = 0;

    recordedAudio.playbackRate =
        Number(audioSpeed.value);

    recordedAudio.volume =
        Number(audioVolume.value);

    audioPlayButton.disabled = false;

    audioReadyStatus.textContent =
        "Recording ready";

    audioProgress.value = 0;

    audioCurrentTime.textContent =
        "00:00";
}

function resetAudioPlayer() {
    recordedAudio.pause();
    recordedAudio.removeAttribute("src");
    recordedAudio.load();

    if (recordedAudioUrl) {
        URL.revokeObjectURL(
            recordedAudioUrl
        );

        recordedAudioUrl = null;
    }

    audioPlayButton.disabled = true;
    audioPlayButton.textContent = "▶";

    audioReadyStatus.textContent =
        "No recording yet";

    audioProgress.value = 0;

    audioCurrentTime.textContent =
        "00:00";

    audioDuration.textContent =
        "00:00";
}

/* =========================================================
   AUDIO EVENTS
========================================================= */

audioPlayButton.addEventListener(
    "click",
    async () => {
        if (!recordedAudio.src) {
            return;
        }

        try {
            if (recordedAudio.paused) {
                await recordedAudio.play();
            } else {
                recordedAudio.pause();
            }
        } catch (error) {
            console.error(
                "Playback error:",
                error
            );
        }
    }
);

recordedAudio.addEventListener(
    "play",
    () => {
        audioPlayButton.textContent =
            "❚❚";
    }
);

recordedAudio.addEventListener(
    "pause",
    () => {
        audioPlayButton.textContent =
            "▶";
    }
);

recordedAudio.addEventListener(
    "loadedmetadata",
    () => {
        audioDuration.textContent =
            formatAudioTime(
                recordedAudio.duration
            );
    }
);

recordedAudio.addEventListener(
    "timeupdate",
    () => {
        if (!recordedAudio.duration) {
            return;
        }

        const progress =
            (
                recordedAudio.currentTime /
                recordedAudio.duration
            ) * 100;

        audioProgress.value =
            progress;

        audioCurrentTime.textContent =
            formatAudioTime(
                recordedAudio.currentTime
            );
    }
);

recordedAudio.addEventListener(
    "ended",
    () => {
        audioPlayButton.textContent = "▶";
        audioProgress.value = 100;
    }
);

audioProgress.addEventListener(
    "input",
    () => {
        if (!recordedAudio.duration) {
            return;
        }

        recordedAudio.currentTime =
            (
                Number(audioProgress.value) /
                100
            ) *
            recordedAudio.duration;
    }
);

audioSpeed.addEventListener(
    "change",
    () => {
        recordedAudio.playbackRate =
            Number(audioSpeed.value);
    }
);

audioVolume.addEventListener(
    "input",
    () => {
        recordedAudio.volume =
            Number(audioVolume.value);
    }
);

/* =========================================================
   SPEECH RECOGNITION
========================================================= */

function createRecognition() {
    if (!SpeechRecognition) {
        return null;
    }

    const instance =
        new SpeechRecognition();

    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;
    instance.lang = languageSelect.value;

    instance.onstart = () => {
        recordingStatus.textContent =
            "Listening...";
    };

    instance.onresult = (event) => {
        let interim = "";

        for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
        ) {
            const result =
                event.results[i];

            const text =
                result[0].transcript;

            if (result.isFinal) {
                finalTranscript +=
                    `${text} `;
            } else {
                interim += text;
            }
        }

        interimTranscript = interim;

        renderTranscript();
    };

    instance.onerror = (event) => {
        console.warn(
            "Speech recognition:",
            event.error
        );
    };

    instance.onend = () => {
        if (
            isRecording &&
            recognition
        ) {
            try {
                recognition.start();
            } catch (_) {}
        }
    };

    return instance;
}

function startLiveRecognition() {
    if (!SpeechRecognition) {
        recordingStatus.textContent =
            "Recording audio. Live speech preview is unavailable in this browser.";
        return;
    }

    recognition =
        createRecognition();

    if (!recognition) {
        return;
    }

    try {
        recognition.start();
    } catch (error) {
        console.warn(error);
    }
}

function stopLiveRecognition() {
    if (!recognition) {
        return;
    }

    try {
        recognition.onend = null;
        recognition.stop();
    } catch (_) {}

    recognition = null;
}

/* =========================================================
   PROCESS RECORDING
========================================================= */

async function processRecordedAudio() {
    if (!recordedChunks.length) {
        isProcessing = false;

        recordButton.disabled = false;
        recordButtonText.textContent =
            "Start recording";

        recordingTitle.textContent =
            "No audio captured";

        recordingStatus.textContent =
            "Please try recording again.";

        return;
    }

    const mimeType =
        recordedChunks[0]?.type ||
        "audio/webm";

    const audioBlob =
        new Blob(
            recordedChunks,
            {
                type: mimeType
            }
        );

    /*
       IMPORTANT:
       The audio is loaded locally BEFORE
       attempting transcription.
    */

    loadRecordedAudio(audioBlob);

    recordingTitle.textContent =
        "Recording ready";

    recordingStatus.textContent =
        "Your recording is safe. Checking transcription service...";

    recordButton.disabled = false;
    recordButtonText.textContent =
        "Start recording";

    isProcessing = true;

    /*
       If there is no backend/API available,
       recording playback still works.
    */

    try {
        const extension =
            mimeType.includes("ogg")
                ? "ogg"
                : mimeType.includes("mp4")
                    ? "mp4"
                    : "webm";

        const formData =
            new FormData();

        formData.append(
            "audio",
            audioBlob,
            `voxcribe-recording.${extension}`
        );

        const response =
            await fetch(
                "/api/transcribe",
                {
                    method: "POST",
                    body: formData
                }
            );

        let data = null;

        try {
            data = await response.json();
        } catch (_) {
            data = null;
        }

        if (!response.ok) {
            throw new Error(
                data?.error ||
                "Transcription service unavailable."
            );
        }

        if (
            !data?.text ||
            !data.text.trim()
        ) {
            throw new Error(
                "No speech was detected."
            );
        }

        /*
           Successful API transcription.
        */

        finalTranscript =
            data.text.trim();

        interimTranscript = "";

        renderTranscript();

        recordingTitle.textContent =
            "Transcript ready";

        recordingStatus.textContent =
            "Your transcript is ready to review and edit.";

        recordHint.textContent =
            "Click inside the transcript to make changes.";

    } catch (error) {

        console.warn(
            "Transcription unavailable:",
            error
        );

        /*
           IMPORTANT:
           We DO NOT destroy the recording.
           The user can still listen and manually
           edit/write the transcript.
        */

        recordingTitle.textContent =
            "Recording ready";

        recordingStatus.textContent =
            "Audio saved locally. Automatic transcription is currently unavailable.";

        recordHint.textContent =
            "You can listen to the recording and edit the transcript manually.";

        audioReadyStatus.textContent =
            "Recording ready • transcription unavailable";

        /*
           If browser SpeechRecognition captured
           something, preserve it.
        */

        if (
            !finalTranscript.trim() &&
            !interimTranscript.trim()
        ) {
            liveTranscript.innerHTML = `
                <span class="placeholder">
                    Automatic transcription is unavailable.
                    Listen to your recording and type or paste your transcript here.
                </span>
            `;
        }

        updateWordCount();
    } finally {
        isProcessing = false;
        recordButton.disabled = false;

        if (
            recordButtonText.textContent ===
            "Processing..."
        ) {
            recordButtonText.textContent =
                "Start recording";
        }
    }
}

/* =========================================================
   START RECORDING
========================================================= */

async function startRecording() {
    if (isRecording || isProcessing) {
        return;
    }

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        recordingStatus.textContent =
            "Your browser does not support microphone recording.";

        return;
    }

    try {
        microphoneStream =
            await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

        isRecording = true;

        finalTranscript = "";
        interimTranscript = "";

        renderTranscript();

        resetAudioPlayer();

        startTimer();
        startAudioRecording();
        startMicrophoneVisualizer();
        startLiveRecognition();

        recordButton.classList.add(
            "recording"
        );

        recordButtonText.textContent =
            "Stop recording";

        recordHint.textContent =
            "Recording in progress. Speak naturally.";

        recordingTitle.textContent =
            "Recording in progress";

        recordingStatus.textContent =
            "Listening...";
    } catch (error) {
        console.error(
            "Recording error:",
            error
        );

        isRecording = false;

        stopTimer();

        if (microphoneStream) {
            microphoneStream
                .getTracks()
                .forEach((track) => {
                    track.stop();
                });

            microphoneStream = null;
        }

        recordingTitle.textContent =
            "Unable to record";

        recordingStatus.textContent =
            error.name === "NotAllowedError"
                ? "Microphone permission was denied. Please allow microphone access and try again."
                : "Unable to access your microphone.";

        recordButtonText.textContent =
            "Start recording";
    }
}

/* =========================================================
   STOP RECORDING
========================================================= */

function stopRecording() {
    if (!isRecording) {
        return;
    }

    isRecording = false;

    stopTimer();
    stopLiveRecognition();
    stopAudioRecording();
    stopMicrophoneVisualizer();

    if (microphoneStream) {
        microphoneStream
            .getTracks()
            .forEach((track) => {
                track.stop();
            });

        microphoneStream = null;
    }

    recordButton.classList.remove(
        "recording"
    );

    recordButtonText.textContent =
        "Processing...";

    recordHint.textContent =
        "Preparing your recording...";

    recordingTitle.textContent =
        "Recording complete";

    recordingStatus.textContent =
        "Preparing your recording...";
}

/* =========================================================
   RECORD BUTTON
========================================================= */

recordButton.addEventListener(
    "click",
    () => {
        if (isProcessing) {
            return;
        }

        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }
);

/* =========================================================
   LANGUAGE
========================================================= */

languageSelect.addEventListener(
    "change",
    () => {
        if (recognition) {
            recognition.lang =
                languageSelect.value;
        }
    }
);

/* =========================================================
   COPY
========================================================= */

copyButton.addEventListener(
    "click",
    async () => {
        const text =
            getTranscriptText();

        if (!text) {
            return;
        }

        try {
            await navigator.clipboard.writeText(
                text
            );

            const original =
                copyButton.textContent;

            copyButton.textContent =
                "Copied";

            setTimeout(() => {
                copyButton.textContent =
                    original;
            }, 1500);

        } catch (error) {
            console.error(
                "Copy failed:",
                error
            );
        }
    }
);

/* =========================================================
   EXPORT
========================================================= */

downloadButton.addEventListener(
    "click",
    () => {
        const text =
            getTranscriptText();

        if (!text) {
            return;
        }

        const blob =
            new Blob(
                [text],
                {
                    type:
                        "text/plain;charset=utf-8"
                }
            );

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = url;

        link.download =
            `voxcribe-transcript-${new Date()
                .toISOString()
                .slice(0, 10)}.txt`;

        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(url);
    }
);

/* =========================================================
   CLEAR
========================================================= */

clearButton.addEventListener(
    "click",
    () => {
        if (isRecording) {
            stopRecording();
        }

        finalTranscript = "";
        interimTranscript = "";

        renderTranscript();

        resetAudioPlayer();

        secondsElapsed = 0;

        timerElement.textContent =
            "00:00";

        recordingTitle.textContent =
            "Ready to record";

        recordingStatus.textContent =
            "Press the button below to begin.";

        recordHint.textContent =
            "Your microphone will be used to capture audio.";
    }
);

/* =========================================================
   NEW TRANSCRIPT
========================================================= */

newTranscriptButton.addEventListener(
    "click",
    () => {
        if (isRecording) {
            stopRecording();
        }

        finalTranscript = "";
        interimTranscript = "";

        renderTranscript();

        resetAudioPlayer();

        secondsElapsed = 0;

        timerElement.textContent =
            "00:00";

        recordingTitle.textContent =
            "Ready to record";

        recordingStatus.textContent =
            "Press the button below to begin.";

        recordHint.textContent =
            "Your microphone will be used to capture audio.";

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
);

/* =========================================================
   EDITABLE TRANSCRIPT
========================================================= */

liveTranscript.addEventListener(
    "input",
    () => {
        const text =
            getTranscriptText();

        finalTranscript = text;
        interimTranscript = "";

        updateWordCount();
    }
);

liveTranscript.addEventListener(
    "focus",
    () => {
        liveTranscript.classList.add(
            "editing"
        );
    }
);

liveTranscript.addEventListener(
    "blur",
    () => {
        liveTranscript.classList.remove(
            "editing"
        );

        finalTranscript =
            getTranscriptText();

        interimTranscript = "";

        updateWordCount();
    }
);

/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {
        stopLiveRecognition();
        stopTimer();

        if (microphoneStream) {
            microphoneStream
                .getTracks()
                .forEach((track) => {
                    track.stop();
                });
        }

        if (recordedAudioUrl) {
            URL.revokeObjectURL(
                recordedAudioUrl
            );
        }
    }
);

/* =========================================================
   INITIALIZE
========================================================= */

audioPlayButton.disabled = true;

audioSpeed.value = "1";
audioVolume.value = "1";

recordedAudio.volume = 1;

renderTranscript();
updateWordCount();