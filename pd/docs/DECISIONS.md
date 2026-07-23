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

## D22 — GitHub Releases for Data Files Over 25MB (2026-07-05)
**Decision**: Self-play/training data files too large for the repo's
web-upload UI (25MB cap) are attached as GitHub Release assets instead
(supports far larger files via the same mobile web UI), and train_nnue.yml
gained a selfplay_urls input that curls them directly. selfplay_paths
(committed repo files) remains for smaller files.

**Why**: the first Kaggle-generated file (66MB after ~93 games) hit the
repo-content upload page's 25MB ceiling. Git LFS would need CLI setup
Gokul can't do from mobile; Releases needed no new tooling and reused the
same upload flow he already knows.

**Rejected**: Git LFS — requires CLI/terminal setup, violates D15.

## D23 — NNUE Blend Weight Fixed at 0.25 Pending Elo Testing (2026-07-06)
**Decision**: Phase 16.6 integrates the trained Pet Dragon NNUE (Phase 16.5)
as a 25%-weighted blend with the existing HCE (`eval::evaluate_blended() =
0.75*HCE + 0.25*NNUE`), not a full replacement of HCE, and not a
configurable/tunable weight for now — a fixed constant in `eval/mod.rs`.

**Why**: The first (and only) trained network has val_loss=0.53776 —
meaningfully better than the 0.693 coin-flip baseline, but still far from a
confident predictor. Session 32's own handoff note already flagged this as
the reason to start with a blend rather than a replace. A low, fixed weight
lets the NNUE contribute real signal immediately without risking a
regression from over-trusting an undertrained network; the weight can be
raised (or the whole approach reconsidered) once actual Elo testing against
the current pure-HCE build is available.

**Rejected**: Full HCE replacement — premature given val_loss is still well
above a confident-prediction threshold; borrowed Ethereal HCE weights
(D5) are proven to ~2400-2600 Elo and shouldn't be discarded on a first
training run. Also rejected: making the blend weight a UCI-tunable option
immediately — adds surface area before there's any Elo data to tune
against; revisit once benchmarking exists.

## D24 — Wire info.time_allocated_ms to the Real TimeManager Hard Limit (2026-07-06)
**Decision**: `iterative_deepening()` now sets `info.time_allocated_ms =
hard_ms` immediately after constructing its `TimeManager`, so
`alpha_beta`'s in-search `is_time_up()` check has the actual per-move time
budget to compare against, instead of `SearchInfo::new()`'s hardcoded
5000ms default.

**Why**: `is_time_up()`'s mid-search abort was silently dead code for every
real (UCI/iterative-deepening) search since it was introduced — only
`alpha_beta.rs`'s own unit tests, which set `time_allocated_ms` by hand,
ever exercised it. Real games were relying entirely on
`TimeManager::should_start_next_depth()`'s between-depths check, meaning a
single slow depth could run arbitrarily long past the allocated budget.
This was invisible while HCE-only eval was fast enough that individual
depths rarely overran; Phase 16.6's NNUE blend raised per-node cost enough
to expose it via a failing CI test.

**Impact**: this is a real robustness fix for actual play, not just a test
fix — any future eval slowdown (or a slow position with a large branching
factor) could previously have caused a real time forfeit in UCI play. Now
bounded by the true hard limit, checked every 256 nodes (see 2048→256
change, same session).

**Rejected**: loosening the test's 500ms ceiling instead of finding the
real wiring bug — would have hidden a genuine time-management defect rather
than fixing it.

## D25 — NNUE blend weight dropped to 0% default (2026-07-07)

Phase 17.4 match: Engine A (0% NNUE) vs Engine B (25% NNUE, D23's fixed
default), 20 games, 100ms/move, colors alternated. Result: A scored 87.5%
(17 wins, 2 losses, 1 draw), **+338 Elo** in favor of pure HCE. This is a
large, unambiguous gap — the trained network (val_loss=0.538, already
flagged in D23 as not yet confident) is actively harmful at 25% weight,
not merely under-contributing.

Decision: `NNUEWeight` UCI option default changed 25 → 0 (src/eval/mod.rs,
src/main.rs). The blend mechanism itself (Phase 17.1) stays — `NNUEWeight`
remains a live, settable option, so this isn't a rollback of Phase 16-17
work, just a correction of the default now that real Elo data exists.
Re-enabling any nonzero weight should wait for either (a) a retrained
network with materially lower val_loss, or (b) rerunning match_runner at
several weight values (5/10/15/20%) to find where it stops being net
negative — don't re-raise the default from vibes a second time.


## D26 — Sweep Existing match_runner Before Retraining or Architecture Changes (2026-07-07)

**Decision**: For Phase 17.5 (bringing val_loss down / deciding whether any
nonzero NNUE weight is usable), the first action is a 4-run sweep of the
existing `match_runner` workflow — A=0% vs B={5,10,15,20}%, 40 games each,
seed_start=0 — NOT a bigger Kaggle self-play run and NOT a hidden_size
architecture change.

**Why**: D25 only tested one point (25% weight, decisively bad). We don't
yet know whether *all* nonzero weight is harmful (network problem, points at
retraining) or only high weight is harmful (tuning problem, current network
is fine at a lower default). The sweep uses infrastructure that already
exists (Phase 17.2/17.3, zero new code) and answers this in one Actions
session, before spending Kaggle time/compute on a guess.

**Rejected (for now)**: Immediately rerunning bigger Kaggle self-play (the
original 3000-game target, cut short to ~93 by queue delay in Session 30) —
rejected until the sweep confirms the network itself is the bottleneck, not
just the blend weight. Also rejected: bumping hidden_size before the sweep —
same reasoning, don't change the model before knowing whether the model is
actually the problem.

**Revisit**: once the 4 match_results.txt artifacts are read (see
SESSION_LOG.md Session 38 next-start-point for the exact decision branches).

## D27 — No Safe Nonzero NNUE Weight at Current Network Quality; Retrain Before Re-Testing (2026-07-07)

**Decision**: The D26 sweep (A=0% vs B=5/10/15/20%, 40 games each) showed
every nonzero weight net-negative, including 5% (65.0% score, +107.5 Elo —
not a marginal or noisy result). Conclusion: don't look for a "safe" low
default: commit to retraining the network with substantially more self-play
data before re-enabling any blend weight. NNUEWeight stays at 0% (D25).

**Why**: If the problem were purely "25% overweights a decent-but-imperfect
network," we'd expect the Elo gap to shrink smoothly toward ~0 as weight
drops, with maybe 5% landing close to neutral. Instead 5% is still a
large, clear loss — consistent with D23's original flag that val_loss=0.538
is far from a confident predictor at *any* blend strength, not just at 25%.

**Rejected**: Setting the default to some low nonzero value (e.g. 5%) anyway
on the theory that "some signal is better than none" — rejected because the
sweep shows 5% is actively harmful, not merely weak; a harmful-but-small
signal is still harmful.

**Next step**: Session 39 committed Gokul to running self-play in 4 smaller
Kaggle batches (750 games each, different seeds) instead of one large
attempt, specifically to avoid repeating the queue-delay shortfall that
produced the current undertrained network (Session 30: ~93/3000 games
actually completed). Once retrained, the match_runner sweep must be rerun
before touching NNUEWeight's default — improved training data is not
assumed to fix things until re-measured.

**Revisit**: once the 4 match_results.txt artifacts are read (see
SESSION_LOG.md Session 38 next-start-point for the exact decision branches).

## D28 — SearchInfo.print_info Gate for Silent-Search Callers (2026-07-07)

**Decision**: Added `SearchInfo.print_info: bool` (default `true`). `iterative_deepening()`'s UCI `info depth ...` println is now gated on it. `selfplay.rs` and `match_runner.rs` set it `false`; `main.rs`'s real UCI loop leaves it at the default, unchanged.

**Why**: Kaggle self-play versions #7 and #9 (seeds 200/400) showed "Failed" despite completing all 750/750 games correctly — the actual crash was a `CellTimeoutError` in the *next* notebook cell, caused by `capture_output=True` trying to relay ~56,000 lines of UCI info-string stdout (10 depths × dozens of moves × 750 games) through Jupyter's IOPub channel, which papermill caps at a 4-second per-message timeout. The data generation itself never failed.

**Rejected**: Working around it purely on the notebook side (e.g. not printing `result.stdout`) — rejected because the same unbounded stdout volume would still hit other consumers (GitHub Actions log truncation in `selfplay.yml`/`match_runner.yml`, slower subprocess pipes in general) and the actual defect (silent-search callers inheriting UCI-loop printing they never needed) is a one-line source fix, not a workaround.


## D29 — Pause the Data-Volume Lever; val_loss Improving ≠ Game Strength Improving (2026-07-07)

**Decision**: After retraining with ~3x the self-play games (Session 42:
val_loss 0.53776 -> 0.51661), the re-swept match_runner results got WORSE
at every single blend weight, not better (5/10/15/20% all moved further
net-negative, consistently). Stop feeding more self-play data into training
as the default response to a bad Elo result — it's now failed to help twice
in the same direction. Pivot to a direct eval-calibration diagnostic
(17.5d, eval_diag.rs) before any further training runs.

**Why**: A lower BCE loss on the training/validation distribution is not
the same claim as "better evaluation quality on positions search actually
visits." The consistent, monotonic worsening across all 4 weight points
(not scattered/noisy) suggests the network is becoming more *confident*
without becoming more *correct* in the ways that matter for move selection
— and a confidently-wrong eval poisons alpha-beta pruning/move-ordering
more than a mild one does. Verified this isn't a simple scale bug: the
cp<->logit constant (400.0) and OUTPUT_SCALE are consistent between
train_nnue.rs and inference.rs.

**Rejected**: Immediately queuing an even-bigger self-play run — rejected
because the pattern (better loss, worse Elo) already repeated once; a third
attempt at the same lever without understanding why the first two failed
would be guessing, not debugging.

**Revisit**: once eval_diag.rs's output is read (Session 43 next-start-point
lays out the two branches: quantization bug vs deeper feature/target
formulation issue in D9/D10/D14).

## D30 — NNUE Output Clamp; Root Cause is Unregularized Logit Magnitude, Not Feature Design (2026-07-07)

**Decision**: Added `NNUE_EVAL_CLAMP_CP = 1500` in `inference.rs`, applied
to every `evaluate_nnue()` call before blending. Tightened
`test_evaluate_nnue_start_pos_bounded`'s bound from the old `< 5000` (which
never caught this) to `<= NNUE_EVAL_CLAMP_CP`, and added a dedicated clamp
test.

**Why**: `eval_diag.rs` (17.5d) showed the Session 42 network scoring the
symmetric start position at +2425cp (should be ~0) and a single queen swing
at ~4000-4500cp (HCE: ~976cp) — a raw fp32 logit around 6-16, meaning the
network expresses near-100% certainty at trivially non-decided positions.
All 5 test cases agreed with HCE on *sign*, ruling out a feature-design or
scale-constant bug (checked: `CP_TO_WINPROB_SCALE=400.0` matches between
`train_nnue.rs` and `inference.rs`). The pattern matches classic BCE
overconfidence: with no weight regularization, gradient descent has no
penalty for pushing output-layer weights toward unbounded magnitude on
training examples it can cleanly separate, and loss (val_loss) keeps
improving even as the raw output becomes progressively less sane. This
directly explains D29's paradox (better val_loss, worse Elo at every blend
weight): a more confidently-extreme eval corrupts alpha-beta pruning more
than a mild one does, regardless of whether its *sign* is usually right.

**Rejected**: Assuming this needed another retraining cycle before testing
— rejected because clamping is a one-file, no-Kaggle-needed change that
tests the hypothesis directly; a retrain-first approach would have cost
another hour+ round trip to learn the same thing.

**Revisit**: once the clamp-only re-sweep result comes back. If it
meaningfully improves the 5/10/15/20% numbers, the long-term fix is weight
decay in `train_nnue.rs` (the clamp is a safety net, not a substitute for
training a properly-scaled network). If it doesn't move much, the problem
is deeper than raw magnitude and D9/D10/D14 (feature/target design) need
the harder look Session 43 flagged as the fallback branch.

## D33 — Stronger Weight Decay + Gradient Clipping (2026-07-08)

**Decision**: Raised `train_nnue.rs`'s `weight_decay` default 100x
(1e-4 → 0.01) and added global-norm gradient clipping (`grad_clip_norm`,
default 1.0), applied to the whole gradient including biases, before every
Adam step.

**Why**: The corrected in-distribution `eval_diag` (D32) showed
`weight_decay=0.0001` did essentially nothing — real Pet Dragon random
starts (seed=2, seed=3) were still fully saturating at the clamp ceiling.
Weight decay alone only pulls weights toward zero passively each step;
gradient clipping directly caps the update that causes a blowup in the
first place, a standard complementary pairing.

**Result**: val_loss held steady (0.51636, best epoch 4/10 — matching or
slightly beating every unregularized attempt) while calibration improved
substantially (seed=2: 1500→375, seed=3: 1500→50, K+P: 1225→225). Confirms
the fix worked exactly as intended: better-behaved output without trading
away fit quality.

**Rejected**: Weight decay alone without clipping, or a smaller decay bump
— rejected because 1e-4 was already shown insufficient, and clipping
addresses the mechanism (unbounded per-batch updates) more directly than
decay's passive shrinkage alone.

## D34 — Park Phase 17.5 NNUE Tuning at hidden_size=32 (2026-07-08)

**Decision**: After 4 independent fix attempts (original network, 3x
self-play data retrain, output clamp, clamp+regularization) all landing in
the same ~70-72% average-opponent-score band on the match_runner sweep,
stop iterating on NNUE tuning at the current `hidden_size=32` scale.
NNUEWeight stays 0% (unchanged since D25). The clamp, weight_decay, and
grad_clip_norm defaults all stay — they're correct regardless, just not
sufficient alone to make blending worthwhile yet.

**Why**: D30's clamp and D33's regularization were both real, verified
fixes — eval_diag confirms genuinely better calibration each time, not
placebo changes. Yet the final sweep (5/10/15/20%: 66.2/68.8/66.2/80.0%,
avg 70.3%) is statistically indistinguishable from clamp-only's 70.0%
average, and both are in the same range as the very first D27 sweep
(72.5% average) despite completely different underlying networks. That
consistency across genuinely different interventions is the signal: the
ceiling isn't calibration or data volume anymore (both were real problems,
both got fixed), it's most likely that `hidden_size=32` is too small to
learn positional understanding beyond what HCE's hand-crafted tables
already encode — so blending in a well-calibrated-but-not-more-informed
network still doesn't out-predict HCE where it matters for search.

**Rejected**: Continuing to tune hyperparameters (lr, lambda, epochs) at
the current architecture — rejected because the pattern across 4 attempts
with materially different fixes each landing in the same band is stronger
evidence of a structural ceiling than of an undiscovered hyperparameter.
Also rejected: reverting the clamp/regularization work — rejected because
both are real, measured improvements and correct defaults for whenever
NNUE work resumes, regardless of today's Elo verdict.

**Revisit**: only via a deliberately bigger architecture (hidden_size=128+),
treated as a fresh, separately-scoped effort (bigger Kaggle training job,
new session budget) — not as an incremental extension of this arc.

## D35 — Texel Tuning Architecture: HCE is Linear-in-Weights (2026-07-08)

**Decision**: Full audit of all 6 eval/*.rs submodules + mod.rs's TEMPO
confirmed HCE is entirely linear-in-weights (~970 tunable parameters).
Tuning approach: extract a per-position FEATURE VECTOR once (counts/
indicators derived from board state), then fit via efficient gradient
descent (logistic-regression style dot-product) against the 147,867-sample
game database (14.2), NOT expensive per-parameter coordinate descent or
re-running full evaluate() thousands of times per position.

**Audit findings by module**:
- material.rs, tables.rs (PST), pawns.rs, open_lines.rs: pure sum of
  (board-derived count/boolean feature × tunable const), tapered by a
  per-position phase scalar (phase itself, from PHASE_WEIGHTS, is NOT
  tunable — standard practice, phase weights are structural).
- mobility.rs, king_safety.rs's ATTACKER_WEIGHT: table lookups indexed by
  a clamped count (e.g. `mobility.min(8)`) — one-hot bucket selection,
  still linear-in-weights (exactly one table entry active per position).
- ONE genuine nonlinearity: king_safety.rs's `.min(MAX_KING_DANGER)` value
  clamp on the danger term — handled like any ML clip/ReLU (zero gradient
  when clamped, pass-through otherwise).

**Implementation plan (NOT YET BUILT — next session)**:
1. `TexelFeatures` struct: one field per tunable parameter (or array field
   for table-shaped ones — PST tables, mobility tables, PASSED_PAWN_BONUS,
   ATTACKER_WEIGHT), extracted from a Position in one pass, mirroring each
   submodule's board-scanning logic exactly.
2. `TunableWeights` struct: same shape as TexelFeatures but holding f64
   weight values, initialized FROM the current consts (so default weights
   reproduce current behavior exactly).
3. `predict(&features, &weights) -> f64`: the dot-product "tunable eval",
   replacing the real evaluate()'s hardcoded consts with the weight struct.
4. CRITICAL SAFETY NET: a self-consistency test that runs BOTH evaluate()
   (real, fast, const-based) and predict(extract(pos), &default_weights)
   on many random Pet Dragon positions (Position::generate_with_seed) and
   asserts EXACT agreement. This must pass before any tuning work is
   trusted — it's the only way to verify the feature extraction faithfully
   mirrors 2000+ lines of existing eval logic without being able to
   compile-check by hand at this scale.
5. Only after step 4 passes: gradient descent optimizer (sigmoid-scaled
   error against game results, same K/lambda-style scaling reasoning as
   D14's NNUE target, batched across the 147,867-sample database from
   14.2) + texel_tune.yml (GitHub Actions per D19).
6. Tuned weights get formatted back into the same s(mg,eg)/array literal
   syntax already used in eval/*.rs and applied as a delta.

**Why staged this way**: HCE bugs are much harder to catch than NNUE bugs
were — there's no val_loss curve, no eval_diag-style sanity check readily
available until the tuner exists, and a subtly wrong feature extraction
would silently corrupt every tuning result with no error at any point.
The self-consistency test (step 4) is the load-bearing safety mechanism
and must be built and verified before writing a single line of the actual
optimizer.

**Rejected**: Writing the full ~800+ line feature extractor in the same
session as the audit — rejected due to session length/fatigue risk on a
piece of code with no compiler available to catch mistakes and no
intermediate verification possible until the whole thing (all 6 modules)
is complete enough to run the self-consistency test.

## D36 — Pre/Post-Texel-Tuning Elo: Pinned-Ref UCI Match, Not Runtime Weights (2026-07-10)

**Decision**: To get a genuine pre/post-Texel-tuning Elo number (gap left
open by 17.5/17.7 — `match_runner.rs`/17.2 can only A/B NNUE blend weight
within one compiled binary, not two different HCE weight sets), build a
second, independent match harness (`src/bin/uci_match_runner.rs`) that
spawns TWO SEPARATE `pet_dragon` binaries as OS child processes — one built
from a git ref before the Session 55 tuning commit, one from `main` — and
plays them against each other over real UCI (stdin/stdout), the same way
any two engines are matched by a GUI or tournament manager. A new workflow
(`uci_match_runner.yml`) checks out and builds both refs plus the harness
itself, then runs the match, mirroring `match_runner.yml`'s manual-dispatch
pattern (D19/D20).

**Rejected alternative**: Refactor `eval/*.rs` (material, tables, mobility,
pawns, king_safety, open_lines) to read weights from a runtime struct
instead of compile-time consts, then A/B a pre-tuning and post-tuning
profile within one binary like the NNUE blend already does. Rejected for
two reasons: (1) `evaluate()` runs at every leaf node — it's the hottest
path in the engine, and the added indirection risks a real NPS regression
plus risks breaking D35's exact-agreement self-consistency guarantee, for
what is a one-time measurement, not a permanent feature; (2) the original
pre-tuning Ethereal-derived literal values are already gone from the
working tree (Session 55 overwrote them in place) — recovering them would
require pulling an old git ref anyway, so the "runtime weights" approach
doesn't even avoid needing a pinned ref. The pinned-ref UCI approach gets
the same answer with zero changes to any shipped eval code.

**Design notes**:
- Harness tracks game state locally (movegen/position, same generator as
  `match_runner.rs`/`selfplay.rs`) purely for legality and termination
  checks; each engine process is treated as a black box that only sees
  `position`/`go`/`bestmove` over UCI — exactly what a real GUI sees.
- `parse_uci_move` is duplicated from `main.rs` rather than exported from
  the library — it's a thin UCI-string-to-Move lookup with a single
  caller, not worth growing the public library surface for.
- Known limitation, accepted: no per-move timeout on the child process
  read — a hung engine blocks the harness indefinitely, bounded only by
  the CI job's own overall timeout. Acceptable for a manually-triggered,
  one-off tool; would need revisiting if this were ever promoted to a
  routinely-scheduled job.
- `pre_tuning_ref` is a required workflow input with no default (Gokul
  supplies the SHA via the mobile GitHub app's commit history) rather than
  hardcoded, since Claude could not reliably confirm the exact pre-Session-55
  commit SHA this session (api.github.com anonymous rate limit hit).


## D37 — Real UCI Pondering: Atomic Deadline Override, Not start_time Reset (2026-07-11)

**Decision**: Implement full UCI pondering (`go ... ponder` + `ponderhit`),
closing a real protocol-completeness gap found by inspection (not by a
failing test): `allocate_time()` already special-cased `tc.ponder` to
search near-infinitely (correct half of pondering, pre-existing), but
`ponderhit` wasn't handled anywhere in `main.rs`'s command dispatch at
all — a real GUI that ponders would get an unrequested `bestmove` during
the opponent's think time instead of the engine correctly switching to a
bounded real-time search.

Mechanism: two new `Arc<AtomicU64>` fields on `SearchInfo`
(`ponder_hit_soft_ms`, `ponder_hit_hard_ms`, default `u64::MAX` sentinel =
unset), threaded through exactly like the existing `stop_flag: Arc<AtomicBool>`
pattern (D4). `cmd_go` precomputes what the REAL (non-ponder) time
allocation would be from the same `go` line's clock values, stashes it on
`EngineState`, and records the wall-clock instant pondering began. `cmd_ponderhit`
computes elapsed-since-pondering-began and stores `elapsed + real_soft` /
`elapsed + real_hard` into the atomics — deadlines expressed relative to
the search thread's own `start_time`, not reset to zero, since pondering
time is free per the UCI spec. `is_time_up()` (the hot-path check, every
256 nodes) reads `ponder_hit_hard_ms` first and uses it in place of
`time_allocated_ms` when set — a single extra atomic load, same cost
class as the existing `stop_flag` check right above it. `iterative_deepening()`'s
depth-loop-top additionally consumes `ponder_hit_soft_ms` once (via `swap`)
to rebuild the `TimeManager` so the "should I start the next depth"/early-
stop logic also respects the real budget, not just the hard 256-node kill
switch.

**Rejected alternative**: Reset `SearchInfo::start_time` to `Instant::now()`
at ponderhit, so the existing `elapsed_ms() >= time_allocated_ms` check
needs no new override logic at all. Rejected because `start_time` is a
plain field owned by the (already-running) search thread — `cmd_ponderhit`
runs on the main UCI-loop thread and has no safe way to mutate it without
either a `Mutex` around a currently-hot-path field (D4 precedent is
specifically atomics, not locks, for anything checked per-node) or an
unsafe alias. Expressing the override as a deadline relative to the
existing, unchanged `start_time` avoids ever needing write access to
search-thread-owned state from another thread — the atomics are the only
thing main.rs touches.

**Bug caught during verification, not shipped**: the first version of the
integration test set the override atomics *before* calling
`iterative_deepening()`, which made `reset_for_search()` (correctly, for
real usage — a genuinely new search should never inherit a stale
override) wipe them before the depth loop ever read them, so the test
passed for the wrong reason (it wasn't actually exercising the concurrent
case). Caught because the "bounded" search ran to depth 23 / 191 seconds
in a manual `cargo test` run instead of stopping in milliseconds — fixed
by spawning a real background thread that sets the atomics ~30ms after
the search starts, matching how a real GUI's `ponderhit` can only arrive
after the search is already running, never before.

**Verified**: `cargo check --release` clean on the real crate; full test
suite green (335 lib + 22 bin, up from 329/17 — 12 new tests, all passing,
none touched/regenerated); manual end-to-end UCI runs via a real spawned
`pet_dragon` process — pondered 500ms then `ponderhit` correctly produced
a bounded ~2.2s real search (matching the 60s-clock-implied soft limit)
instead of running forever; a plain `go movetime 300` and a `go ponder`
followed by `stop` (ponder miss) both still behave exactly as before.


## D38 — MultiPV via Root-Move Exclusion, Not Parallel Search Trees (2026-07-11)

**Decision**: Implement UCI `MultiPV` (report N candidate lines instead of
1) using the standard alpha-beta technique: search the primary line
normally, then re-search from the root excluding the move(s) already
found, once per extra line, all at the same depth. Two new `SearchInfo`
fields make this possible: `multipv: usize` (default 1) and
`root_exclude: Vec<Move>`. The move loop in `alpha_beta.rs` skips a move
if it's in `root_exclude` — but ONLY at the root (`root_node &&
!info.root_exclude.is_empty() && ...`), which matters for a specific
reason: singular extension already uses a same-shaped `excluded: Move`
parameter deeper in the tree, gated on `!root_node`. Since singular
verification never runs at the root and MultiPV's exclusion never runs
below the root, the two mechanisms share the move loop without ever
colliding — confirmed by reading where singular extension's guard
actually sits before writing a single line of the new check.

The extra lines are 100% additive: the entire existing single-PV code
path in `iterative_deepening()` is untouched (not even reformatted), and
the new block is gated behind `info.multipv > 1`, which is false for
every existing caller (`SearchInfo::new()` defaults `multipv` to 1). The
returned `SearchResult` — the one that actually determines what gets
played — always comes from the untouched primary-line code above the new
block.

**Rejected alternative**: give each MultiPV line its own aspiration-window
state carried across depths (matching how the primary line already
works), for speed. Rejected as unnecessary complexity for what MultiPV
users already expect to be slower than single-PV — extra lines use a
plain full-window search instead (`search_multipv_slot()`), which is
simpler, shares the TT lock-free, and costs nothing when MultiPV is at
its default of 1 since the function is never called.

**A test I wrote was wrong, and fixing it taught something worth
recording**: the first version of `test_multipv_does_not_affect_primary_
move_choice` asserted the primary line's `best_move` is identical whether
MultiPV is 1 or 4. It failed — genuinely, not a flaky timing issue.
Investigating showed why: extra MultiPV lines searched at depths 1..N-1
feed the same shared TT/history/killer/correction-history tables that
depth N's primary-line search then reads, so a MultiPV=4 run has
legitimately explored more of the tree by depth N than a MultiPV=1 run
did — enough to occasionally shift move ordering and land on a different,
still fully valid, still best-scoring-at-that-depth move. This is a
known, accepted property of MultiPV in alpha-beta engines generally
(Stockfish's own documentation carries the same caveat), not a defect
introduced here. The test now asserts what's actually guaranteed and
worth testing — the primary line is always legal, in both configurations
— documented at length in the test itself so nobody has to rediscover
this the hard way.

**Also this session — Move Overhead (D38 covers both, one small feature
alongside the bigger one)**: `search/time.rs`'s `OVERHEAD_MS` was a
hardcoded constant; added `TimeControl::overhead_ms` (defaults to the same
constant via a manual `Default` impl, replacing the old `#[derive(Default)]`)
and wired it through `EngineState.move_overhead_ms` / `setoption name Move
Overhead`. Caught and fixed a real pre-existing parsing bug while touching
`cmd_setoption` for this: the old parser took `tokens[2]` as the entire
option name and `tokens[4]` as the entire value, which silently mis-parsed
any multi-word option name ("Move Overhead" itself, the very option being
added) and truncated any multi-word value (e.g. a Windows SyzygyPath with
spaces) to its first token. Rewrote to find the `"value"` token and join
everything on each side of it, backward-compatible with every existing
single-word case (verified: `test_setoption_single_word_value_still_works`).

**Verified**: `cargo check --release` clean; full suite green, 345 lib
(was 335) + 30 bin (was 22) = 375 total, 18 new; manual end-to-end UCI
runs against the real compiled binary — `setoption name MultiPV value 3`
produced correctly depth-sorted, distinct-move `multipv 1/2/3` lines with
`bestmove` matching line 1's final-depth move; default (no MultiPV set)
produced exactly one `multipv 1` line per depth, confirming zero change
to existing behavior; `Move Overhead 2000` on a `movetime 3000` search
correctly finished in ~1s (3000-2000ms budget) instead of ~3s.


## D39 — Skill Levels: Depth-Cap Tiers, Not Elo Calibration (2026-07-11)

**Decision (scoping only — not built this session)**: When difficulty
levels get built, they'll be depth-cap tiers (optionally + a little
move-selection noise at the low end, matching Stockfish's actual `Skill
Level` mechanism rather than just "search less"), labeled `Skill Level
0..N` or similar. Each tier's ordering/spacing will be validated
empirically using the existing `uci_match_runner.rs` harness (D36) across
many seeded positions — tier K vs tier K+1 should win convincingly and
consistently, same methodology as the Texel-tuning validation. No new
measurement infrastructure needed.

**Explicitly rejected: reusing standard-chess Elo tables (Stockfish's
`UCI_Elo`/`Skill Level` calibration) for Pet Dragon, even just for
openings that start from the standard array.** The reasoning took two
passes to land correctly:
1. First framing considered: use the *one* Pet Dragon opening that visually
   matches the standard chess starting position, apply standard-chess Elo
   calibration there, generalize to other openings later. Rejected — this
   still repeats D36's original single-seed-outlier lesson (one sample,
   even a resembling one, isn't representative) at a *larger* scale than
   before.
2. Real reason it doesn't work at all, even for that one opening:
   **Pet Dragon's custom pawn rules apply from move one**, so a visually
   standard starting array doesn't mean move one onward plays like real
   chess — legal pawn moves, promotion timing, and en passant can already
   diverge. Stockfish's Elo calibration tables were built from millions of
   games under *real* chess rules against known-strength opponents; that
   calibration measures "how does this engine play chess," not "how does
   it handle these 32 starting squares." Once the rules diverge, there's
   no way to know how much of that calibration still applies — could be
   negligible or could be large, and there's no data either way to check.
   The resemblance between the two starting positions is cosmetic, not
   structural, so no part of an external Elo table transfers.

**Why depth-cap tiers don't have this problem**: "less search depth is
weaker" is true by construction, not by borrowed calibration — it doesn't
need external data to justify, only internal ordering to verify, which
D36's harness already does well. A plain `Level 1-10` label makes no
claim about human-comparable strength, so there's nothing dishonest about
shipping it without a rating pool — unlike `UCI_Elo`, which explicitly
promises "you will play at approximately N Elo," a promise this project
still can't back for the reasons already established in the "is it
release-ready" discussion (no external rating pool exists for this
variant at all, full stop, regardless of the pawn-rules issue above).

**Status**: scoped, not implemented. Queued for a future session — see
ROADMAP Phase 20.

---

## D40 — GUI Exposes Named Skill-Level Presets, Not a Raw 0-20 Slider (2026-07-12)

**Context**: Phase 20's engine-side Skill Level mechanism (D39, depth-cap
+ time-fraction + move-selection-noise) is fully validated end-to-end —
200-game match-runner results confirm all adjacent tiers are correctly
and monotonically ordered (0v5 -619 Elo, 5v10 -117 Elo, 10v15 -65 Elo,
15v20 -80 Elo). Gokul asked whether a "Skill Level 15 loses to Skill
Level 20 sometimes" result was acceptable, prompted by the 15-vs-20 gap
being noticeably smaller than 0-vs-5.

**Decision**: don't change the underlying 0-20 mechanism to chase bigger
separation at the top end — it's correctly validated, and forcing wider
gaps between adjacent numeric levels would fight the real, expected shape
of engine-strength-vs-depth (diminishing returns at greater depth, not a
bug — see ROADMAP Phase 20.4/20.5 for the full investigation). Keeping the
full 0-20 range also matches the standard UCI `Skill Level` spin
convention other tools/GUIs already expect, useful if Pet Dragon is ever
driven by something other than Gokul's own GUI.

Instead: the GUI-facing difficulty control should be a small set of NAMED
presets, not a raw numeric slider exposing all 21 levels. No player can
feel the difference between adjacent numbers like 14 vs 15 — that's not a
UX problem specific to Pet Dragon, it's true of every engine's Skill
Level implementation, including Stockfish's. Mapped directly onto the five
points already validated with real match data, no new engine-side testing
required:

| GUI label  | skill_level | Basis |
|------------|-------------|-------|
| Beginner   | 0           | 97% loss rate to next tier — genuinely weak |
| Easy       | 5           | Clear step up (66% for 10 vs 5) |
| Medium     | 10          | Clear step up (59% for 15 vs 10) |
| Hard       | 15          | Noticeable step up (62% for 20 vs 15) |
| Master     | 20          | Full strength — no cap, no noise |

**Why this resolves the "felt difference" concern without more engine
work**: framing it as five distinct named difficulties, rather than two
adjacent numbers (15 and 20) that imply they should feel similarly close,
sidesteps the issue entirely — a player choosing "Hard" vs "Master" reads
those as different difficulties on their face, which is an honest framing
of a real (if moderate, ~62%) win-rate gap, not an inflated one.

**If bigger separation at the top is wanted later**: the lever is preset
SPACING (e.g. skip from Hard=15 straight to Master=20 with no
intermediate, or define a custom extra tier), not re-tuning the
depth-cap/time-fraction/noise formulas in `skill.rs` — those are working
correctly and shouldn't be treated as the thing to fix for a UX-level
concern.

**Status**: decided, GUI implementation is Gokul's own — no Pet Dragon
engine repo changes from this decision. `src/lib.rs`'s WASM
`search_from_fen(fen, movetime_ms, skill_level)` already accepts a plain
`u8` skill_level per call (added this session), so the GUI can pass
whichever preset's value the player picked on every search — no engine-
side wiring left to do.

## D41 — Re-Park NNUE After hidden_size=128 Test Confirms D34's Ceiling (2026-07-13)

**Decision**: Tested D34's stated revisit condition (`hidden_size=128+`,
deliberately bigger architecture) on the exact same 286,659-row dataset
as the parked `hidden_size=32` baseline, isolating hidden_size as the
only changed variable. Result: val_loss=0.51655 (best epoch 3/10) vs the
parked baseline's val_loss=0.51636 (best epoch 4/10) — 4x the hidden-layer
capacity produced a marginally *worse* val_loss and overfit one epoch
earlier (val_loss rose to 0.53169 by epoch 10, a +0.0151 climb from best).
`NNUEWeight` stays 0% (unchanged since D25). No match_runner Elo sweep
run against this network — the val_loss regression already rules it out
as an improvement, and burning an Actions run to reconfirm a negative
result contradicts D19/D20's efficiency stance. NNUE work is re-parked;
Phase 16/17 stay closed as an optional, not-currently-worthwhile
enhancement on top of an otherwise-complete, Elo-validated engine
(Phases 0-20 all done).

**Why**: This is the 5th independent lever (after D34's data retrain,
clamp, and clamp+regularization) landing in the same ~70-72%
average-opponent-score / ~0.516 val_loss neighborhood, each time via a
genuinely different mechanism. Four different fixes plus one architecture
change all converging on the same ceiling is much stronger evidence of a
structural limit than of an undiscovered hyperparameter or under-sized
network. More parameters on the same data classically overfits faster
rather than learning more — which is exactly what happened (earlier best
epoch, steeper post-peak divergence) — not a coincidence.

**Rejected**: Immediately pursuing D34's other stated lever — a genuinely
bigger self-play dataset (500K-1M+ rows via a dedicated Kaggle job) —
rejected for now, not because it's wrong in principle, but because NNUE
is explicitly an optional strength enhancement (Phase 16's own scoping)
on an engine that's already complete and Elo-validated through Phase 20.
Spending a new, expensive, separately-scoped data-generation effort to
chase an optional feature isn't currently the best use of session budget.
Also rejected: running the match_runner sweep anyway for completeness —
rejected because the val_loss comparison is already conclusive and
directly comparable (identical data, identical everything else but
hidden_size), so the sweep would only spend Actions minutes to reconfirm
a known answer.

**Revisit**: only if/when a genuinely larger, dedicated self-play data
effort (not incremental) is undertaken separately — at that point retest
hidden_size=32 AND hidden_size=128 on the new data to see whether more
data alone breaks the ceiling before re-attempting bigger architectures.
Until then, NNUE stays parked and out of scope for regular sessions.

## D42 — UCI Completeness: Ponder, Contempt, Real Eval Bar; UCI_Elo Stays Rejected (2026-07-14)

**Decision**: Implemented three of four items requested this session:
Ponder option declaration, Contempt (draw-value tuning), and a real
engine-score eval bar for the browser. The fourth — `UCI_Elo` — was
explicitly declined by Gokul after being flagged as a direct conflict
with D39 (no calibrated human-comparable Elo number this engine can
honestly back). D39 stands unmodified; `Skill Level` (0-20, depth-cap
tiers) remains the only difficulty lever.

**Ponder**: added `option name Ponder type check default true` to the
UCI option list. No engine-side state — `setoption name Ponder` is
accepted (`"ponder" => {}` no-op arm) but genuinely does nothing, since
whether pondering happens is entirely determined by whether the GUI
sends `go ... ponder` at all (the underlying pending-allocation/
ponderhit logic already existed and worked; it just wasn't advertised,
so some GUIs would never invoke it).

**Contempt**: `option name Contempt type spin default 0 min -100 max
100`. Design choice worth recording: rather than adding a `root_side:
Color` field threaded through `SearchInfo`/`alpha_beta`, contempt's
sign is derived purely from `ply % 2` — `alpha_beta`'s `ply` parameter
already increments by exactly 1 per node starting at 0 at the root, so
`ply % 2 == 0` means the current node's side-to-move IS the root side,
with no new state to add, reset, or ever get stale. `draw_score(ply,
contempt)` (search/mod.rs) is a pure function: returns `DRAW_SCORE`
unchanged when `contempt == 0` (byte-identical to every pre-Contempt
test), `DRAW_SCORE - contempt` at root-side nodes, `DRAW_SCORE +
contempt` at opponent nodes. Applied at all 4 draw-detection sites in
`alpha_beta.rs` (repetition, 50-move, insufficient material, and
stalemate — the 4th one wasn't in the original 3-site read of the code;
included it too since a draw is a draw regardless of which mechanism
produced it). Threaded into `SearchInfo.contempt` (persistent across
moves, same pattern as `skill_level`) via `cmd_go`, applied to both
`h_info` (helper threads) and `main_info`.

**Real eval bar**: added `search_from_fen_with_eval(fen, movetime_ms,
skill_level) -> String` as a NEW WASM export, deliberately NOT modifying
the existing `search_from_fen`'s signature or return format. Returns
`"<uci_move> <eval>"` where eval is a plain signed centipawn integer or
`"mateN"`/`"mate-N"`, always from **White's perspective** (not the
UCI/negamax side-to-move convention) — a GUI bar needs a stable
reference frame that doesn't flip depending on whose turn it is.
`web/index.html`'s Worker now calls this instead of the old bare
`search_from_fen`; `window.petDragonSearch()` resolves `{bestmove,
evalCp, isMate, mateIn}` instead of a bare move string; a new
`updateEvalBarFromSearch()` renders the real score, called right after
each engine move completes. The old `updateEvalBar()` heuristic
(material + mobility) stays as-is and un-renamed — it's still the right
tool for instant feedback in the gap before the engine's own search has
run (e.g. immediately after a human move), `updateEvalBarFromSearch()`
just overrides it once a real search completes.

**Why the new-function-not-modified-signature approach**: `search_from_fen`
might have callers beyond `web/index.html` that this session didn't
audit (the repo's checked-in root `index.html` is stale — see
Housekeeping below — and there could be others). Changing its return
format would be a silent breaking change for anything still expecting a
bare move string. A new function costs a few duplicated lines
(`Position::from_fen`, `TimeControl` setup) but has zero blast radius
on anything already working.

**Verification gap, stated plainly**: the `wasm` feature could not be
compiled locally this session — `wasm-bindgen v0.2.126` (the version
pinned in the committed `Cargo.lock`) requires rustc 1.77+, and this
sandbox's apt-installed rustc is 1.75.0 (same class of toolchain-age
gap noted in prior sessions, just hitting a different dependency this
time). `search_from_fen_with_eval` was manually verified field-by-field
against `Position`/`SearchResult`'s actual definitions (`side_to_move:
Color`, `Color: PartialEq`, `score`/`is_mate`/`mate_in` on
`SearchResult`) and mirrors the already-working `search_from_fen`'s
structure exactly apart from the new eval-formatting tail, but this is
the one piece in this session that was not mechanically compiled by
Claude before delivery. The Rust lib/bins (everything except the
`wasm` feature) and the JS (`node --check` on all 3 script blocks,
including the Worker source extracted and checked separately as its
own ES module) were both verified. **Next session should confirm the
actual `wasm-pack`/GitHub Actions build succeeds** before treating this
as done.

**Housekeeping note (not actioned this session)**: discovered
`web/index.html` (7199 lines, current, has the 3-arg
`search_from_fen(fen, ms, skill)` call) is the real source, while the
repo's checked-in root `index.html` (2003 lines, what GitHub Pages
actually serves) is stale — still has the old 2-arg call from before
Skill Level (D39) existed, meaning the deployed page has been out of
sync with the actual engine's WASM API for at least one full phase.
Worth a dedicated session to figure out why the deploy workflow isn't
regenerating root `index.html` from `web/index.html` and fix the
pipeline, separate from today's feature work.

**Rejected**: `UCI_Elo` (see above — D39 stands). Also rejected:
touching the existing `search_from_fen`'s signature directly instead of
adding a new function (blast-radius reasoning above).

## D43 — UCI_LimitStrength/UCI_Elo Built, Overriding D39's Rejection (2026-07-14)

**Decision**: D42 (same day) closed with `UCI_Elo` explicitly declined
per D39. Gokul reversed that call later the same session and asked for
it anyway, with `UCI_LimitStrength` mapped onto Skill Level and `UCI_Elo`
mapped onto self-assumed Elo values. Flagged the reversal plainly before
building (D39's actual objection was never "don't build the option," it
was "don't attach a number this engine can't honestly back" — assigning
Elo values without real calibration data runs into exactly that). Gokul
chose to proceed anyway. D39 itself is NOT rewritten or deleted — its
depth-cap-tiers reasoning for Skill Level stands untouched; this decision
only overrides its specific rejection of attaching an Elo number.

**The numbers, and exactly what they are**: two layers, kept visibly
separate throughout implementation and its own doc comments.
1. **Real**: Session 68's actual 200-games/pair `uci_match_runner`
   validation — 0v5 -619.4 Elo, 5v10 -117.2, 10v15 -65.0, 15v20 -81.35
   (avg of two consistent runs). These are the only measured relative
   tier gaps that exist anywhere in this project.
2. **Assumed**: Gokul chose Skill 0 = 1200 and Skill 20 = 2600 as
   absolute anchors (no external rating pool exists to derive these
   from — same limitation D39 already documented). The four real gaps
   above were rescaled by one constant factor so they sum to exactly
   1400 (2600-1200) instead of their original unscaled sum, then
   chained from the two anchors to get 5 grounded points (levels 0, 5,
   10, 15, 20). Levels 1-4, 6-9, 11-14, 16-19 were linearly interpolated
   within each rescaled band — these 16 entries have ZERO game data
   behind them, only the assumption that Elo varies smoothly between
   the two nearest tested points.

Landed in `search/skill.rs`: `ELO_TABLE: [i32; 21]` (the full computed
table) and `elo_to_skill_level(target_elo: i32) -> u8` (nearest-match
against the table, clamped to the table's own min/max first, ties
resolve to the LOWER level — deliberately conservative, since
`UCI_LimitStrength` exists to make the engine weaker on request, and a
tie-break that rounds up would silently give a stronger engine than
what was asked for). `main.rs` gained `UCI_LimitStrength` (check,
default false) and `UCI_Elo` (spin, default = table max = 2600, range
1200-2600) options, `EngineState.limit_strength`/`.elo` fields, and
`cmd_go` now computes `skill_level` from `elo_to_skill_level(state.elo)`
instead of `state.skill_level` directly whenever `limit_strength` is
true — an override relationship, not an additional independent lever
(mirrors how Stockfish's own `UCI_LimitStrength` relates to its `Skill
Level`).

**Why `UCI_Elo` defaults to the table's max (2600), not some lower
"typical" value**: `UCI_LimitStrength` defaults to false, so `elo`'s
default is inert until a GUI explicitly enables limiting — but if a GUI
enabled `UCI_LimitStrength` without ever touching `UCI_Elo` (plausible:
some GUIs set flags before values, or a user toggles a checkbox without
realizing a paired spin box exists), defaulting `elo` low would silently
weaken the engine with no explicit request to do so. Defaulting to max
means that specific failure mode can only ever produce full strength,
never an unrequested handicap.

**Why linear interpolation for the untested 16 levels, not something
fancier**: the real 4-gap data already shows a non-uniform, diminishing-
returns shape (massive at 0-5, compressed at 15-20) — that shape is
real and preserved by rescaling all four gaps by the same factor.
Within each individual band, `skill_depth_cap()` itself increments by
exactly 1 ply per level (confirmed in skill.rs — no unevenness to
model), so there's no principled basis for anything more elaborate than
linear interpolation between the two nearest tested anchors without
inventing structure this project has no data to support.

**Test risk flagged**: `elo_to_skill_level()`'s own tests (exact-anchor
round-trips for all 21 levels, monotonicity, clamping both directions,
tie-break direction, non-exact nearest-match) and the `main.rs`
option/setoption/cmd_go wiring tests were all written and locally
compile-checked (`cargo check --bins` clean, plus the `--cfg test`
workaround for the test-cfg code — see prior sessions' notes on why that
workaround is imperfect but the best available check in this sandbox).
Not yet confirmed via a real `cargo test` CI run as of this decision.

**Revisit**: if real match-tested data ever exists for the currently-
interpolated levels (1-4, 6-9, 11-14, 16-19), replace those specific
`ELO_TABLE` entries with measured values rather than re-deriving the
whole table — the 5 anchor-derived entries (0, 5, 10, 15, 20) would stay
as-is unless Gokul chooses different absolute anchors again.

## D44 — Fix Shallow cmd_go Wiring Tests; Fixes a Real Elo/Time-Fraction Bug (2026-07-14)

**Decision**: Gokul flagged that several `cmd_go` wiring tests (added in
D42/D43, plus two pre-existing ones they copied their shape from —
`test_cmd_go_applies_skill_level_to_search` and
`test_cmd_go_applies_move_overhead_to_time_control`) only verified that
`EngineState` fields weren't unexpectedly mutated, not that the search
thread actually received the configured value. True: `cmd_go` never
writes `skill_level`/`contempt`/etc. back to `EngineState` either way
(it only reads them once into local variables before spawning the
search thread), so those assertions passed unconditionally regardless
of whether the thread closure used the right value — a copy-paste bug
like `main_info.contempt = 0` instead of `= contempt` would have sailed
through every one of them.

**Fix, in two parts:**

1. **`wait_for_search()` now returns `Option<SearchInfo>`** instead of
   `()`. It already joined the search thread and received its actual
   `SearchInfo` back (`returned_info`) — it just discarded everything
   except `history`/`countermoves`/`correction_history` after copying
   those into `self.info`. Now it returns the full joined struct too.
   Backward compatible: `Option<T>` isn't `#[must_use]`, so every
   existing call site (`state.wait_for_search();` as a bare statement)
   keeps compiling unchanged with zero warnings — confirmed via a clean
   `cargo check --bins`. Required adding `#[derive(Clone)]` to
   `CorrectionHistory` (`search/pruning.rs`) — needed so
   `wait_for_search()` can copy `correction_history` into `self.info`
   while also returning the whole `SearchInfo` it came from, without a
   partial-move conflict. Safe: it's just `Vec<[i32;2]>` + `usize`.

2. **Extracted `effective_skill_level(state: &EngineState) -> u8`
   and `build_time_control(state: &EngineState, line: &str, skill_level:
   u8) -> TimeControl`** as pure, standalone functions — the
   UCI_LimitStrength/UCI_Elo override logic and the `go`-line-to-
   `TimeControl` construction, respectively, previously both inlined
   directly in `cmd_go`. Both are directly unit-testable without
   spawning or joining any thread.

**Real bug this surfaced**: `build_time_control`'s extraction required
looking at exactly when `tc.skill_time_fraction_pct` got computed
relative to the Elo-override logic — and they were in the wrong order.
D43's `cmd_go` computed `tc.skill_time_fraction_pct` from
`state.skill_level` directly, then only LATER (right before the thread
spawn) computed the Elo-overridden `skill_level` used for the depth cap.
So with `UCI_LimitStrength` active, the depth cap correctly used the
Elo-derived level, but the TIME BUDGET still used the raw, possibly
irrelevant `Skill Level` setting. Concretely: a `UCI_Elo` request
mapping to a low Skill Level got the correct shallow depth cap paired
with a full, unreduced time budget — precisely the "searches shallow
then sits idle for the rest of its allocation, looking broken rather
than weak" failure mode Session 65 built the depth+time pairing to
prevent in the first place (see D39/skill.rs's own header comment).
Fixed by resolving `effective_skill_level(state)` once, up front in
`cmd_go`, and threading that single value into both
`build_time_control` and the later per-thread `SearchInfo` construction
— they can no longer diverge, by construction, not by convention.

**Tests rewritten** (all now assert on real, thread-verified or
pure-function values instead of state-field non-mutation):
- `test_cmd_go_applies_skill_level_to_search` — now checks
  `wait_for_search()`'s returned `SearchInfo.skill_level` directly.
- `test_cmd_go_applies_contempt_to_search` — same pattern for `contempt`.
- `test_cmd_go_applies_move_overhead_to_time_control` — now calls
  `build_time_control()` directly and checks `overhead_ms`/`movetime`.
- Split the old `test_limit_strength_enabled_overrides_skill_level`
  into `test_effective_skill_level_ignores_elo_when_limit_strength_off`
  and `test_effective_skill_level_uses_elo_when_limit_strength_on`
  (fast, pure, exact) plus one genuine end-to-end integration test,
  `test_cmd_go_search_reflects_elo_override_not_raw_skill_level`, that
  deliberately sets `skill_level` and the Elo-derived level to
  *disagree* (20 vs 3) and confirms the joined `SearchInfo` reflects the
  Elo-derived one — the specific case a state-field check could never
  distinguish.
- New regression test for the bug above,
  `test_build_time_control_uses_elo_derived_skill_level_not_raw`.

**Why extraction over a test-only escape hatch**: considered adding a
`#[cfg(test)]`-gated field to stash the built `SearchInfo` somewhere
`EngineState` exposes, instead of widening `wait_for_search`'s return
type. Rejected — that pattern only helps tests, adds permanent
production-code surface area (a field that exists solely to be read
back out in a different build configuration) for zero production
benefit, and doesn't fix the `TimeControl`/time-fraction ordering bug
at all (that bug lived in inline logic with no return value to widen).
Extracting the two pure functions fixes both the testability gap AND
the real bug simultaneously, and leaves `cmd_go` itself easier to read
as a bonus — the effective-skill-level resolution is now a single,
named, one-line step instead of duplicated inline logic in two places.

## D45 — Repetition Detection Redesigned to Match Stockfish's Algorithm (2026-07-14)

**Decision**: Replaced `is_repetition()`'s unbounded "scan all of
game_history for any 2nd occurrence" with the actual algorithm
Stockfish uses (`Position::set_state()`/`is_draw(ply)` in
`position.cpp`), verified against the real source rather than worked
from memory. `game_history` changed from `Vec<u64>` to `Vec<(u64,
i32)>` — each entry now caches a "repetition" distance at push time,
mirroring Stockfish's `StateInfo::repetition` field exactly.

**The algorithm**: `push_game_history()` walks backward through history
in steps of 2 plies (repetition requires the same side to move),
starting at `i=4` and bounded by `halfmove_clock` (no point checking
further back than the last pawn move/capture — that position is
provably not a repeat). On the first match found:
- caches `+i` if the matched position's OWN cached value was `0` (a
  first repeat), or
- caches `-i` if the matched position's own cached value was already
  nonzero (this is now the second link in a genuine repetition chain —
  functionally a 3-fold, encoded via sign rather than a separate flag).

`is_repetition(ply)` is then an O(1) lookup: `repetition != 0 &&
(repetition as i64) < (ply as i64)`. A negative (chain) value is always
`< ply` for any non-root ply, so it's always a draw regardless of where
in the search tree it's noticed — a real 3-fold on the board is a real
draw no matter what. A positive (first-repeat) value is only a draw if
`ply` exceeds it — meaning the repeated position was reached via moves
the search itself chose along the current branch, not purely inherited
from real game history that predates the search root. This is the part
the old implementation didn't have at all: it treated every repeat as
an immediate draw regardless of whether the search could do anything
about it, which could bias the search against a position it has no way
to actually avoid.

**Why `i=4`, not `2`**: a position cannot repeat after only 2 plies (one
move by each side) in legal chess — every individual move is a real
board change, so the shortest possible repetition cycle is 4 plies
(e.g. each side shuffles a piece out and back). Matches Stockfish's own
loop bounds exactly, confirmed against the real source before
implementing.

**Why no `pliesFromNull` bound (unlike Stockfish)**: checked Pet
Dragon's null-move pruning (`alpha_beta.rs`) directly — it mutates
`pos.hash`/`side_to_move` inline and never calls `push_game_history()`
at all, so a null-move-derived position can never end up in
`game_history` in the first place. Stockfish needs the extra bound
because its null-move handling does touch the same StateInfo chain;
Pet Dragon's design sidesteps the concern structurally rather than
needing an equivalent guard.

**Performance side-effect, not the primary motivation but real**: the
old scan was unbounded O(game-length) on every single draw check
(every node, every ply). The new one is O(halfmove_clock/2) amortized
at push time and O(1) at every subsequent lookup — the same asymptotic
improvement Stockfish gets from caching, for the same reason.

**`is_threefold_repetition()` deliberately left alone**: still a plain
count-of-3-or-more scan, ignoring the cached ply-relative value
entirely. This is intentional — it's used for actual game-end
adjudication (`match_runner`/`uci_match_runner`/`selfplay`/
`texel_gen`'s stopping condition), where the literal rule matters, not
what the search tree can currently see.

**`set_game_history()` — dead code, fixed anyway**: has zero callers
anywhere in the codebase (confirmed via grep before touching it), but
its signature had to change regardless since the field type changed.
Rewrote it to replay each hash through the same bounded-walk-and-cache
logic `push_game_history()` uses, rather than leaving it broken or
naively zeroing every cached value — correct behavior for whenever it
might be used, even though nothing calls it today.

**Real bug caught while writing the tests, not while writing the
algorithm itself**: every rebuilt test initially forgot to push the
*starting* position into `game_history` before making moves — matching
how `iterative_deepening()` actually pushes the search root first in
real usage, but easy to miss in an isolated test. Traced through the
exact index arithmetic by hand for each affected test (`position/
mod.rs`'s new direct unit tests, `alpha_beta.rs`'s integration test,
and `tests/make_unmake.rs`'s five rebuilt tests) and confirmed the fix
correctly reaches the intended backward distance in every case before
trusting the expected values.

**Also caught while rebuilding `alpha_beta.rs`'s integration test**:
its original bare-K-vs-K test position would have triggered
`is_insufficient_material()` before repetition detection ever got
meaningfully exercised, since that test runs a real `alpha_beta`
search (unlike `position/mod.rs`'s direct algorithm unit tests, which
aren't affected by this). Fixed by giving each side a pawn positioned
so it doesn't block the king-shuffle squares, so the test actually
exercises what it claims to.

**Verification gap, stated plainly**: `tests/make_unmake.rs` is a
separate integration test crate that could NOT be locally compiled
this session — same toolchain wall as every previous session's test
work (a dev-dependency needs `edition2024`, this sandbox's rustc is
1.75). Unlike the lib and the `pet_dragon` binary (both verified via
the `--cfg test` workaround), this file has zero local verification
beyond careful manual review — every index computation in its 5
rebuilt tests was traced by hand rather than compiled. `cargo test`
should specifically confirm this file's tests pass, not just the
aggregate count, before treating this as done.

**Rejected**: implementing Stockfish's additional "cuckoo table" O(1)
upcoming-repetition detection (used for search extensions near likely-
draw lines). That's a genuinely separate, more advanced feature — fast
detection of a repetition reachable via a single further reversible
move, used to bias search depth/extensions — not part of what was
asked ("the 3-fold avoidance rule/logic"), and not implemented here.

## D46 — build.yml Split: Versioned Tag Releases Separate from Rolling `latest` (2026-07-16)

**Decision**: `build.yml` now triggers on `v*.*.*` tag pushes in addition
to `main` branch pushes. The `release` job publishes to `tag_name:
github.ref_name` (e.g. `v3.3.3`) with `make_latest: true` when triggered
by a real version tag, and continues publishing to the existing rolling
`tag_name: latest` with `make_latest: false` for ordinary `main` commits.
Also added a `build-wasm` job to the same workflow, producing
`pet_dragon_bg.wasm`, `pet_dragon.js`, and `pet_dragon_standalone.js`
(base64-embeds the wasm binary, still needs `pet_dragon.js` alongside
it — explored full single-file concatenation of the wasm-bindgen glue
itself, rejected as too fragile against wasm-bindgen version changes for
the marginal benefit over the two-file version). First real tag:
`v3.3.3`, cutting Gokul's requested world-release version.

**Why**: The pipeline previously only ever published one release, always
under the literal tag name `latest`, on every push to `main` — there was
no mechanism to produce a real semantic-versioned release at all. Pushing
a version tag through GitHub's Release UI would have created an empty
tag with no attached binaries, since the old `on:` block didn't listen
for tag refs. Now: a tagged release captures a specific, citable, frozen
version (what "world release" actually needs); the rolling `latest`
release keeps working exactly as before for anyone tracking `main`
directly, and — because it publishes with `make_latest: false` once a
real tag exists — no longer steals GitHub's "Latest release" badge back
from the most recent intentional version tag on the next ordinary commit.

**Design notes**:
- `make_latest` is driven by `startsWith(github.ref, 'refs/tags/v')`, so
  this logic is generic and will work unchanged for `v3.3.4`, `v4.0.0`,
  etc. — nothing version-specific is hardcoded into the workflow itself.
- Gokul creates the tag via GitHub's mobile Releases UI ("Draft a new
  release" → tag field → target `main` → Publish) rather than any git
  CLI command — consistent with the mobile-only constraint. Title/body
  typed at that step are irrelevant; `softprops/action-gh-release`
  overwrites both fields once the workflow's `release` job runs against
  that same tag name, so the workflow's generated body (rules summary,
  download table, GPL attribution) is always the source of truth for the
  actual published text.
- **Sequencing requirement, confirmed the hard way**: this `build.yml`
  must be committed to `main` *before* a version tag is created — the
  workflow version active on the tag-push event is whatever's on `main`
  at the moment the tag is pushed, not a snapshot from later. This
  wasn't just a theoretical caveat: the first real attempt, `v3.0.0`,
  hit exactly this — the tag was created about 19 minutes before this
  fix actually landed on `main` (confirmed via GitHub API timestamps and
  Actions history showing zero runs against any tag ref), so the old
  workflow — which had no `tags:` trigger at all — silently never ran.
  The release sat with 2 manually-attached assets and GitHub's default
  auto-generated changelog text, easy to mistake for a partial success
  rather than a pipeline that never engaged. Diagnosed by cross-checking
  release `created_at`/`updated_at` timestamps against the Actions run
  list rather than assuming. Fixed by deleting `v3.0.0` and retagging as
  `v3.3.3` once `build.yml` was confirmed live on `main` (proven by the
  rolling `latest` release already showing all 7 assets from an
  intervening ordinary push) — that retag worked correctly end-to-end.

**Rejected**: A separate one-off manual release process (build locally,
upload by hand) — not viable, Gokul has no desktop/terminal. Also
rejected: making the rolling `latest` release disappear once a version
tag exists — kept it running unconditionally since it's useful for
anyone wanting to track `main` between tagged versions, and costs
nothing to keep alongside proper tags. Also rejected: true single-file
wasm bundling (concatenating wasm-bindgen's generated glue into the
standalone file, Stockfish-style) — technically demonstrated as
feasible, but the two-file version is the officially-documented
wasm-bindgen pattern (pass bytes to `init()`) versus text-munging
generated code that could silently break on a wasm-bindgen upgrade;
not worth the fragility for saving one file.

## D47 — Post-Release Improvements Tracked as ROADMAP Phase 23, Numbered in Execution Order (2026-07-17)

**Decision**: The 5-item post-world-release improvement list (thread-
differentiated Lazy SMP, NNUE data scale-up, NNUE architecture upgrade,
variant-specific opening statistics, SPRT-style testing gate) is tracked
as `ROADMAP.md` Phase 23, checkbox-style like every other phase — not
left as standalone report files. Item numbers (23.1-23.5) are the
recommended *execution* order, not a topic grouping: 23.1 (testing
gate) → 23.2 (thread-differentiated SMP) → 23.3 (NNUE data scale-up) →
23.4 (opening statistics) → 23.5 (NNUE architecture upgrade), with an
explicit warning at the top of the phase against skipping ahead.

**Why**: Two standalone report files
(`pet_dragon_competitive_analysis.md`, superseded by
`pet_dragon_improvement_roadmap.md`) were generated this session as
conversational deliverables — useful for a one-time read, but not
tracked anywhere the project's existing docs-are-the-memory discipline
would catch them again next session. Folding the corrected list into
`ROADMAP.md` means it gets the same treatment as every other piece of
planned work: read every session (Tier 1), checked off as completed,
carried forward if not. Numbering by execution order rather than topic
means a future session (or Gokul, mobile-only, scanning quickly) reads
top-to-bottom correctly without needing to separately consult a
"recommended sequencing" footnote that could drift out of sync with the
list above it.

**Context — this list exists because of a real mistake worth recording
plainly**: an earlier draft of this same analysis (same session)
incorrectly claimed continuation history, correction history, IIR,
razoring, singular extensions, ProbCut, and best-move-stability time
management were all missing. All seven were already implemented as of
Phase 13 — the draft was built from a stale `ENGINE_ARCHITECTURE.md`
(still describing Phase 7/8 scaffolding) plus general chess-programming
knowledge, without cross-checking actual source. A second, smaller
mistake happened during the correction itself: an initial grep for
`razor` (lowercase) missed the actual `Razoring` comment (capital R) in
source, nearly reintroducing the same class of error while fixing it.
Both `ENGINE_ARCHITECTURE.md` (full rewrite, verified line-by-line
against `src/`) and this improvement list were corrected in the same
session before anything wrong was committed to `ROADMAP.md` — but the
lesson generalizes: **cross-check any "what's missing" claim against
actual current source before writing it down, especially when a
project doc that's supposed to describe that source is more than a
session or two old.** `ENGINE_ARCHITECTURE.md` itself had drifted for
many sessions without being caught, since Tier 2 docs are only read
once per fresh session and nothing in the working process previously
required reconciling it against `src/` directly.

**Rejected**: Leaving the improvement list as standalone report files
only, on the theory that "the repo is the memory" already covers
anything worth keeping — report files delivered mid-conversation aren't
docs/ files and aren't part of the Tier 1/Tier 2 reading discipline, so
they'd have silently stopped being read the moment this conversation
ended.


## D48 — Regression Gate: exit-code threshold on uci_match_runner, gated against live `main`, not a pinned baseline file (2026-07-17)

**Decision**: Implement 23.1 (lightweight SPRT-style regression gate) as
a minimal extension of the existing `uci_match_runner.rs` (D36) rather
than new infrastructure. Added one optional 11th CLI arg,
`min_score_pct`: when supplied, the harness exits `1` if Engine A's
score against Engine B falls below that percentage, `0` otherwise; when
omitted (every existing manual `uci_match_runner.yml` invocation), the
harness always exits `0`, exactly as before — the gate mode is strictly
additive. A new `regression-gate` job in `build.yml` runs this
automatically on every `pull_request` (unlike `uci_match_runner.yml`,
which stays manual-dispatch for precision Elo/Skill-Level runs): it
builds the PR head as "candidate" (Engine A) and the current tip of
`main` as "baseline" (Engine B), plays 20 games at 50ms/move, and fails
if candidate scores below 35%.

**Why 35%, 20 games, 50ms/move**: This is explicitly a coarse smoke
check, not a precision measurement — the roadmap item itself is titled
"lightweight". At n=20 games, sampling noise alone is large enough that
a strong regression (tens of Elo) can still occasionally land near 50%;
a tight threshold like 45% would produce frequent false-positive gate
failures on completely healthy PRs. 35% (~-108 Elo via the harness's
own logistic conversion) is chosen to only catch clearly broken changes
(a real bug, not a small tuning-noise fluctuation) while staying cheap
enough to run on every PR — 20 games × up to 300 plies × 50ms worst-case
is minutes, not the tens-of-minutes a precision run (100ms/move, 100+
games) would cost. Precision Elo measurement stays on
`uci_match_runner.yml`'s manual trigger, unchanged by this decision.

**Why baseline = live `main`, not a pinned SHA/file**: Considered
storing a baseline git SHA in a repo file (e.g.
`.github/regression_baseline.txt`), updated by Gokul whenever a new
baseline should be promoted. Rejected in favor of always checking out
`ref: main` fresh for the baseline side: it needs no manual upkeep (a
pinned-file baseline would silently go stale the moment nobody
remembers to bump it, and Gokul is mobile-only — editing a SHA in a
text file by hand is exactly the kind of fiddly manual step the rest of
this workflow is built to avoid), and "does this PR make the engine
weaker than what's already on `main`" is the actually-useful regression
question, which a live comparison answers directly. Trade-off accepted:
the baseline binary gets rebuilt on every PR run rather than cached
across runs (mitigated by `Swatinem/rust-cache` on the baseline
workspace same as everywhere else in `build.yml`).

**Design notes**:
- `regression_gate_passes(score_a_pct, min_score_pct)` pulled out as a
  pure function (same pattern as `elo_diff_from_score`,
  `split_uci_options`) so the pass/fail boundary is unit-tested without
  spawning engine processes.
- Engine A is always the candidate and Engine B always the baseline in
  gate mode specifically so a failure message ("A scored 30% against
  B") reads directly as "the candidate regressed" without needing to
  remember an arbitrary A/B assignment.
- **Not yet a hard merge block.** The `regression-gate` job runs and
  reports on every PR starting this session, but GitHub only treats a
  job as merge-blocking once it's marked a *required* status check in
  branch protection settings — that's a repo-settings change, not a
  code change, and needs to happen once from Gokul's side (Settings →
  Branches → main, doable from the mobile GitHub app). Flagged in
  ROADMAP.md 23.1 rather than silently assumed done.
- Known limitation inherited from D36 unchanged: no per-move timeout on
  the child process read, so a genuinely hung candidate binary blocks
  the gate job until the CI job's own overall timeout, not a fast
  failure. Acceptable for now — same acceptance rationale as D36 — but
  worth revisiting if a hang is ever actually observed in a gate run.

**Rejected alternative**: A true statistical SPRT (sequential
probability ratio test, as used by Stockfish's fishtest) with LLR
bounds and configurable elo0/elo1 hypotheses. Rejected as over-built for
23.1's stated scope ("lightweight") and for a solo mobile-only
maintainer — a true SPRT needs a variable, potentially large number of
games per PR to reach a decision, which doesn't fit a fixed CI job
budget as cleanly as a fixed-N threshold check. The roadmap explicitly
calls this "SPRT-style", not SPRT; a fixed-N score threshold gets most
of the practical benefit (catching real regressions before merge) at a
fraction of the implementation and CI-time cost.


## D49 — Thread-Differentiated Lazy SMP: Small Fixed Offset Tables Keyed on thread_id, Not Per-Thread RNG (2026-07-17)

**Decision**: Implement 23.2 by adding a single new `SearchInfo.thread_id`
field (`usize`, default `0`), set explicitly per helper thread in
`main.rs`'s Lazy SMP spawn loop (`for tid in 1..threads`). Two existing
call sites read it to vary behavior:

1. `search::pruning::lmr_thread_base(thread_id) -> f64` replaces the
   hardcoded `0.75` constant in `alpha_beta.rs`'s LMR reduction formula.
   Cycles through a 4-entry fixed table (`[0.75, 0.45, 1.05, 0.60]`),
   indexed by `thread_id % 4`.
2. `search::ordering::thread_tie_break(thread_id, from, to) -> i32` adds
   a small (`0..=3`) deterministic offset to a quiet move's ordering
   score in `score_move()`, via a cheap multiplicative hash mix of
   `(thread_id, from, to)`.

Both functions return the untouched original value at `thread_id == 0`
(the main thread) by construction — `lmr_thread_base(0) == 0.75` exactly,
`thread_tie_break(0, _, _) == 0` always. This is the load-bearing safety
property: single-threaded search (`Threads` 1, the default) and the main
thread's own search in a multi-threaded run are provably byte-identical
to before this change. Only helper threads' internal exploration
changes, and helpers never report a result to the GUI (Phase 19's
existing MultiPV note already established this: helpers exist purely to
populate the shared TT, never to be authoritative on their own line).

**Why fixed offset tables, not per-thread RNG seeded off thread_id**: A
seeded-RNG approach (e.g. a small PRNG per thread, seeded by thread_id,
sampled once at thread spawn for that thread's LMR base and reused every
node) was considered and rejected for two reasons: (1) it's strictly more
machinery — a PRNG struct threaded through `SearchInfo` — for the exact
same practical effect as a lookup table, since the value only needs to be
distinct-and-stable per thread_id, not actually random or resampled
per-node; (2) a fixed table is trivially unit-testable by exact value
(`lmr_thread_base(1)` always equals the same number), where a seeded-RNG
approach would need either a fixed-seed determinism test anyway (no
stronger a guarantee) or would introduce nondeterminism into the test
suite for no real benefit — nothing about SMP tree diversity requires
true randomness, only decorrelation between threads, which a fixed table
already provides.

**Why `thread_tie_break` uses a hash mix instead of a second fixed
table**: Unlike LMR (one value needed per thread), the tie-break needs a
value per `(thread_id, from, to)` triple — 4096 combinations for 64
squares — so a literal table isn't practical. A cheap multiplicative mix
(same style as a simple hash function, not cryptographic) gives enough
avalanche that adjacent squares don't get visibly correlated offsets,
while staying a pure, allocation-free, branch-light function suitable for
the move-ordering hot path.

**Why magnitude is capped at `0..=3` for the tie-break**: `QUIET_BASE_SCORE`
is `0` and quiet moves are ordered purely by `history_score` (typically
tens to low thousands in magnitude once history/continuation-history
tables warm up) — a `0..=3` offset can only ever resolve a genuine tie or
near-tie between two quiet moves with (near-)identical history scores.
It cannot promote a quiet move ahead of a killer (`300_000`+), a capture,
or a meaningfully-history-favored quiet move, so this cannot introduce a
tactical blind spot — only reorders among moves the engine already
considered roughly equally good.

**Why LMR offsets are a small non-monotonic set rather than scaling
linearly with thread_id**: Recorded in `lmr_thread_base`'s own doc
comment (kept there, not duplicated at length here) — Lazy SMP gets
diminishing/negative returns from ever-more-aggressive reduction across
many threads, so a handful of repeating "personalities" decorrelates
helpers without any of them reducing so hard they stop contributing
useful TT entries.

**Known gap, explicitly not closed this session**: Elo impact of this
change is not yet measured. The new 23.1 `regression-gate` job runs
single-threaded by default (candidate vs. baseline `pet_dragon`, no
`Threads` setoption sent) and is sized as a 20-game/50ms smoke check, not
built to detect a genuine SMP-scaling improvement, which needs `Threads`
set >1 on both sides and meaningfully more games to resolve at this
sample size. Measuring this is a manual `uci_match_runner.yml` run
(`engine_a_uci_options`/`engine_b_uci_options` = `"setoption name
Threads value N"` on a multi-core CI runner) — left as a follow-up, not
folded into this session, since 23.2 itself was scoped as the code
change, not the validation run.

**Rejected alternative**: Vary `skill_level` or `contempt` per helper
thread instead of/in addition to LMR and move ordering, on the theory
that a wider spread of "personalities" (some more tactical, some more
positional) would diversify helpers further. Rejected: `skill_level` and
`contempt` are deliberately kept identical across all threads (see the
existing Phase 20 comment in `main.rs` — helpers already must match the
main thread's Skill Level depth cap, or they populate the shared TT with
full-strength lines that leak into a low-skill main search). Diversifying
those specifically would reintroduce the exact bug Phase 20 closed;
LMR/move-ordering are the correct, narrower place to add this kind of
variation because they affect *which lines get explored* without
changing *how the position is evaluated or how far a given tier is
allowed to look*.


## D50 — Self-Play Scale-Up: Sharded GitHub Actions Matrix + Merge, Not a Kaggle Job (2026-07-17)

**Decision**: Implement the code half of 23.3 by rewriting
`.github/workflows/selfplay.yml` from a single sequential job into a
3-job pipeline: `plan-shards` (builds a `[0..shards-1]` JSON list from
the `shards` input in plain bash, since Actions matrices need a
JSON-shaped source and `workflow_dispatch` inputs are plain strings) →
`selfplay-shard` (matrix job, one independent self-play batch per shard
on a disjoint seed range, `seed_start + shard*games_per_shard ..
+games_per_shard-1`) → `merge-shards` (downloads every shard artifact,
concatenates into one combined file, uploads as a single 30-day-retention
artifact). `selfplay.rs` itself is unchanged — the scale-up is entirely
in how many times it's invoked in parallel, not in the binary's own
logic.

**Why GitHub Actions sharding, not a dedicated Kaggle job**: D41's
"Rejected" section floated "a genuinely bigger self-play dataset
(500K-1M+ rows via a dedicated Kaggle job)" as the eventual lever, and
the roadmap's own Ease/Size note for 23.3 says "background GitHub
Actions self-play generation" — the two docs point in slightly different
directions, and this session's choice is GitHub Actions, not Kaggle,
for a mobile-only-maintainer reason: self-play generation is CPU search
work (no GPU, no training loop, nothing Kaggle's notebook environment
offers over a plain compiled binary), and `selfplay.yml` already existed
as a `workflow_dispatch`-triggered, mobile-app-runnable job — sharding
it is a same-surface-area change (still "tap Run workflow", still
downloads one artifact). A Kaggle job would mean Gokul manually
uploading a Kaggle notebook, managing a Kaggle session from a phone
browser, and downloading results from a different platform than the one
everything else in this repo already runs on. GitHub Actions is strictly
the lower-friction choice for the *generation* half; Kaggle stays exactly
where it already was — the *training* half, unchanged by this decision.

**Why a matrix + merge instead of one bigger sequential job**: The prior
workflow's largest recorded run was `n3000` (3,000 games, one job, one
runner) — whatever job-length constraint let that run complete becomes
the ceiling on total games per invocation. Fanning the same total game
count across N parallel runners doesn't change total CPU-time spent, but
does divide wall-clock time by roughly N (self-play games are
embarrassingly parallel — no shared state between games), which is the
actually-scarce resource for a solo maintainer who has to remember to
come back and start the next run. `fail-fast: false` on the shard matrix
so one flaky shard doesn't discard every other shard's already-generated
data; `merge-shards` runs with `if: always()` and reports (via a
`::warning::`) when fewer than `shards` files landed, rather than
silently producing a smaller combined file with no indication anything
was short.

**Why intermediate shard artifacts get 1-day retention, not 30**: Only
the merged combined file is the actual deliverable Gokul downloads and
feeds to Kaggle; the per-shard files exist solely so `merge-shards` can
assemble them. Keeping them at the default 30-day retention would just
be redundant storage — the same data lives in the combined artifact —
so they're set to expire quickly instead.

**Scope boundary, explicitly not closed this session**: This decision
covers the *generation infrastructure* only. Actually running enough
`selfplay.yml` invocations to meaningfully grow past the current ~500K-
row total, merging multiple runs' combined artifacts into one training
set, and re-running the Kaggle NNUE training job on the larger dataset
are all still-open follow-up actions requiring Gokul to trigger things
by hand — none of that can happen inside a single coding session. 23.3
stays unchecked in `ROADMAP.md` until that compute has actually
happened, not just become possible.

**Rejected alternative**: A single job with a higher `num_games` value
and a longer configured `timeout-minutes`, relying on GitHub's up-to-6-
hour default job ceiling headroom. Rejected because it doesn't actually
solve the calendar-time problem sharding does (10,000 games sequentially
at ~100ms/move average is still 10,000 games sequentially), and pushes
right up against the default job timeout as a fixed ceiling with no
parallelism benefit at all, for no advantage over sharding.

**Correction (added Session 79, 2026-07-18)**: The Scope-boundary
paragraph above says "re-running the Kaggle NNUE training job" —
that's wrong and shouldn't have been written without checking first.
NNUE training does not go through Kaggle at all; `train_nnue.yml` runs
the whole training loop natively on GitHub Actions via `train_nnue.rs`
(Phase 16.5), no Python/Kaggle notebook involved. Kaggle was the
original Phase 16.5 plan (D18.5/D21) but was superseded by this native
Actions workflow before D50 was written; this decision entry just
never got double-checked against the actual current workflow file.
Left the original paragraph as-is above (the record of what was
believed at the time) rather than editing it — this correction is the
fix, per this doc's own convention of appending rather than rewriting.


## D51 — Diagnostic Export "Result:" Line: Capture Reason at the Source, Not Reconstruct From Board State (2026-07-17)

**Decision**: Added two globals to `web/index.html` — `gameOverWinner`
('w'/'b'/null) and `gameOverReasonText` (short string: 'Checkmate',
'Stalemate', 'King captured', 'Insufficient material', 'Threefold
repetition', '50-move rule', 'Aborted', 'Resignation', 'Time forfeit') —
set at each of the 8 sites that set `customGameOver = true`
(`_checkGameOverInner`'s 6 branches, `handleAbort`, `confirmResign`,
`handleClockTimeout`'s 2 directions), reset alongside `customGameOver` in
`startGame()`. The diagnostic FEN export now reads these directly into a
new `Result:` line instead of the export tool (or a human, or me)
inferring the reason after the fact from raw board state.

**Why capture at the source instead of reconstructing later**: This
session's own diagnostic thread is the direct motivating evidence for
why reconstruction is unreliable: a "Game over (in check)" export was
initially assumed to mean checkmate, but "(in check)" is actually
computed from `customInCheck` alone — an orthogonal fact about the final
position, true for checkmate AND for a repetition/50-move draw that
happens to land on a position with the side-to-move in check. Confirming
the real reason required manually replaying the last several plies
against the halfmove clock to count position recurrences by hand — slow,
error-prone, and not something to redo for every future diagnostic
export. Every termination branch already builds a perfectly clear `msg`
string for the on-screen banner (e.g. `'🤝 Draw — Threefold
repetition'`); the fix is simply to also store the *reason* (not the
decorated banner text — see below) in a variable at the same moment,
rather than trying to infer it from `customGameOver`/`customInCheck`/
board state after the fact.

**Why a separate `gameOverReasonText` instead of just reusing the
existing `msg` string verbatim**: `msg` is decorated for the in-game
banner (emoji, exclamation points, "You"/"AI Engine" phrasing tied to
`playerColor`) — reusing it verbatim in the export would either
duplicate that framing oddly in a technical diagnostic file, or require
parsing it back apart to get White/Black + reason if the export ever
needs to present the result generically (e.g. independent of which side
the person happened to be playing that game). A short, undecorated
reason string (`'Threefold repetition'`, `'50-move rule'`, etc.) plus a
separate `gameOverWinner` color is more reusable and is what the export
function combines into its own `Result:` phrasing
(`'Result: White wins (you) — Checkmate'` /
`'Result: Draw — Threefold repetition'` / `'Result: Aborted — no
result'`), independent of the on-screen banner's wording.

**Why `gameOverWinner` is a plain color ('w'/'b'/null), not "player" vs
"AI"**: Keeps the stored fact objective (who actually won, in board
terms) and lets the export derive the subjective "(you)"/"(AI)" framing
from `playerColor` at read time — same reasoning as the existing
`Turn to move:`/`Player is playing:` lines already being reported
separately rather than pre-merged.

**Scope note**: This only feeds the diagnostic export. It does not
change any win/draw/loss detection logic itself (`_checkGameOverInner`'s
actual conditions are untouched) and does not change what's shown on
the in-game banner (`el.textContent`/`msg` still built exactly as
before) — purely additive bookkeeping so the *reason* is captured
once, correctly, at the moment it's known, instead of needing to be
reverse-engineered later.


## D52 — NNUE Re-Parked (Again): 5x More Data Closes Most of the Loss Gap But Uncovers a Logit-Saturation Bug — Data Volume Was Not the Real Blocker (2026-07-18)

**Context**: D34 parked NNUE after it lost to HCE on 483,080 rows
(val_loss 0.53776). D41 re-tested a bigger architecture (hidden_size=128)
on the same small dataset and it also lost, re-confirming the park but
leaving open whether data volume (not architecture) was the actual
bottleneck. Phase 23.3 (D50, this session's earlier half) built the
infrastructure to test that directly: 2,428,608 fresh self-play rows,
5x the old dataset, same hidden_size=32 architecture as D34 for a clean
comparison.

**What happened**: Training on the full 2,478,608-row combined dataset
(2,428,608 self-play + 50,000 Lichess) genuinely improved the loss
metric — best epoch 6/10, val_loss=0.50108, a real and meaningfully
sized drop from 0.53776. That part of the data-starvation theory holds.
But a 20-game pure-NNUE-vs-pure-HCE match (`NNUEWeight=100` vs default 0,
via `uci_match_runner.yml`) was a **20-0 shutout in HCE's favor** — not
a modest edge, a complete rout. Zero draws.

A 20-0 sweep is a different signal than "NNUE is weaker" — a merely
weaker-but-functional eval still flukes occasional wins on tactics. The
`eval_diag.yml` diagnostic (Phase 17.5d) confirmed why: **6 of 8 test
positions came back pinned at exactly the ±1500cp hard clamp**,
including positions that should evaluate near zero (a symmetric random
start) or moderately, not maximally. The network isn't giving a graded,
weaker opinion — it's collapsed into near-binary "very winning / very
losing" outputs with almost no signal in between, which would make any
search using it play close to randomly among any moves that aren't
already obviously winning or losing.

**Leading hypothesis for the saturation, not yet confirmed by a
follow-up run**: `train_nnue.rs`'s loss blends `lambda=0.7` eval-target
(soft, sigmoid-bounded) with 30% weight on the raw game *result* — a
hard 0/1/0.5 label — for self-play rows. BCE loss against a hard target
has no natural ceiling: loss keeps shrinking the more extreme (larger-
magnitude logit) the network's prediction gets, so the hard-label
component actively rewards logit blow-up. `weight_decay=0.01` and
`grad_clip_norm=1.0` (D30/D33) exist specifically to counter this
tendency, tuned against the old 483K-row dataset — they may simply not
be strong enough at 5x the data and (likely) more gradient steps.

**Decision**: Re-park NNUE again, same as D34/D41, but on a materially
different and more useful basis than either prior park: this time the
blocker is identified as a specific, plausibly-fixable training-config
issue (logit saturation from hard-label blending) rather than "needs
more data" (now tested and largely resolved on the loss metric, yet the
strength problem persisted) or "needs more capacity" (D41 already ruled
that out at the old data volume). The next experiment — raising `lambda`
toward 0.9-1.0 to reduce or remove the hard-result component's pull
toward saturation, same data, same architecture — is a single-variable
follow-up test, explicitly deferred to a fresh session per Gokul's
request rather than run immediately at the end of this one.

**Why not immediately retrain with a guessed lambda value in this same
session**: Two reasons. First, Gokul explicitly asked to document
everything now and explore further in a new session — respecting that
directly. Second, `weight_decay`/`grad_clip_norm` are both plausible
co-contributors and haven't been ruled out; jumping straight to a
lambda change without first deciding whether to isolate lambda alone
or adjust multiple knobs at once risks another single, ambiguous data
point rather than a clean test. That decision belongs at the start of
the next session, with full context, not rushed at the tail of this
one.

**What's NOT the takeaway**: This is not evidence that NNUE can't work
for Pet Dragon, and it's not a reason to abandon the data-scale-up
effort — the loss-metric improvement from 5x the data was real. It's
evidence that the *training configuration* (specifically the
result-blend mechanism) needs attention before more data or a bigger
network can be fairly evaluated again.

## D53 — Logit-Saturation Root Cause Fixed: Label Smoothing on the BCE Target (Session 80)

D52's saturation wasn't a data-volume problem — it was the training
objective itself. BCE against a hard 0/1/0.5 game-result label has no
finite minimizer; the loss keeps falling as the pre-sigmoid logit is
pushed toward +/-infinity, and `weight_decay`/`grad_clip_norm`
(D30/D33) only damp the resulting large gradients, they don't remove
the incentive. Added `label_smoothing` to `train_nnue.rs` and
`train_nnue.yml` (default `0.03`, CLI/workflow-configurable, `0`
reproduces exact pre-fix behavior): maps the blended `[0,1]` target
into `[label_smoothing, 1-label_smoothing]` before BCE, so the
objective's own minimizer corresponds to a finite logit instead of an
unbounded one. Math check: at `label_smoothing=0.03` the theoretical
best-case target for a decisive row is ~1390cp — barely below the
1500cp hard clamp in `inference.rs` — which is why `0.03` alone barely
moved the `eval_diag.yml` reading even though the fix was real (see
D55 for the full sweep this motivated).

## D54 — `eval_diag.yml` Does Not Reliably Predict Match Strength (Session 80)

Discovered while sweeping `label_smoothing`: the network with the
*best-looking* static calibration (`0.30`, 0/8 test positions
saturated, magnitudes close to HCE) produced the *worst* actual match
result (18-0-2 vs HCE, +511.5 Elo) of the whole sweep — worse than
`0.03`'s 5/8-saturated network. `eval_diag.yml` checks 8 isolated
positions' absolute magnitude against HCE; it says nothing about how
well the network discriminates between two similar positions a move
apart, which is what actually drives move ordering and search quality
during real play. Leading theory: heavier label smoothing compresses
the target range further, which may flatten the network's sensitivity
to small positional differences even as it looks more "reasonable" on
a handful of cherry-picked static positions.
**Consequence**: `eval_diag.yml` stays useful as a cheap pre-filter for
gross failures (sign errors, full clamp saturation) before spending a
20-game match run, but it must never again be used alone to rank or
select between checkpoints that already pass the sanity check — only
`uci_match_runner.yml` results decide that. Every checkpoint in D55's
sweep was match-tested for exactly this reason once D54 was found.

## D55 — NNUE Re-Parked at `label_smoothing=0.10`, NNUEWeight Stays 0% Default (Session 80)

Full sweep of `label_smoothing` post-D53-fix, all six values trained
on the same 2.48M-row 23.3 dataset (`lambda=0.7`, `hidden_size=32`,
10 epochs, seed=42 fixed throughout — single-variable test), and — per
D54 — every value validated with a real 20-game `uci_match_runner.yml`
HCE(0%)-vs-NNUE(100%) match, not just `eval_diag.yml`:

| label_smoothing | eval_diag saturated | Match (HCE score / Elo) |
|---|---|---|
| 0.03 | 5/8 | not match-tested |
| 0.05 | 3/8 | 95.0% / +511.5 |
| 0.08 | 3/8 | 92.5% / +436.4 |
| **0.10** | **3/8** | **87.5% / +338.0 ← best** |
| 0.15 | 6/8 (bad checkpoint) | not match-tested |
| 0.30 | 0/8 | 95.0% / +511.5 |

`0.10` is a clean, well-bracketed local optimum — monotonic
improvement `0.05→0.08→0.10`, then a cliff at `0.30`, not a single
lucky sample. Notably, `0.10`'s result (17W-2L-1D, 87.5%, +338 Elo) is
numerically identical to the very first NNUE blend test ever run on
this project (17.4/D25, a 25%-blend test against the old pre-fix
network) — after fixing the saturation bug and sweeping six values,
NNUE is back to roughly its original-ever performance level relative
to HCE, not ahead of it. Real progress from the pre-fix 20-0 shutout
(sign-correct now, non-degenerate, genuine but limited magnitude
discrimination), but not competitive.

**Decision**: ship as-is rather than continue chasing parity.
`nnue_pet_dragon_quantized.bin` committed at the `label_smoothing=0.10`
checkpoint. `NNUEWeight` stays at its 0% default (unchanged since D25)
— the network is available as a UCI option for anyone who wants to
enable it, but is not on the default search path. Re-parked.

**Reopening conditions**, if NNUE is revisited again: the `label_smoothing`
axis is exhausted (bracketed local optimum found, further sweeping this
one knob is unlikely to help). Next levers, in order of expected
leverage-to-effort: (1) the material-bucket confidence-gating idea
(use NNUE only in board-material buckets well-represented in training
data, HCE elsewhere — cheap, reuses the existing tapered-eval phase
signal, no new ML infra) discussed but not built this session; (2)
`hidden_size` increase (32→64+) or a genuinely larger dataset, both
higher-effort with no strong signal yet that capacity/data (rather
than the training objective) is the remaining bottleneck; (3) 23.5's
king-relative bucketed-feature architecture upgrade, explicitly
sequenced last since it's the largest effort and depends on the
smaller levers being exhausted first.

## D56 — Pawn-Flexibility Feature Redesign: Scoped, Not Shipped (Session 81)

While discussing why D53-D55's calibration issues persisted, walked
through D11's actual mechanism in detail: each of the 16 pawns has its
own feature, active only until that specific pawn's first move, then
permanently off for the rest of that game's length (up to 300 plies,
every ply recorded as a row). This raised a real design question —
whether 128 independent per-square flags is the right shape for this
signal at all, separate from any imbalance in how often it's active.

Proposed replacement: a single one-hot bucket per perspective over
(own unmoved pawns - opponent unmoved pawns), 5 buckets
(`<=-3 / -2..-1 / 0 / 1..2 / >=3`) instead of 128 per-square flags —
`NUM_FEATURES` 896->773. Full implementation was written (`features.rs`
rewrite, all 8 tests updated, `train_nnue.rs` comment fix) and is
available if this gets picked up again, but was **not shipped**: it's
a schema-breaking change (old checkpoints become permanently
incompatible, forced retrain, a real window where `main`'s tests are
red until that retrain lands) which the person doing the committing
explicitly did not want given how many rounds this session already
took. Superseded by D57's cheaper, non-breaking approach — see D58 for
current status. If NNUE work resumes and a real investment is
approved, this design is ready to implement rather than needing to be
re-derived from scratch.

## D57 — Phase-Balanced Oversampling: Implemented, Empirically Negative Result (Session 81)

Cheaper, non-breaking alternative to D56: instead of changing what any
feature means, oversample training rows with a rare pawn-start-feature
activation count (D11) in the per-epoch training order —
inverse-sqrt-frequency weight expressed as integer row duplication,
`phase_balance_cap` (default 4, `1` disables). `features.rs` untouched,
no schema change, currently-committed network stays loadable
throughout.

Tested at `phase_balance_cap=4` on the same 2.48M-row dataset,
`label_smoothing=0.10`. Result: **the fix had zero effect.** The
balanced row count exactly equalled the original row count (no row
was duplicated), and `val_loss=0.57740` was bit-for-bit identical to
the un-oversampled `0.10` baseline run.

Why: the actual activation-count histogram logged by this run is far
flatter than the hypothesis assumed — every bucket (0 through 16
active features) fell within a ~90K-163K range, under 2x apart, not
the sharp early-game-only spike the theory predicted. Notably, bucket
16 (all 16 pawns still on their start square — literally the position
before any move) had *more* rows (128,394) than several of the
supposedly-common decayed-state buckets, the opposite of what the
"near-game-start rows are rare" theory predicted. With imbalance this
mild, inverse-sqrt weighting produces normalized weights too close to
1.0 to survive integer rounding.

**Conclusion: the row-imbalance hypothesis from D53-D55's diagnostic
work is not well supported by the actual data.** Not worth pursuing
further by tuning the weighting more aggressively — that would be
fixing a problem the data says isn't really there. No repo change
needed as a result (currently-committed `0.10` network already
reflects what this run produced). `phase_balance_cap` stays in
`train_nnue.rs`/`train_nnue.yml` as an available, defaults-to-4,
proven-inert-at-current-data knob — cheap to leave in, not worth
removing.

## D58 — NNUE Re-Parked Again: Cheap Levers Exhausted (Session 81)

Following up on D55's parking, this session tried the two cheapest,
lowest-risk remaining levers before considering bigger investments:
D56 (pawn-feature redesign, scoped but not shipped — schema-breaking)
and D57 (phase-balanced oversampling, shipped, empirically negative).
Also discussed but not started: confidence/in-distribution gating
(route to NNUE only where training data is dense, HCE elsewhere) and
distillation from Stockfish's public eval for the phase of a Pet
Dragon game that's converged close enough to standard chess to trust
it (D10's phase-out design is meant to reach that point) — both real,
scoped ideas, neither attempted this session.

**Current best remains the `label_smoothing=0.10` checkpoint from
D55**: 17W-2L-1D, 87.5%, +338 Elo for HCE. Unchanged by this session's
work. `NNUEWeight` stays at its 0% default.

**Status: re-parked.** Every remaining lever with a plausible path to
closing real ground on HCE — D56's feature redesign, swapping the
training pipeline off NORU's pure-Rust CPU trainer onto a
GPU-accelerated PyTorch/Colab pipeline (keeping NORU for its already-
correct i16 quantized inference), or Stockfish-distillation data
augmentation — is a genuine structural investment (new training
infrastructure, a schema-breaking retrain, or a new data pipeline),
not a quick, low-risk try. D55's original reopening-lever list is
superseded by this one; treat this entry as the current status instead
of D55's for anyone resuming NNUE work.

## D59 — Singular Extension Family: Multi-Cut Pruning + Negative Extensions (Session 82)

Extended Phase 13.3's base singular extension with two Stockfish-family
siblings, both reusing the existing verification search's result rather
than doing any extra search work. Multi-cut: if the reduced-depth
search that excludes the TT move still reaches `singular_beta`, at
least one *other* move also refutes at that margin — the position is
being cut multiple different ways, so the whole node is pruned right
there (`return singular_beta`), before move generation. This is the
same "early return, skip TT store" shape probcut and razoring already
use elsewhere in `alpha_beta.rs` — not a new pattern introduced for
this. Negative extension: if verification did *not* confirm
singularity, but the TT move's own recorded score already meets beta,
the TT entry is telling us this is very likely a cutoff regardless —
reduce (not extend) the TT move's own search rather than spend extra
depth re-confirming what the TT already suggests. Reduces by 1 ply more
in non-PV nodes than PV nodes (`-1` PV / `-2` non-PV), matching
Stockfish's `-2 - !PvNode` shape.

Implementation: `alpha_beta.rs`'s singular block generalized from a
boolean `singular_extension` flag (always `+1` or `0`) to a signed
`tt_move_extension` (`+1` / `-1` / `-2` / `0`), applied only to the TT
move via `move_ext` (renamed from `singular_ext` at all 4 PVS-block use
sites — `depth - 1 + move_ext`, unchanged arithmetic shape, just a
wider range of values now). A negative `move_ext` can push
`depth - 1 + move_ext` below zero for the TT move's own recursive call;
this is safe and already handled — `alpha_beta_with_excluded`'s
`depth <= 0` branch drops straight to `quiescence()`, same path any
other depth-exhausted node takes.

No existing test exercised this logic before (confirmed via grep — no
`singular` test in `alpha_beta.rs` or `pruning.rs`), so this carried no
risk of silently changing a previously-tested behavior. One new test
added (`test_search_at_singular_extension_depth_no_panic`, depth 7,
5 seeds) checks the search stays bounded and legal at a depth where
this code path is live; it does not assert which of the three branches
(extend/multi-cut/negative-extend) fires for any given seed, since
that's position- and TT-state-dependent and not meaningful to pin down
per-seed.

⚠️ Not yet Elo-measured — same open item as D49/23.2's thread-
differentiated Lazy SMP. A real `uci_match_runner.yml` run (not just
`cargo test` passing) is the way to quantify this, not done this
session.

⚠️ Not yet CI-confirmed to compile/pass at all — see D60's note, same
caveat applies to both of this session's changes together.

## D60 — Late Move Pruning (LMP) (Session 82)

New technique, distinct from LMR: LMR still searches a late quiet move,
just at reduced depth, so a re-search can recover a buried tactic. LMP
instead skips the move outright once enough quiet moves have already
been tried at this node without raising alpha — Stockfish/Ethereal-
family technique, accepting that moves ordered this late at this
shallow a depth essentially never turn out to matter.

New `MAX_DEPTH_LMP = 8` constant (`mod.rs`) and
`pruning::lmp_threshold()` / `should_apply_lmp()`, wired into
`alpha_beta.rs`'s move loop immediately after the existing futility-
pruning block (same guard shape: non-PV only, never in check or on a
checking move, never near mate-range alpha/beta scores). Threshold
table: `[0, 3, 4, 6, 9, 12, 16, 20, 25]` indexed by depth 0-8.

Stockfish and Ethereal both differentiate this threshold by an
"improving" flag (is static eval better than it was two plies ago for
this side) — a higher threshold when improving, lower when not. Pet
Dragon's `alpha_beta` doesn't track an improving flag anywhere
currently; adding one is a real, separate change (needs a per-ply
static-eval history thread through the search) with its own risk
surface, not something to bundle silently into this session. This
implementation uses the single, more conservative ("non-improving")
threshold uniformly at every node instead — it can only prune *fewer*
quiet moves than an improving-aware version would, never more, so it's
a safe default pending that follow-up. If revisited: add an
`improving: bool` parameter alongside the existing `pv_node`/`in_check`
signature pattern already used throughout `alpha_beta.rs`, and give
`lmp_threshold` a second (higher) table for the improving case.

⚠️ Same two caveats as D59: not yet Elo-measured, and not yet
CI-confirmed. This session's sandbox had no reachable Rust toolchain
(rustup's domain isn't in the network allowlist, and cargo/rustc
weren't pre-installed) — verification was full manual review of both
changed files, a brace/paren/bracket balance check, and a diff against
freshly-pulled pristine source confirming only the intended lines
changed, not an actual `cargo test` run. **Next session's first action
should be confirming these changes build and pass CI before relying on
anything else about them.**

## D61 — NNUE Shelved for the Future (Session 82)

Gokul's call: shelve NNUE work entirely for the foreseeable future,
rather than continuing to work the data-volume problem (D53/D55/D57/
D58). Pet Dragon ships and runs on Texel-tuned HCE (`NNUEWeight`
already defaults to 0%, per D55/D58 — this decision doesn't change
runtime behavior, it changes what future sessions should spend time
on). Consequence: 23.5 (NNUE architecture upgrade — king-relative
bucketed features) is moot as scoped, since it's specifically an NNUE
change; see ROADMAP.md's 23.5 entry, left in place but marked HELD
rather than deleted so D55/D57/D58's data-volume analysis isn't lost
if this is revisited. If NNUE work resumes later, start from D58's
three reopening options (better inference reuse of NORU's already-
correct i16 quantized path, a training-infra swap off NORU's CPU
trainer, or Stockfish-distillation data augmentation) — those were
already identified as the real levers, not a quick retry of what's
already been tried.

## D62 — Variant Opening Statistics (23.4) Held Pending Design Decision (Session 82)

Investigated implementing 23.4 this session (per the original ROADMAP
scoping, "Ease: Medium, data-aggregation script over existing
`selfplay.rs` output") and found the scoping was wrong on two counts,
surfaced by actually reading `selfplay.rs` before writing anything
(mandatory read-before-write rule doing its job here):

1. **No data to aggregate yet.** `selfplay.rs`'s output format is
   NNUE training rows only — `stm_features | nstm_features |
   search_eval_cp | game_result` — and records neither the starting
   seed, the position's identity, nor which move was played at the
   root. There's currently no file anywhere with a "starting position
   → root move → result" record. 23.4 isn't an aggregation script over
   existing output; `selfplay.rs` would need a new output stream
   first.

2. **Coverage problem, more fundamental.** `Position::generate_with_
   seed` draws from 2.16M distinct starting positions. Self-play games
   run on sequentially incrementing seeds (`seed_start + game_idx`),
   so unless job runs deliberately overlap seed ranges, essentially
   every self-play game visits a starting position that's never
   repeated anywhere else. An exact-position-keyed opening book built
   from that data would have a near-zero hit rate against any real
   game — the same starved-coverage shape as NNUE's problem (D53),
   just in a different keyspace (positions instead of training rows).

Presented Gokul two real design paths — exact-position book (simple,
but hit rate only grows as self-play volume grows, slowly, against a
2.16M-position denominator) vs. bucketing by structural features
(pawn shape / piece pattern) so similar-but-not-identical positions
can share statistics, generalizing instead of requiring an exact
match — and Gokul chose to hold the whole item rather than pick a
path yet. Recorded here rather than half-designed, so a future session
doesn't restart from the original (incorrect) "Ease: Medium" framing
in ROADMAP.md. Resume by re-reading ROADMAP.md's 23.4 entry and this
decision, then actually picking exact-vs-bucketed before writing any
code — the two investigation findings above stand regardless of which
path gets picked.

## D63 — HCE Term-Gap Audit: Three Candidates Identified, None Implemented (Session 82)

Gokul asked whether the two eval improvements discussed so far were
"the best the engine can be tuned" — audited all six `eval/` submodules
fresh (not from memory of ENGINE_ARCHITECTURE.md's summary) against the
standard classical-engine term list to give a grounded answer rather
than a guess.

Confirmed already present and correct: material with bishop-pair bonus
(`material.rs`), four pawn-structure terms — isolated/doubled/backward/
passed with rank-scaling (`pawns.rs`), four king-safety terms —
attacker-count danger/pawn shield/open-and-semi-open-file penalties
(`king_safety.rs`), rook-specific terms — open file/7th rank/batteries/
connected rooks (`open_lines.rs`), mobility (`mobility.rs`), tempo, and
phase tapering threaded through every term via `eval/mod.rs`'s
`evaluate()`. Most of the well-established HCE term list is already
checked off and Texel-tuned (D35).

Three real, confirmed-by-source gaps found, ranked by expected value:

1. **Passed-pawn king distance** — `pawns.rs`'s passed-pawn bonus
   (`PASSED_PAWN_BONUS`, rank-indexed) never checks either king's
   distance to the pawn. This is one of the highest-value terms in any
   strong classical engine (the "square of the pawn" concept) and is
   completely absent. Ranked highest.
2. **Pawn storm** — `king_safety.rs` scores the defensive shield
   (`PAWN_SHIELD_BONUS`) but nothing scores advancing pawns toward the
   *enemy* king as an attacking resource. Confirmed via grep across
   `pawns.rs`/`mobility.rs`/`open_lines.rs` that no king-relative logic
   exists anywhere outside `king_safety.rs`.
3. **King-relative PST bucketing** — `tables.rs`'s `pst_value()` takes
   only `(kind, sq, color)`; no term anywhere makes a piece's
   positional value depend on where either king is. Ranked lowest/most
   speculative — would need new Texel-tunable parameters, and needs to
   stay *coarse* (a handful of buckets: same-side/center/opposite-side
   or similar) rather than full per-square king-relative buckets in the
   NNUE-HalfKP sense. A full NNUE-scale king-bucket PST (~64× the
   current flat-PST parameter count) would hit the exact same
   parameter-count-vs-training-data wall NNUE already has at 896 inputs
   with ~2.5M rows (D53/D55) — HCE has far less training data available
   than NNUE does (Texel tuning's 147,283-sample runs, not NNUE's
   millions), so a coarse handful of buckets is the ceiling for this
   term, not a design choice to revisit later for something bigger.

None of the three are scheduled or sized into a roadmap item — this is
a documented, ranked candidate list for whenever Gokul wants to pick
one up, not a commitment. Explicitly told Gokul the honest ceiling:
HCE has a structural cap no amount of hand-crafted terms closes (that's
the entire reason NNUE exists as a category), term-count has
diminishing returns past this point (more free parameters need more
Texel-tuning data, the same constraint already shaping what's
tunable), and search is already close to state-of-the-art per the
Session 82 competitive analysis (D59/D60 already captured the two
concrete gaps found there) — so what's realistically on the table here
is a handful of incremental items, not a large untapped territory. The
actual large remaining ceiling is the NNUE data-volume problem, which
D61 shelves.

## D64 — Alternative Evaluation Paradigms Surveyed, None Adopted (Session 82)

Gokul asked, beyond HCE and NNUE, what else exists as an evaluation
approach. Answered from general chess-engine-architecture knowledge
(cross-checked via web search, since the field moves) rather than
assuming Pet-Dragon-specific applicability without saying so. Recorded
here so this doesn't get re-investigated from scratch in a future
session — the landscape survey stands even if circumstances (compute,
data) change later, though the applicability conclusion should be
re-checked if so.

- **MCTS + policy/value network** (AlphaZero, Leela Chess Zero) — not
  an eval swap, a different *search* paradigm: Monte Carlo Tree Search
  guided by a network outputting both an evaluation and a move-
  probability distribution, replacing alpha-beta entirely. Needs
  GPU-scale parallel compute for both training and inference to be
  competitive. Adopting this would mean discarding Pet Dragon's entire
  search stack — the part already confirmed near state-of-the-art in
  the Session 82 competitive analysis — not augmenting it. Ruled out:
  wrong deployment target (WASM/browser + CPU-only CI), and would
  discard rather than build on existing, working search work.
- **Searchless transformer evaluation** (DeepMind's "Grandmaster-Level
  Chess Without Search," Ruoss et al.) — a large transformer trained
  via supervised learning on Stockfish-annotated positions, single
  forward pass at inference, no tree search at all. Conceptually the
  opposite end of the spectrum from NNUE (replaces the search loop
  rather than living inside it). Ruled out: needs even more training
  data than NNUE already lacks, since there's no search to lean on for
  signal — inherits and worsens the exact problem D61 just shelved.
- **GPU-sized NNUE variants** — some newer engines use larger nets
  requiring GPU rather than staying in NNUE's original CPU-quantized-
  int8 lane. Ruled out: breaks the CPU/WASM-friendly efficiency that
  was the actual reason NNUE was chosen as Pet Dragon's neural option
  in the first place (D10/D11).
- **Policy-guided move ordering** — a smaller-scale hybrid: keep
  classical alpha-beta and eval (HCE or NNUE), add a small network
  just to improve move ordering at high-value nodes. The only option
  here actually compatible with Pet Dragon's existing architecture
  without a rewrite. Not ruled out on architectural grounds, but it's a
  search technique needing training data, not an eval technique — same
  data-volume dependency NNUE has, so it inherits D61's shelving logic
  rather than being a way around it. Noted as the one item on this
  list that could be revisited independently of NNUE's status, if ever
  training data stops being the constraint.

Conclusion given to Gokul: none of these are a practical third path
alongside HCE/NNUE for Pet Dragon right now — each either needs an
architecture Pet Dragon doesn't have (GPU, MCTS) or training data it
doesn't have (all the neural options), consistent with and not
contradicting D61's NNUE-shelving decision.

## D65 — King-Relative Term Design: Minor-Piece Shelter Over Full PST Buckets (Session 83)

**Context:** D63's item 3 candidate ("King-relative PST bucketing")
was deliberately left as the lowest-confidence entry on that list,
flagged as needing design thought before implementation rather than a
straightforward pick-up. Gokul asked to discuss the design before
implementing.

**The actual gap, once examined closely:** it isn't that `eval/` lacks
any king-relative piece scoring — `king_safety.rs`'s `attacker_weight`
already scores enemy pieces attacking near a king (tropism, from the
attacking side). The real gap is narrower: nothing scores the mirror
case, our own minor pieces staying close to our own king as defenders
(clustering, from the defensive side).

**Three options were weighed:**
- **Option A** — flat MG-only bonus per own knight/bishop sitting in
  the same king-file-third zone (queenside/center/kingside, 3 zones)
  as our own king. ~2 new parameters. Cheapest, easiest to hand-verify
  against pre-existing tests, most clearly non-overlapping with any
  existing term.
- **Option B** — a fuller 3-zone table scored across more piece kinds
  (knights/bishops/rooks/queen), ~10-15 parameters. Richer, but rooks/
  queen wanting the zone opposite our own king already overlaps with
  `open_lines.rs`'s rook-activity terms — risk of two terms both
  nudging the same underlying effect, hard to disentangle without
  actual tuning-data validation.
- **Option C** — mirror of A but scoring proximity to the *enemy*
  king's zone (attacking side) for rooks/queen/knights. Highest
  double-counting risk of the three: this is the closest in spirit to
  what `attacker_weight` already measures (piece activity near the
  enemy king), just from static square proximity instead of actual
  attack-square coverage.

**Decision: Option A.** Smallest parameter count, most defensible as a
genuinely non-overlapping effect, cheapest to Texel-tune, and the
easiest to hand-verify wasn't accidentally double-scoring something
`king_safety.rs` or `open_lines.rs` already captures. B and C are not
ruled out permanently — they're deferred pending real tuning-data
evidence that A alone under-fits, which isn't available from static
analysis alone.

**Implementation:** `KNIGHT_NEAR_OWN_KING_BONUS`/
`BISHOP_NEAR_OWN_KING_BONUS` in `eval/king_safety.rs` (values `8`/`6`,
hand-picked, not yet Texel-tuned), full Texel-chain wiring in the same
submission, CI-confirmed green on the first submission
(`logs_80664145490.zip`). See `ROADMAP.md`'s Phase 24 item 3 entry and
`SESSION_LOG.md`'s Session 83 entry for the full implementation
summary.

## D66 — Full Texel Re-Tuning Chosen as Next Strength Lever (Session 83)

**Context:** Gokul set a new broad goal — make Pet Dragon "lethal,
precisive, scary, brutal" regardless of game phase — and asked Claude
to decide the right first move rather than picking for him.

**Options weighed:** (1) full Texel re-tuning pass, (2) endgame
conversion technique, (3) further search depth/efficiency tuning, (4)
un-shelving NNUE (D61).

**Decision: (1), full Texel re-tuning.** Reasoning:
- A mistuned evaluation constant is wrong in every phase of the game
  equally — this is the one lever that's structurally "irrespective of
  opening/middlegame/endgame" by construction, not just in aspiration.
- The hard infrastructure already exists and is proven
  (`texel_gen.rs`/`texel_tune.rs`/the `.yml` workflows, all built and
  validated in Phase 14) — this is a re-run + apply, not new
  engineering.
- It's genuinely stale in two ways, so this isn't "re-run something
  that's already fine": every eval term added since Session 56's one
  tuning pass (including this session's 3 new D63 terms) ships
  hand-picked and untuned, and Phase 14.2's original dataset has long
  since expired (30-day artifact retention).
- (2) and (3) are narrower and harder to scope without first knowing
  where the current eval/search is actually leaving Elo on the table —
  a full re-tune is a reasonable prerequisite diagnostic for either,
  not a competing alternative to them. (4) remains a real structural
  investment per D58, not a quick lever.

**Not a permanent ranking** — if a re-tuned eval doesn't move the
needle, (2)/(3) become the natural next investigation, informed by
where the re-tune's residual errors concentrate.

**Status:** scoped as Phase 25 in `ROADMAP.md`, not started — next
concrete action is Gokul triggering `texel_gen.yml` to generate a
fresh dataset (mobile-friendly, `workflow_dispatch` only, matching
every other training workflow in this repo).

## D67 — Phase 23.4: Bucketed Structural Opening Statistics — Full Design Chosen (Session 84)

D62 held 23.4 pending an exact-vs-bucketed design pick. Chosen:
**bucketed by structural features (Path B).** Exact-position book
(Path A) rejected — with self-play drawing from a 2.16M-position
keyspace on sequentially incrementing seeds, a real game would need
to draw from a small *reused* seed pool for an exact-position book to
ever hit, and that's a policy change to how real games get their
starting position (currently a fresh random seed every game), not a
23.4-scoped decision. Not taken.

### Bucket key (two-tier, so v1 ships small and v2 extends the same
### aggregation path rather than redesigning it)

**Tier 1 (v1 — build this first):**
```
BucketKey = (rook_files: sorted 2-of-8, knight_files: sorted 2-of-8)
```
Only the file each rook/knight *started* on, independent of whether
it started rank 1 or rank 2. Estimated at the time of this design
(WRONG — corrected empirically in D71, Session 84, once real data
existed — see D71 for the actual bucket count and why this estimate
undercounted) as `C(8,2) × C(6,2)` = 28 × 15 = 420 buckets. Chosen
because rook/knight file placement drives the two things that matter
most for early-game plans in a variant with open lines from move 1
(VARIANT_ARCHITECTURE.md) — open/semi-open file control and knight
outpost potential — while staying (it was believed) small enough that
a few thousand self-play games actually populate most buckets with
more than a handful of samples each, unlike the 2.16M-keyspace problem
Path A had. The reasoning for *why* file-based bucketing is the right
axis still holds — only the specific count was wrong.

**Tier 2 (future extension, not v1):**
```
BucketKey += (bishop_files: sorted 2-of-remaining-4,
              queen_file: 1-of-remaining-2,
              rank_mask: 7-bit, one bit per non-pawn/non-king piece,
                         1 = started rank 2, 0 = started rank 1)
```
Adds ~6 × 2 × 128 ≈ 1500× more buckets. Do not build this until Tier 1
buckets show enough per-bucket sample depth in practice that splitting
further wouldn't just re-create the sparsity problem — this is an
empirical call to make once real data exists, not a decision to make
now.

### Data pipeline

1. **`selfplay.rs` — new output stream.** Current output
   (`stm_features | nstm_features | search_eval_cp | game_result`) has
   no starting-position identity or root move (D62 finding). Add a
   second, opt-in output stream:
   `starting_seed | rook_files | knight_files | root_move_uci |
   game_result`. Computed once per game at position setup — cheap.
   Existing NNUE training-row output is unchanged; this is an
   additive stream, not a replacement, so Phase 25/NNUE data
   generation isn't affected by this work.
2. **Aggregation script** (new, offline — runs where `texel_tune.rs`
   currently runs, same CI pattern). Groups rows by `BucketKey`,
   tallies win/draw/loss per candidate root move within each bucket.
   **Minimum-sample threshold: 30 games per (bucket, root move) pair**
   before that entry is trusted (standard small-sample floor) — below
   threshold, the entry is omitted rather than shipped with a
   misleadingly confident win rate.
3. **Existing self-play data cannot be reused.** Every prior
   self-play run (Phase 14 onward) used the old output format with no
   starting-position identity recorded — this needs a fresh generation
   pass with the new stream, not a re-aggregation of existing
   artifacts. Real cost to budget when this gets picked up.

### Runtime deployment

WASM/browser play needs the bucket-stats table client-side. Chosen:
**bake it into the binary at build time** as a generated
`src/opening_stats.rs` (a static table, same shape as how magic
bitboard constants are generated/committed) produced by the offline
aggregation script and committed to the repo — not fetched at runtime.
420 buckets × a handful of root-move entries each is small; a
runtime fetch would add load-time latency and a network dependency
for something that fits in the binary for free. Re-generate and
re-commit this file whenever a new self-play data pass accumulates
enough volume to matter — same "downloadable, replace the file"
workflow already used for Texel-tuned weights.

### Usage mechanism

**Not** an auto-play opening book (engine blindly plays the top bucket
move). Chosen: **root-only move-ordering bias** — if the current
position's bucket has a trusted entry (past the 30-game threshold)
favoring a specific root move, nudge that move earlier in root move
ordering / apply a small eval bonus at the root, but let full search
still evaluate and can still override it. This degrades gracefully
(empty or thin bucket ⇒ zero effect, falls straight through to normal
search) rather than risking a bad hard-coded book move in a variant
with no established opening theory to validate against. Same "one
more capped signal, not a replacement mechanism" shape already used
for the Phase 23.6 extension family (D59) and Tension Field's proposed
search hook.

### Status

**Designed, not started.** Queued behind Phase 25 (full Texel
re-tune) — no code changes yet. Concrete build order for whichever
session picks this up: (1) `selfplay.rs` new output stream, (2) run a
fresh self-play generation pass with it, (3) aggregation script, (4)
generate + commit `src/opening_stats.rs`, (5) wire root-move-ordering
bias into `ordering.rs`, (6) unit test against a few known buckets by
hand before trusting the table. Resume by re-reading this entry, not
by re-deciding exact-vs-bucketed — that question is closed.

## D68 — Threats Evaluation Term (Hanging/Undefended Pieces): Fourth HCE Gap Identified, Not Implemented (Session 84)

Gokul asked whether the engine has anything scoring "pieces defending
each other" / board-wide support relationships. It does not — checked
against `ENGINE_ARCHITECTURE.md`'s current term list (material, PST,
mobility, pawn structure, king safety, open lines, tempo) plus a grep
of `eval/*.rs`. The only existing piece-supports-piece logic is
`open_lines.rs`'s connected-rooks/battery detection — narrow, rook/
file-specific, not a general defended-vs-hanging signal.

**This is not the same proposal as the uploaded "coordination graph"
idea** (that one was generic and speculative, no prior-art citation).
This is Stockfish's established **Threats** evaluation term
(`threats.cpp` in Stockfish's `evaluate.cpp` pipeline, GPL v3, same
family already credited for Pet Dragon's material/PST baseline per
`PROJECT_CONTEXT.md`) — hanging-piece penalty, weak-queen-protection
penalty, minor/rook threat bonus, restricted-piece penalty. Since it's
a known-working term from an already-credited GPL v3 source rather
than an unvalidated idea, it's lower-risk than either Tension Field or
the coordination-graph pitch, and belongs in the same D63-style
gap-audit lineage rather than as a new speculative feature.

**Scope, matching D63's three items:**
- New `eval/threats.rs`, MG-scoped like `king_safety.rs`'s pattern
  (existing convention: `* phase / 24` in this repo, not the tapered
  `s()`/`taper()` pipeline `pawns.rs` uses — pick per D65/D63's
  precedent, whichever the implementing session confirms is still the
  house style by re-reading a current file, don't assume from this
  note).
- **Reuse existing attack bitboards** — `mobility.rs` and
  `king_safety.rs` already compute per-square attacker sets; this must
  reuse those rather than adding a second full attacker-enumeration
  pass (same reuse discipline the uploaded Tension Field spec called
  out, and the same NPS-regression risk if skipped).
- **Double-counting risk, flagged in advance this time** (Phase 24
  items 1-3 found their overlap risk mid-implementation or via
  hand-check; doing it now instead): hanging-piece detection overlaps
  conceptually with `mobility.rs`'s attack counts and with
  `king_safety.rs`'s attacker-weight tropism term. Needs the same
  hand-verification against existing test FENs Phase 24 items used
  before trusting it's additive signal — don't skip that step just
  because the term itself is well-precedented.
- Full Texel-chain wiring in the same submission as the eval change
  (features/predict/weights/weights_f64/predict_f64/texel_diag/
  texel_tune) — apply Phase 24 item 1's lesson directly, don't
  discover the missing sites via failed CI.

**Status:** documented candidate, not implemented, not scheduled.
Queued behind Phase 25 same as D67 — if picked up before Phase 25
closes, its new eval term would also need folding into whatever
Texel dataset generation happens for Phase 25, same sequencing
concern raised for Tension Field. Logged as a Phase 24 addendum in
`ROADMAP.md` rather than reopening Phase 24's "fully closed out"
status — Phase 24 items 1-3 stay closed; this is a new, separate
candidate found by a different question, not an unfinished Phase 24
item.

## D69 — Phase 25 Complete: Full Texel Re-Tune Applied (Session 84)

Applied the Phase 25 re-tune to production code. Source: `texel_tune.yml`
run against 62,125 fresh self-play positions (`texel_gen.yml`,
seed_start=15000, n=3500), `epochs=75`, `weight_decay=0.03`. Sanity-
checked two ways before applying: (1) a 15-epoch/decay=0 run first to
confirm the pipeline itself was healthy (loss monotonically decreasing,
no NaN/divergence) before spending the longer run; (2) `texel_diag.yml`
run against the final 75-epoch result — all 10 sanity cases (5 random
Pet Dragon starts symmetric, up/down material swings correctly signed,
K+P vs K endgames correctly signed) passed clean.

**Files touched:** `eval/material.rs`, `eval/tables.rs`,
`eval/mobility.rs`, `eval/pawns.rs`, `eval/king_safety.rs`,
`eval/open_lines.rs`, `eval/mod.rs`, `texel/weights.rs`. Every field
cross-verified programmatically (not just by eye) to match exactly
between each eval file and `TunableWeights::default()` — dual-sync
confirmed, not assumed.

**One tuned result rejected outright, not applied — this is the
important part of this decision.** The tuner returned
`KNIGHT_NEAR_OWN_KING_BONUS = -1` and `BISHOP_NEAR_OWN_KING_BONUS = -3`
(Phase 24 item 3, its first-ever tune). Both existing
`king_safety.rs` tests encode a validated invariant — sheltering your
own minors near your own king should help, not hurt —
(`test_minor_piece_shelter_knight_same_zone_vs_different` hard-asserts
the constant is positive; `test_king_safety_rewards_minor_piece_shelter`
checks the shelter ordering directly) and a negative value breaks both.
Unlike `bishop_pair`/`rook_on_seventh` in material.rs and open_lines.rs
(also first/early real tunes, also initially sign-flipped in the
15-epoch/no-decay sanity run), this pair did NOT recover under
`weight_decay=0.03` across the full 75-epoch run — treated as this
term's first tune landing on noise rather than signal, most likely
because "friendly minor in the exact same king-file-zone as the king"
is a narrow, rare condition even across 62,125 samples. **Kept at the
Phase 24 hand-picked defaults (`8`/`6`) in both `king_safety.rs` and
`weights.rs`.** This is the correct call per house rules — a tuned
result that inverts a validated sanity check gets rejected, not
shipped, and the tests are not the thing that gets changed to
accommodate it.

**Watch items — not blocking, but worth re-checking once more
self-play data accumulates (next natural re-tune, not a scheduled
task):**
- `rook_on_seventh` MG flipped negative (`s(8,47)→s(-14,39)`). Verified
  this doesn't break `test_rook_on_seventh` — that test's position has
  phase=2 (near-pure endgame taper weighting), so the still-strongly-
  positive EG value dominates — but the MG sign flip itself is
  unconfirmed as signal vs. noise from one tune.
- `pawn_storm_bonus` (Phase 24 item 2, its first tune) came out
  non-monotonic (`[14,10,46,13,14,6,1,-5]` vs. the smooth hand-picked
  `[40,32,24,16,8,0,0,0]`) — index 2 sits well above its neighbours.
  Existing tests only check the distance-3-vs-6 endpoints (still
  correctly ordered, 13 > 1), so this shipped, but the middle bump is
  unexplained.
- `bishop_pair` (`s(18,29)→s(2,15)`) and `battery_bishop_queen`
  (`s(15,5)→s(33,19)`) both moved substantially from their Phase 14/
  hand-picked origins. Both stayed positive and passed `texel_diag`, so
  applied, but flagged as larger-than-typical swings worth a second
  look with more data.

**Tempo bumped `20→24`** — required widening
`test_evaluate_start_pos_near_zero`'s bound (`≤20→≤30`) since that
bound was tightly coupled to the old exact tempo value; the widened
bound still enforces the same "near zero, tempo only" intent.

**Next natural trigger for re-tuning:** whenever self-play data volume
meaningfully increases again (e.g. picking up D67's opening-stats data
collection, or any future Phase pass that generates fresh self-play
data) — not a scheduled task on its own.

## D70 — CI Caught a Real Test Break in D69's Application: ENEMY_KING_DIST_EG/OWN_KING_DIST_EG Reverted (Session 84)

Gokul ran CI after committing D69's application. `test_passed_pawn_bonus`
failed: `-24` instead of the expected `>0`. Root cause traced exactly —
not guessed: that test's position (White pawn e5, White king e1, Black
king e8) has Black's king sitting exactly on the pawn's promotion
square while White's king is 7 squares away. D69 had applied Phase 25's
tuned `ENEMY_KING_DIST_EG`/`OWN_KING_DIST_EG` (`1→3`, a 3x jump, D63
item 1's first-ever tune), which cubes through `own_dist × advancement`
in `passed_pawn_king_distance_bonus()` and swings this specific
position to `-84` for that term alone, overwhelming the base passed-pawn
bonus (`77 - 17 - 84 = -24`, matching the CI output exactly).

**This should have been caught before shipping, not after.** D69's
per-field verification checked that eval and `weights.rs` matched each
other correctly (dual-sync), and checked several individual test cases
by hand — but `ENEMY_KING_DIST_EG`/`OWN_KING_DIST_EG` specifically was
reasoned about too quickly, on the assumption that a positive-staying
weight on a term that was already accounted for in the passed-pawn
bonus couldn't flip the total sign. That reasoning didn't actually
compute the specific test FEN's numbers, and turned out wrong. No
Rust toolchain is available in this environment to compile and run
`cargo test` directly, which is exactly why this kind of arithmetic
needs to be walked through explicitly per-test rather than pattern-
matched from a "this term stayed positive, should be fine" impression
— the lesson for future sessions applying a Texel result: every
existing test whose FEN is even plausibly close to an edge case for a
changed term needs the actual number worked out, not just a
directional sanity check.

**Fix — same rejection category as D69's knight/bishop-near-king
call:** `ENEMY_KING_DIST_EG`/`OWN_KING_DIST_EG` reverted to the Phase 24
hand-picked default (`1`/`1`) in both `eval/pawns.rs` and
`texel/weights.rs`. This is D63 item 1's first-ever tune, on a
compound/product feature (`king_distance × rank_advancement`) —
inherently sparser and more overfit-prone than a simple per-rank
bucket, the same risk profile that made the knight/bishop-near-king
result untrustworthy. Recomputed `test_passed_pawn_bonus` by hand with
the reverted value: `77 - 17 - 28 = 32 > 0` — passes, and matches the
term's pre-Phase-25 (already-known-passing) behavior exactly, so this
isn't a new risk, it's a restoration.

**Updated watch-item list (supersedes D69's):** `rook_on_seventh` MG
sign, `pawn_storm_bonus` non-monotonicity, `bishop_pair`/
`battery_bishop_queen` large swings — unchanged from D69 — **plus**
`enemy_king_dist_eg`/`own_king_dist_eg` now also held at hand-picked
defaults alongside `knight_near_own_king`/`bishop_near_own_king`, for
the same reason. All four "held back" terms are first-tune, sparse/
compound features — a reasonable pattern to watch for specifically
next time: first-time tunes of compound or narrow-condition features
deserve extra scrutiny before shipping, not just a sign check.

## D71 — Phase 23.4 Step 2/3: Bucket Count Corrected Empirically; Aggregator Built (Session 84)

**D67's "420 buckets" estimate was wrong — corrected here with real
data.** That estimate assumed rook files and knight files were drawn
from disjoint pools (rooks "use up" 2 of 8 files, knights pick from
the remaining 6), i.e. that a *file*, once touched by a rook, couldn't
also host a knight. False: only *squares* are exclusive in Pet
Dragon's setup, not files — a rook and a knight (or both rooks) can
share a file across its two ranks. First real data run (Session 84,
12,000 games, `seed_start=100000`, `15×800`) found **1,054 distinct
(rook_files, knight_files) buckets already hit in just 12,000 games**,
2.5x the wrong estimate, with no sign of plateauing yet. The
file-based-bucketing *reasoning* itself (D67) still holds — file
placement is still the right axis for open-line/outpost dynamics —
only the count was wrong. No design change needed, just corrected
expectations: this key space is meaningfully sparser than planned, so
useful table entries will take longer to accumulate than D67 assumed.

**Consequence, checked directly, not assumed:** with the same 12,000
games, 8,130 distinct (bucket, root-move) pairs exist, and **zero**
clear D67's 30-sample threshold (max observed: 16). Expected given the
corrected bucket count, not a bug — flagged to Gokul before building
the aggregator so the first real run's near-empty output table isn't
mistaken for something broken.

**Aggregator built** (D67 step 3): `src/bin/aggregate_opening_stats.rs`
+ `.github/workflows/aggregate_opening_stats.yml`, following the same
pattern as `texel_tune.rs`/`.yml` — accepts one or more opening-stats
data files (local paths or URLs, same `data_paths`/`data_urls` dual
input style), groups by `(sorted rook_files, sorted knight_files)`,
then by root move within each bucket, and for each bucket keeps only
the single best-win-rate move that clears the 30-sample threshold
(matching D67's usage design — root-only move-ordering bias needs one
favored move per bucket, not a full ranking). Buckets with no
qualifying move are omitted, not zero-filled — an absent bucket and a
"we checked and nothing stood out" bucket need to stay distinguishable
so the ordering hook (D67 step 5) can tell "no data" from "data says
no edge here." Outputs `src/opening_stats.rs`: a static, sorted-by-key
array (12-bit packed key: 3 bits each for rook_file_0, rook_file_1,
knight_file_0, knight_file_1) with a `lookup(key) -> Option<&Entry>`
binary search — chosen over a `phf` compile-time map to avoid adding a
new dependency with unconfirmed WASM compatibility, matching this
project's existing zero-added-dependency pattern for generated tables.

**Status:** aggregator built and ready, not yet run against real data
(nothing clears the threshold yet with only 12,000 games — running it
now would just generate an empty `src/opening_stats.rs`, technically
correct but not worth committing). Next: Gokul runs more
`selfplay.yml` batches with fresh `seed_start` values, concatenating
each new `opening_data_combined.txt` with prior ones (12,000 games
already in hand from `seed100000-15x800`) until a meaningful number of
(bucket, move) pairs clear 30 samples, then run the aggregator. No
fixed target game count set — this is genuinely open-ended
accumulation, same as the NNUE self-play data's growth pattern; check
back periodically rather than committing to one large number now.

## D72 — Phase 23.4 Steps 2 (cont.)/5: Real Aggregator Run + ordering.rs Wired, One Panic Bug Caught Pre-Ship (Session 84)

**Accumulated a second data batch and ran the aggregator for real.**
`seed120000-15×1200` (18,000 games) added to the existing
`seed100000-15×800` (12,000 games) — 30,000 games total, no seed
overlap, no data loss. Bucket count barely grew (1,054 → 1,068,
effectively plateaued — D71's corrected estimate holds up), but
growth in *qualifying* (bucket, move) pairs was far slower than bucket
growth: 2.5x the games produced only 2 pairs clearing the 30-sample
threshold (up from 0). The real sparsity driver isn't the bucket count
— it's that each bucket splits across many plausible root moves, so
per-(bucket, move) sample depth grows much slower than per-bucket
depth. Getting broad table coverage will need on the order of hundreds
of thousands of games, not tens of thousands — flagged to Gokul, who
chose to run the aggregator now on the thin real result and iterate
later rather than wait.

Ran `aggregate_opening_stats.yml` against both batches (`data_run_id`
of both `selfplay.yml` runs). Output — 2 entries, both mapping to the
same move:
```
bucket (rook a,d / knight b,h) -> a2a7, win_rate 0.9677, n=31
bucket (rook a,g / knight b,h) -> a2a7, win_rate 0.9000, n=30
```
Internally consistent, not noise-shaped: both qualifying buckets have
a rook on the a-file, which is exactly the precondition for `a2a7`
(an open-file rook lift) to be legal at all. First real evidence the
full pipeline — parse, bucket, tally, threshold, pack, binary search —
is correct end to end, not just structurally plausible.

**Wired into `search/ordering.rs` (D67 step 5).** Additive
`OPENING_STATS_BONUS = 150_000` on top of a move's normal score —
below `COUNTERMOVE_SCORE` (200,000) so a real countermove signal still
wins ties, and negligible next to `TT_MOVE_SCORE`/
`WINNING_CAPTURE_BASE` (millions), so it can only meaningfully move an
otherwise-ordinary quiet move, never override a real tactical signal —
matches D67's "nudge, don't force" usage design exactly.

**Gate: `ply == 0 && pos.fullmove_number == 1 && side_to_move ==
White`, both conditions required, not just one.** `ply == 0` alone
would fire on *every* `go` command regardless of how far into a game
the position already is (`score_moves` runs at every node, and `ply`
is search depth from wherever `go` was called, not moves-since-game-
start) — the bucket key is defined by the game's ORIGINAL rook/knight
files, so applying it to a position whose pieces have already moved
would silently apply the wrong signal, or worse, could coincidentally
collide with an unrelated real bucket. The `fullmove_number ==
1 && White to move` check is what actually pins this to "zero moves,
real or hypothetical, played since the random setup."

**Caught a real panic bug before shipping, not after.** The
file-extraction helper (`sorted_files`, mirrors `selfplay.rs`'s helper
of the same name) originally hard-panicked on anything other than
exactly 2 bits set — correct for `selfplay.rs`, which only ever sees
`Position::generate_with_seed`'s guaranteed-fresh output (exactly 2
rooks/2 knights by construction). Wrong for `ordering.rs`: it sees
arbitrary UCI-supplied positions, and an *existing* test FEN in the
same file (`test_capture_before_quiet`,
`"4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"` — zero rooks, zero knights)
matches the gate's `fullmove_number==1, White to move` condition
exactly. Checked this against the actual test suite before shipping
rather than assuming the gate was narrow enough — it wasn't, and this
would have crashed the engine on any real analysis/custom position
with fullmove 1 and White to move, not just this one test. Fixed:
`sorted_files` returns `Option<[u8; 2]>`, `None` on a mismatch, treated
identically to a genuine table miss (graceful fallthrough to normal
scoring) rather than a program-invariant violation. Re-verified every
existing `ordering.rs` test by hand against the fixed version — none
change behavior (`Position::start_pos()`'s standard-chess rook/knight
files pack to key 462, not in the 2-entry table, so every test using
`start_pos()` at ply 0 gets a harmless miss; `test_capture_before_quiet`
now gets `None` instead of panicking, matching its pre-existing,
already-passing expectation).

**Known, accepted duplication:** `sorted_files` now exists in three
places (`selfplay.rs`, `aggregate_opening_stats.rs`'s `parse_file_pair`,
`ordering.rs`) with slightly different panic-vs-Option behavior for
good reason in each (explained above). Not deduplicated into a shared
lib function this session — would mean reopening the already-committed,
CI-green `selfplay.rs` for a small refactor, not worth the churn/risk
right now. Flagged here so a future session doesn't "fix" the
duplication without first re-reading why the panic behavior
legitimately differs between call sites.

**Status:** step 5 done and CI-pending (not yet confirmed committed).
Step 6 (hand-verification against real entries through actual
`score_moves()`, not just the generated file's own structural tests)
still open — worth doing as a follow-up now that real entries exist to
verify against. Step 4 (accumulation) continues in the background,
open-ended, no fixed target.
