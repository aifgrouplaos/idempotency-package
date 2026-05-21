# Architecture decisions and tradeoffs

## Decisions
- Storage-agnostic core with `IdempotencyStore` interface to keep logic consistent across memory, SQL, Redis.
- Scope key policy and payload fingerprint are endpoint-configurable to support orders/payments/callbacks differences.
- State machine is explicit: `IN_PROGRESS`, `COMPLETED`, `FAILED`, `EXPIRED`.
- In-progress strategy is route policy: `wait`, `reject`, `accepted`.

## Tradeoffs
- `wait` improves client UX but can increase tail latency.
- `accepted` reduces lock contention but shifts reconciliation to polling/webhooks.
- SQL adapter favors universal SQL over ORM-specific optimizations.
- Redis adapter depends on TTL semantics; heartbeat is needed for long-running jobs.
