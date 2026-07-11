# Rogue Dragon — Architecture

**Foundation: pet-dragon (Rust), being adapted into Rogue Dragon.**
This supersedes the earlier C3Engine (C++) foundation — see Decisions.md
D13 for the full pivot rationale. C3Engine's debugging history is kept
in Decisions.md/Sessions.md for record, not deleted, but it is no longer
the active codebase.

## What Rogue Dragon is

A UCI-compatible chess engine for a custom variant, in Rust.

**Rules:**
1. Kings fixed on e1 (White) / e8 (Black). All other 15 pieces per side
   placed randomly across ranks 1-2 (White) / 7-8 (Black), **independently
   per side** — no mirroring, no same-color-bishop constraint. This is
   the full, original 16,435,321,402,500-position space, not pet-dragon's
   more constrained 2,162,160-position subset.
2. A pawn keeps double-push/en-passant eligibility as long as it hasn't
   moved, regardless of current rank.
3. Castling only if the king and the specific rook are still on their
   original corner squares (e1/h1/a1 or e8/h8/a8).
4. Standard win/loss/draw/stalemate/insufficient-material rules.
5. Same-color bishop batteries/support are allowed (unlike pet-dragon,
   where bishops are always opposite-colored by construction) and get
   dedicated evaluation handling — see "Eval: same-color bishop rule"
   below.

## Why pet-dragon as the foundation

C3Engine (C++) revealed three serious, verified memory-safety bugs in
one debugging session — board corruption from unsafe make/unmake,
broken magic-bitboard tables, a buffer overflow — with a fourth still
open when the pivot was decided. That's not bad luck; it's the
predictable cost of ~4,000 lines of hand-written C++ with no reference
to check against. pet-dragon:
- Is written in Rust, which makes that entire bug *category*
  (out-of-bounds access, buffer overflows, silent memory corruption)
  structurally very hard to write by accident.
- Has a real, substantial test suite (375 tests as of Session 63 of its
  own history) that was actually run and passed — including perft
  against the standard position through depth 5 and against "Kiwipete"
  (a reference position specifically designed to catch castling/
  en-passant/promotion bugs) through depth 4.
- Is far more feature-complete than C3Engine was: full UCI including
  pondering and MultiPV, Syzygy tablebases (via `pyrrhic-rs`, a safe
  Rust port — no vendored C), NNUE (trained, Phase 16), Texel-tuned
  evaluation with a measured, honestly-reported ~39 Elo gain from real
  520-game match testing.
- Already implements insufficient-material draw detection natively
  (K vs K, K+B vs K, etc., with dedicated tests) — an item that was
  still an open gap in C3Engine.
- Uses the same rule family as Rogue Dragon (king fixed, random
  placement, pawn-rights-follow-the-piece, corner-locked castling) —
  it's a more-constrained subset, not a different game.

## File structure (from pet-dragon, to be renamed)

```
src/
├── lib.rs, main.rs           # Library root / UCI entry point
├── types.rs                  # Core types
├── bitboard/ (mod, masks, magic)   # Bitboard primitives, magic sliders
├── position/ (mod, setup, make_move, fen, zobrist)
│                              # Position repr, THE RANDOM-OPENING GENERATOR,
│                              # move application, FEN, hashing
├── movegen/ (mod, pieces, pawns, castling, legal)
├── tt/                        # Transposition table
├── search/ (mod, alpha_beta, iterative, ordering, pruning, see, time)
├── eval/ (mod, material, mobility, king_safety, pawns, open_lines, tables)
├── nnue/ (mod, delta, features, inference)   # Trained network included
├── texel/                     # Automated eval-weight tuning
├── syzygy/                    # Tablebase probing (pyrrhic-rs)
└── bin/                       # self-play, match runner, NNUE training,
                                # eval diagnostics, Lichess sampling
tests/                         # perft, make_unmake, setup, node_count
```

## Adaptation required (pet-dragon → Rogue Dragon)

All three rule/naming changes are isolated to specific, known files —
see Roadmap.md for the actual checklist. Summary:

1. **Renaming**: `pet`/`Pet` → `rogue`/`Rogue` throughout engine-facing
   naming — crate names (`pet_dragon`/`pet_dragon_lib` →
   `rogue_dragon`/`rogue_dragon_lib`), binary name, types, UCI `id name`,
   comments/doc strings. Everywhere it's part of engine identity.
2. **Remove bishop-opposite-colour constraint** — isolated block in
   `position/setup.rs` (~30 lines) that searches for first light/dark
   square before placing bishops. Delete; let bishops go through the
   same general random-placement path as every other piece.
3. **Remove mirroring** — `position/setup.rs`'s "Step 6: Mirror White to
   Black" currently copies White's placement. Replace with running the
   same shuffle-and-place logic independently for Black. Also requires
   making castling-rights detection independent per side (currently
   "Black mirrors White" for rights too — same fix pattern as White's
   existing check).
4. **New eval logic — same-color bishop rule** (does not exist in
   pet-dragon at all, since same-color bishops can never occur there):
   - **Baseline** (no attack, no mutual support active): same-color
     bishops score **lower** than opposite-color — permanent
     half-board-color blindness, a real structural weakness.
   - **Active attack opportunity** (the shared diagonal is open and
     bears on the enemy king or a weak/undefended enemy piece):
     same-color scores **higher** than an equivalent opposite-color
     arrangement — a stacked same-diagonal battery is a pattern
     opposite-color bishops can never form at all.
   - **Mutual support** (one bishop defends the square the other stands
     on — same relationship as rook-rook or knight-knight support
     elsewhere in the eval): same-color scores **higher** — again,
     structurally impossible for opposite-color bishops.
   This applies to bishop-bishop batteries, queen+bishop(s) batteries,
   and bishop-to-bishop support specifically.

## What's explicitly verified, not assumed

- Insufficient-material detection: exists, tested (`position/mod.rs`).
- Magic bitboard correctness: proven via passing perft suite (own tests,
  independently run and confirmed by Claude, not just trusted from the
  test file existing).
- No `mirror` references found in `movegen/castling.rs` or
  `position/mod.rs` — no evidence of an explicit mirror dependency in
  castling logic. This is "nothing found," not "proven absent" — worth
  a real functional test after the mirroring removal, not just trusting
  the absence of a keyword match (see Roadmap).
