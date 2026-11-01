// GET /api/mailbox/owner/status — the owner's view of the mailbox
// link (owner key in the x-owner-key header): whether the companion
// has exchanged, whether a session is armed, and the last event.
import { NextResponse } from "next/server";
import { mailboxErrorResponse, ownerMailboxStatus } from "@/lib/mailbox";


export async function GET(request: Request) {
  try {
    const result = await ownerMailboxStatus(request.headers.get("x-owner-key"));
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
