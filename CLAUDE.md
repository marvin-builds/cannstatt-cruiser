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
- [docs/ROADMAP.md](docs/ROADMAP.md): waves, backlog of user wishes, status checkpoint

## Rules

- **Ownership:** each slice edits only its own directory (`src/player`, `src/world`,
  `src/gameplay`, `src/ui`, `src/audio` + `public/` + `.github/`). Never touch `src/main.ts`,
  `src/core/` or `src/types.ts` from a slice; report needed contract changes instead.
- **TDD:** for logic (physics, rules, state, parsing) write the failing Vitest test first.
  Check visual changes with `npm run playtest` and look at the PNGs.
- **No commits by agents:** do not run `git add/commit/stash/reset` or anything that rewrites
  history; the orchestrator commits. Work is linear on `main`.
- Use `ctx.rng` for gameplay randomness (deterministic tests), never `Math.random`.
- Draw at integer coordinates into the view buffer: 180 high, **width adaptive (320-427)**. Never
  assume 320: use `display.viewWidth` for full-width fills, right-anchored UI and spawning off the
  right edge (see "View size" in docs/ARCHITECTURE.md). All art comes from palette sprite strings
  (`core/sprite.ts`), with no image files. Text uses `core/font.ts`.
- Keep modules small and typed. Leave no dead code. Before finishing, `npm test` and
  `npm run build` must pass.

## Orchestration mode (main session)

When the user asks to continue (or resumes work on this game), always work in orchestration mode:

- The main session only orchestrates. It does not implement features itself, apart from tiny shared
  contract edits (types, tuning constants) that let slices run in parallel, made test-first.
- Work is cut into feature slices that each own disjoint paths. Run them with the saved workflow
  `.claude/workflows/skate-slice-wave.js` (args `{spec, slices: [{name, owns[], brief, acceptance[]}]}`):
  one implementer per slice, then a combined Sonnet reviewer/play-tester, with at most 2 fix rounds.
- Before committing, the orchestrator checks `npm test` and `npm run build`, looks at the key
  playtest screenshots itself, and then commits one commit per slice on `main` (linear history)
  and pushes (the user allowed pushing after each verified slice).
- New user wishes go into `docs/ROADMAP.md` (backlog and status checkpoint) first. They are briefed to the next fitting slice,
  never patched into a slice that is already running.
- The plan ends with a final multi-persona playtest (desktop keyboard, phone touch landscape and
  portrait, casual first-timer) plus one fix round, and then a final report with screenshots.
