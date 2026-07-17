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
