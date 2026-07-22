# PyR+ Sessions Log

Chronological record of what happened each working session. Newest
entry on top. Paste the latest entries (or the whole file) at the
start of a new conversation so Claude has continuity.

---

## Session 004 — 2026-07-23

**Did:**

- Before starting the parser, re-fetched `src/main.rs` to confirm the
baseline and got old placeholder content back — despite Gokul having
already confirmed a green CI check for the lexer update. Raised this
as a real concern (rather than assuming it was fine) before proceeding.
- Gokul provided screenshots of the actual GitHub app: file listing
showing `lexer.rs` and `main.rs` both updated, and the Actions tab
showing the relevant run (Build PyRt #6, commit 87794c8) green. This
confirmed the lexer work is genuinely live and verified — the fetch
was stale, not the repo.
- Updated D010 in Decisions.md: direct blob-URL fetches, previously
assumed reliable even when root/tree pages were stale, turned out to
also be capable of returning stale content. Revised the protocol to
treat Gokul's first-hand report/screenshots as authoritative over any
fetch, regardless of which page type (root, tree, or blob) is stale.

**Next session should:**

- Write the hand-written parser (tokens → AST) for the minimal subset
(as originally planned for Session 003/004) — proceeding now on the
confirmed-correct file contents from Session 003, without re-fetching
main.rs/lexer.rs again this session since Gokul's screenshots already
confirm their live state matches what was generated

**Open threads carried forward:**

- See "Open questions" in Decisions.md
- Whether to eventually relax the tabs-not-allowed-for-indentation
lexer rule (currently an implementation choice, not a locked decision)

## Session 003 — 2026-07-22

**Did:**

- Drafted the v0.1 *minimal* syntax subset for the lexer to target
(smaller than the full syntax-mapping draft in Architecture.md): one
function def, one typed param, `return`, `print`. Example:
`def show(x: int) -> int:` / `print(x)` / `return x`.
- Wrote the real hand-written lexer (`src/lexer.rs`) covering that
subset, including Python-style significant indentation via an
Indent/Dedent token scheme, tab-rejection, and blank-line/comment
handling. Included `cargo test` cases covering the sample program's
token sequence and error cases (tabs, inconsistent dedent).
- Updated `src/main.rs` to run the lexer on the sample program and
print its tokens, replacing the old scaffold placeholder (kept the
pre-existing sanity test).
- Corrected the workflow assumption baked into the old "Next session
should" note: it said "get it running in-chat," but per the
2026-07-22 sandbox correction (D008) Claude cannot run/compile Rust
at all — verification is via GitHub Actions `cargo test`, not
in-chat execution. Used the Python sandbox instead to conceptually
mirror and sanity-check the tokenizing/indentation algorithm before
writing the Rust.
- Confirmed with Gokul that the pushed lexer.rs/main.rs changes passed
GitHub Actions (green check) — lexer is verified working end-to-end
via `cargo test`, not just in-chat reasoning.
- Found Roadmap.md was stale in two ways and fixed both: (1) it still
said "Phase 0, not yet started" despite scaffold + lexer work done;
(2) it still referenced the old `.pyr`/`pyrc` naming superseded by
D009 (`.pyrt`/`pyrtc`). Ticked the lexer checkbox and updated status.
- Added a "Lexer (implemented)" section to Architecture.md documenting
the token set and design choices actually made (spaces-only
indentation, comment/blank-line handling), separate from the
broader syntax-mapping draft which stays aspirational.

**Next session should:**

- Write the hand-written parser (tokens → AST) for the same minimal
subset the lexer covers
- Once parser exists, start codegen (AST → Rust source string) to
close the loop on the "def/param/return/print" example end-to-end

**Open threads carried forward:**

- See "Open questions" in Decisions.md
- Whether to eventually relax the tabs-not-allowed-for-indentation
lexer rule (currently an implementation choice, not a locked decision)

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
