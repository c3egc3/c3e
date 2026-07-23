# Mythical Dragon — Architecture

> **Doc 1 of 5** — companion docs: [Decisions.md](./Decisions.md) · [Roadmap.md](./Roadmap.md) · [SessionLog.md](./SessionLog.md) · [CLAUDE_PROJECT_INSTRUCTIONS.md](./CLAUDE_PROJECT_INSTRUCTIONS.md)
> Docs repo: `c3egc3/c3e` (`md/docs/`) · Engine repo: `g-c-3/mythical-dragon`
> Last confirmed accurate: Session 0 (2026-07-23)

**License:** Undecided — no dependency forces a choice this time (no NNUE/Stockfish inheritance). Revisit before any public release; MIT is the working assumption only until explicitly chosen (see Decisions D0.6).
**Team:** Project director (mobile-only, no local dev environment, not a programmer) + Claude as sole coder/tester.
**Infrastructure:** Mobile device, GitHub (manual upload, no local git), Claude's sandboxed execution environment for all coding and testing.

---

## 1. What This Project Is

Mythical Dragon is a chess evaluation architecture that represents a position
as a set of structured, falsifiable **claims** about the position, rather
than as a single scalar score. Move selection resolves competing claims
through tiered pairwise comparison, not through a weighted sum.

**Explicitly not attempted here, by design:**
- No NNUE, no neural network of any kind
- No Texel tuning or any gradient-fitted evaluation weights
- No SPRT / OpenBench infrastructure
- No Rust — pure Python throughout, including the search

This is a deliberate departure from a prior related project (`opy`/OxyPy, in
the same docs repo) which used NNUE + Rust + SPRT. Mythical Dragon shares no
code, dependency, or infrastructure with it.

**Honest framing, stated once and binding on all future sessions:** this
architecture has had zero empirical validation as of this writing. It is a
coherent design, not a proven one. No strength claim (Elo or otherwise） is
made anywhere in these docs until it has actually been measured by playing
games and counting results (see §6). "Novel" describes the *combination* of
ideas applied to chess, not a claim that no underlying concept has
precedent elsewhere in computing.

---

## 2. Core Object: The Claim

```
Claim {
    id           : unique identifier
    owner        : side the claim favors (White | Black)
    type         : category (see §3)
    scope        : squares/pieces the claim concerns
    validity_fn  : predicate(board) -> bool
    magnitude    : a countable, self-evident quantity — NEVER a fitted
                   or hand-tuned constant. If a generator can't produce
                   its magnitude by counting something on the board
                   (attackers, defenders, legal moves, forced replies),
                   it does not belong in this architecture as designed.
    persistence  : plies the claim survives without re-validation
    evidence     : the concrete pattern that generated it
}
```

This is the single hardest architectural constraint in the project. If a
future session finds itself adding a tunable numeric weight anywhere in
claim generation, that is a violation of the design, not an implementation
detail — flag it in Decisions.md rather than quietly shipping it.

---

## 3. Claim Types

| Type | About | Magnitude source |
|---|---|---|
| `STRUCTURAL_WEAKNESS` | Isolated/backward/doubled pawns, holes | Attacker/defender counts |
| `KING_EXPOSURE` | Shelter, open lines near king | Open lines × pieces aimable at them |
| `PIECE_ACTIVITY` | Trapped, dominant, outpost pieces | Legal-move count delta |
| `COORDINATION` | Batteries, connected rooks, bishop pair | Direct pattern match (small integer) |
| `TACTICAL_THREAT` | Forks, pins, skewers, discovered attacks | SEE-counted material at risk |
| `INITIATIVE` | Forcing sequences | Count of opponent's forced replies |
| `FILE_CONTROL` | Open/half-open file occupation | Count of enemy pieces restricted |

Build order for generators is in Roadmap.md, starting with the two that
have the cleanest countable magnitudes (`STRUCTURAL_WEAKNESS`,
`TACTICAL_THREAT`).

---

## 4. Move Selection: Tiered Pairwise Resolution

No summation anywhere. Candidate moves are compared pairwise within
priority tiers:

```
1. Immediately decisive KING_EXPOSURE / TACTICAL_THREAT (mate nets, hangs)
2. TACTICAL_THREAT (material-counted, forcing)
3. KING_EXPOSURE (non-immediate)
4. INITIATIVE (forcing sequences)
5. STRUCTURAL_WEAKNESS / COORDINATION / FILE_CONTROL (durable, quiet)
```

Within a tier: compare how many claims of that tier each move serves vs.
breaks. Ties cascade to the next tier.

**Known risk (see also Decisions D0.13-adjacent discussion):** hard tiers
can miss genuine tradeoffs a summed score would express naturally (e.g.
sacrificing structure for initiative). This is untested and is one of the
two biggest open risks in the whole design — Phase 2/3 of the Roadmap
exists specifically to find out how badly this bites in practice.

---

## 5. Search Integration (two-tier, and the other biggest open risk)

- **Deep/bulk nodes:** cheap sum of claim magnitudes, used *only* for
  alpha-beta pruning efficiency — never for final move choice. This is an
  explicit, acknowledged compromise, not a contradiction of §4.
- **Root / PV nodes:** full claim generation + tiered pairwise resolution.

Whether "shallow enough to search deep, deep enough to reason well" is
achievable in pure Python is genuinely unknown. This gets tested for real
in Roadmap Phase 6, not assumed here.

---

## 6. Validation Without Texel/SPRT

- **No weight-fitting loop exists**, because there are no fitted weights —
  nothing to optimize by design (§2). This removes gradient descent/Texel
  entirely, not just by choice but by construction.
- **Calibration logging:** play self-play or fixed-opponent games, log per
  claim type whether a claim that predicted an advantage correlated with
  that side winning. This is descriptive statistics on the *reasoning*,
  not an optimizer changing any number. If a claim type is uncorrelated
  with outcomes, the fix is redesigning that generator's logic, not tuning
  a weight (there isn't one).
- **Lightweight sanity games:** small fixed game counts against a weak
  reference or a prior version of itself, run inside Claude's sandbox,
  purely to catch regressions — not a strength claim, not SPRT-grade
  statistical rigor. No Elo number is ever stated from this.

---

## 7. Software Modules

```
Mythical Dragon
├── Board Representation (python-chess)
├── Move Generator (python-chess)
├── Search
│   ├── Alpha-beta core
│   ├── Fast leaf heuristic (claim-magnitude sum, pruning only)
│   └── Full claim resolution (root / PV nodes)
├── Claim Generators
│   ├── Structural Weakness
│   ├── King Exposure
│   ├── Piece Activity
│   ├── Coordination
│   ├── Tactical Threat
│   ├── Initiative
│   └── File Control
├── Claim Resolution Engine
│   ├── Tier Classifier
│   ├── Pairwise Move Comparator
│   └── Explanation Generator (claims → human-readable "why")
└── Capture Subsystem
    ├── Local Claim Set Builder
    └── Exchange Sequence Resolver
```

---

## 8. Known Risks (do not let future sessions quietly bury these)

1. **Tier brittleness** — may miss genuine tradeoffs. (§4)
2. **Search cost** — pairwise comparison at PV nodes may not stay fast
   enough in pure Python for competitive depth. (§5)
3. **Coverage gaps** — only patterns someone wrote a generator for get
   evaluated; this is the classic HCE weakness and isn't fully escaped.
4. **Strength ceiling unknown** — no promise is made here that this
   reaches any particular playing strength. That's an empirical question
   for later phases, not a design assumption.

---

## 9. Provenance

The domain content (piece-as-dynamic-entity philosophy, the factor list,
king/capture subsystems as dedicated modules) originates from the project
director's original "Mythical Dragon v0.1" concept document. The
representational mechanism (claims as falsifiable objects, tiered pairwise
resolution instead of weighted summation, the counted-not-fitted
constraint) was proposed by Claude in the same conversation that produced
this doc. Recorded here so authorship isn't ambiguous later.
