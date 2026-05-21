# Nest Orders/Payments Demo

## Run

Create `.env` in this folder:

```env
REDIS_HOST=10.69.200.39
REDIS_PORT=30007
REDIS_DB=8
PORT=3001
```

```bash
pnpm install
pnpm --filter nest-orders-payments-demo dev
```

## Test with curl

```bash
# 1) First request: execute
curl -i -X POST http://localhost:3001/payments \
  -H "content-type: application/json" \
  -H "idempotency-key: pay-001" \
  -d '{"orderId":"o-1001","amount":100,"currency":"USD"}'
```

```bash
# 2) Same key + same payload: replay
curl -i -X POST http://localhost:3001/payments \
  -H "content-type: application/json" \
  -H "idempotency-key: pay-001" \
  -d '{"orderId":"o-1001","amount":100,"currency":"USD"}'
```

```bash
# 3) Same key + different payload: conflict
curl -i -X POST http://localhost:3001/payments \
  -H "content-type: application/json" \
  -H "idempotency-key: pay-001" \
  -d '{"orderId":"o-1001","amount":999,"currency":"USD"}'
```

```bash
# 4) Missing key: unauthorized (requireKey=true)
curl -i -X POST http://localhost:3001/payments \
  -H "content-type: application/json" \
  -d '{"orderId":"o-1001","amount":100,"currency":"USD"}'
```

## Expected behavior

- same key + same payload => same response replayed
- same key + different payload => `409 Conflict`
- no key on protected route => `401 Unauthorized`
