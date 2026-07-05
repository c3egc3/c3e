# DECISIONS.md
# Pet Dragon — Architectural Decisions

## Format
Each decision records: what was decided, why, and what alternatives were rejected.

---

## D1 — Pure Rust, No Forks
**Decision**: Write the engine from scratch in Rust. No forking Stockfish, Leela, or any other engine.

**Why**: Pet Dragon's pawn rules (double-step from rank 1 OR rank 2) are fundamentally different from standard chess. Patching this onto an existing engine would require modifying move generation, evaluation, and NNUE feature extraction in ways that could break existing correctness guarantees. A clean implementation is safer, more maintainable, and conceptually cleaner.

**Rejected**: Forking Stockfish (GPL v3 compatible) — would work legally but Pet Dragon's custom pawn logic would be fighting the engine's assumptions at every layer.

---

## D2 — PawnStartMap Custom Type
**Decision**: Track each pawn's actual starting square in a `PawnStartMap([Option<Color>; 64])` that is set at game creation and never modified during play.

**Why**: Pet Dragon's double-step rule depends on whether a pawn is still on its original starting square — not on its current rank. A White pawn that has moved from rank 1 to rank 2 cannot double-step, even though it's now on rank 2. A pawn that started on rank 2 and is still there can double-step. The only way to correctly distinguish these cases is to record the original starting square.

**Key insight**: If a pawn is still on its starting square → it hasn't moved → double-step eligible. If it has moved away → it's no longer on its starting square → no double-step. No separate "has this pawn moved" flag needed.

**Rejected**: Tracking by current rank — fails the rank1→rank2 case. Tracking by "has moved" flag in the move struct — adds complexity to make/unmake.

---

## D3 — Dynamic Castling Rights
**Decision**: At game setup, detect whether each Rook landed on its standard square (a1/h1/a8/h8) and set castling rights accordingly. Rights are then managed exactly like standard chess from that point.

**Why**: The White King is always on e1 (and Black King always on e8), so the only variable is Rook positions. If a Rook randomly lands on h1, kingside castling is available; otherwise it never will be. This gives ~26% of games some castling availability.

**Implication**: ~74% of Pet Dragon games have no castling. King safety evaluation must not assume castling has occurred or will occur.

---

## D4 — Lock-Free Transposition Table
**Decision**: Use a single flat array, no mutexes, accept benign data races.

**Why**: This is the standard Stockfish approach. A race condition in the TT causes at most a corrupted entry being read or written — the engine might make a slightly worse move in that rare case, but it never crashes and the performance gain from avoiding locks is substantial at high NPS.

---

## D5 — Borrowed Evaluation Weights
**Decision**: Use piece values and PST tables from Ethereal (GPL v3, Andrew Grant) for the initial HCE.

**Why**: Ethereal's weights are world-class, tuned over millions of self-play games. Building our own weights from scratch would require extensive self-play before they became competitive. Borrowing proven weights lets us reach ~2400-2600 Elo immediately with proper attribution.

**Attribution required**: All borrowed code/weights must credit: "Values borrowed from Ethereal chess engine (GPL v3, Andrew Grant)."

---

## D6 — No Opening Suppression in Evaluation
**Decision**: All evaluation terms apply at full weight from move 1.

**Why**: Standard engines reduce mobility/pawn structure weights in the opening to avoid aggressive early play before development. Pet Dragon has no quiet opening — pieces are already randomly placed on ranks 1-2, open files and diagonals exist immediately. Suppressing eval terms in the "opening" would incorrectly ignore real positional features present from the start.

---

## D7 — King Safety Without Castling Bias
**Decision**: King safety evaluation based purely on pawn shield (pawns near king), piece proximity, attack count, and open files through king. No bonus for having castled.

**Why**: ~74% of Pet Dragon games have no castling at all. A king safety bonus for castling would heavily penalise 74% of all games for something that never happened and couldn't have happened (if the Rook wasn't on the standard square). The pawn shield approach is agnostic to whether castling occurred.

---

## D8 — Open Line Detection from Position 0
**Decision**: Battery detection, open file bonus, and contested file penalties apply from depth 0 (the starting position).

**Why**: Pet Dragon starting positions have ranks 3-6 completely empty. Rooks on rank 1/2 face each other across open files immediately. Batteries (Queen+Rook on same file, Queen+Bishop on same diagonal) exist in starting positions. A standard engine that only detects open lines after "development" would miss these.

---

## D9 — Single Pet Dragon NNUE (Phase 16)
**Decision**: Train one NNUE specifically on Pet Dragon data. Do not implement dual-network architecture (Pet Dragon NNUE + Stockfish NNUE).

**Why**: Even when all pawns have passed their starting ranks, Pet Dragon piece arrangements are alien to Stockfish NNUE training data. A Rook that started on b2 (Pet Dragon) vs a Rook that arrived at b4 from h1 (standard chess) are in identical positions mid-game, but Stockfish NNUE never saw the b2-start arrangement in its training data. Our Pet Dragon NNUE, trained on Pet Dragon self-play, handles all arrangements correctly.

**Additional reason**: No clean switching point exists. There's no game state that definitively signals "now we're in standard chess territory."

---

## D10 — NNUE Feature Set: 896 Inputs
**Decision**: 768 standard piece-square features + 128 pawn start square features.

**Why**: The 768 standard features allow the network to learn piece coordination. The 128 pawn start features allow the network to distinguish "pawn on rank 2 that can still double-step" from "pawn on rank 2 that has already moved." This distinction is critical for Pet Dragon correctness and is the minimum addition to HalfKP-style features.

**Phase convergence**: Pawn start features become 0 as pawns leave starting squares. By middlegame/endgame the network evaluates using only standard 768 features — functionally converging to standard chess NNUE behaviour. No switching logic needed.

---

## D11 — Pawn Start Feature Convergence
**Decision**: The moment a pawn makes its FIRST MOVE — regardless of destination — its start feature becomes 0.

**Precise definition**:
- Rank 1 pawn → rank 2 (single step): start feature = 0 (already moved, cannot double-step even though now on rank 2)
- Rank 1 pawn → rank 3 (double step): start feature = 0
- Rank 2 pawn → rank 3: start feature = 0
- Rank 2 pawn → rank 4: start feature = 0

**Critical distinction the network learns**:
- "Pawn on rank 2, started rank 2" → CAN double-step → start feature active
- "Pawn on rank 2, started rank 1" → CANNOT double-step → start feature = 0

These have DIFFERENT feature encodings → different evaluation → correct behaviour.

---

## D12 — Texel Tuning Is Optional
**Decision**: Phase 14 (Texel tuning) is marked optional. Skip if going directly to NNUE (Phase 16).

**Why**: NNUE will outperform even perfectly Texel-tuned HCE by a large margin (~300-500 Elo). Texel tuning is a stepping stone that improves HCE quality and therefore NNUE training data quality, but borrowed Ethereal weights are sufficient for initial NNUE training. Decide after Phase 13 based on engine strength at that point.

---

## D13 — Probcut and CorrectionHistory Defined but Not Wired in Phase 7
**Decision**: Define and test Probcut + CorrectionHistory in Phase 7 (`pruning.rs`) but do not call them from the search loop until Phase 13.

**Why**: Adding advanced pruning techniques before the evaluation is complete makes debugging impossible. A pruned branch might have the correct evaluation but we can't verify this without Phase 8. Phase 13 wires everything in together and measures Elo gain of each technique in isolation.

---

## D14 — Training Data Bootstrap Strategy (Phase 16)
**Decision**: Include standard chess game positions (Lichess CC0 dataset) in NNUE training data alongside Pet Dragon self-play.

**Why**: Standard chess positions are abundant, well-evaluated, and represent the middlegame/endgame patterns our network will encounter. Including them bootstraps the network with millions of already-evaluated positions before Pet Dragon self-play data becomes sufficient. The single network learns both Pet Dragon specific dynamics AND standard chess patterns simultaneously.

---

## D15 — GitHub Actions Only, No Terminal
**Decision**: All building, testing, and deployment via GitHub Actions. Gokul never runs cargo commands.

**Why**: Gokul has mobile only. GitHub Actions provides the CI/CD pipeline. Every file Claude produces must be complete and ready to upload directly to GitHub via the web UI. This is a hard constraint, never violated.

---

---

## D16 — Singular Extension via Wrapper Function, Not Signature Change
**Decision**: Implement singular extensions by keeping `pub fn alpha_beta(...)` with its original 9-argument signature as a thin wrapper, and moving the actual search body into a private `fn alpha_beta_with_excluded(..., excluded: Move)`. All internal recursive self-calls within the search body call `alpha_beta_with_excluded` directly (with `excluded = Move::NULL` for normal recursion); only the singular-verification search passes `excluded = tt_move`.

**Why**: Singular extension verification needs to search the current position with one specific move (the TT move) excluded from the move loop, to answer "how good is the position without it?" Adding an `excluded: Move` parameter to the existing public `alpha_beta()` would have required touching every call site — `iterative.rs` (2 sites) and every test in `alpha_beta.rs` and `iterative.rs` that constructs an `alpha_beta(...)` call directly. The wrapper approach confines the change entirely to `alpha_beta.rs` with zero edits needed outside that file.

**Rejected**: Adding `excluded: Move` directly to `alpha_beta()`'s public signature — more "standard" looking but would have cascaded into `iterative.rs` and ~10 test call sites for no functional benefit, increasing the size and risk of an already nontrivial delta.

## D17 — pyrrhic-rs SyzygyPath re-set not supported mid-process (2026-07-04)
`pyrrhic_rs::TableBases` is a process-wide singleton internally. Re-calling
`setoption SyzygyPath <new path>` after a successful init will return
`Err(AlreadyInitialized)` regardless of path validity. Decision: accept this
as expected UCI behavior for now (GUIs set SyzygyPath once at startup); do
not add re-init workaround unless a real compatibility issue is reported.

## D18 — Lichess Sampler: Prefix Approximation, Not Uniform Sampling (2026-07-04)
**Decision**: `lichess_sample.rs` samples a skip+stride *prefix* of the
decompressed Lichess CC0 eval stream (skip N lines, then keep every Kth
line until sample_size is reached, then close the connection) rather than
a statistically uniform sample of all 388M positions.

**Why**: Standard `.zst` frames only support sequential decompression from
the start — no seeking to an arbitrary decompressed byte offset. A true
uniform/reservoir sample across the whole file would require decompressing
all 388M positions, which is not feasible in a GitHub Actions job's time
and bandwidth budget. Stopping early and dropping the HTTP connection once
`sample_size` is reached also means bytes past that point are never
downloaded, keeping each run cheap.

**Implication for training data (Phase 16.5)**: this sample may be biased
toward whatever ordering Lichess's export uses (e.g. earlier-logged
positions). Acceptable for bootstrapping per D14 (self-play is the primary
Pet Dragon-specific signal; Lichess data is a supplementary standard-chess
bootstrap). Revisit only if Colab training shows a bias traceable to file
ordering.

**Dependency choices**: `ruzstd` (pure Rust, MIT, no libc) over the `zstd`
crate (C bindings) — avoids adding a system zstd requirement to the CI
runner. `reqwest` with `blocking` + `rustls-tls` features (not default TLS)
— avoids an OpenSSL dependency and an async runtime for a single
sequential CI job. All three (`ruzstd`, `reqwest`, `serde_json`) are
optional, gated behind a `lichess-sample` feature absent from both
`default` and `wasm` — cannot affect the native release binary, `cargo
test`, or the WASM/browser bundle.

## D18.5 — Phase 16.5 Training Platform: Kaggle Notebooks, Not Colab (2026-07-04)
**Decision**: Phase 16.5 (NORU NNUE training on combined selfplay + Lichess
data) will use Kaggle Notebooks instead of Google Colab.

**Why**: Gokul is mobile-only (no terminal, no desktop — see CORE RULES).
Kaggle's "Save Version → Run All" (commit) mode keeps a notebook running
on Kaggle's cloud servers even if the tab is closed, the phone locks, or
the connection drops — confirmed via Kaggle's own community docs, this
survives disconnects by design, unlike Colab's free tier which has no
real equivalent walk-away/background-commit mode. This matters directly
for a phone-only workflow where the notebook can't be babysat.

**Caveat carried forward into the Phase 16.5 notebook design**: this
disconnect-proof behavior applies to commit/"Run All" mode only —
Kaggle's *interactive* editing mode has its own inactivity timeout (~40min
idle, "are you still there?" prompts, reported loss of interactive session
state after ~12h). The Phase 16.5 notebook must therefore be written to
run end-to-end via Save Version → Run All from the start, not built up
interactively cell-by-cell, with periodic checkpoint saves to
/kaggle/working/ along the way.

**Implication**: any file paths in the Phase 16.5 notebook use Kaggle's
conventions (/kaggle/input/, /kaggle/working/), not Colab's Drive-mount
paths.

## D19 — NNUE Training via GitHub Actions, Not Colab (2026-07-05)
**Decision**: Phase 16.5 training runs as a GitHub Actions workflow
(train_nnue.yml) rather than a Google Colab notebook.

**Why**: NORU is pure Rust with no GPU-dependent training path (FP32
backprop is CPU-only), so Colab's main advantage (free GPU) doesn't apply.
Running it in Colab would still require Gokul to paste and run Rust/cargo
commands in notebook cells — functionally the same as a terminal, which
violates D15 (GitHub Actions handles all building, Gokul never runs cargo).
An Actions workflow with workflow_dispatch inputs achieves the same
"trigger training with custom hyperparameters from mobile" goal while
keeping the one-button-tap UX consistent with every other phase.

**Rejected**: Colab notebook (as originally noted in Phase 16 ROADMAP
comments from Session 7) — rejected once it became clear NORU has no
GPU-training benefit to justify breaking the Actions-only convention.

## D20 — Kaggle Backgrounding as Documented Fallback, Not Default (2026-07-05)
**Decision**: GitHub Actions remains the default for all training workloads
(Texel tuning if revisited, NNUE training). Kaggle (background execution) is
documented as the fallback path, triggered only if either condition is met:
(a) NORU or a future eval component gains a GPU-dependent training path, or
(b) self-play/Lichess dataset size grows large enough that a single training
run approaches GitHub Actions' 6-hour job ceiling.

**Why**: Kaggle's main advantage over Actions is free GPU + long background
runs. NORU's training is FP32 CPU backprop with no CUDA path, and current
dataset sizes (tens of thousands of rows) finish in minutes on Actions. Using
Kaggle today would add manual artifact-shuffling steps (download from
Actions → upload to Kaggle → run → download → re-upload to repo) with no
compute benefit, breaking the one-tap Actions workflow convention (D15/D19).

**Trigger conditions for revisiting**: dataset row count exceeds roughly
1-2M rows (self-play + Lichess combined) such that a training run's wall
time starts competing with Actions' free-tier minutes/time limits, or a
future NNUE architecture change requires GPU-accelerated training that
NORU's CPU-only trainer can't provide.

**Rejected (for now)**: Adopting Kaggle as the default training runner —
rejected until one of the trigger conditions above is actually hit; no
benefit today, real UX cost.

## D21 — Kaggle for Self-Play Generation, Actions Minutes Conserved (2026-07-05)
**Decision**: Self-play data generation moves to a Kaggle notebook
(kaggle/pet_dragon_selfplay_kaggle.ipynb) run via "Save & Run All (Commit)"
background execution, rather than GitHub Actions selfplay.yml. train_nnue.yml
gains a selfplay_paths input (comma-separated repo-committed file paths) so
Kaggle output can be committed directly and consumed without an Actions
artifact round-trip; selfplay_run_id becomes optional, kept for occasional
small GH Actions batches.

**Why**: Gokul runs multiple GitHub projects sharing Actions minutes/limits.
Kaggle compute is a separate free quota, supports true background execution
(commit-and-close, ~9-12h ceiling vs Actions' 6h), and needs no terminal —
fits the mobile-only constraint (D15) as well as Actions did. This supersedes
D20's original framing (Kaggle only if GPU or dataset-size forced it) — the
real trigger turned out to be cross-project Actions budget pressure, which
D20 didn't anticipate.

**Rejected**: Keeping self-play exclusively on GH Actions with larger/more
batches — rejected once Actions minutes became a shared, contended resource
across Gokul's other projects.