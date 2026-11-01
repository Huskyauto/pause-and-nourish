// GET /api/mailbox/status — the companion's pure status read (spec
// §5.4). Reading triggers nothing and refreshes nothing.
import { NextResponse } from "next/server";
import { companionMailboxStatus, mailboxErrorResponse } from "@/lib/mailbox";


export async function GET(request: Request) {
  try {
    const result = await companionMailboxStatus(request.headers.get("authorization"));
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
