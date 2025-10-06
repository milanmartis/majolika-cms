const buckets = new Map();
function limit(key, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key) || [];
  const fresh = b.filter((t) => now - t < windowMs);
  fresh.push(now);
  buckets.set(key, fresh);
  return fresh.length <= max;
}
export default { limit };