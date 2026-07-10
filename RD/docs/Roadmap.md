# Rogue Dragon — Roadmap

What & how. Checklist format. Confirmed-broken items are separate from
unverified/planned items — don't conflate "known bug" with "haven't
checked yet."

## 🔴 Confirmed bugs

## ✅ Fixed and verified this session

- [x] **Board state corruption / false mate claims — FIXED.** Root cause:
      `makeMove` and `unmakeMove` in board.cpp derived piece types from
      live board state (`pieceAt[from]`/`pieceAt[to]`) instead of
      trusting the already-correct fields baked into the `Move` struct
      at generation time (`attackerType`, `capturedType`, `promo`). Any
      transient desync anywhere caused an out-of-bounds write into
      `bb[color][6]` (valid range 0-5), silently corrupting adjacent
      memory — which cascaded into phantom pieces on empty squares,
      which move generation would then "play," compounding the
      corruption further. Traced to its origin using
      AddressSanitizer/UndefinedBehaviorSanitizer builds (full stack
      traces, not guesswork) — the actual first trigger is move
      generation's own internal legality-check loop
      (movegen.cpp, ~line 273), which calls `makeMove`/`unmakeMove`
      once per pseudo-legal candidate to test for self-check.
      **Fix:** both functions now trust the move's own recorded fields,
      and every remaining bitboard index derived from a piece type is
      guarded against `NO_PIECE_TYPE` as a defensive backstop. Verified
      with a clean ASan/UBSan run at depth 10 (zero warnings, down from
      four distinct out-of-bounds write sites) and the original repro
      (`e2e4 e7e5 g1f3 b8c6 f1b5 a7a6`, `go depth 10`) now returns real
      search results (nodes scaling normally, sane scores, a
      legitimately-verified `mate 2` later in the same search — board
      dumps at that point show a real, sane position) instead of the
      false `mate 1` after 196 nodes.

## 🔴 New confirmed bug (found via perft while verifying the fix above)

- [ ] **Legal moves missing starting at depth 3.** Perft from the
      standard starting position: depth 1 = 20 (correct), depth 2 = 400
      (correct), **depth 3 = 8,704 vs. the known-correct 8,902** — 198
      moves missing, and the gap widens at deeper depths (4865609
      expected vs 4589427 actual at depth 5). Undercounting (not
      overcounting) points toward legal moves being wrongly excluded —
      leading suspects are castling-rights tracking or en-passant
      availability after 2+ ply, since those are the two things that
      only become relevant once pieces have actually moved (matching
      why depth 1-2 pass but depth 3+ doesn't). Verified independent of
      the corruption bug above — clean under ASan/UBSan, so this is a
      logic bug, not a memory-safety one. Confirmed via a standalone
      perft harness (`src/test_perft.cpp`, sandbox-only) against
      textbook-known perft values for the standard start position.
      **Next investigation step:** bisect which specific depth-3 lines
      are missing (compare move lists against a known-correct external
      perft divide, e.g. `perft divide` style output by first move) to
      narrow down whether it's castling or en passant specifically.
- [ ] **Investigate "engine stopped responding entirely" report.**
      Gokul reported total non-response after adding the Syzygy
      tablebase files, tested against Fairy-Stockfish (separate symptom
      from the mate-in-1 bug above — not yet reproduced directly).
      Leading theory: `syzygyInit()` given a `SyzygyPath` pointing at a
      missing/malformed directory, called via `setoption`, possibly by
      the test harness/GUI automatically. Moot for Rogue Dragon going
      forward since the TB code is being removed entirely (D7), but
      worth a mental note in case the same class of bug (unguarded
      filesystem/init call hanging) exists elsewhere.

## 🟡 Confirmed gaps (not bugs — missing features)

- [ ] **Insufficient-material draw detection missing entirely.** Zero
      references anywhere in the C++ source. Decision made (D6): build
      natively. Needs: K vs K, K+minor vs K, K+B vs K+B (same-color
      bishops), and similar. Not yet started.

## 🟢 Confirmed correct (verified, no action needed)

- [x] Clean build — CMake + GCC 13, zero project warnings.
- [x] UCI handshake (`uci`/`isready`) responds correctly.
- [x] Opening book gate — correctly limited to standard start position
      only, silently and correctly skipped for shuffled variant
      positions (Zobrist keys never match). Not a bug.
- [x] Unmoved-pawn tracking exists in board.cpp/.h as a dedicated
      bitboard, matches JS reference rule intent.
- [x] Castling rights correctly gated on real king/rook corner-square
      occupancy, matches JS reference.

## ⚪ Documentation fixes (trivial, low priority)

- [ ] README opening-position count has an arithmetic error:
      16,435,321,**3**02,500 should be 16,435,321,**4**02,500 (verified
      by direct calculation: 15!/(1!·2!·2!·2!·8!), squared for both
      sides).

## 🔵 Unverified — needs a validation pass

These aren't known-broken, just not yet checked against either the JS
reference (ported files) or a test suite (native files):

- [ ] movegen.cpp — perft testing (standard positions first, since
      perft references exist for those; variant positions need custom
      expected values since no public perft data exists for this rule
      set).
- [ ] eval.cpp — no reference implementation exists for this file at
      all; needs comparison against known evaluation principles and/or
      a reference engine on positions where variant rules don't apply.
- [ ] search.cpp — Lazy SMP multi-threaded correctness unverified
      (searchthread.h groundwork exists but hasn't been stress-tested
      with Threads > 1).
- [ ] zobrist.cpp — should be a direct diff against the JS reference's
      `_zrand()` output; not yet done.

## 🟣 Tablebase — removal reversed (D9), needs real repro instead

D7's removal decision was tested and disproven — a bogus SyzygyPath
does not hang or crash the engine. Tablebase code **stays**. The
original "no response at all" report is still unexplained. Needs from
Gokul before further action: the exact SyzygyPath value used at the
time, whether real .rtbw/.rtbz files were present, Threads setting, and
roughly what happened (hang forever vs. crash vs. something else).

## ⬜ Renaming pass (not started)

- [ ] `c3`/`c3e`/`c3engine` → `rogue` across all identifiers, comments,
      filenames, commit messages.
- [ ] UCI subcommand `position c3 <fen>` → `position rogue <fen>`.
- [ ] CMakeLists.txt: `project(C3Engine ...)` and `add_executable(c3engine ...)`
      → `rogue` naming.
- [ ] Exception: leave Fathom (tbprobe.*, tbchess.c, tbconfig.h) and
      stdendian.h untouched — third-party vendored code (D2), stays in
      the project per D9.
- [ ] Decide: do the rename *before* or *after* the mate-in-1 bug is
      fixed? (Recommend: after — renaming now makes diffing against the
      JS reference for the bug hunt slightly more friction, no benefit
      to doing it first.)
