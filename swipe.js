/* Swipe detection shared by both looks.
 *
 * Rules (they exist because a finger never travels in a straight line):
 *  - A swipe needs `threshold` px to start. Slight diagonals wait for a clear winner.
 *  - After a swipe fires, the same gesture can only fire again after `rearm` px,
 *    and never in the same or opposite direction. That drops the sideways drift
 *    and the return curl when a finger lifts, which used to read as extra swipes.
 *  - Mouse pointers are ignored (mouse uses clicks and keys).
 *
 * createSwipe(target, onDir, { threshold, rearm, ignore }) returns a live object
 * { swiped, moved } describing the current/last gesture, so taps can tell
 * themselves apart from swipes.
 */
(function (root) {
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function createSwipe(target, onDir, { threshold = 28, rearm = 60, ignore } = {}) {
    let g = null;
    const last = { swiped: false, moved: 0 };

    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (ignore && ignore(e)) return;
      g = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX, oy: e.clientY, dir: null };
      last.swiped = false;
      last.moved = 0;
    });

    target.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      last.moved = Math.max(last.moved, Math.hypot(e.clientX - g.sx, e.clientY - g.sy));

      const dx = e.clientX - g.ox;
      const dy = e.clientY - g.oy;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const major = Math.max(ax, ay);
      const minor = Math.min(ax, ay);
      const need = g.dir ? rearm : threshold;

      if (major < need) return;
      // Ambiguous diagonal: keep going until one axis clearly wins.
      if (major < minor * 1.6 && major < need * 2.5) return;

      const dir = ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      g.ox = e.clientX; // measure the next stroke from here either way
      g.oy = e.clientY;
      if (g.dir && (dir === g.dir || dir === OPPOSITE[g.dir])) return; // wobble or return stroke

      g.dir = dir;
      last.swiped = true;
      onDir(dir);
    });

    const end = (e) => {
      if (g && (!e || e.pointerId === g.id)) g = null;
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);

    return last;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createSwipe };
  else root.createSwipe = createSwipe;
})(typeof window !== 'undefined' ? window : globalThis);
