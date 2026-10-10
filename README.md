# Autoflex service center

Staff workspace on the Autoflex APIs: walk-ins, booking queue, job cards, approvals, close/collect, and center settings.

## Run

Start the durable workshop first (`cd ../autoflex-backend && npm run start:workshop` after Postgres and migrations), then:

```bash
npm install
npm run dev
```

Opens on port 5174. Sign in as Meera (manager), Arjun (advisor), Ravi, or Sana.

```bash
npm run typecheck
npm run build
```

Staff sign in with a mobile number and a one-time code. Locally that is `POST /v1/dev/session` with `{ "phone", "actor": "staff" }`. Frevels IAM is the later sign-in path.

## Tracking links (AF-004)

Set `VITE_CUSTOMER_WEB_URL` to the customer website origin before building (see `.env.example`). Development defaults to `http://localhost:5173`; use the actual customer port. Production needs an explicit HTTPS origin without credentials, path, query or fragment. Invalid configuration disables sharing but still permits replacement of an exposed link.

Job detail → More → Tracking link is available to desk roles with `jobs:read`; replacement also requires `jobs:update`. All non-deleted jobs, including completed/cancelled jobs, support replacement. Confirm a reason; earlier links/QRs stop working, and no message is sent automatically. Copy/open uses a fresh current-link read.

Lost responses retain the exact attempt: use **Check replacement result** before proceeding. Current-link reads/copy/open stay available while an attempt is unresolved, even if update permission is lost; reads do not resolve that attempt. Non-secret retry metadata survives same-session reload and is cleared on sign-out/identity change. Acknowledged success stays visible if subsequent reads fail.

Run Vite, then visit `/tests/tracking-link.html` for the actual component's ten recovery/configuration/StrictMode/narrow-layout scenarios. Test entry points are TypeScript checked but are not production build entry points. See [Tracking runbook](../development-documents/architecture/public-job-timeline-runbook.md#staff-tracking-link-replacement-af-004).
