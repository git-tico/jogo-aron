'use strict';

const VERSION = 'v9';

// ─── CANVAS ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let W, H;
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', () => {
  resize();
  if (game) { game.rocket.x = W / 2; rebuildBackground(); }
});

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CFG = {
  GRAVITY:       0.055,
  THRUST:       -0.25,
  RELEASE_DAMP:  0.92,
  MAX_UP:       -11,
  MAX_SIDE:      5,
  FRIC_X:        0.86,
  ROCKET_H:      86,
  ROCKET_W:      38,
  FLOOR_RATIO:   0.80,
  FINISH_ALT:    30000,
  CELEBRATE_S:   10,
  STARS:         150,
  GEM_R:         28,
  GEM_SPACING:   400,
};

// ─── PALETTE (kawaii cosmic — saturado mas macio) ────────────────────────────
const PAL = {
  ink:        '#1b1240',     // outline universal — não preto puro, roxo profundo
  inkSoft:    'rgba(27,18,64,0.55)',
  // céu (atmosfera baixa)
  skyTop:     '#3a2a8c',
  skyMid:     '#5b3aa8',
  skyLow:     '#a85ec8',
  skyGlow:    '#ffb37a',     // um sopro de pôr-do-sol no horizonte
  // espaço (alta altitude)
  spaceTop:   '#0a0628',
  spaceMid:   '#1a0b3e',
  spaceLow:   '#3a1860',
};

// ─── AUDIO ───────────────────────────────────────────────────────────────────
let actx = null;
function audio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

function tone(freq, vol, dur, freqEnd, type) {
  try {
    const a = audio();
    const osc = a.createOscillator();
    const g   = a.createGain();
    osc.connect(g);
    g.connect(a.destination);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, a.currentTime);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    osc.start(a.currentTime);
    osc.stop(a.currentTime + dur + 0.01);
  } catch (_) {}
}

function sndBoost()     { tone(260, 0.10, 0.15, 480); }
function sndMilestone() { [[523, 0], [659, 130], [784, 260]].forEach(([f, ms]) => setTimeout(() => tone(f, 0.20, 0.55), ms)); }
function sndCelebrate() { [523, 587, 659, 784, 880, 784, 880, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.45), i * 160)); }
function sndGem()       { [880, 1175, 1568, 2093].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.30), i * 60)); }

const BG_MELODY = [523, 659, 784, 880, 784, 659, 523, 392, 440, 523, 659, 880, 784, 659];
let bgMusic = null;

function startBgMusic() {
  if (bgMusic) return;
  const a = audio();

  function makeDrone(freq, detune, vol) {
    const osc = a.createOscillator();
    const g   = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value    = detune;
    g.gain.value        = vol;
    osc.connect(g); g.connect(a.destination);
    osc.start();
    return { osc, g };
  }

  const d1 = makeDrone(110,   0, 0.045);
  const d2 = makeDrone(110,  10, 0.030);
  const d3 = makeDrone(220,  -5, 0.020);

  let step = 0;
  function scheduleNote() {
    if (!bgMusic) return;
    const freq = BG_MELODY[step % BG_MELODY.length];
    step++;
    tone(freq, 0.055, 0.9, freq * 0.96, 'sine');
    bgMusic.timer = setTimeout(scheduleNote, 800);
  }

  bgMusic = { d1, d2, d3, timer: null };
  bgMusic.timer = setTimeout(scheduleNote, 400);
}

function stopBgMusic() {
  if (!bgMusic) return;
  clearTimeout(bgMusic.timer);
  [bgMusic.d1, bgMusic.d2, bgMusic.d3].forEach(({ osc, g }) => {
    try {
      g.gain.setTargetAtTime(0, audio().currentTime, 0.8);
      osc.stop(audio().currentTime + 2);
    } catch (_) {}
  });
  bgMusic = null;
}

// ─── STATE ───────────────────────────────────────────────────────────────────
let game;

function newGame() {
  game = {
    phase:       'playing',
    altitude:    0,
    scroll:      0,
    celebrateAt: 0,
    tapped:      false,
    hintAlpha:   1,

    rocket: { x: W / 2, y: H * CFG.FLOOR_RATIO, vx: 0, vy: 0 },

    milestones: [false, false],

    stars:    makeStars(),
    planets:  makePlanets(),
    clouds:   makeClouds(),
    gems:     makeGems(),
    nebulae:  makeNebulae(),
    moons:    makeMoons(),

    shooting: [],
    flames:   [],
    bursts:   [],
    confetti: [],

    frame: 0,
  };
}

function rebuildBackground() {
  if (!game) return;
  game.stars   = makeStars();
  game.planets = makePlanets();
  game.clouds  = makeClouds();
  game.nebulae = makeNebulae();
  game.moons   = makeMoons();
}

// ─── BACKGROUND FACTORIES ────────────────────────────────────────────────────
function makeStars() {
  return Array.from({ length: CFG.STARS }, () => {
    const k = Math.random();
    return {
      x:     rng(0, W),
      y:     rng(0, H * 5),
      r:     rng(0.6, 2.8),
      layer: Math.floor(rng(0, 3)),
      phase: rng(0, Math.PI * 2),
      spd:   rng(0.008, 0.022),
      kind:  k < 0.22 ? 'sparkle' : (k < 0.30 ? 'cross' : 'dot'),
      tint:  k < 0.10 ? 'pink' : (k < 0.18 ? 'cyan' : (k < 0.24 ? 'gold' : 'white')),
    };
  });
}

function makePlanets() {
  return [
    { x: W * 0.78, wy:  3000, r: 60, type: 'lava',     rings: false, ringTilt: 0,     hasMoon: false },
    { x: W * 0.20, wy:  7000, r: 50, type: 'ocean',    rings: true,  ringTilt: -0.22, hasMoon: false },
    { x: W * 0.72, wy: 12000, r: 76, type: 'lavender', rings: false, ringTilt: 0,     hasMoon: true  },
    { x: W * 0.24, wy: 17000, r: 46, type: 'mint',     rings: true,  ringTilt:  0.28, hasMoon: false },
    { x: W * 0.74, wy: 22000, r: 66, type: 'sun',      rings: false, ringTilt: 0,     hasMoon: false },
    { x: W * 0.30, wy: 27000, r: 84, type: 'coral',    rings: true,  ringTilt: -0.14, hasMoon: true  },
  ];
}

function makeClouds() {
  return Array.from({ length: 8 }, (_, i) => ({
    x:  rng(W * 0.05, W * 0.95),
    wy: i * 95 + 30,
    wr: rng(60, 130),
    hr: rng(20, 32),
    seed: rng(0, 100),
  }));
}

function makeGems() {
  const gems = [];
  // Paleta de cores fofas e harmoniosas (oklch-inspired) — fixa por gem
  const PALETTE = [
    { h: 340, name: 'rose'  },
    { h:  50, name: 'gold'  },
    { h: 160, name: 'mint'  },
    { h: 200, name: 'sky'   },
    { h: 280, name: 'lilac' },
    { h:  20, name: 'coral' },
  ];
  let i = 0;
  for (let alt = 400; alt < CFG.FINISH_ALT - 200; alt += CFG.GEM_SPACING + rng(-80, 80)) {
    const p = PALETTE[i % PALETTE.length];
    gems.push({
      x:    rng(W * 0.18, W * 0.82),
      wy:   alt,
      bob:  rng(0, Math.PI * 2),
      hue:  p.h,
      taken: false,
    });
    i++;
  }
  return gems;
}

function makeNebulae() {
  return Array.from({ length: 9 }, () => ({
    x:  rng(0, W),
    wy: rng(2000, 28000),
    r:  rng(220, 380),
    hue: [285, 320, 200, 260, 340, 220][Math.floor(rng(0, 6))],
    seed: rng(0, 100),
  }));
}

function makeMoons() {
  // Luas pequenas que orbitam alguns planetas (decorativas)
  return [];
}

// ─── PARTICLES ───────────────────────────────────────────────────────────────
function spawnFlame(x, y, upSpeed) {
  const s = Math.min(1, upSpeed / 8);
  const n = 2 + Math.round(s * 3);
  for (let i = 0; i < n; i++) {
    game.flames.push({
      x: x + rng(-9, 9),
      y: y + CFG.ROCKET_H * 0.49,
      vx: rng(-1, 1),
      vy: rng(2, 5) * (1 + s),
      r:  rng(6, 12) + s * 5,
      hue: rng(10, 40),
      life: 1,
      dec:  rng(0.05, 0.09),
    });
  }
}

function spawnBurst(x, y, n) {
  n = n || 24;
  for (let i = 0; i < n; i++) {
    const a  = (i / n) * Math.PI * 2 + rng(-0.3, 0.3);
    const sp = rng(3, 9);
    game.bursts.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r:  rng(4, 9),
      hue: rng(0, 360),
      life: 1,
      dec: rng(0.016, 0.026),
    });
  }
}

function spawnConfetti() {
  const COLS = ['#ff6b8a','#ffcb47','#5fc4ff','#ff8a3d','#62e0a5','#c98cff','#ff4d6b'];
  for (let i = 0; i < 6; i++) {
    game.confetti.push({
      x:   rng(0, W),
      y:   rng(-30, -5),
      vx:  rng(-3, 3),
      vy:  rng(1.5, 3.5),
      rot: rng(0, Math.PI * 2),
      rv:  rng(-0.18, 0.18),
      w:   rng(8, 16),
      h:   rng(4, 9),
      col: COLS[Math.floor(rng(0, COLS.length))],
      shape: ['rect','circle','star'][Math.floor(rng(0, 3))],
      life: 1,
    });
  }
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
let touchCount = 0;
let mouseDown  = false;
let dragX      = null;

function isPressed() { return touchCount > 0 || mouseDown; }

function startPress(cx) {
  dragX = cx;
  if (actx && actx.state === 'suspended') actx.resume();
  if (game.phase === 'playing') {
    game.tapped = true;
    sndBoost();
    startBgMusic();
  }
}

function moveDrag(cx) {
  if (dragX === null || game.phase !== 'playing') return;
  game.rocket.vx = clamp(game.rocket.vx + (cx - dragX) * 0.35, -CFG.MAX_SIDE, CFG.MAX_SIDE);
  dragX = cx;
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const wasPressed = isPressed();
  touchCount = e.touches.length;
  if (!wasPressed) startPress(e.touches[0].clientX);
  else dragX = e.touches[0].clientX;
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX);
}, { passive: false });

function onTouchEnd(e) {
  e.preventDefault();
  touchCount = e.touches.length;
  if (!isPressed()) dragX = null;
  else dragX = e.touches[0].clientX;
}
canvas.addEventListener('touchend',    onTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  const wasPressed = isPressed();
  mouseDown = true;
  if (!wasPressed) startPress(e.clientX);
  else dragX = e.clientX;
});
canvas.addEventListener('mousemove', e => {
  if (!mouseDown) return;
  e.preventDefault();
  moveDrag(e.clientX);
});
canvas.addEventListener('mouseup', e => {
  e.preventDefault();
  mouseDown = false;
  if (!isPressed()) dragX = null;
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
function update() {
  game.frame++;

  if (game.phase === 'win') {
    if (game.frame % 3 === 0) spawnConfetti();
    if (Date.now() - game.celebrateAt > CFG.CELEBRATE_S * 1000) newGame();
    tickParticles();
    return;
  }

  const r = game.rocket;

  r.vy += CFG.GRAVITY;
  if (isPressed())          r.vy += CFG.THRUST;
  else if (r.vy < 0)        r.vy *= CFG.RELEASE_DAMP;
  r.vx *= CFG.FRIC_X;
  r.vy  = Math.max(CFG.MAX_UP, r.vy);
  r.x  += r.vx;
  r.y  += r.vy;

  r.x = clamp(r.x, CFG.ROCKET_W * 0.55, W - CFG.ROCKET_W * 0.55);
  const floor    = H * CFG.FLOOR_RATIO;
  const followY  = H * 0.45;
  if (r.y > floor)   { r.y = floor; r.vy = 0; }
  if (r.y < followY) { r.y = followY; }

  if (r.vy < 0) {
    const gain = Math.abs(r.vy) * 0.35;
    game.altitude += gain;
    game.scroll   += gain;
  }

  if (game.tapped) {
    game.hintAlpha = Math.max(0, game.hintAlpha - 0.04);
  } else if (game.frame > 360) {
    game.hintAlpha = Math.max(0, game.hintAlpha - 0.005);
  }

  if (r.vy < -0.8) spawnFlame(r.x, r.y, -r.vy);

  if (game.frame % 95 === 0 && game.altitude > CFG.FINISH_ALT * 0.18) {
    game.shooting.push({
      x: rng(0, W),
      y: rng(H * 0.05, H * 0.45),
      vx: rng(3, 7),
      vy: rng(1, 3),
      life: 1,
    });
  }

  const hitR = (CFG.ROCKET_W * 0.6) + CFG.GEM_R;
  const hitR2 = hitR * hitR;
  game.gems.forEach(g => {
    if (g.taken) return;
    const sy = game.scroll - g.wy + H * 0.5;
    if (sy < -CFG.GEM_R || sy > H + CFG.GEM_R) return;
    const dx = g.x - r.x;
    const dy = sy - r.y;
    if (dx * dx + dy * dy < hitR2) {
      g.taken = true;
      sndGem();
      spawnBurst(g.x, sy, 18);
    }
  });

  const prog = game.altitude / CFG.FINISH_ALT;
  [0.40, 0.75].forEach((th, i) => {
    if (!game.milestones[i] && prog >= th) {
      game.milestones[i] = true;
      sndMilestone();
      spawnBurst(r.x, r.y, 22);
    }
  });

  if (prog >= 1) {
    game.phase = 'win';
    game.celebrateAt = Date.now();
    sndCelebrate();
    spawnBurst(r.x,        r.y,        44);
    spawnBurst(W * 0.22,   H * 0.28,   28);
    spawnBurst(W * 0.78,   H * 0.35,   28);
  }

  tickParticles();
}

function tickParticles() {
  game.flames = game.flames.filter(p => {
    p.x += p.vx; p.y += p.vy; p.r *= 0.96; p.life -= p.dec;
    return p.life > 0;
  });
  game.bursts = game.bursts.filter(p => {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.96; p.vy *= 0.96; p.vy += 0.08;
    p.life -= p.dec;
    return p.life > 0;
  });
  game.shooting = game.shooting.filter(s => {
    s.x += s.vx; s.y += s.vy; s.life -= 0.018;
    return s.life > 0;
  });
  game.confetti = game.confetti.filter(c => {
    c.x += c.vx; c.y += c.vy; c.vy += 0.04;
    c.rot += c.rv; c.life -= 0.004;
    return c.life > 0 && c.y < H + 40;
  });
}

// ─── DRAW ────────────────────────────────────────────────────────────────────
function draw() {
  const prog = Math.min(1, game.altitude / CFG.FINISH_ALT);

  drawBg(prog);
  drawNebulae(prog);
  drawStars(prog);
  drawClouds(prog);
  drawPlanets();
  drawShooting();
  drawGems();
  drawFlames();
  drawBursts();
  drawRocket(game.rocket.x, game.rocket.y);
  drawProgress(prog);
  drawHint();
  drawVersion();

  if (game.phase === 'win') {
    drawConfetti();
    drawWin();
  }
}

// ─── BACKGROUND ──────────────────────────────────────────────────────────────
function drawBg(prog) {
  // Mistura cinemática: céu rico de pôr-do-sol embaixo → espaço profundo em cima
  const t = Math.min(1, prog * 1.3);

  const grd = ctx.createLinearGradient(0, 0, 0, H);
  // topo (já espacial bem cedo)
  grd.addColorStop(0,    mixHex(PAL.skyTop, PAL.spaceTop, t));
  grd.addColorStop(0.40, mixHex(PAL.skyMid, PAL.spaceMid, t));
  grd.addColorStop(0.80, mixHex(PAL.skyLow, PAL.spaceLow, t));
  // base com sopro de pôr-do-sol que some no espaço
  grd.addColorStop(1,    mixHex(PAL.skyGlow, PAL.spaceLow, t));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Vinheta sutil nos cantos pra dar profundidade
  const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.4, W * 0.5, H * 0.5, Math.max(W, H) * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function drawNebulae(prog) {
  const alpha = Math.min(1, prog * 2.5);
  if (alpha < 0.05) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  game.nebulae.forEach(n => {
    const sy = game.scroll - n.wy + H * 0.5;
    if (sy < -n.r || sy > H + n.r) return;
    // duas camadas: uma quente, uma fria — efeito Hubble bonito
    const grd = ctx.createRadialGradient(n.x, sy, 0, n.x, sy, n.r);
    grd.addColorStop(0,    `hsla(${n.hue},85%,62%,${(0.30 * alpha).toFixed(2)})`);
    grd.addColorStop(0.4,  `hsla(${n.hue},85%,55%,${(0.14 * alpha).toFixed(2)})`);
    grd.addColorStop(1,    `hsla(${n.hue},85%,40%,0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(n.x - n.r, sy - n.r, n.r * 2, n.r * 2);

    const grd2 = ctx.createRadialGradient(n.x + n.r * 0.3, sy - n.r * 0.2, 0, n.x + n.r * 0.3, sy - n.r * 0.2, n.r * 0.8);
    grd2.addColorStop(0,   `hsla(${(n.hue + 60) % 360},90%,68%,${(0.18 * alpha).toFixed(2)})`);
    grd2.addColorStop(1,   `hsla(${(n.hue + 60) % 360},90%,50%,0)`);
    ctx.fillStyle = grd2;
    ctx.fillRect(n.x - n.r, sy - n.r, n.r * 2, n.r * 2);
  });
  ctx.restore();
}

function drawStars(prog) {
  const alpha = Math.min(1, prog * 4);
  if (alpha < 0.02) return;
  const rates = [0.2, 0.5, 1.0];
  game.stars.forEach(s => {
    const offset = game.scroll * rates[s.layer];
    let sy = s.y + (offset % (H * 5));
    while (sy >  H + 10) sy -= H * 5;
    while (sy < -10)     sy += H * 5;
    s.phase += s.spd;
    const a = (0.75 + Math.sin(s.phase) * 0.25) * alpha;

    let col;
    if      (s.tint === 'pink') col = `rgba(255,200,230,${a.toFixed(2)})`;
    else if (s.tint === 'cyan') col = `rgba(180,230,255,${a.toFixed(2)})`;
    else if (s.tint === 'gold') col = `rgba(255,235,170,${a.toFixed(2)})`;
    else                        col = `rgba(255,255,255,${a.toFixed(2)})`;

    if (s.kind === 'sparkle') {
      // 4-pointed sparkle (estrela com pontas finas e longas, estilo Pixar)
      const r = s.r * 3.0;
      ctx.save();
      ctx.translate(s.x, sy);
      ctx.fillStyle = col;
      // forma de losango fino com 4 pontas
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(s.r * 0.4, -s.r * 0.4, r, 0);
      ctx.quadraticCurveTo(s.r * 0.4,  s.r * 0.4, 0, r);
      ctx.quadraticCurveTo(-s.r * 0.4, s.r * 0.4, -r, 0);
      ctx.quadraticCurveTo(-s.r * 0.4, -s.r * 0.4, 0, -r);
      ctx.closePath();
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    } else if (s.kind === 'cross') {
      // cruz fina com glow
      const r = s.r * 2.2;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.8, s.r * 0.55);
      ctx.lineCap = 'round';
      ctx.shadowColor = col;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(s.x - r, sy); ctx.lineTo(s.x + r, sy);
      ctx.moveTo(s.x, sy - r); ctx.lineTo(s.x, sy + r);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(s.x, sy, s.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // bolinha com mini-glow
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = s.r * 3;
      ctx.beginPath();
      ctx.arc(s.x, sy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }
  });
}

// ─── CLOUDS (puffy, multi-camada com sombra e topo iluminado) ────────────────
function drawClouds(prog) {
  const alpha = Math.max(0, 1 - prog * 8);
  if (alpha < 0.01) return;
  game.clouds.forEach(c => {
    const sy = c.wy + game.scroll;
    if (sy < -100 || sy > H + 100) return;
    drawCloud(c.x, sy, c.wr, c.hr, alpha);
  });
}

function drawCloud(cx, cy, wr, hr, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const puffs = [
    [-0.55, 0.10, 0.55],
    [-0.20, -0.10, 0.85],
    [ 0.18, -0.10, 0.88],
    [ 0.55, 0.10, 0.55],
    [ 0.00, -0.30, 0.60],
    [-0.35, 0.25, 0.50],
    [ 0.35, 0.25, 0.50],
  ];

  // ─ Sombra inferior macia (fora do path) ─
  ctx.fillStyle = 'rgba(40,30,90,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + hr * 0.4, wr * 0.85, hr * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // ─ Constrói path único pra cor base + outline ─
  const path = new Path2D();
  puffs.forEach(([ox, oy, rs]) => {
    path.ellipse(cx + ox * wr, cy + oy * hr, wr * rs, hr * rs * 0.95, 0, 0, Math.PI * 2);
  });

  // base
  ctx.fillStyle = '#f4ebff';
  ctx.fill(path);

  // sombra interna (gradiente pro chão)
  ctx.save();
  ctx.clip(path);
  const shade = ctx.createLinearGradient(0, cy - hr, 0, cy + hr);
  shade.addColorStop(0,   'rgba(255,255,255,0)');
  shade.addColorStop(0.5, 'rgba(160,130,200,0.0)');
  shade.addColorStop(1,   'rgba(80,50,140,0.45)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - wr * 1.5, cy - hr * 2, wr * 3, hr * 4);
  // highlight no topo (tom rosa-pêssego do céu)
  const hi = ctx.createLinearGradient(0, cy - hr * 1.2, 0, cy + hr * 0.2);
  hi.addColorStop(0,   'rgba(255,200,180,0.55)');
  hi.addColorStop(0.5, 'rgba(255,220,200,0.20)');
  hi.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.fillRect(cx - wr * 1.5, cy - hr * 2, wr * 3, hr * 4);
  ctx.restore();

  ctx.restore();
}

// ─── PLANETS (chunky com expressão) ──────────────────────────────────────────
const PLANET_THEMES = {
  lava:     { base: '#ff6a3d', dark: '#7a1f0a', light: '#ffd4a8', accent: '#ffe28a', kind: 'lava'    },
  ocean:    { base: '#3aa8e0', dark: '#0e3e6e', light: '#bce4ff', accent: '#5fd0a8', kind: 'ocean'   },
  lavender: { base: '#a878dc', dark: '#3e1d7a', light: '#e8d4ff', accent: '#ffb8e0', kind: 'gas'     },
  mint:     { base: '#3edba0', dark: '#0f5c44', light: '#c9f5dd', accent: '#fff3a8', kind: 'land'    },
  sun:      { base: '#ffb83a', dark: '#a85608', light: '#fff0a8', accent: '#ff7a3d', kind: 'gas'     },
  coral:    { base: '#ff6b80', dark: '#7a1a30', light: '#ffd0d8', accent: '#ffd24a', kind: 'land'    },
};

function drawPlanets() {
  game.planets.forEach(p => {
    const sy = game.scroll - p.wy + H * 0.5;
    if (sy < -p.r * 3.5 || sy > H + p.r * 3.5) return;
    drawPlanet(p, sy);
  });
}

function drawPlanet(p, sy) {
  const t = PLANET_THEMES[p.type];
  ctx.save();

  // ── Glow externo (atmosfera) ──
  const glow = ctx.createRadialGradient(p.x, sy, p.r, p.x, sy, p.r * 1.55);
  glow.addColorStop(0, t.base + '80');
  glow.addColorStop(0.5, t.base + '30');
  glow.addColorStop(1, t.base + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(p.x - p.r * 1.7, sy - p.r * 1.7, p.r * 3.4, p.r * 3.4);

  // ── Anel — parte de trás ──
  if (p.rings) {
    ctx.save();
    ctx.translate(p.x, sy);
    ctx.rotate(p.ringTilt);
    // sombra do anel atrás
    ctx.strokeStyle = t.dark;
    ctx.lineWidth = Math.max(5, p.r * 0.18);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 1.8, p.r * 0.46, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    // brilho fino atrás
    ctx.strokeStyle = t.light + 'cc';
    ctx.lineWidth = Math.max(1.5, p.r * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, -2, p.r * 1.8, p.r * 0.46, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();
  }

  // ── Corpo do planeta ──
  // Gradiente macio claro→base
  const body = ctx.createRadialGradient(
    p.x - p.r * 0.4, sy - p.r * 0.45, p.r * 0.05,
    p.x, sy, p.r
  );
  body.addColorStop(0,   t.light);
  body.addColorStop(0.45, t.base);
  body.addColorStop(1,   t.dark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(p.x, sy, p.r, 0, Math.PI * 2);
  ctx.fill();

  // Detalhe de superfície dentro do círculo
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, sy, p.r, 0, Math.PI * 2);
  ctx.clip();

  if (t.kind === 'gas') {
    // listras suaves (várias bandas) — Júpiter-style
    for (let i = -3; i <= 3; i++) {
      const yOff = i * p.r * 0.30;
      const w = p.r * (1.0 + Math.sin(i * 1.7) * 0.1);
      ctx.fillStyle = i % 2 === 0 ? t.dark : t.accent;
      ctx.globalAlpha = i % 2 === 0 ? 0.35 : 0.45;
      ctx.beginPath();
      ctx.ellipse(p.x, sy + yOff, w, p.r * 0.10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // grande mancha (olho de Júpiter)
    ctx.fillStyle = t.accent;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.ellipse(p.x + p.r * 0.15, sy + p.r * 0.25, p.r * 0.20, p.r * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (t.kind === 'lava') {
    // crateras + veias de lava
    ctx.fillStyle = t.dark;
    ctx.globalAlpha = 0.45;
    const seed = (p.wy * 0.001) | 0;
    for (let i = 0; i < 6; i++) {
      const a = seed * 0.7 + i * 1.1;
      const rad = p.r * (0.30 + ((seed + i) % 4) * 0.13);
      const cx = p.x + Math.cos(a) * rad;
      const cy = sy  + Math.sin(a) * rad * 0.85;
      const cr = p.r * (0.10 + ((seed + i * 3) % 4) * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    // veias amarelas brilhando
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = Math.max(1.5, p.r * 0.04);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - p.r * 0.5, sy + p.r * 0.1);
    ctx.quadraticCurveTo(p.x, sy + p.r * 0.4, p.x + p.r * 0.55, sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - p.r * 0.2, sy - p.r * 0.5);
    ctx.quadraticCurveTo(p.x + p.r * 0.1, sy - p.r * 0.2, p.x + p.r * 0.4, sy - p.r * 0.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (t.kind === 'ocean') {
    // continentes verdes + ondinhas brancas
    ctx.fillStyle = t.accent;
    ctx.globalAlpha = 0.95;
    // continente 1
    ctx.beginPath();
    ctx.ellipse(p.x - p.r * 0.25, sy + p.r * 0.10, p.r * 0.40, p.r * 0.25, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // continente 2 (menor)
    ctx.beginPath();
    ctx.ellipse(p.x + p.r * 0.35, sy - p.r * 0.30, p.r * 0.22, p.r * 0.15, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // ondinhas
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.2, p.r * 0.025);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const wy = sy + (i - 1) * p.r * 0.25 + p.r * 0.5;
      ctx.beginPath();
      ctx.moveTo(p.x - p.r * 0.5, wy);
      ctx.quadraticCurveTo(p.x - p.r * 0.2, wy - 3, p.x + p.r * 0.1, wy);
      ctx.quadraticCurveTo(p.x + p.r * 0.4, wy + 3, p.x + p.r * 0.6, wy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (t.kind === 'land') {
    // pangea estilizada + pequenos pontinhos amarelos (cidades?)
    ctx.fillStyle = t.dark;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(p.x + p.r * 0.05, sy + p.r * 0.05, p.r * 0.55, p.r * 0.40, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x - p.r * 0.45, sy - p.r * 0.30, p.r * 0.18, p.r * 0.12, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // sparkles na superfície
    ctx.fillStyle = t.accent;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.8 + (p.wy * 0.0003);
      const rad = p.r * 0.5;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * rad, sy + Math.sin(a) * rad * 0.7, p.r * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Highlight especular (camera light) — globo
  const hi = ctx.createRadialGradient(
    p.x - p.r * 0.45, sy - p.r * 0.55, 0,
    p.x - p.r * 0.45, sy - p.r * 0.55, p.r * 0.7
  );
  hi.addColorStop(0,   'rgba(255,255,255,0.55)');
  hi.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  hi.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.ellipse(p.x - p.r * 0.45, sy - p.r * 0.55, p.r * 0.50, p.r * 0.38, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Sombra do terminator (lado oposto)
  const shade = ctx.createRadialGradient(
    p.x + p.r * 0.7, sy + p.r * 0.7, p.r * 0.1,
    p.x + p.r * 0.7, sy + p.r * 0.7, p.r * 1.5
  );
  shade.addColorStop(0,   'rgba(10,5,25,0.45)');
  shade.addColorStop(0.6, 'rgba(10,5,25,0.18)');
  shade.addColorStop(1,   'rgba(10,5,25,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(p.x - p.r, sy - p.r, p.r * 2, p.r * 2);

  ctx.restore(); // fim clip

  // Outline grosso (estilo cartoon)
  ctx.lineWidth = Math.max(2, p.r * 0.045);
  ctx.strokeStyle = PAL.ink;
  ctx.beginPath();
  ctx.arc(p.x, sy, p.r, 0, Math.PI * 2);
  ctx.stroke();

  // ── Anel — parte da frente ──
  if (p.rings) {
    ctx.save();
    ctx.translate(p.x, sy);
    ctx.rotate(p.ringTilt);
    // anel principal (grosso)
    ctx.strokeStyle = t.light;
    ctx.lineWidth = Math.max(5, p.r * 0.18);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 1.8, p.r * 0.46, 0, 0, Math.PI);
    ctx.stroke();
    // outline do anel
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = Math.max(1.2, p.r * 0.035);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 1.8, p.r * 0.46, 0, 0, Math.PI * 2);
    ctx.stroke();
    // brilho central do anel
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, p.r * 0.04);
    ctx.beginPath();
    ctx.ellipse(0, -2, p.r * 1.8, p.r * 0.46, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.restore();
  }

  // ── Lua orbitando (decorativa) ──
  if (p.hasMoon) {
    const mAng = (game.frame * 0.005) + p.wy * 0.001;
    const mr = p.r * 0.18;
    const mx = p.x + Math.cos(mAng) * (p.r * 1.55);
    const my = sy  + Math.sin(mAng) * (p.r * 0.5);
    // pequeno glow
    const mGlow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 2.2);
    mGlow.addColorStop(0, 'rgba(255,240,200,0.5)');
    mGlow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = mGlow;
    ctx.fillRect(mx - mr * 2.2, my - mr * 2.2, mr * 4.4, mr * 4.4);
    // corpo
    const moonGrd = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.4, 0, mx, my, mr);
    moonGrd.addColorStop(0, '#fff8e8');
    moonGrd.addColorStop(1, '#a89878');
    ctx.fillStyle = moonGrd;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    // outline
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
  }

  ctx.restore();
}

function drawShooting() {
  game.shooting.forEach(s => {
    ctx.save();
    ctx.globalAlpha = s.life;
    const tx = s.x - s.vx * 13;
    const ty = s.y - s.vy * 13;
    // Cauda gradiente cor-de-rosa-clara → branco → transparente
    const grd = ctx.createLinearGradient(s.x, s.y, tx, ty);
    grd.addColorStop(0,   'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,200,230,0.85)');
    grd.addColorStop(1,   'rgba(180,210,255,0)');
    ctx.strokeStyle = grd;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    // cabeça com glow
    ctx.shadowColor = 'rgba(255,255,255,0.95)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── GEMS (estrela 5-pontas estilo sticker, com cara fofa) ───────────────────
function drawGems() {
  game.gems.forEach(g => {
    if (g.taken) return;
    const sy = game.scroll - g.wy + H * 0.5;
    if (sy < -CFG.GEM_R * 2.5 || sy > H + CFG.GEM_R * 2.5) return;
    g.bob += 0.04;
    const off  = Math.sin(g.bob) * 8;
    const r    = CFG.GEM_R;
    const cy   = sy + off;
    const hue  = g.hue;

    ctx.save();

    // Halo gordo difuso (aura colorida)
    const halo = ctx.createRadialGradient(g.x, cy, 0, g.x, cy, r * 2.6);
    halo.addColorStop(0,   `hsla(${hue},90%,75%,0.65)`);
    halo.addColorStop(0.4, `hsla(${hue},90%,70%,0.30)`);
    halo.addColorStop(1,   `hsla(${hue},90%,68%,0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(g.x - r * 2.6, cy - r * 2.6, r * 5.2, r * 5.2);

    ctx.translate(g.x, cy);
    ctx.rotate(Math.sin(g.bob * 0.35) * 0.08);

    // Sombra inferior elíptica
    ctx.beginPath();
    ctx.ellipse(0, r * 1.05, r * 0.55, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();

    // Estrela 5-pontas — pontas mais arredondadas (raio interno alto)
    starPath(0, 0, r, r * 0.58, 5);

    // Preenchimento gradiente (claro topo → saturado base)
    const fill = ctx.createRadialGradient(0, -r * 0.45, 0, 0, r * 0.1, r * 1.1);
    fill.addColorStop(0,   `hsl(${hue},100%,92%)`);
    fill.addColorStop(0.4, `hsl(${hue},95%,72%)`);
    fill.addColorStop(1,   `hsl(${hue},85%,52%)`);
    ctx.fillStyle = fill;
    ctx.fill();

    // Borda branca grossa (sticker)
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();

    // Outline escuro fino
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `hsla(${hue},85%,28%,0.85)`;
    ctx.stroke();

    // Highlight grande (lua-crescente)
    ctx.beginPath();
    ctx.ellipse(-r * 0.20, -r * 0.38, r * 0.22, r * 0.34, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();

    // Pontinho de luz extra
    ctx.beginPath();
    ctx.arc(r * 0.22, -r * 0.50, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fill();

    // Bochechas rosa fofas (coradinhas) — só nos gems que não são rosa pra não ficar redundante
    if (hue < 320 && hue > 30) {
      ctx.fillStyle = `hsla(345,90%,65%,0.55)`;
      ctx.beginPath();
      ctx.arc(-r * 0.30, r * 0.10, r * 0.13, 0, Math.PI * 2);
      ctx.arc( r * 0.30, r * 0.10, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });
}

function starPath(cx, cy, rOut, rIn, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const ang = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? rOut : rIn;
    const px  = cx + Math.cos(ang) * rad;
    const py  = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else         ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ─── FLAMES ──────────────────────────────────────────────────────────────────
function drawFlames() {
  // Layer 1 — glow externo (amarelo-rosado, blur grande)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  game.flames.forEach(p => {
    ctx.globalAlpha = p.life * 0.55;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.8);
    grd.addColorStop(0,    `hsla(45,100%,75%,1)`);
    grd.addColorStop(0.4,  `hsla(25,100%,60%,0.6)`);
    grd.addColorStop(1,    `hsla(15,90%,45%,0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Layer 2 — núcleo branco-amarelo
  game.flames.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life * 0.95;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    grd.addColorStop(0,   `hsl(55,100%,98%)`);
    grd.addColorStop(0.3, `hsl(48,100%,80%)`);
    grd.addColorStop(0.7, `hsl(20,100%,62%)`);
    grd.addColorStop(1,   `hsla(8,90%,48%,0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawBursts() {
  game.bursts.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.shadowColor = `hsl(${p.hue},100%,65%)`;
    ctx.shadowBlur  = 10;
    // mini estrela em vez de bolinha
    ctx.translate(p.x, p.y);
    ctx.rotate(p.x * 0.01 + game.frame * 0.05);
    starPath(0, 0, p.r * p.life, p.r * p.life * 0.45, 4);
    ctx.fillStyle = `hsl(${p.hue},95%,72%)`;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    starPath(0, 0, p.r * p.life * 0.45, p.r * p.life * 0.18, 4);
    ctx.fill();
    ctx.restore();
  });
}

// ─── ROCKET (mascote-foguete: corpo gordinho, rosto fofo, alma cartoon) ──────
function drawRocket(x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Inclinação suave que reflete movimento lateral (responsivo, sem flash)
  const tilt = clamp(game.rocket.vx * 0.06, -0.20, 0.20);
  // Squash-and-stretch sutil acompanhando velocidade vertical
  const stretch = 1 + clamp(-game.rocket.vy * 0.012, 0, 0.08);
  // Bobinho idle quando parado
  const idleBob = (Math.abs(game.rocket.vy) < 0.5 && Math.abs(game.rocket.vx) < 0.5)
    ? Math.sin(game.frame * 0.06) * 1.5 : 0;
  ctx.translate(0, idleBob);
  ctx.rotate(tilt);
  ctx.scale(1 / stretch, stretch);

  const HW  = CFG.ROCKET_W * 0.5;   // 19
  const HH  = CFG.ROCKET_H * 0.5;   // 43
  const ink = PAL.ink;

  // ── Sombra projetada (chão simbólico) ──
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, HH * 1.05, HW * 1.15, HH * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Glow do bocal ──
  const glow = ctx.createRadialGradient(0, HH * 0.95, 0, 0, HH * 0.95, 50);
  glow.addColorStop(0,   'rgba(255,200,120,0.65)');
  glow.addColorStop(0.4, 'rgba(255,140,80,0.30)');
  glow.addColorStop(1,   'rgba(255,80,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-50, HH * 0.4, 100, 70);

  // ── ALETAS — orelhinhas chunky, atrás do corpo ──
  drawCuteFin(-1, HW, HH, ink);
  drawCuteFin( 1, HW, HH, ink);

  // ── BOCAL (base cinza-azulada arredondada) ──
  const nozzleY = HH * 0.78;
  const nozzleH = HH * 0.32;
  ctx.save();
  ctx.beginPath();
  // formato trapezoidal arredondado — alarga embaixo
  ctx.moveTo(-HW * 0.92, nozzleY);
  ctx.lineTo( HW * 0.92, nozzleY);
  ctx.lineTo( HW * 1.05, nozzleY + nozzleH * 0.85);
  ctx.quadraticCurveTo(HW * 1.05, nozzleY + nozzleH, HW * 0.92, nozzleY + nozzleH);
  ctx.lineTo(-HW * 0.92, nozzleY + nozzleH);
  ctx.quadraticCurveTo(-HW * 1.05, nozzleY + nozzleH, -HW * 1.05, nozzleY + nozzleH * 0.85);
  ctx.closePath();
  const nozzleGrd = ctx.createLinearGradient(0, nozzleY, 0, nozzleY + nozzleH);
  nozzleGrd.addColorStop(0,   '#7a85a3');
  nozzleGrd.addColorStop(0.6, '#4a536e');
  nozzleGrd.addColorStop(1,   '#2a2f48');
  ctx.fillStyle = nozzleGrd;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = ink;
  ctx.stroke();
  // brilho horizontal no bocal (faixa metálica)
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.fillRect(-HW * 0.85, nozzleY + nozzleH * 0.15, HW * 1.7, nozzleH * 0.15);
  // anel inferior — abertura escura por onde sai a chama
  ctx.fillStyle = '#0e0a28';
  ctx.beginPath();
  ctx.ellipse(0, nozzleY + nozzleH * 0.92, HW * 0.85, nozzleH * 0.20, 0, 0, Math.PI * 2);
  ctx.fill();
  // brilho laranja tênue dentro
  ctx.fillStyle = 'rgba(255,140,60,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, nozzleY + nozzleH * 0.88, HW * 0.65, nozzleH * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── CORPO — cápsula gordinha (mais larga no meio, afina nas pontas) ──
  // Construído por bezier pra ter "cheeks" arredondadas em vez de pílula reta
  const bodyTop = -HH * 0.65;
  const bodyBot =  HH * 0.85;
  const bulge   =  HW * 1.08; // larguramax no meio (gordinho)
  ctx.beginPath();
  ctx.moveTo(-HW, bodyTop);
  // lado esquerdo — curva pra fora (barriguinha)
  ctx.bezierCurveTo(-bulge, bodyTop + (bodyBot-bodyTop) * 0.30,
                    -bulge, bodyTop + (bodyBot-bodyTop) * 0.70,
                    -HW * 0.92, bodyBot);
  // base
  ctx.lineTo(HW * 0.92, bodyBot);
  // lado direito
  ctx.bezierCurveTo( bulge, bodyTop + (bodyBot-bodyTop) * 0.70,
                     bulge, bodyTop + (bodyBot-bodyTop) * 0.30,
                     HW, bodyTop);
  ctx.closePath();

  // gradiente — luz no canto superior esquerdo, sombra no inferior direito
  const bodyGrd = ctx.createRadialGradient(-HW * 0.5, bodyTop + HH * 0.2, 2, 0, 0, HW * 2.0);
  bodyGrd.addColorStop(0,    '#ffffff');
  bodyGrd.addColorStop(0.45, '#f7f1e6');
  bodyGrd.addColorStop(0.85, '#d4cab5');
  bodyGrd.addColorStop(1,    '#9a8870');
  ctx.fillStyle = bodyGrd;
  ctx.fill();

  // Outline grosso
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // ── Painel/cinto vermelho decorativo no torso baixo ──
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-HW, bodyTop);
  ctx.bezierCurveTo(-bulge, bodyTop + (bodyBot-bodyTop) * 0.30,
                    -bulge, bodyTop + (bodyBot-bodyTop) * 0.70,
                    -HW * 0.92, bodyBot);
  ctx.lineTo(HW * 0.92, bodyBot);
  ctx.bezierCurveTo( bulge, bodyTop + (bodyBot-bodyTop) * 0.70,
                     bulge, bodyTop + (bodyBot-bodyTop) * 0.30,
                     HW, bodyTop);
  ctx.closePath();
  ctx.clip();

  const beltY = HH * 0.42;
  const beltH = HH * 0.20;
  const beltGrd = ctx.createLinearGradient(0, beltY, 0, beltY + beltH);
  beltGrd.addColorStop(0,    '#ff7a5a');
  beltGrd.addColorStop(0.5,  '#ee3d3a');
  beltGrd.addColorStop(1,    '#a82020');
  ctx.fillStyle = beltGrd;
  ctx.fillRect(-HW * 1.5, beltY, HW * 3, beltH);

  // estrelinha amarela no centro do cinto (botão de "super-herói")
  ctx.save();
  ctx.translate(0, beltY + beltH * 0.5);
  starPath(0, 0, beltH * 0.42, beltH * 0.18, 5);
  const badgeGrd = ctx.createLinearGradient(0, -beltH * 0.4, 0, beltH * 0.4);
  badgeGrd.addColorStop(0, '#fff5a8');
  badgeGrd.addColorStop(1, '#ffb83d');
  ctx.fillStyle = badgeGrd;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // outline do cinto (linhas finas em cima e embaixo)
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.moveTo(-HW * 1.05, beltY);
  ctx.lineTo( HW * 1.05, beltY);
  ctx.moveTo(-HW * 1.05, beltY + beltH);
  ctx.lineTo( HW * 1.05, beltY + beltH);
  ctx.stroke();

  // ── NARIZ — cone vermelho-coral arredondado, "chapéu" do mascote ──
  ctx.beginPath();
  ctx.moveTo(-HW * 0.96, bodyTop + 1);
  // sobe esquerdo curvado
  ctx.bezierCurveTo(-HW * 0.95, -HH * 0.95,
                    -HW * 0.30, -HH * 1.18,
                     0,         -HH * 1.18);
  // desce direito
  ctx.bezierCurveTo(HW * 0.30, -HH * 1.18,
                    HW * 0.95, -HH * 0.95,
                    HW * 0.96, bodyTop + 1);
  ctx.closePath();
  const noseGrd = ctx.createLinearGradient(-HW * 0.5, -HH * 1.1, HW * 0.7, -HH * 0.6);
  noseGrd.addColorStop(0,    '#ffae8a');
  noseGrd.addColorStop(0.40, '#ff5a4a');
  noseGrd.addColorStop(1,    '#9c1820');
  ctx.fillStyle = noseGrd;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // Highlight no nariz (banda de luz lateral curva)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-HW * 0.96, bodyTop + 1);
  ctx.bezierCurveTo(-HW * 0.95, -HH * 0.95, -HW * 0.30, -HH * 1.18, 0, -HH * 1.18);
  ctx.bezierCurveTo( HW * 0.30, -HH * 1.18,  HW * 0.95, -HH * 0.95, HW * 0.96, bodyTop + 1);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,230,210,0.75)';
  ctx.beginPath();
  ctx.ellipse(-HW * 0.32, -HH * 0.92, HW * 0.20, HH * 0.18, -0.55, 0, Math.PI * 2);
  ctx.fill();
  // segundo highlight bem fininho
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.beginPath();
  ctx.ellipse(-HW * 0.10, -HH * 1.05, HW * 0.12, HH * 0.04, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── ANTENA — haste fininha com bolinha brilhante na ponta ──
  // haste
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.moveTo(0, -HH * 1.18);
  // antena com leve oscilação
  const antBob = Math.sin(game.frame * 0.08) * 0.10;
  const antTipX = Math.sin(antBob) * 4;
  const antTipY = -HH * 1.42;
  ctx.quadraticCurveTo(antTipX * 0.3, -HH * 1.30, antTipX, antTipY);
  ctx.stroke();
  // bolinha amarela com glow
  ctx.shadowColor = 'rgba(255,210,80,0.9)';
  ctx.shadowBlur = 8;
  const antGrd = ctx.createRadialGradient(antTipX - 1.5, antTipY - 1.5, 0, antTipX, antTipY, 4.5);
  antGrd.addColorStop(0, '#fff8c4');
  antGrd.addColorStop(1, '#ffaa30');
  ctx.fillStyle = antGrd;
  ctx.beginPath();
  ctx.arc(antTipX, antTipY, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // ── ROSTO — janela como CARA com olhos grandes, sorriso e bochechas ──
  // moldura escura (capacete)
  const fcx = 0;
  const fcy = -HH * 0.10;
  const fr  = HW * 0.78; // bem maior — toma quase toda largura
  ctx.beginPath();
  ctx.arc(fcx, fcy, fr, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2050';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // vidro azul-céu
  const winGrd = ctx.createRadialGradient(fcx - fr * 0.3, fcy - fr * 0.4, 1, fcx, fcy, fr * 0.92);
  winGrd.addColorStop(0,    '#f0fbff');
  winGrd.addColorStop(0.35, '#9fdcff');
  winGrd.addColorStop(0.75, '#4a9be0');
  winGrd.addColorStop(1,    '#1d4a8c');
  ctx.fillStyle = winGrd;
  ctx.beginPath();
  ctx.arc(fcx, fcy, fr * 0.86, 0, Math.PI * 2);
  ctx.fill();

  // ── Olhos: dois grandes pretos com brilho branco ──
  // Cada olho pisca a cada ~5s (animação de personalidade, lenta — anti-flash)
  const blinkPhase = (game.frame % 320);
  const blinking = blinkPhase < 8;
  const eyeYOff = blinking ? 0 : 0; // posição base
  const eyeRy = blinking ? 0.5 : fr * 0.22;
  const eyeRx = fr * 0.20;

  const eyes = [
    { x: fcx - fr * 0.32, y: fcy - fr * 0.05 },
    { x: fcx + fr * 0.32, y: fcy - fr * 0.05 },
  ];

  eyes.forEach((e, i) => {
    // sombra debaixo do olho (subtle)
    ctx.fillStyle = 'rgba(20,30,80,0.18)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + eyeRy * 0.3, eyeRx, eyeRy * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // olho (pupila gigante preta)
    ctx.fillStyle = '#1a1238';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, eyeRx, Math.max(0.5, eyeRy), 0, 0, Math.PI * 2);
    ctx.fill();

    if (!blinking) {
      // brilho grande (catchlight) no canto superior — direção da luz
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(e.x - eyeRx * 0.30, e.y - eyeRy * 0.40, eyeRx * 0.42, eyeRy * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      // brilhinho menor (segunda luz — dá vida)
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(e.x + eyeRx * 0.35, e.y + eyeRy * 0.25, eyeRx * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // ── Bochechas rosa fofas ──
  ctx.fillStyle = 'rgba(255,120,160,0.55)';
  ctx.beginPath();
  ctx.ellipse(fcx - fr * 0.55, fcy + fr * 0.32, fr * 0.16, fr * 0.10, 0, 0, Math.PI * 2);
  ctx.ellipse(fcx + fr * 0.55, fcy + fr * 0.32, fr * 0.16, fr * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Sorriso (curva suave aberta) ──
  if (!blinking) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1a1238';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const sm = fr * 0.28; // largura do sorriso
    ctx.moveTo(fcx - sm, fcy + fr * 0.30);
    ctx.quadraticCurveTo(fcx, fcy + fr * 0.52, fcx + sm, fcy + fr * 0.30);
    ctx.stroke();
    // língua/dentinho — pontinho de luz no sorriso
    ctx.fillStyle = 'rgba(255,180,200,0.65)';
    ctx.beginPath();
    ctx.ellipse(fcx, fcy + fr * 0.43, fr * 0.10, fr * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // quando piscando, sorriso vira "linha feliz" mais reta
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1a1238';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fcx - fr * 0.20, fcy + fr * 0.35);
    ctx.quadraticCurveTo(fcx, fcy + fr * 0.42, fcx + fr * 0.20, fcy + fr * 0.35);
    ctx.stroke();
  }

  // ── Reflexo grande no vidro (lua-crescente) — vai atrás dos olhos? não: ─
  // pra não cobrir a cara, o reflexo vai SÓ na borda superior, fininho
  ctx.save();
  ctx.beginPath();
  ctx.arc(fcx, fcy, fr * 0.86, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath();
  ctx.ellipse(fcx - fr * 0.25, fcy - fr * 0.55, fr * 0.45, fr * 0.12, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawCuteFin(side, HW, HH, ink) {
  ctx.save();
  ctx.scale(side, 1);

  // Aleta com forma de "orelhinha" — base larga, pontinha arredondada que sai pra trás-baixo
  ctx.beginPath();
  ctx.moveTo(HW * 0.92,  HH * 0.20);                     // junta com o corpo (topo)
  ctx.bezierCurveTo(HW * 1.45, HH * 0.30,
                    HW * 1.95, HH * 0.65,
                    HW * 1.85, HH * 1.00);               // ponta externa
  ctx.bezierCurveTo(HW * 1.55, HH * 1.05,
                    HW * 1.10, HH * 0.92,
                    HW * 0.95, HH * 0.78);               // volta pro corpo (baixo)
  ctx.closePath();

  // gradiente azul-céu
  const finGrd = ctx.createLinearGradient(HW, HH * 0.2, HW * 1.9, HH * 1.0);
  finGrd.addColorStop(0,    '#9ad6ff');
  finGrd.addColorStop(0.5,  '#5aa0e8');
  finGrd.addColorStop(1,    '#2966b8');
  ctx.fillStyle = finGrd;
  ctx.fill();

  // outline
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // Highlight branco curvo na borda interna superior
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(HW * 0.92, HH * 0.22);
  ctx.bezierCurveTo(HW * 1.40, HH * 0.32,
                    HW * 1.85, HH * 0.65,
                    HW * 1.78, HH * 0.95);
  ctx.bezierCurveTo(HW * 1.55, HH * 1.00,
                    HW * 1.10, HH * 0.90,
                    HW * 0.95, HH * 0.78);
  ctx.closePath();
  ctx.clip();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(HW * 1.05, HH * 0.30);
  ctx.bezierCurveTo(HW * 1.40, HH * 0.40, HW * 1.65, HH * 0.60, HW * 1.55, HH * 0.85);
  ctx.stroke();
  ctx.restore();

  // Pontinho escuro — "veininha" no centro pra dar mais alma de orelha
  ctx.fillStyle = 'rgba(20,40,80,0.25)';
  ctx.beginPath();
  ctx.ellipse(HW * 1.50, HH * 0.65, HW * 0.18, HH * 0.10, 0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─── PROGRESS (vertical bar com mini-foguete marker) ─────────────────────────
function drawProgress(prog) {
  const bh = H * 0.55;
  const bx = W - 22;
  const by = (H - bh) * 0.5;

  ctx.save();

  // Track — cápsula escura
  rRect(bx - 5, by, 10, bh, 5);
  ctx.fillStyle = 'rgba(15,8,40,0.55)';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.stroke();

  // Fill — gradiente quente
  const fh = bh * prog;
  if (fh > 0) {
    ctx.save();
    rRect(bx - 5, by, 10, bh, 5);
    ctx.clip();
    const fillGrd = ctx.createLinearGradient(0, by + bh, 0, by + bh - fh);
    fillGrd.addColorStop(0,    '#ff6a4a');
    fillGrd.addColorStop(0.55, '#ffa83d');
    fillGrd.addColorStop(1,    '#ffe066');
    ctx.fillStyle = fillGrd;
    ctx.fillRect(bx - 5, by + bh - fh, 10, fh);
    ctx.restore();
  }

  // Marker — bolinha branca com glow + miolo
  if (prog > 0) {
    const my = by + bh - fh;
    ctx.shadowColor = 'rgba(255,210,80,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, my, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffcd3d';
    ctx.beginPath();
    ctx.arc(bx, my, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = PAL.ink;
    ctx.beginPath();
    ctx.arc(bx, my, 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Estrela do topo (objetivo) — desenhada com path, com outline
  ctx.save();
  ctx.translate(bx, by - 12);
  ctx.shadowColor = 'rgba(255,210,80,0.9)';
  ctx.shadowBlur = 10;
  starPath(0, 0, 10, 4.2, 5);
  const starGrd = ctx.createLinearGradient(0, -10, 0, 10);
  starGrd.addColorStop(0, '#fff3a8');
  starGrd.addColorStop(1, prog >= 1 ? '#ff9a3d' : '#ffb83d');
  ctx.fillStyle = starGrd;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// ─── HINT (cartão chunky com seta animada apontando) ─────────────────────────
function drawHint() {
  if (game.hintAlpha < 0.01) return;
  // Pulsação MUITO suave (≥0.85, ciclo lento)
  const pulse = 0.92 + Math.sin(game.frame * 0.04) * 0.08;
  const bob   = Math.sin(game.frame * 0.05) * 4;

  ctx.save();
  ctx.globalAlpha = game.hintAlpha * pulse;

  const cx = W * 0.5;
  const cy = H * 0.86 + bob;
  const fs = Math.max(22, (W * 0.062)|0);
  const text = 'Segure a tela!';

  ctx.font = `900 ${fs}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tw = ctx.measureText(text).width;
  const padX = fs * 0.95;
  const padY = fs * 0.55;
  const bw = tw + padX * 2 + fs * 1.4;
  const bh = fs * 2.0;

  // Sombra grande e suave
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  rRect(cx - bw * 0.5, cy - bh * 0.5 + 6, bw, bh, bh * 0.5);
  ctx.fill();

  // Bolha — gradiente amarelo→creme (chama atenção sem flash)
  const bubGrd = ctx.createLinearGradient(0, cy - bh * 0.5, 0, cy + bh * 0.5);
  bubGrd.addColorStop(0, '#fff8d4');
  bubGrd.addColorStop(1, '#ffd86a');
  ctx.fillStyle = bubGrd;
  rRect(cx - bw * 0.5, cy - bh * 0.5, bw, bh, bh * 0.5);
  ctx.fill();

  // Borda chunky escura
  ctx.lineWidth = 4;
  ctx.strokeStyle = PAL.ink;
  rRect(cx - bw * 0.5, cy - bh * 0.5, bw, bh, bh * 0.5);
  ctx.stroke();

  // Texto
  ctx.fillStyle = PAL.ink;
  // outline branco interno (legibilidade)
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#fff8d4';
  ctx.strokeText(text, cx - fs * 0.55, cy);
  ctx.fillText(text, cx - fs * 0.55, cy);

  // Emoji dedinho com bob extra
  const fingerBob = Math.sin(game.frame * 0.10) * 5;
  ctx.font = `${fs * 1.05}px -apple-system, BlinkMacSystemFont, "Apple Color Emoji", sans-serif`;
  ctx.fillText('👆', cx + tw * 0.5 + fs * 0.35, cy + fingerBob);

  ctx.restore();
}

// ─── CONFETTI (mistura de retângulos, círculos e estrelas) ──────────────────
function drawConfetti() {
  game.confetti.forEach(c => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.globalAlpha = Math.min(1, c.life * 3);
    ctx.fillStyle = c.col;
    if (c.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, c.h * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.shape === 'star') {
      starPath(0, 0, c.w * 0.55, c.w * 0.25, 5);
      ctx.fill();
    } else {
      const w = c.w, h = c.h, r = Math.min(h * 0.5, 3);
      rRect(-w * 0.5, -h * 0.5, w, h, r);
      ctx.fill();
    }
    // pequeno highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-c.w * 0.3, -c.h * 0.3, c.w * 0.4, c.h * 0.15);
    ctx.restore();
  });
}

function drawVersion() {
  ctx.save();
  ctx.font         = '11px monospace';
  ctx.fillStyle    = 'rgba(255,255,255,0.30)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(VERSION, W - 10, H - 6);
  ctx.restore();
}

// ─── WIN ─────────────────────────────────────────────────────────────────────
function drawWin() {
  const elapsed = Date.now() - game.celebrateAt;
  const fadeIn  = Math.min(1, elapsed / 700);

  ctx.save();
  ctx.globalAlpha = fadeIn;

  // Overlay suave
  ctx.fillStyle = 'rgba(15,5,40,0.40)';
  ctx.fillRect(0, 0, W, H);

  // ── Banner de fundo (forma de fita atrás do texto) ──
  ctx.save();
  ctx.translate(W * 0.5, H * 0.38);
  const scale = 1 + Math.sin(elapsed * 0.0025) * 0.025;
  ctx.scale(scale, scale);

  const fs = Math.max(32, (W * 0.13) | 0);
  ctx.font = `900 ${fs}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = 'Parabéns!';
  const tw = ctx.measureText(text).width;

  // Banner em forma de pílula com fita pendurada
  const bw = tw + fs * 1.0;
  const bh = fs * 1.45;
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  rRect(-bw * 0.5, -bh * 0.5 + 8, bw, bh, bh * 0.45);
  ctx.fill();

  // gradiente do banner — rosa→amarelo (festa)
  const banGrd = ctx.createLinearGradient(0, -bh * 0.5, 0, bh * 0.5);
  banGrd.addColorStop(0, '#fff5a8');
  banGrd.addColorStop(0.5, '#ffb84a');
  banGrd.addColorStop(1, '#ff5a8a');
  ctx.fillStyle = banGrd;
  rRect(-bw * 0.5, -bh * 0.5, bw, bh, bh * 0.45);
  ctx.fill();

  // borda chunky
  ctx.lineWidth = 4;
  ctx.strokeStyle = PAL.ink;
  rRect(-bw * 0.5, -bh * 0.5, bw, bh, bh * 0.45);
  ctx.stroke();

  // Texto branco com outline escuro
  ctx.lineWidth = 5;
  ctx.strokeStyle = PAL.ink;
  ctx.strokeText(text, 0, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 0, 2);

  // Estrelinhas decorativas em cada lado do banner
  for (let s = -1; s <= 1; s += 2) {
    ctx.save();
    ctx.translate(s * (bw * 0.5 + fs * 0.4), -bh * 0.3);
    ctx.rotate(Math.sin(elapsed * 0.002 + s) * 0.3);
    starPath(0, 0, fs * 0.30, fs * 0.13, 5);
    const stGrd = ctx.createLinearGradient(0, -fs * 0.3, 0, fs * 0.3);
    stGrd.addColorStop(0, '#fff5a8');
    stGrd.addColorStop(1, '#ffb83d');
    ctx.fillStyle = stGrd;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // ── Foguete emoji com bob ──
  ctx.save();
  ctx.globalAlpha = fadeIn;
  const bob = Math.sin(elapsed * 0.003) * 10;
  const rot = Math.sin(elapsed * 0.0015) * 0.08;
  ctx.translate(W * 0.5, H * 0.58 + bob);
  ctx.rotate(rot);
  ctx.font        = `${Math.max(56, (W * 0.22) | 0)}px sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🚀', 0, 0);
  ctx.restore();

  ctx.restore();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function lerp(a, b, t)  { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function rng(a, b)      { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function rRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h,     x, y + h - r,     r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y,         x + r, y,         r);
  ctx.closePath();
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function mixHex(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function darken(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amt)},${Math.max(0, g - amt)},${Math.max(0, b - amt)})`;
}

// ─── LOOP ────────────────────────────────────────────────────────────────────
function loop() {
  draw();
  update();
  requestAnimationFrame(loop);
}

newGame();
requestAnimationFrame(loop);
