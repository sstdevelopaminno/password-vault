const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

async function check(name, input) {
  const started = Date.now();
  try {
    const response = await fetch(input.url, input.init);
    const ms = Date.now() - started;
    const status = response.status;
    const ok = input.accept.includes(status);
    const location = response.headers.get("location");
    return {
      name,
      ok,
      status,
      ms,
      location: location || null,
      expected: input.accept,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: -1,
      ms: Date.now() - started,
      location: null,
      expected: input.accept,
      error: String(error instanceof Error ? error.message : error),
    };
  }
}

const cases = {
  home: {
    url: `${baseUrl}/`,
    accept: [200],
  },
  login: {
    url: `${baseUrl}/login`,
    accept: [200],
  },
  manifest: {
    url: `${baseUrl}/manifest.webmanifest`,
    accept: [200],
  },
  plans_api: {
    url: `${baseUrl}/api/packages/plans?locale=th`,
    // Current middleware/API policy requires auth for package endpoints.
    accept: [401],
  },
  current_api_unauth: {
    url: `${baseUrl}/api/packages/current`,
    accept: [401],
  },
  wallet_api_unauth: {
    url: `${baseUrl}/api/packages/wallet`,
    accept: [401],
  },
  checkout_unauth: {
    url: `${baseUrl}/api/packages/checkout`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "pro", cycle: "monthly", paymentMethod: "promptpay" }),
    },
    accept: [401],
  },
  slip_upload_unauth: {
    url: `${baseUrl}/api/packages/slip/upload`,
    init: {
      method: "POST",
    },
    accept: [401],
  },
  slip_verify_unauth: {
    url: `${baseUrl}/api/packages/slip/verify`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "00000000-0000-0000-0000-000000000000", provider: "manual" }),
    },
    accept: [401],
  },
  topup_create_unauth: {
    url: `${baseUrl}/api/packages/wallet/topup`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountThb: 500 }),
    },
    accept: [401],
  },
  topup_verify_unauth: {
    url: `${baseUrl}/api/packages/wallet/topup/verify`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topupOrderId: "00000000-0000-0000-0000-000000000000", provider: "manual" }),
    },
    accept: [401],
  },
};

const results = [];
for (const [name, input] of Object.entries(cases)) {
  // eslint-disable-next-line no-await-in-loop
  const result = await check(name, input);
  results.push(result);
}

const failed = results.filter((entry) => !entry.ok);
console.log(JSON.stringify({
  baseUrl,
  passed: failed.length === 0,
  checked: results.length,
  failed: failed.length,
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
