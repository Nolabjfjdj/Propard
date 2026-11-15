const net = require('net');

function getClientIp(req) {
  const cloudflareIpv6 = req.get('cf-connecting-ipv6');
  if (typeof cloudflareIpv6 === 'string') {
    const normalized = cloudflareIpv6.trim();
    if (net.isIP(normalized) === 6) return normalized;
  }

  const cloudflareIp = req.get('cf-connecting-ip');
  if (typeof cloudflareIp === 'string') {
    const normalized = cloudflareIp.trim();
    if (net.isIP(normalized)) return normalized;
  }

  const fallbackIp = req.ip;
  return typeof fallbackIp === 'string' && net.isIP(fallbackIp) ? fallbackIp : null;
}

module.exports = { getClientIp };
