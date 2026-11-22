# Gramps Web Frontend

LitElement genealogy PWA using the Gramps Web API. Preserve upstream conventions.

## Working efficiently

- Read `HANDOFF.md` when resuming work or when prior session context is relevant; treat it as a snapshot. Check branch, HEAD and `git status --short` before making changes.
- Use the simplest solution and surgical changes. Preserve unrelated uncommitted work; avoid speculative features and refactoring.
- Read relevant files and use focused `rg` searches; avoid repeated repository-wide scans.
- Keep permanent conventions here, current state in `HANDOFF.md`, and task-specific requirements in the task prompt. Do not repeat permanent instructions in prompts.
- Use relevant skills/tools only; do not install skills/MCP servers or disable tools without authorization.
- Start with focused checks; broaden for affected behavior or required CI checks. Rerun affected tests/checks when subsequent changes could invalidate earlier results; otherwise repeat passing checks only for unresolved concerns.
- Avoid repository-wide format/fix commands for small changes. Report results, checks, risks and commit references concisely; distinguish verified results from assumptions.
- At a meaningful phase boundary, update the handoff and recommend a new chat. Do not create one automatically.
- Commit, push, merge and deploy only when authorized. Do not alter Docker, databases or the backend unless the task explicitly covers them.

## Commands and environment

- `npm start`: dev server on port 8001, with hot reload; backend required separately (dev API fallback `http://localhost:5555`). Dev container installs dependencies automatically.
- `npm run build`: Rollup v4 production build to `dist/`. Build variables: `API_URL` (default same origin), `BASE_DIR` (non-root base path).
- `npm run lint`: ESLint and Prettier checks for JS/TS. `npm run format` fixes both across the repository; use only when appropriate to scope.
- Focused tests: `npx --no-install vitest run test/unit/<file>.test.js`; `npm test` runs the full suite with coverage; `npm run test:watch` watches.
- Vitest uses happy-dom and V8 coverage; import assertions from `vitest`. Existing tests cover helpers and components in the simulated DOM. Real-browser component tests remain out of scope.
- `npm run typecheck`: standalone TypeScript check, also in CI. Dev transpilation does not type-check.

## Architecture and conventions

- `src/GrampsJs.js` is the root; `src/gramps-js.js` registers it. Reusable UI lives in `src/components/`, pages in `src/views/`, D3 charts in `src/charts/`, mixins in `src/mixins/`; maps use MapLibre GL.
- New component names use `Grampsjs` (lowercase `js`); legacy `GrampsJs` names are not a model for new code.
- Pages extend `GrampsjsView` (renders only when active); API-fetching components use `GrampsjsConnectedComponent`; other state-aware components use `LitElement` with `GrampsjsAppStateMixin`.
- New Material controls use `md-*`, even alongside legacy `mwc-*` controls.
- New icons use SVG paths from `@mdi/js` via `<grampsjs-icon path="${mdiInformation}">`. Action icons use `color="var(--mdc-theme-secondary)"` for theme adaptation.
- State is a plain object initialized in `src/appState.js`, passed through Lit properties. Data flows down; events flow up. Siblings communicate through a common parent, not shared mutable state.
- HTTP calls must use `this.appState.apiGet/apiPost/apiPut/apiDelete`. Import non-HTTP utilities (media URLs, settings, bookmarks) from `src/api.js` as needed.
- `Auth` in `src/api.js` refreshes JWTs stored in localStorage (`access_token`, `refresh_token`, `id_token`); OIDC is supported. Use `appState.permissions` for capability checks.
- `GrampsjsAppStateMixin` supplies `appState` and `_(key)`. `GrampsjsStaleDataMixin` marks data stale on `db:changed` and refetches when active.
- Use `fireEvent(target, eventName, detail?)` from `src/util.js`. Window events include `db:changed`, `user:loggedout`, `settings:changed`, and `grampsjs:error` (errors bubble to root).
- **Do not manually fire `db:changed` after API mutations.** `apiPost/apiPut/apiDelete` already fire it on success, including 202 background tasks. If manual timing is necessary, suppress the automatic event with `{dbChanged: false}` first.
- All translatable text uses `_(key)`. Gramps desktop strings go in `grampsStrings` in `src/strings.js`; frontend-only English strings go in `lang/en.json` (Weblate manages translations). Do not mix these sources.
- `src/config.js` sets `window.grampsjsConfig`; it is copied unchanged to `dist/config.js`, excluded from the bundle, and replaceable by deployers.
- Follow Prettier: single quotes, no semicolons, no single-argument arrow parentheses, no bracket spacing. Husky/lint-staged fixes staged JS/TS on commit.
- TypeScript is optional for new files; keep existing JS files as JS. Lit TS components use `@customElement`, `@property`, `@state` from `lit/decorators.js`; `experimentalDecorators` and `useDefineForClassFields: false` are configured.
- Theme helpers live in `src/theme.js`; tag color conversion lives in `src/color.js`.

## Issues and pull requests

Follow `CONTRIBUTING.md` in addition to these rules:

- Draft transparently as the user's assistant; never impersonate a human contributor.
- Describe the problem in issues (under about 300 words); any solution proposal belongs in a clearly marked optional section and stays brief.
- Non-trivial PRs require an existing issue **and a maintainer reply** first; opening both minutes apart does not qualify.
- PRs link the issue and describe the change and validation without repeating the problem.
- Installation, deployment and configuration reports belong in the [forum](https://gramps.discourse.group/c/gramps-web/28).
- Do not invent greetings, thanks or pleasantries in the user's name, or delete/shorten their human-written parts.
