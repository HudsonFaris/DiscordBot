import io
import wave
import os
import threading
import pyttsx3
import ollama
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel

app = FastAPI()

model = WhisperModel("base", device="cpu", compute_type="int8")

def speak_to_file(text, output_path):
    engine = pyttsx3.init()
    engine.setProperty('rate', 175)
    engine.save_to_file(text, output_path)
    engine.runAndWait()
    engine.stop()

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

    segments, info = model.transcribe(wav_buffer, beam_size=5)
    print(f"Detected language: {info.language} with probability {info.language_probability}")
    user_text = "".join([s.text for s in segments])
    print(f"Transcribed: '{user_text}'")
    
    if not user_text.strip():
        print("Empty transcription, skipping...")
        return {"response": ""}

    print(f"User said: {user_text}")

    response = ollama.chat(model='llama3.2:1b', messages=[
        {'role': 'system', 'content': 'You are Danny DeVito. Someone just said something to you in a Discord voice call. Argue with them using snark. Keep it short and funny. Max 2 sentences.'},
        {'role': 'user', 'content': user_text},
    ])

    ai_response = response['message']['content']
    print(f"AI response: {ai_response}")

    output_path = os.path.join(os.path.dirname(__file__), "response.wav")
    
    # Run TTS in thread to prevent blocking
    tts_thread = threading.Thread(target=speak_to_file, args=(ai_response, output_path))
    tts_thread.start()
    tts_thread.join(timeout=10)
    
    print("TTS complete")
    return {"text": user_text, "response": ai_response, "audio": True}

@app.get("/get_audio")
async def get_audio():
    output_path = os.path.join(os.path.dirname(__file__), "response.wav")
    return FileResponse(output_path, media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)