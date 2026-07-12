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
  - [ ] **NEXT UP:** investigate the node-count sensitivity D-77 flagged
        — the ~7x increase at startpos depth 5 in particular is worth
        understanding before trusting NNUE-based search for real play.
        Leading hypothesis: startpos is exactly eval-symmetric under
        `evaluate()` (score 0), and NNUE's ~2-5cp noise breaks that
        symmetry asymmetrically, changing which branches futility/null-
        move pruning cut — worth confirming with a few more benchmark
        positions before concluding it's benign. Second training
        iteration with search-based relabelling (shallow `alpha_beta()`
        scores instead of raw `evaluate()`) is the natural next step
        after that, once this network is trusted in real search.
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
- [ ] Lazy SMP multi-core search — DEFERRED behind the NNUE
      weight-embedding scoping item above (decided Session 38, see D-74).
      Two genuinely different projects hide under this one name: (a)
      process-level parallelism (N independent OS processes each running
      the existing binary, keep the best result — no transpiler changes,
      doable in a normal session, but no shared TT between workers, so
      no real synergy) vs. (b) real thread-based Lazy SMP (threads
      sharing one TT with intentionally unsynchronized access — the
      actual technique — needs `std::thread` support added to the
      dialect itself, no existing precedent, multi-session commitment).
      Decided against starting the easier-but-weaker (a) as a stopgap —
      this arc hasn't taken the weaker-but-easier path anywhere else and
      shouldn't start here. (b) is real future work, deliberately not
      started until it can be its own dedicated multi-session arc rather
      than squeezed in as "the other option" to NNUE scoping.
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
