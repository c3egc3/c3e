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
- Wrote first drafts of all four docs (this session).

**Left off at:** Docs written, not yet uploaded to
`c3egc3/c3e` → `RD/docs/`. Next session should start with the
mate-in-1 bug investigation (top of Roadmap) once docs are confirmed
uploaded.

**Next session should start with:** Investigating the mate-in-1 bug —
isolate whether it's a check/legality detection issue in board.cpp or a
mate-scoring issue in search.cpp. Suggest starting with a minimal
reproduction (a FEN of the exact position, tested directly, rather than
via the move sequence) to narrow it down faster.
