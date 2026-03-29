import { NextResponse } from "next/server";
import { verifyPinAssertionToken, type PinAction } from "@/lib/pin";

export function requirePinAssertion(input: {
  request: Request;
  userId: string;
  action: PinAction;
  targetItemId?: string;
}) {
  const token = input.request.headers.get("x-pin-assertion");
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "PIN verification required" }, { status: 403 }),
    };
  }

  const ok = verifyPinAssertionToken(token, {
    userId: input.userId,
    action: input.action,
    targetItemId: input.targetItemId,
  });

  if (!ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid PIN assertion" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}
