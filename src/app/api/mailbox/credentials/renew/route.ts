// POST /api/mailbox/credentials/renew — rotate the token on the
// same credential identity (spec §5.5). Works on an expired
// credential; a revoked one cannot renew.
import { NextResponse } from "next/server";
import { mailboxErrorResponse, renewCompanionCredential } from "@/lib/mailbox";


export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await renewCompanionCredential(body?.rawToken);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = mailboxErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
