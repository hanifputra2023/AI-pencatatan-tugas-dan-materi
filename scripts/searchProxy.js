/**
 * Real-Time Web Search Proxy Server (Zero-Dependency)
 * Serves live web search data to the frontend bypassing browser CORS limitations.
 */
const http = require('http');
const url = require('url');

const PORT = 3005;

function sendCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const server = http.createServer(async (req, res) => {
  sendCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/search' || parsedUrl.pathname === '/api/search') {
    const rawQuery = (parsedUrl.query.q || '').toString().trim();
    const query = rawQuery || 'berita terbaru hari ini';

    try {
      const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const upstreamRes = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!upstreamRes.ok) {
        res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, items: [], error: 'Upstream returned ' + upstreamRes.status }));
        return;
      }

      const xml = await upstreamRes.text();
      const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);

      const items = [];
      for (const m of itemMatches) {
        const itemXml = m[1];
        const title = (itemXml.match(/<title>(.*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';
        const link = (itemXml.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        const pubDate = (itemXml.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        const source = (itemXml.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
        if (title) {
          items.push({ title, link, pubDate, source });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, items }));
    } catch (err) {
      console.error('[SearchProxy Error]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, items: [], error: err.message }));
    }
    return;
  }

  // Health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[SearchProxy] Live Web Search Proxy running on http://127.0.0.1:${PORT}`);
});
