// Run with: node tests/swipe.test.js
const assert = require('assert');
const { createSwipe } = require('../swipe.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

// Drive a gesture through fake pointer events. path = [[x, y], ...] from the first point.
function gesture(paths, opts, type = 'touch') {
  const target = new EventTarget();
  const fired = [];
  const s = createSwipe(target, (d) => fired.push(d), opts);
  const fire = (name, x, y, id) => {
    const ev = new Event(name);
    Object.assign(ev, { pointerType: type, pointerId: id, clientX: x, clientY: y });
    target.dispatchEvent(ev);
  };
  paths.forEach((path, i) => {
    const [x0, y0] = path[0];
    fire('pointerdown', x0, y0, i + 1);
    for (const [x, y] of path.slice(1)) fire('pointermove', x, y, i + 1);
    fire('pointerup', path[path.length - 1][0], path[path.length - 1][1], i + 1);
  });
  return { fired, s };
}
// Straight segment from (x,y) to (x+dx, y+dy) in small steps
const line = (x, y, dx, dy, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x + (dx * i) / n, y + (dy * i) / n]);
const chain = (...segs) => segs.flat();

test('a straight swipe fires exactly once', () => {
  assert.deepStrictEqual(gesture([line(200, 400, 0, -120)]).fired, ['up']);
  assert.deepStrictEqual(gesture([line(200, 400, 140, 0)]).fired, ['right']);
});

test('swipe up with sideways drift is still one "up" (old bug)', () => {
  const path = chain(line(200, 400, 5, -70), line(205, 330, 40, -10));
  assert.deepStrictEqual(gesture([path]).fired, ['up']);
});

test('return curl as the finger lifts does not fire the opposite direction (old bug)', () => {
  const path = chain(line(100, 300, 80, 0), line(180, 300, -70, 4));
  assert.deepStrictEqual(gesture([path]).fired, ['right']);
});

test('two quick separate swipes give both turns', () => {
  const r = gesture([line(100, 300, 90, 0), line(200, 380, 0, -90)]);
  assert.deepStrictEqual(r.fired, ['right', 'up']);
});

test('deliberate L-shaped gesture gives both turns', () => {
  const path = chain(line(100, 300, 70, 0), line(170, 300, 0, -80));
  assert.deepStrictEqual(gesture([path]).fired, ['right', 'up']);
});

test('small wobble after a swipe is ignored', () => {
  const path = chain(line(200, 400, 0, -80), line(200, 320, 25, 0), line(225, 320, -25, 0));
  assert.deepStrictEqual(gesture([path]).fired, ['up']);
});

test('a slight diagonal waits for a clear winner', () => {
  const path = chain(line(100, 300, 32, -30, 4), line(132, 270, 60, -4));
  assert.deepStrictEqual(gesture([path]).fired, ['right']);
});

test('tiny movements are taps, not swipes', () => {
  const r = gesture([line(100, 100, 12, 6, 4)]);
  assert.deepStrictEqual(r.fired, []);
  assert.strictEqual(r.s.swiped, false);
  assert.ok(r.s.moved < 28);
});

test('a new gesture is not affected by the previous one', () => {
  const r = gesture([line(100, 300, 80, 0), line(100, 300, 80, 0)]);
  assert.deepStrictEqual(r.fired, ['right', 'right']);
});

test('mouse pointers are ignored', () => {
  assert.deepStrictEqual(gesture([line(0, 0, 200, 0)], {}, 'mouse').fired, []);
});

test('ignore() can opt a gesture out', () => {
  const r = gesture([line(0, 0, 200, 0)], { ignore: () => true });
  assert.deepStrictEqual(r.fired, []);
});

test('fuzz: a noisy straight swipe never fires more than one direction', () => {
  for (let n = 0; n < 2000; n++) {
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const [ux, uy] = dirs[n % 4];
    const len = 60 + Math.random() * 120;
    const pts = [[200, 400]];
    for (let i = 1; i <= 14; i++) {
      // forward progress plus up to ±14px of jitter sideways (wobble), ±8 forward
      const f = (len * i) / 14 + (Math.random() - 0.5) * 16;
      const w = (Math.random() - 0.5) * 28;
      pts.push([200 + ux * f + uy * w, 400 + uy * f + ux * w]);
    }
    // finger curls back a little on release
    const [lx, ly] = pts[pts.length - 1];
    pts.push([lx - ux * 18, ly - uy * 18]);
    const { fired } = gesture([pts]);
    assert.ok(fired.length <= 1, `fired ${fired.join(',')} on a noisy swipe`);
  }
});

console.log(`\n${passed} tests passed`);
