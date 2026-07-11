# Rogue Dragon — Sessions

Newest entry first.

---

### Session 2 — 2026-07-11

**Context carried in from Session 1:** three real bugs found and fixed
in C3Engine (C++) — board corruption/false mate claims, broken
magic-bitboard move generation, a bishop-battery buffer overflow — with
a fourth (SIGILL crash in eval.cpp) found and unresolved during final
delivery verification.

**Did:**
- Gokul asked directly whether adopting pet-dragon (Rust) as the
  foundation instead would be easier, given the rule overlap (Rogue
  Dragon's rules are pet-dragon's rules minus mirroring, minus the
  bishop-opposite-colour constraint).
- Investigated properly rather than answering from impression: read
  `position/setup.rs` in full, confirmed the two constraints to remove
  are cleanly isolated in one file.
- Installed a Rust toolchain in the sandbox and **actually built
  pet-dragon and ran its real test suite** (worked around an outdated
  system `cargo` by temporarily stripping the `criterion` dev-dependency,
  restored after). 63 directly relevant tests passed: perft (including
  Kiwipete through depth 4, standard position through depth 5),
  make/unmake symmetry (19 tests), setup validation (21 tests, including
  1000-iteration statistical checks).
- Retrieved and read pet-dragon's own existing documentation from
  `c3egc3/c3e/pd/docs/` (4,647 lines across 6 files) — found it far more
  mature than file-listing alone suggested: Phase 19 complete (full UCI
  with pondering/MultiPV), Syzygy done, NNUE trained, Texel tuning
  validated via a real, honestly-reported 520-game match (~39 Elo gain).
  Confirmed insufficient-material detection already exists natively.
- Recommended the switch, with reasoning tied directly to what the
  previous session actually cost (memory-safety bug class, structurally
  prevented by Rust) rather than a generic language preference. Gokul
  agreed.
- Clarified the same-color-bishop eval requirement over several rounds
  — initial version was wrong (flat weight adjustment); corrected to a
  three-part rule (baseline lower / active-attack higher / mutual-
  support higher) after Gokul corrected two separate misunderstandings
  (the "attack vs. no attack" distinction, then a redundant third case
  Claude invented that Gokul clarified was the same as mutual support).
  Final rule recorded in Decisions.md D15.
- Consolidated documentation: `pd/docs/` (the standalone inventory pass)
  folded into `RD/docs/`, which is now the single active doc location.
  C3Engine-era history preserved in Decisions.md for record, marked
  superseded, not deleted.

**Left off at:** Documentation consolidated and rewritten
(Architecture.md, Decisions.md, Roadmap.md, this file) to reflect the
pivot. No code changes made yet on the pet-dragon codebase itself —
this session was investigation and planning, not implementation.

**Next session should start with:** Begin the actual adaptation work,
in the order listed in Roadmap.md's 🔴 section — renaming pass first
(mechanical, low-risk, and makes every subsequent diff cleaner to read
since it won't be mixed with rule-logic changes), then the two
constraint removals in `position/setup.rs` together (they're in the
same file, same function), then the new same-color-bishop eval logic.
Re-run pet-dragon's existing test suite after each step, not just at
the end — the existing setup tests
(`test_bishops_opposite_colours_1000`, `test_black_mirrors_white_1000`)
will need to be replaced with tests asserting the new, opposite
behavior, at the same statistical rigor.

---

### Session 1 — 2026-07-10

**Goal:** Full inventory. No fixing yet (per plan).

**Did:**
- Pulled full source of the C3Engine repo (24 files, ~14,700 lines) and
  the private JS reference implementation (4,023 lines) for cross-
  checking.
- Compared README's stated variant rules against the JS reference's
  rule comments — found the phrasing differs but describes the same
  random process (not a bug), and found a real arithmetic error in the
  README's stated opening-position count.
- Confirmed insufficient-material draw detection was completely absent
  from the C3Engine C++ code.
- Installed build tools and **built the engine from scratch — compiled
  clean, zero project warnings.** "Barely works" was not a build
  problem.
- Ran the engine under UCI: handshake correct, opening book correctly
  gated to standard-position-only.
- Ran a real search 6 moves into a standard Ruy Lopez line and found a
  genuine, reproducible bug: the engine claimed "score mate 1" for a
  completely non-tactical move.
- Gokul provided crucial context: the engine worked correctly against
  Fairy-Stockfish before Syzygy tablebase files were added, and stopped
  responding entirely afterward. Considered removing tablebase code
  (D7), tested the theory directly, found it didn't hold, reversed the
  decision (D9) after Gokul correctly pushed back on making large
  changes without testing the underlying theory first.
- Root-caused and **fixed three real, verified bugs** using
  AddressSanitizer/UndefinedBehaviorSanitizer (not guesswork — exact
  stack traces): board corruption from make/unmake trusting live board
  state instead of move-record fields (D10); broken magic-bitboard
  slider tables, worked around with classical ray-casting (D11); a
  bishop-battery buffer overflow (D12). Perft verified matching
  known-correct values exactly through depth 5 after the fixes.
- Found a fourth bug (SIGILL crash in eval.cpp's `evalRookOnSeventh`,
  only reproducible in the fully-optimized release build) during final
  delivery verification — still open when Gokul asked the foundation
  question that led to Session 2's pivot.

**Left off at:** Superseded by the Session 2 pivot — C3Engine is no
longer the active codebase. This history is preserved for record.
