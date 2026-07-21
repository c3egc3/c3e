# FastPy — Session Log

Append-only. One entry per session. Most recent at top.

## Session 66 — SEE wired into sort_moves()/quiescence() (D-109): mixed benchmark results, shipped with honest reasoning after isolating the one real regression
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/tests/test_phase4.py` changed. Docs updated:
`docs/DECISIONS.md` (D-109), `docs/ROADMAP.md`, this entry.

**Baseline check first (per the D-61/D-65 PROCESS rule):** the real
remote `main` still only has Session 64's work (299 tests) — Session 65
hadn't been committed yet at the time this session started. Continued
from this conversation's own working copy of Session 65's state (318
tests, SEE built but not wired), confirmed still correct, rather than
building on the stale remote.

**Task:** Session 65's queued follow-up — wire `static_exchange_eval()`
(D-108) into `sort_moves()` (capture ordering) and `quiescence()` (SEE
pruning).

**A real performance bug caught during this session's own benchmarking:**
`sort_moves()`'s selection sort recomputed each move's score inside the
inner loop — O(n) redundant calls per move, fine for cheap MVV-LVA, a
measured ~2x NPS regression once captures called SEE. Fixed by
precomputing every score once into a parallel array before sorting.

**Benchmarked across 5 positions, results reported honestly:** 3 clean
wins (fewer nodes AND faster), 1 mild wall-clock regression, 1 real
regression (more nodes, slower, AND a different bestmove chosen). The
concerning case (Italian Game) was isolated before shipping — built an
ordering-only variant (which can only reorder moves, never skip any) and
a pruning-only variant separately; BOTH independently produced the same
divergent result as the combined version, proving it's ordinary
alpha-beta reordering sensitivity, not a `quiescence()` pruning
correctness bug (a real concern given `quiescence()`'s pre-existing gap:
no check-evasion handling at all).

**Also caught and fixed during this investigation:** an initial
benchmark run showed an alarming 41-cp sign flip, traced to the test
HARNESS racing `quit` against the search's own completion — the exact
same class of issue Session 64 already found. Fixed the harness to wait
for `bestmove` before quitting; the alarming result resolved into an
ordinary close score once fixed.

**Decision to ship, discussed with and agreed by Gokul rather than
decided unilaterally:** SEE-based capture ordering is standard practice
in virtually every strong engine — the real risk was a logic bug, not a
node-count loss on hand-picked positions, and that risk was specifically
investigated and ruled out (see the isolation above), not just assumed
away. `static_exchange_eval()`'s own correctness was already validated
separately and thoroughly in D-108. A 5-position sample is too small to
give a clean verdict on playing strength either way; genuine validation
would need large-scale self-play, not available in this environment —
flagged as a future option, not treated as a blocker for shipping a
standard, well-understood technique.

**Verification:** full suite `fastpy-engine` 318/318 (3 existing
`TestSortMoves` tests updated to call the new `r._sort_moves_py()`
mirror, since `sort_moves()` now transitively touches
`static_exchange_eval()`'s bare array and can no longer be called
directly under plain Python — same limitation class as
`find_best_move()`). `fastpy check` clean. Native binary rebuilt and
smoke-tested (book hit, perft depth-1, off-book search all correct).

**What's next:** no specific candidate queued for Session 67 — options
noted (self-play infrastructure, the deferred MVV-LVA SEE-tie-break) but
none forced; pick a fresh area if neither seems worth it, same as how
Session 65 was chosen.

## Session 65 — Static Exchange Evaluation (D-108): built and fully tested as a standalone utility, deliberately not yet wired into search
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/tests/test_move_gen.py` changed. Docs updated:
`docs/DECISIONS.md` (D-108), `docs/ROADMAP.md`, this entry.

**Baseline check first (per the D-61/D-65 PROCESS rule):** pulled fresh
`main` for both repos. `fastpy` 386/386, `fastpy-engine` 305/305 —
matches Session 64's logged counts.

**Task:** no specific candidate was queued after D-103's arc closed at
the end of Session 64 — picked Static Exchange Evaluation as a
genuinely fresh area (evaluation/move-ordering) rather than defaulting
to more repetition/book/search-timing work.

**What shipped:** `static_exchange_eval()` plus three helpers
(`attackers_to()`, `piece_value_at_sq()`, `least_valuable_attacker_
square()`) implementing the classic SEE "swap list" algorithm. Scoped
deliberately the same way `msb()` was in Session 27/D-62: built and
fully tested in isolation, NOT wired into `sort_moves()`/`quiescence()`
this session — that's a different, larger unit of work needing proper
before/after node-count validation, queued as Session 66.

**Two real bugs caught during this session's own verification, before
any test was committed:** (1) the forward loop computed a ply's gain
value BEFORE confirming an attacker actually existed to produce it —
exposed by the simplest possible case, an undefended capture, which
came out corrupted until the check was moved to happen first; (2) a
promoting capture used the moving pawn's value instead of the promoted
piece's value for what's available to be recaptured. Both caught by
hand-verifying textbook exchange values (undefended capture, a
queen-takes-defended-pawn blunder, a 3-ply exchange) against the code's
actual output before writing a single committed test — full writeup
with the hand-derivation in D-108.

**Verification:** 13 new tests (`TestStaticExchangeEvaluation` in
`test_move_gen.py`) covering undefended/forced/declined recaptures, a
3-ply exchange, en passant, both promoting-capture cases, X-ray
attacker revelation, and cross-checks against `is_sq_attacked()`/
`piece_at_square()`. Full suite: `fastpy-engine` 318/318 (305 + 13
new). `fastpy check` clean. Native binary rebuilt via
`training/build_uci_engine.py`, smoke-tested — byte-identical behavior
to pre-session, confirming zero impact on actual play since SEE isn't
called from any search path yet. One unrelated pre-existing flaky
subprocess-timing test failed under full-suite load once and passed
cleanly on re-run and in isolation — same class of timing sensitivity
already understood from Session 64's investigation, not a regression.

**Python-mode note:** only `_static_exchange_eval_py()` needed a
mirror in `run.py` — the three helper functions have no bare
fixed-array locals and are imported and used directly from `engine.py`.
`static_exchange_eval()` itself has no early-return path before
touching its bare `gain: int32[32]` local, so — unlike
`find_best_move()`/`alpha_beta()` — it cannot be exercised directly
under plain Python at all, not even partially; correctness for the
compiled path rests on `fastpy check`, a full native build, and a
structural comparison against the already-verified Python mirror.

**Next up (Session 66):** wire `static_exchange_eval()` into
`sort_moves()` (capture ordering) and/or `quiescence()` (SEE-based
pruning) — with the same before/after node-count benchmarking rigor
D-49/D-20 used for LMR/null-move/futility, since this next step affects
every search, unlike this session's isolated addition.

## Session 64 — In-search-path repetition detection (D-107): the last of D-103's three-item arc, closed with a design safer than originally assumed
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/tests/test_move_gen.py` changed. `native/uci_main.cpp`
UNCHANGED (see below for why). Docs updated: `docs/DECISIONS.md`
(D-107), `docs/ROADMAP.md`, this entry.

**Baseline check first (per the D-61/D-65 PROCESS rule):** pulled fresh
`main` for both repos. `fastpy` 386/386, `fastpy-engine` 299/299 —
matches Session 63's logged counts.

**Task:** D-103's third and final sequencing item — in-search-path
repetition detection, D-101's original highest-risk candidate (a line
that cycles back to a position visited earlier in the SAME search,
never actually played in the real game — distinct from D-101/D-102's
game_history mechanism, which only catches real played-move repeats at
the root).

**What shipped:** `ancestor_hashes: uint64[256]` + `ply: int32` threaded
through `alpha_beta()`'s own recursion, declared as a LOCAL array inside
`find_best_move()` (never a global). Full design reasoning, the "no
push/pop needed" finding, the singular-extension `ply`-vs-`ply+1` bug
caught during design, and why `quiescence()`/`native/uci_main.cpp`
needed zero changes are all written up in D-107 — worth reading in full
rather than duplicating here.

**The headline result:** this turned out safer than D-101's original
assessment predicted. D-101 pictured a stack requiring careful
push/pop bookkeeping around every early-return point, where a single
mismatch would silently corrupt results. The design that actually
shipped needs no pop at all — each recursive call just writes its own
`ply` slot on entry, and reads only ever look at indices strictly below
the current call's own `ply`, which in a depth-first traversal are
exactly its real ancestors. Nothing is ever "removed," so there's
nothing to get wrong on a return path.

**A real bug was caught during design, before writing any tests to find
it:** the singular-extension verification search re-examines the SAME
board (not a child), so it needed `ply` — not `ply + 1`, unlike every
other recursive call in the function — or it would have immediately
matched its own just-written ancestor slot and silently disabled
singular extensions for the rest of the search.

**Verification:** 6 new tests (`TestInSearchPathRepetition` in
`test_move_gen.py`) — fabricated-ancestor and unrelated-ancestor direct
checks, an `ancestor_hashes=None` backward-compatibility check, a real
legally-played 4-ply knight-shuffle proven to return to the exact same
Zobrist hash, that shuffle detected as a draw end-to-end, and an
engine.py-vs-run.py cross-check on the same real scenario. Full suite:
`fastpy-engine` 305/305 (299 + 6 new). `fastpy check` clean. Native
binary rebuilt via `training/build_uci_engine.py`, smoke-tested across
several off-book positions — no crashes, opening book and perft both
still correct.

**A same-session correction, not a shipped finding:** initial
verification runs seemed to show `go depth 1` on the same position,
run twice, occasionally aborting after only 2 nodes with a nonsensical
`score cp 32767` (the `INF` sentinel) and an effectively arbitrary
`bestmove`. Investigated immediately rather than written up as a
pre-existing bug and left for later — the actual cause was the TEST
HARNESS: piping `quit` in the same stdin stream immediately after `go`
races the search's own completion against the D-92/D-93 watcher
thread's already-documented behavior of noticing a buffered `quit` and
correctly aborting early ("CAN be interrupted by an explicit stop/quit
genuinely mid-node either way" — intentional, not a defect). A real UCI
GUI always waits for `bestmove` before sending anything else, so this
never happens in actual use. Confirmed by re-running with `quit` sent
only after a short delay: byte-identical results across 5+ repeated
runs, on both this session's binary and a freshly-built baseline. No
engine change needed — corrected here rather than shipped as a false
Session 65 lead.

**D-103's arc is now complete:** `Threads` default (D-104, Session 62)
→ opening-book transposition-awareness (D-106, Session 63) →
in-search-path repetition detection (D-107, this session). No specific
candidate is queued for Session 65 — the false lead above turned out not
to be a real issue, so the next session should pick a genuinely fresh
area from ROADMAP.md's other open items rather than defaulting to more
repetition/book/search-timing work out of momentum.

## Session 63 — Opening-book transposition-awareness (D-106): position-hash fallback layer added on top of the existing exact-prefix table, table itself untouched
**Status:** COMPLETE ✅ — `fastpy-engine/run.py`,
`fastpy-engine/native/uci_main.cpp`, `fastpy-engine/tests/test_move_gen.py`,
`fastpy-engine/tests/test_uci.py` changed. Docs updated:
`docs/DECISIONS.md` (D-106), `docs/ROADMAP.md`, this entry.

**Baseline check first (per the D-61/D-65 PROCESS rule):** pulled fresh
`main` for both repos. `fastpy` 386/386, `fastpy-engine` 292/292 —
matches Session 62's logged counts.

**Task:** D-103's sequencing item 2 — extend `OPENING_BOOK`
(D-94/D-98) lookup to match by resulting position, not only by exact
played-move prefix, open since Session 55.

**Scope decided before writing code:** extend the LOOKUP, not the
TABLE. `OPENING_BOOK`/`kOpeningBook` stay exactly the hand-authored,
exact-prefix data they were. A new position-hash index
(`OPENING_BOOK_BY_HASH` in `run.py`, `opening_book_by_hash()` in
`native/uci_main.cpp`) is derived from that same table — built once by
replaying every entry's prefix from `startpos()` and recording the
resulting `board.hash` — and consulted only as a FALLBACK when the
original exact-prefix lookup misses, so every existing straight-line
book game keeps byte-for-byte pre-session behavior. A hash-based hit is
re-checked for legality before being trusted, cheap insurance against a
genuine 64-bit hash collision.

**A real subtlety surfaced during verification, not introduced this
session (see D-106 for the full writeup):** this engine's en-passant
flag is set on any pawn double push regardless of whether it's actually
capturable, so not every intuitive transposition hashes identically —
e.g. `1.Nf3 d5 2.d4` vs `1.d4 d5 2.Nf3` differ (one ends on a pawn
double push with a live ep flag, the other doesn't). The verification
transposition used instead — `1.e4 c5 2.Nf3 d6` vs `1.Nf3 c5 2.e4 d6` —
was chosen to end on a single pawn push in both orders, sidestepping
this pre-existing characteristic rather than being tripped up by it.

**Verification:** 5 new function-level tests
(`TestOpeningBookTransposition` in `test_move_gen.py` — no accidental
collisions among the 46 existing entries, a genuine transposition
hashes identically, the fallback returns the right reply, exact-prefix
still wins when both would match, off-book returns `None`, no-`board`
argument stays backward compatible) plus 1 new subprocess-level test
(`test_uci.py`) confirming the transposed line gets an instant
`bestmove d2d4` with zero search. Native binary rebuilt via
`training/build_uci_engine.py`, live-smoke-tested: exact-order hit,
transposed-order hit (~17ms, matches the exact order's reply), off-book
fallthrough still searches correctly, depth-1/perft baseline
unaffected. Full suite: `fastpy-engine` 299/299 (292 + 7 new).
`engine.py` untouched — driver-level logic per Core Rule 4, same
scoping D-94 already used for the book itself.

**What's still open:** the last of D-103's three candidates —
in-search-path repetition detection (Session 64, deliberately last
given D-101's risk profile). With that done, D-103's arc closes and the
session after should pick a genuinely fresh area.

## Session 62 — `Threads` default finalized at 1, closing a six-session-open item (D-104): comment-only change, no behavior difference
**Status:** COMPLETE ✅ — `fastpy-engine/native/uci_main.cpp` changed
(comment only). Docs updated: `docs/DECISIONS.md` (D-104),
`docs/ROADMAP.md`, this entry.

**Baseline check first (per the D-61/D-65 PROCESS rule):** pulled fresh
`main` for both repos before trusting any prior session's claims.
`fastpy` 386/386, `fastpy-engine` 292/292 — both match Session 61's
logged counts exactly. `fastpy check engine.py` — zero errors.

**Task:** D-103's sequencing item 1 — a smarter `Threads` default,
open since Session 56 (six sessions: 56-61) without resolution,
explicitly scoped as a DECISION task, not necessarily an implementation
one.

**Decision: keep the default at 1.** Closed explicitly, not deferred
again. Full reasoning in D-104; short version — (1) matches standard
UCI/GUI convention (Stockfish and others default to 1, opt-in via
`setoption`), and (2), the deciding factor, this project's whole
session history of byte-for-byte-reproducible node-count/NPS
benchmarks (D-49, D-96, D-99) depends on a stable default; an
auto-detected `hardware_concurrency()` default would make every future
benchmark silently machine-dependent, for no real gain since
`setoption name Threads value N` is already a one-line opt-in for
anyone who wants SMP. Nothing in the six sessions this sat open
surfaced an actual problem with the default being 1 — every mention
was "worth reconsidering," never "broken."

**What changed:** a comment block added next to `g_smp_threads` in
`native/uci_main.cpp` recording this reasoning, so the question doesn't
silently reopen next session without new information forcing it.

**Verification:** rebuilt via `training/build_uci_engine.py` — succeeds
clean. Live UCI smoke test (`uci` / `isready` / `position startpos` /
`go depth 4` / `quit`) against the rebuilt binary — output byte-for-
byte identical to pre-session (`option name Threads type spin default 1
min 1 max 64`, `bestmove e2e4` at depth 4), confirming this was
genuinely comment-only with zero behavior change. `engine.py` and
`run.py` both untouched. Full suites unaffected: `fastpy` 386/386,
`fastpy-engine` 292/292.

**What's still open:** two candidates remain per D-103 — opening-book
transposition-awareness (D-94/D-98, next up, Session 63) and
in-search-path repetition detection (Session 64, deliberately last
given D-101's risk profile).

## Session 61 — Root-already-repeated positions now recognized as an immediate draw (D-102): closes the gap D-101 explicitly left open, `native/uci_main.cpp` needed zero changes
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/tests/test_move_gen.py` changed. `native/uci_main.cpp`
NOT touched this session (confirmed unnecessary — see below). Docs
updated: `docs/DECISIONS.md` (D-102), `docs/ROADMAP.md`, this entry.

**Decision made:** four candidates were open after Session 60. Picked
the low-risk one deliberately — a small, direct continuation of D-101's
own work, closing a gap that session had already precisely identified,
rather than starting a new large front (in-search-path repetition
detection, explicitly flagged high-risk in D-101) or picking up an item
stalled for 5-6 sessions without a clear path forward (`Threads`
default, opening-book transposition-awareness).

**The gap:** D-101's mechanism only checked whether a CANDIDATE move
would create a position's 3rd occurrence. It never checked whether the
ROOT position — before any candidate move is even considered — had
already reached its 3rd occurrence, which can happen without the
engine's own root loop ever having had a chance to "choose against" it
(e.g. if the opponent's move produced the repeat).

**The fix:** one new check in `find_best_move()`, placed AFTER the
existing `tt_store()` call — deliberately after, not before.
`repetition_count(game_history, game_history_len, board.hash) >= 3`
(game_history always includes the current position as its own last
entry, so `>= 3` correctly means "including right now," matching the
real FIDE rule) overrides only `score_out`, never the TT entry: a
different game reaching the identical position via a different route
would have a legitimate non-drawn score, and `tt_store()` already
recorded exactly that value before this new check runs. Mirrors D-100's
`board.hash`/`halfmove_clock` TT-ordering reasoning, applied here in
the opposite temporal direction (check placed AFTER the write it must
not corrupt, rather than before a read it must not be corrupted by).

**`native/uci_main.cpp` needed no changes at all** — it already passes
`position_history` into every real `find_best_move()` call (D-101), and
`smp_helper_worker()`'s deliberate empty-history call safely no-ops
against the new check exactly the way it already no-ops against
D-101's per-move check. A clean confirmation that D-101's choice to put
the whole mechanism inside `find_best_move()` itself, rather than
partially in the driver, was the right call — a genuinely new
capability slotted in as a single-function change plus its `run.py`
mirror.

**Verification:** `fastpy check engine.py` zero errors. Full
`training/build_uci_engine.py` build succeeds untouched on the driver
side. Decisive before/after live UCI smoke test on the EXACT SAME
manufactured position as D-101's own smoke test (8-move knight-shuffle
back to startpos): pre-D-102, scores varied per depth (`cp 48`, `16`,
`35`, `12`, `28`, `23`...); post-D-102, every single depth (1 through
9) reports `score cp 0`, while `bestmove` remains a real, sensible move
(`d2d3`) rather than degenerating — about as direct a confirmation as a
live integration test can give. 2 new deterministic unit tests
(`TestRootAlreadyRepeated` in `test_move_gen.py`), same
white-up-a-queen contrast pattern as D-100/D-101: forced-0 at 3
occurrences, real score preserved at only 2 (exact boundary test). A
third planned test — an engine.py-vs-run.py direct parity check, same
shape as D-101's `repetition_count()` parity test — turned out invalid
for this function and was removed rather than forced: `find_best_move()`
declares `moves: uint64[218]` as a bare annotation with no assignment,
which only allocates a real array when compiled, not when run directly
as plain Python (`UnboundLocalError`) — a pre-existing dialect
characteristic, not something this session introduced, and exactly why
`run.py` keeps `_find_best_move_py()` as a genuinely separate
implementation. Full suites: `fastpy` 386/386 (unchanged), `fastpy-engine`
292/292 (290 prior + 2 new).

**What's still open:** the threefold-repetition feature (D-101 + D-102
together) is now reasonably complete at the root level. Three
candidates remain — down from four, the first net reduction in several
sessions: in-search-path repetition detection (still the same D-101
risk reasoning, still unstarted), a smarter `Threads` default (open six
sessions now, worth asking next session whether to actually pursue it
or formally close it as "not pursuing"), and opening-book
transposition-awareness (D-94/D-98, open since Session 55).

## Session 60 — Threefold-repetition detection, root-only (D-101): find_best_move() checks candidate moves against the game's played-position history; full in-search-path detection deliberately deferred as too risky for one session
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/native/uci_main.cpp`, `fastpy-engine/tests/test_move_gen.py`
changed. Docs updated: `docs/DECISIONS.md` (D-101), `docs/ROADMAP.md`,
this entry.

**Continuing from Session 59:** D-100 flagged two related, undone gaps
— within-search repetition detection and game-level threefold-
repetition detection. Handed the choice with "you decide," picked the
more architecturally contained of the two to start.

**Scoping decision, made explicit before writing any code:** true
in-search-path repetition detection would need a `ply`-indexed
ancestor-hash stack pushed onto entry and popped on every return path
of `alpha_beta()`/`quiescence()` — both have several early returns from
pruning cutoffs, and a single mismatched pop would silently corrupt the
stack for every later sibling call at that ply. That failure mode
doesn't crash or fail a type check — it just quietly makes the engine
play worse chess in a way that's hard to notice from search output
alone. Judged not safely completable to this project's own standard
(build-and-test-before-presenting, full suites green, `fastpy check`
clean) within one careful session. Deferred, not abandoned — see
D-101 for the full reasoning and ROADMAP for where it's tracked.

Scoped instead to root-only: `find_best_move()`'s root loop checks
whether a candidate move's resulting position would be its 3rd
occurrence across (the actual game's played-position history + this
move) and forces that move's score to 0 if so. This is a single,
once-per-`go`-command function — not the hot recursive search path —
so an 8KB `uint64[1024]` parameter costs nothing worth measuring,
categorically different from D-99's NODE_COUNT sizing question.

**What shipped, three files (mirroring D-94's opening-book precedent
for where UCI-driver-level, game-history-dependent logic belongs):**
1. `engine.py` — new `MAX_GAME_HISTORY` constant, new
   `repetition_count()` helper, `find_best_move()` gains
   `game_history`/`game_history_len` params and the root-loop override.
2. `run.py` — full mirror: `_repetition_count_py()`,
   `_find_best_move_py(..., game_history=None)`,
   `_iterative_deepening_py(..., game_history=None)`,
   `_apply_position()` now also returns `position_history` (built
   UNCONDITIONALLY, unlike `move_history` — a FEN-started game can
   still repeat positions even though the opening book, D-94, is
   standard-start-only), and the `go`-handler's state threaded through
   the same way `move_history`/`is_standard_start` already are.
3. `native/uci_main.cpp` — new `kMaxGameHistory` constant, `go()` gains
   a `position_history` parameter (NOT const — `find_best_move()`'s
   `game_history` param is a non-const `uint64_t*` per FastPy's
   array-parameter emission convention; the compiler caught this
   directly when `const` was tried first, fixed by dropping it rather
   than reaching for `const_cast` at 3 call sites), `main()`'s command
   loop builds `position_history` the same way it already builds
   `move_history`, all 3 `find_best_move()` call sites in `go()`'s
   depth/aspiration loop updated, `smp_helper_worker()` deliberately
   passes an empty history (documented why that's within the TT's
   already-accepted-race design, not a new risk).

**Verification:** `fastpy check engine.py` zero errors, first attempt.
Full `training/build_uci_engine.py` build (emit → strip stub → concat
`uci_main.cpp` → compile) succeeds after the const-mismatch fix. Live
UCI smoke test: fed a real 8-move knight-shuffle sequence returning to
the start position 3 times, gave the search a genuine 3-second budget,
got sane depth-by-depth scores and a sensible move — not a crash. (An
earlier quick test that raced an immediate `quit` against the search
produced an alarming-looking `score cp 32767`/`nodes 2` result; traced
this to the existing, pre-D-101 D-85/D-92 "always trust move 0"
abort-fallback behavior firing on a search that had barely started — a
test-harness timing artifact, not a regression, and NOT how the actual
verification tests below work.) 5 new deterministic unit tests in a new
`TestThreefoldRepetition` class (`test_move_gen.py`) — chosen at the
function level specifically because the UCI-level smoke test above
turned out to be timing-sensitive and hard to verify precisely:
`_repetition_count_py()` against `None`/empty/multi-occurrence
histories; a white-up-a-queen-and-more position where every legal root
move's resulting hash is fabricated into the history twice, proving
`find_best_move()` still returns a real move but scores it exactly 0
despite overwhelming material; the inverse (irrelevant history is a
complete no-op); and a compiled-vs-Python-mode parity check between
`engine.py`'s `repetition_count()` and `run.py`'s
`_repetition_count_py()`. Full suites: `fastpy` 386/386 (unchanged —
no `fastpy`-repo file touched), `fastpy-engine` 290/290 (285 prior + 5
new).

**What's still open:** within-search-path repetition detection
(deferred this session, with reasoning); this session's own
acknowledged limitation (an already-3-times-repeated ROOT position,
before any candidate move, isn't itself recognized as an immediate
draw — only a candidate continuation that would CREATE the 3rd
occurrence); a smarter `Threads` default (open since Session 56);
opening-book transposition-awareness (D-94/D-98, open since Session
55). Four candidates now open. ROADMAP flags this needs an actual
decision next session, not a sixth session of deferral.

## Session 59 — Fifty-move rule was silently untracked (D-100): `halfmove_clock` only ever incremented, never reset; fixed in `make_move()` and wired into `alpha_beta()`/`quiescence()`
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/tests/test_move_gen.py` changed. Docs updated:
`docs/DECISIONS.md` (D-100), `docs/ROADMAP.md`, this entry.

**Baseline (Go-trigger PROCESS check, D-61/D-65):** re-verified against
freshly-pulled `main` in both repos before any change. `fastpy`
386/386, `fastpy-engine` 276/276, `run.py` parses clean, `fastpy check
engine.py` zero errors, `OPENING_BOOK` confirmed at 46 entries —
matched Session 58's claimed end state exactly.

**Decision made:** three sessions running (56, 57, 58) had all stayed
within the Lazy SMP/opening-book area, flagged explicitly in ROADMAP as
worth reconsidering. Offered the choice of a carried-over item vs. a
new area; handed the specific task back to me. Chose to look for a
genuine, previously-undiscovered gap rather than default to either
carried-over option — found one: `board.halfmove_clock` exists (part
of `BoardState` since Sprint 7, documented in
`ENGINE_ARCHITECTURE.md`'s board representation) but grep confirmed
nothing anywhere in the codebase ever read it, and `make_move()` only
ever incremented it, never reset it. The fifty-move rule was
consequently invisible end-to-end — a real correctness gap for actual
play, not a hypothetical one. See D-100 for the full writeup.

**What shipped:**
1. `engine.py`'s `make_move()` now computes `is_pawn_move`/`is_capture`
   *before* any of its existing mutations run (the function's first
   mutating step already clears the captured piece's bitboard bit, so
   checking capture status any later would always see a non-capture);
   `halfmove_clock` resets to 0 on either condition, increments
   otherwise. En passant is handled explicitly (`FLAG_EN_PASSANT` →
   `is_capture = True`) since its victim square isn't `to_sq` and so
   isn't caught by the normal to-square-occupied check.
   `make_move_with_accumulator()` inherited the fix for free (it calls
   `make_move()` internally rather than duplicating its logic).
   `make_null_move()` deliberately untouched — a search heuristic, not
   a real game move.
2. `engine.py`'s `alpha_beta()` and `quiescence()` both now return a
   draw score (0) once `board.halfmove_clock >= 100`. In `alpha_beta()`
   this check sits *before* the TT probe, deliberately: `board.hash`
   doesn't encode `halfmove_clock`, so two different game histories
   reaching the same position could otherwise share a stale TT entry
   that masks a forced draw.
3. `run.py`'s `_alpha_beta_py()`/`_quiescence_py()` mirrored
   identically for behavioral parity. `run.py` has no separate
   `_make_move_py()` — it imports and runs `engine.py`'s `make_move()`
   directly as plain Python, so the `make_move()` fix applies to
   Python-mode automatically with no second copy needed.

**No new dialect constraint this session** — unlike D-99's array-size
literal requirement, everything needed (`bool8` locals, existing
`BoardState` method calls, an early-return on an `int32` comparison)
was already supported; `fastpy check` passed on the first attempt.

**Verification:** `fastpy check engine.py` zero errors. `fastpy build
--optimize O3` compiles clean; grepped the emitted `.cpp` directly to
confirm the `halfmove_clock = 0`/`+ 1` branch and both
`halfmove_clock >= 100` early-returns are present exactly once each, no
duplication. Compiled binary runs, exits 0 (the deliberate `main()`
no-op stub, unaffected). 9 new tests in a new `TestFiftyMoveRule` class
(`test_move_gen.py`): reset-vs-increment across quiet moves/pawn
pushes/pawn captures/piece captures/en passant/promotion, exact-0 draw
score at `halfmove_clock == 100` for both `_alpha_beta_py()` and
`_quiescence_py()`, and a boundary test at `halfmove_clock == 99` using
a white-up-a-queen-plus position so the real search score
(`> VAL_QUEEN`) is an unambiguous contrast against the forced-0 draw
one ply later. Full suites: `fastpy` 386/386 (unchanged this session),
`fastpy-engine` 285/285 (276 prior + 9 new).

**Environment note, not a regression:** this sandbox's single vCPU
occasionally pushes the ~101K-line emitted C++ (dominated by NNUE
weight tables, D-69) past `toolchain.py`'s hardcoded 120-second
`compile_cpp()` timeout at `-O3 -march=native`. Confirmed pre-existing
and unrelated to this session's change — a direct `g++` invocation with
a longer timeout, on the identical emitted `.cpp`, compiles
successfully. This session's diff is two lines' worth of emitted C++;
not plausibly capable of moving compile time across that threshold on
its own. Not addressed here — out of scope.

**What's still open:** within-search repetition detection and
game-level threefold-repetition detection are both real, related gaps
this session's fix does not cover — flagged in D-100 and ROADMAP as new
candidates. Both Session 56 carry-overs (smarter `Threads` default,
opening-book transposition-awareness) also remain untouched. Four
candidates now open; needs a decision at the start of Session 60.

## Session 58 — Accurate per-thread node counts (D-99): `NODE_COUNT` grown to one slot per thread, `thread_id` threaded through the search, cost measured (not assumed) to be nothing
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`,
`fastpy-engine/run.py`, `fastpy-engine/native/uci_main.cpp` changed.
Docs updated: `docs/DECISIONS.md` (D-99), `docs/ROADMAP.md`, this entry.

**Baseline (Go-trigger PROCESS check, D-61/D-65):** re-verified against
freshly-pulled `main` in both repos before any change. `fastpy`
386/386, `fastpy-engine` 276/276, `run.py` parses clean, `fastpy check
engine.py` zero errors, `OPENING_BOOK` confirmed at 46 entries —
matched Session 57's claimed end state exactly.

**Decision made:** handed the choice of which Session 56 follow-up to
pick up (accurate per-thread node counts, a smarter `Threads` default,
or opening-book transposition-awareness). Picked per-thread node
counts — the most substantive of the three, and the direct completion
of D-96's own explicitly-flagged "worth measuring, not assuming, before
committing to it." See D-99 for the full writeup.

**What shipped:** `NODE_COUNT` grew from `uint64[1]` to `uint64[64]` in
`engine.py` — one private slot per possible Lazy SMP search thread. A
`thread_id: int32` parameter is now threaded through
`find_best_move()`/`alpha_beta()`/`quiescence()` and all nine of their
recursive call sites (null-move verification, singular-extension
verification, both LMR calls, the main move-loop call, the depth==0
quiescence handoff, quiescence's own recursive capture search, plus the
two docstring examples updated for accuracy). Every call passes the
same `thread_id` straight through — purely a counting value, zero
effect on search behavior or the returned score. `nodes_get()` now sums
all 64 slots for an exact total (only called once per depth for `info
nodes`/`nps`, never on the hot path); `nodes_reset()` clears all 64
slots, not just `[0]`. `node_budget_exceeded()` deliberately kept
reading `NODE_COUNT[0]` only — it runs on every single search node via
`search_aborted()`, and `NODE_BUDGET` is inactive legacy infrastructure
in every driver today anyway (D-93). `native/uci_main.cpp`: `go()`'s
three `find_best_move()` calls now pass `thread_id=0` (the main
thread's slot); `smp_helper_worker()` gained its own `thread_id`
parameter, and the spawn loop passes each helper's own unique `t`.
`run.py`'s `NODE_COUNT` monkey-patch resized `[0]` → `[0] * 64`,
matching the established sizing convention every other FastPy `[]`
array already gets there — required because `nodes_get()`/
`nodes_reset()`/`node_budget_exceeded()` are genuinely imported and
called from Python-mode (unlike the three search functions themselves,
which have separate `_xxx_py()` mirrors, untouched by this session).

**A real dialect constraint found along the way:** `uint64[MAX_SMP_THREADS]`
(a named `Final[int32]` constant in the array-size position) was
rejected outright by `fastpy check` — `global array ... has invalid
size` — FastPy requires a literal integer there (Core Rule 5: the
emitter does zero analysis, nothing substitutes a constant's value in
before the size check runs). Used the literal `64` directly, matching
the existing `TT_HASH: uint64[1048576]` convention; `MAX_SMP_THREADS`
still exists as an ordinary runtime `int32` for the loop bounds in
`nodes_reset()`/`nodes_get()`, which don't have this restriction.

**Verification — the actual point of this session:** A/B benchmark on a
fixed tactical FEN, `Threads=1`, comparing the binary before and after
`thread_id` threading: depth 7 (7 runs each) — 1,463,428 nps before vs.
1,490,586 nps after; depth 8 (10 runs each) — 1,494,233 nps before vs.
1,511,463 nps after. Node counts were bit-for-bit identical across
every single run on both binaries (444,694 at depth 7; 2,215,311 at
depth 8) — confirms the change is search-behavior-neutral. The ~1-2%
timing spread is within ordinary run-to-run noise (individual runs
within each binary's own set varied by a similar amount) — no
measurable performance cost. `Threads=1` UCI output reconfirmed
identical to pre-session baseline at every depth 1-6. `Threads=4`/
`Threads=64` reconfirmed to produce real, now-exact aggregate node
counts and still always return a legal move (D-97's fix reconfirmed:
10/10 clean at `Threads=64`/`movetime 100`); 12 rapid `go infinite`/
`stop` cycles under `Threads=4` completed cleanly, no hangs. Full
suites: `fastpy` 386/386, `fastpy-engine` 276/276 — zero test file
changes needed (confirmed via grep that no test calls
`alpha_beta()`/`quiescence()`/`find_best_move()` directly; those are
compile-only functions with `uint64[218]` stack arrays, unreachable
from pytest — see `test_node_budget.py`'s own docstring, unchanged).
`fastpy check engine.py` zero errors.

**What's still open:** a smarter `Threads` default (Session 56's other
follow-up) remains untouched — deliberately; Threads=1 is the standard
UCI/GUI convention (Stockfish defaults to it too), reconsidered again
this session and still not clearly worth changing, not just deferred
for lack of time. Opening-book transposition-awareness (D-94/D-98)
remains untouched. Flagged in ROADMAP: three sessions in a row (56, 57,
58) have now stayed within the Lazy SMP/opening-book area of the
engine — worth considering something outside that orbit next.

## Session 57 — Opening book expanded 11 → 46 entries (D-98), every new entry validated against the engine's own legal-move generator
**Status:** COMPLETE ✅ — `fastpy-engine/run.py`,
`fastpy-engine/native/uci_main.cpp` changed (mirrored exactly, same
convention D-94 established). `engine.py` untouched (Core Rule 4 —
opening-book logic is UCI-driver-level, not dialect data). Docs
updated: `docs/DECISIONS.md` (D-98), `docs/ROADMAP.md`, this entry.

**Baseline (Go-trigger PROCESS check, D-61/D-65):** re-verified against
freshly-pulled `main` in both repos before any change. `fastpy`
386/386, `fastpy-engine` 276/276, `run.py` parses clean, `fastpy check
engine.py` zero errors — matched Session 56's claimed end state exactly.

**Decision made:** handed the choice of which Session 56 NEXT UP
follow-up to pick up (accurate per-thread node counts, a smarter
`Threads` default, or opening book expansion). Picked opening book
expansion — self-contained, no concurrency subtlety unlike the other
two, and a genuine change of pace after two SMP-focused sessions in a
row (D-96, D-97). See D-98 for the full writeup.

**What shipped:** `OPENING_BOOK`/`kOpeningBook` grew from 11 to 46
entries, both files mirrored exactly. New coverage: deeper Ruy Lopez/
Italian/Petrov lines, deeper Sicilian lines, French Defense, Caro-Kann,
Scandinavian, Alekhine's Defense, Pirc/Modern, deeper Queen's Gambit/
Slav/QGA lines, King's Indian/Grunfeld/Nimzo-Indian setups, Dutch
Defense, English Opening — standard theory, 2-6 plies deep. Same
design as D-94: small, hand-picked, exact-prefix-match keys, no
transposition awareness (still explicitly flagged future scope). The
original 11 entries are untouched — purely additive.

**Validation methodology — the actual point of this session:** built a
standalone harness (not committed — a one-off verification tool) that
replays every candidate entry's move-history prefix through the
engine's own `_generate_legal_moves_py()` and confirms both the prefix
is a legal sequence AND the reply is a legal move in the resulting
position. This caught a real error on the first draft:
`('e2e4','e7e5','g1f3','b8c6','f1b5','a7a6'): 'f1a4'` — the bishop had
already moved to b5 two plies earlier in this exact line, so retreating
it "from f1" was never legal; the correct square is `b5a4`. Fixed,
re-validated: all 46 entries pass. A hand-typed UCI move string is
exactly the kind of data this project doesn't otherwise ship
un-verified (cf. D-51's generated-not-hand-typed Zobrist table) — this
is genuinely hand-authored data, which is why it got a dedicated
programmatic check rather than being trusted on inspection.

**Verification:** Full suites unaffected: `fastpy` 386/386,
`fastpy-engine` 276/276 (zero test changes needed — the original 11
entries' existing `TestOpeningBook` tests in `test_uci.py` weren't
touched). Spot-checked 4 of the 35 new entries directly against the
real compiled binary (French Defense, Caro-Kann, English Opening, the
6-ply Ruy Lopez Morphy Defense line) — all returned the expected move
near-instantly with zero `info` lines (confirms no search ran, matching
D-94's verification shape). Cross-checked one new line against
Python-mode `run.py` too — both drivers agree. Off-book fallthrough
(`1.a3`) reconfirmed still triggers a real search unchanged. `fastpy
check engine.py` zero errors.

**What's still open:** transposition-aware (position-hash-keyed) book
lookup remains future scope, not started. Accurate per-thread node
counts and a smarter `Threads` default (Session 56's other two
follow-ups) remain untouched, carried over in ROADMAP.

## Session 56 — Lazy SMP shipped (D-96), zero `engine.py` changes; a real time-pressure bug found via its own SMP stress testing and fixed (D-97)
**Status:** COMPLETE ✅ — `fastpy-engine/native/uci_main.cpp` only.
`engine.py` and `run.py` both untouched (confirmed byte-identical to
freshly-pulled `main` at session start and again after all changes).
Docs updated: `docs/DECISIONS.md` (D-96, D-97), `docs/ROADMAP.md`,
`docs/ENGINE_ARCHITECTURE.md`, this entry.

**Baseline (Go-trigger PROCESS check, D-61/D-65):** re-verified against
freshly-pulled `main` in both repos before any change, per this
project's standing rule. `fastpy` 386/386, `fastpy-engine` 276/276,
`run.py` parses clean, `fastpy check engine.py` zero errors — all
matched Session 55's claimed end state exactly, no repeat of the D-86
"claimed but not committed" failure mode.

**Decision made:** ROADMAP's post-D-95 NEXT UP listed two carried-over
options — Lazy SMP (deferred since D-74) or expanding the opening book
(D-94). Picked Lazy SMP, on a finding worth stating up front: D-74's
scoping note ("real thread-based Lazy SMP needs `std::thread` support
added to the FastPy dialect itself, no existing precedent,
multi-session commitment") was written before D-92 (Session 55)
existed. D-92 already built exactly that precedent for a different
purpose (the stdin/stop-watcher thread) — a real `std::thread` spawned
from hand-written `native/uci_main.cpp`, calling directly into
engine.cpp's already-compiled functions. Lazy SMP needed the identical
pattern again, so this shipped as a single-session native-driver-only
change instead of the multi-session transpiler commitment originally
assumed. See D-96 for the full design and D-97 for a real bug found and
fixed along the way.

**What shipped (D-96):** `setoption name Threads value N` (default 1,
clamped `[1, 64]`, matching standard UCI/GUI convention — most GUIs
never send `setoption` at all, so the default reproduces pre-session
single-threaded behavior byte-for-byte). `Threads > 1` spawns `N-1`
silent helper threads (`smp_helper_worker()`), each running its own
iterative-deepening loop on its own private `BoardState` (by value — no
shared mutable board), sharing ONE transposition table with the main
search thread — genuinely unsynchronized between threads, deliberately:
that lock-free sharing is the actual "Lazy" in Lazy SMP and is where
the real speedup comes from (a thread that finishes a subtree first
deposits a TT entry every other thread can reuse as a hash move/cutoff
hint). `NODE_COUNT`'s aggregate under `Threads > 1` is accepted as
approximate (racy, informational-only) rather than made atomic — a
deliberate trade explained in D-96: `NODE_COUNT[0] += 1` runs on every
single search node, so atomic-izing it would tax the `Threads=1`
default case most games actually use, to fix a display value, not a
correctness issue (categorically different from why `STOP_FLAG` needed
`Atomic[bool]` in D-91/D-92 — that was a genuine confirmed-by-repro
hang, not an approximate value). Also added a one-time single-threaded
priming step in `main()` (direct calls to `init_zk_table()`/
`init_magic_tables()` before the UCI loop starts) to remove a
first-call race between the main thread and helper threads on two
lazily-guarded global tables — the writes were already deterministic/
idempotent so this wasn't corrupting anything, but was cheap to remove
outright.

**A real bug found via this session's own stress testing (D-97):**
`setoption name Threads value 64` immediately followed by `go movetime
100` returned the illegal `bestmove 0000` (zero `info` lines) in
roughly half of repeated runs on this project's single-core sandbox.
Root cause: `go()`'s depth loop checked `stop_requested()`
unconditionally, including at depth 1 — if `STOP_FLAG` was already true
the instant the loop started (which spawning 63 sequential
`std::thread`s can itself cause, by eating a meaningful fraction of a
small `movetime` budget before the main loop's first depth-1 attempt
even runs), depth 1 was skipped entirely and `best_move` never left its
initial 0. This predates D-96 — always theoretically possible under
extreme time pressure — but D-96's own overhead made it trivially
reproducible for the first time. Fixed by mirroring a guarantee
`find_best_move()`'s own root-move loop already makes ("move 0 always
trusted, even under abort") one level up: `if (depth > 1 &&
stop_requested()) break;`. Re-verified 15/15 clean after the fix
(previously ~50% failure rate).

**Verification:** `Threads=1` (default) reconfirmed byte-identical to
pre-session output — node counts (41/197/2250/5174/16258/39443) and
scores match exactly at every depth 1-6 on an off-book position (`1.
a3`), only wall-clock `nps`/`time` differ, as always. `Threads=4`/
`Threads=64` verified to search without crashing and always return a
legal move (post-D-97 fix); expectedly sometimes pick a different
(comparably-scored) best move than `Threads=1` on near-equal positions
— same non-determinism category D-88 already documented for
native-vs-Python, now also across `Threads` settings of the same
driver. 12 rapid `go infinite`/`stop` cycles under `Threads=4`
(randomized position/timing) all completed cleanly, no hangs. `stop`
sent 1s into a `Threads=8` `go infinite` search returned `bestmove` in
26ms — mid-node stop propagation (D-91/D-92's `Atomic[bool]`
`STOP_FLAG`) still works with helper threads active. Full suites:
`fastpy` 386/386, `fastpy-engine` 276/276, both unaffected (`engine.py`/
`run.py` untouched). No new pytest test added for the native-driver
behavior itself — per this project's existing, explicit convention
(`test_node_budget.py`'s docstring: "native/uci_main.cpp's actual
budget computation is exercised by hand"), verified instead via paced
UCI subprocess sessions against the real compiled binary, same approach
every other native-driver-only session has used (D-84 through D-95's
native parts).

**What's still open:** three genuine, not-yet-started follow-ups, all
flagged in ROADMAP: (1) accurate per-thread node counts (would need a
`thread_id` parameter threaded through the recursive search functions
— a real, not-yet-measured perf cost, worth measuring before
committing); (2) a hardware-aware `Threads` default instead of the
current hard-coded 1 (deliberately not done this session, to keep the
default behavior-preserving); (3) expand the opening book (D-94) —
still untouched since D-94.


---

## Session 55 — `Atomic[T]` added to FastPy's dialect (D-91), wired into fastpy-engine for mid-node `stop` (D-92) and a genuine wall-clock deadline (D-93), an opening book (D-94), then genuine wall-clock time management + real stop/quit for Python-mode (D-95)
**Status:** COMPLETE ✅ — Part 1 (D-91): `fastpy` repo changed
(`core/parser.py`, `core/emitter.py`, `tests/test_parser.py`,
`tests/test_type_system.py`, `tests/test_emitter.py`). Part 2 (D-92):
`fastpy-engine` repo changed (`engine.py`, `run.py`,
`native/uci_main.cpp`, `training/build_uci_engine.py`). Part 3 (D-93):
`fastpy-engine/native/uci_main.cpp` changed again (`engine.py`/`run.py`
untouched — `search_aborted()` from D-92 already covered it). Part 4
(D-94): `fastpy-engine/run.py`, `fastpy-engine/native/uci_main.cpp`,
`fastpy-engine/tests/test_uci.py`, `fastpy-engine/tests/test_phase4.py`
changed (`engine.py` untouched — Core Rule 4, book logic isn't dialect
data). Part 5 (D-95): `fastpy/core/parser.py`, `fastpy-engine/engine.py`,
`fastpy-engine/run.py`, `fastpy-engine/tests/test_uci.py`,
`fastpy-engine/tests/test_phase4.py` changed (`native/uci_main.cpp`
untouched — Python-mode only). Docs updated: `docs/DECISIONS.md` (D-91
through D-95), `docs/ROADMAP.md`, `docs/ENGINE_ARCHITECTURE.md`, this
file.

### `Go` trigger
Fresh conversation. Read ROADMAP/SESSION_LOG (Tier 1) and full Tier 2
(PROJECT_CONTEXT, ARCHITECTURE, DECISIONS, ENGINE_ARCHITECTURE,
engine.py, run.py). Re-verified baseline before touching anything:
`fastpy` 372/372, `fastpy-engine` 265/265, `run.py` parses clean as
plain Python, `fastpy check engine.py` zero errors — all matched
Session 54's recorded state exactly.

ROADMAP's NEXT UP was an open three-way decision, not a queued task:
(1) the volatile/atomic FastPy global type flagged by both D-85 and
D-90 as the real prerequisite for true mid-node `stop` interruption and
a genuine wall-clock time check, (2) Lazy SMP (deferred since D-74),
(3) something outside search/UCI entirely. Asked Gokul; he deferred the
choice back. Picked (1): it's the one item two prior sessions already
named by name as the actual blocker behind two already-shipped-but-
limited features (D-85's node-count estimate, D-90's depth-boundary-
only stop), and unlike Lazy SMP's `std::thread`-in-the-dialect
requirement, the type-only slice is genuinely completable in one
session rather than being its own open-ended multi-session commitment.

### What shipped
`Atomic[T]` as a new global-declaration annotation in FastPy's dialect,
e.g. `STOP_FLAG: Atomic[bool] = False`. Transpiler-feature-only this
session — deliberately did NOT touch `fastpy-engine` yet (see D-91 for
the full rationale and what's explicitly left open).

- `core/parser.py`: `IRGlobal` gained `is_atomic: bool = False`.
  `_try_global` detects `Atomic[...]`, unwraps to the plain inner type
  before storing (`type_name` holds `"bool"`, not `"Atomic[bool]"`), so
  `type_system` and everything downstream treats it like an ordinary
  scalar global except for the one flag. `Atomic[T[N]]` (array) is
  deliberately left un-unwrapped — no element-wise-atomic array concept
  exists in `std::atomic`, so it falls through to a normal "unknown
  type" rejection in type_system rather than the parser inventing an
  unrequested semantic for it.
- `core/emitter.py`: `_emit_globals` emits `std::atomic<T> NAME{val};`
  (brace-init — `std::atomic`'s copy constructor is deleted) instead of
  `T NAME = val;` when `is_atomic`. Unconditional `#include <atomic>`
  added (same zero-cost-when-unused philosophy as the file's other
  unconditional includes). No new IR node, no new statement codegen —
  `std::atomic<T>` defines `operator=(T)`/`operator T()`, so every
  existing read/write site (`if (NAME)`, `NAME = true;`) compiles
  unchanged against the new declaration.

### Verification
Static-shape tests (parser: 4 new — atomic bool/uint64 parsed, non-
atomic globals unaffected, atomic-array left unresolved; type_system:
4 new — atomic bool/uint64 pass, unknown-inner-type and atomic-array
both rejected; emitter: 6 new — exact `std::atomic<bool>
STOP_FLAG{false};` text, `#include <atomic>` present, non-atomic
globals' plain declarations unaffected, read/write codegen unchanged).

Also — per the D-88 lesson that string-shape checks alone can't catch a
behaviorally-wrong feature — a real **compile-and-run concurrency
test**: builds a harness with a genuine `std::thread` writer that
sleeps 50ms then calls the compiled `request_stop()`, racing a main-
thread busy-spin on the compiled `should_stop()`. This is the exact
scenario D-85's plain-bool repro hung forever on; confirmed it
terminates and reports a nonzero spin count (proves the reader actually
raced the writer, not scheduling luck).

Full `fastpy` suite: 386/386 (372 baseline + 14 new). `fastpy check
engine.py` reconfirmed zero errors against the updated transpiler
(engine.py itself unchanged). End-to-end CLI sanity check (`fastpy
check`/`fastpy emit` on a small standalone `Atomic[bool]` example, not
just through pytest) also run directly.

### What's NOT done (as of D-91, superseded below by Part 2 / D-92)
`fastpy-engine` doesn't use `Atomic[T]` yet. No `STOP_FLAG` in
`engine.py`/`run.py`, no watcher thread in `native/uci_main.cpp`, no
poll points wired into `alpha_beta()`/`quiescence()`. That's the real
remaining work this session deliberately scoped out rather than
rushing into the same message: replacing D-90's depth-boundary-only
`stop` with true mid-node interruption, and/or replacing D-85's node-
count estimate with a genuine wall-clock deadline check — both now
unblocked by this session's type, neither built yet.

### Part 2 (same session, continued): `Atomic[bool]` wired in (D-92)
Picked up immediately after presenting D-91's files, per Gokul's "Next".
Chose the `stop` wiring over the wall-clock-deadline alternative D-91
also left open — D-90 recorded a specific measured failure (37.7s stop
latency on a slow depth), giving this a concrete before/after to verify
against rather than a theoretical improvement.

`engine.py`: added `STOP_FLAG: Atomic[bool]`, `stop_clear()`/
`stop_request()`/`stop_requested()`/`search_aborted()` (combines node
budget OR external stop). Every `node_budget_exceeded()` check in
`alpha_beta()`/`quiescence()`/`find_best_move()`'s root loop now calls
`search_aborted()` instead — the existing D-85 root-loop protections
(move 0 always trusted, aborted depths not stored to TT as EXACT) apply
identically regardless of which condition triggered the abort.

`run.py`: mirrored the same substitution into `_alpha_beta_py()`/
`_quiescence_py()`/`_find_best_move_py()` for behavioural parity with
`engine.py` (this repo's established convention) — a documented no-op
today, since Python-mode's UCI loop is single-threaded and never calls
`stop_request()`.

`native/uci_main.cpp`: `go()` now spawns a real `std::thread`
(`stop_watcher()`) that exclusively owns stdin for the search's
duration (main()'s own loop resumes ownership after `go()` returns),
polling every 10ms and calling `stop_request()` the instant `stop`/
`quit` arrives. D-90's `stdin_has_pending_line()` depth-boundary poll
is left in the file as documented dead code rather than deleted, so the
design history stays visible. `training/build_uci_engine.py` gained
`-pthread` — the build failed to link without it, caught by actually
building the binary rather than assuming.

**Verification:** `fastpy-engine` pytest suite 265/265 (unaffected —
`native/uci_main.cpp` has no pytest coverage before or after this
session; that file's behavior can only be verified against a real
compiled binary). `fastpy check engine.py` zero errors, `run.py` parses
clean. Built the actual UCI binary via `training/build_uci_engine.py`
and ran 5 manual interactive UCI sessions against it — most importantly,
reproduced D-90's exact failure shape (withheld `stop` until genuinely
stuck >2s inside one slow depth-11 iteration whose cost was clearly
still growing) and confirmed `bestmove` now returns in ~10ms instead of
the 37.7s D-90 measured. Also verified: `quit` mid-search exits cleanly
(~16.5ms), and two ordinary uninterrupted searches back-to-back (a
fixed-depth search to natural completion, then a movetime-budgeted
search on a fresh position) behave exactly as before — confirming the
watcher-thread lifecycle doesn't leak or corrupt state across repeated
`go()` calls.

Docs updated: `DECISIONS.md` (D-92), `ROADMAP.md` (closed out this
item, NEXT UP is now the wall-clock-deadline replacement),
`ENGINE_ARCHITECTURE.md` (D-90's known-limitation entry marked fixed,
with the measured before/after), this file.

**Files changed this part:** `fastpy-engine/engine.py`,
`fastpy-engine/run.py`, `fastpy-engine/native/uci_main.cpp`,
`fastpy-engine/training/build_uci_engine.py`. `fastpy` repo untouched
in this part (D-91's changes from earlier in this same session stand
as already presented).

### Part 3 (same session, continued): `NODE_BUDGET`'s estimate replaced by a genuine wall-clock deadline (D-93)
Picked up immediately after presenting D-92's files, per Gokul's "Next".
This closes out the second (and last) piece D-91's original two-part
follow-up left open.

`native/uci_main.cpp`: `go()` no longer computes a per-depth NPS-based
node ceiling at all — that whole block, and the `kDefaultNpsEstimate`/
`kMinMsForEstimate`/`kBudgetFraction` constants it used, are gone.
Instead `go()` computes a single `Clock::time_point deadline` once
(`t0 + movetime_ms`, or `Clock::time_point::max()` for no time limit)
and passes it to `stop_watcher()` (D-92's background thread), whose
existing ~10ms poll loop now also checks the deadline and calls
`stop_request()` the instant it passes — the same `Atomic[bool]` path
`stop`/`quit` already used. **Zero `engine.py` changes needed** —
`search_aborted()` (D-92) already ORs node budget OR external stop, so
this reuses the exact same abort path throughout `alpha_beta()`/
`quiescence()`/`find_best_move()`. `NODE_BUDGET` itself is untouched —
still `run.py`'s Python-mode mechanism, unaffected by any of this.

**Verification:** `fastpy-engine` pytest suite 265/265 (unaffected,
`engine.py`/`run.py` unchanged this part). `fastpy check engine.py`
zero errors. Built the real UCI binary and measured deadline precision
directly across 5 budgets (100/300/500/1000/2000ms): 15.9/14.5/15.9/
19.7/17.3ms overshoot respectively — tight and consistent regardless of
budget size, unlike D-85's percentage-of-estimate-error behavior.
Specifically reproduced D-85's own originally-documented failure shape
(a deadline landing mid-way into a slow, still-growing depth-11
iteration, the same one measured in D-92's verification) — 18.1ms
overshoot instead of the multi-second overshoot that failure class
produced before any budget mechanism existed. Re-ran all of D-92's
regression scenarios against the new binary to confirm nothing broke:
`go infinite` + `stop` (10.4ms), `go depth 6` to natural completion (6
info lines, correct bestmove), `quit` mid-search (17.1ms clean exit).

Docs updated: `DECISIONS.md` (D-93), `ROADMAP.md` (closed out this
item — no queued NEXT UP remains, three open options listed for next
session's actual decision), `ENGINE_ARCHITECTURE.md` (D-85's
node-count-estimate limitation marked fixed, with the measured
before/after), this file.

**Files changed this part:** `fastpy-engine/native/uci_main.cpp`,
verified against the existing `fastpy-engine/training/
build_uci_engine.py` (unchanged this part — `-pthread` was already
added in Part 2). `engine.py`/`run.py` untouched this part. `fastpy`
repo untouched this part.

### Part 4 (same session, continued): opening book added (D-94)
Picked up immediately after presenting D-93's files, per Gokul's
"Continue to next" — ROADMAP had no queued task after D-93 closed out
the async-stop/time-management arc, so this required an actual pick
among three open options. Chose an opening book (the "something outside
search/UCI entirely" option) over Lazy SMP or Python-mode wall-clock
time management, specifically to avoid three straight sessions spent on
search-internals concurrency, and because it's fully self-contained —
no dependency on anything D-91/D-92/D-93 left open.

Small (11-entry) hand-picked table of common opening lines
(1.e4/1.d4/1.Nf3 and their most standard replies, plus the 4-ply Ruy
Lopez line), keyed on the exact ordered sequence of UCI moves played
since the standard starting position — a straight prefix match, not a
position-hash lookup (deliberately not transposition-aware; see D-94 for
why that's out of scope for a book this size). Implemented entirely at
the UCI-driver level, not in `engine.py` — Core Rule 4 means a book
lookup (deciding whether to search at all) isn't FastPy dialect data,
so `engine.py` was never touched.

`run.py`: `OPENING_BOOK`/`_book_lookup()`. `_apply_position()` now
returns `(board, move_history, is_standard_start)` instead of just
`board` — the single call site in `uci_loop()` was updated accordingly.
`is_standard_start` is `False` for any `position fen ...` game,
permanently disabling the book for it. `uci_loop()`'s `go` handler
checks the book before parsing any time/depth parameters.

`native/uci_main.cpp`: `kOpeningBook`/`book_lookup()` (linear scan, fine
at 11 entries), mirroring `run.py`'s table independently — same
convention already established for the Python/C++ search-function
pairs. `main()`'s loop gained the same `move_history`/`is_standard_start`
tracking and reset/disable semantics.

**Verification:** 7 new tests (`TestOpeningBook` in `test_uci.py`):
fresh-startpos hit responding `e2e4` near-instantly even with `go depth
20` requested (confirms zero search actually ran, not just a fast one),
responses to `1.e4`/`1.d4`, the full 4-ply Ruy Lopez line, an off-book
first move correctly falling through to a real search, a `position fen
...` game correctly NOT triggering the book despite its empty move
history otherwise matching `OPENING_BOOK[()]` (used a FEN where the
book's move isn't even legal, so a wrongly-applied book would be caught
unambiguously), and `ucinewgame` restoring book eligibility after a
FEN-started game.

Two pre-existing tests in `test_phase4.py`
(`test_go_movetime_outputs_info`, `test_go_depth_outputs_all_info_lines`)
broke: their bare `position startpos` fixture now legitimately hits the
book (correct new behavior) and returns an instant `bestmove` with no
`info depth` lines — which broke what those tests were actually
checking (info-line output shape during a real search, not opening-book
behavior). Fixed by changing their fixture to an off-book `1.a3` line,
without touching either test's actual assertions. Full `fastpy-engine`
suite: 272/272 (265 baseline + 7 new). `fastpy check engine.py` zero
errors, `run.py` parses clean (both unaffected beyond the driver-level
additions — `engine.py` itself untouched this part).

Manually verified the compiled binary too, same approach as D-92/D-93
(no automated pytest coverage exists for `uci_main.cpp`): 6 interactive
UCI sessions reproducing every scenario above against the real binary,
including exact latency (fresh startpos → `e2e4` in 1.3ms).

Docs updated: `DECISIONS.md` (D-94), `ROADMAP.md` (closed out this item;
two carried-over options plus a new "expand the book" option listed for
next session's decision), this file.

**Files changed this part:** `fastpy-engine/run.py`,
`fastpy-engine/native/uci_main.cpp`, `fastpy-engine/tests/test_uci.py`,
`fastpy-engine/tests/test_phase4.py`. `engine.py` untouched this part.
`fastpy` repo untouched this part.

### Part 5 (same session, continued): genuine wall-clock time management + real stop/quit for Python-mode `run.py` (D-95)
Picked up immediately after presenting D-94's files, per Gokul's
"Continue to next" — again no queued task, required an actual pick
among the three carried-over options. Chose bringing genuine wall-clock
time management to Python-mode's `run.py` over Lazy SMP (bigger,
deferred since D-74) or further opening-book expansion — smaller in
scope, closes a real capability gap between the two drivers, and
mirrors D-92/D-93's already-proven native design closely.

`_stop_watcher_py()` (new): a `threading.Thread` spawned once per `go`
command, mirroring `native/uci_main.cpp`'s `stop_watcher()` almost
exactly — exclusively owns stdin for the search's duration, polls a
real wall-clock deadline every ~10ms alongside stdin, calls
`stop_request()` on `stop`/`quit` or deadline expiry.
`_iterative_deepening_py()` checks `stop_requested()` at the top of its
depth loop (before starting a new depth — required to prevent a
stop-triggered abort from corrupting an already-trusted depth's result
via `_find_best_move_py()`'s move-0-always-trusted guarantee, D-85) and
again after each depth's info line. `go infinite` no longer caps at a
fixed 5000ms — a real external stop now, matching native.

**Two real bugs found and fixed along the way, not anticipated going
in:**

1. `engine.py`'s `stop_clear()`/`stop_request()` (from D-92) silently
   discarded their writes under plain Python execution — missing
   `global STOP_FLAG` meant `STOP_FLAG = True` created a function-local
   variable instead of writing the module global (a genuine Python-vs-
   compiled scoping divergence invisible to `fastpy check`, invisible
   under compiled execution, and invisible under D-92 too since D-92
   only ever called these from native code). Fixed at the transpiler
   level: `core/parser.py` gained `visit_Global()` — a `global NAME`
   statement is a pure no-op in the emitted IR (compiled C++ needs
   nothing for it) but makes the identical source also correct under
   plain Python. Every other global in `engine.py` is array-shaped and
   was never at risk (indexed assignment doesn't rebind the name).

2. A genuine `sys.stdin` buffered-read-ahead bug: a single
   `readline()` call can silently consume bytes belonging to a LATER
   command already sitting in the pipe, invisible to a subsequent
   `select()` (which only sees new bytes at the raw fd level, not bytes
   already vacuumed into `TextIOWrapper`'s private buffer). Confirmed
   with a minimal two-reader repro that hung indefinitely; `buffering=1`
   and a small `BufferedReader` size did NOT fix it (tried both, still
   hung); switching to raw byte-at-a-time `os.read()` did. Added
   `_read_line_raw()` and switched BOTH `uci_loop()`'s main loop and
   `_stop_watcher_py()` to use it exclusively — `sys.stdin.readline()`
   is no longer used anywhere in this file's UCI handling. Per-byte
   syscall overhead is negligible for short, GUI-paced UCI lines.

**Verification:** Full `fastpy` suite 386/386 (parser's new
`visit_Global()`, otherwise unaffected). Full `fastpy-engine` suite:
276/276 (272 baseline + 4 new `TestGenuineStop` tests: `go infinite` +
`stop` returning promptly, `quit` mid-search exiting cleanly, movetime
overshoot staying small, uninterrupted search unaffected). One
pre-existing `test_phase4.py` test needed its own dedicated subprocess
sequencing — `_run_uci()`'s shared helper batches a trailing `quit`
into the same write as the test commands, and D-95's real watcher now
correctly honors that already-buffered `quit` almost instantly
(previously invisible until the search finished on its own — exactly
the bug D-95 fixed), cutting the search short after depth 1. That's
correct new behavior, not a regression, so the fix was read-until-
bestmove-then-quit sequencing, not reverting anything. `fastpy check
engine.py` zero errors, `run.py` parses clean. Directly re-verified the
original failure scenario end-to-end: went from a 5+ second hang
(`stop` never detected) to 342ms after both fixes.

Docs updated: `DECISIONS.md` (D-95), `ROADMAP.md` (closed out this
item; two carried-over options remain for next session's decision),
this file.

**Files changed this part:** `fastpy/core/parser.py`,
`fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/tests/test_uci.py`, `fastpy-engine/tests/test_phase4.py`.
`native/uci_main.cpp` untouched this part — Python-mode only.

---

## Session 54 — async UCI `stop` shipped, without the background thread D-85 already rejected
**Status:** COMPLETE ✅ — `fastpy-engine/native/uci_main.cpp` changed;
`docs/DECISIONS.md` (D-90), `docs/ROADMAP.md`, `docs/ENGINE_ARCHITECTURE.md`,
this file updated. `engine.py`/`run.py` both untouched (confirmed
byte-identical/unmodified); `fastpy` repo untouched.

### `Continue` trigger
Resumed directly from Session 53, which had finished its own work
(D-89, the depth-5 residual fix) but not yet called `present_files` on
the deliverables — did that first. A second `Continue` then picked up
ROADMAP's freshly-updated NEXT UP: async UCI `stop`, the one
substantial item left open across Sessions 48-52-53.

### Design
D-85 already tried a background-watchdog-thread design for a related
problem (wall-clock time budgets) and rejected it directly: a plain
shared flag written by one thread and read inside the compiled search's
hot loop by another is a genuine C++ data race under `-O3` (a minimal
repro hung forever), and fixing the read side properly needs a
volatile/atomic type in FastPy's dialect — a real transpiler feature,
explicitly flagged as multi-session, not something to add to fix one
UCI command. Reused the exact same conclusion for `stop` (the read side
would live in engine.py's compiled code either way) rather than
re-testing an approach D-85 already found broken.

Shipped instead: no threading at all. `go()`'s iterative-deepening loop
already returns to the single calling thread between every completed
depth (the same point `NODE_BUDGET` is checked). Added
`stdin_has_pending_line()` — `poll()` with a 0ms timeout — to check,
non-blockingly, whether a line is already sitting in stdin's buffer at
that point; if so, read and dispatch it (`stop` or `quit`) immediately
instead of waiting for `go()` to finish every requested depth. Zero
shared mutable state, so this is race-free by construction, not merely
race-free in the cases tested.

Also added `go infinite` parsing (previously silently fell through to
the 1000ms default — infinite mode had no way to ever stop on its own
even in principle), and threaded a `quit_requested` output flag from
`go()` back to `main()` so a `quit` consumed mid-search during polling
doesn't get read a second time at the top level (which would hang).

### A test-harness pitfall caught before trusting any result
First verification attempt piped all commands at once
(`printf '...go depth 5\nquit\n' | binary`) and saw `go depth 5` stop
after depth 1 — looked like a regression. Root cause: with every line
already in the pipe buffer up front, `poll()` correctly reports `quit`
as pending the instant depth 1 finishes — indistinguishable from a real
GUI that waited for `bestmove` first, since the buffer looks identical
either way. Not an engine bug; a test-harness artifact from not
matching how real UCI GUIs actually communicate (one line, wait for the
response, then the next line). Fixed by writing a proper interactive
`subprocess`-based harness (send → block-read-until-expected-prefix →
send next) and re-verified against that instead.

### Verification
- `go depth 5` (interactive harness): all 5 depths ran, output
  identical to D-89's just-fixed exact-match baseline (`c4b3`/-22,
  `f3g5`/-16, `b1c3`/11, `b1c3`/2, `b1c3`/-3).
- `go movetime 500`: unaffected.
- Pre-emptive `stop` (sent before any `go`): harmless no-op; a
  subsequent `go depth 3` runs normally afterward.
- `go infinite` + `stop` sent 1.5s in: honored, but not until depth 11
  completed — **37.7s stop→bestmove latency**, because depth 11 alone
  took that long (1.27M→39.05M nodes, ~30x jump from depth 10) at this
  branching factor and ~1M nodes/sec native speed. Documented plainly
  as depth-boundary granularity, not mid-node — a real, sometimes-severe
  limitation, not hidden behind "it technically works."
- `quit` during an active search: process exits cleanly (return code 0),
  no hang.
- Rebuild via `training/build_uci_engine.py`: clean `-O3` compile.
- Full `fastpy-engine` suite: 265/265 — unaffected by construction, not
  just in practice: `tests/test_uci.py` spawns `run.py` (Python-mode
  UCI), never the compiled native binary, and no pytest coverage of
  `native/uci_main.cpp` exists (build cost ~110-150s per depth per the
  established GCC-pathology estimate, too expensive for a per-test
  fixture — consistent with how D-84/D-85 also verified native-only
  changes manually).
- `engine.py` reconfirmed byte-identical to pre-session `main`; `run.py`
  unmodified from D-89's session-start state.

### Not done this session
True mid-node `stop` interruption remains blocked on the same
prerequisite D-85 already identified: a volatile/atomic type in
FastPy's dialect. Real, well-scoped, multi-session feature candidate —
not attempted here, and not something to squeeze into either this
session or a future one without treating it as its own item.

**Files changed:**
- `fastpy-engine/native/uci_main.cpp` — `stdin_has_pending_line()`
  added; `go()` polls it at each depth boundary for `stop`/`quit`;
  `go infinite` parsing added; `main()`'s `go` handler threads through
  a `quit_requested` flag
- `docs/DECISIONS.md` — D-90
- `docs/ENGINE_ARCHITECTURE.md` — "No async stop support" limitation
  replaced with the real Session 53 status and measured latency
- `docs/ROADMAP.md` — async stop item marked done; NEXT UP reset to an
  actual open decision (volatile/atomic transpiler feature, Lazy SMP,
  or something outside search/UCI)
- `docs/SESSION_LOG.md` — this entry

---

## Session 53 — depth-5 residual (D-88) closed: Python-mode's move-tie-break wasn't a real mirror of the compiled sort
**Status:** COMPLETE ✅ — `fastpy-engine/run.py` changed; `docs/DECISIONS.md`
(D-89), `docs/ROADMAP.md`, this file updated. `engine.py` untouched
(confirmed byte-identical to pre-session `main`); `fastpy` repo untouched.

### `Go` trigger — baseline re-verified first
Freshly pulled both repos via `codeload.github.com` tarballs. `fastpy`
suite: **372/372**. `fastpy-engine` suite: **265/265**. `run.py`/`engine.py`
both `ast.parse()` clean. `fastpy check engine.py` — zero errors. All
matched Session 52's account exactly.

### Task chosen
ROADMAP's NEXT UP left two open options from Session 52: chase the
depth-5 residual divergence further (needs per-node tracing to actually
confirm the "path-order variance" guess), or async UCI `stop` support
(needs a background-thread architecture change, and D-85 already found
and rejected one such design for a data race). Picked the residual —
fully self-contained, no concurrency risk, and three sessions running
(48/50/52) have flagged it as an open question without ever actually
tracing it.

### Method
Built the real native UCI binary via `training/build_uci_engine.py` and
ran it depth-by-depth (1-5) on the standing tactical FEN
(`r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4`)
alongside `run.py`'s `_find_best_move_py()` on the identical position.
Reproduced D-88's exact finding first: depths 1-4 matched, depth 5
diverged (native `b1c3`/-3, Python `f3g5`/-5).

### First hypothesis ruled out
Replicated `engine.py`'s exact selection-sort tie-break for the *root*
move list only, leaving recursive calls untouched — depth 5 still picked
`f3g5`. Root-level ordering alone wasn't the (sole) cause.

### Real cause
`engine.py`'s compiled `sort_moves()` is an in-place O(n²) selection
sort — not stable. `run.py`'s Python-mode mirror ordered moves via
`move_list.sort(key=lambda x: -x[1])` (Timsort, stable) at *both* the
root and every interior node — D-88 never checked interior-node
ordering, only the root's. For equal-scored moves, a stable sort
preserves original (move-generation) order; the selection sort promotes
the first remaining max-scoring element via a swap that can reorder
same-scored moves once even one swap has happened. Present at every
node of the tree, not just the root.

### Fix
`run.py` gained `_sort_moves_py()` — a direct port of `engine.py`'s
selection-sort tie-break logic, operating on `(move, score)` tuples —
used at both existing `move_list.sort(...)` call sites (`_alpha_beta_py`'s
interior ordering, `_find_best_move_py`'s root ordering). No change to
move generation, evaluation, pruning, or TT logic — purely a tie-break
fix. `engine.py` untouched.

### Verification
- Rebuilt best-move/score comparison at every depth 1-5 on the tactical
  FEN: now matches native **exactly** at every depth, including depth 5
  (`b1c3`/-3, identical to native — the exact case that was open).
- Cross-checked on startpos too (the other standing benchmark): depths
  1-5 also match exactly (`b1c3`/`b1c3`/`g1f3`/`g1f3`/`g1f3`, scores
  `48`/`16`/`39`/`12`/`29` — identical to native at every depth).
- Node *counts* still differ between drivers even after the fix (e.g.
  startpos depth 5: native 17,352 vs. Python-mode 10,716) — expected,
  not concerning: hash-move promotion via `list.remove()`/`list.insert()`
  and iterative-deepening TT-warm sequencing aren't byte-identical
  processes between the two drivers even with matching tie-breaks. What
  matters — the actual search decision at each depth — now agrees
  exactly.
- `engine.py` reconfirmed byte-identical to pre-session `main` via
  direct `diff` — this was entirely a Python-mode mirror-fidelity fix,
  not a compiled-engine or transpiler change.
- Full `fastpy-engine` suite: **265/265**, zero test changes needed.
- `fastpy check engine.py` — zero errors (unaffected).

### Not done this session
Async UCI `stop` support remains the one substantial item still open
from Sessions 48-52 — needs a bigger architecture change (background
thread + main loop polling stdin) and real care given D-85's rejected
first attempt at a similar design. Needs a decision at the start of the
next session: attempt it now, or defer it explicitly with reasoning the
way Lazy SMP was deferred in D-74.

**Files changed:**
- `fastpy-engine/run.py` — `_sort_moves_py()` added, both existing
  `move_list.sort(...)` call sites route through it
- `docs/DECISIONS.md` — D-89
- `docs/ROADMAP.md` — depth-5 residual item marked done with root cause;
  NEXT UP updated to async UCI `stop`
- `docs/SESSION_LOG.md` — this entry

---

## Session 52 — chased search-driver windowing to its real root cause: a `fastpy` transpiler bug, not (only) windowing
**Status:** COMPLETE ✅ — `fastpy/core/emitter.py`, `fastpy/tests/test_emitter.py`,
`fastpy-engine/native/uci_main.cpp` changed; `docs/DECISIONS.md` (D-88),
`docs/ROADMAP.md`, `docs/ENGINE_ARCHITECTURE.md`, this file updated.
`engine.py`/`run.py` untouched — the real bug lived in the transpiler.

### Task chosen
Last open carried-over option from Sessions 50/51: search-driver
windowing reconciliation, over async UCI `stop` (D-85 already tried and
rejected one background-thread design for a data race — `stop` needs
the same architecture change and real care next time, not this
session).

### First fix — matched the documented hypothesis, then tested it
`ENGINE_ARCHITECTURE.md` (from D-84) attributed the native/Python
best-move divergence to windowing: native always searched full-width,
never replicating `run.py`'s aspiration-window narrowing. Added the
identical window shape to `native/uci_main.cpp`'s `go()` — same
`ASPIRATION_WINDOW=50`, ×4 widen-on-fail, `ASPIRATION_START_DEPTH=4`
(D-43/D-44) — plus a native-only budget-aware exit from the retry loop.

**Tested it directly instead of assuming it worked.** Ran the standing
tactical FEN through both drivers: best move still diverged, and
depth-1 scores already differed (`-21` vs `-22`) *before* aspiration
windows even engage. Windowing could not be the (sole) explanation.

### Real root cause
Compared `engine.py`'s compiled search functions against `run.py`'s
hand-maintained Python mirrors (which exist because several `engine.py`
functions use local arrays that don't execute in plain Python) function
by function — all structurally faithful. The actual divergence:
`nnue_output_from_hidden()`'s `score: int32 = output // NNUE_SCALE`.
Computed the tactical FEN's root `output` directly: `-6389`. Python's
`-6389 // 64 == -100` (floors); C++'s `-6389 / 64 == -99` (truncates,
since `//` was emitted as plain C++ `/`). Python's `//` floors toward
negative infinity; C++'s native `/` for signed integers truncates
toward zero — these disagree whenever the result is negative with a
nonzero remainder, which NNUE evaluation hits on roughly half of all
calls (`output` is negative about as often as not).

**This is a `fastpy` transpiler bug** — `core/emitter.py`'s
`_CPP_BIN_OP` mapped `"//": "/"` unconditionally. Same latent bug shape
exists for `%` (unused in `engine.py` today, fixed anyway rather than
left for the next file that uses it).

### Fix
`core/emitter.py` now emits `fastpy_floordiv`/`fastpy_mod` — small
`static inline` templates, unconditional per Core Rule 5's
zero-analysis principle — into every generated file's preamble.
`_emit_binop` routes `"//"`/`"%"` through them instead of naive C++
`/`/`%`.

### Verification
- `fastpy` suite: 367→372. 5 new tests in `test_emitter.py`: emission
  shape checks, plus two that actually **compile and run** the emitted
  C++ against a table of positive/negative/exact-division cases and
  check the result against real Python `//`/`%` on the identical
  operands (following `test_toolchain.py`'s existing compile-and-run
  pattern) — a string-shape check alone can't catch a helper that's
  syntactically present but numerically wrong.
- `fastpy check engine.py` — zero errors.
- `fastpy-engine` suite — 265/265 unaffected (Python mode never went
  through the buggy emitted C++).
- Rebuilt the native binary with the fixed transpiler: tactical-FEN
  depths 1-4 now match Python mode **exactly** (previously diverged
  from depth 1). `perft(1/2/3)` at this position confirmed identical
  between drivers (33/930/30542 both) — move generation was never the
  issue, ruled out definitively via a custom probe binary rather than
  left assumed.
- Depth 5 still shows a small residual (`b1c3` vs `f3g5`, ~2cp) — not
  chased further. Most likely ordinary alpha-beta path-order variance
  between compiled and interpreted execution of the identical
  algorithm; not confirmed, flagged honestly as unresolved.

### Not done this session
The depth-5 residual isn't explained with certainty, and async UCI
`stop` is still open. Both need a decision at the start of the next
session.

**Files changed:**
- `fastpy/core/emitter.py` — the actual fix (`fastpy_floordiv`/
  `fastpy_mod` helpers, `_emit_binop` routing)
- `fastpy/tests/test_emitter.py` — 5 new tests, 2 compile-and-run
- `fastpy-engine/native/uci_main.cpp` — aspiration windows added
  (necessary, though not sufficient on its own — this write-up is
  honest about that)
- `docs/DECISIONS.md` — D-88
- `docs/ROADMAP.md` — windowing item marked done with the corrected
  root cause; NEXT UP updated
- `docs/ENGINE_ARCHITECTURE.md` — "Known limitations" entry corrected
  (previous windowing-only hypothesis was incomplete)

---

## Session 51 — `PROMO_ROOK` added, closing the gap Session 48 found and documented
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`, `fastpy-engine/run.py`,
`fastpy-engine/native/uci_main.cpp`, `fastpy-engine/tests/test_move_gen.py`
changed; `docs/DECISIONS.md` (D-87), `docs/ROADMAP.md`,
`docs/ENGINE_ARCHITECTURE.md`, this file updated.

### Task chosen
Session 50 (baseline-recovery only, no feature work) left three
carried-over options open. Picked `PROMO_ROOK`: smallest, most
self-contained real gap, no architecture change required, already
documented in detail by Session 48 (D-84) when it was first found.

### What changed
- **Bit layout:** promotion field widened 2→3 bits (bits 12-14, was
  12-13) to fit a 5th value (`PROMO_NONE=0, KNIGHT=1, BISHOP=2, ROOK=3,
  QUEEN=4`); flags field shifted up to bits 15-16 accordingly.
  `move_from`/`move_to` untouched.
- **`engine.py`:** all 6 promotion move-gen call sites now emit a
  `PROMO_ROOK` choice alongside Q/N/B; `make_move()` gained an explicit
  `elif promo == PROMO_ROOK` branch for both colors (closing the
  catch-all-`else`-silently-defaults-to-bishop gap, the same bug shape
  D-61/D-65/D-86 keep finding).
- **`run.py`:** `_move_to_uci`/`_parse_uci_move` gained `'r'`
  suffix support.
- **`native/uci_main.cpp`:** `move_to_uci`/`find_legal_move` — the
  dead `want_promo = -1` branch Session 48 documented is now a real
  `PROMO_ROOK` match.
- Checked and confirmed no change needed: `mvv_lva()`, `is_quiet_move()`
  (neither branches on promo piece type), `make_move_with_accumulator()`
  (generic bitboard diff, picks up the new rook placement automatically).

### Verification
- `fastpy check engine.py` — zero errors.
- Full `fastpy-engine` suite — **265/265** (257 existing + 8 new tests
  in `test_move_gen.py`: move-gen choice count for white/black, the
  widened bit-encoding round-trip in isolation, flag-field isolation
  after the shift, UCI string round-trip, and a `generate_legal_moves`-
  level position check).
- Existing perft baselines (startpos 1-4, Kiwipete 1-3) confirmed
  unaffected — none of those reference positions reach a pawn-near-
  promotion state, so this gap was never exercised by the perft suite
  at all; worth remembering next time perft "passing" is read as "move
  generation is correct" — it only covers positions perft's reference
  values actually reach.
- **End-to-end, not just unit tests:** built the real native binary via
  `training/build_uci_engine.py` and drove it over actual UCI stdin/
  stdout with `position fen 8/1P6/8/8/8/2k5/8/2K5 w - - 0 1 moves b7b8r`
  — confirmed `find_legal_move()` matched and applied the move (board
  correctly flipped to black-to-move on the next `go`), the exact
  failure mode this session closes. Build artifacts (binary, combined
  `.cpp`) not committed — local verification only.

### Not done this session
Search-driver windowing reconciliation and async UCI `stop` remain the
two open carried-over options; still need a decision at the start of
the next session.

**Files changed:**
- `fastpy-engine/engine.py` — `PROMO_ROOK` constant, widened bit
  layout, move-gen + `make_move()` updates
- `fastpy-engine/run.py` — UCI string round-trip for `'r'` suffix
- `fastpy-engine/native/uci_main.cpp` — `move_to_uci`/`find_legal_move`
  fixed to actually handle rook promotion
- `fastpy-engine/tests/test_move_gen.py` — 8 new tests
- `docs/DECISIONS.md` — D-87
- `docs/ROADMAP.md` — `PROMO_ROOK` item marked done; NEXT UP updated
- `docs/ENGINE_ARCHITECTURE.md` — move-encoding bit diagram updated;
  "no rook underpromotion" limitation struck through with a pointer to
  D-87

---

## Session 50 — baseline verification caught Session 49's `run.py` mirror, which was logged as shipped but never committed
**Status:** COMPLETE ✅ — `fastpy-engine/run.py` changed; `docs/DECISIONS.md`
(D-86), `docs/ROADMAP.md`, this file updated. `engine.py` untouched
(already correct).

### `Go`-trigger baseline check found a real gap immediately
Per the ROADMAP.md PROCESS item (added after D-61/D-65), this session
opened by pulling both repos fresh via `codeload.github.com` and running
the full test suite against `main` before trusting anything in
SESSION_LOG.md's Session 49 entry. `fastpy` passed clean (367/367,
`fastpy check engine.py` zero errors). `fastpy-engine` did not:
`tests/test_node_budget.py` failed all 14 tests with
`AttributeError: module 'run' has no attribute 'node_budget_clear'`.

### Root cause
Session 49's SESSION_LOG entry lists `fastpy-engine/run.py` under "Files
changed," describes the mirrored `node_budget_clear`/`set`/`exceeded`
logic in detail, and claims "full suite 257/257." `grep -n "node_budget"
run.py` against the actual committed file returned zero matches —
`engine.py` had the complete, correct Session 49 implementation;
`run.py`'s mirror simply wasn't there. Same failure shape as D-61
(Sessions 24-26) and D-65 (Session 30): a change described as complete
in the log was never actually landed on `main`. Cause not independently
determined beyond "the committed file doesn't match the log" — not
asserting the tests didn't really pass at some point in Session 49,
just that whatever passed then isn't what's on `main` now.

### Fix
Added the missing mirror to `run.py`, matching `engine.py` exactly:
- Imported `node_budget_clear`, `node_budget_set`, `node_budget_exceeded`
  from `engine` in the top-level import block.
- `_engine_module.NODE_BUDGET = [0]` added alongside the existing
  `NODE_COUNT` Python-mode array-sizing fix-up (both start as `[]` under
  FastPy's zero-init convention and need real sizing to be indexable
  from plain Python).
- `_quiescence_py` and `_alpha_beta_py` both gained a
  `node_budget_exceeded()` check immediately after the node-count
  increment, returning `alpha` unchanged — line-for-line the same shape
  as `engine.py`'s `quiescence()`/`alpha_beta()`.
- `_find_best_move_py`'s root loop was rewritten from a plain
  `for m in ordered` into an `enumerate`-based loop matching
  `engine.py`'s move-0-trust guard: don't start a new root move once a
  prior move already blew the budget, always trust move 0 regardless
  (guarantees a real legal move is returned even under a near-zero
  budget), and skip the TT store entirely when the depth was aborted
  (an incomplete root scan isn't a true full-width `TT_EXACT` result).

### Verification
- `fastpy check engine.py` — zero errors (engine.py untouched).
- `python -m pytest tests/` in `fastpy-engine` — **257/257**, matching
  the count Session 49 originally claimed.
- Re-ran the full suite in an explicit reversed file order
  (`test_uci.py` → ... → `test_move_gen.py`) — still 257/257, no
  order-dependency residue, the same class of check D-85 itself added
  after finding a real order-dependency bug.
- `fastpy` suite re-confirmed 367/367 against the same fresh pull.

### Not done this session
No new feature work — Session 48's carried-over options (search-driver
windowing reconciliation, `PROMO_ROOK`, async UCI `stop`) are still open
and still need a decision at the start of the next session. This session
was entirely baseline-recovery, the same category as D-65's Session 30.

**Files changed:**
- `fastpy-engine/run.py` — node-budget mirror added (imports, `NODE_BUDGET`
  sizing, `_quiescence_py`/`_alpha_beta_py` budget checks,
  `_find_best_move_py` root-loop rewrite)
- `docs/DECISIONS.md` — D-86
- `docs/ROADMAP.md` — Session 49's `run.py`-mirror line item corrected
  from claimed-done to actually-done-now; NEXT UP unchanged (still
  needs a decision next session)

---

## Session 49 — native UCI mid-search time management, and a rejected first design
**Status:** COMPLETE ✅ — `engine.py`, `run.py`, `native/uci_main.cpp`,
`training/build_uci_engine.py`, `tests/test_node_budget.py` (NEW) changed;
`docs/DECISIONS.md` (D-85), `docs/ROADMAP.md`, this file updated

### Picked up Session 48's open item
Gokul delegated the choice among Session 48's four listed options; picked
"tighten the native UCI driver's time management" — the one with real
practical risk (an engine that can blow its clock budget by multiple
seconds isn't safe for actual timed games) and the most self-contained
scope (touches `native/uci_main.cpp` + a small `engine.py` addition, not
`engine.py`'s dialect surface in any deep way).

### First design built, tested, and rejected — a genuine data race
Initial approach: a background watchdog thread in `uci_main.cpp` sleeps
until the deadline, then sets a shared `SEARCH_STOP` flag; compiled
`alpha_beta()`/`quiescence()` poll it periodically and unwind. Built this
completely (including a condition-variable-based early-wake mechanism)
and tested it directly against the exact overshoot scenario from Session
48 — **it didn't work**. A depth ran to full completion (850K+ nodes)
regardless of the flag. Root-caused with a minimal 15-line standalone
repro (a tight `while (FLAG[0] == 0)` loop with a second thread setting
`FLAG[0]=1` after 200ms) — it hung forever at `-O3`. This is correct
compiler behavior, not a bug in GCC: a plain (non-atomic) global written
by one thread and read by another without synchronization is a data race
under the C++ memory model, and the standard permits the optimizer to
assume it never changes. Fixing this properly would need the read side
(FastPy-emitted `engine.cpp`) declared `volatile`/atomic, which isn't
something the emitter can special-case for one array without a real
transpiler feature (Core Rule 5 keeps it from special-casing individual
globals) — out of scope for this session. Documented as a rejected
design rather than silently discarded, since the next person to touch
this shouldn't have to rediscover why a "thread sets a flag" approach
looks reasonable but doesn't actually work here.

### What shipped instead: a node-count budget, no threading at all
`engine.py` gained `NODE_BUDGET: uint64[1]` +
`node_budget_clear()`/`node_budget_set()`/`node_budget_exceeded()`,
mirroring the existing `NODE_COUNT`/`nodes_reset()`/`nodes_get()`
convention. The budget is written exactly **once** per depth, by the
single thread already driving the search (`uci_main.cpp`'s `go()`,
before calling `find_best_move()` for that depth) — never touched by any
other thread while that depth's search is in flight. No concurrent
write, so no data race to reason about; ordinary non-atomic reads inside
`alpha_beta()`/`quiescence()` are fully well-defined. `find_best_move()`'s
root loop always trusts move 0's result (guarantees a real legal move is
returned even under a near-zero budget) and discards any later move
whose own search was interrupted, rather than letting a partial/
unreliable score overwrite an earlier fully-searched move — mirrored
identically in `run.py`'s `_alpha_beta_py`/`_quiescence_py`/
`_find_best_move_py` per the project's "Python mirrors must stay
behaviourally identical" convention, though Python-mode never actually
calls `node_budget_set()` so this is a no-op there by design.

### A real bug caught mid-session: the safety margin was backwards
First cut of `uci_main.cpp`'s per-depth budget computation multiplied
the projected node budget by a 2x "safety multiplier," reasoning it
would avoid stopping too early. Measured result: a 500ms budget ran to
730ms — **worse than doing nothing would have implied**, and exactly
the overshoot this feature exists to prevent. The fix was catching the
backwards logic: `node_budget_exceeded()` is checked on essentially
every node (fine-grained), so there's no coverage reason to pad the
budget upward — doing so just directly inflates the deadline. Replaced
with a `kBudgetFraction = 0.9` (shrinks the projection, leaving headroom
below the deadline) instead of a multiplier that grows it. Re-measured
after the fix: 500ms→484ms, 1000ms→1005ms, 2000ms→1919ms, and a 50ms
stress case→55ms. All close to budget; none overshoot by anywhere near
a full depth like the pre-session baseline did (a 500ms budget was
previously observed producing an 892ms run in this session's own
before/after comparison, before the fix collapsed that to 451-484ms
range across repeated runs).

### Verification
- `go depth N` (no time limit) reconfirmed byte-identical output to
  pre-session (`b1c3` at depth 1, same nodes/score at every depth up to
  8) — the budget mechanism is inert when `movetime_ms <= 0`.
- Near-zero budget (`movetime 50`) still always returns a real legal
  move, never `bestmove 0000`.
- `fastpy check engine.py` — zero errors. `fastpy emit` +
  direct `g++ -O3` compile — clean (~110-150s, matches the established
  GCC-pathology-on-this-file estimate from D-75/D-79/D-80/D-81).
- 14 new tests in `tests/test_node_budget.py` covering the budget
  primitives, search unwind behavior, root-loop guarding, and TT-
  pollution avoidance for an aborted depth.
- Full suite: **257/257** (243 baseline + 14 new), all passing.
- Along the way, the new test file exposed (didn't introduce) a
  pre-existing test-isolation gap: `test_phase4.py`'s
  `test_depth0_returns_qsearch` implicitly depended on the TT being
  empty via pytest's alphabetical file execution order, not its own
  `setup_method` — broke once `test_node_budget.py` (sorts before
  `test_phase4.py`) left a same-hash TT entry behind from an earlier
  real-search test. Root-caused correctly (bisected by running file
  pairs in isolation) before fixing — fixed by giving the new file's
  search-running test classes their own `teardown_method`s rather than
  touching `test_phase4.py`, and reconfirmed order-independence by
  running the suite forwards, reversed, and interleaved with
  `test_uci.py`.

### Still open, noted honestly rather than silently
Async UCI `stop` (a GUI sending `stop` while a search is actually in
flight) remains unimplemented — this session's fix only bounds a *time
budget* expiring during search; the main loop still can't notice an
explicit `stop` command arriving mid-search, since it's blocked
synchronously inside `go()` and not polling stdin. Documented directly
in `uci_main.cpp`'s comment: real async stop needs the search itself
moved to a background thread with the main loop continuing to read
stdin — a bigger architecture change, not attempted here.

**Files changed:**
- `fastpy-engine/engine.py` — `NODE_BUDGET` global +
  `node_budget_clear()`/`node_budget_set()`/`node_budget_exceeded()`;
  `quiescence()`/`alpha_beta()` poll `node_budget_exceeded()` after the
  node-count increment; `find_best_move()`'s root loop guards against an
  aborted depth corrupting the chosen move, and skips the TT store when
  aborted
- `fastpy-engine/run.py` — mirrors the above in `_alpha_beta_py`/
  `_quiescence_py`/`_find_best_move_py`; `NODE_BUDGET` sized for
  Python mode alongside `NODE_COUNT`
- `fastpy-engine/native/uci_main.cpp` — `go()` computes a per-depth node
  budget from running nodes/sec × remaining time (× 0.9 headroom
  fraction), calls `node_budget_set()` before each depth when a deadline
  exists; no threading (the watchdog-thread design was built, tested,
  and reverted within this session — see above)
- `fastpy-engine/training/build_uci_engine.py` — `-pthread` added then
  removed (only needed for the reverted threaded design)
- `fastpy-engine/tests/test_node_budget.py` — NEW, 14 tests
- `docs/DECISIONS.md` — D-85
- `docs/ROADMAP.md` — Session 48's NEXT UP item checked off, this
  session's work added, new NEXT UP written

---

## Session 48 — native UCI play: real gameplay at compiled speed, not just Python mode
**Status:** COMPLETE ✅ — new `fastpy-engine/native/uci_main.cpp`,
`fastpy-engine/training/build_uci_engine.py`; `docs/ENGINE_ARCHITECTURE.md`
updated (stale phase table fixed too); `engine.py` and
`training/generate_data.py` unchanged

### "Do it" — asked directly whether the engine was ready for game play
Answered honestly: correctness yes (rules, UCI protocol, evaluation all
solid per Sessions 44-47), but real play only ever happened via
`python3 run.py`'s pure-Python UCI loop — the compiled `./engine`
binary's `main()` is a deliberate no-op stub (Core Rule 6), so the
project's actual value proposition (compiled C++ speed) was never
reachable during play. Told to close that gap.

### Key discovery: nothing needed to be added to engine.py
`engine.py` already contains a complete, compiled search stack —
`find_best_move()`, `generate_legal_moves()`, `make_move()`,
`alpha_beta()`, `perft()` — that `fastpy check`/`fastpy build` have been
exercising every session already. It just had no caller outside
`perft`/the test suite. This meant the whole task was "give it a caller"
rather than "build a search engine in C++."

### What was built, deliberately outside engine.py
- `native/uci_main.cpp` — hand-written C++ (explicitly not FastPy
  dialect; Core Rule 6 still applies to engine.py itself) implementing
  the real UCI protocol loop, FEN parsing, and iterative-deepening/time
  management around the compiled search functions.
- `training/build_uci_engine.py` — emits `engine.cpp` via FastPy's own
  emit path, strips the known no-op `main()` stub (refuses to proceed
  if the stub doesn't match exactly, rather than blind-regexing),
  concatenates with `uci_main.cpp` into one translation unit, compiles
  with the project's standard flags. Full rationale for the
  single-translation-unit approach (vs. separate compile+link) in D-84.

### A real, pre-existing gap surfaced, not introduced
`engine.py` has no `PROMO_ROOK` constant — the compiled move generator
has never supported rook underpromotion. Documented in
`ENGINE_ARCHITECTURE.md` rather than papered over; a GUI-requested rook
underpromotion simply won't match any legal move.

### Verification
- `perft(5)` from startpos via the compiled build = **4,865,609**,
  exactly matching the documented Phase 3 baseline.
- Depth-1 search from startpos matches Python mode bit-for-bit (same
  node count, same score).
- K+P vs K (D-80's benchmark) still picks a sane move through the new
  entry point — confirms the D-81 NNUE fix survived, as expected (same
  weights, same eval, only the driver changed).
- Both `go movetime N` and `go wtime/btime/winc/binc` tested directly.
- Checkmate detection correct (`bestmove 0000` on Fool's mate).
- ~1.5M nodes/sec observed at deeper depths — roughly 50-150x over
  Python mode, position/depth-dependent, not a single fixed multiplier.
- Full 243/243 test suite re-run afterward, unchanged — and `engine.py`
  diffed directly against the pre-session copy to confirm it truly
  wasn't touched, not just assumed.

### Two limitations documented honestly, not hidden
Time management only checks between completed depths (a slow depth can
overshoot the budget by its own full duration — observed directly: a
2,400ms budget produced an 8,601ms final iteration). And the native
driver's full-width iterative deepening can pick a different
(comparably-scored) best move than Python mode on near-equal positions,
since the two drivers don't use the same windowing. Both written up in
`ENGINE_ARCHITECTURE.md`'s new "Native UCI Play" section.

### Also fixed: ENGINE_ARCHITECTURE.md's stale phase table
It still said Phase 4 ("competitive engine") was "🔄 Next" and Phase 5
("NNUE") was "⏳ not started" — both have been done for many sessions.
Fixed, with a note pointing at DECISIONS/SESSION_LOG as the actual
source of truth going forward rather than this summary table.

### Files changed
- `fastpy-engine/native/uci_main.cpp` — NEW
- `fastpy-engine/training/build_uci_engine.py` — NEW
- Docs: `ENGINE_ARCHITECTURE.md` (phase table fix + new section),
  `ROADMAP.md`, `DECISIONS.md` (D-84), `SESSION_LOG.md` (this entry)

### Next session
No specific task queued. Worth considering: tighter mid-search time
checks for the native driver, reconciling the two drivers' search
windowing so they don't diverge on near-equal positions, adding
`PROMO_ROOK` support (low value but a real gap), or something unrelated
to search/UCI entirely. Needs a decision at the start of next session.

---

## Session 47 — node-count "diversity dilution" hypothesis tested: mixed/inconclusive, closing out the D-81 arc
**Status:** COMPLETE ✅ — investigation only, no files changed
(`engine.py`, `training/generate_data.py` unmodified; production remains
v3)

### `Continue` — picked up Session 46's flagged low-priority follow-up
D-81 found v3's tactical-FEN node count regressed vs v2 and guessed
(without testing) that it was a capacity/diversity tension from mixing
endgame data into training. D-82's match result made this non-urgent,
but it was cheap enough to actually test rather than leave as an
unverified guess.

### Test: reduced endgame fraction, not a larger hidden layer
Chose the cheap version of the experiment over the invasive one — rather
than resizing engine.py's compiled `int32[128]` accumulator arrays to
try a bigger hidden layer (real engineering risk for a low-priority
question), retrained on the same v3 self-play data with only 800 of the
3,200 endgame positions (~9% vs v3's ~28%). Called v3b, investigation
only, never shipped.

### Result: not a clean confirmation
Tactical-FEN node count partially recovered toward v2 (v3: 55,905 → v3b:
12,860 → v2: 5,109), consistent with the dilution story. But startpos
node count got *worse* than both v2 and v3 (19,374 vs v2's 14,429 and
v3's 10,584), and the tactical position's best move changed entirely
(`c4b3` instead of `f3g5`, which both v2 and v3 agreed on). A real
capacity/diversity trade-off would predict roughly monotonic movement
back toward v2 on both positions — that's not what happened. More
likely explanation: with ~9,100 positions and fresh random
initialization, which local minimum training lands in is dominated by
run-to-run variance, not smoothly determined by endgame fraction. K+P vs
K fix still held at ~9% endgame density, for what it's worth. Full
numbers and reasoning in D-83.

### Decision: don't pursue further, v3 remains production
The cheap test didn't find a clean effect to chase, so the invasive
larger-hidden-layer version isn't worth doing for a question D-82
already made non-urgent. This closes the ROADMAP line item from
D-81/D-82 as investigated rather than left open.

### Files changed
None. `engine.py` was temporarily swapped to v3b for benchmarking in the
sandbox and restored to v3 immediately after (diff-verified). Docs:
`ROADMAP.md`, `DECISIONS.md` (D-83), `SESSION_LOG.md` (this entry).

### Next session
The v3 NNUE upgrade arc (D-79 through D-83) is fully closed out. No
specific task is queued — next session should pick a direction (search
improvements, turning `self_play_match.py` into a standing regression
check, or something else entirely) rather than defaulting to more NNUE
work by inertia.

---

## Session 46 — v2-vs-v3 self-play match: v3 confirmed a genuine upgrade (10-0-6)
**Status:** COMPLETE ✅ — new `fastpy-engine/training/self_play_match.py`;
no `engine.py`/`generate_data.py` changes (validation-only session)

### `Continue` — picked up Session 45's flagged NEXT UP items
Session 45 (D-81) fixed v2's endgame blind spot with v3 but left a real,
unexplained trade-off (worse node count on the standing tactical-FEN
benchmark) and flagged that D-80's 5-position spot-check was thin
evidence for calling v3 settled. This session addressed both flagged
follow-ups: build a real v2-vs-v3 match, and re-check the K+P vs K fix
on more than one FEN.

### Built a generic two-engine self-play match harness
`training/self_play_match.py` loads two `engine.py`+`run.py` directories
as independent module pairs in one process (sys.modules alias-swap
trick, no subprocess/UCI overhead — see D-82 for the mechanism), plays
them against each other across a small fixed opening book (8 lines × 2
colors = 16 games), and appends results to a TSV as it goes so a
multi-call session can resume mid-match. Kept generic
(`--engine-a-dir`/`--engine-b-dir`) rather than v2/v3-specific, so it's
reusable for whatever comes after v3.

### Caught and fixed two real bugs in the harness before trusting it
`_generate_legal_moves_py()` returns `(moves, count)`, not a bare list —
an early `if not legal:` check was always False regardless of count, so
checkmate/stalemate never fired and games misreported as "no move
returned." A second bug reused the variable name `moves` for both the
per-ply legal-move unpack and the outer move-log list, clobbering the
log. Both fixed and re-verified against a short real-checkmate game
before running the full match. Also discovered along the way: both
engines are fully deterministic, so repeated startpos games with the
same color assignment are identical — switched to an 8-opening book so
16 games are actually 16 independent data points, not 2 repeated 8
times.

### Result: v3 never lost — 10 wins, 6 draws, 0 losses across 16 games
200ms/move, 100-ply cap, TT cleared between games, 8 openings × both
colors. v3 as White: 6W-2D-0L. v3 as Black (v2 as White): 4W-4D-0L. This
is a much stronger signal than D-80's static spot-check — the full
search pipelines actually playing real games, not just scored move
lists at a handful of positions. Full analysis and interpretation in
D-82.

### K+P vs K fix generalization re-checked on 2 more configurations
Scored all legal moves directly on a rook-pawn (a-file) endgame and an
advanced central e-pawn with promotion available — both sane (no
negative-score outliers; promotion correctly valued far above
alternatives in the advanced-pawn case). D-81's fix isn't overfit to the
one exact FEN D-80 tested.

### Files changed
- `fastpy-engine/training/self_play_match.py` — NEW
- `fastpy-engine/training/v2_vs_v3_match_results.tsv` — NEW (raw match
  log, optional/informational — not required for reproducing the result,
  which is fully described in D-82)
- Docs: `ROADMAP.md`, `DECISIONS.md` (D-82), `SESSION_LOG.md` (this entry)

### Next session
D-81's tactical-FEN node-count regression (v3: 55,905 vs v2: 5,109
nodes, depth 5) is still unexplained but downgraded to low-priority —
Session 46 already answered the practical question (is v3 actually
better? yes, decisively). If picked up: try the same v3 dataset with a
larger hidden layer and see if node-count efficiency recovers, which
would confirm it's a capacity/diversity tension rather than something
else. Otherwise, v3 can reasonably be treated as the new baseline going
forward.

---

## Session 45 — v3: fixed v2's endgame blind spot with explicit endgame training data
**Status:** COMPLETE ✅ — `fastpy-engine/engine.py`,
`fastpy-engine/training/generate_data.py` changed

### `Go` — picked up Session 44's flagged NEXT UP item
Session 44 (D-80) confirmed v2 has a real endgame regression (rates the
textbook K+P vs K opposition move as the worst of 8 legal moves) and
left three unweighed options in ROADMAP for fixing it. This session
weighed them and picked one.

### Decision: augment training data (option 1), not a fallback or blend
Chose to generate explicit sparse-endgame positions directly rather than
hope self-play reaches them (option 2, a material-count-gated classical/
v2 fallback, was rejected as inelegant and against the single-unified-
evaluator design; option 3, blending v1/v2, was rejected since v1 likely
shares the same self-play-only data gap). Full reasoning in D-81.

### What was built
`generate_data.py` gained `random_endgame_board()` (places a bag of
piece-field names on random legal squares — pawns not on rank 1/8, kings
not adjacent, side-not-to-move not in check) and 19 `ENDGAME_BAGS`
configurations (K+P/R/Q/N/B vs K both colors, plus simple pairings like
K+R vs K+P). New `--endgame-count` flag mixes these into the same output
array as self-play positions, labelled identically.

### Dataset and training
v3 = 151 self-play games (same depth-1 search-based labels as v2, D-79)
+ 3,200 endgame positions = 11,505 total (~28% endgame vs. v2's ~0%).
Self-play generation chunked across 4 sandbox calls (same wall-clock
constraint D-79 hit); endgame generation was ~2000x faster per-position
(sparse positions, cheap depth-1 search) — 3,200 positions in 3.4s.
Trained with the unmodified `train_nnue.py` (no schema changes needed).

### Result — the specific regression is fixed, with a new honest trade-off
Re-ran D-80's exact K+P vs K benchmark (all 8 legal moves scored
directly): `e2d3` was v2's only negative score (-40, the outlier worst
move) — under v3 it scores **146**, solidly positive alongside every
other legal move (120-175 range). The defect is gone. Startpos depth-5
node count *improved* over v2 (10,584 vs 14,429, same `g1f3` best move).
**But** the tactical FEN from D-77/D-78/D-79/D-80 regressed on node
count: 55,905 under v3 vs v2's 5,109 (still far better than v1's
335,441; same `f3g5` best move at depth 5). Working hypothesis, not
confirmed: spreading the network's fixed 128-hidden-unit capacity across
a more diverse (now endgame-inclusive) distribution costs some of v2's
narrow tactical-position specialization. Re-ran all 5 of D-80's spot-
check positions at depth 4 — no blunders found, checkmate detection
still correct. Full writeup: D-81.

### Verification
- Applied D-79's own lesson: confirmed `init_nnue_weights()` (line 2257)
  and the immediate next function `nnue_accumulate()` (line 100827) by
  direct grep before splicing, then verified programmatically (not just
  visually) that every line outside the replaced block is byte-identical
  to the original file.
- `fastpy check engine.py`: zero errors
- `fastpy build`/direct `g++ -O3` (project's standard flags): clean
  compile (~151s, matches D-75/D-79/D-80's estimate), binary runs and
  exits 0 (documented no-op `main()` stub, Core Rule 6)
- Full `fastpy-engine` suite: **243/243 passing, zero test changes
  needed** (unlike D-79, which needed one)
- `fastpy` suite (367/367) and `fastpy-engine` suite (243/243) both
  re-verified against freshly-pulled `main` at the *start* of this
  session too, per the standing D-61/D-65 process rule

### Files changed
- `fastpy-engine/engine.py` — REPLACE (v3 weights)
- `fastpy-engine/training/generate_data.py` — REPLACE (endgame generator)
- Docs: `ROADMAP.md`, `DECISIONS.md` (D-81), `SESSION_LOG.md` (this entry)

### Next session
v3's tactical-middlegame node-count trade-off (worse than v2, still far
better than v1) is a real, not-yet-understood cost — worth checking
whether it's an inherent capacity/diversity tension or fixable (more
hidden units, more/better-targeted endgame data). Also worth a broader
move-quality check than D-80's 5 positions (e.g. a small v2-vs-v3
self-play match) and confirming the K+P vs K fix generalizes beyond the
one exact FEN tested, before calling v3 a settled upgrade over v2.

---

## Session 44 — v2's move quality spot-checked: confirmed real endgame regression
**Status:** COMPLETE ✅ — investigation only, no source files changed in either repo

### `Continue to next` — picked up Session 43's flagged next step
Session 43 (D-79) got a strong node-count win from v2 but explicitly
flagged that nothing had validated actual move quality, only search
efficiency. This session checked.

### What was done
Compared classical eval, v1, and v2's chosen move + node count at depth
4 across 5 positions: K+P vs K endgame, K+R vs K endgame, the Italian
opening from D-77/D-78, a Fool's-mate checkmate sanity check, and a
closed middlegame structure.

### Result — mixed, and one real problem found
Opening/middlegame positions: no red flags. All three agree or v2 picks
a defensible sharper alternative, consistently with far fewer nodes
(matches D-79). Checkmate detection: correct for all three.

**Endgame is where it breaks.** In a bare K+P vs K position, v2 rates
the textbook-correct king-opposition move (`e2d3`) as **-40** (i.e. bad
for White) while classical eval rates the same move **+115** (good) —
confirmed by scoring all 8 legal moves directly, not just comparing
final search picks. Near-certain cause: v2's training set (150 short,
middlegame-heavy self-play games) contains almost no sparse endgame
positions, so the network has no real signal there and produces close
to arbitrary output on inputs that sparse. Full table and reasoning in
D-80.

### What this means
v2 (currently embedded in `engine.py` per D-79) should NOT be treated as
a strict upgrade over v1 — it's good in the middlegame territory it was
trained on, unreliable in sparse endgames. Not reverted this session
(the middlegame node-count win is real and worth keeping for now), but
flagged clearly rather than left as an implied clean win.

### Verification
No code changes — investigation only, via Python-mode weight-swapping
and direct move scoring. No need to re-run `fastpy check`/`build`/the
test suite since nothing in either repo changed.

### Files changed
- None in either repo. Docs only: `ROADMAP.md`, `DECISIONS.md` (D-80),
  `SESSION_LOG.md` (this entry).

### Next session
Address v2's endgame blind spot before calling it a real upgrade.
ROADMAP lists three candidate approaches (augment training data with
explicit endgame positions; a material-count-gated classical/v2
fallback; blending v1 and v2) without a recommendation yet — that
weighing is real work for its own session. Re-run the baseline check
(both repos' full test suites against freshly-pulled `main`) before
trusting this log.

---

## Session 43 — Second (v2) NNUE training pass, search-based labels — big node-count win, unvalidated strength
**Status:** COMPLETE ✅ — `engine.py`, `tests/test_phase4.py` changed; `training/generate_data.py`, `training/embed_weights.py` extended

### `Continue`/`Next` — picked up Session 42's flagged next step
Session 42 confirmed v1's node-count sensitivity traced back to
depth-to-depth move-ranking instability, and flagged search-based
relabelling as the fix to actually try.

### What was built
`generate_data.py` gained `--label-mode search`: labels now come from a
shallow classical `alpha_beta()` search instead of a static `evaluate()`
snapshot, with NNUE bypassed during generation so v2 doesn't train
against v1's own approximation error. Timing tests showed depth 3
(~2.35s/position) and depth 2 (~0.84s/position) were impractical for a
dataset this session could generate — used depth 1 (~0.03s/position,
still resolves immediate tactics via quiescence) and a much smaller
dataset than v1: 8,478 positions from ~150 games, built up across 14
small chunks (discovered mid-session that `nohup`/background processes
don't persist between tool calls in this sandbox — had to generate
synchronously in small pieces instead).

### Result
Validated in-memory against D-77/D-78's exact benchmark positions before
committing to anything: node counts dropped dramatically — startpos
depth 5 from v1's 266,642 to 14,429 (better than classical eval's own
38,849), the tactical FEN's depth 5 from 335,441 to 5,109. Best-move
choice also far more stable across depths on the tactical position.
Interesting wrinkle: v1's "move-ranking stability" framing doesn't fully
explain it — v2 actually flips its startpos best-move choice *more*
often than v1 did, yet still searches far fewer nodes. Better working
hypothesis (not confirmed): it's about score decisiveness/magnitude
(reflecting real tactical swings from search-based labels), not ranking
stability per se. Full writeup: D-79.

### A real mistake, caught and fixed before delivery
First attempt at embedding v2's weights into `engine.py` used the wrong
function boundary and deleted ~98,500 lines of unrelated engine code
(everything between `init_nnue_weights()` and `evaluate_nnue()`, which
turned out not to be adjacent — `nnue_accumulate()` and the entire rest
of the engine sit in between). Caught immediately by `fastpy check`
failing to import `nnue_accumulate` and the test suite erroring on
missing names — never presented as a deliverable. Recovered by
re-pulling `fastpy-engine`'s `main` branch fresh (which already had
Session 39-41's committed changes — confirmed via `diff` against every
file before trusting it), then redoing the splice against the *correct*
next function, confirmed by direct inspection this time. Full incident
writeup in D-79.

### Other fallout
One test fix: `test_respects_window` asserted a fail-soft
`alpha_beta()`'s result stays within its search window — never a true
invariant for fail-soft search (only fail-hard clamps to the window),
just hadn't been violated under v1's smaller score range. Widened to a
sanity bound.

### Verification
- `fastpy check engine.py`: zero errors
- `fastpy build --optimize=O3`: hit the CLI's internal 120s timeout this
  run (some run-to-run variance around D-75's ~85-90s estimate) —
  verified instead via `fastpy emit` + direct `g++` with the project's
  standard flags (no timeout), compiled clean, stub binary runs and
  exits 0 (Core Rule 6: compiled `main()` is a documented no-op, UCI is
  Python-mode only)
- Full `fastpy-engine` suite: **243/243 passing**
- Node-count benchmark re-confirmed against the actual committed
  `engine.py`, not just the in-memory weight patch — identical numbers
- `fastpy` suite not re-run this session (no changes to that repo)

### Files changed
- `fastpy-engine/engine.py` — REPLACE (v2 weights)
- `fastpy-engine/tests/test_phase4.py` — REPLACE
- `fastpy-engine/training/generate_data.py` — REPLACE (search-label mode)
- `fastpy-engine/training/embed_weights.py` — REPLACE (--note argument)
- Docs: `ROADMAP.md`, `DECISIONS.md` (D-79), `SESSION_LOG.md` (this entry)

### Next session
v2's result is a search-efficiency win, not a validated playing-strength
one — nothing this session measured actual move quality. Worth checking
v2 isn't just pruning aggressively via cruder scores before trusting it
for real play (sample its chosen moves against classical eval's on
non-trivial positions, or a small self-play match between v1/v2/
classical), and worth testing beyond the two opening/early-middlegame
positions carried over from D-77/D-78 — endgame behavior is untested.
Re-run the baseline check (both repos' full test suites against
freshly-pulled `main`) before trusting this log.

---

## Session 42 — Node-count sensitivity investigated: D-77's hypothesis was wrong
**Status:** COMPLETE ✅ — investigation only, no source files changed in either repo

### `Next` — picked up Session 41's flagged next step
Session 41 ended with the startpos depth-5 node-count blowup (~7x) under
NNUE-driven search flagged for investigation, with a specific (untested)
hypothesis about pruning-margin sensitivity to eval-symmetry.

### The hypothesis was wrong — disproved directly
Disabled null-move pruning and futility pruning entirely (one at a time,
then both together) and re-ran the startpos depth-5 benchmark under NNUE
eval: node count stayed at ~266,600 regardless. Whatever's driving the
increase, it isn't those two heuristics reacting to near-zero eval noise.

### Actual cause, confirmed
Isolated cold-TT (no iterative-deepening warm-up) depth-5-only search
from the warm (depths 1-5, shared TT) search `run_benchmark()` actually
runs, for both evaluators (swapping `evaluate_nnue_incremental` for
`evaluate()` via a one-line monkeypatch for a fair comparison):

|  | cold depth-5-only | warm (iterative 1-5) | warm-up speedup |
|---|---|---|---|
| classical | 247,542 | 38,849 | ~6.4x |
| NNUE | 376,385 | 266,642 | ~1.4x |

Per-node cost is comparable without warm-up (~1.5x, not ~7x). The gap is
almost entirely iterative deepening's TT-based move-ordering warm-up
being far less effective under NNUE — confirmed directly: classical
`evaluate()` picks the same best move (`b1c3`) at every depth 1-5 at this
position; NNUE flips to `h2h4` at depth 4, back to `b1c3` at depth 5,
destroying the hash-move hint depth 5 would otherwise get from depth 4.

### Why, and why it's not a bug
The network approximates `evaluate()` well in aggregate (D-76: MAE
5.0cp) but a few centipawns of noise can flip the ranking of moves
within that noise band — and the starting position is an unusually bad
case for this, being the most wide-open/symmetric position in the game
with many genuinely close-valued opening moves. Expected consequence of
training an *approximation*, not a wiring defect (D-77's changes remain
confirmed correct — nothing was touched this session).

### Verification
No code changes — investigation only, via Python-mode monkeypatching
and `run_benchmark()`. No need to re-run `fastpy check`/`build`/the test
suite since nothing in either repo changed.

### Files changed
- None in either repo. Docs only: `ROADMAP.md`, `DECISIONS.md` (D-78),
  `SESSION_LOG.md` (this entry).

### Next session
D-76's originally-flagged next step is now doubly motivated: a second
training iteration using search-based relabelling (shallow `alpha_beta()`
scores instead of raw `evaluate()`) should both improve accuracy and
reduce the depth-to-depth move-ranking flips that hurt iterative
deepening's warm-up benefit at positions like startpos. That's the clear
next substantial item. Re-run the baseline check (both repos' full test
suites against freshly-pulled `main`) before trusting this log.

---

## Session 41 — evaluate_nnue_incremental() wired into alpha_beta()/quiescence()
**Status:** COMPLETE ✅ — `engine.py`, `run.py`, `tests/test_phase4.py`, `tests/test_phase6.py` changed

### `Start next` — picked up Session 40's flagged next step
Session 40 ended with real trained weights in place and this wiring item
flagged as the clear next step, explicitly framed as a speed/robustness
question rather than a strength one.

### Baseline first
Ran `run_benchmark()` (Python-mode) at startpos and a tactical FEN,
depths 1-5, on the pre-wiring classical-`evaluate()` search, before
touching any code — needed something to compare against.

### What changed
`find_best_move()` now initialises `board.acc` via `init_accumulator()`
at the root (same lazy-init convention as `board.hash`/`ZK_TABLE`).
`alpha_beta()`'s futility static eval and `quiescence()`'s stand-pat both
switched from `evaluate()` to `evaluate_nnue_incremental()`. Every
`make_move()` call inside the actual search tree (`alpha_beta()`'s move
loop, `quiescence()`'s capture loop, `find_best_move()`'s root loop) is
now `make_move_with_accumulator()`, so `board.acc` stays correct
end-to-end. `run.py`'s Python-mode mirrors (`_alpha_beta_py`,
`_quiescence_py`, `_find_best_move_py`) updated identically, reusing the
`_init_accumulator_py()` wrapper Session 36 already built for this.

### Test fallout (both fixes are correctness updates, not workarounds)
Two test files' `starting_board()` helpers call `_alpha_beta_py`/
`_quiescence_py` directly, bypassing `_find_best_move_py()`'s own
`board.acc` init — both updated to call `_init_accumulator_py()` too, now
that every board handed to these functions carries the same
precondition `find_best_move()` guarantees. Two other tests had asserted
quiescence's stand-pat equals `evaluate()` exactly for the (symmetric)
starting position — true only while stand-pat called `evaluate()`
directly; updated to compare against `evaluate_nnue_incremental()`, the
function actually under test now. Full writeup: D-77.

### Benchmark result — an honest finding, not a clean pass
Node counts shift under NNUE eval, in both directions: startpos depth 5
went from 38,849 to 266,642 nodes (~6.9x); a tactical FEN went ~1.5x up
at depth 4 but ~0.76x (down) at depth 5. Leading hypothesis (not
confirmed): startpos is exactly eval-symmetric under `evaluate()` (score
0), and NNUE's small nonzero value there perturbs which branches
futility/null-move pruning cut. Flagged as ROADMAP's new NEXT UP item
rather than either dismissed or over-interpreted.

### Verification
- `fastpy check engine.py`: zero errors
- `fastpy build engine.py --optimize=O3`: clean, ~88s
- Full `fastpy-engine` suite: **243/243 passing**
- Benchmark before/after captured at startpos + one tactical FEN, depths
  1-5 (see D-77's table)
- `fastpy` suite not re-run this session (no changes to that repo)

### Files changed
- `fastpy-engine/engine.py` — REPLACE
- `fastpy-engine/run.py` — REPLACE
- `fastpy-engine/tests/test_phase4.py` — REPLACE
- `fastpy-engine/tests/test_phase6.py` — REPLACE
- Docs: `ROADMAP.md`, `DECISIONS.md` (D-77), `SESSION_LOG.md` (this entry)

### Next session
Investigate the node-count sensitivity above with a few more benchmark
positions before trusting NNUE-driven search for real play — confirm or
rule out the symmetric-startpos hypothesis. After that, the natural step
is a second training iteration using search-based relabelling (shallow
`alpha_beta()` scores instead of raw `evaluate()`) — the realistic route
to this network exceeding `evaluate()`'s playing strength rather than
just matching it. Re-run the baseline check (both repos' full test
suites against freshly-pulled `main`) before trusting this log.

---

## Session 40 — Offline NNUE training pipeline built and run; engine.py now has real trained weights
**Status:** COMPLETE ✅ — `engine.py`, `tests/test_nnue.py` changed; three new files under `training/`

### `Continue` trigger — picked up Session 39's flagged next step
Session 39 ended with the offline NNUE training pipeline unblocked and
flagged as the clear next item. This session built and ran it.

### What was built
Three standalone tools in a new `fastpy-engine/training/` directory
(plain Python + numpy, outside FastPy's dialect per Core Rule 4/6):
`generate_data.py` (self-play data generator, weighted-random move
selection, labels from `evaluate()`), `train_nnue.py` (numpy trainer
matching `evaluate_nnue()`'s exact architecture — clipped-ReLU int32
forward pass, not a generic float net converted after the fact), and
`embed_weights.py` (generates the literal assignment block D-75
confirmed safe at this scale).

### A real bug, not just tuning
The first several training attempts learned essentially nothing —
validation correlation near zero no matter the learning rate,
regularization, or weight clipping (all tried, in that order, before
finding the actual cause). Root cause: `evaluate()`'s label flips sign
by side to move; the feature vector doesn't. Training against the raw
label without pre-applying that flip effectively randomizes half the
training signal's sign. Confirmed with a closed-form check (a trivial
material-sum linear combination: -0.014 correlation against the raw
label, 0.998 once the same flip was applied to the target). Fixed in
`train_nnue.py`; full writeup in D-76.

### Result
2,000 self-play games → 119,413 labelled positions. Trained with early
stopping (~40 epochs). Quantized-inference validation: MAE 5.0cp, corr
1.0000 against `evaluate()` — expected for a first-NNUE distillation
bootstrap (the network was trained to reproduce `evaluate()`, and does).
Not yet a strength improvement over `evaluate()` — that's the honest
framing, see D-76.

### What changed in the repos
- `engine.py`: `init_nnue_weights()`'s placeholder body replaced with
  the trained literal block (98,561 statements); `nnue_rand()` removed
  (no longer referenced anywhere, confirmed via `tests/`/`run.py` grep).
- `tests/test_nnue.py`: the four `[-128,127]` clamp-range tests were
  specific to the placeholder's `nnue_rand() & 255 - 128` generator, not
  an architectural invariant — updated to a generic int32-sanity range,
  since real trained biases aren't clamped that way (`NNUE_B2[0]=-176`).
  Module docstring and a couple of inline comments updated to stop
  calling the network "untrained"/"placeholder".
- New: `training/generate_data.py`, `training/train_nnue.py`,
  `training/embed_weights.py`.

### Verification
- `fastpy check engine.py`: zero errors (~2.3s)
- `fastpy build engine.py --optimize=O3`: clean, ~94s (matches D-75's
  ~85-90s estimate for a function this size at `-O2`/`-O3`)
- Full `fastpy-engine` suite: **243/243 passing**
- Spot-check: `evaluate()` vs. `evaluate_nnue()` (Python-mode mirror) on
  the start position and several early-game/no-queen positions —
  consistently within a few centipawns, matching the reported MAE
- `fastpy` suite not re-run this session (no changes to that repo)

### Files changed
- `fastpy-engine/engine.py` — REPLACE
- `fastpy-engine/tests/test_nnue.py` — REPLACE
- `fastpy-engine/training/generate_data.py` — NEW
- `fastpy-engine/training/train_nnue.py` — NEW
- `fastpy-engine/training/embed_weights.py` — NEW
- Docs: `ROADMAP.md`, `DECISIONS.md` (D-76), `SESSION_LOG.md` (this entry)

### Next session
Wire `evaluate_nnue_incremental()` into `alpha_beta()`/`quiescence()` —
now unblocked with real weights in place. Frame it as a speed/robustness
question (benchmark via `run_benchmark()` before/after, confirm the
incremental accumulator path holds up in real search) rather than a
strength question, since this network currently only reproduces
`evaluate()`. A second training iteration with search-based relabelling
(shallow `alpha_beta()` scores instead of raw `evaluate()`) is the
natural step after that, once the incremental path is trusted — that's
the realistic route to this network eventually exceeding `evaluate()`'s
playing strength. Re-run the baseline check (both repos' full test
suites against freshly-pulled `main`) before trusting this log.

---

## Session 39 — Weight-embedding scoping answered: `fastpy build` handles it as-is
**Status:** COMPLETE ✅ — measurement session, no engine.py or transpiler code changed

### `Go` trigger — baseline re-verified first
Per the standing PROCESS rule (D-61/D-65), pulled both repos fresh via
`codeload.github.com` tarballs and re-ran everything before trusting
Session 38's log:
- `fastpy` full suite: **367/367 passing**
- `fastpy-engine` full suite: **243/243 passing**
- `run.py` / `engine.py` both `ast.parse()` clean
- `fastpy check engine.py` → zero errors
- `fastpy build engine.py --optimize=O3` → compiles clean

All matched Session 38's account exactly — no repeat of the Sessions
24-26/29-30 commit-didn't-land pattern this time.

### Task
Picked up Session 38's sole planned next step (D-74): answer the
weight-embedding scoping question before any NNUE training work starts.
Exact question from ROADMAP.md: can `fastpy build` handle a ~98,600-line
literal assignment block in `init_nnue_weights()`'s body as-is, or does
the transpiler need a real large-array-literal feature first?

### What was done
Built a synthetic, throwaway test file (not committed — lives only in
this session's sandbox) with a function containing 98,561 literal
`ARR[i] = <int>` statements, matching `NNUE_W1[98304]` / `NNUE_B1[128]` /
`NNUE_W2[128]` / `NNUE_B2[1]`'s exact sizes. Ran the full pipeline
(`fastpy check` / `emit` / `build` at `-O0`/`-O2`/`-O3`) against it, then
built a second variant whose `main()` returns a specific array element
through the exit code to verify the compiled binary actually produces
the correct value, not just a clean compile.

**Answer: yes, it works as-is.** No parser, type-system, or emitter
change needed — the existing literal-subscript-assignment support
(already used throughout `engine.py`, e.g. `TT_HASH[idx] = h`) already
handles this at scale. The only cost is compile time at `-O2`/`-O3`
(~85-90s, vs. ~4s at `-O0`) — a known GCC pathology with very large
single-basic-block functions, not a FastPy limitation, and a one-time
offline cost paid once per trained-weights update, not a runtime cost.
Correctness verified end-to-end: the compiled binary's exit code
returned `67` for `NNUE_W1[100]`, matching the value independently
computed in Python from the same random seed.

See D-75 for the full writeup, including the noted mitigation (splitting
`init_nnue_weights()` into several smaller per-array init functions) if
the ~90s compile time ever becomes annoying during rapid training-pipeline
iteration — not needed now, just flagged for whoever builds that next.

### Verification
- `fastpy check` on the synthetic file: 3.9s, zero errors
- `fastpy emit`: 2.2s, 98,590-line / 2.5MB `.cpp` output
- `fastpy build --optimize=O0`: 4.3s total, compiles clean
- `fastpy build --optimize=O2` / `-O3`: ~86-89s total, compiles clean
- Correctness check: compiled binary's `main()` returned `67` for
  `NNUE_W1[100]`, exact match to the independently-computed expected value
- No files in either repo were touched this session — `engine.py`/`run.py`
  reconfirmed unaffected (baseline re-checks above)

### Files changed
- None in either repo's source. Docs only: `ROADMAP.md`, `DECISIONS.md`
  (D-75), `SESSION_LOG.md` (this entry).

### Next session
The offline NNUE training pipeline (ROADMAP, Phase 6) is now unblocked
and is the clear next substantial item — it can target the
confirmed-working literal-assignment shape directly. Two real starting
sub-questions for whoever picks it up: (1) what data source (self-play
generated by the existing engine vs. an external PGN/FEN dataset) and
(2) what training loop (plain numpy vs. PyTorch), both outside either
repo's FastPy dialect per Core Rule 4. Lazy SMP multi-core search remains
the other untouched Phase 6 item, still deliberately deferred per D-74's
reasoning (real thread-based Lazy SMP needs `std::thread` support added
to the dialect itself — no existing precedent, multi-session scope).
Re-run the Session 30/PROCESS baseline check (both repos' full test
suites against freshly-pulled `main`) before trusting this log.

---

## Session 38 — Planning only: NNUE scoping prioritized over Lazy SMP
**Status:** COMPLETE ✅ — no code this session, decision + docs only

### What happened
Verified Session 37's GitHub commit was clean (user uploaded the right
files, then accidentally left three stray duplicate copies of
`emitter.py`/`parser.py`/`type_system.py` at the repo root alongside the
correct `core/` versions — confirmed via a fresh tarball pull, not the
CDN-cached `raw.githubusercontent.com` responses which initially looked
stale; `core/emitter.py` had the real Session 37 fix throughout, the
stray root copies were just clutter). User deleted the three stray files
directly on GitHub; reconfirmed via a fresh tarball pull and a full test
run: 367/367, no stray files, `core/` intact.

With that housekeeping done, user asked what to work on next. Two
substantial items remained on Phase 6: the NNUE training pipeline and
Lazy SMP. Asked directly for a recommendation ("what would you do in my
place") — argued for scoping the NNUE weight-embedding problem first
(three sessions of working NNUE infrastructure sitting idle behind one
specific, contained, answerable engineering question — see D-74 for the
full reasoning) over starting Lazy SMP, including explicitly rejecting
the easier-but-weaker process-level-parallelism version of Lazy SMP as a
stopgap. User agreed and asked to record the decision for a fresh
session rather than continuing immediately.

### Decision recorded
D-74 in DECISIONS.md — full rationale for the prioritization. ROADMAP.md
updated: a new "NEXT UP" sub-item under Phase 6 spelling out the exact
question to answer (`fastpy build` on a ~98,600-line literal assignment
block: does it work as-is, or does the transpiler need a real large-
array-literal feature?), the training-pipeline item marked as blocked on
that answer, and the Lazy SMP item annotated with the two-path breakdown
and why it's deliberately deferred rather than started as a parallel
"quick win."

### Next session
Pick up directly with the weight-embedding scoping question — no ML
work yet, just: can a ~98,600-element literal array assignment block be
generated, type-checked, and compiled by the existing toolchain as-is?
If yes, the training pipeline item unblocks immediately. If no (or if it
compiles but is impractically slow/large), scope the actual transpiler
feature needed (a real large-array-literal or external-data-loading
mechanism) before touching anything ML-side.

Re-run the Session 30/PROCESS baseline check (both repos' full test
suites against freshly-pulled `main`) before starting — standard
practice, and doubly worth it here since this session's own baseline
check caught a real (if harmless) repo-hygiene issue.

---

## Session 37 — Two follow-up cleanups: copy-aliasing fix, const-methods
**Status:** COMPLETE ✅ — both non-blocking items from Sessions 35/36 closed

### Task selection
User asked "which is easy to implement" across the remaining open items
(training pipeline, Lazy SMP, the two filed-but-not-fixed follow-ups from
D-70/D-71). Answered with a ranked assessment; user picked the two
smallest, contained items — copy-aliasing fix first, then const-methods.

### 1. BoardState.__copy__/__deepcopy__ (D-72)
Fixes Session 36's `copy.copy()` list-aliasing pitfall at the source
instead of leaving it as a helper function every caller had to remember
to use. Monkey-patched onto `BoardState` in `run.py` (dunder methods are
Python-only, can't live in `engine.py` — Core Rule 6). Generic over any
list-valued field rather than hardcoding `acc` by name, so it stays
correct without changes if a second array field is ever added.
`_copy_board_with_acc_py()` is retired; `tests/test_nnue_accumulator.py`
updated to use plain `copy.copy()` throughout, now safe everywhere.

6 new tests (`TestBoardStateCopyPatch`): duplication vs. reference
identity for both `copy()` and `deepcopy()`, mutation isolation, scalar
fields unaffected, the empty-list (`acc == []`, never initialised) case,
and a generic test confirming the patch doesn't hardcode `acc` by name.

### 2. Conditional `const` on struct methods (D-73)
Closes the limitation D-70 discovered and deliberately left unfixed.
`core/emitter.py`'s `_emit_function` now calls a new
`_method_mutates_self()` helper — walks a method body's
`IRAssign`/`IRAugAssign` targets through `IRIf`/`IRWhile`/`IRFor`/
`IRMatch` (same tree shape `_collect_typed_scalars()` already walks for
hoisting) looking for a `self.`-prefixed target — and only emits `const`
when none is found. Deliberately scoped to direct self-mutation within
the method's own body; doesn't follow calls to other methods, since
nothing in either repo needs that (every mutation already goes through
free functions taking the struct by value).

Verified with a standalone compiled-and-run test (not committed): a
struct with a mutating `fill_self()`, a mutating `bump_total()`, and a
read-only `sum_self()` — correct `const` presence/absence in the emitted
C++, compiled clean, and run: `sum=60 vals=0,10,20,30 total=2`, matching
hand-computed expected values.

9 new/updated tests (`TestConstMethodDetection`, 8 new + 1 fixed): pure
accessor keeps `const`, scalar/array-field/aug-assign self-mutation all
correctly drop it, mutation inside `while`/`if` bodies is detected, a
negative test confirms a purely-local reassignment doesn't falsely drop
`const`, and free functions are confirmed to never get a `const` suffix
at all. One existing test's comment explicitly described this limitation
as unfixed — updated to reflect the fix.

### Verification
- `fastpy` full suite: **367/367** (359 prior + 8 new, net of one
  updated test)
- `fastpy-engine` full suite: **243/243** (237 prior + 6 new)
- `fastpy check engine.py` → zero errors; `engine.py` reconfirmed
  unaffected by the const-method change — every existing `BoardState`
  method is a pure accessor and all four (`white_pieces()`,
  `black_pieces()`, `all_pieces()`, `empty_squares()`) still emit `const`
  exactly as before (checked by grepping the emitted C++)
- `fastpy build --optimize=O3` → compiles clean
- Both `engine.py` and `run.py` still `ast.parse()` clean

### Next session
With D-72 and D-73 closed, every non-blocking item filed during the
NNUE arc (Sessions 34-36) is done. Two real candidates remain, both
substantial:
- **NNUE training pipeline** — the only remaining blocker to wiring NNUE
  into search. Flagged last session as having an unscoped sub-problem
  underneath the ML work itself: FastPy's compiled dialect has no file
  I/O and every array must start as `[]` and be filled by a runtime init
  function (D-70's convention) — there's currently no path to get
  ~98,600 trained weight values into the compiled binary at all. Needs
  its own scoping session before any training work starts.
- **Lazy SMP** — two paths discussed: process-level parallelism (easy,
  no transpiler changes, but not real Lazy SMP — no shared TT, so no
  synergy between workers) vs. real thread-based Lazy SMP (needs
  `std::thread` support added to the dialect itself — no existing
  precedent, bigger scope than any single session so far in this arc).
- Re-run the Session 30/PROCESS baseline check (both repos' full test
  suites against freshly-pulled `main`) before trusting this log.

---

## Session 36 — Incremental NNUE accumulator (the payoff)
**Status:** COMPLETE ✅ — all three of D-69's NNUE follow-up items now done

### Continuation
Directly continues Session 35, which unblocked this by adding array-typed
struct field support to the transpiler. This is D-69/D-70's remaining
item: give `BoardState` a real `acc: int32[128]` field and make
`make_move()` maintain it incrementally instead of `evaluate_nnue()`
recomputing all 12 bitboards from scratch on every call.

### What shipped
- `BoardState.acc: int32[128]` — the accumulator field itself
- `nnue_diff_accumulate(feature_base, old_bb, new_bb, out)` — diffs two
  bitboards and adjusts `out` accordingly. Deliberately diff-based, not
  move-semantics-based (doesn't special-case captures/castling/en
  passant/promotion) — see D-71 for why that's a correctness choice, not
  just a style preference
- `init_accumulator(board)` — full recompute for boards not produced by
  `make_move()` (starting position, FEN, test fixtures)
- `nnue_output_from_hidden(hidden, white_to_move)` — the final layer,
  factored out of `evaluate_nnue()` so it and the new incremental path
  share one implementation
- `evaluate_nnue_incremental(board)` — O(NNUE_HIDDEN) instead of
  `evaluate_nnue()`'s O(popcount x NNUE_HIDDEN) — the actual performance
  win this whole three-session arc was for
- `make_move_with_accumulator(board, move)` — **a separate function from
  `make_move()`**, not a modification to it (see "what went wrong" below)
- `run.py`: `_init_accumulator_py()`, `_copy_board_with_acc_py()`, and a
  rewritten `_evaluate_nnue_py()` (see below)
- `tests/test_nnue_accumulator.py` — NEW, 18 tests

### What went wrong mid-session (and why the fixes matter)
Three real bugs were found and fixed before anything was shipped —
recorded in full in D-71, summarized here:

1. **First draft baked the accumulator diff directly into `make_move()`.**
   Type-checked, compiled, passed a from-scratch C++ harness — and would
   have broken every one of the dozens of *existing* Python-mode
   `make_move()` call sites across `test_move_gen.py`/`test_phase4/5/6.py`,
   none of which populate `board.acc` (it starts as `[]` in Python mode —
   see D-70), by turning a harmless empty list into an `IndexError` the
   moment the diff code ran. Caught by running the **full** existing
   suite before considering the feature done, not by any test in this
   session's own new file (which only exercises code this session wrote).
   Fixed by reverting `make_move()` to byte-for-byte unchanged and adding
   `make_move_with_accumulator()` as a new, separate, opt-in function.
2. **`_evaluate_nnue_py()` (Session 34) and `evaluate_nnue_incremental()`
   (this session) disagreed by exactly 1** on negative scores — Session
   34's wrapper hand-emulated C++ truncating division to match the
   *compiled* binary, but this session's function calls the real
   `nnue_output_from_hidden()` directly, which uses Python's native floor
   `//` when interpreted. Fixed by rewriting `_evaluate_nnue_py()` to
   delegate to the real shared function instead of hand-copying its
   arithmetic — the two now agree exactly, at the cost of no longer
   matching the compiled binary's division for negative values (nothing
   depends on that).
3. **`copy.copy(board)` is a shallow copy** — list-valued fields (only
   `acc`, so far) share a reference across "copies" instead of being
   duplicated, invisible until this session's tests specifically chained
   `make_move_with_accumulator()` calls. Fixed with a new
   `_copy_board_with_acc_py()` helper, with a regression test
   (`test_original_board_untouched_after_move_on_copy`) guarding it.
   Filed on ROADMAP.md as a real fix (a `__copy__`/`__deepcopy__` on
   `BoardState` in `run.py`) for whenever a second array field exists.

### Verification
- Standalone (not committed): a C++ harness checked
  `evaluate_nnue_incremental()` against `evaluate_nnue()` and a fresh
  `init_accumulator()` reconstruction across 10 hand-built scenarios
  (quiet, capture, promotion, promotion+capture, en passant, castling,
  4-move sequence checked every ply) — all exact matches. A second
  harness played 200 randomized games (real move generation, fixed seed,
  up to 60 plies) and checked the same agreement after **every one of
  11,982 moves** — zero mismatches.
- Committed: `tests/test_nnue_accumulator.py`, 18 tests, including a
  smaller (8 games/25 plies) randomized-game stress test using
  `_generate_legal_moves_py()`, scaled for Python-mode speed inside CI.
- `fastpy-engine` full suite: **237/237** (219 prior + 18 new)
- `fastpy` full suite: **359/359** (unaffected — no transpiler files
  touched this session)
- `fastpy check engine.py` → zero errors
- `fastpy build --optimize=O3` → compiles clean
- `perft(3) = 8902` reconfirmed — move generation untouched
- Both `engine.py` and `run.py` still `ast.parse()` clean (Core Rule 2)

### Next session
- **Only one blocker remains** before NNUE could actually be wired into
  search: an offline training pipeline (separate tool, numpy/PyTorch,
  outside either repo's FastPy dialect) to replace
  `init_nnue_weights()`'s placeholder body with real trained weights.
  Once that exists, wiring `evaluate_nnue_incremental()` into
  `alpha_beta()`/`quiescence()` is a small, well-scoped change — the
  infrastructure underneath it is now fully built and tested.
- Two smaller, non-blocking items filed on ROADMAP.md from this session's
  discoveries: the unconditional-`const` struct-method limitation (D-70)
  and the `copy.copy()` list-aliasing pitfall (D-71) — both self-
  contained, neither urgent.
- Lazy SMP multi-core search still untouched, still the other major
  Phase 6 item.
- Re-run the Session 30/PROCESS baseline check (both repos' full test
  suites against freshly-pulled `main`) before trusting this log.

---

## Session 35 — Transpiler: array-typed struct fields
**Status:** COMPLETE ✅

### Continuation
Picked up directly from Session 34's D-69 scoping: the first of three
NNUE follow-up items, and the only one that's self-contained to the
`fastpy` repo rather than `fastpy-engine`. User was asked to choose
between this and Lazy SMP; delegated the choice back ("You decide") —
went with this one since it unblocks the incremental accumulator and is
a naturally scoped, single-purpose transpiler change, the same shape as
D-68's multi-file compilation work.

### What changed
`self.acc: int32[128] = []` inside a class `__init__` now correctly
declares a fixed-size, zero-initialised C++ array struct member instead
of being silently mis-emitted as a scalar (the array dimension was
silently dropped). `obj.attr[index] = x` (e.g. `board.acc[h] = x`,
`self.acc[h] = x`) is now a supported assignment target — previously
only bare-name subscripts (`moves[i]`) worked; anything with a leading
attribute access raised "Unsupported assignment target".

Three files, three separate concerns (Core Rule 1):
- `core/parser.py` — `IRField.is_array` flag; `_resolve_target()` handles
  `obj.attr[index]`
- `core/type_system.py` — `_check_class()` validates array field types
  properly via `resolve_array()`; `_check_assign()`'s subscript check
  exempts dotted (struct-field) bases from the local-declaration
  requirement
- `core/emitter.py` — `_emit_class()` emits array fields with the same
  zero-init convention as module-level global arrays

Full design rationale, including a **discovered-but-deliberately-not-fixed
limitation** (struct methods emit `const` unconditionally, so no method
can mutate `self` — array or scalar field — only free functions taking
the struct by value can, matching `make_move()`'s existing convention) is
in D-70.

### Verification
- Standalone test file (`/tmp/arrfield_test.py`, not committed): a
  minimal `Acc` struct with an `int32[4]` field, compiled with
  `g++ -std=c++20 -O2` and **run** — a free function mutating the array
  field via the value-copy-return pattern produced the correct summed
  result (`600`) and correct individual values (`0,100,200,300`),
  cross-checked against a read-only struct method computing the same sum
  a second way
- 14 new/updated tests: `test_parser.py` (2 new + 1 updated — the old
  "unsupported" test used exactly the target this session made
  supported, so its example was swapped for a genuinely-still-unsupported
  one), `test_emitter.py` (`TestArrayFieldEmission`, 7 new),
  `test_type_system.py` (`TestArrayFieldTypeChecking`, 5 new)
- `fastpy` full suite: **359/359** (345 prior + 14)
- `fastpy-engine`: untouched this session, reconfirmed unaffected —
  `fastpy check engine.py` zero errors, `fastpy build --optimize=O3`
  compiles clean, full suite **219/219**

### Next session
- D-69/D-70's item 3 on ROADMAP.md: the incremental NNUE accumulator
  itself — `BoardState.acc: int32[128]`, updated inside `make_move()` via
  add/subtract of the moved/captured piece's `NNUE_W1` row instead of
  `evaluate_nnue()`'s current full-recompute-every-call. Needs careful
  correctness verification: the incremental result must match a full
  recompute bit-for-bit after every move type (quiet moves, captures,
  promotions, castling, en passant all touch different numbers of
  bitboards).
- Lower priority, filed but not blocking: the unconditional-`const`
  struct-method limitation (D-70) — self-contained emitter fix, no NNUE
  dependency, own session whenever it's next in line.
- Lazy SMP multi-core search still untouched, still a candidate.
- Re-run the Session 30/PROCESS baseline check (both repos' full test
  suites against freshly-pulled `main`) before trusting this log.

---

## Session 34 — NNUE evaluation infrastructure (inference only)
**Status:** COMPLETE ✅ (infra, not full NNUE — see scope below)

### `Go` trigger
Baseline re-verified first, per the standing PROCESS rule (D-61/D-65):
freshly pulled both repos via `codeload.github.com` tarballs, ran
`python -m pytest tests/` in both — **345/345 (fastpy)**, **196/196
(fastpy-engine)** — confirmed `run.py` parses and `fastpy check engine.py`
is zero errors, all against `main`, before trusting Session 33's log.
Picked up Session 33's stated next step: Phase 6 NNUE evaluation, chosen
over Lazy SMP as the more self-contained item (a static evaluation
function replacement, doesn't touch search/threading).

### Scope decision (read this before assuming NNUE is "done")
A full trained NNUE needs three things: (1) an inference forward pass,
(2) trained weights, (3) an incremental accumulator wired into
`make_move()` for the performance win NNUE is actually for. This session
delivers **only (1)**, fully tested and verified — not (2) or (3). See
D-69 for the complete rationale. In short:
- No training pipeline exists in either repo (needs numpy/PyTorch, millions
  of labelled positions — out of scope for FastPy's chess-engine dialect).
  `init_nnue_weights()` fills the network with deterministic
  splitmix64-style placeholder values instead.
- The incremental accumulator needs an array-typed `BoardState` field
  (`self.acc: int32[128]`) so it copies-with-the-board the way `hash`
  does — but `core/parser.py`/`core/emitter.py` don't support array-typed
  struct fields yet (`resolve_array()` is only wired for module-level
  globals, function parameters, and local declarations). That's a
  transpiler change, deserving its own session. This session's
  `evaluate_nnue()` does a full from-scratch recompute every call instead
  (correct, tested, ~4096 adds worst case, just not incremental).
- `evaluate_nnue()` is therefore **not called from `alpha_beta()` or
  `quiescence()`** — wiring an untrained evaluator into search would make
  the engine play worse with no way to distinguish "expected" from
  "regression" until real weights exist.

### Design
Architecture: 768 sparse binary inputs (12 piece types x 64 squares) into
one hidden layer of `NNUE_HIDDEN=128` clipped-ReLU units (clamped to
`[0, NNUE_CLIP=127]`), into a single output rescaled by `NNUE_SCALE=64`
to centipawns. All-`int32` arithmetic — FastPy's type system has no float
type, which turns out to match how real NNUE engines run inference anyway
(Stockfish uses int8/int16 quantized weights with int32 accumulation in
its hot path). `nnue_rand()` reuses the exact `zk_rand()` splitmix64 shape
and mixing constants (`ZK_GOLDEN`/`ZK_MIX1`/`ZK_MIX2`) rather than
duplicating them.

### Files changed
- `fastpy-engine/engine.py` — `NNUE_INPUT`/`NNUE_HIDDEN`/`NNUE_CLIP`/
  `NNUE_SCALE` constants; `NNUE_W1`/`NNUE_B1`/`NNUE_W2`/`NNUE_B2`/
  `NNUE_INIT` global arrays; `nnue_rand()`, `init_nnue_weights()`,
  `nnue_accumulate()`, `evaluate_nnue()` functions
- `fastpy-engine/run.py` — imports the new NNUE names; Python-mode sizing
  + `init_nnue_weights()` call at import time (same convention as
  `ZK_TABLE`/magic bitboards); `_evaluate_nnue_py()` wrapper mirroring
  `evaluate_nnue()`'s bare `int32[128]` local array (unrunnable directly
  in Python, same class of issue as the `uint64[218]` move arrays)
- `fastpy-engine/tests/test_nnue.py` — NEW, 23 tests: constants/shape (6),
  weight-init determinism + range (7), `nnue_accumulate()` correctness (4),
  `evaluate_nnue()` behavior via the Python mirror (5), module presence (1)

See D-69 for the full design writeup, including a documented mistake: an
early version of this test file used `importlib.reload(engine)` to check
NNUE additions didn't break module import, which silently reset every
other global array (`TT_HASH`, `ZK_TABLE`, ...) back to empty and took
down 58 unrelated tests in the same pytest session. Removed in favour of
a plain `hasattr()` check; the mistake is documented in the test file
itself.

### Verification
- `fastpy` full suite: **345/345 passing** (unaffected — no transpiler
  files touched this session)
- `fastpy-engine` full suite: **219/219 passing** (196 prior + 23 new)
- `fastpy check engine.py` → zero errors
- `fastpy build engine.py --optimize=O3` → compiles clean to a native
  binary
- Standalone C++ harness (built directly against the emitted `.cpp`,
  outside the pytest suite) called the real **compiled** `evaluate_nnue()`
  twice on the startpos (identical result both calls: `-308`) and again
  after removing the black queen (`113` — different, confirming the
  forward pass reads board state) — proves the compiled function itself
  is correct, not just the Python mirror
- `perft(3) = 8902` reconfirmed via the Python-mode wrapper — move
  generation untouched by this change

### Next session
- Three follow-up items now on ROADMAP.md under Phase 6, in dependency
  order: (1) transpiler support for array-typed `BoardState` fields,
  (2) incremental accumulator in `make_move()` built on top of that,
  (3) wiring `evaluate_nnue()` into search once real trained weights
  exist via an offline training pipeline (separate tool, not in scope for
  either repo's Python dialect).
- Lazy SMP multi-core search remains untouched — still a candidate for
  "large enough to deserve its own session" alongside the above.
- Re-run the Session 30/PROCESS baseline check (both repos' full test
  suites against freshly-pulled `main`) before trusting this log.

---

## Session 33 — Multi-file compilation support
**Status:** COMPLETE ✅

### `Go` trigger
Baseline re-verified first, per the standing PROCESS rule (D-61/D-65):
freshly pulled both repos via `codeload.github.com` tarballs, ran
`python -m pytest tests/` in both — **320/320 (fastpy)**, **196/196
(fastpy-engine)** — confirmed `run.py` parses and `fastpy check engine.py`
is zero errors, all against `main`, before trusting Session 32's log.
Picked up the sole remaining ROADMAP ongoing-improvement item flagged at
the end of Session 32: multi-file compilation support (chosen over
starting Phase 6's NNUE/Lazy SMP, which are large enough to deserve their
own dedicated sessions rather than being squeezed in alongside this).

### Design
`core/parser.py` gained `_record_import` (detects `import foo` / `from
foo import ...`, recording the bare module name onto a new
`IRModule.imports` field — no filesystem access, the parser stays a pure
AST→IR step) and `parse_project(entry_file)` — the new orchestrator that
resolves those names against sibling `.py` files, recursively follows
transitive imports, and merges every reachable file's IR into one
IRModule. `main.py`'s `build`/`check`/`emit` all switched from
`parse_file()` to `parse_project()`; a single file with no local imports
behaves identically to before. See D-68 for the full design writeup.

Two correctness issues surfaced while building this and were fixed in the
same change:
1. **Emitter didn't forward-declare free functions** (only structs) —
   single-file `engine.py` got away with this by hand-ordering functions
   callee-before-caller; a multi-file merge can't guarantee that. Fixed
   by forward-declaring every free function via a new shared
   `_function_signature()` helper.
2. **Pre-existing bug: `BUILTIN_TYPE_MAP` global mutation.**
   `_try_type_alias` wrote into the module-level dict directly, so any
   two `parse_source()`/`parse_file()` calls in the same process (the
   pytest suite; now `parse_project()` merging files that both redeclare
   `uint64 = int`) could silently cross-contaminate custom alias
   meanings. Fixed by giving each `ModuleVisitor` its own copy. Caught by
   a test that gave two merged files conflicting meanings for one alias
   name and found it silently accepted instead of rejected.

### Files changed
- `fastpy/core/parser.py` — `IRModule.imports`, `_record_import`,
  `parse_project()`, `FastPyImportError`, per-instance `_type_map` (bug fix)
- `fastpy/core/emitter.py` — `_function_signature()` helper,
  `_emit_forward_declarations()` now also prototypes free functions
- `fastpy/main.py` — `build`/`check`/`emit` use `parse_project()`
- `fastpy/tests/test_parser.py` — `TestImportDetection` (8 tests),
  `TestParseProject` (12 tests)
- `fastpy/tests/test_emitter.py` — `TestFunctionForwardDeclarations`
  (5 tests), `TestMultiFileEmission` (2 tests)

See D-68 for the full design rationale.

### Verification
- `fastpy` full suite: **345/345 passing** (320 prior + 25 new)
- Hand-built two-file project (`mathutil.py` + `main_entry.py`, functions
  calling across the file boundary, including a caller emitted before its
  callee) parsed via `parse_project()`, type-checked clean, emitted, and
  compiled with `g++ -std=c++20 -O2` to a real binary — ran and produced
  the arithmetically correct result end-to-end
- Diamond-import test confirms a shared dependency imported via two paths
  is merged exactly once, not duplicated
- `fastpy check engine.py` on `fastpy-engine`'s `engine.py` → zero errors
  (single-file, no local imports — regression check)
- `fastpy-engine` full suite: **196/196 passing** (unaffected)

### Next session
- Phase 6: NNUE evaluation, Lazy SMP multi-core search, target 1B NPS —
  all three remain unstarted and are each large enough to warrant a
  dedicated session; NNUE probably first (self-contained: a static
  evaluation function replacement, doesn't touch search/threading).
- Re-run the Session 30/PROCESS baseline check (both repos' full test
  suites against freshly-pulled `main`) before trusting this log.

---

## Session 32 — `match` statement support (Python 3.10+)
**Status:** COMPLETE ✅

### `Continue` / "Go as planned" — picked up the item proposed at the
end of Session 31: `match` statement support, chosen over multi-file
compilation as the more contained change.

### Design
Restricted to the subset that maps onto exactly one C++ construct — a
`switch` — per Core Rule 5:
- Any subject expression; `case` patterns must be integer/boolean
  literals, optionally `|`-combined (stacked `case` labels, C++'s native
  fallthrough idiom); at most one wildcard `case _:` → `default:`.
- Rejected at parse time: guard clauses (`case X if cond:`), capture
  patterns (`case x:`), `case None:`, class/sequence/mapping patterns —
  none of these is a single switch-case construct.
- Rejected at type-check time (needs to see all cases together):
  duplicate case values, more than one wildcard.
- The one real correctness trap: Python's `break` inside a `match` case
  breaks the enclosing *loop*; a naive `switch` translation would make
  it only break the switch — silently wrong control flow whenever a
  `match` sits inside a `for`/`while`. Rejected outright at type-check
  time rather than attempting labeled-break/goto cleverness, which would
  have made the emitter start doing analysis (forbidden by Core Rule 5).
  A `break` inside a loop nested *inside* a case body is unaffected —
  unambiguous in both languages.

### Files changed
- `fastpy/core/parser.py` — `IRMatch`/`IRMatchCase` IR nodes,
  `StatementVisitor.visit_Match` + pattern-resolution helpers
- `fastpy/core/type_system.py` — `_check_match` (duplicate values/
  wildcards) + `_reject_break_in_case_body`
- `fastpy/core/emitter.py` — `_emit_match` (switch/case/default/break),
  `IRMatch` wired into `_collect_typed_scalars` for case-body hoisting
- `fastpy/tests/test_parser.py` — `TestMatchStatement` (10 tests)
- `fastpy/tests/test_type_system.py` — `TestMatchStatementChecking` (8 tests)
- `fastpy/tests/test_emitter.py` — `TestMatchEmission` (8 tests)

See D-67 for the full design rationale.

### Verification
- `fastpy` full suite: **320/320 passing** (294 prior + 26 new)
- Generated C++ for a representative `match` hand-verified to actually
  compile: `g++ -std=c++20 -c test_match.cpp` → clean
- `fastpy check engine.py` on `fastpy-engine`'s `engine.py` → zero errors
- `fastpy-engine` full suite: **196/196 passing** (unaffected —
  `engine.py` doesn't use `match` yet)

### Next session
- Remaining ROADMAP ongoing-improvement item: multi-file compilation
  support.
- Phase 6: NNUE evaluation, Lazy SMP multi-core search, target 1B NPS.
- Re-run the Session 30/PROCESS baseline check (both repos' full test
  suites against freshly-pulled `main`) before trusting this log.

---

## Session 31 — Parse error messages now highlight the offending source line
**Status:** COMPLETE ✅

### `Continue` trigger
Picked up the next unstarted ROADMAP item flagged at the end of Session
30: "Better parse error messages (highlight offending source line)".
Baseline re-verified already trustworthy from Session 30's fix, so went
straight to implementation.

### What changed
`core/parser.py`'s `FastPyParseError` now carries `.lineno`/`.col_offset`
(from the AST node it's raised with, as before) plus the raw message.
`parse_source()` — the one place that has both the exception and the
original source text in scope — catches the error and calls a new
`.with_source()` method that appends a Python-`SyntaxError`-style caret
snippet:

```
fastpy: parse error: Line 42: Unsupported expression: 'ListComp'. ...
  File "engine.py", line 42
    moves = [m for m in gen]
             ^
```

None of the ~15 individual `raise FastPyParseError(...)` call sites
throughout the file needed to change — they never had `source` in scope
and still don't. `main.py`'s three CLI error handlers needed no changes
either; they already just print `str(e)`.

### Tests added
`tests/test_parser.py::TestParseErrorSourceContext` — 7 new tests:
file/line header present, source line text present, caret line present,
caret column aligns exactly under the offending token, a plain
`ast.parse()` `SyntaxError` is unaffected (never reaches
`with_source()`), default `"<string>"` label used when `source_file` is
omitted, and `.raw_message`/`.lineno` remain accessible on the annotated
instance for any future non-string consumer (e.g. an IDE integration).

### Verification
- `fastpy` full suite: **294/294 passing** (287 prior + 7 new)
- `fastpy check engine.py` on `fastpy-engine`'s `engine.py`, re-run
  against the updated parser → zero errors, unaffected

### Files changed
- `fastpy/core/parser.py` — `FastPyParseError` + `parse_source()`, see D-66
- `fastpy/tests/test_parser.py` — new `TestParseErrorSourceContext` class

### Next session
- Remaining ROADMAP ongoing-improvement items: multi-file compilation
  support, `match` statement support.
- Phase 6: NNUE evaluation, Lazy SMP multi-core search, target 1B NPS.
- Re-run the Session 30/PROCESS baseline check (both repos' full test
  suites against freshly-pulled `main`) before trusting this log.

---

## Session 30 — Baseline recovery: `core/toolchain.py` was broken on `main`
**Status:** COMPLETE ✅

### `Go` trigger — baseline re-check found a hard failure
Pulled both repos + all six docs fresh via `curl`/tarball per the `Go`
protocol. Before touching the ROADMAP's next-task list, ran the
PROCESS-mandated re-verification (per the open ROADMAP bullet from
Sessions 24-26): `python -m pytest tests/` on the freshly-pulled
`fastpy` repo. It didn't even collect —

```
IndentationError: unexpected indent (core/toolchain.py, line 474)
```

`core/__init__.py` imports `core.toolchain` at package level, so this
broke *every* test in the suite, not just toolchain's own, and would
have broken `fastpy check`/`build`/`emit` for anyone pulling `main`.

### Root cause
`_build_command()` (added/modified in Session 29) was truncated
mid-function: its real ending — compute Apple-arch flags, return the
final GCC/Clang command list — was replaced by an orphaned
`compiler=found_compiler,\n            )` fragment that belongs to a
`CompileResult(...)` call, not this function. Immediately below that,
the ARM64 x86-intrinsic pre-flight-rejection block had been spliced
into `_build_command()` instead of `compile_cpp()` — but `_build_command()`
has neither `cpp_source` nor `found_compiler` in scope, so even fixing
just the indentation wouldn't have made it correct. This reads as a bad
manual merge/paste at the tail end of Session 29, not a logic bug — the
design in D-64 was right; the committed text of the file wasn't.

While reconstructing the correct code, found a second, independent bug
in the same neighborhood: `compile_cpp()`'s call to `_build_command()`
was missing `target_arch=target_arch` — so even a syntactically valid
version of Session 29's change would have silently never propagated
`compile_cpp()`'s `target_arch` argument into the actual command
construction. Only the direct `_build_command()` unit tests (which pass
`target_arch` straight through) would have caught anything was wrong;
any real `compile_cpp(target_arch="arm64")` call would have silently
built a native-host command instead.

### Fix
- `core/toolchain.py`: rebuilt `_build_command()`'s tail (opt flags →
  chess flags → Apple `-arch` flags → extra flags → `[cpp_path, "-o",
  output_path]`), removed the misplaced ARM64 check + duplicate
  temp-file/build fragment from inside it.
- Re-inserted the ARM64 pre-flight rejection into `compile_cpp()`,
  directly after the existing true-MSVC rejection block, where
  `cpp_source` and `found_compiler` are actually in scope.
- Fixed `compile_cpp()`'s `_build_command()` call to pass
  `target_arch=target_arch`.
- No design change from D-64 — this is a restoration, not a redesign.

### Verification (all re-run fresh post-fix, not trusted from any prior log)
- `python3 -c "import ast; ast.parse(...)"` on `core/toolchain.py` → OK
- `fastpy` full suite: **287/287 passing**
- `fastpy-engine`: `ast.parse()` on `run.py` → OK; `fastpy check engine.py`
  → zero errors; full engine suite: **196/196 passing** (untouched this
  session — confirms the corruption was isolated to `toolchain.py`)

### Files changed
- `fastpy/core/toolchain.py` — REPLACE (bugfix only, see D-65)

### Next session
- Re-attempt the actual next ROADMAP items now that baseline is
  trustworthy again: better parse error messages, multi-file
  compilation support, `match` statement support, NNUE evaluation,
  Lazy SMP.
- Keep the ROADMAP PROCESS bullet unchecked — this is now the *second*
  time (Sessions 24-26, and now 29→30) that a session's own "tests
  passing" claim didn't match what was actually committed. Re-verifying
  at the start of every session remains mandatory, not optional.

---

## Session 29 — Apple Silicon / ARM64 cross-compilation flags in toolchain.py
**Status:** COMPLETE ✅

### Baseline re-check
Continued directly in the same conversation as Session 28 (no fresh-window
`Go` this time — user said "Continue" mid-session). Re-pulled
`core/toolchain.py` and `tests/test_toolchain.py` fresh from `main` and
grepped for Session 28's specific new symbols (`_is_true_msvc`,
`MSVC_INCOMPATIBLE_BUILTINS`, `clang-cl`) — confirmed landed. Synced local
working copy to the verified live version before making any further
edits, then re-ran the full suite (251/251) as a baseline before touching
anything.

### What changed (g-c-3/fastpy) — `core/toolchain.py`
Found a real bug hiding in plain sight: `OPT_FLAGS["O3"]` hardcoded
`-march=native`, and `CHESS_FLAGS` hardcoded `-mpopcnt -mbmi -mbmi2` —
all four are x86-only. Any build targeting ARM64 (Apple Silicon, or Linux
aarch64) would have failed immediately with "unsupported option" errors,
not just produced suboptimal code. Fixed:

- `HOST_ARCH` / `IS_MACOS` module constants (via `platform.machine()`
  and `sys.platform`).
- `_normalize_arch()` — folds `aarch64`→`arm64`, `amd64`/`x64`→`x86_64`.
- `_resolve_target_arch()` / `_is_arm()` / `_is_native_build()` — arch
  resolution helpers, defaulting to the host's own arch when unspecified.
- `_native_tuning_flags()` — `-march=native` for x86_64, `-mcpu=native`
  for ARM64, and **nothing** for a genuine cross-build (there's no
  sensible "native" tuning for a CPU that isn't the host's own — this
  was a real design decision, not an oversight: guessing a tuning flag
  for a foreign target would be worse than omitting it).
- `_build_command()` and `compile_cpp()` gained a `target_arch` parameter
  ("x86_64"/"arm64"/"aarch64"). For ARM64 targets, `CHESS_FLAGS` are
  dropped entirely (no BMI2/PEXT instruction exists on ARM64 at all, so
  there's nothing to "enable"). On macOS, an explicit `target_arch` also
  adds Apple Clang's `-arch <arch>` — the same flag Xcode uses for
  universal binaries. Omitting `target_arch` entirely reproduces the
  exact pre-Session-29 command line, verified by a dedicated test.
- `ARM_INCOMPATIBLE_INTRINSICS` + `_arm_incompatible_intrinsics_used()` —
  mirrors Session 28's MSVC-builtin pre-flight pattern: if the target is
  ARM64 and the source contains `_pext_u64`/`_pdep_u64`/`<immintrin.h>`,
  `compile_cpp()` returns `ok=False` with a clear message *before*
  invoking the compiler, rather than a `immintrin.h: No such file or
  directory` error. Deliberately does NOT flag `__builtin_popcountll`/
  `ctzll`/`clzll` — those are portable GCC/Clang builtins that compile
  fine on ARM64, unlike the x86-only SIMD-header intrinsics.
- `compile_file()` gained the same `target_arch` passthrough.

### Known limitation (see D-64)
This does NOT make `engine.py`'s PEXT-based magic bitboard move
generation (wired in Session 25, D-59) actually compile for ARM64.
`_pext_u64`/`_pdep_u64` come from `<immintrin.h>`, which doesn't exist
outside x86/x86_64 — no flag combination changes that. This is the exact
same shape of gap as Session 28's MSVC/GCC-builtin limitation (D-63):
correct flag handling for what generalizes, a fast clear rejection for
what doesn't, and an honest decision record instead of a flag that
pretends to solve a problem it can't.

### Tests — `tests/test_toolchain.py` (36 new tests, 88 total for the module)
One test needed fixing first: `test_o3_uses_march_native_on_gcc` asserted
`-march=native` was in the static `OPT_FLAGS["O3"]` list, which is no
longer true now that the tuning flag is chosen dynamically per
architecture — replaced with a test asserting the static table is now
just `["-O3"]`. New coverage: arch-string normalization, native-build
detection, dynamic tuning-flag selection (x86/ARM/cross, using
`monkeypatch` on `HOST_ARCH` to exercise all three without needing actual
different hardware), ARM-incompatible-intrinsic detection, architecture
branching in `_build_command` (including confirming MSVC dialect is
completely unaffected by `target_arch` — ARM64 Windows is out of scope),
the ARM64 pre-flight rejection end-to-end (and confirming the *same*
PEXT source compiles fine when the target is x86_64 — the rejection is
architecture-specific, not blanket), and a real end-to-end O3 build on
this machine confirming the dynamic-tuning-flag restructuring didn't
change actual native build behavior.

Full fastpy suite: 287/287 passing (251 + 36 new). fastpy-engine
untouched this session, still 196/196. `fastpy check`/`build` on
`engine.py` still clean, still correctly emits `-O3 -march=native` on
this x86_64 host.

### Next session
- Better parse error messages.
- Multi-file compilation support.
- `match` statement support.
- (Longer-term, not urgent) a possible portable software PEXT/PDEP
  fallback in the emitter for genuine ARM64 engine.py builds, if that's
  ever actually wanted — would need to be a distinct post-emission
  translation step per D-63/D-64's reasoning, not a change to
  `core/intrinsics.py` itself.

---

## Session 28 — Windows support: MSVC/MinGW/clang-cl detection in toolchain.py
**Status:** COMPLETE ✅

### Baseline re-check
Confirmed Session 27's deltas actually landed on `main` for all 5 touched
files (2 in fastpy, 2 in fastpy-engine, plus docs) by re-pulling each from
`raw.githubusercontent.com` and grepping for the specific new symbols
(`_match_msb`, `MSB_SOURCE`, `def msb`, `TestBitboardUtils`, `D-62`) —
all present. CI green on GitHub Actions for fastpy (#47). No repeat of
the Sessions 24–26 commit-didn't-land pattern.

### What changed (g-c-3/fastpy) — `core/toolchain.py`
Previously GCC/Clang-only. Now detects four backends:
- **g++ / clang++** — native or MinGW-w64, GCC command-line dialect.
- **clang-cl** — LLVM's Clang with an MSVC-compatible driver. MSVC flag
  dialect, but Clang underneath — understands the same `__builtin_*`
  calls g++/clang++ do.
- **cl** — true MSVC. MSVC flag dialect, and does *not* understand
  GCC/Clang builtins.

Windows detection order: g++ → clang++ → clang-cl → cl. Deliberate, not
arbitrary — `core/intrinsics.py` unconditionally emits GCC/Clang-style
`__builtin_popcountll` / `__builtin_ctzll` / `__builtin_clzll` for the
POPCNT/TZCNT/LZCNT chess patterns (the emitter has no target-compiler
awareness by design — CORE RULE 5). g++/clang++/clang-cl all handle
that; true cl.exe doesn't.

Added:
- `_compiler_stem` / `_uses_msvc_dialect` / `_is_true_msvc` — dialect
  detection, deliberately not using `pathlib.Path` for the separator
  split (`Path` only treats `\` as a separator when actually running on
  Windows, which would break testing Windows-shaped paths from this
  Linux dev sandbox).
- `MSVC_BASE_FLAGS` / `MSVC_OPT_FLAGS` — MSVC-dialect equivalents of the
  existing GCC flag sets. `-march=native` has no MSVC equivalent; `/O3`
  maps to `/O2 /arch:AVX2` (closest available match for the BMI2 codegen
  FastPy's magic bitboards need).
- `MSVC_INCOMPATIBLE_BUILTINS` + `_msvc_incompatible_builtins_used()` —
  pre-flight check in `compile_cpp()`: if the selected compiler is true
  MSVC and the source contains any of the three GCC-only builtins,
  return `ok=False` with a clear explanatory message *before* invoking
  the compiler, rather than a wall of C2065 undeclared-identifier errors.
  `_pext_u64`/`_pdep_u64` are deliberately excluded from this list — both
  GCC/Clang and real MSVC support them identically via `<immintrin.h>`.
- `_build_command()` — branches on dialect (`-o` vs `/Fe:`, etc.).
- `_resolve_output_path()` — adds `.exe` on Windows if missing, for any
  of the four backends.
- `find_compiler()` / `compiler_version()` updated for the new candidate
  list and cl.exe's lack of `--version` support (it prints its banner to
  stderr on a no-arg invocation instead).

### Tests — `tests/test_toolchain.py` (new file, 52 tests)
This module had **zero** test coverage before this session. New coverage:
flag-set sanity, dialect detection (including case/path-separator edge
cases), MSVC-incompatible-builtin detection, command-building for both
dialects, output-path `.exe` resolution, compiler auto-detection on this
real machine, and — the one that actually proves the pre-flight check
does what it claims — an end-to-end `compile_cpp()` call with a **fake
executable named `cl`** placed on `PATH`. The fake script writes a marker
to stderr and exits 1 if it's ever actually invoked; the test asserts
that marker is *absent* for incompatible source (proving the pre-flight
check stopped execution before the compiler ran) and *present* for
compatible source (proving the check isn't just rejecting `cl` outright).
Also added real end-to-end compiles on this machine's actual g++/clang++,
including one that compiles the exact `__builtin_popcountll` /
`__builtin_ctzll` / `__builtin_clzll` shapes `core/intrinsics.py` emits,
runs the binary, and checks the results — a regression guard that these
patterns aren't just "recognised as MSVC-incompatible in the abstract"
but actually compile and execute correctly on real GCC/Clang.

Full fastpy suite: 251/251 passing (199 + 52 new). fastpy-engine
untouched this session, still 196/196.

### Known limitation (see D-63)
True MSVC (cl.exe) cannot compile `engine.py`'s emitted C++ as-is, because
`popcount()`/`lsb()`/`msb()` all trigger the GCC-builtin patterns. This is
architectural, not a bug — fixing it would mean the emitter branching on
target compiler, which conflicts with CORE RULE 5 (emitter does zero
analysis) unless that's handled as a separate post-emission pass. Not
attempted this session; flagged as a possible future item if real MSVC
support (vs. MinGW/clang-cl) is ever required.

### Next session
- Apple Silicon cross-compilation flags (next unchecked ongoing-improvement).
- Better parse error messages.
- Multi-file compilation support.
- `match` statement support.

---

## Session 27 — Baseline verified genuinely clean; shipped LZCNT/MSB intrinsic
**Status:** COMPLETE ✅

### Baseline re-check (per D-61 process)
Freshly pulled all three repos via `curl`/tarball. `ast.parse()` clean on
`run.py` and `engine.py`. No duplicate top-level defs (`pop_lsb`/`pext`/
`pdep` each defined once). `fastpy check engine.py`: zero errors.
`fastpy build engine.py --optimize O3`: compiles clean. Test suites:
fastpy 192/192, fastpy-engine 188/188 — both match SESSION_LOG's Session
26 account exactly. Re-ran the Kiwipete perft check directly via `run.py`'s
own `_parse_fen`/`_perft_py`: 48/2039/97862, exact match. **First session
in four (24-27) where the baseline claim actually held** — no repeat of
the commit-didn't-land pattern this time.

### What changed (g-c-3/fastpy)
- `core/intrinsics.py`: new LZCNT pattern — `x.bit_length() - 1` →
  `(63 - __builtin_clzll(x))`. Added as `_match_msb`, tried after
  `_match_tzcnt` in `_match_binop` so the two patterns can't collide
  (TZCNT's receiver is always the specific `(x & -x)` shape; MSB is
  the permissive fallback for everything else). Had to handle both of
  the parser's `obj.bit_length()` encodings — bare-name receiver
  (`func="board.bit_length"`, `receiver=None`) and sub-expression
  receiver (`func="<expr>.bit_length"`, `receiver=<expr>`) — the first
  pipeline test run caught this when the bare-name case fell through
  silently. Registered in `PATTERN_REGISTRY` as `LZCNT`.
- `tests/conftest.py` / `tests/test_intrinsics.py`: `MSB_SOURCE` fixture,
  `TestMsbPattern` (6 tests: pipeline fire, no-bit_length-in-output, named
  variable, wrong-subtracted-value non-match, TZCNT-still-wins-on-its-shape
  collision guard, direct mapper unit test), plus one `TestPatternRegistry`
  registration check. 199/199 fastpy tests passing (192 + 7 new).

### What changed (g-c-3/fastpy-engine)
- `engine.py`: new `msb()` bitboard utility, same shape as `lsb()`
  (0-guard, then the intrinsic-triggering expression). `fastpy check`
  zero errors, `fastpy build --optimize O3` clean, emitted C++ confirmed
  to contain `(63 - __builtin_clzll(board))`.
- `tests/test_move_gen.py`: new `TestBitboardUtils` (8 tests) — `msb()`
  against known edge cases (0, bit 0, bit 63, multi-bit), 2,000 random
  values cross-checked against Python's own `bit_length()-1`, plus two
  regression guards confirming `lsb()`/`popcount()` are undisturbed.
  196/196 fastpy-engine tests passing (188 + 8 new).
- Also ran an ad hoc 100,000-random-value correctness check on `msb()`
  in Python mode before committing to the permanent test suite (not
  itself a committed artifact, just extra confidence beyond the 2,000
  in the permanent regression test).

### Docs
- `ROADMAP.md`: checked off the MSB task; deleted a stale duplicate
  "Wire PEXT..." bullet that was never checked off when the real PEXT
  work landed in Session 25 (see D-59) — same line, still unchecked,
  sitting further down the ongoing-improvements list.

### Next session
- Resume ROADMAP's ongoing-improvements list: Windows support in
  `toolchain.py`, Apple Silicon cross-compile flags, better parse error
  messages, multi-file compilation, `match` statement support.
- `msb()` is a general utility, not yet called from anywhere in
  `engine.py` — next feature needing a most-valuable-piece or highest-
  square scan can use it directly.
- Continue the D-61 baseline-verification discipline every session
  regardless of how many sessions in a row it comes back clean.

---

## Session 26 — Kiwipete bug closed: it was never real. Third commit-didn't-land indentation regression, fixed.
**Status:** COMPLETE ✅

### Critical finding (before any new work)
Baseline check found the repo broken for the third session running:
`run.py` line 224 still had the stray 8-space indent in front of
`def _alpha_beta_py(...)` that Session 25's log claimed to have fixed.
The fix was correct when written, it just never landed in the commit
pushed to `main`. Dedented the line; `ast.parse()` clean on both
`run.py` and `engine.py`. No duplicate-definition regression this time
(checked `pop_lsb`/`pext`/`pdep` — each defined once).

### D-60 investigation (Kiwipete perft) — re-run and closed
With `run.py` importing cleanly, ran the real `_parse_fen` +
`_perft_py` against Kiwipete
(`r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1`):
perft(1)=48, perft(2)=2039, perft(3)=97862 — exact matches to the
known-correct values. No crash, no negative shift, no king going
missing. **The move generator was never broken.** The 429 figure in
D-60 was a measurement artifact of the same broken `run.py` import —
whatever produced it wasn't exercising the tested `_parse_fen`/perft
path. See D-61 for full root-cause writeup.

### What changed
- `run.py`: dedented `_alpha_beta_py`'s def line (Change 1).
- `tests/test_move_gen.py`: added `TestPerftKiwipete` (perft depths
  1-3 against the Kiwipete FEN, imported via `run._parse_fen`) per
  D-60's original instruction to add this regardless of root cause,
  so a gap this size can't go uncaught again.

### Verification
- `python3 -m pytest tests/ -q` (fastpy-engine): 188/188 passing
  (185 existing + 3 new Kiwipete perft tests).
- `python3 -m pytest tests/ -q` (fastpy): 192/192 passing, unaffected.
- `fastpy check engine.py`: zero errors.
- `fastpy build engine.py --optimize O3`: compiles clean.

### Next session
- No open engine correctness bugs. Resume ROADMAP's ongoing-improvements
  list: `__builtin_clzll` for MSB index, Windows support in
  `toolchain.py`, Apple Silicon cross-compile flags, better parse error
  messages, multi-file compilation, `match` statement support.
- Keep the new baseline discipline (D-61): if SESSION_LOG.md's account
  of a prior session's fix doesn't match the live file, treat every
  other claim from that uncommitted session as unverified too.

---

## Session 25 — Fixed a second build-breaking regression, shipped call-site arity checking
**Status:** COMPLETE ✅

### Critical finding (before any new work)
Baseline check again found the repo broken — same pattern as Session 24: docs
said the last session ended clean, but neither `run.py` nor `engine.py` had
actually been re-verified after commit.

- `run.py` line 209: a stray 8-space indent in front of
  `def _alpha_beta_py(...)` broke Python syntax entirely (`ast.parse` failed
  with "unexpected indent"). Fix: dedent the line.
- `engine.py`: `pop_lsb` was defined three times and `pext`/`pdep` twice each
  (lines 470–530 were a verbatim duplicate of 416–468). `fastpy check` passed
  clean regardless — it type-checks each function independently and never
  scans for duplicate top-level definitions — but `fastpy build` failed with
  C++ redefinition errors. Fix: deleted the duplicate block.

Both fixed, then verified: 185/185 fastpy-engine tests, 182/182 fastpy tests,
clean `fastpy build engine.py --optimize O3`. See D-58.

### What changed (g-c-3/fastpy)
- `core/type_system.py`: implemented the arity checker flagged as PRIORITY in
  ROADMAP.md. `check_module()` now pre-registers every free function's and
  method's param count before checking any body (so forward references work).
  A new `_walk_expr_for_calls()` recurses through every expression shape
  (`IRCall` args/receiver, `IRBinOp`, `IRUnaryOp`, `IRCompare`, `IRBoolOp`,
  `IRAttribute`, `IRSubscript`, `IRTuple`, `IRIfExp`) and is hooked into every
  statement type that carries an expression: assignment values, aug-assign
  values, return values, if/while conditions, for-loop iterables, and bare
  expression statements. `_check_call_arity()` matches free functions by
  exact name and methods by name-only lookup across all classes (no static
  class binding available at the call site), flagging a mismatch only when
  the arg count matches none of the candidates for that method name — avoids
  false positives on same-named methods with different signatures. Unknown
  names (builtins, `bin(x).count("1")`-style idioms) are silently skipped.
- `tests/test_type_system.py`: added `TestCallSiteArity` — 10 new tests
  covering too-many/too-few args on free functions and methods, correct-arity
  passes, forward-reference calls, zero-arg methods, builtin calls (must not
  be flagged), and calls nested inside other calls' arguments and inside
  if-conditions.

### Verification
- Injected the exact D-55 regression shape (phantom 6th arg to `alpha_beta`
  at a real call site) into a copy of `engine.py` — caught: `expected 5
  arguments, got 6`.
- Injected a too-few-args variant (dropped `alpha_beta`'s `excluded_move`
  arg) — caught: `expected 5 arguments, got 4`.
- Injected a phantom arg into a real `board.white_pieces()` method call site
  — caught: `expected 0 arguments, got 1`.
- Ran the checker against the real, unmodified `engine.py` — zero errors
  (no false positives from method calls, `pext`/`pdep` free-function calls,
  or `bin(x).count("1")`-style builtin idioms).
- `fastpy` suite: 192/192 passing (182 existing + 10 new).
- `fastpy-engine` suite: 185/185 passing, unaffected by either fix.

### Next session (continued in the same Session 25)
- Wired PEXT into bishop/rook/queen move generation. Added
  `ROOK_ATTACK_TABLE[102400]` / `BISHOP_ATTACK_TABLE[5248]` (exact standard
  totals — sum over all 64 squares of 2^popcount(relevant_mask)), plus
  per-square `ROOK_MASKS`/`BISHOP_MASKS`/`ROOK_OFFSETS`/`BISHOP_OFFSETS` and
  a `MAGIC_INIT[1]` flag, all following the exact zero-init-global +
  lazy-init-guard pattern already established by `ZK_TABLE`/`ZK_TABLE_INIT`.
  `init_magic_tables()` enumerates every occupancy subset of each square's
  relevant mask via `pdep(i, mask)` and fills the table with the existing
  ray-fill logic (kept as `rook_attacks_slow()`/`bishop_attacks_slow()`,
  reference-only, never called from the hot path). `rook_attacks()`/
  `bishop_attacks()` do the reverse: `pext(occupied & mask, mask)` to get
  the same dense index back, single array read, no ray loop.
  `generate_bishops`/`generate_rooks`/`generate_queens` now call these
  instead of unioning ray_* functions directly. Init guard lives in
  `generate_all_moves()` — the single chokepoint every move-gen path
  (perft, alpha_beta, find_best_move's root) routes through, mirroring how
  `find_best_move()` guards `ZK_TABLE_INIT`. `run.py` sizes and initializes
  the new globals the same way it already does for `ZK_TABLE`/`TT_HASH`.
  See D-59.

  Verification: the full construction+lookup algorithm was simulated
  offline in plain Python and checked against 20,000 random occupancies
  (zero mismatches) *before* any FastPy code was written. After wiring:
  `fastpy check`/`fastpy build --optimize O3` both clean, 185/185
  fastpy-engine tests pass, 192/192 fastpy tests pass, and startpos
  perft(5) via the new code path = 4,865,609 — exact match (~5M leaf
  nodes, heavy sliding-piece exercise).

  **Found a pre-existing, unrelated bug while stress-testing against
  Kiwipete** (blocker-heavy position, D-51's standard benchmark): perft(2)
  = 429 vs. expected 2,039, and a deeper search crashes on a king bitboard
  going empty. Confirmed present in the pre-Session-25 code too — not
  caused by this change. See D-60 and ROADMAP.md.

### Next session
- PRIORITY: isolate and fix the Kiwipete perft bug (D-60) — likely in
  castling generation. Add a Kiwipete perft regression test once fixed.

---

## Session 24 — Fixed build-breaking regression, PEXT/PDEP intrinsics, real singular extensions
**Status:** COMPLETE ✅

### Critical finding (before any new work)
Baseline `fastpy build engine.py --optimize O3` **failed** — not caught by
`fastpy check`, which only validates types, not call-site arity. Root cause:
`alpha_beta`/`_alpha_beta_py`'s null-move call site passed a stray 5th
argument (`, 0`) in both `engine.py` and `run.py`, but both functions were
defined with 4 params.

Bigger problem underneath: Session 22's log entry and D-53 describe
**singular extensions** (`excluded_move` parameter, 9 new tests) as
implemented — none of that existed in the actual repo. No `excluded_move`
anywhere in `engine.py`/`run.py`; `test_phase6.py` tested futility pruning,
not exclusion search. The stray `, 0` was almost certainly what remained
after that work never actually landed.

Fixed the immediate build break first (removed the phantom argument,
verified a clean build), then — at Gokul's request — implemented singular
extensions for real in the same session. See D-55 (the regression) and
D-57 (the actual design) in DECISIONS.md.

### What changed (g-c-3/fastpy-engine)
- `engine.py`, `run.py`: removed the extra `0` argument from the null-move
  call sites — restores a clean compiled build
- `engine.py`: `alpha_beta()` gained a required 5th parameter,
  `excluded_move: uint64`. FastPy has no default-argument support (parser
  ignores `ast.arguments.defaults` entirely — confirmed while investigating
  this), so every call site needed updating explicitly, including the
  root call in `find_best_move()`. New constants: `SE_MIN_DEPTH=6`,
  `SE_TT_DEPTH_MARGIN=3`, `SE_VERIFY_REDUCTION=3`, `SE_MARGIN_PER_DEPTH=2`,
  `SE_EXTENSION_PLIES=1`. New `tt_probe_raw()` helper — fetches a TT
  entry's raw depth/score/bound-flag without the usability filtering
  `tt_probe()` does, needed for the hash-move qualification check
- `run.py`: mirrored the same logic in `_alpha_beta_py()`. Unlike
  `engine.py`, plain Python *does* support default arguments, so
  `excluded_move=0` is a default here (kept every pre-existing 4-arg
  test call site working without edits) — engine.py still requires it
  explicitly at every call site
- `engine.py`: new `pext(x, mask)` / `pdep(x, mask)` BMI2 wrapper
  functions in the BITBOARD UTILITIES section — Python-mode bit-loop
  fallbacks, intrinsic-matched away in the compiled path
- `tests/test_phase6.py`: 5 new tests in `TestSingularExtensions` (excluded
  move can't raise the score, TT probe/store both skipped during an
  exclusion search — verified via node-count and TT-untouched checks, a
  forced-single-reply edge case, and an SE_MIN_DEPTH+1 smoke test on a
  sparse K+R vs K endgame — the startpos version of this test took over
  two minutes in pure Python, so switched to a low-branching-factor
  position); 10 new tests in `TestPextPdep`

### What changed (g-c-3/fastpy)
- `core/intrinsics.py`: new `PEXT`/`PDEP` pattern — matches a direct
  2-argument call to a bare `pext`/`pdep` name (no receiver) rather than
  an expression idiom, since no natural pure-Python one-liner exists for
  a hardware gather/scatter (unlike POPCNT/TZCNT). See D-56
- `core/emitter.py`: added `#include <immintrin.h>` for `_pext_u64`/
  `_pdep_u64`
- `tests/test_intrinsics.py`, `tests/conftest.py`: 11 new tests —
  pipeline firing, direct mapper unit tests, wrong-arg-count and
  wrong-shape non-matches

### Verification
- `fastpy check engine.py` — zero errors; `fastpy build --optimize O3` —
  succeeds
- fastpy: **182/182** passing (was 171)
- fastpy-engine: **185/185** passing (was 168, several of which failed on
  the arity bug at baseline)
- `pext`/`pdep` correctness cross-checked against a from-scratch bit
  reference implementation over 500+ random 64-bit inputs, plus the
  inverse property `pdep(pext(x, mask), mask) == x & mask`
- Singular extensions: verified the excluded-move search never raises the
  score versus the unrestricted search, that TT probe/store are both
  skipped during an exclusion search (node-count and direct TT-array
  checks), and that a search reaching SE_MIN_DEPTH+1 still terminates
  correctly

### Next (ROADMAP)
- Wire `pext`/magic-bitboard attack tables into `generate_bishops`/
  `generate_rooks`, replacing the ray-fill loops
- NNUE neural network evaluation
- Lazy SMP multi-core search

---

## Session 23 — Fixed build-breaking regression + PEXT/PDEP intrinsics
**Status:** COMPLETE ✅

### Critical finding (before any new work)
Baseline `fastpy build engine.py --optimize O3` **failed** — not caught by
`fastpy check`, which only validates types, not call-site arity. Root cause:
`alpha_beta`/`_alpha_beta_py`'s null-move call site passed a stray 5th
argument (`, 0`) in both `engine.py` and `run.py`, but both functions are
defined with 4 params.

Bigger problem underneath: Session 22's log entry and D-53 describe
**singular extensions** (`excluded_move` parameter, 9 new tests) as
implemented — none of that exists in the actual repo. No `excluded_move`
in `engine.py` or `run.py`; `test_phase6.py` tests futility pruning, not
exclusion search. The stray `, 0` was very likely a leftover from that
work never actually landing. Fixed the immediate break (removed the
phantom argument) but deliberately did **not** reimplement singular
extensions in the same session as a bug audit — that's a feature-scope
decision, not a fix. ROADMAP checkbox reverted to unchecked; see D-55.

### What changed (g-c-3/fastpy-engine)
- `engine.py`, `run.py`: removed the extra `0` argument from the null-move
  `alpha_beta`/`_alpha_beta_py` call sites — restores a clean compiled build
- `engine.py`: new `pext(x, mask)` / `pdep(x, mask)` BMI2 wrapper functions
  in the BITBOARD UTILITIES section — Python-mode bit-loop fallbacks,
  intrinsic-matched away in the compiled path
- `tests/test_phase6.py`: 10 new tests in `TestPextPdep` — identity/empty
  mask edge cases, 500-case random cross-check against a reference
  implementation, the pext/pdep inverse property, and the
  `result <= 2**popcount(mask) - 1` bound

### What changed (g-c-3/fastpy)
- `core/intrinsics.py`: new `PEXT`/`PDEP` pattern — matches a direct
  2-argument call to a bare `pext`/`pdep` name (no receiver) rather than
  an expression idiom, since no natural pure-Python one-liner exists for
  a hardware gather/scatter (unlike POPCNT/TZCNT). See D-56
- `core/emitter.py`: added `#include <immintrin.h>` for `_pext_u64`/
  `_pdep_u64`
- `tests/test_intrinsics.py`, `tests/conftest.py`: 11 new tests —
  pipeline firing, direct mapper unit tests, wrong-arg-count and
  wrong-shape non-matches

### Verification
- `fastpy check engine.py` — zero errors; `fastpy build --optimize O3` —
  succeeds (previously failing, see above)
- fastpy: **182/182** passing (was 171)
- fastpy-engine: **180/180** passing (was 168 failing→172 after the
  arity fix, then +10 PEXT/PDEP tests → 180 passing)
- `pext`/`pdep` correctness cross-checked against a from-scratch bit
  reference implementation over 500+ random 64-bit inputs, plus the
  inverse property `pdep(pext(x, mask), mask) == x & mask`

### Next (ROADMAP)
- Decide whether to actually (re-)implement singular extensions
- Wire `pext`/magic-bitboard attack tables into `generate_bishops`/
  `generate_rooks`, replacing the ray-fill loops
- NNUE neural network evaluation
- Lazy SMP multi-core search

---

## Session 22 — Singular extensions implemented + D-52 stub fixed

### What changed (g-c-3/fastpy-engine)
- `engine.py`: `alpha_beta` gains an `excluded_move: uint64` parameter
  (0 for every normal call). New constants `SE_MIN_DEPTH=6`,
  `SE_TT_DEPTH_MARGIN=3`, `SE_VERIFY_REDUCTION=3`,
  `SE_MARGIN_PER_DEPTH=2`, `SE_EXTENSION_PLIES=1`. At depth >=
  SE_MIN_DEPTH with a qualifying hash move, the node re-searches the
  position with that move excluded at reduced depth against a narrow
  window; if everything else fails low, the hash move is extended one
  ply when actually played
- `run.py`: `_alpha_beta_py` mirrors the same logic (`excluded_move=0`
  default keeps every existing 4-arg call site working unmodified)
- `tests/test_phase6.py`: 9 new tests — constant sanity bounds, direct
  proof that an excluded move is never played (scholar's-mate position),
  proof an exclusion search never touches the TT for its own hash key,
  proof `excluded_move=0` is a complete no-op vs. pre-Phase-6c behaviour,
  and an integration test that a real search crosses SE_MIN_DEPTH and
  still returns a legal move (sparse K+R vs K fixture, fast in Python
  mode)

### Design notes
- Both the entry-point TT probe and the exit-point TT store are skipped
  whenever `excluded_move != 0` — the parent hash key's existing entry
  reflects the *full* move set including the move being excluded, so an
  unguarded probe would short-circuit the verification and an unguarded
  store would corrupt the entry for every future lookup of that position
- Reduction logic uses subtraction/multiplication only, consistent with
  every other depth constant in the file (LMR, futility) — no division
  anywhere in `engine.py`, no reason to introduce it here
- Picked up the Session 21 follow-up flagging a "D-46–D-51 backfill" as
  pending: on inspection, those entries were already fully written up in
  `DECISIONS.md`. The actual issue was `D-52` itself — a self-referential
  stub ("see `DECISIONS.md` for full writeup" written inside
  `DECISIONS.md`). Replaced with real content; added `D-53` for this
  session's design decisions

### Verification
- `fastpy check engine.py` — zero errors; full `-O3 -march=native` build
  succeeds
- Full suite: **174/174 passing** (165 existing + 9 new), no regressions

### Next (ROADMAP — Phase 6, Elite Engine, still open)
- NNUE neural network evaluation
- Lazy SMP multi-core search
- Optional: adaptive `NULL_MOVE_R` (larger at higher depth)

---

## Session 21 — Null-move node-increase root cause found and fixed
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: `NULL_MOVE_MIN_DEPTH: Final[int32]` changed `3` → `4`
  (single-line fix, single source of truth — `run.py` imports the
  constant rather than duplicating it)

### Investigation
- Picked up the Session 20 "optional" follow-up: null-move pruning
  showed a node *increase* on Kiwipete at depth 4 (472,172 vs 231,980
  nodes disabled) with no explanation on file
- Instrumented a copy of `_alpha_beta_py` with attempt/cutoff counters,
  clearing the TT between configs to isolate each run (the previous
  attempt at reproducing this without clearing the TT gave nonsense
  numbers — TT contamination between sequential runs in the same
  process, a good reminder that the ablation harness itself needs a
  clean TT per config)
- Reproduced the exact Session 20 figures (472,172 / 231,980) once the
  TT was properly cleared, then measured null-move's own attempt/cutoff
  counts directly: **48 attempts, 1 cutoff — a 2% hit rate** at depth 4
  on Kiwipete
- Root cause: at `NULL_MOVE_MIN_DEPTH=3` with `NULL_MOVE_R=2`, the
  minimum triggering depth gives `reduced_depth = depth - 1 - R = 0`,
  so the "cheap reduced-depth verification" search drops straight into
  `quiescence()` with no depth limit of its own. Kiwipete's hanging
  pieces and capture chains make quiescence expensive, so 47 failed
  attempts (98%) each paid full quiescence cost for nothing

### Fix and verification
- `NULL_MOVE_MIN_DEPTH` 3→4 guarantees `reduced_depth >= 1` — the
  verification search always gets one real alpha-beta ply (with its own
  pruning) before quiescence can enter, rather than skipping straight to
  it
- Kiwipete depth 4 with the fix: 231,980 nodes — identical to null-move
  disabled. The depth-3 trigger simply doesn't fire in this depth range
  now, at zero cost since it was contributing almost nothing (2% hit
  rate) anyway
- Startpos depth 5: 38,849 vs 38,635 nodes (+0.5%) — negligible cost
  where null-move already does its job well (Session 19: ~25x reduction)
- Both configs return identical scores before/after (correctness
  unaffected); `fastpy check engine.py` — zero errors; full suite —
  **165/165 passing**

### Key decisions
- D-52: `NULL_MOVE_MIN_DEPTH` raised 3→4 — see `DECISIONS.md` for full
  writeup, including a noted doc gap (D-46–D-51 were referenced in
  ROADMAP/SESSION_LOG but never written up in `DECISIONS.md`; backfill
  still pending)

### Next (ROADMAP — Phase 6, Elite Engine, still open)
- Backfill missing D-46–D-51 writeups in `DECISIONS.md`
- Singular extensions
- NNUE neural network evaluation
- Lazy SMP multi-core search
- Consider whether `NULL_MOVE_R` should also be adaptive (larger at
  higher depth) now that the depth-3 pathological case is closed off

---

## Session 20 — FEN parsing + middlegame ablation (Kiwipete)
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `run.py`: new `_parse_fen(fen)` — full 6-field FEN parser (piece
  placement, side to move, castling rights, en passant, halfmove/fullmove
  clocks), Python-mode only per the D-19 dialect boundary; new
  `_FEN_PIECE_FIELD` char→field map; imported `CASTLE_WK/WQ/BK/BQ` from
  `engine.py` for castling-rights parsing
- `_apply_position()`: now handles `position fen <FEN> [moves ...]` in
  addition to `position startpos [moves ...]`
- `uci_loop()`: `position` dispatch now checks for `fen` as well as
  `startpos`
- `run_benchmark(max_depth=6, fen=None)`: new optional `fen` parameter,
  prints which position was benchmarked; CLI now accepts
  `python run.py bench [depth] ["<fen>"]`

### Results
- No `engine.py` changes — FEN parsing is pure string handling, correctly
  kept in `run.py`. `fastpy check`/`fastpy build` unaffected. 165/165
  tests still passing
- Verified `_parse_fen()` against Kiwipete (`r3k2r/p1ppqpb1/bn2pnp1/
  3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1`) — the standard perft
  correctness fixture: castling rights, king squares, and legal move
  count (48, matching the known value) all correct
- Re-ran the Session 19 ablation on Kiwipete instead of startpos, depth 4:

| Config | Nodes | vs baseline |
|---|---|---|
| Baseline | 472,172 | — |
| No futility | 554,144 | +17% |
| No LMR | 472,562 | +0.1% |
| No null-move | 231,980 | -51% |

- **Futility pruning confirmed meaningful on tactical positions** (17%
  node reduction vs ~0% on startpos) — validates the Session 19 hypothesis
- **LMR negligible here** — inverse of startpos (25x there). Kiwipete's
  move lists are unusually capture/check-heavy, and LMR only reduces
  quiet moves, so few moves qualify
- **Null-move shows an unexpected node increase when enabled** — and
  unlike the Session 19 startpos anomaly, this isn't TT-contamination
  (depths 1-3 are byte-identical between configs going into depth 4, so
  the divergence is real, not an artifact). The null-move verification
  sub-search's own node cost may be outweighing its cutoffs at this
  depth/position — flagged for follow-up, not yet explained

### Key decisions
- D-50: FEN parsing lives entirely in `run.py`, never `engine.py` —
  consistent with D-19: string handling and I/O stay in Python-mode, the
  compiled Speed Contract path never sees a `str`
- D-51: Kiwipete adopted as the standard non-startpos benchmark/test
  fixture going forward — it's the well-known perft correctness position
  (many sources cross-check perft(1)=48 from it), so it doubles as a
  parser sanity check and a "give the pruning heuristics something to
  actually do" stress position

### Next (ROADMAP — Phase 6, Elite Engine, still open)
- Singular extensions
- NNUE neural network evaluation
- Lazy SMP multi-core search
- Optional: investigate the null-move node-increase finding on Kiwipete
  before trusting null-move pruning's net benefit outside startpos-like
  positions
- Optional: adaptive null move / LMR reduction (D-36, D-39 follow-ups)
- Optional: convert `compute_hash()` to true incremental XOR (D-29 follow-up)

---

## Session 19 — Pruning ablation benchmark (measurement only)

### What was done
Used the Session 18 harness to quantify node reduction from null-move
pruning, LMR, futility pruning, and aspiration windows on the starting
position, depths 1-6. No repo code changed — ablation toggles were
sandbox-only env-var flags on a throwaway copy of `run.py`, used to run
each config as a fresh process (clean TT per config), never committed.

### Results (startpos, `NULL_MOVE_R=2`/`NULL_MOVE_MIN_DEPTH=3`,
`LMR_MIN_DEPTH=3`/`LMR_FULL_SEARCH_MOVES=4`/`LMR_REDUCTION=1`)

| Depth | Baseline | No null-move | No LMR | No futility | No aspiration |
|---|---|---|---|---|---|
| 4 | 5,954 | 5,914 | 6,691 | 5,954 | 5,954 |
| 5 | 38,635 | 38,633 | 973,580 | 38,685 | 38,635 |
| 6 | 618,195 | 596,654 | 84,700 | 619,709 | 617,431 |

- **LMR: ~25x node reduction at depth 5** (38,635 vs 973,580) — by far
  the dominant pruning technique on this position
- **Null-move, futility, aspiration: negligible effect (<3%)** on the
  startpos — all three are conditioned on things a quiet, symmetric
  opening position doesn't exercise much (a clearly-bad-to-pass
  position, a hopeless static eval near a leaf, and a volatile score
  between depths, respectively)
- Depth-6 numbers for the no-LMR and no-null-move configs are **not**
  clean cross-config comparisons — see D-49

### Key decisions
- D-49: `run_benchmark()`'s cross-depth TT persistence (D-48) means
  ablation configs that diverge heavily in node count at one depth
  (e.g. no-LMR's 973,580 vs baseline's 38,635 at depth 5) enter the next
  depth with very different TT fill states, contaminating that depth's
  comparison — the no-LMR depth-6 count (84,700, *lower* than its own
  depth-5 count) is a TT-cutoff artifact, not a real search-size result.
  Only compare configs at the first depth where they diverge, not at
  later depths once TT contamination compounds
- Confirmed: null-move and futility pruning are implemented correctly
  (Sessions 15, 17) but under-exercised by the startpos test position —
  their real contribution needs a tactical or imbalanced middlegame FEN,
  not further code changes

### Next (ROADMAP — Phase 6, Elite Engine, still open)
- Singular extensions
- NNUE neural network evaluation
- Lazy SMP multi-core search
- Optional: re-run this same ablation on a tactical/imbalanced FEN
  (not startpos) to get a fair read on null-move and futility's
  contribution — the startpos result likely understates both
- Optional: adaptive null move / LMR reduction (D-36, D-39 follow-ups)
- Optional: convert `compute_hash()` to true incremental XOR (D-29 follow-up)

---

## Session 18 — `go depth N` timing harness (Phase 6b)

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `NODE_COUNT: uint64[1] = []` global next to the TT
  globals; added `nodes_reset()`/`nodes_get()` accessor functions after
  `tt_get_move()`; incremented `NODE_COUNT[0]` once per `quiescence()` call,
  once per `alpha_beta()` call, and once for the root node in
  `find_best_move()` — the same three call sites as everywhere else in the
  engine that "one node" is defined
- `run.py`: mirrored the same increments in `_quiescence_py`,
  `_alpha_beta_py`, and `_find_best_move_py` via `_engine_module.NODE_COUNT`
  (Python-mode is what actually runs UCI `go` today per D-19, so this is
  the path that matters for real NPS numbers right now); `NODE_COUNT`
  added to the Phase-5-style init-block resize list and the import list
  from `engine.py`
- `_iterative_deepening_py`: resets `NODE_COUNT[0]` at the start of each
  depth's search (including any aspiration re-searches at that depth), and
  the `info` line now reports `nodes` and `nps` alongside `score`/`time`
- New `run_benchmark(max_depth=6)` in `run.py`: standalone per-depth
  nodes/time/NPS table on the starting position, full-window search (no
  aspiration windows, so node counts stay unambiguous), TT persists across
  depths like real iterative deepening. Runnable as `python run.py bench
  [depth]` — no UCI GUI or Arena/Cutechess setup required
- CLI dispatch added to `run.py`'s `__main__` block: `bench` argument
  routes to `run_benchmark()`, anything else (or nothing) still runs
  `uci_loop()` as before

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- **165/165 tests passing** (no test changes needed — node counting is
  additive instrumentation, doesn't change search results or move choice)
- `python run.py bench 5` on startpos: depths 1-5 completed in ~2.9s total,
  41 → 38,635 nodes, NPS in the 10-19K range (Python-mode, as expected —
  this is the first concrete NPS number the engine has produced)
- Live UCI smoke test (`position startpos` + `go depth 4`): `info` lines
  now read `info depth 4 nodes 5950 nps 10507 score cp 0 time 692` instead
  of the old `info depth 4 score cp 0 time 692` — bestmove (`b1c3`)
  unchanged from before this session, confirming the instrumentation is
  observation-only

### Key decisions
- D-46: `NODE_COUNT` is a `uint64[1]` global (not a scalar) — the
  established FastPy pattern (see `ZK_TABLE_INIT`) for a mutable
  module-level value, since bare non-array globals aren't part of the
  transpiler's supported global forms
- D-47: node counting lives in the Python-mode `_*_py` wrappers, not just
  the compiled `engine.py` functions — per D-19, `go depth N` today
  actually runs through `run.py`'s Python mirrors, not the compiled
  `alpha_beta`/`find_best_move`. Counting only in `engine.py` would leave
  the real, currently-running search path unmeasured. Both paths now
  count, so this is also ready the day the compiled binary gets a UCI
  shim (D-19's noted follow-up)
- D-48: `run_benchmark()` uses a full-window search at every depth, not
  the aspiration-window driver — a fail-low/fail-high re-search doubles
  (or more) the node count for that depth in a way that would make
  depth-to-depth node comparisons misleading. The benchmark's job is a
  clean, comparable per-depth count; real play still uses aspiration
  windows via `_iterative_deepening_py`

### Next (ROADMAP — Phase 6, Elite Engine, still open)
- Singular extensions
- NNUE neural network evaluation
- Lazy SMP multi-core search
- Optional (now unblocked): actually run the benchmark to quantify LMR /
  null move / aspiration window / futility pruning node reduction —
  Sessions 13-17 all deferred this for lack of a harness; the harness now
  exists in Python mode. A compiled-binary version still needs a UCI shim
  (D-19) before compiled NPS can be measured the same way
- Optional: adaptive null move / LMR reduction (D-36, D-39 follow-ups)
- Optional: convert `compute_hash()` to true incremental XOR (D-29 follow-up)

---

## Session 17 — Futility pruning (Phase 6a)

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `FUTILITY_MAX_DEPTH = 2`, `FUTILITY_MARGIN_1 = 150`,
  `FUTILITY_MARGIN_2 = 300`, `MATE_THRESHOLD = 32000` constants; added
  `futility_margin(depth)` helper (placed right after `is_quiet_move()`,
  before its caller `alpha_beta()` — see D-26); wired `futility_prune`
  computation into `alpha_beta()` right after the null-move pruning block
  (static eval only computed when depth <= 2, not in check, and alpha is
  far from mate scores); move loop restructured so a quiet, non-check
  move past the first at a node is skipped with no recursive search when
  `futility_prune` is set
- `run.py`: `_alpha_beta_py()` mirrors the same logic; new names added to
  the engine import list. Python-mode uses a real `continue` in the loop
  (FastPy dialect has no `continue` — see D-45 below for how `engine.py`
  expresses the same skip)

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- **165/165 tests passing** (154 existing + 11 new in `tests/test_phase6.py`)
- `perft(4)` = 197,281 / `perft(5)` = 4,865,609 ✅ unchanged (move
  generation untouched — futility pruning lives entirely inside
  `alpha_beta()`)
- Correctness sanity checks (Python-mode, via `run.py`):
  - Forced mate-in-1 (`Qxf7#` after `1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6??`) still
    found, with a real mate score (> `MATE_THRESHOLD - 100`), confirming
    the `MATE_THRESHOLD` guard keeps pruning away from mate lines
  - Startpos depth-4 and depth-5 searches return a legal move
  - Startpos depth-3 full-window score stays small in magnitude (< 200cp),
    as expected from a symmetric position, even with pruning active near
    the leaves
- Did not benchmark futility pruning's node/time reduction quantitatively
  on the compiled binary — same gap as LMR/null-move (Sessions 13, 14):
  no `go depth N` timing harness exists yet in the UCI loop for
  apples-to-apples node counts

### Key decisions
- D-45: futility pruning skip expressed as `if not skip_move: ... ; i += 1`
  in `engine.py` instead of `continue`, since FastPy's IR has no continue
  statement (only `IRBreak`); `run.py`'s Python mirror uses a real
  `continue` since it's plain Python, not compiled

### Next (ROADMAP — Phase 6, Elite Engine, still open)
- NNUE neural network evaluation
- Singular extensions
- Lazy SMP multi-core search
- Optional: benchmark futility pruning / aspiration windows / LMR / null
  move node reduction on the compiled binary (needs a `go depth N` timing
  harness — still not built, gap noted in Sessions 14, 15, 16)
- Optional: adaptive null move / LMR reduction (D-36, D-39 follow-ups)
- Optional: convert `compute_hash()` to true incremental XOR (D-29 follow-up)
- Optional: adaptive/deeper futility margins if Phase 6 benchmarking shows
  the current fixed 150/300cp values are too conservative or too loose

```

---

## Session 16 — test_phase5.py: unit coverage for all of Phase 5
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- New file `tests/test_phase5.py` (37 tests) covering everything Sessions
  10-15 added, at the unit level rather than only via the full test suite
  passing:
  - `TestComputeHash` (8) — determinism, hash changes on move, incremental
    == full recompute, transposition order-independence, side-to-move /
    castling-rights / en-passant sensitivity
  - `TestTranspositionTable` (9) — store/probe exact hits, depth-
    insufficient misses, EXACT/LOWER/UPPER bound semantics, `tt_get_move`
    hit/miss, always-replace overwrite behavior
  - `TestNullMovePruning` (7) — `make_null_move` flips side/clears EP/
    updates hash/preserves pieces, `side_to_move_lacks_major_minor` on
    starting position vs. king+pawns vs. lone-minor-piece
  - `TestIsQuietMove` (4) — quiet push, capture, promotion, en-passant
  - `TestFindBestMoveWindow` (3) + `TestIterativeDeepeningAspiration` (3) —
    windowed root search, 2-arg backward compatibility, widening-loop
    termination, legal-move guarantee
  - `TestPhase5Integration` (3) — `perft(4)` regression guard, forced
    mate-in-1 with every Phase 5 feature active together, TT-hit
    determinism (same position searched twice returns the same move/score)
- No changes to `engine.py` or `run.py` this session

### Results
- New file: 37/37 passing in 47.3s standalone
- Full suite: **154/154 passing** in 55.8s (117 existing + 37 new), run
  together to confirm the new tests' `reset_tt()` helper doesn't leak state
  into or out of `test_phase4.py`/`test_uci.py`

### Why this now
Flagged at the end of Session 15 as worth doing before Phase 6: five
sessions of TT/Zobrist/null-move/LMR/aspiration-window work had accumulated
with only end-to-end (`fastpy check` + full suite + perft + one mate
puzzle) verification, no isolated unit coverage. Session 15 itself hit a
stale-base mistake that a real test file would have caught via import
errors immediately rather than relying on manual re-verification.

### Next (ROADMAP — Phase 6, Elite Engine)
- NNUE neural network evaluation
- Futility pruning
- Singular extensions
- Optional: benchmark aspiration windows / LMR / null move node reduction
  on the compiled binary (needs a `go depth N` timing harness — still not
  built, gap noted in Sessions 14 and 15)
- Optional: adaptive null move / LMR reduction (D-36, D-39 follow-ups)
- Optional: convert `compute_hash()` to true incremental XOR (D-29 follow-up)


---

## Session 15 — Aspiration windows (Phase 5e) — closes out Phase 5
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: `find_best_move()` signature changed from `(board, depth)` to
  `(board, depth, alpha, beta, score_out: int32[1])` — accepts a caller-
  supplied window and writes the resulting score via an output param
  (FastPy has no tuple returns); internal logic otherwise unchanged
- `run.py`: `_find_best_move_py(board, depth, alpha=NEG_INF, beta=INF)` —
  same window support, with defaults preserving the existing 2-arg call
  used by `tests/test_phase4.py::test_find_best_move_returns_tuple`;
  `_iterative_deepening_py()` now runs an aspiration-window search from
  depth 4 onward, widening ×4 and re-searching the same depth on fail-
  low/fail-high, falling back to the full window once clamped

### A mid-session correction worth noting
The first attempt at this patch was built against a stale local copy of
`engine.py`/`run.py` (pre-Late-Move-Reductions) instead of the actual
committed `main`. Caught immediately by `pytest` failing to even collect
(`ImportError: cannot import name 'LMR_MIN_DEPTH'`) before anything was
presented. Re-fetched the live files from GitHub and reapplied the same
patch cleanly on the correct base — no bad delta was ever handed over.

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in 9.3s
- `perft(4)` = 197,281 ✅ unchanged (move generation untouched)
- Correctness sanity checks (Python-mode, via `run.py`):
  - Forced mate-in-1 (`Qxf7#`) still found via direct `_find_best_move_py`
    call with default full window
  - Full `_iterative_deepening_py()` driver runs depth 1→5 cleanly from the
    startpos with aspiration windows active at depths 4-5, sane scores and
    move throughout
  - Existing 2-arg call signature (`_find_best_move_py(board, 1)`) still
    works via defaults, confirming `tests/test_phase4.py` wouldn't break

### Key decisions
- D-42: `find_best_move()` takes explicit alpha/beta + `score_out` output
  param instead of always [NEG_INF, INF] — zero-risk signature change
- D-43: aspiration window retry loop lives only in `run.py` (no compiled
  iterative-deepening driver exists)
- D-44: window = 50cp, ×4 widening per retry, active from depth 4

### Phase 5 status: COMPLETE
Transposition table, Zobrist hashing, null move pruning, hash move
ordering, Late Move Reductions, and aspiration windows are all shipped,
tested, and documented.

### Next (ROADMAP — Phase 6, Elite Engine)
- NNUE neural network evaluation
- Futility pruning
- Singular extensions
- (Phase 6 also lists LMR as a duplicate — already done in Phase 5, see D-39/40/41)
- Optional: benchmark aspiration windows' node/time reduction on the
  compiled binary (needs a `go depth N` timing harness — still not built,
  same gap noted in Session 14)
- Optional: adaptive null move / LMR reduction (D-36, D-39 follow-ups)
- Optional: convert `compute_hash()` to true incremental XOR (D-29 follow-up)
- `test_phase5.py` covering all of Phase 5's features still not written —
  worth doing before starting Phase 6, given how much surface area has
  accumulated untested at the unit level (this session's stale-base mistake
  is exactly the kind of thing a real test_phase5.py would catch faster)


---

## Session 14 — Late Move Reductions (Phase 5d)
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `LMR_MIN_DEPTH = 3`, `LMR_FULL_SEARCH_MOVES = 4`,
  `LMR_REDUCTION = 1` constants; added `is_quiet_move()` next to `mvv_lva()`;
  wired LMR into `alpha_beta()`'s move loop — moves past the first 4, at
  depth ≥ 3, that are quiet and don't give check, get a reduced-depth
  null-window search first, with a full-depth re-search only if that beats
  alpha
- `run.py`: `_alpha_beta_py()` mirrors the same LMR logic (using
  `enumerate()` for move_num since Python-mode iterates a list, not an
  indexed array); new names added to the engine import list

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in 14.8s
- `perft(4)` = 197,281 ✅ unchanged (move generation untouched)
- Correctness sanity checks (Python-mode, via `run.py`):
  - Forced mate-in-1 (`Qxf7#` after `1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6??`) still
    found correctly with LMR active
  - Depth-5 startpos search returns a sane opening move (Nb1-c3) with a
    near-zero score
- Did not benchmark LMR's node/time reduction quantitatively — Python-mode
  search at depth 6+ is too slow to run in a reasonable time (that's exactly
  why the compiled path exists). A real benchmark needs the compiled binary
  wired to a UCI `go` command with timing; flagged as a follow-up, not done
  this session

### Key decisions
- D-39: fixed R=1, min depth 3, skip first 4 moves (conservative defaults)
- D-40: eligibility = quiet (pre-move board) + not giving check (post-move board)
- D-41: re-search uses the original full window, no PVS null-window step

### Next (ROADMAP — still open)
- Aspiration windows in iterative deepening
- Optional: benchmark LMR/null-move/hash-move-ordering node reduction on the
  compiled binary (needs a `go depth N` timing harness — not yet built)
- Optional: adaptive null move reduction (R=3 at higher depths — D-36 follow-up)
- Optional: adaptive LMR reduction (deeper reduction at higher move counts —
  D-39 follow-up)
- Optional: convert `compute_hash()` from full-recompute to true incremental
  XOR inside `make_move()`/`make_null_move()` (D-29 follow-up)
- `test_phase5.py` covering TT/Zobrist/hash-move-ordering/null-move-pruning/LMR
  still not written


---

## Session 13 — Null move pruning (Phase 5c)
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `NULL_MOVE_R = 2`, `NULL_MOVE_MIN_DEPTH = 3` constants;
  added `make_null_move()` (passes the turn, clears EP rights, recomputes
  hash) and `side_to_move_lacks_major_minor()` (zugzwang guard) after
  `make_move()`; wired a null-move try into `alpha_beta()` right after the
  `depth == 0` quiescence check, before move generation
- `run.py`: `_alpha_beta_py()` mirrors the same null-move logic; new names
  added to the engine import list

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in 10.0s
- `perft(4)` = 197,281 ✅ unchanged (move generation untouched)
- Correctness sanity check: engine still finds forced mate-in-1 (`Qxf7#`
  after `1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6??`) via `run.py`'s Python-mode wrapper,
  with null move pruning active — returns the mate score and the correct
  move, confirming the null-move try isn't swallowing forced-mate lines

### Key decisions
- D-36: fixed R=2 reduction, min depth 3 (adaptive R deferred)
- D-37: zugzwang guard = side to move has no knight/bishop/rook/queen
- D-38: `make_null_move()` pass-by-value, mirrors `make_move()` exactly

### Next (ROADMAP — still open)
- Late Move Reductions (LMR)
- Aspiration windows in iterative deepening
- Optional: adaptive null move reduction (R=3 at higher depths — D-36 follow-up)
- Optional: convert `compute_hash()` from full-recompute to true incremental
  XOR inside `make_move()`/`make_null_move()` (D-29 follow-up)
- `test_phase5.py` covering TT/Zobrist/hash-move-ordering/null-move-pruning
  still not written


---

## Session 12 — Hash move ordering (Phase 5b)
**Status:** COMPLETE ✅

### What changed (g-c-3/fastpy-engine)
- `engine.py`: added `TT_MOVE[1048576]` global array; `tt_store()` now takes
  a `move` param; added `tt_get_move(hash_key)` accessor (ignores depth/score
  usability — any stored move is worth trying first)
- `alpha_beta()`: after MVV-LVA sort, hash move (if present) is swapped to
  index 0 before the search loop; `best_move` is tracked and passed to
  `tt_store()`
- `find_best_move()`: previously searched root moves in raw generation order
  with no TT interaction at all — now sorts, does hash-move-first ordering,
  and stores its own result to the TT (D-34)
- `run.py`: `_alpha_beta_py()` / `_find_best_move_py()` mirror the above;
  `tt_get_move` added to the engine import list; `TT_MOVE` added to the
  Python-mode array init block

### Results
- `fastpy check` → zero errors. `fastpy build -O3` → compiles clean.
- 117/117 tests passing in **9.5s** (down from 18.6s pre-hash-move-ordering
  — real node reduction, not just noise)
- `perft(5)` = 4,865,609 ✅ unchanged (move generation untouched)

### Key decisions
- D-34: root search now sorts + TT-stores, matching interior nodes
- D-35: hash move promoted via post-sort swap-to-front, not merged into
  MVV-LVA scoring — keeps `sort_moves()`/`mvv_lva()` signatures stable

### Next (ROADMAP — still open)
- Null move pruning
- Late Move Reductions (LMR)
- Aspiration windows in iterative deepening
- Optional: convert `compute_hash()` from full-recompute to true incremental
  XOR inside `make_move()` (D-29 follow-up)
- `test_phase5.py` covering TT/Zobrist/hash-move-ordering still not written

---

## Session 11 — Fix engine.py / run.py Phase 5 desync (TT + Zobrist restored)
**Status:** COMPLETE ✅

### Root cause
`run.py` on `main` was already the Phase 5 (TT + Zobrist) version described
in Sessions 9–10, but `engine.py` on `main` was still Phase 4 — the delta
patches from those sessions were never committed, and `DECISIONS.md` was
never given the D-26…D-32 entries either. Result: `tests/test_phase4.py`
failed to collect (`ImportError: cannot import name 'TT_MASK'`), and
`tests/test_uci.py` had 21/77 failing with the suite taking 3m23s instead of
seconds.

### Fix (engine.py, g-c-3/fastpy-engine)
- Added TT constants/globals: `TT_SIZE`, `TT_MASK`, `TT_EXACT/LOWER/UPPER`,
  `TT_HASH/SCORE/DEPTH/FLAG[1048576]`
- Added Zobrist globals: `ZK_TABLE[768]`, `ZK_TABLE_INIT[1]`, mix constants
- Added free functions (after `pop_lsb`, before directional shifts):
  `zk_index`, `zk_rand`, `init_zk_table`, `zk_ep_key`, `compute_hash`,
  `tt_probe`, `tt_store`
- `BoardState.__init__`: added `self.hash: uint64 = 0`
- `make_move()`: added `board.hash = compute_hash(board)` before `return board`
  (full recompute, not incremental — see D-28)
- `alpha_beta()`: TT probe at entry, TT store at exit (EXACT/LOWER/UPPER)
- `find_best_move()`: `ZK_TABLE_INIT[0]` guard, seeds `board.hash`

### Results
- `fastpy check engine.py` → zero errors
- `fastpy build --optimize=O3` → compiles clean, zero warnings
- 117/117 tests passing in 18.6s (was: collection error + 21 failures / 3m23s)
- `perft(5)` = 4,865,609 ✅ unchanged (move generation untouched)
- Zobrist sanity checks: hash changes every move, incremental read matches
  fresh `compute_hash()`, transposition order-independence confirmed
  (`1.Nf3 Nf6 2.Nc3` hash == `1.Nc3 Nf6 2.Nf3` hash)

### Key decisions
- D-26: `run.py`'s import list is the contract when it and the log disagree
- D-27: `DECISIONS.md` entries must land in the same commit as the code
- D-28: `compute_hash()` full-recompute in `make_move()`, not incremental —
  original incremental implementation unrecoverable, correctness prioritised
- D-29: Zobrist keys via splitmix64 mixer (no `random` — not FastPy-compilable)
- D-30: EP key derived from `ZK_TABLE[file] ^ ZK_EP_MIX`, no separate array

### Next (ROADMAP — unaffected by this session, still open)
- Hash move ordering: try TT move first before MVV-LVA (biggest remaining gain)
- Null move pruning
- Late Move Reductions (LMR)
- Aspiration windows in iterative deepening
- **Optional follow-up**: convert `compute_hash()` full-recompute to true
  incremental XOR inside `make_move()` for the perf win described in D-28
- `test_phase5.py` / `test_phase6.py` still not on GitHub — write once the
  next roadmap item (hash move ordering) lands


---

## Session 10 — Transposition Table + Zobrist (clean apply from GitHub baseline)
**Status:** COMPLETE ✅

**FastPy transpiler (g-c-3/fastpy):**
- `parser.py`: IRGlobal dataclass, `_try_global()`, `_try_constant()` returns bool,
  `_resolve_target()` handles arbitrary subscript index expressions (`arr[a*64+b]`),
  `IRModule.globals_` field, `build()` includes globals_
- `type_system.py`: `_check_global()`, `_global_names` set pre-seeds `declared` in
  `_check_function()`, `check_module()` registers globals before checking functions
- `emitter.py`: `IRGlobal` import, `_emit_globals()` emits C++ global arrays in
  BSS segment (`uint64_t TT_HASH[1048576] = {};`), `emit()` calls `_emit_globals()`

**engine.py (g-c-3/fastpy-engine):**
- TT constants: `TT_SIZE=1048576`, `TT_MASK`, `TT_EXACT/LOWER/UPPER`
- Zobrist constants: `ZK_GOLDEN`, `ZK_SIDE`, `ZK_CASTLE_*`, `ZK_EP_*`
- Global arrays: `TT_HASH/SCORE/DEPTH/FLAG[1048576]`, `ZK_TABLE[768]`, `ZK_TABLE_INIT[1]`
- `BoardState.hash: uint64 = 0` field
- Free functions (after `pop_lsb`, before directional shifts — D-26):
  `zk_piece`, `zk_sq`, `zk_ep_key`, `init_zk_table`, `compute_hash`
- `select_next_move()` — lazy single-step selection after `sort_moves()`
- `make_move()` — full incremental Zobrist hash update (XOR in/out per piece)
- `tt_probe()`, `tt_store()` — before PIECE-SQUARE TABLES section
- `alpha_beta()` — TT probe at entry, TT store at exit, lazy sort
- `find_best_move()` — ZK_TABLE_INIT guard on first call

**run.py (g-c-3/fastpy-engine) — full replacement:**
- Python-mode TT arrays resized to 1M entries at import time
- `init_zk_table()` called once at module load
- `_apply_position()` seeds `board.hash` via `compute_hash()`
- `_alpha_beta_py()` uses `tt_probe`/`tt_store`
- `ucinewgame` clears TT arrays

**Results:**
- 117/117 tests passing (all GitHub tests)
- `fastpy check engine.py` — zero errors
- `g++ -O3 -march=native` — zero warnings
- perft(6) = 119,060,324 ✅ (reference correct)
- Nodes (depth 7): 134,976,638 → **46,640,189 (−65%)**
- Wall time (depth 7): 30.4s → **18.7s (−38%)**
- Perft NPS: 16.5M → **23.5M (+42%)**

**Key decisions:**
- D-29: `compute_hash` as free function not BoardState method (C++ ordering, D-26)
- D-30: `zk_piece` two-step via `idx: uint64` avoids operator-precedence C++ warnings
- D-31: `ZK_TABLE` precomputed lookup — single array index replaces 2 multiplies per move
- D-32: Python-mode TT arrays resized in `run.py` (not engine.py) — engine.py is dialect-only

**Next (ROADMAP):**
- Hash move ordering: try TT move first before MVV-LVA (free nodes, biggest remaining gain)
- Null move pruning
- Late Move Reductions (LMR)
- test_phase5.py + test_phase6.py not yet on GitHub — need to write and commit

---

## Session 9 — Transposition Table (Zobrist Hashing) + FastPy Transpiler Extensions
**Status:** COMPLETE ✅

### Completed

**FastPy transpiler (3 files changed):**
- `parser.py`: Added `IRGlobal` dataclass for mutable module-level arrays/scalars.
  `_try_constant()` now returns bool; new `_try_global()` handles non-Final
  annotated module-level declarations. `_resolve_target()` extended to support
  arbitrary subscript index expressions (`ZK_TABLE[ptype * 64 + sq]`).
  `IRModule` gains `globals_: list` field.
- `type_system.py`: `_check_global()` validates IRGlobal nodes.
  `_global_names` set pre-seeds `declared` in `_check_function()` so functions
  can write to global arrays without false "first use, no annotation" errors.
- `emitter.py`: `_emit_globals()` emits C++ global variables and zero-init arrays
  (`uint64_t TT_HASH[1048576] = {};`) in BSS segment — zero allocation, zero cost.

**engine.py (FastPy dialect, delta patches):**
- Added TT constants: `TT_SIZE`, `TT_MASK`, `TT_EXACT/LOWER/UPPER`
- Added Zobrist constants: `ZK_GOLDEN`, `ZK_SIDE`, `ZK_CASTLE_*`, `ZK_EP_*`
- Added global arrays: `TT_HASH/SCORE/DEPTH/FLAG[1048576]`, `ZK_TABLE[768]`,
  `ZK_TABLE_INIT[1]`
- Added `hash: uint64 = 0` field to `BoardState.__init__`
- Added free functions: `zk_piece()`, `zk_sq()`, `init_zk_table()`,
  `zk_ep_key()`, `compute_hash(board)` (free function, not method — D-26)
- Rewrote `make_move()` with full incremental Zobrist hash update (XOR in/out
  for every piece move, capture, castling rook, EP pawn, side, castling rights,
  EP file)
- Added `tt_probe()` and `tt_store()` with exact/lower/upper bound semantics
- Updated `alpha_beta()`: TT probe at entry, TT store with correct flag at exit
- Updated `find_best_move()`: calls `init_zk_table()` once on first call

**run.py (full file, changed):**
- Python-mode init block resizes TT arrays to 1M entries and ZK_TABLE to 768
- `_apply_position()` calls `compute_hash(board)` to seed incremental hash
- `_alpha_beta_py()` updated with TT probe + store matching compiled semantics
- Imports updated for all new symbols

### Key results
- Nodes searched (depth 7): **134,976,638 → 46,640,189 (-65%)**
- Wall time (depth 7): **30.4s → 23.0s (-24%)**
- perft(6): **119,060,324** (correct, unchanged)
- 169/169 tests passing, `fastpy check` zero errors, zero C++ compiler warnings

### Key decisions
- D-29: `compute_hash()` must be a free function, not a BoardState method.
  Struct methods in FastPy are emitted inside the struct definition, which
  appears before free functions. `compute_hash()` calls `lsb()`/`pop_lsb()`
  which are free functions — calling them from inside the struct causes C++
  "not declared in scope" errors. (D-26 applies to struct methods too.)
- D-30: `zk_piece()` inlining uses `idx * ZK_GOLDEN` in two steps to avoid
  C++ operator precedence warnings. FastPy's `& FULL_BOARD` bitwise wrap emits
  as `& (18446744073709551615ULL)` which causes pedantic warnings with inline
  multiply chains. Two-step via `idx: uint64` intermediate variable avoids this.
- D-31: ZK_TABLE precomputed lookup replaces per-call `zk_piece()` multiply in
  `make_move()` hot path. `init_zk_table()` fills 768 entries once on first
  `find_best_move()` call. `zk_sq()` is a single array index — no multiply.
- D-32: Python-mode TT arrays start as `[]` (FastPy dialect for C++ `= {}`).
  run.py resizes them with `[0] * N` immediately after import. This is the
  correct separation: engine.py declares, run.py initializes for Python mode.

### Next (ROADMAP Phase 5 remaining)
- Null move pruning (R&D: large NPS gain, moderate risk)
- Late Move Reductions (LMR) — cut nodes on quiet moves tried late
- Aspiration windows around iterative deepening
- Move TT to inform move ordering (hash move first)

---

## Session 8 — Phase 4: PST Evaluation + Checkmate/Stalemate Detection
**Date:** 2026-06-30
**Status:** COMPLETE ✅

### Completed
- `pst_pawn_sq/knight_sq/bishop_sq/rook_sq/king_sq(rank, file[, is_white]) -> int32`
  — separable rank+file arithmetic PSTs, no lookup arrays
- `pst_sum(pieces, is_white, ptype) -> int32` — lsb/pop_lsb iteration + per-square PST lookup
- `evaluate()` rewritten: material + PST bonuses, perspective-correct
  (verified: starting position evaluates to exactly 0 — fully symmetric)
- `is_side_to_move_in_check(board) -> bool8` — NEW function. `is_in_check()`
  checks the side that JUST moved (for move legality filtering); checkmate
  detection needs the side TO move — a different question. Caught via test failure.
- `alpha_beta()`: count==0 now returns `NEG_INF + depth` (checkmate, prefers
  shorter mates) or `0` (stalemate), using `is_side_to_move_in_check`
- `run.py`: `_alpha_beta_py` updated to match; `default_depth` 5→4 (PST
  per-node cost pushed bare `go` past comfortable UCI response time)
- `tests/test_phase5.py` NEW — 52 tests (PST squares, pst_sum, evaluate
  symmetry/perspective, checkmate via Fool's Mate, stalemate via constructed
  position, search-prefers-centre-pawns integration)
- **169/169 tests passing** (117 prior + 52 new)
- `fastpy check engine.py` → zero errors ✅
- `fastpy emit` → 1384 lines C++, `g++ -O3 -march=native -mpopcnt -mbmi -mbmi2`
  compiles with **zero warnings** ✅
- Full UCI smoke test: engine now scores `cp 30` instead of `cp 0` at depth 1
  and opens with `Nc3` (PST-favoured centre development) instead of a flat-eval move

### Key Decisions
- D-26: PST functions placed before `evaluate()` in file order — FastPy's
  emitter does not forward-declare free functions; call-before-define is a
  C++ compile error. Appending new functions at file end only works if
  nothing earlier in the file calls them.
- D-27: `is_side_to_move_in_check()` added as a separate function from
  `is_in_check()` rather than reusing/renaming it. `is_in_check()` is load-
  bearing for `generate_legal_moves()` (checks the side that just moved);
  changing its semantics would silently break move legality filtering.
- D-28: `default_depth` (bare `go`, no time/depth params) lowered 5→4 in
  run.py. PST evaluation runs `pst_sum`'s lsb/pop_lsb loop over every piece
  at every quiescence leaf — measurably more expensive per node than the
  old material-only `evaluate()`. No mid-search time abort exists yet
  (time is only checked between iterative-deepening depths), so a slow
  depth 5 search currently cannot be interrupted once started.

### Files changed
- fastpy-engine/engine.py (1549 → 1781 lines, +232 lines)
- fastpy-engine/run.py (488 → 495 lines, 3-line delta: import, check fn, default_depth)
- fastpy-engine/tests/test_phase5.py (NEW, 519 lines, 52 tests)

### Next
- Mid-search time abort (node-count or wall-clock check inside alpha_beta/
  quiescence, not just between depths) — needed before raising default_depth
  back up or trusting `go movetime`/`wtime` budgets under PST's higher cost
- Null move pruning
- Transposition table (Zobrist hashing)

---

## Session 7 — Phase 4: Search Improvements
**Date:** 2026-06-29
**Status:** COMPLETE ✅

### Completed
- `piece_at_square(sq, board) -> int32` — returns piece value for MVV-LVA
- `mvv_lva(move, board) -> int32` — victim*10 - attacker capture priority score
- `sort_moves(moves, count, board) -> None` — in-place selection sort (O(n²), n≤218)
- `generate_captures(board, moves, count) -> int32` — legal captures only (for qsearch)
- `quiescence(board, alpha, beta) -> int32` — stand-pat + capture search to avoid horizon effect
- Updated `alpha_beta` — depth==0 now calls `quiescence()` instead of `evaluate()`; `sort_moves()` before search loop
- `run.py` full rewrite — Phase 4 additions:
  - `_generate_captures_py()` Python wrapper
  - `_quiescence_py()` Python wrapper
  - `_alpha_beta_py()` updated: calls `_quiescence_py` at depth 0, MVV-LVA move ordering
  - `_iterative_deepening_py(board, max_time_ms, max_depth)` — IDS with info line output
  - `uci_loop()` updated: handles `go movetime N`, `go wtime N btime N`, `go infinite`, outputs info depth lines
- Fixed `tests/test_move_gen.py` path bug — `os.path.dirname(__file__)` pointed to tests/ not repo root
- Fixed `tests/test_uci.py` ENGINE_CMD — was `engine.py` (no UCI loop after D-23 split); updated to `run.py`
- `tests/test_phase4.py` NEW — 40 tests, all passing
- **117/117 tests passing** (56 move_gen + 21 uci + 40 phase4)
- `fastpy check engine.py` → zero errors ✅
- `fastpy emit` → 1206 lines C++, compiles clean with g++ -O3 -march=native ✅

### Key Decisions
- D-24: generate_captures uses generate_all_moves + filter (reuse existing logic, correct by construction)
- D-25: quiescence() and generate_captures() are compile-only; Python tests use run.py wrappers (same pattern as alpha_beta, generate_legal_moves)

### Files changed
- fastpy-engine/engine.py (1408 → 1549 lines, +141 lines)
- fastpy-engine/run.py (275 → 488 lines, full rewrite for Phase 4)
- fastpy-engine/tests/test_phase4.py (NEW, 410 lines, 40 tests)
- fastpy-engine/tests/test_move_gen.py (path fix only)
- fastpy-engine/tests/test_uci.py (ENGINE_CMD fix only)

### Next
Phase 4 continued: Piece-Square Tables (PST), null move pruning, transposition table

---

## Session 6 — Phase 3: Complete Move Generation
**Date:** 2026-06-28
**Status:** COMPLETE ✅

### Completed
- 8 ray generators (ray_north/south/east/west + 4 diagonals)
- knight_attack_mask, king_attack_mask (shared by move gen + check detection)
- generate_bishops, generate_rooks, generate_queens (ray-fill, zero allocation)
- is_sq_attacked(sq, board, by_black) — reverse attack tracing
- is_in_check(board) — post-make_move legality check
- generate_castling — full castling with rights + path + attack checks
- Updated generate_all_moves — all piece types + castling
- Updated make_move — castling rook movement + castling rights updates (positive masks)
- generate_legal_moves — pseudo-legal → filter by is_in_check
- perft(board, depth) — correctness benchmark function
- Updated alpha_beta + find_best_move → use generate_legal_moves
- 56 tests in test_move_gen.py — 56/56 passing
- Perft(1-4) verified: 20, 400, 8902, 197281 ✅
- Perft(5) = 4,865,609 verified via compiled binary (-O3 -march=native, 0.25s)
  Method: fastpy emit → patch stub main() → g++ -O3 -march=native → run

- Split engine.py / run.py (D-23): engine.py now 1408 lines (dialect only),
  run.py 275 lines (Python UCI runner). fastpy check + build + UCI all verified.

### Key Decisions
- D-21: Python make_move copy semantics (see DECISIONS.md)
- D-22: Castling rights use positive masks not bitwise NOT

### Files changed
- fastpy-engine/engine.py (600 → 1602 lines)
- fastpy-engine/tests/test_move_gen.py (new, 675 lines)

### Next
- Phase 4: Perft(5) from binary (4,865,609), UCI position parsing fixes,
  move ordering (MVV-LVA), quiescence search

---

## Session 5 — 2026-06-28

**Focus:** Sprint 8 — UCI Protocol.

**Completed:**
- `engine.py`: Fixed `knight: uint64 = 1 << from_sq` → `BIT_ONE << from_sq` in `generate_knights`. The `1` literal is a 32-bit int in C++; `BIT_ONE` (constexpr uint64_t) ensures correct 64-bit shift for all 64 squares.
- `engine.py`: Added complete UCI protocol in `if __name__ == '__main__':` block (FastPy silently skips this via `_visit_top_level`). Commands: `uci`, `isready`, `ucinewgame`, `position startpos [moves ...]`, `go [depth N]`, `stop`, `setoption`, `debug`, `quit`.
- `engine.py`: Added `_alpha_beta_py` and `_find_best_move_py` Python-mode wrappers inside the `__main__` block. These mirror the compiled search functions but use Python lists instead of `uint64[218]` stack arrays (which are unbound in Python mode). UCI loop uses these wrappers.
- `engine.py`: Added `_sq_to_str`, `_move_to_uci`, `_parse_sq`, `_parse_uci_move`, `_apply_position`, `_uci_loop` — all Python-only UCI helpers.
- `fastpy-engine/tests/test_uci.py` — NEW: 21 UCI integration tests (subprocess-based). Tests handshake, position parsing, search output format, robustness. **21/21 passing in 0.71s**.
- `fastpy check engine.py` → zero errors ✅
- `fastpy emit engine.py` → 663 lines C++ ✅
- `python engine.py` works as a full UCI engine — tested with Arena/Cutechess-style command sequences.

**Architectural decision recorded:** UCI loop lives in `if __name__ == '__main__':` (D-19 below). Python search wrappers needed because `moves: uint64[218]` bare declarations are unbound in Python.

**Files changed:**
- `fastpy-engine/engine.py` — UCI block added, knight BIT_ONE fix
- `fastpy-engine/tests/test_uci.py` — NEW

---

## Session 4 — 2026-06-27 

**Focus:** `make_move()`, two transpiler fixes, alpha-beta wired up.

**Completed:**
- Emitter: `_HOISTABLE_TYPES` set — hoisting now skips struct types (e.g. `BoardState`). `BoardState new_board = 0` is invalid C++; structs are declared inline where first used.
- Type checker: dotted targets (`board.white_pawns = ...`) now exempt from first-use annotation requirement. `"." not in target` replaces `not target.startswith("self.")` — covers both `self.field` and `param.field` struct writes.
- 3 new type_system tests → **171/171 passing**
- `engine.py`: Added `BIT_ONE: Final[uint64] = 1` constant — ensures `BIT_ONE << sq` emits as `uint64_t` shift (plain `1 << sq` is 32-bit int in C++, UB for sq > 30)
- `engine.py`: `make_move(board, move) -> BoardState` — full implementation. Value-copy semantics: takes BoardState by value, modifies the local copy, returns it. Handles: captures (all 6 piece types), en passant, double-push ep square update, promotions (queen/knight/bishop), side-to-move flip.
- `alpha_beta()`: wired up with `new_board: BoardState = make_move(board, moves[i])` — real recursive search, no more static evaluation placeholder.
- `fastpy check engine.py` → zero errors ✅
- `fastpy build engine.py --optimize=O3` → **662 lines C++, compiles clean** ✅

**Key C++ output verified:**

---

## Session 3 — 2026-06-27 (morning)

**Focus:** Complete emitter fixes, variable hoisting, fastpy-engine/engine.py Phase 1 full build.

**Completed:**
- Parser: subscript assignment targets (`moves[count] = value`, `moves[0] = 99`) — done
- Type checker: subscript writes to declared arrays pass cleanly — done
- Emitter fix 1: array params (`uint64[218]`) emit as `uint64_t* moves` via `_cpp_param()` helper
- Emitter fix 2: variable hoisting — `_collect_typed_scalars()` pre-declares all scalar locals at C++ function scope before the body, matching Python's flat scoping model. Fixes "not declared in this scope" errors in sibling while blocks.
- Emitter fix 3: bitwise right-operand explicit parens `(a & (b-1))` — silences `-Wparentheses`
- `_fn_declared` set tracks hoisted vars so annotated re-assignments emit as plain C++ assignments
- `double` → `double_push` rename in engine.py (C++ keyword conflict)
- Unused `move` variable removed from `alpha_beta` (Phase 1 placeholder)
- `main() -> int32` stub added to engine.py for linker
- 8 emitter tests updated/added (5 paren format, 3 array decay/hoisting) → **168/168 passing**
- `fastpy check engine.py` → zero errors ✅
- `fastpy build engine.py --optimize=O3` → **compiles and runs** ✅
- C++ output verified: `__builtin_popcountll`, `__builtin_ctzll`, `uint64_t* moves`, `uint64_t moves[218] = {}`

**Files changed:**
- `core/parser.py` — `_resolve_target` subscript support
- `core/type_system.py` — `_check_assign` subscript handling
- `core/emitter.py` — `_collect_typed_scalars`, `_cpp_param`, hoisting in `_emit_function`, `_fn_declared`, `_emit_binop` parens, `_emit_assign` scope fix
- `core/__init__.py` — NEW
- `pyproject.toml` — NEW
- `fastpy_main.py` — NEW
- `.github/workflows/ci.yml` — updated
- `tests/test_parser.py` — 4 new subscript tests
- `tests/test_type_system.py` — 3 new subscript tests
- `tests/test_emitter.py` — 8 tests updated/added
- `fastpy-engine/engine.py` — NEW (Phase 1 complete, compiles)

---

## Session 2 — 2026-06-26 (afternoon)

**Focus:** Test suite, bug fixes, project documentation infrastructure.

**Completed:**
- Wrote full 155-test suite across 4 test files + conftest + pytest.ini
- Fixed `uint64 = int` bug in `parser._try_type_alias` — ground-truth name checked first
- Fixed TZCNT partial-fire bug — rewrote `_match_tzcnt` as full inline pattern match, removed `_match_bit_length` from `_match_call`
- Fixed `test_unsupported_expression_raises` — switched from string literal (now valid) to lambda
- All 155 tests passing in 1.82s
- Wrote `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`
- Created `docs/` directory with all 5 documentation files
- Wrote Project Instructions for Claude Project

**Files changed:**
- `core/parser.py` — `_try_type_alias` fix + `IRCall.receiver` field
- `core/intrinsics.py` — TZCNT full inline rewrite
- `tests/conftest.py`, `test_parser.py`, `test_type_system.py`, `test_emitter.py`, `test_intrinsics.py` — new
- `pytest.ini` — new
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` — new
- `docs/` — all 5 files new

**Known issues carried forward:**
- `python -m pytest tests/ -v` not yet added to `ci.yml`
- `pyproject.toml` not written
- `fastpy-engine/engine.py` not started

---

## Session 1 — 2026-06-26 (morning)

**Focus:** Full Phase 1 transpiler build from scratch.

**Completed:**
- Designed complete FastPy architecture (6 modules)
- Wrote all 6 core modules: `parser.py`, `type_system.py`, `emitter.py`, `intrinsics.py`, `toolchain.py`, `main.py`
- Wrote `examples/simple_engine.py` — FastPy-dialect chess engine, zero type errors
- Fixed `simple_engine.py` — 11 type errors resolved (`moves: list = []`, pre-branch declarations, `-> tuple` return type, `best_move: uint64 = 0`)
- Set up CI workflow — green on first commit
- Wrote `fastpy` README (with FastPy-Engine section), `fastpy-engine` README, GPL v3 LICENSE
- Established Claude Project with both GitHub repos connected

**Key decisions made:**
- `IRCall.receiver` field to preserve `bin(board)` for POPCNT matching
- Ground-truth C++ type table in type_system to fix `uint64 = int → uint64_t`
- Intrinsics as a hook inside emitter, not a pre-pass
- `from __future__ import annotations` in `simple_engine.py` for Python runtime compatibility
- `list`/`tuple` accepted by type checker with TODO placeholder in C++ output

**Files created (all new):**
- `core/parser.py`, `core/type_system.py`, `core/emitter.py`, `core/intrinsics.py`, `core/toolchain.py`
- `main.py`
- `examples/simple_engine.py`
- `.github/workflows/ci.yml`
- `README.md`, `fastpy-engine/README.md`, `fastpy-engine/LICENSE`
