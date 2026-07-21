# PyR+ Architecture

## Pipeline

```
.pyr source file
    ↓
Lexer      (source text  → tokens)
    ↓
Parser     (tokens        → AST)
    ↓
Codegen    (AST           → Rust source string)
    ↓
rustc/cargo (Rust source  → binary)
```

Phase 0 constraint: Lexer, Parser, and Codegen must be hand-written
using only Rust std (see Decisions.md D007). No pest/chumsky/etc yet.

## Syntax mapping (draft — v0.1 subset)

Python-style input:
```python
def add(a: int, b: int) -> int:
    return a + b

def main():
    result = add(3, 4)
    print(result)
```

Transpiles to:
```rust
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    let mut result = add(3, 4);
    println!("{}", result);
}
```

Mapping rules established so far:
| PyR+ | Rust |
|---|---|
| `def name(a: T, b: T) -> T:` | `fn name(a: T, b: T) -> T {` |
| indentation block | `{ }` braces |
| `return expr` (last line, implicit or explicit) | `expr` (no trailing semicolon) or `return expr;` |
| `name = expr` | `let mut name = expr;` (D006: mutable by default) |
| `print(x)` | `println!("{}", x);` |
| `int`, `float`, `str`, `bool` | `i32`, `f64`, `String`/`&str`, `bool` |

Not yet designed: `if`/`elif`/`else`, loops, lists, strings/formatting,
classes, error handling, imports/modules.

## Type hint → Rust type table (draft, expand as needed)
| PyR+ hint | Rust type |
|---|---|
| `int` | `i32` |
| `float` | `f64` |
| `str` | `String` (or `&str` for params — TBD) |
| `bool` | `bool` |
| `list[T]` | `Vec<T>` (planned, Phase 1) |

## Ownership handling (v0.1)
Per D005: codegen auto-inserts `.clone()` on any value used after a
move point, rather than tracking real ownership/borrowing. This is a
deliberate simplification for Phase 0/1 — revisit in Phase 2.

## Open design questions
- Exact rule for when codegen decides `return` is implicit (last
  expression, Rust-style) vs when it emits an explicit `return` +
  semicolon
- String type: always `String`, or infer `&str` for read-only params?
- How multi-file PyR+ projects map to Rust's module system
