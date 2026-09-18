# Feature: ODD routing drift ratchet (gentle-pi mirror of gentle-ai canon)

## Objective

Make the hand-mirrored ODD routing text in gentle-pi fail visibly when the
gentle-ai canonical routing block changes, instead of drifting silently.

## Problem

gentle-pi hand-mirrors the ODD delegation text from gentle-ai
(`internal/components/agentguidance/routing.go` RenderRouting). There is no
automated sync (only the review provider contract is mirrored), so a canonical
change in gentle-ai leaves the pi mirror stale with nothing catching it.

## Design (follows the provider-contract precedent)

- `fixtures/odd-routing-canonical.md` — vendored snapshot of the canonical
  routing block rendered by gentle-ai `RenderRouting`, with a header naming the
  source repo/commit and the fixture digest.
- `scripts/mirror-odd-routing.mjs` — offline regeneration: locates a local
  gentle-ai checkout (default `../gentle-ai`), renders the canonical block
  through a temporary Go entrypoint, verifies, and writes the fixture. Never
  touches the network. Fails closed when the sibling checkout is missing.
- `tests/odd-routing-canonical-ratchet.test.ts` — derives semantic anchors from
  the fixture and asserts the pi mirror (assets/orchestrator-delegation.md,
  assets/orchestrator.md, extensions/gentle-ai.ts) carries each mandatory
  delegation clause. A canonical change that is not re-mirrored fails here.
- `package.json` — `mirror:odd-routing` script entry.

## Constraints

- Offline, no release-pin changes (installer pin untouched).
- Ratchet only makes drift visible; it never auto-rewrites mirror assets.
- Fixture regeneration is deliberate and reviewable (diff shows the change).

## Tasks

- [x] T1. RED: ratchet test fails without fixture/anchors wired.
- [x] T2. Implement mirror script + fixture generation; GREEN.
- [x] T3. Triangulate: simulate drift, observe RED, restore.
- [x] T4. Validation. (Work-unit commit deferred: the delegating task requires
  the change to stay uncommitted.)

## Progress and evidence

- Canonical source: gentle-ai `../gentle-ai` at commit
  `e7729359fd9d6cb691ed2a88e8f72b1372f7c92e` (contains `dcd2fa07`, the mandatory
  delegation triggers).
- Fixture block sha256:
  `16eaa3031d7dd0d7b91e0095d4761d7fc85a1f4a8c596c5f2cfe754213d7aba6`.
- RED: `node --experimental-strip-types --test tests/odd-routing-canonical-ratchet.test.ts`
  failed with `ERR_MODULE_NOT_FOUND` for `scripts/mirror-odd-routing.mjs`.
- GREEN: after `npm run mirror:odd-routing` generated
  `fixtures/odd-routing-canonical.md`, the ratchet passed 5/5.
- Triangulation A (canonical drift, allowed surface): dropping the canonical
  Long-session anchor from the fixture made the ratchet fail with
  `canonical fixture dropped anchor: long-session backstop`; the fixture was
  restored with `npm run mirror:odd-routing`.
- Triangulation B (mirror drift): removing the condensed Long-session row from
  `assets/orchestrator.md` in memory reproduced the exact ratchet message
  `assets/orchestrator.md is missing the mirror of "long-session backstop": ...`.
  The mirror file was not written, to respect the allowed edit surfaces.
- Focused suites: `odd-routing-canonical-ratchet` + `odd-routing-contract` = 17/17 pass.
- `npm run check:provider-contract`: passed (contract 1.2.0).
- `npm run test:harness`: exit 0.
- Full `npm test`: 2706 tests, 2667 pass, 1 fail, 38 skipped. The single failure
  is `tests/opaque-pi-reviewer-adapter.test.ts`, a concurrent working-tree edit
  outside this task's scope (HEAD's committed version does not reference
  `extractPiAssistantText`); the provider-contract and harness stages were run
  separately and passed.

## Acceptance criteria

- `npm run mirror:odd-routing` regenerates the fixture from a local gentle-ai.
- Ratchet test passes on the current mirror and fails when a canonical clause
  is missing from it.
- Full suite stays green (blocked only by the unrelated external test edit).
