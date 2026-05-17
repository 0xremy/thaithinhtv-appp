/**
 * THAITHINHTV - Matches Module
 * Renders match cards on the home page
 */

let allMatches = [];
let currentFilter = 'live'; // 'live' | 'upcoming' | 'ended'
let focusedIndex = 0;

/**
 * Initialize the matches page
 */
async function initMatches() {
  updateClock();
  setInterval(updateClock, 1000);

  // Setup tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setFilter(tab.dataset.filter);
    });
  });

  // Setup refresh
  document.getElementById('refresh-btn').addEventListener('click', loadMatches);

  // Setup keyboard navigation
  setupKeyboardNav();

  // Load matches
  await loadMatches();

  // Auto-refresh every 30 seconds
  setInterval(loadMatches, 30000);
}

/**
 * Load and render matches
 */
async function loadMatches() {
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('loading');

  showLoading();

  try {
    allMatches = await window.ThaiThinhAPI.fetchMatches();
    renderMatches();
  } catch (err) {
    console.error('[Matches] Load failed:', err);
    showError();
  } finally {
    refreshBtn.classList.remove('loading');
  }
}

/**
 * Set active filter
 */
function setFilter(filter) {
  currentFilter = filter;
  focusedIndex = 0;

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  renderMatches();
}

/**
 * Filter matches by current tab
 */
function getFilteredMatches() {
  return allMatches.filter(m => {
    if (currentFilter === 'live') return m.status === 'live';
    if (currentFilter === 'upcoming') return m.status === 'upcoming';
    if (currentFilter === 'ended') return m.status === 'ended';
    return true;
  });
}

/**
 * Show loading state
 */
function showLoading() {
  const container = document.getElementById('matches-container');
  container.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">Đang tải trận đấu...</div>
    </div>
  `;
}

/**
 * Show error state
 */
function showError() {
  const container = document.getElementById('matches-container');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-text">Không thể tải dữ liệu. Vui lòng thử lại.</div>
      <button class="watch-btn" onclick="loadMatches()" style="margin-top:16px;font-size:15px;padding:12px 28px;">
        🔄 Thử lại
      </button>
    </div>
  `;
}

/**
 * Render match cards
 */
function renderMatches() {
  const filtered = getFilteredMatches();
  const container = document.getElementById('matches-container');

  // Update count badge
  const liveCount = allMatches.filter(m => m.status === 'live').length;
  const upcomingCount = allMatches.filter(m => m.status === 'upcoming').length;
  const endedCount = allMatches.filter(m => m.status === 'ended').length;

  document.querySelector('[data-filter="live"] .tab-count').textContent = liveCount || '';
  document.querySelector('[data-filter="upcoming"] .tab-count').textContent = upcomingCount || '';
  document.querySelector('[data-filter="ended"] .tab-count').textContent = endedCount || '';

  // Update section title count
  document.getElementById('section-count').textContent = filtered.length;

  if (filtered.length === 0) {
    const labels = {
      live: 'Không có trận đấu nào đang diễn ra',
      upcoming: 'Không có trận đấu nào sắp diễn ra',
      ended: 'Không có trận đấu nào đã kết thúc',
    };
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚽</div>
        <div class="empty-text">${labels[currentFilter]}</div>
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'matches-grid';

  filtered.forEach((match, index) => {
    const card = createMatchCard(match, index);
    grid.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(grid);

  // Focus first card
  focusCard(0);
}

/**
 * Create a match card element
 */
function createMatchCard(match, index) {
  const { homeTeam, awayTeam, competition, status, streams } = match;

  const card = document.createElement('div');
  card.className = 'match-card';
  card.tabIndex = 0;
  card.dataset.index = index;
  card.dataset.matchId = match.id;

  // Status badge
  let statusBadge = '';
  if (status === 'live') {
    statusBadge = `<span class="match-card__status status-live"><span class="dot"></span>TRỰC TIẾP</span>`;
  } else if (status === 'upcoming') {
    const time = window.ThaiThinhAPI.formatMatchTime(match.matchTime);
    statusBadge = `<span class="match-card__status status-upcoming">⏰ ${time}</span>`;
  } else {
    statusBadge = `<span class="match-card__status status-ended">KẾT THÚC</span>`;
  }

  // Score display
  let scoreHtml = '';
  if (status === 'live' || status === 'ended') {
    scoreHtml = `
      <div class="match-card__score">
        <div class="score-display">
          <span class="score-num">${homeTeam.score}</span>
          <span class="score-sep">-</span>
          <span class="score-num">${awayTeam.score}</span>
        </div>
      </div>
    `;
  } else {
    const time = window.ThaiThinhAPI.formatMatchTime(match.matchTime);
    scoreHtml = `
      <div class="match-card__score">
        <div class="match-time-display">${time}</div>
      </div>
    `;
  }

  // Anchors preview
  let anchorsHtml = '';
  const anchors = streams.filter(s => !s.isOfficial);
  if (anchors.length > 0) {
    const avatarHtml = anchors.slice(0, 4).map(a =>
      `<img class="anchor-avatar" src="${a.avatar || ''}" alt="${a.name}" 
            onerror="this.style.display='none'">`
    ).join('');
    anchorsHtml = `
      <div class="anchors-list">
        ${avatarHtml}
        <span class="anchors-count">${anchors.length} kênh</span>
      </div>
    `;
  } else if (streams.find(s => s.isOfficial)) {
    anchorsHtml = `<span class="anchors-count">📺 Nguồn chính thức</span>`;
  } else {
    anchorsHtml = `<span class="anchors-count" style="color:var(--text-muted)">Chưa có nguồn</span>`;
  }

  // Watch button (only if streams available)
  const hasStreams = streams.length > 0;
  const watchBtn = hasStreams
    ? `<button class="watch-btn" data-match-id="${match.id}">
        ▶ Xem ngay
       </button>`
    : `<span style="font-size:12px;color:var(--text-muted)">Chưa có link</span>`;

  card.innerHTML = `
    <div class="match-card__competition">
      <img class="match-card__comp-logo" 
           src="${competition.logo}" 
           alt="${competition.name}"
           onerror="this.style.display='none'">
      <span class="match-card__comp-name">${competition.name}</span>
      ${statusBadge}
    </div>

    <div class="match-card__teams">
      <div class="team team--home">
        <img class="team__logo" 
             src="${homeTeam.logo}" 
             alt="${homeTeam.name}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><text y=%2260%22 font-size=%2260%22>⚽</text></svg>'">
        <span class="team__name">${homeTeam.name}</span>
      </div>

      ${scoreHtml}

      <div class="team team--away">
        <img class="team__logo" 
             src="${awayTeam.logo}" 
             alt="${awayTeam.name}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><text y=%2260%22 font-size=%2260%22>⚽</text></svg>'">
        <span class="team__name">${awayTeam.name}</span>
      </div>
    </div>

    <div class="match-card__footer">
      ${anchorsHtml}
      ${watchBtn}
    </div>
  `;

  // Event listeners
  card.addEventListener('click', () => openMatch(match));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMatch(match);
    }
  });

  // Watch button click
  const btn = card.querySelector('.watch-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMatch(match);
    });
  }

  return card;
}

/**
 * Navigate to the player page with the match data
 */
function openMatch(match) {
  // Store match data in sessionStorage for the player page
  sessionStorage.setItem('currentMatch', JSON.stringify(match));
  window.location.href = 'player.html';
}

/**
 * Focus a card by index
 */
function focusCard(index) {
  const cards = document.querySelectorAll('.match-card');
  if (!cards.length) return;

  const clampedIndex = Math.max(0, Math.min(index, cards.length - 1));
  focusedIndex = clampedIndex;

  cards.forEach((card, i) => {
    card.classList.toggle('focused', i === clampedIndex);
  });

  cards[clampedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Setup D-pad / keyboard navigation
 */
function setupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    const cards = document.querySelectorAll('.match-card');
    if (!cards.length) return;

    // Calculate grid columns
    const grid = document.querySelector('.matches-grid');
    if (!grid) return;

    const gridStyle = window.getComputedStyle(grid);
    const cols = gridStyle.gridTemplateColumns.split(' ').length;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusCard(focusedIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusCard(focusedIndex - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusCard(focusedIndex + cols);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusCard(focusedIndex - cols);
        break;
      case 'Enter':
        e.preventDefault();
        if (cards[focusedIndex]) {
          const matchId = cards[focusedIndex].dataset.matchId;
          const match = allMatches.find(m => m.id === matchId);
          if (match) openMatch(match);
        }
        break;
      case '1':
        setFilter('live'); break;
      case '2':
        setFilter('upcoming'); break;
      case '3':
        setFilter('ended'); break;
    }
  });
}

/**
 * Update the clock in the header
 */
function updateClock() {
  const el = document.getElementById('header-time');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initMatches);
