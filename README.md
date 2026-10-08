# Snake Game

A classic Snake game in plain HTML, CSS and JavaScript. No build step, no dependencies. Open a page and play.

## Two looks, one game

| Look | Open | Feel |
| --- | --- | --- |
| **Classic** | `index.html` | The original: light tile grid, blue frame, gray snake, blue food. Steps tile by tile. |
| **Nyoka** | `nyoka/index.html` | Dark forest theme, smooth-gliding snake, mangoes, particles and a start card. |

Both share the same rules (`engine.js`), so a fix there lands in both. Each one links to the other from its **How to play** dialog, and each keeps its own saved scores.

## How to play

- **Steer:** arrow keys or WASD, swipe on a touch screen, or the on-screen controls. In Classic you can also tap or click the grid to head toward that spot.
- **Eat** the blue squares (Classic) or mangoes (Nyoka) for 10 points each. A **yellow / golden** one appears after every 4th food. It's worth 30 but disappears quickly.
- The snake **speeds up every 5 foods**.
- **Pause:** Space or P (it also pauses when you switch tabs). **Restart:** R.
- The **?** button opens the in-game guide. Classic's guide also has the mode switch and the **visual effects** and **sound & vibration** toggles.

### Modes

- **Walls:** hitting the edge ends the run.
- **Wrap:** the edges loop around to the opposite side.

## Install it (PWA)

Both looks are installable apps that also work offline.

- **Chrome / Edge (desktop and Android):** open the game, then use the **Install app** button in the **?** dialog (or the install icon in the address bar).
- **iPhone / iPad (Safari):** tap Share, then **Add to Home Screen**. The dialog shows this hint on iOS.
- Classic and Nyoka install as **two separate apps** with their own icons and saved scores.

It needs to be served over **HTTPS** (or `localhost`) for installing and offline support to work. Opening `index.html` straight from disk still plays fine, just without install/offline. To try it locally: `python3 -m http.server` in the project folder, then open `http://localhost:8000`.

**When you ship a change**, bump `VERSION` at the top of `sw.js` (for example `v1` to `v2`). Players get the new files the next time they open the app.

## Project layout

| File | What it does |
| --- | --- |
| `engine.js` | Pure game rules, shared by both looks |
| `index.html`, `App.css`, `App.js` | Classic look |
| `nyoka/index.html`, `nyoka/nyoka.css`, `nyoka/nyoka.js` | Nyoka look |
| `manifest.webmanifest`, `nyoka/manifest.webmanifest` | App names, colors and icons for installing |
| `sw.js`, `pwa.js` | Offline caching and the Install button |
| `icons/`, `nyoka/icons/` | App icons (SVG sources and PNGs; regenerate PNGs if you change the SVGs) |
| `tests/engine.test.js` | Unit tests for the rules |

Run the tests with `node tests/engine.test.js` (no install needed).

## Customization

- Speed curve, points and bonus timing: `tickMs`, `POINTS`, `FRUIT_PER_LEVEL`, `BONUS_EVERY`, `BONUS_TICKS` in `engine.js`. These apply to both looks.
- Classic: tile size is `TILE` in `App.js`; colors are the `C` object there and the variables at the top of `App.css`.
- Nyoka: grid size is `COLS` and `ROWS` in `nyoka/nyoka.js`; the palette is in `nyoka/nyoka.css`.

## License

MIT. See `License`.
