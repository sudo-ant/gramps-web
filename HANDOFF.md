# Handoff

Verified 2026-11-22. Snapshot only; recheck Git before starting work.

## Git state

- Branch: `codex/family-tree-parent-relationships`
- HEAD: `5e89e64a6ede19313a21c97f35507f9f08c29c27` (`Centre custom family tree on focal person changes`).
- No staged changes at inspection. Existing modified files, preserved:
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
- Existing untracked file, preserved: `test/unit/familyTreeRelationships.test.js`.
- This documentation task modifies `AGENTS.md` and adds `HANDOFF.md`; intentionally uncommitted pending user review. No application/configuration changes made.

## Evidence and unfinished work

- Git history records focal-person centering (`5e89e64a`), shared ancestry (`58715373`), family event media (`50b826eb`), layout/connectors (`c9cbda8b`), and the interactive family tree (`cfbc4ad3`). These are commit descriptions, not independent end-to-end verification.
- Inspected working changes implement per-parent ChildRef relations, additional parent families, differentiated relationship routes/labels and iterative completion of missing people. Focused tests pass; this work remains uncommitted and has not received a complete code or browser review here.
- Documentation review condensed conventions and added scoped workflow/validation rules, retaining API/event, i18n, permission and upstream contribution safeguards.
- Recommended next task: review this documentation diff; then start a new chat using this handoff to review and browser-validate the existing family-tree changes before deciding on a commit.

## Latest validation

- 2026-11-22: local Vitest v4.1.9, `node_modules/.bin/vitest.cmd run test/unit/familyTree.test.js test/unit/familyTreeRelationships.test.js test/unit/grampsjsFamilyTreeChart.test.js test/unit/treeChartDefinitions.test.js`: **4 files, 82 tests passed** (no coverage requested). Material dependency sourcemap warnings appeared.
- Full suite, lint, typecheck, production build and live backend/browser behavior were not run in this task. No earlier results are asserted.

## Environment and Codex audit

- Windows PowerShell; workspace `C:\Users\antle\gramps-web`; dependencies already present. Session writes are restricted to the workspace and allowed temporary locations; network is restricted. Shell manual fetch failed DNS resolution; official web lookup worked.
- Dev frontend needs a separate backend; backend availability was not checked. Do not alter Docker/database/backend for this task. No commit, push, merge, deployment or third-party installation authorized.
- `C:\Users\antle\.codex\AGENTS.md` is empty. No repository `.codex`/`.agents` configuration or nested instruction files found. Global config sets `gpt-6.1-sol`, low reasoning, and trusts this repo; these are configured defaults, not proof of the active model.
- Global config lists 19 enabled plugins and one explicit MCP server (`node_repl`); the session also exposes plugin-provided connectors/tools. Tool availability does not prove connector authentication or server health; these were not probed.
- Available skill metadata includes overlapping website builders (Sites, Website Maker, Higgsfield) and browser/computer-use workflows. Modern Web Guidance requires an initial lookup for client-side work; that rule does not apply to this documentation task. No skills or tools were disabled.
- The old pure-function-only test description contradicted existing simulated-DOM component tests; corrected. Repeated examples/reference lists were condensed. No other direct conflict was established in the inspected repository instructions.
- Optional, user-controlled cleanup: review unused/overlapping plugins and implicit skill triggers; retain needed browser/testing capabilities. Keep durable rules in AGENTS and task state here rather than adding another skill/config layer. No Plus quota savings were measured or promised.
