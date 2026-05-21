# Deploy and Publish Guide

## 1) Pre-release checks

```bash
pnpm install
pnpm build
pnpm test
```

## 2) NPM authentication

- Create an npm automation token.
- Add it to GitHub repo secrets as `NPM_TOKEN`.

## 3) Release trigger

- Tag and push release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

- This triggers `.github/workflows/release.yml`.

## 4) Published packages

- `@bounkhong/idempotency-core`
- `@bounkhong/idempotency-adapter-memory`
- `@bounkhong/idempotency-adapter-sql`
- `@bounkhong/idempotency-adapter-redis`
- `@bounkhong/idempotency-nestjs`

## 5) Runtime deployment in services

- Use Redis or SQL adapters for multi-instance production.
- Start rollout with critical routes (`/payments`, callbacks).
- Monitor idempotency metrics/logs before hard enforce.
