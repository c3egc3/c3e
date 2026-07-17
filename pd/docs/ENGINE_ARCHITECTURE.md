# Pet Dragon — Engine Architecture

*Reflects the codebase as of Session 73 (Phases 0-22 complete). This
document previously described the engine as of early Phase 7/8
scaffolding — that description was badly stale and has been fully
replaced below.*

---

## 1. High-Level Pipeline

```
UCI input (main.rs)
   │
   ▼
Position (position/mod.rs) ── bitboard state, Zobrist hash, pawn_starts
   │
   ▼
Move generation (movegen/) ── magic-bitboard sliding pieces, Pet Dragon
   │                          pawn double-step rules (pawn_starts-gated)
   ▼
iterative_deepening() (search/iterative.rs)
   │   aspiration windows, MultiPV, best-move-stability time management
   ▼
alpha_beta() (search/alpha_beta.rs) ◄──► Transposition Table (tt/)
   │   full pruning/extension suite — see §3
   ▼
evaluate_blended() (eval/mod.rs) ── HCE ⊕ NNUE, runtime-weighted
   │
   ├── evaluate()         (eval/*.rs)   — handcrafted, Texel-tuned
   └── nnue::inference()  (nnue/*.rs)   — trained network, 0% weight by default
```

Startup sequence is mandatory and unchanged since early phases:
`init_masks() → init_magic() → init_zobrist()`.

---

## 2. Core Data Structures

### `Position` (`position/mod.rs`)

```rust
pub struct Position {
    pub pieces: [[Bitboard; 6]; 2],       // [color][piece_kind]
    pub occupied_by: [Bitboard; 2],
    pub all_occupied: Bitboard,

    pub side_to_move: Color,
    pub castling: CastlingRights,
    pub en_passant: Option<Square>,
    pub halfmove_clock: u32,
    pub fullmove_number: u32,

    pub hash: u64,                        // Zobrist, incrementally updated

    pub pawn_starts: PawnStartMap,        // Pet Dragon: per-pawn actual
                                           // start square, gates double-step
                                           // eligibility — NOT rank-based

    pub history: Vec<HistoryEntry>,       // for unmake
                                           // repetition detection: checked
                                           // BEFORE the TT, Stockfish-style
                                           // Vec<(u64, i32)> algorithm (D45)
}
```

`pawn_starts` is the one field with no standard-chess equivalent — it's
what makes the 2,162,160-starting-position variant correct. A pawn may
double-step if and only if it still occupies its own recorded start
square, regardless of which rank that square is on.

### `SearchInfo` (`search/mod.rs`)

Carries all per-search mutable state — move-ordering tables, time
control, MultiPV/pondering state, and Syzygy handle:

```rust
pub struct SearchInfo {
    // Time management
    pub time_allocated_ms: u64,
    pub start_time: web_time::Instant,
    pub stop: bool,
    pub stop_flag: Arc<AtomicBool>,        // shared across Lazy SMP threads

    // Move ordering
    pub killers: KillerTable,
    pub history: HistoryTable,
    pub countermoves: CountermoveTable,
    pub cont_hist: Box<[[[i32; 64]; 12]; 64]>,   // [prev_to][piece][to]
    pub correction_history: pruning::CorrectionHistory, // pawn-hash indexed

    // PV / node accounting
    pub pv_table: [[Move; MAX_PLY]; MAX_PLY],
    pub nodes: u64,
    pub seldepth: usize,

    // Pondering (Phase 18/D37)
    pub ponder_hit_soft_ms: Arc<AtomicU64>,
    pub ponder_hit_hard_ms: Arc<AtomicU64>,

    // MultiPV (Phase 19)
    pub multipv: usize,
    pub root_exclude: Vec<Move>,

    // Tablebase (Phase 15, native only)
    #[cfg(not(target_arch = "wasm32"))]
    pub syzygy: Option<Arc<syzygy::SyzygyProber>>,
}
```

### `TTEntry` / `TranspositionTable` (`tt/mod.rs`)

Lock-free, power-of-2 sized, age-based replacement:

```rust
pub struct TTEntry {
    pub key:   u32,   // upper 32 bits of Zobrist hash (verification)
    pub depth: i8,
    pub bound: Bound, // Exact / LowerBound / UpperBound
    pub age:   u8,    // search generation, drives replacement priority
    pub mv:    Move,
    pub score: i32,
}
```

---

## 3. Search — Full Pruning & Extension Suite

All of the following are implemented and wired into `alpha_beta()`
(`search/alpha_beta.rs`), not partial or planned:

| Technique | Where | Notes |
|---|---|---|
| Principal Variation Search (PVS) | `alpha_beta.rs` | full-width first move, null-window re-search otherwise |
| Iterative deepening + aspiration windows | `iterative.rs` | narrowing window per depth, re-widens on fail-high/low |
| Null move pruning | `alpha_beta.rs` | adaptive reduction `3 + depth/6`, zugzwang-guarded (non-pawn material check) |
| Late Move Reductions (LMR) | `alpha_beta.rs`, `pruning.rs` | `MIN_DEPTH_LMR = 3`, reduction scales with depth and move count |
| Razoring | `alpha_beta.rs` | `MIN_DEPTH_RAZORING = 1`, drops to qsearch when static eval far below alpha |
| Futility pruning | `alpha_beta.rs` | `MIN_DEPTH_FUTILITY = 1`, near-leaf quiet-move skip |
| ProbCut | `pruning.rs` | `MIN_DEPTH_PROBCUT = 5`, shallow-search verified captures beating beta+margin (`PROBCUT_MARGIN = 200`) prune the node — this is Pet Dragon's multi-cut-family technique |
| Internal Iterative Reduction (IIR) | `alpha_beta.rs` | `MIN_DEPTH_IIR = 4`, reduces PV nodes with no TT move |
| Singular extensions | `alpha_beta.rs` | `MIN_DEPTH_SINGULAR = 6`, reduced exclusion-search verifies TT move is forced before extending |
| Check extensions | `pruning.rs` (`extension()`) | |
| Quiescence search | `alpha_beta.rs` | in-check evasions, checkmate detection, per-capture delta pruning, quiet checks at `qs_depth = 0` (13.5) |
| Move ordering | `ordering.rs` | SEE-based capture ordering, killers, countermoves, history heuristic with gravity, 1-ply continuation history |
| Correction history | `pruning.rs` (`CorrectionHistory`) | pawn-hash-indexed static-eval error tracker, applied before pruning decisions use static eval |
| Repetition detection | `position/mod.rs` | Stockfish-style `Vec<(u64, i32)>` algorithm (D45), checked before TT probe |
| Lazy SMP | `main.rs` | N-1 helper threads share TT, run identical search parameters, time-unlimited, killed via shared `stop_flag`; **helpers are not currently parameter-differentiated** — a real, open improvement (see competitive analysis) |
| Time management | `search/time.rs` | soft/hard limits plus best-move-stability early stop (`STABILITY_THRESHOLD`) |
| MultiPV | `iterative.rs`, `search/mod.rs` | `root_exclude` prevents re-searching claimed root moves; single-PV path is byte-identical to pre-MultiPV behavior |
| Pondering | `main.rs`, `search/mod.rs` | `ponder_hit_soft_ms` / `ponder_hit_hard_ms`, consumed once via atomic swap on `ponderhit` |
| Skill Levels | `search/skill.rs` | depth cap respected by helper threads too, so low-skill searches don't leak full-strength TT lines (Phase 20) |

Not present: thread-differentiated Lazy SMP parameters, deeper (2-ply/
4-ply) continuation history beyond the current 1-ply table, and any
variant-specific opening statistics. See the competitive analysis
report for the current improvement priority list.

---

## 4. Evaluation

### Handcrafted Evaluation (`eval/mod.rs` and submodules)

Texel-tuned (Phase 14, D35), Ethereal-derived (GPL v3, Andrew Grant)
starting weights. All terms tapered middlegame→endgame:

1. **Material** (`eval/material.rs`) — phase-dependent piece values
2. **Piece-square tables** (`eval/tables.rs`)
3. **Mobility** (`eval/mobility.rs`) — attack-count bonus
4. **Pawn structure** (`eval/pawns.rs`) — passed/isolated/doubled/backward
5. **King safety** (`eval/king_safety.rs`) — pawn shield, open files, attacker count (MG only)
6. **Open lines** (`eval/open_lines.rs`) — rook on open file, batteries, 7th rank, connected rooks
7. **Tempo** — Pet-Dragon-specific Texel-tuned bonus for side to move

Pet Dragon-specific evaluation notes (see DECISIONS.md for full
rationale): no opening-phase suppression of any term (D6) — all terms
active from move 1, since there's no fixed "opening phase" across
2.16M possible starts; no castling bonus in king safety (D7) — ~74% of
games see no castling at all; open lines never suppressed early (D8).

### NNUE (`nnue/` — Phase 16)

```
Feature set (D10/D11): 896 inputs per perspective
  - 768 standard piece-square features (6 kinds × 2 colors × 64 squares)
  - 128 Pet Dragon pawn-start features (2 colors × 64 squares) —
    active only while a pawn still occupies its actual start square;
    drops to 0 the instant that pawn moves, regardless of destination
```

`nnue/features.rs` — feature encoding. `nnue/delta.rs` — incremental
accumulator updates for make/unmake, proven equivalent to full
re-extraction. `nnue/inference.rs` — forward pass.

**Current status**: fully implemented and trainable, but disabled by
default. `evaluate_blended()` (`eval/mod.rs`) blends HCE and NNUE via a
runtime `NNUEWeight` UCI option (0-100, default **0**), stored as an
integer percentage rather than a compile-time constant specifically so
Phase 17's A/B testing could compare pure-HCE vs. blended search from
the same binary via `setoption`. Both network sizes tested
(hidden_size=32 and 128, D34/D41) lost to pure HCE — most plausibly a
training-data volume problem (roughly half a million combined
self-play + Lichess rows, versus the hundreds of billions modern
top-class engines train on) rather than an architecture problem. The
inference pipeline itself is production-ready; scaling the training
data is the open item.

---

## 5. Tablebases

Syzygy support (Phase 15), native builds only (`#[cfg(not(target_arch
= "wasm32"))]`) — `syzygy::SyzygyProber`, `Arc`-wrapped for cheap
cloning into Lazy SMP helper threads. Valid for Pet Dragon endgames
because by the time few enough pieces remain for tablebase lookup,
castling rights are gone and pawn-start features have decayed to zero
— the position is, for evaluation and search purposes, indistinguishable
from a standard-chess endgame of the same material.

---

## 6. UCI Protocol (`main.rs`)

Full option set, confirmed from the actual `option name` output:

| Option | Type | Default | Notes |
|---|---|---|---|
| `Hash` | spin | — | TT size, MB |
| `Threads` | spin | 1 | Lazy SMP helper count |
| `UCI_Chess960` | check | false | |
| `SyzygyPath` | string | empty | |
| `NNUEWeight` | spin | **0** | 0 = pure HCE, 100 = pure NNUE |
| `MultiPV` | spin | 1 | |
| `Move Overhead` | spin | — | ms |
| `Skill Level` | spin | — | depth-capped, helper threads respect it too |
| `Ponder` | check | true | |
| `Contempt` | spin | 0 | -100..100 |
| `UCI_LimitStrength` | check | false | |
| `UCI_Elo` | spin | — | |

---

## 7. WASM / Browser Deployment

`wasm-pack build --target web` → `pet_dragon_bg.wasm` + `pet_dragon.js`
(deploy.yml, GitHub Pages) and, since Session 73, also published as
release assets from `build.yml`'s `build-wasm` job alongside a
`pet_dragon_standalone.js` (base64-embeds the wasm binary; still
imports `pet_dragon.js` for bindings — see DECISIONS.md D46 for why
full single-file bundling was explored and rejected). `getrandom/js`
feature enabled for WASM builds. Live eval bar confirmed rendering real
search output (Session 71).

---

## 8. Crate Layout

```
src/
├── bitboard/      magic bitboards, masks
├── position/      Position, FEN, make/unmake, setup (2,162,160 starts), Zobrist
├── movegen/       legal move generation, castling, pawns, pieces
├── search/        alpha_beta, iterative deepening, ordering, pruning, see, skill, time
├── eval/          material, tables, mobility, pawns, king_safety, open_lines
├── nnue/          features, delta, inference
├── tt/            transposition table
├── syzygy/        tablebase probing (native only)
├── texel/         Texel tuning (features, predict, weights)
├── bin/           selfplay, match_runner, uci_match_runner, texel_*, train_nnue, eval_diag, lichess_sample
├── main.rs        UCI loop, Lazy SMP thread orchestration
└── lib.rs         crate root
```
