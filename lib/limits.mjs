// Usage limits for the public demo. Every plan spends Claude credit and Qloo quota, so a public
// link needs a ceiling. Counters live in memory: a restart resets them, which is fine for a demo.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Defaults only bite on the published server (NODE_ENV=production, set by the Dockerfile);
// on your own computer you can build as many plans as you like.
const isProduction = process.env.NODE_ENV === "production";

export function createLimiter({
  perHour = Number(process.env.RATE_LIMIT_PER_HOUR) || (isProduction ? 6 : 1000),
  perDay = Number(process.env.DAILY_PLAN_LIMIT) || (isProduction ? 150 : 100000),
  now = () => Date.now(),
} = {}) {
  const visitors = new Map(); // ip -> timestamps of plans in the last hour
  let day = { start: now(), count: 0 };

  const prune = (ip) => {
    const cutoff = now() - HOUR;
    const recent = (visitors.get(ip) ?? []).filter((t) => t > cutoff);
    if (recent.length) visitors.set(ip, recent);
    else visitors.delete(ip);
    return recent;
  };

  return {
    /** Reserves one plan. Returns { ok: true, release } or { ok: false, reason, retryInMinutes }. */
    take(ip) {
      if (now() - day.start >= DAY) day = { start: now(), count: 0 };
      if (day.count >= perDay) {
        return { ok: false, reason: "daily", retryInMinutes: Math.ceil((day.start + DAY - now()) / 60000) };
      }
      const recent = prune(ip);
      if (recent.length >= perHour) {
        return { ok: false, reason: "hourly", retryInMinutes: Math.max(1, Math.ceil((recent[0] + HOUR - now()) / 60000)) };
      }
      const stamp = now();
      visitors.set(ip, [...recent, stamp]);
      day.count += 1;
      let released = false;
      return {
        ok: true,
        // Gives the plan back, e.g. when the run stopped to ask which reference was meant.
        release() {
          if (released) return;
          released = true;
          day.count = Math.max(0, day.count - 1);
          const list = visitors.get(ip) ?? [];
          const i = list.indexOf(stamp);
          if (i !== -1) list.splice(i, 1);
        },
      };
    },
    stats: () => ({ today: day.count, perDay, perHour }),
  };
}
