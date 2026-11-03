// POST /api/mailbox/owner/revoke — the owner wipes the SERVER
// mailbox (credential, session, feed, pending pairing, owner
// binding). Owner key in the JSON body, like approve/deny. Added
// 2026-11-02: before this route existed, the companion page's
// Revoke button cleared only the browser's local copies and the
// server kept a live credential.
import { NextResponse } from "next/server";
import { mailboxErrorResponse, revokeMailbox } from "@/lib/mailbox";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { ownerKey?: unknown } | null;
    const result = await revokeMailbox(body?.ownerKey);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
