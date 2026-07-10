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

Built a standalone test harness (`src/test_repro.cpp`, sandbox-only) to
reproduce the exact Nxe5 position via board.cpp/movegen.cpp directly,
bypassing search — proved Black not in check with 32 legal moves there,
ruling out move-generation/check-detection in isolation.

Instrumented the real engine (temporary debug prints in search.cpp) at
the branch producing the mate score, and dumped live board state when
it fired — found the board was genuinely corrupted (impossible piece
placements). Added a Zobrist-mismatch canary around the main search
loop's own make/unmake — came back clean, ruling out the obvious
suspects (singular extension, null-move, multi-cut) as operating
correctly *within that loop*.

Rebuilt with AddressSanitizer + UndefinedBehaviorSanitizer
(`-fsanitize=address,undefined`) and reproduced again — got a real,
exact stack trace instead of continuing to guess. Root cause: `makeMove`
and `unmakeMove` in board.cpp derived piece types from live
`pieceAt[]` reads instead of the already-correct fields baked into
each `Move` at generation time, causing an out-of-bounds write into
`bb[color][6]` whenever any desync occurred anywhere — which corrupted
adjacent memory, which move generation misread as phantom pieces,
compounding the corruption further. First trigger traced specifically
to move generation's own internal legality-check loop
(movegen.cpp ~line 273), which does its own make/unmake per candidate
move to test for self-check — a code path the earlier canary never
covered since it only watched the main search loop.

**Implemented and verified the fix (D10):** both functions now trust
the move's own recorded fields; every remaining piece-type-derived
bitboard index is defensively guarded against `NO_PIECE_TYPE`. Rebuilt
under ASan/UBSan and confirmed **zero warnings at search depth 10**
(down from four confirmed out-of-bounds sites). The original repro now
returns real, sane search results instead of a false mate.

While verifying with a perft harness (`src/test_perft.cpp`,
sandbox-only) against known-correct values for the standard start
position, **found a second, separate, pre-existing bug**: perft(1) and
perft(2) are exactly correct, but perft(3) undercounts by 198 moves
(8,704 vs. the correct 8,902), with the gap widening further at deeper
depths. Confirmed clean under sanitizers — this is a logic bug (moves
wrongly excluded), not a memory-safety one. Leading suspects: castling
rights or en-passant availability after 2+ ply, since those are the
only mechanics that only start mattering once pieces have actually
moved — consistent with depth 1-2 passing and depth 3+ failing.

**Next session should start with:** Bisect the perft(3) gap — compare
per-first-move move counts (a "perft divide") against known-correct
values to narrow down whether castling rights or en passant is the
culprit, then fix and re-verify perft through at least depth 5. Once
perft is clean, that's a strong signal core rules are solid enough to
consider the renaming pass and first real upload to `rogue-dragon`.
