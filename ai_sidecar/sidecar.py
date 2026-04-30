from fastapi import FastAPI
from faster_whisper import WhisperModel
import ollama

app = FastAPI()

# Load the model into GPU (cuda) or CPU
#'distil-large-v3' is the fastest for 2026
model = WhisperModel("distil-large-v3", device="cuda", compute_type="float16")

@app.post("/transcribe")
async def transcribe(audio_data: bytes):
    segments, info = model.transcribe(audio_data, beam_size=5)
    text = "".join([segment.text for segment in segments])
    return {"text": text}

@app.post("/generate_argument")
async def generate(user_text: str):
    response = ollama.chat(model='llama3', messages=[
        {'role': 'system', 'content': 'You are Hudson. Argue about everything.'},
        {'role': 'user', 'content': user_text},
    ])
    return {"response": response['message']['content']}