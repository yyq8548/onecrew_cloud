import type { DiscoveryDependencyResolver } from "../discovery/dependencies.ts";
import type { SemanticStructuredClient } from "../discovery/semantic-client.ts";
import type { AccountContext } from "../identity/account-context.ts";
import type { ShopifyWorkspace } from "../shopify/installation-store.ts";
import { CloudDiscoveryReader } from "./discovery-reader.ts";
import type { ShopBrowserManager } from "./shop-browser-manager.ts";
import type { ShopData } from "./shop-data.ts";

export function createCloudDiscoveryDependencies(data: ShopData, workspace: ShopifyWorkspace, browsers: ShopBrowserManager, model: SemanticStructuredClient): DiscoveryDependencyResolver {
  const reader = new CloudDiscoveryReader({ data, workspace, browsers });
  const shutdown = new AbortController();
  const assertCurrent = (context: AccountContext) => { data.runtime.accounts.assertCurrent(context); data.assertCurrent(); shutdown.signal.throwIfAborted(); };
  const semantic: SemanticStructuredClient = {
    async structured(input) {
      assertCurrent(data.runtime.context);
      return model.structured({ ...input, signal: AbortSignal.any([input.signal, data.runtime.context.signal, shutdown.signal]), async assertCurrent() { assertCurrent(data.runtime.context); await input.assertCurrent(); } });
    },
    ...(model.scoringIdentity ? { scoringIdentity: () => { assertCurrent(data.runtime.context); return model.scoringIdentity!(); } } : {}),
  };
  return Object.freeze({
    async reads(context: AccountContext) {
      assertCurrent(context);
      return { reader, browsers: { async resolve(owner: AccountContext, profile: string) { assertCurrent(owner); return reader.binding(owner, profile); } } };
    },
    async semantic(context: AccountContext) { assertCurrent(context); return semantic; },
    stopSemantic() { shutdown.abort(new Error("discovery_semantic_stopping")); },
  });
}
