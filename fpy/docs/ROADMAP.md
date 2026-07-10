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

- [ ] NNUE neural network evaluation
- [x] Futility pruning
- [x] `go depth N` timing harness (node counting + NPS reporting, Session 18)
- [x] Singular extensions (Session 24) — excluded-move verification search
      at depth >= SE_MIN_DEPTH=6, one extra ply for a hash move that
      fails low against everything else. Re-implemented from scratch;
      the Session 22 log/D-53 description of this was never actually
      committed to the code (see D-55). See D-57 for the real design.
- [ ] Lazy SMP multi-core search
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
- [ ] Multi-file compilation support
- [ ] `match` statement support (Python 3.10+)
