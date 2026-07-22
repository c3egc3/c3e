# PyR+ Roadmap

Language with Python-like syntax that transpiles to Rust source code.

## Phase 0 — Prototype (hand-written, no external crates)

Goal: prove the pipeline end-to-end on a tiny subset of syntax.

- [ ] Define v0.1 syntax subset (functions, let/assignment, ints, basic
math, `print`, `if`, one loop form)
- [x] Hand-written lexer (tokenizer) — std only (v0.1 minimal subset:
def/one param/return/print, with Indent/Dedent handling — src/lexer.rs)
- [ ] Hand-written parser → AST — std only
- [ ] Codegen: AST → valid Rust source (string emission)
- [ ] Verify: transpile a sample .pyrt file, compile the emitted .rs,
run it, confirm correct output
- [ ] Commit working prototype to repo under /src

## Phase 1 — Expand the language subset

- [ ] Functions with multiple args + return values
- [ ] Strings, basic string formatting
- [ ] Structs / simple data types (Python-style class → Rust struct)
- [ ] Lists → Vec
- [ ] Basic control flow: while, for, if/elif/else
- [ ] Error handling story (Python exceptions vs Rust Result — decide
mapping, see Decisions.md)

## Phase 2 — Ownership & borrowing story

- [ ] Decide and implement how PyR+ hides/exposes ownership (see
Decisions.md v0.1 defaults: auto-clone, mutable by default)
- [ ] Revisit whether smarter borrow inference is worth the complexity

## Phase 3 — Tooling

- [ ] Move to GitHub Codespaces for real `cargo` + external crates
- [ ] Consider real parser crate (pest/chumsky) once past hand-written
prototype limits
- [ ] Basic CLI: `pyrtc build file.pyrt` → runs rustc, produces binary
- [ ] Error messages that point back to PyR+ source lines, not
generated Rust lines

## Phase 4 — Ecosystem / usability

- [ ] Package/module system
- [ ] Interop with existing Rust crates from PyR+ code
- [ ] Docs / examples / playground

## Status

Current phase: **Phase 0, in progress** — lexer done for the v0.1
minimal subset (def/one param/return/print); parser is next.
