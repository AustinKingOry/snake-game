/* Snake engine: the pure game rules, shared by both looks (classic and Nyoka).
 * No DOM in here, so it's unit-testable in Node: node tests/engine.test.js
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
