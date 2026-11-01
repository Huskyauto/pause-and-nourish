// POST /api/mailbox/pairings/<pairingId>/approve — the owner's
// approval, posted by the PWA with its owner key (spec §5.1). The
// approval flag is written by the protocol's approvePairing and by
// nothing else.
import { NextResponse } from "next/server";
import { approveRegisteredPairing, mailboxErrorResponse } from "@/lib/mailbox";


export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await approveRegisteredPairing(body?.ownerKey);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
