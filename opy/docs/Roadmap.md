# OxyPy — Roadmap
 
> **Doc 4 of 4** — companion docs: [Project_Architecture.md](./Project_Architecture.md) · [Decisions.md](./Decisions.md) · [SessionLog.md](./SessionLog.md)

This is the **live, checkable task list** — the thing "Go" reads to figure out what's next. It tracks *everything* (infra, engine, testing, docs), not just search features. Architecture.md §4 and §8 remain the detailed technical/target reference; this file is the actionable, ordered, tickable version of that.

`- [ ]` = not started/pending · `- [x]` = done · items are worked roughly top-to-bottom within a phase, but not strictly — check SessionLog.md for what's actually in flight.

---

## Phase 0 — Project Setup & Governance
- [x] Draft initial Project_Architecture.md
- [x] Establish 4-doc control system (Architecture, Decisions, Roadmap, SessionLog)
- [x] Write CLAUDE_PROJECT_INSTRUCTIONS.md (cross-session continuity + delta protocol)
- [x] Create `g-c-3/OxyPy` repo structure (empty scaffolding, LICENSE file, .gitignore) — no README
- [x] Add GPLv3 LICENSE file + Stockfish attribution notice to engine repo

## Phase 1 — Engine Skeleton
- [x] `rust_engine_core` crate: empty bitboard module, builds cleanly
- [x] PyO3 bindings: minimal `hello`/`ping` round-trip Python ↔ Rust
- [x] `oxypy/main.py`: UCI shim responds correctly to `uci`, `isready`, `ucinewgame`, `quit`
- [x] Package as installable wheel locally in CI (no publish yet)
- [x] First GitHub Actions workflow: build wheel on push, no tests yet (nothing to test) 

## Phase 2 — Core Search Features (see Architecture §4 for detail)
- [ ] Bitboard move generation (legal moves, all piece types)
- [ ] Basic alpha-beta + iterative deepening
- [ ] Transposition table (Zobrist hashing)
- [ ] Move ordering: MVV-LVA, killer moves, history heuristic
- [ ] Quiescence search
- [ ] Null-move pruning
- [ ] Late Move Reductions (LMR)
- [ ] Aspiration windows
- [ ] NNUE integration (load official Stockfish net, pinned SHA, incremental accumulator)
- [ ] Singular extensions / correction history (later-stage refinement)
- [ ] Time management tuned to position complexity

## Phase 3 — CI & Sanity Testing
- [ ] Sanity match set (small fixed game count vs. a trivial baseline) runs per-push
- [ ] Isolated debug log wired up (errors never touch UCI stdout)
- [ ] NPS benchmark harness (for the benchmark claim — independent of Elo claim)

## Phase 4 — SPRT Infrastructure
- [ ] Self-host OpenBench instance
- [ ] Wire GitHub Actions runners as OpenBench test workers
- [ ] Wire Kaggle CPU notebooks as supplementary batch workers (check ToS first)
- [ ] Run first SPRT baseline vs. a known reference engine

## Phase 5 — Tuning & Milestone Validation
- [ ] "Functional Rust-backed Python UCI engine" milestone reached (correctness, passes sanity tests, GPLv3-released)
- [ ] Manually tuned baseline measured (target ~2800–3100 Elo — **not claimable until measured**)
- [ ] Sustained SPRT-tuned engine measured (target 3300+ Elo — **not claimable until measured**)

## Phase 6 — Public Visibility
- [ ] Open repo up for community volunteer SPRT testing
- [ ] Publish verified NPS benchmark results (fastest-Python-interfaced claim)
- [ ] Publish verified SPRT/rating-list Elo results, if and when measured
