import { z } from "zod";
import { validateOpenCliProfile } from "./registry.ts";

const platform = z.enum(["youtube", "tiktok", "instagram", "twitter"]);
export const cloudSessionReceipt = z.strictObject({ platform, cleared: z.literal(true), cookies_removed: z.number().int().nonnegative(), origins_cleared: z.number().int().positive() });
export function disconnectCloudSessionArguments(profile: string, selected: string): string[] {
  validateOpenCliProfile(profile); platform.parse(selected);
  return ["--profile", profile, "onecrew-cloud-session", `disconnect-${selected}`, "-f", "json"];
}
