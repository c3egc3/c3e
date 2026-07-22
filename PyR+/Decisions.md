# PyRt Decisions Log

Record of design decisions and why they were made. Append new entries;
don't delete old ones (mark superseded if reversed, keep the history).

---

### D001 — Name

**Decision:** Project is called **PyRt** (naming history: first floated
as "Rust+", then briefly "PyR+", settled on **PyRt** as the final name).
**Why:** Reflects Python-syntax-in, Rust-output-out concept.

### D002 — Core concept

**Decision:** PyRt is Python-like syntax that transpiles to real Rust
source code (not a new compiler, not an interpreter).
**Why:** Get Rust's performance/safety/ecosystem for free by handing
final compilation to rustc, while giving users Python's lighter syntax.

### D003 — Build approach: transpiler over new compiler or macro-DSL

**Decision:** Build a transpiler (PyRt source → .rs source → rustc).
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
surfacing to the PyRt user, which matches the "less boilerplate" goal.
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

### D008 — Code verification method

**Decision:** Verification that emitted Rust actually compiles happens
via GitHub Actions (CI), not in Claude's sandbox. A workflow file
(`.github/workflows/build.yml`) runs `cargo build` + `cargo test`
automatically on every push to g-c-3/PyRt, showing a pass/fail check
directly on GitHub with full logs on failure.
**Why:** Claude's sandbox has no Rust toolchain installed and no
internet access, so it cannot compile or run Rust code at all (not
even std-only) — this was discovered and confirmed on 2026-07-22,
correcting an earlier wrong assumption that std-only Rust could be
run in-chat. GitHub Actions requires no terminal/coding knowledge from
Gokul: upload a file, then check the Actions tab on GitHub for a green
check or red X.
**Workflow:** Claude writes code → hands Gokul the files with exact
upload paths → Gokul uploads/commits to GitHub → Gokul checks the
Actions tab and reports back pass, or pastes the error log if it fails
→ Claude fixes based on the real compiler error.

### D009 — Source file extension

**Decision:** PyRt source files use the extension **`.pyrt`** (not
`.pyr`, which was used informally in early docs). The planned CLI
command is renamed `pyrtc` (was `pyrc`) to match.
**Why:** Matches the project's final name exactly, avoiding the
mismatch of a `.pyr` extension on a project called PyRt. Closest
precedent: Cython uses `.pyx` (Python-like syntax, compiles to C) —
same idea, PyRt's own extension should reflect its own name.

### D010 — Repo-freshness verification protocol

**Decision:** When checking the state of either repo (especially the
CODE repo, g-c-3/PyRt) at the start of a session or after Gokul
reports a change, Claude does not treat a single fetch of a
listing/root page as conclusive if it conflicts with what Gokul
reports. Protocol:
1. Fetch the repo root/tree page as usual.
2. If Gokul says files exist that the fetch didn't show (or vice
versa), re-fetch the specific file(s) directly by their expected
blob path (e.g. `.../blob/main/Cargo.toml`) rather than relying on
the root/tree listing — GitHub's root page can return a stale
"repository is empty" cache even after new commits land, while
direct file blob fetches reflect current content.
3. If a direct file fetch still seems stale or contradicts Gokul,
ask Gokul to paste the exact URL(s) they're viewing, since a
naming/branch mismatch (wrong repo, wrong fork, wrong branch) is
the other likely cause.
4. Treat Gokul's first-hand report of what he sees on GitHub as
higher-priority evidence than a cached fetch — verify via direct
file fetch rather than asserting the fetch is correct and Gokul is
mistaken.
**Why:** Discovered 2026-07-22 (Session 002) when a repo-root fetch
showed "This repository is empty" despite a scaffold (`Cargo.toml`,
`src/main.rs`, `.github/workflows/build.yml`) already existing on
`main` — direct blob-URL fetches of those three files immediately
showed the real content, confirming a stale cache on the root page
rather than a real absence of files.

**Update 2026-07-23:** the assumption that direct blob fetches are
always reliable turned out to be wrong too. A blob fetch of
`src/main.rs` returned old placeholder content even after Gokul had
pushed an updated version and GitHub Actions had already run a green
`cargo test` against the new version (confirmed via Gokul's
screenshots of the file listing and Actions tab, both showing the
update). So GitHub's caching can affect blob pages, not just root/tree
pages. Revised protocol: if Gokul reports a state (via description or
screenshot) that a fetch — root, tree, or blob — contradicts, treat
Gokul's report as authoritative and don't re-assert the fetch is
correct. Screenshots of the actual GitHub app are stronger evidence
than any fetch when the two disagree.

## Open questions (not yet decided)

- How are Python exceptions mapped to Rust's Result/panic model?
- Is there a real borrow-checker-aware mode planned, or is auto-clone
permanent?
- Module/package system design
- Whether classes map to structs+impls or something richer (traits?)
