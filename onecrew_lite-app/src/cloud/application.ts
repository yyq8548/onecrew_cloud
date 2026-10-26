import { ShopifyUninstallProcessor } from "../shopify/uninstall-processor.ts";
import type { ShopifyConfiguration } from "../shopify/client.ts";
import { listenCloudHttp } from "./http.ts";
import { openCloudStorage } from "./storage.ts";
import { ShopRuntimeRegistry } from "./shop-runtime-registry.ts";
import { ShopBrowserManager, type ShopBrowserConfiguration } from "./shop-browser-manager.ts";
import { ShopDataService } from "./shop-data.ts";
import { openCloudLibrary, ShopLibraryService } from "./shop-library.ts";
import { CloudCampaignService } from "./campaign-service.ts";
import { ServerSemanticClient, type ServerSemanticConfiguration } from "../discovery/server-semantic-client.ts";
import { ShopifyPrivacyService } from "../shopify/privacy-service.ts";

interface CloudApplicationOptions {
  readonly directory: string;
  readonly port: number;
  readonly shopify: ShopifyConfiguration;
  readonly reportFailure: (failure: { requestId: string; code: string; errorClass: string }) => void;
  readonly onUninstallFailure: (error: unknown) => void;
  readonly onBackgroundFailure: (error: unknown) => void;
  readonly browsers?: ShopBrowserConfiguration;
  readonly webDirectory?: string;
  readonly model?: ServerSemanticConfiguration;
}

export async function startCloudApplication(options: CloudApplicationOptions) {
  await using opening = new AsyncDisposableStack();
  const storage = await openCloudStorage(options.directory);
  opening.defer(() => storage.close());
  storage.campaignJobs.recover();
  const browsers = options.browsers ? new ShopBrowserManager(options.browsers, storage.installations, storage.browserSnapshots) : undefined;
  if (browsers) { opening.defer(() => browsers.close()); await browsers.recover(); }
  const tables = await openCloudLibrary(storage.lease, options.shopify.applicationUrl);
  opening.defer(() => tables.close());
  const runtimes = new ShopRuntimeRegistry();
  opening.defer(() => runtimes.close());
  const data = new ShopDataService(storage.lease, storage.installations, runtimes);
  const library = new ShopLibraryService(tables, data, options.shopify.applicationUrl);
  const campaigns = options.model && browsers ? new CloudCampaignService({ data, installations: storage.installations, jobs: storage.campaignJobs, templates: storage.campaignTemplates, browsers, library, model: new ServerSemanticClient(options.model), reportFailure: options.reportFailure, onFatal: options.onBackgroundFailure }) : undefined;
  const privacy = new ShopifyPrivacyService({ installations: storage.installations, data, library, jobs: storage.campaignJobs, templates: storage.campaignTemplates, snapshots: storage.browserSnapshots, ...(browsers ? { browsers } : {}) });
  const uninstalls = new ShopifyUninstallProcessor(storage.installations, runtimes, options.onUninstallFailure, browsers, privacy);
  opening.defer(() => uninstalls.close());
  await uninstalls.recover();
  const http = await listenCloudHttp({ shopify: options.shopify, installations: storage.installations, uninstalls, data, library, campaignJobs: storage.campaignJobs, ...(campaigns ? { campaigns } : {}), ...(browsers ? { browsers } : {}), ...(options.webDirectory ? { webDirectory: options.webDirectory } : {}), reportFailure: options.reportFailure }, options.port);
  opening.defer(() => http.close());
  const ownership = opening.move();
  let closing: Promise<void> | undefined;
  return { origin: http.origin, runtimes, close: () => { browsers?.stopAcceptingWork(); return closing ??= ownership.disposeAsync(); } };
}
