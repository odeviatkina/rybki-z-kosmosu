let particles = [];
let pg;
let started = false;
let focalLength = 1200;
let song;

let symmetry = 6;
let angleStep;
let dots = [];
let rotationAngle = 0;
let focalLengthK = 600;

let phase = "text";
let transitionTriggered = false;

let hints = [];
let userActive = false;
let userActiveTimer = 0;

let targetVolume = 1.0;
let currentVolume = 1.0;

let finalParticles = [];
let finaleStarted = false;
let songTimer = 0;
let lastMillis = 0;

let kaleidoscopeEnding = false;

// Палитра цветов калейдоскопа
let kaleidoscopeColors = [];
let paletteWithWhite = [];

// ── Временные метки фаз ───────────────────────────────────────────────────────
// Фаза A: 1:00–2:00 — глобальный цвет
// Фаза B: 2:00–3:00 — индивидуальный цвет каждой точки
// После 3:00 — плавный кроссфейд B→глобальный (BC_crossfade сек),
//              затем плавный fade глобальный→белый (colorFadeDuration сек)
// Финал стартует в 3:30 (210 сек), частицы появляются сразу
let colorPhaseA_start = 60;    // 1:00
let colorPhaseB_start = 120;   // 2:00
let colorEnd          = 180;   // 3:00 — конец «чистой» фазы B
let BC_crossfade      = 12;    // сек: B плавно → глобальный (3:00–3:12)
let colorFadeDuration = 18;    // сек: глобальный плавно → белый (3:12–3:30)

// Для плавного перехода A→B: длительность кроссфейда
let AB_crossfade = 8;          // сек смешивания глобального и индивидуального цвета

// Для фазы A: один полный проход палитры за 30 сек (медленно, плавно)
let globalColorCycleDuration = 30;

// Для фазы B: «цвет рождения» точки — индекс в paletteWithWhite
let birthColorIndex = 0;
// Скорость смены цвета внутри уже существующей точки (в фазе B)
let dotColorCycleDuration = 9;

// Fade-in цвета перед фазой A
let colorFadeIn = 10;  // сек

function preload() {
  song = loadSound('music.mp3');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  angleStep = TWO_PI / symmetry;
  kaleidoscopeColors = [
    color('#A9C9EC'),
    color('#004FFF'),
    color('#7F79D0'),
    color('#F36721'),
    color('#90092D')
  ];
  paletteWithWhite = [...kaleidoscopeColors, color(255)];
  generateText();
}

// ── Вспомогательная: плавный цвет по палитре (без белого) по времени ──────────
function getGlobalColor(t) {
  let n = kaleidoscopeColors.length;
  let pos = (t / globalColorCycleDuration) * n;
  let wrapped = ((pos % n) + n) % n;
  let idx = floor(wrapped);
  let frac = wrapped - idx;
  let nextIdx = (idx + 1) % n;
  return lerpColor(kaleidoscopeColors[idx], kaleidoscopeColors[nextIdx], frac);
}

// ── Вспомогательная: плавный цвет по paletteWithWhite для точки ──────────────
function getPointColor(p, elapsed) {
  let n = paletteWithWhite.length;
  let pos = (elapsed / dotColorCycleDuration) * n + p.colorPhase;
  let wrapped = ((pos % n) + n) % n;
  let idx = floor(wrapped);
  let frac = wrapped - idx;
  let nextIdx = (idx + 1) % n;
  return lerpColor(paletteWithWhite[idx], paletteWithWhite[nextIdx], frac);
}

// ── Основная функция цвета точки ─────────────────────────────────────────────
// Зоны:
//   [A_start - fadeIn … A_start]          fade-in: белый → глобальный
//   [A_start … B_start - AB_crossfade]    фаза A: чистый глобальный
//   [B_start - AB_crossfade … B_start]    A→B crossfade: глобальный → индивидуальный
//   [B_start … colorEnd]                  фаза B: чистый индивидуальный
//   [colorEnd … colorEnd + BC_crossfade]  B→A crossfade: индивидуальный → глобальный
//   [colorEnd+BC … colorEnd+BC+colorFade] fade-out: глобальный → белый
//   остальное                             белый
function getDotColor(p) {
  let t = songTimer;

  // ── До fade-in: белый ────────────────────────────────────────────────────
  if (t < colorPhaseA_start - colorFadeIn) return color(255);

  // ── Fade-in: белый → глобальный ──────────────────────────────────────────
  if (t < colorPhaseA_start) {
    let blend = smoothstep(map(t, colorPhaseA_start - colorFadeIn, colorPhaseA_start, 0, 1));
    return lerpColor(color(255), getGlobalColor(t), blend);
  }

  // ── Фаза A (чистый глобальный) ────────────────────────────────────────────
  if (t < colorPhaseB_start - AB_crossfade) {
    return getGlobalColor(t);
  }

  // ── Crossfade A→B ─────────────────────────────────────────────────────────
  if (t < colorPhaseB_start) {
    let blend = smoothstep(map(t, colorPhaseB_start - AB_crossfade, colorPhaseB_start, 0, 1));
    let globalC = getGlobalColor(t);
    let elapsed = t - colorPhaseB_start + AB_crossfade;
    let pointC  = getPointColor(p, elapsed);
    return lerpColor(globalC, pointC, blend);
  }

  // ── Фаза B (чистый индивидуальный) ───────────────────────────────────────
  if (t <= colorEnd) {
    let elapsed = t - colorPhaseB_start;
    return getPointColor(p, elapsed);
  }

  // ── Crossfade B→глобальный ────────────────────────────────────────────────
  if (t < colorEnd + BC_crossfade) {
    let blend = smoothstep(map(t, colorEnd, colorEnd + BC_crossfade, 0, 1));
    let elapsed = t - colorPhaseB_start;
    let pointC  = getPointColor(p, elapsed);
    let globalC = getGlobalColor(t);
    return lerpColor(pointC, globalC, blend);
  }

  // ── Fade-out: глобальный → белый ─────────────────────────────────────────
  let fadeStart = colorEnd + BC_crossfade;
  let fadeEnd   = fadeStart + colorFadeDuration;
  if (t < fadeEnd) {
    let blend = smoothstep(map(t, fadeStart, fadeEnd, 0, 1));
    return lerpColor(getGlobalColor(t), color(255), blend);
  }

  // ── Полностью белый ───────────────────────────────────────────────────────
  return color(255);
}

// ── Smoothstep для плавных переходов ─────────────────────────────────────────
function smoothstep(t) {
  t = constrain(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function generateText() {
  if (pg) pg.remove();
  pg = createGraphics(width, height);
  pg.pixelDensity(1);
  pg.background(0);
  pg.fill(255);
  pg.noStroke();
  pg.textAlign(CENTER, CENTER);
  pg.textSize(min(width, height) * 0.08);
  pg.text("Everything in its right place", width / 2, height / 2);
  pg.loadPixels();

  particles = [];
  for (let x = 0; x < width; x += 3) {
    for (let y = 0; y < height; y += 3) {
      let index = 4 * (x + y * width);
      if (pg.pixels[index] > 100) {
        particles.push({
          homeX: x,
          homeY: y,
          x: width / 2,
          y: height / 2,
          z: -2000,
          phase: "forming",
          alpha: 0
        });
      }
    }
  }
}

function generateFinale() {
  let pg2 = createGraphics(width, height);
  pg2.pixelDensity(1);
  pg2.background(0);
  pg2.fill(255);
  pg2.noStroke();
  pg2.textAlign(CENTER, CENTER);
  pg2.textSize(min(width, height) * 0.09);
  pg2.text("Is everything in its right place?", width / 2, height / 2);
  pg2.loadPixels();

  let pix = pg2.pixels;
  let w = pg2.width;

  finalParticles = [];
  for (let x = 0; x < width; x += 2) {
    for (let y = 0; y < height; y += 4) {
      let index = 4 * (x + y * w);
      if (index < pix.length && pix[index] > 100) {
        let startZ = random(-2000, -800);
        finalParticles.push({
          homeX: x,
          homeY: y,
          x: x,
          y: y,
          z: startZ,
          zStart: startZ,
          vx: 0,
          vy: 0
        });
      }
    }
  }

  if (pg2.elt) pg2.elt.remove();
}

function spawnHint() {
  hints.push({
    x: random(-width * 0.3, width * 0.3),
    y: random(-height * 0.3, height * 0.3),
    z: -800,
    alpha: 0,
    fadingIn: true,
    dying: false,
    dead: false
  });
}

function updateVolume() {
  currentVolume = lerp(currentVolume, targetVolume, 0.012);
  if (song && song.isPlaying()) {
    song.setVolume(currentVolume);
  }
}

function updateTimer() {
  if (!started || finaleStarted) return;
  let now = millis();
  let delta = (now - lastMillis) / 1000;
  lastMillis = now;
  if (delta > 0 && delta < 1) songTimer += delta;

  if (!kaleidoscopeEnding && songTimer >= 205) {
    kaleidoscopeEnding = true;
  }

  // Финал в 3:30 = 210 сек
  if (songTimer >= 210) {
    finaleStarted = true;
    phase = "finale";
    targetVolume = 1.0;
    generateFinale();
  }
}

function draw() {
  background(0);

  if (!started) {
    drawPlayButton();
    return;
  }

  updateTimer();
  updateVolume();

  if (phase === "text") {
    drawTextPhase();
  } else if (phase === "kaleidoscope") {
    drawKaleidoscope();
  } else if (phase === "finale") {
    drawFinale();
  }
}

function drawTextPhase() {
  for (let p of particles) {
    if (p.phase === "forming") {
      p.x = lerp(p.x, p.homeX, 0.04);
      p.y = lerp(p.y, p.homeY, 0.04);
      p.alpha = lerp(p.alpha, 255, 0.03);
      let d = dist(p.x, p.y, p.homeX, p.homeY);
      if (d < 1.5) p.phase = "flying";
    } else {
      p.z += 5;
      if (p.z > 2600) p.done = true;
    }

    if (p.done) continue;

    let scale = focalLength / (focalLength - p.z);
    let sx = (p.x - width / 2) * scale + width / 2;
    let sy = (p.y - height / 2) * scale + height / 2;
    let fadeZ = map(p.z, -2000, 1600, 80, 255);
    let finalAlpha = min(p.alpha, fadeZ);
    stroke(255, finalAlpha);
    strokeWeight(constrain(scale * 1.5, 1, 10));
    point(sx, sy);
  }

  drawFilmGrain();

  if (!transitionTriggered && particles.length > 0) {
    let allDone = particles.every(p => p.done);
    if (allDone) {
      transitionTriggered = true;
      phase = "kaleidoscope";
      for (let i = 0; i < 3; i++) spawnHint();
    }
  }
}

function drawKaleidoscope() {
  push();
  translate(width / 2, height / 2);
  rotate(rotationAngle);

  for (let p of dots) {
    p.z += 4;
    let scaleFactor = focalLengthK / (focalLengthK - p.z);
    stroke(getDotColor(p));
    strokeWeight(constrain(scaleFactor * 1.5, 1, 12));
    for (let i = 0; i < symmetry; i++) {
      push();
      rotate(i * angleStep);
      let sx = p.x * scaleFactor;
      let sy = p.y * scaleFactor;
      point(sx, sy);
      point(sx, -sy);
      pop();
    }
  }

  dots = dots.filter(p => p.z < focalLengthK - 10);
  pop();

  rotationAngle += 0.0017;

  if (userActiveTimer > 0) userActiveTimer--;
  userActive = userActiveTimer > 0;

  targetVolume = userActive ? 1.0 : 0.08;

  if (!userActive && !kaleidoscopeEnding) {
    drawHints();
    if (frameCount % 180 === 0 && dots.length < 20) spawnHint();
  } else {
    for (let h of hints) h.dying = true;
    drawHints();
  }

  drawFilmGrain();
}

function drawFinale() {
  let fl = 1000;
  let approachSpeed = 3.5;

  for (let p of finalParticles) {
    if (p.z < 0) {
      p.z += approachSpeed;
      if (p.z > 0) p.z = 0;
    }

    let d = dist(mouseX, mouseY, p.x, p.y);
    if (d < 120) {
      let a = atan2(p.y - mouseY, p.x - mouseX);
      let force = map(d, 0, 120, 8, 0);
      p.vx += cos(a) * force;
      p.vy += sin(a) * force;
    }

    let dx = p.homeX - p.x;
    let dy = p.homeY - p.y;
    p.vx += dx * 0.01;
    p.vy += dy * 0.01;
    p.vx *= 0.9;
    p.vy *= 0.9;
    p.x += p.vx;
    p.y += p.vy;

    let scale = fl / (fl - p.z);
    let sx = (p.x - width / 2) * scale + width / 2;
    let sy = (p.y - height / 2) * scale + height / 2;

    let progress = constrain(map(p.z, p.zStart, 0, 0, 1), 0, 1);
    let eased = smoothstep(progress);

    stroke(255, eased * 255);
    strokeWeight(max(0.5, scale * 2 * eased));
    point(sx, sy);
  }

  drawFilmGrain();
}

function drawHints() {
  hints = hints.filter(h => !h.dead);

  for (let h of hints) {
    h.z += 3;

    if (h.dying) {
      h.alpha = lerp(h.alpha, 0, 0.08);
      if (h.alpha < 2) { h.dead = true; continue; }
    } else if (h.fadingIn) {
      h.alpha = lerp(h.alpha, 200, 0.04);
      if (h.alpha > 150) h.fadingIn = false;
    }

    let proximity = map(h.z, -800, 500, 0, 1);
    if (!h.dying && proximity > 0.7) {
      h.alpha = lerp(h.alpha, 0, 0.06);
    }

    if (h.z > 580) {
      h.dead = true;
      if (!userActive && !kaleidoscopeEnding && random() < 0.7) spawnHint();
      continue;
    }

    let scale = focalLength / (focalLength - h.z);
    let sx = width / 2 + h.x * scale;
    let sy = height / 2 + h.y * scale;
    let r = 44 * scale;

    noFill();
    stroke(255, h.alpha);
    strokeWeight(1.2);
    ellipse(sx, sy, r * 2, r * 2);
    noStroke();
    fill(255, h.alpha);
    textAlign(CENTER, CENTER);
    textSize(constrain(13 * scale, 8, 22));
    text("Click", sx, sy);
  }
}

function drawPlayButton() {
  let pulse = sin(frameCount * 0.04) * 10;
  noFill();
  stroke(255, 80);
  circle(width / 2, height / 2, 140 + pulse);
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(24);
  text("PLAY", width / 2, height / 2);
}

function drawFilmGrain() {
  stroke(255, 60);
  for (let i = 0; i < 100; i++) {
    point(random(width), random(height));
  }
}

function mousePressed() {
  if (!started) {
    let d = dist(mouseX, mouseY, width / 2, height / 2);
    if (d < 90) {
      started = true;
      lastMillis = millis();
      songTimer = 0;
      song.setVolume(1.0);
      currentVolume = 1.0;
      targetVolume = 1.0;
      song.play();
    }
  }
}

function mouseDragged() {
  if (phase !== "kaleidoscope" || kaleidoscopeEnding) return;
  userActiveTimer = 120;

  let inColorB = songTimer >= colorPhaseB_start && songTimer < colorEnd + BC_crossfade;
  if (inColorB) {
    birthColorIndex = (birthColorIndex + 0.4) % paletteWithWhite.length;
  }

  let d = dist(mouseX, mouseY, pmouseX, pmouseY);
  let steps = max(floor(d / 4), 1);
  for (let i = 0; i < steps; i++) {
    let t = i / steps;
    let x = lerp(pmouseX, mouseX, t) - width / 2;
    let y = lerp(pmouseY, mouseY, t) - height / 2;

    let cp;
    if (inColorB) {
      let goldenOffset = i * 2.399;
      cp = (birthColorIndex + goldenOffset + random(0.5)) % paletteWithWhite.length;
    } else {
      cp = random(paletteWithWhite.length);
    }
    dots.push({ x: x, y: y, z: 0, colorPhase: cp });
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (phase === "text") {
    generateText();
    transitionTriggered = false;
  }
}