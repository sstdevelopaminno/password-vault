import { z } from "zod";

export const ADMIN_QR_ACTION = "admin_qr_login_v1";

const qrPayloadSchema = z.object({
  v: z.coerce.number().int().positive(),
  action: z.literal(ADMIN_QR_ACTION),
  challengeId: z.string().uuid(),
  challengeToken: z.string().min(20),
  nonce: z.string().min(8),
  expiresAt: z.string().datetime({ offset: true }),
  origin: z.string().url(),
});

export type AdminQrPayload = z.infer<typeof qrPayloadSchema>;

export function parseAdminQrPayload(raw: string) {
  try {
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = qrPayloadSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { ok: false as const, error: "Invalid QR payload format" };
    }
    return { ok: true as const, payload: parsed.data };
  } catch {
    return { ok: false as const, error: "QR payload is not valid JSON" };
  }
}

export function isAdminQrPayloadExpired(payload: AdminQrPayload) {
  return Date.parse(payload.expiresAt) <= Date.now();
}

const inlinePayloadSchema = z.object({
  challengeId: z.string().uuid(),
  challengeToken: z.string().min(20),
  nonce: z.string().min(8),
  expiresAt: z.string().datetime({ offset: true }),
  origin: z.string().url(),
});

export function parseAdminQrInlinePayload(input: unknown) {
  const parsed = inlinePayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid challenge payload" };
  }

  return {
    ok: true as const,
    payload: {
      ...parsed.data,
      action: ADMIN_QR_ACTION,
      v: 1,
    } satisfies AdminQrPayload,
  };
}

