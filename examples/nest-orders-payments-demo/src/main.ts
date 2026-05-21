import "reflect-metadata";
import "dotenv/config";
import { Controller, Module, Post, Body, UseInterceptors } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Redis } from "ioredis";
import { RedisIdempotencyStore } from "@aif/idempotency-adapter-redis";
import { IdempotencyModule, IdempotencyInterceptor, UseIdempotency, createDefaultPolicy } from "@aif/idempotency-nestjs";

const redis = new Redis({
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  db: Number(process.env.REDIS_DB ?? 0),
  maxRetriesPerRequest: 1,
  enableReadyCheck: true
});

redis.on("error", (err) => {
  console.error("[idempotency-demo] Redis connection error:", err.message);
});

const redisLike = {
  async set(key: string, value: string, opts: { NX?: boolean; EX?: number }) {
    if (opts.NX && opts.EX) {
      const res = await redis.set(key, value, "EX", opts.EX, "NX");
      return res as "OK" | null;
    }
    if (opts.EX) {
      const res = await redis.set(key, value, "EX", opts.EX);
      return res as "OK" | null;
    }
    const res = await redis.set(key, value);
    return res as "OK" | null;
  },
  get(key: string) {
    return redis.get(key);
  },
  expire(key: string, seconds: number) {
    return redis.expire(key, seconds);
  }
};

@Controller()
@UseInterceptors(IdempotencyInterceptor)
class DemoController {
  @Post("/orders")
  @UseIdempotency("orders")
  createOrder(@Body() body: any) {
    return { id: `ord_${Date.now()}`, ...body };
  }

  @Post("/payments")
  @UseIdempotency("payments")
  createPayment(@Body() body: any) {
    return { id: `pay_${Date.now()}`, status: "captured", ...body };
  }
}

@Module({
  imports: [
    IdempotencyModule.forRoot({
      store: new RedisIdempotencyStore(redisLike),
      policies: {
        default: createDefaultPolicy(300),
        orders: createDefaultPolicy(600),
        payments: createDefaultPolicy(900)
      }
    })
  ],
  controllers: [DemoController]
})
class AppModule {}

const bootstrap = async () => {
  const redisHost = process.env.REDIS_HOST ?? "127.0.0.1";
  const redisPort = Number(process.env.REDIS_PORT ?? 6379);
  const redisDb = Number(process.env.REDIS_DB ?? 0);
  console.log(`[idempotency-demo] Redis target ${redisHost}:${redisPort} db=${redisDb}`);
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
};

void bootstrap();
