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
             compiler ignores it. **DELETED (Session 72)** — Gokul confirmed
             removal via GitHub mobile UI; the "can't delete via web UI"
             blocker noted at the time this was discovered no longer applies.
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
- [x] `README.md` — stale and factually wrong (Session 72). Fixed: "Play
      against Stockfish directly in your browser" corrected to Pet
      Dragon's own engine (was never Stockfish — copy-paste leftover from
      early scaffolding, never caught before). Project Status table
      replaced — it still showed every phase as 🔄/⏳ pending despite
      Phases 0-22 being complete. Softened the flat "3000+ Elo" claim to
      match DECISIONS.md's own framing (relative internal comparison, no
      external rating pool exists for a custom variant); cited the real
      ~39 Elo Texel-tuning gain from Session 61's 520-game pinned-ref
      result instead of an unqualified target number. Added an honest
      NNUE line (implemented, disabled by default, doesn't yet beat HCE).
- [x] Release pipeline — `build.yml` only ever published one rolling
      release under the literal tag `latest`; there was no way to cut a
      real versioned release at all. Fixed (D46, Session 72): tag pushes
      matching `v*.*.*` now trigger their own frozen, "Latest"-badged
      release; ordinary `main` pushes keep updating the separate rolling
      `latest` release without stealing the badge back. Also added a
      `build-wasm` job producing `pet_dragon_bg.wasm`, `pet_dragon.js`,
      and a base64-embedded `pet_dragon_standalone.js` (needs
      `pet_dragon.js` alongside it — genuinely single-file bundling was
      considered and explicitly rejected, see D46 addendum below) as
      release assets alongside the 4 native binaries.
      **CONFIRMED (Session 73)**: first tagged release attempt `v3.0.0`
      failed silently — tag was created before the `build.yml` fix
      landed on `main`, so the old workflow (no tag trigger at all) never
      ran; Gokul had manually attached 2 files by hand, no automation
      involved. Diagnosed via GitHub API/Actions history cross-check,
      deleted, retagged as `v3.3.3` with the fixed workflow already
      confirmed live on `main` — this time the pipeline ran correctly
      end-to-end: all 7 assets (4 native + `pet_dragon_bg.wasm` +
      `pet_dragon.js` + `pet_dragon_standalone.js`) attached, "Latest"
      badge applied, generated body correct. World-release housekeeping
      fully closed.

---


## Phase 17 — Elo A/B Testing & NNUE Retraining ✅ CLOSED (parked, D34/D41 — optional enhancement, not blocking)
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
- [x] 17.9 — RE-PARKED (D41, Session 69). Tested 17.6's stated revisit
            condition: hidden_size=128 (4x capacity), same 286,659-row
            dataset as the parked hidden_size=32 baseline, everything else
            unchanged — a clean single-variable test. Result: val_loss
            0.51655 (best epoch 3/10) vs baseline's 0.51636 (epoch 4/10) —
            slightly worse, and overfit one epoch earlier (val_loss climbed
            to 0.53169 by epoch 10). More capacity did not break the
            ceiling; it just overfit the same limited signal faster. No
            match_runner sweep run — val_loss regression already rules the
            network out, and re-confirming a negative result costs Actions
            minutes for no new information (D19/D20). This is the 5th
            independent lever (after 17.6's 4) landing in the same place.
            NNUEWeight stays 0%. Phase 16/17 CLOSED as an optional,
            not-currently-worthwhile enhancement — the core engine (Phases
            0-20) is complete and Elo-validated without it. Revisit only
            alongside a genuinely larger, dedicated self-play data effort
            (500K-1M+ rows), not another architecture-size bump alone.
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

## Phase 20 — Difficulty / Skill Levels ✅ COMPLETE & VALIDATED
- [x] 20.1 — D39 (Session 64, scoping discussion only — no code this
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
            Session 66: IMPLEMENTED — see 20.3 below for what got built.
            Move-selection noise (the "optionally" above) was NOT built —
            depth cap + time fraction (20.2) covers the core requirement;
            noise is deferred, not rejected (see 20.3 notes).
- [x] 20.2 — Session 65 refinement (still scoping, no code): depth cap
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
            Session 66: IMPLEMENTED — see 20.3.
- [x] 20.3 — Session 66: implementation. Built `src/search/skill.rs` —
            21 levels (0..=20, matching the familiar `Skill Level` spin
            shape GUIs expect — option SHAPE only, no borrowed calibration
            data). `skill_depth_cap(level)`: `None` at level 20 (default,
            fully uncapped — byte-identical to pre-Phase-20 behavior),
            `level + 1` for 0..19 (so level 0 = depth 1, level 19 = depth
            20). `skill_time_fraction_pct(level)`: `100` at level 20,
            `(10 + level*5).min(98)` for 0..19 — capped strictly below
            100% so every reduced tier is distinguishable from "off."
            Wired: `iterative_deepening()`'s `max_depth` now takes
            `.min()` against the tier's depth cap (never overrides an
            EXPLICIT shallower `go depth`, only ever reduces further).
            `allocate_time()` in `time.rs` now takes a new
            `TimeControl::skill_time_fraction_pct` field and applies it to
            the movetime branch, the clock-based (movestogo/sudden-death)
            branch, and the no-clock-info default fallback — deliberately
            NOT applied to `infinite`/`ponder` (analysis, not strength) or
            the fixed-depth/fixed-nodes sentinel branches (already governed
            by the depth cap instead). `main.rs`: new `Skill Level` UCI
            spin option (default/max 20, matching `MAX_SKILL_LEVEL`),
            `setoption name Skill Level` handler (two-word name, same
            parsing path as `Move Overhead`), applied in `cmd_go` to both
            `main_info.skill_level` AND every helper thread's
            `h_info.skill_level` (helpers must respect the same cap, or
            they'd populate the shared TT with full-strength lines that
            leak back into a low-skill main search).
            NOT built this session: move-selection noise (weighted-random
            choice among top MultiPV candidates, the Stockfish-style
            mechanism 20.1 flagged as optional). Depth cap + time fraction
            alone should already produce clearly distinguishable tiers;
            noise is a plausible follow-up if match-runner validation
            shows tiers are correctly ordered but too close together in
            practice, not committed to yet.
            STILL PENDING — the actual empirical validation: this session
            could not run `uci_match_runner.rs` (no Rust toolchain in this
            environment; GitHub Actions handles all building/testing per
            project convention). All new logic has unit tests (skill.rs's
            monotonicity/boundary tests, iterative.rs's depth-cap-vs-
            explicit-depth tests, time.rs's fraction-scaling tests,
            main.rs's option-wiring tests) and was reviewed by hand against
            the existing test suite's patterns, but NONE of that is a
            substitute for actual games — tier K beating tier K+1
            convincingly and consistently is an empirical claim 20.1/20.2
            always said needs match-runner confirmation, not code review.
            NEXT SESSION START POINT: commit `skill.rs` (new),
            `search/mod.rs`, `search/iterative.rs`, `search/time.rs`,
            `main.rs` (all REPLACE), let GitHub Actions confirm the full
            suite is still green, then run `uci_match_runner.rs` across
            multiple seeds for several tier pairs (at minimum: level 0 vs
            5, 5 vs 10, 10 vs 15, 15 vs 20) to confirm monotonic, convincing
            win rates before calling any tier "done." If a pair is too
            close, that's the point to reconsider move-selection noise.
            UPDATE (same session, follow-up): `uci_match_runner.rs`/
            `.yml` (D36) could NOT actually run these tier-pair comparisons
            as they stood — that harness builds two separate git-ref
            binaries and never sends a `setoption` to either, so both
            engines always ran at compiled-in defaults regardless of the
            workflow's inputs. Extended both: harness gets a new
            `EngineProcess::configure()` (sends `;`-separated `setoption`
            lines once after the UCI handshake, before any games) plus two
            new trailing CLI args; workflow gets matching
            `engine_a_uci_options`/`engine_b_uci_options` inputs. To run a
            tier comparison: set `pre_tuning_ref`/`post_tuning_ref` BOTH to
            `main` (same build twice) and only vary the two UCI-options
            inputs, e.g. "setoption name Skill Level value 0" vs
            "setoption name Skill Level value 5". Match-summary labels
            changed from "pre-tuning (ref)"/"post-tuning (ref)" to
            "A (ref | options)"/"B (ref | options)" to stay readable for
            this use case — flagged since it touches D36's existing output
            format, though scoring/Elo math is untouched.
            NEXT SESSION START POINT (updated): commit
            `src/bin/uci_match_runner.rs` and
            `.github/workflows/uci_match_runner.yml` (both REPLACE) on top
            of the Phase 20 files, confirm green, then actually run the 4
            tier-pair comparisons above before calling any tier "done."
- [x] 20.4 — Session 67: ran the validation. First two attempts were
            invalidated by test-setup mistakes, not code bugs (see
            SESSION_LOG for the full story — GitHub's mobile "Run
            workflow" form carrying over stale field values, and UCI-
            options fields needing the FULL `setoption name Skill Level
            value N` line rather than a bare number, which the engine
            silently ignores as an unrecognized command). Once corrected
            and verified via the workflow log's command echo:
            0 vs 5: Elo -381.7 (tier 5 wins ~90%) — strong.
            5 vs 10: Elo -436.4 (tier 10 wins ~92.5%) — strong.
            10 vs 15: Elo -8.7 (48.8%) — statistical tie, NOT separated.
            15 vs 20: Elo -52.5 (57.5%) — real but modest.
            Diagnosis: not a bug — a well-known engine-strength-vs-depth
            shape (huge Elo gains in the first few plies, fast-diminishing
            returns once the search is already reasonably deep for the
            time budget; Stockfish's own Skill Level 15-20 have the same
            closeness for the same reason). Depth-cap tiers 10+ landed in
            the region where extra depth barely changes the chosen move
            anymore.
            Fix (Gokul deferred the specific choice to Claude): built the
            move-selection noise mechanism 20.1 always flagged as the
            fallback for this exact situation, rather than just
            compressing the option's upper range or leaving it
            undocumented — noise fixes the actual separation problem
            instead of hiding it. `skill.rs` gained
            `skill_noise_window_cp(level)` (0 at level 20 = no-op, `(20 -
            level) * 8` cp for 0..19) plus a small embedded xorshift64 PRNG
            (no new crate dependency) and `pick_noisy_move_index()` —
            picks uniformly among root candidates within the window rather
            than always the single best move. `iterative.rs` wires it in
            after the main depth loop, reusing the existing Phase 19
            `search_multipv_slot()` machinery to gather alternative root
            candidates rather than duplicating a second root-search path.
            IMPORTANT: noise applies to every capped tier (0-19), not just
            the two problem pairs — the 0-vs-5/5-vs-10 numbers above are
            now stale relative to the shipped code and need re-validating
            alongside 10-vs-15/15-vs-20, not just the pairs that failed.
            NEXT SESSION START POINT: commit `search/skill.rs` and
            `search/iterative.rs` (both REPLACE), confirm green, then
            re-run ALL FOUR tier pairs (same methodology: full setoption
            lines, movetime 1000, confirm the log echo before trusting any
            result) and compare against this session's pre-noise baseline
            above. If 10-15/15-20 are still too close even with noise, the
            next lever is widening the noise-window formula's coefficient
            (currently a flat `*8` per level), not a structural rewrite.
- [x] 20.5 — Session 67 (cont.): re-validation surfaced a real bug in
            20.4's noise mechanism. 0-vs-5 and 15-vs-20 improved with noise
            (Elo -759.1 and -240.8 respectively — both correct direction,
            more decisive than before). But 5-vs-10 came back INVERTED
            across three separate runs (40/50/60 games, 150 total, 57%
            cumulative in the wrong direction) — Skill Level 5 beating
            Skill Level 10, ruling out sampling noise as the explanation.
            Reviewed for state leakage and time-budget overruns first,
            found neither. Root cause: `skill_noise_window_cp()`'s flat
            centipawn threshold doesn't account for root-move score gaps
            shrinking as search gets deeper — level 10's nominally
            TIGHTER window (80cp @ depth 11) was catching MORE eligible
            candidates in practice than level 5's nominally WIDER window
            (120cp @ depth 6, where shallow search's larger natural score
            gaps rarely fell inside 120cp at all). Deviation frequency was
            an accidental side effect of depth-dependent score clustering,
            not actually controlled by Skill Level as intended.
            Fix: added `skill_noise_trigger_pct(level)` — `(20 - level) *
            4`, checked BEFORE the cp window — so deviation FREQUENCY is
            now a direct, depth-independent function of Skill Level; the
            cp window applies only after a triggered roll, as a safety
            bound. Regression-guard test added pinning
            `trigger_pct(5) > trigger_pct(10)` specifically.
            NEXT SESSION START POINT: commit the fixed `search/skill.rs`
            (REPLACE — `iterative.rs` unchanged, no need to re-commit),
            confirm green, re-run 5-vs-10 first (50+ games) to confirm the
            fix, then re-run the other three pairs for a full clean ladder
            before calling Phase 20 validated.
- [x] 20.6 — Final validation, 200 games per pair (large enough sample to
            trust): 0v5 -619.4 Elo (97% for tier 5), 5v10 -117.2 Elo (66%
            for tier 10 — confirms the trigger_pct fix holds at scale,
            this was the pair that was backwards before), 10v15 -65.0 Elo
            (59% for tier 15), 15v20 -83.2/-79.5 Elo across two runs (62%
            for tier 20, consistent). All four pairs now correctly
            ordered — higher tier wins clearly and consistently, though
            never 100% (expected: Elo gaps are win probabilities, not
            guarantees, and the noise mechanism deliberately lets weaker
            tiers occasionally play a good-not-best move by design).
            Gokul asked whether a 5-level gap "should" mean the higher
            level always wins — clarified this is normal Elo behavior, not
            a defect, and that the real design question was whether a ~60%
            win rate (the 15-vs-20 gap specifically) is a big enough FELT
            difference for a player, separate from "is this correctly
            ordered." Decision (D40): don't touch the underlying 0-20
            mechanism — it's validated, monotonic, and matches the
            standard UCI `Skill Level` convention other GUIs expect if
            Pet Dragon is ever connected to a different frontend. Instead,
            the GUI should expose a small set of NAMED presets rather than
            a raw 0-20 slider, since no player can feel the difference
            between adjacent numeric levels anyway: Beginner=0, Easy=5,
            Medium=10, Hard=15, Master=20 — the exact five points already
            validated above. See D40 for the full reasoning.
            PHASE 20 COMPLETE. Skill Level is validated end-to-end: engine
            depth-cap + time-fraction + move-selection-noise mechanism
            (native UCI and WASM), GitHub Actions match-runner tooling
            capable of testing it, and a GUI-facing preset design that
            uses the validated data points directly.

---

## Phase 21 — UCI Completeness: Ponder, Contempt, Real Eval Bar ✅ (wasm build, cargo test, AND live eval-bar visual check all confirmed — fully closed)
- [x] 21.1 — Session 69: added `option name Ponder type check default
            true` to the UCI option list. Pure advertisement — no engine
            state, since pondering is entirely driven by whether the GUI
            sends `go ... ponder` (the underlying ponderhit/pending-
            allocation logic already existed and worked; this was purely
            a missing declaration some GUIs require before ever invoking it).
- [x] 21.2 — Session 69: added `Contempt` (UCI spin, -100..100, default
            0). `draw_score(ply, contempt)` in search/mod.rs derives the
            root-relative sign purely from `ply % 2` — no new root-side
            field needed anywhere. Applied at all 4 draw-detection sites
            in alpha_beta.rs (repetition, 50-move, insufficient material,
            stalemate). Full design reasoning in DECISIONS.md D42.
- [x] 21.3 — Session 69: added `search_from_fen_with_eval()` as a new,
            non-breaking WASM export (existing `search_from_fen` left
            completely untouched) returning the real search score/mate
            alongside the move. `web/index.html`'s eval bar now shows the
            genuine engine evaluation once a search completes, instead of
            only the material+mobility heuristic (heuristic kept as the
            instant-feedback fallback for the gap before a search runs).
            **CONFIRMED (still Session 70)**: `deploy.yml`'s wasm-pack build
            succeeded on runs #443 and #444 — `search_from_fen_with_eval`
            compiles cleanly to `wasm32-unknown-unknown` for real, not
            just Claude's field-check against `Position`/`SearchResult`'s
            definitions. **CONFIRMED (Session 71)**: Gokul supplied a
            screen recording of the live deployed page — the eval bar
            renders a real, changing numeric value (e.g. `+0.3`) across
            multiple engine moves, not a NaN, a stuck placeholder, or the
            heuristic fallback. Phase 21 fully closed.
- [x] 21.4 — Session 70 (later same day, D43): REVERSED from the
            earlier-this-session decline. Gokul explicitly chose to
            proceed with `UCI_LimitStrength`/`UCI_Elo` anyway, using
            self-assumed Elo anchors (0=1200, 20=2600) rescaled onto this
            project's own real measured tier gaps (Session 68's
            200-games/pair validation). `search::skill::ELO_TABLE` +
            `elo_to_skill_level()` built, `main.rs` wired
            `UCI_LimitStrength`/`UCI_Elo` as an override of Skill Level
            in cmd_go. D39 itself is untouched — only its rejection of
            attaching an Elo number was overridden; full reasoning,
            including exactly which of these 21 numbers are real vs.
            interpolated, is in D43. **CONFIRMED (still Session 70)**:
            `cargo test` log showed 388 passed, 0 failed for the lib,
            including `elo_to_skill_level`'s 5 exactness/clamping/
            tie-break tests and the `UCI_LimitStrength`/`UCI_Elo`
            setoption tests, confirmed by name, not just aggregate count.
- [x] 21.5 — Session 70 (still later the same day, D44): Gokul flagged
            that 21.2-21.4's `cmd_go` wiring tests only checked
            `EngineState` field non-mutation, not that the search thread
            actually received the configured values. Fixed by widening
            `wait_for_search()` to return the real joined `SearchInfo`
            and extracting `effective_skill_level()`/
            `build_time_control()` as pure, directly-testable functions.
            The extraction surfaced a real bug: `UCI_LimitStrength` was
            correctly overriding the depth cap but NOT the time-fraction
            budget (wrong computation order — see D44), meaning a low
            `UCI_Elo` request got a shallow depth cap paired with a full
            time budget, the exact "shallow-then-idle" failure Session 65
            built the depth+time pairing to prevent. Fixed. All 5
            affected tests rewritten to assert on real values; 1 new
            regression test added specifically for this bug. **CONFIRMED
            (still Session 70)**: same `cargo test` log —
            `test_build_time_control_uses_elo_derived_skill_level_not_raw`
            (the actual regression test for this bug) and
            `test_cmd_go_search_reflects_elo_override_not_raw_skill_level`
            (the end-to-end integration test) both confirmed passing by
            name, not just swept up in the aggregate 388-passed count.

**Housekeeping discovered this session — CORRECTED (still Session 70)**:
initially flagged the repo's checked-in root `index.html` as "what
GitHub Pages actually serves" and stale relative to `web/index.html`.
The staleness is real (root `index.html` still has the pre-Skill-Level
2-arg `search_from_fen(fen, ms)` call), but the "what GitHub Pages
serves" part was wrong — checked `deploy.yml` directly: it uploads only
the `web/` folder as the Pages artifact (`actions/upload-pages-artifact
@v3` with `path: web/`) and deploys via `actions/deploy-pages`, meaning
Pages serves `web/index.html` exclusively. Confirmed live via runs #443
and #444 both succeeding on this session's actual commits. Root
`index.html` is simply orphaned dead weight — never live, not
out-of-sync with anything that matters. **DONE (Session 71)**: Gokul
deleted the root `index.html`.

---

## Phase 22 — Repetition Detection Redesigned to Match Stockfish ✅ (tests/make_unmake.rs confirmed via real CI log — fully closed)
- [x] 22.1 — Session 70 (still later the same day, D45): replaced the old
            unbounded "scan all of game_history for any 2nd occurrence"
            with the actual Stockfish algorithm (`Position::set_state()`/
            `is_draw(ply)`), verified against the real Stockfish source
            before implementing rather than worked from memory.
            `game_history` changed from `Vec<u64>` to `Vec<(u64, i32)>` —
            each entry now caches a "repetition" distance at push time
            (Stockfish's `StateInfo::repetition` equivalent), making
            `is_repetition(ply)` an O(1) lookup instead of an unbounded
            scan on every draw check. The core behavioral change: a
            first repeat is only scored as a draw if it happened via
            moves the search itself chose (ply-relative), not when it's
            purely inherited from real game history predating the search
            root — a genuine repetition chain (3-fold-equivalent) is
            still always a draw regardless. Full algorithm, sign
            convention, and the `i=4` minimum-cycle-length reasoning are
            in D45.
- [x] 22.2 — Same session: fixed every consumer the type change touched —
            `alpha_beta.rs`'s draw-check call site, `iterative.rs`'s raw
            root-position push/pop (now uses the proper wrapper),
            `is_threefold_repetition()` (deliberately kept as a plain
            count — used for real game-end adjudication, not the search-
            tree-relative heuristic), and the now-dead-but-still-
            type-correct `set_game_history()` (zero callers anywhere,
            confirmed via grep, but rewritten correctly rather than left
            broken). Rebuilt every test that depended on the old raw-push
            API with genuine legal move sequences (a real 4-ply king-
            shuffle or knight-shuffle repetition cycle) instead of
            fabricated hash pushes, which no longer type-check against
            the new cached representation anyway. Added direct, precise
            unit tests for the algorithm itself in `position/mod.rs`
            (positive vs negative caching, the ply-relative distinction,
            the halfmove_clock bound) rather than relying only on the
            existing weak `alpha_beta.rs` integration assertion.
            **CONFIRMED (Session 71)**: Gokul ran a real CI `cargo test`
            (Actions log, rustc 1.97.0) and supplied the full output.
            `tests/make_unmake.rs` — 19 tests total, all passing,
            including the 5 rebuilt repetition tests by exact name:
            `test_no_repetition_at_start`,
            `test_pet_dragon_repetition_uses_pawn_start_hash`,
            `test_repetition_detected_after_moves`,
            `test_repetition_not_triggered_by_different_positions`,
            `test_threefold_repetition`. The `position/mod.rs` unit tests
            for the algorithm itself also confirmed passing:
            `test_is_repetition_chain_always_true_regardless_of_ply`,
            `test_is_repetition_false_when_repeat_predates_search_root`,
            `test_is_repetition_true_when_repeat_is_within_search_tree`,
            `test_is_threefold_repetition_still_uses_plain_count_not_ply`.
            Full suite: 396 lib tests + 125 bin/integration tests (across
            eval_diag, match_runner, pet_dragon, selfplay, texel_diag,
            texel_gen, texel_tune, train_nnue, uci_match_runner,
            make_unmake, node_count [5 ignored — perft depth ≥8, expected],
            perft, setup) = 521 total, 0 failed. Phase 22 fully closed.

---

## Phase 23 — Post-Release Improvement Roadmap ⏳ (Session 74, corrected against verified source — see DECISIONS.md D47)

*Established after a corrected competitive-analysis pass (Session 74).
An earlier draft incorrectly listed continuation history, correction
history, IIR, razoring, singular extensions, ProbCut, and best-move-
stability time management as gaps — all five were already implemented
as of Phase 13. See ENGINE_ARCHITECTURE.md §3 for the full verified
list of what's already in place. Every item below is confirmed absent
from actual source, not assumed. All five are implementable as
original code with no copyright concern — general algorithmic
techniques, not borrowed artifacts (see full rationale in the
improvement roadmap report).*

**⚠️ Complete these in the numbered order below — the numbering IS the
recommended execution order (23.1 → 23.5), not a topic grouping. Do
not skip ahead to 23.4/23.5 before earlier items are done; each later
item's ease/size estimate assumes the earlier ones are already in
place (23.4 assumes healthy self-play volume from 23.2; 23.3 assumes
23.2 has already confirmed the data-volume theory).**

- [x] 23.1 — Lightweight SPRT-style regression testing gate. DONE
             (Session 75, D48). `uci_match_runner.rs` gained an optional
             11th CLI arg (`min_score_pct`) that turns it into a
             pass/fail gate — exits 1 if the candidate's score against
             the baseline falls below the threshold, exits 0 otherwise
             (existing manual `uci_match_runner.yml` invocations are
             unaffected — they never pass this arg). New `regression-gate`
             job in `build.yml`, runs automatically on every PR (not
             manual-dispatch): builds the PR head ("candidate") and
             current `main` tip ("baseline"), plays 20 games at 50ms/move,
             fails the job if candidate scores below 35%. ⚠️ Not yet a
             hard merge block — Gokul still needs to mark
             `regression-gate` as a required status check in GitHub
             branch protection settings (Settings → Branches → main,
             from the mobile GitHub app or web) for it to actually block
             merges; the job runs and reports either way even before
             that's set.
- [x] 23.2 — Thread-differentiated Lazy SMP. DONE (Session 76, D49).
             Helper threads (`main.rs`)
             currently run identical search parameters, differing only
             in start timing and being time-unlimited. Vary LMR
             aggressiveness / move-ordering tie-breaks per thread ID so
             helpers explore genuinely different tree regions instead
             of largely duplicating the main thread. Smallest item with
             no dependencies — do it right after 23.1. Ease:
             Small–Medium (parameterize existing constants by thread
             ID, no new algorithm). Size: Small–Medium, scales with
             core count.
             New `SearchInfo.thread_id` field (default 0, set per-helper
             in `main.rs`'s spawn loop); `search::pruning::lmr_thread_base()`
             varies the LMR formula's base constant per thread (main
             thread pinned to the original 0.75, unchanged);
             `search::ordering`'s `thread_tie_break()` adds a small
             deterministic offset to quiet move scores, also zero for the
             main thread. Full rationale in `DECISIONS.md` D49. ⚠️ Elo
             impact not yet measured — 23.1's `regression-gate` job
             (20 games/50ms, single-threaded by default) isn't built to
             detect an SMP-scaling improvement; a manual
             `uci_match_runner.yml` run with `Threads` > 1 on both sides
             (higher game count) is the way to actually measure this, not
             yet done.
- [x] 23.3 — NNUE training data scale-up. DONE as scoped (data volume
             is no longer the open question — see below for what's now
             blocking NNUE instead). Code was complete and
             production-ready (`nnue/`, `evaluate_blended()`); both
             earlier tested network sizes lost to HCE (D34/D41), most
             plausibly from data starvation — roughly half a million
             combined self-play + Lichess rows vs. the hundreds of
             billions top-class engines train on.
             **Code half DONE (Session 77, D50)**: `selfplay.yml`
             rewritten from one sequential job (max ~3,000 games/run,
             the prior `n3000` artifact) into a sharded fan-out —
             `plan-shards` job builds a `[0..shards-1]` matrix from the
             `shards` input, `selfplay-shard` runs one independent
             self-play batch per shard on a disjoint seed range, then
             `merge-shards` downloads and concatenates every shard's
             output into one combined artifact (30-day retention) so
             Gokul only downloads one file per run, not `shards` of
             them, on mobile.
             **Compute half DONE (Session 79)**: Gokul ran 10 rounds
             of the sharded workflow (seeds 0-27000), producing
             2,428,608 fresh self-play rows — verified distinct by
             SHA-256 across all 10 files, non-overlapping seed ranges,
             only 1.79% incidental cross-file row duplication (normal
             noise, not a seed collision). Combined with 50,000 Lichess
             rows and trained via `train_nnue.yml`: best epoch 6/10,
             val_loss=0.50108, a real improvement over the old
             483,080-row run's 0.53776. **The data-starvation theory is
             now confirmed on the loss metric** — more data measurably
             helped the training objective.
             **But actual play strength still lost badly**: a 20-game
             pure-NNUE-vs-HCE match was a 20-0 shutout. `eval_diag.yml`
             found the raw network saturating at the ±1500cp clamp on
             6/8 test positions (including ones that should read near
             zero) — a calibration/training-config bug (see D52), not
             a data-volume or architecture-size problem. **New,
             better-understood blocker, tracked as its own item now**:
             see 23.3b below. 23.4/23.5 (which assumed 23.3 would
             settle the data-volume question one way or another) are
             now unblocked to proceed independently of whether 23.3b
             resolves NNUE, since they don't depend on NNUE specifically.
- [ ] 23.3b — NNUE logit-saturation fix (D52, Session 79). Leading
             hypothesis: `train_nnue.rs`'s `lambda=0.7` blend leaves 30%
             loss weight on the raw game-result (hard 0/1/0.5) label for
             self-play rows; BCE-on-logits against a hard target has no
             natural ceiling, so that component rewards the network
             pushing its raw output toward extreme, saturated logits.
             `weight_decay=0.01`/`grad_clip_norm=1.0` (D30/D33) apparently
             aren't enough to counter this at 5x the old data volume.
             Proposed first experiment: retrain with `lambda` raised
             toward 0.9-1.0 (less/no hard-label pull), same data, same
             architecture — a clean single-variable test. Whether to
             adjust `weight_decay`/`grad_clip_norm` too, or in place of
             lambda, is an open call for the next session, not decided
             yet. Ease: Small (hyperparameter-only retrain, same
             infrastructure). Size: unknown until tested — could fully
             resolve NNUE's practical viability, or reveal a deeper issue.
- [ ] 23.4 — Variant-specific opening statistics. No aggregation of
             self-play results into a root-level move-preference table
             exists. No curated opening theory can substitute — 2.16M
             starting positions means nothing exists anywhere to
             reference, for anyone; this is the one genuinely novel
             item on the list. Sequence after 23.3 has produced a
             healthy volume of self-play data to draw on. Ease: Medium
             (data-aggregation script over existing `selfplay.rs`
             output, small root lookup). Size: Small–Medium, high
             strategic-novelty value.
- [ ] 23.5 — NNUE architecture upgrade: king-relative bucketed
             features, replacing the current flat 768+128=896 input
             set. Sequence LAST — only worth the effort once 23.3
             confirms the data-volume theory was actually correct; a
             better-shaped network trained on the same starved dataset
             won't outperform a smaller one. Ease: Large (new feature
             indexing, retraining pipeline, quantization changes).
             Size: Large.


**Confirmed via Session 71's real CI `cargo test` log (rustc 1.97.0,
Actions run) — this is a full, current, authoritative count, not an
estimate.** Per-module breakdown below is still not recomputed (lib's
396 is one crate-level number, not split by src/ submodule) — low
priority, not blocking anything.
| Test Crate/Binary        | Count | Status |
|---------------------------|-------|--------|
| lib (all of src/, unit tests) | 396 | ✅ |
| tests/make_unmake.rs      | 19    | ✅     |
| tests/perft.rs            | 18    | ✅     |
| tests/setup.rs            | 21    | ✅     |
| tests/node_count.rs       | 5 (all ignored — perft depth ≥8, run manually) | — |
| src/main.rs (pet_dragon bin) | 49 | ✅     |
| src/bin/uci_match_runner.rs | 12  | ✅     |
| src/bin/match_runner.rs   | 6     | ✅     |
| src/bin/eval_diag.rs, texel_diag.rs, texel_gen.rs, texel_tune.rs, train_nnue.rs, selfplay.rs | 0 each (no #[test] fns yet) | — |
| **TOTAL** | **521 run, 521 passed, 0 failed, 5 ignored** | ✅ |

---

## Milestone Targets
| Milestone | Target Elo | Phase |
|-----------|-----------|-------|
| Material only (current) | ~1200 | Phase 7 done |
| HCE complete | ~2400-2600 | Phase 8 done |
| Search improvements | ~2800-2900 | Phase 13 done |
| Texel tuned HCE | ~3000-3100 (relative estimate — Pet Dragon is a custom variant with no external rating pool to calibrate against, so this figure is comparative, not a calibrated absolute) | Phase 14 done, 17.8/D36 closed (Session 59-60): 520-game pooled pinned-ref UCI match (2 of those runs at 200 games each, tightly consistent) shows tuned HCE ~39 Elo stronger than pre-tuning Ethereal values. Real, well-powered, and modest — nowhere near the scale that "~3000-3100" implies on its own; treat that number as a rough historical target, not a validated one. |
| NORU NNUE | ~3400-3600 | Phase 16 done |
