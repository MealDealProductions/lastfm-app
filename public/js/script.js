const API_KEY = '0c6105e548ab1c434b3594b2d21d4157';
const API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

const collageTemplates = {
    classic: {
        gap: '8px',
        background: '#000',
        containerClass: 'template-classic',
        albumClass: 'classic-album'
    },
    polaroid: {
        gap: '20px',
        background: '#fff',
        containerClass: 'template-polaroid',
        albumClass: 'polaroid-album'
    },
    minimal: {
        gap: '2px',
        background: 'transparent',
        containerClass: 'template-minimal',
        albumClass: 'minimal-album'
    },
    mosaic: {
        gap: '4px',
        background: '#000',
        containerClass: 'template-mosaic',
        albumClass: 'mosaic-album'
    },
    vinyl: {
        gap: '16px',
        background: '#121212',
        containerClass: 'template-vinyl',
        albumClass: 'vinyl-album'
    }
};

async function generateCollage() {
    const username = document.getElementById('username').value;
    if (!username) {
        showAlert('Please enter a Last.fm username', 'danger');
        return;
    }

    // Show loading overlay
    document.getElementById('loadingOverlay').classList.remove('d-none');
    
    try {
        // Load all tabs data
        updateProfile(username);
        updateTopCharts(username);
        updateRecentTracks(username);
        
        // Generate collage (existing code)
        const timeRange = document.getElementById('timeRange').value;
        const gridWidth = parseInt(document.getElementById('gridWidth').value) || 3;
        const gridHeight = parseInt(document.getElementById('gridHeight').value) || 3;
        const limit = gridWidth * gridHeight;

        const albums = await fetchTopAlbums(username, timeRange, limit);
        createCollage(albums, gridWidth, gridHeight);
        
        showAlert('Data loaded successfully!', 'success');
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error loading data. Please check the username and try again.', 'danger');
    } finally {
        document.getElementById('loadingOverlay').classList.add('d-none');
    }
}

async function fetchTopAlbums(username, period, limit) {
    const params = new URLSearchParams({
        method: 'user.gettopalbums',
        user: username,
        period: period,
        limit: limit,
        api_key: API_KEY,
        format: 'json'
    });

    const response = await fetch(`${API_BASE_URL}?${params}`);
    const data = await response.json();

    if (data.error) {
        throw new Error(data.message);
    }

    // Fetch higher quality images for each album
    const enhancedAlbums = await Promise.all(
        data.topalbums.album.map(async album => {
            try {
                const betterArt = await fetchBetterAlbumArt(album.artist.name, album.name);
                if (betterArt) {
                    album.image = album.image.map(img => {
                        if (img.size === 'large' || img.size === 'extralarge') {
                            return { ...img, '#text': betterArt };
                        }
                        return img;
                    });
                }
            } catch (error) {
                console.warn('Could not fetch better quality image for:', album.name);
            }
            return album;
        })
    );

    return enhancedAlbums;
}

async function fetchBetterAlbumArt(artist, album) {
    const params = new URLSearchParams({
        method: 'album.getInfo',
        artist: artist,
        album: album,
        api_key: API_KEY,
        format: 'json'
    });

    try {
        const response = await fetch(`${API_BASE_URL}?${params}`);
        const data = await response.json();
        
        if (data.album && data.album.image) {
            // Try to get the highest quality image available
            const images = data.album.image;
            const mega = images.find(img => img.size === 'mega');
            const extralarge = images.find(img => img.size === 'extralarge');
            
            if (mega && mega['#text']) return mega['#text'];
            if (extralarge && extralarge['#text']) return extralarge['#text'];
        }
    } catch (error) {
        console.warn('Error fetching better album art:', error);
    }
    return null;
}

function createCollage(albums, gridWidth, gridHeight) {
    const container = document.getElementById('collageContainer');
    container.innerHTML = '';
    
    const templateStyle = document.getElementById('templateStyle').value;
    const template = collageTemplates[templateStyle];
    
    // Set a fixed album size that won't be affected by viewport
    const baseAlbumSize = 250; // Base size in pixels for each album
    const totalWidth = baseAlbumSize * gridWidth;
    
    const wrapper = document.createElement('div');
    wrapper.style.width = 'auto'; // Remove fixed width constraint
    wrapper.style.maxWidth = '100%';
    wrapper.style.display = 'grid';
    wrapper.style.gridTemplateColumns = `repeat(${gridWidth}, minmax(${baseAlbumSize}px, 1fr))`;
    wrapper.style.gap = template.gap;
    wrapper.style.margin = '0 auto';
    wrapper.style.backgroundColor = template.background;
    wrapper.className = template.containerClass;
    wrapper.id = 'collageWrapper';
    
    const validAlbums = albums.filter(album => {
        const image = album.image.find(img => 
            img.size === 'mega' || 
            img.size === 'extralarge' || 
            img.size === 'large'
        )['#text'];
        return image && image.length > 0;
    });

    if (validAlbums.length === 0) {
        container.innerHTML = '<p>No album covers found for this time period.</p>';
        return;
    }

    validAlbums.slice(0, gridWidth * gridHeight).forEach(album => {
        const image = album.image.find(img => 
            img.size === 'mega' || 
            img.size === 'extralarge' || 
            img.size === 'large'
        )['#text'];
        
        const secureImage = image.replace('http://', 'https://');
        
        const albumContainer = document.createElement('div');
        const totalCells = gridWidth * gridHeight;
        if (totalCells > 36) { // More than 6x6
            albumContainer.className = `album-item ${template.albumClass} very-small`;
        } else if (totalCells > 9) { // More than 3x3
            albumContainer.className = `album-item ${template.albumClass} small`;
        } else {
            albumContainer.className = `album-item ${template.albumClass}`;
        }
        
        const imgContainer = document.createElement('div');
        imgContainer.style.aspectRatio = '1/1';
        imgContainer.className = 'image-container';
        
        const img = document.createElement('img');
        img.src = secureImage;
        img.alt = `${album.name} by ${album.artist.name}`;
        img.className = 'album-cover';
        img.crossOrigin = 'anonymous';
        
        const infoOverlay = document.createElement('div');
        infoOverlay.className = 'album-info-overlay';
        infoOverlay.innerHTML = `
            <div class="album-info">
                <p class="album-name">${album.name}</p>
                <p class="artist-name">${album.artist.name}</p>
                <p class="play-count">${album.playcount} plays</p>
            </div>
        `;
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(infoOverlay);
        albumContainer.appendChild(imgContainer);
        wrapper.appendChild(albumContainer);
    });

    container.appendChild(wrapper);

    // Add download button
    const existingBtn = document.querySelector('.download-btn');
    if (existingBtn) {
        existingBtn.remove();
    }

    const downloadBtn = document.createElement('button');
    downloadBtn.innerHTML = '<i class="fa-solid fa-download me-2"></i>Download Collage';
    downloadBtn.className = 'btn btn-success download-btn mt-3';
    downloadBtn.onclick = downloadCollage;
    container.appendChild(downloadBtn);
}

function downloadCollage() {
    const wrapper = document.getElementById('collageWrapper');
    if (!wrapper) return;

    showAlert('Generating high-quality image, please wait...', 'info');

    const templateStyle = document.getElementById('templateStyle').value;
    const template = collageTemplates[templateStyle];

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    const scale = 8;
    
    tempCanvas.width = wrapper.offsetWidth * scale;
    tempCanvas.height = wrapper.offsetHeight * scale;
    
    // Apply template background
    if (template.background.includes('gradient')) {
        const gradient = ctx.createLinearGradient(0, 0, tempCanvas.width, tempCanvas.height);
        if (templateStyle === 'classic') {
            gradient.addColorStop(0, '#000000');
            gradient.addColorStop(1, '#1a1a1a');
        }
        ctx.fillStyle = gradient;
    } else {
        ctx.fillStyle = template.background;
    }
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    const albumItems = wrapper.getElementsByClassName('album-item');
    const loadedImages = [];
    let loadedCount = 0;

    Array.from(albumItems).forEach((item, index) => {
        const img = item.querySelector('img');
        const albumInfo = item.querySelector('.album-info');
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        
        tempImg.onload = () => {
            loadedImages[index] = {
                image: tempImg,
                info: {
                    album: albumInfo.querySelector('.album-name').textContent,
                    artist: albumInfo.querySelector('.artist-name').textContent,
                    plays: albumInfo.querySelector('.play-count').textContent
                }
            };
            loadedCount++;
            
            if (loadedCount === albumItems.length) {
                const gridSize = Math.sqrt(albumItems.length);
                const imgSize = (tempCanvas.width - (scale * parseInt(template.gap) * (gridSize + 1))) / gridSize;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                loadedImages.forEach((item, i) => {
                    const row = Math.floor(i / gridSize);
                    const col = i % gridSize;
                    const x = col * (imgSize + scale * parseInt(template.gap)) + scale * parseInt(template.gap);
                    const y = row * (imgSize + scale * parseInt(template.gap)) + scale * parseInt(template.gap);
                    
                    // Apply template-specific styling
                    switch(templateStyle) {
                        case 'polaroid':
                            // Draw white polaroid frame
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(x - scale*10, y - scale*10, 
                                       imgSize + scale*20, imgSize + scale*50);
                            ctx.drawImage(item.image, x, y, imgSize, imgSize);
                            break;
                            
                        case 'vinyl':
                            // Draw circular vinyl
                            ctx.save();
                            ctx.beginPath();
                            ctx.arc(x + imgSize/2, y + imgSize/2, imgSize/2, 0, Math.PI * 2);
                            ctx.clip();
                            ctx.drawImage(item.image, x, y, imgSize, imgSize);
                            ctx.restore();
                            break;
                            
                        case 'minimal':
                            // Draw with minimal styling
                            ctx.drawImage(item.image, x, y, imgSize, imgSize);
                            break;
                            
                        case 'mosaic':
                            // Draw with gradient overlay
                            ctx.drawImage(item.image, x, y, imgSize, imgSize);
                            const gradient = ctx.createLinearGradient(x, y, x + imgSize, y + imgSize);
                            gradient.addColorStop(0, 'rgba(0,0,0,0.2)');
                            gradient.addColorStop(1, 'transparent');
                            ctx.fillStyle = gradient;
                            ctx.fillRect(x, y, imgSize, imgSize);
                            break;
                            
                        default: // classic
                            ctx.drawImage(item.image, x, y, imgSize, imgSize);
                            break;
                    }

                    // Add text based on template
                    if (templateStyle === 'polaroid') {
                        // Polaroid style text
                        ctx.fillStyle = '#000000';
                        ctx.textAlign = 'center';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                        ctx.shadowBlur = scale * 2;
                        ctx.shadowOffsetY = scale;
                        
                        const textY = y + imgSize + scale*25;
                        // Album name
                        ctx.font = `bold ${scale*10}px Helvetica`;
                        const albumText = truncateText(item.info.album, ctx, imgSize - scale*20);
                        ctx.fillText(albumText, x + imgSize/2, textY);
                        
                        // Artist name
                        ctx.font = `${scale*8}px Helvetica`;
                        const artistText = truncateText(item.info.artist, ctx, imgSize - scale*20);
                        ctx.fillText(artistText, x + imgSize/2, textY + scale*15);
                    } else {
                        // Default overlay text for other templates
                        const textGradient = ctx.createLinearGradient(x, y + imgSize - scale*80, x, y + imgSize);
                        textGradient.addColorStop(0, 'rgba(0,0,0,0)');
                        textGradient.addColorStop(1, 'rgba(0,0,0,0.9)');
                        ctx.fillStyle = textGradient;
                        ctx.fillRect(x, y + imgSize - scale*80, imgSize, scale*80);
                        
                        // Add text shadow for better readability
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                        ctx.shadowBlur = scale * 3;
                        ctx.shadowOffsetX = scale;
                        ctx.shadowOffsetY = scale;
                        
                        ctx.fillStyle = '#ffffff';
                        ctx.textAlign = 'center';
                        
                        // Album name
                        ctx.font = `bold ${scale*12}px Helvetica`;
                        const albumText = truncateText(item.info.album, ctx, imgSize - scale*20);
                        ctx.fillText(albumText, x + imgSize/2, y + imgSize - scale*45);
                        
                        // Artist name
                        ctx.font = `${scale*9}px Helvetica`;
                        const artistText = truncateText(item.info.artist, ctx, imgSize - scale*20);
                        ctx.fillText(artistText, x + imgSize/2, y + imgSize - scale*25);
                        
                        // Play count
                        ctx.font = `${scale*7}px Helvetica`;
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                        ctx.fillText(item.info.plays, x + imgSize/2, y + imgSize - scale*10);
                    }

                    // Reset shadow effect after drawing text
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                });

                try {
                    const link = document.createElement('a');
                    link.download = `lastfm-collage-${templateStyle}.png`;
                    link.href = tempCanvas.toDataURL('image/png', 1.0);
                    link.click();
                    showAlert('Download complete!', 'success');
                } catch (err) {
                    console.error('Error creating download:', err);
                    showAlert('Error creating download. Please try again.', 'danger');
                }
            }
        };
        
        tempImg.onerror = () => {
            console.error('Error loading image:', img.src);
            loadedCount++;
        };
        
        tempImg.src = img.src;
    });
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    const container = document.querySelector('.form-container');
    container.insertBefore(alertDiv, container.firstChild);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Add event listener for Enter key on username input
document.getElementById('username').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        generateCollage();
    }
});

function saveToHistory(username) {
    let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    if (!history.includes(username)) {
        history.unshift(username);
        history = history.slice(0, 5); // Keep last 5 searches
        localStorage.setItem('searchHistory', JSON.stringify(history));
        updateHistoryUI();
    }
}

function updateHistoryUI() {
    const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    const historyContainer = document.getElementById('searchHistory');
    if (history.length > 0) {
        historyContainer.innerHTML = `
            <div class="mt-2">
                <small class="text-muted d-flex align-items-center">
                    <i class="fa-solid fa-clock-rotate-left me-2"></i>
                    Recent searches:
                </small>
                <div class="d-flex flex-wrap gap-2 mt-2">
                    ${history.map(username => `
                        <button class="btn btn-sm btn-outline-secondary" 
                                onclick="setUsername('${username}')"
                                data-bs-toggle="tooltip" 
                                title="Click to use this username">
                            <i class="fa-solid fa-user me-1"></i>
                            ${username}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        // Initialize tooltips for new buttons
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function(tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
}

function setUsername(username) {
    document.getElementById('username').value = username;
    generateCollage();
}

async function shareCollage() {
    const canvas = document.querySelector('canvas');
    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const file = new File([blob], 'lastfm-collage.png', { type: 'image/png' });
        const shareData = {
            title: 'My Last.fm Collage',
            text: 'Check out my music taste!',
            files: [file],
        };
        
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
        }
    } catch (err) {
        console.error('Error sharing:', err);
    }
}

document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        generateCollage();
    }
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const downloadBtn = document.querySelector('.download-btn');
        if (downloadBtn) downloadBtn.click();
    }
});

async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// Add this to initialize history UI when page loads
document.addEventListener('DOMContentLoaded', function() {
    updateHistoryUI();
});

// Add these new API functions at the top of the file
async function getUserInfo(username) {
    const params = new URLSearchParams({
        method: 'user.getInfo',
        user: username,
        api_key: API_KEY,
        format: 'json'
    });

    const response = await fetch(`${API_BASE_URL}?${params}`);
    const data = await response.json();
    return data.user;
}

async function getTopArtists(username, period = 'overall', limit = 10) {
    const params = new URLSearchParams({
        method: 'user.getTopArtists',
        user: username,
        period: period,
        limit: limit,
        api_key: API_KEY,
        format: 'json'
    });

    const response = await fetch(`${API_BASE_URL}?${params}`);
    const data = await response.json();
    return data.topartists.artist;
}

async function getTopTracks(username, period = 'overall', limit = 10) {
    const params = new URLSearchParams({
        method: 'user.getTopTracks',
        user: username,
        period: period,
        limit: limit,
        api_key: API_KEY,
        format: 'json'
    });

    const response = await fetch(`${API_BASE_URL}?${params}`);
    const data = await response.json();
    return data.toptracks.track;
}

async function getRecentTracks(username, limit = 10) {
    const params = new URLSearchParams({
        method: 'user.getRecentTracks',
        user: username,
        limit: limit,
        api_key: API_KEY,
        format: 'json'
    });

    const response = await fetch(`${API_BASE_URL}?${params}`);
    const data = await response.json();
    return data.recenttracks.track;
}

async function compareUsers(username1, username2) {
    const params = new URLSearchParams({
        method: 'tasteometer.compare',
        type1: 'user',
        type2: 'user',
        value1: username1,
        value2: username2,
        api_key: API_KEY,
        format: 'json'
    });

    const response = await fetch(`${API_BASE_URL}?${params}`);
    const data = await response.json();
    return data.comparison;
}

// Add tab handling functions
function updateProfile(username) {
    const profileContainer = document.querySelector('#profileTab .user-info');
    const statsContainer = document.querySelector('#profileTab .user-stats');

    getUserInfo(username).then(user => {
        profileContainer.innerHTML = `
            <img src="${user.image[3]['#text'] || 'https://lastfm.freetls.fastly.net/i/u/avatar170s/818148bf682d429dc215c1705eb27b98.png'}" 
                 alt="Profile picture" class="user-avatar">
            <div class="user-details">
                <h2 class="mb-2">${user.name}</h2>
                <p class="text-muted mb-1">Scrobbling since ${new Date(user.registered.unixtime * 1000).getFullYear()}</p>
                <p class="text-muted mb-0">${user.playcount} total scrobbles</p>
            </div>
        `;

        statsContainer.innerHTML = `
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-value">${parseInt(user.playcount).toLocaleString()}</div>
                    <div class="stat-label">Scrobbles</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-value">${user.artist_count || '0'}</div>
                    <div class="stat-label">Artists</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-value">${user.album_count || '0'}</div>
                    <div class="stat-label">Albums</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-value">${user.track_count || '0'}</div>
                    <div class="stat-label">Tracks</div>
                </div>
            </div>
        `;
    }).catch(error => {
        profileContainer.innerHTML = `<div class="alert alert-danger">Error loading profile: ${error.message}</div>`;
    });
}

function updateTopCharts(username) {
    const period = document.getElementById('timeRange').value;
    const artistsContainer = document.getElementById('topArtists');
    const tracksContainer = document.getElementById('topTracks');

    // Load top artists
    getTopArtists(username, period).then(artists => {
        artistsContainer.innerHTML = artists.map((artist, index) => `
            <div class="list-item">
                <div class="rank">${index + 1}</div>
                <div class="artist-info">
                    <div class="name">${artist.name}</div>
                    <div class="plays text-muted">${artist.playcount} plays</div>
                </div>
            </div>
        `).join('');
    }).catch(error => {
        artistsContainer.innerHTML = `<div class="alert alert-danger">Error loading artists: ${error.message}</div>`;
    });

    // Load top tracks
    getTopTracks(username, period).then(tracks => {
        tracksContainer.innerHTML = tracks.map((track, index) => `
            <div class="list-item">
                <div class="rank">${index + 1}</div>
                <div class="track-info">
                    <div class="name">${track.name}</div>
                    <div class="artist text-muted">${track.artist.name}</div>
                    <div class="plays text-muted">${track.playcount} plays</div>
                </div>
            </div>
        `).join('');
    }).catch(error => {
        tracksContainer.innerHTML = `<div class="alert alert-danger">Error loading tracks: ${error.message}</div>`;
    });
}

function addMusicPreview(trackName, artistName) {
    const spotifyQuery = encodeURIComponent(`${trackName} ${artistName}`);
    const youtubeQuery = encodeURIComponent(`${trackName} ${artistName} official`);
    
    return `
        <div class="preview-buttons">
            <a href="https://open.spotify.com/search/${spotifyQuery}" 
               target="_blank" 
               class="btn btn-sm btn-success preview-btn"
               title="Open in Spotify">
                <i class="fa-brands fa-spotify"></i>
            </a>
            <a href="https://music.youtube.com/search?q=${youtubeQuery}" 
               target="_blank" 
               class="btn btn-sm btn-danger preview-btn"
               title="Open in YouTube Music">
                <i class="fa-brands fa-youtube"></i>
            </a>
        </div>
    `;
}

function updateRecentTracks(username) {
    const container = document.getElementById('recentTracks');

    getRecentTracks(username).then(tracks => {
        container.innerHTML = tracks.map(track => `
            <div class="track-item">
                <img src="${track.image[1]['#text'] || 'placeholder.png'}" alt="Album art" width="64" height="64">
                <div class="track-info flex-grow-1">
                    <div class="name">${track.name}</div>
                    <div class="artist text-muted">${track.artist['#text']}</div>
                    <div class="timestamp text-muted">
                        ${track['@attr']?.nowplaying ? 'Now Playing' : 
                          `${new Date(track.date?.uts * 1000).toLocaleString()}`}
                    </div>
                </div>
                ${addMusicPreview(track.name, track.artist['#text'])}
            </div>
        `).join('');
    }).catch(error => {
        container.innerHTML = `<div class="alert alert-danger">Error loading recent tracks: ${error.message}</div>`;
    });
}

async function compareUsers() {
    const username1 = document.getElementById('username').value;
    const username2 = document.getElementById('compareUsername').value;
    const resultsContainer = document.getElementById('compareResults');

    if (!username1 || !username2) {
        showAlert('Please enter both usernames', 'danger');
        return;
    }

    try {
        const comparison = await compareUsers(username1, username2);
        const score = Math.round(comparison.result.score * 100);
        
        resultsContainer.innerHTML = `
            <div class="comparison-result">
                <h3 class="mb-4">Music Compatibility: ${score}%</h3>
                <div class="progress mb-4" style="height: 2rem;">
                    <div class="progress-bar bg-primary" role="progressbar" 
                         style="width: ${score}%" aria-valuenow="${score}" 
                         aria-valuemin="0" aria-valuemax="100">
                        ${score}%
                    </div>
                </div>
                <div class="common-artists mt-4">
                    <h4>Common Artists</h4>
                    <div class="list-group">
                        ${comparison.result.artists.map(artist => `
                            <div class="list-group-item bg-dark text-white border-light">
                                ${artist.name}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        resultsContainer.innerHTML = `<div class="alert alert-danger">Error comparing users: ${error.message}</div>`;
    }
}

// Add sharing functions
function shareToTwitter() {
    const username = document.getElementById('username').value;
    if (!username) {
        showAlert('Please generate a collage first', 'warning');
        return;
    }
    
    const text = `Check out my Last.fm music collage! ${window.location.origin}?user=${username}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareToFacebook() {
    const username = document.getElementById('username').value;
    if (!username) {
        showAlert('Please generate a collage first', 'warning');
        return;
    }
    
    // Create a proper sharing URL with all necessary parameters
    const shareUrl = `${window.location.origin}?user=${username}`;
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&display=popup`;
    
    // Open Facebook share dialog in a popup window
    const width = 600;
    const height = 400;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    
    window.open(
        url,
        'facebook-share-dialog',
        `width=${width},height=${height},top=${top},left=${left},toolbar=0,location=0,menubar=0,status=0`
    );
}

function copyLink() {
    const username = document.getElementById('username').value;
    if (!username) {
        showAlert('Please generate a collage first', 'warning');
        return;
    }
    
    const url = `${window.location.origin}?user=${username}`;
    navigator.clipboard.writeText(url).then(() => {
        showAlert('Link copied to clipboard!', 'success');
    }).catch(() => {
        showAlert('Failed to copy link', 'danger');
    });
}

// Add this to handle URL parameters when page loads
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    if (userParam) {
        document.getElementById('username').value = userParam;
        generateCollage();
    }
    updateHistoryUI();
});

// Add this helper function at the bottom of the file
function truncateText(text, ctx, maxWidth) {
    let truncated = text;
    while (ctx.measureText(truncated).width > maxWidth && truncated.length > 3) {
        truncated = truncated.slice(0, -4) + '...';
    }
    return truncated;
} 