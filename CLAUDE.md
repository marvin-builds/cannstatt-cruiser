# Cannstatt Cruiser

A pixel-art endless skate runner through Stuttgart and Bad Cannstatt, built with
Vite + TypeScript + Canvas and no engine. The UI text is German.

## Commands

- `npm run dev`: dev server (test hook `window.__game` is on)
- `npm test`: Vitest unit tests
- `npm run build`: type-check (app + scripts) and production build into `dist/` (base `./`)
- `npm run preview`: serve the build
- `npm run playtest`: Playwright screenshots + state log in `playtest-output/<name>/` (see docs/TESTING.md)

## Read first

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): module map, **ownership table**, contracts, events, sprites
- [docs/TESTING.md](docs/TESTING.md): unit tests, `window.__game`, playtest harness, custom scenarios
- [docs/SPEC.md](docs/SPEC.md): product spec

## Rules

- **Ownership:** each slice edits only its own directory (`src/player`, `src/world`,
  `src/gameplay`, `src/ui`, `src/audio` + `public/` + `.github/`). Never touch `src/main.ts`,
  `src/core/` or `src/types.ts` from a slice; report needed contract changes instead.
- **TDD:** for logic (physics, rules, state, parsing) write the failing Vitest test first.
  Check visual changes with `npm run playtest` and look at the PNGs.
- **No commits by agents:** do not run `git add/commit/stash/reset` or anything that rewrites
  history; the orchestrator commits. Work is linear on `main`.
- Use `ctx.rng` for gameplay randomness (deterministic tests), never `Math.random`.
- Draw at integer coordinates into the 320x180 buffer. All art comes from palette sprite strings
  (`core/sprite.ts`), with no image files. Text uses `core/font.ts`.
- Keep modules small and typed. Leave no dead code. Before finishing, `npm test` and
  `npm run build` must pass.
