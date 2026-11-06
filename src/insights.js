// What the line's history says about the line: where work flows back, why, and how
// long features wait on people. Pure functions over feature data, shared by
// `buildline insights`, `status`, `watch` and the dashboard. Nothing here writes.
import { STATIONS, DROPPED, CAUSES, isReturn } from './features.js';

export const TRACK = ['spec', 'design', 'plan', 'build', 'verify', 'review', 'ship'];
const APPROVED = /^(spec|design|plan|sensitive) approved by/;
const idx = (s) => (s === DROPPED ? -1 : STATIONS.indexOf(s));
const ms = (iso) => new Date(iso).getTime();

/**
 * Every station change in a feature's history, oldest first: { from, to, at, cause, back }.
 * New entries carry `from`; older ones are inferred, skipping approvals, which are
 * recorded under the approved stage's name rather than the feature's station.
 */
export function transitions(feature) {
  const out = [];
  let cur = feature.type === 'fix' ? 'build' : 'spec'; // where create() puts a feature
  for (const h of feature.history || []) {
    const to = h.station;
    if (h.from) {
      out.push({ from: h.from, to, at: h.at, cause: h.cause || null });
      cur = to;
      continue;
    }
    if (to === 'new' || to === cur || (APPROVED.test(h.note || '') && !/moved to/.test(h.note || ''))) continue;
    if (!STATIONS.includes(to) && to !== DROPPED) continue; // logs, blocks and approvals under other names
    out.push({ from: cur, to, at: h.at, cause: h.cause || null });
    cur = to;
  }
  return out.map((t) => ({ ...t, back: t.from !== DROPPED && t.to !== DROPPED && idx(t.to) >= 0 && idx(t.to) < idx(t.from) }));
}

/**
 * Per station: how often work arrived, went on, and was sent back, and where to.
 * { station, entered, forward, back, backTo: { build: 3 }, returned } where `returned`
 * counts work sent back *into* this station from later ones.
 */
export function flow(features) {
  const rows = Object.fromEntries(TRACK.map((s) => [s, { station: s, entered: 0, forward: 0, back: 0, backTo: {}, returned: 0 }]));
  for (const f of features) {
    // A feature starts at its first station without a history entry for it.
    const first = rows[f.type === 'fix' ? 'build' : 'spec'];
    if (first) first.entered++;
    for (const t of transitions(f)) {
      if (rows[t.to] && t.from !== DROPPED) rows[t.to].entered++;
      const r = rows[t.from];
      if (!r || t.to === DROPPED) continue;
      if (t.back) {
        r.back++;
        r.backTo[t.to] = (r.backTo[t.to] || 0) + 1;
        if (rows[t.to]) rows[t.to].returned++;
      } else r.forward++;
    }
  }
  return TRACK.map((s) => rows[s]);
}

/** Why work came back from verify and review: [{ cause, count, meaning }], biggest first, plus returns with no cause recorded. */
export function causes(features) {
  const counts = {};
  let unknown = 0;
  for (const f of features) {
    for (const t of transitions(f)) {
      if (!isReturn(t.from, t.to)) continue;
      if (t.cause) counts[t.cause] = (counts[t.cause] || 0) + 1;
      else unknown++;
    }
  }
  const list = Object.entries(counts).map(([cause, count]) => ({ cause, count, meaning: CAUSES[cause] || '' })).sort((a, b) => b.count - a.count);
  return Object.assign(list, { unknown, total: list.reduce((n, c) => n + c.count, 0) + unknown });
}

// What to look at when a cause keeps coming up. Buildline proposes; a person decides.
export const REMEDY = {
  spec: 'Specs miss cases. Ask the spec critic before approving, and add the kind of case that keeps slipping to the spec template or principles.md.',
  design: 'Designs miss states or edges. Fill in "Edge behaviour" in the design, and have the design reviewer check it.',
  plan: 'Plans leave things out. Read the try run before approving a plan; keep tasks small enough to verify one by one.',
  process: 'Problems a check could catch reach verify or review. Add a gate (buildline.json → gates) or a line to REVIEW.md.',
  code: 'The spec and design held up; the code didn\'t. Look at the build station\'s test-first step and REVIEW.md\'s "Always flag".',
};

/** Merge [start, end] intervals and add up their length. */
function covered(intervals) {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let [s, e] = [null, null];
  for (const [a, b] of sorted) {
    if (s == null || a > e) {
      if (s != null) total += e - s;
      [s, e] = [a, b];
    } else e = Math.max(e, b);
  }
  return s == null ? total : total + (e - s);
}

/**
 * How long a feature has waited on people, against its whole time on the line.
 * People time: blocked spans, the gap before each approval (work was ready, nobody
 * had said yes), the wait for a merge at ship, and, when `waitingNow`, the time since
 * the last thing happened. It is an estimate from history: idle agent time looks
 * the same as a person reading. { total, people, parts: { blocked, approvals, merge, now } }
 */
export function waits(feature, { at = Date.now(), waitingNow = false } = {}) {
  const h = (feature.history || []).filter((e) => e.at);
  const start = ms(feature.created || h[0]?.at || at);
  const end = feature.status === 'done' ? ms(feature.metrics?.shippedAt || h.at(-1)?.at || at) : feature.status === DROPPED ? ms(feature.dropped?.at || h.at(-1)?.at || at) : at;
  const parts = { blocked: [], approvals: [], merge: [], now: [] };
  const moves = new Set(transitions(feature).map((t) => t.at));
  let blockedSince = null;
  h.forEach((e, i) => {
    const t = ms(e.at);
    const note = e.note || '';
    if (blockedSince != null && (/^Unblocked/.test(note) || moves.has(e.at) || /^Dropped/.test(note))) {
      parts.blocked.push([blockedSince, t]);
      blockedSince = null;
    }
    if (/^Blocked:/.test(note)) blockedSince ??= t;
    if (APPROVED.test(note) && i > 0) parts.approvals.push([ms(h[i - 1].at), t]);
    if (e.station === 'done' && moves.has(e.at) && i > 0 && (e.from || 'ship') === 'ship') parts.merge.push([ms(h[i - 1].at), t]);
  });
  if (blockedSince != null) parts.blocked.push([blockedSince, end]);
  if (waitingNow && !['done', DROPPED].includes(feature.status) && h.length) parts.now.push([ms(h.at(-1).at), end]);
  const sum = (list) => covered(list.map(([a, b]) => [Math.max(a, start), Math.min(b, end)]));
  return {
    total: Math.max(0, end - start),
    people: sum(Object.values(parts).flat()),
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, sum(v)])),
  };
}

/** How many times verify or review sent this feature back: recorded causes, or older rework counts. */
export const returnsOf = (f) => Math.max(f.metrics?.reworks || 0, Object.values(f.metrics?.causes || {}).reduce((n, x) => n + x, 0));

/** Is the feature waiting on a person right now? `next` is nextAction's answer, `live` liveState's. */
export const waitingOnPeople = (feature, next, live) => Boolean(feature.blocked || live?.waiting || (next?.cmd && /^buildline approve /.test(next.cmd)));

/** 3d4h, 2h10m, 12m, 40s. */
export function span(msec) {
  const m = Math.floor(msec / 60e3);
  if (m < 1) return `${Math.max(0, Math.round(msec / 1000))}s`;
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `${hrs}h${m % 60 ? `${m % 60}m` : ''}`;
  return `${Math.floor(hrs / 24)}d${hrs % 24 ? `${hrs % 24}h` : ''}`;
}
