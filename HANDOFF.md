# Handoff

Verified 2026-11-22. Snapshot only; recheck Git before continuing.

## Current task: list search discoverability

### Enter-key correction after live testing

- User confirmed the list Search entry works and global search for I0933 returns Kenneth Charles Harris. Search categories allow multiple selections; preserve this behavior.
- On top of `503d740a`, user authorized a separate correction commit on the same branch, with no merge, push or deployment.
- `src/views/GrampsjsViewSearch.js`: Enter now checks logical `event.key` instead of physical `event.code`, prevents default submission and ignores held-key repeats and IME composition. Still calls the same `_executeSearch()` as the icon; category selection, API, results and navigation are unchanged.
- The prior physical-code comparison misses keypad Enter (`NumpadEnter`) and events without a physical code. The exact failing Opera event was not captured; live Opera confirmation remains necessary.
- `test/unit/searchKeyboard.test.js`: eight DOM regressions exercise rendered keyboard/click bindings, shadow-event bubbling, one request per activation, current query and multiple categories for modern/legacy search, empty queries, repeats and composition. Material text field is stubbed because happy-dom lacks its ElementInternals; tests do not substitute for live browser testing.
- Focused search/list checks: 22 tests passed. Full Vitest suite with V8 coverage: 41 files, 905 tests passed. Clean production build, standalone type check, changed-file ESLint/Prettier and whitespace checks passed. Existing dependency warnings remain. No backend, API implementation, database or Docker changes.

- Branch: `codex/list-search-entry`, created from clean `feature/family-tree` at `ecb1c95967c5ada1207a4bdd44f97dd35443ad8f`. Required base commit verified as an ancestor (also base HEAD).
- Implementation and test review approved by the user. Finalisation authorizes committing only this handoff, the list base and its search tests on this branch. Do not push, merge or deploy. Obtain the final commit SHA with `git log -1 --format=%H`.
- `src/views/GrampsjsViewObjectsBase.js`: added a translated, labelled Material outlined Search button in the filter toolbar's existing leading slot. Uses the existing `nav` event with `{path: 'search'}`, exactly like the header shortcut. Existing global search view, API, results, focus handling and record navigation are unchanged.
- Shared by People, Families, Events, Places, Sources, Citations, and also Media, Notes and Repositories. Available to viewers and editors. Existing flex-wrap toolbar handles narrow screens; Material button supplies keyboard behavior and accessible name from visible text. No new strings, CSS, search engine, API logic or dependencies.
- `test/unit/listSearch.test.js`: 14 regressions cover all six requested lists with viewer/editor permissions, translated labels, composed/bubbling search navigation, unchanged page/sort, and name/Gramps-ID requests through the existing global search API.

## Validation

- Focused tests: 14 passed. Finalisation rerun of the full Vitest suite with V8 coverage: 40 files, 897 tests passed.
- Production Rollup build, standalone TypeScript, changed-file ESLint/Prettier and `git diff --check` passed.
- Existing Material sourcemap and Rollup circular-dependency/MapLibre warnings remain.
- npm/npx unavailable; used installed tools directly via Node. Modern Web Guidance skill read, but runner unavailable; consulted MDN keyboard accessibility guidance as fallback. No tools or dependencies installed.
- No live backend or real-browser desktop/mobile/keyboard verification performed. DOM regressions do not prove visual layout, assistive technology behavior or live search results. User acceptance should verify these on a running instance.
- No backend, database, API implementation or Docker changes.

## Next phase

Implementation review is complete; preserve the approved implementation. Live toolbar wrapping, Tab/Enter/Space activation, search field focus, name/ID results and returning to existing list state remain unverified in this environment. A new chat is recommended if undertaking that live verification phase; do not create one automatically.

## Earlier context

Previous handoff described family tree relationship and connector work on a separate branch. That snapshot was stale for this task: the actual starting branch was `feature/family-tree` at `ecb1c959`. Consult Git history for that earlier work rather than treating its former unmerged status as current.
