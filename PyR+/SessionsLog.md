# PyRt Sessions Log

Chronological record of what happened each working session. Newest
entry on top. Paste the latest entries (or the whole file) at the
start of a new conversation so Claude has continuity.

---

## Session 002 — 2026-07-22
**Did:**
- Renamed project from "PyR+" to final name **PyRt** across all docs
  and instructions (D001 updated with full naming history).
- Split repos: docs stay in c3egc3/c3e (folder still named PyR+ on
  disk, left as-is by Gokul's choice — content is what matters);
  actual code goes in g-c-3/PyRt (confirmed empty and accessible).
- Added instructions covering: Gokul has no coding knowledge (Claude
  writes all code, decisions/confirmation only from Gokul), and a
  token-efficient edit workflow (str_replace/append on existing files
  instead of full rewrites, always hand back files with exact upload
  paths).
- **Important correction:** tested and confirmed Claude's sandbox has
  NO Rust toolchain installed AND no internet access — it cannot
  compile/run any Rust code at all, not even std-only as previously
  (wrongly) assumed. See D008.
- Decided verification method: GitHub Actions CI on g-c-3/PyRt. Built
  the initial scaffold: Cargo.toml, src/main.rs placeholder (passes a
  trivial test), and .github/workflows/build.yml which auto-runs
  `cargo build` + `cargo test` on every push, giving Gokul a pass/fail
  check on GitHub with no terminal needed.

**Next session should:**
- Gokul uploads the scaffold files to g-c-3/PyRt, confirms the first
  Actions run goes green
- Once confirmed, draft the actual v0.1 syntax spec with concrete
  before/after examples (Architecture.md draft section needs fleshing
  out further)
- Start writing the real hand-written lexer for the smallest subset
  (function def, one param, return, print), push it, verify via CI

**Open threads carried forward:**
- See "Open questions" in Decisions.md

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
