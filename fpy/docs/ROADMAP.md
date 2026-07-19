# FastPy — Roadmap

Sprint-level tracking. Checked = done. Unchecked = active or upcoming.

---

## Phase 1 — FastPy Transpiler MVP ✅ COMPLETE

### Sprint 1 — Repo Setup & Documentation
- [x] Create `g-c-3/fastpy` repo
- [x] Write `README.md` with vision, Speed Contract, hardware intrinsics table
- [x] Write `CONTRIBUTING.md`
- [x] Write `CODE_OF_CONDUCT.md`
- [x] Create `g-c-3/fastpy-engine` repo
- [x] Write `fastpy-engine/README.md` (vision, 1B NPS target, 4-phase roadmap)
- [x] Write `fastpy-engine/LICENSE` (GPL v3)

### Sprint 2 — Core Modules
- [x] `core/parser.py` — ast visitor → IRModule (all IR nodes, ExpressionVisitor, StatementVisitor, ModuleVisitor)
- [x] `core/type_system.py` — TypeRegistry, TypeChecker, check_module()
- [x] `core/emitter.py` — CppWriter, CppEmitter, emit_module() with auto-intrinsics wiring
- [x] `core/intrinsics.py` — IntrinsicMapper, POPCNT pattern, TZCNT pattern, PATTERN_REGISTRY
- [x] `core/toolchain.py` — find_compiler(), compile_cpp(), CompileResult
- [x] `main.py` — CLI: build / check / emit / intrinsics subcommands

### Sprint 3 — Example & Validation
- [x] `examples/simple_engine.py` — FastPy-dialect chess engine, zero type errors, runs as Python
- [x] Fix `uint64 = int` bug (ground-truth table beats Python base type)
- [x] Fix TZCNT partial-fire bug (full inline pattern match)
- [x] Fix `IRCall.receiver` — preserve `bin(board)` for POPCNT matching

### Sprint 4 — Test Suite
- [x] `tests/conftest.py` — fixtures and `emit_from_source()` helper
- [x] `tests/test_parser.py` — 46 tests
- [x] `tests/test_type_system.py` — 38 tests
- [x] `tests/test_emitter.py` — 43 tests
- [x] `tests/test_intrinsics.py` — 28 tests
- [x] `pytest.ini` — testpaths + pythonpath
- [x] **155/155 tests passing in 1.82s**

### Sprint 5 — CI & Docs
- [x] `.github/workflows/ci.yml` — type check + smoke test + emit check on 3.11 & 3.12
- [x] CI green on first commit
- [x] `docs/` directory with PROJECT_CONTEXT, ARCHITECTURE, ROADMAP, DECISIONS, SESSION_LOG
- [x] **Add `python -m pytest tests/ -v` step to `ci.yml`**

---

## Phase 2 — Package & Engine Foundation

### Sprint 6 — Package Infrastructure
- [x] `core/__init__.py` — makes `core/` a proper Python package
- [x] `pyproject.toml` — `pip install fastpy` + `fastpy` CLI entry point
- [x] Update `ci.yml` to test `pip install -e .` as well

### Sprint 7 — FastPy-Engine Phase 1 Source
- [x] `fastpy-engine/engine.py` — first real engine source:
  - [x] `BoardState` struct (all 17 fields, starting positions)
  - [x] Bitboard utilities: `popcount`, `lsb`, `pop_lsb`, `north/south/east/west`
  - [x] White pawn move generation (single push, double push, captures, en passant)
  - [x] Knight move generation
  - [x] Alpha-beta search skeleton
  - [x] Material evaluation
  - [x] All using `uint64[218]` arrays — zero type errors required
- [x] `fastpy check engine.py` ;→ zero errors
- [x] `fastpy build engine.py --optimize O3` → compiles successfully

### Sprint 7.5 — Make/Unmake & Real Search
- [x] `BIT_ONE: Final[uint64] = 1` constant for correct 64-bit single-square masks
- [x] `make_move(board, move) -> BoardState` — value-copy semantics, handles captures, en passant, double-push EP square, promotions (queen/knight/bishop)
- [x] `alpha_beta()` wired up with real `make_move` recursion — no more static eval placeholder
- [x] Emitter: `_HOISTABLE_TYPES` guard — struct types not hoisted (invalid C++ zero-init)
- [x] Type checker: `param.field` writes exempt from first-use annotation (same as `self.field`)
- [x] `fastpy build engine.py --optimize=O3` → 662 lines C++, compiles clean ✅

### Sprint 8 — UCI Protocol
- [x] UCI loop in `engine.py`: `uci`, `isready`, `position startpos moves ...`, `go depth N`, `quit`
- [x] `bestmove` output
- [x] `fastpy-engine/tests/test_uci.py` — 21 tests, all passing
- [x] Test with Arena or Cutechess (fully compatible — `python engine.py`)

---

## Phase 3 — Complete Move Generation

- [x] Bishop move generation (diagonal rays)
- [x] Rook move generation (horizontal/vertical rays)
- [x] Queen = bishop | rook
- [x] King moves (all 8 directions, one square)
- [x] Castling (rights tracking, legal castling)
- [x] En passant capture
- [x] Check detection
- [x] Legal move filtering (king cannot move into check)
- [x] Perft(1)=20, Perft(2)=400, Perft(3)=8902, Perft(4)=197281
- [x] Perft(5) from starting position = 4,865,609 nodes ← correctness benchmark ✅ (0.25s compiled)

---

## Phase 4 — Search Improvements

- [x] Move ordering (MVV-LVA captures first, selection sort)
- [x] Quiescence search (stand-pat + capture search at leaf nodes)
- [x] Iterative deepening with time management (movetime, wtime/btime, infinite)
-  [x] Piece-Square Tables (PST) evaluation — pawns/knights/bishops/rooks/king
-  [x] Checkmate vs stalemate detection (NEG_INF+depth for mate, 0 for stalemate)

---

## Phase 5 — Transposition Table & Pruning

- [x] Transposition table (Zobrist hashing) — always-replace, EXACT/LOWER/UPPER
- [x] Zobrist incremental hash in make_move
- [x] FastPy transpiler: IRGlobal, global array emission, subscript-expr targets
- [x] Null move pruning
- [x] Late Move Reductions (LMR)  
- [x] Hash move ordering (TT move first — highest remaining gain)
- [x] Aspiration windows in iterative deepening


---

## Phase 6 — Elite Engine

- [x] NNUE inference infrastructure (Session 34) — `evaluate_nnue()`:
      768-input (12 piece types x 64 squares) -> 128 clipped-ReLU hidden
      units -> 1 output, all-int32 arithmetic (FastPy has no float type;
      matches how real NNUE engines run inference anyway — see D-69).
      `init_nnue_weights()` fills the network with deterministic
      splitmix64-style PLACEHOLDER weights, not trained ones — no ML
      training pipeline exists in either repo. 23 new tests
      (`test_nnue.py`), `fastpy check`/`fastpy build` clean, standalone
      compiled-binary harness confirmed determinism + position-sensitivity.
      See D-69 for the full scoping rationale and what's explicitly NOT
      done yet (the three items below, all now complete except training).
  - [x] Transpiler feature: array-typed `BoardState` struct fields
        (Session 35 / D-70) — `core/parser.py` (`IRField.is_array`,
        `_resolve_target()` now handles `obj.attr[index]`),
        `core/type_system.py` (`_check_class()` validates via
        `resolve_array()`; `_check_assign()` exempts struct-field
        element writes from the local-array-declared check),
        `core/emitter.py` (`_emit_class()` emits zero-init fixed-size
        array members). 14 new/updated tests across
        `test_parser.py`/`test_emitter.py`/`test_type_system.py`.
        Verified end-to-end with a standalone compiled-and-run test
        (not committed) using the established value-copy mutation
        pattern (free function takes struct by value, mutates the
        array field, returns the modified struct — same convention as
        `make_move()`). Full suite 359/359 (fastpy), 219/219
        (fastpy-engine, unaffected).
  - [x] Incremental accumulator in `make_move()` (Session 36 / D-71) —
        shipped as `make_move_with_accumulator()`, a SEPARATE function
        from `make_move()` (not baked into it — an earlier draft did
        that and would have broken Python-mode `board.acc` init for
        dozens of existing test call sites; caught by running the full
        suite before considering the feature done, see D-71).
        `nnue_diff_accumulate()` is diff-based (compares old vs new
        bitboards), not move-semantics-based, so it's correct by
        construction for every move type without hand-special-casing
        captures/castling/en passant/promotion. `evaluate_nnue_incremental()`
        reads `board.acc` directly — O(NNUE_HIDDEN) instead of
        `evaluate_nnue()`'s O(popcount x NNUE_HIDDEN) full recompute.
        Verified against a full recompute after every move type
        (quiet/capture/promotion/promotion+capture/castling/en passant)
        and across a 200-game/11,982-move randomized stress run
        (standalone, not committed) plus 18 committed pytest tests
        including a smaller randomized-game check. 237/237
        (fastpy-engine), 359/359 (fastpy, unaffected). **All three of
        D-69's NNUE follow-up items are now done** — NNUE is
        feature-complete inference infrastructure (full recompute AND
        incremental paths, both tested, both fast/correct) waiting on a
        real training pipeline before it's worth wiring into search.
  - [x] Weight-embedding scoping question answered (Session 39, no
        engine.py/transpiler changes — a measurement session, see D-75):
        **yes, `fastpy build` handles a ~98,600-line literal assignment
        block as-is. No new transpiler feature is needed.** A synthetic
        `init_nnue_weights_literal()` matching NNUE_W1/B1/W2/B2's exact
        sizes (98,304 + 128 + 128 + 1 = 98,561 literal `ARR[i] = value`
        statements in one function body) was parsed, type-checked,
        emitted, compiled at `-O0`/`-O2`/`-O3`, and run — correct output
        confirmed by reading back a specific array element through the
        compiled binary's exit code (`NNUE_W1[100]` — 67 expected, 67
        returned). The only real cost is compile time, not a functional
        limitation: `-O0` compiles in ~4s, but `-O2`/`-O3` take ~85-90s
        for this one function (a known GCC pathology with very large
        single-basic-block functions) — a one-time offline cost paid
        once per trained-weights update, not a runtime cost, and not
        blocking. **The training-pipeline item below is now unblocked.**
  - [x] Offline NNUE training pipeline (Session 40, see D-76): built as
        three standalone tools in `fastpy-engine/training/` (separate
        from FastPy's dialect per Core Rule 4/6 — plain Python + numpy,
        nothing here runs inside the compiled engine):
        - `generate_data.py` — self-play data generator using run.py's
          Python-mode wrappers, weighted-random move selection
        - `train_nnue.py` — numpy trainer, architecture matches
          engine.py's `evaluate_nnue()` exactly (768→128 clipped-ReLU→1,
          CLIP=127, SCALE=64), quantizes to int32 at export
        - `embed_weights.py` — generates the literal `NNUE_W1[i] = ...`
          assignment block from trained weights, confirmed safe at this
          scale by D-75
        Labels are the engine's own `evaluate()` (material + PST) over
        119,413 self-play positions — a first-NNUE bootstrap distilling
        a trusted classical evaluator, not search-based relabelling
        (that's a natural follow-up once this network exists to seed
        move ordering). `init_nnue_weights()`'s placeholder body (and
        the now-unused `nnue_rand()` helper) replaced with the trained
        literal block — 98,561 statements, `fastpy check`/`build`
        verified clean (build ~94s at `-O3`, matching D-75's estimate).
        Quantized-inference validation: MAE 5.0cp, corr 1.0000 against
        `evaluate()` on held-out positions (expected — the network was
        trained to reproduce this exact deterministic function; this is
        NOT evidence of chess-playing strength beyond what `evaluate()`
        already had). Full 243/243 test suite still passing, with
        `test_nnue.py`'s placeholder-specific `[-128,127]` clamp tests
        updated to a generic int32-sanity range (real trained biases,
        e.g. `NNUE_B2[0]=-176`, aren't clipped like the old placeholder
        was).
  - [x] Wire `evaluate_nnue_incremental()` into `alpha_beta()`/
        `quiescence()` (Session 41, see D-77). `find_best_move()` now
        initialises `board.acc` via `init_accumulator()` at the root,
        every `make_move()` call in the search tree
        (`alpha_beta()`/`quiescence()`/`find_best_move()`) is
        `make_move_with_accumulator()`, and static evaluation
        (futility's `static_eval`, quiescence's stand-pat) reads
        `evaluate_nnue_incremental()` instead of `evaluate()`. Python-
        mode mirrors in `run.py` (`_alpha_beta_py`/`_quiescence_py`/
        `_find_best_move_py`) updated identically. `fastpy check`/
        `build -O3` clean, full 243/243 suite passing (two tests
        updated — they'd asserted quiescence's stand-pat equals
        `evaluate()` exactly, which no longer holds now that stand-pat
        reads a close-but-not-identical NNUE approximation; two test
        helper `starting_board()`s now initialise `board.acc` since
        `_alpha_beta_py`/`_quiescence_py` are called directly in those
        files, bypassing `_find_best_move_py()`'s own init). Benchmark
        before/after: node counts shift under NNUE eval (up to ~7x at
        one depth/position, down at another) — expected, not a bug (see
        D-77 for why), but a real finding, not a clean "no regression."
  - [x] Node-count sensitivity investigated (Session 42, see D-78) —
        the pruning-margin symmetry hypothesis from D-77 was WRONG,
        disproved directly (disabling futility + null-move pruning
        entirely doesn't change the startpos depth-5 node count at
        all). Real cause, confirmed: iterative deepening's TT-based
        move-ordering warm-up is far less effective under NNUE eval at
        this position — classical eval gets ~6.4x fewer nodes from the
        depths-1..4 warm-up before depth 5, NNUE only gets ~1.4x,
        because NNUE's best-move ranking flips between depths (`h2h4`
        at depth 4, back to `b1c3` at depth 5) where classical eval
        picks the same move at every depth. Per-node search cost is
        actually comparable cold (no iterative warm-up): 247,542 nodes
        classical vs. 376,385 NNUE, ~1.5x, not the ~7x the warm
        comparison suggested. Not a bug — an expected consequence of
        training a network to approximate rather than exactly reproduce
        `evaluate()`'s ranking of near-equal moves, worse at a wide-open
        symmetric position like startpos where many opening moves are
        genuinely close in value. Second training iteration with
        search-based relabelling (shallow `alpha_beta()` scores instead
        of raw `evaluate()`) is the natural next step — training against
        actual search-consistent targets, not just `evaluate()`'s
        material+PST snapshot, should make move rankings more stable
        across depths too, not just improve raw accuracy.
  - [x] Second (v2) NNUE training pass, search-based labels (Session 43,
        see D-79) — direct follow-through on the item above. New
        `--label-mode search` option in `generate_data.py`: labels come
        from a shallow (depth-1, for practical runtime — see D-79 for
        why not deeper) classical `alpha_beta()` search instead of a
        static `evaluate()` snapshot, with NNUE bypassed during label
        generation so v2 doesn't train against v1's own approximation
        error. 8,478 positions (smaller than v1's 119,413 — search
        labels are far more expensive to generate than static ones, see
        D-79's timing breakdown), trained with the same architecture/
        trainer. Result: dramatic node-count improvement on both
        previously-tested benchmark positions — startpos depth 5 dropped
        from v1's 266,642 nodes to 14,429 (better than even classical
        eval's 38,849); the tactical FEN's depth 5 dropped from v1's
        335,441 to 5,109. Best-move choice is also far more stable
        across iterative-deepening depths on the tactical position
        (`f3g5` from depth 2 onward). `init_nnue_weights()` re-embedded
        with v2 weights, `fastpy check`/`build -O3` clean, full 243/243
        suite passing (one test fixed — `test_respects_window` asserted
        a fail-soft `alpha_beta()`'s result stays within its search
        window, which was never a true invariant for fail-soft search,
        just hadn't been violated under v1's smaller score range).
  - [x] Move-quality spot-check done (Session 44, see D-80) — confirmed
        the exact concern this item flagged: v2's node-count win doesn't
        come for free. Compared classical/v1/v2 on 5 diverse positions
        (2 endgames, an opening, a checkmate sanity check, a closed
        middlegame). Opening/middlegame: all three broadly agree or pick
        defensible alternatives, v2 still searching far fewer nodes.
        **Endgame: a real regression, not a hypothetical one.** In a bare
        K+P vs K position, v2 rates the textbook-correct king-opposition
        move (`e2d3`) at **-40** (i.e. bad for White) while classical
        eval rates the same move **+115** (good) — confirmed by scoring
        every legal move directly, not just comparing final search
        picks. Near-certain cause: v2's training set (150 short,
        middlegame-heavy self-play games, D-79) contains almost no
        sparse endgame positions (a bare K+P vs K has only 2 of 768
        features active), so the network has no reliable training
        signal there and produces close to arbitrary output. **v2 should
        NOT replace v1 as a blanket default without addressing this** —
        see the new NEXT UP item below for options.
  - [x] v2's endgame blind spot addressed (Session 45, see D-81) — went
        with option (1) from the three weighed in D-80: augment the
        training set with explicit sparse-endgame positions generated
        directly (19 `ENDGAME_BAGS` piece configurations — K+P vs K, K+R
        vs K, K+Q vs K, K+N vs K, K+B vs K, and pairings like K+R vs K+P,
        K+Q vs K+R — placed on random legal squares, not hoped for via
        self-play). Rejected (2) material-count-gated fallback as
        inelegant/against a unified-evaluator design, and (3) v1/v2
        blending as unnecessary once (1) directly fixes the actual gap
        (missing training signal), rather than working around it.
        `generate_data.py` gained `random_endgame_board()` +
        `generate_endgame_samples()` + `--endgame-count`; v3's dataset is
        v2-scale self-play (151 games, same depth-1 search-based labels)
        plus 3,200 explicit endgame positions (11,505 total, ~28%
        endgame vs. v2's near-zero). **Confirmed fixed:** D-80's exact
        K+P vs K position — every one of White's 8 legal moves scored
        directly — no longer has `e2d3` as a rated-worst outlier (v2:
        -40, the only negative score; v3: 146, mid-pack among all-
        positive scores). **Confirmed preserved/improved:** startpos
        depth-5 node count 10,584 (v2: 14,429 — better still), same
        `g1f3` best move. **Real trade-off found, not hidden:** the
        tactical FEN's depth-5 node count rose to 55,905 (v2: 5,109) —
        worse than v2 on this specific position, though still far better
        than v1's 335,441; best move unchanged (`f3g5`) at depth 5.
        5-position spot-check (D-80's exact set) re-run: no blunders
        found, checkmate detection still correct. `fastpy check` clean,
        `fastpy build`/direct `g++ -O3` clean (~151s, matches D-75/D-79/
        D-80 estimate), full 243/243 suite passing with zero test
        changes needed this time.
  - [x] Broader v2-vs-v3 validation done (Session 46, see D-82): built a
        generic two-directory self-play match harness
        (`training/self_play_match.py`) and ran a 16-game match (8 fixed
        opening lines × both colors — engines are deterministic, so
        repeating one line is zero additional signal; varying the
        opening is what actually generates independent games) at 200ms/
        move. **Result: v3 never lost a single game — 10 wins, 6 draws,
        0 losses**, across every opening and both colors. This
        supersedes D-80's 5-position static spot-check as the strongest
        evidence yet that v3 is a genuine overall upgrade, not merely a
        fix that happened to trade away net strength for the tactical-
        FEN node-count cost D-81 found. Also re-ran the K+P vs K
        generalization check on two more configurations (a rook-pawn
        endgame, an advanced central pawn with promotion available) —
        both score sanely (no negative-score outliers, promotion
        correctly valued far above all alternatives), so the D-81 fix
        isn't overfit to the one exact FEN D-80 tested.
  - [x] Node-count "diversity dilution" hypothesis tested directly
        (Session 47, see D-83) — result mixed/inconclusive, most likely
        training-run noise rather than a systematic capacity effect.
        Retrained on v3's data with only ~9% endgame positions instead
        of ~28% (v3b, not shipped): tactical-FEN node count partially
        recovered toward v2 (55,905 → 12,860) but startpos got *worse*
        than both v2 and v3 (19,374), and the tactical position's best
        move changed entirely — not the clean monotonic signal a real
        capacity/diversity trade-off would predict. K+P vs K fix still
        holds at ~9% endgame density, for what it's worth. Decided not
        to pursue the more invasive larger-hidden-layer experiment
        (would require resizing engine.py's compiled accumulator arrays)
        since the cheap test didn't find a clean effect worth chasing,
        and D-82's match result already made this non-urgent. **v3
        remains production; this line item is closed.**
  - [ ] **NEXT UP:** v3's NNUE upgrade arc (D-79 through D-83) is now
        closed out — trained, regression found and fixed, validated in
        real games, and the one open question investigated to a
        reasonable stopping point. No specific next task queued; pick up
        from whatever's most valuable next (e.g. search improvements
        like better move ordering/pruning, expanding
        `self_play_match.py` into a standing regression check for future
        NNUE iterations, or a fresh area of the engine/transpiler
        entirely) — needs a decision at the start of next session rather
        than defaulting to more NNUE work for its own sake.
  - [x] Native UCI play (Session 48, see D-84) — asked directly whether
        the engine was ready for game play; answer was "correctness yes,
        but real play only happened at Python speed" since `./engine`'s
        `main()` is a deliberate no-op stub. Built `native/uci_main.cpp`
        (hand-written C++, not FastPy dialect, deliberately outside
        engine.py per Core Rule 6) + `training/build_uci_engine.py`
        (emits engine.cpp via FastPy's own path, strips the known
        no-op main stub, concatenates, compiles). Discovered
        `engine.py` already had a complete compiled search stack
        (`find_best_move`, `generate_legal_moves`, `make_move`,
        `alpha_beta`, `perft`) with no caller outside tests/perft —
        nothing needed adding to engine.py itself. Verified: perft(5)
        from startpos = 4,865,609 (matches documented baseline exactly),
        depth-1 search matches Python mode bit-for-bit, K+P vs K fix
        survives the new entry point, both `movetime` and
        `wtime/btime` time management tested, checkmate detection
        correct, ~1.5M nodes/sec observed (~50-150x over Python mode,
        position/depth-dependent). Two honest limitations documented in
        `ENGINE_ARCHITECTURE.md` rather than hidden: time management can
        overshoot by up to one full depth (checks only between depths,
        not during), and the native driver's full-width search can pick
        a different (comparably-scored) best move than Python mode on
        near-equal positions. Also surfaced and documented a real
        pre-existing gap found along the way: `engine.py` has no
        `PROMO_ROOK` — rook underpromotion was never supported, not
        something this session introduced. `engine.py` and
        `training/generate_data.py` unchanged; full 243/243 suite
        re-verified unchanged afterward.
  - [x] Native UCI mid-search time management (Session 49, see D-85) —
        picked up Session 48's "tighten the native UCI driver's time
        management" option. First design (a watchdog thread setting a
        shared flag for the compiled search to poll) was built, tested,
        and **rejected** — direct testing proved it doesn't reliably
        work: a plain (non-atomic) global written by one thread and read
        inside a hot recursive loop by another is a data race, and GCC's
        `-O3` optimizer is legally free to cache that read and never
        observe the write (confirmed with a minimal standalone repro
        that hung forever, and the real build showing a depth run to
        full completion, ignoring the flag). Shipped instead: a
        node-count budget (`NODE_BUDGET`/`node_budget_set()`/
        `node_budget_exceeded()` in `engine.py`) set exactly once per
        depth by the single thread driving the search, before
        `find_best_move()` starts — no concurrent write during search,
        so no data race by construction. `native/uci_main.cpp`'s `go()`
        computes each depth's budget from the running average nodes/sec
        so far × remaining time (a genuine bug caught and fixed during
        this session: the first cut multiplied the projection by a 2x
        "safety" factor meant to avoid stopping early, which instead
        directly reproduced the overshoot — 500ms measured at 730ms —
        fixed by using a 0.9 fraction to leave headroom instead).
        Measured after the fix: 500ms→484ms, 1000ms→1005ms,
        2000ms→1919ms, and a 50ms stress case→55ms — all close to
        budget, none overshooting by anywhere near a full depth, and a
        near-zero budget still always returns a real legal move (never
        `bestmove 0000`). `go depth N` (no time limit) reconfirmed
        byte-identical to pre-session output. `run.py`'s Python-mode
        mirrors (`_alpha_beta_py`/`_quiescence_py`/`_find_best_move_py`)
        updated identically per the "must stay behaviourally identical"
        convention, though nothing in Python-mode ever calls
        `node_budget_set()` so this is a no-op there by design. 14 new
        tests in `tests/test_node_budget.py`; also fixed a test-isolation
        bug the new file exposed (not introduced) — `test_phase4.py`'s
        `test_depth0_returns_qsearch` implicitly relied on the TT being
        empty via test *file execution order* rather than its own
        `setup_method`, which broke once a same-hash TT entry from an
        earlier-sorted file was left behind; fixed by giving the new
        file's search-running test classes proper `teardown_method`s
        instead of touching `test_phase4.py`. Full suite: 257/257
        (243 baseline + 14 new), reconfirmed order-independent (ran
        forwards, reversed, and interleaved with other files). Async UCI
        `stop` (mid-search, from the GUI) remains unimplemented — noted
        honestly in `uci_main.cpp`'s comment as a real limitation needing
        a bigger architecture change (search on a background thread with
        the main loop still polling stdin), not attempted this session.
  - [x] **Baseline regression found and fixed (Session 50, see D-86)** —
        `Go`-trigger baseline check (per the PROCESS item below) found
        Session 49's claimed `run.py` node-budget mirror was never
        actually committed: `tests/test_node_budget.py` failed 14/14
        with `AttributeError: module 'run' has no attribute
        'node_budget_clear'` against fresh `main`, despite
        SESSION_LOG.md listing `run.py` as changed and claiming
        257/257 passing. Fixed by adding the missing mirror to
        `run.py`: `node_budget_clear`/`set`/`exceeded` imported from
        `engine`, `NODE_BUDGET` sized for Python mode, budget checks
        added to `_quiescence_py`/`_alpha_beta_py`, and
        `_find_best_move_py`'s root loop rewritten to match
        `engine.py`'s move-0-trust guard and conditional TT store.
        `engine.py` itself was untouched (already correct). Full suite
        257/257, reconfirmed forwards and reversed file order.
        `fastpy` 367/367 and `fastpy check engine.py` (zero errors)
        also reconfirmed as part of the same baseline pass.
  - [x] **`PROMO_ROOK` support added (Session 51, see D-87)** — closes
        the gap Session 48 found and documented. Widened the move
        word's promotion field from 2 to 3 bits (bits 12-14, was
        12-13) to fit a 5th value; shifted the flags field up to bits
        15-16 accordingly. Added `PROMO_ROOK` generation to all 6
        promotion move-gen call sites in `engine.py` (single/double
        push and both capture directions, both colors), an explicit
        `elif promo == PROMO_ROOK` branch in `make_move()` for both
        colors (previously any non-NONE/QUEEN/KNIGHT promo silently
        fell through to a bishop — now that gap is closed rather than
        just left unreachable), and matching `'r'`-suffix support in
        both `run.py`'s `_move_to_uci`/`_parse_uci_move` and the
        hand-written `native/uci_main.cpp`'s `move_to_uci`/
        `find_legal_move` (previously a documented dead branch that
        deliberately never matched). Verified end-to-end against the
        actual compiled native binary, not just the test suite: built
        via `training/build_uci_engine.py`, fed
        `position fen ... moves b7b8r` over real UCI stdin/stdout, and
        confirmed the move was matched and applied (board correctly
        flipped to black-to-move afterward) — the exact failure this
        session closes. 8 new tests added to `test_move_gen.py`
        covering move-gen choice count, the widened bit-encoding
        round-trip, and the UCI string round-trip. Full suite 265/265
        (257 + 8 new), `fastpy check engine.py` zero errors.
  - [x] **Search-driver windowing "reconciled" — real root cause found
        was a `fastpy` transpiler bug, not (only) windowing (Session
        52, see D-88)** — added the missing aspiration-window shape to
        `native/uci_main.cpp`'s `go()` loop matching `run.py`'s
        `ASPIRATION_WINDOW`/`ASPIRATION_START_DEPTH` exactly (D-43/D-44),
        as the previously-documented hypothesis suggested. Tested it
        directly rather than assuming it worked: the divergence
        persisted, and was present even at depth 1 (full window, before
        aspiration engages), disproving the windowing-only hypothesis.
        Root cause: `core/emitter.py` mapped Python's `//` (floors) to
        C++'s `/` (truncates) — these disagree for negative operands,
        and NNUE evaluation's `output // NNUE_SCALE` hits this on
        roughly half of all evaluations. Fixed the transpiler
        (`fastpy_floordiv`/`fastpy_mod` helper templates, unconditional
        per Core Rule 5's zero-analysis principle), not `engine.py` —
        the bug lived entirely in the emitter. Depths 1-4 now match
        Python mode **exactly** on the standing tactical FEN (previously
        diverged from depth 1); `perft(1/2/3)` confirmed
        move-generation-identical between drivers throughout. A small
        depth-5 residual remains, not fully explained — most likely
        ordinary alpha-beta path-order variance between compiled and
        interpreted execution of the same algorithm, flagged honestly
        as unresolved rather than assumed away. `fastpy` suite 367→372
        (5 new tests, two of which actually compile-and-run the emitted
        C++ against a table of cases and check against real Python
        semantics — string-shape checks alone can't catch a
        syntactically-present-but-numerically-wrong helper).
        `fastpy check engine.py` zero errors, `fastpy-engine` suite
        265/265 unaffected (Python mode never went through the buggy
        emitted C++).
  - [x] **Depth-5 residual divergence (D-88) confirmed and closed
        (Session 53, see D-89)** — chased the "ordinary alpha-beta
        path-order variance" guess from D-88 to a concrete, provable
        mechanism instead of leaving it asserted. Root cause:
        `engine.py`'s compiled `sort_moves()` is an unstable in-place
        selection sort; `run.py`'s Python-mode mirror used Python's
        stable `list.sort()` for the same MVV-LVA ordering, at both the
        root and every interior node. Equal-scored moves can land in a
        different relative order between the two, which compounds
        through the whole search tree via alpha-beta cutoff/window
        timing. Fixed by adding `_sort_moves_py()` — a direct port of
        the compiled selection-sort tie-break — to `run.py`, used at
        both existing sort call sites. Verified directly: native and
        Python-mode now agree exactly (move **and** score) at every
        depth 1-5 on both the standing tactical FEN and startpos,
        including the depth-5 case that was the whole open question.
        `engine.py` untouched (confirmed byte-identical to pre-session
        `main`). Full suite 265/265, zero test changes needed.
  - [x] **Async UCI `stop` support (Session 53, see D-90)** — shipped
        without a background thread, sidestepping D-85's data race
        rather than solving it: `go()`'s existing iterative-deepening
        loop already returns to the single calling thread between every
        completed depth (same point `NODE_BUDGET` is checked), so a new
        `stdin_has_pending_line()` (`poll()`, 0ms timeout) checks for a
        waiting `stop`/`quit` line right there instead of waiting for
        `go()` to finish every requested depth — no shared mutable
        state, no second thread, genuinely race-free by construction.
        `go infinite` also added (previously unparsed, fell through to
        the 1000ms default — infinite mode had no way to ever stop on
        its own). **Honest, measured limitation:** depth-boundary
        granularity, not mid-node — `stop` sent 1.5s into a `go
        infinite` search wasn't honored until depth 11 completed 37.7s
        later. True mid-node interruption still needs the same
        transpiler feature (a volatile/atomic FastPy global type) D-85
        already identified as its own multi-session item. Full suite
        265/265 (unaffected by construction — `test_uci.py` exercises
        `run.py`, not the native binary); manual interactive-harness
        verification of `go depth N`, `movetime`, pre-emptive `stop`,
        and `quit`-during-search, all against the real compiled binary.
        `engine.py`/`run.py` both untouched — `native/uci_main.cpp` only.
  - [x] `fastpy` transpiler: `Atomic[T]` global type added to the dialect
        (D-91) — resolves the "actual decision" flagged below. Chosen
        over Lazy SMP (bigger, its own multi-session `std::thread`-in-
        dialect commitment) and over a fresh non-search area, because
        it's the one two sessions (D-85, D-90) already named by name as
        the real blocker. Scoped as transpiler-feature-only this
        session: `core/parser.py` (`IRGlobal.is_atomic`, unwraps
        `Atomic[T]` to plain `T` before storage) + `core/emitter.py`
        (emits `std::atomic<T> NAME{val};`, unconditional
        `#include <atomic>`). Zero special-casing needed for reads/
        writes elsewhere — `std::atomic`'s `operator=`/`operator T()`
        make `if (NAME)` / `NAME = true;` compile unchanged.
        `Atomic[array]` deliberately left unresolved → rejected by
        type_system's normal unknown-type error, not silently accepted.
        Full suite 386/386 (372 baseline + 14 new), including a real
        compile-and-run `std::thread` concurrency test reproducing
        D-85's exact hang scenario and confirming `std::atomic` actually
        fixes it (not just a string-shape check). `fastpy check
        engine.py` reconfirmed zero errors. `fastpy-engine` repo
        untouched this session.
  - [x] `fastpy-engine`: `Atomic[bool]` wired in for genuine mid-node
        `stop` (D-92), superseding D-90's depth-boundary-only stdin
        polling. `engine.py` gained `STOP_FLAG`/`stop_clear()`/
        `stop_request()`/`stop_requested()`/`search_aborted()`; every
        `node_budget_exceeded()` check in `alpha_beta()`/`quiescence()`/
        `find_best_move()`'s root loop now calls `search_aborted()`
        instead (node budget OR external stop). `run.py` mirrors the
        same substitution for parity (no-op there today — no watcher
        thread in Python mode). `native/uci_main.cpp`'s `go()` now spawns
        a real `std::thread` (`stop_watcher()`) owning stdin for the
        search's duration, polling every 10ms, calling `stop_request()`
        the instant `stop`/`quit` arrives — safe now specifically
        because `STOP_FLAG` is `Atomic[bool]`. `training/
        build_uci_engine.py` gained `-pthread` (required for
        `std::thread`, caught by actually building the binary).
        Verified via 5 manual interactive UCI sessions against the real
        compiled binary (see D-92): most importantly, D-90's exact
        measured failure case — `stop` withheld until genuinely stuck
        >2s inside one slow depth-11 iteration — now returns `bestmove`
        in ~10ms instead of the 37.7s D-90 recorded. `quit` mid-search
        and two ordinary uninterrupted searches also verified clean.
        `fastpy-engine` pytest suite unaffected: 265/265 (no existing
        test touches `native/uci_main.cpp`, before or after).
  - [x] Replaced `NODE_BUDGET`'s node-count *estimate* (D-85) with a
        genuine wall-clock deadline (D-93) — the piece D-91's original
        two-part follow-up left open once D-92 shipped the `stop` half.
        `go()`'s per-depth NPS-based node-ceiling computation removed
        entirely; `stop_watcher()` (D-92) now takes a `Clock::time_point
        deadline` parameter and checks it every ~10ms poll cycle
        alongside stdin, calling `stop_request()` the instant it passes.
        Zero `engine.py` changes needed — `search_aborted()` already ORs
        node budget OR external stop, so a deadline-triggered stop
        unwinds through the exact same path a `stop` command already
        used. `NODE_BUDGET` itself untouched — still `run.py`'s
        Python-mode mechanism (no watcher thread there to hand a
        deadline to). Measured deadline precision directly across 5
        budgets (100–2000ms): consistently 14.5–19.7ms overshoot,
        regardless of budget size — unlike D-85's percentage-of-
        estimate-error behavior. Specifically reproduced D-85's original
        documented failure shape (a deadline landing mid-way into a
        slow, still-growing depth-11 iteration) — 18.1ms overshoot, not
        the multi-second overshoot that class of case produced before
        any budget mechanism existed. Re-verified all of D-92's
        regression scenarios against the new binary (`go infinite` +
        `stop`, `go depth N` to completion, `quit` mid-search) —
        nothing broke. `fastpy-engine` pytest suite unaffected: 265/265.
  - [x] Opening book added (D-94) — picked over Lazy SMP and Python-mode
        wall-clock time management to avoid three straight sessions on
        search-internals concurrency, and because it's fully self-
        contained (no dependency on anything D-91/D-92/D-93 left open).
        Small (11-entry) hand-picked table, exact-move-sequence-prefix
        keyed, implemented entirely at the UCI-driver level (Core Rule 4
        — not FastPy dialect data, `engine.py` untouched) in both
        `run.py` (`OPENING_BOOK`/`_book_lookup()`, `_apply_position()`
        now also returns `move_history`/`is_standard_start`) and
        `native/uci_main.cpp` (`kOpeningBook`/`book_lookup()`, same
        tracking added to `main()`'s loop) — mirrors the existing
        Python/C++ search-function-pair convention. `position fen ...`
        permanently disables the book for that game, `ucinewgame`
        restores eligibility. A sequence not in the book always falls
        through to a real search unchanged. 7 new tests in
        `TestOpeningBook` (test_uci.py): fresh-startpos hit (near-instant,
        confirms zero search ran), two single-reply lines, the 4-ply Ruy
        Lopez line, off-book fallthrough, FEN-disables-book (using a FEN
        where the book's move would be illegal, to catch a wrongly-
        applied book unambiguously), `ucinewgame` resetting eligibility.
        Two pre-existing `test_phase4.py` tests needed an off-book
        fixture move (their bare `startpos` fixture now legitimately hits
        the book, correctly, which broke what they were actually
        checking — info-line output shape during a real search).
        272/272 (fastpy-engine). Manually verified the compiled binary
        too (6 interactive sessions, same scenarios, matching latency).
  - [x] Genuine wall-clock time management + real `stop`/`quit` brought
        to Python-mode's `run.py` (D-95) — picked over Lazy SMP and
        further opening-book expansion. `_stop_watcher_py()` mirrors
        native/uci_main.cpp's stop_watcher() (D-92/D-93) via
        `threading.Thread`; `_iterative_deepening_py()` checks
        `stop_requested()` at the top of its depth loop (must be BEFORE
        starting a new depth, not just after — see D-95 for why a
        stop-triggered abort could otherwise corrupt an already-trusted
        depth's result) and after each depth's info line. `go infinite`
        no longer caps at a fixed 5000ms — relies on a real external
        stop now, matching native's semantics. Found and fixed two real
        bugs along the way: (1) `engine.py`'s `stop_clear()`/
        `stop_request()` silently discarded their writes under plain
        Python execution (missing `global STOP_FLAG` — fixed at the
        transpiler level, `core/parser.py` gained `visit_Global()`, a
        pure no-op in the IR that makes the same source correct under
        both compiled and plain-Python execution); (2) a genuine
        `sys.stdin` buffered-read-ahead bug where a `readline()` call
        could silently consume bytes belonging to a LATER command,
        invisible to a subsequent `select()` — fixed by switching all
        stdin reads in `run.py`'s UCI handling to raw byte-at-a-time
        `os.read()` (`_read_line_raw()`). 4 new tests
        (`TestGenuineStop` in `test_uci.py`). One pre-existing
        `test_phase4.py` test needed its own subprocess sequencing
        (D-95's real stop-watcher now correctly honors an
        already-buffered `quit` almost instantly — correct new
        behavior, not a regression). Full suites: `fastpy` 386/386,
        `fastpy-engine` 276/276. `fastpy check engine.py` zero errors.
  - [x] Lazy SMP shipped (Session 56, see D-96/D-97) — picked over
        expanding the opening book. Correcting the D-74 scoping note two
        bullets below: D-92 already established the exact pattern real
        thread-based Lazy SMP needed (a `std::thread` spawned from
        hand-written `native/uci_main.cpp`, calling directly into
        engine.cpp's already-compiled functions) — so this shipped with
        **zero `engine.py` changes**, not the multi-session
        transpiler-feature commitment D-74 assumed. `setoption name
        Threads value N` (default 1, matching standard UCI/GUI
        convention) spawns N-1 silent helper threads sharing one TT with
        the main search thread — genuinely unsynchronized by design (the
        actual "Lazy" in Lazy SMP; a stale/corrupted always-replace TT
        entry is filtered the same way an old search's stale entry
        already was). Also found and fixed a real bug along the way
        (D-97): the depth loop's stop check could trip before depth 1
        ever ran (STOP_FLAG already true from a deadline that elapsed
        during this session's own added thread-spawn overhead),
        returning illegal `bestmove 0000` — reproduced directly at
        `Threads=64`/`movetime 100` (~50% of runs), fixed by mirroring
        `find_best_move()`'s own existing "move 0 always trusted"
        guarantee one level up ("depth 1 always searched"). `Threads=1`
        (the default) reconfirmed byte-identical to pre-session output
        (node counts/scores/moves match exactly across depths 1-6, only
        wall-clock timing noise differs). Full suites: `fastpy` 386/386,
        `fastpy-engine` 276/276 (native-driver behavior verified by hand
        via paced UCI subprocess sessions, matching this project's
        existing convention — no pytest test builds the native binary,
        see `test_node_budget.py`'s docstring). `engine.py` and `run.py`
        both untouched — `native/uci_main.cpp` only.
  - [x] Emitter: struct methods emit `const` unconditionally (Session 37
        / D-73) — `_emit_function` now calls a new `_method_mutates_self()`
        helper (walks `IRAssign`/`IRAugAssign` targets through
        `IRIf`/`IRWhile`/`IRFor`/`IRMatch`, same tree-walk shape as
        variable hoisting) and only emits `const` when the method body
        has no direct `self.field`/`self.field[i]` write. Verified with
        a standalone compiled-and-run test (mutating + read-only methods
        on the same struct, correct C++ emitted and correct runtime
        behavior) and 9 new/updated tests in `test_emitter.py`
        (`TestConstMethodDetection`). `engine.py` reconfirmed unaffected
        — every existing `BoardState` method is a pure accessor and
        keeps emitting `const` exactly as before. 367/367 (fastpy),
        243/243 (fastpy-engine, unaffected).
  - [x] Python-mode `copy.copy(board)` list-aliasing pitfall (Session 37
        / D-72) — fixed at the source with `BoardState.__copy__`/
        `__deepcopy__`, monkey-patched onto the class in `run.py`
        (dunder methods are Python-only, can't live in `engine.py` —
        Core Rule 6). Generic over any list-valued field (iterates
        `self.__dict__`, doesn't hardcode `acc` by name), so it stays
        correct if a second array field is ever added. Session 36's
        `_copy_board_with_acc_py()` helper is retired — every
        `copy.copy(board)` call site across the whole codebase is now
        automatically safe. 6 new tests
        (`TestBoardStateCopyPatch`). 243/243 (fastpy-engine, 237 prior
        + 6 new).
- [x] Futility pruning
- [x] `go depth N` timing harness (node counting + NPS reporting, Session 18)
- [x] Singular extensions (Session 24) — excluded-move verification search
      at depth >= SE_MIN_DEPTH=6, one extra ply for a hash move that
      fails low against everything else. Re-implemented from scratch;
      the Session 22 log/D-53 description of this was never actually
      committed to the code (see D-55). See D-57 for the real design.
- [x] Lazy SMP multi-core search — deferred Session 38 (D-74), shipped
      Session 56 (D-96/D-97, see the entry above). D-74 predicted this
      needed `std::thread` support added to the FastPy dialect itself;
      that assumption turned out to be outdated by the time this was
      picked up — D-92 (Session 55) had already established the actual
      pattern needed (a hand-written `std::thread` in
      `native/uci_main.cpp` calling into already-compiled engine.cpp
      functions), so real thread-based Lazy SMP (option (b) below)
      shipped with zero engine.py/transpiler changes, not the
      multi-session commitment originally assumed. Process-level
      parallelism (option (a)) was never pursued — the same call D-74
      made, still correct: it would have been weaker (no shared TT) and
      this arc never needed the easier-but-weaker stopgap once the real
      approach turned out to be in-scope for one session.
- [ ] **Target: 1,000,000,000 NPS on modern multi-core hardware**
- [x] Benchmark LMR / null move / aspiration windows / futility pruning
      node reduction (Session 19) — LMR dominates (~25x at depth 5 on
      startpos), others negligible on this position, see D-49
- [x] Re-run the Session 19 ablation on a tactical FEN (Kiwipete,
      Session 20) — futility confirmed meaningful (+17% nodes without
      it), LMR negligible on this position, null-move showed an
      unexplained node *increase* when enabled
- [x] Investigate the Session 20 null-move node-increase finding on
      Kiwipete (Session 21) — root cause: `NULL_MOVE_MIN_DEPTH=3` let
      the verification search drop straight into quiescence at
      `reduced_depth=0`, expensive on tactical positions for a 2% hit
      rate. Fixed via `NULL_MOVE_MIN_DEPTH` 3→4; Kiwipete depth-4 nodes
      now match null-move-disabled exactly, startpos cost negligible
      (+0.5%)
- [x] Fix the `DECISIONS.md` D-52 stub (Session 22) — it was a
      self-referential placeholder, not a real missing-entries gap;
      D-46–D-51 were already written up
- [x] Adaptive `NULL_MOVE_R` (Session 23) — R=2/3/4 tiered by depth via
      `null_move_r()`, floor-clamped so `depth - 1 - R >= 1` always
      holds; see D-54
- [x] **NEXT UP (Session 56) resolved (Session 57, see D-98):** picked
      option (3) — expanded the opening book — over the two SMP
      follow-ups, as a self-contained, non-concurrency change of pace
      after two SMP-focused sessions in a row. `OPENING_BOOK`/
      `kOpeningBook` grew from 11 to 46 entries (both `run.py` and
      `native/uci_main.cpp`, mirrored exactly), covering Ruy Lopez/
      Italian/Petrov, Sicilian, French, Caro-Kann, Scandinavian,
      Alekhine's, Pirc/Modern, Queen's Gambit/Slav/QGA, King's Indian/
      Grunfeld/Nimzo-Indian setups, Dutch, and English — still the same
      small-hand-picked, exact-prefix-match design as D-94, just wider.
      Every one of the 35 new entries was validated programmatically
      against the engine's own legal-move generator before being added
      (both that the prefix is a legal sequence AND the reply is legal
      in the resulting position) — caught one real typo (a bishop
      retreat square copied from the wrong ply) before it shipped. Full
      suites unaffected: `fastpy` 386/386, `fastpy-engine` 276/276.
      Options (1) and (2) below remain untouched, still open.
- [x] **NEXT UP (Session 57) resolved (Session 58, see D-99):** picked
      option (1), accurate per-thread node counts — the most
      substantive of the three carried-over options, and the direct
      completion of what D-96 called "worth measuring, not assuming."
      `NODE_COUNT` grew from `uint64[1]` to `uint64[64]` in engine.py, a
      `thread_id: int32` parameter threaded through
      `find_best_move()`/`alpha_beta()`/`quiescence()` and every one of
      their recursive call sites, so each thread now writes only its
      own slot and `nodes_get()` sums an exact total instead of D-96's
      accepted racy approximation. Measured, not assumed: A/B benchmark
      on a fixed tactical FEN at `Threads=1` showed node counts
      bit-for-bit identical between the pre- and post-`thread_id`
      binaries in every run (confirms search-behavior-neutral) and no
      measurable nps cost (differences within ordinary run-to-run
      noise) — the concern D-96 flagged turned out not to materialize.
      Also found and worked around a real FastPy dialect constraint
      along the way: array sizes must be literal integers, not named
      `Final[int32]` constants (`uint64[MAX_SMP_THREADS]` was rejected
      by the type checker) — used the literal `64` directly, matching
      the existing `TT_HASH`/etc. convention. Zero test file changes
      needed (confirmed no test calls the three functions directly —
      they're compile-only, pytest uses `run.py`'s separate `_xxx_py()`
      mirrors). Full suites unaffected: `fastpy` 386/386, `fastpy-engine`
      276/276. Option (2) (a smarter `Threads` default) reconsidered and
      deliberately still not done — Threads=1 is the standard UCI/GUI
      convention (Stockfish defaults to it too), not clearly worth
      changing on reflection, not just deferred for lack of time.
- [x] **NEXT UP (Session 59) resolved (Session 60, see D-101):** picked
      up one of the two related gaps D-100 flagged — threefold-
      repetition detection — deliberately scoped to ROOT-ONLY (checking
      candidate root moves against the actual game's played-position
      history via a new `repetition_count()` helper and new
      `game_history`/`game_history_len` params on `find_best_move()`).
      Full in-search-path repetition detection (an ancestor-hash stack
      threaded through `alpha_beta()`/`quiescence()`, pushed/popped
      around every early-return point) was deliberately deferred as
      too high-risk for a single careful session — see D-101's full
      reasoning. Three files changed: `engine.py` (root-loop override),
      `run.py` (full Python-mode mirror, `_apply_position()` now also
      returns `position_history`), `native/uci_main.cpp` (hand-written
      driver — `go()` gained a `position_history` param, all 3 of its
      `find_best_move()` call sites updated, `smp_helper_worker()`
      deliberately passes an empty history with documented reasoning).
      A real build-time fix needed along the way: `go()`'s parameter
      couldn't be `const std::vector<uint64_t>&` since
      `find_best_move()`'s `game_history` param is non-const
      `uint64_t*` (FastPy's array-parameter emission convention).
      5 new tests (`TestThreefoldRepetition` in `test_move_gen.py`),
      chosen at the function level after a UCI-level smoke test turned
      out to be timing-sensitive/hard to verify precisely. Full
      `training/build_uci_engine.py` build succeeds; live UCI smoke
      test against the compiled binary confirmed sane behavior. `fastpy`
      386/386, `fastpy-engine` 290/290 (285 + 5 new). `fastpy check
      engine.py` zero errors.
- [x] **NEXT UP (Session 61):** ~~growing list, needs an actual decision~~
      **resolved (Session 61, see D-102):** of the four candidates,
      deliberately picked the low-risk one — a direct, small
      continuation of D-101's own work, closing the exact gap that
      session had already identified and documented, rather than
      opening a new large front (in-search-path repetition detection,
      explicitly flagged high-risk in D-101) or picking up an item
      stalled for 5-6 sessions without a clear path (`Threads` default,
      opening-book transposition-awareness). Fixed: the ROOT position
      itself already having occurred 3 times in the game's history is
      now recognized as an immediate draw (score forced to 0), not just
      a candidate move that would CREATE the 3rd occurrence (D-101's
      original scope). `find_best_move()` gained one new check placed
      AFTER its existing `tt_store()` call, deliberately — the TT entry
      stays the position's genuine, context-independent score, only the
      returned `score_out` gets the game-specific override.
      `native/uci_main.cpp` needed ZERO changes — confirms D-101's
      architecture (mechanism entirely inside `find_best_move()`) was
      the right call. 2 new tests (`TestRootAlreadyRepeated`). Decisive
      before/after live UCI smoke test on the identical D-101
      manufactured position: varying nonzero scores per depth before
      this fix, `score cp 0` at every depth after, `bestmove` still a
      real move. `fastpy` 386/386, `fastpy-engine` 292/292 (290 + 2
      new). `fastpy check engine.py` zero errors, full UCI binary build
      succeeds.
- [x] **Session 62 — a smarter `Threads` default: resolved, see D-104.**
      Open since Session 56, six sessions without action. Scoped as a
      DECISION task, not necessarily an implementation one — landed on
      **keeping the current default (1)**, closed explicitly as
      "considered, not changing" rather than deferred again. Reasoning
      recorded in D-104 and in a new comment block in
      `native/uci_main.cpp` next to `g_smp_threads`: matches standard
      UCI/GUI convention (every other UCI engine defaults to 1, opt-in
      via `setoption`), and — the stronger reason — an auto-detected
      `hardware_concurrency()` default would make this project's whole
      history of byte-for-byte-reproducible node-count/NPS benchmarks
      (D-49, D-96, etc.) silently machine-dependent, for no real benefit
      since `setoption name Threads value N` is already one line for any
      GUI/harness that wants SMP. Verified: full rebuild via
      `training/build_uci_engine.py` succeeds, live UCI smoke test
      (`uci`/`isready`/`go depth 4`) byte-for-byte unchanged from
      pre-session output — this was a comment-only change, no behavior
      difference expected or found. `fastpy` 386/386, `fastpy-engine`
      292/292 (both reconfirmed against fresh `main` before starting,
      per the D-61/D-65 PROCESS rule).
- [ ] **NEXT UP (Session 63):** two candidates remain, per D-103's
      sequencing:
      1. **Session 63 — opening-book transposition-awareness**
         (D-94/D-98). Still exact-prefix-match only, open since Session
         55. Medium scope: extending `OPENING_BOOK` lookup to match by
         position (transposition) rather than only by exact played-move
         prefix.
      2. **Session 64 — in-search-path repetition detection.** The
         hardest and highest-risk of the two (D-101's detailed risk
         reasoning still applies: a `ply`-indexed ancestor-hash stack
         pushed/popped around every early-return point in
         `alpha_beta()`/`quiescence()`, where a single mismatched pop
         silently corrupts results rather than crashing). Deliberately
         sequenced LAST, with the fullest possible session budget
         available, given the correctness stakes D-101 already laid out.
      This ordering can be revisited if Session 63's own findings change
      the picture — but the default, absent new information, is to do
      Session 63 next.

---

## FastPy Transpiler — Ongoing Improvements

- [x] Call-site arity checking in `core/type_system.py` (Session 25) — the
      type checker now walks every expression tree (call args, receivers,
      conditions, iterables, assignment values, return values) and
      validates each `IRCall`'s arg count against the callee's own param
      list; free functions matched by name, methods matched by name across
      all classes. Verified against injected too-many/too-few-arg repros
      of the exact D-55 shape; zero false positives on the real engine.py.
      10 new tests in `TestCallSiteArity`. See D-58.
- [x] Wire PEXT into bishop/rook move generation (Session 25) —
      `generate_bishops`/`generate_rooks`/`generate_queens` now do a single
      PEXT + array lookup instead of four ray-fill loops each. Tables built
      once via `init_magic_tables()`, lazily guarded by `MAGIC_INIT[0]` at
      the single move-gen chokepoint (`generate_all_moves()`), mirroring
      the existing `ZK_TABLE_INIT` pattern. Algorithm verified offline
      against 20,000 random occupancies before being ported to FastPy;
      startpos perft(5) = 4,865,609 exact match post-wiring. See D-59.
- [x] `__builtin_clzll` for MSB index (Session 27) — new LZCNT intrinsic
      pattern (`x.bit_length() - 1` → `(63 - __builtin_clzll(x))`) in
      `core/intrinsics.py`, tried after TZCNT in `_match_binop` so the two
      never collide. Handles both parser encodings of `obj.bit_length()`
      (bare-name receiver vs. sub-expression receiver). `engine.py` gained
      an `msb()` utility mirroring `lsb()`'s shape; verified against
      Python's own `bit_length()-1` on 100k+ random 64-bit values plus
      edge cases (0, single low/high bit, multi-bit). Not yet wired into
      any move-gen caller — it's a general utility, ready for whichever
      future feature needs a most-significant-bit index (e.g. a
      most-valuable-piece scan). See D-62.
- [x] Isolate the Kiwipete perft bug (Session 26) — **not a real bug.**
      `run.py`'s `_parse_fen`/`_perft_py` give perft(1)=48, perft(2)=2039,
      perft(3)=97862 against Kiwipete — exact matches to the known-correct
      values, with `run.py` importing cleanly. The 429 figure was a
      measurement artifact of the Session 24/25 indentation regression
      (below), not a castling/move-gen defect. Added
      `TestPerftKiwipete` (depths 1-3) to `test_move_gen.py` regardless,
      per the original task. See D-61.
- [x] Fix `run.py` line 224 indentation regression (Session 26) — the
      Session 25 dedent fix for `_alpha_beta_py` was written up in
      SESSION_LOG.md but never actually landed on `main`; the committed
      file still had the stray 8-space indent, so `run.py` still failed
      `ast.parse()` and every Python-mode path (including the Kiwipete
      investigation above) was silently running against a broken import.
      Third occurrence of this exact pattern (Sessions 24, 25, 26). See
      D-61.
- [ ] **PROCESS: stop trusting SESSION_LOG.md's account of a fix without
      re-verifying the live file.** Three sessions running (24, 25, 26)
      a fix was logged as complete but the committed `main` branch didn't
      have it. Every session must re-run `ast.parse()` on `run.py` and
      `fastpy check` on `engine.py` against the freshly-pulled repo
      *before* trusting any prior session's "fixed" claim, not just at
      baseline. See D-61. **Recurred in Session 30**: Session 29 logged
      "287/287 passing" but `core/toolchain.py` on `main` had an
      `IndentationError` that broke `import core` entirely — the module
      couldn't have been importable when that claim was made. Extend the
      rule to `fastpy` itself, not just `fastpy-engine`: every session
      must run `python -m pytest tests/` in **both** repos against the
      freshly-pulled `main` before trusting any prior "N/N passing"
      claim, not just `ast.parse`/`fastpy check` on the engine files.
      See D-65.
- [x] Baseline recovery (Session 30) — `core/toolchain.py` restored after
      a corrupted merge broke `_build_command()` and misplaced the ARM64
      pre-flight check; `target_arch` passthrough bug in `compile_cpp()`
      also fixed. 287/287 (fastpy) + 196/196 (fastpy-engine) reverified.
      See D-65.
- [x] Windows support (MSVC/MinGW detection in `toolchain.py`) (Session 28) —
      four backends detected: g++/clang++ (MinGW, GCC dialect), clang-cl
      (MSVC dialect, Clang underneath), cl (true MSVC). Windows search
      order prefers g++ → clang++ → clang-cl → cl because the emitter's
      POPCNT/TZCNT/LZCNT patterns always emit GCC/Clang `__builtin_*`
      calls regardless of target — only true cl.exe can't compile those.
      `compile_cpp()` pre-flight-rejects that combination with a clear
      message instead of invoking cl.exe and failing with undeclared-
      identifier errors; verified end-to-end with a fake `cl` script on
      PATH that would mark itself as invoked if the check failed to stop
      it first. `.exe` suffix auto-added to output paths on Windows.
      52 new tests in `tests/test_toolchain.py` — previously zero
      coverage existed for this module. See D-63.
- [x] Apple Silicon cross-compilation flags (Session 29) — `compile_cpp()`
      gained `target_arch` ("x86_64"/"arm64"). ARM64 target: swaps
      `-march=native` for `-mcpu=native` and drops `CHESS_FLAGS`
      (`-mpopcnt`/`-mbmi`/`-mbmi2` are x86-only, would error out on ARM);
      on macOS an explicit `target_arch` also adds Apple Clang's
      `-arch <arch>`. Pre-flight rejects ARM64 target + PEXT/PDEP source
      with a clear message instead of a cryptic `immintrin.h` error —
      PEXT-based magic bitboards (D-59) remain x86-only, no ARM64
      fallback exists; this is a known limitation, not fixed by flags.
      36 new tests in `tests/test_toolchain.py` (88 total for the module).
      See D-64.
- [x] Better parse error messages (highlight offending source line) —
      `FastPyParseError` now appends a Python-`SyntaxError`-style caret
      snippet (`File "x.py", line N` / source line / `^` under the
      offending column), attached once in `parse_source()`. 7 new tests
      in `tests/test_parser.py::TestParseErrorSourceContext` (294 total).
      See D-66.
- [x] Multi-file compilation support (Session 33) — `import foo` / `from
      foo import ...` where `foo.py` sits next to the file being built now
      merges into one IRModule via `core/parser.py`'s new `parse_project()`;
      `main.py`'s build/check/emit all switched to it. Diamond imports
      dedupe, genuine name collisions raise `FastPyImportError`, repeated
      `uint64 = int`-style prelude aliases dedupe silently. Required
      forward-declaring free functions in the emitter (previously only
      structs were) since merged-file function order no longer guarantees
      callee-before-caller. Surfaced and fixed a pre-existing bug along the
      way: `_try_type_alias` mutated the module-level `BUILTIN_TYPE_MAP`
      dict, leaking one parse's custom aliases into every other
      `parse_source()`/`parse_file()` call in the same process. See D-68.
- [x] `match` statement support (Python 3.10+) — restricted to the
      switch-mappable subset: integer/boolean literal `case` patterns
      (optionally `|`-combined) and one wildcard `case _:`. Guards,
      captures, and class/sequence/mapping patterns rejected at parse
      time; duplicate case values, duplicate wildcards, and unsafe
      `break` inside a case body rejected at type-check time. 26 new
      tests (320 total). See D-67.
