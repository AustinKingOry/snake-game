# Snake Game

A classic Snake game in plain HTML, CSS and JavaScript. No build step, no dependencies: open `index.html` and play.

## How to play

- **Steer:** arrow keys or WASD, tap/click the grid to head toward that spot, swipe on a touch screen, or use the on-screen controls (keyboard button).
- **Eat the blue squares** for 10 points each. A **yellow square** appears after every 4th food. It's worth 30 but disappears quickly.
- The snake **speeds up every 5 foods**.
- **Pause:** Space or P (it also pauses when you switch tabs). **Reset:** R or the reset button.
- The **?** button opens the in-game guide, where you can also switch mode and turn **visual effects** and **sound & vibration** on or off.

### Modes (in the How To Play dialog)

- **Walls:** hitting the edge ends the run.
- **Wrap:** the edges loop around to the opposite side.

Effects are small and match the tile look: a pop of square particles and a floating `+10` when you eat, eyes on the head, a quick frame shake when you crash, and a "Level 2" flash when the speed goes up. They're skipped automatically if your system asks for reduced motion.

Your best runs and stats are saved in your browser (`localStorage`) and shown in the chat-bubble panel (Leaderboard / My Data).

## Project layout

| File | What it does |
| --- | --- |
| `index.html` | Page structure, How To Play dialog, side panel |
| `App.css` | Visual design |
| `App.js` | `Engine` (pure game rules) and the UI (canvas, input, saving) |
| `tests/engine.test.js` | Unit tests for the rules |

Run the tests with `node tests/engine.test.js` (no install needed).

## Customization

- Tile size: `TILE` in `App.js`. The grid fills the frame automatically.
- Speed curve, points and bonus timing: `tickMs`, `POINTS`, `FRUIT_PER_LEVEL`, `BONUS_EVERY`, `BONUS_TICKS` at the top of `App.js`.
- Colors: the `C` object in `App.js` (snake and food) and the variables at the top of `App.css`.

## License

MIT. See `License`.
