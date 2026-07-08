# OxyPy — Session Log

> **Doc 3 of 4** — companion docs: [Project_Architecture.md](./Project_Architecture.md) · [Decisions.md](./Decisions.md) · [Roadmap.md](./Roadmap.md)

Append-only. One entry per working session, **newest at the top**. This is the file "Go" and "Continue" both read first (specifically the *last* entry).

## Entry template
```
## Session N — YYYY-MM-DD
**Started from:** (trigger word used, or manual instruction)
**Summary:** what got done, in plain terms
**Files touched:**
  - NEW: path/to/file (created in full)
  - DELTA: path/to/file (changed via find/replace)
**Decisions logged:** D<N>.<n>, D<N>.<n> (or "none")
**Status at end of session:** done / mid-task
**If mid-task — exact resume point:** (only needed if status = mid-task; this is what "Continue" uses)
**Next logical step (for "Go"):** what the Roadmap says should happen next
```

---

## Session 3 — 2026-07-08

**Started from:** `Continue` (previous session status was "done," so treated as `Go`)
**Summary:** Implemented basic alpha-beta search with iterative deepening (negamax form, no move ordering/TT/quiescence yet — those are the next Roadmap items). Added `eval.rs`, a deliberately minimal material-count evaluator so the search has a leaf-node score to work with; explicitly labeled as a placeholder for the future NNUE integration item, not something to tune. Added the supporting plumbing needed to actually drive this from UCI: `Board::to_fen` (position serialization, previously only `from_fen` existed), `Move::to_uci` / `find_legal_move` (UCI long-algebraic move formatting/parsing against the legal move list), and two new PyO3 bindings — `apply_uci_move(fen, move) -> fen` and `best_move(fen, max_depth, movetime_ms) -> (move_uci, score)`. Wired `position` (startpos/fen + moves) and `go` (depth/movetime) into `oxypy/main.py` so the engine is actually playable end-to-end via UCI, not just internally tested Rust code — this wasn't strictly named on the Roadmap line item but the alpha-beta work is otherwise dead code with no way to invoke it.
Verified real correctness, not just "it compiles": ran the full test suite (22 tests) including a confirmed Fool's-Mate checkmate position (cross-checked with the engine's own `legal_moves`/`in_check` before writing the assertion, after an initial hand-picked FEN turned out not to actually be checkmate), a hanging-queen capture test, a short-time-budget test that doesn't panic, and two `to_fen` round-trip tests (startpos + Kiwipete). Built the real wheel via maturin and piped realistic UCI sequences (`uci`/`isready`/`position ... moves ...`/`go depth N`/`go movetime N`) through the actual shim end-to-end, confirming correct `bestmove` output including for a completed-checkmate position (`bestmove 0000`, per UCI convention).
While testing, discovered that an illegal/malformed move sent via `position ... moves ...` crashes the whole shim process with an uncaught Python exception (traceback on stderr, but the process dies) -- a real regression risk introduced by adding move-parsing this session, and in tension with D0.13. Added a minimal try/except boundary around command dispatch as a stopgap (errors to stderr, process keeps running) rather than building out the full "isolated debug log" that's explicit Roadmap Phase 3 scope; flagged in case the project director wants that pulled forward instead.
No new Cargo dependencies were needed; `Cargo.lock` is unchanged.

**Files touched:**
- NEW: `rust_engine_core/src/eval.rs`
- NEW: `rust_engine_core/src/search.rs`
- DELTA: `rust_engine_core/src/bitboard.rs` (re-export `find_legal_move`, `Color`/`Piece`/`ALL_PIECES`)
- DELTA: `rust_engine_core/src/bitboard/board.rs` (added `to_fen`)
- DELTA: `rust_engine_core/src/bitboard/movegen.rs` (added `Move::to_uci`, `find_legal_move`)
- DELTA: `rust_engine_core/src/lib.rs` (added `apply_uci_move`, `best_move` PyO3 bindings)
- DELTA: `oxypy/main.py` (`position`/`go` handling, time-control parsing, error boundary)
- DELTA: `Roadmap.md` (Phase 2 alpha-beta/iterative-deepening item checked off)

**Decisions logged:** none formalized this session -- the error-boundary stopgap (partial D0.13 compliance ahead of full Phase 3 logging infra) and material-eval-as-placeholder framing are implementation choices in service of existing decisions/roadmap items, not new standing ones. Flagging both in case the project director wants either formalized. Also flagging the D0.9-vs-actual-practice tension noted above (see this session's summary) for the director's attention -- not resolved unilaterally.

**Status at end of session:** done

**If mid-task — exact resume point:** N/A

**Next logical step (for "Go"):** Roadmap Phase 2 — "Transposition table (Zobrist hashing)" is the next unchecked item, followed by "Move ordering: MVV-LVA, killer moves, history heuristic." Either would meaningfully improve on this session's no-ordering, no-TT search. Zobrist hashing is listed first and is also a prerequisite for move-ordering techniques that use TT-stored best moves, so it's the more natural next step.

---

## Session 2 — 2026-07-06

**Started from:** `Continue` (previous session status was "done," so treated as `Go`)
**Summary:** Implemented full legal move generation for all piece types, expanding the empty `bitboard.rs` stub into a module tree: `types` (Color/Piece/Square), `attacks` (knight/king/pawn formulas + ray-scanning sliding attacks for bishop/rook/queen — classical approach, not magic bitboards, since Phase 2's bar is correctness not speed), `board` (Board state, FEN parsing, `is_square_attacked`/`in_check`, copy-make `make_move`), `movegen` (pseudo-legal generation for every piece including castling/en passant/promotions, plus `legal_moves` filtering via copy-make + check detection), and `perft` (move-count correctness testing). Also added a `perft(fen, depth)` PyO3 binding in `lib.rs` alongside `ping`, as a low-cost byproduct that gives future CI sanity-testing (Phase 3) a hook to call into from Python.
Correctness was verified, not assumed: built and ran the full test suite in a sandbox against three well-known standard perft positions (starting position, "Kiwipete," and "Position 3") at depths 1–4, all matching publicly documented node counts exactly. Also ran an ad-hoc depth-5 starting-position check (4,865,609 nodes, correct) for extra confidence before discarding that scratch test. One of my own hand-written unit tests (a pin test) initially failed — traced it to a wrong test FEN (bishop wasn't actually on the pin line), not a move-generation bug; fixed the test position and it passed. Also verified the wheel builds from the final deliverable files and that `rust_engine_core.perft(...)` is callable from Python end-to-end, including the FEN-error path raising `ValueError` correctly.
No new Cargo dependencies were needed (everything is std + the existing `pyo3` dependency), so `Cargo.lock` is unchanged from last session.

**Files touched:**
- NEW: `rust_engine_core/src/bitboard/types.rs`
- NEW: `rust_engine_core/src/bitboard/attacks.rs`
- NEW: `rust_engine_core/src/bitboard/board.rs`
- NEW: `rust_engine_core/src/bitboard/movegen.rs`
- NEW: `rust_engine_core/src/bitboard/perft.rs`
- DELTA: `rust_engine_core/src/bitboard.rs` (empty stub → module tree root)
- DELTA: `rust_engine_core/src/lib.rs` (added `perft` PyO3 binding)
- DELTA: `Roadmap.md` (Phase 2 bitboard move generation item checked off)

**Decisions logged:** none this session — sliding-attack approach (classical ray-scanning, not magic bitboards) and copy-make (not make/unmake) were implementation choices made in service of the existing Phase 2 "correctness first" framing already implicit in Architecture.md §4, not new standing decisions. Flagging here in case the project director wants either formalized as a Decision entry; happy to add one on request.

**Status at end of session:** done

**If mid-task — exact resume point:** N/A

**Next logical step (for "Go"):** Continue Roadmap Phase 2 — "Basic alpha-beta + iterative deepening" is the next unchecked item, and can now build directly on `bitboard::{Board, legal_moves, Move}` from this session.

---

## Session 1 — 2026-07-06

**Started from:** `Go`
**Summary:** Found the engine repo only had a stray empty `Engine.py` at the root — no scaffolding existed yet, so finished the rest of Phase 0 and all of Phase 1 in one session. Added the full verbatim GPLv3 `LICENSE` and a `THIRD_PARTY_NOTICES.md` covering the Stockfish NNUE attribution requirement (Architecture.md §7, D0.1). Scaffolded the mixed Rust/Python project: `rust_engine_core` crate with an empty `bitboard` module and a `ping()` PyO3 function, `oxypy/main.py` UCI shim, and a root `pyproject.toml` wiring them together via maturin. Added the first GitHub Actions workflow (`build.yml`) that builds the wheel on push/PR with no tests yet, per Roadmap.
Everything was actually built and run in a sandboxed environment before delivery, not just written from memory: installed Rust + maturin, compiled the crate cleanly, built the real wheel from the `pyproject.toml` layout, confirmed `rust_engine_core.ping()` returns `"pong"` after installing the wheel, and piped `uci`/`isready`/`ucinewgame`/`quit` into the shim and confirmed the exact expected output/behavior for each.
Flagged for the project director: the stray `Engine.py` at the repo root should be deleted by hand — it predates this structure and doesn't fit it, and per the delta protocol a new-session Claude can't delete existing files itself.

**Files touched:**
- NEW: `LICENSE`
- NEW: `THIRD_PARTY_NOTICES.md`
- NEW: `.gitignore`
- NEW: `pyproject.toml`
- NEW: `oxypy/__init__.py`
- NEW: `oxypy/main.py`
- NEW: `rust_engine_core/Cargo.toml`
- NEW: `rust_engine_core/Cargo.lock`
- NEW: `rust_engine_core/src/lib.rs`
- NEW: `rust_engine_core/src/bitboard.rs`
- NEW: `.github/workflows/build.yml`
- DELTA: `Roadmap.md` (Phase 0 + Phase 1 items checked off)

**Decisions logged:** none (no new architecture/process decisions — this session executed against existing decisions)

**Status at end of session:** done

**If mid-task — exact resume point:** N/A

**Next logical step (for "Go"):** Begin Roadmap Phase 2 — bitboard move generation (legal moves, all piece types) is the first item, and is the actual meat of the `bitboard` module currently left as an empty stub in `rust_engine_core/src/bitboard.rs`.

---

## Session 0 — 2026-07-05

**Started from:** Manual instruction (project kickoff)
**Summary:** Established the 4-document control system for cross-session continuity. Reviewed and accepted the initial `Project_Architecture.md` (uploaded by project director) covering system architecture, NNUE eval strategy, search build order, testing/compute infrastructure, licensing, and honest-framing rules around Elo claims. Created `Decisions.md` seeded with the 14 decisions already implicit in the architecture doc. Created `Roadmap.md` as a checkbox task list distinct from Architecture §4/§8 (which remain the technical/target reference). Created `CLAUDE_PROJECT_INSTRUCTIONS.md` defining the delta-based update protocol and the "Go"/"Continue" trigger words. No engine code written yet.

**Files touched:**
- NEW: `Project_Architecture.md`
- NEW: `Decisions.md`
- NEW: `Roadmap.md`
- NEW: `SessionLog.md` (this file)
- NEW: `CLAUDE_PROJECT_INSTRUCTIONS.md`

**Decisions logged:** D0.1 – D0.14 (see Decisions.md)

**Status at end of session:** done (docs/governance phase only — no mid-task engine work to resume)

**If mid-task — exact resume point:** N/A

**Next logical step (for "Go"):** Begin Roadmap Phase 1 — scaffold the `rust_engine_core` crate (empty bitboard module + PyO3 skeleton that builds), scaffold `oxypy/main.py` (UCI shim that can respond to `uci`, `isready`, `quit` with no real search yet), and stand up the first GitHub Actions workflow that just builds the wheel on push (no sanity matches yet, since there's no move generation to sanity-check).
