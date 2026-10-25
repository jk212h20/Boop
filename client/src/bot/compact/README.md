# Compact search backend

Authority: `docs/BOT_COMPACT_ENGINE.md` at repository root. This is experimental;
the live worker still imports frozen v4. Do not import this backend into UI game
state: it intentionally discards names, animation events and lastMove.

- `CompactGame.ts`: independent numeric rules and canonical boundary encoder.
- `evaluation.ts`: numeric port of v4 pair evaluation, same arithmetic/order.
- `CompactBot.ts`: controlled search port, identical budget/order/ties at 30k.

Numeric conventions: orange 0, gray 1. Empty square 0; occupied squares 1–4
encode orange kitten, orange cat, gray kitten, gray cat. Odd pieces are kittens;
owner is `(piece - 1) >> 1`, only valid on occupied squares. Stock slots per owner
are kittens in pool, cats in pool, retired kittens. Retired kittens are not the
same as cats in pool and must be preserved for eighth-piece eligibility.

Never mutate input boards/stock or graduation option lists. A successful
transition owns new board/stock arrays; option lists can share immutable storage.
Terminal win detection is before graduation on placement, mover first. Pending
choices keep `turn` equal to the mover, even if `pending` is the opponent. Graduation
choices do not decrement search depth. Option index order is decision-affecting.

Commands from `client/`: `npm run test:bot:compact`, `npm run bench:bot:compact`.
Use the registered background runner for long checks. Do not regenerate frozen
v4 fixtures to make a parity failure pass.
