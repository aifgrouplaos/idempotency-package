import {
  CallHandler,
  ConflictException,
  DynamicModule,
  ExecutionContext,
  Inject,
  Injectable,
  Module,
  NestInterceptor,
  SetMetadata,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { from, lastValueFrom, type Observable } from "rxjs";
import {
  IdempotencyConflictError,
  IdempotencyKeyRequiredError,
  IdempotencyService,
  defaultFingerprintBuilder,
  type IdempotencyPolicy,
  type IdempotencyStore
} from "@bounkhong/idempotency-core";

const TOKEN_STORE = "IDEMPOTENCY_STORE";
const TOKEN_POLICIES = "IDEMPOTENCY_POLICIES";
const TOKEN_SERVICE = "IDEMPOTENCY_SERVICE";
const META_POLICY = "idempotency:policy";

export const UseIdempotency = (policyName = "default") => SetMetadata(META_POLICY, policyName);

export interface IdempotencyModuleOptions {
  store: IdempotencyStore;
  policies: Record<string, IdempotencyPolicy>;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly service: IdempotencyService,
    @Inject(TOKEN_POLICIES) private readonly policies: Record<string, IdempotencyPolicy>,
    private readonly reflector: Reflector
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.run(context, next));
  }

  private async run(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const policyName = this.reflector.getAllAndOverride<string>(META_POLICY, [context.getHandler(), context.getClass()]) ?? "default";
    const policy = this.policies[policyName];
    if (!policy) {
      throw new ConflictException(`Unknown idempotency policy: ${policyName}`);
    }

    let handled;
    try {
      handled = await this.service.handle(
        {
          method: req.method,
          route: req.route?.path ?? req.path,
          actor: req.user?.id ?? req.headers["x-actor"],
          payload: req.body,
          idempotencyKey: req.headers["idempotency-key"]
        },
        policy
      );
    } catch (err) {
      if (err instanceof IdempotencyKeyRequiredError) {
        throw new UnauthorizedException(err.message);
      }
      if (err instanceof IdempotencyConflictError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    if (handled.action === "replay" || handled.action === "reject" || handled.action === "accepted") {
      res.status(handled.statusCode ?? 200);
      for (const [k, v] of Object.entries(handled.headers ?? {})) {
        if (["content-type", "cache-control", "etag", "location"].includes(k.toLowerCase())) {
          res.setHeader(k, v);
        }
      }
      return handled.body;
    }

    try {
      const value = await lastValueFrom(next.handle());
      await this.service.complete(handled.scopeKey, {
        statusCode: res.statusCode,
        headers: {},
        body: value,
        completedAt: new Date().toISOString()
      });
      return value;
    } catch (error: any) {
      await this.service.fail(handled.scopeKey, {
        statusCode: error?.status ?? 500,
        code: error?.code,
        message: error?.message ?? "Request failed",
        failedAt: new Date().toISOString()
      });
      throw error;
    }
  }
}

@Module({})
export class IdempotencyModule {
  static forRoot(options: IdempotencyModuleOptions): DynamicModule {
    return {
      module: IdempotencyModule,
      providers: [
        { provide: TOKEN_STORE, useValue: options.store },
        { provide: TOKEN_POLICIES, useValue: options.policies },
        { provide: TOKEN_SERVICE, useFactory: (store: IdempotencyStore) => new IdempotencyService(store), inject: [TOKEN_STORE] },
        IdempotencyInterceptor,
        Reflector
      ],
      exports: [IdempotencyInterceptor, TOKEN_SERVICE, TOKEN_POLICIES, TOKEN_STORE]
    };
  }
}

export const createDefaultPolicy = (ttlSeconds = 300): IdempotencyPolicy => ({
  requireKey: true,
  ttlSeconds,
  inProgressStrategy: "wait",
  scopeBuilder: (i) => `${i.method}:${i.route}:${i.actor ?? "anon"}:${i.idempotencyKey}`,
  fingerprintBuilder: (i) => defaultFingerprintBuilder(i.payload)
});
