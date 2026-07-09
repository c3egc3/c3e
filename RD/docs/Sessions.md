# Rogue Dragon — Sessions

Newest entry first.

---

### Session 1 — 2026-07-10

**Goal:** Full inventory. No fixing yet (per plan).

**Did:**
- Pulled full source of the engine repo (24 files, ~14,700 lines) and
  the private JS reference implementation (4,023 lines) for cross-
  checking.
- Compared README's stated variant rules against the JS reference's
  rule comments — found the phrasing differs but describes the same
  random process (not a bug), and found a real arithmetic error in the
  README's stated opening-position count (off by 100,000 — logged in
  Roadmap).
- Confirmed insufficient-material draw detection is completely absent
  from the C++ code (zero matches for "insufficient" anywhere in src/).
  Decision made to implement it natively (D6).
- Installed build tools (cmake) and **built the engine from scratch —
  compiles clean, zero project warnings.** "Barely works" is not a
  build problem.
- Ran the engine under UCI: handshake correct, opening book correctly
  gated to standard-position-only.
- Ran a real search 6 moves into a standard Ruy Lopez line (past the
  book) and found a genuine, reproducible bug: the engine claims
  **"score mate 1"** for Nxe5 in a completely non-tactical position.
  Logged as the top-priority item in Roadmap — this is a correctness
  bug, not just weak play.
- Established file-by-file provenance split (ported-from-JS vs.
  native-C++-no-reference) — determines validation strategy per file,
  recorded in Project.md.
- Verified `pet-dragon` (Rust reference project) and confirmed
  `rogue-dragon` repo exists but is empty.
- Tested GitHub connector write access — failed (403) on both target
  repos; delivery workflow set to manual copy-paste / upload instead
  (D5).
- Wrote first drafts of all four docs.
- Gokul provided crucial context: the engine worked correctly against
  Fairy-Stockfish before the Syzygy tablebase ("C lib") files were
  added, and stopped responding entirely afterward (though not fully
  certain of the exact sequence).
- Tested this directly: rebuilt the engine with tbprobe.c excluded
  entirely and re-ran the mate-in-1 repro. **Bug reproduced byte-for-
  byte identically** — proves that specific bug is not caused by the
  tablebase code.
- Given free hand on architecture, decided (D7) to remove the Syzygy/
  Fathom tablebase integration entirely for now (~4,100 lines, 28% of
  the codebase) — optional feature, plausible source of the separate
  "no response at all" symptom, not needed for a functional engine.
  Also confirmed (D8) NNUE is out of scope, existing classical eval
  stays, revisit both only after the core engine is proven correct.
- Updated all four docs to reflect this.

**Left off at:** Docs written, not yet uploaded to
`c3egc3/c3e` → `RD/docs/`. Tablebase removal decided but not yet
executed in code.

**Next session should start with:** Two things queued, in this order:
1. Execute the tablebase removal (Roadmap 🟣 section — mechanical, low
   risk, shrinks the codebase before the harder work).
2. Investigate the mate-in-1 bug — now confirmed isolated to core
   search/movegen/board logic. Suggest starting with a minimal FEN
   reproduction of the exact position (rather than the move sequence)
   to narrow it down faster.
