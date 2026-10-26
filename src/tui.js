// `buildline watch`: a live, full-screen view of the line in the terminal.
// Every feature is a track running through the stations; the dot shows where it
// is, a moving comet means an agent can work on it, a blinking dot means it waits
// on a person. Zero dependencies beyond picocolors: raw ANSI on a cell canvas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { listFeatures, nextAction, approve, readSessions, readActivity, liveState, attention, newAttention } from './features.js';
import { chime, soundOn } from './sound.js';
import { modelFor, describeModel } from './models.js';
import { AUTONOMY, VERSION } from './install.js';

const TRACK = ['spec', 'design', 'plan', 'build', 'verify', 'review', 'ship'];
const LOGO = ['┌┐ ┬ ┬┬┬  ┌┬┐┬  ┬┌┐┌┌─┐', '├┴┐│ │││   ││││  ││││├┤ ', '└─┘└─┘┴┴─┘─┴┘┴─┘┴┘└┘└─┘'];
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const SPARK = ' ▁▂▃▄▅▆▇█';

// ---- colour ------------------------------------------------------------------

const TRUECOLOR = /truecolor|24bit/i.test(process.env.COLORTERM || '') || /iTerm|WezTerm|vscode|ghostty/i.test(process.env.TERM_PROGRAM || '');
const to256 = (r, g, b) => 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);
function fg(hex, { bold = false } = {}) {
  if (!pc.isColorSupported) return bold ? (s) => s : null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const open = (bold ? '\x1b[1m' : '') + (TRUECOLOR ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${to256(r, g, b)}m`);
  const close = '\x1b[39m' + (bold ? '\x1b[22m' : '');
  return (s) => open + s + close;
}
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

const C = {
  text: fg('#d6d3cd'),
  bold: fg('#f2efe9', { bold: true }),
  muted: fg('#8a867e'),
  faint: fg('#4a4741'),
  border: fg('#5d5a54'),
  amber: fg('#e5a400'),
  amberBold: fg('#ffc233', { bold: true }),
  amberHot: fg('#ffd76a'),
  amberDim: fg('#8a6a1a'),
  green: fg('#4ec27f'),
  red: fg('#f7768e'),
  cyan: fg('#59c2e6'),
  flash: pc.isColorSupported ? (s) => `\x1b[48;5;94m\x1b[38;5;230m${s}\x1b[39m\x1b[49m` : null,
};
const WHO = {
  pm: { label: 'PM', color: fg('#d58bf0') },
  designer: { label: 'DESIGN', color: fg('#7aa2f7') },
  eng: { label: 'ENG', color: fg('#59c2e6') },
  agent: { label: 'AGENT', color: C.amber },
  human: { label: 'BLOCKED', color: C.red },
};
const LOGO_COLORS = Array.from({ length: LOGO[0].length }, (_, i) => fg(mix('#ffd76a', '#e07a00', i / (LOGO[0].length - 1)), { bold: true }));

// ---- canvas ------------------------------------------------------------------

class Line {
  constructor(width) {
    this.w = width;
    this.ch = Array(width).fill(' ');
    this.st = Array(width).fill(null);
  }
  /** Write text from column x (clipped to `max`), return the column after it. */
  put(x, text, style = null, max = this.w) {
    for (const c of String(text)) {
      if (x >= Math.min(max, this.w)) break;
      if (x >= 0) (this.ch[x] = c), (this.st[x] = style);
      x++;
    }
    return x;
  }
  toString() {
    let out = '';
    let run = '';
    let cur = null;
    for (let i = 0; i < this.w; i++) {
      if (this.st[i] !== cur) (out += cur ? cur(run) : run), (run = ''), (cur = this.st[i]);
      run += this.ch[i];
    }
    return out + (cur ? cur(run) : run);
  }
}

const clip = (s, n) => {
  const chars = [...String(s ?? '')];
  return chars.length > n ? chars.slice(0, Math.max(0, n - 1)).join('') + '…' : chars.join('');
};

function box(screen, x, y, w, h, title, { accent = false } = {}) {
  if (w < 4 || h < 2) return;
  const b = accent ? C.amberDim : C.border;
  screen[y].put(x, '╭' + '─'.repeat(w - 2) + '╮', b);
  for (let r = y + 1; r < y + h - 1; r++) screen[r].put(x, '│', b), screen[r].put(x + w - 1, '│', b);
  screen[y + h - 1].put(x, '╰' + '─'.repeat(w - 2) + '╯', b);
  if (title) {
    screen[y].put(x + 2, ' ' + title + ' ', C.amberBold, x + w - 2);
  }
}

// ---- data --------------------------------------------------------------------

function loadState(root, showShipped) {
  const config = JSON.parse(fs.readFileSync(path.join(root, '.buildline', 'buildline.json'), 'utf8'));
  const all = listFeatures(root);
  const sessions = readSessions(root);
  const features = all
    .filter((f) => showShipped || f.status !== 'done')
    .map((f) => ({ ...f, next: nextAction(f, config.autonomy), live: liveState(f, sessions) }));
  // Station history plus the live tool feed from running sessions, in time order.
  const tools = readActivity(root).map((a) => ({ at: a.at, id: a.feature, station: a.tool, note: a.detail, tool: true, key: `t|${a.at}|${a.session}|${a.detail}` }));
  const events = all
    .flatMap((f) => (f.history || []).map((h) => ({ ...h, id: f.id, key: `${f.id}|${h.at}|${h.note}` })))
    .concat(tools)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const needs = new Map(all.map((f) => [f.id, attention(f, liveState(f, sessions))]));
  return { config, all, features, events, sessions, needs };
}

const stationIndex = (status) => (status === 'new' ? 0 : status === 'done' ? TRACK.length : TRACK.indexOf(status));
const shortModel = (config, station) => {
  const m = modelFor(config, station);
  return m.cli === 'claude' && !m.model ? 'session' : describeModel(m).replace(/^claude-/, '');
};
const ago = (ms) => (ms < 60e3 ? `${Math.max(1, Math.round(ms / 1000))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)}m` : `${Math.round(ms / 3600e3)}h`);

/** The NEXT UP cell: who or what the feature is waiting on right now. */
function rowStatus(f, t) {
  if (f.blocked) return ['BLOCKED', C.red];
  if (f.live.working) {
    const n = f.live.sessions.filter((x) => x.state === 'working').length;
    return [`${SPINNER[t % SPINNER.length]} ${n > 1 ? `×${n} ` : ''}WORKING`, C.amberBold];
  }
  if (f.live.waiting) return ['NEEDS YOU', t % 12 < 8 ? C.red : C.faint];
  if (f.next.who === 'agent') return ['AGENT', C.amberDim];
  const who = WHO[f.next.who];
  return who ? [who.label, who.color] : ['', null];
}

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function timeLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '--:--:--';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toTimeString().slice(0, 8) : d.toLocaleDateString('en', { month: 'short', day: '2-digit' }).padEnd(8);
}

function sparkline(events, bins = 12, hours = 24) {
  const now = Date.now();
  const span = (hours * 3600e3) / bins;
  const counts = Array(bins).fill(0);
  for (const e of events) {
    const age = now - new Date(e.at);
    if (age >= 0 && age < hours * 3600e3) counts[bins - 1 - Math.floor(age / span)]++;
  }
  const max = Math.max(1, ...counts);
  return counts.map((c) => SPARK[c ? Math.max(1, Math.round((c / max) * (SPARK.length - 1))) : 0]).join('');
}

// ---- drawing -----------------------------------------------------------------

function drawTrack(line, x, f, seg, t) {
  const cur = stationIndex(f.status);
  const who = WHO[f.next.who];
  const skipped = (i) => f.type === 'fix' && i < 3 && cur >= 3;
  // The comet only runs while a session is actually working on this feature.
  const working = f.live?.working && !f.blocked;
  const idleAgent = f.next.who === 'agent' && !f.blocked && !f.live?.waiting;
  for (let i = 0; i < TRACK.length; i++) {
    const nx = x + i * seg;
    let node = ['○', C.faint];
    if (skipped(i)) node = ['·', C.faint];
    else if (i < cur) node = ['●', C.green];
    else if (i === cur && f.blocked) node = ['✖', t % 10 < 5 ? C.red : C.faint];
    else if (i === cur && working) node = [['◉', '◎', '◉', '●'][Math.floor(t / 3) % 4], C.amberBold];
    else if (i === cur && f.live?.waiting) node = ['◉', t % 12 < 8 ? C.red : C.faint];
    else if (i === cur && idleAgent) node = ['◉', C.amberDim];
    else if (i === cur) node = ['◉', t % 12 < 8 ? who?.color || C.amber : C.faint];
    line.put(nx, node[0], node[1]);
    if (i === TRACK.length - 1) break;
    const len = seg - 1;
    const head = ((t + hash(f.id)) % (len + 5)) - 1;
    for (let k = 0; k < len; k++) {
      let cell = ['─', C.faint];
      if (skipped(i)) cell = ['┄', C.faint];
      else if (i < cur) cell = ['━', C.green];
      else if (i === cur && working) {
        const d = head - k;
        cell = d === 0 ? ['━', C.amberHot] : d === 1 ? ['━', C.amber] : d === 2 ? ['━', C.amberDim] : ['─', C.faint];
      } else if (i === cur) cell = ['┈', C.border];
      line.put(nx + 1 + k, cell[0], cell[1]);
    }
  }
  if (cur === TRACK.length) line.put(x + (TRACK.length - 1) * seg + 2, '✔', C.green);
}

function render(st, ui, W, H) {
  const { config, features, events } = st;
  const t = ui.tick;
  const screen = Array.from({ length: H }, () => new Line(W));
  if (W < 60 || H < 14) {
    const msg = `make the terminal at least 60×14 (now ${W}×${H})`;
    screen[Math.floor(H / 2)].put(Math.max(0, Math.floor((W - msg.length) / 2)), msg, C.amber);
    return screen;
  }
  const active = st.all.filter((f) => f.status !== 'done');
  const shipped = st.all.length - active.length;
  const tasks = active.flatMap((f) => f.tasks || []);
  const waiting = features.filter((f) => f.status !== 'done' && !f.live.working && (f.live.waiting || ['pm', 'designer', 'eng', 'human'].includes(f.next.who))).length;
  const sessionsWorking = st.sessions.filter((x) => x.state === 'working').length;

  // header
  const tall = W >= 96 && H >= 26;
  const live = `${SPINNER[t % SPINNER.length]} LIVE ${new Date().toTimeString().slice(0, 8)}`;
  if (tall) {
    LOGO.forEach((row, r) => [...row].forEach((c, i) => screen[r].put(2 + i, c, LOGO_COLORS[i])));
    screen[2].put(2 + LOGO[0].length + 1, `v${VERSION}`, C.muted);
    const right = (r, parts) => {
      const width = parts.reduce((n, [s]) => n + [...s].length, 0);
      let x = W - 2 - width;
      for (const [s, style] of parts) x = screen[r].put(x, s, style);
    };
    right(0, [[config.project || path.basename(ui.root), C.bold], ['  ·  ', C.faint], [AUTONOMY[config.autonomy]?.label || `L${config.autonomy}`, C.amber], ['  ·  ', C.faint], [live, C.green]]);
    right(1, [
      ['ACTIVE ', C.muted], [String(active.length), C.bold], ['   SHIPPED ', C.muted], [String(shipped), C.green],
      ['   SESSIONS ', C.muted], [String(sessionsWorking), sessionsWorking ? C.amberBold : C.bold],
      ['   TASKS ', C.muted], [`${tasks.filter((x) => x.passes).length}/${tasks.length}`, C.bold],
      ['   WAITING ON PEOPLE ', C.muted], [String(waiting), waiting ? WHO.pm.color : C.bold],
    ]);
    right(2, [['24h activity ', C.muted], [sparkline(events), C.amber]]);
  } else {
    let x = screen[0].put(1, ' BUILDLINE ', pc.isColorSupported ? (s) => `\x1b[43m\x1b[30m${s}\x1b[39m\x1b[49m` : null);
    x = screen[0].put(x + 1, config.project || '', C.bold);
    const liveX = W - 1 - [...live].length;
    screen[0].put(x, `  ${active.length} active · ${shipped} shipped · ${waiting} waiting`, C.muted, liveX - 1);
    screen[0].put(liveX, live, C.green);
  }
  const top = tall ? 4 : 2;

  // the line
  const minBottom = 9;
  const lineRows = Math.max(1, features.length);
  const lineH = Math.max(6, Math.min(lineRows + 5, H - top - 1 - minBottom));
  const inner = W - 4;
  const right = Math.min(48, Math.max(30, Math.floor(inner * 0.4)));
  const seg = Math.max(4, Math.min(12, Math.floor((inner - 8 - right) / (TRACK.length - 1))));
  const tx = 2 + 8;
  const rx = tx + seg * (TRACK.length - 1) + 4;
  const SHORT = { spec: 'SPC', design: 'DSN', plan: 'PLN', build: 'BLD', verify: 'VFY', review: 'REV', ship: 'SHP' };
  box(screen, 0, top, W, lineH, 'THE LINE', { accent: true });
  const sel = features[ui.sel];
  const selIdx = sel ? stationIndex(sel.status) : -1;
  TRACK.forEach((s, i) => {
    const nx = tx + i * seg;
    const label = seg >= 8 ? s.toUpperCase() : SHORT[s];
    screen[top + 1].put(nx - Math.floor(label.length / 2), label, i === selIdx ? C.amberBold : C.muted);
    const m = clip(shortModel(config, s), seg - 1);
    if (seg >= 7) screen[top + 2].put(nx - Math.floor(m.length / 2), m, C.faint);
  });
  screen[top + 1].put(rx, 'FEATURE', C.muted);
  screen[top + 1].put(W - 3 - 3, 'NOW', C.muted);
  const rowsAvail = lineH - 5;
  if (ui.sel < ui.scroll) ui.scroll = ui.sel;
  if (ui.sel >= ui.scroll + rowsAvail) ui.scroll = ui.sel - rowsAvail + 1;
  if (!features.length) {
    const line = screen[top + 4];
    drawTrack(line, tx, { id: 'idle', status: 'spec', type: 'feature', next: { who: 'agent' }, live: { working: true, sessions: [] } }, seg, t);
    line.put(rx, 'the line is quiet · ', C.muted);
    line.put(rx + 20, 'npx buildline new "…"', C.amber);
  }
  features.slice(ui.scroll, ui.scroll + rowsAvail).forEach((f, r) => {
    const i = ui.scroll + r;
    const line = screen[top + 4 + r];
    const selected = i === ui.sel;
    const flashing = (ui.flash.get(f.id) || 0) > Date.now();
    line.put(2, selected ? '▸' : ' ', C.amberBold);
    line.put(4, f.id, flashing ? C.flash : selected ? C.amberBold : C.muted);
    drawTrack(line, tx, f, seg, t);
    const [label, labelColor] = rowStatus(f, t);
    const whoW = 12;
    const ts = f.tasks || [];
    const roomy = W - 3 - whoW - rx >= 30;
    const barW = ts.length ? (roomy ? 11 : 5) : 0;
    const titleEnd = W - 3 - whoW - barW - 1;
    line.put(rx, clip(f.title, titleEnd - rx), selected ? C.bold : C.text);
    if (ts.length) {
      const pass = ts.filter((x) => x.passes).length;
      const filled = Math.round((pass / ts.length) * 5);
      let bx = titleEnd + 1;
      if (roomy) bx = line.put(line.put(bx, '▰'.repeat(filled), C.green), '▱'.repeat(5 - filled), C.faint) + 1;
      line.put(bx, `${pass}/${ts.length}`, pass === ts.length ? C.green : C.muted);
    }
    if (label) line.put(W - 3 - [...label].length, label, labelColor);
  });
  if (features.length > rowsAvail) screen[top + lineH - 1].put(W - 16, ` ${ui.sel + 1}/${features.length} `, C.muted);

  // inspector + events
  const by = top + lineH;
  const bh = H - 1 - by;
  if (bh >= 5) {
    const split = W >= 100 ? Math.floor(W * 0.52) : W;
    drawInspector(screen, st, sel, 0, by, split, bh);
    if (split < W) drawEvents(screen, st, ui, split, by, W - split, bh);
  }

  // footer
  const keys = [['↑↓', 'select'], ['⏎', 'open'], ['a', 'approve'], ['u', 'dashboard'], ['s', ui.shipped ? 'hide shipped' : 'shipped'], ['m', ui.sound ? 'mute' : 'unmute'], ['q', 'quit']];
  let fx = 1;
  const foot = screen[H - 1];
  if (ui.message && ui.messageUntil > Date.now()) fx = foot.put(1, ` ${ui.message} `, C.flash);
  else
    for (const [k, label] of keys) {
      if (fx + k.length + label.length + 2 > W - 1) break;
      fx = foot.put(foot.put(fx, k, C.amber) + 1, label, C.muted) + 3;
    }
  const tag = `buildline v${VERSION}`;
  if (fx + tag.length < W - 2) foot.put(W - 2 - tag.length, tag, C.faint);
  return screen;
}

function drawInspector(screen, st, f, x, y, w, h) {
  box(screen, x, y, w, h, f ? `INSPECT ${f.id}` : 'INSPECT');
  if (!f) return;
  const { config } = st;
  const rows = [];
  const add = (...parts) => rows.push(parts);
  const cur = stationIndex(f.status);
  const model = TRACK.includes(f.status) ? describeModel(modelFor(config, f.status)) : '—';
  add([clip(f.title, w - 6), C.bold]);
  add(['type ', C.muted], [f.type.padEnd(9), C.text], ['station ', C.muted], [`${f.status} ${cur >= 0 && cur < TRACK.length ? `(${cur + 1}/${TRACK.length})` : ''}`, C.amber]);
  add(['model ', C.muted], [model, C.text]);
  const appr = ['spec', 'design', 'plan'].map((s) => {
    const a = f.approvals?.[s];
    return a ? [[`${s} ✔ ${a.by}  `, C.green]] : [[`${s} ·  `, C.faint]];
  });
  add(['approvals ', C.muted], ...appr.flat());
  if (f.blocked) {
    const width = Math.max(10, w - 15);
    const words = String(f.blocked).split(/\s+/);
    const lines = [''];
    for (const word of words) (lines.at(-1) + ' ' + word).trim().length > width ? lines.push(word) : (lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim());
    lines.slice(0, 4).forEach((l, i) => add([i ? '           ' : '✖ blocked  ', C.red], [l, C.bold]));
  }
  for (const ses of f.live?.sessions || []) {
    const on = ses.state === 'working';
    add(
      [on ? '● ' : '◌ ', on ? C.amberBold : C.red],
      [`session ${String(ses.id).slice(0, 8)} `, C.muted],
      [`${(ses.model ? String(ses.model) : shortModel(config, f.status)).replace(/^claude-/, '')} `, C.text],
      [on ? `${ses.tool || 'thinking'} ` : 'waiting for your reply ', on ? C.cyan : C.red],
      [on ? `${ses.detail || ''} ` : '', C.text],
      [`· ${ago(ses.age)} ago`, C.faint],
    );
  }
  const ts = f.tasks || [];
  if (ts.length) {
    add();
    add(['tasks', C.muted]);
    const firstOpen = ts.findIndex((x) => !x.passes);
    const room = Math.max(1, h - 2 - rows.length - 3);
    const shown = ts.slice(0, room);
    shown.forEach((task, i) =>
      add(
        [task.passes ? '  ✔ ' : i === firstOpen ? '  ▶ ' : '  · ', task.passes ? C.green : i === firstOpen ? C.amberBold : C.faint],
        [`${task.id || i + 1} `, C.muted],
        [task.title || '', task.passes ? C.text : i === firstOpen ? C.bold : C.muted],
      ),
    );
    if (ts.length > shown.length) add([`  +${ts.length - shown.length} more`, C.faint]);
  }
  add();
  const who = WHO[f.next.who];
  if (f.blocked) add(['next ', C.muted], ['answer the question in the session that asked it', C.text]);
  else add(['next ', C.muted], [who ? who.label + ' ' : '', who?.color || C.text], [f.next.text, C.text]);
  if (f.next.cmd) add(['❯ ', C.amberBold], [f.next.cmd, C.amber]);
  const room = h - 2 - rows.length - 2;
  const journey = (f.history || []).slice(-room);
  if (room > 0 && journey.length) {
    add();
    add(['journey', C.muted]);
    for (const e of journey) add(['  ' + timeLabel(e.at) + ' ', C.faint], [String(e.station || '').padEnd(7), C.muted], [' ' + (e.note || ''), C.text]);
  }
  rows.slice(0, h - 2).forEach((parts, r) => {
    let cx = x + 2;
    for (const [s, style] of parts) cx = screen[y + 1 + r].put(cx, s, style, x + w - 2);
  });
}

function drawEvents(screen, st, ui, x, y, w, h) {
  box(screen, x, y, w, h, 'EVENTS · tail -f');
  const rows = st.events.slice(-(h - 2));
  rows.forEach((e, r) => {
    const line = screen[y + 1 + r];
    const fresh = (ui.freshEvents.get(e.key) || 0) > Date.now();
    let cx = line.put(x + 2, timeLabel(e.at), C.faint);
    cx = line.put(cx + 1, e.id || '···', fresh ? C.flash : C.amber);
    cx = line.put(cx + 1, clip(e.station || '', 7).padEnd(7), e.tool ? C.cyan : C.muted);
    line.put(cx + 1, e.note || '', e.tool ? C.muted : fresh ? C.bold : C.text, x + w - 2);
  });
  if (!rows.length) screen[y + 1].put(x + 2, 'nothing yet', C.faint);
}

// ---- runtime -----------------------------------------------------------------

function whoami(root) {
  const r = spawnSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' });
  return (r.stdout || '').trim() || os.userInfo().username;
}

/** One frame as plain text, for non-interactive output and tests. */
export function snapshot(root, { width = 110, shipped = false } = {}) {
  const st = loadState(root, shipped);
  const height = Math.max(24, 4 + st.features.length + 5 + 16);
  const ui = { root, tick: 0, sel: 0, scroll: 0, flash: new Map(), freshEvents: new Map(), shipped };
  return render(st, ui, width, height).map((l) => l.toString().replace(/\s+$/, '')).join('\n');
}

async function boot(out, st, root) {
  const ok = pc.isColorSupported ? `[  ${pc.green('OK')}  ]` : '[  OK  ]';
  const active = st.all.filter((f) => f.status !== 'done').length;
  const routed = TRACK.filter((s) => st.config.models?.[s]).map((s) => `${s} → ${st.config.models[s]}`);
  const lines = [
    `Mounted ${path.join(path.basename(root), '.buildline')}`,
    `Loaded ${st.all.length} feature${st.all.length === 1 ? '' : 's'} (${active} active, ${st.all.length - active} shipped)`,
    routed.length ? `Routed models: ${routed.slice(0, 4).join(', ')}${routed.length > 4 ? ', …' : ''}` : 'Routed models: every station on the session model',
    `Armed gates: ${(st.config.gates || []).map((g) => g.name).join(', ') || 'none'}`,
    'Started the line.',
  ];
  out.write('\x1b[2J\x1b[H\n');
  for (const l of lines) {
    out.write(`  ${ok} ${l}\r\n`);
    await new Promise((r) => setTimeout(r, 90));
  }
  await new Promise((r) => setTimeout(r, 250));
}

/**
 * Run the live view. Resolves with what the user asked to do on the way out:
 * null, { action: 'step', station, id } or { action: 'ui' }.
 */
export async function watch(root, opts = {}) {
  const out = process.stdout;
  if (!out.isTTY || !process.stdin.isTTY || opts.once) {
    console.log(snapshot(root, { width: out.columns || 110, shipped: opts.shipped }));
    return null;
  }
  const ui = { root, tick: 0, sel: 0, scroll: 0, flash: new Map(), freshEvents: new Map(), shipped: false, message: '', messageUntil: 0 };
  let st = loadState(root, ui.shipped);
  ui.sound = opts.sound !== false && soundOn(st.config);
  let lastStatus = new Map(st.all.map((f) => [f.id, f.status]));
  let seen = new Set(st.events.map((e) => e.key));
  let needs = st.needs;

  out.write('\x1b[?1049h\x1b[?25l');
  if (opts.intro !== false) await boot(out, st, root);

  const refresh = () => {
    try {
      st = loadState(root, ui.shipped);
    } catch {
      return; // a file mid-write; try again next tick
    }
    for (const f of st.all) {
      if (lastStatus.has(f.id) && lastStatus.get(f.id) !== f.status) ui.flash.set(f.id, Date.now() + 2500);
    }
    for (const e of st.events) if (!seen.has(e.key)) ui.freshEvents.set(e.key, Date.now() + 4000);
    if (newAttention(needs, st.needs).length && ui.sound) chime(out);
    needs = st.needs;
    lastStatus = new Map(st.all.map((f) => [f.id, f.status]));
    seen = new Set(st.events.map((e) => e.key));
    ui.sel = Math.max(0, Math.min(ui.sel, st.features.length - 1));
  };
  const draw = () => {
    const W = out.columns || 100;
    const H = out.rows || 30;
    const screen = render(st, ui, W, H);
    out.write(screen.map((l, y) => `\x1b[${y + 1};1H${l}`).join(''));
    ui.tick++;
  };
  const say = (message) => ((ui.message = message), (ui.messageUntil = Date.now() + 3000));

  return new Promise((resolve) => {
    const anim = setInterval(draw, 110);
    const poll = setInterval(refresh, 1000);
    const onResize = () => (out.write('\x1b[2J'), draw());
    const done = (result) => {
      clearInterval(anim);
      clearInterval(poll);
      out.off('resize', onResize);
      process.stdin.off('data', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      out.write('\x1b[?25h\x1b[?1049l');
      resolve(result);
    };
    const onKey = (buf) => {
      const k = buf.toString();
      const f = st.features[ui.sel];
      if (k === 'q' || k === '\x03' || k === '\x1b') return done(null);
      if (k === '\x1b[A' || k === 'k') ui.sel = Math.max(0, ui.sel - 1);
      else if (k === '\x1b[B' || k === 'j') ui.sel = Math.min(st.features.length - 1, ui.sel + 1);
      else if (k === 's') (ui.shipped = !ui.shipped), refresh();
      else if (k === 'm') (ui.sound = !ui.sound), say(ui.sound ? '♪ sound on' : 'sound muted until you quit');
      else if (k === 'u') return done({ action: 'ui' });
      else if ((k === '\r' || k === '\n') && f) {
        if (f.status === 'done') say(`${f.id} has shipped`);
        else return done({ action: 'step', station: TRACK.includes(f.status) ? f.status : 'buildline', id: f.id });
      } else if (k === 'a' && f) {
        const stage = f.next.cmd?.match(/^buildline approve \S+ (\w+)$/)?.[1];
        if (!stage) say(`${f.id} isn't waiting on an approval`);
        else {
          approve(st.all.find((x) => x.id === f.id), stage, whoami(root));
          say(`✔ ${stage} approved for ${f.id}`);
          refresh();
        }
      }
      draw();
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onKey);
    out.on('resize', onResize);
    out.write('\x1b[2J');
    draw();
  });
}
