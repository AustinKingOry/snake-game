// Run with: node tests/engine.test.js
const assert = require('assert');
const { Engine } = require('../engine.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const start = (opts) => { const e = new Engine(opts); e.status = 'playing'; return e; };

test('moves one cell right per tick', () => {
  const e = start();
  const h = { ...e.snake[0] };
  e.step();
  assert.deepStrictEqual(e.snake[0], { x: h.x + 1, y: h.y });
  assert.strictEqual(e.snake.length, 3);
});

test('wall hit ends the run (walls mode)', () => {
  const e = start({ cols: 6, rows: 6 });
  let ev = [];
  for (let i = 0; i < 10 && e.status === 'playing'; i++) ev = e.step();
  assert.strictEqual(e.status, 'over');
  assert.strictEqual(e.cause, 'wall');
  assert.strictEqual(ev[0].type, 'die');
});

test('wrap mode loops across every edge', () => {
  const e = start({ cols: 6, rows: 6, wrap: true });
  for (let i = 0; i < 12; i++) e.step();
  assert.strictEqual(e.status, 'playing');
  for (const d of ['up', 'left', 'down']) {
    e.queueDirection(d);
    for (let i = 0; i < 14; i++) e.step();
    assert.strictEqual(e.status, 'playing', 'died heading ' + d);
  }
});

test('two rapid turns cannot reverse the snake into itself (old bug)', () => {
  const e = start();
  assert.ok(e.queueDirection('up'));
  assert.strictEqual(e.queueDirection('down'), false, 'down would fold onto up');
  assert.ok(e.queueDirection('left'), 'right → up → left is legal across two ticks');
  e.step(); e.step();
  assert.strictEqual(e.status, 'playing');
});

test('direct reverse is rejected', () => {
  const e = start();
  assert.strictEqual(e.queueDirection('left'), false);
  assert.strictEqual(e.queueDirection('right'), false);
});

test('buffer holds at most two turns', () => {
  const e = start();
  assert.ok(e.queueDirection('up'));
  assert.ok(e.queueDirection('left'));
  assert.strictEqual(e.queueDirection('down'), false);
  assert.strictEqual(e.queue.length, 2);
});

test('eating grows the snake, scores 10, respawns food off the snake', () => {
  const e = start({ rng: seq(0.5) });
  e.food = { x: e.snake[0].x + 1, y: e.snake[0].y };
  const ev = e.step();
  assert.strictEqual(e.snake.length, 4);
  assert.strictEqual(e.score, 10);
  assert.ok(ev.some((x) => x.type === 'eat' && !x.bonus));
  assert.ok(!e.snake.some((s) => s.x === e.food.x && s.y === e.food.y));
});

test('moving into the vacating tail cell is legal; growing into it is not', () => {
  // 2x2 loop: snake chases its own tail
  const e = start({ cols: 4, rows: 4 });
  e.snake = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }];
  e.prev = e.snake.map((s) => ({ ...s }));
  e.dir = 'up'; e.food = { x: 0, y: 0 };
  e.queue = ['right'];                 // head (1,1) → (2,1) which is the tail
  e.step();
  assert.strictEqual(e.status, 'playing');

  const g = start({ cols: 4, rows: 4 });
  g.snake = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }];
  g.prev = g.snake.map((s) => ({ ...s }));
  g.dir = 'up'; g.food = { x: 2, y: 1 };   // food sits on the tail cell
  g.queue = ['right'];
  g.step();
  assert.strictEqual(g.status, 'over');
  assert.strictEqual(g.cause, 'self');
});

test('self collision ends the run', () => {
  const e = start({ cols: 10, rows: 10 });
  e.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  e.prev = e.snake.map((s) => ({ ...s }));
  e.dir = 'right'; e.food = { x: 0, y: 0 };
  e.queue = ['down'];  // (5,5) → (5,6) is body
  e.step();
  assert.strictEqual(e.status, 'over');
  assert.strictEqual(e.cause, 'self');
});

test('bonus mango: appears every 4th fruit, worth 30, expires', () => {
  const e = start({ cols: 20, rows: 20, rng: seq(0.9, 0.1, 0.5) });
  e.eaten = 3;
  e.food = { x: e.snake[0].x + 1, y: e.snake[0].y };
  e.step();
  assert.ok(e.bonus, 'bonus should spawn on 4th fruit');
  const before = e.score;
  e.bonus = { x: e.snake[0].x + 1, y: e.snake[0].y, ttl: 50 };
  const ev = e.step();
  assert.strictEqual(e.score - before, 30);
  assert.ok(ev.some((x) => x.bonus));
  assert.strictEqual(e.bonus, null);

  e.bonus = { x: 0, y: 0, ttl: 1 };
  const ev2 = e.step();
  assert.ok(ev2.some((x) => x.type === 'bonusExpired'));
  assert.strictEqual(e.bonus, null);
});

test('level and speed ramp, with a floor', () => {
  const e = new Engine();
  assert.strictEqual(e.level, 1);
  const base = e.tickMs;
  e.eaten = 5; assert.strictEqual(e.level, 2); assert.ok(e.tickMs < base);
  e.eaten = 500; assert.strictEqual(e.tickMs, 68);
});

test('fruit never spawns on the snake or bonus (fuzz)', () => {
  const e = new Engine({ cols: 8, rows: 8 });
  for (let n = 0; n < 2000; n++) {
    e.snake = Array.from({ length: 1 + Math.floor(Math.random() * 40) }, (_, i) => ({ x: i % 8, y: Math.floor(i / 8) }));
    e.bonus = { x: 7, y: 7, ttl: 5 };
    e.food = null;
    const c = e.spawn();
    if (!c) continue;
    assert.ok(!e.snake.some((s) => s.x === c.x && s.y === c.y));
    assert.ok(!(c.x === 7 && c.y === 7));
  }
});

test('filling the board wins instead of hanging', () => {
  const e = start({ cols: 3, rows: 2 });
  e.snake = [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  e.prev = e.snake.map((s) => ({ ...s }));
  e.dir = 'down'; e.food = { x: 2, y: 1 };
  const ev = e.step();
  assert.strictEqual(e.status, 'won');
  assert.ok(ev.some((x) => x.type === 'won'));
  assert.strictEqual(e.food, null);
});

test('interpolation arrays stay aligned after growth', () => {
  const e = start({ rng: seq(0.5) });
  e.food = { x: e.snake[0].x + 1, y: e.snake[0].y };
  e.step();
  assert.strictEqual(e.prev.length, e.snake.length);
  e.step();
  assert.strictEqual(e.prev.length, e.snake.length);
});

test('random play for 300 games never throws or corrupts state', () => {
  for (let g = 0; g < 300; g++) {
    const e = start({ wrap: g % 2 === 0 });
    for (let i = 0; i < 600 && e.status === 'playing'; i++) {
      if (Math.random() < 0.3) e.queueDirection(['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]);
      e.step();
      const keys = new Set(e.snake.map((s) => s.x + ',' + s.y));
      assert.strictEqual(keys.size, e.snake.length, 'snake overlaps itself while alive');
      assert.strictEqual(e.prev.length, e.snake.length);
    }
  }
});

console.log(`\n${passed} tests passed`);
