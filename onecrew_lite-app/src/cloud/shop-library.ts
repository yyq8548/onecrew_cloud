import { lstatSync } from "node:fs";
import { join } from "node:path";
import { createEmbeddedTables } from "onecrew_lite_tables/embedded";
import type { InstanceLease } from "../service/instance-lock.ts";
import { createPrivateDirectory, verifyPrivateDirectory } from "../storage/private-backup.ts";
import { createDiscoveryLibraryProjection } from "../sync/discovery-library.ts";
import { ShopDataService, type ShopData } from "./shop-data.ts";
import { accessUser } from "../identity/account-context.ts";

type Tables = Awaited<ReturnType<typeof createEmbeddedTables>>;
type Tenant = Awaited<ReturnType<Tables["tenants"]["resolveShop"]> | ReturnType<Tables["tenants"]["resolve"]>>;

export async function openCloudLibrary(lease: InstanceLease, origin: string) {
  lease.assertOwned();
  const path = join(lease.directory, "library");
  if (lstatSync(path, { throwIfNoEntry: false })) await verifyPrivateDirectory(path);
  else await createPrivateDirectory(path);
  const tables = await createEmbeddedTables(path, origin);
  return tables;
}

// 一个进程拥有共享 PGlite；表格服务继续使用原有 tenant/base 隔离。
export class ShopLibraryService {
  readonly #tables: Tables;
  readonly #data: ShopDataService;
  readonly #origin: string;

  constructor(tables: Tables, data: ShopDataService, origin: string) {
    this.#tables = tables;
    this.#data = data;
    this.#origin = origin;
  }

  async #read<T>(shop: string, read: (tenant: Tenant, data: ShopData) => Promise<T>): Promise<T> {
    const data = await this.#data.resolve(shop);
    const principal = data.runtime.context.principal;
    const tenant = principal.source === "shopify" ? await this.#tables.tenants.resolveShop(shop) : await this.#tables.tenants.resolve(accessUser(data.runtime.context));
    data.assertCurrent();
    if (principal.source === "shopify" ? tenant.user.id !== `shopify:${shop}` : tenant.user.id !== principal.user.id || tenant.tenantId !== principal.tenantId || tenant.baseId !== principal.baseId) throw new Error("cloud.library_owner_changed");
    const result = await read(tenant, data);
    data.assertCurrent();
    return result;
  }

  list(shop: string, page: number, size: number) {
    return this.#read(shop, tenant => this.#tables.service.listTables(tenant, { page, size }));
  }

  table(shop: string, id: string) { return this.#read(shop, tenant => this.#tables.service.getTable(tenant, id)); }
  creators(shop: string, id: string) { return this.#read(shop, tenant => this.#tables.service.getDiscoveryCreatorView(tenant, id)); }
  campaignResults(shop: string, id: string) {
    return this.#read(shop, async tenant => {
      const table = await this.#tables.data.getDiscoveryCampaignTable(tenant, id);
      return { table, creators: table ? await this.#tables.service.getDiscoveryCreatorView(tenant, table.id) : null };
    });
  }
  removeShop(shop: string) { return this.#tables.data.removeShop(shop); }

  projection(data: ShopData) {
    data.assertCurrent();
    return createDiscoveryLibraryProjection(data.runtime.accounts, data.databases, this.#tables, this.#origin);
  }
}
