import io
import wave
import os
import re
import asyncio
import ollama
import torch
import torchaudio
import soundfile as sf
import numpy as np
from chatterbox.tts import ChatterboxTTS
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from faster_whisper import WhisperModel

app = FastAPI()

print("Loading Whisper...")
whisper_model = WhisperModel("tiny", device="cuda", compute_type="float16")

print("Loading Chatterbox...")
tts_model = ChatterboxTTS.from_pretrained(device="cuda")

VOICE_SAMPLE = os.path.join(os.path.dirname(__file__), "my_voice.wav")
OUTPUT_DIR = os.path.dirname(__file__)

print("All models loaded!")

def split_sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]

def tensor_to_wav_bytes(tensor, sample_rate):
    buf = io.BytesIO()
    torchaudio.save(buf, tensor, sample_rate, format="wav")
    buf.seek(0)
    return buf.read()

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
    print(f"Detected language: {info.language}")
    user_text = "".join([s.text for s in segments])
    print(f"Transcribed: '{user_text}'")
    
    if not user_text.strip():
        print("Empty transcription, skipping...")
        return {"response": ""}

    print(f"User said: {user_text}")

    response = ollama.chat(model='llama3.2:1b', messages=[
        {'role': 'system', 'content': 'You are Danny DeVito. Argue back in ONE short sentence. Be snarky and act like a frat boy. But be logical.'},
        {'role': 'user', 'content': user_text},
    ])

    ai_response = response['message']['content']
    print(f"AI response: {ai_response}")

    # Generate full audio
    sentences = split_sentences(ai_response)
    tensors = []
    for sentence in sentences:
        wav_tensor = tts_model.generate(
            sentence,
            audio_prompt_path=VOICE_SAMPLE,
            exaggeration=0.3,
            cfg_weight=0.1,
        )
        tensors.append(wav_tensor)

    silence = torch.zeros(1, int(tts_model.sr * 0.15))
    combined = torch.cat([t for pair in zip(tensors, [silence]*len(tensors)) for t in pair], dim=1)
    
    output_path = os.path.join(OUTPUT_DIR, "response.wav")
    torchaudio.save(output_path, combined, tts_model.sr)
    print("TTS complete")

    return {"text": user_text, "response": ai_response, "audio": True}

@app.post("/process_stream")
async def process_stream(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(48000)
        wav_file.writeframes(audio_bytes)
    wav_buffer.seek(0)

    segments, info = whisper_model.transcribe(wav_buffer, beam_size=5)
    user_text = "".join([s.text for s in segments])
    print(f"Transcribed: '{user_text}'")
    
    if not user_text.strip():
        return {"response": ""}

    response = ollama.chat(model='llama3.2:1b', messages=[
        {'role': 'system', 'content': 'You are Danny DeVito. Argue back in ONE short sentence or 15 words MAX. Be snarky and act like a frat boy. But be logical.'},
        {'role': 'user', 'content': user_text},
    ])

    ai_response = response['message']['content']
    print(f"AI response: {ai_response}")

    sentences = split_sentences(ai_response)

    async def generate_stream():
        # First yield the transcript and response as JSON header
        import json
        header = json.dumps({"text": user_text, "response": ai_response}) + "\n---AUDIO---\n"
        yield header.encode()

        for i, sentence in enumerate(sentences):
            print(f"Generating sentence {i+1}: '{sentence}'")
            wav_tensor = tts_model.generate(
                sentence,
                audio_prompt_path=VOICE_SAMPLE,
                exaggeration=0.3,
                cfg_weight=0.1,
            )
            # Save each sentence to temp file
            path = os.path.join(OUTPUT_DIR, f"chunk_{i}.wav")
            torchaudio.save(path, wav_tensor, tts_model.sr)
            
            # Signal chunk is ready
            yield f"CHUNK:{path}\n".encode()
            await asyncio.sleep(0)

    return StreamingResponse(generate_stream(), media_type="text/plain")

@app.get("/get_audio")
async def get_audio():
    return FileResponse(os.path.join(OUTPUT_DIR, "response.wav"), media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

