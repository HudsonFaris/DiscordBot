import io
import wave
import os
import threading
import ollama
import torch
from chatterbox.tts import ChatterboxTTS
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel

app = FastAPI()

# Load models on startup
print("Loading Whisper...")
whisper_model = WhisperModel("tiny", device="cuda", compute_type="float16")

print("Loading Chatterbox...")
tts_model = ChatterboxTTS.from_pretrained(device="cuda")

VOICE_SAMPLE = os.path.join(os.path.dirname(__file__), "my_voice.wav")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "response.wav")

print("All models loaded!")

@app.post("/process_audio")
async def process_audio(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    print(f"Received {len(audio_bytes)} bytes of audio")
    
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(48000)
        wav_file.writeframes(audio_bytes)
    wav_buffer.seek(0)

    segments, info = whisper_model.transcribe(wav_buffer, beam_size=5)
    print(f"Detected language: {info.language} with probability {info.language_probability}")
    user_text = "".join([s.text for s in segments])
    print(f"Transcribed: '{user_text}'")
    
    if not user_text.strip():
        print("Empty transcription, skipping...")
        return {"response": ""}

    print(f"User said: {user_text}")

    response = ollama.chat(model='llama3.2:1b', messages=[
        {'role': 'system', 'content': 'You are Danny DeVito. Argue back in ONE short sentence or 15 words MAX. Be snarky and act like a frat boy. But be logical.'},
        {'role': 'user', 'content': user_text},
    ])

    ai_response = response['message']['content']
    print(f"AI response: {ai_response}")

    # Generate speech with your cloned voice
    wav_tensor = tts_model.generate(
        ai_response,
        audio_prompt_path=VOICE_SAMPLE,
        exaggeration=0.3,
        cfg_weight=0.1,
    )
    
    import torchaudio
    torchaudio.save(OUTPUT_PATH, wav_tensor, tts_model.sr)
    print("TTS complete")

    return {"text": user_text, "response": ai_response, "audio": True}

@app.get("/get_audio")
async def get_audio():
    return FileResponse(OUTPUT_PATH, media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)