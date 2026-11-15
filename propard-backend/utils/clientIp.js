const net = require('net');

function getClientIp(req) {
  const cloudflareIp = req.get('cf-connecting-ip');
  if (typeof cloudflareIp === 'string') {
    const normalized = cloudflareIp.trim();
    if (net.isIP(normalized)) return normalized;
  }

  const fallbackIp = req.ip;
  return typeof fallbackIp === 'string' && net.isIP(fallbackIp) ? fallbackIp : null;
}

module.exports = { getClientIp };
