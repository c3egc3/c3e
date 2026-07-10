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

**Left off at:** Tablebase removal (D7) was reconsidered and reversed
(D9) after Gokul pushed back and a direct test disproved the hang
theory — TB code stays untouched. Moved to the mate-in-1 bug.

Built a standalone test harness (`src/test_repro.cpp`, sandbox-only,
not delivered) linked directly against board.cpp/movegen.cpp/
bitboard.cpp/zobrist.cpp, bypassing search entirely, to reproduce the
exact position after `e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 f3e5`. Result at
first: Black not in check, 32 legal moves — proved the bug wasn't in
move-generation/check-detection in isolation.

Then instrumented the real engine directly (temporary debug prints in
search.cpp, not shipped) at the exact branch that produces the mate
score, and dumped the live board state when it fires. **The board
itself is corrupted at that point** — pieces in positions no legal
continuation of the actual move list could produce (a white pawn on
e7, a vanished black knight with no capture, a bishop shown as never
having moved despite being played earlier). This is a bigger, more
serious finding than the original "false mate" framing: it's silent
board-state corruption during search, and the false mate score is just
one visible symptom of it.

Leading theory: an incomplete make/unmake restoration in one of the
search's speculative move-trial blocks (singular extension's manual
trial loop, null-move pruning, or multi-cut pruning), all of which
play and unplay moves internally before the real move of a node is
tried.

**Next session should start with:** Audit every make/unmake pair in
search.cpp that isn't the main move loop — starting with the singular-
extension trial loop (~lines 862-893), then null-move pruning, then
multi-cut — for an UndoRecord that doesn't fully capture/restore state.
Remove the temporary debug instrumentation from search.cpp once the
real fix is in (it's sandbox-only, never delivered, but shouldn't be
left in the working copy indefinitely either).
