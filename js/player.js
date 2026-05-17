/**
 * THAITHINHTV - Player Module
 * HLS video player with channel switching
 */

let hls = null;
let currentMatch = null;
let currentStreamIndex = 0;
let controlsTimeout = null;
let isControlsVisible = true;

/**
 * Initialize the player page
 */
async function initPlayer() {
  // Load match data from sessionStorage
  const stored = sessionStorage.getItem('currentMatch');
  if (!stored) {
    window.location.href = 'index.html';
    return;
  }

  currentMatch = JSON.parse(stored);

  // Render match info
  renderMatchInfo();

  // Render channel list
  renderChannels();

  // Auto-play best stream
  const bestStream = getBestStream();
  if (bestStream) {
    playStream(bestStream, 0);
  } else {
    showError('Trận đấu này chưa có nguồn phát. Vui lòng thử lại sau.');
  }

  // Setup UI interactions
  setupPlayerUI();

  // Setup keyboard controls
  setupPlayerKeyboard();
}

/**
 * Get the best available stream (priority: official > m3u8 > flv)
 */
function getBestStream() {
  if (!currentMatch?.streams?.length) return null;

  // Official stream first
  const official = currentMatch.streams.find(s => s.isOfficial);
  if (official) return official;

  // Highest fan count m3u8
  const m3u8Streams = currentMatch.streams.filter(s => s.type === 'm3u8');
  if (m3u8Streams.length) {
    return m3u8Streams.sort((a, b) => (b.fans || 0) - (a.fans || 0))[0];
  }

  // Fallback to flv
  return currentMatch.streams[0] || null;
}

/**
 * Render match info in the top bar
 */
function renderMatchInfo() {
  const { homeTeam, awayTeam, competition, status } = currentMatch;

  document.getElementById('player-competition').textContent = competition.name;

  document.getElementById('player-home').textContent = homeTeam.name;
  document.getElementById('player-away').textContent = awayTeam.name;

  if (status === 'live' || status === 'ended') {
    document.getElementById('player-score').textContent =
      `${homeTeam.score} - ${awayTeam.score}`;
    document.getElementById('player-score').style.display = '';
  } else {
    const time = window.ThaiThinhAPI?.formatMatchTime?.(currentMatch.matchTime) || '';
    document.getElementById('player-score').textContent = time;
  }

  const badge = document.getElementById('player-live-badge');
  if (badge) {
    if (status === 'live') {
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // Set page title
  document.title = `${homeTeam.name} vs ${awayTeam.name} - THAITHINHTV`;
}

/**
 * Render the channel selection buttons
 */
function renderChannels() {
  const list = document.getElementById('channel-list');
  const streams = currentMatch.streams || [];

  if (!streams.length) {
    list.innerHTML = `<div style="color:rgba(255,255,255,0.4);font-size:14px;">Chưa có nguồn phát</div>`;
    return;
  }

  list.innerHTML = '';

  streams.forEach((stream, index) => {
    const btn = document.createElement('button');
    btn.className = `channel-btn${stream.isOfficial ? ' official' : ''}`;
    btn.dataset.index = index;

    const avatarSrc = stream.houseImage || stream.avatar || '';
    const avatarHtml = avatarSrc
      ? `<img class="channel-btn__avatar" src="${avatarSrc}" alt="" onerror="this.style.display='none'">`
      : `<div class="channel-btn__avatar" style="display:flex;align-items:center;justify-content:center;font-size:18px;">📺</div>`;

    const fansHtml = stream.fans !== null && stream.fans !== undefined
      ? `<div class="channel-btn__fans">👥 ${stream.fans.toLocaleString()} người xem</div>`
      : '<div class="channel-btn__fans">Nguồn chính thức</div>';

    btn.innerHTML = `
      ${avatarHtml}
      <div class="channel-btn__info">
        <div class="channel-btn__name">${stream.name}</div>
        ${fansHtml}
      </div>
    `;

    btn.addEventListener('click', () => {
      playStream(stream, index);
    });

    list.appendChild(btn);
  });
}

/**
 * Play a stream by HLS.js or native video
 */
function playStream(stream, index) {
  currentStreamIndex = index;

  // Update active channel button
  document.querySelectorAll('.channel-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });

  const video = document.getElementById('video-player');
  const url = stream.url;

  console.log(`[Player] Playing stream: ${stream.name} | ${url}`);

  // Hide error
  document.getElementById('player-error').style.display = 'none';

  // Destroy existing HLS instance
  if (hls) {
    hls.destroy();
    hls = null;
  }

  const isM3U8 = url.includes('.m3u8') || stream.type === 'm3u8';

  if (isM3U8) {
    if (window.Hls && Hls.isSupported()) {
      console.log('[Player] Using HLS.js');
      // Use HLS.js for robust playback (handles ABR and chunk errors much better than native WebView)
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxLoadingDelay: 4,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 10000,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(err => {
          console.warn('[Player] Autoplay blocked:', err);
          showToast('Nhấn Play để bắt đầu phát');
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[Player] HLS error:', data);
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            tryFallback(stream, index);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            tryFallback(stream, index);
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS fallback
      console.log('[Player] Using native HLS playback');
      video.src = url;
      video.play().catch(err => console.warn('[Player] Autoplay:', err));
    } else {
      tryFallback(stream, index);
    }
  } else if (url.includes('.flv')) {
    // FLV via flv.js
    if (window.flvjs && flvjs.isSupported()) {
      const flvPlayer = flvjs.createPlayer({
        type: 'flv',
        url: url,
        isLive: true,
      });
      flvPlayer.attachMediaElement(video);
      flvPlayer.load();
      flvPlayer.play();
    } else {
      showError('Trình duyệt của bạn không hỗ trợ phát FLV. Vui lòng chọn nguồn khác.');
      return;
    }
  } else {
    // Direct URL
    video.src = url;
    video.play().catch(err => console.warn('[Player] Autoplay:', err));
  }
}

/**
 * Try fallback stream (FLV or next stream)
 */
function tryFallback(stream, index) {
  console.warn('[Player] Stream failed, trying fallback...');

  // Try FLV fallback of same anchor
  if (stream.urlFallback) {
    console.log('[Player] Trying FLV fallback:', stream.urlFallback);
    const fallbackStream = { ...stream, url: stream.urlFallback, type: 'flv' };
    playStream(fallbackStream, index);
    return;
  }

  // Try next stream in list
  const streams = currentMatch.streams || [];
  const nextIndex = index + 1;

  if (nextIndex < streams.length) {
    console.log(`[Player] Trying next stream (${nextIndex}/${streams.length - 1})`);
    showToast(`Đang thử nguồn dự phòng ${nextIndex + 1}...`);
    playStream(streams[nextIndex], nextIndex);
  } else {
    showError('Không thể phát stream này. Vui lòng thử nguồn khác.');
  }
}

/**
 * Show error overlay
 */
function showError(message) {
  const errorEl = document.getElementById('player-error');
  const msgEl = document.getElementById('player-error-msg');
  msgEl.textContent = message;
  errorEl.style.display = 'flex';
}

/**
 * Setup player UI interactions
 */
function setupPlayerUI() {
  // Back button is handled in HTML, Retry is handled below
  
  // Retry button
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      const stream = currentMatch.streams?.[currentStreamIndex];
      if (stream) playStream(stream, currentStreamIndex);
    });
  }
}

/**
 * Setup keyboard shortcuts for the player
 */
function setupPlayerKeyboard() {
  document.addEventListener('keydown', (e) => {
    const video = document.getElementById('video-player');

    switch (e.key) {
      case 'Escape':
      case 'Backspace':
        goBack();
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'm':
      case 'M':
        video.muted = !video.muted;
        showToast(video.muted ? '🔇 Tắt tiếng' : '🔊 Bật tiếng');
        break;
    }
  });
}

/**
 * Toggle play/pause
 */
function togglePlayPause() {
  const video = document.getElementById('video-player');
  if (video.paused) {
    video.play();
    showToast('▶ Đang phát');
  } else {
    video.pause();
    showToast('⏸ Tạm dừng');
  }
}

/**
 * Switch to prev/next channel
 */
function switchChannel(direction) {
  const streams = currentMatch?.streams || [];
  if (!streams.length) return;

  const nextIndex = Math.max(0, Math.min(streams.length - 1, currentStreamIndex + direction));
  if (nextIndex !== currentStreamIndex) {
    playStream(streams[nextIndex], nextIndex);
    showToast(`📺 ${streams[nextIndex].name}`);
  }
}

/**
 * Toggle fullscreen
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

/**
 * Go back to home
 */
function goBack() {
  if (hls) { hls.destroy(); hls = null; }
  window.location.href = 'index.html';
}

/**
 * Show a toast notification
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initPlayer);
