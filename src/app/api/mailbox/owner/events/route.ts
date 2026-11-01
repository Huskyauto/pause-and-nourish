// /api/mailbox/owner/events — the owner's side of the feed.
// POST: arm / stop / request the cue (spec §5.6), owner key in the
// JSON body. GET: read the feed (owner key in the x-owner-key
// header) — this is what the PWA status card watches for
// cue.played.
import { NextResponse } from "next/server";
import { mailboxErrorResponse, postOwnerEvent, readOwnerEvents } from "@/lib/mailbox";


export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await postOwnerEvent(body?.ownerKey, {
      type: body?.type,
      payload: body?.payload,
      durationMs: body?.durationMs,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: Request) {
  try {
    const after = new URL(request.url).searchParams.get("after");
    const result = await readOwnerEvents(request.headers.get("x-owner-key"), after);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
