// POST /api/mailbox/pairings — the PWA registers a pairing it created
// locally (digests only) so the companion can find it (spec §5.1).
import { NextResponse } from "next/server";
import { mailboxErrorResponse, registerPairing } from "@/lib/mailbox";


export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const result = await registerPairing({
      pairingId: body.pairingId,
      secretDigest: body.secretDigest,
      codeDigest: body.codeDigest,
      requestedScopes: body.requestedScopes,
      expiresAt: body.expiresAt,
      ownerDigest: body.ownerDigest,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
