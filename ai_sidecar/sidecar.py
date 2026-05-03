import io
import wave
import os
import pyttsx3
import ollama
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel

app = FastAPI()

model = WhisperModel("base", device="cpu", compute_type="int8")

tts_engine = pyttsx3.init()
tts_engine.setProperty('rate', 175)

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

    response = ollama.chat(model='llama3', messages=[
        {'role': 'system', 'content': 'You are Danny DeVito. Someone just said something to you in a Discord voice call. Argue with them using snark. Keep it short and funny. Max 2 sentences.'},
        {'role': 'user', 'content': user_text},
    ])

    ai_response = response['message']['content']
    print(f"AI response: {ai_response}")

    # Generate speech to file
    output_path = "response.wav"
    tts_engine.save_to_file(ai_response, output_path)
    tts_engine.runAndWait()

    return {"text": user_text, "response": ai_response, "audio": True}

@app.get("/get_audio")
async def get_audio():
    return FileResponse("response.wav", media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)