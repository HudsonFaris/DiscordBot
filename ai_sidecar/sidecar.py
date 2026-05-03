import io
import ollama
from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel

app = FastAPI()

# Note: Changed to "base" for your first test to ensure it's fast
model = WhisperModel("base", device="cuda", compute_type="int8_float16")

@app.post("/process_audio")
async def process_audio(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    audio_file = io.BytesIO(audio_bytes)

    segments, _ = model.transcribe(audio_file, beam_size=5)
    user_text = "".join([s.text for s in segments])
    
    if not user_text.strip():
        return {"response": ""}

    print(f"User said: {user_text}")

    response = ollama.chat(model='llama3', messages=[
        {'role': 'system', 'content': 'You are Hudson, a CS senior at Mines. You love BF6. Someone just said something to you in VC. Argue with them using snark and facts. Keep it short.'},
        {'role': 'user', 'content': user_text},
    ])

    return {"text": user_text, "response": response['message']['content']}

# THIS PART IS CRITICAL TO STAY ALIVE
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)