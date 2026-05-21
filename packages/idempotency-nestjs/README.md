# @bounkhong/idempotency-nestjs

NestJS integration for AIF idempotency: module setup, route decorator, and interceptor.

## Install

```bash
pnpm add @bounkhong/idempotency-nestjs @bounkhong/idempotency-core
pnpm add @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs
```

## Setup

```ts
import { Module, UseInterceptors } from "@nestjs/common";
import { MemoryIdempotencyStore } from "@bounkhong/idempotency-adapter-memory";
import {
  IdempotencyModule,
  IdempotencyInterceptor,
  UseIdempotency,
  createDefaultPolicy
} from "@bounkhong/idempotency-nestjs";

@Module({
  imports: [
    IdempotencyModule.forRoot({
      store: new MemoryIdempotencyStore(),
      policies: {
        default: createDefaultPolicy(300),
        payments: createDefaultPolicy(900)
      }
    })
  ]
})
export class AppModule {}
```

## Route usage

```ts
import { Controller, Post, Body, UseInterceptors } from "@nestjs/common";
import { IdempotencyInterceptor, UseIdempotency } from "@bounkhong/idempotency-nestjs";

@Controller()
@UseInterceptors(IdempotencyInterceptor)
class PaymentsController {
  @Post("/payments")
  @UseIdempotency("payments")
  createPayment(@Body() body: any) {
    return { id: `pay_${Date.now()}`, status: "captured", ...body };
  }
}
```

## Header contract

- Reads `Idempotency-Key` from request headers
- Replays previously completed response for identical key+payload
- Returns `409` for same key with different payload
