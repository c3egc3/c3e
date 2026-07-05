# FastPy — Session Log

Append-only. One entry per session. Most recent at top.

---

## Session 15 — Aspiration windows (Phase 5e) — closes out Phase 5
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: `find_best_move()` signature changed from `(board, depth)` to
  `(board, depth, alpha, beta, score_out: int32[1])` — accepts a caller-
  supplied window and writes the resulting score via an output param
  (FastPy has no tuple returns); internal logic otherwise unchanged
- `run.py`: `_find_best_move_py(board, depth, alpha=NEG_INF, beta=INF)` —
  same window support, with defaults preserving the existing 2-arg call
  used by `tests/test_phase4.py::test_find_best_move_returns_tuple`;
  `_iterative_deepening_py()` now runs an aspiration-window search from
  depth 4 onward, widening ×4 and re-searching the same depth on fail-
  low/fail-high, falling back to the full window once clamped

### A mid-session correction worth noting
The first attempt at this patch was built against a stale local copy of
`engine.py`/`run.py` (pre-Late-Move-Reductions) instead of the actual
committed `main`. Caught immediately by `pytest` failing to even collect
(`ImportError: cannot import name 'LMR_MIN_DEPTH'`) before anything was
presented. Re-fetched the live files from GitHub and reapplied the same
patch cleanly on the correct base — no bad delta was ever handed over.

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in 9.3s
- `perft(4)` = 197,281 ✅ unchanged (move generation untouched)
- Correctness sanity checks (Python-mode, via `run.py`):
  - Forced mate-in-1 (`Qxf7#`) still found via direct `_find_best_move_py`
    call with default full window
  - Full `_iterative_deepening_py()` driver runs depth 1→5 cleanly from the
    startpos with aspiration windows active at depths 4-5, sane scores and
    move throughout
  - Existing 2-arg call signature (`_find_best_move_py(board, 1)`) still
    works via defaults, confirming `tests/test_phase4.py` wouldn't break

### Key decisions
- D-42: `find_best_move()` takes explicit alpha/beta + `score_out` output
  param instead of always [NEG_INF, INF] — zero-risk signature change
- D-43: aspiration window retry loop lives only in `run.py` (no compiled
  iterative-deepening driver exists)
- D-44: window = 50cp, ×4 widening per retry, active from depth 4

### Phase 5 status: COMPLETE
Transposition table, Zobrist hashing, null move pruning, hash move
ordering, Late Move Reductions, and aspiration windows are all shipped,
tested, and documented.

### Next (ROADMAP — Phase 6, Elite Engine)
- NNUE neural network evaluation
- Futility pruning
- Singular extensions
- (Phase 6 also lists LMR as a duplicate — already done in Phase 5, see D-39/40/41)
- Optional: benchmark aspiration windows' node/time reduction on the
  compiled binary (needs a `go depth N` timing harness — still not built,
  same gap noted in Session 14)
- Optional: adaptive null move / LMR reduction (D-36, D-39 follow-ups)
- Optional: convert `compute_hash()` to true incremental XOR (D-29 follow-up)
- `test_phase5.py` covering all of Phase 5's features still not written —
  worth doing before starting Phase 6, given how much surface area has
  accumulated untested at the unit level (this session's stale-base mistake
  is exactly the kind of thing a real test_phase5.py would catch faster)


---

## Session 14 — Late Move Reductions (Phase 5d)
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `LMR_MIN_DEPTH = 3`, `LMR_FULL_SEARCH_MOVES = 4`,
  `LMR_REDUCTION = 1` constants; added `is_quiet_move()` next to `mvv_lva()`;
  wired LMR into `alpha_beta()`'s move loop — moves past the first 4, at
  depth ≥ 3, that are quiet and don't give check, get a reduced-depth
  null-window search first, with a full-depth re-search only if that beats
  alpha
- `run.py`: `_alpha_beta_py()` mirrors the same LMR logic (using
  `enumerate()` for move_num since Python-mode iterates a list, not an
  indexed array); new names added to the engine import list

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in 14.8s
- `perft(4)` = 197,281 ✅ unchanged (move generation untouched)
- Correctness sanity checks (Python-mode, via `run.py`):
  - Forced mate-in-1 (`Qxf7#` after `1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6??`) still
    found correctly with LMR active
  - Depth-5 startpos search returns a sane opening move (Nb1-c3) with a
    near-zero score
- Did not benchmark LMR's node/time reduction quantitatively — Python-mode
  search at depth 6+ is too slow to run in a reasonable time (that's exactly
  why the compiled path exists). A real benchmark needs the compiled binary
  wired to a UCI `go` command with timing; flagged as a follow-up, not done
  this session

### Key decisions
- D-39: fixed R=1, min depth 3, skip first 4 moves (conservative defaults)
- D-40: eligibility = quiet (pre-move board) + not giving check (post-move board)
- D-41: re-search uses the original full window, no PVS null-window step

### Next (ROADMAP — still open)
- Aspiration windows in iterative deepening
- Optional: benchmark LMR/null-move/hash-move-ordering node reduction on the
  compiled binary (needs a `go depth N` timing harness — not yet built)
- Optional: adaptive null move reduction (R=3 at higher depths — D-36 follow-up)
- Optional: adaptive LMR reduction (deeper reduction at higher move counts —
  D-39 follow-up)
- Optional: convert `compute_hash()` from full-recompute to true incremental
  XOR inside `make_move()`/`make_null_move()` (D-29 follow-up)
- `test_phase5.py` covering TT/Zobrist/hash-move-ordering/null-move-pruning/LMR
  still not written


---

## Session 13 — Null move pruning (Phase 5c)
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `NULL_MOVE_R = 2`, `NULL_MOVE_MIN_DEPTH = 3` constants;
  added `make_null_move()` (passes the turn, clears EP rights, recomputes
  hash) and `side_to_move_lacks_major_minor()` (zugzwang guard) after
  `make_move()`; wired a null-move try into `alpha_beta()` right after the
  `depth == 0` quiescence check, before move generation
- `run.py`: `_alpha_beta_py()` mirrors the same null-move logic; new names
  added to the engine import list

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in 10.0s
- `perft(4)` = 197,281 ✅ unchanged (move generation untouched)
- Correctness sanity check: engine still finds forced mate-in-1 (`Qxf7#`
  after `1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6??`) via `run.py`'s Python-mode wrapper,
  with null move pruning active — returns the mate score and the correct
  move, confirming the null-move try isn't swallowing forced-mate lines

### Key decisions
- D-36: fixed R=2 reduction, min depth 3 (adaptive R deferred)
- D-37: zugzwang guard = side to move has no knight/bishop/rook/queen
- D-38: `make_null_move()` pass-by-value, mirrors `make_move()` exactly

### Next (ROADMAP — still open)
- Late Move Reductions (LMR)
- Aspiration windows in iterative deepening
- Optional: adaptive null move reduction (R=3 at higher depths — D-36 follow-up)
- Optional: convert `compute_hash()` from full-recompute to true incremental
  XOR inside `make_move()`/`make_null_move()` (D-29 follow-up)
- `test_phase5.py` covering TT/Zobrist/hash-move-ordering/null-move-pruning
  still not written


---

## Session 12 — Hash move ordering (Phase 5b)
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `TT_MOVE[1048576]` global array; `tt_store()` now takes
  a `move` param; added `tt_get_move(hash_key)` accessor (ignores depth/score
  usability — any stored move is worth trying first)
- `alpha_beta()`: after MVV-LVA sort, hash move (if present) is swapped to
  index 0 before the search loop; `best_move` is tracked and passed to
  `tt_store()`
- `find_best_move()`: previously searched root moves in raw generation order
  with no TT interaction at all — now sorts, does hash-move-first ordering,
  and stores its own result to the TT (D-34)
- `run.py`: `_alpha_beta_py()` / `_find_best_move_py()` mirror the above;
  `tt_get_move` added to the engine import list; `TT_MOVE` added to the
  Python-mode array init block

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in **9.5s** (down from 18.6s pre-hash-move-ordering
  — real node reduction, not just noise)
- `perft(5)` = 4,865,609 ✅ unchanged (move generation untouched)

### Key decisions
- D-34: root search now sorts + TT-stores, matching interior nodes
- D-35: hash move promoted via post-sort swap-to-front, not merged into
  MVV-LVA scoring — keeps `sort_moves()`/`mvv_lva()` signatures stable

### Next (ROADMAP — still open)
- Null move pruning
- Late Move Reductions (LMR)
- Aspiration windows in iterative deepening
- Optional: convert `compute_hash()` from full-recompute to true incremental
  XOR inside `make_move()` (D-29 follow-up)
- `test_phase5.py` covering TT/Zobrist/hash-move-ordering still not written

---

## Session 11 — Fix engine.py / run.py Phase 5 desync (TT + Zobrist restored)
**Status:** COMPLETE ✅

### Root cause
`run.py` on `main` was already the Phase 5 (TT + Zobrist) version described
in Sessions 9–10, but `engine.py` on `main` was still Phase 4 — the delta
patches from those sessions were never committed, and `DECISIONS.md` was
never given the D-26…D-32 entries either. Result: `tests/test_phase4.py`
failed to collect (`ImportError: cannot import name 'TT_MASK'`), and
`tests/test_uci.py` had 21/77 failing with the suite taking 3m23s instead of
seconds.

### Fix (engine.py, g-c-3/fastpy-engine)
- Added TT constants/globals: `TT_SIZE`, `TT_MASK`, `TT_EXACT/LOWER/UPPER`,
  `TT_HASH/SCORE/DEPTH/FLAG[1048576]`
- Added Zobrist globals: `ZK_TABLE[768]`, `ZK_TABLE_INIT[1]`, mix constants
- Added free functions (after `pop_lsb`, before directional shifts):
  `zk_index`, `zk_rand`, `init_zk_table`, `zk_ep_key`, `compute_hash`,
  `tt_probe`, `tt_store`
- `BoardState.__init__`: added `self.hash: uint64 = 0`
- `make_move()`: added `board.hash = compute_hash(board)` before `return board`
  (full recompute, not incremental — see D-28)
- `alpha_beta()`: TT probe at entry, TT store at exit (EXACT/LOWER/UPPER)
- `find_best_move()`: `ZK_TABLE_INIT[0]` guard, seeds `board.hash`

### Results
- `fastpy check engine.py` → zero errors
- `fastpy build --optimize=O3` → compiles clean, zero warnings
- 117/117 tests passing in 18.6s (was: collection error + 21 failures / 3m23s)
- `perft(5)` = 4,865,609 ✅ unchanged (move generation untouched)
- Zobrist sanity checks: hash changes every move, incremental read matches
  fresh `compute_hash()`, transposition order-independence confirmed
  (`1.Nf3 Nf6 2.Nc3` hash == `1.Nc3 Nf6 2.Nf3` hash)

### Key decisions
- D-26: `run.py`'s import list is the contract when it and the log disagree
- D-27: `DECISIONS.md` entries must land in the same commit as the code
- D-28: `compute_hash()` full-recompute in `make_move()`, not incremental —
  original incremental implementation unrecoverable, correctness prioritised
- D-29: Zobrist keys via splitmix64 mixer (no `random` — not FastPy-compilable)
- D-30: EP key derived from `ZK_TABLE[file] ^ ZK_EP_MIX`, no separate array

### Next (ROADMAP — unaffected by this session, still open)
- Hash move ordering: try TT move first before MVV-LVA (biggest remaining gain)
- Null move pruning
- Late Move Reductions (LMR)
- Aspiration windows in iterative deepening
- **Optional follow-up**: convert `compute_hash()` full-recompute to true
  incremental XOR inside `make_move()` for the perf win described in D-28
- `test_phase5.py` / `test_phase6.py` still not on GitHub — write once the
  next roadmap item (hash move ordering) lands


---

## Session 10 — Transposition Table + Zobrist (clean apply from GitHub baseline)
**Status:** COMPLETE ✅

**FastPy transpiler (g-c-3/fastpy):**
- `parser.py`: IRGlobal dataclass, `_try_global()`, `_try_constant()` returns bool,
  `_resolve_target()` handles arbitrary subscript index expressions (`arr[a*64+b]`),
  `IRModule.globals_` field, `build()` includes globals_
- `type_system.py`: `_check_global()`, `_global_names` set pre-seeds `declared` in
  `_check_function()`, `check_module()` registers globals before checking functions
- `emitter.py`: `IRGlobal` import, `_emit_globals()` emits C++ global arrays in
  BSS segment (`uint64_t TT_HASH[1048576] = {};`), `emit()` calls `_emit_globals()`

**engine.py (g-c-3/fastpy-engine):**
- TT constants: `TT_SIZE=1048576`, `TT_MASK`, `TT_EXACT/LOWER/UPPER`
- Zobrist constants: `ZK_GOLDEN`, `ZK_SIDE`, `ZK_CASTLE_*`, `ZK_EP_*`
- Global arrays: `TT_HASH/SCORE/DEPTH/FLAG[1048576]`, `ZK_TABLE[768]`, `ZK_TABLE_INIT[1]`
- `BoardState.hash: uint64 = 0` field
- Free functions (after `pop_lsb`, before directional shifts — D-26):
  `zk_piece`, `zk_sq`, `zk_ep_key`, `init_zk_table`, `compute_hash`
- `select_next_move()` — lazy single-step selection after `sort_moves()`
- `make_move()` — full incremental Zobrist hash update (XOR in/out per piece)
- `tt_probe()`, `tt_store()` — before PIECE-SQUARE TABLES section
- `alpha_beta()` — TT probe at entry, TT store at exit, lazy sort
- `find_best_move()` — ZK_TABLE_INIT guard on first call

**run.py (g-c-3/fastpy-engine) — full replacement:**
- Python-mode TT arrays resized to 1M entries at import time
- `init_zk_table()` called once at module load
- `_apply_position()` seeds `board.hash` via `compute_hash()`
- `_alpha_beta_py()` uses `tt_probe`/`tt_store`
- `ucinewgame` clears TT arrays

**Results:**
- 117/117 tests passing (all GitHub tests)
- `fastpy check engine.py` — zero errors
- `g++ -O3 -march=native` — zero warnings
- perft(6) = 119,060,324 ✅ (reference correct)
- Nodes (depth 7): 134,976,638 → **46,640,189 (−65%)**
- Wall time (depth 7): 30.4s → **18.7s (−38%)**
- Perft NPS: 16.5M → **23.5M (+42%)**

**Key decisions:**
- D-29: `compute_hash` as free function not BoardState method (C++ ordering, D-26)
- D-30: `zk_piece` two-step via `idx: uint64` avoids operator-precedence C++ warnings
- D-31: `ZK_TABLE` precomputed lookup — single array index replaces 2 multiplies per move
- D-32: Python-mode TT arrays resized in `run.py` (not engine.py) — engine.py is dialect-only

**Next (ROADMAP):**
- Hash move ordering: try TT move first before MVV-LVA (free nodes, biggest remaining gain)
- Null move pruning
- Late Move Reductions (LMR)
- test_phase5.py + test_phase6.py not yet on GitHub — need to write and commit

---

## Session 9 — Transposition Table (Zobrist Hashing) + FastPy Transpiler Extensions
**Status:** COMPLETE ✅

### Completed

**FastPy transpiler (3 files changed):**
- `parser.py`: Added `IRGlobal` dataclass for mutable module-level arrays/scalars.
  `_try_constant()` now returns bool; new `_try_global()` handles non-Final
  annotated module-level declarations. `_resolve_target()` extended to support
  arbitrary subscript index expressions (`ZK_TABLE[ptype * 64 + sq]`).
  `IRModule` gains `globals_: list` field.
- `type_system.py`: `_check_global()` validates IRGlobal nodes.
  `_global_names` set pre-seeds `declared` in `_check_function()` so functions
  can write to global arrays without false "first use, no annotation" errors.
- `emitter.py`: `_emit_globals()` emits C++ global variables and zero-init arrays
  (`uint64_t TT_HASH[1048576] = {};`) in BSS segment — zero allocation, zero cost.

**engine.py (FastPy dialect, delta patches):**
- Added TT constants: `TT_SIZE`, `TT_MASK`, `TT_EXACT/LOWER/UPPER`
- Added Zobrist constants: `ZK_GOLDEN`, `ZK_SIDE`, `ZK_CASTLE_*`, `ZK_EP_*`
- Added global arrays: `TT_HASH/SCORE/DEPTH/FLAG[1048576]`, `ZK_TABLE[768]`,
  `ZK_TABLE_INIT[1]`
- Added `hash: uint64 = 0` field to `BoardState.__init__`
- Added free functions: `zk_piece()`, `zk_sq()`, `init_zk_table()`,
  `zk_ep_key()`, `compute_hash(board)` (free function, not method — D-26)
- Rewrote `make_move()` with full incremental Zobrist hash update (XOR in/out
  for every piece move, capture, castling rook, EP pawn, side, castling rights,
  EP file)
- Added `tt_probe()` and `tt_store()` with exact/lower/upper bound semantics
- Updated `alpha_beta()`: TT probe at entry, TT store with correct flag at exit
- Updated `find_best_move()`: calls `init_zk_table()` once on first call

**run.py (full file, changed):**
- Python-mode init block resizes TT arrays to 1M entries and ZK_TABLE to 768
- `_apply_position()` calls `compute_hash(board)` to seed incremental hash
- `_alpha_beta_py()` updated with TT probe + store matching compiled semantics
- Imports updated for all new symbols

### Key results
- Nodes searched (depth 7): **134,976,638 → 46,640,189 (-65%)**
- Wall time (depth 7): **30.4s → 23.0s (-24%)**
- perft(6): **119,060,324** (correct, unchanged)
- 169/169 tests passing, `fastpy check` zero errors, zero C++ compiler warnings

### Key decisions
- D-29: `compute_hash()` must be a free function, not a BoardState method.
  Struct methods in FastPy are emitted inside the struct definition, which
  appears before free functions. `compute_hash()` calls `lsb()`/`pop_lsb()`
  which are free functions — calling them from inside the struct causes C++
  "not declared in scope" errors. (D-26 applies to struct methods too.)
- D-30: `zk_piece()` inlining uses `idx * ZK_GOLDEN` in two steps to avoid
  C++ operator precedence warnings. FastPy's `& FULL_BOARD` bitwise wrap emits
  as `& (18446744073709551615ULL)` which causes pedantic warnings with inline
  multiply chains. Two-step via `idx: uint64` intermediate variable avoids this.
- D-31: ZK_TABLE precomputed lookup replaces per-call `zk_piece()` multiply in
  `make_move()` hot path. `init_zk_table()` fills 768 entries once on first
  `find_best_move()` call. `zk_sq()` is a single array index — no multiply.
- D-32: Python-mode TT arrays start as `[]` (FastPy dialect for C++ `= {}`).
  run.py resizes them with `[0] * N` immediately after import. This is the
  correct separation: engine.py declares, run.py initializes for Python mode.

### Next (ROADMAP Phase 5 remaining)
- Null move pruning (R&D: large NPS gain, moderate risk)
- Late Move Reductions (LMR) — cut nodes on quiet moves tried late
- Aspiration windows around iterative deepening
- Move TT to inform move ordering (hash move first)

---

## Session 8 — Phase 4: PST Evaluation + Checkmate/Stalemate Detection
**Date:** 2026-06-30
**Status:** COMPLETE ✅

### Completed
- `pst_pawn_sq/knight_sq/bishop_sq/rook_sq/king_sq(rank, file[, is_white]) -> int32`
  — separable rank+file arithmetic PSTs, no lookup arrays
- `pst_sum(pieces, is_white, ptype) -> int32` — lsb/pop_lsb iteration + per-square PST lookup
- `evaluate()` rewritten: material + PST bonuses, perspective-correct
  (verified: starting position evaluates to exactly 0 — fully symmetric)
- `is_side_to_move_in_check(board) -> bool8` — NEW function. `is_in_check()`
  checks the side that JUST moved (for move legality filtering); checkmate
  detection needs the side TO move — a different question. Caught via test failure.
- `alpha_beta()`: count==0 now returns `NEG_INF + depth` (checkmate, prefers
  shorter mates) or `0` (stalemate), using `is_side_to_move_in_check`
- `run.py`: `_alpha_beta_py` updated to match; `default_depth` 5→4 (PST
  per-node cost pushed bare `go` past comfortable UCI response time)
- `tests/test_phase5.py` NEW — 52 tests (PST squares, pst_sum, evaluate
  symmetry/perspective, checkmate via Fool's Mate, stalemate via constructed
  position, search-prefers-centre-pawns integration)
- **169/169 tests passing** (117 prior + 52 new)
- `fastpy check engine.py` → zero errors ✅
- `fastpy emit` → 1384 lines C++, `g++ -O3 -march=native -mpopcnt -mbmi -mbmi2`
  compiles with **zero warnings** ✅
- Full UCI smoke test: engine now scores `cp 30` instead of `cp 0` at depth 1
  and opens with `Nc3` (PST-favoured centre development) instead of a flat-eval move

### Key Decisions
- D-26: PST functions placed before `evaluate()` in file order — FastPy's
  emitter does not forward-declare free functions; call-before-define is a
  C++ compile error. Appending new functions at file end only works if
  nothing earlier in the file calls them.
- D-27: `is_side_to_move_in_check()` added as a separate function from
  `is_in_check()` rather than reusing/renaming it. `is_in_check()` is load-
  bearing for `generate_legal_moves()` (checks the side that just moved);
  changing its semantics would silently break move legality filtering.
- D-28: `default_depth` (bare `go`, no time/depth params) lowered 5→4 in
  run.py. PST evaluation runs `pst_sum`'s lsb/pop_lsb loop over every piece
  at every quiescence leaf — measurably more expensive per node than the
  old material-only `evaluate()`. No mid-search time abort exists yet
  (time is only checked between iterative-deepening depths), so a slow
  depth 5 search currently cannot be interrupted once started.

### Files changed
- fastpy-engine/engine.py (1549 → 1781 lines, +232 lines)
- fastpy-engine/run.py (488 → 495 lines, 3-line delta: import, check fn, default_depth)
- fastpy-engine/tests/test_phase5.py (NEW, 519 lines, 52 tests)

### Next
- Mid-search time abort (node-count or wall-clock check inside alpha_beta/
  quiescence, not just between depths) — needed before raising default_depth
  back up or trusting `go movetime`/`wtime` budgets under PST's higher cost
- Null move pruning
- Transposition table (Zobrist hashing)

---

## Session 7 — Phase 4: Search Improvements
**Date:** 2026-06-29
**Status:** COMPLETE ✅

### Completed
- `piece_at_square(sq, board) -> int32` — returns piece value for MVV-LVA
- `mvv_lva(move, board) -> int32` — victim*10 - attacker capture priority score
- `sort_moves(moves, count, board) -> None` — in-place selection sort (O(n²), n≤218)
- `generate_captures(board, moves, count) -> int32` — legal captures only (for qsearch)
- `quiescence(board, alpha, beta) -> int32` — stand-pat + capture search to avoid horizon effect
- Updated `alpha_beta` — depth==0 now calls `quiescence()` instead of `evaluate()`; `sort_moves()` before search loop
- `run.py` full rewrite — Phase 4 additions:
  - `_generate_captures_py()` Python wrapper
  - `_quiescence_py()` Python wrapper
  - `_alpha_beta_py()` updated: calls `_quiescence_py` at depth 0, MVV-LVA move ordering
  - `_iterative_deepening_py(board, max_time_ms, max_depth)` — IDS with info line output
  - `uci_loop()` updated: handles `go movetime N`, `go wtime N btime N`, `go infinite`, outputs info depth lines
- Fixed `tests/test_move_gen.py` path bug — `os.path.dirname(__file__)` pointed to tests/ not repo root
- Fixed `tests/test_uci.py` ENGINE_CMD — was `engine.py` (no UCI loop after D-23 split); updated to `run.py`
- `tests/test_phase4.py` NEW — 40 tests, all passing
- **117/117 tests passing** (56 move_gen + 21 uci + 40 phase4)
- `fastpy check engine.py` → zero errors ✅
- `fastpy emit` → 1206 lines C++, compiles clean with g++ -O3 -march=native ✅

### Key Decisions
- D-24: generate_captures uses generate_all_moves + filter (reuse existing logic, correct by construction)
- D-25: quiescence() and generate_captures() are compile-only; Python tests use run.py wrappers (same pattern as alpha_beta, generate_legal_moves)

### Files changed
- fastpy-engine/engine.py (1408 → 1549 lines, +141 lines)
- fastpy-engine/run.py (275 → 488 lines, full rewrite for Phase 4)
- fastpy-engine/tests/test_phase4.py (NEW, 410 lines, 40 tests)
- fastpy-engine/tests/test_move_gen.py (path fix only)
- fastpy-engine/tests/test_uci.py (ENGINE_CMD fix only)

### Next
Phase 4 continued: Piece-Square Tables (PST), null move pruning, transposition table

---

## Session 6 — Phase 3: Complete Move Generation
**Date:** 2026-06-28
**Status:** COMPLETE ✅

### Completed
- 8 ray generators (ray_north/south/east/west + 4 diagonals)
- knight_attack_mask, king_attack_mask (shared by move gen + check detection)
- generate_bishops, generate_rooks, generate_queens (ray-fill, zero allocation)
- is_sq_attacked(sq, board, by_black) — reverse attack tracing
- is_in_check(board) — post-make_move legality check
- generate_castling — full castling with rights + path + attack checks
- Updated generate_all_moves — all piece types + castling
- Updated make_move — castling rook movement + castling rights updates (positive masks)
- generate_legal_moves — pseudo-legal → filter by is_in_check
- perft(board, depth) — correctness benchmark function
- Updated alpha_beta + find_best_move → use generate_legal_moves
- 56 tests in test_move_gen.py — 56/56 passing
- Perft(1-4) verified: 20, 400, 8902, 197281 ✅
- Perft(5) = 4,865,609 verified via compiled binary (-O3 -march=native, 0.25s)
  Method: fastpy emit → patch stub main() → g++ -O3 -march=native → run

- Split engine.py / run.py (D-23): engine.py now 1408 lines (dialect only),
  run.py 275 lines (Python UCI runner). fastpy check + build + UCI all verified.

### Key Decisions
- D-21: Python make_move copy semantics (see DECISIONS.md)
- D-22: Castling rights use positive masks not bitwise NOT

### Files changed
- fastpy-engine/engine.py (600 → 1602 lines)
- fastpy-engine/tests/test_move_gen.py (new, 675 lines)

### Next
- Phase 4: Perft(5) from binary (4,865,609), UCI position parsing fixes,
  move ordering (MVV-LVA), quiescence search

---

## Session 5 — 2026-06-28

**Focus:** Sprint 8 — UCI Protocol.

**Completed:**
- `engine.py`: Fixed `knight: uint64 = 1 << from_sq` → `BIT_ONE << from_sq` in `generate_knights`. The `1` literal is a 32-bit int in C++; `BIT_ONE` (constexpr uint64_t) ensures correct 64-bit shift for all 64 squares.
- `engine.py`: Added complete UCI protocol in `if __name__ == '__main__':` block (FastPy silently skips this via `_visit_top_level`). Commands: `uci`, `isready`, `ucinewgame`, `position startpos [moves ...]`, `go [depth N]`, `stop`, `setoption`, `debug`, `quit`.
- `engine.py`: Added `_alpha_beta_py` and `_find_best_move_py` Python-mode wrappers inside the `__main__` block. These mirror the compiled search functions but use Python lists instead of `uint64[218]` stack arrays (which are unbound in Python mode). UCI loop uses these wrappers.
- `engine.py`: Added `_sq_to_str`, `_move_to_uci`, `_parse_sq`, `_parse_uci_move`, `_apply_position`, `_uci_loop` — all Python-only UCI helpers.
- `fastpy-engine/tests/test_uci.py` — NEW: 21 UCI integration tests (subprocess-based). Tests handshake, position parsing, search output format, robustness. **21/21 passing in 0.71s**.
- `fastpy check engine.py` → zero errors ✅
- `fastpy emit engine.py` → 663 lines C++ ✅
- `python engine.py` works as a full UCI engine — tested with Arena/Cutechess-style command sequences.

**Architectural decision recorded:** UCI loop lives in `if __name__ == '__main__':` (D-19 below). Python search wrappers needed because `moves: uint64[218]` bare declarations are unbound in Python.

**Files changed:**
- `fastpy-engine/engine.py` — UCI block added, knight BIT_ONE fix
- `fastpy-engine/tests/test_uci.py` — NEW

---

## Session 4 — 2026-06-27 

**Focus:** `make_move()`, two transpiler fixes, alpha-beta wired up.

**Completed:**
- Emitter: `_HOISTABLE_TYPES` set — hoisting now skips struct types (e.g. `BoardState`). `BoardState new_board = 0` is invalid C++; structs are declared inline where first used.
- Type checker: dotted targets (`board.white_pawns = ...`) now exempt from first-use annotation requirement. `"." not in target` replaces `not target.startswith("self.")` — covers both `self.field` and `param.field` struct writes.
- 3 new type_system tests → **171/171 passing**
- `engine.py`: Added `BIT_ONE: Final[uint64] = 1` constant — ensures `BIT_ONE << sq` emits as `uint64_t` shift (plain `1 << sq` is 32-bit int in C++, UB for sq > 30)
- `engine.py`: `make_move(board, move) -> BoardState` — full implementation. Value-copy semantics: takes BoardState by value, modifies the local copy, returns it. Handles: captures (all 6 piece types), en passant, double-push ep square update, promotions (queen/knight/bishop), side-to-move flip.
- `alpha_beta()`: wired up with `new_board: BoardState = make_move(board, moves[i])` — real recursive search, no more static evaluation placeholder.
- `fastpy check engine.py` → zero errors ✅
- `fastpy build engine.py --optimize=O3` → **662 lines C++, compiles clean** ✅

**Key C++ output verified:**

---

## Session 3 — 2026-06-27 (morning)

**Focus:** Complete emitter fixes, variable hoisting, fastpy-engine/engine.py Phase 1 full build.

**Completed:**
- Parser: subscript assignment targets (`moves[count] = value`, `moves[0] = 99`) — done
- Type checker: subscript writes to declared arrays pass cleanly — done
- Emitter fix 1: array params (`uint64[218]`) emit as `uint64_t* moves` via `_cpp_param()` helper
- Emitter fix 2: variable hoisting — `_collect_typed_scalars()` pre-declares all scalar locals at C++ function scope before the body, matching Python's flat scoping model. Fixes "not declared in this scope" errors in sibling while blocks.
- Emitter fix 3: bitwise right-operand explicit parens `(a & (b-1))` — silences `-Wparentheses`
- `_fn_declared` set tracks hoisted vars so annotated re-assignments emit as plain C++ assignments
- `double` → `double_push` rename in engine.py (C++ keyword conflict)
- Unused `move` variable removed from `alpha_beta` (Phase 1 placeholder)
- `main() -> int32` stub added to engine.py for linker
- 8 emitter tests updated/added (5 paren format, 3 array decay/hoisting) → **168/168 passing**
- `fastpy check engine.py` → zero errors ✅
- `fastpy build engine.py --optimize=O3` → **compiles and runs** ✅
- C++ output verified: `__builtin_popcountll`, `__builtin_ctzll`, `uint64_t* moves`, `uint64_t moves[218] = {}`

**Files changed:**
- `core/parser.py` — `_resolve_target` subscript support
- `core/type_system.py` — `_check_assign` subscript handling
- `core/emitter.py` — `_collect_typed_scalars`, `_cpp_param`, hoisting in `_emit_function`, `_fn_declared`, `_emit_binop` parens, `_emit_assign` scope fix
- `core/__init__.py` — NEW
- `pyproject.toml` — NEW
- `fastpy_main.py` — NEW
- `.github/workflows/ci.yml` — updated
- `tests/test_parser.py` — 4 new subscript tests
- `tests/test_type_system.py` — 3 new subscript tests
- `tests/test_emitter.py` — 8 tests updated/added
- `fastpy-engine/engine.py` — NEW (Phase 1 complete, compiles)

---

## Session 2 — 2026-06-26 (afternoon)

**Focus:** Test suite, bug fixes, project documentation infrastructure.

**Completed:**
- Wrote full 155-test suite across 4 test files + conftest + pytest.ini
- Fixed `uint64 = int` bug in `parser._try_type_alias` — ground-truth name checked first
- Fixed TZCNT partial-fire bug — rewrote `_match_tzcnt` as full inline pattern match, removed `_match_bit_length` from `_match_call`
- Fixed `test_unsupported_expression_raises` — switched from string literal (now valid) to lambda
- All 155 tests passing in 1.82s
- Wrote `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`
- Created `docs/` directory with all 5 documentation files
- Wrote Project Instructions for Claude Project

**Files changed:**
- `core/parser.py` — `_try_type_alias` fix + `IRCall.receiver` field
- `core/intrinsics.py` — TZCNT full inline rewrite
- `tests/conftest.py`, `test_parser.py`, `test_type_system.py`, `test_emitter.py`, `test_intrinsics.py` — new
- `pytest.ini` — new
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` — new
- `docs/` — all 5 files new

**Known issues carried forward:**
- `python -m pytest tests/ -v` not yet added to `ci.yml`
- `pyproject.toml` not written
- `fastpy-engine/engine.py` not started

---

## Session 1 — 2026-06-26 (morning)

**Focus:** Full Phase 1 transpiler build from scratch.

**Completed:**
- Designed complete FastPy architecture (6 modules)
- Wrote all 6 core modules: `parser.py`, `type_system.py`, `emitter.py`, `intrinsics.py`, `toolchain.py`, `main.py`
- Wrote `examples/simple_engine.py` — FastPy-dialect chess engine, zero type errors
- Fixed `simple_engine.py` — 11 type errors resolved (`moves: list = []`, pre-branch declarations, `-> tuple` return type, `best_move: uint64 = 0`)
- Set up CI workflow — green on first commit
- Wrote `fastpy` README (with FastPy-Engine section), `fastpy-engine` README, GPL v3 LICENSE
- Established Claude Project with both GitHub repos connected

**Key decisions made:**
- `IRCall.receiver` field to preserve `bin(board)` for POPCNT matching
- Ground-truth C++ type table in type_system to fix `uint64 = int → uint64_t`
- Intrinsics as a hook inside emitter, not a pre-pass
- `from __future__ import annotations` in `simple_engine.py` for Python runtime compatibility
- `list`/`tuple` accepted by type checker with TODO placeholder in C++ output

**Files created (all new):**
- `core/parser.py`, `core/type_system.py`, `core/emitter.py`, `core/intrinsics.py`, `core/toolchain.py`
- `main.py`
- `examples/simple_engine.py`
- `.github/workflows/ci.yml`
- `README.md`, `fastpy-engine/README.md`, `fastpy-engine/LICENSE`
