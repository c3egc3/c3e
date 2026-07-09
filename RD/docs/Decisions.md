# Rogue Dragon — Decisions

Newest entry first. Records *what* we decided and *why* — not just what
changed (that's Sessions.md).

---

### D8 — NNUE: out of scope for now, optional future addition
**Date:** 2026-07-10
Confirmed with Gokul: NNUE evaluation is not part of the current work.
The existing classical evaluation (eval.cpp — hand-written PSTs and
heuristics) stays as the working evaluation function. NNUE is a large,
separate undertaking (training data, network format, inference code)
that only makes sense to revisit once the base engine is proven
functionally correct. No action taken now beyond noting this.

### D7 — Remove Syzygy/Fathom tablebase integration entirely (for now)
**Date:** 2026-07-10
Context: Gokul reported the engine worked correctly against
Fairy-Stockfish before adding the Syzygy tablebase ("C lib") files, and
stopped responding at all afterward — but wasn't fully certain of the
sequence, and doesn't recall why the files were added originally. Given
free hand to decide the architecture, decision: **remove the tablebase
code from Rogue Dragon entirely for now** (syzygy.cpp/.h, tbprobe.c/.h,
tbchess.c, tbconfig.h, stdendian.h, plus the SyzygyPath/SyzygyProbeLimit
UCI options and their call sites in search.cpp/uci.cpp).

Reasoning:
- It's ~4,100 lines (28% of the codebase) of vendored third-party C —
  the largest single source of build/linkage complexity in the project.
- Tablebase initialization scanning a misconfigured filesystem path is
  a very plausible, concrete explanation for a total non-response hang.
- It's genuinely optional — tablebases only ever activate at 6-7 pieces
  or fewer on the board; they add late-endgame precision, nothing else.
  They have no bearing on whether the engine works, plays legally, or
  respects the variant's rules.
- Stated goal is "a purely functional working custom variant chess
  engine" first — tablebases don't serve that goal.
- Not a permanent loss: Fathom is a well-known public-domain library,
  cleanly re-addable later from its own source if wanted, once the core
  engine is proven correct.

Confirmed via direct experiment: built the engine with tbprobe.c
excluded entirely and re-ran the mate-in-1 repro (see Roadmap 🔴) — bug
reproduced byte-for-byte identically (same nodes, same score, same PV).
This proves that specific bug is unrelated to tablebase code, and
supports debugging the core search/movegen without the TB code as a
confound.

### D6 — Insufficient-material draw detection: implement natively
**Date:** 2026-07-10
The JS prototype delegated this check to an external library (`chess.js`)
and never implemented it itself. A standalone UCI engine can't assume a
GUI will handle it. Decision: write native C++ detection (K vs K, K+B vs
K, K+N vs K, K+B vs K+B same-color-bishops, etc.) rather than leaving it
as an external dependency or an open gap. Tracked in Roadmap.

### D5 — Delivery format: copy-paste, not automated push
**Date:** 2026-07-10
Tested GitHub write access via the connected GitHub tool
(`create_or_update_file`) against both `g-c-3/rogue-dragon` and
`c3egc3/c3e` — both returned `403 Resource not accessible by
integration`. The connector has read access but not write access on
either repo. Rather than requiring Gokul to fix connector permissions
first, we're proceeding with manual delivery: small changes as
Find/Replace blocks, large new/rewritten files as a download link +
GitHub's own "Upload files" button. Claude retains standing read access
to both repos with no need to ask permission per read.

### D4 — Language: C++, continuing existing codebase
**Date:** 2026-07-10
Considered switching to Rust (mirroring Gokul's other project,
pet-dragon) vs. continuing in C++. Decision: **C++**, continuing from
the existing engine code. Reasoning: the core rule logic (unmoved-pawn
tracking, corner-locked castling, en passant) is already ported from a
working JS prototype and confirmed matching. A Rust rewrite at this
stage would discard validated work and effectively restart the project
— which we explicitly determined this effort is *not*. Rust remains a
plausible future target once the C++ version is proven correct (this
appears to be the path pet-dragon itself took), not a starting point.

### D3 — Keep original variant rules as-is
**Date:** 2026-07-10
Considered moving toward pet-dragon's more conservative opening-position
style. Decision: keep the original rules unchanged — full 16.4-trillion
random-opening space, pawn-rights-follow-the-piece, corner-locked
castling. No simplification.

### D2 — Full rename: c3 / c3e / c3engine → rogue
**Date:** 2026-07-10
Every identifier, comment, filename, commit message, and UCI protocol
token (including the `position c3 <fen>` subcommand) referencing the old
project name is renamed to `rogue`. Exception: vendored third-party code
(Fathom tablebase probing, the endianness header) keeps its own upstream
naming — renaming third-party library internals would make future
upstream updates harder to apply and provides no benefit.
The JS reference implementation is retained privately as a debugging
oracle only, never named or linked in anything delivered into the
`rogue-dragon` repo.

### D1 — Two-track debugging strategy by file provenance
**Date:** 2026-07-10
Roughly 40% of the codebase was ported from a JS prototype (core rules:
board, movegen, zobrist, uci, tt) and can be validated by direct
behavioral diff against that reference. The remaining ~60% (eval,
search, tablebase probing, opening book, bitboard generation) was
written natively in C++ with no reference implementation, and has to be
validated against chess-engine theory and test suites instead (perft,
tactical test suites, reference-engine comparison). This distinction
determines which validation method applies file-by-file — logged in
Project.md's file map.
