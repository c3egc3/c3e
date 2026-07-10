# Rogue Dragon — Roadmap

What & how. Checklist format. Confirmed-broken items are separate from
unverified/planned items — don't conflate "known bug" with "haven't
checked yet."

## 🔴 Confirmed bugs

- [ ] **False mate-in-1 claim in a normal, non-tactical position.**
      Repro: `position startpos moves e2e4 e7e5 g1f3 b8c6 f1b5 a7a6` then
      `go depth 10`. At depth 3 the engine reports `score mate 1` for
      `f3e5` (Nxe5) — this is the standard Ruy Lopez / Morphy Defense
      position, there is no mate anywhere near it. **Confirmed isolated
      from the tablebase code**: reproduced byte-for-byte identically
      (same nodes/score/PV) in a build with tbprobe.c excluded entirely
      — so this is a core search/eval/legality bug, not TB corruption.
      Likely cause: check detection, mate-scoring, or legality bug in
      search.cpp or board.cpp's `isAttackedBy`/`inCheck`. **Top
      priority — this is a correctness bug that would make the engine
      actively unsafe to trust in any real game**, not just weak play.
      Needs isolated investigation next session.
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
