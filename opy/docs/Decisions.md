# OxyPy — Decisions Log

> **Doc 2 of 4** — companion docs: [Project_Architecture.md](./Project_Architecture.md) · [Roadmap.md](./Roadmap.md) · [SessionLog.md](./SessionLog.md)

This file is an append-only log of decisions and *why* they were made. Architecture.md says what the system is; this file says why it's that way and not some other way.

## How to add a new decision
- Never renumber or delete past entries, even if later superseded — add a new entry that supersedes it and cross-reference the old ID.
- Format: `D<session>.<n>` — e.g. the 3rd decision logged in Session 2 is `D2.3`.
- New entries are appended as a **delta** (find the last line of the file, replace with itself + the new block) — never as a full file rewrite.

---

## Session 0 — 2026-07-05

**D0.1 — License: GPLv3**
Required because the NNUE weights and derived architecture assumptions inherit from Stockfish, a GPLv3 project. Not a preference — a compliance requirement.

**D0.2 — Language split: Python UCI shim + Rust engine core via PyO3**
Python handles only stdin/stdout UCI protocol text and command routing. All hot-path logic (bitboards, move gen, search, TT, NNUE inference) lives in Rust, called via zero-copy PyO3 bindings. Keeps Python overhead out of the search loop entirely.

**D0.3 — NNUE: use unmodified official Stockfish network, pinned by SHA**
No retraining planned at this stage. OxyPy's Rust code is written to match the network's expected input layout, not the other way around. Strength gains at this stage come from search quality, not eval modification.

**D0.4 — Two claims tracked independently, never conflated**
"Fastest Python-interfaced engine" is a benchmark claim (NPS-verifiable, achievable early). "3600+ Elo" is an Elo claim (SPRT-verifiable, compute-gated, long-term). Public docs must never blend these into one claim.

**D0.5 — No public Elo numbers until SPRT-verified**
No Elo figure is stated publicly until it has been produced by an actual SPRT run or rating-list result. Roadmap targets are labeled as targets, not achievements, until then.

**D0.6 — JIT compilation is out of scope for the live engine**
Rust core is AOT-compiled; a JIT adds nothing there. If JIT is used at all, it's scoped narrowly to offline Python-side tooling (e.g. Numba for analysis/training scripts) — never the hot path — and only once a concrete bottleneck justifies it.

**D0.7 — Testing method: SPRT via self-hosted OpenBench**
Industry-standard method (used by Fishtest and independent engines like Ethereal/Berserk/Obsidian) for detecting small Elo deltas reliably. OpenBench chosen as the free, self-hostable, purpose-built coordinator.

**D0.8 — Compute stack: GitHub Actions (primary) + Kaggle (supplementary) + community (future)**
Chosen given solo/mobile-only constraints — no local dev machine. GitHub Actions is free/high-concurrency on public repos. Kaggle CPU notebooks are supplementary batch workers (12hr sessions, not persistent, ToS for non-ML use to be checked before relying on it further). Community volunteer testing is deferred until the project has public visibility.

**D0.9 — No local compilation or testing at any stage**
All builds and test runs happen in CI/cloud, by infrastructure constraint (mobile-only development).

**D0.10 — No "UCI registration" claims**
UCI is an open protocol with no registry to register with. Any such claim is factually wrong and is removed from all public docs.

**D0.11 — Transposition table hashing described accurately as "Zobrist," not "cryptographic"**
Zobrist hashing is pseudo-random, not a security/cryptographic hash. Terminology kept precise to avoid misleading technical claims.

**D0.12 — Full SPRT runs are not triggered on every commit**
Too expensive to run on every push. Per-commit CI instead runs a small fixed-count sanity match set to catch regressions; full SPRT tuning runs are triggered separately via OpenBench.

**D0.13 — Engine errors/exceptions go to an isolated debug log, not UCI stdout**
Keeps the UCI protocol stream clean for GUI/tooling compatibility.

**D0.14 — Adopt a 4-document control system + delta-based update protocol for cross-session continuity**
Given the project spans many separate conversation windows with no persistent memory, adopted: `Project_Architecture.md`, `Decisions.md`, `Roadmap.md`, `SessionLog.md` (this set) plus a `CLAUDE_PROJECT_INSTRUCTIONS.md` file governing how work resumes across sessions. All *changes* to any existing file (doc or engine code) are delivered as find-and-replace deltas in a single markdown message, never as full-file rewrites; only brand-new files are written in full. See `CLAUDE_PROJECT_INSTRUCTIONS.md` for the exact protocol and trigger words ("Go", "Continue").
