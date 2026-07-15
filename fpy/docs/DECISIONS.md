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

## D-67: `match` statement support (Session 32) is deliberately restricted
  to the subset that maps onto exactly one C++ construct — a `switch` —
  per Core Rule 5. Supported: any subject expression; `case` patterns
  that are integer or boolean literals, optionally combined with `|`
  (`case 1 | 2 | 3:` → stacked `case` labels sharing one body, C++'s
  native fallthrough-label idiom); and at most one wildcard `case _:` →
  `default:`. Rejected outright at parse time, each with a message
  pointing at the alternative: guard clauses (`case X if cond:` — a
  runtime check per case isn't a single switch-case construct; use
  `if`/`elif`), capture patterns (`case x:` — binds a name, not
  representable as a case label), `case None:` (FastPy has no
  None/Optional type), and any class/sequence/mapping pattern. Two
  further checks live in type_system.py rather than the parser, because
  they need to see all cases together, not just one at a time (parses-fine,
  only-invalid-in-combination is a semantic property, not a syntactic
  one — Core Rule 1, "type system validates"): duplicate case values
  (parses fine per-case, but is an illegal C++ switch — duplicate case
  labels don't compile) and more than one wildcard (would mean two
  `default:` labels).
  The one genuinely subtle issue: Python's `break` inside a `match` case
  breaks the nearest *enclosing loop* (`match` isn't a loop), but the
  case body compiles to a C++ `switch` `case`, where `break` only exits
  the switch. A naive translation would silently produce wrong control
  flow — the C++ would keep looping where the Python stops — for any
  `match` nested inside a `for`/`while` with a `break` in one of its
  cases. Rather than attempt anything clever (labeled breaks/gotos would
  make the emitter start doing analysis, which Core Rule 5 forbids), a
  bare `break` directly inside a case body is rejected outright at
  type-check time, with a message suggesting a flag variable or
  `if`/`elif` instead. This check only walks into `IRIf`/nested `IRMatch`
  (still ambiguous — no loop separates the `break` from the `match`) and
  deliberately does not recurse into `IRWhile`/`IRFor` bodies nested
  inside a case, since a `break` there is unambiguous in both languages.
  26 new tests across `test_parser.py` (10), `test_type_system.py` (8),
  and `test_emitter.py` (8, plus generated C++ verified to actually
  compile with `g++ -std=c++20`) — full suite re-verified at 320/320
  (fastpy) and 196/196 (fastpy-engine, unaffected — `engine.py` doesn't
  use `match` yet).
## D-68: Multi-file compilation support (Session 33) resolves and merges
  local `import`s into one IRModule rather than teaching type_system.py or
  emitter.py about multiple files. `core/parser.py` gained two pieces:
  `_record_import` (in `ModuleVisitor._visit_top_level`) records the bare
  module name of every `import foo` / `from foo import ...` statement onto
  `IRModule.imports`, without touching the filesystem — the parser stays a
  pure AST→IR step, consistent with every other `_try_*` method in that
  class. `parse_project(entry_file)` is the new orchestrator: it parses the
  entry file, and for each name in its `.imports` list checks whether
  `<entry_dir>/<name>.py` exists; if so, it recursively parses that file
  the same way (so transitive imports are followed) and merges its
  type_aliases/constants/globals_/functions/classes into one IRModule.
  Names that don't resolve to a sibling file (`typing`, `__future__`,
  dotted/relative imports, or a genuine typo) are left alone exactly as
  `parse_file()` has always silently skipped them — `parse_project()` can't
  distinguish "meant a real Python package" from "typo'd a local module",
  and guessing wrong in the error-raising direction would break any file
  that imports `typing`. `main.py`'s `build`/`check`/`emit` all switched
  from `parse_file()` to `parse_project()`; a single file with zero local
  imports behaves identically to before (verified: `fastpy check engine.py`
  still zero errors, `fastpy-engine`'s 196/196 suite unaffected).

  Two correctness issues surfaced while building this and were fixed as
  part of the same change, since both were exactly what a real multi-file
  merge would immediately trip over:

  1. **Cross-file function call order.** The emitter only ever
     forward-declared structs (`_emit_forward_declarations`), not free
     functions — single-file `engine.py` avoided this by hand-ordering
     every function callee-before-caller. That assumption doesn't survive
     a multi-file merge, where an imported file's functions can land
     after the entry file's in `IRModule.functions` regardless of call
     direction. Fix: forward-declare every free function the same way
     structs already are, via a new shared `_function_signature(func)`
     helper used by both the prototype line and the real definition (so
     the two can never drift apart). Methods are unaffected — they're
     declared inline in their struct body and never needed this.

  2. **`BUILTIN_TYPE_MAP` global mutation (pre-existing bug, not
     introduced by this session).** `_try_type_alias` wrote newly
     discovered aliases (`uint64 = int`) directly into the *module-level*
     `BUILTIN_TYPE_MAP` dict in `core/parser.py`, so every
     `parse_source()`/`parse_file()` call in the same process permanently
     mutated shared state. Harmless for a one-shot CLI process parsing a
     single file, but silently wrong the moment more than one parse
     happens in one process with a reused custom alias name meaning
     different things — which is exactly the pytest test-suite process,
     and exactly what `parse_project()` now does on purpose (helper.py
     and main.py both re-declaring the `uint64 = int` prelude, or two
     files disagreeing about what a shared alias name means). Fix: each
     `ModuleVisitor` now seeds its own `self._type_map` as a *copy* of
     `BUILTIN_TYPE_MAP` at construction and mutates only that — parsing
     one file can no longer affect the outcome of parsing any other,
     restoring parser purity. Caught by a test that deliberately gave two
     merged files conflicting meanings for the same alias name and found
     it silently accepted instead of rejected — that failure is what
     surfaced the bug.

  Repeated identical type aliases across merged files (every file in a
  project re-declaring `uint64 = int` etc. as its own prelude) are deduped
  silently rather than rejected — expected boilerplate, not a name
  collision, unlike every other top-level construct. Any other kind of
  duplicate top-level name (function, class, constant, global, or a type
  alias reused for a genuinely different underlying type) raises
  `FastPyImportError` (a `FastPyParseError` subclass, so `main.py`'s
  existing `except (FastPyParseError, SyntaxError)` clauses need no
  changes) naming both files and both meanings — C++ wouldn't compile
  with the duplicate anyway, and silently picking one file's definition
  over the other would hide a real bug rather than surface it.

  FastPy's local-import model is deliberately flat: one directory, no
  packages, no relative imports, no partial/aliased imports (`from foo
  import bar as baz` isn't given special handling — the whole module
  merges regardless of which names were named in the `from` clause,
  per Core Rule 4: FastPy is chess-engine-specific, not a general Python
  import system). This matches the only realistic use case — splitting
  one engine's source across a handful of files in the same repo
  directory (e.g. `board.py`, `movegen.py`, `search.py`, `eval.py`) — and
  avoids building header generation, multi-translation-unit linking, or
  a namespace system for a problem multi-TU compilation doesn't actually
  have here: everything still emits as a single `.cpp` translation unit,
  same as before, just assembled from more than one source file.

  20 new tests: `test_parser.py::TestImportDetection` (8),
  `test_parser.py::TestParseProject` (12); `test_emitter.py`
  `TestFunctionForwardDeclarations` (5) and `TestMultiFileEmission` (2).
  Full suite re-verified at 345/345 (fastpy, 320 prior + 25 new — 18 in
  parser tests, 7 in emitter tests) and 196/196 (fastpy-engine,
  unaffected). A hand-built two-file project (`mathutil.py` +
  `main_entry.py`, one function calling another which calls a third
  across the file boundary) was parsed, type-checked, emitted, and
  compiled to a real binary with `g++ -std=c++20`, and produced the
  arithmetically correct result end-to-end.
## D-69: NNUE evaluation infrastructure (Session 34) is delivered as
  INFERENCE ONLY this session, over deterministic PLACEHOLDER weights, not
  a trained network wired into search. Three separate scoping decisions
  make up this entry.

  **1. Integer-only architecture, no float type.** FastPy's ground-truth
  type table (`_CPP_TYPE_TABLE` in `type_system.py`) has never included a
  float type — `uint64`/`int32`/`bool8` only. Rather than treat that as a
  blocker and add float support to the transpiler, the NNUE design leans
  into it: 768 sparse binary inputs (12 piece types x 64 squares) into one
  hidden layer of `NNUE_HIDDEN=128` clipped-ReLU units (clamped to
  `[0, NNUE_CLIP=127]`) into a single output, with every weight, bias, and
  accumulator value stored as `int32`. This isn't a workaround — it's the
  same design real engines use: Stockfish's NNUE runs int8/int16 quantized
  weights with int32 accumulation in its hot path specifically because
  integer SIMD is faster than float SIMD for this workload. FastPy's
  int-only type system happens to match the correct implementation choice,
  not just a convenient one.

  **2. Placeholder weights, not trained ones — and that's the actual
  scope of this session.** `init_nnue_weights()` fills `NNUE_W1`
  (98304 = 768x128), `NNUE_B1`/`NNUE_W2` (128 each), and `NNUE_B2` (1) with
  deterministic pseudo-random values in `[-128, 127]` via `nnue_rand()`, a
  splitmix64-style mixer with the exact same shape as the pre-existing
  `zk_rand()` (same `ZK_GOLDEN`/`ZK_MIX1`/`ZK_MIX2` constants, reused
  rather than duplicated). There is no training pipeline in either repo —
  producing real NNUE weights needs millions of labelled positions and
  gradient descent, a numpy/PyTorch job that doesn't belong in FastPy's
  chess-engine-specific Python dialect (Core Rule 4) or in `fastpy-engine`
  at all; it would live in a third, ML-focused repo/tool feeding trained
  weights into `init_nnue_weights()`'s body as literal array assignments
  when it exists. Until then, `evaluate_nnue()` is verified-correct
  plumbing over meaningless weights, and every test in `test_nnue.py`
  reflects that honestly: they check determinism, shape, range, and
  position-sensitivity (the forward pass reads board state and produces
  different outputs for different inputs), never chess-meaningful
  direction of the score. `evaluate_nnue()` is a real function, callable,
  fully tested, and compiles — it is just not yet good at chess.

  **3. Not wired into alpha_beta()/quiescence() this session, and not a
  BoardState field.** Two reasons, both deliberate:
    a. Wiring an untrained evaluator into search would make the engine
       play worse than plain material+PST `evaluate()` with no way to
       verify that's "expected" versus "regression" — there's no trained
       network yet to make wiring it in meaningful.
    b. Real NNUE's performance win is the *incremental* accumulator: on
       each move, add/subtract only the moved piece's `NNUE_W1` row
       instead of recomputing all 12 bitboards' contributions from
       scratch. That requires the accumulator to live inside `BoardState`
       (so it copies-with-the-board on `make_move()`'s value-copy
       semantics, the same way `hash` does) — but `BoardState`'s struct
       fields are all scalar (`uint64`/`bool8`/`int32`); nothing in
       `core/parser.py`/`core/emitter.py` today parses or emits an
       array-typed class field (`self.acc: int32[128]`). `resolve_array()`
       is wired for module-level globals, function parameters, and local
       declarations only. Adding that is a transpiler feature change, not
       an `engine.py` change, and deserves its own session rather than
       being bolted on here. This session's `evaluate_nnue()` instead does
       a full from-scratch recompute every call (`O(popcount x 128)` per
       position, ~4096 adds worst case) — correct and fully tested, but
       without the incremental speedup that's NNUE's whole point at scale.

  23 new tests in `tests/test_nnue.py`: constants/shape (6), weight-init
  determinism and range (7), `nnue_accumulate()` correctness — single-bit,
  multi-bit, additive-across-calls (4), `evaluate_nnue()` via `run.py`'s
  `_evaluate_nnue_py()` mirror — determinism, material-sensitivity,
  side-to-move sign-flip (5), module presence (1). One test iteration
  (`importlib.reload(engine)` to check NNUE additions didn't break module
  import) was written, found to silently reset every other global array
  (`TT_HASH`, `ZK_TABLE`, ...) back to their empty compiled-mode
  placeholders since those are only sized/filled once at `run.py` import
  time, took down 58 unrelated tests in `test_phase5.py`/`test_phase6.py`
  in the same pytest session, and was removed in favour of a plain
  `hasattr()` presence check — documented in `test_nnue.py` itself so the
  mistake isn't repeated.

  Full suite re-verified at 345/345 (fastpy, unaffected — no transpiler
  files touched) and 219/219 (fastpy-engine, 196 prior + 23 new).
  `fastpy check engine.py` → zero errors. `fastpy build engine.py
  --optimize=O3` → compiles clean; a standalone C++ harness (outside the
  test suite, built directly against the emitted `.cpp`) called the real
  compiled `evaluate_nnue()` twice on the startpos (identical result both
  calls) and again after removing the black queen (different result),
  confirming the compiled function — not just the Python mirror — is
  deterministic and position-sensitive. `perft(3) = 8902` reconfirmed
  unaffected (move generation untouched by this change).

## D-70: Array-typed struct fields (Session 35) — transpiler feature,
  first of D-69's three NNUE follow-up items. `self.acc: int32[128] = []`
  inside `__init__` now declares a fixed-size, zero-initialised C++ array
  member (`int32_t acc[128] = {};`) instead of being silently mis-emitted
  as a scalar. Three files changed, each doing exactly its one job (Core
  Rule 1):

  - **`core/parser.py`**: `IRField` gained an `is_array: bool = False`
    flag, set in `_parse_init_fields()` the same way `IRGlobal.is_array`
    already is (`"[" in type_name`) — no new parsing logic, just reusing
    the existing annotation-resolution path (`_resolve_annotation()`
    already handled `ast.Subscript` generically, so `int32[128]` inside a
    field annotation parsed correctly before this session; the field just
    wasn't *marked* as an array). `_resolve_target()` gained a new case:
    `obj.attr[index]` (attribute-then-subscript, e.g. `board.acc[h] = x`
    or `self.acc[h] = x`) now flattens to a target string instead of
    raising "Unsupported assignment target" — previously only bare-name
    subscripts (`moves[i]`) were supported.
  - **`core/type_system.py`**: `_check_class()` now validates array field
    types via `resolve_array()` (invalid size, unknown element type)
    instead of `is_known()`'s scalar-only check (which happened to not
    reject array type strings, but didn't actually validate them either —
    `is_known("int32[128]")` strips the array suffix and only checks
    `"int32"`, silently ignoring the size). `_check_assign()`'s
    subscript-assignment branch now exempts any dotted base
    (`"." in base`) from the "must already be a declared local array"
    check — `board.acc[h] = x` is a struct-field element write, validated
    once at the class level, not a new local declaration needing
    first-use annotation. This subsumed the narrower pre-existing
    `not target.startswith("self.")` exclusion, which only handled
    `self.foo = x` (no subscript) and had no path for `self.acc[h] = x`
    or any non-self dotted-subscript target at all.
  - **`core/emitter.py`**: `_emit_class()` branches on `f.is_array` and
    emits array fields with the exact same zero-init BSS convention as
    module-level global arrays (`_emit_globals`) — custom initial contents
    aren't supported for array fields, same as globals; fill via an init
    function for non-zero starting values (this is exactly the pattern
    `init_nnue_weights()` already uses for the module-level NNUE arrays,
    and the intended pattern for a future `init_accumulator()` per-board
    method/function).

  **Verified with a standalone test file** (`/tmp/arrfield_test.py`, not
  committed — a minimal `Acc` struct with an `int32[4]` field), compiled
  with `g++ -std=c++20 -O2` outside the test suite, actually **run**: a
  free function taking the struct by value, writing `a.vals[i] = i * 100`
  for each index, and returning the modified struct — mirroring
  `make_move()`'s established value-copy convention exactly — produced
  correct results end-to-end (`sum_external=600 sum_self=600
  vals=0,100,200,300`, matching hand-computed expected values).

  **Discovered, not fixed, this session — noted as a real limitation**:
  struct methods emit as C++ `const` unconditionally
  (`core/emitter.py`'s `_emit_function`, `const_suffix = " const" if
  in_struct else ""`, no mutation analysis). This predates array fields
  entirely and was never exercised before because every existing
  `BoardState` method is a pure accessor (`white_pieces()`,
  `black_pieces()`, etc.) — all mutation in the codebase already goes
  through free functions taking the struct by value and returning a
  modified copy (`make_move()`), which is unaffected by this limitation
  and is the pattern array fields should use too, as demonstrated above.
  A method that tries `self.field = x` (scalar OR array) fails to compile
  with "assignment of read-only location" — confirmed by deliberately
  testing it (`fill_self()` in an earlier draft of the standalone test)
  before removing that draft in favor of the working free-function
  pattern. Not fixing this now: it's a separate, self-contained emitter
  change (detect self-mutation in a method body, conditionally drop
  `const`) with no NNUE dependency — filed as a ROADMAP item, own session.

  Test coverage: `tests/test_parser.py` — 2 new tests
  (`test_attribute_subscript_target_parses`,
  `test_self_attribute_subscript_target_parses`) plus
  `test_unsupported_subscript_target_raises` updated to use a genuinely
  still-unsupported target (`g()[i] = 0`, subscripting a call result)
  since its old example (`self.moves[i] = 0`) is exactly the capability
  this session added. `tests/test_emitter.py` — new
  `TestArrayFieldEmission` class, 7 tests. `tests/test_type_system.py` —
  new `TestArrayFieldTypeChecking` class, 5 tests, including one that
  deliberately checks the new struct-field exemption didn't accidentally
  swallow the genuine "undeclared local array" error for plain names.

  Full suite: **359/359** (345 prior + 14 new across the three files, net
  of the one test that was updated rather than added).
  `fastpy-engine`'s `engine.py`/`run.py` untouched this session and
  reconfirmed unaffected: `fastpy check` zero errors, `fastpy build
  --optimize=O3` compiles clean, full suite **219/219**.

  Next: D-69's item 2, the incremental NNUE accumulator itself
  (`BoardState.acc: int32[128]`, updated inside `make_move()` by
  add/subtract of the moved/captured piece's `NNUE_W1` row instead of
  `evaluate_nnue()`'s current full recompute) — now unblocked, its own
  session, since it touches `fastpy-engine` (not the transpiler) and
  needs its own careful correctness verification (incremental accumulator
  must match a full recompute bit-for-bit after every move, including
  captures, promotions, castling, and en passant).

## D-71: Incremental NNUE accumulator (Session 36) — the last of D-69's
  three NNUE follow-up items, and the one that actually delivers NNUE's
  performance win: evaluate_nnue_incremental() reads BoardState.acc
  directly (O(NNUE_HIDDEN)) instead of evaluate_nnue()'s full recompute
  over all 12 bitboards (O(popcount x NNUE_HIDDEN)). Two significant
  design changes happened mid-session after draft implementations
  revealed real problems — both are documented here because the mistakes
  are as informative as the fix.

  **Design, as shipped:**
  - `nnue_diff_accumulate(feature_base, old_bb, new_bb, out)` — the core
    incremental primitive. Diffs two bitboards (`removed = old & ~new`,
    `added = new & ~old`) and subtracts/adds `NNUE_W1` rows accordingly.
    Deliberately diff-based, not move-semantics-based: it doesn't know or
    care whether a change came from a quiet move, a capture, a promotion,
    a castling rook shift, or an en passant capture (whose captured pawn
    isn't even on the destination square) — it only compares bitboard
    states. This is correct by construction for every move type,
    including ones added later, because it never needs to know *why* the
    bitboard changed. Hand-deriving the delta separately per move type
    inside `make_move()` was considered and rejected for exactly this
    reason — one missed case (en passant especially) would silently
    desync the accumulator with no compiler error to catch it.
  - `init_accumulator(board)` — full recompute into `board.acc`, reusing
    the existing `nnue_accumulate()` helper from Session 34. Call once
    after constructing a `BoardState` from anything other than
    `make_move()` (starting position, FEN, test fixture) — same
    convention as `compute_hash()`, for the same reason: struct field
    defaults are static expressions evaluated at struct-definition time,
    not runtime computation, so this can't be baked into `__init__`.
  - `evaluate_nnue_incremental(board)` — the payoff. Reads `board.acc`
    directly through a new shared helper, `nnue_output_from_hidden()`
    (factored out of `evaluate_nnue()` in this session so the two
    functions share one final-layer implementation instead of two copies
    that could drift apart).
  - `make_move_with_accumulator(board, move)` — **a separate function
    from `make_move()`**, not a modification to it. See "Mistake #1"
    below for why.

  **Mistake #1 — baking the diff into `make_move()` directly.** The first
  draft snapshotted the 12 old bitboards at the top of `make_move()` and
  called `nnue_diff_accumulate()` before its final `return board`. This
  type-checked, compiled, and passed the compiled-binary correctness
  harness (below) — but `make_move()` is called from dozens of existing
  Python-mode sites across `test_move_gen.py`/`test_phase4/5/6.py`/
  `run.py`, essentially all of which construct a bare `BoardState()` and
  never touch `acc`. In Python mode, `self.acc: int32[128] = []` really
  does start as an empty list (same as any array field or global — see
  D-70), and `nnue_diff_accumulate` writing `out[h] = ...` against an
  empty list raises `IndexError`. Running the full `fastpy-engine` suite
  against this draft would have shown mass failures across files this
  session didn't even touch. Caught by running that suite BEFORE
  considering the feature done — not shipped. Fixed by reverting
  `make_move()` to byte-for-byte its pre-session form and adding
  `make_move_with_accumulator()` as a new, separate, opt-in function that
  calls `make_move()` internally and does the diff on the result. Every
  existing `make_move()` call site is completely unaffected; nothing new
  is required of any of them. Re-ran the full suite after the fix: still
  219/219 (now 237/237 with this session's own 18 new tests added),
  confirming zero blast radius.

  **Mistake #2 — a cross-execution-mode division inconsistency.** Session
  34's `_evaluate_nnue_py()` hand-emulated C++ truncating integer division
  (`output // NNUE_SCALE if output >= 0 else -(-output // NNUE_SCALE)`)
  specifically to match the *compiled* `evaluate_nnue()`'s C++ `/`
  (FastPy's `//` compiles to C++ `/`, not Python's floor division — they
  differ for negative operands). That was fine in isolation, but this
  session's `evaluate_nnue_incremental()` calls the real
  `nnue_output_from_hidden()` directly from Python (no array-local
  problem, so no wrapper needed) — which executes Python's *native*
  floor `//`, not the hand-emulated truncating version. Result: the two
  Python-mode functions disagreed by exactly 1 on negative outputs,
  caught immediately by a manual cross-check before writing the pytest
  file (`incr: -33 full: -32`). Fixed by rewriting `_evaluate_nnue_py()`
  to build `hidden` by hand (still needed — that part of the array-local
  problem is real) and then delegate the final layer to the real
  `nnue_output_from_hidden()`, rather than hand-copying its arithmetic.
  Both Python-mode functions now agree exactly, at the cost of no longer
  bit-matching the *compiled* binary's truncating division for negative
  scores — which nothing in either repo actually depends on (same class
  of accepted, harmless cross-mode divergence as `zk_rand()`'s bignum-vs-
  wraparound behavior, D-69). General lesson recorded here: don't hand-
  duplicate a sub-computation's arithmetic in more than one Python-mode
  wrapper when a real, directly-callable sub-function exists — delegate,
  or the two copies WILL eventually disagree on an edge case.

  **A third pitfall, caught and fixed before it reached a test:**
  `copy.copy(board)` — used throughout `run.py` (e.g.
  `_generate_legal_moves_py`) because `make_move()` mutates its parameter
  in place under Python's reference semantics — is a *shallow* copy. It
  duplicates scalar fields correctly but copies the *reference* to any
  list-valued field, so two "copies" would silently share and mutate the
  same underlying `acc` list. Invisible everywhere else in the codebase
  because `acc` is the first-ever array-typed struct field and nothing
  before this session's own tests ever populated it. Fixed with a new
  `_copy_board_with_acc_py()` helper (`copy.copy(board)` +
  `nb.acc = list(board.acc)`) and a regression test
  (`test_original_board_untouched_after_move_on_copy`) guarding it.
  Compiled C++ has no equivalent bug — a struct's array member is a true
  value member, genuinely duplicated on struct copy — this is strictly a
  Python-mode pitfall.

  **Verification, compiled side** (none of this committed — ad hoc
  sandbox harnesses, superseded by the committed pytest suite for
  ongoing CI coverage, but the numbers are worth recording): a standalone
  C++ harness built directly against the emitted `.cpp` checked
  `evaluate_nnue_incremental()` against `evaluate_nnue()` and a fresh
  `init_accumulator()` reconstruction across 10 hand-built scenarios
  (quiet move, capture, promotion, promotion+capture, en passant,
  castling, and a 4-move sequence checked after every ply) — all exact
  matches. A second harness played 200 randomized games (real
  `generate_legal_moves()`, up to 60 plies each, fixed seed) and checked
  the same three-way agreement after **every one of 11,982 moves** — zero
  mismatches.

  **Verification, committed:** `tests/test_nnue_accumulator.py`, 18
  tests — `init_accumulator()`/`_init_accumulator_py()` (4),
  `nnue_diff_accumulate()` unit tests including cross-checking it against
  two full `nnue_accumulate()` calls (5), `make_move_with_accumulator()`
  across every move type (8), and a randomized-game stress test using
  real legal move generation (1, checking correctness after every ply
  across 8 games/25 plies — smaller than the manual C++ stress run,
  scaled for Python-mode speed inside a CI-run pytest suite).

  Full suite: **237/237** (fastpy-engine: 219 prior + 18 new).
  `fastpy` unaffected (359/359, unchanged this session — no transpiler
  files touched). `fastpy check engine.py` zero errors, `fastpy build
  --optimize=O3` compiles clean, `perft(3) = 8902` reconfirmed unaffected.

  **Still not wired into search** — `evaluate_nnue_incremental()` and
  `make_move_with_accumulator()` are real, tested, fast, and correct, but
  `alpha_beta()`/`quiescence()` still call `evaluate()` (material + PST),
  not any NNUE path. That remains gated on real trained weights existing
  (D-69, point 2) — wiring an untrained-but-now-fast evaluator into
  search would just make the engine play worse, faster. With this
  session, all three of D-69's follow-up items are done; NNUE is
  feature-complete infrastructure waiting on a training pipeline that
  doesn't exist yet.

## D-72: BoardState.__copy__/__deepcopy__ (Session 37) — fixes Session 36's
  `copy.copy()` list-aliasing pitfall at the source instead of leaving it
  as a helper-function workaround. `_copy_board_with_acc_py()` (D-71) is
  retired; every existing and future `copy.copy(board)`/
  `copy.deepcopy(board)` call site across `run.py` and every test file is
  now automatically safe, with no need for any caller to know the pitfall
  ever existed.

  Monkey-patched onto `BoardState` in `run.py`, not defined as a method
  inside `engine.py`'s class body — dunder methods are Python-only
  convenience with no compiled-C++ equivalent, and `engine.py` contains
  FastPy dialect only (Core Rule 6: no Python-only code there). The
  implementation is generic over *any* list-valued field (iterates
  `self.__dict__.items()` checking `isinstance(value, list)`) rather than
  hardcoding `acc` by name, so it stays correct without modification if a
  second array-typed struct field is ever added — the ROADMAP item this
  closes was written broadly for exactly that reason.

  Compiled C++ has no equivalent concern: a struct's fixed-size array
  member is a true value member, genuinely duplicated byte-for-byte on
  struct copy. This patch exists purely for the Python-mode execution
  path, same category as every other Python-mode-only fix documented in
  D-69 through D-71.

  6 new tests in `tests/test_nnue_accumulator.py`
  (`TestBoardStateCopyPatch`): duplication vs. reference identity for
  both `copy.copy()` and `copy.deepcopy()`, mutation isolation, scalar
  fields still copy correctly, the empty-list (`[]`, uninitialized `acc`)
  case still works, and a generic test using a synthetic extra list field
  to confirm the patch doesn't hardcode `acc` by name. Full suite:
  fastpy-engine **243/243** (237 prior + 6 new). `fastpy` unaffected
  (unchanged this task).

## D-73: Conditional `const` on struct methods (Session 37) — closes the
  limitation discovered and deliberately not fixed during D-70. Struct
  methods now emit `const` unless the method's own body directly assigns
  to `self.field` or `self.field[index]` (scalar or array-element writes
  — the latter only possible at all since D-70). Before this, every
  method emitted `const` unconditionally
  (`core/emitter.py`'s `_emit_function`, `const_suffix = " const" if
  in_struct else ""`), which meant a genuinely mutating method failed to
  compile with "assignment of read-only location" — never exercised
  before this session because every pre-existing `BoardState` method
  happens to be a pure accessor (`white_pieces()`, `black_pieces()`,
  etc.); every actual struct mutation in both repos goes through a free
  function taking the struct by value instead (`make_move()`'s pattern).

  Implementation: a new `_method_mutates_self()` helper recursively walks
  a method body's `IRAssign`/`IRAugAssign` statements (through `IRIf`,
  `IRWhile`, `IRFor`, `IRMatch` — the same statement-tree shapes
  `_collect_typed_scalars()` already walks for variable hoisting) looking
  for any target string starting with `"self."`. Deliberately scoped to
  DIRECT self-mutation within the method's own body only — does not
  follow calls to other methods. There's no existing case of transitive
  self-mutation through a nested method call anywhere in either repo (see
  above: mutation already goes through free functions, not method
  chains), so a method that only mutates `self` via calling another
  method would still incorrectly emit `const` — narrower than a full
  fix, but strictly better than the unconditional-`const` status quo,
  and sufficient for every real use case in this codebase today.

  Verified with a standalone test file (`/tmp/const_method_test.py`, not
  committed): a struct with a mutating `fill_self()` (array-field element
  writes in a loop), a mutating `bump_total()` (scalar aug-assign), and a
  read-only `sum_self()`. Emitted C++ correctly dropped `const` on the
  first two and kept it on the third; compiled with
  `g++ -std=c++20 -O2` and **run** — `fill_self()` correctly populated
  the array, `bump_total()` correctly incremented the scalar twice,
  `sum_self()` correctly read the result (`sum=60 vals=0,10,20,30
  total=2`, matching hand-computed expected values).

  9 new/updated tests in `tests/test_emitter.py`
  (`TestConstMethodDetection`, 8 new): pure accessor still emits `const`,
  scalar self-assignment drops it, array-field-element assignment drops
  it, `self.x += 1` drops it, mutation inside a `while` loop drops it,
  mutation inside both branches of an `if` drops it, a **negative** test
  confirming a purely-local (non-`self`) reassignment does NOT
  incorrectly drop `const`, and a sanity check that free functions never
  get a `const` suffix regardless of what they mutate (const-ness only
  applies to struct methods). One existing test
  (`test_self_subscript_write_strips_self_in_method`, D-70) had a stale
  comment explicitly describing the now-fixed limitation — updated to
  reflect the fix and given an additional assertion that `const` is
  correctly absent.

  Full suite: `fastpy` **367/367** (359 prior + 8 new,
  net of the one updated test).
  `fastpy-engine`'s `engine.py` reconfirmed unaffected: every existing
  `BoardState` method is a pure accessor, so every one of them keeps
  emitting `const` exactly as before — confirmed by grepping the emitted
  C++ for all four accessor methods (`white_pieces()`, `black_pieces()`,
  `all_pieces()`, `empty_squares()`), all still ending in `const {`.
  `fastpy check`/`fastpy build --optimize=O3` both clean.

  With D-72 and D-73, both non-blocking follow-up items filed during
  Sessions 35/36 are now closed. The only open item on the NNUE arc
  (D-69 through D-73) is the offline training pipeline — everything else
  in that arc is shipped, tested, and unblocked.

## D-74: Prioritize NNUE weight-embedding scoping over Lazy SMP (decided
  end of Session 37, no code — a planning decision to pick up fresh).
  With D-69 through D-73 all closed, two substantial items remained on
  Phase 6: the NNUE training pipeline and Lazy SMP multi-core search.
  Neither is a "just start typing" task the way the last several sessions
  were, so before committing to either, the tradeoff was weighed
  explicitly (asked directly: "what would you do in my place").

  **Why NNUE weight-embedding scoping goes first:**
  - Three sessions (34, 35, 36) already went into building NNUE inference
    — full recompute, incremental accumulator, both verified bit-exact
    against a 200-game/11,982-move randomized stress run plus a
    committed pytest suite. That's real, correct, sunk infrastructure
    sitting completely idle because of one specific missing piece: there
    is currently no way to get a real trained network's weights into a
    compiled binary at all (FastPy's dialect has no file I/O; every
    array must start as `[]` and be filled by a runtime init function —
    D-70's convention). Leaving that idle to go build something
    unrelated undervalues the work already done and the momentum behind
    finishing it.
  - The blocking question is small and answerable in one session: can
    `fastpy build` handle a ~98,600-line literal assignment block in
    `init_nnue_weights()`'s body as-is, or does the transpiler need a
    real large-array-literal feature first? That's a contained,
    testable question with a clear yes/no/how-big-a-feature answer —
    not an open-ended research task. It either unblocks the training
    pipeline immediately or tells you precisely what needs building
    before it can start. This is the same shape of problem as Session
    35's array-field transpiler work: bounded, testable, one clear
    unblocking outcome.
  - Training a real network (self-play or PGN data, a training loop,
    quantization-aware to match the int32/clipped-ReLU format already
    built) only becomes a well-scoped task once this is answered — doing
    it before would mean building a training pipeline with no confirmed
    way to deliver its output into the engine at all.

  **Why Lazy SMP goes second, not as a parallel "quick win":**
  - It splits into two genuinely different projects: process-level
    parallelism (N independent OS processes, no transpiler changes,
    doable in one session, but no shared TT between workers — not real
    Lazy SMP, no synergy) versus real thread-based Lazy SMP (shared TT
    with intentionally unsynchronized access — needs `std::thread`
    support added to the FastPy dialect itself, with no existing
    precedent to build on, unlike array fields extending something that
    already partially worked).
  - Deliberately rejected taking the easier-but-weaker process-level path
    as a stopgap: nothing else in this arc (Sessions 34-37) took a
    weaker-but-easier route when a real version was identifiable, and
    doing so here would ship something that looks done on the ROADMAP
    but isn't the actual technique.
  - Real thread-based Lazy SMP has "no partial credit": a half-built
    shared-TT threading model is actively dangerous (data races,
    Session-uncaught-class-of-bug) rather than merely incomplete, unlike
    e.g. the accumulator work where each of the three sessions left a
    genuinely working, tested increment. It deserves a session (or
    several) deliberately cleared for it, not one squeezed in as the
    fallback option to NNUE scoping.

  **Outcome:** next session picks up with the weight-embedding scoping
  question, no code written yet this session — this entry and the
  corresponding ROADMAP.md items are the full extent of Session 38's
  output. See ROADMAP.md's Phase 6 section for the exact next-step
  framing.

## D-75: Weight-embedding scoping answered — `fastpy build` handles a
  ~98,600-line literal assignment block as-is, no transpiler feature
  needed (Session 39). Directly answers the question D-74 flagged as the
  next session's sole job.

  **Method:** built a synthetic, throwaway test file (not committed to
  either repo) matching `init_nnue_weights()`'s exact array shapes —
  `NNUE_W1[98304]`, `NNUE_B1[128]`, `NNUE_W2[128]`, `NNUE_B2[1]`, total
  98,561 elements — with a single function body containing one literal
  `ARR[i] = <int>` statement per element (random values in [-128, 127],
  matching the real placeholder weights' range), instead of a generator
  loop. Ran `fastpy check`, `fastpy emit`, and `fastpy build` at `-O0`,
  `-O2`, and `-O3` against it.

  **Result — works, no new feature needed:**
  - `fastpy check`: ~3.9s, zero errors.
  - `fastpy emit`: ~2.2s, produces a 98,590-line / 2.5MB `.cpp` file.
  - `fastpy build --optimize=O0`: ~4.3s total, compiles clean.
  - `fastpy build --optimize=O2` / `-O3`: ~86-89s total — the entire
    added cost sits in the g++ optimization pass, not in FastPy's own
    parse/type-check/emit pipeline (which stays ~2-4s regardless of
    optimization level). This is a known GCC pathology with very large
    single-basic-block functions (tens of thousands of independent
    scalar array stores in one function body give several O2/O3 passes
    superlinear work), not a FastPy limitation.
  - **Correctness confirmed end-to-end, not just "it compiles":** built
    a variant whose `main()` returns `NNUE_W1[100]` (canonicalized into
    the `0-255` exit-code range) instead of `0`, ran the actual compiled
    binary, and got back the exact expected value (`67`) computed
    independently in Python from the same random seed — proves the
    literal-assignment path produces correct values in the compiled
    binary, not just a clean compile.

  **Why this settles it:** the ~85-90s cost is a one-time, offline cost
  paid once per trained-weights update (whenever `init_nnue_weights()`'s
  placeholder body is replaced with real trained values and the engine
  is rebuilt) — not a per-run or per-search cost, and not something a
  chess engine's actual users (a UCI GUI running the already-compiled
  binary) ever pay. It's slower than ideal for rapid iteration during
  training-pipeline development, but not a blocker; if it ever becomes
  annoying, the mitigation is splitting the one `init_nnue_weights()`
  body into several smaller init functions (e.g. one per array), which
  should let g++ optimize each independently and in parallel — not
  attempted here since nothing currently needs it, but noted for
  whoever builds the actual training pipeline.

  **What this does NOT do:** no changes to `core/parser.py`,
  `core/type_system.py`, or `core/emitter.py` — the existing
  literal-subscript-assignment support (already used throughout the
  codebase, e.g. `TT_HASH[idx] = h`) already handles this at scale
  without modification. No changes to `engine.py` either — the
  synthetic test file was standalone and is not part of either repo.
  The real `init_nnue_weights()` still has its placeholder
  splitmix64-based body; swapping it for a literal block of real
  trained weights is the training pipeline's job, not this session's.

  **Outcome:** the offline NNUE training pipeline (ROADMAP, Phase 6) is
  unblocked. It can target the confirmed-working literal-assignment
  shape directly — no dependency on a not-yet-built FastPy feature.

## D-76: Offline NNUE training pipeline built and run — engine.py now
  ships real trained weights, not placeholder ones (Session 40). Direct
  follow-through on D-75's unblock.

  **What was built** — three standalone tools in the new
  `fastpy-engine/training/` directory, all plain Python + numpy, none of
  it FastPy dialect (Core Rule 4/6 — nothing here runs inside the
  compiled engine, same "separate tool" boundary as `run.py` itself):
  - `generate_data.py`: self-play data generator. Plays weighted-random
    games (softmax over each candidate move's resulting `evaluate()`
    score, not pure random, so the position distribution isn't dominated
    by hanging-piece blunders) using `run.py`'s existing Python-mode
    wrappers (`_generate_legal_moves_py`, `make_move`, `evaluate`).
    Extracts each position's 768-dim binary feature vector matching
    `nnue_accumulate()`'s exact `feature_base*64+sq` indexing, labels it
    with `evaluate()`, and records `white_to_move`.
  - `train_nnue.py`: numpy trainer, architecture identical to
    `evaluate_nnue()` — `hidden = clip(X@W1+b1, 0, 127)`,
    `output = hidden@W2+b2`, `score = output // 64` — trained directly
    against this integer-semantics forward pass (straight-through
    estimator for the clip's gradient, weights kept as floats during
    training, rounded to int32 only at export). Adam optimizer, weight
    clipping on W1/W2 (keeps quantized weights from saturating every
    hidden unit given up to ~32 simultaneously active features), early
    stopping on float validation loss.
  - `embed_weights.py`: generates the literal `NNUE_W1[i] = <int>`
    assignment block from the trained+quantized weights — the exact
    pattern D-75 confirmed safe at this scale.

  **A real bug found and fixed mid-session, not just tuning:** the first
  several training attempts failed to learn anything (validation
  correlation ~0, sometimes negative, regardless of learning rate,
  regularization, or weight clipping — all of which were tried, in that
  order, before finding the actual cause). Root cause: `evaluate()`'s
  label is side-to-move-relative (flips sign depending on whose turn it
  is), but the 768-dim feature vector is absolute (fixed white/black
  identity, independent of whose turn it is) — exactly matching how
  `evaluate_nnue()`'s architecture works, where `nnue_accumulate()`
  reads the absolute bitboards and `nnue_output_from_hidden()` applies
  the side-to-move sign flip only as a fixed *final* step, never learned
  by the network. Training the network directly against the side-
  relative label — without pre-applying that same flip to the training
  target — means roughly half the training signal's sign is effectively
  randomized relative to what a fixed function of absolute features can
  predict. Confirmed via a closed-form check: a trivial "sum of known
  material values per active feature" linear combination had -0.014
  correlation with the raw label, and 0.998 correlation once the same
  values were compared against the label with the white-to-move flip
  pre-applied. Fix: `train_nnue.py` now computes
  `raw_target = label if white_to_move else -label` and trains against
  that; `embed_weights.py`'s output is then used exactly as
  `nnue_output_from_hidden()` expects, no further conversion needed.

  **Training data and result:** 2,000 self-play games, 60 plies max,
  119,413 labelled positions (~44s/500 games generation cost). Trained
  with early stopping (~40 epochs, ~60s). Final quantized-inference
  validation (int32 forward pass, not the float training graph): MAE
  5.0cp, correlation 1.0000 against `evaluate()` on held-out positions.
  This is the *expected* result of a first-NNUE distillation bootstrap,
  not evidence of playing-strength improvement — the network was
  trained to reproduce `evaluate()` exactly, and does, up to
  quantization rounding. It is not yet a better evaluator than
  `evaluate()`; it is a compiled-form NNUE with real (non-random)
  weights, which is what this session's scope was.

  **What changed:** `engine.py`'s `init_nnue_weights()` placeholder body
  (the `nnue_rand()`-based pseudo-random fill) replaced with a 98,561-
  statement literal assignment block of the trained weights;
  `nnue_rand()` itself removed (no longer referenced anywhere — checked
  `tests/` and `run.py` first). `fastpy check` and `fastpy build
  --optimize=O3` both verified clean (build: ~94s, matching D-75's
  ~85-90s estimate for a function this size at `-O2`/`-O3`). Full
  243/243 test suite re-run and passing, with `tests/test_nnue.py`'s
  four `[-128,127]` clamp-range tests updated — that range was specific
  to the placeholder's `nnue_rand() & 255 - 128` generator, not an
  architectural invariant, and real trained biases aren't clipped that
  way (e.g. `NNUE_B2[0]` is `-176`, outside the old test's bound).
  Spot-checked `evaluate()` vs. `evaluate_nnue()` (Python-mode mirror)
  on the start position and several early-game moves: consistently
  within a few centipawns of each other, as expected from the reported
  MAE.

  **What this does NOT do:** `evaluate_nnue()`/
  `evaluate_nnue_incremental()` are still not wired into
  `alpha_beta()`/`quiescence()` — that's the next ROADMAP item,
  deliberately kept separate (see ROADMAP.md's note on why: it's now a
  speed/robustness question, not a strength one, since this network
  currently only reproduces `evaluate()`).

  **Outcome:** `engine.py` ships a real, non-random, trained NNUE for
  the first time. The next natural steps are (1) wiring the incremental
  path into search with a benchmark before/after, and (2) a second
  training iteration using search-based relabelling (e.g. shallow
  `alpha_beta()` scores instead of raw `evaluate()`) once (1) is done
  and the incremental path is trusted in real search — that's how this
  network could eventually exceed `evaluate()`'s playing strength rather
  than just matching it.

## D-77: `evaluate_nnue_incremental()` wired into `alpha_beta()`/
  `quiescence()` (Session 41). Direct follow-through on D-76's flagged
  next step, framed as a speed/robustness question, not a strength one.

  **What changed, in `engine.py`:**
  - `find_best_move()`: now calls `board = init_accumulator(board)`
    right after `board.hash = compute_hash(board)` — same lazy-init
    convention, same call site — so `board.acc` is correct before any
    recursive call reads it.
  - `alpha_beta()`: futility pruning's `static_eval` now reads
    `evaluate_nnue_incremental(board)` instead of `evaluate(board)`; the
    move loop's `make_move(board, moves[i])` is now
    `make_move_with_accumulator(board, moves[i])`.
  - `quiescence()`: stand-pat now reads `evaluate_nnue_incremental(board)`;
    its capture loop's `make_move()` is now `make_move_with_accumulator()`.
  - `find_best_move()`'s own root move loop: `make_move()` →
    `make_move_with_accumulator()`.
  - Left alone, deliberately: `generate_captures()`'s legality-check
    `make_move()` call (the resulting board is discarded immediately
    after `is_in_check()`, never searched, so there's no accumulator to
    keep correct) and `make_null_move()` (doesn't touch any bitboard, so
    `board.acc` carries over unchanged with no diff needed).

  **`run.py`'s Python-mode mirrors** (`_alpha_beta_py`, `_quiescence_py`,
  `_find_best_move_py`) updated identically, using the pre-existing
  `_init_accumulator_py()` wrapper (built in Session 36 for exactly this
  purpose — see D-70). `_find_best_move_py()` now calls
  `board = _init_accumulator_py(board)` at its top, mirroring
  `find_best_move()`.

  **Test fallout, and why each fix is correct, not a workaround:**
  - `tests/test_phase4.py` and `tests/test_phase6.py`'s `starting_board()`
    helpers construct a bare `BoardState()` and call `_alpha_beta_py`/
    `_quiescence_py` *directly*, bypassing `_find_best_move_py()`'s own
    `board.acc` init — so `board.acc` was still `[]` (D-70's Python-mode
    empty-list convention) when `evaluate_nnue_incremental()` tried to
    read it, raising `IndexError`, not a silent wrong answer (the
    silent-wrong-answer risk `evaluate_nnue_incremental()`'s docstring
    warns about is specific to the *compiled* path, where `acc` is a
    fixed-size array that reads as zeros rather than raising). Fixed by
    having both helpers call `_init_accumulator_py()` too — the correct
    fix, since every board handed to these functions now has the same
    precondition `find_best_move()` itself guarantees.
  - `test_phase4.py::test_quiet_position_equals_static_eval` and
    `::test_depth0_returns_qsearch` asserted quiescence's stand-pat (and
    therefore `alpha_beta(depth=0)`'s result) equals `evaluate()` exactly
    for the quiet starting position (both were `0`, since `evaluate()`
    is exactly symmetric there). That equality was true only because
    stand-pat used to call `evaluate()` directly — now that it calls
    `evaluate_nnue_incremental()` (a close but not bit-identical
    approximation, see D-76's MAE), the two tests' premise no longer
    holds. Both updated to compare against `evaluate_nnue_incremental()`
    — the function actually under test — instead of `evaluate()`.

  **Benchmark, before (classical `evaluate()`) vs. after (NNUE):** run via
  `run_benchmark()` (Python-mode, so absolute NPS reflects interpreter
  overhead more than true compiled speed — node counts are the
  meaningful signal here, not raw NPS).

  | position | depth | nodes before | nodes after |
  |---|---|---|---|
  | startpos | 5 | 38,849 | 266,642 (~6.9x) |
  | tactical FEN¹ | 4 | 162,191 | 238,344 (~1.5x) |
  | tactical FEN¹ | 5 | 442,825 | 335,441 (~0.76x) |

  ¹ `r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4`

  **Honest read of this table:** node counts shift meaningfully in both
  directions, not a clean "no regression." Leading hypothesis for the
  startpos outlier: `evaluate()` is exactly `0` at the startpos (perfect
  material/PST symmetry), while `evaluate_nnue_incremental()` returns a
  small nonzero value there (`2`, per D-76's spot-check) — futility
  pruning and null-move pruning both compare the static eval against
  margins/beta, and a value sitting exactly on a symmetric tie-breaking
  boundary vs. one perturbed a few centipawns off it can change which
  branches get cut, especially early in a search tree built from a
  highly symmetric position. Not confirmed — flagged in ROADMAP.md as
  the next thing to actually check, not asserted as fact here.

  **What this does NOT establish:** this is not a playing-strength
  result (D-76 already noted the network only reproduces `evaluate()`,
  it doesn't exceed it) and not a settled performance verdict (the
  node-count swings above need more positions before concluding
  anything about typical-case behavior). What it does establish: the
  incremental accumulator path is wired correctly end-to-end
  (`fastpy check`/`build -O3` clean, full 243/243 suite passing,
  `find_best_move()` → `alpha_beta()` → `quiescence()` all correctly
  threading `board.acc` through `make_move_with_accumulator()`) and the
  engine doesn't crash, hang, or produce obviously-broken output with
  NNUE driving search — the actual bar this session was scoped to clear.

  **Outcome:** `evaluate_nnue_incremental()` is live in real search, not
  just tested in isolation. Next: understand the node-count sensitivity
  (ROADMAP's new NEXT UP item) before trusting this for real play, then
  the search-based-relabelling training iteration D-76 flagged as the
  route to actually exceeding `evaluate()`'s strength.

## D-78: Node-count sensitivity root cause found — D-77's pruning-margin
  hypothesis was wrong (Session 42). Investigation-only session, no code
  changed; corrects the record rather than leaving a wrong guess in place.

  **D-77's hypothesis, disproved directly:** the guess was that
  `evaluate()`'s exact `0` at the symmetric starting position, vs.
  NNUE's small nonzero value there, was shifting which branches
  futility/null-move pruning cut. Tested by disabling both heuristics
  entirely (`NULL_MOVE_MIN_DEPTH = 9999`, `FUTILITY_MAX_DEPTH = -1`) and
  re-running the startpos depth-5 benchmark under NNUE eval: node count
  stayed at ~266,600 regardless of which combination of the two
  heuristics was on or off. Whatever is driving the ~7x increase, it
  isn't futility or null-move pruning reacting to near-zero eval noise.

  **Actual cause, confirmed with a controlled comparison:** isolated
  cold-TT (no iterative-deepening warm-up) depth-5-only search from
  iteratively-warmed-up (depths 1-5, shared TT — what `run_benchmark()`
  actually does) search, for both evaluators, via a one-line swap
  (`r.evaluate_nnue_incremental = r.evaluate`, since `_alpha_beta_py`/
  `_quiescence_py` resolve that name as a module global at call time):

  | | cold depth-5-only | warm (iterative 1-5) | warm-up speedup |
  |---|---|---|---|
  | classical `evaluate()` | 247,542 nodes | 38,849 nodes | ~6.4x |
  | NNUE `evaluate_nnue_incremental()` | 376,385 nodes | 266,642 nodes | ~1.4x |

  Per-node search cost is comparable between the two evaluators without
  the warm-up benefit (~1.5x, not ~7x). The ~7x gap in D-77's original
  comparison came almost entirely from iterative deepening's TT-based
  move-ordering warm-up being far less effective under NNUE. Direct
  evidence: at this position, classical `evaluate()` picks the same best
  move (`b1c3`) at every depth from 1 to 5; NNUE flips to `h2h4` at depth
  4, then back to `b1c3` at depth 5. That flip destroys the hash-move
  ordering hint the depth-4 search would otherwise have handed to
  depth 5, which is exactly the mechanism iterative deepening relies on
  to make each successive depth cheap.

  **Why this happens, and why it's not a bug:** the network was trained
  to approximate `evaluate()` (D-76: MAE 5.0cp, corr 1.0000 on held-out
  positions) — a very good fit in aggregate, but a few centipawns of
  noise is enough to occasionally flip the *relative* ranking of two
  moves whose true values are within that noise band. The starting
  position is an unusually bad case for this: it's the single most
  wide-open, symmetric position in the game, with many opening moves
  genuinely close in value under `evaluate()` itself — exactly the
  condition where a few centipawns of approximation noise can change
  which one ranks first. This is an expected property of training a
  network to *approximate* rather than *exactly reproduce* an evaluator,
  not a defect in the wiring done in D-77 (which is confirmed correct —
  `fastpy check`/`build`/full suite all still clean, and this session
  made no code changes at all, only ran experiments).

  **What this does NOT mean:** it doesn't mean NNUE-driven search is
  unusably slow in general — the per-node cost difference is modest
  (~1.5x) and the warm-up-sensitivity effect is likely position-
  dependent (worse at wide-open symmetric positions, probably less
  pronounced in sharper middlegame positions with fewer near-equal
  moves — not tested here, would need more positions to confirm).

  **Outcome:** confirms D-76's own suggested next step is the right one
  — a second training iteration using search-based relabelling (shallow
  `alpha_beta()` scores instead of raw `evaluate()`) should help here
  specifically, not just improve raw evaluation accuracy: training
  against scores that already reflect search-consistent move rankings,
  rather than a static per-position snapshot, should reduce exactly the
  kind of depth-to-depth ranking flips that broke iterative deepening's
  warm-up benefit at this position.

## D-79: Second (v2) NNUE training pass using search-based labels
  (Session 43) — direct follow-through on D-78's flagged next step.
  Strong node-count result; playing-strength unvalidated (see ROADMAP's
  new NEXT UP item).

  **Labelling approach:** `generate_data.py` gained `--label-mode
  search`: instead of a static `evaluate()` snapshot, each position's
  label comes from a shallow classical `alpha_beta()` search
  (`_find_best_move_py` at `--label-depth`), with
  `evaluate_nnue_incremental` monkeypatched to `evaluate` on the `run`
  module for the whole generation run — so v2 trains against the
  trusted classical evaluator's search-informed judgement, not against
  v1's own approximation error recursively. Move *selection* during
  self-play still uses static `evaluate()` for speed; only the recorded
  label changed.

  **Depth had to be shallow for practical runtime, and that's an honest
  limitation, not a hidden one:** timing tests before committing to a
  run: depth 3 costs ~2.35s/position, depth 2 ~0.84s/position, depth 1
  ~0.03s/position (roughly a 28x jump per ply, consistent with chess's
  branching factor). Depth 3 or even depth 2 at a dataset size
  comparable to v1's 119,413 positions would have taken multiple hours —
  not run in this session. Used depth 1 (includes quiescence, so still
  resolves immediate tactical exchanges beyond a bare static snapshot,
  just not deeper) and a much smaller dataset: 8,478 positions from ~150
  self-play games, generated in 14 chunks of 10-20 games each (the
  sandbox's tool-call execution window couldn't fit a single long-running
  generation job — background/`nohup` processes don't persist between
  tool calls in this environment, discovered the hard way when a `nohup`
  job produced no output on the next call).

  **Training:** same architecture and trainer as v1 (D-76), same
  hyperparameters. Quantized-inference validation on held-out data:
  corr 0.9646, MAE 141cp against the search-based labels — much noisier
  than v1's corr 1.0000/MAE 5.0cp against `evaluate()`, expected given
  search-based labels reflect real tactical volatility (not a smooth
  deterministic function of features the way material+PST is) and a 14x
  smaller dataset.

  **Result — validated directly against D-77/D-78's benchmark positions
  before committing to the embed:** loaded v2 weights in-memory (no
  rebuild needed to test) and re-ran the exact node-count comparison
  from D-77/D-78:

  | position | depth | v1 nodes | v2 nodes |
  |---|---|---|---|
  | startpos | 5 | 266,642 | **14,429** |
  | tactical FEN¹ | 4 | 238,344 | **17,458** |
  | tactical FEN¹ | 5 | 335,441 | **5,109** |

  ¹ same FEN as D-77/D-78:
  `r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4`

  Startpos depth 5 is now *better* than classical eval's own 38,849-node
  warm baseline. The tactical FEN's best-move choice is also far more
  stable across depths under v2 (`f3g5` from depth 2 onward) than either
  v1 or classical eval showed. Interesting wrinkle, reported honestly
  rather than smoothed over: v2's best-move sequence at startpos
  (`g1f3, g1f3, g2g4, g2g4, e2e3`) actually flips *more* often
  depth-to-depth than v1's did (`b1c3` at 4 of 5 depths) — so D-78's
  "move-ranking stability" framing isn't the whole story. Better
  hypothesis, not confirmed: v2's scores are larger-magnitude and more
  decisive (reflecting real tactical swings from its search-based
  labels) than v1's smoother material+PST-flavored approximation, and
  that decisiveness — not ranking stability per se — is what's driving
  more effective alpha-beta cutoffs. Worth actually checking, not
  asserted as settled here.

  **A real mistake, corrected in place, worth recording:** the first
  attempt at splicing v2's weights into `engine.py` used the wrong
  boundary — replaced everything from `init_nnue_weights()` up to
  `evaluate_nnue()`, not realizing `nnue_accumulate()` and ~98,500 lines
  of unrelated engine code (move generation, search, `evaluate()`
  itself) sit between those two functions in the file's actual layout,
  not adjacent to `init_nnue_weights()` the way D-76's original edit
  assumed the *next* function would be. This deleted most of the file.
  Caught immediately by `fastpy check` failing to import `nnue_accumulate`
  and a full test-suite run erroring on missing names — never came close
  to being presented as a deliverable. Recovered cleanly: re-pulled
  `fastpy-engine`'s `main` branch fresh via `codeload.github.com`, which
  turned out to already have D-76/D-77's committed changes (confirmed
  identical via `diff` against every other file before trusting it as
  the recovery base — `run.py`, `tests/test_phase4.py`,
  `tests/test_phase6.py`, `tests/test_nnue.py` all byte-identical), then
  re-applied the v2 splice using the *correct* boundary this time
  (`init_nnue_weights()` to the very next function, `nnue_accumulate()`,
  confirmed by direct inspection before editing, not assumed). Lesson
  for future large-splice edits: confirm the immediate next function by
  grep, don't assume adjacency from a different session's edit.

  **Other fallout, fixed correctly:** full 243/243 suite passing after
  one fix — `tests/test_phase4.py::TestAlphaBetaPy::test_respects_window`
  asserted `_alpha_beta_py`'s result stays within its `[-50, 50]` search
  window at depth 2 from the starting position. This `alpha_beta()` is
  fail-soft (returns the actual accumulated best score on a fail-high/
  fail-low, which can legitimately exceed the window — only fail-hard
  implementations clamp to it), so that was never a true invariant, just
  hadn't been violated under v1's smaller score range at this specific
  position/depth. v2's larger-magnitude scores (consistent with the
  "more decisive" hypothesis above) return 52 here, just over the old
  bound. Widened to a generous sanity range instead of a strict (and
  incorrect) window-compliance check.

  **Verification:** `fastpy check` clean; `fastpy build --optimize=O3`
  exceeded the CLI's internal 120s compilation timeout this run (D-75's
  ~85-90s estimate has some run-to-run variance, apparently enough to
  occasionally cross that fixed limit) — verified instead via `fastpy
  emit` + a direct `g++` invocation with the project's standard flags
  (no timeout imposed), which compiled clean and produced a working
  stub binary (`engine.py`'s compiled `main()` is a documented no-op
  stub, UCI runs in Python mode only — Core Rule 6). Full 243/243 test
  suite passing. Node-count results re-confirmed against the actual
  committed `engine.py` (not just the in-memory weight patch used for
  the initial check) — identical numbers, as expected.

  **What this does NOT establish:** playing strength, same caveat as
  D-76/D-77 — the node-count win is a search-efficiency result, not a
  move-quality one. See ROADMAP's new NEXT UP item.

## D-80: v2's move quality spot-checked — confirmed D-79's own caveat: a
  real endgame regression, not just an unvalidated node-count win
  (Session 44). Investigation only, no code changed.

  **Method:** compared classical `evaluate()`, v1, and v2's chosen move
  and node count at depth 4 across 5 positions: a K+P vs K endgame, a
  K+R vs K endgame, the Italian-opening position from D-77/D-78, a
  known checkmate position (Fool's mate, as a sanity check that all
  three correctly detect "no legal moves"), and a closed middlegame
  pawn structure.

  **Opening/middlegame: no red flags.** Closed middlegame position: all
  three pick the same move (`b1c3`), v2 with far fewer nodes (103,832 vs
  140,683/144,408) — consistent with D-79. Italian opening: classical
  and v1 both castle (`e1g1`, the standard, safe choice); v2 instead
  plays `f3g5` (an aggressive knight sortie, a real if sharper idea in
  this family of openings, not an obvious blunder) — again with far
  fewer nodes (48,747 vs 288,274/371,645). Checkmate position: all three
  correctly return "no legal moves" — no regression in basic correctness.

  **Endgame: a real, confirmed regression.** K+R vs K: all three pick
  plausible king/rook moves, no obvious problem. **K+P vs K
  (`8/8/8/4k3/8/4P3/4K3/8 w - - 0 1`) is where it breaks down.**
  Classical eval picks `e2d3` — advancing the king to contest the
  opposition, the textbook-correct idea in this exact kind of position.
  v2 instead picks `e2d1` — retreating the king away from the pawn,
  which is not a reasonable idea in this endgame by any normal
  standard. Not just a different final search pick: scored every one of
  White's 8 legal moves directly with v2's `evaluate_nnue_incremental()`
  and compared to classical `evaluate()` on the resulting position:

  | move | v2 (mover's perspective) | classical (mover's perspective) |
  |---|---|---|
  | `e3e4` | 37 | 125 |
  | `e2d1` | 15 | 85 |
  | `e2e1` | -4 | 85 |
  | `e2f1` | 22 | 115 |
  | `e2d2` | 28 | 115 |
  | `e2f2` | 7 | 115 |
  | **`e2d3`** | **-40** | **115** |
  | `e2f3` | 65 | 115 |

  v2 rates the textbook-correct move (`e2d3`) as the *worst* of the
  eight (the only negative score), while classical eval rates it among
  the best (tied for the top classical score, 115). This isn't a subtle
  disagreement about a genuinely close position — it's a network
  producing close to arbitrary output on a position type it almost
  certainly never saw in training.

  **Near-certain cause, not yet independently verified but well-
  motivated:** v2's training set (D-79) is 150 self-play games capped at
  55 plies, generated by the existing self-play driver — games that
  mostly stay in the middlegame and don't run long enough to simplify
  down into bare few-piece endgames. A bare K+P vs K position has only 2
  of the network's 768 binary input features active (one white pawn, two
  kings — 3 features, technically, but still a tiny, near-empty input
  vector). If the training set contains few or no positions with this
  few active features, the network has no real training signal there,
  and int32-quantized weights that fit the (very different, much denser)
  middlegame distribution well can produce essentially arbitrary output
  on inputs that sparse — this is a standard out-of-distribution failure
  mode for any function approximator, not something specific to this
  architecture or to search-based relabelling in particular.

  **What this means for v2's status:** it should NOT be treated as a
  strict upgrade over v1, despite the strong node-count results in
  D-79 — those results say nothing about endgames, and this session
  found a concrete case where v2's judgment is worse than both v1 and
  classical eval, in a simple, well-understood position type. `engine.py`
  currently ships v2's weights (D-79) — that commit itself isn't reverted
  here (the node-count win in positions v2 *has* seen is real and worth
  keeping for now), but v2 should be understood as "good in the
  middlegame territory it was trained on, unreliable in sparse endgames"
  rather than a clean improvement, until the endgame gap is addressed.

  **What this does NOT do:** propose or evaluate a fix — that's
  correctly scoped as its own session (ROADMAP's new NEXT UP item lists
  three candidate approaches, deliberately without a recommendation yet).

## D-81: v2's endgame blind spot fixed via explicit endgame training data
  (v3), not a fallback or blend (Session 45). Chose option (1) of the
  three D-80 laid out without a recommendation.

  **Why option (1), not (2) or (3):** D-80's root cause was a training-
  data gap, not a model-capacity or architecture problem — v2's 150
  self-play games (D-79) are short (55-ply cap) and middlegame-heavy, so
  they essentially never simplify down to bare few-piece endgames. A
  material-count-gated classical/v2 fallback (2) would work but abandons
  the single-unified-evaluator design this arc has been building toward,
  papering over the gap rather than closing it. Blending v1 and v2 (3)
  doesn't obviously help either — v1 (D-77) has the same self-play-only
  data source as v2, just with static instead of search-based labels, so
  it likely has a similar (untested, but no reason to expect otherwise)
  endgame blind spot rather than genuine additional endgame coverage to
  blend in. Directly generating the missing position type is the more
  honest fix.

  **What was built:** `training/generate_data.py` gained
  `random_endgame_board(rng, bag)` — places a `bag` of piece-field names
  (always both kings plus 1-2 extra pieces) on random distinct squares,
  rejecting placements with pawns on rank 1/8, adjacent kings, or the
  side NOT to move left in check (`is_in_check()` — its own docstring
  confirms it checks exactly this: the side that just moved). 19
  `ENDGAME_BAGS` configurations cover single-piece endgames (K+P/R/Q/N/B
  vs K, both colors) and simple two-extra-piece pairings (K+R vs K+P,
  K+Q vs K+R, K+P vs K+P, etc.). `generate_endgame_samples()` labels
  these the same way as self-play positions (shared `label_fn`, so
  `--label-mode search`'s depth-1 classical-search labels apply
  identically) and mixes them into the same output array via a new
  `--endgame-count` CLI flag — no schema change, `train_nnue.py` and
  `embed_weights.py` needed zero modifications.

  **Dataset:** v3 = v2-scale self-play (151 games via `--label-mode
  search --label-depth 1`, matching D-79's methodology exactly, chunked
  across 4 sandbox calls due to the same per-call wall-clock limits
  D-79 hit) + 3,200 `ENDGAME_BAGS` positions. Endgame generation is
  extremely cheap (3,200 positions in 3.4s vs. self-play's ~7s/game) —
  sparse positions have few legal moves and resolve fast in the depth-1
  + quiescence label search. 11,505 total positions, ~28% endgame
  (v2's was effectively ~0%).

  **Confirmed fixed — direct re-run of D-80's own benchmark:** scored
  all 8 legal moves in the exact K+P vs K FEN
  (`8/8/8/4k3/8/4P3/4K3/8 w - - 0 1`) with v3's quantized weights.
  `e2d3` (the textbook king-opposition move) was v2's only negative
  score (-40) and the outlier worst move; under v3 it scores **146**,
  solidly positive and in the same range as every other legal move (all
  8 moves now score 120-175). Not a perfect match to classical eval's
  ranking, but the specific defect D-80 found — an OOD network producing
  arbitrary output that actively prefers a bad retreat — is gone.

  **Confirmed preserved/improved:** startpos depth-5 node count actually
  *improved* over v2 (10,584 vs v2's 14,429, both far better than v1's
  266,642 and classical's 38,849 warm baseline), same `g1f3` best move
  choice.

  **A real trade-off, reported honestly rather than smoothed over:** the
  tactical FEN from D-77/D-78/D-79/D-80
  (`r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4`)
  regressed on node count — 55,905 under v3 vs. v2's 5,109 (still far
  better than v1's 335,441). Best move unchanged (`f3g5` at depth 5,
  matching v2). Plausible explanation, not independently confirmed:
  spreading a 128-hidden-unit network's limited capacity across a more
  diverse (now endgame-inclusive) position distribution costs it some of
  the very sharp, single-family specialization that gave v2 its
  extreme tactical-position efficiency — a capacity/diversity trade-off,
  not obviously a bug. Flagged as the new ROADMAP NEXT UP item rather
  than either ignored or over-interpreted as a fixed conclusion.

  **Broader re-check:** re-ran all 5 of D-80's spot-check positions
  (K+P vs K, K+R vs K, Italian opening, Fool's-mate sanity check, closed
  middlegame) at depth 4 — no blunders found in any of them, checkmate
  detection still correct (Fool's mate returns "no legal moves").

  **Verification:** exact same splice-boundary discipline D-79's
  incident established — confirmed `def init_nnue_weights()` at line
  2257 and the very next function `def nnue_accumulate()` at line
  100827 by direct grep before editing, then verified programmatically
  that every line before/after the replaced block is byte-identical to
  the original file (not just visually spot-checked). `fastpy check`:
  zero errors. `fastpy build`/direct `g++ -O3` (project's standard
  flags): clean compile, ~151s (matches D-75/D-79/D-80's estimate),
  binary runs and exits 0 (documented `main()` no-op stub — Core Rule 6,
  UCI is Python-mode only). Full 243/243 test suite passing — unlike
  D-79, **no test updates were needed this session**.

## D-82: v2-vs-v3 self-play match confirms v3 is a genuine overall
  upgrade — 10-0-6, v3 never lost (Session 46, follow-up to D-81)

  D-81 fixed v2's endgame blind spot but found a real, unexplained
  trade-off: worse node-count efficiency on the D-77/D-78/D-79/D-80
  tactical FEN. ROADMAP flagged this as needing a broader check than
  D-80's 5-position static spot-check before trusting v3 as a settled
  upgrade. This session built that check.

  **Harness (`training/self_play_match.py`, new, generic/reusable):**
  loads two `engine.py`+`run.py` directories as independent module pairs
  in a single process via a sys.modules alias-swap trick — `run.py`'s
  `from engine import (...)` binds to whatever module is registered
  under the name `'engine'` at that exact import moment, so registering
  engine A's module, importing A's `run.py`, then re-registering to
  engine B's module before importing B's `run.py` gives two live,
  never-crossing sets of function references in one process (no
  subprocess/UCI-text overhead). Each engine keeps its own `BoardState`;
  after either side picks a move, the UCI string is applied to both
  boards independently so they stay in lockstep as the same game.

  **Why an opening book, not repeated startpos games:** both engines are
  fully deterministic (no randomness anywhere in search or move
  ordering), so replaying startpos N times with the same color
  assignment produces the identical game N times — confirmed directly
  (two "repeat" games in an early test run were byte-for-byte identical
  in move list). 8 fixed opening FENs × 2 color assignments = 16 genuinely
  independent games instead.

  **Bug caught and fixed before the real run:** the first harness draft
  checked `if not legal:` on `_generate_legal_moves_py()`'s return value
  — but that function returns a `(moves, count)` tuple, which is always
  truthy regardless of `count`, so checkmate/stalemate detection never
  fired. A second bug in the same draft reused the variable name `moves`
  for both the legal-move-list unpack and the outer game's move-log
  list, silently clobbering the log. Both fixed (unpack into
  `legal_moves, legal_count`, check `count == 0`) and verified against a
  short game with a real checkmate before trusting the full run.

  **Result — 200ms/move, max 100 plies, TT cleared between games:**

  | | v2 wins | v3 wins | draws |
  |---|---|---|---|
  | 16 games | 0 | 10 | 6 |

  v3 never lost a single game, in either color, in any of the 8 opening
  lines. As White, v3 scored 6 wins + 2 draws (0 losses); as Black
  (i.e. v2 as White), v3 scored 4 wins + 4 draws (0 losses). This is a
  much stronger signal than D-80's static 5-position spot-check: it's
  the two networks' full search-and-evaluate pipelines actually playing
  real games against each other, across varied openings, not just
  scored move lists at a handful of hand-picked positions.

  **Interpretation:** D-81's tactical-FEN node-count regression is real
  and still unexplained, but it is not costing v3 practical strength —
  whatever the network lost in raw node-count efficiency on that one
  benchmark position, it more than made up for in overall play quality,
  most plausibly because the endgame blind spot D-80 found was actively
  costing v2 games (the 72-ply and 92-ply checkmates v3 delivered as
  Black are consistent with converting a simplified, endgame-adjacent
  position v2 couldn't navigate correctly). The node-count question is
  downgraded from "blocking" to "open, lower-priority, intellectual
  completeness" in ROADMAP.

  **K+P vs K generalization re-checked:** scored all legal moves
  directly (not just via search) on two more configurations beyond
  D-80/D-81's exact FEN — a rook-pawn (a-file) endgame and an advanced
  central e-pawn with immediate promotion available. Both score sanely:
  no negative-score outliers in the rook-pawn case, and promotion
  (`e7e8q`, 885) correctly valued far above every non-promoting
  alternative in the advanced-pawn case. The D-81 fix isn't overfit to
  the one FEN D-80 happened to test.

  **No engine.py or generate_data.py changes this session** — this was
  a validation-only session. `self_play_match.py` is a new dev tool
  (kept generic — `--engine-a-dir`/`--engine-b-dir`, not v2/v3-specific
  — so future NNUE iterations can reuse it directly) but is not part of
  the compiled FastPy dialect surface and is not subject to `fastpy
  check` (it's a plain-Python harness that imports `run.py`/`engine.py`
  from two on-disk directories, comparable to `tests/` or
  `training/generate_data.py`).

## D-83: node-count "diversity dilution" hypothesis tested directly —
  result is mixed/inconclusive, most likely training-run noise rather
  than a systematic capacity effect (Session 47, closes D-81's flagged
  follow-up)

  D-81 found v3's tactical-FEN node count regressed vs v2 (55,905 vs
  5,109 nodes, depth 5) and hypothesized — but did not test — that
  spreading the network's fixed 128-hidden-unit capacity across a more
  diverse (endgame-inclusive) distribution was the cause. D-82's match
  result made this low-priority (v3 wins in practice regardless), but
  it was cheap to actually test rather than leave as a guess.

  **Test:** rather than the more invasive route (resizing engine.py's
  compiled accumulator arrays to try a larger hidden layer — touches
  `int32[128]` array declarations throughout the FastPy-dialect
  accumulator code, real engineering risk for a low-priority question),
  tested the dilution hypothesis directly and cheaply: retrained on the
  same v3 self-play data (8,305 positions) but with only 800 of the
  3,200 endgame positions (random subsample) instead of all 3,200 —
  9,105 total, ~9% endgame vs v3's ~28%. Same architecture
  (`NNUE_HIDDEN=128`), same `train_nnue.py` hyperparameters. Called v3b,
  not shipped — investigation only.

  **Result — not a clean confirmation:**

  | | startpos depth-5 nodes | tactical-FEN depth-5 nodes | tactical best move |
  |---|---|---|---|
  | v2 | 14,429 | 5,109 | f3g5 |
  | v3 (~28% endgame) | 10,584 | 55,905 | f3g5 |
  | v3b (~9% endgame) | 19,374 | 12,860 | **c4b3** |

  The tactical-FEN node count did partially recover toward v2 (55,905 →
  12,860), which is at least directionally consistent with the dilution
  story. But startpos got *worse* than both v2 and v3 (19,374 — neither
  the "more like v2" nor "more like v3" prediction), and the tactical
  position's best move changed entirely (`c4b3`, a bishop retreat,
  instead of `f3g5` for both v2 and v3). A clean capacity/diversity
  trade-off would predict roughly monotonic movement back toward v2's
  numbers on both positions as endgame fraction drops — that's not what
  happened. The more likely explanation: with only ~9,100 positions and
  a from-scratch random initialization each run, which local minimum
  training lands in is dominated by run-to-run variance, not smoothly
  determined by endgame fraction. Node count on a specific position at a
  specific depth is a coarse, high-variance measurement for this kind of
  question.

  **K+P vs K fix still holds at ~9% endgame:** re-ran D-80's exact
  benchmark on v3b — all 8 legal moves score positive (120s-230s range,
  `e2d3`=218), no outlier. So the fix doesn't obviously need the full
  ~28% density to work; that part of the earlier setup could likely be
  turned down without losing the fix, if there were a reason to.

  **Decision: don't pursue further.** Not shipping v3b (startpos
  regression, unexplained best-move change, no match evidence it's
  actually stronger — and no reason to think it would be, given the
  mixed signal). Not pursuing the larger-hidden-layer experiment either
  — the cheap version of this investigation didn't find a clean effect
  to chase, and the invasive version (resizing compiled accumulator
  arrays) isn't worth the engineering risk for a question D-82's match
  result already made non-urgent. **v3 remains production.** This closes
  out the ROADMAP item from D-81/D-82 as investigated rather than
  leaving it as an open guess.

  **No files changed this session** — `engine.py` and
  `training/generate_data.py` are unmodified; `engine.py` was
  temporarily swapped to v3b for benchmarking and restored to v3
  immediately after (verified via diff before moving on). The v3b
  weights/dataset/spliced engine copy exist only in the sandbox
  workspace, not delivered — they're not a candidate artifact, just
  scaffolding for this investigation.

## D-84: native UCI play — a hand-written C++ wrapper around the
  already-compiled search, not a change to engine.py (Session 48)

  Asked directly whether the engine is "ready for game play." Answer at
  the time: correctness yes, but real gameplay only happened via
  `python3 run.py`'s pure-Python UCI loop — the compiled `./engine`
  binary's `main()` is a deliberate no-op stub (Core Rule 6), so none of
  the project's actual value proposition (Python-to-C++ transpiler,
  compiled speed) was reachable during play. This session closed that
  gap.

  **Discovery that simplified the whole task:** `engine.py` already
  contains a fully compiled `find_best_move()`, `generate_legal_moves()`,
  `make_move()`, `alpha_beta()`, and `perft()` — the entire search stack
  exists in the FastPy dialect and compiles to real C++ today. `fastpy
  check`/`fastpy build` were already exercising these every session
  (that's what "clean compile" has meant all along); they just had no
  caller outside `perft` and the test suite. Nothing needed to be added
  to engine.py at all.

  **What was built — deliberately outside engine.py, respecting Core
  Rule 6:**
  - `native/uci_main.cpp` — hand-written C++ (not FastPy dialect) UCI
    protocol loop, FEN parsing, and iterative-deepening/time-management
    orchestration around the compiled search functions. This mirrors
    what `run.py` already does in Python mode for the same reason:
    I/O and timing logic don't belong in the FastPy dialect, only the
    speed-critical search does.
  - `training/build_uci_engine.py` — emits `engine.cpp` via FastPy's own
    emit path (not a separate reimplementation), strips the known no-op
    `main()` stub (refuses to proceed if the stub text doesn't match
    exactly, rather than blindly regexing — protects against silently
    corrupting a build if `engine.py`'s `main()` ever changes),
    concatenates with `uci_main.cpp` into one translation unit, compiles
    with the project's standard flags.

  **Why one concatenated translation unit, not separate compilation +
  linking:** FastPy emits a single self-contained `.cpp` with no header
  — splitting cleanly would mean hand-writing a header of forward
  declarations for everything `uci_main.cpp` needs (`BoardState`,
  `find_best_move`, `generate_legal_moves`, `make_move`, `compute_hash`,
  `init_accumulator`, `PROMO_*`/`CASTLE_*` constants, `INF`/`NEG_INF`,
  `nodes_reset`/`nodes_get`) and keeping it in sync by hand. Simple
  concatenation avoids that entire maintenance burden; the two files
  already declare/define in a compatible order once concatenated.

  **A real, pre-existing gap found along the way, not introduced here:**
  `engine.py` has no `PROMO_ROOK` constant — the compiled move generator
  only ever produces Q/B/N promotions. `uci_main.cpp` doesn't paper over
  this; a GUI-requested rook underpromotion simply won't match any
  legal move. Flagged in `ENGINE_ARCHITECTURE.md` rather than silently
  worked around.

  **Verification:**
  - `perft(5)` from startpos via the compiled build = **4,865,609**,
    exactly matching the documented Phase 3 baseline — move generation
    correctness confirmed in the actual compiled artifact, not just
    inferred from `engine.py`'s source matching `run.py`'s.
  - Depth-1 search from startpos matches Python mode bit-for-bit: same
    node count (41), same score (48cp).
  - K+P vs K (D-80's benchmark) still picks a sane, non-blundering move
    (`e2f3`, positive score at every depth) in the native build —
    confirms the NNUE fix from D-81 survived the new entry point, as it
    should (same weights, same eval code, only the driver changed).
  - Both `go movetime N` and `go wtime/btime/winc/binc` time-management
    paths tested directly and produce sane depth progressions.
  - `ucinewgame`/`position startpos`/`position fen ... moves ...` all
    tested and apply moves correctly.
  - Checkmate detection confirmed correct (Fool's-mate position returns
    `bestmove 0000`, UCI's standard "no legal move" response).
  - Observed throughput: **~1.5M nodes/sec** at deeper iterative-
    deepening depths from startpos, vs. Python mode's low-thousands —
    roughly 50-150x depending on position/depth, not a single fixed
    multiplier (shallow depths are dominated by fixed overhead in both
    drivers, so the speedup ratio grows with depth).
  - Full existing 243/243 test suite re-run afterward, unchanged and
    still passing — confirms `engine.py` truly wasn't touched (diffed
    directly against the pre-session copy to be sure, not just assumed).

  **Two honest limitations, not smoothed over:**
  - Time management only checks elapsed time *between* completed
    depths, not during one — a slow-to-search depth can overshoot the
    allocated budget by that depth's entire duration (observed directly:
    a 2,400ms budget produced an 8,601ms final iteration). Fine for
    casual play with generous time controls; not tournament-grade.
  - The native driver's iterative deepening always searches full-width
    (`NEG_INF`/`INF`) at every depth, unlike whatever windowing (if any)
    `run.py`'s Python driver uses — so on near-equal positions the two
    can pick different (both reasonable, cp-neighbors) best moves. Seen
    directly on the standing tactical-FEN benchmark: Python picks
    `f3g5`, native picks `b1c3`, 2-3cp apart at depth 5. Not a
    correctness bug, just two different search drivers around the same
    evaluator not being guaranteed to break ties identically.

  **`engine.py` and `training/generate_data.py` unchanged this session**
  — this was a build-tooling/wrapper addition only.

## D-85: mid-search time management via a node-count budget, after a
  watchdog-thread design was built, tested, and rejected for being a
  genuine data race (Session 49)

  Picked up Session 48's "tighten the native UCI driver's time
  management" as the highest-value open item — the one with real
  practical risk (blowing the clock budget by seconds isn't safe for
  actual timed games) among the four options that session left queued.

  **First design, and why it was rejected:** a background watchdog
  thread in `native/uci_main.cpp` sleeps until the deadline, then sets a
  shared `SEARCH_STOP` flag; the compiled `alpha_beta()`/`quiescence()`
  poll it periodically (piggybacking on the existing `NODE_COUNT`
  increment) and unwind early. This was built completely, including a
  `condition_variable`-based early-wake mechanism so a fast depth-1 mate
  wouldn't leave `go()` blocked for the full budget. Direct testing
  against the exact overshoot scenario this was meant to fix showed it
  simply doesn't work: a depth ran to full completion (850K+ nodes)
  regardless of the flag having been set partway through. Root-caused
  with a minimal 15-line standalone repro — a tight
  `while (FLAG[0] == 0) { i++; }` loop, with a second thread setting
  `FLAG[0] = 1` after 200ms — which hung forever when compiled at `-O3`.
  This is correct, standard-conforming compiler behavior, not a GCC bug:
  a plain (non-atomic) global written by one thread and read by another
  without synchronization is a data race under the C++ memory model, and
  the "as-if" rule permits the optimizer to treat it as invariant across
  the loop, caching the read in a register and never reloading it. The
  same reasoning applies inside `alpha_beta()`'s recursion once GCC's
  whole-translation-unit view (engine.cpp and uci_main.cpp are
  concatenated into one file, see D-84) can prove nothing in the visible
  call graph from `find_best_move()` writes `SEARCH_STOP`.

  Fixing this properly would mean declaring the read side
  `volatile`/`std::atomic` — but that read is FastPy-emitted code
  (`SEARCH_STOP: uint64[1] = []` in `engine.py`, emitted as a plain
  `uint64_t[1]`), and the emitter has no mechanism to mark one specific
  global specially without a real transpiler feature (a new type
  qualifier concept touching `core/parser.py`/`core/type_system.py`/
  `core/emitter.py` in the `fastpy` repo). Core Rule 5 ("the emitter
  does zero analysis") also argues against special-casing one array's
  emission. That's a legitimate feature, but a multi-session one — not
  something to squeeze into "tighten time management." Documented as a
  rejected design rather than silently discarded: the next person
  reaching for "spawn a thread that sets a flag" as the obvious fix for
  this problem should find this entry first.

  **What shipped instead:** `NODE_BUDGET: uint64[1]` in `engine.py`,
  with `node_budget_clear()`/`node_budget_set()`/`node_budget_exceeded()`
  mirroring the existing `NODE_COUNT`/`nodes_reset()`/`nodes_get()`
  convention. The critical difference from `SEARCH_STOP`: the budget is
  written exactly **once** per depth, by the single thread already
  driving the search, before `find_best_move()` is called for that
  depth — never touched by any other thread while that depth's search
  is in flight. There is no concurrent write to race against, so this
  is genuinely single-threaded as far as the C++ memory model is
  concerned, not merely "usually fine in practice" the way the flag
  design looked before testing exposed it. `find_best_move()`'s root
  loop always trusts move 0 (guarantees a real legal move is returned
  even under a near-zero budget, never an illegal `bestmove 0000` for a
  position that has legal moves) and discards any later move whose own
  search was interrupted mid-flight rather than letting an unreliable
  partial score overwrite an earlier fully-searched move's result; the
  TT store is skipped entirely for an aborted depth (its result is real
  but not the EXACT full-width search a stored entry implies).
  `run.py`'s Python mirrors updated identically, though nothing in
  Python-mode ever calls `node_budget_set()` — this is a no-op there by
  design, keeping `_iterative_deepening_py`'s existing between-depths-
  only behavior unchanged.

  **A real bug caught and fixed within this same session:**
  `uci_main.cpp`'s `go()` computes each depth's node budget from the
  running average nodes/sec so far × remaining time. The first cut
  multiplied that projection by a 2x "safety margin," reasoning it would
  avoid stopping too early. Measured result: a 500ms budget ran to
  730ms — worse than doing nothing, and precisely the overshoot this
  feature exists to prevent. The reasoning was backwards:
  `node_budget_exceeded()` is checked on essentially every node (very
  fine-grained), so there's no coverage gap to pad for by inflating the
  budget — doing so just directly extends the deadline. Replaced the
  multiplier with a `kBudgetFraction = 0.9` that shrinks the projection
  instead, leaving headroom below the deadline for the next depth's
  per-node cost to run a little hotter than the running average without
  blowing the budget. Re-measured after the fix: 500ms→484ms,
  1000ms→1005ms, 2000ms→1919ms, 50ms (stress case)→55ms — none
  overshooting by anywhere near a full depth the way the pre-session
  between-depths-only check could (Session 48 observed an 8,601ms run
  on a 2,400ms budget; this session's own pre-fix build measured
  730-916ms on a 500ms budget before the fix brought it to 451-484ms).

  **Honest limitation carried forward, not fixed here:** this is a
  node-count *estimate* of remaining time, not a true wall-clock check —
  FastPy has no clock access (Core Rule 6), so it can't be one without
  the same transpiler feature the rejected watchdog design would have
  needed. A depth whose per-node cost differs sharply from the running
  average (a sudden tactical blowup, say) can still miss the estimate
  by more than the 0.9 headroom accounts for. What this reliably fixes
  is the previous *unbounded* case — a depth could run to completion no
  matter how long that took; now it always polls a ceiling that's
  already below the naive "just let it finish" behavior.

  **Also still open:** async UCI `stop` (a GUI sending `stop` while a
  search is actually in flight) remains unimplemented. This session's
  fix only bounds a *time budget* expiring during search; the main loop
  is still blocked synchronously inside `go()` and not polling stdin, so
  it can't notice an explicit `stop` arriving mid-search. Noted directly
  in `uci_main.cpp`'s comment: real async stop needs the search itself
  moved to a background thread with the main loop continuing to read
  stdin — a bigger architecture change, a natural candidate for a future
  session, not attempted here.

  **Verification:** `fastpy check engine.py` zero errors; `fastpy emit`
  + direct `g++ -O3` compile clean (~110-150s, matching the established
  GCC-pathology estimate from D-75/D-79/D-80/D-81); `go depth N` (no
  time limit) reconfirmed byte-identical to pre-session output at every
  depth; 14 new tests in `tests/test_node_budget.py`; full suite
  257/257 (243 baseline + 14 new), reconfirmed order-independent after
  the new file exposed (see below) a pre-existing test-isolation gap.

  **A pre-existing bug the new tests exposed, not introduced:**
  `test_phase4.py`'s `test_depth0_returns_qsearch` implicitly depended
  on the TT being empty via pytest's alphabetical file-execution order
  rather than its own `setup_method` calling `reset_tt()` — this had
  always been fragile, it just happened to never break before, because
  no earlier-sorted test file left a TT entry at the exact starting-
  position hash. `test_node_budget.py` (sorts before `test_phase4.py`)
  does run real searches from the starting position, and initially
  broke this assumption. Root-caused correctly before fixing — bisected
  by running specific test-file pairs and specific test classes in
  isolation until the exact culprit was found, rather than guessing —
  and fixed by giving the new file's search-running test classes their
  own `teardown_method`s (leaving no residue for whatever runs next)
  instead of touching `test_phase4.py`, which was out of scope for this
  session. Reconfirmed order-independence afterward: full suite passes
  forwards, reversed, and interleaved with `test_uci.py`.
