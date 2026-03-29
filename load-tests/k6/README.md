# k6 High Scale Test

Install k6:
winget install k6 --source winget

Run 1,000 RPS:
k6 run -e BASE_URL=http://localhost:3000 -e USER_EMAIL=you@example.com -e USER_PASSWORD=yourPassword -e TARGET_RPS=1000 -e PRE_ALLOCATED_VUS=1500 -e MAX_VUS=5000 -e DURATION=10m load-tests/k6/high-scale.js

Run 10,000 RPS:
k6 run -e BASE_URL=http://localhost:3000 -e USER_EMAIL=you@example.com -e USER_PASSWORD=yourPassword -e TARGET_RPS=10000 -e PRE_ALLOCATED_VUS=10000 -e MAX_VUS=20000 -e DURATION=10m load-tests/k6/high-scale.js

Optional admin metrics credentials:
-e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=adminPassword

Metrics endpoint:
GET /api/metrics?windowSec=60
POST /api/metrics with action reset

