import { z } from "zod";
import { parseApplicationJson } from "../contracts/application-json.ts";
import { shopDomainSchema } from "../cloud/shop-runtime-registry.ts";
import { CloudHttpError } from "../cloud/http-error.ts";

const resourceId = z.union([z.number().int().positive().refine(Number.isSafeInteger), z.bigint().positive(), z.string().regex(/^[1-9]\d*$/u)]).transform(String);
const customer = z.object({ id: resourceId.optional(), email: z.string().min(1).nullable().optional(), phone: z.string().min(1).nullable().optional() }).refine(value => value.id || value.email || value.phone);
const shop = z.object({ shop_id: resourceId, shop_domain: shopDomainSchema });
const dataRequest = shop.extend({ customer, orders_requested: z.array(resourceId).default([]), data_request: z.object({ id: resourceId }) });
const customerRedaction = shop.extend({ customer, orders_to_redact: z.array(resourceId).default([]) });

export function parseShopifyPrivacyBody(topic: string, domain: string, body: string | Uint8Array) {
  const value = parseApplicationJson(body);
  const parsed = topic === "CUSTOMERS_DATA_REQUEST" ? dataRequest.parse(value) : topic === "CUSTOMERS_REDACT" ? customerRedaction.parse(value) : shop.parse(value);
  if (parsed.shop_domain !== domain) throw new CloudHttpError("shopify.webhook_shop_mismatch", 422);
  return parsed;
}

export function parseCustomerDataRequest(domain: string, body: string | Uint8Array) {
  const parsed = dataRequest.parse(parseApplicationJson(body));
  if (parsed.shop_domain !== domain) throw new CloudHttpError("shopify.webhook_shop_mismatch", 422);
  return parsed;
}

export function parseCustomerRedaction(domain: string, body: string | Uint8Array) {
  const parsed = customerRedaction.parse(parseApplicationJson(body));
  if (parsed.shop_domain !== domain) throw new CloudHttpError("shopify.webhook_shop_mismatch", 422);
  return parsed;
}

export type ShopifyPrivacyCustomer = z.infer<typeof customer>;
