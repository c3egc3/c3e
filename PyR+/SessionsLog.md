# PyR+ Sessions Log

Chronological record of what happened each working session. Newest
entry on top. Paste the latest entries (or the whole file) at the
start of a new conversation so Claude has continuity.

---

## Session 001 — 2026-07-21
**Did:**
- Defined the project concept: Python-syntax front end, transpiles to
  Rust, compiled by rustc.
- Chose transpiler approach over new compiler / macro-DSL (D003).
- Set v0.1 scope decisions: required type hints (D004), auto-clone
  ownership handling (D005), mutable-by-default (D006).
- Established working constraints: mobile-only, no local dev env,
  GitHub as storage, Claude sandbox has no internet so Phase 0 must be
  dependency-free (D007).
- Set up the four tracking docs (this one, Roadmap, Decisions,
  Architecture) and a Claude Project custom-instructions block.

**Next session should:**
- Draft the actual v0.1 syntax spec with concrete before/after examples
  (see Architecture.md draft section — needs fleshing out)
- Start the hand-written lexer for the smallest possible subset
  (function def, one param, return, print) and get it running in-chat

**Open threads carried forward:**
- See "Open questions" in Decisions.md
