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
- [ ] **PRIORITY (next session): Kiwipete perft is badly wrong** —
      perft(2) = 429 vs. expected 2,039 on
      `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1`,
      and a deeper search crashes with a negative shift count (a king
      bitboard going empty mid-recursion — something is generating or
      applying an illegal king-losing move). **Confirmed present in the
      pre-Session-25 code too — not caused by the PEXT change.** Never
      caught because no test exercises Kiwipete despite D-51 naming it the
      standard benchmark. Likely in castling generation given Kiwipete's
      both-sides-both-rights setup, but unconfirmed — needs isolation
      before fixing. Add a Kiwipete perft test to `test_move_gen.py`
      regardless of root cause, so this never regresses silently again.
      See D-60.
- [ ] Wire PEXT into bishop/rook move generation via precomputed
      magic-bitboard attack tables (replaces the current ray-fill loops
      in generate_bishops/generate_rooks) — natural next step now that
      the intrinsic exists
- [ ] `__builtin_clzll` for most-significant-bit index
- [ ] Windows support (MSVC/MinGW detection in `toolchain.py`)
- [ ] Apple Silicon cross-compilation flags
- [ ] Better parse error messages (highlight offending source line)
- [ ] Multi-file compilation support
- [ ] `match` statement support (Python 3.10+)
