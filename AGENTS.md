# AGENTS.md

This document captures observed preferences and conventions for agents working in this repository.

## Code Style

No frameworks or build tools — plain HTML, CSS, and vanilla JavaScript. CSS lives in a separate `style.css` file and JS in `js/`. Avoid inline styles; all styling goes through CSS classes to keep `html-validate` happy. Zero comments in source code unless a piece of logic is genuinely non-obvious. The app uses a single `state` object for core simulation state, with additional transient interaction state (mouse/touch position, mode flags) as loose variables nearby.

## Design & UI

Dark theme (`#0a0a0f` background) with glassmorphism-style panels (backdrop-filter blur, translucent borders, subtle shadows). Monospace font family (`SF Mono`, `Fira Code`, `Consolas`). Canvas-based rendering with manual offset and scale math — no `ctx.setTransform()`, just pixel-level control. Color names follow a pastoral/poetic style ("Silent Meadow", "Gentle Dusk"). Mobile responsive via media queries and dedicated touch event handlers (pinch-to-zoom, two-finger pan, long-press).

## Testing

Playwright for E2E tests. Test files live in `tests/` with descriptive names. Tests follow a numbered sequential pattern (e.g., "1. Page loads", "2. Cell painting"). Run `npm test` after every change and before committing. Tests execute in CI before deployment. Click positions in tests use absolute canvas coordinates; keep them at least 20px apart to avoid mapping to the same grid cell. Use `waitForTimeout()` sparingly, only when DOM settling is needed.

## Workflow

Commit and push after each logical unit of work. Delegate independent tasks to subagents in parallel. CI pipeline runs tests before deploying to GitHub Pages. The `public/` directory contains static assets (favicons, manifest) that are copied into `dist/` during deployment. Run `npm test` to verify locally before pushing.

When adding new external files (CSS, JS, images), update `.github/workflows/static.yml` to copy them into `dist/` — the build step only copies `public/` by default; additional `cp` lines are needed for files like `style.css` or directories like `js/`.

## Toolbar & Layout

Prefer a clean, tiered toolbar over a single crammed row. Primary controls (Play, Step, Speed, Paint/Pan, Clear, Random) live in the always-visible top row. Secondary tools (Undo, Redo, Rules, Color, Reset, Help) go in a collapsible row toggled by a ▼ chevron button. Use `max-height` transitions with `overflow: hidden` for smooth expand/collapse animation. The secondary row is hidden by default — cleaner initial load.

Collapsible UI elements that are hidden by default mean tests must expand them first before interacting with their contents. Playwright cannot click elements hidden behind parent containers with `overflow: hidden` and zero height.

## HTML Validation

The CI pipeline runs `html-validate`, which rejects all inline `style=""` attributes in HTML. Never embed `style="..."` in `innerHTML` strings either — use CSS classes and set properties via `element.style.property` programmatically.

## Evolution Notes

- Pattern definitions are arrays of dot/hash strings — keep them human-readable.
- The cell grid uses string keys (`"x,y"`) rather than packed integers to avoid 32-bit overflow.
- The grid background is cached to an offscreen canvas and only redrawn on pan/zoom/resize.
- `step()` builds chunks incrementally alongside the next generation's cell set rather than separately.
- Undo/redo stores snapshots as `new Set(state.cells)` with a 50-state cap.
