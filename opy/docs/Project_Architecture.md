# OxyPy Chess Engine — Project Architecture

> **Doc 1 of 4** — companion docs: [Decisions.md](./Decisions.md) · [Roadmap.md](./Roadmap.md) · [SessionLog.md](./SessionLog.md)
> Docs repo: `c3egc3/c3e` (`opy/docs/`) · Engine repo: `g-c-3/OxyPy`
> Last confirmed accurate: Session 0 (2026-07-05)

**License:** GPLv3 (required due to Stockfish NNUE dependency)
**Team:** Gokul Chandar as creator & project director + Claude as AI coding assistant
**Infrastructure:** Mobile device, GitHub, GitHub Actions, no local dev machine

---

## 1. Goals & Honest Framing

Two separate claims, tracked independently:

| Claim | Type | Status |
|---|---|---|
| Fastest Python-interfaced chess engine (Rust-backed) | Verifiable via NPS benchmark | Achievable early, low risk |
| 3600+ Elo (CCRL-comparable) | Verifiable via SPRT vs. reference engines | Long-term target, compute-gated |

These should never be conflated in public-facing docs. The first is a benchmark claim. The second is an Elo claim requiring a real testing campaign.

---

## 2. System Architecture

```
[ Chess GUI (Arena / Cutechess / OpenBench) ]
              │
     (UCI protocol via stdin/stdout)
              │
              ▼
┌───────────────────────────────┐
│  PYTHON UCI SHIM               │  Thin layer only.
│  (oxypy/main.py)               │  Text I/O, command routing,
│                                 │  time control parsing.
└───────────────┬─────────────────┘
                │ (PyO3 bindings, zero-copy)
                ▼
┌───────────────────────────────┐
│  RUST ENGINE CORE               │  Owns all hot-path logic:
│  (rust_engine_core)             │  bitboards, move generation,
│                                 │  alpha-beta search, TT, pruning.
└───────────────┬─────────────────┘
                │
                ▼
┌───────────────────────────────┐
│  CURRENT STOCKFISH NNUE NET     │  SFNNv10 (or latest default net
│  (via official networks repo)   │  from official-stockfish/networks)
└───────────────────────────────┘
```

### 2.1 Python Layer
- Role: UCI protocol shim only.
- Responsibilities: stdin/stdout text handling, command parsing, delegating to Rust core via PyO3.
- Explicitly **not** in the hot path — no search, no eval, no move generation logic in Python.

### 2.2 Rust Core
- Role: all performance-critical logic.
- Responsibilities: bitboard representation, legal move generation, alpha-beta search with pruning (LMR, null-move, aspiration windows), transposition table (Zobrist-hashed, not "cryptographic" — pseudo-random, not security-hashed), quiescence search, NNUE inference (incremental accumulator updates).
- Compiled ahead-of-time; no JIT needed inside this layer.

### 2.3 On "JIT compilation"
Rust is AOT-compiled — a JIT adds no benefit inside the Rust core. If a JIT is used at all, it must have a specific, named job (e.g. Numba-accelerated Python-side tooling for offline analysis/training scripts, *not* the hot path). Until a concrete use case is defined, JIT is **out of scope** for the live engine to avoid architecture confusion. Revisit only if a specific bottleneck justifies it.

---

## 3. Evaluation: NNUE

- **Source:** current default network from [official-stockfish/networks](https://github.com/official-stockfish/networks), pinned by SHA.
- **Architecture:** unaltered weights — OxyPy's Rust code is written to match the network's expected input layout, not the other way around.
- **Incremental accumulation:** on each move, subtract departed-square features and add arrival-square features rather than recomputing all inputs — standard NNUE efficiency technique.
- **No retraining planned** at this stage; strength gains come from search quality, not eval modification.

---

## 4. Search Roadmap (where Elo is actually won)

Eval network strength is necessary but not sufficient. Search efficiency is the dominant factor at 3000+ Elo and is **not** solved by wiring in a strong net. Planned components, roughly in build order:

1. Bitboard move generation + basic alpha-beta + iterative deepening
2. Transposition table (Zobrist hashing)
3. Move ordering: MVV-LVA, killer moves, history heuristic
4. Quiescence search (capture-only horizon extension)
5. Null-move pruning
6. Late Move Reductions (LMR)
7. Aspiration windows
8. Singular extensions, correction history (later-stage refinements)
9. Time management tuned to position complexity

Each of these is a tunable parameter set — not a one-time implementation. Strength comes from iterative tuning against reference opponents, not from writing the feature once.

> This is the **technical** build-order reference. For live, checkable task status, see [Roadmap.md](./Roadmap.md).

---

## 5. Testing & Tuning Infrastructure

**Method:** SPRT (Sequential Probability Ratio Test) — the standard method (used by Stockfish's Fishtest, and by independent engines like Ethereal/Berserk/Obsidian) for detecting small Elo deltas from parameter or code changes.

**Framework:** [OpenBench](https://github.com/AndyGrant/OpenBench) — self-hostable SPRT coordinator, free/open source, purpose-built for this.

**Compute stack (given solo/mobile-only constraints):**

| Source | Role | Notes |
|---|---|---|
| GitHub Actions | Primary CI + test workers | Free on public repos, unlimited minutes, ~2 cores/runner, up to 20 concurrent jobs |
| Kaggle CPU notebooks | Supplementary batch workers | Up to 12 hrs/session background execution; not a persistent daemon, must be manually/API-relaunched; check Kaggle ToS re: non-ML compute use before relying on it |
| Community volunteers (future) | Scaled testing once public | Standard model used by open-source engines once project has visibility |

**Not relied upon:** local compilation or testing (no dev machine) — all builds and test runs happen in CI/cloud.

---

## 6. Build & CI Pipeline

1. GitHub Actions triggers on push.
2. Spin up Ubuntu runner → install Rust toolchain + Python.
3. Compile Rust core, generate PyO3 bindings.
4. Package as installable Python wheel (`.whl`).
5. Run sanity match set (fixed small game count vs. baseline) to catch regressions before merge.
6. Full SPRT tuning runs triggered separately (not on every commit — too expensive) via OpenBench.
7. Errors/exceptions logged to isolated debug log, not the UCI stdout stream.

---

## 7. Licensing & Attribution

- **Project license:** GPLv3 (required — the NNUE weights and derived architecture assumptions inherit from Stockfish, a GPLv3 project).
- Must include: GPLv3 license file, credit to the Stockfish authors/contributors, and clear notice that OxyPy uses an unmodified Stockfish-trained NNUE network.
- No claim of "UCI registration" or similar — UCI is an open protocol with no registry; this line is removed from all public docs.

---

## 8. Milestones (Honest Roadmap)

| Milestone | Target Elo (rough) | Timeframe | Claimable now? |
|---|---|---|---|
| Working engine, passes sanity tests, legal GPLv3 release | N/A (correctness, not strength) | Near-term | Yes — "functional Rust-backed Python UCI engine" |
| Manually tuned baseline | ~2800–3100 | Weeks–months | Yes, once measured |
| Sustained SPRT-tuned engine | 3300+ | Ongoing, compute-gated | Only once actually measured via SPRT vs. references |

**Rule:** no Elo number is stated publicly until it's been produced by an actual SPRT/rating-list result. Until then, roadmap targets are labeled as targets, not claims.

> For live checkbox tracking of these milestones, see [Roadmap.md](./Roadmap.md). For the log of *why* each architectural choice above was made, see [Decisions.md](./Decisions.md).
