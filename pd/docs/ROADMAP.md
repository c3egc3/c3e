# ROADMAP.md
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
- [ ] 10.3 — Verify binaries work with Arena, BanksiaGUI, CuteChess (manual step)

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

## Phase 13 — Search Improvements ⏳
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

## Phase 14 — Texel Tuning (Optional) ⏳
- [ ] 14.1 — OPTIONAL PHASE — skip if going straight to NNUE (Phase 16)
            Texel tuning improves HCE quality and therefore NNUE training data
            quality, but borrowed weights are sufficient for initial NNUE training.
            Decide after Phase 13 is complete.
            texel_tune.yml (GitHub Actions, per D19) — optimise HCE weights via
            gradient descent. Kaggle is the fallback only if this phase is
            revisited and Actions' time budget proves insufficient (D20).
- [ ] 14.2 — Generate Pet Dragon game database for tuning
- [ ] 14.3 — Run tuning on Google Colab (free GPU)
- [ ] 14.4 — Update weights in eval/ files with tuned values

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
- [x] 16.7 — WASM-compatible inference. Session 34 code audit: `inference.rs`
             has zero OS/filesystem calls, `OnceLock` is wasm32-safe, `noru`
             has no wasm32 exclusion in Cargo.toml, and the only WASM→NNUE
             call path (search_from_fen → evaluate_blended → evaluate_nnue)
             is clean. No code changes made or needed. BLOCKED ONLY on
             Gokul confirming in-browser at https://g-c-3.github.io/pet-dragon
             that the engine replies with a move and no console errors —
             mark [x] once confirmed.

---

## Housekeeping ⚠️
- [ ] `.github/workflows/*.yml` — GitHub Actions Node.js 20 is deprecated
      (flagged on Build & Release run #262 for commit 83b1da7). Low priority,
      not blocking; bump the actions' Node version whenever a workflow file
      is next touched for another reason.

---


## Phase 17 — Elo A/B Testing & NNUE Retraining ⏳
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
- [~] 17.5c — Embed new quantized weights (replace
            src/nnue/weights/nnue_pet_dragon_quantized.bin, compiled in via
            include_bytes! per Phase 16.6 — a real code change, build.yml
            must stay green) then re-run the D27 match_runner sweep
            (5/10/15/20% vs 0%, 40 games each, seed_start=0) against the
            NEW network to see if any nonzero weight is now net-positive or
            net-neutral. Triggered by Gokul, awaiting results.

---

## Test Coverage Summary
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
| **TOTAL**          | **239** | ✅   |

---

## Milestone Targets
| Milestone | Target Elo | Phase |
|-----------|-----------|-------|
| Material only (current) | ~1200 | Phase 7 done |
| HCE complete | ~2400-2600 | Phase 8 done |
| Search improvements | ~2800-2900 | Phase 13 done |
| Texel tuned HCE | ~3000-3100 | Phase 14 done |
| NORU NNUE | ~3400-3600 | Phase 16 done |
