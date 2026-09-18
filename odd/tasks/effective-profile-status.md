# Effective repository profile in Status

## Objective

Fix GitHub issue #1176 so the fullscreen Status sidebar shows the profile that governs subagent launches in the current repository. Append `(pinned)` only when a valid clone-local pin or repository declaration wins; otherwise show the globally active profile without a suffix.

## Context

- Upstream issue: https://github.com/Gentleman-Programming/gentle-shell/issues/1176
- Starting point: `origin/main` at `1170dc84c2198b53807431f6e03d02bf8dcc3444`
- Branch: `fix/effective-profile-status`
- Pre-existing untracked `mise.toml` is outside this feature and must remain untouched.

## Scope

- Resolve the effective profile through the existing repository-pin authority.
- Keep profile state structured through the shell model and render `(pinned)` only for a valid winning pin.
- Refresh the Status digest when the global profile or relevant pin state changes.
- Preserve the compact bottom bar behavior: it does not show a profile.
- Add focused regression coverage and update user-facing documentation if the documented semantics require clarification.

## Tasks

- [x] T1 — Implement pin-aware Status profile resolution, focused tests, and documentation; run focused and repository checks; commit as one reviewable work unit.

## Acceptance criteria

- No valid pin: `Profile <global-active-name>`.
- Valid local or repository pin: `Profile <effective-name> (pinned)`.
- Invalid, stale, missing, or unreadable pins fall back to the global active profile without `(pinned)`.
- Local pin precedence over repository declaration remains owned by `resolveProfilePin()`.
- Creating, changing, or removing a pin updates the fullscreen Status digest without restarting Pi.
- The compact bottom bar remains unchanged.
- Focused tests, typecheck/runtime checks, complete test suite, and `git diff --check` pass or any skipped/failed check is reported.

## Evidence

- T1 commit: `ef07e0ef` (`fix(shell): show effective repository profile`)
- TDD RED: the new pin test expected `other (pinned)` but observed the global `team` profile before implementation.
- Focused tests: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts` — 60 passed, 0 failed; `node --experimental-strip-types --test tests/profile-pin.test.ts` — 20 passed, 0 failed.
- Full tests: `node --experimental-strip-types --test tests/*.test.ts` — 2643 passed, 0 failed, 38 skipped.
- Type check: `node scripts/check-types.mjs` — passed with 197 recorded baseline diagnostics, no regressions, and 2 diagnostic pairs improved.
- Runtime module check: skipped because `scripts/check-runtime-modules.mjs` does not exist on this branch.
- Diff check: `git diff --check` — passed.
- Verification incident: `pnpm run typecheck` was discarded as a hermetic receipt because pnpm 12 dependency verification triggered install/postinstall side effects in ignored dependency areas. Read-only Git inspection confirmed no new tracked changes; final verification used direct Node commands only.
- Native review: unavailable before lineage creation. Two committed-range START attempts against `1170dc84c2198b53807431f6e03d02bf8dcc3444` were rejected with `candidate-target-projection-drift`; both reported `lineage_created: false` and performed no mutation.
