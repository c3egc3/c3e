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
