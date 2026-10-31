// TEMPORARY Day 5 diagnostic: returns Meta's GET /v1/models JSON
// verbatim (model IDs only — no key material) so the assumed constants
// in src/lib/meta.ts can be corrected against the live key. DELETE
// once the fix lands.

import { metaApiKey, metaModelsRaw, MetaApiError } from "@/lib/meta";

export async function GET() {
  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }
  try {
    const data = await metaModelsRaw();
    return Response.json(data);
  } catch (err) {
    if (err instanceof MetaApiError) {
      return Response.json(
        { error: err.message, detail: err.detail },
        { status: err.status },
      );
    }
    return Response.json({ error: "models_failed" }, { status: 502 });
  }
}
