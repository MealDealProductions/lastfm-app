let API_KEY;
let API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
let currentUsername = '';

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
    if (!currentUsername) {
        showAlert('Please set a Last.fm username first', 'danger');
        return;
    }

    const gridSize = parseInt(document.getElementById('gridSize').value) || 3;
    if (gridSize < 2 || gridSize > 8) {
        showAlert('Grid size must be between 2 and 8', 'danger');
        return;
    }

    document.getElementById('loadingOverlay').classList.remove('d-none');
    
    try {
        await updateProfile(currentUsername);
        await updateTopCharts(currentUsername);
        await updateRecentTracks(currentUsername);
        
        const timeRange = document.getElementById('timeRange').value;
        const collageType = document.getElementById('collageType').value;
        const limit = gridSize * gridSize;

        let items;
        switch(collageType) {
            case 'artists':
                items = await fetchTopArtists(currentUsername, timeRange, limit);
                break;
            case 'tracks':
                items = await fetchTopTracks(currentUsername, timeRange, limit);
                break;
            default:
                items = await fetchTopAlbums(currentUsername, timeRange, limit);
        }

        await createCollage(items, gridSize, gridSize, collageType);
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

function createCollage(items, gridWidth, gridHeight, type = 'albums') {
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
    
    const showRank = document.getElementById('showRank').checked;
    const showPlaycount = document.getElementById('showPlaycount').checked;
    const customGap = document.getElementById('gapSize').value + 'px';
    const customBg = document.getElementById('bgColor').value;

    wrapper.style.gap = customGap;
    wrapper.style.backgroundColor = customBg;

    const validItems = items.filter(item => {
        let image;
        if (type === 'albums') {
            image = item.image.find(img => img.size === 'mega' || img.size === 'extralarge' || img.size === 'large')['#text'];
        } else if (type === 'artists') {
            image = item.image?.[3]?.['#text'] || item.image?.[2]?.['#text'];
        } else { // tracks
            image = item.image?.[3]?.['#text'] || item.album?.image?.[3]?.['#text'];
        }
        return image && image.length > 0;
    });

    if (validItems.length === 0) {
        container.innerHTML = '<p>No album covers found for this time period.</p>';
        return;
    }

    validItems.slice(0, gridWidth * gridHeight).forEach((item, index) => {
        let image, name, artist, plays;
        
        if (type === 'albums') {
            image = item.image.find(img => img.size === 'mega' || img.size === 'extralarge' || img.size === 'large')['#text'];
            name = item.name;
            artist = item.artist.name;
            plays = item.playcount;
        } else if (type === 'artists') {
            image = item.image?.[3]?.['#text'] || item.image?.[2]?.['#text'];
            name = item.name;
            artist = `${item.playcount} plays`;
            plays = `#${item['@attr']?.rank || ''}`;
        } else { // tracks
            image = item.image?.[3]?.['#text'] || item.album?.image?.[3]?.['#text'];
            name = item.name;
            artist = item.artist.name;
            plays = `${item.playcount} plays`;
        }
        
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
        img.alt = `${name} by ${artist}`;
        img.className = 'album-cover';
        img.crossOrigin = 'anonymous';
        
        const infoOverlay = document.createElement('div');
        infoOverlay.className = 'album-info-overlay';
        infoOverlay.innerHTML = `
            <div class="album-info">
                <p class="album-name">${name}</p>
                <p class="artist-name">${artist}</p>
                <p class="play-count">${plays}</p>
            </div>
        `;
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(infoOverlay);
        albumContainer.appendChild(imgContainer);

        if (showRank) {
            const rankBadge = document.createElement('div');
            rankBadge.className = 'rank-badge';
            rankBadge.textContent = `#${index + 1}`;
            albumContainer.appendChild(rankBadge);
        }

        if (showPlaycount && item.playcount) {
            const playcountBadge = document.createElement('div');
            playcountBadge.className = 'playcount-badge';
            playcountBadge.textContent = `${parseInt(item.playcount).toLocaleString()} plays`;
            albumContainer.appendChild(playcountBadge);
        }

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

    // Create a container with fixed dimensions
    const container = document.createElement('div');
    container.style.width = wrapper.offsetWidth + 'px';
    container.style.height = wrapper.offsetHeight + 'px';
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.appendChild(wrapper.cloneNode(true));
    document.body.appendChild(container);

    const templateStyle = document.getElementById('templateStyle').value;
    const showText = document.getElementById('showText').checked;
    const gridSize = parseInt(document.getElementById('gridSize').value);
    const customGap = document.getElementById('gapSize').value;
    const customBorderRadius = document.getElementById('borderRadius').value;
    const customBgColor = document.getElementById('bgColor').value;
    const showRank = document.getElementById('showRank').checked;
    const showPlaycount = document.getElementById('showPlaycount').checked;

    // Apply styles to cloned element
    const clonedWrapper = container.firstChild;
    clonedWrapper.style.gap = `${customGap}px`;
    clonedWrapper.style.backgroundColor = customBgColor;

    // Adjust scale based on grid size
    let scale = gridSize <= 5 ? 8 : gridSize <= 7 ? 6 : gridSize <= 8 ? 4 : 3;

    html2canvas(clonedWrapper, {
        scale: scale,
        backgroundColor: customBgColor,
        logging: false,
        useCORS: true,
        allowTaint: false,
        onclone: function(clonedDoc) {
            const element = clonedDoc.querySelector('#collageWrapper');
            if (element) {
                element.style.width = wrapper.offsetWidth + 'px';
                element.style.height = wrapper.offsetHeight + 'px';
            }
        }
    }).then(canvas => {
        try {
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                canvas.toBlob(function(blob) {
                    const url = URL.createObjectURL(blob);
                    showMobileDownloadOptions(url);
                }, 'image/png');
            } else {
                const link = document.createElement('a');
                link.download = `lastfm-collage-${templateStyle}-${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showAlert('Download complete!', 'success');
            }
        } catch (err) {
            console.error('Download error:', err);
            showAlert('Error creating download', 'danger');
        } finally {
            document.body.removeChild(container);
        }
    }).catch(err => {
        console.error('Canvas error:', err);
        showAlert('Error generating image', 'danger');
        document.body.removeChild(container);
    });
}

function showMobileDownloadOptions(url) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.right = '0';
    modal.style.bottom = '0';
    modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
    modal.style.zIndex = '9999';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '20px';
    
    modal.innerHTML = `
        <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px; text-align: center;">
            <h4 style="color: white; margin-bottom: 15px;">Download Options</h4>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button onclick="window.open('${url}', '_blank')" class="btn btn-primary">
                    Open Image in New Tab
                </button>
                <a href="${url}" download="lastfm-collage.png" class="btn btn-success">
                    Direct Download
                </a>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn btn-secondary">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    showAlert('Choose your download option', 'success');
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

// Update the sharing functions
function shareToTwitter() {
    const username = document.getElementById('username').value;
    if (!username) {
        showAlert('Please generate a collage first', 'warning');
        return;
    }
    
    const text = `Check out my music collage at https://mdpmusic.uk?user=${username}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareToFacebook() {
    const username = document.getElementById('username').value;
    if (!username) {
        showAlert('Please generate a collage first', 'warning');
        return;
    }
    
    // Create sharing URL with mdpmusic.uk domain
    const shareUrl = `https://mdpmusic.uk?user=${username}`;
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
    
    const url = `https://mdpmusic.uk?user=${username}`;
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

// Add event listener to keep inputs in sync
document.addEventListener('DOMContentLoaded', function() {
    const gridSizeInput = document.getElementById('gridSize');
    
    gridSizeInput.addEventListener('input', function() {
        let value = parseInt(this.value) || 3;
        // Enforce min/max limits
        value = Math.max(2, Math.min(8, value));
        this.value = value;
        
        // Update the disabled mirror input
        const mirrorInput = this.nextElementSibling.nextElementSibling;
        mirrorInput.value = value;
    });
});

// Add these new fetch functions
async function fetchTopArtists(username, period, limit) {
    const params = new URLSearchParams({
        method: 'user.gettopartists',
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

    // Enhance artist images
    const enhancedArtists = await Promise.all(
        data.topartists.artist.map(async artist => {
            try {
                const betterImage = await fetchBetterArtistImage(artist.name);
                if (betterImage) {
                    artist.image = artist.image.map(img => {
                        if (img.size === 'large' || img.size === 'extralarge') {
                            return { ...img, '#text': betterImage };
                        }
                        return img;
                    });
                }
            } catch (error) {
                console.warn('Could not fetch better quality image for:', artist.name);
            }
            return artist;
        })
    );

    return enhancedArtists;
}

async function fetchTopTracks(username, period, limit) {
    const params = new URLSearchParams({
        method: 'user.gettoptracks',
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

    // Enhance track images
    const enhancedTracks = await Promise.all(
        data.toptracks.track.map(async track => {
            try {
                const betterImage = await fetchBetterTrackImage(track.name, track.artist.name);
                if (betterImage) {
                    track.image = track.image.map(img => {
                        if (img.size === 'large' || img.size === 'extralarge') {
                            return { ...img, '#text': betterImage };
                        }
                        return img;
                    });
                }
            } catch (error) {
                console.warn('Could not fetch better quality image for:', track.name);
            }
            return track;
        })
    );

    return enhancedTracks;
}

// Add these new functions for fetching better quality images
async function fetchBetterArtistImage(artistName) {
    try {
        // Try Last.fm first
        const lastfmImage = await fetchLastfmArtistImage(artistName);
        if (lastfmImage) return lastfmImage;

        // Fallback to Spotify
        const spotifyToken = await getSpotifyToken();
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`, {
            headers: {
                'Authorization': `Bearer ${spotifyToken}`
            }
        });
        const data = await response.json();
        
        if (data.artists?.items?.[0]?.images?.[0]?.url) {
            return data.artists.items[0].images[0].url;
        }
    } catch (error) {
        console.warn('Error fetching artist image:', error);
    }
    return null;
}

async function fetchBetterTrackImage(trackName, artistName) {
    try {
        // Try Last.fm first
        const lastfmImage = await fetchLastfmTrackImage(trackName, artistName);
        if (lastfmImage) return lastfmImage;

        // Fallback to Spotify
        const spotifyToken = await getSpotifyToken();
        const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(trackName)}+artist:${encodeURIComponent(artistName)}&type=track&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${spotifyToken}`
                }
            }
        );
        const data = await response.json();
        
        if (data.tracks?.items?.[0]?.album?.images?.[0]?.url) {
            return data.tracks.items[0].album.images[0].url;
        }
    } catch (error) {
        console.warn('Error fetching track image:', error);
    }
    return null;
}

// Helper functions for Last.fm image fetching
async function fetchLastfmArtistImage(artistName) {
    // Existing Last.fm image fetching code
    const params = new URLSearchParams({
        method: 'artist.getTopAlbums',
        artist: artistName,
        limit: 1,
        api_key: API_KEY,
        format: 'json'
    });

    try {
        const response = await fetch(`${API_BASE_URL}?${params}`);
        const data = await response.json();
        
        if (data.topalbums?.album?.[0]?.image) {
            const images = data.topalbums.album[0].image;
            const mega = images.find(img => img.size === 'mega');
            const extralarge = images.find(img => img.size === 'extralarge');
            
            if (mega?.['#text']) return mega['#text'];
            if (extralarge?.['#text']) return extralarge['#text'];
        }
    } catch (error) {
        console.warn('Error fetching Last.fm artist image:', error);
    }
    return null;
}

async function fetchLastfmTrackImage(trackName, artistName) {
    // Existing Last.fm image fetching code
    const params = new URLSearchParams({
        method: 'track.getInfo',
        track: trackName,
        artist: artistName,
        api_key: API_KEY,
        format: 'json'
    });

    try {
        const response = await fetch(`${API_BASE_URL}?${params}`);
        const data = await response.json();
        
        if (data.track?.album?.image) {
            const images = data.track.album.image;
            const mega = images.find(img => img.size === 'mega');
            const extralarge = images.find(img => img.size === 'extralarge');
            
            if (mega?.['#text']) return mega['#text'];
            if (extralarge?.['#text']) return extralarge['#text'];
        }
    } catch (error) {
        console.warn('Error fetching Last.fm track image:', error);
    }
    return null;
}

// Add Spotify authentication function
async function getSpotifyToken() {
    try {
        const response = await fetch('/api/spotify-token');
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        return data.access_token;
    } catch (error) {
        console.error('Error getting Spotify token:', error);
        throw error;
    }
}

async function generateProfileCard() {
    const username = document.getElementById('username').value;
    if (!username) {
        showAlert('Please enter a Last.fm username', 'danger');
        return;
    }

    const theme = document.getElementById('cardTheme').value;
    const period = document.getElementById('cardPeriod').value;
    
    // Update loading text before showing overlay
    document.querySelector('.loading-text').textContent = 'Generating your profile card...';
    document.getElementById('loadingOverlay').classList.remove('d-none');
    
    try {
        const userInfo = await getUserInfo(username);
        const topArtists = await getTopArtists(username, period, 3);
        const topTracks = await getTopTracks(username, period, 3);
        
        // Get Spotify token for image fetching
        const spotifyToken = await getSpotifyToken();
        
        // Enhance artist images with Spotify
        const enhancedArtists = await Promise.all(topArtists.map(async artist => {
            try {
                const spotifyResponse = await fetch(
                    `https://api.spotify.com/v1/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`,
                    {
                        headers: { 'Authorization': `Bearer ${spotifyToken}` }
                    }
                );
                const spotifyData = await spotifyResponse.json();
                const spotifyImage = spotifyData.artists?.items?.[0]?.images?.[0]?.url;
                return {
                    ...artist,
                    imageUrl: spotifyImage || artist.image?.[3]?.['#text'] || 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png'
                };
            } catch (error) {
                return {
                    ...artist,
                    imageUrl: artist.image?.[3]?.['#text'] || 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png'
                };
            }
        }));

        // Enhance track images with Spotify
        const enhancedTracks = await Promise.all(topTracks.map(async track => {
            try {
                const spotifyResponse = await fetch(
                    `https://api.spotify.com/v1/search?q=${encodeURIComponent(`${track.name} ${track.artist.name}`)}&type=track&limit=1`,
                    {
                        headers: { 'Authorization': `Bearer ${spotifyToken}` }
                    }
                );
                const spotifyData = await spotifyResponse.json();
                const spotifyImage = spotifyData.tracks?.items?.[0]?.album?.images?.[0]?.url;
                return {
                    ...track,
                    imageUrl: spotifyImage || track.image?.[3]?.['#text'] || 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png'
                };
            } catch (error) {
                return {
                    ...track,
                    imageUrl: track.image?.[3]?.['#text'] || 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png'
                };
            }
        }));
        
        const profileCard = document.getElementById('profileCard');
        profileCard.className = `profile-card theme-${theme}`;
        
        profileCard.innerHTML = `
            <div class="user-header">
                <img src="${userInfo.image?.[3]?.['#text'] || 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png'}" 
                     class="user-avatar" alt="Profile picture" crossOrigin="anonymous">
                <div class="user-info">
                    <h2>${userInfo.name}</h2>
                    <p class="text-muted">Scrobbling since ${new Date(userInfo.registered.unixtime * 1000).getFullYear()}</p>
                </div>
            </div>
            <div class="stats-grid">
                <div class="stat-item">
                    <h3>${parseInt(userInfo.playcount).toLocaleString()}</h3>
                    <p>Total Scrobbles</p>
                </div>
                <div class="stat-item">
                    <h3>${period === 'overall' ? 'All Time' : formatPeriod(period)}</h3>
                    <p>Time Period</p>
                </div>
            </div>
            <div class="top-section">
                <h4 class="mb-3">Top Artists</h4>
                <div class="top-items">
                    ${enhancedArtists.map(artist => `
                        <div class="item-card">
                            <img src="${artist.imageUrl}" alt="${artist.name}" crossOrigin="anonymous">
                            <p class="item-name">${artist.name}</p>
                            <small class="text-muted">${artist.playcount} plays</small>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="top-section mt-4">
                <h4 class="mb-3">Top Tracks</h4>
                <div class="top-items">
                    ${enhancedTracks.map(track => `
                        <div class="item-card">
                            <img src="${track.imageUrl}" alt="${track.name}" crossOrigin="anonymous">
                            <p class="item-name">${track.name}</p>
                            <div class="item-details">
                                <small class="text-muted d-block">${track.artist.name}</small>
                                <small class="text-muted d-block">${track.playcount} plays</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        document.getElementById('downloadCardBtn').style.display = 'block';
        showAlert('Profile card generated successfully!', 'success');
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error generating profile card', 'danger');
    } finally {
        document.getElementById('loadingOverlay').classList.add('d-none');
        // Reset loading text back for collage generation
        document.querySelector('.loading-text').textContent = 'Generating your collage...';
    }
}

function downloadProfileCard() {
    const card = document.getElementById('profileCard');
    
    // Show loading indicator
    showAlert('Preparing download...', 'info');
    
    // Pre-load all images
    const images = Array.from(card.getElementsByTagName('img'));
    Promise.all(images.map(img => {
        return new Promise((resolve, reject) => {
            const newImg = new Image();
            newImg.crossOrigin = 'anonymous';
            newImg.onload = () => {
                img.src = newImg.src;
                resolve();
            };
            newImg.onerror = () => {
                console.warn(`Failed to load image: ${img.src}`);
                resolve();
            };
            newImg.src = img.src.replace('http://', 'https://') + '?t=' + new Date().getTime();
        });
    })).then(() => {
        html2canvas(card, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: card.style.backgroundColor || '#000000',
            logging: true,
            onclone: function(clonedDoc) {
                const clonedCard = clonedDoc.getElementById('profileCard');
                clonedCard.style.width = card.offsetWidth + 'px';
                clonedCard.style.height = card.offsetHeight + 'px';
            }
        }).then(canvas => {
            try {
                // For mobile devices, open image in new tab
                if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                    // Convert canvas to blob
                    canvas.toBlob(function(blob) {
                        const url = URL.createObjectURL(blob);
                        
                        // Create modal to show download options
                        const modal = document.createElement('div');
                        modal.style.position = 'fixed';
                        modal.style.top = '0';
                        modal.style.left = '0';
                        modal.style.right = '0';
                        modal.style.bottom = '0';
                        modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
                        modal.style.zIndex = '9999';
                        modal.style.display = 'flex';
                        modal.style.flexDirection = 'column';
                        modal.style.alignItems = 'center';
                        modal.style.justifyContent = 'center';
                        modal.style.padding = '20px';
                        
                        modal.innerHTML = `
                            <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px; text-align: center;">
                                <h4 style="color: white; margin-bottom: 15px;">Download Options</h4>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <button onclick="window.open('${url}', '_blank')" class="btn btn-primary">
                                        Open Image in New Tab
                                    </button>
                                    <a href="${url}" download="lastfm-profile-card.png" class="btn btn-success">
                                        Direct Download
                                    </a>
                                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn btn-secondary">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        `;
                        
                        document.body.appendChild(modal);
                        showAlert('Choose your download option', 'success');
                    }, 'image/png');
                } else {
                    // Desktop download
                    const link = document.createElement('a');
                    link.download = `lastfm-profile-card-${Date.now()}.png`;
                    link.href = canvas.toDataURL('image/png');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showAlert('Download complete!', 'success');
                }
            } catch (err) {
                console.error('Download error:', err);
                showAlert('Error creating download', 'danger');
            }
        }).catch(err => {
            console.error('Canvas error:', err);
            showAlert('Error generating image', 'danger');
        });
    }).catch(err => {
        console.error('Image loading error:', err);
        showAlert('Error loading images', 'danger');
    });
}

function formatPeriod(period) {
    const periods = {
        '7day': 'Last 7 Days',
        '1month': 'Last Month',
        '3month': 'Last 3 Months',
        '6month': 'Last 6 Months',
        '12month': 'Last Year',
        'overall': 'All Time'
    };
    return periods[period] || period;
}

// Add this function to handle mobile-specific behaviors
function initializeMobileHandling() {
    // Handle tab switching on mobile
    const tabs = document.querySelectorAll('.nav-link');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                // Scroll to content area
                const tabContent = document.querySelector(tab.getAttribute('href'));
                if (tabContent) {
                    setTimeout(() => {
                        tabContent.scrollIntoView({ behavior: 'smooth' });
                    }, 150);
                }
            }
        });
    });

    // Adjust profile card generation for mobile
    const originalGenerateProfileCard = generateProfileCard;
    generateProfileCard = async function() {
        await originalGenerateProfileCard();
        if (window.innerWidth <= 768) {
            const profileCard = document.getElementById('profileCard');
            profileCard.scrollIntoView({ behavior: 'smooth' });
        }
    };
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', initializeMobileHandling);

// Handle resize events
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Adjust layout for current screen size
        const profileCard = document.getElementById('profileCard');
        if (profileCard) {
            profileCard.style.maxWidth = window.innerWidth <= 768 ? '100%' : '600px';
        }
    }, 250);
});

// Initialize by getting API key
async function initializeApp() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        API_KEY = config.lastfmApiKey;
    } catch (error) {
        console.error('Error initializing app:', error);
        showAlert('Error initializing application', 'danger');
    }
}

// Call initializeApp when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    initializeMobileHandling();
});

// Add event listeners for the new controls
document.addEventListener('DOMContentLoaded', () => {
    // ... existing initialization code ...

    // Gap size slider
    const gapSize = document.getElementById('gapSize');
    const gapSizeValue = document.getElementById('gapSizeValue');
    gapSize.addEventListener('input', (e) => {
        gapSizeValue.textContent = `${e.target.value}px`;
        if (document.getElementById('collageWrapper')) {
            document.getElementById('collageWrapper').style.gap = `${e.target.value}px`;
        }
    });

    // Border radius slider
    const borderRadius = document.getElementById('borderRadius');
    const borderRadiusValue = document.getElementById('borderRadiusValue');
    borderRadius.addEventListener('input', (e) => {
        borderRadiusValue.textContent = `${e.target.value}px`;
        document.documentElement.style.setProperty('--border-radius', `${e.target.value}px`);
    });

    // Background color picker
    const bgColor = document.getElementById('bgColor');
    bgColor.addEventListener('input', (e) => {
        if (document.getElementById('collageWrapper')) {
            document.getElementById('collageWrapper').style.backgroundColor = e.target.value;
        }
    });
});

// Update the exportToSpotify function to show the modal
function exportToSpotify() {
    if (!currentUsername) {
        showAlert('Please set a Last.fm username first', 'danger');
        return;
    }
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('spotifyExportModal'));
    modal.show();
}

// Update createSpotifyPlaylist function
async function createSpotifyPlaylist() {
    try {
        const playlistType = document.getElementById('spotifyPlaylistType').value;
        const limit = parseInt(document.getElementById('spotifyPlaylistLimit').value);
        const timeRange = document.getElementById('timeRange').value;
        const period = formatPeriod(timeRange);

        // Show loading state
        const createButton = document.querySelector('#spotifyExportModal .btn-success');
        const originalText = createButton.innerHTML;
        createButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Creating playlist...';
        createButton.disabled = true;

        let tracks = [];
        let playlistName = '';

        try {
            switch (playlistType) {
                case 'tracks':
                    tracks = await fetchTopTracks(currentUsername, timeRange, limit);
                    playlistName = `${currentUsername}'s Top Tracks - ${period}`;
                    tracks = tracks.map(track => ({
                        name: track.name,
                        artist: track.artist.name
                    }));
                    break;

                case 'artists':
                    const artists = await fetchTopArtists(currentUsername, timeRange, limit);
                    playlistName = `${currentUsername}'s Top Artists' Tracks - ${period}`;
                    // Get top tracks for each artist
                    for (const artist of artists) {
                        const artistTracks = await fetchArtistTopTracks(artist.name);
                        tracks.push(...artistTracks.slice(0, 3).map(track => ({
                            name: track.name,
                            artist: artist.name
                        })));
                    }
                    break;

                case 'albums':
                    const albums = await fetchTopAlbums(currentUsername, timeRange, limit);
                    playlistName = `${currentUsername}'s Top Albums' Tracks - ${period}`;
                    // Get tracks for each album
                    for (const album of albums) {
                        try {
                            const albumTracks = await fetchAlbumTracks(album.artist.name, album.name);
                            if (albumTracks && albumTracks.length > 0) {
                                // Take up to 5 tracks from each album
                                tracks.push(...albumTracks.slice(0, 5));
                            }
                        } catch (error) {
                            console.warn(`Error processing album ${album.name}:`, error);
                            continue;
                        }
                    }
                    break;
            }

            const response = await fetch('/api/create-spotify-playlist', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tracks,
                    playlistName
                })
            });

            const data = await response.json();

            if (response.status === 401) {
                // Try to refresh token
                const refreshResponse = await fetch('/api/refresh-spotify-token', {
                    method: 'POST'
                });
                
                if (refreshResponse.ok) {
                    // Retry the playlist creation
                    return createSpotifyPlaylist();
                } else {
                    window.location.href = '/auth/spotify';
                    return;
                }
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create playlist');
            }

            // Hide the modal
            bootstrap.Modal.getInstance(document.getElementById('spotifyExportModal')).hide();
            
            if (data.tracksAdded > 0) {
                showAlert(`Playlist created with ${data.tracksAdded} tracks! <a href="${data.playlistUrl}" target="_blank">Open in Spotify</a>`, 'success');
            } else {
                showAlert('Created playlist but no matching tracks were found on Spotify', 'warning');
            }
        } finally {
            // Reset button state
            createButton.innerHTML = originalText;
            createButton.disabled = false;
        }
    } catch (error) {
        console.error('Export error:', error);
        showAlert(`Error: ${error.message}`, 'danger');
    }
}

// Add helper functions to fetch tracks
async function fetchArtistTopTracks(artistName) {
    const params = new URLSearchParams({
        method: 'artist.getTopTracks',
        artist: artistName,
        api_key: API_KEY,
        format: 'json',
        limit: 3
    });

    const response = await fetch(`${API_BASE_URL}?${params}`);
    const data = await response.json();
    return data.toptracks?.track || [];
}

async function fetchAlbumTracks(artistName, albumName) {
    const params = new URLSearchParams({
        method: 'album.getInfo',
        artist: artistName,
        album: albumName,
        api_key: API_KEY,
        format: 'json'
    });

    try {
        const response = await fetch(`${API_BASE_URL}?${params}`);
        const data = await response.json();
        
        // Handle different possible data structures
        if (data.album?.tracks?.track) {
            // If it's a single track, wrap it in an array
            const tracks = Array.isArray(data.album.tracks.track) 
                ? data.album.tracks.track 
                : [data.album.tracks.track];
            
            return tracks.map(track => ({
                name: track.name,
                artist: track.artist?.name || artistName // Fallback to album artist if track artist is missing
            }));
        }
        return [];
    } catch (error) {
        console.warn(`Error fetching tracks for album ${albumName}:`, error);
        return [];
    }
}

async function setUsername() {
    const username = document.getElementById('mainUsername').value.trim();
    if (!username) {
        showAlert('Please enter a Last.fm username', 'danger');
        return;
    }

    try {
        // Verify the username exists by trying to fetch user info
        const params = new URLSearchParams({
            method: 'user.getinfo',
            user: username,
            api_key: API_KEY,
            format: 'json'
        });

        const response = await fetch(`${API_BASE_URL}?${params}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.message);
        }

        // Username is valid
        currentUsername = username;
        
        // Enable main content
        const mainContent = document.getElementById('mainContent');
        mainContent.style.opacity = '1';
        mainContent.style.pointerEvents = 'auto';

        // Update all username inputs
        document.querySelectorAll('input[type="text"][id$="username"]').forEach(input => {
            input.value = username;
        });

        // Load initial data
        await Promise.all([
            updateProfile(username),
            updateTopCharts(username),
            updateRecentTracks(username)
        ]);

        showAlert(`Welcome, ${username}!`, 'success');
        
        // Store username in localStorage for persistence
        localStorage.setItem('lastfm_username', username);
    } catch (error) {
        console.error('Error:', error);
        showAlert('Invalid username. Please check and try again.', 'danger');
    }
}

// Add this to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    // ... existing initialization code ...

    // Check for stored username
    const storedUsername = localStorage.getItem('lastfm_username');
    if (storedUsername) {
        document.getElementById('mainUsername').value = storedUsername;
        setUsername();
    }
});

// Add a function to change username
function changeUsername() {
    currentUsername = '';
    localStorage.removeItem('lastfm_username');
    document.getElementById('mainUsername').value = '';
    const mainContent = document.getElementById('mainContent');
    mainContent.style.opacity = '0.5';
    mainContent.style.pointerEvents = 'none';
    showAlert('Username cleared. Please enter a new username.', 'info');
} 