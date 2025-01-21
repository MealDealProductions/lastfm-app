require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

// Serve static files from public directory
app.use(express.static('public'));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add environment variables to a config endpoint
app.get('/config', (req, res) => {
    if (!process.env.LASTFM_API_KEY || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Server configuration missing' });
    }
    
    res.json({
        lastfm: {
            apiKey: process.env.LASTFM_API_KEY
        },
        spotify: {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 