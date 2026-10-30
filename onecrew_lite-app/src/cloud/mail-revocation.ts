import { z } from "zod";
import { accessInstallationSchema, requestAccessInstallation } from "../identity/access-enrollment.ts";
import type { CloudMailRevocation } from "./mail-store.ts";
import { CloudHttpError } from "./http-error.ts";

const responseSchema = z.strictObject({ installation: accessInstallationSchema, replayed: z.boolean() });

export async function revokeCloudMailInstallation(request: CloudMailRevocation): Promise<void> {
  const result = await requestAccessInstallation(`/installations/${request.metadata.installation_id}/cloud-revoke`, {
    method: "POST", headers: { authorization: `Bearer ${request.bearer}`, "content-type": "application/json", "idempotency-key": request.idempotency, "cache-control": "no-store" },
    body: JSON.stringify({ expected_revision: request.metadata.revision }),
  });
  if (result.status !== 200 || !("body" in result)) {
    console.error(JSON.stringify({ event: "cloud.mail_revocation_incomplete", status: result.status }));
    throw new CloudHttpError("cloud.mail_revocation_incomplete", 503);
  }
  const parsed = responseSchema.safeParse(result.body);
  if (!parsed.success) throw new CloudHttpError("cloud.mail_revocation_response_invalid", 502);
  const installation = parsed.data.installation;
  for (const key of ["installation_id", "credential_id", "access_user_id", "access_device_id", "access_pairing_id", "source_instance_id"] as const) {
    if (installation[key] !== request.metadata[key]) throw new CloudHttpError("cloud.mail_revocation_identity_invalid", 502);
  }
  if (installation.status !== "revoked" || installation.revoked_at === null || installation.revision !== request.metadata.revision + 1) throw new CloudHttpError("cloud.mail_revocation_response_invalid", 502);
}
