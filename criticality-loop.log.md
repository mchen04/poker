# Criticality Loop — main (2026-06-08)

base: initial greenfield repo  •  aggressiveness: aggressive  •  test: `npm run typecheck && npm test && npm run stress && npm run build`  •  converge: 2

Estimated loop cost: fresh-context audits plus main-session fixes, roughly $10-$40 for a typical 4-8 cycle aggressive run.

| # | verdict | findings (C/I/O) | commits | LOC delta | tests | notes |
|---|---|---:|---:|---:|---|---|
| 0 | BASELINE | 0/0/0 | 1 | 0 | pass | typecheck, unit tests, 1000-hand stress, build passed before audit loop |
| 1 | BLOCK | 3/6/1 | 1 | +86 | pass | added Zod socket validation, active-hand guards, settings sanitization, private settings cleanup, ledger fix, typed client emitters, room.ts 996 lines |
| 2 | BLOCK | 4/5/0 | 1 | -5 | pass | fixed locked-room token validation, banned-player command guards, active-hand seat locks, strict chip deferral, final cash-out, health privacy, removed unsupported contract surface, extracted chip ledger |
| 3 | BLOCK | 0/4/0 | 1 | +0 | pass | fixed bomb-pot blind residue, PLO pot-limit caps, kicked-session invalidation, host ownership guards, extracted host controls, room.ts 947 lines |
| 4 | BLOCK | 1/3/0 | 1 | +5 | pass | fixed participant-only 7-2 bounty, socket-aware kick/ban disconnect, narrowed docs, and shuffle reveal preimage verification |
| 5 | BLOCK | 0/1/0 | 1 | +5 | pass | excluded disconnected seated players from new hands and connected bot/test sessions explicitly |
| 6 | BLOCK | 1/4/0 | 1 | +54 | pass | fixed active public deck leak, all-in min-raise, CSPRNG room codes, join attempt limiting, spectator chip edits, and disconnected host transfer |
| 7 | BLOCK | 0/4/0 | 1 | +112 | pass | fixed short all-in no-reopen, disconnect timeout fold/check, kicked join capacity, and explicit public hand projection |
| 8 | BLOCK | 0/2/0 | 1 | +22 | pass | fixed non-current disconnect turn preservation and create-room throttling/room cap cleanup |
| 9 | BLOCK | 0/2/0 | 1 | +21 | pass | fixed disconnected turn rotation timeout and emptySince-based idle room cleanup |
| 10 | BLOCK | 1/2/0 | 1 | +108 | pass | made ended sessions read-only/idempotent, restricted player-driven custom queues, and preserved forced sit-out across reconnect |
| 11 | BLOCK | 0/2/0 | 1 | +49 | pass | skipped ended-room disconnect writes and centralized connected seated-with-chips eligibility |
| 12 | BLOCK | 0/1/0 | 1 | +17 | pass | applied connected seated-with-chips eligibility to creator-only custom queues |
| 13 | BLOCK | 0/3/0 | 1 | +58 | pass | added no-showdown 7-2 bounty, force-sit-out restore UI state, and ready-gated hand starts |
| 14 | BLOCK | 0/1/1 | 1 | +7 | pass | gated host-transfer actors and pruned unsupported public contract states |
| 15 | BLOCK | 0/2/0 | 1 | +20 | pass | made ended socket bookkeeping immutable and normalized raise payloads to target totals |
| 16 | BLOCK | 0/1/1 | 1 | +0 | pass | renamed custom queue permission to cooldown semantics and updated ready-start docs |
| 17 | BLOCK | 0/2/0 | 1 | +17 | pass | fixed live straddle min-raise and PLO all-in target-cap validation |
