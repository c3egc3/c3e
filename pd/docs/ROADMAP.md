''# ROADMAP.md
# Pet Dragon — Development Roadmap

## How to Read This File
- [x] = complete and green (tests passing)
- [~] = in progress
- [ ] = not started
- ⚠️ = has a known issue or special note

---

## Phase 0 — GitHub Repository ✅
- [x] Repository created at https://github.com/g-c-3/pet-dragon
- [x] LICENSE (GPL v3)
- [x] README.md
- [x] .github/workflows/build.yml — auto-build + release binaries
- [x] .github/workflows/deploy.yml — auto-deploy to GitHub Pages

---

## Phase 1 — Project Scaffold & Core Types ✅
- [x] Cargo.toml
- [x] src/lib.rs
- [x] src/main.rs (placeholder UCI loop)
- [x] src/types.rs — Square, File, Rank, Color, PieceKind, Piece,
      Move, MoveKind, CastlingRights, PawnStartMap

---

## Phase 2 — Bitboard Foundation ✅
- [x] src/bitboard/mod.rs — Bitboard type, all ops, iterator
- [x] src/bitboard/masks.rs — Attack tables, PAWN_DOUBLE_PUSH_MASK, init_masks()
- [x] src/bitboard/magic.rs — Magic bitboards, init_magic()
- [x] 56 tests passing including Pet Dragon double-push tests

---

## Phase 3 — Position & Pet Dragon Generator ✅
- [x] src/position/mod.rs — Position struct, check detection, repetition
- [x] src/position/fen.rs — FEN parser + generator with 7th field extension
- [x] src/position/zobrist.rs — Zobrist hash including PAWN_START_KEYS, init_zobrist()
- [x] src/position/setup.rs — Pet Dragon generator, validate_pet_dragon_setup()
- [x] src/position/make_move.rs — Full make/unmake, make/unmake_with_history()
- [x] tests/setup.rs — 1000 position validation passing

---

## Phase 4 — Move Generation ✅
- [x] src/movegen/mod.rs — MoveList, generate_moves(), generate_captures()
- [x] src/movegen/pieces.rs — All standard piece moves
- [x] src/movegen/pawns.rs — Pet Dragon custom pawn logic (rank 1 double-step)
- [x] src/movegen/castling.rs — Dynamic castling from setup rights
- [x] src/movegen/legal.rs — Legal move filter, apply_move_for_legality_pub()
- [x] tests/perft.rs — Perft depth 5 = 4,865,609 ✅ PROVEN CORRECT

---

## Phase 5 — Make/Unmake + Repetition ✅
- [x] 5.1 — position.make_move() incremental state update
- [x] 5.2 — position.unmake_move() perfect restoration
- [x] 5.3 — 10,000 random make/unmake sequences verified
- [x] 5.4 — Repetition detection with game history stack
      is_repetition() / is_threefold_repetition()
      make_move_with_history() / unmake_move_with_history()
- [x] tests/make_unmake.rs — perft depth 5 via make/unmake = 4,865,609 ✅

---

## Phase 6 — Transposition Table ✅
- [x] src/tt/mod.rs — TTEntry, Bound enum, TranspositionTable
      store(), probe(), probe_move()
      score_to_tt() / score_from_tt() mate score adjustment
      new_search() age increment, fill_permille() stats

---

## Phase 7 — Search Engine ✅
- [x] 7.1 — src/search/mod.rs — SearchInfo, SearchResult, constants
- [x] 7.2 — src/search/time.rs — TimeControl, allocate_time(), TimeManager
- [x] 7.3 — src/search/see.rs — SEE (see() bool + see_value_of() i32)
- [x] 7.4 — src/search/ordering.rs — Full move ordering, ScoredMove pub
- [x] 7.5 — src/search/alpha_beta.rs — Alpha-beta + PVS + quiescence
- [x] 7.6 — src/search/iterative.rs — Iterative deepening + aspiration windows
- [x] 7.7 — src/search/pruning.rs — Extensions, LMR, probcut, correction history
- [x] 239 tests passing, Build #86 green

---

## Phase 8 — Handcrafted Evaluation (HCE) ✅ COMPLETE (296 tests passing)
- [x] 8.1 — src/eval/material.rs — Tapered material values (Ethereal weights)
            s(mg,eg) packed score, taper(), game_phase()
- [x] 8.2 — src/eval/mod.rs — Module declarations (stub)
- [x] 8.3 — src/eval/tables.rs — Piece-square tables (PST) MG+EG
- [x] 8.4 — src/eval/mobility.rs — Mobility bonus per piece type
- [x] 8.5 — src/eval/pawns.rs — Pawn structure evaluation
            ⚠️ Rank 1 pawns NOT penalised as backward (Pet Dragon rule applied)
- [x] 8.6 — src/eval/king_safety.rs — King safety (no castling bonus, D7)
- [x] 8.7 — src/eval/open_lines.rs — Open file/diagonal, batteries, 7th rank
- [x] 8.8 — src/eval/mod.rs FINAL — Full evaluate() combining all terms
- [x] 8.9 — Wire evaluate() into src/search/alpha_beta.rs
- [x] 8.10 — src/material.rs duplicate — orphan file, not declared in lib.rs,
             compiler ignores it. Leave in place (can't delete via web UI).
- [x] 8.11 — Bug fix: PST White indexing reversed in tables.rs
             (7-rank)*8+file for White; sq.index() for Black.
             296 tests passing. Phase 8 complete. ✅

---

## Phase 9 — UCI Protocol ✅
- [x] 9.1 — Full UCI command loop in src/main.rs
            uci, isready, ucinewgame, position, go, stop, quit
- [x] 9.2 — position command: parse startpos / fen + moves
- [x] 9.3 — go command: parse wtime/btime/winc/binc/movestogo/movetime/depth
- [x] 9.4 — UCI options: Hash (TT size), Threads (future SMP)
- [x] 9.5 — bestmove output after search completes
- [x] 9.6 — info strings during search (already formatted in SearchResult)

---

## Phase 10 — GitHub Actions Release Pipeline ✅
- [x] 10.1 — Build release binaries for Windows/macOS/Linux in build.yml
- [x] 10.2 — GitHub Releases page with download links
- [SKIPPED] 10.3 — Verify binaries work with Arena, BanksiaGUI, CuteChess.
             Decided permanently blocked (Session 49) — these are desktop
             GUI apps, Gokul is mobile-only (D-series core rule). No path
             to doing this without a desktop machine becoming available.
             Not revisiting unless that constraint changes.

---

## Phase 11 — WebAssembly Build ✅
- [x] 11.1 — wasm-pack build --target web --release
- [x] 11.2 — wasm-bindgen exports: engine_name(), engine_version(), new_game(), search_from_fen(), legal_moves_from_fen()
- [x] 11.3 — WASM feature flag gates all browser-specific code
- [x] 11.4 — getrandom/js feature for Pet Dragon position generation in browser

---

## Phase 12 — Browser Game ✅
- [x] 12.1 — web/index.html — chessboard UI (vanilla JS, no frameworks)
- [x] 12.2 — Pet Dragon engine is the opponent (search_from_fen WASM export)
- [x] 12.3 — Pet Dragon position display (rank 1/2 pieces shown correctly)
- [x] 12.4 — Game controls: new game, undo, flip board, side select, think time
## Phase 12 — Browser Game ✅
## Phase 12 — Browser Game ✅
- [x] 12.5 — Deploy via GitHub Pages (deploy.yml fixed mkdir ordering bug)
- [x] 12.6 — Bug fix: engine never moved in browser ("Engine thinking..."
             hung forever). Root cause: std::time::Instant::now() panics on
             wasm32-unknown-unknown (no clock source); SearchInfo::new()
             called it immediately on every search, silently trapping the
             WASM module (no panic hook was wired up to report it). Fixed
             via web-time crate (drop-in Instant replacement, wasm-safe) +
             wired up console_error_panic_hook for future visibility.

---

## Phase 13 — Search Improvements ✅ COMPLETE
- [x] 13.1 — Wire Probcut into alpha_beta.rs (defined in pruning.rs)
- [x] 13.2 — Wire CorrectionHistory into eval (defined in pruning.rs)
- [x] 13.3 — Singular extensions (Build #136 green)
- [x] 13.4 — Lazy SMP (multi-threaded parallel search)
- [x] 13.5 — Improve quiescence search: in-check evasions + checkmate detection + per-capture delta pruning + quiet checks at qs_depth=0
- [x] 13.6 — History gravity and continuation history
            cont_hist[prev_to][piece_idx][to] added to SearchInfo (Box, 192KB heap)
            Used in score_move() for quiet moves; updated in update_ordering_on_cutoff()
            Gravity formula matches regular history; zeroed each search
- [x] 13.7 — Node count benchmarking vs known engines
            tests/node_count.rs: 5 #[ignore] fixed-depth benchmarks (depth 8–11)
            build.yml bench job: cargo test --profile bench-tests node_count -- --ignored --nocapture
            Cargo.toml: [profile.bench-tests] inherits release, panic=unwind, lto=false
            Bug fixed: panic=abort in [profile.release] silently killed test binary (exit 101)
            Positions: startpos/d10, kiwipete/d9, endgame/d11, tactical/d9, rank-1/d8
            Baselines: fill in ??? slots from bench job Actions log after next run

---

## Phase 14 — Texel Tuning ✅ COMPLETE

- [x] 14.1 — DECIDED (Session 49): proceed. Phase 13 is complete and Phase
            17.5's NNUE work is parked at NNUEWeight=0% (D34) — HCE is the
            actual shipped evaluation right now, so tuning it directly
            improves real playing strength, unlike further NNUE work. Per
            D19/D20: GitHub Actions is the default execution path (NOT
            Colab — that was rejected in D19 before this ROADMAP note was
            last updated), Kaggle only as fallback if Actions' 6-hour job
            ceiling becomes a real constraint.
- [x] 14.2 — COMPLETE. All 4 batches run + uploaded (smoke test + 3
            production batches, seeds 1000/2000/3000): 147,867 total
            samples. Result distribution: 62,841 losses / 5,332 draws /
            79,694 wins (stm-perspective) — win/loss imbalance is expected
            (not a bug, see Session 52 chat), draw rarity (~3.6%) reflects
            shallow 100ms searches, also expected. Data validated and ready.
- [x] 14.3/14.4/14.5 — Phase 14 COMPLETE. All of D35's plan built, verified,
            and applied. Steps 1-5 (Sessions 53-54): TexelFeatures,
            TunableWeights, predict()/predict_f64(), Adam optimizer +
            weight decay. Step 5.5 (Session 55, added after first two real
            runs came back with implausible values): src/bin/texel_diag.rs
            sanity-check tool, comparing default-vs-tuned HCE on unambiguous
            positions — now part of the standard workflow for any future
            re-tuning round. Step 6 (Session 56): applied the
            weight_decay=0.08, 100-epoch, 147,283-sample tuned weights to
            eval/material.rs, tables.rs, mobility.rs, pawns.rs,
            king_safety.rs, open_lines.rs, mod.rs (TEMPO) AND synced
            src/texel/weights.rs's TunableWeights::default() to match (this
            second sync is mandatory — it's the tuner's starting point for
            next time, and skipping it silently breaks the Session 53
            self-consistency tests, caught this session by cargo test).
            Full suite 329/329, texel_diag PASS on all 10 cases,
            eval_diag.rs and mobility/pawns/king_safety/open_lines/tables
            unit tests re-verified by hand against the new values (all
            structural — symmetry, array lengths, index math — none
            depend on exact constant values, so none were at risk, but
            worth the explicit check before committing).
            Session 53: TexelFeatures/TunableWeights/predict() +
            self-consistency test (bit-exact vs evaluate()).
            Session 54: step 5 — src/texel/weights_f64.rs (f64 weight
            vector, flatten/unflatten), src/texel/predict_f64.rs (f64
            forward pass + fused gradient accumulation, king-safety clamp
            gets zero gradient per D35), src/bin/texel_tune.rs (K line
            search + Adam gradient descent over the flattened parameter
            vector, writes tuned weights in ready-to-paste s(mg,eg)
            syntax), .github/workflows/texel_tune.yml (mirrors
            train_nnue.yml's run_id/paths/urls three-source pattern).
            Verified end-to-end on a real 559-sample dataset (40 games,
            self-generated via texel_gen this session, NOT the 14.2
            production data): K line search found 2.589, loss fell every
            epoch (0.0426 -> 0.0170 over 8 epochs), output file parses
            back into weights.rs's own literal format cleanly. Full suite
            329/329 (322 + 3 Session 53 + 4 Session 54).
            NEXT SESSION START POINT: run texel_tune.yml FOR REAL against
            the actual 14.2 production database (147,867 samples across
            the smoke-test + 3 seed-1000/2000/3000 batches — find their
            GitHub Release asset URLs or Run IDs and wire them into
            data_run_id/data_paths/data_urls). Start with a short run
            (~10-20 epochs) to sanity-check loss trends on the real data
            before committing to a long run. Once satisfied: step 6 —
            read texel_weights_tuned.txt's output, sanity-check the
            tuned numbers aren't wild outliers (a diagnostic like
            eval_diag.rs's start-pos/material-swing checks, run through
            the tuned weights before touching eval/*.rs, is worth building
            here — no such check exists yet for HCE specifically), then
            write the eval/*.rs delta (material.rs, tables.rs,
            mobility.rs, pawns.rs, king_safety.rs, open_lines.rs, mod.rs's
            TEMPO) replacing the current hand-picked Ethereal-derived
            constants with the tuned ones. Build.yml must stay green.
            [STALE NOTE, superseded Session 56] The above "next session
            start point" text was left over from Session 54 and never
            removed once the work described in it was actually done in
            Sessions 55-56. Real status: DONE. Tuned weights are applied
            and committed (Session 55), texel_diag.rs sanity tool exists
            and passed 10/10, full suite 329/329, and 3 match_runner.yml
            runs (17.7, Session 56) confirm the tuned build is strong in
            absolute terms. No true pre/post-tuning Elo delta exists or
            is queued — see 17.7's caveat.

---

## Phase 15 — Syzygy Tablebases ✅
- [x] 15.1 — pyrrhic-rs v0.2.0 (crates.io). PetDragonAdapter implements
             EngineAdapter via our precomputed bitboard attack tables.
             SyzygyProber wraps TableBases<PetDragonAdapter> with Position helpers.
             TB_WIN_SCORE = 10_000 (above max HCE, below mate threshold 900_000).
             Gate: [target.'cfg(not(target_arch = "wasm32"))'.dependencies].
             WASM builds unaffected — libc excluded on wasm32.
- [x] 15.2 — UCI SyzygyPath string option (cmd_uci). setoption handler in
             main.rs: init SyzygyProber on non-empty path, print info string
             with max_pieces. Disable and log on empty path or bad path.
- [x] 15.3 — WDL probe at ALL interior nodes in alpha_beta_with_excluded(),
             after draw checks, before TT probe.
             Condition: piece_count ≤ tb.max_pieces() && halfmove_clock == 0.
- [x] 15.4 — WDL scores: Win=+10000, CursedWin=+1, Draw=0,
             BlessedLoss=-1, Loss=-10000 cp. Score stored in TT for efficiency.
- [x] 15.5 — DTZ root probe in cmd_go() BEFORE spawning helper threads (not
             thread-safe — must run serially). On DTZ success: print bestmove
             and return early, no search spawned. syzygy_for_threads Arc cloned
             into main + N-1 helper SearchInfos for WDL during search.

---

## Phase 16 — NORU NNUE (Optional Enhancement) ⏳
- [x] 16.1 — Added noru = "2.2" to Cargo.toml (ordinary [dependencies],
            confirmed WASM-safe by upstream, no wasm32 exclusion needed
            unlike pyrrhic-rs).
- [x] 16.2 — src/nnue/features.rs: 896-input feature set defined.
            768 piece-square (kind*128 + relative_color*64 + relative_sq)
            + 128 pawn-start (768 + relative_color*64 + relative_sq).
            Perspective flip via Square::mirror_rank() for Black.
            9 tests: range checks, own/opponent distinction, symmetric
            start-pos parity, pawn-start presence/absence (D11), 1000-seed
            no-panic sweep.
- [x] 16.3 — src/nnue/delta.rs: compute_move_changes() mirrors every
            make_move() match arm (quiet/capture/en passant/castle/promo)
            to produce board-space add/remove events without a full 64-sq
            rescan. render_for_perspective() turns those into NORU-ready
            (added, removed) index lists. Verified equivalent to full
            extract_features() re-extraction across a 300-seed x 6-move x
            2-perspective sweep. Accumulator not yet wired into Position/
            search — that's 16.6, once a trained network exists.
- [x] 16.4a — src/bin/selfplay.rs: self-play data generator (see Session 22).
             .github/workflows/selfplay.yml: workflow_dispatch job, inputs
             for num_games/seed_start, builds + runs the binary, uploads
             selfplay_data.txt as a build artifact. Triggered manually from
             the Actions tab — mobile-friendly, no terminal needed.
             (Gokul is mobile-only, can't `cargo run` locally).
- [x] 16.4b — src/bin/lichess_sample.rs + .github/workflows/lichess_sample.yml
             CONFIRMED WORKING AT FULL SCALE (Session 27: 500/500 test run,
             then 50000/50000 full run, 0 parse failures both times.
             Full run: 9,999,801 lines read, lichess_sample.txt = 9.6M,
             50000 rows). PHASE 16.4b COMPLETE.
- [x] 16.4c — Pawn start feature convergence design: CONFIRMED already
             implemented in Phase 16.2's features.rs, not a separate task.
             pawn_start_feature_index() + extract_features() enforce D11's
             rule exactly (feature drops the instant pawn_starts.started_here()
             is false). test_pawn_start_feature_drops_once_record_cleared()
             covers it directly. No code changes made — verification only
             (Session 38).
- [x] 16.5a — train_nnue.rs first run succeeded; added best-val-checkpoint
             tracking (session 30).
- [x] 16.5b — Kaggle 3000-game self-play run (~93 actual games after queue
             delay, 433,080 rows) hosted as a GitHub Release asset (25MB
             repo-upload UI can't hold 66MB — see D22), pulled via
             train_nnue.yml's new selfplay_urls input. Combined with 50k
             Lichess rows = 483,080 total training rows.
             RESULT: best epoch 8/10, val_loss=0.53776, train/val curves
             both monotonic and near-plateaued (vs. first run's clear
             epoch-3 overfit). PHASE 16.5 COMPLETE.
             Trained network artifact: nnue-pet-dragon-h32-a256-e10
             (nnue_pet_dragon_quantized.bin, 481K).
- [x] 16.6 — Integrate trained network into eval: BLEND chosen (D23), not
             replace. src/nnue/inference.rs loads embedded quantized weights
             via include_bytes!, runs Accumulator::refresh() +
             noru::network::forward(), converts raw i32 to centipawns via
             OUTPUT_SCALE(16)/400 (D14 inverse) — verified correct against
             the real weights file, no scale adjustment needed.
             eval::evaluate_blended() (25% NNUE weight, D23) wired into
             search via the alpha_beta::evaluate() delegation point;
             pure-HCE evaluate() untouched. CI green, 320/320 tests passing.
             Also fixed a pre-existing bug this exposed: info.time_allocated_ms
             was never wired to the real TimeManager hard limit in
             iterative_deepening(), so is_time_up()'s in-search abort was
             dead code for every real search (D24). NNUE's heavier per-node
             cost surfaced it via test_iterative_deepening_respects_time.
- [x] 16.7 — WASM-compatible inference. CONFIRMED (Session 47) — Gokul
             visited https://g-c-3.github.io/pet-dragon, engine replies with
             a move cleanly. Also note: Gokul directly edited web/index.html
             on main ("more dynamic") outside the normal delta workflow —
             confirmed still working live, synced into context (1521 lines
             as of Session 47). Future sessions: treat web/index.html as
             current/live, not stale, and re-fetch before any delta against
             it since it wasn't authored/reviewed by Claude.

---

## Housekeeping ⚠️
- [x] `.github/workflows/*.yml` — Node.js 20 deprecation, PARTIALLY resolved
      (Session 47). Bumped across all 7 workflow files: actions/checkout
      v4→v6, actions/upload-artifact v4→v6, actions/download-artifact
      v4→v7 (all confirmed Node24-native as of this session). Left
      unchanged, no upstream fix available yet as of Session 47:
      actions/configure-pages@v4, actions/upload-pages-artifact@v3,
      actions/deploy-pages@v4 (deploy.yml — GitHub hasn't shipped a Node24
      major yet), softprops/action-gh-release@v2 (build.yml's release job —
      confirmed no Node24-compatible release exists upstream; consider
      replacing with a direct `gh release` CLI step in a future session if
      the warning becomes blocking rather than cosmetic).
      Swatinem/rust-cache@v2 needed no change — it's a floating major tag
      that already picked up Node24 support upstream (v2.9.0).

---


## Phase 17 — Elo A/B Testing & NNUE Retraining ⏳ (17.5 core infra question still open, see note below)
- [x] 17.1 — NNUE blend weight made runtime-configurable via UCI
             `NNUEWeight` option (spin, 0-100, default 25 = D23). Replaces
             the compile-time `NNUE_BLEND_WEIGHT` const. weight=0 skips the
             NNUE forward pass entirely (pure-HCE arm pays zero NNUE cost).
- [x] 17.2 — src/bin/match_runner.rs (auto-discovered by Cargo, no Cargo.toml
             change). Plays N games between Engine A/B (different NNUEWeight
             configs), alternating colors each game to cancel first-move
             advantage. Separate TT per color-per-game (never shared between
             differently-weighted evaluators — a frozen TT score is only
             valid for the evaluator that produced it). Reports W/L/D +
             standard logistic Elo diff from Engine A's perspective.
- [x] 17.3 — .github/workflows/match_runner.yml — workflow_dispatch inputs
             for num_games/weight_a/weight_b/movetime_ms/seed_start, uploads
             match_results.txt as a build artifact. Mirrors selfplay.yml's
             convention exactly.
- [x] 17.4 — Ran 0% vs 25%, 20 games/100ms/move: A (0%) scored 87.5%,
             +338 Elo. Default weight dropped to 0% (D25). NNUE blend
             mechanism stays available as a UCI option for future retests.
- [~] 17.5 — SUPERSEDED, not literally completed as originally scoped.
            The sub-items 17.5a-17.5f (all [x] below) fully executed the
            NNUE side of this investigation and 17.6 formally parked it
            (D34). The one piece of the original 17.5 ask that was never
            built — a genuine pre/post-Texel-tuning HCE Elo number — is
            still open, restated in 17.7's caveat below. Left as [~]
            rather than [x] so this gap isn't silently lost; it needs a
            DECISIONS.md entry and explicit approval before any
            infrastructure (runtime-loadable HCE weights, or a second
            pinned-ref binary) gets built for it.
            Original Session 56 (post Phase-14 Texel tuning) note: discovered
             match_runner.rs can only A/B two NNUE blend weights of the
             SAME compiled binary — it CANNOT measure true before/after
             Elo for a Texel-tuning round, since HCE weights are
             compile-time consts in eval/*.rs, not runtime-swappable, and
             the pre-tuning Ethereal-derived values are gone once a tuning
             delta lands. Recommended immediate substitute: weight_a=0
             (tuned HCE) vs weight_b=100 (pure NNUE) — new, useful signal,
             zero new code, but NOT a real "did tuning help" measurement.
             If a genuine pre/post-tuning Elo number is ever wanted, it
             needs deliberate design (likely: runtime-loadable HCE weight
             tables, or a second binary built from a pinned pre-tuning git
             ref playing over UCI) — worth a DECISIONS.md entry before
             building, given the added runtime complexity trade-off for a
             one-time measurement. Not started.
- [x] 17.5a — D26 sweep complete (Session 39). A=0% vs B={5,10,15,20}%,
            40 games each, seed_start=0. ALL four net-negative for B:
              5%:  A 65.0% (+107.5 Elo)
              10%: A 75.0% (+190.8 Elo)
              15%: A 70.0% (+147.2 Elo)
              20%: A 80.0% (+240.8 Elo)
            No safe low weight exists — even 5% is decisively bad, not
            noise. Conclusion (D27): the network itself is the bottleneck,
            not the blend ratio. Retraining is required before any nonzero
            weight is viable again.
- [x] 17.5b — Retrain with more self-play data. COMPLETE (Session 42).
            286,659 total rows (236,659 self-play across 4 Kaggle batches,
            750 games each seeds 100/200/300/900, + 50,000 lichess).
            Result: val_loss 0.53776 → 0.51661 (best epoch 5/10, was epoch
            8/10 before). Real improvement, not noise — though train/val
            divergence after epoch 5 shows the small-dataset overfit
            pattern persists, just with a better floor. Artifact
            nnue-pet-dragon-h32-a256-e10 (run 28865459160, artifact ID
            8137571554) uploaded successfully.
- [x] 17.5c — Embed + re-sweep COMPLETE (Session 43). Result is the
            OPPOSITE of hoped for — every weight got worse, not better:
              5%:  A 67.5% (+127.0), was 65.0% (+107.5)
              10%: A 80.0% (+240.8), was 75.0% (+190.8)
              15%: A 78.8% (+227.6), was 70.0% (+147.2)
              20%: A 90.0% (+381.7), was 80.0% (+240.8)
            val_loss improved (0.53776 -> 0.51661) but game strength at
            every blend point got monotonically worse. D29: pausing the
            "more data" lever — tried twice now with the same
            better-loss/worse-Elo pattern both times. NNUEWeight stays 0%.
- [x] 17.5d — Direct calibration diagnostic COMPLETE. eval_diag.rs +
            eval_diag.yml built (Session 44), then CORRECTED (Session 45,
            D32) after Gokul caught that the original test cases used a
            classic-chess-layout FEN — astronomically rare under Pet
            Dragon's real random rank-1/2 generator (setup.rs), so it was
            testing an out-of-distribution input. Rewritten to use
            Position::generate_with_seed(N), the same generator selfplay.rs/
            match_runner.rs actually use, giving a trustworthy in-distribution
            read for the first time.
- [x] 17.5e — Root cause found (D30, Session 44): unregularized BCE weight
            blowup, not feature design. Confirmed via corrected eval_diag:
            even real in-distribution positions (seed=2, seed=3) were fully
            saturating at whatever clamp ceiling was in place. Fix: added
            NNUE_EVAL_CLAMP_CP=1500 in inference.rs (safety net) — measured
            Elo improvement at 10%/20% weight even with 0.0001 weight_decay
            (too weak to fix the root cause but clamp alone helped).
- [x] 17.5f — Real regularization (D33, Session 46): weight_decay raised to
            0.01 (1e-4 confirmed insufficient — seed=2/3 still saturated
            at the clamp with it), plus global-norm gradient clipping
            (grad_clip_norm=1.0) added as a second, more direct mechanism.
            Result: val_loss held steady (0.51636, matching/slightly
            beating the unregularized retrain) WHILE calibration improved
            substantially (seed=2: 1500→375, seed=3: 1500→50, K+P: 1225→225
            — see eval_diag.rs output). Confirms regularization fixed the
            calibration problem without trading away fit quality.
- [x] 17.6 — PHASE 17.5 PARKED (D34, Session 46). Final re-sweep against
            the clamped+regularized network: avg opponent score 70.3% (5%:
            66.2%, 10%: 68.8%, 15%: 66.2%, 20%: 80.0%) — statistically
            indistinguishable from clamp-only's 70.0% average. Despite real,
            measured calibration improvement (eval_diag), Elo impact hasn't
            moved beyond the ~70-72% band across 4 independent attempts
            (original network, 3x-data retrain, clamp, clamp+regularization).
            That consistency across otherwise-different fixes points at
            hidden_size=32 being too small to learn anything HCE's hand-
            crafted eval doesn't already capture — a structural ceiling, not
            a magnitude/calibration bug. NNUEWeight stays 0% (default,
            unchanged since D25). Parking further NNUE tuning at this scale;
            revisit only with a meaningfully bigger hidden_size (128+,
            bigger Kaggle job) as a deliberate separate effort, not
            incremental tuning. Everything built in 17.5a-f stays permanent:
            the clamp is a safety net worth keeping regardless of weight,
            weight_decay/grad_clip_norm are now correct defaults for any
            future NNUE training, eval_diag.rs is a reusable diagnostic tool.
- [x] 17.7 — Session 56: 3 match_runner.yml runs, post Phase-14 Texel
            tuning, using the EXISTING tool (see note below on its real
            limitation). All 3 confirm tuned-HCE (0%) beats every NNUE
            config decisively, same direction as 17.4/17.6, and by a
            comparable-or-larger margin:
              0% vs 25%,  40 games: A 78.8% (+227.6 Elo)
              0% vs 100%, 20 games: A 95.0% (+511.5 Elo)
              0% vs 100%, 40 games: A 97.5% (+636.4 Elo) — agrees with the
                                    20-game run in the same matchup, and
                                    got MORE lopsided at 2x the sample
                                    size, a good sign it's a real effect
                                    not small-sample noise.
            IMPORTANT CAVEAT (discovered this session): match_runner.rs
            can only A/B two NNUE blend weights of the SAME compiled
            binary — it cannot produce a true pre/post-tuning HCE Elo
            number, since HCE weights are compile-time consts and the
            pre-tuning Ethereal-derived values are gone once the tuning
            delta landed (Session 55). These 3 results confirm tuned-HCE
            is strong in absolute terms against NNUE at any blend weight
            (reinforcing D25's 0%-default decision with fresh data), NOT
            "tuning improved HCE by X Elo" — that number doesn't exist
            and would need new infrastructure to ever measure (see note
            left in this file previously — runtime-loadable HCE weights,
            or a second binary from a pinned pre-tuning git ref over UCI
            — worth a DECISIONS.md entry before building, not a quick add).
- [x] 17.8 — D36 (Session 57-60): built and validated the pinned-ref UCI
            match infra flagged in 17.7's caveat. Files:
            `src/bin/uci_match_runner.rs`, `.github/workflows/uci_match_runner.yml`.
            Verified trustworthy (Session 59): diffed every file — not just
            eval — between `pre_tuning_ref=c9905a22ed018c6c8332bef275aff548a1d0de70`
            and `main`; only the 7 expected eval-tuning files differ, both
            binaries default to 0% NNUE blend identically.
            FINAL RESULT — pooled across 7 runs, 520 games total (5 small
            runs of 20-40 games each, then 2 large 200-game confirmatory
            runs; 100ms/move throughout): pre-tuning (A) 225 wins,
            post-tuning (B, current `main`) 283 wins, 12 draws. A score
            44.4% → aggregate Elo diff ≈ −38.9 (A vs B), i.e. Texel-tuned
            HCE is ~39 Elo STRONGER than the original Ethereal-derived
            hand-picked values, pooled. The two 200-game runs alone landed
            at −41.9 each, essentially identical to each other — tight,
            consistent, well-powered. RUN 1's early +147.2 outlier
            (single seed, 20 games) is now clearly explained as small-
            sample noise, not signal. No tuner bug, no revert — Phase 14's
            tuning is working. This is the pre/post-Texel-tuning Elo
            number 17.5/17.7 flagged as missing — closed for real.

---

## Phase 18 — UCI Protocol Completeness (Pondering) ✅ COMPLETE
- [x] 18.1 — D37 (Session 62): found and closed a real UCI-compatibility
            gap during a general "what's missing besides NNUE" review, not
            from a failing test. `search/time.rs`'s `allocate_time()`
            already special-cased `tc.ponder` to search near-infinitely
            (that half was already correct, pre-existing) — but
            `ponderhit` wasn't handled anywhere in `main.rs`'s command
            dispatch at all. A real pondering-capable GUI would get an
            unrequested `bestmove` mid-ponder instead of the engine
            switching to a real, clock-bounded search on `ponderhit`.
            Fix: two new `Arc<AtomicU64>` fields on `SearchInfo`
            (`ponder_hit_soft_ms`/`ponder_hit_hard_ms`, threaded the same
            way `stop_flag` already is, D4-style) let `cmd_ponderhit`
            (main thread) hand the running search thread a real deadline
            — expressed relative to the search's own `start_time` (not
            reset to zero; pondering time is free per spec, and
            `start_time` is owned by the search thread so it can't safely
            be reset from another thread — see D37 for the full mechanism
            and the rejected start_time-reset alternative).
            Files changed: `src/main.rs`, `src/search/mod.rs`,
            `src/search/iterative.rs`.
            Verified: `cargo check --release` clean; full suite green,
            335 lib + 22 bin tests (up from 329/17 — 12 new, 0 regressed,
            0 pre-existing tests touched); manual end-to-end UCI runs
            against the real compiled binary — pondered 500ms then
            `ponderhit` correctly bounded the search to ~2.2s (matching
            the 60s-clock-implied soft limit) instead of running forever;
            plain `go movetime` and `go ponder` + `stop` (ponder miss)
            both unaffected.
            Caught and fixed a bug in the FIRST version of the
            integration test during this same session, before it shipped
            — see D37's verification section for what happened and why.
- [x] 18.2 — Self-containment audit (same session, same review): confirmed
            NNUE weights are embedded via `include_bytes!` (no external
            model file needed at runtime); the only optional external-file
            dependency is `SyzygyPath` for tablebases, which is standard/
            expected for any UCI engine with tablebase support. No other
            runtime dependency gaps found. No code changes needed — this
            was a verification pass, not a build task.

---

## Phase 19 — Analysis GUI UCI Options (MultiPV, Move Overhead) ✅ COMPLETE
- [x] 19.1 — D38 (Session 63): MultiPV — report N candidate lines instead
            of 1. Standard root-move-exclusion technique: search the
            primary line normally (fully unmodified code path), then
            re-search from the root excluding already-found moves once per
            extra line, same depth, full window (no per-line aspiration
            state — simpler, and MultiPV usage already accepts being
            slower than single-PV as the cost of extra lines). New
            `SearchInfo` fields: `multipv: usize` (default 1),
            `root_exclude: Vec<Move>`. The root-only exclusion check in
            `alpha_beta.rs`'s move loop shares space with singular
            extension's differently-scoped `excluded: Move` parameter
            without colliding — singular verification is gated `!root_node`,
            MultiPV's check is gated `root_node`, confirmed by reading the
            existing guard before writing the new one.
            Entirely additive: gated behind `multipv > 1`, false for every
            existing caller by default, so nothing about the single-PV
            path changed — not even reformatted.
            Files changed: `src/search/mod.rs`, `src/search/alpha_beta.rs`,
            `src/search/iterative.rs`, `src/main.rs`.
            A test caught a real (if expected) surprise: MultiPV>1 runs
            can pick a *different* primary-line move than MultiPV=1 at the
            same depth, because extra lines searched at earlier depths
            feed the same shared TT/history tables the primary line then
            reads. Not a bug — matches Stockfish's own documented caveat —
            but the first version of the test wrongly asserted move
            identity; fixed to assert what's actually guaranteed (legality).
            Full writeup: D38.
- [x] 19.2 — D38 (same session): Move Overhead — `search/time.rs`'s
            `OVERHEAD_MS` was a hardcoded constant; now
            `TimeControl::overhead_ms`, runtime-configurable via
            `setoption name Move Overhead`, defaulting to the same value.
            Files changed: `src/search/time.rs`, `src/main.rs`.
            Caught and fixed a real pre-existing bug in `cmd_setoption`
            while touching it for this: the old parser assumed single-word
            option names and values (`tokens[2]`/`tokens[4]` at fixed
            positions), which silently mis-parsed "Move Overhead" itself
            (two words) and would have truncated any multi-word value
            (e.g. a spaced Windows SyzygyPath) to its first token. Rewrote
            to find the `"value"` token and join everything on each side —
            backward-compatible with every existing single-word case.
            Verified: `cargo check --release` clean; full suite green,
            345 lib (was 335) + 30 bin (was 22) = 375 total, 18 new, 0
            regressed; manual end-to-end UCI runs against the real
            compiled binary confirmed both features working (sorted
            distinct-move MultiPV lines matching `bestmove`; default
            behavior unchanged; Move Overhead 2000 on movetime 3000
            correctly finished in ~1s not ~3s).

---

## Phase 20 — Difficulty / Skill Levels ⏳ SCOPED, NOT STARTED
- [ ] 20.1 — D39 (Session 64, scoping discussion only — no code this
            session): build depth-cap difficulty tiers (`Skill Level
            0..N` or similar), optionally with a little move-selection
            noise at the low end matching Stockfish's actual `Skill
            Level` mechanism (weighted randomness among top candidates,
            not just a lower depth cap) rather than inventing something
            new. Explicitly NOT `UCI_Elo`-style — no calibrated
            human-comparable number attached to any tier, for the same
            reason noted throughout this project: no external rating pool
            exists for this variant.
            Considered and rejected: borrowing standard-chess Elo
            calibration tables for the one Pet Dragon opening that visually
            resembles the standard starting array. Doesn't work even for
            that one opening — Pet Dragon's custom pawn rules apply from
            move one, so a visually standard start doesn't mean the game
            plays like real chess from there on; external Elo tables were
            built against real chess rules and don't transfer. Full
            reasoning: D39.
            Validation plan when built: same methodology as D36 — use the
            existing `uci_match_runner.rs` harness across many seeded
            positions to empirically confirm tiers are correctly ordered
            and reasonably spaced (tier K vs K+1 should win convincingly
            and consistently). No new measurement infrastructure needed,
            reuses what already exists.
- [ ] 20.2 — Session 65 refinement (still scoping, no code): depth cap
            alone has a real rough edge — it doesn't touch time at all, so
            a low tier would still use whatever time the GUI/clock gives
            it, just to search shallower. Concretely: `go movetime 5000`
            at a tier capped to depth 6 could finish in ~50ms and sit idle
            for the rest — a "beginner" bot instaflying moves against a
            human who gave it 5 seconds looks broken, not weak. It also
            wastes think time that the move-selection-noise half of the
            mechanism (20.1) benefits from having — weighted-random choice
            among top candidates works better with at least some real
            search behind it, not an instant return.
            Fix: use BOTH, not depth alone — depth as the primary strength
            ceiling (that's what actually caps how well it can find
            moves), plus a tier-dependent fraction of the normal time
            budget so low tiers also visibly "try less hard," not just
            "see less far." Wiring: a `Skill Level` UCI option feeds both
            a `max_depth` override AND a time-fraction multiplier into
            `allocate_time()`'s output, before `TimeManager` sees it —
            same pattern as `Move Overhead` (D38), just tier-driven
            instead of a flat user-set value.
            NEXT SESSION START POINT: scope the exact tier count, depth
            values per tier, and time-fraction values per tier, implement
            as a `Skill Level` UCI option (spin, similar shape to
            `MultiPV`), wire into both `iterative_deepening()`'s depth cap
            and `allocate_time()`'s output, then validate tier ordering
            with `uci_match_runner.rs` across multiple seeds before
            calling any tier done.

---

## Test Coverage Summary
**Note: the per-module breakdown below is stale (predates several
sessions' worth of additions — texel_diag.rs, uci_match_runner.rs,
Phase 18's pondering tests, Phase 19's MultiPV/Move Overhead tests, etc.)
and hasn't been recomputed file-by-file. The actual current total,
confirmed by Session 63's full-suite run, is 345 lib tests + 30 bin tests
= 375, all green.** Recomputing the exact per-module split below is a
small, low-priority task for whenever it's convenient — not blocking
anything.
| Test File          | Count | Status |
|--------------------|-------|--------|
| src/types.rs       | 14    | ✅     |
| src/bitboard/      | 42    | ✅     |
| src/position/      | 60+   | ✅     |
| src/movegen/       | 40+   | ✅     |
| src/tt/            | 14    | ✅     |
| src/search/        | 40+   | ✅     |
| tests/perft.rs     | 18    | ✅     |
| tests/setup.rs     | 18    | ✅     |
| tests/make_unmake.rs | 19  | ✅     |
| **TOTAL (stale)**  | **239** | see note above |

---

## Milestone Targets
| Milestone | Target Elo | Phase |
|-----------|-----------|-------|
| Material only (current) | ~1200 | Phase 7 done |
| HCE complete | ~2400-2600 | Phase 8 done |
| Search improvements | ~2800-2900 | Phase 13 done |
| Texel tuned HCE | ~3000-3100 (relative estimate — Pet Dragon is a custom variant with no external rating pool to calibrate against, so this figure is comparative, not a calibrated absolute) | Phase 14 done, 17.8/D36 closed (Session 59-60): 520-game pooled pinned-ref UCI match (2 of those runs at 200 games each, tightly consistent) shows tuned HCE ~39 Elo stronger than pre-tuning Ethereal values. Real, well-powered, and modest — nowhere near the scale that "~3000-3100" implies on its own; treat that number as a rough historical target, not a validated one. |
| NORU NNUE | ~3400-3600 | Phase 16 done |
