import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3000";
const targetRps = Number(__ENV.TARGET_RPS || 60);
const duration = __ENV.DURATION || "90s";
const preAllocatedVus = Number(__ENV.PRE_ALLOCATED_VUS || 200);
const maxVus = Number(__ENV.MAX_VUS || 1200);
const thinkMs = Number(__ENV.THINK_TIME_MS || 100);

const endpointFailRate = new Rate("endpoint_fail_rate");
const flowLatency = new Trend("baseline_flow_latency", true);

export const options = {
  scenarios: {
    baseline_public_flow: {
      executor: "constant-arrival-rate",
      rate: targetRps,
      timeUnit: "1s",
      duration,
      preAllocatedVUs: preAllocatedVus,
      maxVUs: maxVus,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.03"],
    http_req_duration: ["p(95)<1200", "avg<500"],
    endpoint_fail_rate: ["rate<0.03"],
    baseline_flow_latency: ["p(95)<1600"],
  },
  noConnectionReuse: false,
  userAgent: "k6-password-vault-baseline-public",
};

function checkEndpoint(name, response, allowedStatuses) {
  const ok = check(response, {
    [name + " status ok"]: (r) => allowedStatuses.includes(r.status),
  });
  endpointFailRate.add(!ok);
}

export default function baselinePublicFlow() {
  const started = Date.now();

  const login = http.get(baseUrl + "/login", { tags: { name: "login_page" } });
  checkEndpoint("login page", login, [200, 302, 307, 308]);

  const manifest = http.get(baseUrl + "/manifest.webmanifest", { tags: { name: "manifest" } });
  checkEndpoint("manifest", manifest, [200]);

  const release = http.get(baseUrl + "/api/android-release", { tags: { name: "api_android_release" } });
  checkEndpoint("api android release", release, [200]);

  flowLatency.add(Date.now() - started);
  sleep(thinkMs / 1000);
}
