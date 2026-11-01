// /api/mailbox/events — the bridge feed (spec §5.4).
// POST: the companion sends one event (Bearer, event:push) → 202.
// GET: the companion reads the feed after a cursor (Bearer,
// status:read). session.armed / session.stopped / cue.requested
// reach the companion here; cue.played reaches the owner here.
import { NextResponse } from "next/server";
import {
  mailboxErrorResponse,
  pushCompanionEvent,
  readCompanionEvents,
} from "@/lib/mailbox";


export async function POST(request: Request) {
  try {
    const event = await request.json().catch(() => null);
    const result = await pushCompanionEvent(request.headers.get("authorization"), event);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: Request) {
  try {
    const after = new URL(request.url).searchParams.get("after");
    const result = await readCompanionEvents(request.headers.get("authorization"), after);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
