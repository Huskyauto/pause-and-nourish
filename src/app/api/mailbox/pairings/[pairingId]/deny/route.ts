// POST /api/mailbox/pairings/<pairingId>/deny — the owner abandons
// the waiting pairing (owner key required, like approval).
import { NextResponse } from "next/server";
import { denyRegisteredPairing, mailboxErrorResponse } from "@/lib/mailbox";


export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await denyRegisteredPairing(body?.ownerKey);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
