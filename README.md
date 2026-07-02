# Cellular Automata Explorer

An interactive web-based cellular automaton simulator with a near-infinite grid, pattern placement, and a visual rules editor.

## Features

- **Infinite grid** with pan and zoom
- **Paint/Pan modes** for drawing cells or navigating the grid
- **Pattern library** with common shapes (gliders, oscillators, methuselahs)
- **Visual rules editor** with clickable 3x3 grids to toggle birth/survival conditions
- **12 presets** including Conway's Life, HighLife, Seeds, and more
- **Simulation controls** (play/pause, step, speed adjustment)

## Running Locally

This is a single-file application with no dependencies. Just open `index.html` in a web browser:

```bash
open index.html
```

Or serve it with any static file server:

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve
```

Then visit `http://localhost:8000`

## Deployment

### GitHub Pages

1. Go to the repository settings on GitHub
2. Navigate to **Pages** in the sidebar
3. Under **Source**, select **Deploy from a branch**
4. Choose the `main` branch and `/ (root)` folder
5. Click **Save**

The site will be available at `https://<username>.github.io/cellular-automata`

### Regenerating Favicons

If you need to regenerate the favicon PNGs (e.g., after changing the design), use the included scripts:

```bash
# Using ImageMagick (recommended)
./generate-favicons.sh

# Or open generate-favicons.html in a browser and click the buttons
```

**Note:** These scripts are not currently part of the automated deployment process. The generated favicon files are committed to the repository. If you want to automate favicon regeneration in CI/CD, you could add the script execution to `.github/workflows/static.yml` before the build step.

### Other Platforms

Since this is a static HTML file, it can be deployed to any static hosting service:
- Netlify
- Vercel
- Cloudflare Pages
- Any web server that serves static files

## Controls

- **Left-click/drag**: Paint cells (in Paint mode) or pan (in Pan mode)
- **Scroll wheel**: Zoom in/out
- **Tab**: Toggle between Paint and Pan modes
- **Space**: Play/Pause simulation
- **N**: Step forward one generation
- **C**: Clear the grid
- **R**: Randomize the grid
- **ESC**: Cancel pattern placement or close modals

## Testing

The project includes end-to-end tests using Playwright to verify core functionality.

### Running Tests

First, install dependencies:

```bash
npm install
npx playwright install chromium
```

Then run the test suite:

```bash
npm test
```

This will run all 7 E2E tests covering:
1. Page loads and canvas renders
2. Cell painting (click to add/remove cells)
3. Play/pause simulation advances generations
4. Pattern placement from dropdown
5. Rules modal opens, changes rules, applies
6. Zoom and pan interactions
7. Clear button resets the grid

For interactive test development, use the Playwright UI mode:

```bash
npm run test:ui
```

Tests run automatically in CI on every push to main via GitHub Actions.

## License

MIT
