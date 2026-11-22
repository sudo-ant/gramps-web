# Handoff

Verified 2026-11-22. Snapshot only; recheck Git before starting work.

## Git state

- Branch: `codex/family-tree-parent-relationships`
- Snapshot prepared at `95ff2d6254ba601a6d5123b8f5a0ab061667e204` (documentation), immediately before committing the complete relationship correction. Its parent is `5e89e64a` (recentring). Use `git log -1 --format=%H` and `git status --short` for the resulting commit and current state.
- The correction includes this handoff and these 11 implementation/test files:
  - `src/charts/FamilyTreeChart.js`
  - `src/charts/layout/familyTreeLayout.js`
  - `src/charts/model/FamilyGraph.js`
  - `src/charts/model/familyTree.js`
  - `src/components/GrampsjsFamilyTreeChart.js`
  - `src/views/GrampsjsViewTree.js`
  - `src/views/treeChartDefinitions.js`
  - `test/unit/familyTree.test.js`
  - `test/unit/grampsjsFamilyTreeChart.test.js`
  - `test/unit/treeChartDefinitions.test.js`
  - `test/unit/familyTreeRelationships.test.js`
- Commit authorized by the user after successful validation and final source review. Do not merge, push or deploy.

## Relationship correction and remaining verification

- Git history records focal-person centering (`5e89e64a`), shared ancestry (`58715373`), family event media (`50b826eb`), layout/connectors (`c9cbda8b`), and the interactive family tree (`cfbc4ad3`). These are commit descriptions, not independent end-to-end verification.
- The complete correction follows each family child reference's `frel`/`mrel` and actual parent handles. Empty handles and `None` never invent parents; absent type metadata remains `Unknown`. Birth connectors stay solid; other recorded types have dashed routes, translated labels and accessible descriptions. No person-specific production rules were added.
- User-supplied API evidence: F0340 records Kenneth's Birth mother Florence Mary Harris and no father; F0326 records Foster relationships to both maternal grandparents; F0045 lists Vera and Sheila, never Kenneth. Synthetic handles in tests preserve this exact structure.
- Fixed the final-review blocker: after removing the shared child card, unavailable parent records can leave empty ancestry blocks. Filter zero-card blocks before `packBlocks`; keep the model and completion placeholders intact. No numeric fallback conceals invalid geometry.
- Permanent regressions cover unavailable mothers/fathers, both absent, partial or empty parent families, valid Birth/Foster/Adopted/Stepchild/Unknown branches, both family orders, ancestor and descendant rendering, and delayed parent loading without losing zoom/pan. All tested nodes, relationship geometry, connector points and chart bounds are finite.
- Final source review found no further significant defect. No backend, API implementation, genealogy, Docker or media changes were made. Separate card occurrences for different generational roles remain intentional; duplicate parent-child edges are tested against.
- Recommended next task: start a new chat using this handoff for live browser and screen-reader verification of the custom Family Tree. No new live backend/browser verification was performed during this fix; do not assume Windows can reach the HP hosts or bypass normal authentication.

## Latest validation

- 2026-11-22: original read-only reproducer showed non-finite foster-parent geometry without the biological mother before the fix; both populated and missing-mother cases now produce finite geometry. Script: `node node_modules/.cache/parent-relationship-final-review-repro.mjs` (ignored diagnostic artifact; permanent tests are authoritative).
- Added 28 permanent tests; 15 of them failed before the correction. Targeted checks: **8 files, 213 tests passed**. Complete Vitest suite with V8 coverage: **39 files, 881 tests passed**.
- Production build, TypeScript checking, changed-file ESLint/Prettier and whitespace checks passed. Existing Material dependency sourcemap and Rollup circular-dependency/MapLibre warnings remain.
- `npm`/`npx` are unavailable in this shell; the equivalent installed tools were invoked directly through Node (`vitest/vitest.mjs`, `rollup/dist/bin/rollup`, `typescript/bin/tsc`, `eslint/bin/eslint.js`, `prettier/bin-prettier.js`). No new dependencies were installed.

## Environment and Codex audit

- Windows PowerShell; workspace `C:\Users\antle\gramps-web`; dependencies already present. Session writes are restricted to the workspace and allowed temporary locations; network is restricted. Shell manual fetch failed DNS resolution; official web lookup worked.
- Dev frontend needs a separate backend; backend availability was not checked. The relationship correction commit is authorized; push, merge, deployment, third-party installation and changes to Docker/database/backend/media are not.
- `C:\Users\antle\.codex\AGENTS.md` is empty. No repository `.codex`/`.agents` configuration or nested instruction files found. Global config sets `gpt-6.1-sol`, low reasoning, and trusts this repo; these are configured defaults, not proof of the active model.
- Global config lists 19 enabled plugins and one explicit MCP server (`node_repl`); the session also exposes plugin-provided connectors/tools. Tool availability does not prove connector authentication or server health; these were not probed.
- Available skill metadata includes overlapping website builders (Sites, Website Maker, Higgsfield) and browser/computer-use workflows. Modern Web Guidance requires an initial lookup for client-side work; that rule does not apply to this documentation task. No skills or tools were disabled.
- The old pure-function-only test description contradicted existing simulated-DOM component tests; corrected. Repeated examples/reference lists were condensed. No other direct conflict was established in the inspected repository instructions.
- Optional, user-controlled cleanup: review unused/overlapping plugins and implicit skill triggers; retain needed browser/testing capabilities. Keep durable rules in AGENTS and task state here rather than adding another skill/config layer. No Plus quota savings were measured or promised.
