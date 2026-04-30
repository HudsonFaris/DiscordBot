import axios from 'axios';
import FormData from 'form-data';

export async function startArgumentEngine(connection) {
    const receiver = connection.receiver;

    // Listen for when someone starts speaking
    receiver.speaking.on('start', (userId) => {
        console.log(`👂 Listening to user: ${userId}`);

        // Subscribe to the user's audio stream
        // We use 'pcm' because it's easier for the Python sidecar to process
        const audioStream = receiver.subscribe(userId, {
            mode: 'pcm',
        });

        const chunks = [];
        audioStream.on('data', (chunk) => {
            chunks.push(chunk);
        });

        audioStream.on('end', async () => {
            console.log(`Captured audio for ${userId}. Sending to AI...`);
            const buffer = Buffer.concat(chunks);

            // Prepare the data for the Python Sidecar
            const form = new FormData();
            form.append('file', buffer, {
                filename: 'voice.raw',
                contentType: 'application/octet-stream',
            });

            try {
                // This hits your FastAPI server on port 8000
                const response = await axios.post('http://127.0.0.1:8000/process_audio', form, {
                    headers: form.getHeaders(),
                });

                if (response.data.text) {
                    console.log(`\n--- ARGUMENT LOG ---`);
                    console.log(`They said: "${response.data.text}"`);
                    console.log(`AI Hudson: "${response.data.response}"`);
                    console.log(`--------------------\n`);
                }
            } catch (error) {
                console.error("❌ Failed to connect to Python Sidecar. Make sure sidecar.py is running!");
            }
        });
    });
}