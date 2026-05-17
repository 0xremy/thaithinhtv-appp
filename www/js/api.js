/**
 * THAITHINHTV - API Module
 * Handles all API calls to ColaTV backend
 * - In production (Vercel): uses /api/matches (serverless proxy, no CORS issues)
 * - In local dev: tries direct, then CORS proxies
 */

const UPSTREAM_API = 'https://api18.colatv88xd.cc/api/matches';

// Check if running on Vercel / production (same domain proxy available)
const IS_PRODUCTION = !window.location.hostname.includes('localhost') &&
                      !window.location.hostname.includes('127.0.0.1');

// CORS Proxies for local dev fallback
const CORS_PROXIES = [
  '',  // Try direct first
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
];
let currentProxyIndex = 0;

/**
 * Fetch all current matches
 * @returns {Promise<Match[]>}
 */
async function fetchMatches() {
  try {
    let json;

    if (IS_PRODUCTION) {
      // Use server-side proxy (no CORS issue)
      const response = await fetch('/api/matches', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
      json = await response.json();
    } else {
      // Local dev: try direct then CORS proxies
      json = await fetchWithProxyFallback();
    }

    if (json.code !== '0000' && json.status !== 0) {
      throw new Error(`API error: ${json.code}`);
    }

    return normalizeMatches(json.data || {});
  } catch (err) {
    console.error('[API] fetchMatches failed:', err);
    throw err;
  }
}

/**
 * Try fetching with CORS proxy fallback (local dev only)
 */
async function fetchWithProxyFallback() {
  const timestamp = Date.now();
  const url = `${UPSTREAM_API}?t=${timestamp}`;

  for (let i = currentProxyIndex; i < CORS_PROXIES.length; i++) {
    const proxy = CORS_PROXIES[i];
    const fullUrl = proxy ? proxy + encodeURIComponent(url) : url;

    try {
      const response = await fetch(fullUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      currentProxyIndex = i; // Remember working proxy
      return await response.json();
    } catch (err) {
      console.warn(`[API] Proxy ${i} failed:`, err.message);
    }
  }

  throw new Error('Tất cả proxy đều thất bại');
}

/**
 * Normalize raw API data into consistent match objects
 */
function normalizeMatches(data) {
  const matches = [];

  for (const [slug, raw] of Object.entries(data)) {
    const homeScore = raw.homeScore || raw.home_scores || [0];
    const awayScore = raw.awayScore || raw.away_scores || [0];

    // Build stream sources list
    const streams = [];

    // 1. Official video URL (highest priority)
    const officialUrl = raw.videoUrl || raw.video_url;
    if (officialUrl) {
      streams.push({
        id: 'official',
        name: 'Chính thức',
        type: 'official',
        url: officialUrl,
        avatar: null,
        fans: null,
        isOfficial: true,
      });
    }

    // 2. BLV/Anchor streams (sorted by fan count)
    const anchors = (raw.anchorAppointmentVoList || [])
      .sort((a, b) => (b.fansCount || 0) - (a.fansCount || 0));

    for (const anchor of anchors) {
      const m3u8 = anchor.playStreamAddress2;
      const flv = anchor.playStreamAddress;

      if (m3u8 || flv) {
        streams.push({
          id: anchor.houseId,
          name: anchor.nickName || `Kênh ${anchor.houseId}`,
          houseName: anchor.houseName || '',
          type: m3u8 ? 'm3u8' : 'flv',
          url: m3u8 || flv,
          urlFallback: m3u8 ? flv : null,
          avatar: anchor.userImage,
          houseImage: anchor.houseImage,
          fans: anchor.fansCount || 0,
          liveStatus: anchor.liveStatus,
          isOfficial: false,
        });
      }
    }

    const match = {
      id: raw.matchId,
      slug: slug,
      sportId: raw.sportId,
      matchTime: raw.matchTime,
      status: normalizeStatus(raw.matchStatus),

      homeTeam: {
        id: raw.homeTeamId,
        name: raw.homeTeamName,
        logo: raw.homeTeamLogo,
        score: homeScore[0] || 0,
        scores: homeScore,
      },
      awayTeam: {
        id: raw.awayTeamId,
        name: raw.awayTeamName,
        logo: raw.awayTeamLogo,
        score: awayScore[0] || 0,
        scores: awayScore,
      },

      competition: {
        id: raw.competitionId,
        name: raw.competitionName,
        logo: raw.competitionLogo,
      },

      streams,
      animationUrl: raw.animationUrl || raw.animation_url,
      pinHotAnchor: raw.pin_hot_anchor,
      customKey: raw.custom_key,
    };

    matches.push(match);
  }

  // Sort: live first, then upcoming (by time), then ended
  return matches.sort((a, b) => {
    const order = { live: 0, upcoming: 1, ended: 2 };
    const oa = order[a.status] ?? 3;
    const ob = order[b.status] ?? 3;
    if (oa !== ob) return oa - ob;
    return a.matchTime - b.matchTime;
  });
}

/**
 * Map matchStatus number to string
 * 1 = upcoming, 2 = live, others = ended
 */
function normalizeStatus(statusCode) {
  if (statusCode === 1) return 'upcoming';
  if (statusCode === 2) return 'live';
  return 'ended';
}

/**
 * Format match time to HH:mm Vietnam time
 */
function formatMatchTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/**
 * Format match date
 */
function formatMatchDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((matchDay - today) / 86400000);

  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Ngày mai';
  if (diffDays === -1) return 'Hôm qua';

  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

// Export
window.ThaiThinhAPI = {
  fetchMatches,
  formatMatchTime,
  formatMatchDate,
};
