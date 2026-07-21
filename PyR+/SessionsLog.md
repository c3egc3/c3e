# PyR+ Sessions Log

Chronological record of what happened each working session. Newest
entry on top. Paste the latest entries (or the whole file) at the
start of a new conversation so Claude has continuity.

---

## Session 002 — 2026-07-22

**Did:**

- Confirmed the CODE repo (g-c-3/PyRt) is no longer empty: a scaffold
had been pushed (outside this log) consisting of `Cargo.toml`,
`src/main.rs` (placeholder that just prints a confirmation message
and has one sanity-check test), and `.github/workflows/build.yml`
(CI pipeline that runs `cargo build` + `cargo test` on every push).
This scaffold exists to prove the CI pipeline works before any real
PyRt code is added — it is not language logic yet.
- Discovered and corrected a stale-fetch issue: an initial `Go`
re-fetch of the code repo's root page showed "This repository is
empty," which was a cached response predating the scaffold push.
Direct fetches of the specific file blob URLs (`Cargo.toml`,
`src/main.rs`, `.github/workflows/build.yml`) returned the real,
current content. Adopted a verification protocol going forward — see
D010 in Decisions.md.
- Confirmed (also see D008 in Decisions.md) that Claude's sandbox has
no Rust toolchain and no internet access, so all compile/test
verification must happen via GitHub Actions CI on g-c-3/PyRt, not
in-chat.

- Confirmed with Gokul that the Actions run for the scaffold push
passed (green check) — CI pipeline (checkout → install Rust →
`cargo build` → `cargo test`) is verified working end-to-end.

**Next session should:**

- Draft the actual v0.1 syntax spec with concrete before/after examples
(see Architecture.md draft section — needs fleshing out)
- Start the hand-written lexer for the smallest possible subset
(function def, one param, return, print) and get it running in-chat

**Open threads carried forward:**

- See "Open questions" in Decisions.md
- Whether earlier scaffold-setup work (Cargo.toml, main.rs, CI config)
was done in an untracked session — no prior SessionsLog entry covered
it before now

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
