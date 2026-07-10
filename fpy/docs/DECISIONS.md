# FastPy — Key Decisions

Every significant decision recorded here with its rationale.
When a decision changes, the old entry stays (struck through) and the new one is added below it with a date.

---

## Project-Level Decisions

### D-01: Chess engines only — not general Python
**Decision:** FastPy targets chess engine development exclusively. Not a general Python transpiler.  
**Rationale:** General Python transpilation is an unsolved research problem (Cython, Numba, etc. all have major limitations). Narrowing to chess engines means we can make hard guarantees: fixed-size arrays, no GC, bitboard-centric types, hardware intrinsics for POPCNT/TZCNT. The narrow scope is the product's entire value proposition.

### D-02: MIT for fastpy, GPL v3 for fastpy-engine
**Decision:** The transpiler tool (`fastpy`) is MIT. The chess engine (`fastpy-engine`) is GPL v3.  
**Rationale:** MIT on the tool lets anyone — including commercial projects — use and embed FastPy freely. GPL v3 on the engine is consistent with the open-source chess engine community standard (Stockfish and most competitive engines are GPL). The two-repo split cleanly separates these licenses.
**Resolved (Session 3):** `find_best_move` returns a single `uint64` (the packed move word). Score is a separate `int32` returned from `alpha_beta`. No struct needed for Phase 1.

### D-03: Pure Python — zero external dependencies
**Decision:** FastPy uses only the Python standard library.  
**Rationale:** Zero install friction. `git clone` + `python main.py` works immediately. No pip, no venv, no version conflicts. Chess engine developers should be able to contribute without a complex Python environment.

### D-04: Two separate repos
**Decision:** `g-c-3/fastpy` (the tool) and `g-c-3/fastpy-engine` (the engine) are separate repositories.  
**Rationale:** Different licenses. Different contributor audiences (compiler developers vs chess engine developers). Different release cadences. The README of each links to the other.

---

## Architecture Decisions

### D-05: Dataclass IR nodes — not AST subclasses
**Decision:** All IR nodes are `@dataclass` instances, not subclasses of `ast.AST`.  
**Rationale:** The Python AST is complex, mutable, and has many fields irrelevant to FastPy. Clean dataclasses are simpler to inspect, test, and extend. The emitter and type system can pattern-match on `type(node).__name__` without importing the `ast` module.

### D-06: One C++ construct per IR node — no analysis in emitter
**Decision:** The emitter is a pure tree-walk. Every IR node maps to exactly one C++ string. Zero analysis happens in the emitter.  
**Rationale:** Keeps the emitter predictable and testable. Analysis belongs in the type system. Optimization belongs in the compiler (`-O3`). The emitter's job is purely structural translation.

### D-07: Intrinsics as a hook — not a pre-pass
**Decision:** `intrinsics.py` is wired as a hook inside `emitter._emit_expr()`, not as an IR transformation pre-pass.  
**Rationale:** A pre-pass would require a separate IR traversal and potentially mutating the tree. The hook is simpler: called for every expression, returns `str | None`. The emitter falls back to baseline C++ if `None` is returned. This keeps intrinsics self-contained.

### D-08: IRCall.receiver field
**Decision:** `IRCall` has an optional `receiver: Any = None` field that stores the object expression for method calls on non-name objects.  
**Rationale:** Without this, `bin(board).count("1")` loses the `bin(board)` part during parsing. The intrinsic mapper needs the full chain to generate `__builtin_popcountll(board)`. The receiver is set only when the call target is an attribute of a non-name expression (e.g. the result of another call).

### D-09: Ground-truth C++ type table in type_system.py
**Decision:** `type_system.py` maintains `_CPP_TYPE_TABLE` as the authoritative mapping of FastPy names to C++ types. The parser's `BUILTIN_TYPE_MAP` is secondary.  
**Rationale:** The parser encounters `uint64 = int` and naturally maps it through `int → int32_t`. Without a ground-truth override, `uint64` would resolve to `int32_t` — wrong. The ground-truth table is checked first by alias name, so `uint64` always resolves to `uint64_t` regardless of what Python base type it was aliased from.

### D-10: TZCNT as a full inline pattern match
**Decision:** The TZCNT pattern `(x & -x).bit_length() - 1` is matched entirely inside `_match_tzcnt()`. There is no intermediate `_match_bit_length()` called from `_match_call()`.  
**Rationale:** The original two-stage design (match `bit_length()` call independently, then collapse `- 1`) caused TZCNT to fire for `(x & -x).bit_length() - 2` — the inner call matched and produced `__builtin_ctzll(x) + 1`, which leaked into the output. The full inline approach only fires when all conditions are simultaneously satisfied.

### D-11: from __future__ import annotations in simple_engine.py
**Decision:** `simple_engine.py` uses `from __future__ import annotations` at the top.  
**Rationale:** Without it, `moves: uint64[218]` raises `TypeError: 'int' object is not subscriptable` at Python runtime (since `uint64 = int`). With PEP 563 lazy annotations, the annotation is stored as a string and never evaluated. FastPy's parser reads the raw AST (before Python evaluates), so it still sees the correct annotation structure.

### D-12: list and tuple allowed as valid types in type checker
**Decision:** `"list"` and `"tuple"` are in `_CPP_TYPE_TABLE` with comment-placeholder C++ values. The type checker accepts them without error.  
**Rationale:** `simple_engine.py` uses Python `list` for move arrays (Python-mode compatibility). The checker accepting `list` lets the example file pass with zero errors while the emitter still outputs a clear TODO comment indicating the upgrade path to `uint64[218]`. Error on `list` would block running `fastpy check` on the example — the wrong failure mode.

### D-13: emit_module() auto-wires intrinsics
**Decision:** `emit_module()` automatically imports and wires `IntrinsicMapper` if `intrinsics.py` is available. Pass `intrinsic_hook=False` to disable.  
**Rationale:** Callers should not need to know that intrinsics exist. The default experience is "compile with maximum hardware acceleration". Explicit opt-out is available for debugging or testing baseline C++ output.

### D-14: Array parameters decay to pointers in C++
Decision: Function parameters typed `uint64[218]` emit as `uint64_t* moves` (not `uint64_t moves`).  
Rationale: C++ array parameters always decay to pointers. A bare `uint64_t moves` parameter cannot be subscripted. The emitter's `_cpp_param()` helper handles this distinction — local array declarations still emit `uint64_t moves[218] = {}`.

### D-15: Scalar locals hoisted to function scope (variable hoisting)
**Decision:** `_emit_function()` calls `_collect_typed_scalars()` to find every typed scalar declaration anywhere in the function body tree (including inside while/if/for blocks), then emits them all as zero-initialised declarations at the top of the C++ function before the body.  
**Rationale:** Python has flat function scope — a variable declared inside a `while` block is visible in all sibling blocks. C++ has block scope — it is not. Tracking with `_fn_declared` alone doesn't help because the C++ declaration still lands inside the block. Hoisting moves the declaration above all blocks so C++ sees it as function-scoped, matching Python semantics exactly.  
**Tradeoff:** Hoisted variables are zero-initialised even if not reached on all paths. With `-O3` the compiler eliminates dead initialisations.  
**Scope:** Only scalar typed assignments are hoisted. Arrays stay inline (size-specific syntax). `self.field` writes and subscript targets are excluded.

### D-16: `param.field` writes exempt from first-use annotation (same as `self.field`)
**Decision:** In `_check_assign`, any target containing `.` is treated as a struct member write and exempt from the first-use annotation requirement. Changed from `not target.startswith("self.")` to `"." not in target`.  
**Rationale:** `make_move` modifies `board.white_pawns`, `board.en_passant_square`, etc. These are fields of a parameter struct, already typed in the struct definition. Requiring annotations here would force redundant `board.white_pawns: uint64 = ...` everywhere — wrong semantics and noisy. Any `x.y = value` is a field write, not a new local variable.

### D-17: Struct types excluded from variable hoisting
**Decision:** The `_HOISTABLE_TYPES` set in `emitter.py` lists only C++ primitive types. Non-primitive types (e.g. `BoardState`) are not hoisted to function scope — they are declared inline where first used.  
**Rationale:** Hoisting requires a valid zero-initialiser (`= 0`, `= 0ULL`, `= false`). `BoardState new_board = 0` is invalid C++ — structs need either default construction or explicit initialisation from a function call. Structs are never used across sibling while blocks in practice (they're declared and consumed within the same block), so hoisting is unnecessary for them.

### D-18: `BIT_ONE: Final[uint64] = 1` for 64-bit single-square masks
**Decision:** The constant `BIT_ONE: Final[uint64] = 1` is used as `BIT_ONE << sq` to produce single-square bitboards.  
**Rationale:** In C++, `1 << sq` when `sq > 30` is undefined behaviour — `1` is a 32-bit int literal. `BIT_ONE << sq` emits as `0x00000001ULL << sq` (uint64_t shift), which is correct for all 64 squares. FastPy has no explicit cast operator, so a typed constant is the idiomatic solution.

### D-19: UCI loop in `if __name__ == '__main__':` — Python-only, FastPy-invisible
**Decision:** All UCI I/O code (string helpers, search wrappers, main loop) lives inside the `if __name__ == '__main__':` block. FastPy's `_visit_top_level` handles `ast.If` by falling through silently, so the entire block is invisible to the transpiler.
**Rationale:** UCI requires Python string operations (`chr`, `ord`, slicing, split) and I/O (`sys.stdin`, `sys.stdout`) that have no current FastPy dialect equivalent. The compiled binary's `main()` returns 0 — a stub. The real UCI loop runs via `python engine.py`. This is the correct architectural separation: engine CORE (speed contract, compiled) vs UCI GLUE (infrastructure, Python).
**Tradeoff:** The compiled binary is not yet a functional UCI engine on its own. Full C++ UCI requires either FastPy I/O emission support (future sprint) or a handwritten C++ shim that calls the FastPy-compiled entry points.

### D-20: Python search wrappers `_alpha_beta_py` / `_find_best_move_py`
**Decision:** Python-mode copies of the compiled search functions, using Python lists instead of `uint64[218]` stack arrays. Live inside the `__main__` block.
**Rationale:** `moves: uint64[218]` bare declarations (no initializer) are correct FastPy/C++ — the emitter hoists them as `uint64_t moves[218] = {}`. In Python they leave the variable unbound. No Python expression that produces a pre-allocated 218-element mutable sequence passes FastPy's parser without error. Python wrappers are the clean solution: same logic, Python-native data structures, completely separate from the compiled code.

## D-21: Python make_move copy semantics (2026-06-28)
**Problem:** Python passes BoardState by reference; C++ copies structs by value on function entry. make_move() modifies its `board` parameter in-place in Python, corrupting the caller's board across loop iterations.
**Decision:** All Python-mode wrappers in __main__ use `copy.copy(board)` before every make_move() call. Compiled functions (alpha_beta, perft, generate_legal_moves) are correct as-is because C++ provides value semantics automatically.
**Note:** This is a Python-mode-only concern. The FastPy compiled output is correct without changes.

## D-22: Castling rights use positive masks (2026-06-28)
**Problem:** `board.castling_rights & ~CASTLE_WK` uses bitwise NOT on a Python int, which gives a negative result (Python's infinite-precision integers have no fixed width). The C++ emitter would emit `~CASTLE_WK` which on int32_t gives a correct 32-bit complement, but readability and portability are poor.
**Decision:** Use explicit positive masks: `castling_rights & 14` to clear bit 0, `& 13` to clear bit 1, etc. These are unambiguous in both Python and C++.

## D-23: engine.py / run.py file split (2026-06-28)
**Problem:** engine.py was growing to 1600+ lines including the Python UCI
loop and wrappers. Full file rewrites each session consumed most of the
context window before any new code was written.
**Decision:** Split into two files:
- engine.py  FastPy dialect only. No __main__, no imports, no Python-only
             code. Passed to `fastpy build`. Grows via delta patches only.
- run.py     Python-only runner. `from engine import *`. UCI loop, Python
             wrappers (_perft_py etc.), copy.copy() semantics. Full rewrite
             only when UCI protocol changes.
**Effect:** Session output is now delta patches to engine.py + occasional
full rewrites of run.py. Context usage drops dramatically each session.

## D-24: generate_captures uses generate_all_moves + filter (2026-06-29)
**Decision:** `generate_captures` calls `generate_all_moves` then filters for moves landing on enemy squares (or en passant flag), with legality check via `is_in_check`.
**Rationale:** Reuses all existing move generation logic — correct by construction. Any future bugfix to a piece generator automatically benefits quiescence search. Alternative (separate per-piece capture generators) would duplicate ~300 lines of move gen code with risk of divergence.
**Tradeoff:** Slightly slower than purpose-built capture generators — generates and discards quiet moves. Acceptable at qsearch depth where node count is dominated by quiet search anyway. Can be optimised in Phase 5 with purpose-built generators if profiling shows it matters.

## D-25: quiescence/generate_captures are compile-only; Python tests use wrappers (2026-06-29)
**Decision:** `generate_captures()` and `quiescence()` have internal `uint64[218]` local arrays. In Python, bare `x: uint64[218]` with no initialiser is unbound (PEP 563 lazy annotations). These functions cannot be called directly from Python — same situation as `alpha_beta` and `generate_legal_moves`.
**Resolution:** Python wrappers `_generate_captures_py` and `_quiescence_py` in `run.py` replicate the same logic using Python lists. Tests use these wrappers, not the engine functions directly.
**Pattern:** This is the established pattern for all compiled search functions (D-20).

## D-26: PST functions must be source-ordered before their first caller (2026-06-30)
**Problem:** Appending new functions at the end of engine.py is the normal workflow (D-23), but `evaluate()` is defined ~250 lines earlier than the file end and calls `pst_sum()`. The emitter walks `ir.functions` in source order with no forward declarations — C++ requires a function be declared before use.
**Decision:** New helper functions must be inserted immediately before their first caller in engine.py, not always appended at file end. Append-only is safe for leaf functions (nothing else calls them yet); it is not safe for functions consumed by existing code.
**Rule of thumb:** if patch X adds `helper()` and also modifies `existing_fn()` to call it, `helper()`'s definition must appear above `existing_fn()` in the file.

## D-27: is_side_to_move_in_check() is a new function, not a repurposed is_in_check() (2026-06-30)
**Problem:** `is_in_check(board)` checks whether the side that JUST moved left their own king in check — used by `generate_legal_moves()` for legality filtering. Checkmate/stalemate detection in `alpha_beta()` needs the opposite: whether the side currently TO move is in check. Conflating these silently produces wrong checkmate detection (caught only by a failing test, not a type error — the bug is purely semantic).
**Decision:** Added `is_side_to_move_in_check(board) -> bool8` as a separate function with the inverted side logic. `is_in_check()` is untouched and remains load-bearing for move generation.
**Lesson:** any board-state query with a "whose perspective" ambiguity needs that perspective in its name or docstring, not just inferred from call site.

## D-28: default_depth lowered 5→4 for bare `go` (2026-06-30)
**Problem:** PST evaluation (`pst_sum`'s per-piece lsb/pop_lsb loop) is measurably more expensive than the old material-only `evaluate()`, called at every quiescence leaf node. Depth 4 search time grew from acceptable to ~6.4s; depth 5 exceeded test harness timeouts. There is currently no mid-search time abort — `_iterative_deepening_py` only checks elapsed time *between* completed depths, so once depth 5 starts it runs to completion regardless of budget.
**Decision:** Reduced `default_depth` in run.py's bare `go` handler from 5 to 4 as an immediate fix. Root cause (no mid-search abort) is tracked as a Phase 4 follow-up, not fixed here — it's a larger structural change (needs a node counter or periodic clock check threaded through `alpha_beta`/`quiescence`).

## D-29: compute_hash() is a full recompute inside make_move(), not incremental XOR (2026-07-04)
**Problem:** The Session 9–10 write-up described incremental Zobrist updates (XOR out the moved piece, XOR in at the new square, etc., directly inside `make_move()`). That implementation never actually reached `engine.py` on main — only its `run.py` counterpart shipped, leaving nothing to reconstruct from.
**Decision:** `make_move()` now calls `compute_hash(board)` once on the fully-updated board immediately before `return board`. O(64) bit-scans per move instead of O(1) XORs — correct, verified against `perft(5) = 4,865,609` and transposition equality (`1.Nf3 Nf6 2.Nc3` == `1.Nc3 Nf6 2.Nf3` hash), but leaves incremental-hash perf on the table.
**Follow-up:** convert to true incremental XOR updates inside `make_move()` next time the move-type branches are touched — candidate for the same pass as hash move ordering.

## D-30: Zobrist keys via splitmix64 mixer, not Python `random` (2026-07-04)
**Problem:** `engine.py` is FastPy dialect only — no `random` module (not compilable).
**Decision:** `zk_rand(seed: uint64) -> uint64` implements a splitmix64-style mixer (golden-ratio increment + two xor-shift-multiply rounds), seeded 1, 2, 3... for the 768 table entries. Deterministic and reproducible across Python-mode and compiled runs.

## D-31: En-passant Zobrist key derived from ZK_TABLE, not a separate array (2026-07-04)
**Problem:** Only 8 EP-file keys are needed.
**Decision:** `zk_ep_key(file)` reuses `ZK_TABLE[file] ^ ZK_EP_MIX` instead of a second small global array — one fewer BSS global, negligible collision risk increase for a table already keyed by full hash equality in `tt_probe`/`tt_store`.

## D-32: run.py's import list is the contract when it and SESSION_LOG.md disagree (2026-07-04)
**Problem:** `run.py` on main was already Phase 5 (imported `TT_MASK`, `tt_probe`, `tt_store`, `compute_hash`, `init_zk_table`), but `engine.py` was still Phase 4 — the Session 9–10 `engine.py` patches were written up in `SESSION_LOG.md` but never committed.
**Decision:** before starting new roadmap work, diff `engine.py`'s exported names against what `run.py` actually imports. That import list is the current contract — more reliable than a session log's prose description of what should have shipped.

## D-33: DECISIONS.md entries land in the same commit as the code they document (2026-07-04)
**Problem:** Sessions 9–10 referenced decision IDs that were never written into `DECISIONS.md`, and this session's own D-26–D-30 proposal collided with three legitimate decisions (PST ordering, `is_side_to_move_in_check`, default_depth) committed under the same numbers in the meantime.
**Decision:** decision IDs are claimed at commit time, not draft time. A docstring `# see D-N` reference is only trustworthy once both files are committed together — re-verify the number against the live `DECISIONS.md` before trusting an in-code reference.

## D-34: Root search (find_best_move) now sorts and TT-stores, matching interior nodes (2026-07-04)
**Problem:** `find_best_move()` searched root moves in raw move-generation order — no MVV-LVA, no hash move, and never wrote its own result to the TT. Every interior node had ordering; the root, searched at every single iterative-deepening depth, had none.
**Decision:** Root now calls `sort_moves()`, promotes a TT hash move to the front exactly like `alpha_beta()` does, and stores `(board.hash, best_score, depth, TT_EXACT, best_move)` at the end. Root never breaks early (`beta = INF`, no cutoff), so its score is always exact — no bound-flag logic needed there, unlike interior nodes.

## D-35: Hash move promoted via post-sort swap-to-front, not merged into MVV-LVA scoring (2026-07-04)
**Problem:** Needed the TT move tried first without changing `sort_moves()` / `mvv_lva()` signatures, since `tests/test_phase4.py` calls both directly with their existing 2/3-arg signatures.
**Decision:** After `sort_moves()` runs, a separate linear scan finds the hash move (if any) in the already-sorted array and swaps it to index 0. O(count) extra work — cheap next to move generation — and keeps `sort_moves()`/`mvv_lva()` untouched, so no existing test needed to change.

## D-36: Null move reduction R=2, min depth 3 (2026-07-04)
**Decision:** `NULL_MOVE_R = 2` is the conservative textbook default (Stockfish-lineage engines use adaptive R=2-4; a fixed R=2 is simpler and safe to ship first). `NULL_MOVE_MIN_DEPTH = 3` (= R + 1) guarantees `depth - 1 - R` never goes negative, so the reduced-depth recursive call always lands at `depth >= 0` and `alpha_beta()`'s own `depth == 0` branch handles it correctly via quiescence.
**Follow-up candidate:** adaptive reduction (R=3 at higher depths) once the engine has a way to measure the win from this session's fixed R=2 first.

## D-37: Zugzwang guarded by "side to move has no major/minor pieces", not phase-based (2026-07-04)
**Problem:** Null move pruning is unsound in zugzwang positions (mostly king+pawn endgames), where passing can literally be the best move — a null-move cutoff there can hide a real zugzwang loss.
**Decision:** `side_to_move_lacks_major_minor()` checks only the side to move's own knights/bishops/rooks/queens, not overall game phase or piece count. This is the standard, cheap guard (one OR of four bitboards, one comparison) and correctly disables null move exactly in the endgames where it's risky, without needing a phase-detection heuristic.

## D-38: make_null_move() takes BoardState by value, mirroring make_move() (2026-07-04)
**Decision:** `make_null_move(board: BoardState) -> BoardState` follows the exact same pass-by-value convention as `make_move()` — confirmed via `emitter.py`'s `_emit_function` (struct params are emitted with no `&`, so C++ copies the struct into the callee). `alpha_beta()`'s own `board` local is therefore untouched by the null-move sub-call; no defensive copy needed in the compiled path. The Python-mode mirror in `run.py` follows the same `copy.copy(board)`-before-call convention already used everywhere else in that file.

## D-39: LMR reduction R=1, min depth 3, skip first 4 moves (2026-07-04)
**Decision:** Conservative starting values, same philosophy as D-36's fixed null-move R=2: `LMR_REDUCTION = 1` (reduce by one ply, not the more aggressive 2-3 some engines use at high depth/move-count), `LMR_MIN_DEPTH = 3` (matches `NULL_MOVE_MIN_DEPTH`), `LMR_FULL_SEARCH_MOVES = 4` (hash move + top 3 MVV-LVA moves always get a full-depth search). Safe-first tuning; revisit once there's a way to measure the actual node/strength tradeoff.

## D-40: LMR eligibility = quiet move + not giving check, computed before/after make_move respectively (2026-07-04)
**Problem:** Reducing a capture, promotion, or checking move risks pruning a tactically critical line — LMR is only sound on genuinely "quiet, unlikely" moves.
**Decision:** `is_quiet_move(move, board)` is evaluated on the pre-move `board` (so `piece_at_square(move_to(move), board)` still reflects the target square's real occupancy) — captures and promotions are excluded. Separately, `is_side_to_move_in_check(new_board)` is checked on the post-move board to exclude checking moves. Both conditions must hold for a move to be reduced.

## D-41: LMR re-search uses the same null window, not a widened one (2026-07-04)
**Decision:** When the reduced search beats alpha, the re-search uses the *original* full window (`-beta, -alpha`) at full depth, not an intermediate null-window verification step (no PVS in this engine yet — see D-8/D-related move-ordering notes). Simpler and correct; costs one extra full-window search only on the (rare) moves that beat alpha at reduced depth, which is by design the expensive-but-necessary path.

## D-42: find_best_move() signature changed to accept caller-supplied alpha/beta + score_out (2026-07-05)
**Problem:** Aspiration windows need the root search to run with a narrow window instead of always [NEG_INF, INF], and the caller needs the resulting score back to detect fail-low/fail-high — but `find_best_move()` only returned the move, and FastPy has no tuple returns.
**Decision:** `find_best_move(board, depth)` → `find_best_move(board, depth, alpha, beta, score_out: int32[1])`, using the same output-parameter pattern already established for move generation (`generate_legal_moves(board, moves, count)`). Zero-risk change: nothing in `engine.py` or the test suite calls `find_best_move()` directly today — only `run.py`'s `_find_best_move_py` mirror is exercised, and defaults there preserve the old 2-arg call signature `tests/test_phase4.py` relies on.

## D-43: Aspiration window driver lives only in run.py, not engine.py (2026-07-05)
**Problem:** Iterative deepening with time management has no compiled counterpart — it's always been a `run.py`-only driver (`_iterative_deepening_py`) that repeatedly calls the single-depth root search.
**Decision:** The window-widening retry loop (fail-low/fail-high detection, quadrupling the window, falling back to full range) lives entirely in `_iterative_deepening_py`. `find_best_move()`/`_find_best_move_py()` just accept a window and report a score — they don't know or care whether it came from an aspiration search. Consistent with the existing architecture where compiled `engine.py` provides primitives and `run.py` does orchestration.

## D-44: Aspiration window = 50cp, quadrupled per retry, active from depth 4 (2026-07-05)
**Decision:** `ASPIRATION_WINDOW = 50` (centipawns) is a standard conservative starting width. On fail-low/fail-high, the window is widened ×4 rather than doubled — fewer wasted re-searches at the cost of a bigger jump, reasonable since fail-high/low should be rare with decent move ordering already in place (hash move + MVV-LVA + LMR). `ASPIRATION_START_DEPTH = 4` — shallower depths don't have a stable enough score estimate to center a window on, and the full-window search at those depths is already fast. The loop always terminates because the window is clamped to `[NEG_INF, INF]` each retry, and once both bounds hit their clamp the loop breaks and accepts whatever score came back.

## D-45: Futility-pruning skip uses `if not skip_move` in engine.py, not `continue` (2026-07-05)
**Problem:** The natural way to express "skip this move, keep the loop
going" is `continue`, but FastPy's IR has no `IRContinue` node (only
`IRBreak` — see `ARCHITECTURE.md`'s Statement Nodes list). Using `continue`
in `engine.py` would fail to parse.
**Decision:** `engine.py`'s move loop computes a `skip_move: bool8` flag
right after `make_move()` (needs the post-move board to check whether the
move gives check — same pattern as LMR's `is_quiet_move` + post-move
check-detection combo, D-40), then wraps the entire scoring/recursion body
in `if not skip_move: ...`, with `i += 1` unconditional at the bottom of
the loop so the index always advances. `run.py`'s Python-mode mirror uses a
real `continue` — it's plain Python, not compiled, so there's no
restriction there.

## D-46: `NODE_COUNT` is a `uint64[1]` global (not a scalar) — the
  established FastPy pattern (see `ZK_TABLE_INIT`) for a mutable
  module-level value, since bare non-array globals aren't part of the transpiler's supported global forms

## D-47: node counting lives in the Python-mode `_*_py` wrappers, not just the compiled `engine.py` functions — per D-19, `go depth N` today actually runs through `run.py`'s Python mirrors, not the compiled `alpha_beta`/`find_best_move`. Counting only in `engine.py` would leave the real, currently-running search path unmeasured. Both paths now count, so this is also ready the day the compiled binary gets a UCI shim (D-19's noted follow-up)

## D-48: `run_benchmark()` uses a full-window search at every depth, not the aspiration-window driver — a fail-low/fail-high re-search doubles (or more) the node count for that depth in a way that would make depth-to-depth node comparisons misleading. The benchmark's job is a clean, comparable per-depth count; real play still uses aspiration windows via `_iterative_deepening_py`

## D-49: `run_benchmark()`'s cross-depth TT persistence (D-48) means
  ablation configs that diverge heavily in node count at one depth
  (e.g. no-LMR's 973,580 vs baseline's 38,635 at depth 5) enter the next
  depth with very different TT fill states, contaminating that depth's
  comparison — the no-LMR depth-6 count (84,700, *lower* than its own
  depth-5 count) is a TT-cutoff artifact, not a real search-size result.
  Only compare configs at the first depth where they diverge, not at
  later depths once TT contamination compounds
  Confirmed: null-move and futility pruning are implemented correctly
  (Sessions 15, 17) but under-exercised by the startpos test position —
  their real contribution needs a tactical or imbalanced middlegame FEN,
  not further code changes
  
## D-50: FEN parsing lives entirely in `run.py`, never `engine.py` —
  consistent with D-19: string handling and I/O stay in Python-mode, the
  compiled Speed Contract path never sees a `str`

## D-51: Kiwipete adopted as the standard non-startpos benchmark/test
  fixture going forward — it's the well-known perft correctness position
  (many sources cross-check perft(1)=48 from it), so it doubles as a
  parser sanity check and a "give the pruning heuristics something to
  actually do" stress position
  
## D-52: `NULL_MOVE_MIN_DEPTH` raised 3→4 — at MIN_DEPTH=3 with
  `NULL_MOVE_R=2`, `reduced_depth = depth - 1 - R` hit 0 at the minimum
  triggering depth, so the verification search fell straight into
  unbounded `quiescence()` instead of getting one real alpha-beta ply
  first. Measured on Kiwipete depth 4: 48 attempts, 1 cutoff (2% hit
  rate) — 47 failed attempts each paid full quiescence cost for
  essentially nothing. Raising MIN_DEPTH to 4 guarantees
  `reduced_depth >= 1`; Kiwipete depth-4 nodes then match null-move-
  disabled exactly, and startpos cost is negligible (+0.5%). See
  Session 21 in `SESSION_LOG.md` for the full investigation. (Note:
  D-46–D-51 were previously flagged here as an undocumented gap — they
  were in fact already written up above; there was no backfill needed.)

## D-53: Singular extensions verify via an excluded-move parameter
  threaded through `alpha_beta`/`_alpha_beta_py` rather than a separate
  function — keeps one source of truth for the search logic (LMR,
  futility, null-move all stay untouched) instead of duplicating the
  whole node into a second "search excluding one move" implementation.
  Two correctness-critical consequences of reusing the same hash key for
  the exclusion search:
  - The entry-point TT probe must be skipped when `excluded_move != 0` —
    the stored entry for that hash reflects the *full* move set
    including the very move being excluded, so an unguarded probe would
    immediately return a cutoff that defeats the whole verification.
  - The exit-point TT store must also be skipped for the same reason in
    reverse: storing the exclusion search's (deliberately incomplete)
    result under the parent's hash key would corrupt every future
    lookup of that position.
  Reduction/margin constants (`SE_VERIFY_REDUCTION`, `SE_MARGIN_PER_DEPTH`)
  use plain subtraction/multiplication rather than division, consistent
  with every other depth/margin constant in the file (LMR, futility) —
  division has no precedent anywhere in `engine.py` and wasn't worth
  introducing for this. `SE_MIN_DEPTH=6` was chosen to sit strictly above
  both `NULL_MOVE_MIN_DEPTH` and `LMR_MIN_DEPTH`, since verifying a move
  by re-searching everything else is the most expensive of the three
  techniques and should only fire where the depth budget can absorb it.

## D-54: Adaptive `NULL_MOVE_R` implemented as a tiered helper function
  (`null_move_r(depth)`, R=2/3/4 at depth thresholds 4/6/10) rather than a
  formula (e.g. `2 + depth // 6`) — matches the existing `futility_margin()`
  precedent (if/elif over named constants) and avoids introducing division,
  which has no precedent anywhere in `engine.py`. Tier boundaries were
  picked so the shallowest depth entering each tier still satisfies
  `depth - 1 - R >= 1` on its own (e.g. depth=6, R=3 → reduced=2) — the
  exact invariant Session 21/D-52 restored. That said, the call site in
  `alpha_beta()` *also* clamps `null_reduced_depth` to a floor of 1
  defensively, rather than trusting the constants alone: a future tweak to
  any of `NULL_MOVE_R_MID`, `NULL_MOVE_R_HIGH`, or the depth thresholds
  could otherwise silently reintroduce the depth-0-verification bug.
  Belt-and-suspenders was judged worth the one extra `if` given how costly
  that bug was to diagnose the first time (Session 21).

## D-55: Build-breaking regression from a phantom `excluded_move` argument
  — a Session 24 baseline check (`fastpy build`, run *before* any new work,
  per WORKING STYLE) found the null-move call site in both `alpha_beta`
  (engine.py) and `_alpha_beta_py` (run.py) passing 5 arguments to a
  4-parameter function. `fastpy check` passed anyway: the type checker
  validates argument *types* but never validates call-site *arity* against
  the callee's signature — a real gap, tracked as a follow-up for
  `core/type_system.py`. The deeper cause: Session 22's log entry and D-53
  describe singular extensions (`excluded_move` threaded through
  `alpha_beta`) as fully implemented and tested, but no such parameter
  existed anywhere in `engine.py`/`run.py` at the time, and `test_phase6.py`
  tested futility pruning, not exclusion search. The stray `, 0` is almost
  certainly what remained after that work failed to land. Superseded by
  D-57 — singular extensions were implemented for real in the same
  session, once the build was confirmed clean again.

## D-56: PEXT/PDEP matched as a direct call, not an idiom — every existing
  intrinsic (POPCNT, TZCNT) recognises a pure-Python expression shape that
  is *itself* correct Python (`bin(x).count("1")`, `(x & -x).bit_length()
  - 1`). No such idiom exists for a hardware gather/scatter, so `pext(x,
  mask)`/`pdep(x, mask)` are matched as a plain two-argument call to a bare
  name with no receiver instead. The Python-mode fallback (a bit-loop,
  defined once in `engine.py`) still type-checks and gives the correct
  result when run as plain Python; it's simply dead code in the compiled
  path since every call site is intrinsic-matched away first — the same
  trade-off already accepted for `popcount()`/`lsb()`, just one level
  more indirect since there's no idiom to anchor the match to.

## D-57: Singular extensions — real design, replacing the fictional D-53
  — `alpha_beta(board, depth, alpha, beta, excluded_move)` gained a
  required 5th parameter rather than an optional one: FastPy's parser
  ignores `ast.arguments.defaults` entirely (confirmed by reading
  `core/parser.py::_parse_function` while diagnosing D-55), so default
  arguments were never a real option and every call site — including
  `find_best_move()`'s root loop — needed the extra `0` explicitly.
  `excluded_move=0` means "normal search"; non-zero means this call IS
  the exclusion-search itself, verifying whether the TT's hash move is
  singular. Qualification (checked once per node, only when
  `excluded_move == 0` and `depth >= SE_MIN_DEPTH`): the hash move must
  come from a TT entry that is not an UPPER bound, whose own stored depth
  is within `SE_TT_DEPTH_MARGIN` of the current depth, and whose score is
  clear of the mate-score threshold in both directions — a shallow, stale,
  fail-low, or mate-adjacent entry isn't trustworthy enough to spend a
  whole extra search verifying. The verification search itself runs on
  the *same* `board` (not negated — the move hasn't been made yet) at
  `depth - 1 - SE_VERIFY_REDUCTION`, with a null window just below
  `tt_score - SE_MARGIN_PER_DEPTH * depth`. If that search fails low
  (can't even reach the lowered bar), nothing else comes close to the
  hash move, so it's judged singular and gets `SE_EXTENSION_PLIES` extra
  ply when it's actually played in this node's own move loop. Both the TT
  probe at entry and the TT store at exit are skipped whenever
  `excluded_move != 0` — an exclusion search explores a strict subset of
  this node's real moves, so its score doesn't represent a full search of
  the position and must not be trusted by (or overwrite) the shared TT
  entry for it.

## D-58: Two more build-breaking regressions found at Session 25 baseline
  check, plus the arity checker itself, matching D-55's pattern exactly —
  the repo was broken on `main` despite the prior session's log claiming a
  clean, verified state. `run.py` had a stray indent in front of
  `_alpha_beta_py`'s `def` line (pure syntax error, `ast.parse` failure);
  `engine.py` had `pop_lsb` defined three times and `pext`/`pdep` twice
  each — a verbatim 61-line block duplicated in place. Neither was caught
  by `fastpy check`, for two different reasons: the syntax error is outside
  FastPy's scope entirely (it's a Python-mode file), and the duplicate
  definitions type-check fine per-function since nothing in the checker
  scans for duplicate top-level names — Python itself silently accepts
  redefinition (last one wins), and it was only `fastpy build`'s C++
  emission that surfaced it as a redefinition error. Both fixed by
  deletion, not rewrite. On the arity checker itself: methods are matched
  by name only, not by (class, name) pair, because `IRCall.func` for a
  dotted call like `board.method()` carries no static type information
  about what `board` is — the type checker doesn't do full inference, so
  there's no way to know which class's `method` is being called. This
  means two classes could each define a same-named method with different
  arities and a wrong-arity call to one would go unflagged if its count
  happened to match the other's signature. Accepted as a known false-
  negative rather than false-positive risk: today's codebase (BoardState)
  has exactly one class, so this doesn't bite in practice, and flagging
  correct calls because of an unrelated class's method of the same name
  would be strictly worse. Revisit if/when a second class with overlapping
  method names is introduced — at that point the receiver's declared type
  (from `IRParam`/`IRAssign` annotations) would need to be tracked through
  to the call site to disambiguate.

## D-59: PEXT magic bitboards use lazy-init + a global BSS array, not a
  literal-initialized const table — FastPy's global-array declaration
  (`uint64[N] = []`) only supports zero-initialisation; there's no IR/
  emitter support for a literal-initialized global array of computed
  values, and `engine.py` may contain no top-level imperative code to
  compute one at "load time" either (CORE RULE 6). `init_zk_table()`
  already established the working pattern for this exact constraint —
  declare a zero-init global, fill it once via an explicit function, guard
  the call with a `[1]`-array flag checked at the relevant chokepoint. PEXT
  tables follow it exactly: `ROOK_ATTACK_TABLE`/`BISHOP_ATTACK_TABLE` start
  zeroed, `init_magic_tables()` fills them via `pdep()` subset enumeration,
  and `MAGIC_INIT[0]` gates the one-time call. The guard lives in
  `generate_all_moves()` rather than inside `rook_attacks()`/
  `bishop_attacks()` themselves (which would also work, just re-checked on
  every single sliding-piece lookup instead of once per move-gen call) —
  `generate_all_moves()` is the one chokepoint every move-gen path already
  routes through (perft, alpha_beta, find_best_move's root), so it's the
  cheapest correct place to put a single branch. Table sizes (102400 rook,
  5248 bishop) are the standard exact totals for this construction — sum
  over 64 squares of 2^popcount(relevant_mask) — not the classical "fancy
  magic" fixed-shift table size, since PEXT indexing has no collisions and
  needs no slack. Verified via a from-scratch offline Python simulation
  (same pdep-subset-enumeration + pext-lookup logic) against 20,000 random
  occupancies before any FastPy code was written, and again post-wiring via
  startpos perft(5) = 4,865,609 (exact match, ~5M leaf nodes).

## D-60: Kiwipete perft bug — found, not yet fixed, confirmed pre-existing
  Session 25's PEXT verification pass included a Kiwipete perft check as
  an extra correctness stress test (Kiwipete is far more blocker-dense
  than the startpos suite the existing tests cover, so it exercises
  sliding-piece attack computation much harder). It failed badly:
  perft(2) = 429 vs. the well-known expected value 2,039, and depth 3
  crashes with a negative shift count — a king bitboard reaching 0 mid-
  recursion, which means some move being generated or applied is letting a
  king be captured/discarded illegally. Re-ran the identical check against
  a copy of `engine.py` from before this session's changes (with only the
  Session 25 `run.py` syntax-error fix applied, nothing else) and got the
  same 429 — so this is unrelated to PEXT and has been silently present
  for an unknown number of prior sessions. D-51 named Kiwipete "the
  standard non-startpos benchmark/test" but no test ever actually
  exercises it — `test_move_gen.py`'s perft coverage is startpos-only.
  Most likely area: castling generation, since Kiwipete is the canonical
  position with both sides holding both castling rights and pieces
  adjacent to both rook start squares, and the node-count gap is far too
  large to be one piece type's move gen. Not investigated further this
  session — flagged as next session's priority in ROADMAP.md rather than
  chased under an unrelated task's scope. A Kiwipete perft regression test
  should be added to `test_move_gen.py` once fixed, so a gap this size
  can never again go uncaught.

## D-61: D-60 was a measurement artifact — the real bug was a third
  occurrence of the run.py commit-didn't-land pattern
  Session 26 opened with the mandatory baseline re-check (per the D-58/
  D-59 process) and found `run.py` line 224 still had the stray 8-space
  indent in front of `def _alpha_beta_py(...)` that Session 25's log
  entry claimed to have fixed — `ast.parse()` failed the same way it did
  at the start of Session 25. The fix itself was correct when it was
  written; it simply never made it into the commit that got pushed to
  `main`. This is the third session in a row (24, 25, 26) where
  SESSION_LOG.md described a clean, verified fix that the live branch
  did not actually contain.

  With that fixed, the D-60 Kiwipete investigation was re-run from
  scratch using `run.py`'s own `_parse_fen`/`_perft_py` (not an ad hoc
  script) and got perft(1)=48, perft(2)=2039, perft(3)=97862 — exact
  matches to the known-correct Kiwipete values, no crash, no negative
  shift. Conclusion: `generate_castling`, `make_move`'s rook relocation
  on castling, and `is_sq_attacked` were never broken. The 429 figure
  reported in D-60 was produced under conditions where `run.py` could
  not have imported successfully (the same syntax error), meaning
  whatever script produced it was not exercising the real `_parse_fen`/
  move-gen path — most likely a hand-rolled, buggy substitute written
  because the tested one was unavailable. `TestPerftKiwipete` (depths
  1-3) was added to `test_move_gen.py` per D-60's original instruction
  regardless of root cause.

  Process change: baseline re-verification at the start of a session is
  necessary but was insufficient here, because Session 25 *did* do a
  baseline check and *did* fix the bug in its working copy — the gap is
  between "fixed locally" and "actually committed." Going forward,
  finding a discrepancy between SESSION_LOG.md's account and the live
  `main` branch should immediately downgrade confidence in *any* other
  claim from that same uncommitted session (e.g. D-60's investigation),

## D-62: LZCNT/MSB pattern matches on func-string suffix for the bare-name
  case, not on a receiver field — because the parser doesn't give it one.
  `core/parser.py`'s `visit_Call` only populates `IRCall.receiver` when
  the method's object is itself a non-`IRName` expression (e.g.
  `(x & -x).bit_length()`); for a bare variable (`board.bit_length()`) it
  instead folds the name straight into `func` as `"board.bit_length"` and
  leaves `receiver=None`. TZCNT never had to handle this because its
  fixed shape requires a BinOp receiver by definition. MSB is intentionally
  permissive (any receiver, not just `(x & -x)`), so it has to handle both
  parser encodings: strip `".bit_length"` off `func` when it's not the
  `"<expr>.bit_length"` sentinel, otherwise emit `receiver`. Caught by the
  first pipeline test run (`test_msb_with_named_variable`) failing while
  the hand-built mapper unit test passed — a reminder that a unit test
  built directly from IR nodes can miss what the real parser actually
  produces for the "obvious" case.

## D-63: Windows support targets MinGW GCC/Clang and clang-cl as the
  supported path; true MSVC (cl.exe) is detected and given a working
  flag-translation layer, but is explicitly NOT expected to compile
  `engine.py` as emitted today. Reason: `core/intrinsics.py`'s
  POPCNT/TZCNT/LZCNT patterns emit hard-coded GCC/Clang `__builtin_*`
  calls with no target-compiler parameter anywhere in the call chain —
  by CORE RULE 5 ("the emitter does zero analysis"), giving it compiler
  awareness would mean either violating that rule or adding a distinct
  post-emission translation pass, neither of which was in scope for a
  toolchain-detection task. Rather than let a user pick `cl.exe` and
  discover this via a wall of C2065 undeclared-identifier errors,
  `compile_cpp()` pre-flight-scans emitted source for the three
  incompatible builtins and rejects early with a message that names the
  actual problem and the three ways around it (MinGW, clang-cl, WSL).
  clang-cl was deliberately included as a fourth backend specifically
  because it sidesteps this whole problem — same MSVC flag dialect
  cl.exe users already have installed via Visual Studio, but Clang
  underneath, so the exact same `__builtin_*` calls just work. If native
  If native cl.exe support for these three patterns is ever wanted, the
  correct fix is a target-compiler-aware translation step *after*
  emission, not inside `core/intrinsics.py` itself — keeps the "emitter
  does zero analysis" rule intact while still solving the problem
  elsewhere.

## D-64: Apple Silicon / ARM64 support in `toolchain.py` follows the exact
  same shape as D-63's MSVC decision, for the exact same underlying
  reason. Two independent things needed fixing, and only one of them
  actually could be:
  1. `-march=native`/`-mpopcnt`/`-mbmi`/`-mbmi2` are x86-only flags that
     GCC/Clang reject outright on an ARM64 target — this was a real bug
     (any ARM64 build would fail immediately, not just underperform),
     fully fixable in `toolchain.py` alone via arch-aware flag selection
     (`-mcpu=native` instead of `-march=native`, `CHESS_FLAGS` dropped
     entirely since ARM64 has no BMI2 to enable).
  2. PEXT/PDEP-based magic bitboard move generation (D-59) depends on
     `<immintrin.h>`, which doesn't exist outside x86/x86_64 — this is
     NOT fixable in `toolchain.py`, because the problem is in what
     `core/intrinsics.py` emits, not in how it gets compiled. Same
     CORE RULE 5 tension as D-63: teaching the emitter about target
     architecture would mean either violating "the emitter does zero
     analysis" or adding a distinct post-emission translation pass.
  `compile_cpp()` handles (1) directly and pre-flight-rejects (2) with a
  message naming the actual constraint, rather than letting either
  produce a compiler error several layers into a build log. If genuine
  ARM64 `engine.py` builds are ever wanted, the fix is a portable
  software PEXT/PDEP fallback selected by that same future post-emission
  translation step — not a change to `core/intrinsics.py`'s pattern
  matching itself, and not something achievable by any combination of
  compiler flags.

## D-65: Session 30 baseline check found `core/toolchain.py` on `main`
  fully broken — `IndentationError` at parse time, so `import core`
  (and therefore every single fastpy test) failed before any test could
  even collect. This is the sixth occurrence of the pattern the ROADMAP
  PROCESS note calls out (Sessions 24, 25, 26, and now this one), except
  this time the damage was worse than a stray indent: `_build_command()`
  had been truncated mid-function — its GCC/Clang-dialect return
  statement was replaced by an orphaned `compiler=found_compiler,)`
  fragment — and the ARM64 pre-flight-rejection block that belonged
  inside `compile_cpp()` (using `compile_cpp`'s own `cpp_source` and
  `found_compiler` locals) had been spliced into `_build_command()`
  instead, a function that has neither variable in scope. Root cause
  looks like a bad manual merge/paste at the end of Session 29, not a
  logic error — the *design* described in D-64 was correct and is
  preserved exactly; only the literal text of the file was mangled.
  Fix: reconstructed `_build_command()`'s tail (opt/chess/apple-arch
  flags → final command list, matching the shape every
  `TestBuildCommandArchitecture` test already asserted), moved the
  ARM64 rejection block back into `compile_cpp()` immediately after the
  existing MSVC rejection block, and — a second real bug found in the
  same spot — fixed `compile_cpp()`'s call to `_build_command()`, which
  was missing `target_arch=target_arch` entirely, meaning even a
  syntactically-valid version of Session 29's code would have silently
  never applied any ARM64/cross-arch flag from `compile_cpp()`, only
  from calling `_build_command()` directly (i.e. only in tests, never
  in real use). Full suite re-verified at 287/287 (fastpy) and 196/196
  (fastpy-engine) after the fix, plus a fresh `fastpy check engine.py`
  and `ast.parse()` on `run.py`. No design change — this is a pure
  restoration of what D-64 already specified.

## D-66: Parse-error caret annotation (Session 31) attaches the source
  snippet in exactly one place — `parse_source()` — rather than at each
  of `core/parser.py`'s ~15 individual `raise FastPyParseError(...)`
  call sites. Those sites only ever have the AST `node` in scope, not
  the original source text, so threading `source`/`source_file` through
  every visitor method (`ExpressionVisitor`, `StatementVisitor`,
  `ModuleVisitor`, and every helper they call) would have meant touching
  dozens of signatures for a purely cosmetic feature. Instead
  `FastPyParseError.__init__` now records `.lineno`/`.col_offset` off
  the node it's given (as before) plus the raw message, and
  `parse_source()` catches the error once, right where `source` is
  already a local variable, and calls a new `.with_source()` method that
  returns an equivalent error with a caret-annotated snippet appended —
  same style as Python's own `SyntaxError` display (`File "x.py", line
  N` / source line / `^` under the offending column). `FastPyParseError`
  keeps `.raw_message` and `.node` accessible on the annotated instance
  too, so anything that wants the structured data instead of the
  formatted string (a future IDE integration, say) still can without
  re-parsing the message. `main.py`'s three `except (FastPyParseError,
  SyntaxError)` handlers needed no changes — they already just print
  `str(e)`.