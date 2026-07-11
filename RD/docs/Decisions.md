# Rogue Dragon — Decisions

Newest entry first. Records *what* we decided and *why*.

---

### D15 — Same-color bishop battery/support eval rule, fully specified
**Date:** 2026-07-11
Since Rogue Dragon allows same-color bishops (unlike pet-dragon, where
they're always opposite-colored by construction), new eval logic is
needed — this doesn't exist anywhere in pet-dragon to port from. Final
rule, after several rounds of clarification with Gokul:
- **Baseline** (neither condition below active): same-color scores
  **lower** than opposite-color. Permanent structural weakness — half
  the board's squares are forever unreachable.
- **Active attack opportunity** (open diagonal bearing on the enemy
  king or a weak/undefended enemy piece): same-color scores **higher**.
  Rationale: same-color bishops can stack on one shared diagonal for a
  concentrated attack — opposite-color bishops structurally cannot,
  since they're never on the same diagonal as each other.
- **Mutual support** (bishop A defends the square bishop B stands on,
  or vice versa — same pattern as rook-rook/knight-knight support
  elsewhere in the eval): same-color scores **higher**. Same
  structural-impossibility reasoning as above.
Explicitly NOT a third "shared convergence square" case (two bishops on
different diagonals both able to reach some third square) — Claude
initially over-specified this as a separate case; Gokul clarified it
collapses into the mutual-support case as already defined. Applies to:
bishop-bishop batteries, queen+bishop(s) batteries, bishop-to-bishop
support.

### D14 — Renaming scope for the pet-dragon-based build
**Date:** 2026-07-11
Every `pet`/`Pet` occurrence in engine-facing naming becomes
`rogue`/`Rogue`: crate names (`pet_dragon`/`pet_dragon_lib` →
`rogue_dragon`/`rogue_dragon_lib`), binary name, types/structs that
embed "Pet Dragon," comments, doc strings, UCI `id name` response —
everywhere it's part of the engine's identity. Docs consolidated into
the existing `RD/docs` location (the separate `pd/docs` inventory pass
is now folded in here, not maintained as a parallel track).

### D13 — Pivot: adopt pet-dragon (Rust) as the foundation, retire the C3Engine (C++) path
**Date:** 2026-07-11
**Context:** After fixing three real, verified memory-safety bugs in
C3Engine's C++ codebase in one session (D10-D12) — with a fourth
(SIGILL crash in eval.cpp) found and still open during final delivery
checks — Gokul asked directly whether adopting pet-dragon (his other,
more mature Rust project) as the foundation instead would be easier.

**Investigation before deciding** (not a snap call):
- Read pet-dragon's actual source (`position/setup.rs` in full),
  confirming the two constraints to remove (bishop-opposite-colour,
  mirroring) are cleanly isolated in one file, not scattered.
- Installed a Rust toolchain and **actually built pet-dragon and ran
  its real test suite** — 63 directly-relevant tests (perft including
  Kiwipete, make/unmake symmetry, 1000-iteration setup validation) all
  passed. This is the same rigor applied to C3Engine (nothing taken on
  faith), not a lighter-touch evaluation.
  Retrieved and read pet-dragon's own extensive documentation
  (`pd/docs/` in `c3egc3/c3e` — 4,647 lines: DECISIONS.md,
  ROADMAP.md, SESSION_LOG.md, ENGINE_ARCHITECTURE.md,
  VARIANT_ARCHITECTURE.md, PROJECT_CONTEXT.md). Found it substantially
  more mature than a first pass suggested: Phase 19 complete (full UCI
  with pondering/MultiPV), Syzygy done, NNUE trained, Texel tuning
  validated via a real 520-game match (~39 Elo gain, honestly reported
  as "modest," not oversold), 375 tests green as of its own Session 63.
  Confirmed insufficient-material detection already exists natively
  (an item that was still an open gap in C3Engine).

**Decision: switch.** Reasoning: the C3Engine bugs weren't bad luck —
they're the predictable cost of hand-written C++ with no reference to
check against, and eval.cpp/search.cpp still had ~4,000 largely
unverified lines when the pivot was decided, so more of the same class
of bug should be expected. Rust makes that specific bug category
(out-of-bounds access, buffer overflows, silent corruption) structurally
much harder to write by accident — directly addressing the actual cost
center of the previous session, not a vague "Rust is safer" preference.
pet-dragon is also simply further along as an engine. The specific rule
differences needed (remove mirror, remove bishop-colour constraint, add
same-color bishop eval logic) are well-scoped, isolated changes, not a
rewrite.

**This reverses D4** (the earlier decision to continue with C3Engine
rather than switch to Rust), made explicitly with better information
than was available at the time D4 was made — D4 wasn't wrong given what
was known then (C3Engine's ported core rules were validated against a
JS reference at that point, and no C++-specific bugs had been found
yet). C3Engine's debugging history (D1-D12, Sessions 1) is preserved
below for record, not deleted.

---

## C3Engine era (superseded — retained for record, see D13)

### D12 — Bishop-battery buffer overflow fixed; array sizing needs a second look elsewhere later
**Date:** 2026-07-10
Found via AddressSanitizer while doing final verification of D10/D11:
`evalC3Batteries` in eval.cpp filled a fixed `std::array<Square, 8>`
with a side's bishop squares, with no bounds check. Fixed by resizing
to 10 (the true theoretical max: 2 original + 8 promoted pawns) and
adding a bounds check on the fill loop. Checked eval.cpp for the same
pattern elsewhere — this was the only instance.
Flagged but not resolved: this fired on move 5 of a normal game line,
far earlier than a legitimate many-bishop position could occur. The fix
makes the crash impossible either way, but whether the bishop bitboard
was genuinely over-populated at that point (a symptom of something else)
is still open. Moot now under D13 — not pursued further.

### D11 — Magic-bitboard tables replaced with classical ray-casting (correctness over speed, for now)
**Date:** 2026-07-10
Root cause of the depth-3+ perft undercount: the magic-bitboard slider-
attack tables produced wrong (truncated) results for at least some
squares — confirmed directly by calling `bishopAttacks()` in isolation.
Tested and disproved an `sq XOR 56` re-indexing theory (a suspected
a1=0-vs-a8=0 convention mismatch in the copied-in magic numbers) — it
broke a previously-working square, so the true mechanism was never
conclusively identified. Fix: redirected to the codebase's existing
"classical" ray-casting functions. Verified via perft matching
known-correct values exactly through depth 5.
**Methodology note that still applies going forward regardless of
codebase:** this fix, D10, and D12 were all found by building with
`-fsanitize=address,undefined -fno-omit-frame-pointer` and reproducing
the failure — an exact stack trace instead of manual reasoning. Rust's
own equivalent discipline (Miri, or just trusting the borrow checker/
bounds checks) is the natural continuation of this same principle.

### D10 — First real code fix: make/unmake now trusts move-record fields, not live board state
**Date:** 2026-07-10
Root cause of the board-corruption/false-mate-claim bug: `makeMove`/
`unmakeMove` in board.cpp derived piece types from live board state
instead of the already-correct fields baked into each `Move` at
generation time, causing an out-of-bounds write whenever any desync
occurred anywhere. Traced via ASan/UBSan to its first trigger: move
generation's own internal legality-check loop. Fixed by trusting the
move's own recorded fields; verified clean under sanitizers afterward.

### D9 — D7 reconsidered: tablebase removal reversed, pending real evidence
**Date:** 2026-07-10
Directly tested the theory behind D7 (that Syzygy files caused a
reported hang): a bogus SyzygyPath didn't hang or crash. D7 reversed;
tablebase code stayed in C3Engine. Also: Gokul correctly called out that
large, hard-to-reverse changes shouldn't be decided without testing the
underlying theory first, even under a "free hand" mandate.

### D8 — NNUE: out of scope for now, optional future addition (superseded — pet-dragon already has trained NNUE, see D13)
### D7 — ~~Remove Syzygy/Fathom tablebase integration~~ SUPERSEDED BY D9
### D6 — Insufficient-material draw detection: implement natively (superseded — pet-dragon already has this natively, see D13)
### D5 — Delivery format: copy-paste, not automated push
GitHub write access via the connected tool returned 403 on both
`g-c-3/rogue-dragon` and `c3egc3/c3e`. Manual delivery: Find/Replace for
small changes, download+upload for large/new files. Still applies.

### D4 — Language: C++, continuing existing codebase (reversed — see D13)
### D3 — Keep original variant rules as-is
Full 16.4-trillion random-opening space, pawn-rights-follow-the-piece,
corner-locked castling, no simplification. **Still applies** — this is
exactly the rule set Rogue Dragon is being adapted toward from
pet-dragon's more constrained baseline.
### D2 — Full rename: c3/c3e/c3engine → rogue (superseded in mechanism by D14, same principle)
### D1 — Two-track debugging strategy by file provenance (C3Engine-specific, moot under D13)
