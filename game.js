'use strict';

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
  MAX_UP:       -11,
  MAX_SIDE:      5,
  FRIC_X:        0.86,
  ROCKET_H:      86,
  ROCKET_W:      38,
  FLOOR_RATIO:   0.80,
  FINISH_ALT:    5500,
  CELEBRATE_S:   10,
  STARS:         150,
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

function sndBoost() {
  tone(260, 0.10, 0.15, 480);
}

function sndMilestone() {
  [[523, 0], [659, 130], [784, 260]].forEach(([f, ms]) =>
    setTimeout(() => tone(f, 0.20, 0.55), ms)
  );
}

function sndCelebrate() {
  [523, 587, 659, 784, 880, 784, 880, 1047].forEach((f, i) =>
    setTimeout(() => tone(f, 0.25, 0.45), i * 160)
  );
}

// ─── STATE ───────────────────────────────────────────────────────────────────
let game;

function newGame() {
  game = {
    phase:       'playing',   // 'playing' | 'win'
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
}

// ─── BACKGROUND FACTORIES ────────────────────────────────────────────────────
function makeStars() {
  return Array.from({ length: CFG.STARS }, () => ({
    x:     rng(0, W),
    y:     rng(0, H * 5),
    r:     rng(0.4, 2.6),
    layer: Math.floor(rng(0, 3)),
    phase: rng(0, Math.PI * 2),
    spd:   rng(0.01, 0.05),
  }));
}

function makePlanets() {
  return [
    { x: W * 0.76, wy: 1100, r: 52, col: '#e8674a', rings: false },
    { x: W * 0.18, wy: 2200, r: 44, col: '#7ab8e8', rings: true  },
    { x: W * 0.70, wy: 3300, r: 66, col: '#9b59b6', rings: false },
    { x: W * 0.22, wy: 4400, r: 40, col: '#2ecc71', rings: true  },
    { x: W * 0.78, wy: 5100, r: 50, col: '#f39c12', rings: false },
  ];
}

function makeClouds() {
  return Array.from({ length: 7 }, (_, i) => ({
    x:  rng(W * 0.05, W * 0.95),
    wy: i * 110 + 30,
    wr: rng(55, 120),
    hr: rng(14, 28),
  }));
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
      r:  rng(5, 10) + s * 5,
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
      r:  rng(4, 8),
      hue: rng(0, 360),
      life: 1,
      dec: rng(0.016, 0.026),
    });
  }
}

function spawnConfetti() {
  const COLS = ['#ff6b35','#ffcc00','#4a9eff','#ff69b4','#00ff88','#ff4444','#cc44ff'];
  for (let i = 0; i < 5; i++) {
    game.confetti.push({
      x:   rng(0, W),
      y:   rng(-30, -5),
      vx:  rng(-3, 3),
      vy:  rng(1.5, 3.5),
      rot: rng(0, Math.PI * 2),
      rv:  rng(-0.15, 0.15),
      w:   rng(7, 14),
      h:   rng(3, 7),
      col: COLS[Math.floor(rng(0, COLS.length))],
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

  // Physics
  r.vy += CFG.GRAVITY;
  if (isPressed()) r.vy += CFG.THRUST;
  r.vx *= CFG.FRIC_X;
  r.vy  = Math.max(CFG.MAX_UP, r.vy);
  r.x  += r.vx;
  r.y  += r.vy;

  // Bounds
  r.x = clamp(r.x, CFG.ROCKET_W * 0.55, W - CFG.ROCKET_W * 0.55);
  const floor    = H * CFG.FLOOR_RATIO;
  const followY  = H * 0.35;
  if (r.y > floor)   { r.y = floor; r.vy = 0; }
  if (r.y < followY) { r.y = followY; }

  // Altitude accrues only while moving upward
  if (r.vy < 0) {
    const gain = Math.abs(r.vy) * 0.45;
    game.altitude += gain;
    game.scroll   += gain;
  }

  // Hint fades once tapped or after 6s
  if (game.tapped) {
    game.hintAlpha = Math.max(0, game.hintAlpha - 0.04);
  } else if (game.frame > 360) {
    game.hintAlpha = Math.max(0, game.hintAlpha - 0.005);
  }

  // Flame particles when boosting
  if (r.vy < -0.8) spawnFlame(r.x, r.y, -r.vy);

  // Occasional shooting stars (after leaving atmosphere)
  if (game.frame % 95 === 0 && game.altitude > CFG.FINISH_ALT * 0.18) {
    game.shooting.push({
      x: rng(0, W),
      y: rng(H * 0.05, H * 0.45),
      vx: rng(3, 7),
      vy: rng(1, 3),
      life: 1,
    });
  }

  // Milestones at 40% and 75%
  const prog = game.altitude / CFG.FINISH_ALT;
  [0.40, 0.75].forEach((th, i) => {
    if (!game.milestones[i] && prog >= th) {
      game.milestones[i] = true;
      sndMilestone();
      spawnBurst(r.x, r.y, 22);
    }
  });

  // Win condition
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
  drawStars(prog);
  drawClouds(prog);
  drawPlanets();
  drawShooting();
  drawFlames();
  drawBursts();
  drawRocket(game.rocket.x, game.rocket.y);
  drawProgress(prog);
  drawHint();

  if (game.phase === 'win') {
    drawConfetti();
    drawWin();
  }
}

function drawBg(prog) {
  const t  = Math.min(1, prog * 1.5);
  const r1 = lerp(5,  0, t), g1 = lerp(15, 1, t), b1 = lerp(55, 8,  t);
  const r2 = lerp(12, 0, t), g2 = lerp(28, 2, t), b2 = lerp(85, 15, t);
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, `rgb(${r1|0},${g1|0},${b1|0})`);
  grd.addColorStop(1, `rgb(${r2|0},${g2|0},${b2|0})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(prog) {
  const alpha = Math.min(1, prog * 4);
  if (alpha < 0.02) return;
  const rates = [0.2, 0.5, 1.0];
  game.stars.forEach(s => {
    const offset = game.scroll * rates[s.layer];
    let sy = s.y + (offset % (H * 5));
    while (sy >  H + 4) sy -= H * 5;
    while (sy < -4)     sy += H * 5;
    s.phase += s.spd;
    const a = (0.5 + Math.sin(s.phase) * 0.45) * alpha;
    ctx.beginPath();
    ctx.arc(s.x, sy, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.fill();
  });
}

function drawClouds(prog) {
  const alpha = Math.max(0, 1 - prog * 10);
  if (alpha < 0.01) return;
  game.clouds.forEach(c => {
    const sy = c.wy + game.scroll;
    if (sy < -80 || sy > H + 80) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = 'rgba(195,215,255,1)';
    for (const [ox, oy, rs] of [[0, 0, 1], [-0.32, 0.22, 0.65], [0.32, 0.22, 0.65]]) {
      ctx.beginPath();
      ctx.ellipse(c.x + ox * c.wr, sy + oy * c.hr, c.wr * rs, c.hr * rs, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawPlanets() {
  game.planets.forEach(p => {
    const sy = game.scroll - p.wy + H * 0.5;
    if (sy < -p.r * 3 || sy > H + p.r * 3) return;
    ctx.save();

    // Soft glow
    const glow = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, p.r * 1.9);
    glow.addColorStop(0, p.col + '30');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - p.r * 2, sy - p.r * 2, p.r * 4, p.r * 4);

    // Planet body with shading
    const body = ctx.createRadialGradient(
      p.x - p.r * 0.3, sy - p.r * 0.3, p.r * 0.1,
      p.x, sy, p.r
    );
    body.addColorStop(0, p.col);
    body.addColorStop(1, darken(p.col, 55));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(p.x, sy, p.r, 0, Math.PI * 2);
    ctx.fill();

    if (p.rings) {
      ctx.strokeStyle = p.col + '80';
      ctx.lineWidth = Math.max(3, p.r * 0.1);
      ctx.beginPath();
      ctx.ellipse(p.x, sy, p.r * 1.75, p.r * 0.38, -0.15, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  });
}

function drawShooting() {
  game.shooting.forEach(s => {
    ctx.save();
    ctx.globalAlpha = s.life;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 11, s.y - s.vy * 11);
    ctx.stroke();
    ctx.restore();
  });
}

function drawFlames() {
  game.flames.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life * 0.82;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    grd.addColorStop(0,   `hsl(${p.hue + 30},100%,96%)`);
    grd.addColorStop(0.4, `hsl(${p.hue},100%,65%)`);
    grd.addColorStop(1,   `hsla(${p.hue},100%,40%,0)`);
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
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = `hsl(${p.hue},100%,65%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawRocket(x, y) {
  ctx.save();
  ctx.translate(x, y);

  const HW = CFG.ROCKET_W * 0.5;
  const HH = CFG.ROCKET_H * 0.5;

  // Engine nozzle glow
  const glow = ctx.createRadialGradient(0, HH * 0.9, 0, 0, HH * 0.9, 30);
  glow.addColorStop(0, 'rgba(255,140,0,0.45)');
  glow.addColorStop(1, 'rgba(255,70,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-30, HH * 0.5, 60, 45);

  // Left fin
  ctx.fillStyle = '#3a8eef';
  ctx.beginPath();
  ctx.moveTo(-HW,       HH * 0.32);
  ctx.lineTo(-HW * 2.0, HH * 0.88);
  ctx.lineTo(-HW,       HH * 0.74);
  ctx.closePath();
  ctx.fill();

  // Right fin
  ctx.beginPath();
  ctx.moveTo(HW,        HH * 0.32);
  ctx.lineTo(HW * 2.0,  HH * 0.88);
  ctx.lineTo(HW,        HH * 0.74);
  ctx.closePath();
  ctx.fill();

  // Body
  const bodyGrd = ctx.createLinearGradient(-HW, 0, HW, 0);
  bodyGrd.addColorStop(0,    '#aabedd');
  bodyGrd.addColorStop(0.38, '#f0f5ff');
  bodyGrd.addColorStop(0.72, '#dde8f5');
  bodyGrd.addColorStop(1,    '#7888aa');
  ctx.fillStyle = bodyGrd;
  rRect(-HW, -HH * 0.62, CFG.ROCKET_W, HH * 1.62, 7);
  ctx.fill();

  // Nose cone
  const noseGrd = ctx.createLinearGradient(-HW, -HH, HW, -HH * 0.6);
  noseGrd.addColorStop(0, '#ff9060');
  noseGrd.addColorStop(1, '#cc2200');
  ctx.fillStyle = noseGrd;
  ctx.beginPath();
  ctx.moveTo(-HW, -HH * 0.62);
  ctx.bezierCurveTo(-HW, -HH * 0.92, 0, -HH * 1.06, 0, -HH);
  ctx.bezierCurveTo(0, -HH * 1.06, HW, -HH * 0.92, HW, -HH * 0.62);
  ctx.closePath();
  ctx.fill();

  // Window
  const winGrd = ctx.createRadialGradient(-3, -HH * 0.18, 2, 0, -HH * 0.1, HW * 0.52);
  winGrd.addColorStop(0,   '#d0eeff');
  winGrd.addColorStop(0.5, '#55aaff');
  winGrd.addColorStop(1,   '#1155bb');
  ctx.fillStyle = winGrd;
  ctx.beginPath();
  ctx.arc(0, -HH * 0.1, HW * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Window shine
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-HW * 0.2, -HH * 0.22, HW * 0.19, HW * 0.11, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawProgress(prog) {
  const bh = H * 0.55;
  const bx = W - 18;
  const by = (H - bh) * 0.5;

  ctx.save();

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rRect(bx - 4, by, 8, bh, 4);
  ctx.fill();

  // Filled portion
  const fh = bh * prog;
  ctx.fillStyle = prog >= 1 ? '#ffdd00' : 'rgba(255,215,40,0.78)';
  if (fh > 0) {
    rRect(bx - 4, by + bh - fh, 8, fh, 4);
    ctx.fill();
  }

  // Rocket marker dot
  if (prog > 0) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bx, by + bh - fh, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Finish star at top
  ctx.fillStyle = 'rgba(255,215,40,0.9)';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★', bx, by - 3);

  ctx.restore();
}

function drawHint() {
  if (game.hintAlpha < 0.01) return;
  const pulse = 0.55 + Math.sin(game.frame * 0.07) * 0.45;
  ctx.save();
  ctx.globalAlpha = game.hintAlpha * pulse;
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(18, (W * 0.055))|0}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(100,180,255,0.8)';
  ctx.shadowBlur = 12;
  ctx.fillText('Segure a tela! 👆', W * 0.5, H * 0.90);
  ctx.restore();
}

function drawConfetti() {
  game.confetti.forEach(c => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.globalAlpha = Math.min(1, c.life * 3);
    ctx.fillStyle = c.col;
    ctx.fillRect(-c.w * 0.5, -c.h * 0.5, c.w, c.h);
    ctx.restore();
  });
}

function drawWin() {
  const elapsed = Date.now() - game.celebrateAt;
  const fadeIn  = Math.min(1, elapsed / 700);

  ctx.save();
  ctx.globalAlpha = fadeIn;

  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, W, H);

  // Pulsing "Parabéns!"
  ctx.translate(W * 0.5, H * 0.38);
  const scale = 1 + Math.sin(Date.now() * 0.0025) * 0.04;
  ctx.scale(scale, scale);

  const fs = Math.max(28, (W * 0.125) | 0);
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const hue = (Date.now() * 0.08) % 360;
  ctx.shadowColor = `hsl(${hue},100%,60%)`;
  ctx.shadowBlur  = 24;
  ctx.fillStyle   = `hsl(${hue},100%,68%)`;
  ctx.fillText('Parabéns!', 0, 0);

  ctx.restore();

  // Rocket emoji
  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.font        = `${Math.max(44, (W * 0.18) | 0)}px sans-serif`;
  ctx.textAlign   = 'center';
  ctx.fillText('🚀', W * 0.5, H * 0.56);
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

function darken(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16)         - amt);
  const g = Math.max(0, ((n >> 8) & 0xff) - amt);
  const b = Math.max(0, (n & 0xff)        - amt);
  return `rgb(${r},${g},${b})`;
}

// ─── LOOP ────────────────────────────────────────────────────────────────────
function loop() {
  draw();
  update();
  requestAnimationFrame(loop);
}

newGame();
requestAnimationFrame(loop);
