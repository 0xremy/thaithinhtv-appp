/**
 * Vercel Serverless Function - API Proxy
 * Proxies requests to ColaTV API to avoid CORS issues on TV browsers
 * 
 * Usage: GET /api/matches
 * Returns: JSON match data from api18.colatv88xd.cc
 */

const https = require('https');
const http = require('http');

const UPSTREAM_API = 'https://api18.colatv88xd.cc/api/matches';

module.exports = async (req, res) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(200).end();
    return;
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Add timestamp
  const timestamp = Date.now();
  const targetUrl = `${UPSTREAM_API}?t=${timestamp}`;

  try {
    const data = await fetchUrl(targetUrl);
    res.status(200).send(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({
      error: 'Upstream API error',
      message: err.message,
    });
  }
};

/**
 * Simple HTTP/HTTPS fetch without external dependencies
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (SmartTV; Android 11) THAITHINHTV/1.0',
        'Referer': 'https://cifilter.io/',
        'Origin': 'https://cifilter.io',
      },
      timeout: 15000,
    };

    const reqObj = client.get(url, options, (response) => {
      // Handle redirect
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return fetchUrl(response.headers.location).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve(body));
      response.on('error', reject);
    });

    reqObj.on('timeout', () => {
      reqObj.destroy();
      reject(new Error('Request timeout'));
    });

    reqObj.on('error', reject);
  });
}
