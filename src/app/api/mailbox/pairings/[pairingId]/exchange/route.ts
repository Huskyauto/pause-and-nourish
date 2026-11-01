// POST /api/mailbox/pairings/<pairingId>/exchange — the companion
// presents secret + code and receives its credential, once (spec
// §5.3). Single-consume and atomic, by the protocol module.
import { NextResponse } from "next/server";
import { exchangeRegisteredPairing, mailboxErrorResponse } from "@/lib/mailbox";


export async function POST(
  request: Request,
  { params }: { params: Promise<{ pairingId: string }> },
) {
  try {
    const { pairingId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await exchangeRegisteredPairing(pairingId, {
      secret: body?.secret,
      code: body?.code,
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
