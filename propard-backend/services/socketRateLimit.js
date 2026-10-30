function createSocketRateLimiter() {
  const buckets = new Map();

  function allow(userId, event, max, windowMs, now = Date.now()) {
    if (!userId || !event || !Number.isInteger(max) || max < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
      return false;
    }

    const key = `${userId}:${event}`;
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0, windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= max) return false;

    bucket.count += 1;
    return true;
  }

  function cleanup(now = Date.now()) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.start >= bucket.windowMs) {
        buckets.delete(key);
      }
    }
  }

  return { allow, cleanup };
}

module.exports = { createSocketRateLimiter };
