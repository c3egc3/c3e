# Rogue Dragon — Roadmap

What & how. Checklist format. This is a fresh roadmap for the
pet-dragon-based path (see Decisions.md D13) — the C3Engine roadmap
items are retired, not carried forward, except where explicitly noted.

## 🔴 Not started — the actual adaptation work

- [ ] **Renaming pass**: `pet`/`Pet` → `rogue`/`Rogue` throughout.
      Crate names in Cargo.toml (`pet_dragon`/`pet_dragon_lib` →
      `rogue_dragon`/`rogue_dragon_lib`), binary name, any type/struct
      names embedding "Pet Dragon," comments, doc strings, UCI
      `id name` response in main.rs. Also the repo's own metadata
      (description, repository URL, homepage in Cargo.toml).
- [ ] **Remove bishop-opposite-colour constraint** in
      `position/setup.rs` — delete the light/dark-square search block,
      let bishops go through the same general random-placement path as
      every other piece.
- [ ] **Remove mirroring** in `position/setup.rs` — replace "Step 6:
      Mirror White to Black" with running the shuffle-and-place logic
      (currently steps 2-4) a second time, independently, for Black's
      ranks 7-8.
- [ ] **Make castling-rights detection independent per side** — same
      file currently derives Black's rights from White's ("Black
      mirrors White"). Needs its own check for Black's actual rook
      positions, following the same pattern as White's existing check.
- [ ] **New eval: same-color bishop rule** (see Architecture.md and
      Decisions.md D15 for the full specification). Three cases:
      baseline (lower), active attack opportunity (higher), mutual
      support (higher). Needs to be threaded through wherever
      bishop-bishop batteries, queen+bishop batteries, and bishop
      support are currently scored in `eval/`.

## 🟡 Verification required after the above (don't skip)

- [ ] **Re-run the existing test suite after each change**, not just at
      the end — `cargo test` for `tests/perft.rs`, `tests/make_unmake.rs`,
      `tests/setup.rs`. The setup tests specifically
      (`test_bishops_opposite_colours_1000`,
      `test_black_mirrors_white_1000`) will need to be rewritten or
      removed since they assert the exact constraints being removed —
      replace with equivalent tests asserting the NEW behavior
      (independent random placement, same-color bishops allowed) at the
      same 1000-iteration statistical rigor.
- [ ] **Functionally verify castling still works correctly after
      mirroring is removed** — Architecture.md notes no `mirror`
      keyword was found in `movegen/castling.rs`, but that's "nothing
      found," not "proven independent." Test castling from several
      genuinely independent (non-mirrored) White/Black setups, not just
      trust the absence of a keyword match.
- [ ] **New perft-style verification for the new eval logic isn't
      applicable (eval doesn't affect move legality)**, but the
      same-color bishop rule should get its own dedicated test suite —
      construct positions for each of the three cases (baseline, attack
      opportunity, mutual support) and assert the eval score direction
      matches the rule, mirroring the rigor of pet-dragon's own existing
      test style.
- [ ] **Full opening-space sanity check**: verify the adapted generator
      actually produces the expected ~16.4 trillion distinct positions
      in principle (i.e., confirm the combinatorics match — this is a
      math check against the generation logic, not something to
      brute-force enumerate).

## ✅ Already true, verified, nothing to do

- [x] Insufficient-material draw detection — exists natively in
      `position/mod.rs`, tested.
- [x] Pawn double-push/en-passant from actual start square — this is
      pet-dragon's own core rule already, identical to Rogue Dragon's
      rule 2, no change needed.
- [x] Corner-locked castling mechanism itself (which corner squares
      grant which rights) — identical rule to Rogue Dragon's rule 3,
      only the *independence from mirroring* needs fixing (see 🔴 above).
- [x] Magic bitboard correctness — proven via the passing perft suite,
      independently run and confirmed.
- [x] Core engine features: UCI (including pondering, MultiPV), Syzygy
      tablebases, NNUE (trained), Texel-tuned classical eval — all
      already built and tested in pet-dragon, inherited as-is.

## ⚪ Not urgent / future

- [ ] Re-tune or re-train NNUE/Texel weights after the rule changes,
      since the training data was generated under pet-dragon's more
      constrained rules (mirrored, opposite-color bishops only) — the
      network has never seen a same-color-bishop position. Not blocking
      initial functionality; classical eval (with the new bishop rule)
      works immediately, NNUE retraining is a later self-play project.
- [ ] Revisit whether pet-dragon's other design decisions (e.g., D6/D7
      king-safety-without-castling-bias, given ~74% of pet-dragon games
      have no castling) still hold at Rogue Dragon's different castling
      probability, once the independence-from-mirroring fix changes the
      actual castling-rate statistics. Worth measuring, not assuming.
