import { randomUUID } from "node:crypto";
import { z } from "zod";

const principalOwner = {
  tenantId: z.string().min(1),
  baseId: z.string().min(1),
  deviceId: z.string().min(1),
};
const principalSchema = z.discriminatedUnion("source", [
  z.strictObject({ ...principalOwner, user: z.strictObject({ id: z.string().min(1), email: z.email() }), source: z.enum(["access", "migration"]) }),
  z.strictObject({ ...principalOwner, shop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u), user: z.strictObject({ id: z.string().min(1), email: z.never().optional() }), source: z.literal("shopify") }),
]);

export type VerifiedPrincipal = z.infer<typeof principalSchema>;
type FrozenPrincipal<P extends VerifiedPrincipal> = P extends VerifiedPrincipal ? Readonly<Omit<P, "user"> & { user: Readonly<P["user"]> }> : never;
export interface AccountContext<P extends VerifiedPrincipal = VerifiedPrincipal> {
  readonly principal: FrozenPrincipal<P>;
  readonly epoch: string;
  readonly signal: AbortSignal;
}

export function accessUser(context: AccountContext): Readonly<{ id: string; email: string }> {
  const principal = context.principal;
  if (principal.source === "shopify") throw new Error("access.user_required");
  return principal.user;
}

export class AccountChangedError extends Error {
  readonly code = "access.account_changed";
  readonly status = 409;
  constructor() {
    super("The selected OneCrew account changed; reload the page.");
  }
}

// 调用方先验证 Access 凭据或 Shopify 店铺安装，再激活对应的数据归属。
export class AccountContextService {
  #current: AccountContext | undefined;
  #controller: AbortController | undefined;
  #issued = new WeakSet<AccountContext>();

  activate<P extends VerifiedPrincipal>(verified: P): AccountContext<P> {
    const parsed = principalSchema.parse(verified);
    const principal = Object.freeze({ ...parsed, user: Object.freeze(parsed.user) }) as FrozenPrincipal<P>;
    this.#controller?.abort(new AccountChangedError());
    const controller = new AbortController();
    const context: AccountContext<P> = Object.freeze({ principal, epoch: randomUUID(), signal: controller.signal });
    this.#controller = controller;
    this.#current = context;
    this.#issued.add(context);
    return context;
  }

  logout(): void {
    this.#controller?.abort(new AccountChangedError());
    this.#controller = undefined;
    this.#current = undefined;
  }

  current(): AccountContext {
    if (!this.#current) throw new Error("A verified user principal is required");
    return this.#current;
  }

  currentIfActive(): AccountContext | undefined {
    return this.#current;
  }

  assertCurrent(context: AccountContext): void {
    if (!this.#issued.has(context) || context !== this.#current || context.signal.aborted) {
      throw new AccountChangedError();
    }
  }

  forSession(accountId: string, epoch: string): AccountContext {
    const context = this.#current;
    if (!context) throw new AccountChangedError();
    if (context.principal.user.id !== accountId || context.epoch !== epoch) throw new AccountChangedError();
    return context;
  }

  // 发送前冻结归属；已开始发送的回执仍写入原账号，不受页面切换取消信号影响。
  receiptOwner(context: AccountContext): Readonly<{ accountId: string; tenantId: string; epoch: string }> {
    this.assertCurrent(context);
    return Object.freeze({
      accountId: context.principal.user.id,
      tenantId: context.principal.tenantId,
      epoch: context.epoch,
    });
  }
}
