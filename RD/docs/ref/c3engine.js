'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
// C3Engine.js — Design by G.C.
// Search engine for Crazy Chess Carnage (C3 Chess)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── CRAZY CHESS CARNAGE — GAME RULES ────────────────────────────────────────
//
// C3 Chess is a chess variant played on a standard 8×8 board with the standard
// set of pieces (1 king, 1 queen, 2 rooks, 2 bishops, 2 knights, 8 pawns per
// side). All standard chess rules apply EXCEPT where explicitly noted below.
//
// ── 1. STARTING POSITION ─────────────────────────────────────────────────────
//
//   • Each game begins with a RANDOMISED starting position.
//   • White pieces (non-pawns) are placed randomly on ranks 1–2.
//   • Black pieces (non-pawns) are placed randomly on ranks 7–8.
//   • White pawns fill any remaining empty squares on ranks 1–2.
//   • Black pawns fill any remaining empty squares on ranks 7–8.
//   • EXCEPTION — Kings always start on their standard squares:
//       White king on e1, Black king on e8.
//     The king's position is therefore fixed and identical every game.
//
// ── 2. CASTLING ──────────────────────────────────────────────────────────────
//
//   • Castling follows STANDARD chess rules with one condition:
//     it is only available if the relevant rook happens to start on its
//     standard corner square (h1 for white kingside, a1 for white queenside,
//     h8 for black kingside, a8 for black queenside).
//   • If a rook starts on a non-corner square, castling to that side is
//     unavailable for the entire game, regardless of where the rook moves later.
//   • When castling IS available, all standard conditions apply:
//       – Neither the king nor that rook may have previously moved.
//       – All squares between them must be empty.
//       – The king must not be in check, pass through check, or land in check.
//       – The king travels to g1/g8 (kingside) or c1/c8 (queenside).
//       – The rook travels to f1/f8 (kingside) or d1/d8 (queenside).
//
// ── 3. PAWN DOUBLE PUSH ──────────────────────────────────────────────────────
//
//   • In standard chess only pawns on their starting rank (rank 2 for white,
//     rank 7 for black) may advance two squares on their first move.
//   • In C3 Chess, ANY pawn that has NOT yet moved may advance two squares,
//     regardless of which rank it currently occupies.
//   • A pawn is considered "unmoved" if it has not made any move since the
//     start of the game — including pawns that started on non-standard ranks
//     due to the random setup.
//   • En passant follows standard rules: a pawn that advances two squares
//     may be captured en passant by an enemy pawn on an adjacent file,
//     but only on the very next half-move.
//
// ── 4. ALL OTHER RULES — STANDARD CHESS ──────────────────────────────────────
//
//   The following rules are unchanged from standard chess:
//
//   Piece movement
//     • King:   one square in any direction.
//     • Queen:  any number of squares diagonally, horizontally, or vertically.
//     • Rook:   any number of squares horizontally or vertically.
//     • Bishop: any number of squares diagonally.
//     • Knight: L-shape (2+1 squares); the only piece that jumps over others.
//     • Pawn:   one square forward; captures one square diagonally forward.
//               Promotes to queen, rook, bishop, or knight upon reaching the
//               back rank (rank 8 for white, rank 1 for black).
//
//   Game-ending conditions
//     • Checkmate: the king is in check with no legal move to escape — the
//       player in checkmate loses.
//     • Stalemate: the player to move has no legal moves and is NOT in check —
//       the game is drawn.
//     • Threefold repetition: the same position (same board, same side to move,
//       same castling rights, same en-passant square) occurs three times — draw.
//     • Fifty-move rule: if fifty full moves pass with no pawn advance and no
//       capture, the game is drawn (100 half-moves without an irreversible move).
//     • Insufficient material: drawn if neither side has enough material to
//       deliver checkmate (handled by chess.js, not this engine).
//
//   Check
//     • A king may not move into check.
//     • A player in check must resolve it on their next move (by moving the king,
//       blocking the check, or capturing the attacking piece).
//     • A player may not make any move that leaves their own king in check.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// ─── ENGINE ARCHITECTURE ─────────────────────────────────────────────────────
//
//   Section 1 — Foundation: bitboards, constants, attack tables
//   Section 2 — Move generation: chaos-aware, all rules
//   Section 3 — Evaluation: PST, material, structure, king safety
//   Section 4 — Search: iterative deepening, alpha-beta, NMP, LMR, aspiration
//   Section 5 — Worker protocol: JSON message handler
//
// ─── ENGINE IMPROVEMENTS OVER BASE .jsvo ─────────────────────────────────────
//
//   • Continuation history (1-ply + 2-ply follow-up) — better quiet move ordering
//   • Capture history — refines capture ordering beyond MVV-LVA
//   • Pawn chain bonus — rewards defended pawns in chaos structures
//   • Draw contempt (eval-based) — avoids draws when positionally ahead
//   • Weighted king safety — queen/rook attacks weighted higher than pawns
//   • Pinned pawn shelter detection — king safety accounts for pinned defenders
//   • Delta pruning in quiescence — skips hopeless captures faster
//   • Hanging piece penalty — undefended attacked pieces lose 70% of value
//   • Trapped piece penalty — pieces with 0-1 legal moves are near-dead
//   • Passed pawn urgency bonus — steep bonus in final 2 ranks to force promotion
//   • Threat extension — extends when opponent has an immediately winning capture
//   • Adaptive null-move R — scales with depth and eval margin above beta
//   • ProbCut — skip deep search when shallow result proves move is too good/bad
//   • Space & board control — reward controlling squares in opponent's half
//   • Weak square map — penalise opponent outpost squares near own king
//   • Opponent passer counter-play — urgency penalty for enemy advanced passers
//   • Per-piece mobility weights — rooks/knights weighted higher than queens
//   • Rook on 7th rank bonus — rewards rooks cutting off the enemy king
//   • 50-move draw enforced in search and quiescence
//   • Castling rights derived from actual start position, not assumed available
//   • Repetition detection fixed — correct 3-occurrence count + AI contempt nudge
//
// ─── BITBOARD LAYOUT ─────────────────────────────────────────────────────────
//
//   Index 0 = a8 (top-left), index 63 = h1 (bottom-right).
//   Matches the board array layout used in chess.js (row*8+file, row 0 = rank 8).
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Section 1: Foundation ────────────────────────────────────────────────────

// JavaScript bitwise operators work on 32-bit signed integers.
// We simulate 64-bit bitboards using two 32-bit halves: lo (squares 0-31)
// and hi (squares 32-63). All bitboard operations work on {lo, hi} pairs.

const BB_ZERO = { lo: 0, hi: 0 };
const BB_ONE  = { lo: 1, hi: 0 };
const BB_ALL  = { lo: 0xFFFFFFFF, hi: 0xFFFFFFFF };

// Construct a bitboard with a single bit set at square i
function bbSq(i) {
  return i < 32
    ? { lo: (1 << i) | 0, hi: 0 }
    : { lo: 0, hi: (1 << (i - 32)) | 0 };
}

function bbOr(a, b)  { return { lo: (a.lo | b.lo) | 0, hi: (a.hi | b.hi) | 0 }; }
function bbAnd(a, b) { return { lo: (a.lo & b.lo) | 0, hi: (a.hi & b.hi) | 0 }; }
function bbNot(a)    { return { lo: (~a.lo) | 0,        hi: (~a.hi) | 0        }; }
function bbXor(a, b) { return { lo: (a.lo ^ b.lo) | 0, hi: (a.hi ^ b.hi) | 0 }; }
function bbEmpty(a)  { return a.lo === 0 && a.hi === 0; }
function bbHas(a, i) { return i < 32 ? ((a.lo >>> i) & 1) === 1 : ((a.hi >>> (i-32)) & 1) === 1; }
function bbSet(a, i) { return bbOr(a, bbSq(i)); }
function bbClear(a, i) {
  return i < 32
    ? { lo: (a.lo & ~(1 << i)) | 0, hi: a.hi }
    : { lo: a.lo, hi: (a.hi & ~(1 << (i-32))) | 0 };
}

// Extract and clear the lowest set bit; returns { sq, bb } where sq is the
// index of the bit and bb is the board with that bit cleared.
function bbPop(a) {
  if (a.lo !== 0) {
    return { sq: _ctz32(a.lo), bb: { lo: (a.lo & (a.lo - 1)) | 0, hi: a.hi } };
  } else {
    return { sq: 32 + _ctz32(a.hi), bb: { lo: 0, hi: (a.hi & (a.hi - 1)) | 0 } };
  }
}

// Count trailing zeros in a 32-bit integer
function _ctz32(x) {
  if (x === 0) return 32;
  let n = 0;
  if ((x & 0x0000FFFF) === 0) { n += 16; x >>= 16; }
  if ((x & 0x000000FF) === 0) { n +=  8; x >>=  8; }
  if ((x & 0x0000000F) === 0) { n +=  4; x >>=  4; }
  if ((x & 0x00000003) === 0) { n +=  2; x >>=  2; }
  if ((x & 0x00000001) === 0) { n +=  1; }
  return n;
}

// Count all set bits (popcount)
function bbCount(a) {
  let x = a.lo, y = a.hi;
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0F0F0F0F;
  x = Math.imul(x, 0x01010101) >>> 24;
  y = y - ((y >> 1) & 0x55555555);
  y = (y & 0x33333333) + ((y >> 2) & 0x33333333);
  y = (y + (y >> 4)) & 0x0F0F0F0F;
  y = Math.imul(y, 0x01010101) >>> 24;
  return x + y;
}

// Shift bitboard north (decreasing row index = toward rank 8) by 8 squares
function bbNorth(a) { return { lo: a.hi, hi: 0 }; }
// Shift bitboard south (increasing row index = toward rank 1) by 8 squares
function bbSouth(a) { return { lo: 0, hi: a.lo }; }
// Shift east (increasing file, mask off a-file wraparound)
// Actually we use fill-based approach for sliding pieces.

// ─── Square / coordinate helpers ─────────────────────────────────────────────
// Square index: row * 8 + file, row 0 = rank 8 (top), row 7 = rank 1 (bottom)
function sqRank(i) { return 8 - Math.floor(i / 8); } // 1-8
function sqFile(i) { return i % 8; }                  // 0-7 (a-h)
function sqIdx(r, f) { return (8 - r) * 8 + f; }      // rank(1-8), file(0-7)
function sqName(i) { return String.fromCharCode(97 + sqFile(i)) + sqRank(i); }
function sqFromName(s) {
  const f = s.charCodeAt(0) - 97;
  const r = parseInt(s[1]);
  return sqIdx(r, f);
}

// ─── File & rank masks ────────────────────────────────────────────────────────
// FILE_BB[f] = bitboard of all squares on file f (0=a … 7=h)
const FILE_BB = Array.from({ length: 8 }, (_, f) => {
  let bb = BB_ZERO;
  for (let r = 1; r <= 8; r++) bb = bbSet(bb, sqIdx(r, f));
  return bb;
});

// RANK_BB[r] = bitboard of all squares on rank r (1-8)
const RANK_BB = Array.from({ length: 9 }, (_, r) => {
  if (r === 0) return BB_ZERO;
  let bb = BB_ZERO;
  for (let f = 0; f < 8; f++) bb = bbSet(bb, sqIdx(r, f));
  return bb;
});

// ─── Precomputed passed-pawn forward masks ────────────────────────────────────
// PASSED_MASK[color][sq] = bitboard of all squares ahead of sq on sq's file
// and both adjacent files that an enemy pawn would have to NOT be on for sq's
// pawn to be "passed". Replaces the O(n) row-by-row loop in evalPawnStructure.
//   color 0 = white (forward = decreasing row index, toward rank 8)
//   color 1 = black (forward = increasing row index, toward rank 1)
const PASSED_MASK = [new Array(64), new Array(64)];
(function initPassedMasks() {
  for (let sq = 0; sq < 64; sq++) {
    const r = Math.floor(sq / 8), f = sq % 8;
    let wMask = BB_ZERO, bMask = BB_ZERO;
    for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
      // White: rows 0..r-1 (ahead of white pawn at row r)
      for (let row = 0; row < r; row++)       wMask = bbSet(wMask, row * 8 + ff);
      // Black: rows r+1..7 (ahead of black pawn at row r)
      for (let row = r + 1; row < 8; row++)   bMask = bbSet(bMask, row * 8 + ff);
    }
    PASSED_MASK[0][sq] = wMask;
    PASSED_MASK[1][sq] = bMask;
  }
})();

// ─── Precomputed non-sliding attack tables ────────────────────────────────────
// KNIGHT_ATTACKS[sq], KING_ATTACKS[sq] — bitboards of all squares attacked
// from sq, ignoring occupancy (used for both colors; captures filter by color).

const KNIGHT_ATTACKS = new Array(64);
const KING_ATTACKS   = new Array(64);

(function initLeaperTables() {
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8), f = i % 8;
    let kn = BB_ZERO, kg = BB_ZERO;

    // Knight offsets
    for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) kn = bbSet(kn, nr * 8 + nf);
    }
    // King offsets
    for (const [dr, df] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) kg = bbSet(kg, nr * 8 + nf);
    }

    KNIGHT_ATTACKS[i] = kn;
    KING_ATTACKS[i]   = kg;
  }
})();

// ─── Sliding piece attack generation (classical approach) ─────────────────────
// We use the classical o^(o-2r) trick (Hyperbola Quintessence) for sliding attacks
// on ranks/files/diagonals. This avoids magic number tables while still being
// significantly faster than the ray-casting loop in the old C3 worker.

// Mask for the relevant ray (precomputed once)
const DIAG_MASK   = new Array(64); // northeast-southwest diagonal
const ADIAG_MASK  = new Array(64); // northwest-southeast anti-diagonal
const FILE_MASK   = new Array(64); // file ray (north-south)
const RANK_MASK   = new Array(64); // rank ray (east-west)

(function initRayMasks() {
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8), f = i % 8;
    let diag = BB_ZERO, adiag = BB_ZERO, file = BB_ZERO, rank = BB_ZERO;

    for (let j = 0; j < 64; j++) {
      const jr = Math.floor(j / 8), jf = j % 8;
      if (j !== i) {
        if (jr - jf === r - f) diag  = bbSet(diag,  j); // same diagonal
        if (jr + jf === r + f) adiag = bbSet(adiag, j); // same anti-diagonal
        if (jf === f)          file  = bbSet(file,  j); // same file
        if (jr === r)          rank  = bbSet(rank,  j); // same rank
      }
    }

    DIAG_MASK[i]  = diag;
    ADIAG_MASK[i] = adiag;
    FILE_MASK[i]  = file;
    RANK_MASK[i]  = rank;
  }
})();

// Hyperbola Quintessence for a single ray direction.
// Returns attack bitboard for a slider on square sq with given occupancy o
// along the given mask (file, rank, diagonal, or anti-diagonal).
// Formula: attacks = ((o & mask) - 2*sq_bb) ^ reverse((reverse(o & mask) - 2*reverse(sq_bb)))
// We implement a simplified version that works correctly for our 64-bit simulation.
function _hypQuint(sq, occ, mask) {
  // Masked occupancy along the ray
  const o  = bbAnd(occ, mask);
  const s  = bbSq(sq);

  // Forward direction: o - 2*s (subtract in lo/hi arithmetic)
  // We compute (o.lo - 2*s.lo) with borrow propagation
  function bb64Sub(a, b) {
    // a - b as unsigned 64-bit (lo/hi)
    let lo = (a.lo - b.lo) | 0;
    let borrow = (a.lo >>> 0) < (b.lo >>> 0) ? 1 : 0;
    let hi = (a.hi - b.hi - borrow) | 0;
    return { lo: lo | 0, hi: hi | 0 };
  }

  function bb64Shl1(a) {
    // shift left by 1
    const hi = ((a.hi << 1) | (a.lo >>> 31)) | 0;
    const lo = (a.lo << 1) | 0;
    return { lo, hi };
  }

  // Reverse a bitboard (bit-reverse all 64 bits)
  function bb64Rev(a) {
    function rev32(x) {
      x = ((x & 0x55555555) << 1)  | ((x >>> 1)  & 0x55555555);
      x = ((x & 0x33333333) << 2)  | ((x >>> 2)  & 0x33333333);
      x = ((x & 0x0F0F0F0F) << 4)  | ((x >>> 4)  & 0x0F0F0F0F);
      x = ((x & 0x00FF00FF) << 8)  | ((x >>> 8)  & 0x00FF00FF);
      x = ((x << 16) | (x >>> 16)) | 0;
      return x;
    }
    return { lo: rev32(a.hi), hi: rev32(a.lo) };
  }

  const s2   = bb64Shl1(s);                      // 2 * sq_bb
  const fwd  = bb64Sub(o, s2);                   // o - 2s
  const oR   = bb64Rev(o);
  const sR   = bb64Rev(s);
  const s2R  = bb64Shl1(sR);
  const bwd  = bb64Rev(bb64Sub(oR, s2R));        // reverse(reverse(o) - 2*reverse(s))
  return bbAnd(bbXor(fwd, bwd), mask);
}

// Get all attacks for a bishop on sq given occupancy
function bishopAttacks(sq, occ) {
  return bbOr(
    _hypQuint(sq, occ, DIAG_MASK[sq]),
    _hypQuint(sq, occ, ADIAG_MASK[sq])
  );
}

// Get all attacks for a rook on sq given occupancy
function rookAttacks(sq, occ) {
  return bbOr(
    _hypQuint(sq, occ, FILE_MASK[sq]),
    _hypQuint(sq, occ, RANK_MASK[sq])
  );
}

// Get all attacks for a queen on sq given occupancy
function queenAttacks(sq, occ) {
  return bbOr(bishopAttacks(sq, occ), rookAttacks(sq, occ));
}

// ─── Pawn attack tables ───────────────────────────────────────────────────────
// PAWN_ATTACKS[color][sq] — squares attacked by a pawn of given color on sq
// color: 0 = white (attacks northward = decreasing row), 1 = black (southward)
const PAWN_ATTACKS = [new Array(64), new Array(64)];

(function initPawnAttacks() {
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8), f = i % 8;
    let wAtk = BB_ZERO, bAtk = BB_ZERO;
    // White attacks: row-1 (north), files f-1 and f+1
    if (r > 0) {
      if (f > 0) wAtk = bbSet(wAtk, (r-1)*8 + (f-1));
      if (f < 7) wAtk = bbSet(wAtk, (r-1)*8 + (f+1));
    }
    // Black attacks: row+1 (south), files f-1 and f+1
    if (r < 7) {
      if (f > 0) bAtk = bbSet(bAtk, (r+1)*8 + (f-1));
      if (f < 7) bAtk = bbSet(bAtk, (r+1)*8 + (f+1));
    }
    PAWN_ATTACKS[0][i] = wAtk; // white
    PAWN_ATTACKS[1][i] = bAtk; // black
  }
})();

// ─── Zobrist hashing ──────────────────────────────────────────────────────────
// Full 64-bit Zobrist keys simulated as {lo, hi} pairs.
// ZOBRIST[pieceIdx][sq] where pieceIdx = color*6 + pieceType
// pieceType: 0=K 1=Q 2=R 3=B 4=N 5=P (matches PIECE_IDX below)

const PIECE_IDX = { k:0, q:1, r:2, b:3, n:4, p:5 };
const IDX_PIECE = ['k','q','r','b','n','p']; // guaranteed reverse lookup

const ZOBRIST_PIECE  = Array.from({ length: 12 }, () =>
  Array.from({ length: 64 }, () => ({
    lo: (Math.random() * 0x100000000) >>> 0,
    hi: (Math.random() * 0x100000000) >>> 0
  }))
);
const ZOBRIST_TURN   = { lo: (Math.random() * 0x100000000) >>> 0, hi: (Math.random() * 0x100000000) >>> 0 };
const ZOBRIST_EP     = Array.from({ length: 8 }, () => ({
  lo: (Math.random() * 0x100000000) >>> 0,
  hi: (Math.random() * 0x100000000) >>> 0
}));
const ZOBRIST_CASTLE = Array.from({ length: 16 }, () => ({
  lo: (Math.random() * 0x100000000) >>> 0,
  hi: (Math.random() * 0x100000000) >>> 0
}));

// ─── Board representation ─────────────────────────────────────────────────────
// We maintain both:
//   pieceAt[sq]  — piece object {color:'w'|'b', type:'k'|'q'|...} or null
//                  (compatible with chess.js board array format)
//   Bitboards    — one per piece type per color for fast attack/move generation
//
// This dual representation lets us:
//   - Use bitboards for fast move generation and evaluation
//   - Use pieceAt for easy piece lookup (compatibility with chess.js)

// Bitboard sets (updated on every make/unmake move)
// bb[colorIdx][pieceTypeIdx] where colorIdx: 0=white, 1=black
const bb = [
  [BB_ZERO, BB_ZERO, BB_ZERO, BB_ZERO, BB_ZERO, BB_ZERO], // white: K Q R B N P
  [BB_ZERO, BB_ZERO, BB_ZERO, BB_ZERO, BB_ZERO, BB_ZERO]  // black: K Q R B N P
];

// Combined occupancy bitboards
let occAll = BB_ZERO;   // all pieces
let occW   = BB_ZERO;   // white pieces
let occB   = BB_ZERO;   // black pieces

// Piece array (chess.js compatible, 64 entries)
let pieceAt = new Array(64).fill(null);

// ─── Game state ───────────────────────────────────────────────────────────────
let turn         = 'w';      // 'w' | 'b'
let enPassantSq  = -1;       // square index or -1
let castleRights = 0;        // bitmask: bit0=WK, bit1=WQ, bit2=BK, bit3=BQ
let halfClock    = 0;        // 50-move rule counter
let fullMove     = 1;        // fullmove number
let zobristKey   = BB_ZERO;  // current position hash

// Chaos-specific state (received from chess.js per search request)
// Bitmask of squares whose pawns haven't moved yet (lo = squares 0–31, hi = squares 32–63).
// Replaces the previous Set to avoid per-node heap allocation in makeMove's undo record.
let unmovedPawnSqs = { lo: 0, hi: 0 };

function umpHas(sq)    { return sq < 32 ? (unmovedPawnSqs.lo >>> sq) & 1 : (unmovedPawnSqs.hi >>> (sq - 32)) & 1; }
function umpSet(sq)    { if (sq < 32) unmovedPawnSqs.lo |= (1 << sq); else unmovedPawnSqs.hi |= (1 << (sq - 32)); }
function umpDelete(sq) { if (sq < 32) unmovedPawnSqs.lo &= ~(1 << sq); else unmovedPawnSqs.hi &= ~(1 << (sq - 32)); }
function umpCopy()     { return { lo: unmovedPawnSqs.lo, hi: unmovedPawnSqs.hi }; }
function umpRestore(saved) { unmovedPawnSqs.lo = saved.lo; unmovedPawnSqs.hi = saved.hi; }

// ─── Initialise board from chess.js board array ───────────────────────────────
function initFromArray(boardArr, turnColor, epSq, castleMask, hmClock, fmNum, unmovedPawns) {
  // Reset all bitboards
  for (let c = 0; c < 2; c++)
    for (let t = 0; t < 6; t++)
      bb[c][t] = BB_ZERO;
  occAll = BB_ZERO; occW = BB_ZERO; occB = BB_ZERO;
  pieceAt.fill(null);
  zobristKey = BB_ZERO;

  for (let i = 0; i < 64; i++) {
    const p = boardArr[i];
    if (!p) continue;
    const ci = p.color === 'w' ? 0 : 1;
    const ti = PIECE_IDX[p.type];
    bb[ci][ti] = bbSet(bb[ci][ti], i);
    occAll = bbSet(occAll, i);
    if (ci === 0) occW = bbSet(occW, i);
    else          occB = bbSet(occB, i);
    pieceAt[i] = p;
    // Zobrist — full position key
    zobristKey = bbXor(zobristKey, ZOBRIST_PIECE[ci*6+ti][i]);
    // Pawn-only Zobrist key — maintained separately for pawn hash + correction history
    if (ti === PIECE_IDX.p) pawnZobristKey = bbXor(pawnZobristKey, ZOBRIST_PIECE[ci*6+ti][i]);
  }

  turn        = turnColor;
  enPassantSq = epSq;
  castleRights = castleMask;
  halfClock   = hmClock;
  fullMove    = fmNum;
  unmovedPawnSqs = { lo: 0, hi: 0 };
  if (unmovedPawns) for (const sq of unmovedPawns) umpSet(sq);

  if (turn === 'b') zobristKey = bbXor(zobristKey, ZOBRIST_TURN);
  if (enPassantSq >= 0) zobristKey = bbXor(zobristKey, ZOBRIST_EP[enPassantSq % 8]);
  zobristKey = bbXor(zobristKey, ZOBRIST_CASTLE[castleRights]);
}

// ─── Transposition table ──────────────────────────────────────────────────────
const TT_SIZE   = 1 << 20; // ~1M entries
const TT_MASK   = TT_SIZE - 1;
const TT_FIELDS = 8; // keyLo, keyHi, depth, score, flag, bestFrom, bestTo, age
const TT        = new Int32Array(TT_SIZE * TT_FIELDS);
const TT_EXACT  = 0, TT_LOWER = 1, TT_UPPER = 2;
// Sentinel stored in the TT depth field for quiescence entries so they never
// satisfy a full-depth probe (ttProbe requires stored_depth >= requested depth;
// -1 is always less than any full-search depth >= 0).
const QS_TT_DEPTH = -1;
let   ttAge     = 0; // incremented each search

function ttIndex(key) { return (key.lo & TT_MASK) * TT_FIELDS; }

function ttProbe(key, depth, alpha, beta) {
  const b = ttIndex(key);
  if (TT[b] !== (key.lo | 0) || TT[b+1] !== (key.hi | 0)) return null;
  if (TT[b+2] < depth) return null;
  const score = TT[b+3], flag = TT[b+4];
  if (flag === TT_EXACT)                   return score;
  if (flag === TT_LOWER && score >= beta)  return score;
  if (flag === TT_UPPER && score <= alpha) return score;
  return null;
}

function ttStore(key, depth, score, flag, bestFrom, bestTo) {
  const b = ttIndex(key);
  const curDepth = TT[b+2], curAge = TT[b+7];
  // Replace if: empty, same position, deeper search, or older entry
  if (TT[b] !== 0 && curDepth > depth && curAge === ttAge) return;
  TT[b]   = key.lo | 0;
  TT[b+1] = key.hi | 0;
  TT[b+2] = depth;
  TT[b+3] = score;
  TT[b+4] = flag;
  TT[b+5] = bestFrom;
  TT[b+6] = bestTo;
  TT[b+7] = ttAge;
}

function ttGetBest(key) {
  const b = ttIndex(key);
  if (TT[b] !== (key.lo | 0) || TT[b+1] !== (key.hi | 0)) return null;
  const f = TT[b+5], t = TT[b+6];
  return (f >= 0 && t >= 0) ? { from: f, to: t } : null;
}

function ttClear() {
  // Increment age rather than zeroing the array. Existing entries become
  // "stale" (their stored age != ttAge) and are naturally overwritten as
  // the search progresses. Avoids a blocking 4MB fill on every new game.
  ttAge = (ttAge + 1) & 0x7FFFFFFF; // keep positive; wraps after ~2B games
}

// ─── Pawn hash table ──────────────────────────────────────────────────────────
// Pawn structure changes rarely across nodes — most positions share the same
// pawn skeleton for hundreds of consecutive nodes. Caching evalPawnStructure()
// per side here avoids redundant O(n) pawn scans at the leaf nodes.
//
// Key: XOR of ZOBRIST_PIECE[ci*6+5][sq] for all pawns of both colors
//      (i.e. the full-position Zobrist with only the pawn bits).
//      We derive this lazily on the first call and maintain it via makeMove/
//      unmakeMove using the same Zobrist XOR the main key already does —
//      so we only need to track the pawn-only portion of the Zobrist key.
//
// Two separate caches: one per color (white pawn structure / black pawn
// structure) because each side's eval is called independently.
//
// Size: 512 entries each — small enough to stay hot in L1/L2 cache.
// Collision strategy: direct-mapped (entry at index & 511). A stale entry
// is detected by comparing the stored key; on miss we recompute.
const PAWN_HASH_SIZE = 512;
const PAWN_HASH_MASK = PAWN_HASH_SIZE - 1;

// Each entry: { keyLo, keyHi, score }
const pawnHashW = Array.from({ length: PAWN_HASH_SIZE }, () => ({ keyLo: -1, keyHi: -1, score: 0 }));
const pawnHashB = Array.from({ length: PAWN_HASH_SIZE }, () => ({ keyLo: -1, keyHi: -1, score: 0 }));

// Current pawn-only Zobrist key — maintained in parallel to zobristKey.
// Initialised in initFromArray(); updated in makeMove/unmakeMove via the
// same XOR entries (ZOBRIST_PIECE[ci*6+5][sq]) that the main key uses.
let pawnZobristKey = BB_ZERO;

function pawnHashProbe(color) {
  const table = color === 'w' ? pawnHashW : pawnHashB;
  const idx   = pawnZobristKey.lo & PAWN_HASH_MASK;
  const entry = table[idx];
  if (entry.keyLo === pawnZobristKey.lo && entry.keyHi === pawnZobristKey.hi) {
    return entry.score; // cache hit
  }
  return null; // cache miss
}

function pawnHashStore(color, score) {
  const table = color === 'w' ? pawnHashW : pawnHashB;
  const idx   = pawnZobristKey.lo & PAWN_HASH_MASK;
  table[idx].keyLo = pawnZobristKey.lo;
  table[idx].keyHi = pawnZobristKey.hi;
  table[idx].score = score;
}

function pawnHashClear() {
  for (let i = 0; i < PAWN_HASH_SIZE; i++) {
    pawnHashW[i].keyLo = pawnHashB[i].keyLo = -1;
  }
  pawnZobristKey = BB_ZERO;
}

// ─── Correction history ───────────────────────────────────────────────────────
// The static evaluation is systematically biased in certain pawn structures —
// e.g. it consistently underestimates the value of a closed center, or
// overestimates an isolated queen's pawn. Correction history records how far
// off the static eval was from the actual search score in each pawn structure
// and uses that to adjust future static evals before pruning decisions.
//
// Indexed by: pawnZobristKey.lo & CORR_HIST_MASK
// Each entry: weighted moving average of (searchScore - staticEval) errors.
// Updated after each alpha-beta node where the search returns an EXACT score.
// Applied: before futility pruning, razoring, and null-move R computation.
//
// Weight: new error contributes 1/16 of the update (CORR_HIST_WEIGHT = 16).
// Magnitude clamped to ±100cp so a single wild outlier doesn't corrupt the table.
// Size: 1024 entries — direct-mapped, same collision strategy as pawn hash.
const CORR_HIST_SIZE   = 1024;
const CORR_HIST_MASK   = CORR_HIST_SIZE - 1;
const CORR_HIST_WEIGHT = 16;  // learning rate denominator
const CORR_HIST_MAX    = 100; // max correction applied per node (centipawns)

// Stored as Int16Array for cache efficiency — values in centipawns × 16
// (fixed-point to avoid floats). Range: ±32767 = ±2048cp (clamped well below).
const correctionHistory = new Int16Array(CORR_HIST_SIZE);

function corrHistAdjust(staticEval) {
  // Read the correction for the current pawn structure and add it to static eval.
  // Correction is stored × CORR_HIST_WEIGHT; divide back to centipawns.
  const idx        = pawnZobristKey.lo & CORR_HIST_MASK;
  const rawCorr    = correctionHistory[idx];
  const correction = Math.round(rawCorr / CORR_HIST_WEIGHT);
  // Clamp applied correction to ±CORR_HIST_MAX to stay conservative
  return staticEval + Math.max(-CORR_HIST_MAX, Math.min(CORR_HIST_MAX, correction));
}

function corrHistUpdate(staticEval, searchScore) {
  // Only update on meaningful differences — tiny errors are noise
  const error = searchScore - staticEval;
  if (Math.abs(error) < 5) return; // ignore sub-5cp noise
  const idx   = pawnZobristKey.lo & CORR_HIST_MASK;
  // Weighted moving average: entry = entry × (W-1)/W + error × 1/W
  // Stored × W to stay integer. Clamped to ±(CORR_HIST_MAX × W).
  const maxStored = CORR_HIST_MAX * CORR_HIST_WEIGHT;
  const updated   = correctionHistory[idx] + error;
  correctionHistory[idx] = Math.max(-maxStored, Math.min(maxStored, updated));
}

function corrHistClear() {
  correctionHistory.fill(0);
}

// ─── Section 1 complete ───────────────────────────────────────────────────────
// Next: Section 2 — Move generation

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2 — Move Generation (fully chaos-aware at every ply)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Move encoding ────────────────────────────────────────────────────────────
// flags: 'n'=normal, 'c'=capture, 'ep'=en-passant, 'castle'=castling,
//        'dp'=double-push, 'p'=promotion(non-capture), 'pc'=promo-capture
// promo: 'q'|'r'|'b'|'n' (only when flags==='p' or 'pc')

function mkMove(from, to, flags, promo) {
  // Bake piece types into the move at generation time so capture history
  // updates never need to re-read pieceAt[] after makeMove has altered the board.
  const attacker = pieceAt[from];
  const victim   = pieceAt[to];
  return {
    from, to,
    flags:        flags || 'n',
    promo:        promo || null,
    attackerType: attacker ? PIECE_IDX[attacker.type] : -1,
    capturedType: victim   ? PIECE_IDX[victim.type]   : -1,
  };
}

// ─── Attack detection ─────────────────────────────────────────────────────────
function isAttackedBy(sq, attackerColor) {
  const ci = attackerColor === 'w' ? 0 : 1;
  const occ = occAll;

  // Pawns — check what squares attack sq as if sq were a pawn of opposite color
  const pawnAtk = PAWN_ATTACKS[ci][sq];
  if (!bbEmpty(bbAnd(pawnAtk, bb[ci][PIECE_IDX.p]))) return true;
  if (!bbEmpty(bbAnd(KNIGHT_ATTACKS[sq], bb[ci][PIECE_IDX.n]))) return true;
  if (!bbEmpty(bbAnd(KING_ATTACKS[sq],   bb[ci][PIECE_IDX.k]))) return true;

  const diagAtk = bishopAttacks(sq, occ);
  if (!bbEmpty(bbAnd(diagAtk, bbOr(bb[ci][PIECE_IDX.b], bb[ci][PIECE_IDX.q])))) return true;

  const rookAtk = rookAttacks(sq, occ);
  if (!bbEmpty(bbAnd(rookAtk, bbOr(bb[ci][PIECE_IDX.r], bb[ci][PIECE_IDX.q])))) return true;

  return false;
}

function inCheck(color) {
  const ci  = color === 'w' ? 0 : 1;
  const kBB = bb[ci][PIECE_IDX.k];
  if (bbEmpty(kBB)) return false;
  const { sq } = bbPop(kBB);
  return isAttackedBy(sq, color === 'w' ? 'b' : 'w');
}

// ─── Make / Unmake ────────────────────────────────────────────────────────────
function makeMove(mv) {
  const { from, to, flags, promo } = mv;
  const p   = pieceAt[from];
  const ci  = p.color === 'w' ? 0 : 1;
  const opp = 1 - ci;
  const ti  = PIECE_IDX[p.type];

  const undo = {
    from, to, flags, promo,
    captured: pieceAt[to],
    capturedSq: to,
    enPassantSq,
    castleRights,
    halfClock,
    zobristKey:     { lo: zobristKey.lo, hi: zobristKey.hi },
    pawnZobristKey: { lo: pawnZobristKey.lo, hi: pawnZobristKey.hi },
    unmovedPawnSqs: umpCopy()
  };

  // Remove moving piece
  bb[ci][ti] = bbClear(bb[ci][ti], from);
  zobristKey = bbXor(zobristKey, ZOBRIST_PIECE[ci*6+ti][from]);
  // Mirror pawn key — XOR out pawn if moving piece is a pawn
  if (ti === PIECE_IDX.p) pawnZobristKey = bbXor(pawnZobristKey, ZOBRIST_PIECE[ci*6+ti][from]);

  // Remove old ep/castle from hash
  if (enPassantSq >= 0) zobristKey = bbXor(zobristKey, ZOBRIST_EP[enPassantSq % 8]);
  zobristKey = bbXor(zobristKey, ZOBRIST_CASTLE[castleRights]);
  enPassantSq = -1;
  halfClock++;

  if (flags === 'ep') {
    const capSq = Math.floor(from / 8) * 8 + (to % 8);
    undo.capturedSq = capSq;
    undo.captured   = pieceAt[capSq];
    const cp = pieceAt[capSq];
    if (cp) {
      const cti = PIECE_IDX[cp.type];
      bb[opp][cti] = bbClear(bb[opp][cti], capSq);
      zobristKey   = bbXor(zobristKey, ZOBRIST_PIECE[opp*6+cti][capSq]);
      // En-passant always captures a pawn — update pawn key
      pawnZobristKey = bbXor(pawnZobristKey, ZOBRIST_PIECE[opp*6+cti][capSq]);
      occAll = bbClear(occAll, capSq);
      if (opp===0) occW=bbClear(occW,capSq); else occB=bbClear(occB,capSq);
      pieceAt[capSq] = null;
    }
    halfClock = 0;

  } else if (flags === 'castle') {
    const row  = Math.floor(from / 8);
    const ks   = (to % 8) === 6;
    const rfrom = row*8 + (ks?7:0);
    const rto   = row*8 + (ks?5:3);
    const rook  = pieceAt[rfrom];
    if (rook) {
      const rti = PIECE_IDX.r;
      bb[ci][rti] = bbClear(bb[ci][rti], rfrom);
      bb[ci][rti] = bbSet(bb[ci][rti], rto);
      zobristKey  = bbXor(zobristKey, ZOBRIST_PIECE[ci*6+rti][rfrom]);
      zobristKey  = bbXor(zobristKey, ZOBRIST_PIECE[ci*6+rti][rto]);
      occAll=bbClear(occAll,rfrom); occAll=bbSet(occAll,rto);
      if (ci===0){occW=bbClear(occW,rfrom);occW=bbSet(occW,rto);}
      else       {occB=bbClear(occB,rfrom);occB=bbSet(occB,rto);}
      pieceAt[rfrom]=null; pieceAt[rto]=rook;
    }

  } else if (flags==='c' || flags==='pc') {
    const cp = pieceAt[to];
    if (cp) {
      const cti = PIECE_IDX[cp.type];
      bb[opp][cti]=bbClear(bb[opp][cti],to);
      zobristKey=bbXor(zobristKey,ZOBRIST_PIECE[opp*6+cti][to]);
      // If captured piece is a pawn, update pawn key
      if (cti === PIECE_IDX.p) pawnZobristKey = bbXor(pawnZobristKey, ZOBRIST_PIECE[opp*6+cti][to]);
      if (opp===0) occW=bbClear(occW,to); else occB=bbClear(occB,to);
    }
    halfClock = 0;

  } else if (flags === 'dp') {
    enPassantSq = (Math.floor(from/8)+Math.floor(to/8))/2|0;
    enPassantSq = enPassantSq*8+(from%8);
    halfClock   = 0;
    umpDelete(from);

  } else if ((flags==='n'||flags==='p') && p.type==='p') {
    halfClock = 0;
    umpDelete(from);
  }

  // Place piece at destination
  let placedType  = ti;
  let placedPiece = p;
  if ((flags==='p'||flags==='pc') && promo) {
    placedType  = PIECE_IDX[promo];
    placedPiece = { color: p.color, type: promo };
    // Pawn promoted away — pawn key does NOT gain the new piece (it's no longer a pawn)
    // pawnZobristKey was already XOR'd out at the top (ti===PIECE_IDX.p)
  }
  bb[ci][placedType]=bbSet(bb[ci][placedType],to);
  zobristKey=bbXor(zobristKey,ZOBRIST_PIECE[ci*6+placedType][to]);
  // If landing piece is still a pawn (no promotion), update pawn key
  if (placedType === PIECE_IDX.p) pawnZobristKey = bbXor(pawnZobristKey, ZOBRIST_PIECE[ci*6+placedType][to]);
  occAll=bbClear(occAll,from); occAll=bbSet(occAll,to);
  if (ci===0){occW=bbClear(occW,from);occW=bbSet(occW,to);}
  else       {occB=bbClear(occB,from);occB=bbSet(occB,to);}
  pieceAt[from]=null; pieceAt[to]=placedPiece;

  // Normal pawn move (non-double-push) also marks pawn as moved
  if ((flags==='n'||flags==='c') && p.type==='p') umpDelete(from);

  // Update castling rights
  if (p.type==='k') {
    if (p.color==='w') castleRights &= ~(1|2);
    else               castleRights &= ~(4|8);
  }
  const castleCorners=[[63,1],[56,2],[7,4],[0,8]];
  for (const [csq,bit] of castleCorners)
    if (from===csq||to===csq) castleRights &= ~bit;

  if (enPassantSq>=0) zobristKey=bbXor(zobristKey,ZOBRIST_EP[enPassantSq%8]);
  zobristKey=bbXor(zobristKey,ZOBRIST_CASTLE[castleRights]);

  turn = turn==='w'?'b':'w';
  zobristKey=bbXor(zobristKey,ZOBRIST_TURN);

  // Push new position key onto search-stack for in-search repetition detection
  if (searchStackLen < SEARCH_STACK_SIZE) {
    searchStack[searchStackLen].lo = zobristKey.lo;
    searchStack[searchStackLen].hi = zobristKey.hi;
    searchStackLen++;
  }
  undo.stackLen = searchStackLen; // save so unmake can restore exactly
  return undo;
}

function unmakeMove(undo) {
  const { from, to, flags, captured, capturedSq } = undo;

  turn = turn==='w'?'b':'w';
  const ci  = turn==='w'?0:1;
  const opp = 1-ci;

  const placedPiece = pieceAt[to];
  const toType      = PIECE_IDX[placedPiece.type];
  const origType    = (flags==='p'||flags==='pc') ? PIECE_IDX.p : toType;
  const origPiece   = { color: turn, type: IDX_PIECE[origType] };

  // Remove from destination
  bb[ci][toType]=bbClear(bb[ci][toType],to);
  occAll=bbClear(occAll,to);
  if (ci===0) occW=bbClear(occW,to); else occB=bbClear(occB,to);
  pieceAt[to]=null;

  // Restore at source
  bb[ci][origType]=bbSet(bb[ci][origType],from);
  occAll=bbSet(occAll,from);
  if (ci===0) occW=bbSet(occW,from); else occB=bbSet(occB,from);
  pieceAt[from]=origPiece;

  // Restore captured
  if (captured) {
    const cti=PIECE_IDX[captured.type];
    bb[opp][cti]=bbSet(bb[opp][cti],capturedSq);
    occAll=bbSet(occAll,capturedSq);
    if (opp===0) occW=bbSet(occW,capturedSq); else occB=bbSet(occB,capturedSq);
    pieceAt[capturedSq]=captured;
  }

  // Restore castling rook
  if (flags==='castle') {
    const row=Math.floor(from/8), ks=(to%8)===6;
    const rfrom=row*8+(ks?7:0), rto=row*8+(ks?5:3);
    const rook=pieceAt[rto];
    if (rook) {
      const rti=PIECE_IDX.r;
      bb[ci][rti]=bbClear(bb[ci][rti],rto); bb[ci][rti]=bbSet(bb[ci][rti],rfrom);
      occAll=bbClear(occAll,rto); occAll=bbSet(occAll,rfrom);
      if (ci===0){occW=bbClear(occW,rto);occW=bbSet(occW,rfrom);}
      else       {occB=bbClear(occB,rto);occB=bbSet(occB,rfrom);}
      pieceAt[rto]=null; pieceAt[rfrom]=rook;
    }
  }

  enPassantSq    = undo.enPassantSq;
  castleRights   = undo.castleRights;
  halfClock      = undo.halfClock;
  zobristKey     = undo.zobristKey;
  pawnZobristKey = undo.pawnZobristKey; // restore pawn-only hash
  umpRestore(undo.unmovedPawnSqs);
  // Restore search-stack pointer (pop the key this makeMove pushed)
  if (undo.stackLen !== undefined) searchStackLen = undo.stackLen - 1;
}

// ─── Legal move generation ────────────────────────────────────────────────────
function generateMoves(forColor, forCheckTest) {
  const ci     = forColor==='w'?0:1;
  const myOcc  = ci===0?occW:occB;
  const moves  = [];

  // Pawns
  let pawns = bb[ci][PIECE_IDX.p];
  while (!bbEmpty(pawns)) {
    const { sq, bb: rest } = bbPop(pawns); pawns=rest;
    const r=Math.floor(sq/8), f=sq%8;
    const dir      = forColor==='w'?-1:1;
    const promoRow = forColor==='w'?0:7;
    const oneStep  = sq+dir*8;

    if (oneStep>=0&&oneStep<64&&!pieceAt[oneStep]) {
      if (Math.floor(oneStep/8)===promoRow) {
        for (const p of ['q','r','b','n']) moves.push(mkMove(sq,oneStep,'p',p));
      } else {
        moves.push(mkMove(sq,oneStep,'n'));
      }
      // Double push: chaos rule — any unmoved pawn can double-push
      if (umpHas(sq)) {
        const twoStep=sq+dir*16;
        if (twoStep>=0&&twoStep<64&&!pieceAt[twoStep])
          moves.push(mkMove(sq,twoStep,'dp'));
      }
    }

    // Captures and en passant
    for (const df of [-1,1]) {
      const nf=f+df;
      if (nf<0||nf>7) continue;
      const capSq=(r+dir)*8+nf;
      if (capSq<0||capSq>=64) continue;
      const cp=pieceAt[capSq];
      if (cp&&cp.color!==forColor) {
        if (Math.floor(capSq/8)===promoRow) {
          for (const p of ['q','r','b','n']) moves.push(mkMove(sq,capSq,'pc',p));
        } else {
          moves.push(mkMove(sq,capSq,'c'));
        }
      }
      // En passant
      if (enPassantSq>=0&&capSq===enPassantSq) {
        const epPawnSq=Math.floor(sq/8)*8+nf;
        const ep=pieceAt[epPawnSq];
        if (ep&&ep.type==='p'&&ep.color!==forColor)
          moves.push(mkMove(sq,capSq,'ep'));
      }
    }
  }

  // Knights
  let knights=bb[ci][PIECE_IDX.n];
  while (!bbEmpty(knights)) {
    const { sq, bb: rest }=bbPop(knights); knights=rest;
    let atk=bbAnd(KNIGHT_ATTACKS[sq],bbNot(myOcc));
    while (!bbEmpty(atk)) {
      const { sq: to, bb: ar }=bbPop(atk); atk=ar;
      moves.push(mkMove(sq,to,pieceAt[to]?'c':'n'));
    }
  }

  // Bishops
  let bishops=bb[ci][PIECE_IDX.b];
  while (!bbEmpty(bishops)) {
    const { sq, bb: rest }=bbPop(bishops); bishops=rest;
    let atk=bbAnd(bishopAttacks(sq,occAll),bbNot(myOcc));
    while (!bbEmpty(atk)) {
      const { sq: to, bb: ar }=bbPop(atk); atk=ar;
      moves.push(mkMove(sq,to,pieceAt[to]?'c':'n'));
    }
  }

  // Rooks
  let rooks=bb[ci][PIECE_IDX.r];
  while (!bbEmpty(rooks)) {
    const { sq, bb: rest }=bbPop(rooks); rooks=rest;
    let atk=bbAnd(rookAttacks(sq,occAll),bbNot(myOcc));
    while (!bbEmpty(atk)) {
      const { sq: to, bb: ar }=bbPop(atk); atk=ar;
      moves.push(mkMove(sq,to,pieceAt[to]?'c':'n'));
    }
  }

  // Queens
  let queens=bb[ci][PIECE_IDX.q];
  while (!bbEmpty(queens)) {
    const { sq, bb: rest }=bbPop(queens); queens=rest;
    let atk=bbAnd(queenAttacks(sq,occAll),bbNot(myOcc));
    while (!bbEmpty(atk)) {
      const { sq: to, bb: ar }=bbPop(atk); atk=ar;
      moves.push(mkMove(sq,to,pieceAt[to]?'c':'n'));
    }
  }

  // King + castling
  let kings=bb[ci][PIECE_IDX.k];
  while (!bbEmpty(kings)) {
    const { sq, bb: rest }=bbPop(kings); kings=rest;
    let atk=bbAnd(KING_ATTACKS[sq],bbNot(myOcc));
    while (!bbEmpty(atk)) {
      const { sq: to, bb: ar }=bbPop(atk); atk=ar;
      moves.push(mkMove(sq,to,pieceAt[to]?'c':'n'));
    }

    if (!forCheckTest&&!inCheck(forColor)) {
      const row=Math.floor(sq/8), kf=sq%8;
      const opp2=forColor==='w'?'b':'w';

      // Kingside
      // FIX B1: clamp safety-check loop to file 6 (g-file) — prevents querying
      // off-board square row*8+8 when the king starts on g-file (kf=6) in chaos.
      const ksBit=ci===0?1:4;
      if (castleRights&ksBit) {
        const rSq=row*8+7;
        const rook=pieceAt[rSq];
        if (rook&&rook.type==='r'&&rook.color===forColor) {
          let clear=true;
          for (let ff=kf+1;ff<7;ff++) if (pieceAt[row*8+ff]){clear=false;break;}
          if (clear) {
            let safe=true;
            // Clamp upper bound: king travels from kf to 6 (g-file); never check file > 6
            const ksMax = Math.min(6, kf+2);
            for (let ff=kf;ff<=ksMax;ff++) if (isAttackedBy(row*8+ff,opp2)){safe=false;break;}
            if (safe) moves.push(mkMove(sq,row*8+6,'castle'));
          }
        }
      }

      // Queenside
      // FIX B1 (cont.): clamp safety-check loop to file 2 (c-file) — prevents
      // querying off-board square row*8-1 when the king starts on b-file (kf=1).
      const qsBit=ci===0?2:8;
      if (castleRights&qsBit) {
        const rSq=row*8+0;
        const rook=pieceAt[rSq];
        if (rook&&rook.type==='r'&&rook.color===forColor) {
          let clear=true;
          for (let ff=1;ff<kf;ff++) if (pieceAt[row*8+ff]){clear=false;break;}
          if (clear) {
            let safe=true;
            // Clamp lower bound: king travels from kf to 2 (c-file); never check file < 2
            const qsMin = Math.max(2, kf-2);
            for (let ff=qsMin;ff<=kf;ff++) if (isAttackedBy(row*8+ff,opp2)){safe=false;break;}
            if (safe) moves.push(mkMove(sq,row*8+2,'castle'));
          }
        }
      }
    }
  }

  // Legality filter
  if (forCheckTest) return moves;
  const legal=[];
  for (const mv of moves) {
    const undo=makeMove(mv);
    const ok=!inCheck(forColor);
    unmakeMove(undo);
    if (ok) legal.push(mv);
  }
  return legal;
}

// ─── Section 2 complete ───────────────────────────────────────────────────────
// Next: Section 3 — Evaluation

// ═══════════════════════════════════════════════════════════════════════════════
// Section 3 — Evaluation
// Tuned specifically for chaos chess:
//   - Material values
//   - Piece-square tables (PSTs) reflecting chaos starting positions
//   - King safety (pawn shelter, pinned-shelter detection, open files, attack counts)
//   - Pawn structure (passed, doubled, isolated, backward, passed-pawn urgency)
//   - Mobility bonus + trapped piece penalty
//   - Hanging piece penalty (undefended attacked pieces)
//   - Piece coordination bonuses
//   - Endgame detection and phase blending
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Material values (centipawns) ────────────────────────────────────────────
const MAT = { k: 20000, q: 950, r: 500, b: 330, n: 320, p: 100 };

// Total material for phase calculation (excluding kings)
const PHASE_TOTAL = 2*MAT.q + 4*MAT.r + 4*MAT.b + 4*MAT.n + 16*MAT.p;

// ─── Piece-Square Tables ──────────────────────────────────────────────────────
// All tables are from White's perspective (row 7 = rank 1, row 0 = rank 8).
// For Black, we mirror vertically (row 7-r).
// Values are BONUSES on top of material — can be negative (penalty).
//
// Chaos note: pieces start anywhere in ranks 1-2 (white) or 7-8 (black).
// PSTs reward pieces for moving toward their optimal squares, not for
// being on starting squares. Pawns especially benefit from advancement.

// Pawn — reward advancement strongly (chaos pawns often start on rank 1/2)
// FIX I6: rank 2 (row 6) centre-file penalty removed. In chaos chess every pawn
// starts on ranks 1-2; punishing d/e pawns at their starting rank suppressed
// central pawn advances — exactly the wrong incentive. Neutral (0) replaced
// the old -10 on d/e files; small positive on centre squares to encourage pushing.
const PST_P = [
  //  a    b    c    d    e    f    g    h
     0,   0,   0,   0,   0,   0,   0,   0,  // rank 8
   100, 110, 110, 100, 100, 110, 110, 100,  // rank 7 (near promotion)
    50,  55,  60,  70,  70,  60,  55,  50,  // rank 6
    20,  25,  30,  45,  45,  30,  25,  20,  // rank 5
     5,  10,  15,  30,  30,  15,  10,   5,  // rank 4
     0,   5,   5,  10,  10,   5,   5,   0,  // rank 3
     0,   0,   0,   5,   5,   0,   0,   0,  // rank 2 — FIX: was -5,0,0,-10,-10,0,0,-5
     0,   0,   0,   0,   0,   0,   0,   0,  // rank 1
];

// Knight — strongly prefers centre and forward squares
const PST_N = [
  -50, -30, -20, -20, -20, -20, -30, -50,
  -30,  -5,   0,   5,   5,   0,  -5, -30,
  -20,   5,  15,  20,  20,  15,   5, -20,
  -20,   5,  20,  30,  30,  20,   5, -20,
  -20,   5,  20,  30,  30,  20,   5, -20,
  -20,   5,  15,  20,  20,  15,   5, -20,
  -30,  -5,   0,   5,   5,   0,  -5, -30,
  -50, -30, -20, -20, -20, -20, -30, -50,
];

// Bishop — rewards diagonals and avoiding corners
const PST_B = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10,   5,   0,   0,   0,   0,   5, -10,
  -10,  10,  10,  10,  10,  10,  10, -10,
  -10,   0,  10,  15,  15,  10,   0, -10,
  -10,   5,   5,  15,  15,   5,   5, -10,
  -10,   0,   5,  10,  10,   5,   0, -10,
  -10,   5,   0,   0,   0,   0,   5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

// Rook — rewards open files and 7th rank
const PST_R = [
   5,  10,  10,  10,  10,  10,  10,   5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
   5,  10,  10,  10,  10,  10,  10,   5,  // 7th rank bonus
   0,   0,   0,   5,   5,   0,   0,   0,
];

// Queen — moderate centralisation, avoid early development penalty
const PST_Q = [
  -20, -10, -10,  -5,  -5, -10, -10, -20,
  -10,   0,   0,   0,   0,   0,   0, -10,
  -10,   0,   5,   5,   5,   5,   0, -10,
   -5,   0,   5,   5,   5,   5,   0,  -5,
    0,   0,   5,   5,   5,   5,   0,  -5,
  -10,   5,   5,   5,   5,   5,   0, -10,
  -10,   0,   5,   0,   0,   0,   0, -10,
  -20, -10, -10,  -5,  -5, -10, -10, -20,
];

// King middlegame — strongly prefers corners/edges, penalises centre exposure
const PST_K_MG = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
   20,  20,   0,   0,   0,   0,  20,  20,
   20,  30,  10,   0,   0,  10,  30,  20,
];

// King endgame — prefers centralisation
const PST_K_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10,   0,   0, -10, -20, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -30,   0,   0,   0,   0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

// Lookup PST value for a piece on a square from a given color's perspective
function pstVal(type, color, sq, phase) {
  // Mirror for black: row = 7 - Math.floor(sq/8)
  const row = color === 'w' ? Math.floor(sq/8) : 7 - Math.floor(sq/8);
  const idx = row * 8 + (sq % 8);
  switch (type) {
    case 'p': return PST_P[idx];
    case 'n': return PST_N[idx];
    case 'b': return PST_B[idx];
    case 'r': return PST_R[idx];
    case 'q': return PST_Q[idx];
    case 'k': {
      // Blend between MG and EG king tables based on phase
      const mg = PST_K_MG[idx];
      const eg = PST_K_EG[idx];
      return Math.round(mg * phase + eg * (1 - phase));
    }
    default: return 0;
  }
}

// ─── Game phase ───────────────────────────────────────────────────────────────
// 1.0 = full middlegame, 0.0 = full endgame
function gamePhase() {
  let mat = 0;
  for (let c = 0; c < 2; c++) {
    for (const type of ['q','r','b','n','p']) {
      mat += bbCount(bb[c][PIECE_IDX[type]]) * MAT[type];
    }
  }
  return Math.min(1, mat / PHASE_TOTAL);
}

// ─── Pawn structure ───────────────────────────────────────────────────────────
function evalPawnStructure(color) {
  // ── Pawn hash probe ──────────────────────────────────────────────────────
  // Pawn structure is the same for hundreds of consecutive nodes.
  // Return the cached score if the pawn Zobrist key matches.
  const cached = pawnHashProbe(color);
  if (cached !== null) return cached;

  const ci  = color === 'w' ? 0 : 1;
  const opp = 1 - ci;
  let score = 0;

  let pawns = bb[ci][PIECE_IDX.p];
  const oppPawns = bb[opp][PIECE_IDX.p];

  while (!bbEmpty(pawns)) {
    const { sq, bb: rest } = bbPop(pawns);
    pawns = rest;
    const f = sq % 8;
    const r = Math.floor(sq / 8);

    // Doubled pawns — another own pawn on same file
    const fileBB = bbAnd(FILE_BB[f], bb[ci][PIECE_IDX.p]);
    if (bbCount(fileBB) > 1) score -= 15;

    // Isolated pawn — no own pawns on adjacent files
    const leftFile  = f > 0 ? FILE_BB[f-1] : BB_ZERO;
    const rightFile = f < 7 ? FILE_BB[f+1] : BB_ZERO;
    const adjFiles  = bbOr(leftFile, rightFile);
    if (bbEmpty(bbAnd(adjFiles, bb[ci][PIECE_IDX.p]))) score -= 20;

    // Passed pawn — no opposing pawns ahead on same or adjacent files.
    // Uses PASSED_MASK precomputed at startup — O(1) per pawn, no inner loop.
    if (bbEmpty(bbAnd(PASSED_MASK[ci][sq], oppPawns))) {
      // Passed pawn bonus scales with advancement
      const advancement = color === 'w' ? (7 - r) : r; // 0=back rank, 7=promo
      let passedBonus = 20 + advancement * 15;

      // ── Blocker penalty ───────────────────────────────────────────────
      // PASSED_MASK only checked opponent PAWNS. An opponent PIECE sitting
      // directly on the pawn's promotion file is invisible to that check —
      // the pawn was awarded full passed-pawn bonus even though a rook or
      // knight is blocking it completely.
      //
      // Check: is any opponent piece (non-pawn, non-king) on the pawn's
      // promotion file between the pawn's rank and the promotion rank?
      // If so, the pawn is NOT freely passed — halve the bonus.
      // We also check own pieces blocking the path (our own rook sitting
      // in front of our passer is equally a problem).
      const promoRank  = color === 'w' ? 0 : 7;
      const fileSquares = FILE_BB[f];
      // Build a mask of squares strictly between pawn and promotion rank
      let pathMask = BB_ZERO;
      const step = color === 'w' ? -1 : 1;
      for (let pr = r + step; pr !== promoRank; pr += step) {
        if (pr < 0 || pr > 7) break;
        pathMask = bbSet(pathMask, pr * 8 + f);
      }
      // Include promotion square itself
      pathMask = bbSet(pathMask, promoRank * 8 + f);

      // Check opponent pieces (any non-pawn) blocking the path
      const oppPiecesBB = bbAnd(
        bbOr(bbOr(bbOr(bbOr(
          bb[opp][PIECE_IDX.q],
          bb[opp][PIECE_IDX.r]),
          bb[opp][PIECE_IDX.b]),
          bb[opp][PIECE_IDX.n]),
          bb[opp][PIECE_IDX.k]),
        pathMask
      );
      if (!bbEmpty(oppPiecesBB)) {
        // Blocked by opponent piece — not a free passer, reduce bonus
        passedBonus = Math.floor(passedBonus * 0.4);
      } else {
        // Check own pieces blocking (e.g. own rook stuck in front of own pawn)
        const myOccNow = ci === 0 ? occW : occB;
        const ownBlockers = bbAnd(bbAnd(pathMask, myOccNow), bbNot(bb[ci][PIECE_IDX.p]));
        if (!bbEmpty(ownBlockers)) passedBonus = Math.floor(passedBonus * 0.6);
      }

      score += passedBonus;

      // ── Path-clear sacrifice bonus ────────────────────────────────────
      // When a blocker exists, give a bonus for being able to capture it
      // or drive it away. This is a static hint to the search that clearing
      // the path is worth exploring — it won't calculate the full sacrifice
      // itself but biases evaluation toward positions where the path IS clear.
      // We award this when: pawn is in the final 3 ranks AND a blocker exists
      // AND we have a piece that attacks the blocker square.
      if (!bbEmpty(oppPiecesBB) && advancement >= 4) {
        // Check if we have any piece attacking the blocker square
        let blockers = oppPiecesBB;
        while (!bbEmpty(blockers)) {
          const { sq: bSq, bb: bRest } = bbPop(blockers);
          blockers = bRest;
          if (isAttackedBy(bSq, color)) {
            // We can capture or attack the blocker — reward this
            score += 30 + advancement * 8;
            break;
          }
        }
      }
    }

    // Pawn chain — pawn defended by another own pawn gets a bonus.
    // In chaos, chain pawns are the primary structural feature since
    // pawn placement is random and chains form naturally as the game opens.
    // We reuse PAWN_ATTACKS: a pawn at sq is defended if any own pawn
    // attacks sq from behind (i.e. sits on a square that attacks sq from
    // the perspective of the *opponent* colour).
    const defenders = PAWN_ATTACKS[1 - ci][sq]; // squares that attack sq from below (opp-pov)
    if (!bbEmpty(bbAnd(defenders, bb[ci][PIECE_IDX.p]))) score += 12;
  }
  // Store in pawn hash for reuse
  pawnHashStore(color, score);
  return score;
}

// ─── Mobility ─────────────────────────────────────────────────────────────────
// Rewards pieces with many available squares, penalises cramped pieces.
// Per-piece weights reflect how much mobility actually matters for each type:
//   Knight: high weight — a knight on the rim is dramatically worse than a
//           centralised one; mobility gap is the primary indicator of knight quality.
//   Bishop: moderate weight — open diagonals matter but the piece is inherently
//           long-range so a few blocked squares hurt less than for a knight.
//   Rook:   high weight — an open file rook controls the game; a blocked rook
//           is near-useless. Highest weight per square.
//   Queen:  low weight per square — queens are already so mobile that marginal
//           squares matter less. Over-rewarding queen mobility inflates queen
//           activity scores and causes premature queen development.
//
// Each piece also gets a flat penalty if it has very few moves (≤2), capturing
// "truly cramped" situations that a per-square bonus alone understates.
function evalMobility(color) {
  const ci    = color === 'w' ? 0 : 1;
  const myOcc = ci === 0 ? occW : occB;
  let score   = 0;

  // Knights: 4cp/sq, -8cp if ≤2 squares (trapped on rim or blocked in)
  let kn = bb[ci][PIECE_IDX.n];
  while (!bbEmpty(kn)) {
    const { sq, bb: rest } = bbPop(kn); kn = rest;
    const moves = bbCount(bbAnd(KNIGHT_ATTACKS[sq], bbNot(myOcc)));
    score += moves * 4;
    if (moves <= 2) score -= 8;
  }
  // Bishops: 3cp/sq, -6cp if ≤2 squares (bad bishop behind own pawns)
  let bi = bb[ci][PIECE_IDX.b];
  while (!bbEmpty(bi)) {
    const { sq, bb: rest } = bbPop(bi); bi = rest;
    const moves = bbCount(bbAnd(bishopAttacks(sq, occAll), bbNot(myOcc)));
    score += moves * 3;
    if (moves <= 2) score -= 6;
  }
  // Rooks: 5cp/sq, -10cp if ≤3 squares (locked rook is a serious liability)
  let ro = bb[ci][PIECE_IDX.r];
  while (!bbEmpty(ro)) {
    const { sq, bb: rest } = bbPop(ro); ro = rest;
    const moves = bbCount(bbAnd(rookAttacks(sq, occAll), bbNot(myOcc)));
    score += moves * 5;
    if (moves <= 3) score -= 10;
  }
  // Queens: 2cp/sq, no cramped penalty (queens are always mobile enough)
  let qu = bb[ci][PIECE_IDX.q];
  while (!bbEmpty(qu)) {
    const { sq, bb: rest } = bbPop(qu); qu = rest;
    const moves = bbCount(bbAnd(queenAttacks(sq, occAll), bbNot(myOcc)));
    score += moves * 2;
  }
  return score;
}

// ─── King safety ──────────────────────────────────────────────────────────────
function evalKingSafety(color, phase) {
  if (phase < 0.3) return 0; // not relevant in deep endgame
  const ci  = color === 'w' ? 0 : 1;
  const opp = 1 - ci;
  const kBB = bb[ci][PIECE_IDX.k];
  if (bbEmpty(kBB)) return 0;
  const { sq: kSq } = bbPop(kBB);
  const kFile = kSq % 8;
  const kRow  = Math.floor(kSq / 8);

  let danger = 0;

  // Penalty for open files near king
  for (let df = -1; df <= 1; df++) {
    const ff = kFile + df;
    if (ff < 0 || ff > 7) continue;
    const filePawns = bbAnd(FILE_BB[ff], bb[ci][PIECE_IDX.p]);
    if (bbEmpty(filePawns)) danger += 20; // open file near king
  }

  // Extra penalty if sheltering pawns are pinned (cannot actually move to
  // defend — they're pinned to the king along a diagonal or file).
  // A pawn is pinned if removing it from the board causes the king to be in
  // check. We approximate by checking diagonal attacks on the king square
  // through the pawn's position (the most common pin direction for shelter pawns).
  {
    const pawnBB   = bb[ci][PIECE_IDX.p];
    const oppQB    = bbOr(bb[opp][PIECE_IDX.q], bb[opp][PIECE_IDX.b]);
    const oppQR    = bbOr(bb[opp][PIECE_IDX.q], bb[opp][PIECE_IDX.r]);
    // Check if any adjacent-file or same-file shelter pawn is diagonally pinned
    for (let df = -1; df <= 1; df++) {
      const ff = kFile + df;
      if (ff < 0 || ff > 7) continue;
      let shelterPawns = bbAnd(FILE_BB[ff], pawnBB);
      while (!bbEmpty(shelterPawns)) {
        const { sq: pSq, bb: rest } = bbPop(shelterPawns);
        shelterPawns = rest;
        // Temporarily remove pawn and see if king becomes exposed diagonally
        const occWithout = bbClear(occAll, pSq);
        const diagAtk = bishopAttacks(kSq, occWithout);
        if (!bbEmpty(bbAnd(diagAtk, oppQB))) danger += 15; // diagonal pin
        // Also check file pin (pawn on king's file)
        if (ff === kFile) {
          const fileAtk = rookAttacks(kSq, occWithout);
          if (!bbEmpty(bbAnd(fileAtk, oppQR))) danger += 10; // file pin
        }
      }
    }
  }

  // Penalty for enemy pieces attacking squares near king — weighted by attacker type.
  // A queen threatening the king zone is far more dangerous than a pawn.
  // We accumulate a weighted attack score and apply it as a danger penalty.
  const kingZone  = KING_ATTACKS[kSq];
  const oppColor  = color === 'w' ? 'b' : 'w';
  const oppCi     = 1 - ci;
  // Attacker weight per piece type — queen is most dangerous, pawn least
  const ATK_WEIGHT = { k: 0, q: 5, r: 3, b: 2, n: 2, p: 1 };
  let attackWeight = 0;
  let attackCount  = 0; // number of zone squares attacked (for danger scaling)

  // Iterate over squares in the king zone and check what attacks them
  let zone = kingZone;
  while (!bbEmpty(zone)) {
    const { sq: zSq, bb: zRest } = bbPop(zone);
    zone = zRest;
    // Check each enemy piece type for attacks on this zone square
    for (const type of ['q','r','b','n','p']) {
      const ti = PIECE_IDX[type];
      let attackers = bb[oppCi][ti];
      while (!bbEmpty(attackers)) {
        const { sq: aSq, bb: aRest } = bbPop(attackers);
        attackers = aRest;
        let attacks = false;
        switch (type) {
          case 'q': attacks = !bbEmpty(bbAnd(queenAttacks(aSq, occAll),  bbSq(zSq))); break;
          case 'r': attacks = !bbEmpty(bbAnd(rookAttacks(aSq,   occAll),  bbSq(zSq))); break;
          case 'b': attacks = !bbEmpty(bbAnd(bishopAttacks(aSq, occAll),  bbSq(zSq))); break;
          case 'n': attacks = bbHas(KNIGHT_ATTACKS[aSq], zSq); break;
          case 'p': attacks = bbHas(PAWN_ATTACKS[oppCi][aSq], zSq); break;
        }
        if (attacks) { attackWeight += ATK_WEIGHT[type]; attackCount++; break; }
      }
    }
  }
  // Non-linear danger: danger grows quadratically with attack weight
  // (a position attacked by queen+rook+bishop is much worse than 3 pawns)
  danger += Math.floor(attackWeight * attackWeight * 2 + attackCount * 5);

  // Penalty for king on open/semi-open file
  const ownPawnsOnFile = bbAnd(FILE_BB[kFile], bb[ci][PIECE_IDX.p]);
  if (bbEmpty(ownPawnsOnFile)) danger += 25;

  // ── Opponent convergence — pieces aimed at king from distance ────────────────
  // evalKingSafety so far only counts pieces that already reach into the king
  // zone. It gives zero weight to:
  //   • A bishop on the long diagonal 3 squares from the king
  //   • A rook one file-shift away from an open king file
  //   • Two pieces that individually look harmless but converge together in 2 moves
  //
  // These are "quiet threats" — the opponent is repositioning, not yet attacking.
  // The search finds them eventually, but the static eval gives no early signal
  // so the engine doesn't bias away from positions where this build-up is happening.
  //
  // Fix: for each opponent SLIDING piece (Q, R, B) NOT already in the king zone,
  // compute its X-ray attack toward the king zone — i.e. how many king-zone squares
  // it attacks if we remove ONE piece from the line between it and the king
  // (simulating one preparatory move clearing the path). Each such X-ray hit adds
  // a danger bonus scaled by piece type and distance from king (closer = more dangerous).
  {
    const oppCi   = 1 - ci;
    const kRow    = Math.floor(kSq / 8);

    for (const slidingType of ['q', 'r', 'b']) {
      const weight = slidingType === 'q' ? 4 : slidingType === 'r' ? 2 : 2;
      let pieces   = bb[oppCi][PIECE_IDX[slidingType]];
      while (!bbEmpty(pieces)) {
        const { sq: pSq, bb: pRest } = bbPop(pieces);
        pieces = pRest;

        // Skip pieces already counted by the zone attack loop above
        if (bbHas(kingZone, pSq)) continue;

        // X-ray attack: compute attacks with ONE potential blocker removed.
        // We do this by computing attacks on an occupancy with our own pieces
        // removed from the line. We approximate by using the "X-ray occupancy"
        // trick: remove all OWN pieces from the line to simulate opponent
        // clearing a path in one move.
        let xrayAtks;
        if (slidingType === 'q') {
          // Remove own pieces from both diagonal and straight lines
          const xOcc = bbAnd(occAll, bbNot(ci === 0 ? occW : occB));
          xrayAtks = queenAttacks(pSq, xOcc);
        } else if (slidingType === 'r') {
          const xOcc = bbAnd(occAll, bbNot(ci === 0 ? occW : occB));
          xrayAtks = rookAttacks(pSq, xOcc);
        } else {
          const xOcc = bbAnd(occAll, bbNot(ci === 0 ? occW : occB));
          xrayAtks = bishopAttacks(pSq, xOcc);
        }

        // Count king-zone squares this piece would attack with path clear
        const xrayKingHits = bbCount(bbAnd(xrayAtks, kingZone));
        if (xrayKingHits === 0) continue;

        // Distance from piece to king (Chebyshev distance)
        const pr  = Math.floor(pSq / 8);
        const pf  = pSq % 8;
        const dist = Math.max(Math.abs(pr - kRow), Math.abs(pf - kFile));

        // Closer pieces are more dangerous — scale by 1/distance
        // dist=1 already in zone (caught above), dist=2 is near, dist=5+ is far
        const distFactor = Math.max(1, 6 - dist); // 4 at dist=2, 1 at dist=5+
        danger += weight * xrayKingHits * distFactor;
      }
    }
  }

  return -Math.round(danger * phase); // scale by phase — less danger in endgame
}

// ─── Rook on open file bonus ──────────────────────────────────────────────────
function evalRookOpenFile(color) {
  const ci = color === 'w' ? 0 : 1;
  let score = 0;
  let rooks = bb[ci][PIECE_IDX.r];
  while (!bbEmpty(rooks)) {
    const { sq, bb: rest } = bbPop(rooks); rooks = rest;
    const f = sq % 8;
    const ownPawns = bbAnd(FILE_BB[f], bb[ci][PIECE_IDX.p]);
    const oppPawns = bbAnd(FILE_BB[f], bb[1-ci][PIECE_IDX.p]);
    if (bbEmpty(ownPawns) && bbEmpty(oppPawns)) score += 20; // fully open
    else if (bbEmpty(ownPawns))                 score += 10; // semi-open
  }
  return score;
}

// ─── Rook on 7th rank bonus ───────────────────────────────────────────────────
// A rook on the 7th rank (relative to its own side) attacks the opponent's
// unmoved pawns along their starting rank and cuts off the enemy king.
// This is one of the most powerful rook placements in chess.
//
// Bonus structure:
//   Base:           +25cp — the rook is on the opponent's pawn rank
//   King cut-off:   +15cp extra if the enemy king is also confined to the
//                   back rank (rook cuts off king + attacks pawns simultaneously)
//   Two rooks:      +15cp extra if a second own rook or queen also sits on 7th
//                   (doubled major pieces on 7th are nearly decisive)
//
// Only awarded in middlegame/early endgame (phase > 0.2): in deep endgames
// with few pawns left the 7th rank is less meaningful.
function evalRookOnSeventh(color, phase) {
  if (phase < 0.2) return 0;
  const ci  = color === 'w' ? 0 : 1;
  const opp = 1 - ci;

  // 7th rank from own perspective:
  //   White's 7th rank = chess rank 7 = RANK_BB[7]  (row 1 in 0-indexed board)
  //   Black's 7th rank = chess rank 2 = RANK_BB[2]  (row 6 in 0-indexed board)
  // Enemy back rank (for king cut-off check):
  //   White attacks black's back rank = chess rank 8 = row 0
  //   Black attacks white's back rank = chess rank 1 = row 7
  const seventhRank = color === 'w' ? 7 : 2;   // chess rank (1-8) for RANK_BB
  const backRow     = color === 'w' ? 0 : 7;    // row index (0-7) of enemy's back rank
  const seventhMask = RANK_BB[seventhRank];

  let score = 0;
  const rooksOnSeventh = bbCount(bbAnd(bb[ci][PIECE_IDX.r], seventhMask));
  if (rooksOnSeventh === 0) return 0;

  score += rooksOnSeventh * 25;

  // King cut-off bonus: is the enemy king on the back rank?
  const oppKingBB = bb[opp][PIECE_IDX.k];
  if (!bbEmpty(oppKingBB)) {
    const { sq: kSq } = bbPop(oppKingBB);
    if (Math.floor(kSq / 8) === backRow) score += 15;
  }

  // Doubled major pieces on 7th (second rook or queen also on 7th)
  const queensOnSeventh = bbCount(bbAnd(bb[ci][PIECE_IDX.q], seventhMask));
  if (rooksOnSeventh >= 2 || queensOnSeventh >= 1) score += 15;

  return score;
}

// ─── Bishop pair bonus ────────────────────────────────────────────────────────
function evalBishopPair(color) {
  const ci = color === 'w' ? 0 : 1;
  return bbCount(bb[ci][PIECE_IDX.b]) >= 2 ? 30 : 0;
}

// ─── Outpost detection ────────────────────────────────────────────────────────
// An outpost is a square where a knight or bishop sits and NO enemy pawn can
// ever attack it — i.e. no enemy pawn exists on the same or adjacent files
// at a rank that could advance to attack the piece.
//
// In chaos chess this is especially common: random pawn placement leaves
// permanent holes that a well-placed minor piece can exploit indefinitely.
//
// Bonus structure:
//   Knight on outpost:  +25cp base, +15cp if also supported by own pawn
//   Bishop on outpost:  +15cp base, +10cp if also supported by own pawn
// (Bishops benefit less because they aren't "stuck" on one colour.)

// Precomputed: for each square, which squares can enemy pawns of each color
// use to attack it? We reuse PAWN_ATTACKS but need the *forward cone* of
// enemy pawns that could reach attack range — we approximate with a simpler
// check: are there enemy pawns on adjacent files that are *behind* the piece
// (able to advance and attack)?
//
// Specifically: for a white piece on square sq (row r, file f), enemy black
// pawns on files f-1 or f+1 at rows LESS than r (closer to rank 8) can
// potentially advance to attack it. For a black piece on sq, enemy white
// pawns on files f-1 or f+1 at rows GREATER than r can potentially attack.

function isOutpost(sq, color) {
  const ci  = color === 'w' ? 0 : 1;
  const opp = 1 - ci;
  const f   = sq % 8;
  const r   = Math.floor(sq / 8);

  // Check adjacent files for enemy pawns that are in front of (and could
  // advance to attack) this square.
  for (const df of [-1, 1]) {
    const af = f + df;
    if (af < 0 || af > 7) continue;
    // For white piece: enemy (black) pawns on this adjacent file with row < r
    // (i.e. they are north of the piece and can advance south to attack it).
    // For black piece: enemy (white) pawns on this adjacent file with row > r.
    let oppPawnsOnFile = bb[opp][PIECE_IDX.p];
    let filePawns = bbAnd(oppPawnsOnFile, FILE_BB[af]);
    while (!bbEmpty(filePawns)) {
      const { sq: pSq, bb: rest } = bbPop(filePawns);
      filePawns = rest;
      const pr = Math.floor(pSq / 8);
      if (color === 'w' && pr < r) return false; // black pawn can advance to attack
      if (color === 'b' && pr > r) return false; // white pawn can advance to attack
    }
  }
  return true;
}

function isPawnSupported(sq, color) {
  // Is this square defended by an own pawn?
  const ci = color === 'w' ? 0 : 1;
  // A square is pawn-supported if any own pawn attacks it.
  // Re-use PAWN_ATTACKS: a white pawn at sq attacks sq's diagonal-back squares,
  // so we look for own pawns in PAWN_ATTACKS of the *opposite* color at sq.
  const oppColor = color === 'w' ? 'b' : 'w';
  const oci = 1 - ci;
  const attackers = PAWN_ATTACKS[oci][sq]; // squares that would attack sq if enemy pawns were there
  return !bbEmpty(bbAnd(attackers, bb[ci][PIECE_IDX.p]));
}

function evalOutposts(color) {
  const ci = color === 'w' ? 0 : 1;
  let score = 0;

  // Knights
  let knights = bb[ci][PIECE_IDX.n];
  while (!bbEmpty(knights)) {
    const { sq, bb: rest } = bbPop(knights);
    knights = rest;
    if (isOutpost(sq, color)) {
      score += 25;
      if (isPawnSupported(sq, color)) score += 15;
    }
  }

  // Bishops
  let bishops = bb[ci][PIECE_IDX.b];
  while (!bbEmpty(bishops)) {
    const { sq, bb: rest } = bbPop(bishops);
    bishops = rest;
    if (isOutpost(sq, color)) {
      score += 15;
      if (isPawnSupported(sq, color)) score += 10;
    }
  }

  return score;
}

// ─── Piece coordination bonuses ───────────────────────────────────────────────
// Rewards pieces working together — something the per-piece PST scoring misses.
//
// Bonuses awarded:
//
//  Rook pair on same file (doubled rooks / "rook battery"):
//    +35cp — they control the file jointly and threaten to penetrate together.
//
//  Rook + Queen on same file (queen-rook battery):
//    +45cp — extremely powerful; the queen protects the rook and amplifies threats.
//
//  Rook + Queen on same rank:
//    +25cp — less forcing than a file battery but still strong.
//
//  Rooks on two different open/semi-open files (connected rooks):
//    +25cp — connected rooks constrain the opponent along multiple files.
//    (We approximate: both rooks have no own pawn on their file.)
//
//  Bishop + Knight covering the same colour complex:
//    +20cp per bishop+knight pair — the bishop controls the long diagonals of
//    one colour; the knight fills the squares the bishop can't reach on
//    that same colour. Together they dominate a colour complex.
//    We award the bonus when a bishop and a knight are both present and the
//    knight is on a square of the same color as the bishop's color complex
//    (i.e. knight on a dark square when bishop is dark-squared, etc.).

// Helper: which colour square is sq on? 0=light, 1=dark
function squareColor(sq) {
  return ((sq % 8) + Math.floor(sq / 8)) % 2;
}

function evalCoordination(color, phase) {
  const ci = color === 'w' ? 0 : 1;
  let score = 0;

  // ── Rook batteries ────────────────────────────────────────────────────────
  const rookBB   = bb[ci][PIECE_IDX.r];
  const queenBB  = bb[ci][PIECE_IDX.q];

  // Check each file for rook-rook or rook-queen stacking
  for (let f = 0; f < 8; f++) {
    const fileMask = FILE_BB[f];
    const rooksOnFile  = bbCount(bbAnd(rookBB,  fileMask));
    const queensOnFile = bbCount(bbAnd(queenBB, fileMask));

    if (rooksOnFile >= 2)                          score += 35; // doubled rooks
    if (rooksOnFile >= 1 && queensOnFile >= 1)     score += 45; // queen+rook battery on file
  }

  // Check each rank for queen+rook on same rank
  for (let r = 1; r <= 8; r++) {
    const rankMask = RANK_BB[r];
    const rooksOnRank  = bbCount(bbAnd(rookBB,  rankMask));
    const queensOnRank = bbCount(bbAnd(queenBB, rankMask));
    if (rooksOnRank >= 1 && queensOnRank >= 1) score += 25;
  }

  // ── Connected rooks (both on open/semi-open files) ────────────────────────
  // Award only when we have at least two rooks
  if (bbCount(rookBB) >= 2) {
    let openRooks = 0;
    let rooks = rookBB;
    while (!bbEmpty(rooks)) {
      const { sq, bb: rest } = bbPop(rooks);
      rooks = rest;
      const f = sq % 8;
      const ownPawnsOnFile = bbAnd(FILE_BB[f], bb[ci][PIECE_IDX.p]);
      if (bbEmpty(ownPawnsOnFile)) openRooks++; // no own pawn blocking = open/semi-open
    }
    if (openRooks >= 2) score += 25;
  }

  // ── Bishop + Knight colour complex coverage ───────────────────────────────
  // For each bishop, find knights on the same square colour.
  let bishops = bb[ci][PIECE_IDX.b];
  while (!bbEmpty(bishops)) {
    const { sq: bSq, bb: bRest } = bbPop(bishops);
    bishops = bRest;
    const bColor = squareColor(bSq); // 0=light, 1=dark

    // Is there a knight on the same square colour?
    let knights = bb[ci][PIECE_IDX.n];
    while (!bbEmpty(knights)) {
      const { sq: nSq, bb: nRest } = bbPop(knights);
      knights = nRest;
      if (squareColor(nSq) === bColor) {
        score += 20;
        break; // one bonus per bishop is enough
      }
    }
  }

  return score;
}

// ─── Hanging piece penalty ────────────────────────────────────────────────────
// A piece that is attacked by the opponent and not defended by any own piece
// is "hanging" — it can be taken for free. Subtract 70% of its value as a
// penalty. We skip the king (always accounted for by check detection) and
// use a lightweight attacked/defended check via the existing attack tables.
//
// In chaos chess this is especially important: random starts leave pieces
// stranded with no defenders far more often than standard chess.
//
// We only penalise the LEAST valuable hanging piece per color to avoid
// double-counting in positions where multiple pieces are hanging (the
// opponent can only take one at a time).
function evalHangingPieces(color) {
  const ci       = color === 'w' ? 0 : 1;
  const oppColor = color === 'w' ? 'b' : 'w';

  // Collect all hanging piece penalties, sorted descending.
  // A piece is hanging if attacked by the opponent and not defended by any own piece.
  const penalties = [];

  for (const type of ['q','r','b','n','p']) {
    let pieces = bb[ci][PIECE_IDX[type]];
    while (!bbEmpty(pieces)) {
      const { sq, bb: rest } = bbPop(pieces);
      pieces = rest;
      if (!isAttackedBy(sq, oppColor)) continue;
      if (isAttackedBy(sq, color))     continue;
      penalties.push(Math.floor(MAT[type] * 0.7));
    }
  }

  if (penalties.length === 0) return 0;
  penalties.sort((a, b) => b - a); // descending — worst first

  // Diminishing returns: full penalty for the worst hanging piece,
  // 50% for the second, 25% for any further ones.
  // Rationale: the opponent can only capture one piece per move, but having
  // multiple pieces hanging simultaneously signals a collapsing position and
  // should be penalised more than a single blunder. The discount prevents
  // double-counting positions where only one capture is genuinely possible.
  let total = penalties[0];
  if (penalties.length >= 2) total += Math.floor(penalties[1] * 0.5);
  for (let i = 2; i < penalties.length; i++)
    total += Math.floor(penalties[i] * 0.25);

  return -total;
}

// ─── Trapped piece penalty ────────────────────────────────────────────────────
// A minor piece (bishop or knight) or rook with 0 or 1 legal moves is trapped
// and deserves a harsher penalty than low mobility alone provides.
// We check pseudo-legal mobility (same as evalMobility) for speed.
function evalTrappedPieces(color) {
  const ci    = color === 'w' ? 0 : 1;
  const myOcc = ci === 0 ? occW : occB;
  let penalty = 0;

  // Knights
  let kn = bb[ci][PIECE_IDX.n];
  while (!bbEmpty(kn)) {
    const { sq, bb: rest } = bbPop(kn); kn = rest;
    const moves = bbCount(bbAnd(KNIGHT_ATTACKS[sq], bbNot(myOcc)));
    if (moves === 0) penalty += 120; // completely trapped knight — near-dead
    else if (moves === 1) penalty += 40;
  }
  // Bishops
  let bi = bb[ci][PIECE_IDX.b];
  while (!bbEmpty(bi)) {
    const { sq, bb: rest } = bbPop(bi); bi = rest;
    const moves = bbCount(bbAnd(bishopAttacks(sq, occAll), bbNot(myOcc)));
    if (moves === 0) penalty += 100;
    else if (moves === 1) penalty += 30;
  }
  // Rooks
  let ro = bb[ci][PIECE_IDX.r];
  while (!bbEmpty(ro)) {
    const { sq, bb: rest } = bbPop(ro); ro = rest;
    const moves = bbCount(bbAnd(rookAttacks(sq, occAll), bbNot(myOcc)));
    if (moves <= 1) penalty += 50;
  }
  return -penalty;
}

// ─── Passed pawn urgency bonus ────────────────────────────────────────────────
// On top of the base passed-pawn bonus in evalPawnStructure, award a steeper
// bonus for passed pawns in the last 2 ranks (rows 1-2 for white, rows 5-6
// for black) to push the engine to actively advance them toward promotion.
// PST_P already rewards advancement but its gradient flattens near promotion.
function evalPassedPawnUrgency(color) {
  const ci  = color === 'w' ? 0 : 1;
  const opp = 1 - ci;
  let score = 0;

  let pawns = bb[ci][PIECE_IDX.p];
  const oppPawns = bb[opp][PIECE_IDX.p];
  while (!bbEmpty(pawns)) {
    const { sq, bb: rest } = bbPop(pawns);
    pawns = rest;
    // Must be a passed pawn
    if (!bbEmpty(bbAnd(PASSED_MASK[ci][sq], oppPawns))) continue;
    const r = Math.floor(sq / 8);
    // Rank from promotion: 0 = on promo rank, 7 = back rank
    const distToPromo = color === 'w' ? r : (7 - r);
    // Extra urgency only in the final 2 ranks (distToPromo <= 1)
    if (distToPromo <= 1) {
      score += distToPromo === 0 ? 200 : 100; // rank 7 (white) = promo square
    }
  }
  return score;
}

// ─── Space and board control ──────────────────────────────────────────────────
// Rewards controlling squares in the opponent's half of the board (ranks 5-8
// for white, ranks 1-4 for black). In chaos chess the random starting layout
// means space advantages develop earlier and matter more than in standard chess
// — a side that dominates the opponent's territory limits their piece activity
// and often converts positional pressure into material gain.
//
// Scoring:
//   • Count squares in the opponent's half that are attacked by our pieces
//     (pseudo-legal, same as mobility — no legality filter needed).
//   • Each attacked square in the opponent's half: +2cp
//   • Each SAFE attacked square (not also attacked by an enemy piece): +1cp extra
//     (safe space is more valuable because we could actually occupy it)
//   • Bonus for pawns crossing the midline into the opponent's half: +5cp each
//     (a pawn on rank 5+ for white / rank 4- for black represents advanced space)
//
// This is intentionally lightweight (no sliding piece ray iterations beyond what
// mobility already computes) to keep the eval fast. We reuse occupancy bitboards
// for the safe-square check via isAttackedBy, limited to squares actually in
// the opponent's half.
//
// OPPONENT'S HALF definition:
//   White's target: rows 0..3 (ranks 8,7,6,5 in standard notation, row 0=rank8)
//   Black's target: rows 4..7 (ranks 4,3,2,1)
// This matches the bitboard row layout (row 0 = rank 8 = top of board).

// Precomputed opponent-half masks for each color
// White attacks opponent's half = rows 0-3 (ranks 5-8)
const OPP_HALF_W = (() => {
  let bb = BB_ZERO;
  for (let row = 0; row <= 3; row++)
    for (let f = 0; f < 8; f++)
      bb = bbSet(bb, row * 8 + f);
  return bb;
})();

// Black attacks opponent's half = rows 4-7 (ranks 1-4)
const OPP_HALF_B = (() => {
  let bb = BB_ZERO;
  for (let row = 4; row <= 7; row++)
    for (let f = 0; f < 8; f++)
      bb = bbSet(bb, row * 8 + f);
  return bb;
})();

function evalSpaceControl(color, phase) {
  // Space is a middlegame/early-endgame concept; negligible in deep endgames
  if (phase < 0.15) return 0;

  const ci         = color === 'w' ? 0 : 1;
  const opp        = 1 - ci;
  const oppColor   = color === 'w' ? 'b' : 'w';
  const myOcc      = ci === 0 ? occW : occB;
  const targetHalf = color === 'w' ? OPP_HALF_W : OPP_HALF_B;
  let score = 0;

  // Collect all squares in the opponent's half that our pieces attack.
  // We iterate piece-type by piece-type using the same pseudo-legal attack logic
  // as evalMobility (fast: no makeMove, no legality filter).
  let attackedInHalf = BB_ZERO;

  // Knights
  let kn = bb[ci][PIECE_IDX.n];
  while (!bbEmpty(kn)) {
    const { sq, bb: rest } = bbPop(kn); kn = rest;
    attackedInHalf = bbOr(attackedInHalf,
      bbAnd(KNIGHT_ATTACKS[sq], targetHalf));
  }
  // Bishops
  let bi = bb[ci][PIECE_IDX.b];
  while (!bbEmpty(bi)) {
    const { sq, bb: rest } = bbPop(bi); bi = rest;
    attackedInHalf = bbOr(attackedInHalf,
      bbAnd(bishopAttacks(sq, occAll), targetHalf));
  }
  // Rooks
  let ro = bb[ci][PIECE_IDX.r];
  while (!bbEmpty(ro)) {
    const { sq, bb: rest } = bbPop(ro); ro = rest;
    attackedInHalf = bbOr(attackedInHalf,
      bbAnd(rookAttacks(sq, occAll), targetHalf));
  }
  // Queens
  let qu = bb[ci][PIECE_IDX.q];
  while (!bbEmpty(qu)) {
    const { sq, bb: rest } = bbPop(qu); qu = rest;
    attackedInHalf = bbOr(attackedInHalf,
      bbAnd(queenAttacks(sq, occAll), targetHalf));
  }
  // Pawns — attack diagonals only (standard pawn capture directions)
  let pawns = bb[ci][PIECE_IDX.p];
  while (!bbEmpty(pawns)) {
    const { sq, bb: rest } = bbPop(pawns); pawns = rest;
    attackedInHalf = bbOr(attackedInHalf,
      bbAnd(PAWN_ATTACKS[ci][sq], targetHalf));
  }

  // Base score: 2cp per attacked square in opponent's half
  const attackedCount = bbCount(attackedInHalf);
  score += attackedCount * 2;

  // Safe-space bonus: 1cp extra per square NOT contested by opponent
  // We compute which of those squares the opponent does NOT attack.
  // Rather than calling isAttackedBy per-square (expensive), we build the
  // full opponent attack map for the target half using the same approach.
  let oppAttackedInHalf = BB_ZERO;
  let okn = bb[opp][PIECE_IDX.n];
  while (!bbEmpty(okn)) {
    const { sq, bb: rest } = bbPop(okn); okn = rest;
    oppAttackedInHalf = bbOr(oppAttackedInHalf,
      bbAnd(KNIGHT_ATTACKS[sq], targetHalf));
  }
  let obi = bb[opp][PIECE_IDX.b];
  while (!bbEmpty(obi)) {
    const { sq, bb: rest } = bbPop(obi); obi = rest;
    oppAttackedInHalf = bbOr(oppAttackedInHalf,
      bbAnd(bishopAttacks(sq, occAll), targetHalf));
  }
  let oro = bb[opp][PIECE_IDX.r];
  while (!bbEmpty(oro)) {
    const { sq, bb: rest } = bbPop(oro); oro = rest;
    oppAttackedInHalf = bbOr(oppAttackedInHalf,
      bbAnd(rookAttacks(sq, occAll), targetHalf));
  }
  let oqu = bb[opp][PIECE_IDX.q];
  while (!bbEmpty(oqu)) {
    const { sq, bb: rest } = bbPop(oqu); oqu = rest;
    oppAttackedInHalf = bbOr(oppAttackedInHalf,
      bbAnd(queenAttacks(sq, occAll), targetHalf));
  }
  let opawns = bb[opp][PIECE_IDX.p];
  while (!bbEmpty(opawns)) {
    const { sq, bb: rest } = bbPop(opawns); opawns = rest;
    oppAttackedInHalf = bbOr(oppAttackedInHalf,
      bbAnd(PAWN_ATTACKS[opp][sq], targetHalf));
  }

  // Safe squares: attacked by us but NOT by opponent
  const safeCount = bbCount(bbAnd(attackedInHalf, bbNot(oppAttackedInHalf)));
  score += safeCount; // +1cp extra per safe controlled square

  // Advanced pawns bonus: +5cp per pawn that has crossed into opponent's half
  // For white: pawn row <= 3 (ranks 5-8). For black: pawn row >= 4 (ranks 1-4).
  let advPawns = bbAnd(bb[ci][PIECE_IDX.p], targetHalf);
  // Exclude own king's zone from this bonus (pawns near the enemy king are
  // already rewarded by passed pawn urgency; avoid double-counting)
  score += bbCount(advPawns) * 5;

  // Scale by phase — space matters most in the middlegame
  return Math.round(score * Math.min(1, phase + 0.2));
}

// ─── Weak square map — opponent outpost threat near own king ──────────────────
// A "weak square" near the king is one that can never again be defended by an
// own pawn (no own pawn exists or can advance onto the adjacent files to attack
// it) AND sits on ranks 4–7 (the zone where minor pieces become dangerous
// outposts). If the opponent has a knight or bishop that can reach such a square
// within two moves, it represents a structural threat the engine should avoid.
//
// This is the defensive mirror of evalOutposts: while evalOutposts rewards our
// own pieces sitting on permanent holes, evalWeakSquares penalises *our own*
// permanent holes that the opponent is poised to exploit near our king.
//
// Penalty structure (applied to our own score as a negative):
//   Weak square reachable by opponent knight in ≤2 moves: −20cp base
//   Weak square reachable by opponent bishop  in ≤2 moves: −12cp base
//   Penalty scales by proximity to king: ×1.5 if within 1 file, ×1.0 if 2 files
//   Phase-weighted: no penalty in deep endgame (phase < 0.25) — outposts there
//   matter far less with fewer pieces to exploit them.
//
// "Reachable in ≤2 moves" for a knight: the set of squares reachable from sq
// in 1 knight-move (KNIGHT_ATTACKS[sq]), unioned with squares reachable from
// those in another knight-move (2-hop neighbourhood). We precompute the 2-hop
// table at startup.
//
// "Reachable in ≤2 moves" for a bishop: the diagonal attacks from the bishop's
// current square with full occupancy removed (open diagonal = 1 move) OR a
// 1-square diagonal step (empty square diagonally adjacent = 1 move, then from
// there the square itself). We approximate with: bishop already attacks the weak
// square (direct line) OR the bishop is on the same diagonal/anti-diagonal AND
// only one own piece blocks the path (can be cleared in 1 move).
// In practice we use the simpler "bishop attacks with empty board" as a proxy —
// this catches long-diagonal threats without requiring full path tracing.

// Precompute 2-hop knight reachability: KNIGHT_2HOP[sq] = all squares a knight
// on sq can reach in exactly 1 or 2 moves (union of 1-hop and 2-hop targets).
const KNIGHT_2HOP = new Array(64);
(function initKnight2Hop() {
  for (let sq = 0; sq < 64; sq++) {
    let reach = KNIGHT_ATTACKS[sq]; // 1-hop
    let hop1  = KNIGHT_ATTACKS[sq];
    while (!bbEmpty(hop1)) {
      const { sq: mid, bb: rest } = bbPop(hop1);
      hop1 = rest;
      reach = bbOr(reach, KNIGHT_ATTACKS[mid]); // 2-hop
    }
    // Exclude the origin square itself
    KNIGHT_2HOP[sq] = bbClear(reach, sq);
  }
})();

// Bishop reachability with empty board (all diagonals fully open).
// Used as a conservative "can the bishop reach this square eventually?"
// We reuse the existing DIAG_MASK / ADIAG_MASK structure.
function bishopCanReach(fromSq, toSq) {
  // Same diagonal or anti-diagonal as the bishop = reachable on open board
  const fr = Math.floor(fromSq / 8), ff = fromSq % 8;
  const tr = Math.floor(toSq   / 8), tf = toSq   % 8;
  // Same diagonal: fr - ff === tr - tf
  // Same anti-diagonal: fr + ff === tr + tf
  return (fr - ff === tr - tf) || (fr + ff === tr + tf);
}

function evalWeakSquares(color, phase) {
  if (phase < 0.25) return 0; // irrelevant in endgame

  const ci      = color === 'w' ? 0 : 1;
  const opp     = 1 - ci;
  const oppColor = color === 'w' ? 'b' : 'w';

  // Find our king square
  const kBB = bb[ci][PIECE_IDX.k];
  if (bbEmpty(kBB)) return 0;
  const { sq: kSq } = bbPop(kBB);
  const kFile = kSq % 8;
  const kRow  = Math.floor(kSq / 8);

  // Define the zone: ranks 4–7 near the king (rows 3–6 in 0-based row indexing,
  // since row 0 = rank 8 … row 7 = rank 1).
  // For white, dangerous outpost zone is in white's own half: rows 3-6 (ranks 5-2).
  // For black, dangerous zone is rows 1-4 (ranks 7-4) in their own half.
  // We check squares within 2 files of the king and in rows 2..6 (a broad band).
  const rowMin = Math.max(0, kRow - 3);
  const rowMax = Math.min(7, kRow + 3);
  const fileMin = Math.max(0, kFile - 2);
  const fileMax = Math.min(7, kFile + 2);

  let penalty = 0;

  for (let row = rowMin; row <= rowMax; row++) {
    for (let file = fileMin; file <= fileMax; file++) {
      const sq = row * 8 + file;

      // Is this square a weak square? — no own pawn can ever defend it.
      // Check: no own pawn on the same or adjacent files that is BEHIND the
      // square (able to advance to attack it).
      // For white king: "behind" = row > sq_row (pawns advance upward = decreasing row)
      // For black king: "behind" = row < sq_row (pawns advance downward = increasing row)
      let isPawnDefendable = false;
      for (const df of [-1, 0, 1]) {
        const af = file + df;
        if (af < 0 || af > 7) continue;
        let pawnBB = bbAnd(bb[ci][PIECE_IDX.p], FILE_BB[af]);
        while (!bbEmpty(pawnBB)) {
          const { sq: pSq, bb: pRest } = bbPop(pawnBB);
          pawnBB = pRest;
          const pRow = Math.floor(pSq / 8);
          // White pawn must be at row > sq_row to advance and attack sq
          // Black pawn must be at row < sq_row
          if (color === 'w' && pRow > row && df !== 0) { isPawnDefendable = true; break; }
          if (color === 'b' && pRow < row && df !== 0) { isPawnDefendable = true; break; }
        }
        if (isPawnDefendable) break;
      }
      if (isPawnDefendable) continue; // pawn can still be driven there — not permanently weak

      // Also skip if the square is occupied by any piece (not an outpost slot)
      if (pieceAt[sq]) continue;

      // Proximity multiplier: tighter to king = more dangerous
      const fileDist = Math.abs(file - kFile);
      const proxMult = fileDist <= 1 ? 1.5 : 1.0;

      // Check opponent knights: can any reach this square in ≤2 moves?
      let oppKnights = bb[opp][PIECE_IDX.n];
      while (!bbEmpty(oppKnights)) {
        const { sq: nSq, bb: nRest } = bbPop(oppKnights);
        oppKnights = nRest;
        if (bbHas(KNIGHT_2HOP[nSq], sq)) {
          penalty += Math.round(20 * proxMult);
          break; // one knight threat per weak square is enough
        }
      }

      // Check opponent bishops: can any reach this square on open diagonals?
      let oppBishops = bb[opp][PIECE_IDX.b];
      while (!bbEmpty(oppBishops)) {
        const { sq: bSq, bb: bRest } = bbPop(oppBishops);
        oppBishops = bRest;
        if (bishopCanReach(bSq, sq)) {
          penalty += Math.round(12 * proxMult);
          break; // one bishop threat per weak square
        }
      }
    }
  }

  return -Math.round(penalty * phase); // scale by phase; return as negative (penalty)
}

// ─── Opponent passer counter-play urgency ─────────────────────────────────────
// When the opponent has a passed pawn in the final 3 ranks (close to promotion),
// our own position should reflect urgency to blockade or create counter-threats.
// Currently evalPawnStructure gives the opponent a bonus for their passer, and
// evalPassedPawnUrgency gives them an extra bonus if it's in the last 2 ranks —
// but our own score has no corresponding urgency signal from the defensive side.
//
// This creates an asymmetry: the engine knows "they have a good passer" (via
// opponent's score) but doesn't feel "we need to deal with this NOW" as a first-
// person urgency on our own score. The two-sided view is what drives the engine
// to prioritise blockading, capturing the passer, or launching a counter-attack.
//
// Penalty applied to OUR score (the defending side):
//   Opponent passed pawn at rank 6 (distToPromo=2): −50cp
//   Opponent passed pawn at rank 7 (distToPromo=1): −100cp
//   Opponent passed pawn on promotion rank (distToPromo=0): −200cp
//
//   If we have a blockader (own piece on the pawn's file, between it and the
//   promotion square): penalty halved — the passer is less dangerous when
//   physically blocked.
//
//   If we have NO blockader AND the promotion square is attacked by the pawn's
//   most likely promotion piece (queen): penalty increased by 30cp — the passer
//   is essentially free to promote.
//
// This is called from evaluate() for each color as the "defending" side,
// measuring the opponent's passers as threats to the defending side's score.
// i.e. evalOpponentPasserThreat('w') penalises white based on black's passers.

function evalOpponentPasserThreat(color) {
  // `color` is the DEFENDING side. We examine the OPPONENT's passers.
  const ci  = color === 'w' ? 0 : 1;       // defender color index
  const opp = 1 - ci;                       // attacker (passer owner) index
  const oppColor = color === 'w' ? 'b' : 'w';

  let penalty = 0;

  let oppPawns   = bb[opp][PIECE_IDX.p];
  const myPawns  = bb[ci][PIECE_IDX.p];     // defender's pawns (for PASSED_MASK check)

  while (!bbEmpty(oppPawns)) {
    const { sq, bb: rest } = bbPop(oppPawns);
    oppPawns = rest;

    // Is this a passed pawn? (no defender pawn ahead on same/adjacent files)
    if (!bbEmpty(bbAnd(PASSED_MASK[opp][sq], myPawns))) continue;

    const r = Math.floor(sq / 8);
    // distToPromo from the passer owner's perspective
    const distToPromo = oppColor === 'w' ? r : (7 - r);

    // Only trigger for final 3 ranks (distToPromo ≤ 2)
    if (distToPromo > 2) continue;

    // Base urgency penalty by rank
    let urgency = distToPromo === 0 ? 200
                : distToPromo === 1 ? 100
                :                     50; // distToPromo === 2

    // Check for a blockader: own piece on the pawn's file between pawn and promo rank
    const f = sq % 8;
    const promoRow = oppColor === 'w' ? 0 : 7;
    let hasBlockader = false;
    {
      const step = oppColor === 'w' ? -1 : 1; // direction of pawn advance
      for (let pr = r + step; pr !== promoRow + step; pr += step) {
        if (pr < 0 || pr > 7) break;
        const blockSq = pr * 8 + f;
        if (pieceAt[blockSq] && pieceAt[blockSq].color === color) {
          hasBlockader = true;
          break;
        }
      }
    }

    if (hasBlockader) {
      urgency = Math.floor(urgency * 0.5); // blockader cuts threat in half
    } else {
      // No blockader — check if promotion square is also undefended by us
      const promoSq = promoRow * 8 + f;
      if (!isAttackedBy(promoSq, color)) {
        urgency += 30; // clear path to queen — even more urgent
      }
    }

    penalty += urgency;
  }

  return -penalty; // negative: penalty applied to the defending side's score
}

// ─── Main evaluation function ─────────────────────────────────────────────────
// Returns score in centipawns from the perspective of `turn` (the side to move).
// Positive = good for side to move, negative = bad.
function evaluate() {
  const phase = gamePhase();
  let wScore = 0, bScore = 0;

  // Material + PST
  for (let c = 0; c < 2; c++) {
    const color = c === 0 ? 'w' : 'b';
    for (const type of ['k','q','r','b','n','p']) {
      let pieces = bb[c][PIECE_IDX[type]];
      while (!bbEmpty(pieces)) {
        const { sq, bb: rest } = bbPop(pieces); pieces = rest;
        const val = MAT[type] + pstVal(type, color, sq, phase);
        if (c === 0) wScore += val; else bScore += val;
      }
    }
  }

  // Pawn structure
  wScore += evalPawnStructure('w');
  bScore += evalPawnStructure('b');

  // Mobility
  wScore += evalMobility('w');
  bScore += evalMobility('b');

  // King safety
  wScore += evalKingSafety('w', phase);
  bScore += evalKingSafety('b', phase);

  // Rook on open file
  wScore += evalRookOpenFile('w');
  bScore += evalRookOpenFile('b');

  // Rook on 7th rank
  wScore += evalRookOnSeventh('w', phase);
  bScore += evalRookOnSeventh('b', phase);

  // Bishop pair
  wScore += evalBishopPair('w');
  bScore += evalBishopPair('b');

  // Outpost bonuses — especially potent in chaos where pawn gaps are plentiful
  wScore += evalOutposts('w');
  bScore += evalOutposts('b');

  // Piece coordination — rewards batteries, doubled rooks, bishop+knight synergy
  wScore += evalCoordination('w', phase);
  bScore += evalCoordination('b', phase);

  // Hanging piece penalty — undefended attacked pieces lose 70% of value
  wScore += evalHangingPieces('w');
  bScore += evalHangingPieces('b');

  // Trapped piece penalty — pieces with 0-1 moves are near-dead
  wScore += evalTrappedPieces('w');
  bScore += evalTrappedPieces('b');

  // Passed pawn urgency — steep bonus in final 2 ranks to push promotion
  wScore += evalPassedPawnUrgency('w');
  bScore += evalPassedPawnUrgency('b');

  // Space and board control — reward controlling opponent's half (middlegame)
  wScore += evalSpaceControl('w', phase);
  bScore += evalSpaceControl('b', phase);

  // Weak square map — penalise permanent holes near own king that opponent can occupy
  wScore += evalWeakSquares('w', phase);
  bScore += evalWeakSquares('b', phase);

  // Opponent passer counter-play — urgency penalty when enemy has advanced passed pawn
  // Defending side (first arg) is penalised based on the opponent's passers.
  wScore += evalOpponentPasserThreat('w'); // penalises white for black's passers
  bScore += evalOpponentPasserThreat('b'); // penalises black for white's passers

  // Tempo bonus — side to move has ~15cp initiative advantage
  const tempo = 15;
  // Return from side-to-move perspective
  const raw = wScore - bScore;
  const base = (turn === 'w' ? raw : -raw) + tempo;

  // ── Correction history adjustment ────────────────────────────────────────
  // Adjust the static eval based on how wrong it has been in similar pawn
  // structures in the past. corrHistAdjust() reads the weighted error table
  // keyed on pawnZobristKey and adds a correction in [-100, +100] cp.
  // This is applied ONLY to the raw static eval returned here — it is NOT
  // applied inside the search score that feeds corrHistUpdate(), to avoid
  // circular feedback. The result is a more accurate static eval for pruning
  // decisions (futility, razoring, null-move R) without affecting the actual
  // minimax scores that propagate up the tree.
  return corrHistAdjust(base);
}

// ─── Section 3 complete ───────────────────────────────────────────────────────
// Next: Section 4 — Search

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4 — Search
// Iterative deepening alpha-beta with:
//   - Aspiration windows (staged widening)
//   - Null-move pruning (NMP) with adaptive depth-scaled R
//   - Futility pruning (depths 1-6) with improving heuristic adjustment
//   - Razoring (depth 1)
//   - Countermove heuristic
//   - Singular extensions
//   - Check extensions + Threat extensions (ply ≤ 3)
//   - Late move reductions (LMR) with improving heuristic adjustment
//   - Killer move heuristic
//   - History heuristic + Continuation history (2-ply) + Capture history
//   - SEE-based capture pruning
//   - Internal Iterative Deepening (IID)
//   - Draw contempt (material-based)
//   - Correction history (pawn-structure static eval bias correction)
//   - Improving heuristic (LMR + futility tuned by eval trend across plies)
//   - Quiescence search with delta pruning
//   - Time management
// ═══════════════════════════════════════════════════════════════════════════════

const INF      = 999999;
const MATE_VAL = 900000; // scores above this indicate forced mate
const MAX_PLY  = 64;

// ─── LMR precomputed reduction table ─────────────────────────────────────────
// FIX I3: replace the per-node Math.sqrt() LMR formula with a precomputed
// two-dimensional table indexed by [depth][moveIndex].  Benefits:
//   • Eliminates two Math.sqrt calls per searched node (measurable on deep searches)
//   • Uses the Stockfish-style log(depth)*log(move)/2.36 formula which is
//     better calibrated than the old 0.5*sqrt(d)*sqrt(m) approximation
//   • Values are stable and auditable; easy to tune by changing one constant
// Entries of 0 mean "no reduction" (depth < 3 or move index < 4).
const LMR_TABLE = (() => {
  const t = Array.from({ length: 64 }, (_, d) =>
    Array.from({ length: 64 }, (_, m) => {
      if (d < 3 || m < 4) return 0;
      return Math.max(1, Math.floor(0.77 + Math.log(d) * Math.log(m) / 2.36));
    })
  );
  return t;
})();
// Two killer slots per ply — quiet moves that caused a beta cutoff recently
const killers = Array.from({ length: MAX_PLY }, () => [null, null]);

function storeKiller(ply, mv) {
  if (!mv || mv.flags === 'c' || mv.flags === 'ep' ||
      mv.flags === 'pc' || mv.flags === 'p') return; // quiet moves only — captures are not stored as killers
  if (killers[ply][0] &&
      killers[ply][0].from === mv.from &&
      killers[ply][0].to   === mv.to) return; // already stored
  killers[ply][1] = killers[ply][0];
  killers[ply][0] = mv;
}

function isKiller(mv, ply) {
  for (const k of killers[ply])
    if (k && k.from === mv.from && k.to === mv.to) return true;
  return false;
}

// ─── History heuristic ────────────────────────────────────────────────────────
// history[colorIdx][from][to] — bonus for quiet moves that caused cutoffs
const history = [
  Array.from({ length: 64 }, () => new Int32Array(64)),
  Array.from({ length: 64 }, () => new Int32Array(64))
];

function updateHistory(color, mv, depth) {
  if (mv.flags === 'c' || mv.flags === 'ep' ||
      mv.flags === 'pc' || mv.flags === 'p') return;
  const ci = color === 'w' ? 0 : 1;
  history[ci][mv.from][mv.to] += depth * depth;
  // Aging — prevent overflow
  if (history[ci][mv.from][mv.to] > 1000000)
    for (let f = 0; f < 64; f++)
      for (let t = 0; t < 64; t++)
        history[ci][f][t] = history[ci][f][t] >> 1;
}

function histScore(color, mv) {
  const ci = color === 'w' ? 0 : 1;
  return history[ci][mv.from][mv.to];
}

function clearHistory() {
  for (let c = 0; c < 2; c++)
    for (let f = 0; f < 64; f++)
      history[c][f].fill(0);
}

// ─── Capture history heuristic ────────────────────────────────────────────────
// captureHistory[colorIdx][pieceTypeIdx][victimTypeIdx][to] tracks how well
// captures of a given piece type on a given square have performed historically.
// Indexed: [ci][attacker piece type 0-5][victim piece type 0-5][to 0-63].
// This refines capture ordering beyond pure MVV-LVA, especially in endgames
// where captures dominate the move list.
const captureHistory = [
  Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => new Int32Array(64))),
  Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => new Int32Array(64)))
];

function updateCaptureHistory(color, mv, depth) {
  if (mv.flags !== 'c' && mv.flags !== 'ep' && mv.flags !== 'pc') return;
  const ci         = color === 'w' ? 0 : 1;
  // Use the attacker type baked in at move-generation time — safe even after
  // makeMove has placed the piece at mv.to.
  const ati        = mv.attackerType;
  if (ati < 0) return;
  const victimType = mv.flags === 'ep' ? PIECE_IDX.p
                   : (mv.capturedType >= 0 ? mv.capturedType : PIECE_IDX.p);
  captureHistory[ci][ati][victimType][mv.to] += depth * depth;
  if (captureHistory[ci][ati][victimType][mv.to] > 1000000) {
    for (let a = 0; a < 6; a++)
      for (let v = 0; v < 6; v++)
        for (let t = 0; t < 64; t++)
          captureHistory[ci][a][v][t] >>= 1;
  }
}

function capHistScore(color, mv) {
  if (mv.flags !== 'c' && mv.flags !== 'ep' && mv.flags !== 'pc') return 0;
  const ci  = color === 'w' ? 0 : 1;
  const ati = mv.attackerType;
  if (ati < 0) return 0;
  const vti = mv.flags === 'ep' ? PIECE_IDX.p
            : (mv.capturedType >= 0 ? mv.capturedType : -1);
  if (vti < 0) return 0;
  return captureHistory[ci][ati][vti][mv.to];
}

function clearCaptureHistory() {
  for (let c = 0; c < 2; c++)
    for (let a = 0; a < 6; a++)
      for (let v = 0; v < 6; v++)
        captureHistory[c][a][v].fill(0);
}

// ─── Continuation history ─────────────────────────────────────────────────────
// Two tables implement what SF calls its 1-ply and 2-ply continuation histories:
//
//  contHist  (1-ply) — given the OPPONENT played move B, how good is our move C?
//  contHist2 (2-ply) — given WE played move A and the opponent replied B, how
//                       good is our follow-up move C? (SF: "follow-up history")
//
// Both are indexed by piece-type × to-square (6×64 = 384 slots per axis),
// giving 384×384 = 147,456 entries each — compact and cache-friendly.
// This matches the encoding SF uses for its continuation history tables.
//
// contHist[ci][prevIdx][curIdx]  where:
//   ci       = color index (0=white, 1=black) of the side making the cur move
//   prevIdx  = opponentPieceTypeIdx * 64 + opponentTo   (0..383)  — 1-ply back
//   curIdx   = curPieceTypeIdx      * 64 + to           (0..383)
//
// contHist2[ci][ppIdx][curIdx]   where:
//   ppIdx    = ourPieceTypeIdx * 64 + ourTo             (0..383)  — 2-ply back
//   curIdx   = curPieceTypeIdx * 64 + to               (0..383)

const CONT_HIST_SIZE = 6 * 64; // 384
const contHist = [
  Array.from({ length: CONT_HIST_SIZE }, () => new Int32Array(CONT_HIST_SIZE)),
  Array.from({ length: CONT_HIST_SIZE }, () => new Int32Array(CONT_HIST_SIZE))
];

function contHistIdx(pieceType, to) {
  return PIECE_IDX[pieceType] * 64 + to;
}

function updateContHist(color, prevMv, mv, depth) {
  if (!prevMv || !mv) return;
  if (mv.flags === 'c' || mv.flags === 'ep' ||
      mv.flags === 'pc' || mv.flags === 'p') return; // quiet moves only
  const prevPiece = pieceAt[prevMv.to]; // piece that was moved previously (now at prevMv.to)
  const curPiece  = pieceAt[mv.to];     // piece we just moved (now at mv.to)
  if (!prevPiece || !curPiece) return;
  const ci      = color === 'w' ? 0 : 1;
  const prevIdx = contHistIdx(prevPiece.type, prevMv.to);
  const curIdx  = contHistIdx(curPiece.type,  mv.to);
  contHist[ci][prevIdx][curIdx] += depth * depth;
  // Aging — prevent overflow
  if (contHist[ci][prevIdx][curIdx] > 1000000) {
    for (let p = 0; p < CONT_HIST_SIZE; p++)
      for (let c2 = 0; c2 < CONT_HIST_SIZE; c2++)
        contHist[ci][p][c2] >>= 1;
  }
}

function contHistScore(color, prevMv, mv) {
  if (!prevMv || !mv) return 0;
  const prevPiece = pieceAt[prevMv.to];
  const curPiece  = pieceAt[mv.from]; // piece hasn't moved yet — still at mv.from
  if (!prevPiece || !curPiece) return 0;
  const ci      = color === 'w' ? 0 : 1;
  const prevIdx = contHistIdx(prevPiece.type, prevMv.to);
  const curIdx  = contHistIdx(curPiece.type,  mv.to);
  return contHist[ci][prevIdx][curIdx];
}

function clearContHist() {
  for (let c = 0; c < 2; c++)
    for (let p = 0; p < CONT_HIST_SIZE; p++) {
      contHist[c][p].fill(0);
      contHist2[c][p].fill(0);
    }
}

// ─── 2-ply follow-up history ──────────────────────────────────────────────────
// contHist2[ci][ppIdx][curIdx] — bonus for move C given WE played A two plies
// ago and the opponent replied B. ppIdx encodes A (our piece-type × to-square);
// curIdx encodes C (current piece-type × destination). The table is updated only
// at beta-cutoffs, and scores are blended into both move ordering and LMR.
const contHist2 = [
  Array.from({ length: CONT_HIST_SIZE }, () => new Int32Array(CONT_HIST_SIZE)),
  Array.from({ length: CONT_HIST_SIZE }, () => new Int32Array(CONT_HIST_SIZE))
];

function updateContHist2(color, prevPrevMv, mv, depth) {
  if (!prevPrevMv || !mv) return;
  // Only reward quiet moves — captures are already handled by capture history.
  if (mv.flags === 'c' || mv.flags === 'ep' ||
      mv.flags === 'pc' || mv.flags === 'p') return;
  // prevPrevMv is OUR move from 2 plies ago; that piece is still at prevPrevMv.to
  // because the opponent's intervening move cannot have captured it (we just made mv).
  const ppPiece  = pieceAt[prevPrevMv.to];
  const curPiece = pieceAt[mv.to]; // we just moved it — now at mv.to
  if (!ppPiece || !curPiece) return;
  const ci    = color === 'w' ? 0 : 1;
  const ppIdx = contHistIdx(ppPiece.type,  prevPrevMv.to);
  const curIdx = contHistIdx(curPiece.type, mv.to);
  contHist2[ci][ppIdx][curIdx] += depth * depth;
  // Aging — halve all entries on overflow to prevent stale data dominating.
  if (contHist2[ci][ppIdx][curIdx] > 1000000) {
    for (let p = 0; p < CONT_HIST_SIZE; p++)
      for (let c2 = 0; c2 < CONT_HIST_SIZE; c2++)
        contHist2[ci][p][c2] >>= 1;
  }
}

function contHistScore2(color, prevPrevMv, mv) {
  if (!prevPrevMv || !mv) return 0;
  const ppPiece  = pieceAt[prevPrevMv.to];
  const curPiece = pieceAt[mv.from]; // hasn't moved yet — still at mv.from
  if (!ppPiece || !curPiece) return 0;
  const ci    = color === 'w' ? 0 : 1;
  const ppIdx  = contHistIdx(ppPiece.type,  prevPrevMv.to);
  const curIdx = contHistIdx(curPiece.type, mv.to);
  return contHist2[ci][ppIdx][curIdx];
}

// ─── Countermove heuristic ─────────────────────────────────────────────────
// countermove[from][to] stores the quiet move that most recently caused a beta
// cutoff in response to the opponent's move from→to. Tried just after killers
// in move ordering — gives the engine a "this is how I punish that move" memory.
const countermove = Array.from({ length: 64 }, () => new Array(64).fill(null));

function storeCountermove(prevMv, mv) {
  if (!prevMv || !mv) return;
  if (mv.flags === 'c' || mv.flags === 'ep' ||
      mv.flags === 'pc' || mv.flags === 'p') return; // quiet moves only — captures are not stored as countermoves
  countermove[prevMv.from][prevMv.to] = mv;
}

function getCountermove(prevMv) {
  if (!prevMv) return null;
  return countermove[prevMv.from][prevMv.to];
}

function clearCountermoves() {
  for (let f = 0; f < 64; f++)
    countermove[f].fill(null);
}

// ─── Move scoring for ordering ────────────────────────────────────────────────
// Higher score = tried earlier in the search
// prevMv     — the opponent's last move (1-ply back), used for countermove lookup
// prevPrevMv — our own last move (2-ply back), used for follow-up history lookup
function scoreMoves(moves, ply, ttBest, prevMv, prevPrevMv) {
  const color = turn; // current side to move
  const cm    = getCountermove(prevMv); // countermove refutation if any
  return moves.map(mv => {
    let score = 0;

    // TT best move — always first
    if (ttBest && mv.from === ttBest.from && mv.to === ttBest.to)
      return { mv, score: 2000000 };

    const flags = mv.flags;

    if (flags === 'c' || flags === 'ep' || flags === 'pc') {
      // MVV-LVA: Most Valuable Victim / Least Valuable Attacker
      // Blended with capture history for refined ordering beyond raw material.
      const victim   = pieceAt[mv.to] || (flags==='ep' ? { type:'p' } : null);
      const attacker = pieceAt[mv.from];
      const vVal = victim   ? MAT[victim.type]   : 0;
      const aVal = attacker ? MAT[attacker.type] : 0;
      const capHist = capHistScore(color, mv);
      score = 1000000 + vVal * 10 - aVal + Math.floor(capHist / 100);
    } else if (flags === 'p') {
      // Non-capture promotion — very good
      const promoBonus = { q:900, r:400, b:200, n:200 };
      score = 900000 + (promoBonus[mv.promo] || 0);
    } else if (flags === 'dp') {
      score = 10000; // double push — slightly above quiet
    } else {
      // Quiet move — killers, then countermove, then continuation history + history
      if (isKiller(mv, ply))                                    score = 500000;
      else if (cm && cm.from === mv.from && cm.to === mv.to)   score = 400000;
      else {
        // Blend history + 1-ply cont-hist (×2) + 2-ply follow-up hist (×1)
        // Weighting mirrors SF: 1-ply signal is strongest, 2-ply adds context.
        const hs   = histScore(color, mv);
        const chs  = contHistScore(color, prevMv, mv);
        const chs2 = contHistScore2(color, prevPrevMv, mv);
        score = hs + chs * 2 + chs2;
      }

      // ── Destination square safety penalty ──────────────────────────────
      // Before this fix, the engine had no proactive check for whether the
      // landing square is attacked. It only discovered danger AFTER making
      // the move via evaluate() — meaning at shallow depth or on a time-abort
      // fallback, moves that walk a piece into a free capture ranked the same
      // as safe moves and were explored first.
      //
      // Now: if the destination is attacked by an opponent piece AND not
      // defended by any own piece, subtract a penalty proportional to the
      // moving piece's value. This pushes unsafe landings to the back of the
      // queue where they are explored last, pruned by futility, or scored
      // badly by the search and naturally rejected.
      //
      // isAttackedBy() is O(1) from precomputed tables — negligible cost.
      // We do NOT apply this to killers or countermoves (they're already
      // scored high from prior search evidence that they work).
      if (!isKiller(mv, ply) && !(cm && cm.from === mv.from && cm.to === mv.to)) {
        const oppColor = color === 'w' ? 'b' : 'w';
        if (isAttackedBy(mv.to, oppColor) && !isAttackedBy(mv.to, color)) {
          const movingPiece = pieceAt[mv.from];
          const penalty = movingPiece ? Math.floor(MAT[movingPiece.type] * 0.6) : 200;
          score -= penalty;
        }
      }

      // ── Rescue bonus ────────────────────────────────────────────────────
      // If the piece on mv.from is currently hanging (attacked and undefended)
      // AND the destination square is safe (not attacked, or defended by us),
      // this move rescues a piece from immediate capture. Boost its ordering
      // score so it is explored before generic quiet moves.
      //
      // Score band: 350,000 — just below countermoves (400k) but above history.
      // Scaled by the piece's value so rescuing a queen ranks higher than a pawn.
      // We skip this for killers/countermoves (already scored high) and for
      // moves that just relocate into another threat (dest still attacked).
      if (!isKiller(mv, ply) && !(cm && cm.from === mv.from && cm.to === mv.to)) {
        const oppColor = color === 'w' ? 'b' : 'w';
        const movingPiece = pieceAt[mv.from];
        if (movingPiece &&
            isAttackedBy(mv.from, oppColor) &&
            !isAttackedBy(mv.from, color) &&
            !(isAttackedBy(mv.to, oppColor) && !isAttackedBy(mv.to, color))) {
          // Piece is hanging on its current square and landing safely — rescue it.
          score += 350000 + Math.floor(MAT[movingPiece.type] * 0.3);
        }
      }
      if (!isKiller(mv, ply) && !(cm && cm.from === mv.from && cm.to === mv.to)) {
        const oppColor = color === 'w' ? 'b' : 'w';
        if (isAttackedBy(mv.to, oppColor) && !isAttackedBy(mv.to, color)) {
          const movingPiece = pieceAt[mv.from];
          const penalty = movingPiece ? Math.floor(MAT[movingPiece.type] * 0.6) : 200;
          score -= penalty;
        }
      }
    }

    return { mv, score };
  }).sort((a, b) => b.score - a.score).map(x => x.mv);
}

// ─── Static Exchange Evaluation (SEE) ─────────────────────────────────────────
// Full recapture-chain SEE. Models the complete sequence of captures on toSq,
// always using the least-valuable attacker, and returns the net material gain
// for the side initiating with fromSq → toSq.
//
// Algorithm (Swap / "gain array" method):
//   1. Build gain[0] = value of target piece.
//   2. Iteratively find the least-valuable attacker for the side to move,
//      remove it from the occupancy (revealed attacks may appear), and record
//      gain[d] = piece-value-just-captured - gain[d-1].
//   3. Negate back through the gain array to find the best-case result for
//      the initiating side (each side stops if continuing loses material).
//
// Returns centipawns — positive = winning exchange, negative = losing.
function see(toSq, fromSq) {
  const target = pieceAt[toSq];
  if (!target) return 0;
  const attacker = pieceAt[fromSq];
  if (!attacker) return 0;

  // Working occupancy — we remove pieces as they "capture" to reveal X-rays
  let occ = occAll;

  // Piece-value lookup ordered cheapest → most expensive for LVA selection
  const SEE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 950, k: 20000 };

  // Helper: cheapest attacker for `color` on `sq` given occupancy `o`
  // Returns { sq: squareIndex, type } or null
  function leastValuableAttacker(sq, color, o) {
    const ci = color === 'w' ? 0 : 1;

    // Pawns
    const pAtk = bbAnd(PAWN_ATTACKS[ci][sq], bbAnd(bb[ci][PIECE_IDX.p], o));
    if (!bbEmpty(pAtk)) return { sq: bbPop(pAtk).sq, type: 'p' };

    // Knights
    const nAtk = bbAnd(KNIGHT_ATTACKS[sq], bbAnd(bb[ci][PIECE_IDX.n], o));
    if (!bbEmpty(nAtk)) return { sq: bbPop(nAtk).sq, type: 'n' };

    // Bishops (and diagonal queens)
    const dAtk = bbAnd(bishopAttacks(sq, o), o);
    const bAtk = bbAnd(dAtk, bb[ci][PIECE_IDX.b]);
    if (!bbEmpty(bAtk)) return { sq: bbPop(bAtk).sq, type: 'b' };

    // Rooks (and straight queens)
    const rAtkAll = bbAnd(rookAttacks(sq, o), o);
    const rAtk    = bbAnd(rAtkAll, bb[ci][PIECE_IDX.r]);
    if (!bbEmpty(rAtk)) return { sq: bbPop(rAtk).sq, type: 'r' };

    // Queens (diagonal)
    const qBAtk = bbAnd(dAtk, bb[ci][PIECE_IDX.q]);
    if (!bbEmpty(qBAtk)) return { sq: bbPop(qBAtk).sq, type: 'q' };

    // Queens (straight)
    const qRAtk = bbAnd(rAtkAll, bb[ci][PIECE_IDX.q]);
    if (!bbEmpty(qRAtk)) return { sq: bbPop(qRAtk).sq, type: 'q' };

    // King
    const kAtk = bbAnd(KING_ATTACKS[sq], bbAnd(bb[ci][PIECE_IDX.k], o));
    if (!bbEmpty(kAtk)) return { sq: bbPop(kAtk).sq, type: 'k' };

    return null;
  }

  // gain[d] = material swing at depth d of the exchange sequence
  const gain = new Int32Array(32);
  let d = 0;

  gain[d] = SEE_VAL[target.type];

  // Remove the first attacker from occupancy
  occ = bbClear(occ, fromSq);

  let sideToMove = attacker.color === 'w' ? 'b' : 'w'; // opponent recaptures next
  let capturedVal = SEE_VAL[attacker.type];

  while (true) {
    d++;
    gain[d] = capturedVal - gain[d - 1]; // score if we stop here

    const lva = leastValuableAttacker(toSq, sideToMove, occ);
    if (!lva) break; // no more attackers for this side

    // Remove this attacker from occupancy (may reveal sliders behind it)
    occ = bbClear(occ, lva.sq);
    capturedVal = SEE_VAL[lva.type];
    sideToMove = sideToMove === 'w' ? 'b' : 'w';
  }

  // Negate back: each side only continues if it improves its position
  while (--d > 0) {
    gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  }

  return gain[0]; // positive = good for the initiating side
}

// ─── Quiescence search ────────────────────────────────────────────────────────
function quiesce(alpha, beta, ply) {
  // ── TT probe ──────────────────────────────────────────────────────────────
  // Use QS_TT_DEPTH (-1) so only quiescence entries hit here; full-depth
  // entries stored at depth >= 0 never satisfy TT[b+2] >= QS_TT_DEPTH? No —
  // ttProbe checks stored >= requested, so requesting QS_TT_DEPTH (-1) means
  // ANY stored depth qualifies. Use a dedicated QS flag check instead:
  // we only accept an entry if it was stored by quiesce (depth field === QS_TT_DEPTH).
  const ttBest = ttGetBest(zobristKey);
  { // scoped to avoid variable leak
    const b = ttIndex(zobristKey);
    if (TT[b] === (zobristKey.lo | 0) && TT[b+1] === (zobristKey.hi | 0) &&
        TT[b+2] === QS_TT_DEPTH) {
      const score = TT[b+3], flag = TT[b+4];
      if (flag === TT_EXACT)                   { if (score !== null) return score; }
      else if (flag === TT_LOWER && score >= beta)  return score;
      else if (flag === TT_UPPER && score <= alpha) return score;
    }
  }

  // 50-move rule — must check in quiescence too, otherwise a position already
  // drawn by the 50-move rule can return a non-zero stand-pat score.
  if (halfClock >= 100) return 0;

  const stand = evaluate();
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  // Generate captures and promotions only
  const moves = generateMoves(turn, false).filter(mv =>
    mv.flags === 'c' || mv.flags === 'ep' ||
    mv.flags === 'pc' || mv.flags === 'p'
  );

  // Order: TT best move first, then MVV-LVA / promotions
  moves.sort((a, b) => {
    const sc = mv => {
      // TT best move always first
      if (ttBest && mv.from === ttBest.from && mv.to === ttBest.to) return 2000000;
      if (mv.flags === 'p' || mv.flags === 'pc') {
        const pv = { q:900, r:400, b:200, n:200 };
        return 1000000 + (pv[mv.promo] || 0);
      }
      const vv = pieceAt[mv.to] ? MAT[pieceAt[mv.to].type] : 0;
      const av = pieceAt[mv.from] ? MAT[pieceAt[mv.from].type] : 0;
      return vv * 10 - av;
    };
    return sc(b) - sc(a);
  });

  let bestScore = stand; // initialise to stand-pat so TT stores correctly
  let bestMv    = null;
  let flag      = TT_UPPER;

  // Delta pruning margin — if capturing the most valuable piece on the board
  // plus a queen promotion still can't raise alpha, nothing in quiescence can.
  // We use the maximum possible material gain as the delta margin.
  const DELTA_MARGIN = MAT.q + 50; // queen value + small buffer

  for (const mv of moves) {
    // Delta pruning — skip captures that can't possibly raise alpha even in
    // the best case (i.e. stand + captureGain + DELTA_MARGIN < alpha).
    // Only applied when not in check (stand-pat is valid) and not a promotion.
    if (mv.flags !== 'p' && mv.flags !== 'pc') {
      const capturedPiece = mv.flags === 'ep' ? { type: 'p' } : pieceAt[mv.to];
      const captureGain   = capturedPiece ? MAT[capturedPiece.type] : 0;
      if (stand + captureGain + DELTA_MARGIN < alpha) continue;
    }

    // Skip clearly losing captures (SEE < -50)
    if ((mv.flags === 'c' || mv.flags === 'pc') && see(mv.to, mv.from) < -50) continue;

    const undo = makeMove(mv);
    const score = -quiesce(-beta, -alpha, ply + 1);
    unmakeMove(undo);

    if (score > bestScore) { bestScore = score; bestMv = mv; }
    if (score >= beta) {
      ttStore(zobristKey, QS_TT_DEPTH, score, TT_LOWER, mv.from, mv.to);
      return beta;
    }
    if (score > alpha) { alpha = score; flag = TT_EXACT; }
  }

  ttStore(zobristKey, QS_TT_DEPTH, bestScore, flag,
    bestMv ? bestMv.from : -1, bestMv ? bestMv.to : -1);
  return alpha;
}

// ─── Alpha-beta search ────────────────────────────────────────────────────────
let searchAborted  = false;
let searchDeadline = 0; // Date.now() deadline for time management
let nodeCount      = 0;
let bestMoveRoot   = null; // best move found at root across all ID iterations

function alphaBeta(depth, alpha, beta, ply, nullOk, prevMv, prevPrevMv = null) {
  // Time check every 2048 nodes
  if ((++nodeCount & 2047) === 0) {
    if (Date.now() >= searchDeadline) { searchAborted = true; return 0; }
  }
  if (searchAborted) return 0;

  // Mate distance pruning
  const mateScore = MATE_VAL - ply;
  if (alpha < -mateScore) alpha = -mateScore;
  if (beta  >  mateScore) beta  =  mateScore;
  if (alpha >= beta) return alpha;

  // ── Threefold repetition detection (Stockfish-style) ─────────────────────
  // A position is a draw at the THIRD occurrence. We check both the in-search
  // stack and the game history and count total prior occurrences combined.
  //
  // Correct rule:
  //   • Each match in the search stack counts as 1 prior occurrence.
  //   • Each match in the game history counts as 1 prior occurrence.
  //   • Total prior occurrences >= 2  →  this node is the 3rd occurrence → draw.
  //   • Total prior occurrences == 1  →  2nd occurrence; the ENGINE should avoid
  //     repeating AGAIN (return draw score as a warning) but only if we are
  //     currently inside the search tree (ply > 0).
  //
  // We also respect halfClock: positions separated by a capture or pawn move
  // cannot be repetitions, so we only look back halfClock plies.
  if (ply > 0) {
    const kLo = zobristKey.lo, kHi = zobristKey.hi;
    let reps = 0;

    // 1. Check search stack (in-search positions, step by 2 = same side to move)
    //    searchStack[searchStackLen-1] is the position we JUST pushed (current),
    //    so start at searchStackLen-2 and walk back.
    for (let i = searchStackLen - 2; i >= 0; i -= 2) {
      const s = searchStack[i];
      if (s.lo === kLo && s.hi === kHi) {
        reps++;
        break; // at most one in-search match contributes (avoids double-counting)
      }
    }

    // 2. Check game history.
    //    gameHistoryKeys is indexed 0..gameHistoryLen-1.
    //    We must start at the entry whose side-to-move matches ours.
    //    Entries alternate sides; the last entry (gameHistoryLen-1) is the
    //    position AFTER the most recent game move, which is the opponent's turn
    //    if gameHistoryLen is even, or our turn if odd — so we start at the last
    //    entry and step by 2. The halfClock limit stops us at the last irreversible move.
    {
      const limit = Math.max(0, gameHistoryLen - halfClock - 1);
      // Align starting index to same-side parity as current position.
      // gameHistoryKeys[gameHistoryLen-1] is the position just before the search
      // started, which has the same side-to-move as the search root (ply=0).
      // Each makeMove increments searchStackLen by 1 and flips the side.
      // So the current position (at this ply) matches gameHistoryLen-1 parity
      // only when searchStackLen is EVEN. When it is ODD the current side-to-move
      // is flipped relative to the root, so we step back one extra slot.
      let hStart = gameHistoryLen - 1;
      if (searchStackLen % 2 === 1) hStart--;
      for (let h = hStart; h >= limit; h -= 2) {
        const k = gameHistoryKeys[h];
        if (k && k.lo === kLo && k.hi === kHi) {
          reps++;
          if (reps >= 2) break; // third occurrence confirmed; no need to count further
        }
      }
    }

    if (reps >= 1) {
      // ── Draw contempt ───────────────────────────────────────────────────
      // When both engines see equal material (contempt=0) neither avoids the
      // draw, causing AI-vs-AI repetition loops. Apply a small asymmetric
      // contempt based on ply parity so one side always prefers to deviate.
      //
      // Additionally scale contempt by material difference:
      //   +ve matDiff = we are ahead  → actively avoid draw (-ve return)
      //   -ve matDiff = we are behind → accept draw (+ve return)
      //   ≈0 matDiff  = equal         → small parity nudge breaks the symmetry
      const ci  = turn === 'w' ? 0 : 1;
      const opp = 1 - ci;
      let ownMat = 0, oppMat = 0;
      for (const t of ['q','r','b','n','p']) {
        ownMat += bbCount(bb[ci][PIECE_IDX[t]])  * MAT[t];
        oppMat += bbCount(bb[opp][PIECE_IDX[t]]) * MAT[t];
      }
      const matDiff = ownMat - oppMat; // positive = we are ahead

      let contempt;
      if (matDiff > 150) {
        contempt = -40;           // clearly ahead — strongly avoid draw
      } else if (matDiff < -150) {
        contempt = 25;            // clearly behind — draw is fine
      } else {
        // Near-equal: use a ply-parity nudge (+10 / -10) so the two sides
        // disagree on draw value and one will always prefer to deviate.
        // This reliably breaks AI-vs-AI repetition loops at no playing cost.
        contempt = (ply % 2 === 1) ? -10 : 10;
      }
      return contempt;
    }
  }

  // TT probe
  const ttHit = ttProbe(zobristKey, depth, alpha, beta);
  if (ttHit !== null && ply > 0) return ttHit;
  const ttBest = ttGetBest(zobristKey);

  // Horizon — drop into quiescence
  if (depth <= 0) return quiesce(alpha, beta, ply);

  // ── Static eval + improving heuristic ────────────────────────────────────
  // Compute once per node so futility pruning, null-move R, and the improving
  // flag all use the same value. We store it in staticEvalStack[ply] so that
  // nodes two plies later can compare against it.
  //
  // "Improving": the side to move is doing better now than it was two plies ago
  // (same side to move). If improving, we are in a promising line — we should
  // search more carefully and prune less. If not improving, we can prune more.
  //
  // We skip the improving check when in check (stand-pat is invalid there).
  // staticEvalStack is initialised to -1e9 so the first real eval always wins.
  const inCheckNow = inCheck(turn);
  const rawStaticEval = inCheckNow ? -INF : evaluate();
  if (ply < SEARCH_STACK_SIZE) staticEvalStack[ply] = rawStaticEval;

  const improving = !inCheckNow && ply >= 2
    && rawStaticEval > staticEvalStack[ply - 2];

  // Null-move pruning
  // Chaos-tuned threshold: only when material (excl. K+P) > 6 * pawn value
  // to avoid NMP in lean endgames where chaos positions frequently arrive
  if (nullOk && depth >= 3 && !inCheckNow && ply > 0) {
    let mat = 0;
    const ci = turn === 'w' ? 0 : 1;
    for (const t of ['q','r','b','n'])
      mat += bbCount(bb[ci][PIECE_IDX[t]]) * MAT[t];
    if (mat > 600) { // 6 pawns worth of non-pawn, non-king material
      // Scaled R: deeper reductions when position is clearly better than beta
      // and at higher depths. Mirrors Stockfish's adaptive NMP formula.
      // BUG-FIX: clamp the eval term to [0, 3] — without the lower-bound clamp,
      // when staticEval << beta (position is worse than expected), the term
      // becomes large-negative, making R zero or negative. R=0 means the null
      // search runs at depth-1 (no reduction at all), exploding node count.
      const evalTerm    = Math.max(0, Math.min(3, Math.floor((rawStaticEval - beta) / 200)));
      const R           = 3 + Math.floor(depth / 6) + evalTerm;
      // Make null move (just flip turn)
      // Null move: flip turn + clear ep only. Bitboards unchanged — correct
      // because we are not moving any piece, just passing the turn.
      const savedTurn   = turn;
      const savedEp     = enPassantSq;
      const savedHalf   = halfClock;
      const savedZobLo  = zobristKey.lo;
      const savedZobHi  = zobristKey.hi;
      if (enPassantSq >= 0) zobristKey = bbXor(zobristKey, ZOBRIST_EP[enPassantSq % 8]);
      enPassantSq = -1;
      turn = turn === 'w' ? 'b' : 'w';
      zobristKey = bbXor(zobristKey, ZOBRIST_TURN);

      const nullScore = -alphaBeta(depth - 1 - R, -beta, -beta + 1, ply + 1, false, null);

      // Restore exactly — bitboards were never touched so no need to restore them
      turn        = savedTurn;
      enPassantSq = savedEp;
      halfClock   = savedHalf;
      zobristKey  = { lo: savedZobLo, hi: savedZobHi };

      if (nullScore >= beta && Math.abs(nullScore) < MATE_VAL - 100) return beta;
    }
  }

  // ── ProbCut ────────────────────────────────────────────────────────────────
  // If a shallow search of captures already proves the position is above a
  // threshold margin beyond beta (too good) or below alpha (too bad), we can
  // skip the expensive full-depth search — the result won't affect the parent's
  // decision anyway. This cuts a significant portion of the search tree at
  // deeper plies where the full search is expensive.
  //
  // Algorithm (standard ProbCut from Stockfish/Rebel lineage):
  //   threshold  = beta + PROBCUT_MARGIN (currently 200cp)
  //   Run a reduced-depth (depth - 4) search on capture moves only.
  //   If any capture scores >= threshold, return beta immediately (fail-high).
  //
  // Guards (all must hold):
  //   • depth >= 5           — not worth it at shallow depths (overhead > savings)
  //   • !inCheckNow          — in check: captures ≠ representative sample
  //   • |beta| < MATE_VAL-100 — skip near forced mates (scores unreliable)
  //   • ply > 0              — never prune at root (we need a best move)
  //   • Not in PV node       — PV is alpha < beta-1 (full window); ProbCut
  //                            fires only on null-window / non-PV nodes where
  //                            alpha + 1 === beta (scout search).
  //
  // Why 200cp margin? It's the sweet spot between:
  //   • Too tight (e.g. 50cp) → many false positives, wrong pruning
  //   • Too loose (e.g. 500cp) → almost never fires, no benefit
  // 200cp ≈ 2 pawns: a capture that proves the position is 2 pawns above beta
  // at reduced depth is almost always confirmed at full depth too.
  const PROBCUT_MARGIN = 200;
  if (depth >= 5 && !inCheckNow && ply > 0 &&
      Math.abs(beta) < MATE_VAL - 100 &&
      alpha + 1 >= beta) { // null-window / non-PV node only
    const pcBeta  = beta + PROBCUT_MARGIN;
    const pcDepth = depth - 4;
    // Try capture moves only (sorted by MVV-LVA for best ordering)
    const captureMoves = moves.filter(mv =>
      mv.flags === 'c' || mv.flags === 'ep' || mv.flags === 'pc'
    ).sort((a, b) => {
      const vA = pieceAt[a.to] ? MAT[pieceAt[a.to].type] : 0;
      const vB = pieceAt[b.to] ? MAT[pieceAt[b.to].type] : 0;
      const aA = pieceAt[a.from] ? MAT[pieceAt[a.from].type] : 0;
      const aB = pieceAt[b.from] ? MAT[pieceAt[b.from].type] : 0;
      return (vB * 10 - aB) - (vA * 10 - aA); // descending MVV-LVA
    });
    for (const pcMv of captureMoves) {
      if (searchAborted) break;
      // Quick SEE filter — skip captures that immediately lose heavy material
      // (negative SEE below -50cp means even the shallow search would reject them)
      if (see(pcMv.to, pcMv.from) < -50) continue;
      const pcUndo = makeMove(pcMv);
      // Search at reduced depth with a null window around pcBeta
      const pcScore = -alphaBeta(pcDepth, -pcBeta, -pcBeta + 1, ply + 1, false, pcMv);
      unmakeMove(pcUndo);
      if (pcScore >= pcBeta) {
        // Shallow search confirms this position is well above beta — prune.
        // Store a lower-bound (fail-high) in the TT for future visits.
        ttStore(zobristKey, depth, pcScore, TT_LOWER, pcMv.from, pcMv.to);
        return beta;
      }
    }
  }

  // ── Razoring ────────────────────────────────────────────────────────────────
  // At depth 1, if static eval is far below alpha, drop straight to quiescence.
  // Avoids wasting time on positions that can't improve alpha even with best play.
  if (depth === 1 && !inCheckNow) {
    if (rawStaticEval + 300 < alpha) return quiesce(alpha, beta, ply);
  }

  const moves = generateMoves(turn, false);

  if (moves.length === 0) {
    // No legal moves — checkmate or stalemate
    return inCheck(turn) ? -(MATE_VAL - ply) : 0;
  }

  // ── 50-move rule ─────────────────────────────────────────────────────────────
  // halfClock counts half-moves since the last pawn move or capture.
  // At 100 half-moves (50 full moves) the position is a draw.
  // Checked after move generation so we don't mislabel checkmate as a draw
  // (a side in checkmate has no moves; halfClock is irrelevant there).
  if (halfClock >= 100) return 0;

  // ── Internal Iterative Deepening (IID) ───────────────────────────────────
  // FIX I2: When there is no TT move for this node and depth >= 5, run a
  // shallow search first to populate the TT with a best move. The TT hit
  // from that shallow search is then used to order moves in the full search,
  // dramatically improving cutoff rates at high depths.
  //
  // Without IID, fresh high-depth nodes with no TT entry search all moves in
  // arbitrary order after the first few scored by killers/history. With IID,
  // the best move from a depth-3 preview is always tried first.
  //
  // Guards:
  //   • depth >= 5  — IID overhead isn't worth it at shallow depth
  //   • !ttBest     — skip if TT already has a good move for ordering
  //   • ply > 0     — not at root (root always has a previous iteration's best)
  //   • !inCheck    — in check: legal moves are few, ordering matters less
  let ttBestOrdered = ttBest;
  if (!ttBestOrdered && depth >= 5 && ply > 0 && !inCheck(turn)) {
    alphaBeta(depth - 3, alpha, beta, ply, false, prevMv, prevPrevMv); // shallow search to seed TT
    ttBestOrdered = ttGetBest(zobristKey);                 // re-read best move from TT
  }
  // If static eval + margin < alpha, quiet moves at this depth cannot raise
  // alpha — skip them. Only captures/promotions/checks are still searched.
  // Applied at depths 1-6; deeper = too risky to prune.
  //
  // ── Improving heuristic applied to futility ─────────────────────────────
  // When the position is IMPROVING (we're doing better than 2 plies ago),
  // the side to move is in a favourable trend — be more conservative with
  // pruning (use a smaller margin so fewer moves are cut). When NOT improving,
  // prune more aggressively (larger margin).
  //
  // Margins (base):  depth 1=100, 2=300, 3=500, 4=700, 5=900, 6=1100
  // When improving:  subtract 50cp (prune less — search more carefully)
  // When not impr.:  add     50cp (prune more — trust eval sooner)
  const BASE_FUTILITY = [0, 100, 300, 500, 700, 900, 1100];
  const improvingAdj  = improving ? -50 : 50;
  const futilityBase = (depth >= 1 && depth <= 6 && !inCheckNow)
    ? rawStaticEval + (BASE_FUTILITY[depth] || 0) + improvingAdj
    : null;

  const ordered = scoreMoves(moves, ply, ttBestOrdered, prevMv, prevPrevMv);
  let bestScore = -INF;
  let bestMv    = null;
  let flag      = TT_UPPER;
  let movesDone = 0;

  for (const mv of ordered) {
    // Futility pruning — skip quiet moves that can't raise alpha
    if (futilityBase !== null &&
        mv.flags !== 'c' && mv.flags !== 'ep' &&
        mv.flags !== 'p' && mv.flags !== 'pc' &&
        mv.flags !== 'castle' && movesDone > 0) {
      if (futilityBase < alpha) continue;
    }

    // ── Singular extension ────────────────────────────────────────────────
    // If this is the TT best move and a reduced search of all other moves
    // cannot beat a margin below the TT score, the move is "singular" —
    // extend it by 1 ply.
    //
    // Guards versus the O(n²) blow-up identified in code review:
    //   • depth >= 8  (not 6) — trigger at deeper plies only; this limits
    //     how often the nested loop fires without meaningfully hurting quality.
    //   • ply <= 4    — only near the root where the signal is most reliable.
    //   • Node budget: skip if we have already spent > 60% of our time budget
    //     OR if we have searched > 50k nodes at this ply (proxy for move count).
    //   • At most ONE singular extension per root-to-leaf path (tracked via
    //     the singularDepth halving — the recursive call uses depth-1-R so the
    //     child depth never reaches 8 again, preventing cascading extensions).
    let extension = 0;
    const isTTMove = ttBest && mv.from === ttBest.from && mv.to === ttBest.to;
    const timeOk   = Date.now() < searchDeadline - 100; // >100ms remaining
    if (isTTMove && depth >= 8 && ply <= 4 && ply > 0 && timeOk) {
      const ttScore = ttProbe(zobristKey, depth - 3, -INF, INF);
      if (ttScore !== null) {
        const singularBeta  = ttScore - 60; // margin below TT score
        const singularDepth = Math.floor(depth / 2) - 1; // shallower than before
        let   singularScore = -INF;
        let   singNodes     = 0;
        const singNodeLimit = 800; // hard cap — bail out early if too branchy
        for (const other of ordered) {
          if (other.from === mv.from && other.to === mv.to) continue;
          const u = makeMove(other);
          const s = -alphaBeta(singularDepth, -singularBeta - 1, -singularBeta, ply + 1, false, other);
          unmakeMove(u);
          singNodes++;
          if (s > singularScore) singularScore = s;
          if (singularScore >= singularBeta || singNodes >= singNodeLimit || searchAborted) break;
        }
        if (!searchAborted && singularScore < singularBeta) extension = 1;
      }
    }

    const undo = makeMove(mv);
    let score;

    // ── Check extension ───────────────────────────────────────────────────
    // FIX I1: extend by 1 ply when this move gives check to the opponent.
    // After makeMove, `turn` has already flipped to the opponent's colour.
    // inCheck(turn) therefore asks "is the opponent in check after our move?"
    // This catches forced sequences that need deeper analysis. We only extend
    // if we haven't already extended (singular extension takes priority) and
    // cap at MAX_PLY to prevent runaway depth in pathological positions.
    if (extension === 0 && ply < MAX_PLY - 2 && inCheck(turn)) {
      extension = 1;
    }

    // ── Threat extension ──────────────────────────────────────────────────
    // Extend when the opponent (now to move after our makeMove) has an
    // immediately winning capture available — i.e. a SEE-positive capture
    // that wins more than a minor piece. This prevents shallow searches from
    // missing forced-loss positions where the opponent can cash in a big
    // material swing on their very next move.
    // Guard: only at shallow plies (≤ 3) near the root where the signal is
    // clearest, and only when we haven't already extended.
    if (extension === 0 && ply <= 3 && depth >= 3 && !inCheck(turn)) {
      const oppColorNow  = turn; // turn has flipped; this is the opponent
      const oppCiNow     = oppColorNow === 'w' ? 0 : 1;
      const myOccNow     = oppCiNow === 0 ? occB : occW; // OUR pieces = opponent of oppCiNow
      let threatFound    = false;
      outer: for (const ttype of ['q','r','b','n','p']) {
        let attackers = bb[oppCiNow][PIECE_IDX[ttype]];
        while (!bbEmpty(attackers)) {
          const { sq: aSq, bb: aRest } = bbPop(attackers);
          attackers = aRest;
          // Check all squares this piece can capture on (our pieces are targets)
          let targets;
          switch (ttype) {
            case 'n': targets = bbAnd(KNIGHT_ATTACKS[aSq], myOccNow); break;
            case 'b': targets = bbAnd(bishopAttacks(aSq, occAll), myOccNow); break;
            case 'r': targets = bbAnd(rookAttacks(aSq,   occAll), myOccNow); break;
            case 'q': targets = bbAnd(queenAttacks(aSq,  occAll), myOccNow); break;
            case 'p': targets = bbAnd(PAWN_ATTACKS[oppCiNow][aSq], myOccNow); break;
            default:  targets = BB_ZERO;
          }
          while (!bbEmpty(targets)) {
            const { sq: tSq, bb: tRest } = bbPop(targets);
            targets = tRest;
            // Only trigger for significant material gains (> minor piece)
            const victim = pieceAt[tSq];
            if (!victim || MAT[victim.type] <= MAT.n) continue;
            if (see(tSq, aSq) > MAT.n) { threatFound = true; break outer; }
          }
        }
      }
      if (threatFound) extension = 1;
    }

    // Late Move Reductions (don't reduce singular extensions)
    // FIX I3: use precomputed LMR_TABLE instead of per-node Math.sqrt calls.
    // FIX I4: SEE-based pruning for clearly losing captures at shallow depths.
    let reduction = 0;
    if (extension === 0 && depth >= 3 && movesDone >= 4 &&
        mv.flags !== 'c' && mv.flags !== 'ep' &&
        mv.flags !== 'p' && mv.flags !== 'pc' &&
        !inCheck(turn)) {
      // table is [depth][moveIndex], both clamped to [0,63]
      reduction = LMR_TABLE[Math.min(63, depth)][Math.min(63, movesDone)];
      // History-based adjustment: clamp history to [-1, +1] ply influence.
      // Threshold of 5000 is roughly "caused a cutoff at depth 7" (7*7=49 * ~100 updates).
      const hs   = histScore(turn, mv);
      const chs  = contHistScore(turn, prevMv, mv);
      const chs2 = contHistScore2(turn, prevPrevMv, mv);
      const combinedHist = hs + chs * 2 + chs2;
      if (combinedHist > 5000) reduction = Math.max(0, reduction - 1); // proven good move — search deeper
      else if (combinedHist <= 0) reduction = reduction + 1;            // no history — reduce more aggressively
      // ── Improving heuristic applied to LMR ────────────────────────────
      // When the position is improving (we're doing better than 2 plies ago),
      // the current line is promising — reduce by 1 less ply so we search it
      // more carefully. When not improving, the line is likely bad — reduce 1 more.
      if (improving) reduction = Math.max(0, reduction - 1);
      else           reduction = reduction + 1;
      reduction = Math.min(reduction, depth - 2);
    }

    // FIX I4: SEE-based pruning — skip clearly losing captures at shallow depth.
    // A capture that loses more than (depth * pawn value) in material exchange
    // is almost never worth searching at full depth. Skip unless in check.
    if (!inCheck(turn) && depth <= 6 &&
        (mv.flags === 'c' || mv.flags === 'pc') &&
        see(mv.to, mv.from) < -MAT.p * depth) {
      unmakeMove(undo);
      movesDone++;
      continue;
    }

    if (movesDone === 0) {
      // First move — full window (+ extension if singular)
      // Thread: child sees mv as its prevMv (1-ply back) and our prevMv as prevPrevMv (2-ply back).
      score = -alphaBeta(depth - 1 + extension, -beta, -alpha, ply + 1, true, mv, prevMv);
    } else {
      // Try reduced search first
      score = -alphaBeta(depth - 1 - reduction + extension, -alpha - 1, -alpha, ply + 1, true, mv, prevMv);
      // If it beats alpha, re-search at full depth
      if (!searchAborted && score > alpha && reduction > 0)
        score = -alphaBeta(depth - 1 + extension, -alpha - 1, -alpha, ply + 1, true, mv, prevMv);
      // PVS: if inside window, search with full window
      if (!searchAborted && score > alpha && score < beta)
        score = -alphaBeta(depth - 1 + extension, -beta, -alpha, ply + 1, true, mv, prevMv);
    }

    unmakeMove(undo);
    if (searchAborted) return 0;

    movesDone++;

    if (score > bestScore) {
      bestScore = score;
      bestMv    = mv;
      if (ply === 0) bestMoveRoot = mv;
    }
    if (score > alpha) {
      alpha = score;
      flag  = TT_EXACT;
    }
    if (score >= beta) {
      storeKiller(ply, mv);
      updateHistory(turn, mv, depth);
      updateContHist(turn, prevMv, mv, depth);        // 1-ply continuation history
      updateContHist2(turn, prevPrevMv, mv, depth);   // 2-ply follow-up history
      updateCaptureHistory(turn, mv, depth);   // capture history update
      storeCountermove(prevMv, mv); // remember what refuted the opponent's move
      ttStore(zobristKey, depth, score, TT_LOWER, mv.from, mv.to);
      return beta;
    }
  }

  // ── Correction history update ─────────────────────────────────────────────
  // When the search returns an exact score (flag === TT_EXACT), we know how
  // wrong the static eval was. Record the error so future nodes with the same
  // pawn structure get a more accurate eval for pruning decisions.
  // We use rawStaticEval (the pre-correction value) so we don't create circular
  // feedback between the correction and the search score.
  if (flag === TT_EXACT && !inCheckNow && rawStaticEval !== -INF) {
    corrHistUpdate(rawStaticEval, bestScore);
  }

  ttStore(zobristKey, depth, bestScore, flag,
    bestMv ? bestMv.from : -1, bestMv ? bestMv.to : -1);
  return bestScore;
}

// ─── Iterative deepening ──────────────────────────────────────────────────────
function search(maxDepth, moveTimeMs) {
  searchAborted  = false;
  searchDeadline = Date.now() + moveTimeMs;
  nodeCount      = 0;
  bestMoveRoot   = null;
  searchStackLen = 0; // reset search-stack for new search
  staticEvalStack.fill(-1e9); // reset improving heuristic stack
  ttAge++;

  // Clamp maxDepth to MAX_PLY as a hard safety ceiling.
  // In normal operation maxDepth comes from the difficulty preset (4–20) or
  // MAX_PLY when no explicit depth is given. Either way, searching past MAX_PLY
  // would overflow the killers / searchStack arrays. Time is always the primary
  // constraint — the ceiling is almost never the binding limit at Hard/Hardest.
  const safeMaxDepth = Math.min(maxDepth, MAX_PLY);

  // Clear killers and countermoves for new search
  for (let i = 0; i < MAX_PLY; i++) killers[i][0] = killers[i][1] = null;
  clearCountermoves();
  clearContHist();
  clearCaptureHistory();

  let bestScore = 0;
  // FIX I5: additive aspiration window widening instead of doubling (*= 2).
  // Widening sequence mirrors Stockfish: 50 → 150 → 450 → full window (INF).
  // Doubling could jump from a 50cp window straight to 100cp, 200cp, etc.,
  // overshooting the true score and forcing expensive full-window re-searches.
  // Additive widening keeps the window tighter longer, reducing wasted nodes.
  const ASPIRATION_WIDTHS = [50, 150, 450, INF];
  let aspirationDelta = ASPIRATION_WIDTHS[0];
  let aspirationStage = 0; // index into ASPIRATION_WIDTHS

  for (let depth = 1; depth <= safeMaxDepth; depth++) {
    if (searchAborted) break;

    let alpha, beta;

    if (depth >= 4 && bestScore > -MATE_VAL + 100 && bestScore < MATE_VAL - 100) {
      // Aspiration windows
      alpha = bestScore - aspirationDelta;
      beta  = bestScore + aspirationDelta;
    } else {
      alpha = -INF;
      beta  =  INF;
    }

    let score;
    let research = false;

    while (true) {
      score = alphaBeta(depth, alpha, beta, 0, true, null);

      if (searchAborted) {
        // Reset aspiration state: the widened window from this aborted search
        // must not carry over to the next depth or the next search call.
        aspirationDelta = ASPIRATION_WIDTHS[0];
        aspirationStage = 0;
        break;
      }

      if (score <= alpha) {
        // Failed low — widen window downward using additive stage
        aspirationStage = Math.min(aspirationStage + 1, ASPIRATION_WIDTHS.length - 1);
        aspirationDelta  = ASPIRATION_WIDTHS[aspirationStage];
        alpha = Math.max(-INF, alpha - aspirationDelta);
        research = true;
      } else if (score >= beta) {
        // Failed high — widen window upward using additive stage
        aspirationStage = Math.min(aspirationStage + 1, ASPIRATION_WIDTHS.length - 1);
        aspirationDelta  = ASPIRATION_WIDTHS[aspirationStage];
        beta = Math.min(INF, beta + aspirationDelta);
        research = true;
      } else {
        break; // within window
      }

      if (!research) break;
      research = false;
    }

    if (!searchAborted) {
      bestScore      = score;
      aspirationDelta = ASPIRATION_WIDTHS[0]; // reset to tightest window for next depth
      aspirationStage = 0;

      // Post a progress update after each completed depth so chess.js can
      // animate the eval bar exactly like Stockfish's "info score cp" lines.
      const isMate = Math.abs(bestScore) >= MATE_VAL - MAX_PLY;
      self.postMessage({
        type:  'info',
        depth,
        score: bestScore,  // centipawn or mate distance, side-to-move perspective
        isMate,
        nodes: nodeCount,
        reqId: currentReqId
      });
    }

    // Early exit if mate found
    if (Math.abs(bestScore) >= MATE_VAL - MAX_PLY) break;
  }

  // Fix 11: if search was aborted before completing depth=1, bestMoveRoot
  // is null even though legal moves exist.  Fall back to the first legal
  // move so the engine never returns null in a non-terminal position.
  if (!bestMoveRoot) {
    const fallback = generateMoves(turn, false);
    if (fallback.length > 0) bestMoveRoot = fallback[0];
  }
  return bestMoveRoot;
}

// ─── Move to string (for JSON response) ──────────────────────────────────────
function moveToObj(mv) {
  if (!mv) return null;
  // Return both UCI string (for chess.js applyEngineMove compatibility)
  // and structured fields (for arbitration layer score comparison).
  // Score perspective: positive = good for the side that searched (side to move).
  const uci = sqName(mv.from) + sqName(mv.to) + (mv.promo || '');
  return {
    uci,               // e.g. "e2e4", "e7e8q" — chess.js applyEngineMove format
    from:  sqName(mv.from),
    to:    sqName(mv.to),
    flags: mv.flags,
    promo: mv.promo
  };
}

// ─── FEN parser ───────────────────────────────────────────────────────────────
// Parses a FEN string and initialises the engine board state identically to
// initFromArray. Used to replay game history from gameStartFen + moveHistory.
//
// FEN format: "<pieces> <turn> <castling> <ep> <halfclock> <fullmove>"
// Piece placement: rows separated by '/', rank 8 first. Uppercase=white.
// Castling: KQkq flags or '-'. En-passant: square name or '-'.
//
// unmovedPawns — array of square indices supplied by chess.js (chaos-specific:
// the FEN cannot encode which pawns have never moved, so this is passed through
// from the dispatcher rather than derived from the FEN).

function initFromFen(fen, unmovedPawns) {
  // Reset all bitboards and state
  for (let c = 0; c < 2; c++)
    for (let t = 0; t < 6; t++)
      bb[c][t] = BB_ZERO;
  occAll = BB_ZERO; occW = BB_ZERO; occB = BB_ZERO;
  pieceAt.fill(null);
  zobristKey = BB_ZERO;

  const parts = fen.trim().split(/\s+/);
  const ranks  = parts[0].split('/');   // 8 rank strings, rank8 first
  const fenTurn    = parts[1] || 'w';
  const fenCastle  = parts[2] || '-';
  const fenEp      = parts[3] || '-';
  const fenHalf    = parseInt(parts[4]) || 0;
  const fenFull    = parseInt(parts[5]) || 1;

  // ── Piece placement ─────────────────────────────────────────────────────────
  // ranks[0] = rank 8 (row 0 in our indexing), ranks[7] = rank 1 (row 7)
  for (let row = 0; row < 8; row++) {
    let file = 0;
    for (const ch of ranks[row]) {
      if (ch >= '1' && ch <= '8') {
        file += parseInt(ch);
      } else {
        const color  = ch === ch.toUpperCase() ? 'w' : 'b';
        const type   = ch.toLowerCase();
        const ci     = color === 'w' ? 0 : 1;
        const ti     = PIECE_IDX[type];
        if (ti === undefined) { file++; continue; } // unknown char — skip
        const sq     = row * 8 + file;
        bb[ci][ti]   = bbSet(bb[ci][ti], sq);
        occAll       = bbSet(occAll, sq);
        if (ci === 0) occW = bbSet(occW, sq);
        else          occB = bbSet(occB, sq);
        pieceAt[sq]  = { color, type };
        zobristKey   = bbXor(zobristKey, ZOBRIST_PIECE[ci * 6 + ti][sq]);
        file++;
      }
    }
  }

  // ── Turn ────────────────────────────────────────────────────────────────────
  turn = fenTurn === 'b' ? 'b' : 'w';
  if (turn === 'b') zobristKey = bbXor(zobristKey, ZOBRIST_TURN);

  // ── Castling rights ─────────────────────────────────────────────────────────
  // Bitmask: bit0=WK(K), bit1=WQ(Q), bit2=BK(k), bit3=BQ(q)
  castleRights = 0;
  if (fenCastle.includes('K')) castleRights |= 1;
  if (fenCastle.includes('Q')) castleRights |= 2;
  if (fenCastle.includes('k')) castleRights |= 4;
  if (fenCastle.includes('q')) castleRights |= 8;
  zobristKey = bbXor(zobristKey, ZOBRIST_CASTLE[castleRights]);

  // ── En-passant ──────────────────────────────────────────────────────────────
  enPassantSq = -1;
  if (fenEp !== '-' && fenEp.length >= 2) {
    enPassantSq = sqFromName(fenEp);
    zobristKey  = bbXor(zobristKey, ZOBRIST_EP[enPassantSq % 8]);
  }

  // ── Clocks ──────────────────────────────────────────────────────────────────
  halfClock = fenHalf;
  fullMove  = fenFull;

  // ── Chaos-specific: unmoved pawns ───────────────────────────────────────────
  unmovedPawnSqs = { lo: 0, hi: 0 };
  if (unmovedPawns) for (const sq of unmovedPawns) umpSet(sq);
}

// ─── UCI move replay ──────────────────────────────────────────────────────────
// Replays an array of UCI half-move strings (e.g. ["e2e4","d7d5",...]) through
// the engine's own makeMove machinery, recording the Zobrist key after each move
// into gameHistoryKeys. After replay the board is at the position reached after
// the last move in the list — which is the current game position.
//
// UCI move format: "<from><to>[promo]" e.g. "e2e4", "e7e8q"
// We map each UCI string to a legal move object by matching from/to squares,
// then call makeMove. If a move can't be matched (shouldn't happen with valid
// history), we bail gracefully without corrupting state.

function replayMoves(uciMoves) {
  gameHistoryKeys = [];
  gameHistoryLen  = 0;

  // Record the starting position key before any moves
  gameHistoryKeys.push({ lo: zobristKey.lo, hi: zobristKey.hi });

  if (!uciMoves || uciMoves.length === 0) {
    gameHistoryLen = gameHistoryKeys.length;
    return;
  }

  for (const uci of uciMoves) {
    if (!uci || uci.length < 4) break; // malformed — stop replay
    const fromSq  = sqFromName(uci.slice(0, 2));
    const toSq    = sqFromName(uci.slice(2, 4));
    const promoC  = uci.length >= 5 ? uci[4] : null; // e.g. 'q'

    // Find the matching legal move
    const legal = generateMoves(turn, false);
    const mv = legal.find(m =>
      m.from === fromSq && m.to === toSq &&
      (!promoC || m.promo === promoC)
    );

    if (!mv) break; // position/history mismatch — stop replay safely

    makeMove(mv); // updates zobristKey, board, turn, castleRights, etc.

    // Record position after this move
    gameHistoryKeys.push({ lo: zobristKey.lo, hi: zobristKey.hi });
  }

  gameHistoryLen = gameHistoryKeys.length;
}

// ─── Section 4 complete ───────────────────────────────────────────────────────
// Next: Section 5 — Worker protocol

// ═══════════════════════════════════════════════════════════════════════════════
// Section 5 — Worker Protocol (JSON message handler)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Castling rights helper ───────────────────────────────────────────────────
// Builds a castling rights bitmask from the moved kings/rooks sets
// received from chess.js. Bit layout: bit0=WK, bit1=WQ, bit2=BK, bit3=BQ
function buildCastleRights(movedKingsArr, movedRooksArr) {
  // Start with NO rights and only grant them if the rook is actually present
  // on its standard corner square. This correctly handles chaos games where
  // rooks may start on non-corner squares — castling is only available when
  // the rook happens to start on h1 (WK), a1 (WQ), h8 (BK), or a8 (BQ).
  // Kings always start on their standard squares (e1/e8) per the game rules,
  // so king presence is not checked — only rook presence matters.
  //
  // cornerMap: square index → castling rights bit
  //   63 = h1 (white kingside), 56 = a1 (white queenside)
  //    7 = h8 (black kingside),  0 = a8 (black queenside)
  const cornerMap = { 63: 1, 56: 2, 7: 4, 0: 8 };
  let rights = 0;

  // Grant a right only if a friendly unmoved rook occupies the corner
  for (const [sq, bit] of Object.entries(cornerMap)) {
    const sqNum = Number(sq);
    const piece = pieceAt[sqNum];
    const expectedColor = sqNum >= 56 ? 'w' : 'b'; // sq 56-63 = rank 1 = white; 0-7 = rank 8 = black
    if (piece && piece.type === 'r' && piece.color === expectedColor) {
      rights |= bit;
    }
  }

  // Strip rights for kings that have already moved
  for (const color of movedKingsArr) {
    if (color === 'w') rights &= ~(1 | 2);
    if (color === 'b') rights &= ~(4 | 8);
  }

  // Strip rights for rooks that have already moved away from their corner
  for (const sq of movedRooksArr) {
    if (cornerMap[sq] !== undefined) rights &= ~cornerMap[sq];
  }

  return rights;
}

// ─── Worker state ─────────────────────────────────────────────────────────────
let currentReqId  = -1;   // tracks request ID to discard stale results
let isSearching   = false;

// ─── Position history for threefold repetition (SF-style) ────────────────────
// Game history — Zobrist keys of every position reached since the start of the
// current game. One entry is pushed per half-move dispatch (before searching).
// Used in alphaBeta to detect draws by threefold repetition.
// Cleared on 'cleartt' (new game).
let gameHistoryKeys = [];
let gameHistoryLen  = 0;

// Search-stack history — keys of positions made *during* the current search
// tree (one slot per ply). Populated by makeMove / cleared by unmakeMove.
// This is how Stockfish detects in-search repetitions against *both* the game
// history and sibling nodes in the search tree.
const SEARCH_STACK_SIZE = 128;
const searchStack = new Array(SEARCH_STACK_SIZE); // pre-allocated; filled with BB_ZERO
for (let i = 0; i < SEARCH_STACK_SIZE; i++) searchStack[i] = { lo: 0, hi: 0 };

// ── Improving heuristic — static eval per ply ─────────────────────────────────
// We track the static evaluation at each ply so alphaBeta can compare
// staticEval[ply] against staticEval[ply-2] (same side to move, two plies ago).
// If the position is improving (current eval > eval two plies ago), the side
// to move is doing well — we reduce LMR and tighten futility pruning.
// If it is not improving, we reduce more aggressively and prune more freely.
// Stored as plain numbers (centipawns). Initialised to -INF so the first node
// always counts as "not improving" (safe default).
const staticEvalStack = new Float64Array(SEARCH_STACK_SIZE).fill(-1e9);
let searchStackLen = 0; // how many keys are currently on the stack

// ─── Message handler ──────────────────────────────────────────────────────────
self.onmessage = function(e) {
  const msg = e.data;

  // ── go: start a search ────────────────────────────────────────────────────
  if (msg.type === 'go') {
    currentReqId = msg.reqId;
    isSearching  = true;

    // Unpack board state from chess.js format
    const {
      board,              // Array(64) of {color,type} or null — current board state
      turn: turnColor,
      enPassantSq: epSq,  // square index (-1 if none)
      movedKings,         // Array of color strings that have moved ('w','b')
      movedRooks,         // Array of square indices of rooks that have moved
      unmovedPawns,       // Array of square indices of pawns that haven't moved (current)
      depth,              // max search depth
      moveTime,           // time budget in ms
      halfMoveClock,
      fullMoveNumber,
      gameStartBoard,     // Array(64) board state at move 0 — chaos starting position
      uciMoveHistory      // full UCI half-move history from game start, e.g. ["e2e4","d7d5",...]
    } = msg;

    // ── Initialise board state and build full game history ────────────────────
    //
    // STRATEGY: Replay the complete game from the chaos starting position using
    // C3Engine's own move generator (which is chaos-aware). This gives us an
    // accurate Zobrist key for every position the game has passed through, enabling
    // correct threefold-repetition detection.
    //
    // Two-phase init:
    //
    //   Phase 1 — Start-position init + replay:
    //     • initFromArray(gameStartBoard, ...) sets up the engine at move 0.
    //       At move 0 ALL pawns are unmoved, so we derive unmovedPawns from the
    //       start board directly (every pawn square is eligible for double advance).
    //       Castle rights start fully available (0b1111) — no pieces have moved yet.
    //     • replayMoves(uciMoveHistory) walks the engine forward through every
    //       half-move, recording a Zobrist key after each one into gameHistoryKeys.
    //       Because we use our own move generator the chaos-specific rules (double
    //       push from non-standard ranks, en-passant, chaos castling) are handled
    //       correctly. After replay the engine board is at the current game position.
    //
    //   Phase 2 — Current-position sync:
    //     • Re-run initFromArray with the CURRENT board (chess.js's authoritative
    //       state) to guarantee the engine's board, castleRights, ep square, clocks,
    //       and unmovedPawnSqs exactly match what chess.js sees. This protects
    //       against any edge-case divergence that replayMoves could accumulate.
    //     • gameHistoryKeys built in Phase 1 is kept intact — we do NOT reset it.
    //
    // WHY NOT FEN + replayMoves (old broken path):
    //   1. Non-standard king positions → FEN has no castling rights → castling UCIs
    //      can't be matched → replayMoves breaks early → wrong board → freeze.
    //   2. Old path passed current unmovedPawns to initFromFen, not initial ones →
    //      double-push UCIs couldn't be matched → same break → freeze.
    //   3. En-passant UCIs similarly broke after a failed replay step.
    //
    // The two-phase approach avoids all three failure modes: Phase 1 uses the
    // start board (so pawns are all unmoved and castling is fully available),
    // and Phase 2 corrects any accumulated drift with the authoritative current state.

    if (gameStartBoard && uciMoveHistory) {
      // ── Phase 1: init from game start and replay to build full history ──────
      // Derive initial unmovedPawns: every pawn square in the start board.
      const startUnmovedPawns = [];
      for (let si = 0; si < 64; si++) {
        if (gameStartBoard[si] && gameStartBoard[si].type === 'p') startUnmovedPawns.push(si);
      }
      // At move 0: no kings or rooks have moved yet, so movedKings/movedRooks
      // are both empty. buildCastleRights reads pieceAt[] which is populated by
      // initFromArray — but we need castle rights DURING initFromArray. So we
      // derive them directly from the start board before calling initFromArray.
      // Rule: castle right is available iff the rook is on its standard corner square.
      const cornerRights = { 63: 1, 56: 2, 7: 4, 0: 8 };
      let startCastleRights = 0;
      for (const [sq, bit] of Object.entries(cornerRights)) {
        const sqNum = Number(sq);
        const p = gameStartBoard[sqNum];
        const expectedColor = sqNum >= 56 ? 'w' : 'b';
        if (p && p.type === 'r' && p.color === expectedColor) startCastleRights |= bit;
      }
      initFromArray(gameStartBoard, 'w', -1, startCastleRights, 0, 1, startUnmovedPawns);
      // Walk through every half-move, recording Zobrist keys at each step.
      replayMoves(uciMoveHistory);
      // gameHistoryKeys and gameHistoryLen are now fully populated by replayMoves.

      // ── Phase 2: sync to current authoritative board state ──────────────────
      // Re-initialise using chess.js's exact current state. This overwrites the
      // engine's internal board/bitboards/clocks/ep/castleRights with the ground
      // truth from chess.js, eliminating any drift from replay.
      // IMPORTANT: we deliberately do NOT reset gameHistoryKeys here — Phase 1's
      // history is what we want to keep for repetition detection.
      const castleMaskCurrent = buildCastleRights(movedKings || [], movedRooks || []);
      initFromArray(
        board,
        turnColor,
        epSq !== undefined ? epSq : -1,
        castleMaskCurrent,
        halfMoveClock  || 0,
        fullMoveNumber || 1,
        unmovedPawns   || []
      );
      // gameHistoryKeys/gameHistoryLen: already set by Phase 1 — do not touch.

    } else {
      // ── Fallback: no history available — init from current board only ────────
      // Used for the very first move (no history yet) or backwards compatibility.
      const castleMask = buildCastleRights(movedKings || [], movedRooks || []);
      initFromArray(
        board,
        turnColor,
        epSq !== undefined ? epSq : -1,
        castleMask,
        halfMoveClock  || 0,
        fullMoveNumber || 1,
        unmovedPawns   || []
      );
      // Seed repetition table with a single entry for the current position.
      gameHistoryKeys = [{ lo: zobristKey.lo, hi: zobristKey.hi }];
      gameHistoryLen  = 1;
    }

    // Run search
    // The depth sent by chess.js comes from the difficulty preset (4–20).
    // We use it as a soft ceiling — iterative deepening will stop earlier
    // if the time budget runs out. We no longer default to 12 when depth
    // is missing: instead we use MAX_PLY (64) so time is always the only
    // real constraint, matching how Stockfish operates. The preset depth
    // still acts as a hard cap for weaker difficulty levels (depths 4–11)
    // which deliberately limit strength.
    const searchDepth = depth > 0 ? depth : MAX_PLY;
    const bestMv = search(searchDepth, moveTime || 3000);

    // If aborted or no move found, check for game-over condition
    if (!isSearching) return; // was stopped mid-search

    if (!bestMv) {
      // No legal moves — checkmate or stalemate
      const result = inCheck(turnColor) ? 'checkmate' : 'stalemate';
      self.postMessage({ type: 'gameover', result, reqId: currentReqId });
      isSearching = false;
      return;
    }

    // Build score info — from the root position's perspective
    // (positive = good for the side that just searched)
    const score = bestMv ? evaluate() : 0;

    self.postMessage({
      type:  'bestmove',
      move:  moveToObj(bestMv),
      score, // centipawns, side-to-move perspective
      nodes: nodeCount,
      reqId: currentReqId
    });

    isSearching = false;
  }

  // ── stop: abort current search ────────────────────────────────────────────
  else if (msg.type === 'stop') {
    searchAborted = true;
    isSearching   = false;
  }

  // ── cleartt: flush transposition table (new game) ─────────────────────────
  else if (msg.type === 'cleartt') {
    // Fix: reset search state so the next 'go' starts cleanly.
    // Without this, a 'stop' from the old game sets searchAborted=true and
    // the very first node of the new game's search returns 0 immediately,
    // causing the engine to return no move for the first turn of the new game.
    searchAborted  = false;
    isSearching    = false;
    currentReqId   = -1;
    ttClear();
    clearHistory();
    clearContHist();         // reset continuation history on new game
    clearCaptureHistory();   // reset capture history on new game
    pawnHashClear();         // reset pawn hash on new game
    corrHistClear();         // reset correction history on new game
    gameHistoryKeys = []; // reset game history on new game
    gameHistoryLen  = 0;
    searchStackLen  = 0;  // clear search stack on new game
  }

  // ── ping: health check ────────────────────────────────────────────────────
  else if (msg.type === 'ping') {
    self.postMessage({ type: 'pong' });
  }
};

// Signal ready
self.postMessage({ type: 'ready' });

// ─── Section 5 complete — C3Engine.js build complete ─────────────────────────
