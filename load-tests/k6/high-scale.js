import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const userEmail = __ENV.USER_EMAIL || '';
const userPassword = __ENV.USER_PASSWORD || '';
const adminEmail = __ENV.ADMIN_EMAIL || '';
const adminPassword = __ENV.ADMIN_PASSWORD || '';
const targetRps = Number(__ENV.TARGET_RPS || 200);
const preAllocatedVus = Number(__ENV.PRE_ALLOCATED_VUS || 400);
const maxVus = Number(__ENV.MAX_VUS || 10000);
const duration = __ENV.DURATION || '10m';
const userThinkTime = Number(__ENV.THINK_TIME_MS || 150);

const loginFailRate = new Rate('login_fail_rate');
const apiFailRate = new Rate('api_fail_rate');
const userFlowLatency = new Trend('user_flow_latency', true);

export const options = {
 scenarios: {
 user_flow: {
 executor: 'constant-arrival-rate',
 rate: targetRps,
 timeUnit: '1s',
 duration: duration,
 preAllocatedVUs: preAllocatedVus,
 maxVUs: maxVus,
 },
 },
 thresholds: {
 http_req_failed: ['rate<0.05'],
 http_req_duration: ['p(95)<1500', 'avg<600'],
 login_fail_rate: ['rate<0.03'],
 api_fail_rate: ['rate<0.05'],
 user_flow_latency: ['p(95)<2200'],
 },
 noConnectionReuse: false,
 userAgent: 'k6-password-vault-loadtest',
};

function login(email, password) {
 const payload = JSON.stringify({ email: email, password: password });
 const headers = { 'Content-Type': 'application/json' };
 const started = Date.now();
 const res = http.post(baseUrl + '/api/auth/login', payload, { headers: headers, tags: { name: 'login' } });
 userFlowLatency.add(Date.now() - started);
 const ok = check(res, {
 'login status 200': (r) => r.status === 200,
 });
 loginFailRate.add(!ok);
 return ok;
}

function callVaultList() {
 const started = Date.now();
 const res = http.get(baseUrl + '/api/vault?limit=50', { tags: { name: 'vault_list' } });
 userFlowLatency.add(Date.now() - started);
 const ok = check(res, {
 'vault list status 200': (r) => r.status === 200,
 });
 apiFailRate.add(!ok);
}

function callNotesList() {
 const started = Date.now();
 const res = http.get(baseUrl + '/api/notes?limit=20&page=1', { tags: { name: 'notes_list' } });
 userFlowLatency.add(Date.now() - started);
 const ok = check(res, {
 'notes list status 200': (r) => r.status === 200,
 'notes has payload': (r) => r.body && r.body.indexOf('notes') !== -1,
 });
 apiFailRate.add(!ok);
}

function callTeamRoomsList() {
 const started = Date.now();
 const res = http.get(baseUrl + '/api/team-rooms', { tags: { name: 'team_rooms_list' } });
 userFlowLatency.add(Date.now() - started);
 const ok = check(res, {
 'team rooms status 200': (r) => r.status === 200,
 'team rooms has payload': (r) => r.body && r.body.indexOf('rooms') !== -1,
 });
 apiFailRate.add(!ok);
}

function callAdminMetrics() {
 if (!adminEmail || !adminPassword) return;
 const ok = login(adminEmail, adminPassword);
 if (!ok) return;
 const res = http.get(baseUrl + '/api/metrics?windowSec=60', { tags: { name: 'metrics' } });
 const pass = check(res, {
 'metrics status 200': (r) => r.status === 200,
 'metrics has global': (r) => r.body && r.body.indexOf('global') !== -1,
 });
 apiFailRate.add(!pass);
}

export default function highScaleFlow() {
 if (!userEmail || !userPassword) {
 const warmup = http.get(baseUrl + '/login', { tags: { name: 'public_login_page' } });
 check(warmup, { 'public page reachable': (r) => r.status === 200 || r.status === 307 || r.status === 308 });
 sleep(0.1);
 return;
 }

 const ok = login(userEmail, userPassword);
 if (ok) {
 callVaultList();
 callNotesList();
 if (__ITER % 3 === 0) callTeamRoomsList();
 }

 if (__ITER % 20 === 0) {
 callAdminMetrics();
 }

 sleep(userThinkTime / 1000);
}
