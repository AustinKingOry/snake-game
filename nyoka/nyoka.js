/* Nyoka look: smooth-gliding snake, mangoes, dark forest theme.
 * Rules live in ../engine.js (loaded first): Engine, DIRS, BONUS_TICKS.
 */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const COLS = 20;
  const ROWS = 20;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- persistence ---------- */
  const STORE_KEY = 'nyoka.v1';
  const defaults = { mode: 'walls', muted: false, dpad: null, runs: [] };
  function load() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
    } catch (_) {
      return { ...defaults };
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (_) { /* storage unavailable (private mode): game still works */ }
  }
  const store = load();
  if (store.dpad === null) store.dpad = window.matchMedia('(pointer: coarse)').matches;

  const bestFor = (mode) =>
    store.runs.filter((r) => r.mode === mode).reduce((m, r) => Math.max(m, r.score), 0);

  /* ---------- elements ---------- */
  const board = $('#board');
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  const overlay = $('#overlay');
  const helpModal = $('#helpModal');
  const el = {
    score: $('#score'),
    best: $('#best'),
    level: $('#level'),
    pause: $('#btn-pause'),
    sound: $('#btn-sound'),
    help: $('#btn-help'),
    dpadToggle: $('#btn-dpad'),
    dpad: $('#dpad'),
    runs: $('#runs-list'),
    clear: $('#btn-clear'),
  };

  /* ---------- state ---------- */
  const engine = new Engine({ cols: COLS, rows: ROWS, wrap: store.mode === 'wrap' });
  let phase = 'ready'; // ready | playing | paused | over | won
  let accum = 0;
  let lastNow = performance.now();
  let particles = [];
  let floaters = [];
  let shake = 0;
  let deadFlash = 0;
  let cell = 20; // css px per grid cell
  let dpr = 1;

  /* ---------- audio (tiny synth, created on first input) ---------- */
  let audio = null;
  function tone(freq, dur, { type = 'sine', vol = 0.05, slide = 0, delay = 0 } = {}) {
    if (store.muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_) { /* audio is optional */ }
  }
  const sfx = {
    eat: () => tone(520, 0.1, { slide: 820, type: 'triangle' }),
    bonus: () => [660, 880, 1170].forEach((f, i) => tone(f, 0.12, { type: 'triangle', delay: i * 0.07 })),
    level: () => [440, 554, 659].forEach((f, i) => tone(f, 0.14, { type: 'square', vol: 0.025, delay: i * 0.08 })),
    die: () => tone(240, 0.45, { slide: 60, type: 'sawtooth', vol: 0.06 }),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', delay: i * 0.1 })),
  };

  /* ---------- canvas sizing ---------- */
  function resize() {
    const w = board.clientWidth;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    cell = w / COLS;
  }
  new ResizeObserver(resize).observe(board);
  resize();

  /* ---------- HUD ---------- */
  function updateHud(bump) {
    el.score.textContent = engine.score;
    el.level.textContent = engine.level;
    el.best.textContent = Math.max(bestFor(engine.wrap ? 'wrap' : 'walls'), engine.score);
    if (bump && !reduceMotion) {
      el.score.classList.remove('pop');
      void el.score.offsetWidth; // restart animation
      el.score.classList.add('pop');
    }
  }

  function renderRuns() {
    const top = [...store.runs].sort((a, b) => b.score - a.score).slice(0, 5);
    el.clear.hidden = !top.length;
    if (!top.length) {
      el.runs.innerHTML = '<li class="empty">No runs yet. Your five best will show up here.</li>';
      return;
    }
    el.runs.innerHTML = top
      .map((r, i) => {
        const d = new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `<li><span class="rank">${i + 1}</span><span class="run-score">${r.score}</span>` +
          `<span class="run-meta">${r.mode === 'wrap' ? 'Wrap' : 'Walls'} · level ${r.level} · ${d}</span></li>`;
      })
      .join('');
  }

  /* ---------- overlay screens ---------- */
  const MODE_COPY = {
    walls: 'Hitting the edge ends your run.',
    wrap: 'Edges loop around to the opposite side.',
  };
  function modePicker() {
    const m = engine.wrap ? 'wrap' : 'walls';
    return `
      <div class="seg" role="radiogroup" aria-label="Game mode">
        <button type="button" role="radio" aria-checked="${m === 'walls'}" data-set-mode="walls">Walls</button>
        <button type="button" role="radio" aria-checked="${m === 'wrap'}" data-set-mode="wrap">Wrap</button>
      </div>
      <p class="hint" id="mode-copy">${MODE_COPY[m]}</p>`;
  }

  function showOverlay(kind, extra = {}, focus = true) {
    let html = '';
    if (kind === 'ready') {
      html = `
        <h2>Nyoka is hungry</h2>
        <p>Eat mangoes to grow. Golden ones are worth triple, but they don't last.</p>
        ${modePicker()}
        <button class="btn primary" data-act="start">Play</button>
        <p class="hint keys">Arrow keys or WASD to steer. Swipe on a phone. Space pauses.</p>`;
    } else if (kind === 'paused') {
      html = `
        <h2>Paused</h2>
        <button class="btn primary" data-act="resume">Resume</button>
        <button class="btn" data-act="restart">Start over</button>`;
    } else if (kind === 'over') {
      const why = extra.cause === 'wall' ? 'You hit the wall.' : 'You ran into yourself.';
      html = `
        <h2>Run over</h2>
        <p>${why}</p>
        <div class="result"><span class="big">${engine.score}</span>
          <span class="sub">${extra.newBest ? 'New best' : 'Best ' + bestFor(engine.wrap ? 'wrap' : 'walls')} · level ${engine.level}</span></div>
        ${modePicker()}
        <button class="btn primary" data-act="start">Play again</button>`;
    } else if (kind === 'won') {
      html = `
        <h2>Board cleared</h2>
        <p>Every square is snake. Nothing left to eat.</p>
        <div class="result"><span class="big">${engine.score}</span><span class="sub">${extra.newBest ? 'New best' : 'Best ' + bestFor(engine.wrap ? 'wrap' : 'walls')}</span></div>
        <button class="btn primary" data-act="start">Play again</button>`;
    }
    overlay.innerHTML = `<div class="card ${kind}">${html}</div>`;
    overlay.hidden = false;
    const primary = overlay.querySelector('.primary');
    if (primary && focus) primary.focus({ preventScroll: true });
  }
  const hideOverlay = () => {
    overlay.hidden = true;
    overlay.innerHTML = '';
  };

  overlay.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-set-mode]');
    if (modeBtn) return setMode(modeBtn.dataset.setMode);
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'start' || act.dataset.act === 'restart') startNew();
    if (act.dataset.act === 'resume') resume();
  });

  function setMode(mode) {
    engine.wrap = mode === 'wrap';
    store.mode = mode;
    save();
    board.dataset.mode = mode;
    engine.reset();
    particles = [];
    floaters = [];
    phase = 'ready';
    updateHud();
    showOverlay('ready');
    overlay.querySelector(`[data-set-mode="${mode}"]`)?.focus({ preventScroll: true });
  }

  /* ---------- game flow ---------- */
  function startNew() {
    engine.reset();
    particles = [];
    floaters = [];
    shake = 0;
    deadFlash = 0;
    accum = 0;
    engine.status = 'playing';
    phase = 'playing';
    hideOverlay();
    updateHud();
    syncPauseButton();
  }

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    showOverlay('paused');
    syncPauseButton();
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = 'playing';
    lastNow = performance.now();
    hideOverlay();
    syncPauseButton();
  }
  function syncPauseButton() {
    el.pause.disabled = phase !== 'playing' && phase !== 'paused';
    el.pause.setAttribute('aria-label', phase === 'paused' ? 'Resume' : 'Pause');
    el.pause.dataset.state = phase === 'paused' ? 'paused' : 'playing';
  }

  function finish(kind, cause) {
    const mode = engine.wrap ? 'wrap' : 'walls';
    const newBest = engine.score > 0 && engine.score > bestFor(mode);
    if (engine.score > 0) {
      store.runs.push({ score: engine.score, mode, level: engine.level, at: Date.now() });
      store.runs = store.runs.sort((a, b) => b.score - a.score).slice(0, 20);
      save();
    }
    renderRuns();
    phase = kind; // 'over' | 'won'
    syncPauseButton();
    updateHud();
    // Let the death animation breathe before the card appears.
    setTimeout(() => {
      if (phase === kind) showOverlay(kind, { cause, newBest });
    }, kind === 'over' ? 700 : 300);
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'eat') {
        burst(ev.x + 0.5, ev.y + 0.5, ev.bonus ? '#ffd34d' : '#ffa62b', ev.bonus ? 22 : 12);
        floaters.push({ x: ev.x + 0.5, y: ev.y + 0.2, text: '+' + ev.points, life: 1 });
        (ev.bonus ? sfx.bonus : sfx.eat)();
        updateHud(true);
      } else if (ev.type === 'level') {
        sfx.level();
        updateHud();
      } else if (ev.type === 'die') {
        sfx.die();
        if (!reduceMotion) shake = 1;
        deadFlash = 1;
        finish('over', ev.cause);
      } else if (ev.type === 'won') {
        sfx.win();
        finish('won');
      }
    }
  }

  /* ---------- help dialog ---------- */
  let resumeAfterHelp = false;
  function openHelp() {
    resumeAfterHelp = false;
    pause();
    helpModal.showModal();
  }
  el.help.addEventListener('click', (e) => {
    e.currentTarget.blur();
    openHelp();
  });
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal || e.target.closest('[data-close]')) helpModal.close();
  });

  /* ---------- input ---------- */
  const KEY_DIR = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  function steer(dir) {
    if (phase === 'ready') startNew();
    if (phase === 'playing') engine.queueDirection(dir);
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || helpModal.open) return;
    const dir = KEY_DIR[e.key];
    if (dir) {
      e.preventDefault(); // keep arrows from scrolling the page
      if (phase === 'paused' || phase === 'over' || phase === 'won') return;
      steer(dir);
      return;
    }
    const onControl = e.target.closest && e.target.closest('button, [role="radio"]');
    if (e.key === ' ' || e.key === 'Enter') {
      if (onControl) return; // let the focused button handle its own activation
      e.preventDefault();
      if (phase === 'playing' && e.key === ' ') pause();
      else if (phase === 'paused') resume();
      else if (phase === 'ready' || phase === 'over' || phase === 'won') startNew();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (phase === 'playing') pause();
      else if (phase === 'paused') resume();
    } else if ((e.key === 'r' || e.key === 'R') && phase !== 'playing') {
      startNew();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleSound();
    }
  });

  // Swipe to steer
  let swipe = null;
  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    swipe = { x: e.clientX, y: e.clientY };
  });
  board.addEventListener('pointermove', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    swipe = { x: e.clientX, y: e.clientY };
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
    board.addEventListener(t, () => (swipe = null))
  );

  // On-screen d-pad
  el.dpad.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-dir]');
    if (!b) return;
    e.preventDefault();
    steer(b.dataset.dir);
  });

  // Toolbar
  el.pause.addEventListener('click', () => {
    phase === 'paused' ? resume() : pause();
    el.pause.blur();
  });
  function toggleSound() {
    store.muted = !store.muted;
    save();
    syncSound();
    if (!store.muted) sfx.eat();
  }
  function syncSound() {
    el.sound.setAttribute('aria-pressed', String(!store.muted));
    el.sound.setAttribute('aria-label', store.muted ? 'Sound off' : 'Sound on');
    el.sound.dataset.state = store.muted ? 'off' : 'on';
  }
  el.sound.addEventListener('click', () => {
    toggleSound();
    el.sound.blur();
  });
  function syncDpad() {
    el.dpad.hidden = !store.dpad;
    el.dpadToggle.setAttribute('aria-pressed', String(store.dpad));
  }
  el.dpadToggle.addEventListener('click', () => {
    store.dpad = !store.dpad;
    save();
    syncDpad();
    el.dpadToggle.blur();
  });
  el.clear.addEventListener('click', () => {
    store.runs = [];
    save();
    renderRuns();
    updateHud();
  });

  // Never let the snake keep moving while nobody is looking.
  document.addEventListener('visibilitychange', () => document.hidden && pause());
  window.addEventListener('blur', pause);

  /* ---------- effects ---------- */
  function burst(x, y, color, n) {
    if (reduceMotion) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * 3.2;
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 1, decay: 1.6 + Math.random() * 1.4, size: 0.06 + Math.random() * 0.08, color,
      });
    }
  }
  function updateFx(dt) {
    const s = dt / 1000;
    for (const p of particles) {
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= p.decay * s;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) {
      f.y -= 0.9 * s;
      f.life -= 1.3 * s;
    }
    floaters = floaters.filter((f) => f.life > 0);
    shake = Math.max(0, shake - s * 2.4);
    deadFlash = Math.max(0, deadFlash - s * 0.6);
  }

  /* ---------- rendering (units are grid cells) ---------- */
  const C = {
    a: '#15291f', b: '#183024',
    bodyDark: '#256b34', body: '#58b947', spot: '#2f8a3b',
    head: '#7bd653', dead: '#b8503c', deadDark: '#6e2a20',
    mango1: '#ffc83d', mango2: '#ff8a1f', leaf: '#3f9f3f',
    gold1: '#fff2a0', gold2: '#ffc01f',
  };

  function lerpSeg(i, t) {
    const a = engine.prev[i] || engine.snake[i];
    const b = engine.snake[i];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (engine.wrap) {
      if (dx > 1) dx -= COLS; else if (dx < -1) dx += COLS;
      if (dy > 1) dy -= ROWS; else if (dy < -1) dy += ROWS;
    }
    let x = a.x + dx * t;
    let y = a.y + dy * t;
    if (engine.wrap) {
      x = (x + COLS) % COLS;
      y = (y + ROWS) % ROWS;
    }
    return { x: x + 0.5, y: y + 0.5 };
  }

  function drawBoard() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = (x + y) % 2 ? C.a : C.b;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function drawMango(x, y, now, { bonus = false, ttl = 1 } = {}) {
    const pulse = 1 + Math.sin(now / 240) * 0.05;
    const r = (bonus ? 0.5 : 0.44) * pulse;
    ctx.save();
    ctx.translate(x, y + 0.04);
    if (bonus) {
      ctx.beginPath();
      ctx.arc(0, 0, 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ttl);
      ctx.strokeStyle = 'rgba(255, 226, 120, 0.85)';
      ctx.lineWidth = 0.07;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowColor = 'rgba(255, 210, 70, 0.9)';
      ctx.shadowBlur = 0.5 * cell * dpr;
    }
    ctx.rotate(-0.45);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.3);
    g.addColorStop(0, bonus ? C.gold1 : C.mango1);
    g.addColorStop(1, bonus ? C.gold2 : C.mango2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.9, r * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (!bonus) {
      ctx.fillStyle = 'rgba(255, 90, 60, 0.35)';
      ctx.beginPath();
      ctx.ellipse(r * 0.38, r * 0.2, r * 0.42, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.leaf;
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 1.12, r * 0.32, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake(t, now) {
    const n = engine.snake.length;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(lerpSeg(i, t));
    const dead = deadFlash > 0;

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) {
        const jump = Math.abs(pts[i].x - pts[i - 1].x) > 1.5 || Math.abs(pts[i].y - pts[i - 1].y) > 1.5;
        jump ? ctx.moveTo(pts[i].x, pts[i].y) : ctx.lineTo(pts[i].x, pts[i].y);
      }
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    trace();
    ctx.strokeStyle = dead ? C.deadDark : C.bodyDark;
    ctx.lineWidth = 0.84;
    ctx.stroke();
    trace();
    ctx.strokeStyle = dead ? C.dead : C.body;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    trace();
    ctx.strokeStyle = 'rgba(164, 229, 122, 0.38)';
    ctx.lineWidth = 0.26;
    ctx.stroke();

    ctx.fillStyle = dead ? C.deadDark : C.spot;
    for (let i = 2; i < n - 1; i += 2) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 0.13, 0, Math.PI * 2);
      ctx.fill();
    }

    const h = pts[0];
    const d = DIRS[engine.dir];
    const px = -d.y;
    const py = d.x;

    if (!dead && ((now / 1000) % 1.7) < 0.2) {
      ctx.strokeStyle = '#ff5a3c';
      ctx.lineWidth = 0.06;
      const bx = h.x + d.x * 0.5;
      const by = h.y + d.y * 0.5;
      const tx = h.x + d.x * 0.88;
      const ty = h.y + d.y * 0.88;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + d.x * 0.1 + px * 0.09, ty + d.y * 0.1 + py * 0.09);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + d.x * 0.1 - px * 0.09, ty + d.y * 0.1 - py * 0.09);
      ctx.stroke();
    }

    ctx.fillStyle = dead ? C.dead : C.head;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 0.46, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      const ex = h.x + d.x * 0.13 + px * 0.2 * side;
      const ey = h.y + d.y * 0.13 + py * 0.2 * side;
      ctx.fillStyle = '#f4fbef';
      ctx.beginPath();
      ctx.arc(ex, ey, 0.115, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d1a13';
      ctx.beginPath();
      ctx.arc(ex + d.x * 0.04, ey + d.y * 0.04, 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function render(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = cell * dpr;
    const sx = shake ? (Math.random() - 0.5) * shake * 0.6 : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * 0.6 : 0;
    ctx.setTransform(px, 0, 0, px, sx * px, sy * px);

    drawBoard();

    if (engine.food) drawMango(engine.food.x + 0.5, engine.food.y + 0.5, now);
    if (engine.bonus) {
      drawMango(engine.bonus.x + 0.5, engine.bonus.y + 0.5, now, {
        bonus: true,
        ttl: engine.bonus.ttl / BONUS_TICKS,
      });
    }

    let t = 1;
    if (phase === 'playing' || phase === 'paused') t = Math.min(1, Math.max(0, accum / engine.tickMs));
    drawSnake(t, now);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = '700 0.5px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
      ctx.fillStyle = '#fff4c2';
      ctx.fillText(f.text, Math.min(COLS - 0.9, Math.max(0.9, f.x)), f.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    const dt = Math.min(now - lastNow, 100);
    lastNow = now;
    if (phase === 'playing') {
      accum += dt;
      let interval = engine.tickMs;
      while (accum >= interval && engine.status === 'playing') {
        accum -= interval;
        handleEvents(engine.step());
        interval = engine.tickMs;
      }
    }
    updateFx(dt);
    render(now);
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  board.dataset.mode = store.mode;
  syncSound();
  syncDpad();
  syncPauseButton();
  renderRuns();
  updateHud();
  showOverlay('ready', {}, false); // no focus ring on first paint
  requestAnimationFrame(frame);

  window.__nyoka = { engine, get phase() { return phase; } };
})();
