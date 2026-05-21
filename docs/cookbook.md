# Usage cookbook

## Payments
- Require key.
- Scope: `POST:/payments:{merchant}:{idempotencyKey}`.
- Fingerprint includes amount, currency, orderId.

## Orders
- Require key for checkout/confirm.
- Optional for draft updates.
- Replay 201 with created order payload.

## Callbacks
- Scope by provider event id + endpoint route.
- Strategy `wait` or `accepted` for burst retries.
- Ensure side effects are inside `execute` branch only.

## Rollout
1. Optional mode: observe metrics/logs only.
2. Soft enforce: require key for payments and callbacks.
3. Hard enforce: expand to all write endpoints.
