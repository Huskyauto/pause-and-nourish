// GET /api/mailbox/pairings/<pairingId>?secret=… — the companion polls
// for owner approval (spec §5.2). The secret in the query proves the
// caller holds the pairing payload.
import { NextResponse } from "next/server";
import { mailboxErrorResponse, pollPairing } from "@/lib/mailbox";


export async function GET(
  request: Request,
  { params }: { params: Promise<{ pairingId: string }> },
) {
  try {
    const { pairingId } = await params;
    const secret = new URL(request.url).searchParams.get("secret");
    const result = await pollPairing(pairingId, secret);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
