# PyR+ Decisions Log

Record of design decisions and why they were made. Append new entries;
don't delete old ones (mark superseded if reversed, keep the history).

---

### D001 — Name
**Decision:** Project is called PyR+ (originally floated as "Rust+").
**Why:** Reflects Python-syntax-in, Rust-output-out concept.

### D002 — Core concept
**Decision:** PyR+ is Python-like syntax that transpiles to real Rust
source code (not a new compiler, not an interpreter).
**Why:** Get Rust's performance/safety/ecosystem for free by handing
final compilation to rustc, while giving users Python's lighter syntax.

### D003 — Build approach: transpiler over new compiler or macro-DSL
**Decision:** Build a transpiler (PyR+ source → .rs source → rustc).
**Why:** A from-scratch compiler means reimplementing borrow checking
and LLVM codegen (multi-year effort). A macro-DSL inside Rust can't
actually change surface syntax. A transpiler gets full syntax freedom
while reusing rustc's type system, borrow checker, and optimizer.

### D004 — v0.1 type system
**Decision:** Require type hints (Python-style `def add(a: int, b: int) -> int:`)
that map directly to Rust types. Full type inference deferred.
**Why:** Full inference is a much harder problem; explicit hints keep
v0.1 buildable while still feeling like familiar Python typing syntax.

### D005 — v0.1 ownership/borrowing
**Decision:** Hide ownership by default — auto-insert `.clone()` where
the borrow checker would otherwise complain. Lighter/explicit borrow
syntax may be added later for users who want it.
**Why:** Trades some performance for zero borrow-checker errors
surfacing to the PyR+ user, which matches the "less boilerplate" goal.
Revisit in Phase 2 once the basic pipeline works.

### D006 — v0.1 mutability
**Decision:** Variables are mutable by default (Python-like), rather
than requiring Rust's explicit `mut`.
**Why:** Matches Python expectations; simplicity over strictness at
this stage.

### D007 — Prototype dependency constraint
**Decision:** Phase 0 lexer/parser/codegen must use only the Rust
standard library, no external crates.
**Why:** Claude's sandbox (used to build/test in-chat) has no internet
access, so crates.io dependencies can't be fetched there. Keeping
Phase 0 dependency-free lets Claude actually compile and run the
prototype live during sessions before handing code to the user.
**Status:** Applies to Phase 0 only — revisit once working in
GitHub Codespaces (Phase 3), which has real internet access.

---

## Open questions (not yet decided)
- How are Python exceptions mapped to Rust's Result/panic model?
- Is there a real borrow-checker-aware mode planned, or is auto-clone
  permanent?
- Module/package system design
- Whether classes map to structs+impls or something richer (traits?)
