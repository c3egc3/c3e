# Mythical Dragon — Decisions Log

> **Doc 2 of 5** — companion docs: [Architecture.md](./Architecture.md) · [Roadmap.md](./Roadmap.md) · [SessionLog.md](./SessionLog.md) · [CLAUDE_PROJECT_INSTRUCTIONS.md](./CLAUDE_PROJECT_INSTRUCTIONS.md)

Append-only log of decisions and *why*. Architecture.md says what the
system is; this file says why it's that way and not some other way.

## How to add a new decision
- Never renumber or delete past entries, even if superseded — add a new
  entry that supersedes it and cross-reference the old ID.
- Format: `D<session>.<n>`.
- Appended as a delta (find the last line, replace with itself + the new
  block) — never as a full file rewrite.

---

## Session 0 — 2026-07-23

**D0.1 — Language: pure Python, no Rust, no PyO3**
Chosen deliberately for iteration speed on the claims/tiered-comparison
*logic* during the phase where the open question is "does the reasoning
make sense," not "how many nodes/sec." Revisit only if Phase 6 search
integration proves Python's speed ceiling is the actual bottleneck, not
before — see Architecture §5.

**D0.2 — No NNUE, no neural network component**
Evaluation is claims-based and explicitly non-learned. This is a design
constraint, not a temporary placeholder.

**D0.3 — No Texel tuning, ever, by construction**
There are no fitted weights anywhere in the design (Architecture §2). This
isn't a policy choice to resist tuning — there is structurally nothing to
tune. If a future session adds a tunable constant, that's a design
violation to flag here, not a normal implementation choice.

**D0.4 — No SPRT / OpenBench infrastructure**
Validation uses calibration logging + lightweight sanity games instead
(Architecture §6). This is a genuinely different empirical posture, not
SPRT under a different name — no optimization loop exists to feed.

**D0.5 — No strength/Elo claims until actually measured**
Same honest-framing principle used in the prior `opy` project, ported
over. No public or internal doc states a strength claim without a
concrete, describable measurement behind it.

**D0.6 — License: undecided**
No NNUE/Stockfish dependency this time, so nothing forces GPLv3. Project
director wants to decide later. No license file exists yet — do not
assume MIT, Apache-2.0, or any other license in code headers or repo
metadata until this is explicitly resolved and logged as a superseding
decision.

**D0.7 — Board representation & move generation: `python-chess` library**
Used as-is rather than hand-rolled, so early sessions test the actual
architecture (claims, resolution) instead of re-solving a well-solved
problem (legal move generation) from scratch.

**D0.8 — All coding and testing is performed by Claude, inside Claude's
sandboxed execution environment, during chat sessions**
Code is written and actually run (tests executed, output inspected)
before being presented — never written from memory and presented as
working without having been run. Project director has no local dev
environment and does not write or run code themselves.

**D0.9 — No CI/GitHub Actions until a concrete need justifies it**
Unlike `opy`, this project does not stand up GitHub Actions at kickoff.
Infrastructure is added when there's working code worth protecting from
regressions, not before. Avoids over-building process before there's a
project to support.

**D0.10 — Delta-based update protocol**
Changes to existing files (docs or code) are delivered as find/replace
deltas; brand-new files are delivered in full. Files are presented to the
project director with the exact target repo and path; the director
uploads manually via GitHub's mobile web interface. Claude has no GitHub
write access.

**D0.11 — Trigger words: "Go" and "Continue"**
Defined precisely in CLAUDE_PROJECT_INSTRUCTIONS.md. Not redefined here to
avoid two sources of truth.

**D0.12 — Every session starts by re-fetching actual current repo state,
not by trusting SessionLog.md's claims uncritically**
Claude has no memory across chat sessions. At the start of any session
(especially on "Go"/"Continue"), Claude re-fetches the real content of
both repos via the sandbox before doing anything else, and treats
SessionLog.md as a claimed history to verify against reality, not as
ground truth on its own. This directly addresses a real gap noticed in
this project's sibling folder (`opy`): session logs describing completed,
verified work exist there with no independent way to confirm they're
accurate outside of trusting the text itself.

**D0.13 — Docs scope: only the `md/docs/` folder of `c3egc3/c3e` is used**
This project does not read, write, or reference the other five project
folders in that repo (`PyR+`, `RD`, `fpy`, `opy`, `pd`). They're prior,
unrelated attempts and out of scope here.

**D0.14 — Adopt a 5-document control system**
`Architecture.md`, `Decisions.md`, `Roadmap.md`, `SessionLog.md` (this
set) plus `CLAUDE_PROJECT_INSTRUCTIONS.md` governing cross-session
continuity, trigger words, and the delta protocol.

---

## Session 1 — 2026-07-23

**D1.1 — Material-only leaf eval (Phase 1) is scoped outside D0.3's
constraint, not an exception to it**
`engine/evaluate.py`'s placeholder uses the standard conventional piece
values (pawn=1, knight=3, bishop=3, rook=5, queen=9). This is flagged here
per Architecture §2 / D0.3's instruction to flag any numeric constant
before it ships: these values are (a) not fitted or tuned by any process,
just the universally standard scale, and (b) not part of claim generation
at all — this module doesn't touch the `Claim` object or any claim
generator. D0.3's constraint is about magnitudes inside claim generators
specifically. This placeholder is explicit, temporary scaffolding for the
search skeleton (Roadmap Phase 1) and is expected to be superseded, not
extended, once Phase 2+ claim generators exist. Recorded so a future
session doesn't mistake this for quietly-introduced tuned weights.
