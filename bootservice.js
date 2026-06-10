const express = require('express');
const { exec } = require('child_process');
const app = express();

app.post('/boot-headless-client', (req, res) => {
    console.log("Oracle Cloud bot requested a headless client spin-up!");

    //mcclient headless jar
    const launchCommand = "screen -dmS mc_client bash -c 'cd /home/ubuntu/aurora && ./gradlew runClient -Djava.awt.headless=true'";

    exec(launchCommand, (err) => {
        if (err) {
            console.error(`Failed to launch screen session: ${err.message}`);
            return;
        }
        console.log("Headless Fabric instance executing in background screen.");
    });

    res.status(200).json({ status: "success", message: "Headless client starting." });
});

app.listen(4568, () => console.log("Ubuntu Boot Listener active on port 4568"));