# Rogue Dragon — Decisions

Newest entry first. Records *what* we decided and *why* — not just what
changed (that's Sessions.md).

---

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
