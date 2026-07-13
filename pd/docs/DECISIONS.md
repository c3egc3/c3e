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
