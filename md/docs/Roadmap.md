# Mythical Dragon — Roadmap

> **Doc 3 of 5** — companion docs: [Architecture.md](./Architecture.md) · [Decisions.md](./Decisions.md) · [SessionLog.md](./SessionLog.md) · [CLAUDE_PROJECT_INSTRUCTIONS.md](./CLAUDE_PROJECT_INSTRUCTIONS.md)

Live, checkable task list — this is what "Go" reads to determine what's
next. `- [ ]` = pending · `- [x]` = done. Worked roughly top-to-bottom
within a phase; check SessionLog.md for what's actually in flight.

---

## Phase 0 — Project Setup & Governance
- [x] Draft Architecture.md
- [x] Establish 5-doc control system
- [x] Write CLAUDE_PROJECT_INSTRUCTIONS.md
- [ ] Create/confirm `g-c-3/mythical-dragon` repo structure (project
      director should also remove or repurpose the stray `index.html`
      currently at repo root, since it predates this structure)
- [ ] License decision logged (Decisions D0.6 currently "undecided")

## Phase 1 — Engine Skeleton
- [ ] `python-chess` dependency confirmed working in Claude's sandbox
- [ ] Board setup, basic alpha-beta search, iterative deepening
- [ ] Material-only leaf evaluation (deliberate placeholder — not a claim
      generator, just enough to make the search skeleton testable)
- [ ] Basic self-play smoke test (does it complete a legal game without
      crashing) — run and actually observed, not assumed

## Phase 2 — First Claim Generators
- [ ] `STRUCTURAL_WEAKNESS` generator (cleanest countable magnitude)
- [ ] `TACTICAL_THREAT` generator
- [ ] Tier 1/2 pairwise comparator only (see Architecture §4)
- [ ] Test suite: hand-picked positions where the "obviously correct" move
      is known, confirm the comparator agrees — this is the first real
      test of whether tiered resolution behaves sanely at all

## Phase 3 — King System
- [ ] `KING_EXPOSURE` generator
- [ ] Wire into tier priority (tier 1 for immediate mate threats, tier 3
      otherwise)
- [ ] Test: does the engine avoid unsafe king moves without an explicit
      numeric penalty anywhere?

## Phase 4 — Remaining Generators
- [ ] `PIECE_ACTIVITY`
- [ ] `COORDINATION`
- [ ] `INITIATIVE`
- [ ] `FILE_CONTROL`
- [ ] Full 5-tier resolution at root/PV nodes

## Phase 5 — Capture Subsystem
- [ ] Local claim set builder scoped to the exchange square
- [ ] Exchange sequence resolver (which capture leaves the strongest
      post-capture claim set, not just which wins material)

## Phase 6 — Search Integration (biggest open risk, see Architecture §5)
- [ ] Two-tier search: cheap magnitude-sum heuristic for deep/bulk nodes,
      full claim resolution for root/PV nodes
- [ ] Measure actual search depth achievable in pure Python at this point
      — this is the empirical answer to whether the architecture's
      tractability concern is fatal or manageable

## Phase 7 — Calibration & Validation (no SPRT — see Architecture §6)
- [ ] Calibration logging: per-claim-type correlation between claim
      predictions and actual game outcomes, across self-play games run in
      Claude's sandbox
- [ ] Lightweight sanity match set vs. a fixed weak reference, to catch
      regressions between sessions
- [ ] Any strength/behavior claim stated in these docs from this point
      forward must cite the specific measurement it came from

## Phase 8 — Infrastructure (only once justified — Decisions D0.9)
- [ ] GitHub Actions, if and when there's working code worth protecting
- [ ] Packaging / installability, if the project reaches that point
