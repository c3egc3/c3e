# FastPy-Engine — Architecture 

This document covers the internal architecture of `g-c-3/fastpy-engine` —
the chess engine written in FastPy dialect Python and compiled by FastPy to native C++.

The transpiler architecture is in `ARCHITECTURE.md`.
The relationship between the two repos is explained at the bottom of this file.

---

## File Structure

| File | Purpose | Seen by FastPy? |
|---|---|---|
| `engine.py` | FastPy dialect only. All compiled functions. `fastpy build engine.py` → native binary. No `__main__`, no imports, no Python-only code. | ✅ Yes |
| `run.py` | Python-only runner. `from engine import *`. UCI loop, `_perft_py`, `_alpha_beta_py`, `_generate_legal_moves_py`. Run with `python run.py`. | ❌ No |
| `tests/test_move_gen.py` | Move generation correctness tests. 56 tests. | ❌ No |
| `tests/test_uci.py` | UCI protocol tests. | ❌ No |

---

## Performance Targets

| Implementation | NPS Target |
|---|---|
| Pure Python chess engine | ~50,000 |
| Python + PyPy | ~150,000 |
| Python + Numba | ~5,000,000 |
| Hand-written C++ (Stockfish single thread) | 100,000,000 — 300,000,000 |
| **FastPy-Engine Phase 1 target (single thread)** | **100,000,000+** |
| **FastPy-Engine Phase 4 target (multi-core)** | **1,000,000,000** |

**Correctness benchmark:** Perft(5) from starting position = **4,865,609 nodes**
This must match exactly before any NPS benchmark is meaningful.

---

## Board Representation

### 12-Bitboard Design

The entire board state is stored as 12 × 64-bit integers — one per piece type per colour.
Each bit in a `uint64` represents one square (bit 0 = a1, bit 63 = h8).

```python
class BoardState:
    # White pieces
    white_pawns:   uint64    # = 0x000000000000FF00 (starting position)
    white_knights: uint64    # = 0x0000000000000042
    white_bishops: uint64    # = 0x0000000000000024
    white_rooks:   uint64    # = 0x0000000000000081
    white_queens:  uint64    # = 0x0000000000000008
    white_king:    uint64    # = 0x0000000000000010

    # Black pieces
    black_pawns:   uint64    # = 0x00FF000000000000
    black_knights: uint64    # = 0x4200000000000000
    black_bishops: uint64    # = 0x2400000000000000
    black_rooks:   uint64    # = 0x8100000000000000
    black_queens:  uint64    # = 0x0800000000000000
    black_king:    uint64    # = 0x1000000000000000

    # Game state
    white_to_move:      bool8
    castling_rights:    int32    # 4 bits: KQkq = 0b1111
    en_passant_square:  uint64   # single bit set, or 0
    halfmove_clock:     int32
    fullmove_number:    int32
```

**Why bitboards?** Each operation on all 64 squares happens in a single CPU instruction.
`white_pieces = white_pawns | white_knights | white_bishops | white_rooks | white_queens | white_king`
— that's 5 OR operations covering the entire board simultaneously.

### Derived Bitboards (computed on demand, not stored)

```python
def white_pieces(self) -> uint64:
    return (self.white_pawns | self.white_knights | self.white_bishops |
            self.white_rooks | self.white_queens | self.white_king)

def black_pieces(self) -> uint64:
    return (self.black_pawns | self.black_knights | self.black_bishops |
            self.black_rooks | self.black_queens | self.black_king)

def all_pieces(self) -> uint64:
    return self.white_pieces() | self.black_pieces()

def empty_squares(self) -> uint64:
    return ~self.all_pieces() & 0xFFFFFFFFFFFFFFFF
```

### Square Indexing

```
a8=56  b8=57  c8=58  d8=59  e8=60  f8=61  g8=62  h8=63
a7=48  b7=49  ...
...
a1=0   b1=1   c1=2   d1=3   e1=4   f1=5   g1=6   h1=7
```

Bit N is set if the piece occupies square N.

---

## Move Encoding

**Decision (D-01 from DP-01):** Moves are packed into a single `uint64`.

Session 51 (D-87) widened the promotion field from 2 to 3 bits to make
room for `PROMO_ROOK`, and shifted the flags field up by one bit as a
result — see D-87 in DECISIONS.md for the rationale.

```
Bits  0-5:   from_square  (0-63)
Bits  6-11:  to_square    (0-63)
Bits 12-14:  promotion    (0=none, 1=knight, 2=bishop, 3=rook, 4=queen)
Bits 15-16:  flags        (0=normal, 1=castling, 2=en_passant, 3=reserved)
Bits 17-63:  unused — reserved for score in move ordering
```

```python
def encode_move(from_sq: int32, to_sq: int32) -> uint64:
    return from_sq | (to_sq << 6)

def move_from(move: uint64) -> int32:
    return move & 63

def move_to(move: uint64) -> int32:
    return (move >> 6) & 63
```

**Why single uint64?** One array, no struct overhead, passes through registers.
The move list `moves: uint64[218]` is a flat C-style array on the CPU stack.
218 is the maximum legal moves in any chess position.

---

## Move Generation Pattern

Move generators use an **output-parameter pattern** — they fill a pre-allocated array
and return the updated move count. This avoids any heap allocation.

```python
def generate_white_pawns(
    board: BoardState,
    moves: uint64[218],
    count: int32
) -> int32:
    # ... fills moves[count], moves[count+1], ...
    # returns new count
    ...

# In the search:
moves: uint64[218]
count: int32 = 0
count = generate_white_pawns(board, moves, count)
count = generate_white_knights(board, moves, count)
# etc.
```

**FastPy compiles this to:** `uint64_t moves[218]` on the CPU stack. Zero heap allocation.

### Bitboard Shift Operations

All directional attacks use bitboard shifts with wrap-prevention masks:

```python
FILE_A: Final[uint64] = 0x0101010101010101  # All squares on the A file
FILE_H: Final[uint64] = 0x8080808080808080  # All squares on the H file

def north(board: uint64) -> uint64:
    return (board << 8) & 0xFFFFFFFFFFFFFFFF

def east(board: uint64) -> uint64:
    return (board << 1) & ~FILE_A & 0xFFFFFFFFFFFFFFFF  # Prevent a-file wrap

def south_west(board: uint64) -> uint64:
    return (board >> 9) & ~FILE_H
```

### LSB Iteration Pattern

To iterate over all pieces of a type:

```python
temp: uint64 = board.white_knights
while temp:
    sq: int32 = lsb(temp)          # FastPy → __builtin_ctzll(temp)
    # ... generate moves from sq
    temp = temp & (temp - 1)       # pop LSB — FastPy → BLSR instruction
```

### Sliding Piece Rays (Phase 3)

Bishops, rooks, and queens use ray generators — fill from a square until hitting a blocker (inclusive, so captures work):

```python
def ray_north(sq_bb: uint64, occupied: uint64) -> uint64:
    attacks: uint64 = 0
    ray: uint64 = north(sq_bb)
    while ray:
        attacks = attacks | ray
        if ray & occupied:
            break
        ray = north(ray)
    return attacks
```

8 ray functions (N, S, E, W, NE, NW, SE, SW). Bishops use 4 diagonal rays, rooks use 4 straight rays, queens use all 8.

### Check Detection

```python
def is_sq_attacked(sq: int32, board: BoardState, by_black: bool8) -> bool8:
    # Reverse-trace all attack types from the target square
    # by_black=True → checks black pieces; False → checks white pieces

def is_in_check(board: BoardState) -> bool8:
    # Called after make_move(). Checks if the side that JUST MOVED
    # left their king in check (white_to_move has already flipped).
```

### Legal Move Generation

```python
def generate_legal_moves(board, moves, count) -> int32:
    pseudo: uint64[218]           # stack array — C++ only
    pcount: int32 = 0
    pcount = generate_all_moves(board, pseudo, pcount)
    # Filter: remove any move where is_in_check(new_board) is True
```

---

## Search Architecture

### Algorithm: Negamax with Alpha-Beta Pruning

```python
def alpha_beta(
    board: BoardState,
    depth: int32,
    alpha: int32,
    beta: int32
) -> int32:
    if depth == 0:
        return evaluate(board)

    moves: uint64[218]
    count: int32 = 0
    count = generate_legal_moves(board, moves, count)

    if count == 0:
        return 0  # Stalemate (simplified — no checkmate detection yet)

    best: int32 = NEG_INF
    for i in range(count):
        # make_move(board, moves[i])
        score: int32 = -alpha_beta(board, depth - 1, -beta, -alpha)
        # unmake_move(board, moves[i])

        if score > best:
            best = score
        if score > alpha:
            alpha = score
        if alpha >= beta:
            break  # Beta cutoff

    return best
```

**FastPy compiles this to:** Recursive C++ function with stack-allocated move arrays.
No heap allocation at any depth. No GC pause ever interrupts the search.

### Evaluation (Phase 1 — Material Only)

```python
def evaluate(board: BoardState) -> int32:
    white: int32 = (
        popcount(board.white_pawns)   * 100  +
        popcount(board.white_knights) * 320  +
        popcount(board.white_bishops) * 330  +
        popcount(board.white_rooks)   * 500  +
        popcount(board.white_queens)  * 900
    )
    black: int32 = (
        popcount(board.black_pawns)   * 100  +
        popcount(board.black_knights) * 320  +
        popcount(board.black_bishops) * 330  +
        popcount(board.black_rooks)   * 500  +
        popcount(board.black_queens)  * 900
    )
    if board.white_to_move:
        return white - black
    return black - white
```

`popcount()` → `__builtin_popcountll()` → POPCNT instruction — 1 clock cycle per call.

### Score Constants (centipawns)

```python
INF:     Final[int32] = 32767
NEG_INF: Final[int32] = -32767
VAL_PAWN:   Final[int32] = 100
VAL_KNIGHT: Final[int32] = 320
VAL_BISHOP: Final[int32] = 330
VAL_ROOK:   Final[int32] = 500
VAL_QUEEN:  Final[int32] = 900
VAL_KING:   Final[int32] = 20000
```

---

## UCI Protocol

FastPy-Engine communicates via the Universal Chess Interface (UCI) protocol.
Works with Arena, Cutechess, Lichess Bot API, and any UCI-compatible GUI.

### Required Commands (Phase 1)

```
GUI → Engine:   uci
Engine → GUI:   id name FastPy-Engine
                id author Gokul Chandar
                uciok

GUI → Engine:   isready
Engine → GUI:   readyok

GUI → Engine:   position startpos
GUI → Engine:   position startpos moves e2e4 e7e5
GUI → Engine:   go depth 6
Engine → GUI:   bestmove e2e4

GUI → Engine:   quit
```

### Move Format

Moves in UCI are long algebraic notation: `e2e4`, `g1f3`, `e7e8q` (promotion).

```python
def sq_to_str(sq: int32) -> str:
    file_char = chr(ord('a') + (sq & 7))
    rank_char = chr(ord('1') + (sq >> 3))
    return file_char + rank_char
```

---

## Two-Repo Relationship

```
g-c-3/fastpy          (MIT)    — the tool
g-c-3/fastpy-engine   (GPL v3) — uses the tool

Build command:
    cd fastpy-engine/
    fastpy build engine.py --optimize O3
    ./engine     # exits 0 immediately — main() is a no-op stub, see below
```

**`./engine` doesn't play games.** `fastpy build` compiles `engine.py`
correctly, but its `main()` is a deliberate no-op stub (Core Rule 6),
so running `./engine` just proves the build succeeded. To actually play:
- `python3 run.py` — Python-mode UCI, correct, works today, slow
  (thousands of nodes/sec).
- `./fastpy_engine_uci` (built via `training/build_uci_engine.py`) —
  native-speed UCI, see "Native UCI Play" below.

**Dependency at build time only.** The compiled `engine` binary is standalone C++.
No Python, no FastPy, no runtime dependency of any kind.

**License isolation:** MIT on the tool means anyone can use FastPy commercially.
GPL v3 on the engine means the engine and any derivatives must remain open-source.
These licenses are compatible — using a MIT tool to build GPL software is fine.

---

## Phase Roadmap Summary

| Phase | Status | Goal | Key Features |
|---|---|---|---|
| 1 | ✅ Done | Functional transpiler | Parser, type system, emitter, intrinsics, CLI |
| 2 | ✅ Done | Functional engine | All piece move gen, castling, en passant, promotions |
| 3 | ✅ Done | Correct engine | Sliding rays, check detection, legal move filter, perft(5)=4,865,609 |
| 4 | ✅ Done | Competitive engine | Move ordering, quiescence search, PST evaluation, transposition table |
| 5 | ✅ Done | Elite engine | NNUE (v1→v3, see DECISIONS D-77 through D-83), LMR, futility pruning |
| 6 | ✅ Done | Native UCI play (Session 48, D-84) | `native/uci_main.cpp` + `training/build_uci_engine.py` — real gameplay at compiled speed, not just Python-mode |

(This table was stale for a while — Phase 4/5 were actually completed
across several sessions before anyone updated it here. Check
`docs/DECISIONS.md` and `docs/SESSION_LOG.md` for what's really been
built; this table is a summary, not the source of truth.)

---

## Native UCI Play (Session 48 / D-84)

Until Session 48, the only way to actually *play* against the engine was
`python3 run.py`'s Python-mode UCI loop (`_iterative_deepening_py`,
`_alpha_beta_py`, etc. — pure Python, correct but slow, thousands of
nodes/sec). The compiled `./engine` binary's `main()` was, and still is,
a deliberate no-op stub (Core Rule 6: engine.py stays FastPy dialect
only, no `__main__`/I/O) — it existed purely to prove `engine.py`
compiles clean, not to actually play games.

`native/uci_main.cpp` closes that gap without touching engine.py or the
FastPy dialect surface at all. It's hand-written C++ (not FastPy
dialect — Core Rule 6 still applies to engine.py itself) that:

- implements the real UCI protocol loop (`uci`/`isready`/`ucinewgame`/
  `position`/`go`/`quit`) and FEN parsing,
- calls directly into engine.py's already-compiled search functions —
  `find_best_move()`, `generate_legal_moves()`, `make_move()`,
  `compute_hash()`, `init_accumulator()` — which turned out to already
  exist in the FastPy dialect (`fastpy check`/`fastpy build` were
  already exercising them; they just had no caller outside `perft`/
  tests before this),
- does iterative deepening and UCI time management (`movetime`,
  `wtime`/`btime`/`winc`/`binc`) itself, in hand-written C++, mirroring
  what `run.py`'s `_iterative_deepening_py` does in Python mode — this
  orchestration is I/O/timing logic, not speed-critical search, so it
  belongs here rather than in the FastPy dialect.

`training/build_uci_engine.py` builds it: emits `engine.cpp` via
FastPy's own emit path, strips the known no-op `main()` stub (refuses to
proceed if that stub doesn't match exactly — protects against silently
stripping something that changed), concatenates with
`native/uci_main.cpp`, and compiles with the project's standard flags
(C++20, `-O3 -march=native -mpopcnt -mbmi -mbmi2 -fno-exceptions
-fno-rtti`).

```
cd fastpy-engine/
python3 training/build_uci_engine.py --fastpy-path /path/to/fastpy
./fastpy_engine_uci
```

**Verified (Session 48):** `perft(5)` from startpos = 4,865,609, matching
the documented Phase 3 baseline exactly — move generation is correct in
the compiled build. Depth-1 search from startpos matches the Python
engine bit-for-bit (same node count, same score). ~1.5M nodes/sec
observed at deeper iterative-deepening depths from startpos, vs. Python
mode's low-thousands nps — roughly **50-150x**, depending on position and
depth, not a single fixed multiplier.

**Known limitations, honestly listed rather than hidden:**
- ~~**No rook underpromotion.**~~ Fixed Session 51 (D-87) — `engine.py`
  now has a `PROMO_ROOK` constant, the compiled move generator produces
  all four promotion choices, and both `run.py` (Python mode) and
  `native/uci_main.cpp` (compiled UCI wrapper) round-trip `...=R` moves
  correctly in both directions (parsing a GUI-supplied `e7e8r` and
  formatting one in `bestmove`/`info pv` output).
- ~~**Mid-search time management uses a node-count budget, not a true
  wall-clock check (Session 49, D-85).**~~ Fixed Session 55, part 3
  (D-93), built on the same `Atomic[bool]`/watcher-thread infrastructure
  D-92 used for `stop`. The iterative-deepening loop used to only check
  elapsed time *between* depths — if depth N's own search took longer
  than the remaining budget, it ran to completion regardless (seen
  directly: a 2,400ms budget produced an 8,601ms depth-11 iteration).
  D-85 first fixed this via a `NODE_BUDGET` computed once per depth from
  the running average nodes/sec so far × remaining time, checked inside
  `alpha_beta()`/`quiescence()` on essentially every node — a real
  improvement (500ms→484ms, 1000ms→1005ms, 2000ms→1919ms) but still an
  *estimate*: a depth whose per-node cost jumps sharply above the
  running average could still miss it. D-85 also tried a watchdog-thread
  design first and rejected it — a plain global written by one thread
  and read in a hot loop by another is a genuine C++ data race (a
  minimal repro hung forever at `-O3`) — correctly identifying the real
  fix as needing a volatile/atomic-qualified FastPy global, which didn't
  exist yet. D-91 built that type (`Atomic[T]`); D-92 used it for `stop`;
  D-93 used the exact same `stop_watcher()` background thread (already
  polling every ~10ms for stdin) to also check a genuine
  `Clock::time_point` deadline and call `stop_request()` the instant it
  passes — the same `Atomic[bool]` path `stop` already used, so zero
  `engine.py` changes were needed (`search_aborted()` already ORs both).
  Measured directly: 100ms→115.9ms, 300ms→314.5ms, 500ms→515.9ms,
  1000ms→1019.7ms, 2000ms→2017.3ms — consistently ~15-20ms overshoot
  (the watcher's own poll cadence) regardless of budget size, including
  when the deadline was made to land mid-way into the exact class of
  slow, still-growing iteration D-85's original writeup measured at
  8,601ms — 18.1ms overshoot instead. `NODE_BUDGET` itself is untouched
  and remains `run.py`'s Python-mode mechanism, which has no watcher
  thread to hand a deadline to.
- ~~**Async `stop` support: depth-boundary granularity, not mid-node
  (Session 53, D-90).**~~ Fixed Session 55 (D-92), built on D-91's new
  `Atomic[bool]` FastPy transpiler type. D-85/D-90's rejected
  background-thread design (a shared flag set by a watchdog thread,
  polled from inside `alpha_beta()`) really was a genuine C++ data race
  under `-O3` — but the fix that both sessions correctly identified as
  the real solution (a volatile/atomic-qualified global, flagged as its
  own multi-session transpiler feature) has now been built: `engine.py`
  declares `STOP_FLAG: Atomic[bool]`, and `alpha_beta()`/`quiescence()`
  check it (via `search_aborted()`) on every single call, not just at
  depth boundaries. `native/uci_main.cpp`'s `go()` now spawns a real
  background thread (`stop_watcher()`) that owns stdin for the duration
  of the search and calls `stop_request()` the instant `stop`/`quit`
  arrives — safe now specifically because `Atomic[bool]` guarantees the
  write is visible on the very next read, unlike the plain-bool designs
  that hung forever in D-85/D-90's minimal repros. Measured directly:
  the exact scenario D-90 flagged as its known limitation — `stop` sent
  while stuck >2s into a slow depth-11 iteration that would otherwise
  have run for many more seconds — now returns `bestmove` in ~10ms
  (bounded by the watcher thread's 10ms poll interval), not the 37.7s
  D-90 measured. `go infinite` (added in D-90) benefits identically.
  `quit` mid-search also verified: process exits cleanly in ~16ms.
  Verified via manual interactive harness against the real compiled
  binary (subprocess UCI sessions), the same approach D-90 used — this
  is exactly the kind of concurrency-timing behavior that doesn't show
  up in a unit test. NODE_BUDGET (D-85, above) is untouched by this —
  it remains the mechanism for `movetime`-based time management; only
  external `stop`/`quit` now goes through the new `Atomic[bool]` path.
  Replacing NODE_BUDGET's node-count *estimate* with a genuine
  wall-clock deadline (the same watcher thread could set `STOP_FLAG`
  when a deadline elapses) is explicitly left open for a future session.
- **Best move can differ from Python mode's choice in near-equal
  positions.** Narrowed substantially in Session 52 (D-88), and its
  real cause corrected: the previous entry here attributed this to
  windowing alone ("if any" aspiration narrowing) — that hypothesis was
  tested directly and found incomplete. The native driver now uses the
  same aspiration-window shape as `run.py` (D-88), and a genuine
  transpiler bug was found and fixed in `fastpy` itself: `//` was
  emitted as C++'s truncating `/` instead of Python's floor `//`,
  which silently disagree for negative operands — NNUE evaluation's
  `output // NNUE_SCALE` is exactly such a case, since `output` is
  negative about half the time. Fixing this made the two drivers'
  scores match *exactly* through depth 4 on the standing tactical-FEN
  benchmark (previously they diverged from depth 1). A small residual
  difference can still appear at deeper depths on genuinely near-equal
  positions — perft-verified as move-generation-identical (not a
  correctness bug), most likely ordinary alpha-beta path-order
  variance between two independently-executed searches (compiled C++
  vs. CPython interpretation of the same algorithm can still visit
  nodes in a different sequence when cutoff timing depends on
  accumulated floating-point-free but still order-sensitive alpha
  updates) rather than a remaining defect. Not chased further this
  session — see D-88 for the full investigation and what was and
  wasn't confirmed.
| 6 | ⏳ | 1B NPS | Lazy SMP multi-core, BMI2 magic bitboards |