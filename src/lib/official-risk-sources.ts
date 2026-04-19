export type OfficialSourceSignal = {
  source: string;
  matched: boolean;
  severity: 'low' | 'medium' | 'high';
  note?: string;
  url?: string;
};

type OfficialApiResponse =
  | {
      data?: unknown;
      result?: unknown;
      matched?: boolean;
      blacklisted?: boolean;
      severity?: string;
      note?: string;
      reason?: string;
    }
  | Record<string, unknown>;

function parseConfiguredSources() {
  const raw = String(process.env.OFFICIAL_RISK_SOURCE_URLS ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('http://') || entry.startsWith('https://'));
}

function parseSeverity(value: unknown): 'low' | 'medium' | 'high' {
  const text = String(value ?? '').toLowerCase();
  if (text === 'high') return 'high';
  if (text === 'medium') return 'medium';
  return 'low';
}

function parseMatched(payload: OfficialApiResponse) {
  if (typeof payload.matched === 'boolean') return payload.matched;
  if (typeof payload.blacklisted === 'boolean') return payload.blacklisted;
  const text = JSON.stringify(payload).toLowerCase();
  return text.includes('blacklist') || text.includes('scam') || text.includes('fraud');
}

function parseNote(payload: OfficialApiResponse) {
  const fromNote = String(payload.note ?? '').trim();
  if (fromNote) return fromNote;
  const fromReason = String(payload.reason ?? '').trim();
  if (fromReason) return fromReason;
  return '';
}

function sourceLabel(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function fetchOfficialRiskSignals(number: string): Promise<OfficialSourceSignal[]> {
  const sources = parseConfiguredSources();
  if (!sources.length) return [];

  const token = String(process.env.OFFICIAL_RISK_SOURCE_TOKEN ?? '').trim();
  const outputs: OfficialSourceSignal[] = [];

  for (const endpoint of sources) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ number }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        outputs.push({
          source: sourceLabel(endpoint),
          matched: false,
          severity: 'low',
          note: `source_error_${response.status}`,
          url: endpoint,
        });
        continue;
      }

      const payload = (await response.json().catch(() => ({}))) as OfficialApiResponse;
      outputs.push({
        source: sourceLabel(endpoint),
        matched: parseMatched(payload),
        severity: parseSeverity(payload.severity),
        note: parseNote(payload),
        url: endpoint,
      });
    } catch {
      outputs.push({
        source: sourceLabel(endpoint),
        matched: false,
        severity: 'low',
        note: 'source_timeout_or_unreachable',
        url: endpoint,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return outputs;
}
