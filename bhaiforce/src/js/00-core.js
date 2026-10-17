'use strict';
/* =============================================================================
 * BHAIFORCE — core: constants, math helpers, seeded RNG, colour helpers and
 * persistence. Every file in src/js shares one scope (build.mjs concatenates
 * them inside a single IIFE), so top-level names here are visible everywhere.
 * ========================================================================== */

const TILE = 16;          // world tile size, in game pixels
let VIEW_H = 270;         // internal render height (game pixels); zooms in on short phone screens
let VIEW_W = 480;         // internal render width; follows the screen's aspect
const GRAVITY = 980;      // px/s²
const MAX_FALL = 500;     // terminal fall speed, px/s

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/** Deterministic PRNG (mulberry32): each mission's layout is identical on every run. */
class RNG {
  constructor(seed) { this.s = seed >>> 0; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(a + this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  /** Weighted pick from { key: weight } */
  weighted(table) {
    let total = 0;
    for (const k in table) total += table[k];
    let r = this.next() * total;
    for (const k in table) { r -= table[k]; if (r <= 0) return k; }
    return Object.keys(table)[0];
  }
}

/** Integer hash used for stable per-tile texture variants. */
const hash2 = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/* ---------------------------------------------------------------- colour -- */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
/** Multiply a colour's channels: f < 1 darkens, f > 1 brightens. */
function shade(hex, f) { const [r, g, b] = hexToRgb(hex); return toHex(r * f, g * f, b * f); }
function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return toHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/* ----------------------------------------------------------- persistence -- */
/** localStorage can be missing or throw (private mode, sandboxed previews). */
const Store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('bhaiforce:' + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem('bhaiforce:' + key, JSON.stringify(value)); } catch { /* ignore */ } },
};

const DEFAULT_SETTINGS = {
  music: 0.6, sfx: 0.85, voice: true, vibrate: true, shake: true,
  touch: 'auto', btnScale: 1, difficulty: 'bhai', hints: true,
};
const Settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('settings', {}));
const saveSettings = () => Store.set('settings', Settings);

const Progress = Object.assign({ unlocked: 1, best: {}, stars: {}, rescued: 0 }, Store.get('progress', {}));
const saveProgress = () => Store.set('progress', Progress);

/** Hits a bhai can take before going down, per difficulty. */
const DIFFICULTY = {
  chill: { label: 'Chill', hp: 3, enemyDmg: 1, reaction: 1.25 },
  bhai: { label: 'Bhai', hp: 2, enemyDmg: 1, reaction: 1 },
  khatarnaak: { label: 'Khatarnaak', hp: 1, enemyDmg: 1, reaction: 0.8 },
};

const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 ||
  (window.matchMedia && matchMedia('(pointer: coarse)').matches);

function vibrate(pattern) {
  if (!Settings.vibrate) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
}

/** Bilingual line: shown in Hinglish, spoken in Devanagari when a Hindi voice exists. */
const L = (en, hi) => ({ en, hi });
