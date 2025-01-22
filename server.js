const express = require('express');
const path = require('path');
require('dotenv').config();
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Add session middleware for Spotify auth
const session = require('express-session');
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Serve static files from public directory
app.use(express.static('public'));

// API endpoint for Last.fm API key
app.get('/api/config', (req, res) => {
    res.json({
        lastfmApiKey: process.env.LASTFM_API_KEY
    });
});

// Spotify token endpoint
app.get('/api/spotify-token', async (req, res) => {
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
                ).toString('base64')
            },
            body: 'grant_type=client_credentials'
        });
        
        const data = await response.json();
        res.json({ access_token: data.access_token });
    } catch (error) {
        console.error('Error getting Spotify token:', error);
        res.status(500).json({ error: 'Failed to get Spotify token' });
    }
});

// Update the Spotify authentication endpoint
app.get('/auth/spotify', (req, res) => {
    const scope = 'playlist-modify-public playlist-modify-private';
    const redirectUri = process.env.NODE_ENV === 'production' 
        ? 'https://yourdomain.com/auth/spotify/callback'  // Replace with your production domain
        : 'http://localhost:3000/auth/spotify/callback';
    
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: scope,
        redirect_uri: redirectUri,
        state: Math.random().toString(36).substring(7)
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// Update the callback endpoint to use the same redirect URI
app.get('/auth/spotify/callback', async (req, res) => {
    const { code, state } = req.query;
    const redirectUri = process.env.NODE_ENV === 'production'
        ? 'https://yourdomain.com/auth/spotify/callback'  // Replace with your production domain
        : 'http://localhost:3000/auth/spotify/callback';

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
                ).toString('base64')
            },
            body: new URLSearchParams({
                code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error('Spotify token error:', data);
            res.redirect('/#export-error');
            return;
        }
        
        req.session.spotifyToken = data.access_token;
        req.session.refreshToken = data.refresh_token;
        
        res.redirect('/#export-success');
    } catch (error) {
        console.error('Spotify auth error:', error);
        res.redirect('/#export-error');
    }
});

// Update the create playlist endpoint
app.post('/api/create-spotify-playlist', express.json(), async (req, res) => {
    const { tracks, playlistName } = req.body;
    const accessToken = req.session.spotifyToken;

    if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    try {
        // Get Spotify user ID
        const userResponse = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!userResponse.ok) {
            throw new Error('Failed to get user info');
        }
        
        const userData = await userResponse.json();

        // Create playlist
        const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${userData.id}/playlists`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: playlistName,
                description: 'Created by Last.fm Collage Generator',
                public: false
            })
        });

        if (!playlistResponse.ok) {
            throw new Error('Failed to create playlist');
        }

        const playlistData = await playlistResponse.json();

        // Search and add tracks in batches
        const trackUris = [];
        for (const track of tracks) {
            try {
                const query = `track:${track.name} artist:${track.artist}`;
                const searchResponse = await fetch(
                    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );

                if (!searchResponse.ok) {
                    console.warn(`Failed to search for track: ${track.name}`);
                    continue;
                }

                const searchData = await searchResponse.json();
                const uri = searchData.tracks?.items?.[0]?.uri;
                if (uri) {
                    trackUris.push(uri);
                }
            } catch (error) {
                console.warn(`Error searching for track ${track.name}:`, error);
            }
        }

        // Add tracks in batches of 100 (Spotify's limit)
        for (let i = 0; i < trackUris.length; i += 100) {
            const batch = trackUris.slice(i, i + 100);
            if (batch.length > 0) {
                const addTracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ uris: batch })
                });

                if (!addTracksResponse.ok) {
                    console.error('Failed to add tracks batch:', await addTracksResponse.text());
                }
            }
        }

        // Return success only if we found at least one track
        if (trackUris.length > 0) {
            res.json({ 
                success: true, 
                playlistUrl: playlistData.external_urls.spotify,
                tracksAdded: trackUris.length
            });
        } else {
            res.status(400).json({ 
                error: 'No matching tracks found on Spotify',
                details: 'Try adjusting the search criteria'
            });
        }
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ 
            error: 'Failed to create playlist',
            details: error.message
        });
    }
});

// Add a token refresh endpoint
app.post('/api/refresh-spotify-token', async (req, res) => {
    const refreshToken = req.session.refreshToken;
    if (!refreshToken) {
        return res.status(401).json({ error: 'No refresh token available' });
    }

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
                ).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        req.session.spotifyToken = data.access_token;
        if (data.refresh_token) {
            req.session.refreshToken = data.refresh_token;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 