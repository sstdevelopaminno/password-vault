export type PackageSlipOrderSnapshot = {
  id: string;
  planId: string;
  cycle: "monthly" | "yearly";
  uniqueAmountThb: number;
  promptpayTarget: string;
};

export type PackageSlipSubmission = {
  slipImageUrl: string | null;
  rawPayload: unknown;
  reference: string | null;
  amountThb: number | null;
  receiverAccount: string | null;
  payerAccount: string | null;
  payerName: string | null;
  transferredAt: string | null;
};

export type PackageSlipProviderResult = {
  providerName: string;
  ok: boolean;
  reference: string | null;
  amountThb: number | null;
  receiverAccount: string | null;
  payerAccount: string | null;
  payerName: string | null;
  transferredAt: string | null;
  note: string | null;
  rawPayload: unknown;
};

function toStringOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type ExternalAdapterResponse = {
  ok?: boolean;
  reference?: unknown;
  amountThb?: unknown;
  receiverAccount?: unknown;
  payerAccount?: unknown;
  payerName?: unknown;
  transferredAt?: unknown;
  note?: unknown;
  rawPayload?: unknown;
};

async function verifyWithExternalAdapter(input: {
  order: PackageSlipOrderSnapshot;
  submission: PackageSlipSubmission;
}) {
  const endpoint = String(process.env.PAYMENT_SLIP_VERIFY_ENDPOINT ?? "").trim();
  if (!endpoint) return null;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const bearer = String(process.env.PAYMENT_SLIP_VERIFY_BEARER ?? "").trim();
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        order: input.order,
        submission: input.submission,
      }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") return null;
    return data as ExternalAdapterResponse;
  } catch {
    return null;
  }
}

function normalizeManualResult(input: { submission: PackageSlipSubmission }): PackageSlipProviderResult {
  return {
    providerName: "manual",
    ok: true,
    reference: toStringOrNull(input.submission.reference),
    amountThb: toNumberOrNull(input.submission.amountThb),
    receiverAccount: toStringOrNull(input.submission.receiverAccount),
    payerAccount: toStringOrNull(input.submission.payerAccount),
    payerName: toStringOrNull(input.submission.payerName),
    transferredAt: toStringOrNull(input.submission.transferredAt),
    note: null,
    rawPayload: input.submission.rawPayload ?? {},
  };
}

function normalizeExternalResult(input: {
  response: ExternalAdapterResponse;
  fallbackProviderName: string;
}): PackageSlipProviderResult {
  return {
    providerName: input.fallbackProviderName,
    ok: input.response.ok !== false,
    reference: toStringOrNull(input.response.reference),
    amountThb: toNumberOrNull(input.response.amountThb),
    receiverAccount: toStringOrNull(input.response.receiverAccount),
    payerAccount: toStringOrNull(input.response.payerAccount),
    payerName: toStringOrNull(input.response.payerName),
    transferredAt: toStringOrNull(input.response.transferredAt),
    note: toStringOrNull(input.response.note),
    rawPayload: input.response.rawPayload ?? input.response,
  };
}

export async function verifyPackageSlipWithProvider(input: {
  provider: string;
  order: PackageSlipOrderSnapshot;
  submission: PackageSlipSubmission;
}): Promise<PackageSlipProviderResult> {
  const providerName = String(input.provider || "manual").trim().slice(0, 40) || "manual";
  const external = await verifyWithExternalAdapter({
    order: input.order,
    submission: input.submission,
  });

  if (external) {
    return normalizeExternalResult({
      response: external,
      fallbackProviderName: providerName,
    });
  }

  return normalizeManualResult({
    submission: input.submission,
  });
}

