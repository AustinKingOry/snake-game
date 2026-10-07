/* Snake Game.
 * Part 1: Engine (pure game rules, no DOM, unit-testable in Node).
 * Part 2: UI (canvas rendering, input, audio, persistence).
 */

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const FRUIT_PER_LEVEL = 5;
const BONUS_EVERY = 4; // a golden mango appears after every 4th fruit
const BONUS_TICKS = 50; // how long it stays on the board
const POINTS = { fruit: 10, bonus: 30 };

class Engine {
  constructor({ cols = 20, rows = 20, wrap = false, rng = Math.random } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.wrap = wrap;
    this.rng = rng;
    this.reset();
  }

  reset() {
    const cy = Math.floor(this.rows / 2);
    const cx = Math.floor(this.cols / 3);
    this.snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    this.prev = this.snake.map((s) => ({ ...s })); // positions one tick ago (for smooth rendering)
    this.dir = 'right';
    this.queue = []; // buffered turns, applied one per tick
    this.score = 0;
    this.eaten = 0;
    this.status = 'ready'; // ready | playing | over | won
    this.cause = null; // 'wall' | 'self' when over
    this.bonus = null;
    this.food = null;
    this.food = this.spawn();
  }

  get level() {
    return 1 + Math.floor(this.eaten / FRUIT_PER_LEVEL);
  }

  /** Milliseconds per tick: speeds up with level, floors at 68ms. */
  get tickMs() {
    return Math.max(68, 145 - (this.level - 1) * 8);
  }

  /** Buffer a turn. Compared against the last *queued* direction so two quick
   *  presses can never fold the snake back onto itself. */
  queueDirection(dir) {
    if (!DIRS[dir]) return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (dir === last || dir === OPPOSITE[last]) return false;
    if (this.queue.length >= 2) return false;
    this.queue.push(dir);
    return true;
  }

  freeCells() {
    const taken = new Set(this.snake.map((s) => s.y * this.cols + s.x));
    if (this.food) taken.add(this.food.y * this.cols + this.food.x);
    if (this.bonus) taken.add(this.bonus.y * this.cols + this.bonus.x);
    const free = [];
    for (let i = 0; i < this.cols * this.rows; i++) {
      if (!taken.has(i)) free.push(i);
    }
    return free;
  }

  spawn() {
    const free = this.freeCells();
    if (!free.length) return null;
    const i = free[Math.floor(this.rng() * free.length)];
    return { x: i % this.cols, y: Math.floor(i / this.cols) };
  }

  /** Advance one tick. Returns a list of events for the UI to react to. */
  step() {
    if (this.status !== 'playing') return [];
    const events = [];

    if (this.queue.length) this.dir = this.queue.shift();
    const d = DIRS[this.dir];
    const head = this.snake[0];
    let nx = head.x + d.x;
    let ny = head.y + d.y;

    if (this.wrap) {
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
    } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      return this._die('wall');
    }

    const hitsFood = !!this.food && this.food.x === nx && this.food.y === ny;
    const hitsBonus = !!this.bonus && this.bonus.x === nx && this.bonus.y === ny;
    const grows = hitsFood || hitsBonus;

    // The tail cell is vacated this tick, so it's only solid when we grow.
    const solid = grows ? this.snake.length : this.snake.length - 1;
    for (let i = 0; i < solid; i++) {
      if (this.snake[i].x === nx && this.snake[i].y === ny) return this._die('self');
    }

    this.prev = this.snake.map((s) => ({ ...s }));
    this.snake.unshift({ x: nx, y: ny });
    if (grows) {
      this.prev.push({ ...this.prev[this.prev.length - 1] });
    } else {
      this.snake.pop();
    }

    // Bonus countdown
    if (this.bonus && !hitsBonus) {
      this.bonus.ttl -= 1;
      if (this.bonus.ttl <= 0) {
        events.push({ type: 'bonusExpired', x: this.bonus.x, y: this.bonus.y });
        this.bonus = null;
      }
    }

    if (hitsFood) {
      this.score += POINTS.fruit;
      this.eaten += 1;
      events.push({ type: 'eat', x: nx, y: ny, points: POINTS.fruit, bonus: false });
      this.food = null;
      this.food = this.spawn();
      if (!this.bonus && this.eaten % BONUS_EVERY === 0) {
        const cell = this.spawn();
        if (cell) this.bonus = { ...cell, ttl: BONUS_TICKS };
      }
    } else if (hitsBonus) {
      this.score += POINTS.bonus;
      this.eaten += 1;
      events.push({ type: 'eat', x: nx, y: ny, points: POINTS.bonus, bonus: true });
      this.bonus = null;
    }

    if (grows && this.level > 1 && this.eaten % FRUIT_PER_LEVEL === 0) {
      events.push({ type: 'level', level: this.level });
    }

    if (this.snake.length >= this.cols * this.rows) {
      this.status = 'won';
      events.push({ type: 'won' });
    }
    return events;
  }

  _die(cause) {
    this.status = 'over';
    this.cause = cause;
    return [{ type: 'die', cause }];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Engine, DIRS, OPPOSITE };
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

if (typeof document !== 'undefined') {
  (function () {
    const $ = (sel) => document.querySelector(sel);

    // Same tile look as the original: 12px tiles with a 1px gap.
    const TILE = 12;
    const PITCH = TILE + 1;
    const MIN_CELLS = 10;

    const C = {
      page: '#f9fafb', line: '#efefe8',
      head: '#4b5563', body: '#6b7280', dead: '#ef4444',
      food: '#2563eb', bonus: '#f59e0b',
    };

    /* ---------- persistence ---------- */
    const STORE_KEY = 'snake.v2';
    const defaults = { mode: 'walls', muted: true, fx: true, dpad: null, runs: [], played: 0, fruit: 0, longest: 3 };
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
      } catch (_) { /* storage unavailable — the game still works */ }
    }
    const store = load();
    if (store.dpad === null) store.dpad = window.matchMedia('(pointer: coarse)').matches;
    const bestFor = (mode) =>
      store.runs.filter((r) => r.mode === mode).reduce((m, r) => Math.max(m, r.score), 0);

    /* ---------- elements ---------- */
    const gridArea = $('#snake-grid');
    const canvas = $('#canvas');
    const ctx = canvas.getContext('2d');
    const frameEl = $('#game-frame');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fxOn = () => store.fx && !reduceMotion;
    const hint = $('#hint');
    const el = {
      score: $('#score'),
      levelChip: $('#level-chip'),
      flash: $('#flash'),
      controls: $('#controls'),
      controlsBtn: $('#toggle-controls'),
      panel: $('#interactions'),
      panelBtn: $('#toggle-interactions'),
      toast: $('#responseToast'),
      toastMsg: $('#toast-message'),
      modal: $('#aboutModal'),
      runs: $('#runs-list'),
      stats: $('#stats-list'),
    };

    /* ---------- state ---------- */
    const engine = new Engine({ cols: 20, rows: 20, wrap: store.mode === 'wrap' });
    let phase = 'ready'; // ready | playing | paused | over | won
    let accum = 0;
    let lastNow = performance.now();
    let dpr = 1;
    let pendingFit = false;
    let toastTimer = null;
    let wasPlayingBeforeModal = false;
    let particles = [];
    let floaters = [];
    let flashTimer = null;

    /* ---------- audio (optional, off by default) ---------- */
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
    const buzz = (ms) => {
      if (!store.muted && navigator.vibrate) navigator.vibrate(ms);
    };
    const sfx = {
      eat: () => tone(520, 0.09, { slide: 780, type: 'triangle' }),
      bonus: () => [660, 880, 1170].forEach((f, i) => tone(f, 0.1, { type: 'triangle', delay: i * 0.06 })),
      die: () => tone(240, 0.4, { slide: 60, type: 'sawtooth', vol: 0.05 }),
    };

    /* ---------- sizing: fit as many 12px tiles as the frame allows ---------- */
    function measure() {
      const w = gridArea.clientWidth;
      const h = gridArea.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return {
        cols: Math.max(MIN_CELLS, Math.floor(w / PITCH)),
        rows: Math.max(MIN_CELLS, Math.floor(h / PITCH)),
      };
    }
    function fit(force) {
      const { cols, rows } = measure();
      if (cols === engine.cols && rows === engine.rows) return;
      // Never rebuild the board under a running game (the old version did).
      if (!force && (phase === 'playing' || phase === 'paused')) {
        pendingFit = true;
        return;
      }
      engine.cols = cols;
      engine.rows = rows;
      engine.reset();
      pendingFit = false;
    }
    new ResizeObserver(() => fit(false)).observe(gridArea);

    /* ---------- hint pill ---------- */
    const HINTS = {
      ready: '<strong>Press an arrow key</strong> or tap the grid to start',
      paused: '<strong>Paused</strong><br>Press Space or tap to resume',
      over: '<strong>Game over</strong><br>Press Space, tap, or <b>↺</b> to play again',
      won: '<strong>Board cleared!</strong><br>Press Space or tap to play again',
    };
    function syncHint() {
      const html = HINTS[phase];
      hint.hidden = !html;
      if (html) hint.innerHTML = html;
    }
    function setPhase(p) {
      phase = p;
      syncHint();
    }

    /* ---------- side panel ---------- */
    function renderRuns() {
      const top = [...store.runs].sort((a, b) => b.score - a.score).slice(0, 5);
      if (!top.length) {
        el.runs.innerHTML = '<li class="empty">No runs yet. Play a round and your best five will show up here.</li>';
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
    function renderStats() {
      const rows = [
        ['Games played', store.played],
        ['Best (Walls)', bestFor('walls')],
        ['Best (Wrap)', bestFor('wrap')],
        ['Food eaten', store.fruit],
        ['Longest snake', store.longest],
      ];
      el.stats.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    }
    function setPanel(open) {
      el.panel.hidden = !open;
      el.panelBtn.setAttribute('aria-pressed', String(open));
    }
    el.panelBtn.addEventListener('click', () => {
      setPanel(el.panel.hidden);
      el.panelBtn.blur();
    });
    document.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => {
          const on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', String(on));
          document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        });
      })
    );
    $('#btn-clear').addEventListener('click', () => {
      store.runs = [];
      store.played = 0;
      store.fruit = 0;
      store.longest = 3;
      save();
      renderRuns();
      renderStats();
    });

    /* ---------- toast ---------- */
    function showToast(html) {
      el.toastMsg.innerHTML = html;
      el.toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 5000);
    }
    function hideToast() {
      el.toast.hidden = true;
      clearTimeout(toastTimer);
    }
    $('#toast-close').addEventListener('click', hideToast);

    /* ---------- on-screen controls ---------- */
    function syncControls() {
      el.controls.hidden = !store.dpad;
      el.controlsBtn.setAttribute('aria-pressed', String(store.dpad));
    }
    el.controlsBtn.addEventListener('click', () => {
      store.dpad = !store.dpad;
      save();
      syncControls();
      el.controlsBtn.blur();
    });
    [['up', '#move-up'], ['down', '#move-down'], ['left', '#move-left'], ['right', '#move-right']].forEach(
      ([dir, sel]) => {
        $(sel).addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          steer(dir);
        });
      }
    );

    /* ---------- how to play ---------- */
    const MODE_COPY = {
      walls: 'Hitting the edge ends your run.',
      wrap: 'Edges loop around to the opposite side.',
    };
    function syncModeUi() {
      const m = engine.wrap ? 'wrap' : 'walls';
      document.querySelectorAll('[data-set-mode]').forEach((b) =>
        b.setAttribute('aria-checked', String(b.dataset.setMode === m))
      );
      $('#mode-copy').textContent = MODE_COPY[m];
      $('#sound-toggle').checked = !store.muted;
      $('#fx-toggle').checked = store.fx;
    }
    function openHelp() {
      wasPlayingBeforeModal = phase === 'playing';
      pause();
      syncModeUi();
      el.modal.showModal();
    }
    $('#aboutModalBtn').addEventListener('click', (e) => {
      e.currentTarget.blur();
      openHelp();
    });
    el.modal.addEventListener('click', (e) => {
      if (e.target === el.modal || e.target.closest('[data-close]')) el.modal.close();
      const modeBtn = e.target.closest('[data-set-mode]');
      if (modeBtn) setMode(modeBtn.dataset.setMode);
    });
    el.modal.addEventListener('close', () => {
      // Stay paused: the player resumes when they're ready.
      if (wasPlayingBeforeModal && phase === 'paused') syncHint();
      wasPlayingBeforeModal = false;
    });
    $('#sound-toggle').addEventListener('change', (e) => {
      store.muted = !e.target.checked;
      save();
      if (!store.muted) { sfx.eat(); buzz(15); }
    });
    $('#fx-toggle').addEventListener('change', (e) => {
      store.fx = e.target.checked;
      save();
      if (!store.fx) { particles = []; floaters = []; }
    });

    function setMode(mode) {
      engine.wrap = mode === 'wrap';
      store.mode = mode;
      save();
      fit(true);
      engine.reset();
      clearFx();
      setPhase('ready');
      hideToast();
      syncModeUi();
      updateScore();
    }

    /* ---------- game flow ---------- */
    function updateScore(bump) {
      el.score.textContent = engine.score;
      el.levelChip.textContent = 'Lv ' + engine.level;
      if (bump && fxOn()) {
        el.score.classList.remove('pop');
        void el.score.offsetWidth; // restart the animation
        el.score.classList.add('pop');
      }
    }

    /* ---------- effects ---------- */
    function clearFx() {
      particles = [];
      floaters = [];
      el.flash.hidden = true;
      el.flash.classList.remove('show');
    }
    function burst(tx, ty, colors, n) {
      if (!fxOn()) return;
      const cx = tx * PITCH + TILE / 2;
      const cy = ty * PITCH + TILE / 2;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 40 + Math.random() * 90;
        particles.push({
          x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 1, decay: 1.8 + Math.random() * 1.2,
          size: 2 + Math.random() * 2, color: colors[i % colors.length],
        });
      }
    }
    function floatText(tx, ty, text, color) {
      if (!fxOn()) return;
      floaters.push({ x: tx * PITCH + TILE / 2, y: ty * PITCH - 2, text, color, life: 1 });
    }
    function updateFx(dt) {
      const s = dt / 1000;
      for (const p of particles) {
        p.x += p.vx * s;
        p.y += p.vy * s;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life -= p.decay * s;
      }
      particles = particles.filter((p) => p.life > 0);
      for (const f of floaters) {
        f.y -= 22 * s;
        f.life -= 1.25 * s;
      }
      floaters = floaters.filter((f) => f.life > 0);
    }
    function shakeFrame() {
      if (!fxOn()) return;
      frameEl.classList.remove('shake');
      void frameEl.offsetWidth;
      frameEl.classList.add('shake');
    }
    frameEl.addEventListener('animationend', (e) => {
      if (e.animationName === 'shake') frameEl.classList.remove('shake');
    });
    function flashMessage(text) {
      el.flash.textContent = text;
      el.flash.hidden = false;
      el.flash.classList.remove('show');
      void el.flash.offsetWidth;
      el.flash.classList.add('show');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (el.flash.hidden = true), 1400);
    }

    function startNew() {
      if (pendingFit) fit(true);
      engine.reset();
      engine.status = 'playing';
      accum = 0;
      clearFx();
      hideToast();
      setPhase('playing');
      updateScore();
    }

    function resetGame() {
      if (pendingFit) fit(true);
      engine.reset();
      accum = 0;
      clearFx();
      hideToast();
      setPhase('ready');
      updateScore();
    }

    function pause() {
      if (phase !== 'playing') return;
      setPhase('paused');
    }
    function resume() {
      if (phase !== 'paused') return;
      lastNow = performance.now();
      setPhase('playing');
    }

    function finish(kind, cause) {
      const mode = engine.wrap ? 'wrap' : 'walls';
      const newBest = engine.score > 0 && engine.score > bestFor(mode);
      store.played += 1;
      store.fruit += engine.eaten;
      store.longest = Math.max(store.longest, engine.snake.length);
      if (engine.score > 0) {
        store.runs.push({ score: engine.score, mode, level: engine.level, at: Date.now() });
        store.runs = store.runs.sort((a, b) => b.score - a.score).slice(0, 20);
      }
      save();
      renderRuns();
      renderStats();
      setPhase(kind);
      const why = kind === 'won' ? 'You cleared the board!' : '';
      showToast(`${kind === 'won' ? 'You win!' : 'Game Over!'} Score: ${engine.score}${newBest ? ' · New best!' : ''}${why ? '<br>' + why : ''}`);
    }

    function handleEvents(events) {
      for (const ev of events) {
        if (ev.type === 'eat') {
          (ev.bonus ? sfx.bonus : sfx.eat)();
          buzz(ev.bonus ? [12, 40, 12] : 10);
          burst(ev.x, ev.y, ev.bonus ? ['#f59e0b', '#fcd34d'] : ['#2563eb', '#93c5fd'], ev.bonus ? 14 : 9);
          floatText(ev.x, ev.y, '+' + ev.points, ev.bonus ? '#b45309' : '#4b5563');
          updateScore(true);
        } else if (ev.type === 'level') {
          updateScore();
          flashMessage('Level ' + ev.level + ' · faster');
        } else if (ev.type === 'die') {
          sfx.die();
          buzz(70);
          shakeFrame();
          finish('over', ev.cause);
        } else if (ev.type === 'won') {
          updateScore();
          finish('won');
        }
      }
    }

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

    // Turn a tap on a tile into a direction, relative to the head (original behaviour).
    function steerToward(tx, ty) {
      const h = engine.snake[0];
      const dx = tx - h.x;
      const dy = ty - h.y;
      if (dx === 0 && dy === 0) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const want = horizontal ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      steer(want);
      // If that was a direct reverse (rejected), fall back to the other axis.
      if (phase === 'playing' && engine.queue[engine.queue.length - 1] !== want && engine.dir !== want) {
        const alt = horizontal ? (dy > 0 ? 'down' : dy < 0 ? 'up' : null) : dx > 0 ? 'right' : dx < 0 ? 'left' : null;
        if (alt) engine.queueDirection(alt);
      }
    }

    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || el.modal.open) return;
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault(); // keep arrows from scrolling the page
        if (phase === 'paused' || phase === 'over' || phase === 'won') return;
        steer(dir);
        return;
      }
      const onControl = e.target.closest && e.target.closest('button, input, [role="radio"]');
      if (e.key === ' ' || e.key === 'Enter') {
        if (onControl) return; // let a focused button handle its own activation
        e.preventDefault();
        if (phase === 'playing' && e.key === ' ') pause();
        else if (phase === 'paused') resume();
        else if (phase === 'ready' || phase === 'over' || phase === 'won') startNew();
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (phase === 'playing') pause();
        else if (phase === 'paused') resume();
      } else if (e.key === 'r' || e.key === 'R') {
        resetGame();
      } else if (e.key === 'm' || e.key === 'M') {
        store.muted = !store.muted;
        save();
        if (!store.muted) sfx.eat();
      }
    });

    // Grid: tap/click to steer, swipe to steer
    let touch = null;
    gridArea.addEventListener('pointerdown', (e) => {
      touch = { x: e.clientX, y: e.clientY, swiped: false };
    });
    gridArea.addEventListener('pointermove', (e) => {
      if (!touch || e.pointerType === 'mouse') return;
      const dx = e.clientX - touch.x;
      const dy = e.clientY - touch.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      touch = { x: e.clientX, y: e.clientY, swiped: true };
      steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    });
    gridArea.addEventListener('pointerup', (e) => {
      const t = touch;
      touch = null;
      if (!t || t.swiped) return;
      if (phase === 'paused') return resume();
      if (phase === 'over' || phase === 'won') return startNew();
      const r = canvas.getBoundingClientRect();
      const tx = Math.min(engine.cols - 1, Math.max(0, Math.floor((e.clientX - r.left) / PITCH)));
      const ty = Math.min(engine.rows - 1, Math.max(0, Math.floor((e.clientY - r.top) / PITCH)));
      if (phase === 'ready') return startNew();
      steerToward(tx, ty);
    });
    ['pointercancel', 'pointerleave'].forEach((t) => gridArea.addEventListener(t, () => (touch = null)));

    $('#reset-game').addEventListener('click', (e) => {
      resetGame();
      e.currentTarget.blur();
    });

    // Never let the snake keep moving while nobody is looking.
    document.addEventListener('visibilitychange', () => document.hidden && pause());
    window.addEventListener('blur', pause);

    /* ---------- rendering ---------- */
    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function tile(x, y, color, inset = 0) {
      ctx.fillStyle = color;
      rr(x * PITCH + inset, y * PITCH + inset, TILE - inset * 2, TILE - inset * 2, 4);
      ctx.fill();
    }

    // Two tiny eyes so you can tell where the head is facing.
    const DIR_V = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    function drawEyes() {
      const h = engine.snake[0];
      const [dx, dy] = DIR_V[engine.dir];
      const cx = h.x * PITCH + TILE / 2 + dx * 1.6;
      const cy = h.y * PITCH + TILE / 2 + dy * 1.6;
      for (const side of [-1, 1]) {
        const ex = cx - dy * 2.6 * side;
        const ey = cy + dx * 2.6 * side;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, ey, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(ex + dx * 0.6, ey + dy * 0.6, 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function render(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.fillStyle = C.page;
      ctx.fillRect(0, 0, W, H);

      // tile outlines, in the 1px gaps (same look as the old CSS outline)
      const gw = engine.cols * PITCH;
      const gh = engine.rows * PITCH;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i <= engine.cols; i++) {
        ctx.moveTo(i * PITCH - 0.5, 0);
        ctx.lineTo(i * PITCH - 0.5, gh);
      }
      for (let j = 1; j <= engine.rows; j++) {
        ctx.moveTo(0, j * PITCH - 0.5);
        ctx.lineTo(gw, j * PITCH - 0.5);
      }
      ctx.stroke();

      if (engine.food) tile(engine.food.x, engine.food.y, C.food);
      if (engine.bonus) {
        const blinkOff = engine.bonus.ttl <= 12 && Math.floor(now / 160) % 2 === 0;
        if (!blinkOff) tile(engine.bonus.x, engine.bonus.y, C.bonus);
      }

      const dead = phase === 'over';
      for (let i = engine.snake.length - 1; i >= 0; i--) {
        const s = engine.snake[i];
        if (i === 0) tile(s.x, s.y, dead ? C.dead : C.head);
        else tile(s.x, s.y, C.body, 1);
      }
      drawEyes();

      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        rr(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, 1);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      for (const f of floaters) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, Math.min(gw - 14, Math.max(14, f.x)), Math.max(10, f.y));
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
    fit(true);
    syncControls();
    renderRuns();
    renderStats();
    updateScore();
    setPhase('ready');
    requestAnimationFrame(frame);

    window.__snake = { engine, get phase() { return phase; } };
  })();
}
