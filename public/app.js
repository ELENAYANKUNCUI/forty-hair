const $ = (id) => document.getElementById(id);
const cv = $('cv');
const ctx = cv.getContext('2d');
const stage = $('stage');
const nextCv = $('nextCv');
const nctx = nextCv.getContext('2d');
const scoreEl = $('score');
const hairEl = $('hairText');
const hairFill = $('hairFill');
const hintEl = $('hint');
const dangerTag = $('dangerTag');
const nextBox = $('nextBox');
const brandSeal = $('brandSeal');
const chainOverlay = $('chainOverlay');
const chainGrid = $('chainGrid');
const comboBadge = $('comboBadge');
const comboText = $('comboText');
const kingQuip = $('kingQuip');
const kingQuipText = $('kingQuipText');
const hudPlayer = $('hudPlayer');
const musicBtn = $('music');
const muteBtn = $('mute');
const introEl = $('intro');
const rulesEl = $('rules');
const docEl = $('docOverlay');
const overEl = $('overOverlay');
const winEl = $('winOverlay');
const boardEl = $('boardOverlay');
const playerInput = $('playerName');
const boardNick = $('boardNick');
const boardList = $('boardList');
const boardMeta = $('boardMeta');

const W = 168, H = 248, WALL = 2, DROP_Y = 30, DANGER = 40, G = 720;
const DPR = Math.min(window.devicePixelRatio || 1, 3);
const STORAGE_BOARD = 'fortyHairBoard';
const STORAGE_BEST = 'fortyHairBest';
const STORAGE_NICK = 'fortyHairNick';
const STORAGE_AUDIO = 'fortyHairAudio';
const STORAGE_CLIENT = 'fortyHairClient';
const STORAGE_PLAYER = 'fortyHairPlayer:';
const API_BASE = (window.__FORTY_API_BASE || '').replace(/\/+$/, '');
const ONLINE_API = Boolean(API_BASE) || location.protocol === 'https:';

const TIERS = [
  { r: 7.5, name: '呆毛' },
  { r: 9,   name: '小卷' },
  { r: 11,  name: '中卷' },
  { r: 13,  name: '大波浪' },
  { r: 16,  name: '爆炸头' },
  { r: 19,  name: '及肩发' },
  { r: 23,  name: '及腰发' },
  { r: 27,  name: '拖地长发' },
  { r: 34,  name: '长发国王', final: true }
];
for (const T of TIERS) T.pad = Math.ceil(T.r * 1.4 + 2);

const DOCS = [
  { at: 10, year: '2016', text: '他说只是最近掉得多。', sign: '老周' },
  { at: 20, year: '2019', text: '帽子成了本体，摘下来我们反而不认识。', sign: '阿哲' },
  { at: 30, year: '2023', text: '购物车里出现了生姜洗发水，我们没敢问。', sign: '小林' },
  { at: 40, year: '2026', text: '国王加冕，发量重新上市。', sign: '全体损友' }
];

let pieces = [], parts = [], confetti = [], toasts = [], packets = [];
let aimX = W / 2, curTier = 0, nextTier = 1, canDrop = true, cooldown = 0;
let score = 0, hair = 0, best = 0, dangerT = 0, over = false, won = false, combo = 0, shake = 0;
let gameT = 0, hasDropped = false, soundOn = true, musicOn = true, dragging = false, lastShown = -1;
let started = false, introOpen = true, rulesOpen = false, docOpen = false, boardOpen = false, chainOpen = false;
let debugPause = false, recorded = false, lastRank = 0, currentTitle = '';
let pendingDocs = [], pendingWinAt = 0, nextDocAt = 0;
let playerName = '长发骑士', lastEntryId = '';
let boardRequest = 0, boardPoll = 0;
let docUnlocked = [false, false, false, false];
let chainBuilt = false, lastQuip = 0, quipTimer = null;
let kingImg = new Image();
let kingReady = false;
kingImg.onload = () => {
  kingReady = true;
  sprites = [];
  chainBuilt = false;
  drawNext();
  if (chainOpen) buildChain();
};
kingImg.src = './assets/king-medallion.png';

let sprites = [];
let renderK = 2, spriteRes = 2;
let scaleK = 1, offX = 0, offY = 0;
let actx = null;
let last = performance.now();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function safeParse(raw, fallback) { try { return JSON.parse(raw); } catch (e) { return fallback; } }

function loadBoard() {
  try {
    const value = safeParse(localStorage.getItem(STORAGE_BOARD), []);
    return Array.isArray(value) ? value.filter((e) => e && typeof e.n === 'string' && Number.isFinite(e.s)) : [];
  } catch (e) { return []; }
}
function saveBoard(board) {
  try { localStorage.setItem(STORAGE_BOARD, JSON.stringify(board.slice(0, 50))); } catch (e) {}
}
function createClientId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
function getPlayerId(name = playerName) {
  const key = STORAGE_PLAYER + (name || '长发骑士').slice(0, 8);
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = createClientId();
      localStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return createClientId();
  }
}
function migrateLegacyClientIds() {
  const legacy = (() => {
    try { return localStorage.getItem(STORAGE_CLIENT); } catch (e) { return null; }
  })();
  const board = loadBoard();
  let changed = false;
  for (const entry of board) {
    if (!entry.cid || (legacy && entry.cid === legacy)) {
      entry.cid = getPlayerId(entry.n || '长发骑士');
      changed = true;
    }
  }
  if (changed) saveBoard(board);
  try { if (legacy) localStorage.removeItem(STORAGE_CLIENT); } catch (e) {}
}
function loadBoardForClient() {
  const board = loadBoard();
  let changed = false;
  for (const entry of board) {
    if (!entry.cid) {
      entry.cid = getPlayerId(entry.n || '长发骑士');
      changed = true;
    }
  }
  if (changed) saveBoard(board);
  return board;
}
function localBestEntry() {
  const cid = getPlayerId(playerName);
  return loadBoardForClient()
    .filter((e) => e.cid === cid && (e.s > 0 || (e.h || 0) > 0))
    .sort((a, b) => b.s - a.s || (b.h || 0) - (a.h || 0) || a.d - b.d)[0] || null;
}
async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(API_BASE + path, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || `http_${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
async function submitScore(entry) {
  if (!ONLINE_API || !entry || (entry.s <= 0 && (entry.h || 0) <= 0)) return null;
  const data = await api('/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: entry.cid || getPlayerId(entry.n),
      name: entry.n,
      score: entry.s,
      hair: entry.h || 0,
      title: entry.t || titleFor(entry.s, entry.h || 0)
    })
  });
  if (entry.cid === getPlayerId(playerName) && Number.isFinite(Number(data.rank)) && Number(data.rank) > 0) {
    lastRank = Number(data.rank);
    updateRankLabels();
  }
  return data;
}
async function submitLocalBest() {
  if (!ONLINE_API) return null;
  const entry = localBestEntry();
  return entry ? submitScore(entry) : null;
}
async function syncLocalScores() {
  if (!ONLINE_API) return null;
  const bestByPlayer = new Map();
  for (const entry of loadBoardForClient()) {
    if (entry.s <= 0 && (entry.h || 0) <= 0) continue;
    const prev = bestByPlayer.get(entry.cid);
    if (!prev || entry.s > prev.s || (entry.s === prev.s && (entry.h || 0) > (prev.h || 0))) {
      bestByPlayer.set(entry.cid, entry);
    }
  }
  for (const entry of bestByPlayer.values()) {
    await submitScore(entry).catch(() => null);
  }
  return bestByPlayer.size;
}
function updateRankLabels() {
  const text = lastRank ? `第 ${lastRank} 名` : '—';
  for (const id of ['overRank', 'winRank']) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}
async function fetchLeaderboard() {
  const query = new URLSearchParams({ limit: '10', clientId: getPlayerId(playerName) });
  const data = await api(`/api/leaderboard?${query}`);
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    total: Number(data.total) || 0
  };
}
function loadNick() {
  try {
    const n = localStorage.getItem(STORAGE_NICK);
    return n ? n.slice(0, 8) : '长发骑士';
  } catch (e) { return '长发骑士'; }
}
function saveNick(n) {
  try { localStorage.setItem(STORAGE_NICK, n.slice(0, 8)); } catch (e) {}
}
function loadBest() {
  try { return parseInt(localStorage.getItem(STORAGE_BEST), 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(STORAGE_BEST, String(v)); } catch (e) {}
}
function loadAudioPrefs() {
  try {
    const p = safeParse(localStorage.getItem(STORAGE_AUDIO), null);
    if (p && typeof p.m === 'boolean') musicOn = p.m;
    if (p && typeof p.s === 'boolean') soundOn = p.s;
  } catch (e) {}
}
function saveAudioPrefs() {
  try { localStorage.setItem(STORAGE_AUDIO, JSON.stringify({ m: musicOn, s: soundOn })); } catch (e) {}
}
function updateAudioButtons() {
  musicBtn.textContent = '乐';
  musicBtn.classList.toggle('off', !musicOn);
  musicBtn.setAttribute('aria-pressed', String(musicOn));
  musicBtn.setAttribute('aria-label', musicOn ? '关闭音乐' : '打开音乐');
  muteBtn.textContent = '效';
  muteBtn.classList.toggle('off', !soundOn);
  muteBtn.setAttribute('aria-pressed', String(soundOn));
  muteBtn.setAttribute('aria-label', soundOn ? '关闭音效' : '打开音效');
}

function beep(freq, dur = 0.08, type = 'sine', vol = 0.06, when = 0) {
  if (!soundOn) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + when;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch (e) {}
}

function titleFor(s, h) {
  if (h >= 40 || s >= 3200) return '首席生发官';
  if (s >= 2200) return '财运大总管';
  if (s >= 1300) return '摸头长老';
  if (s >= 650) return '王冠护卫';
  return '加冕功臣';
}

function fit() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  const s = Math.min(w / W, h / H);
  const cw = Math.max(1, Math.floor(W * s)), ch = Math.max(1, Math.floor(H * s));
  cv.width = Math.max(1, Math.round(cw * DPR));
  cv.height = Math.max(1, Math.round(ch * DPR));
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
  offX = Math.floor((w - cw) / 2);
  offY = Math.floor((h - ch) / 2);
  cv.style.left = offX + 'px';
  cv.style.top = offY + 'px';
  scaleK = cw / W;
  const nextK = cv.width / W;
  if (Math.abs(nextK - renderK) > 0.05) {
    renderK = nextK;
    spriteRes = Math.max(2, Math.ceil(renderK));
    sprites = [];
    drawNext();
  }
  if (dangerTag) {
    dangerTag.style.left = (offX + 28 * s) + 'px';
    dangerTag.style.top = (offY + DANGER * s - 8) + 'px';
  }
}

function onViewportChange() {
  fit();
  drawNext();
}

function randTier() {
  const r = Math.random();
  if (r < 0.32) return 0;
  if (r < 0.61) return 1;
  if (r < 0.85) return 2;
  return 3;
}

function newPiece(x, y, t, vx = 0, vy = 0) {
  return { x, y, vx, vy, r: TIERS[t].r, t, age: 0, seed: Math.random() * 6.28, dead: false };
}

function updateComboUI() {
  const on = started && !introOpen && !over && !won && combo >= 2;
  comboBadge.classList.toggle('hidden', !on);
  if (!on) return;
  comboText.textContent = `x${combo}`;
  comboBadge.classList.remove('pulse');
  void comboBadge.offsetWidth;
  comboBadge.classList.add('pulse');
}

const QUIPS = [
  '稳住，这波发量在路上了。',
  '别急，王冠还没掉。',
  '这撮头发，朕封它为大波浪。',
  '财运和发量，总得先来一个。',
  '再合一次，生姜洗发水就退下。',
  '朕的头皮，今天很争气。',
  '谁在薅朕的头发？',
  '帽子先收起来。',
  '发量可以少，气势不能输。',
  '四十不惑，四十而发。'
];

function hideQuip() {
  kingQuip.classList.remove('show');
  clearTimeout(quipTimer);
  quipTimer = setTimeout(() => kingQuip.classList.add('hidden'), 220);
}

function showQuip(text) {
  if (!text) return;
  kingQuipText.textContent = text;
  kingQuip.classList.remove('hidden');
  requestAnimationFrame(() => kingQuip.classList.add('show'));
  clearTimeout(quipTimer);
  quipTimer = setTimeout(() => {
    kingQuip.classList.remove('show');
    quipTimer = setTimeout(() => kingQuip.classList.add('hidden'), 220);
  }, 2600);
}

function maybeQuip(t) {
  if (!started || introOpen || over || won) return;
  if (performance.now() - lastQuip < 4200) return;
  if (combo >= 3 || t >= 5 || Math.random() < 0.3) {
    lastQuip = performance.now();
    showQuip(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
  }
}

function triggerRedPacket(x, y) {
  const bonus = 188 + combo * 12;
  score += bonus;
  packets.push({ x, y, life: 1.45, max: 1.45 });
  addToast(x, y - 28, `红包暴击 +${bonus}`, '#a53c35', true);
  for (let i = 0; i < 34; i += 1) {
    confetti.push({
      x: x + rand(-8, 8), y: y + rand(-8, 8),
      vx: rand(-58, 58), vy: rand(-110, -24),
      w: rand(1.3, 3), h: rand(1.6, 3.4),
      col: ['#a53c35', '#f0d38a', '#c8a14a', '#fff1cc'][Math.floor(Math.random() * 4)],
      life: rand(1.2, 2.2), max: 2.2
    });
  }
  shake = Math.max(shake, 4);
  beep(660, 0.07, 'triangle', 0.06);
  beep(990, 0.09, 'triangle', 0.055, 0.08);
  beep(1320, 0.14, 'triangle', 0.05, 0.17);
}

function buildChain() {
  chainGrid.replaceChildren();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 44;
  TIERS.forEach((T, i) => {
    const item = document.createElement('div');
    item.className = 'chain-item' + (T.final ? ' final' : '');
    item.title = i < TIERS.length - 1 ? `两个${T.name}合成${TIERS[i + 1].name}` : '最终形态';
    const rank = document.createElement('span');
    rank.className = 'chain-rank';
    rank.textContent = String(i + 1);
    const c = document.createElement('canvas');
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const sp = getSprite(i);
    const k = Math.min(size / sp.width, size / sp.height);
    g.drawImage(sp, (size - sp.width * k) / 2, (size - sp.height * k) / 2, sp.width * k, sp.height * k);
    const name = document.createElement('b');
    name.textContent = T.name;
    item.append(rank, c, name);
    chainGrid.append(item);
  });
  chainBuilt = true;
}

function openChain() {
  if (!chainBuilt) buildChain();
  chainOpen = true;
  showOverlay(chainOverlay);
  beep(520, 0.04, 'sine', 0.025);
}

function closeChain() {
  chainOpen = false;
  hideOverlay(chainOverlay);
}

function paused() {
  return !started || introOpen || rulesOpen || docOpen || boardOpen || chainOpen || over || won || debugPause;
}

function updateUI() {
  if (score !== lastShown) {
    lastShown = score;
    scoreEl.textContent = score;
  }
  hairEl.textContent = `${hair}/40`;
  hairFill.style.width = `${clamp(hair / 40, 0, 1) * 100}%`;
  hairFill.style.opacity = hair >= 40 ? '1' : '0.96';
  hudPlayer.textContent = playerName;
}

function reset() {
  pieces = [];
  parts = [];
  confetti = [];
  toasts = [];
  packets = [];
  aimX = W / 2;
  curTier = randTier();
  nextTier = randTier();
  canDrop = true;
  cooldown = 0;
  score = 0;
  hair = 0;
  dangerT = 0;
  over = false;
  won = false;
  combo = 0;
  shake = 0;
  gameT = 0;
  hasDropped = false;
  dragging = false;
  lastShown = -1;
  recorded = false;
  lastRank = 0;
  lastEntryId = '';
  currentTitle = '';
  pendingDocs = [];
  pendingWinAt = 0;
  nextDocAt = 0;
  docUnlocked = [false, false, false, false];
  hintEl.style.opacity = '1';
  updateComboUI();
  hideQuip();
  updateUI();
  drawNext();
}

function moveAim(e) {
  const rect = cv.getBoundingClientRect();
  if (!rect.width) return;
  const x = (e.clientX - rect.left) / rect.width * W;
  const r = TIERS[curTier].r;
  aimX = clamp(x, WALL + r, W - WALL - r);
}

function drop() {
  if (!canDrop || paused()) return;
  pieces.push(newPiece(aimX, DROP_Y, curTier));
  canDrop = false;
  cooldown = 0.5;
  combo = 0;
  updateComboUI();
  hasDropped = true;
  hintEl.style.opacity = '0';
  curTier = nextTier;
  nextTier = randTier();
  const r = TIERS[curTier].r;
  aimX = clamp(aimX, WALL + r, W - WALL - r);
  beep(300, 0.05, 'sine', 0.04);
}

function integrate(h) {
  for (const c of pieces) {
    c.age += h;
    c.vy += G * h;
    if (c.vy > 900) c.vy = 900;
    c.vx *= Math.pow(0.999, h * 240);
    c.x += c.vx * h;
    c.y += c.vy * h;
    if (c.x - c.r < WALL) { c.x = WALL + c.r; if (c.vx < 0) c.vx = -c.vx * 0.25; }
    if (c.x + c.r > W - WALL) { c.x = W - WALL - c.r; if (c.vx > 0) c.vx = -c.vx * 0.25; }
    if (c.y + c.r > H) {
      c.y = H - c.r;
      if (c.vy > 0) c.vy = c.vy < 56 ? 0 : -c.vy * 0.18;
      c.vx *= 0.94;
    }
  }
}

function addHair(n) {
  const before = hair;
  hair = clamp(hair + n, 0, 40);
  for (let i = 0; i < DOCS.length - 1; i += 1) {
    if (before < DOCS[i].at && hair >= DOCS[i].at && !docUnlocked[i]) {
      docUnlocked[i] = true;
      pendingDocs.push(i);
    }
  }
  if (hair >= 40) {
    docUnlocked[3] = true;
    if (!pendingWinAt) pendingWinAt = performance.now() + 900;
  }
  updateUI();
}

function spawnMerge(x, y, t) {
  for (let i = 0; i < 8; i += 1) {
    parts.push({
      type: 'hair', x, y, vx: rand(-34, 34), vy: rand(-62, -14),
      life: rand(0.5, 0.9), max: 0.9, size: rand(1.2, 2.6), rot: rand(0, 6.28)
    });
  }
  for (let i = 0; i < 5 + Math.min(5, t); i += 1) {
    parts.push({
      type: 'coin', x, y, vx: rand(-42, 42), vy: rand(-82, -28),
      life: rand(0.7, 1.15), max: 1.15, size: rand(1.8, 3.4), rot: rand(-1, 1)
    });
  }
}

function doMerge(a, b) {
  const t = a.t;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  combo += 1;
  updateComboUI();
  const comboBonus = Math.min(2, Math.floor((combo - 1) / 3));
  if (t >= TIERS.length - 1) {
    const pts = 800 * combo;
    score += pts;
    addHair(4);
    addToast(x, y - 8, `财运 +${pts}`, '#8f2f26', true);
    addToast(x, y + 12, '发量 +4', '#6b4b1f', true);
    for (let i = 0; i < 80; i += 1) {
      confetti.push({
        x: rand(0, W), y: rand(-70, -5), vx: rand(-34, 34), vy: rand(50, 150),
        w: rand(1, 2.4), h: rand(1, 2.8),
        col: ['#f0d38a', '#c8a14a', '#a53c35', '#f7ead0', '#24375c'][Math.floor(Math.random() * 5)],
        life: rand(2.4, 3.8), max: 3.8
      });
    }
    shake = 7;
    beep(660, 0.08, 'triangle', 0.06);
    beep(880, 0.09, 'triangle', 0.06, 0.09);
    beep(1320, 0.16, 'triangle', 0.06, 0.18);
  } else {
    const nt = t + 1;
    const pts = (nt + 1) * 4 * combo;
    score += pts;
    addHair(1 + comboBonus);
    const nc = newPiece(x, y, nt, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2 - 24);
    nc.age = Math.max(a.age, b.age, 1.5);
    pieces.push(nc);
    addToast(x, y - 7, `财运 +${pts}${combo > 1 ? ` · 发发发 x${combo}` : ''}`, '#8f2f26', nt >= 5);
    addToast(x, y + 11, `发量 +${1 + comboBonus}`, '#6b4b1f', false);
    spawnMerge(x, y, t);
    beep(360 + nt * 34, 0.05, 'triangle', 0.055);
    beep((360 + nt * 34) * 1.45, 0.07, 'triangle', 0.045, 0.05);
    if (nt === TIERS.length - 1) {
      addToast(x, y - 30, '长发国王降临！', '#9b3b2d', true);
      shake = 5;
    }
  }
  if (combo > 0 && combo % 4 === 0) triggerRedPacket(x, y);
  maybeQuip(t);
  if (navigator.vibrate) { try { navigator.vibrate(ntSafe(t)); } catch (e) {} }
}

function ntSafe(t) { return t >= 5 ? 25 : 12; }

function collide() {
  const merges = [];
  const n = pieces.length;
  for (let i = 0; i < n; i += 1) {
    const a = pieces[i];
    if (a.dead) continue;
    for (let j = i + 1; j < n; j += 1) {
      const b = pieces[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const minD = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      if (a.t === b.t) {
        a.dead = true;
        b.dead = true;
        merges.push([a, b]);
        continue;
      }
      const push = (minD - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rvn < 0) {
        const imp = -(1 + 0.12) * rvn / 2;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
      }
    }
  }
  if (merges.length) {
    for (const [a, b] of merges) doMerge(a, b);
    pieces = pieces.filter((c) => !c.dead);
  }
}

function checkDanger(dt) {
  if (hair >= 40) return;
  let danger = false;
  for (const c of pieces) {
    if (c.age < 0.8) continue;
    if (c.y - c.r < DANGER) { danger = true; break; }
  }
  if (danger) {
    dangerT += dt;
    if (dangerT > 1.5) gameOver();
  } else {
    dangerT = Math.max(0, dangerT - dt * 2.5);
  }
}

function addToast(x, y, text, color, big = false) {
  toasts.push({ x, y, text, color, life: 1.05, max: 1.05, big });
}

function updateEffects(dt) {
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 145 * dt;
    p.life -= dt;
  }
  parts = parts.filter((p) => p.life > 0);
  for (const c of confetti) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += 100 * dt;
    c.life -= dt;
  }
  confetti = confetti.filter((c) => c.life > 0 && c.y < H + 12);
  for (const p of packets) {
    p.life -= dt;
    p.y -= 8 * dt;
  }
  packets = packets.filter((p) => p.life > 0);
  for (const t of toasts) {
    t.y -= 17 * dt;
    t.life -= dt;
  }
  toasts = toasts.filter((t) => t.life > 0);
}

function step(now, dt) {
  gameT += dt;
  if (cooldown > 0) { cooldown -= dt; if (cooldown <= 0) canDrop = true; }
  if (shake > 0) shake = Math.max(0, shake - dt * 20);
  updateEffects(dt);
  if (paused()) return;
  if (hair >= 40 && pendingWinAt && now >= pendingWinAt) { winGame(); return; }
  if (pendingDocs.length && now >= nextDocAt) {
    showDoc(pendingDocs.shift());
    nextDocAt = now + 900;
    return;
  }
  const steps = 4;
  const h = Math.min(dt, 0.028) / steps;
  for (let s = 0; s < steps; s += 1) {
    integrate(h);
    collide();
  }
  checkDanger(dt);
  updateUI();
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function drawCrown(g, cx, cy, w, h) {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  g.beginPath();
  g.moveTo(x0, y0 + h);
  g.lineTo(x0, y0 + h * 0.32);
  g.lineTo(x0 + w * 0.25, y0 + h * 0.58);
  g.lineTo(cx, y0);
  g.lineTo(x0 + w * 0.75, y0 + h * 0.58);
  g.lineTo(x0 + w, y0 + h * 0.32);
  g.lineTo(x0 + w, y0 + h);
  g.closePath();
  g.fillStyle = '#d7ad4e';
  g.fill();
  g.strokeStyle = '#674114';
  g.lineWidth = Math.max(0.7, h * 0.075);
  g.stroke();
  g.fillStyle = '#f6df9f';
  g.fillRect(x0 + w * 0.08, y0 + h * 0.72, w * 0.84, h * 0.16);
  g.fillStyle = '#9b3b2d';
  g.beginPath(); g.arc(cx, y0 + h * 0.83, Math.max(0.8, w * 0.055), 0, 6.28); g.fill();
  g.fillStyle = '#3f628d';
  g.beginPath(); g.arc(x0 + w * 0.17, y0 + h * 0.83, Math.max(0.6, w * 0.04), 0, 6.28); g.fill();
}

function drawFace(g, cx, cy, R) {
  const skin = '#e7ba91';
  g.fillStyle = skin;
  g.strokeStyle = '#9b6c4d';
  g.lineWidth = Math.max(0.7, R * 0.035);
  g.beginPath();
  g.ellipse(cx, cy + R * 0.08, R * 0.52, R * 0.6, 0, 0, 6.28);
  g.fill();
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * R * 0.55, cy + R * 0.08, R * 0.12, 0, 6.28);
    g.fillStyle = skin; g.fill(); g.stroke();
  }
  g.fillStyle = '#3b2418';
  const eyeY = cy + R * 0.02;
  const eyeX = R * 0.23;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * eyeX, eyeY, Math.max(0.7, R * 0.045), 0, 6.28);
    g.fill();
  }
  g.strokeStyle = '#4a2b1c';
  g.lineWidth = Math.max(0.65, R * 0.04);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * eyeX, eyeY, R * 0.2, 0, 6.28);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(cx - eyeX + R * 0.2, eyeY);
  g.lineTo(cx + eyeX - R * 0.2, eyeY);
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * eyeX + R * 0.2, eyeY - R * 0.01);
    g.lineTo(cx + s * R * 0.54, eyeY - R * 0.02);
    g.stroke();
  }
  g.fillStyle = '#a36c4f';
  g.beginPath();
  g.ellipse(cx, cy + R * 0.22, R * 0.05, R * 0.08, 0, 0, 6.28);
  g.fill();
  g.strokeStyle = '#8d3f38';
  g.lineWidth = Math.max(0.7, R * 0.032);
  g.beginPath();
  g.arc(cx, cy + R * 0.3, R * 0.13, 0.2, Math.PI - 0.2);
  g.stroke();
}

function drawHairBack(g, cx, cy, R, t) {
  g.fillStyle = '#1b1310';
  g.strokeStyle = '#2b1b12';
  g.lineWidth = Math.max(1, R * 0.055);
  g.beginPath();
  g.arc(cx, cy, R * 0.98, 0, 6.28);
  g.fill();
  g.stroke();
  const n = 8 + t * 2;
  for (let i = 0; i < n; i += 1) {
    const a = i / n * Math.PI * 2 + 0.22 + t * 0.17;
    const rr = R * (0.22 + 0.06 * Math.sin(i * 1.7 + t));
    const bx = cx + Math.cos(a) * R * 0.84;
    const by = cy + Math.sin(a) * R * 0.84;
    g.beginPath();
    g.arc(bx, by, rr, 0, 6.28);
    g.fillStyle = '#1b1310';
    g.fill();
    g.stroke();
  }
  const lockCount = t >= 5 ? 3 : 2;
  for (const s of [-1, 1]) {
    for (let i = 0; i < lockCount; i += 1) {
      const x = cx + s * R * (0.62 + i * 0.09);
      const w = R * (0.2 - i * 0.025);
      g.strokeStyle = i === 0 ? '#2b1b12' : '#1f1712';
      g.lineWidth = Math.max(1, w);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, cy - R * 0.2);
      g.bezierCurveTo(
        x + s * R * 0.2, cy + R * 0.25,
        x + s * R * 0.28, cy + R * 0.55,
        x + s * R * 0.16, cy + R * (0.85 + i * 0.16)
      );
      g.stroke();
    }
  }
}

function drawHairHighlights(g, cx, cy, R, t) {
  g.lineCap = 'round';
  const n = 6 + t;
  for (let i = 0; i < n; i += 1) {
    const a = i / n * Math.PI * 2 + 0.9;
    const x = cx + Math.cos(a) * R * 0.55;
    const y = cy + Math.sin(a) * R * 0.55;
    const len = R * (0.18 + 0.06 * Math.sin(i * 2.3 + t));
    g.strokeStyle = i % 3 === 0 ? '#765435' : '#4b3324';
    g.lineWidth = Math.max(0.6, R * 0.025);
    g.beginPath();
    g.arc(x, y, len, a + 0.4, a + 2.3);
    g.stroke();
  }
  g.strokeStyle = '#9b734c';
  g.lineWidth = Math.max(0.7, R * 0.03);
  g.beginPath();
  g.arc(cx - R * 0.32, cy - R * 0.46, R * 0.28, 3.5, 5.3);
  g.stroke();
}

function drawHairFront(g, cx, cy, R, t) {
  g.fillStyle = '#1b1310';
  g.strokeStyle = '#2b1b12';
  g.lineWidth = Math.max(0.9, R * 0.045);
  const curls = [
    [-0.48, -0.18, -0.18, -0.48],
    [0.48, -0.18, 0.18, -0.48],
    [-0.5, 0.22, -0.2, -0.12],
    [0.5, 0.22, 0.2, -0.12]
  ];
  for (let i = 0; i < curls.length; i += 1) {
    const [ax, ay, bx, by] = curls[i];
    const x = cx + ax * R, y = cy + ay * R;
    const r = R * (0.2 + (i % 2) * 0.03);
    g.beginPath();
    g.arc(x, y, r, 0, 6.28);
    g.fill();
    g.stroke();
    g.strokeStyle = '#4b3324';
    g.lineWidth = Math.max(0.6, R * 0.024);
    g.beginPath();
    g.arc(x, y, r * 0.55, 0.5, 2.8);
    g.stroke();
    g.strokeStyle = '#2b1b12';
    g.lineWidth = Math.max(0.9, R * 0.045);
  }
  g.fillStyle = '#1b1310';
  g.beginPath();
  g.moveTo(cx - R * 0.44, cy - R * 0.33);
  g.quadraticCurveTo(cx, cy - R * 0.72, cx + R * 0.44, cy - R * 0.33);
  g.quadraticCurveTo(cx + R * 0.3, cy - R * 0.5, cx, cy - R * 0.46);
  g.quadraticCurveTo(cx - R * 0.3, cy - R * 0.5, cx - R * 0.44, cy - R * 0.33);
  g.fill();
}

function drawCollar(g, cx, cy, R) {
  g.fillStyle = '#f3e7d1';
  g.strokeStyle = '#c7b28b';
  g.lineWidth = Math.max(0.7, R * 0.03);
  g.beginPath();
  g.ellipse(cx, cy + R * 0.72, R * 0.56, R * 0.2, 0, 0, Math.PI);
  g.fill();
  g.stroke();
  g.strokeStyle = '#b08e57';
  g.lineWidth = Math.max(0.6, R * 0.024);
  for (let i = -2; i <= 2; i += 1) {
    g.beginPath();
    g.arc(cx + i * R * 0.18, cy + R * 0.72, R * 0.12, 0.2, Math.PI - 0.2);
    g.stroke();
  }
}

function buildLowHair(g, cx, cy, R, t) {
  g.fillStyle = '#1b1310';
  g.strokeStyle = '#2b1b12';
  g.lineWidth = Math.max(1, R * 0.07);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const n = t === 0 ? 4 : t === 1 ? 6 : 8;
  g.beginPath();
  g.ellipse(cx, cy + R * 0.06, R * 0.62, R * 0.56, -0.12, 0, 6.28);
  g.fill();
  for (let i = 0; i < n; i += 1) {
    const a = i / n * Math.PI * 2 + 0.4;
    const rr = R * (0.2 + 0.09 * Math.sin(i * 2 + t));
    const x = cx + Math.cos(a) * R * 0.58;
    const y = cy + Math.sin(a) * R * 0.52;
    g.beginPath();
    g.arc(x, y, rr, 0, 6.28);
    g.fill();
    g.stroke();
  }
  g.strokeStyle = '#6b4a2f';
  g.lineWidth = Math.max(0.7, R * 0.055);
  for (let i = 0; i < 3; i += 1) {
    const a = 3.3 + i * 0.42;
    g.beginPath();
    g.arc(cx - R * 0.12, cy - R * 0.04, R * (0.34 + i * 0.06), a, a + 1.3);
    g.stroke();
  }
  g.strokeStyle = '#2b1b12';
  g.lineWidth = Math.max(1.2, R * 0.17);
  g.beginPath();
  g.moveTo(cx - R * 0.12, cy - R * 0.48);
  g.bezierCurveTo(cx + R * 0.18, cy - R * 0.98, cx + R * 0.72, cy - R * 0.9, cx + R * 0.7, cy - R * 0.5);
  g.stroke();
  g.strokeStyle = '#7d5936';
  g.lineWidth = Math.max(0.6, R * 0.04);
  g.beginPath();
  g.moveTo(cx + R * 0.06, cy - R * 0.56);
  g.bezierCurveTo(cx + R * 0.26, cy - R * 0.8, cx + R * 0.52, cy - R * 0.78, cx + R * 0.6, cy - R * 0.55);
  g.stroke();
  g.strokeStyle = '#c8a14a';
  g.lineWidth = Math.max(1, R * 0.075);
  g.beginPath();
  g.moveTo(cx - R * 0.24, cy + R * 0.58);
  g.quadraticCurveTo(cx, cy + R * 0.7, cx + R * 0.24, cy + R * 0.58);
  g.stroke();
  g.lineWidth = Math.max(0.6, R * 0.035);
  g.beginPath();
  g.arc(cx, cy + R * 0.63, R * 0.1, 0, Math.PI);
  g.stroke();
}

function star4(g, x, y, r, color, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = -Math.PI / 2 + i * Math.PI / 4;
    const rr = i % 2 ? r * 0.34 : r;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}

function drawEmblemFrame(g, cx, cy, R) {
  const rim = R * 0.99;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.4)';
  g.shadowBlur = R * 0.2;
  g.shadowOffsetY = R * 0.06;
  g.fillStyle = '#0a1220';
  g.beginPath();
  g.arc(cx, cy, rim, 0, 6.28);
  g.fill();
  g.restore();
  const rg = g.createLinearGradient(cx - rim, cy - rim, cx + rim, cy + rim);
  rg.addColorStop(0, '#fff2c3');
  rg.addColorStop(0.3, '#dfbd70');
  rg.addColorStop(0.62, '#a97c31');
  rg.addColorStop(1, '#f6e2a4');
  g.strokeStyle = rg;
  g.lineWidth = Math.max(1, R * 0.09);
  g.beginPath();
  g.arc(cx, cy, rim - R * 0.045, 0, 6.28);
  g.stroke();
  g.strokeStyle = 'rgba(68,44,15,.8)';
  g.lineWidth = Math.max(0.5, R * 0.025);
  g.beginPath();
  g.arc(cx, cy, rim, 0, 6.28);
  g.stroke();
}

function drawHairCurls(g, cx, cy, R, t) {
  const dark = '#2d1a11';
  const mid = '#7a482b';
  const light = '#c68b55';
  const gold = '#e4c275';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (t === 0) {
    g.strokeStyle = dark;
    g.lineWidth = Math.max(1.2, R * 0.21);
    g.beginPath();
    g.moveTo(cx + R * 0.02, cy + R * 0.58);
    g.bezierCurveTo(cx - R * 0.2, cy + R * 0.24, cx + R * 0.38, cy + R * 0.02, cx + R * 0.2, cy - R * 0.4);
    g.bezierCurveTo(cx + R * 0.08, cy - R * 0.72, cx - R * 0.36, cy - R * 0.56, cx - R * 0.2, cy - R * 0.18);
    g.stroke();
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.6, R * 0.07);
    g.beginPath();
    g.moveTo(cx + R * 0.06, cy + R * 0.42);
    g.bezierCurveTo(cx - R * 0.08, cy + R * 0.12, cx + R * 0.28, cy - R * 0.04, cx + R * 0.16, cy - R * 0.34);
    g.stroke();
    g.strokeStyle = gold;
    g.lineWidth = Math.max(0.8, R * 0.1);
    g.beginPath();
    g.moveTo(cx - R * 0.16, cy + R * 0.5);
    g.quadraticCurveTo(cx, cy + R * 0.62, cx + R * 0.18, cy + R * 0.5);
    g.stroke();
    star4(g, cx + R * 0.45, cy - R * 0.48, R * 0.12, '#ffe7a3', 0.9);
    return;
  }
  if (t === 3) {
    g.strokeStyle = dark;
    g.lineWidth = Math.max(1.3, R * 0.26);
    g.beginPath();
    g.moveTo(cx - R * 0.48, cy + R * 0.3);
    g.bezierCurveTo(cx - R * 0.62, cy - R * 0.34, cx + R * 0.12, cy - R * 0.62, cx + R * 0.3, cy - R * 0.1);
    g.bezierCurveTo(cx + R * 0.48, cy + R * 0.36, cx - R * 0.08, cy + R * 0.56, cx - R * 0.18, cy + R * 0.18);
    g.stroke();
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.7, R * 0.08);
    g.beginPath();
    g.moveTo(cx - R * 0.38, cy + R * 0.2);
    g.bezierCurveTo(cx - R * 0.48, cy - R * 0.24, cx + R * 0.08, cy - R * 0.44, cx + R * 0.22, cy - R * 0.04);
    g.stroke();
    g.strokeStyle = light;
    g.lineWidth = Math.max(0.5, R * 0.035);
    g.beginPath();
    g.moveTo(cx - R * 0.28, cy + R * 0.12);
    g.bezierCurveTo(cx - R * 0.34, cy - R * 0.18, cx + R * 0.02, cy - R * 0.3, cx + R * 0.14, cy - R * 0.02);
    g.stroke();
    g.fillStyle = dark;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(cx + s * R * 0.44, cy + R * 0.22, R * 0.16, 0, 6.28);
      g.fill();
    }
    g.strokeStyle = gold;
    g.lineWidth = Math.max(0.9, R * 0.08);
    g.beginPath();
    g.moveTo(cx - R * 0.26, cy + R * 0.48);
    g.quadraticCurveTo(cx, cy + R * 0.6, cx + R * 0.26, cy + R * 0.48);
    g.stroke();
    star4(g, cx - R * 0.52, cy - R * 0.42, R * 0.09, '#ffe7a3', 0.8);
    star4(g, cx + R * 0.5, cy - R * 0.36, R * 0.07, '#ffe7a3', 0.7);
    return;
  }
  const count = t === 1 ? 3 : t === 2 ? 5 : 12;
  const ringR = t === 1 ? R * 0.18 : t === 2 ? R * 0.3 : R * 0.46;
  const curlR = t === 1 ? R * 0.25 : t === 2 ? R * 0.24 : R * 0.19;
  g.fillStyle = dark;
  for (let i = 0; i < count; i += 1) {
    const a = i / count * Math.PI * 2 - Math.PI / 2 + (t === 4 ? 0.1 : 0);
    const rr = t === 4 ? R * (0.48 + 0.09 * Math.sin(i * 2.1)) : ringR;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    g.beginPath();
    g.arc(x, y, curlR * (t === 4 ? 0.9 + 0.18 * Math.sin(i * 1.7) : 1), 0, 6.28);
    g.fill();
  }
  if (t === 4) {
    g.beginPath();
    g.arc(cx, cy, R * 0.34, 0, 6.28);
    g.fill();
  }
  g.strokeStyle = mid;
  for (let i = 0; i < count; i += 1) {
    const a = i / count * Math.PI * 2 - Math.PI / 2 + 0.3;
    const rr = (t === 4 ? R * 0.48 : ringR) + R * 0.02;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    g.lineWidth = Math.max(0.5, R * 0.03);
    g.beginPath();
    g.arc(x, y, curlR * 0.55, a + 0.5, a + 2.6);
    g.stroke();
  }
  g.strokeStyle = gold;
  g.lineWidth = Math.max(0.9, R * 0.09);
  g.beginPath();
  g.moveTo(cx - R * 0.26, cy + R * 0.55);
  g.quadraticCurveTo(cx, cy + R * 0.68, cx + R * 0.26, cy + R * 0.55);
  g.stroke();
  if (t >= 2) {
    star4(g, cx - R * 0.6, cy - R * 0.4, R * 0.08, '#ffe7a3', 0.8);
    star4(g, cx + R * 0.6, cy - R * 0.28, R * 0.06, '#ffe7a3', 0.7);
  }
}

function drawHairCascadeOld(g, cx, cy, R, t) {
  const dark = '#2b1911';
  const base = '#5d3722';
  const mid = '#98613a';
  const light = '#dfa76b';
  const gold = '#e4c275';
  const len = (t === 5 ? 0.2 : t === 6 ? 0.5 : 0.78) * R;
  const flare = t === 5 ? 0.62 : t === 6 ? 0.7 : 0.76;
  const bottom = cy + len;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.fillStyle = base;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * R * 0.05, cy - R * 0.62);
    g.bezierCurveTo(cx + s * R * 0.52, cy - R * 0.66, cx + s * R * 0.62, cy - R * 0.14, cx + s * R * flare, cy + len * 0.44);
    g.bezierCurveTo(cx + s * R * (flare + 0.06), cy + len * 0.72, cx + s * R * 0.46, cy + len * 0.98, cx + s * R * 0.26, cy + len * 0.9);
    g.bezierCurveTo(cx + s * R * 0.38, cy + len * 0.56, cx + s * R * 0.26, cy + R * 0.02, cx + s * R * 0.12, cy - R * 0.38);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.moveTo(cx - R * 0.28, cy - R * 0.56);
  g.bezierCurveTo(cx - R * 0.15, cy - R * 0.75, cx + R * 0.15, cy - R * 0.75, cx + R * 0.28, cy - R * 0.56);
  g.bezierCurveTo(cx + R * 0.42, cy - R * 0.05, cx + R * 0.3, cy + len * 0.54, cx + R * 0.1, cy + len * 0.97);
  g.bezierCurveTo(cx + R * 0.03, cy + len * 1.04, cx - R * 0.03, cy + len * 1.04, cx - R * 0.1, cy + len * 0.97);
  g.bezierCurveTo(cx - R * 0.3, cy + len * 0.54, cx - R * 0.42, cy - R * 0.05, cx - R * 0.28, cy - R * 0.56);
  g.closePath();
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(cx - R * 0.5, cy - R * 0.16);
  g.bezierCurveTo(cx - R * 0.56, cy - R * 0.56, cx - R * 0.26, cy - R * 0.76, cx, cy - R * 0.72);
  g.bezierCurveTo(cx + R * 0.26, cy - R * 0.76, cx + R * 0.56, cy - R * 0.56, cx + R * 0.5, cy - R * 0.16);
  g.bezierCurveTo(cx + R * 0.28, cy - R * 0.4, cx - R * 0.28, cy - R * 0.4, cx - R * 0.5, cy - R * 0.16);
  g.closePath();
  g.fill();
  for (const s of [-1, 1]) {
    g.fillStyle = base;
    g.beginPath();
    g.ellipse(cx + s * R * 0.44, bottom, R * 0.16, R * 0.16, s * 0.3, 0, 6.28);
    g.fill();
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.4, R * 0.025);
    g.beginPath();
    g.arc(cx + s * R * 0.44, bottom * 0.985, R * 0.1, 0.5, 2.8);
    g.stroke();
  }
  if (t >= 6) {
    for (let i = -1; i <= 1; i += 1) {
      g.fillStyle = i === 0 ? base : dark;
      g.beginPath();
      g.arc(cx + i * R * 0.2, cy + len * 0.88, R * (0.12 + (i === 0 ? 0.025 : 0)), 0, 6.28);
      g.fill();
      g.strokeStyle = mid;
      g.lineWidth = Math.max(0.35, R * 0.02);
      g.beginPath();
      g.arc(cx + i * R * 0.2, cy + len * 0.88, R * 0.08, 0.4, 2.8);
      g.stroke();
    }
  }
  for (let i = 0; i < 6; i += 1) {
    const x = cx + (i - 2.5) * R * 0.1;
    g.strokeStyle = i % 2 ? mid : light;
    g.lineWidth = Math.max(0.5, R * (i % 2 ? 0.045 : 0.025));
    g.beginPath();
    g.moveTo(x, cy - R * 0.6);
    g.bezierCurveTo(x + R * 0.1, cy - R * 0.2, x - R * 0.1, cy + len * 0.38, x + R * 0.03, cy + len * 0.88);
    g.stroke();
  }
  for (const s of [-1, 1]) {
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.5, R * 0.035);
    g.beginPath();
    g.moveTo(cx + s * R * 0.3, cy - R * 0.42);
    g.bezierCurveTo(cx + s * R * 0.58, cy + len * 0.12, cx + s * R * 0.48, cy + len * 0.58, cx + s * R * 0.28, cy + len * 0.9);
    g.stroke();
  }
  g.strokeStyle = gold;
  g.lineWidth = Math.max(0.8, R * 0.055);
  g.beginPath();
  g.moveTo(cx - R * 0.2, cy - R * 0.58);
  g.bezierCurveTo(cx - R * 0.08, cy - R * 0.52, cx + R * 0.08, cy - R * 0.52, cx + R * 0.2, cy - R * 0.58);
  g.stroke();
  if (t === 5) {
    g.strokeStyle = gold;
    g.lineWidth = Math.max(0.7, R * 0.045);
    g.beginPath();
    g.moveTo(cx - R * 0.34, cy - R * 0.42);
    g.quadraticCurveTo(cx - R * 0.42, cy - R * 0.1, cx - R * 0.28, cy + R * 0.06);
    g.stroke();
    star4(g, cx - R * 0.36, cy - R * 0.24, R * 0.07, '#ffe7a3', 0.9);
  }
  if (t >= 6) drawCrown(g, cx, cy - R * 0.76, R * 0.48, R * 0.22);
  if (t === 7) {
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(cx, cy + R * 0.76, R * 0.5, R * 0.16, 0, 0, 6.28);
    g.fill();
    g.strokeStyle = light;
    g.lineWidth = Math.max(0.35, R * 0.022);
    for (let i = -2; i <= 2; i += 1) {
      g.beginPath();
      g.arc(cx + i * R * 0.18, cy + R * 0.72, R * 0.11, 0.2, 2.9);
      g.stroke();
    }
  }
  star4(g, cx - R * 0.56, cy - R * 0.14, R * 0.07, '#ffe7a3', 0.8);
  star4(g, cx + R * 0.58, cy + R * 0.06, R * 0.055, '#ffe7a3', 0.6);
}

function drawHairCascade(g, cx, cy, R, t) {
  const dark = '#2b1911';
  const base = '#5d3722';
  const mid = '#98613a';
  const light = '#dfa76b';
  const gold = '#e4c275';
  const len = (t === 5 ? 0.2 : t === 6 ? 0.5 : 0.78) * R;
  const end = cy + len;
  const strands = [
    { x0: -0.26, w: 0.32, c: dark, y1: 0.86, a: 0.5, b: -0.32, c2: -0.46, c3: 0.28 },
    { x0: -0.3, w: 0.22, c: base, y1: 0.8, a: 0.1, b: -0.2, c2: -0.58, c3: 0.42 },
    { x0: -0.1, w: 0.23, c: base, y1: 0.88, a: 0.38, b: -0.28, c2: -0.26, c3: 0.35 },
    { x0: -0.18, w: 0.08, c: mid, y1: 0.88, a: 0.3, b: -0.34, c2: -0.38, c3: 0.4 },
    { x0: -0.1, w: 0.035, c: light, y1: 0.84, a: 0.36, b: -0.36, c2: -0.3, c3: 0.36 }
  ];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const s of strands) {
    g.strokeStyle = s.c;
    g.lineWidth = Math.max(0.7, R * s.w);
    g.beginPath();
    g.moveTo(cx + R * s.x0, cy - R * 0.57);
    g.bezierCurveTo(cx + R * s.a, cy + R * s.b, cx + R * s.c2, cy + len * s.c3, cx + R * 0.12, cy + len * s.y1);
    g.stroke();
  }
  for (const s of [-1, 1]) {
    g.strokeStyle = s < 0 ? base : mid;
    g.lineWidth = Math.max(0.5, R * 0.035);
    g.beginPath();
    g.moveTo(cx + s * R * 0.28, cy - R * 0.5);
    g.bezierCurveTo(cx + s * R * 0.62, cy - R * 0.2, cx - s * R * 0.3, cy + len * 0.3, cx + s * R * 0.12, cy + len * 0.78);
    g.stroke();
  }
  for (let i = -1; i <= 1; i += 1) {
    g.fillStyle = i === 0 ? base : dark;
    g.beginPath();
    g.ellipse(cx + R * 0.1 + i * R * 0.12, end - R * 0.02 + Math.abs(i) * R * 0.02, R * 0.14, R * 0.11, -0.3, 0, 6.28);
    g.fill();
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.35, R * 0.022);
    g.beginPath();
    g.arc(cx + R * 0.1 + i * R * 0.12, end - R * 0.02 + Math.abs(i) * R * 0.02, R * 0.08, 0.2, 2.7);
    g.stroke();
  }
  g.save();
  g.translate(cx - R * 0.09, cy - R * 0.42);
  g.rotate(-0.42);
  g.fillStyle = gold;
  g.strokeStyle = 'rgba(83,53,18,.65)';
  g.lineWidth = Math.max(0.5, R * 0.018);
  g.beginPath();
  g.ellipse(0, 0, R * 0.24, R * 0.075, 0, 0, 6.28);
  g.fill();
  g.stroke();
  g.restore();
  if (t === 6) {
    g.strokeStyle = gold;
    g.lineWidth = Math.max(0.6, R * 0.035);
    g.beginPath();
    g.moveTo(cx + R * 0.12, cy - R * 0.5);
    g.lineTo(cx + R * 0.3, cy - R * 0.3);
    g.stroke();
    star4(g, cx + R * 0.36, cy - R * 0.24, R * 0.07, '#ffe7a3', 0.9);
  }
  if (t === 7) {
    g.save();
    g.translate(cx + R * 0.04, cy - R * 0.73);
    g.rotate(0.08);
    drawCrown(g, 0, 0, R * 0.46, R * 0.21);
    g.restore();
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(cx + R * 0.05, cy + R * 0.76, R * 0.42, R * 0.13, -0.06, 0, 6.28);
    g.fill();
    g.strokeStyle = light;
    g.lineWidth = Math.max(0.35, R * 0.02);
    for (let i = -2; i <= 2; i += 1) {
      g.beginPath();
      g.arc(cx + i * R * 0.14, cy + R * 0.72, R * 0.09, 0.2, 2.9);
      g.stroke();
    }
  }
  star4(g, cx - R * 0.56, cy - R * 0.14, R * 0.07, '#ffe7a3', 0.8);
  star4(g, cx + R * 0.58, cy + R * 0.06, R * 0.055, '#ffe7a3', 0.6);
}

function drawHairBust(g, cx, cy, R, t) {
  const dark = '#2b1911';
  const base = '#6b3f27';
  const mid = '#a86a3f';
  const light = '#e2ad70';
  const gold = '#e4c275';
  const headY = cy - R * 0.12;
  const len = (t === 5 ? 0.2 : t === 6 ? 0.48 : 0.72) * R;
  const end = cy + len;
  g.fillStyle = '#762d29';
  g.strokeStyle = '#461715';
  g.lineWidth = Math.max(0.6, R * 0.03);
  g.beginPath();
  g.moveTo(cx - R * 0.56, cy + R * 0.86);
  g.quadraticCurveTo(cx - R * 0.54, cy + R * 0.48, cx - R * 0.22, cy + R * 0.32);
  g.lineTo(cx + R * 0.22, cy + R * 0.32);
  g.quadraticCurveTo(cx + R * 0.54, cy + R * 0.48, cx + R * 0.56, cy + R * 0.86);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#9f3d34';
  g.lineWidth = Math.max(0.45, R * 0.022);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * R * 0.34, cy + R * 0.42);
    g.quadraticCurveTo(cx + s * R * 0.42, cy + R * 0.62, cx + s * R * 0.46, cy + R * 0.82);
    g.stroke();
  }
  g.strokeStyle = gold;
  g.lineWidth = Math.max(0.6, R * 0.04);
  g.beginPath();
  g.moveTo(cx - R * 0.3, cy + R * 0.36);
  g.quadraticCurveTo(cx, cy + R * 0.45, cx + R * 0.3, cy + R * 0.36);
  g.stroke();
  g.fillStyle = '#c99770';
  g.beginPath();
  g.moveTo(cx - R * 0.13, cy + R * 0.08);
  g.lineTo(cx - R * 0.13, cy + R * 0.36);
  g.quadraticCurveTo(cx, cy + R * 0.46, cx + R * 0.13, cy + R * 0.36);
  g.lineTo(cx + R * 0.13, cy + R * 0.08);
  g.closePath();
  g.fill();
  for (const s of [-1, 1]) {
    g.fillStyle = '#c99770';
    g.beginPath();
    g.ellipse(cx + s * R * 0.3, headY + R * 0.06, R * 0.055, R * 0.09, 0, 0, 6.28);
    g.fill();
  }
  g.fillStyle = base;
  g.beginPath();
  g.ellipse(cx, headY, R * 0.33, R * 0.39, 0, 0, 6.28);
  g.fill();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * R * 0.18, headY - R * 0.32);
    g.bezierCurveTo(cx + s * R * 0.52, headY - R * 0.16, cx + s * R * 0.62, cy + len * 0.42, cx + s * R * 0.36, end);
    g.bezierCurveTo(cx + s * R * 0.28, end - R * 0.08, cx + s * R * 0.22, cy + len * 0.5, cx + s * R * 0.08, headY + R * 0.24);
    g.closePath();
    g.fill();
  }
  for (const s of [-1, 1]) {
    g.fillStyle = base;
    g.beginPath();
    g.ellipse(cx + s * R * 0.38, end, R * 0.15, R * 0.115, s * 0.45, 0, 6.28);
    g.fill();
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.35, R * 0.022);
    g.beginPath();
    g.arc(cx + s * R * 0.38, end, R * 0.09, 0.2, 2.8);
    g.stroke();
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.35, R * 0.024);
    g.beginPath();
    g.moveTo(cx + s * R * 0.44, headY + R * 0.02);
    g.bezierCurveTo(cx + s * R * 0.62, cy + len * 0.4, cx + s * R * 0.54, cy + len * 0.7, cx + s * R * 0.46, end + R * 0.04);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(cx - R * 0.3, headY - R * 0.24);
  g.bezierCurveTo(cx - R * 0.16, headY - R * 0.42, cx + R * 0.16, headY - R * 0.42, cx + R * 0.3, headY - R * 0.24);
  g.bezierCurveTo(cx + R * 0.4, cy + len * 0.15, cx + R * 0.28, cy + len * 0.62, cx, end + R * 0.02);
  g.bezierCurveTo(cx - R * 0.28, cy + len * 0.62, cx - R * 0.4, cy + len * 0.15, cx - R * 0.3, headY - R * 0.24);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(29,17,11,.7)';
  g.lineWidth = Math.max(0.5, R * 0.025);
  g.beginPath();
  g.moveTo(cx, headY - R * 0.34);
  g.bezierCurveTo(cx - R * 0.04, headY - R * 0.1, cx - R * 0.03, headY + R * 0.18, cx - R * 0.06, cy + len * 0.82);
  g.stroke();
  for (let i = 0; i < 6; i += 1) {
    const x = cx + (i - 2.5) * R * 0.1;
    g.strokeStyle = i % 2 === 0 ? light : mid;
    g.lineWidth = Math.max(0.3, R * (i % 2 === 0 ? 0.022 : 0.035));
    g.beginPath();
    g.moveTo(x, headY - R * 0.26);
    g.bezierCurveTo(x + R * 0.13, headY + R * 0.1, x - R * 0.18, cy + len * 0.35, x + R * 0.05, end - R * 0.06);
    g.stroke();
  }
  for (const s of [-1, 1]) {
    g.strokeStyle = light;
    g.lineWidth = Math.max(0.35, R * 0.02);
    g.beginPath();
    g.moveTo(cx + s * R * 0.12, headY - R * 0.3);
    g.bezierCurveTo(cx + s * R * 0.3, headY - R * 0.16, cx + s * R * 0.2, cy + len * 0.3, cx + s * R * 0.26, end - R * 0.06);
    g.stroke();
  }
  for (let i = -1; i <= 1; i += 1) {
    g.fillStyle = i === 0 ? base : dark;
    g.beginPath();
    g.ellipse(cx + i * R * 0.18, end + R * 0.03 + Math.abs(i) * R * 0.02, R * 0.13, R * 0.1, i * 0.35, 0, 6.28);
    g.fill();
    g.strokeStyle = mid;
    g.lineWidth = Math.max(0.3, R * 0.018);
    g.beginPath();
    g.arc(cx + i * R * 0.18, end + R * 0.03 + Math.abs(i) * R * 0.02, R * 0.075, 0.3, 2.8);
    g.stroke();
  }
  if (t === 5) {
    g.strokeStyle = gold;
    g.lineWidth = Math.max(0.6, R * 0.035);
    g.beginPath();
    g.moveTo(cx - R * 0.34, headY - R * 0.1);
    g.lineTo(cx - R * 0.24, headY + R * 0.08);
    g.stroke();
    star4(g, cx - R * 0.36, headY - R * 0.02, R * 0.065, '#ffe7a3', 0.9);
  }
  if (t === 6) {
    g.strokeStyle = gold;
    g.lineWidth = Math.max(0.6, R * 0.04);
    g.beginPath();
    g.arc(cx, headY - R * 0.04, R * 0.32, Math.PI * 1.13, Math.PI * 1.87);
    g.stroke();
    g.fillStyle = '#f6df9f';
    g.beginPath();
    g.arc(cx, headY - R * 0.36, R * 0.035, 0, 6.28);
    g.fill();
  }
  if (t === 7) drawCrown(g, cx, headY - R * 0.3, R * 0.46, R * 0.21);
  star4(g, cx - R * 0.55, headY - R * 0.05, R * 0.06, '#ffe7a3', 0.8);
  star4(g, cx + R * 0.56, cy + R * 0.2, R * 0.05, '#ffe7a3', 0.6);
}

function hairRibbon(g, width, path) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#2a160d';
  g.lineWidth = Math.max(1, width);
  path();
  g.stroke();
  g.strokeStyle = '#6b3e24';
  g.lineWidth = Math.max(0.6, width * 0.6);
  path();
  g.stroke();
  g.strokeStyle = '#d9a35f';
  g.lineWidth = Math.max(0.35, width * 0.16);
  path();
  g.stroke();
}

function goldRibbon(g, width, path) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#6e4414';
  g.lineWidth = Math.max(0.9, width);
  path();
  g.stroke();
  g.strokeStyle = '#d7ad4e';
  g.lineWidth = Math.max(0.5, width * 0.6);
  path();
  g.stroke();
  g.strokeStyle = '#fff0b8';
  g.lineWidth = Math.max(0.3, width * 0.2);
  path();
  g.stroke();
}

function drawHairFiligree(g, cx, cy, R, t) {
  const gold = '#e4c275';
  const baseY = cy + R * 0.48;
  if (t === 0) {
    hairRibbon(g, R * 0.19, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.04, baseY);
      g.bezierCurveTo(cx - R * 0.46, cy + R * 0.18, cx - R * 0.32, cy - R * 0.42, cx + R * 0.1, cy - R * 0.44);
      g.bezierCurveTo(cx + R * 0.46, cy - R * 0.46, cx + R * 0.44, cy - R * 0.08, cx + R * 0.14, cy - R * 0.02);
      g.bezierCurveTo(cx + R * 0.02, cy + R * 0.02, cx - R * 0.02, cy + R * 0.12, cx, cy + R * 0.22);
    });
    goldRibbon(g, R * 0.09, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.2, cy + R * 0.4);
      g.quadraticCurveTo(cx, cy + R * 0.52, cx + R * 0.18, cy + R * 0.38);
    });
  } else if (t === 1) {
    for (const s of [-1, 1]) {
      hairRibbon(g, R * 0.15, () => {
        g.beginPath();
        g.moveTo(cx + s * R * 0.03, baseY);
        g.lineTo(cx + s * R * 0.15, cy + R * 0.12);
        g.arc(cx + s * R * 0.17, cy - R * 0.08, R * 0.25, s < 0 ? 1.9 : -1.9, s < 0 ? -1.7 : 1.7, s > 0);
      });
    }
    goldRibbon(g, R * 0.09, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.18, cy + R * 0.4);
      g.quadraticCurveTo(cx, cy + R * 0.52, cx + R * 0.18, cy + R * 0.4);
    });
  } else if (t === 2) {
    for (let i = 0; i < 3; i += 1) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
      const x = cx + Math.cos(a) * R * 0.18;
      const y = cy + Math.sin(a) * R * 0.18;
      hairRibbon(g, R * 0.14, () => {
        g.beginPath();
        g.moveTo(cx, cy + R * 0.34);
        g.lineTo(x, y + R * 0.18);
        g.arc(x, y, R * 0.23, a + 0.8, a - 2.7, true);
      });
    }
    goldRibbon(g, R * 0.09, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.2, cy + R * 0.43);
      g.quadraticCurveTo(cx, cy + R * 0.54, cx + R * 0.2, cy + R * 0.43);
    });
  } else if (t === 3) {
    hairRibbon(g, R * 0.18, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.1, baseY);
      g.bezierCurveTo(cx - R * 0.56, cy + R * 0.18, cx - R * 0.28, cy - R * 0.44, cx + R * 0.22, cy - R * 0.26);
      g.bezierCurveTo(cx + R * 0.48, cy - R * 0.18, cx + R * 0.4, cy + R * 0.26, cx + R * 0.12, cy + R * 0.3);
      g.arc(cx + R * 0.08, cy + R * 0.1, R * 0.2, 0.2, -2.6, true);
    });
    hairRibbon(g, R * 0.1, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.24, cy + R * 0.2);
      g.bezierCurveTo(cx - R * 0.46, cy - R * 0.08, cx - R * 0.2, cy - R * 0.35, cx + R * 0.02, cy - R * 0.4);
    });
    goldRibbon(g, R * 0.08, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.18, cy + R * 0.43);
      g.quadraticCurveTo(cx, cy + R * 0.54, cx + R * 0.18, cy + R * 0.43);
    });
  } else if (t === 4) {
    for (let i = 0; i < 7; i += 1) {
      const a = i / 7 * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * R * 0.24;
      const y = cy + Math.sin(a) * R * 0.24;
      hairRibbon(g, R * 0.11, () => {
        g.beginPath();
        g.arc(x, y, R * 0.2, a + 0.3, a + 4.4, false);
      });
    }
    hairRibbon(g, R * 0.13, () => {
      g.beginPath();
      g.arc(cx, cy - R * 0.02, R * 0.2, 0.4, 5.7, false);
    });
    goldRibbon(g, R * 0.09, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.22, cy + R * 0.43);
      g.quadraticCurveTo(cx, cy + R * 0.56, cx + R * 0.22, cy + R * 0.43);
    });
  } else {
    const len = (t === 5 ? 0.3 : t === 6 ? 0.58 : 0.82) * R;
    const rootY = cy - R * 0.47;
    const count = t === 5 ? 3 : t === 6 ? 4 : 5;
    for (let i = 0; i < count; i += 1) {
      const k = i - (count - 1) / 2;
      const x0 = cx + k * R * 0.11;
      const x1 = cx + k * R * 0.18;
      const y1 = cy + len * (1 - Math.abs(k) * 0.04);
      hairRibbon(g, R * (t === 7 ? 0.125 : 0.13), () => {
        g.beginPath();
        g.moveTo(x0, rootY);
        g.bezierCurveTo(x0 + R * 0.3, rootY + R * 0.22, x1 - R * 0.42, y1 - R * 0.34, x1, y1);
        g.arc(x1 - R * 0.02, y1 - R * 0.01, R * 0.075, 0.55, -2.7, true);
      });
    }
    for (const s of [-1, 1]) {
      hairRibbon(g, R * 0.07, () => {
        g.beginPath();
        g.moveTo(cx + s * R * 0.08, rootY + R * 0.02);
        g.bezierCurveTo(cx + s * R * 0.48, rootY + R * 0.2, cx + s * R * 0.52, cy + len * 0.58, cx + s * R * 0.28, cy + len * 0.86);
      });
    }
    goldRibbon(g, R * 0.1, () => {
      g.beginPath();
      g.moveTo(cx - R * 0.22, rootY + R * 0.05);
      g.quadraticCurveTo(cx, rootY + R * 0.13, cx + R * 0.22, rootY + R * 0.05);
    });
    if (t === 7) drawCrown(g, cx, rootY - R * 0.19, R * 0.46, R * 0.21);
    if (t === 6) {
      g.fillStyle = '#f6df9f';
      g.beginPath();
      g.arc(cx, rootY + R * 0.08, R * 0.04, 0, 6.28);
      g.fill();
    }
  }
  star4(g, cx - R * 0.56, cy - R * 0.2, R * 0.065, '#a56a22', 0.8);
  star4(g, cx + R * 0.58, cy + R * 0.2, R * 0.055, '#a56a22', 0.6);
}

function drawCameoFall(g, cx, cy, R, t) {
  const hair = '#24130b';
  const goldLight = '#e5be73';
  const specs = t === 6
    ? [{ x0: -0.38, y0: -0.16, x1: -0.43, y1: 0.5, w: 0.16 }]
    : [
      { x0: -0.42, y0: -0.14, x1: -0.49, y1: 0.76, w: 0.17 },
      { x0: -0.27, y0: -0.08, x1: -0.23, y1: 0.56, w: 0.1 }
    ];
  for (const s of specs) {
    const x0 = cx + s.x0 * R;
    const y0 = cy + s.y0 * R;
    const x1 = cx + s.x1 * R;
    const y1 = cy + s.y1 * R;
    const w = s.w * R;
    g.fillStyle = hair;
    g.beginPath();
    g.moveTo(x0 - w * 0.55, y0);
    g.bezierCurveTo(x0 - w * 0.8, y0 + (y1 - y0) * 0.3, x1 - w * 0.75, y1 - (y1 - y0) * 0.2, x1 - w * 0.5, y1);
    g.quadraticCurveTo(x1, y1 + w * 0.45, x1 + w * 0.5, y1 - w * 0.05);
    g.bezierCurveTo(x1 + w * 0.3, y1 - (y1 - y0) * 0.22, x0 + w * 0.55, y0 + (y1 - y0) * 0.3, x0 + w * 0.55, y0);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(196,139,67,.6)';
    g.lineWidth = Math.max(0.4, R * 0.022);
    g.beginPath();
    g.moveTo(x1 - w * 0.5, y1);
    g.quadraticCurveTo(x1, y1 + w * 0.45, x1 + w * 0.5, y1 - w * 0.05);
    g.stroke();
    g.strokeStyle = goldLight;
    g.lineWidth = Math.max(0.35, R * 0.018);
    g.beginPath();
    g.moveTo(x0 - w * 0.25, y0 + R * 0.02);
    g.bezierCurveTo(x0 - w * 0.5, y0 + (y1 - y0) * 0.36, x1 - w * 0.2, y1 - (y1 - y0) * 0.3, x1 + w * 0.05, y1 - R * 0.02);
    g.stroke();
  }
}

function drawHairSilhouette(g, cx, cy, R, t) {
  const hair = '#24130b';
  const hairMid = '#55301b';
  const face = '#7a492b';
  const faceLight = '#9a623b';
  const robe = '#3b2114';
  const gold = '#b47b2b';
  const goldLight = '#e5be73';
  const len = (t === 5 ? 0.28 : t === 6 ? 0.56 : 0.82) * R;
  const endY = cy + len;
  const outer = cx - (t === 5 ? 0.56 : t === 6 ? 0.59 : 0.6) * R;

  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(cx - 0.03 * R, cy - 0.52 * R);
  g.bezierCurveTo(cx - 0.34 * R, cy - 0.55 * R, cx - 0.52 * R, cy - 0.34 * R, outer, cy - 0.08 * R);
  g.bezierCurveTo(outer - 0.02 * R, cy + len * 0.36, outer + 0.06 * R, endY - 0.2 * R, cx - 0.36 * R, endY + 0.02 * R);
  g.bezierCurveTo(cx - 0.2 * R, endY + 0.09 * R, cx - 0.02 * R, endY + 0.07 * R, cx + 0.15 * R, endY - 0.04 * R);
  g.bezierCurveTo(cx + 0.28 * R, cy + len * 0.58, cx + 0.28 * R, cy + 0.14 * R, cx + 0.2 * R, cy - 0.16 * R);
  g.bezierCurveTo(cx + 0.17 * R, cy - 0.37 * R, cx + 0.11 * R, cy - 0.49 * R, cx - 0.03 * R, cy - 0.52 * R);
  g.closePath();
  g.fill();

  g.fillStyle = robe;
  g.beginPath();
  g.moveTo(cx - 0.72 * R, cy + 0.9 * R);
  g.quadraticCurveTo(cx - 0.48 * R, cy + 0.62 * R, cx - 0.18 * R, cy + 0.54 * R);
  g.lineTo(cx + 0.22 * R, cy + 0.54 * R);
  g.quadraticCurveTo(cx + 0.52 * R, cy + 0.62 * R, cx + 0.72 * R, cy + 0.9 * R);
  g.closePath();
  g.fill();

  g.strokeStyle = gold;
  g.lineWidth = Math.max(0.6, R * 0.035);
  g.beginPath();
  g.moveTo(cx - 0.28 * R, cy + 0.57 * R);
  g.quadraticCurveTo(cx, cy + 0.65 * R, cx + 0.29 * R, cy + 0.57 * R);
  g.stroke();
  g.fillStyle = gold;
  g.beginPath();
  g.arc(cx + 0.27 * R, cy + 0.66 * R, R * 0.045, 0, 6.28);
  g.fill();
  g.fillStyle = '#6e2e27';
  g.beginPath();
  g.arc(cx + 0.27 * R, cy + 0.66 * R, R * 0.017, 0, 6.28);
  g.fill();

  if (t >= 6) drawCameoFall(g, cx, cy, R, t);

  g.fillStyle = face;
  g.beginPath();
  g.moveTo(cx + 0.16 * R, cy - 0.34 * R);
  g.bezierCurveTo(cx + 0.24 * R, cy - 0.25 * R, cx + 0.27 * R, cy - 0.12 * R, cx + 0.36 * R, cy - 0.02 * R);
  g.bezierCurveTo(cx + 0.38 * R, cy + 0.02 * R, cx + 0.35 * R, cy + 0.05 * R, cx + 0.29 * R, cy + 0.06 * R);
  g.quadraticCurveTo(cx + 0.32 * R, cy + 0.1 * R, cx + 0.29 * R, cy + 0.13 * R);
  g.quadraticCurveTo(cx + 0.33 * R, cy + 0.19 * R, cx + 0.23 * R, cy + 0.27 * R);
  g.bezierCurveTo(cx + 0.16 * R, cy + 0.37 * R, cx + 0.13 * R, cy + 0.43 * R, cx + 0.12 * R, cy + 0.54 * R);
  g.lineTo(cx - 0.14 * R, cy + 0.54 * R);
  g.bezierCurveTo(cx - 0.19 * R, cy + 0.34 * R, cx - 0.32 * R, cy + 0.2 * R, cx - 0.34 * R, cy - 0.06 * R);
  g.bezierCurveTo(cx - 0.36 * R, cy - 0.34 * R, cx - 0.04 * R, cy - 0.46 * R, cx + 0.16 * R, cy - 0.34 * R);
  g.closePath();
  g.fill();

  g.strokeStyle = 'rgba(246,213,150,.6)';
  g.lineWidth = Math.max(0.45, R * 0.025);
  g.beginPath();
  g.moveTo(cx + 0.16 * R, cy - 0.34 * R);
  g.bezierCurveTo(cx + 0.24 * R, cy - 0.25 * R, cx + 0.27 * R, cy - 0.12 * R, cx + 0.36 * R, cy - 0.02 * R);
  g.bezierCurveTo(cx + 0.38 * R, cy + 0.02 * R, cx + 0.35 * R, cy + 0.05 * R, cx + 0.29 * R, cy + 0.06 * R);
  g.quadraticCurveTo(cx + 0.32 * R, cy + 0.1 * R, cx + 0.29 * R, cy + 0.13 * R);
  g.quadraticCurveTo(cx + 0.33 * R, cy + 0.19 * R, cx + 0.23 * R, cy + 0.27 * R);
  g.stroke();

  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(cx + 0.17 * R, cy - 0.34 * R);
  g.bezierCurveTo(cx + 0.1 * R, cy - 0.48 * R, cx - 0.2 * R, cy - 0.52 * R, cx - 0.36 * R, cy - 0.36 * R);
  g.bezierCurveTo(cx - 0.47 * R, cy - 0.22 * R, cx - 0.44 * R, cy - 0.02 * R, cx - 0.3 * R, cy + 0.06 * R);
  g.bezierCurveTo(cx - 0.2 * R, cy - 0.12 * R, cx - 0.02 * R, cy - 0.24 * R, cx + 0.17 * R, cy - 0.34 * R);
  g.closePath();
  g.fill();

  g.strokeStyle = 'rgba(196,140,67,.55)';
  g.lineWidth = Math.max(0.4, R * 0.022);
  g.beginPath();
  g.moveTo(cx + 0.13 * R, cy - 0.37 * R);
  g.bezierCurveTo(cx + 0.02 * R, cy - 0.46 * R, cx - 0.2 * R, cy - 0.44 * R, cx - 0.31 * R, cy - 0.32 * R);
  g.stroke();

  g.strokeStyle = hair;
  g.lineWidth = Math.max(1, R * 0.13);
  g.beginPath();
  g.moveTo(cx + 0.01 * R, cy - 0.33 * R);
  g.bezierCurveTo(cx - 0.06 * R, cy - 0.1 * R, cx - 0.04 * R, cy + 0.1 * R, cx - 0.12 * R, cy + 0.3 * R);
  g.stroke();
  g.strokeStyle = hairMid;
  g.lineWidth = Math.max(0.4, R * 0.035);
  g.beginPath();
  g.moveTo(cx + 0.01 * R, cy - 0.31 * R);
  g.bezierCurveTo(cx - 0.04 * R, cy - 0.08 * R, cx - 0.02 * R, cy + 0.1 * R, cx - 0.1 * R, cy + 0.28 * R);
  g.stroke();

  for (let i = 0; i < 4; i += 1) {
    const x = cx - 0.4 * R + i * 0.11 * R;
    g.strokeStyle = i % 2 ? 'rgba(177,118,59,.7)' : 'rgba(68,36,20,.8)';
    g.lineWidth = Math.max(0.35, R * (i % 2 ? 0.022 : 0.03));
    g.beginPath();
    g.moveTo(x, cy - 0.34 * R);
    g.bezierCurveTo(x - 0.05 * R, cy - 0.12 * R, x + 0.04 * R, endY - 0.22 * R, x - 0.02 * R, endY - 0.02 * R);
    g.stroke();
  }

  g.strokeStyle = hairMid;
  g.lineWidth = Math.max(0.4, R * 0.035);
  for (let i = -1; i <= 1; i += 1) {
    g.beginPath();
    g.arc(cx - 0.18 * R + i * 0.15 * R, endY - 0.03 * R, R * 0.1, 0.25, 2.9);
    g.stroke();
  }

  if (t === 5) {
    g.save();
    g.translate(cx - 0.26 * R, cy + 0.02 * R);
    g.rotate(-0.5);
    g.fillStyle = gold;
    g.beginPath();
    g.ellipse(0, 0, R * 0.14, R * 0.045, 0, 0, 6.28);
    g.fill();
    g.strokeStyle = '#76501b';
    g.lineWidth = Math.max(0.4, R * 0.018);
    g.stroke();
    g.restore();
    star4(g, cx - 0.33 * R, cy - 0.16 * R, R * 0.06, gold, 0.9);
  }
  if (t === 6) {
    g.strokeStyle = gold;
    g.lineWidth = Math.max(0.5, R * 0.035);
    g.beginPath();
    g.arc(cx - 0.12 * R, cy - 0.2 * R, R * 0.3, Math.PI * 1.08, Math.PI * 1.82);
    g.stroke();
    g.save();
    g.translate(cx - 0.38 * R, cy - 0.16 * R);
    g.rotate(-0.55);
    g.fillStyle = gold;
    g.beginPath();
    g.ellipse(0, 0, R * 0.14, R * 0.045, 0, 0, 6.28);
    g.fill();
    g.strokeStyle = '#76501b';
    g.lineWidth = Math.max(0.4, R * 0.018);
    g.stroke();
    g.restore();
    star4(g, cx + 0.38 * R, cy - 0.24 * R, R * 0.065, gold, 0.9);
  }
  if (t === 7) {
    drawCrown(g, cx - 0.02 * R, cy - 0.57 * R, R * 0.46, R * 0.21);
    g.save();
    g.translate(cx - 0.3 * R, cy + 0.16 * R);
    g.rotate(-0.6);
    g.fillStyle = gold;
    g.beginPath();
    g.ellipse(0, 0, R * 0.15, R * 0.045, 0, 0, 6.28);
    g.fill();
    g.strokeStyle = '#76501b';
    g.lineWidth = Math.max(0.4, R * 0.018);
    g.stroke();
    g.restore();
    star4(g, cx - 0.48 * R, cy - 0.18 * R, R * 0.06, gold, 0.9);
    star4(g, cx + 0.47 * R, cy + 0.1 * R, R * 0.045, gold, 0.7);
  }

  g.strokeStyle = 'rgba(229,190,115,.8)';
  g.lineWidth = Math.max(0.5, R * 0.028);
  g.beginPath();
  g.moveTo(cx - 0.36 * R, cy + 0.58 * R);
  g.quadraticCurveTo(cx - 0.2 * R, cy + 0.7 * R, cx - 0.02 * R, cy + 0.62 * R);
  g.stroke();
  g.strokeStyle = 'rgba(120,80,28,.35)';
  g.lineWidth = Math.max(0.3, R * 0.018);
  g.beginPath();
  g.moveTo(cx + 0.08 * R, cy + 0.58 * R);
  g.quadraticCurveTo(cx + 0.24 * R, cy + 0.68 * R, cx + 0.42 * R, cy + 0.62 * R);
  g.stroke();
}

function drawFaceV3(g, cx, cy, R) {
  const skin = '#e7ba91';
  g.fillStyle = skin;
  g.strokeStyle = '#9b6c4d';
  g.lineWidth = Math.max(0.7, R * 0.035);
  g.beginPath();
  g.ellipse(cx, cy + R * 0.08, R * 0.52, R * 0.6, 0, 0, 6.28);
  g.fill();
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * R * 0.55, cy + R * 0.08, R * 0.12, 0, 6.28);
    g.fillStyle = skin;
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#3b2418';
  const eyeY = cy + R * 0.02;
  const eyeX = R * 0.23;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * eyeX, eyeY, Math.max(0.7, R * 0.045), 0, 6.28);
    g.fill();
  }
  g.strokeStyle = '#4a2b1c';
  g.lineWidth = Math.max(0.65, R * 0.04);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * eyeX, eyeY, R * 0.2, 0, 6.28);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(cx - eyeX + R * 0.2, eyeY);
  g.lineTo(cx + eyeX - R * 0.2, eyeY);
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * eyeX + R * 0.2, eyeY - R * 0.01);
    g.lineTo(cx + s * R * 0.54, eyeY - R * 0.02);
    g.stroke();
  }
  g.fillStyle = '#a36c4f';
  g.beginPath();
  g.ellipse(cx, cy + R * 0.22, R * 0.05, R * 0.08, 0, 0, 6.28);
  g.fill();
  g.strokeStyle = '#8d3f38';
  g.lineWidth = Math.max(0.7, R * 0.032);
  g.beginPath();
  g.arc(cx, cy + R * 0.3, R * 0.13, 0.2, Math.PI - 0.2);
  g.stroke();
}

function drawFaceLowV3(g, cx, cy, R) {
  const skin = '#e7ba91';
  g.fillStyle = skin;
  g.strokeStyle = '#9b6c4d';
  g.lineWidth = Math.max(0.55, R * 0.035);
  g.beginPath();
  g.ellipse(cx, cy + R * 0.08, R * 0.5, R * 0.56, 0, 0, 6.28);
  g.fill();
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * R * 0.52, cy + R * 0.08, R * 0.11, 0, 6.28);
    g.fillStyle = skin;
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#3b2418';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * R * 0.2, cy + R * 0.02, Math.max(0.45, R * 0.05), 0, 6.28);
    g.fill();
  }
  g.fillStyle = '#a36c4f';
  g.beginPath();
  g.ellipse(cx, cy + R * 0.22, R * 0.045, R * 0.065, 0, 0, 6.28);
  g.fill();
  g.strokeStyle = '#8d3f38';
  g.lineWidth = Math.max(0.5, R * 0.03);
  g.beginPath();
  g.arc(cx, cy + R * 0.29, R * 0.12, 0.25, Math.PI - 0.25);
  g.stroke();
}

function drawLowHairV3(g, cx, cy, R, t) {
  const hr = R * (t === 0 ? 0.62 : t === 1 ? 0.71 : 0.8);
  g.fillStyle = '#1b1310';
  g.strokeStyle = '#2b1b12';
  g.lineWidth = Math.max(0.9, R * 0.06);
  g.beginPath();
  g.arc(cx, cy - R * 0.08, hr, 0, 6.28);
  g.fill();
  g.stroke();
  const n = t === 0 ? 4 : t === 1 ? 6 : 8;
  for (let i = 0; i < n; i += 1) {
    const a = i / n * Math.PI * 2 + 0.35;
    const rr = R * (0.15 + 0.055 * Math.sin(i * 2 + t));
    const x = cx + Math.cos(a) * hr * 0.9;
    const y = cy - R * 0.08 + Math.sin(a) * hr * 0.86;
    g.beginPath();
    g.arc(x, y, rr, 0, 6.28);
    g.fillStyle = '#1b1310';
    g.fill();
    g.stroke();
  }
  g.strokeStyle = '#6b4a2f';
  g.lineWidth = Math.max(0.6, R * 0.045);
  for (let i = 0; i < 2 + t; i += 1) {
    const a = 3.25 + i * 0.5;
    g.beginPath();
    g.arc(cx - R * 0.1, cy - R * 0.02, R * (0.3 + i * 0.07), a, a + 1.15);
    g.stroke();
  }
  g.strokeStyle = '#1b1310';
  g.lineWidth = Math.max(1.1, R * (t === 0 ? 0.2 : 0.16));
  g.beginPath();
  g.moveTo(cx - R * 0.13, cy - R * 0.48);
  g.bezierCurveTo(cx + R * 0.08, cy - R * 0.95, cx + R * 0.62, cy - R * 0.9, cx + R * 0.64, cy - R * 0.5);
  g.stroke();
  g.strokeStyle = '#7d5936';
  g.lineWidth = Math.max(0.55, R * 0.04);
  g.beginPath();
  g.moveTo(cx + R * 0.02, cy - R * 0.55);
  g.bezierCurveTo(cx + R * 0.2, cy - R * 0.82, cx + R * 0.48, cy - R * 0.8, cx + R * 0.56, cy - R * 0.55);
  g.stroke();
}

function drawHairBackV3(g, cx, cy, R, t) {
  g.fillStyle = '#1b1310';
  g.strokeStyle = '#2b1b12';
  g.lineWidth = Math.max(1, R * 0.055);
  g.beginPath();
  g.arc(cx, cy, R * 0.98, 0, 6.28);
  g.fill();
  g.stroke();
  const n = 8 + t * 2;
  for (let i = 0; i < n; i += 1) {
    const a = i / n * Math.PI * 2 + 0.22 + t * 0.17;
    const rr = R * (0.22 + 0.06 * Math.sin(i * 1.7 + t));
    const bx = cx + Math.cos(a) * R * 0.84;
    const by = cy + Math.sin(a) * R * 0.84;
    g.beginPath();
    g.arc(bx, by, rr, 0, 6.28);
    g.fillStyle = '#1b1310';
    g.fill();
    g.stroke();
  }
  const lockCount = t >= 5 ? 3 : 2;
  for (const s of [-1, 1]) {
    for (let i = 0; i < lockCount; i += 1) {
      const x = cx + s * R * (0.62 + i * 0.09);
      const w = R * (0.2 - i * 0.025);
      g.strokeStyle = i === 0 ? '#2b1b12' : '#1f1712';
      g.lineWidth = Math.max(1, w);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, cy - R * 0.2);
      g.bezierCurveTo(
        x + s * R * 0.2, cy + R * 0.25,
        x + s * R * 0.28, cy + R * 0.55,
        x + s * R * 0.16, cy + R * (0.85 + i * 0.16)
      );
      g.stroke();
    }
  }
}

function drawHairHighlightsV3(g, cx, cy, R, t) {
  g.lineCap = 'round';
  const n = 6 + t;
  for (let i = 0; i < n; i += 1) {
    const a = i / n * Math.PI * 2 + 0.9;
    const x = cx + Math.cos(a) * R * 0.55;
    const y = cy + Math.sin(a) * R * 0.55;
    const len = R * (0.18 + 0.06 * Math.sin(i * 2.3 + t));
    g.strokeStyle = i % 3 === 0 ? '#765435' : '#4b3324';
    g.lineWidth = Math.max(0.6, R * 0.025);
    g.beginPath();
    g.arc(x, y, len, a + 0.4, a + 2.3);
    g.stroke();
  }
  g.strokeStyle = '#9b734c';
  g.lineWidth = Math.max(0.7, R * 0.03);
  g.beginPath();
  g.arc(cx - R * 0.32, cy - R * 0.46, R * 0.28, 3.5, 5.3);
  g.stroke();
}

function drawHairFrontV3(g, cx, cy, R, t) {
  g.fillStyle = '#1b1310';
  g.strokeStyle = '#2b1b12';
  g.lineWidth = Math.max(0.9, R * 0.045);
  const curls = [
    [-0.48, -0.18, -0.18, -0.48],
    [0.48, -0.18, 0.18, -0.48],
    [-0.5, 0.22, -0.2, -0.12],
    [0.5, 0.22, 0.2, -0.12]
  ];
  for (let i = 0; i < curls.length; i += 1) {
    const [ax, ay, bx, by] = curls[i];
    const x = cx + ax * R, y = cy + ay * R;
    const r = R * (0.2 + (i % 2) * 0.03);
    g.beginPath();
    g.arc(x, y, r, 0, 6.28);
    g.fill();
    g.stroke();
    g.strokeStyle = '#4b3324';
    g.lineWidth = Math.max(0.6, R * 0.024);
    g.beginPath();
    g.arc(x, y, r * 0.55, 0.5, 2.8);
    g.stroke();
    g.strokeStyle = '#2b1b12';
    g.lineWidth = Math.max(0.9, R * 0.045);
  }
  g.fillStyle = '#1b1310';
  g.beginPath();
  g.moveTo(cx - R * 0.44, cy - R * 0.33);
  g.quadraticCurveTo(cx, cy - R * 0.72, cx + R * 0.44, cy - R * 0.33);
  g.quadraticCurveTo(cx + R * 0.3, cy - R * 0.5, cx, cy - R * 0.46);
  g.quadraticCurveTo(cx - R * 0.3, cy - R * 0.5, cx - R * 0.44, cy - R * 0.33);
  g.fill();
}

function drawCollarV3(g, cx, cy, R) {
  g.fillStyle = '#f3e7d1';
  g.strokeStyle = '#c7b28b';
  g.lineWidth = Math.max(0.7, R * 0.03);
  g.beginPath();
  g.ellipse(cx, cy + R * 0.72, R * 0.56, R * 0.2, 0, 0, Math.PI);
  g.fill();
  g.stroke();
  g.strokeStyle = '#b08e57';
  g.lineWidth = Math.max(0.6, R * 0.024);
  for (let i = -2; i <= 2; i += 1) {
    g.beginPath();
    g.arc(cx + i * R * 0.18, cy + R * 0.72, R * 0.12, 0.2, Math.PI - 0.2);
    g.stroke();
  }
}

function drawHeadV3(g, cx, cy, R, t) {
  if (t < 3) drawLowHairV3(g, cx, cy, R, t);
  else drawHairBackV3(g, cx, cy, R, t);
  if (t >= 5) drawCollarV3(g, cx, cy, R);
  if (t < 3) drawFaceLowV3(g, cx, cy, R);
  else drawFaceV3(g, cx, cy, R);
  drawHairFrontV3(g, cx, cy, R, t);
  if (t >= 3) drawHairHighlightsV3(g, cx, cy, R, t);
  else {
    g.strokeStyle = '#765435';
    g.lineWidth = Math.max(0.5, R * 0.035);
    g.beginPath();
    g.arc(cx - R * 0.22, cy - R * 0.3, R * 0.35, 3.6, 5.2);
    g.stroke();
  }
  if (t >= 6) drawCrown(g, cx, cy - R * 0.93, R * 1.02, R * 0.56);
}

function drawHairEmblem(g, cx, cy, R, t) {
  const inner = R * 0.88;
  drawEmblemFrame(g, cx, cy, R);
  g.save();
  g.beginPath();
  g.arc(cx, cy, inner, 0, 6.28);
  g.clip();
  const bg = g.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.08, cx, cy, R * 1.05);
  bg.addColorStop(0, '#fcf3dc');
  bg.addColorStop(0.55, '#efdcb7');
  bg.addColorStop(1, '#d8bb8b');
  g.fillStyle = bg;
  g.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
  g.strokeStyle = 'rgba(150,101,37,.14)';
  g.lineWidth = Math.max(0.4, R * 0.018);
  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2 + 0.2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.25, cy + Math.sin(a) * R * 0.25);
    g.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.stroke();
  }
  if (R > 8) {
    star4(g, cx - R * 0.57, cy - R * 0.45, R * 0.055, '#a56a22', 0.65);
    star4(g, cx + R * 0.62, cy - R * 0.5, R * 0.04, '#a56a22', 0.5);
  }
  if (t < 5) drawHairFiligree(g, cx, cy, R, t);
  else drawHairSilhouette(g, cx, cy, R, t);
  const vg = g.createRadialGradient(cx, cy, R * 0.35, cx, cy, inner);
  vg.addColorStop(0.68, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(96,62,24,.22)');
  g.fillStyle = vg;
  g.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
  g.restore();
  g.strokeStyle = 'rgba(120,79,25,.35)';
  g.lineWidth = Math.max(0.5, R * 0.025);
  g.beginPath();
  g.arc(cx, cy, inner, 0, 6.28);
  g.stroke();
}

function drawKingMedallion(g, cx, cy, R) {
  const inner = R * 0.88;
  drawEmblemFrame(g, cx, cy, R);
  g.save();
  g.beginPath();
  g.arc(cx, cy, inner, 0, 6.28);
  g.clip();
  const d = R * 2.02;
  g.drawImage(kingImg, cx - d / 2, cy - d / 2, d, d);
  const vg = g.createRadialGradient(cx, cy, R * 0.4, cx, cy, inner);
  vg.addColorStop(0.72, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4,8,15,.35)');
  g.fillStyle = vg;
  g.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
  g.restore();
  g.strokeStyle = 'rgba(255,237,174,.8)';
  g.lineWidth = Math.max(0.7, R * 0.025);
  g.beginPath();
  g.arc(cx, cy, inner, 0, 6.28);
  g.stroke();
}

function buildSprite(t) {
  const T = TIERS[t];
  const R = T.r, pad = T.pad, size = pad * 2;
  const c = document.createElement('canvas');
  c.width = Math.ceil(size * spriteRes);
  c.height = Math.ceil(size * spriteRes);
  const g = c.getContext('2d');
  g.setTransform(spriteRes, 0, 0, spriteRes, 0, 0);
  const cx = pad, cy = pad;
  if (T.final) {
    if (kingReady) drawKingMedallion(g, cx, cy, R);
    else drawHeadV3(g, cx, cy, R, 7);
    return c;
  }
  drawHeadV3(g, cx, cy, R, t);
  return c;
}

function getSprite(t) {
  if (!sprites[t]) sprites[t] = buildSprite(t);
  return sprites[t];
}

function drawSprite(t, x, y, alpha = 1) {
  const sp = getSprite(t);
  const T = TIERS[t];
  const size = T.pad * 2;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sp, x - T.pad, y - T.pad, size, size);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

function drawNext() {
  const s = 30;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (nextCv.width !== s * dpr) {
    nextCv.width = s * dpr;
    nextCv.height = s * dpr;
  }
  nctx.setTransform(1, 0, 0, 1, 0, 0);
  nctx.clearRect(0, 0, nextCv.width, nextCv.height);
  const sp = getSprite(nextTier);
  const k = Math.min((s * dpr - 3) / sp.width, (s * dpr - 3) / sp.height);
  const dw = sp.width * k, dh = sp.height * k;
  nctx.imageSmoothingEnabled = true;
  nctx.drawImage(sp, (s * dpr - dw) / 2, (s * dpr - dh) / 2, dw, dh);
}

function draw() {
  ctx.setTransform(renderK, 0, 0, renderK, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(255,255,255,.38)');
  bg.addColorStop(0.55, 'rgba(255,251,240,.1)');
  bg.addColorStop(1, 'rgba(121,83,39,.07)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (dangerT > 0) {
    ctx.fillStyle = 'rgba(165,60,53,.12)';
    ctx.fillRect(0, 0, W, DANGER);
  }

  ctx.save();
  ctx.strokeStyle = dangerT > 0 && (Math.floor(gameT * 8) % 2) ? '#a53c35' : 'rgba(165,60,53,.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(3, DANGER + 0.5);
  ctx.lineTo(W - 3, DANGER + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const shx = shake > 0 ? rand(-shake, shake) * 0.3 : 0;
  const shy = shake > 0 ? rand(-shake, shake) * 0.3 : 0;
  ctx.save();
  ctx.translate(shx, shy);

  for (const c of pieces) {
    const floor = clamp((c.y + c.r - H + 22) / 22, 0, 1);
    if (floor > 0) {
      ctx.fillStyle = `rgba(83,53,22,${0.13 * floor})`;
      ctx.beginPath();
      ctx.ellipse(c.x, H - 5, c.r * 0.85, c.r * 0.18, 0, 0, 6.28);
      ctx.fill();
    }
    drawSprite(c.t, c.x, c.y);
    if (c.t === TIERS.length - 1) {
      ctx.strokeStyle = `rgba(255,224,145,${0.3 + 0.15 * Math.sin(gameT * 4)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * 1.15, 0, 6.28);
      ctx.stroke();
    }
  }

  if (!paused() && canDrop) {
    const r = TIERS[curTier].r;
    ctx.fillStyle = 'rgba(138,101,38,.35)';
    for (let y = DROP_Y + r + 7; y < H - 5; y += 5) {
      ctx.fillRect(Math.round(aimX), Math.round(y), 1, 2);
    }
    const bob = Math.sin(gameT * 4) * 1.2;
    drawSprite(curTier, aimX, DROP_Y + bob, 0.98);
  }

  drawEffects();
  ctx.restore();
}

function drawEffects() {
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    if (p.type === 'hair') {
      ctx.strokeStyle = '#3a2619';
      ctx.lineWidth = Math.max(0.7, p.size * 0.55);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, p.rot, p.rot + 2.3);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#e6be62';
      ctx.strokeStyle = '#8a5b16';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 6.28);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,247,210,.8)';
      ctx.beginPath();
      ctx.arc(p.x - p.size * 0.28, p.y - p.size * 0.3, p.size * 0.26, 0, 6.28);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const c of confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.x * 0.03 + gameT * 2);
    ctx.globalAlpha = clamp(c.life / c.max, 0, 1);
    ctx.fillStyle = c.col;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const p of packets) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y - (1 - a) * 10);
    ctx.rotate(Math.sin(gameT * 5) * 0.06);
    const w = 20, h = 26;
    ctx.fillStyle = '#a53c35';
    ctx.strokeStyle = '#f0d38a';
    ctx.lineWidth = 1;
    roundRect(ctx, -w / 2, -h / 2, w, h, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f0d38a';
    ctx.beginPath();
    ctx.arc(0, 1, 5.2, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#8f2f26';
    ctx.font = '700 6px "Songti SC", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('财', 0, 1.5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const t of toasts) {
    const a = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${t.big ? 10 : 8}px "Songti SC","STSong",Georgia,serif`;
    const tw = ctx.measureText(t.text).width;
    const tx = clamp(t.x, tw / 2 + 6, W - tw / 2 - 6);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,248,224,.9)';
    ctx.strokeText(t.text, tx, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, tx, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function recordRun() {
  if (recorded) return;
  recorded = true;
  currentTitle = titleFor(score, hair);
  if (score <= 0 && hair <= 0) return;
  const entry = {
    id: Date.now() + '-' + Math.floor(Math.random() * 9999),
    cid: getPlayerId(playerName),
    n: playerName,
    s: score,
    h: hair,
    d: Date.now(),
    t: currentTitle
  };
  const board = loadBoardForClient();
  board.push(entry);
  board.sort((a, b) => b.s - a.s || (b.h || 0) - (a.h || 0) || a.d - b.d);
  saveBoard(board);
  lastEntryId = entry.id;
  lastRank = board.findIndex((e) => e.id === entry.id) + 1;
  if (score > best) {
    best = score;
    saveBest(best);
  }
  submitScore(entry)
    .then(() => { if (boardOpen) refreshBoard({ silent: true }); })
    .catch(() => {});
}

function showOverlay(el) { el.classList.remove('hidden'); }
function hideOverlay(el) { el.classList.add('hidden'); }

function startGame() {
  const n = (playerInput.value || '').trim().slice(0, 8) || '长发骑士';
  playerName = n;
  saveNick(playerName);
  playerInput.value = playerName;
  introOpen = false;
  rulesOpen = false;
  docOpen = false;
  boardOpen = false;
  stopBoardPolling();
  started = true;
  debugPause = false;
  hideOverlay(introEl);
  hideOverlay(rulesEl);
  hideOverlay(docEl);
  hideOverlay(overEl);
  hideOverlay(winEl);
  hideOverlay(boardEl);
  chainOpen = false;
  hideOverlay(chainOverlay);
  reset();
  fit();
  if (window.KingMusic) {
    KingMusic.setEnabled(musicOn);
    KingMusic.start().catch(() => {});
  }
  beep(392, 0.07, 'triangle', 0.04);
  beep(523, 0.1, 'triangle', 0.04, 0.08);
}

function retry() {
  over = false;
  won = false;
  docOpen = false;
  boardOpen = false;
  started = true;
  debugPause = false;
  hideOverlay(overEl);
  hideOverlay(winEl);
  hideOverlay(docEl);
  hideOverlay(boardEl);
  chainOpen = false;
  hideOverlay(chainOverlay);
  reset();
  fit();
}

function showIntro() {
  introOpen = true;
  started = false;
  over = false;
  won = false;
  rulesOpen = false;
  docOpen = false;
  boardOpen = false;
  debugPause = false;
  hideOverlay(overEl);
  hideOverlay(winEl);
  hideOverlay(docEl);
  hideOverlay(rulesEl);
  hideOverlay(boardEl);
  chainOpen = false;
  hideOverlay(chainOverlay);
  showOverlay(introEl);
  playerInput.value = playerName;
  hudPlayer.textContent = playerName;
  reset();
  fit();
}

function openRules() {
  rulesOpen = true;
  showOverlay(rulesEl);
}
function closeRules() {
  rulesOpen = false;
  hideOverlay(rulesEl);
}

function showDoc(index) {
  const d = DOCS[index];
  if (!d) return;
  docOpen = true;
  docUnlocked[index] = true;
  $('docIndex').textContent = `档案 0${index + 1} / 04`;
  $('docYear').textContent = d.year;
  $('docText').textContent = d.text;
  $('docSign').textContent = `—— ${d.sign}`;
  showOverlay(docEl);
  beep(466, 0.08, 'triangle', 0.04);
  beep(622, 0.12, 'triangle', 0.035, 0.09);
}

function closeDoc() {
  docOpen = false;
  hideOverlay(docEl);
  if (hair >= 40) pendingWinAt = performance.now() + 300;
}

function startBoardPolling() {
  stopBoardPolling();
  if (!ONLINE_API) return;
  boardPoll = setInterval(() => {
    if (boardOpen && document.visibilityState === 'visible') refreshBoard({ silent: true });
  }, 4000);
}
function stopBoardPolling() {
  if (boardPoll) {
    clearInterval(boardPoll);
    boardPoll = 0;
  }
}
function openBoard() {
  boardOpen = true;
  boardNick.value = playerName;
  showOverlay(boardEl);
  refreshBoard();
  startBoardPolling();
}
function closeBoard() {
  boardOpen = false;
  boardRequest += 1;
  stopBoardPolling();
  hideOverlay(boardEl);
}

async function refreshBoard(options = {}) {
  const token = ++boardRequest;
  if (!ONLINE_API) {
    renderBoard(loadBoardForClient(), { meta: '本地榜 · 单机模式（未连接全服）' });
    return;
  }
  if (!options.silent) {
    renderBoard(loadBoardForClient(), { meta: '正在连接全服榜…' });
    await Promise.race([
      submitLocalBest().catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 800))
    ]);
    if (!boardOpen || token !== boardRequest) return;
  }
  try {
    const data = await fetchLeaderboard();
    if (!boardOpen || token !== boardRequest) return;
    const entries = data.entries.map((e) => ({
      n: e.name,
      s: e.score,
      h: e.hair,
      t: e.title,
      mine: e.mine
    }));
    const mineIndex = entries.findIndex((e) => e.mine);
    if (mineIndex >= 0) {
      lastRank = mineIndex + 1;
      updateRankLabels();
    }
    renderBoard(entries, {
      remote: true,
      meta: data.total ? `全服实时榜 · ${data.total} 位功臣 · 自动刷新` : '全服实时榜 · 等你来加冕 · 自动刷新'
    });
  } catch (e) {
    if (!boardOpen || token !== boardRequest) return;
    if (options.silent) {
      boardMeta.textContent = '全服实时榜 · 连接中断，重试中…';
      return;
    }
    renderBoard(loadBoardForClient(), { meta: '本地榜 · 网络未连接，稍后自动同步' });
  }
}

function renderBoard(board, options = {}) {
  boardList.replaceChildren();
  if (options.meta) boardMeta.textContent = options.meta;
  if (!board.length) {
    const empty = document.createElement('div');
    empty.className = 'board-empty';
    empty.textContent = options.remote
      ? '全服榜还空着。第一个加冕的会是谁？'
      : '还没有人加冕。第一个国王功臣会是谁？';
    boardList.append(empty);
    return;
  }
  board.slice(0, 10).forEach((e, index) => {
    const row = document.createElement('div');
    const mine = Boolean(e.mine || e.id === lastEntryId);
    row.className = 'board-row' + (index < 3 ? ` top${index + 1}` : '') + (mine ? ' me' : '');
    const rk = document.createElement('span');
    rk.className = 'rk';
    rk.textContent = String(index + 1);
    const who = document.createElement('span');
    who.className = 'who';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = e.n;
    const ti = document.createElement('span');
    ti.className = 'ti';
    ti.textContent = e.t || titleFor(e.s, e.h || 0);
    who.append(nm, ti);
    const sc = document.createElement('span');
    sc.className = 'sc';
    sc.textContent = String(e.s);
    const small = document.createElement('small');
    small.textContent = `发量 ${e.h || 0}`;
    sc.append(small);
    row.append(rk, who, sc);
    boardList.append(row);
  });
}

function renderWinDocs() {
  const box = $('winDocs');
  box.replaceChildren();
  DOCS.forEach((d) => {
    const line = document.createElement('div');
    line.className = 'doc-line';
    const year = document.createElement('b');
    year.textContent = d.year;
    const text = document.createElement('span');
    text.textContent = d.text;
    line.append(year, text);
    box.append(line);
  });
}

function gameOver() {
  if (over || won) return;
  over = true;
  docOpen = false;
  boardOpen = false;
  combo = 0;
  updateComboUI();
  hideQuip();
  pendingDocs = [];
  pendingWinAt = 0;
  hideOverlay(docEl);
  hideOverlay(boardEl);
  recordRun();
  $('overScore').textContent = String(score);
  $('overHair').textContent = `${hair}/40`;
  $('overTitle').textContent = currentTitle || titleFor(score, hair);
  $('overRank').textContent = lastRank ? `第 ${lastRank} 名` : '—';
  showOverlay(overEl);
  beep(392, 0.12, 'sine', 0.05);
  beep(294, 0.16, 'sine', 0.05, 0.13);
  beep(196, 0.3, 'sine', 0.05, 0.3);
}

function winGame() {
  if (won || over) return;
  won = true;
  docOpen = false;
  boardOpen = false;
  combo = 0;
  updateComboUI();
  hideQuip();
  pendingDocs = [];
  pendingWinAt = 0;
  hideOverlay(docEl);
  hideOverlay(boardEl);
  recordRun();
  $('winName').textContent = playerName;
  $('winScore').textContent = String(score);
  $('winTitle').textContent = currentTitle || titleFor(score, hair);
  $('winRank').textContent = lastRank ? `第 ${lastRank} 名` : '—';
  renderWinDocs();
  $('giftCard').classList.add('hidden');
  $('revealGiftBtn').classList.remove('hidden');
  showOverlay(winEl);
  for (let i = 0; i < 120; i += 1) {
    confetti.push({
      x: rand(0, W), y: rand(-90, -4), vx: rand(-30, 30), vy: rand(45, 140),
      w: rand(1, 2.4), h: rand(1, 2.8),
      col: ['#f0d38a', '#c8a14a', '#a53c35', '#f7ead0', '#24375c'][Math.floor(Math.random() * 5)],
      life: rand(2.6, 4.2), max: 4.2
    });
  }
  beep(523, 0.1, 'triangle', 0.055);
  beep(659, 0.1, 'triangle', 0.055, 0.1);
  beep(784, 0.1, 'triangle', 0.055, 0.2);
  beep(1046, 0.32, 'triangle', 0.06, 0.3);
}

function revealGift() {
  $('giftCard').classList.remove('hidden');
  $('revealGiftBtn').classList.add('hidden');
  beep(880, 0.08, 'triangle', 0.05);
  beep(1174, 0.18, 'triangle', 0.05, 0.08);
  setTimeout(() => {
    $('giftCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}

function saveBoardNick() {
  const n = (boardNick.value || '').trim().slice(0, 8) || '长发骑士';
  const oldId = getPlayerId(playerName);
  playerName = n;
  saveNick(playerName);
  try { localStorage.setItem(STORAGE_PLAYER + playerName, oldId); } catch (e) {}
  boardNick.value = playerName;
  playerInput.value = playerName;
  hudPlayer.textContent = playerName;
  const board = loadBoardForClient();
  let changed = false;
  for (const entry of board) {
    if (entry.cid === oldId && entry.n !== playerName) {
      entry.n = playerName;
      changed = true;
    }
  }
  if (changed) saveBoard(board);
  beep(520, 0.05, 'sine', 0.03);
  if (boardOpen) refreshBoard();
}

function bindEvents() {
  $('startBtn').addEventListener('click', startGame);
  playerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });
  $('rulesBtn').addEventListener('click', openRules);
  $('rulesClose').addEventListener('click', closeRules);
  $('chainBtn').addEventListener('click', openChain);
  $('rulesChainBtn').addEventListener('click', openChain);
  $('chainClose').addEventListener('click', closeChain);
  nextBox.addEventListener('click', openChain);
  nextBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChain(); }
  });
  brandSeal.addEventListener('click', () => {
    if (started && !introOpen && !over && !won) showQuip(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
  });
  brandSeal.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && started && !introOpen && !over && !won) {
      e.preventDefault();
      showQuip(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
    }
  });
  $('docClose').addEventListener('click', closeDoc);
  $('retryBtn').addEventListener('click', retry);
  $('winRetryBtn').addEventListener('click', retry);
  $('switchBtn').addEventListener('click', showIntro);
  $('winSwitchBtn').addEventListener('click', showIntro);
  $('boardBtn').addEventListener('click', () => { if (!introOpen) openBoard(); });
  $('introBoardBtn').addEventListener('click', openBoard);
  $('overBoardBtn').addEventListener('click', openBoard);
  $('winBoardBtn').addEventListener('click', openBoard);
  $('boardClose').addEventListener('click', closeBoard);
  $('saveNick').addEventListener('click', saveBoardNick);
  boardNick.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBoardNick(); });
  $('revealGiftBtn').addEventListener('click', revealGift);
  musicBtn.addEventListener('click', () => {
    musicOn = !musicOn;
    updateAudioButtons();
    saveAudioPrefs();
    if (window.KingMusic) {
      KingMusic.setEnabled(musicOn);
      if (musicOn && started) KingMusic.start().catch(() => {});
    }
    if (soundOn) beep(440, 0.05, 'sine', 0.03);
  });
  muteBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    updateAudioButtons();
    saveAudioPrefs();
    if (soundOn) beep(440, 0.05, 'sine', 0.03);
  });
  cv.addEventListener('pointerdown', (e) => {
    if (paused()) return;
    dragging = true;
    cv.setPointerCapture(e.pointerId);
    moveAim(e);
  });
  cv.addEventListener('pointermove', (e) => { if (dragging) moveAim(e); });
  cv.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    moveAim(e);
    if (canDrop && !paused()) drop();
  });
  cv.addEventListener('pointercancel', () => { dragging = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!chainOverlay.classList.contains('hidden')) closeChain();
      else if (!boardEl.classList.contains('hidden')) closeBoard();
      else if (!rulesEl.classList.contains('hidden')) closeRules();
      else if (!docEl.classList.contains('hidden')) closeDoc();
    }
  });
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', () => setTimeout(onViewportChange, 200));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (window.KingMusic) KingMusic.pause();
      if (actx) actx.suspend().catch(() => {});
    } else {
      if (window.KingMusic && musicOn) KingMusic.resume();
      if (actx && soundOn) actx.resume().catch(() => {});
      if (boardOpen) refreshBoard({ silent: true });
    }
  });
  window.addEventListener('focus', () => { if (boardOpen) refreshBoard({ silent: true }); });
  window.addEventListener('beforeunload', () => { if (actx) actx.close(); });
}

function init() {
  playerName = loadNick();
  migrateLegacyClientIds();
  best = loadBest();
  loadAudioPrefs();
  playerInput.value = playerName;
  boardNick.value = playerName;
  hudPlayer.textContent = playerName;
  updateAudioButtons();
  const modeLabel = $('modeLabel');
  if (modeLabel) modeLabel.textContent = ONLINE_API ? '全服实时榜' : '单机模式';
  bindEvents();
  if (window.KingMusic) KingMusic.preload();
  reset();
  syncLocalScores().catch(() => {});
  fit();
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(loop);
  });
  setTimeout(fit, 60);
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__forty = {
      state: () => ({ score, hair, best, combo, over, won, pieces: pieces.length, started, chain: chainOpen, paused: paused(), boardOpen, playerId: getPlayerId(playerName) }),
      sync: syncLocalScores,
      refresh: () => refreshBoard({ silent: true }),
      start: (name) => { if (name) playerInput.value = name; startGame(); },
      seed: () => {
        pieces = [];
        const xs = [22, 47, 72, 97, 122, 146];
        TIERS.forEach((T, i) => {
          const p = newPiece(xs[i % xs.length], 70 + Math.floor(i / xs.length) * 52, i);
          p.age = 2;
          pieces.push(p);
        });
        debugPause = true;
        updateUI();
      },
      resume: () => { debugPause = false; },
      setHair: (n) => { hair = clamp(Number(n) || 0, 0, 40); updateUI(); },
      hairUp: (n = 1) => addHair(Number(n) || 1),
      redPacket: () => triggerRedPacket(W / 2, H / 2),
      chain: openChain,
      pair: (t = 0, x = W / 2) => {
        pieces.push(newPiece(x - TIERS[t].r, 180, t, 24, 0));
        pieces.push(newPiece(x + TIERS[t].r, 180, t, -24, 0));
        debugPause = false;
      },
      doc: (i) => showDoc(i),
      win: () => { hair = 40; score = Math.max(score, 3280); updateUI(); winGame(); },
      lose: () => { hair = Math.max(hair, 23); score = Math.max(score, 1460); updateUI(); gameOver(); },
      board: openBoard,
      audio: () => ({
        musicOn,
        sfxOn: soundOn,
        music: window.KingMusic ? KingMusic.state() : null
      }),
      sheet: () => {
        const c = document.createElement('canvas');
        c.width = 900;
        c.height = 900;
        c.style.cssText = 'position:fixed;inset:0;z-index:9999;width:900px;height:900px;background:#f6ead1';
        const g = c.getContext('2d');
        g.fillStyle = '#f6ead1';
        g.fillRect(0, 0, 900, 900);
        TIERS.forEach((T, i) => {
          const col = i % 3, row = Math.floor(i / 3);
          const x = col * 300 + 150, y = row * 300 + 130;
          const sp = getSprite(i);
          const k = Math.min(220 / sp.width, 220 / sp.height);
          g.drawImage(sp, x - sp.width * k / 2, y - sp.height * k / 2, sp.width * k, sp.height * k);
          g.fillStyle = '#3b2917';
          g.font = '700 19px "Songti SC", Georgia, serif';
          g.textAlign = 'center';
          g.fillText(T.name, x, y + 140);
        });
        document.body.append(c);
      },
      reset,
      fit
    };
  }
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  step(now, dt);
  draw();
  drawNext();
  requestAnimationFrame(loop);
}

init();
