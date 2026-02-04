# Cart + Friction Pad Newton's 2nd Law Simulation

A no-dependency browser simulation for a Half Atwood-style lab:
- Part 1: cart only
- Part 2: cart + friction pad

Students can run trials, manually select graph windows, compute mean force and acceleration slope, add accepted trials to a table, build force-vs-acceleration fits, and export CSV/PNG artifacts.

## Local run

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Tests

```bash
npm test
```

## File structure

- `index.html` - UI shell
- `styles.css` - layout + styling
- `src/app.js` - orchestration and event wiring
- `src/physics.js` - physics equations and motion threshold logic
- `src/signals.js` - synthetic time-series generation
- `src/regression.js` - averaging and linear regression utilities
- `src/graphs.js` - canvas plotting + manual window selection
- `src/export.js` - CSV and PNG exports
- `src/presets.js` - teacher presets and scenario metadata
- `src/state.js` - application state store
- `tests/*.test.js` - Node built-in test runner coverage

## GitHub Pages

This is a static app with no build step. Deploy the repo root from the `main` branch in GitHub Pages settings.
