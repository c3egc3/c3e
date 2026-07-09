# Rogue Dragon — Project

Architecture reference. Describes what exists and how it fits together.
Not a changelog (see Sessions.md) and not a rationale log (see Decisions.md).

## What this is

A UCI-compatible chess engine for a custom variant, written in C++17.
Standard chess rules apply except:

1. **Randomized start position** — kings fixed on e1/e8; all other 15
   pieces per side placed randomly across ranks 1–2 (white) / 7–8
   (black). ~16,435,321,402,500 distinct starting positions (corrected
   from an earlier miscalculated figure).
2. **Pawn rights follow the piece, not the rank** — a pawn keeps its
   double-push and resulting en-passant eligibility as long as it has
   never moved, regardless of which rank it starts on.
3. **Castling is locked to the real corner squares** — legal only if the
   king and the specific rook are both still on their original e1/h1/a1
   (or e8/h8/a8) squares. Not full Chess960-style arbitrary castling.
4. **Win/loss/draw/stalemate**: standard rules.

## Codebase status

Builds clean with CMake + GCC 13, C++17, zero warnings in project code
(one harmless sign-compare warning inside vendored third-party Fathom
code). It is not a "broken build" — issues found so far are logic bugs,
not compile failures. See Roadmap.md for what's actually confirmed broken.

Total: ~14,700 lines across 24 source files.

## Provenance (internal only — do not reference in shipped code)

Roughly 40% of the codebase (position representation, move generation,
Zobrist hashing, UCI protocol, TT layout) was ported from an earlier
JavaScript prototype and can be cross-checked against it line-by-line.
The remaining ~60% (evaluation, search, Syzygy tablebase probing,
opening book, bitboard/magic-number generation) was written directly in
C++ with no JS reference — it has to be validated against chess-engine
theory and test suites (perft, tactical suites, reference-engine
comparison) instead of a source-of-truth diff.

This split matters for how each file gets debugged — see the table below.

## File map

| File | Lines | Role | Provenance |
|---|---|---|---|
| types.h | 188 | Core enums/types, header-only | ported |
| bitboard.h/.cpp | 157/333 | Magic-bitboard slider attacks, precomputed tables | ported concept, native magic-number upgrade |
| zobrist.h/.cpp | 69/95 | Zobrist hashing (splitmix32 PRNG, seed 0xDEADBEEF) | ported |
| board.h/.cpp | 177/529 | Position state, make/unmake, attack detection, FEN | ported |
| movegen.h/.cpp | 156/617 | Staged legal move generation, SEE | ported concept, native staging upgrade |
| tt.h/.cpp | 252/310 | Transposition table (10-byte packed entries), pawn hash | ported concept, native packing upgrade |
| history.h/.cpp | 374/155 | Killer/butterfly/continuation/capture/correction history | native (Lazy SMP prep) |
| book.h/.cpp | 80/415 | Inline opening book, weighted random selection | native |
| eval.h/.cpp | 194/2501 | Static evaluation (PSTs, mobility, king safety, etc.) | native, no reference |
| search.h/.cpp | 310/1417 | qsearch, alpha-beta, iterative deepening, aspiration windows | native, no reference |
| searchthread.h | 161 | Per-thread search state (Lazy SMP prep) | native |
| uci.h/.cpp | 41/833 | UCI protocol handler, option state, thread orchestration | ported |
| main.cpp | 79 | Entry point, subsystem init order | ported |
| syzygy.h/.cpp | 118/372 | Syzygy tablebase integration (native build only) | native |
| tbprobe.h/.c, tbchess.c, tbconfig.h | 399/2715/1049/28 | Fathom (vendored, public-domain Syzygy probing library) | **third-party — do not rename to "rogue"** |
| stdendian.h | 285 | Endianness macros (vendored gist) | **third-party — do not rename** |

## Notable design points

- **Opening book only fires on the standard start position.** Variant
  shuffled positions produce different Zobrist keys that never match
  book entries, so the book is silently and correctly skipped for
  almost every real game under this variant. This is intentional, not
  a bug — confirmed by reading the book gate logic in uci.cpp.
- **WASM export path exists** (`c3_uci_command` / `c3_stop`, guarded by
  `__EMSCRIPTEN__`) — the engine was designed to also run in-browser via
  Emscripten, not just as a native UCI binary. Relevant if a web
  front-end is ever wanted.
- **Lazy SMP groundwork is in place** (searchthread.h, per-thread
  history/state) but multi-threaded correctness is unverified — flagged
  in Roadmap.
- **Insufficient-material draw detection does not exist anywhere in the
  C++ code.** The JS prototype delegated this to an external library
  (`chess.js`); nothing fills that role here. Decision: implement
  natively (see Decisions.md).

## Build

CMake 3.20+, C++17, GCC or Clang. `cmake -B build && cmake --build build`.
Produces a `c3engine` binary (target name; renaming to `rogue` is part
of the rename pass — see Roadmap.md).
