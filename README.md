# Autoflex Service Center — mock product

An end-to-end, frontend-only Phase 0 service-center workspace. It is designed to expose the backend contracts needed later; it does not call IAM, Autoflex APIs, storage, WhatsApp/SMS, payments, inventory, or analytics.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL and select a demo role. Other commands:

```bash
npm run typecheck
npm run build
npm run preview
```

## Demo paths

- `/login` — mock sign-in and role choice (advisor, technician, manager)
- `/` — dashboard, today queue, workload and exception counters
- `/new` — three-step walk-in check-in with customer, vehicle, estimate, condition and consent
- `/urgent` — breakdown/tow-in fast-track
- `/jobs` — search and status filters; technician role sees assigned work
- `/jobs/:id` — timeline, role-aware transitions, inspection checklist, photo metadata, approval simulation, totals, handover and service record
- `/handover` — open-job projection, risk badges and internal handover notes
- `/notifications` — simulated delivery log, failures, suppression and retry
- `/more` — mock limitations, shortcuts, logout and deterministic data reset

Suggested golden-path demo:

1. Sign in as Advisor.
2. Open `AF-1042`; simulate customer approval, move through work and QC, then complete handover.
3. Use **Additional work** to test OEM/OES/local line items and budget warnings.
4. Switch to Technician to see assigned-only queue, checklist and evidence actions.
5. Create a walk-in or urgent job, then inspect its generated timeline and notification event.
6. Open completed `AF-1032` and create a linked comeback/warranty job.
7. Review shift handover and retry the failed delivery.

## Mock architecture

`src/domain.tsx` is the backend replacement seam: typed domain models plus a single repository-like context for commands and projections. It owns deterministic seed data, workflow mutations, append-style events, approval state, delivery simulations and `localStorage` persistence (`autoflex-sc-mock-v2`).

`src/App.tsx` contains the routed product surfaces and role-aware actions. `src/styles.css` provides responsive desktop/mobile chrome using the documented Autoflex palette (`#023970`, `#E86201`) and Inter. Reloads preserve data; **More → Reset deterministic demo data** restores the seed.

The UI deliberately labels external effects as simulations. Media actions create metadata only. WhatsApp/SMS records never leave the browser. Cash/UPI is only recorded, never collected.

## Backend entities discovered

- `ServiceCenter`, `StaffProfile` and IAM tenant/profile mapping
- `Customer`, proxy/secondary contact, consent and locale
- `Vehicle` with registration/chassis/nickname fallback
- `ServiceJob`, workflow status/version, priority, waiting-on-site, hold/resume data, assignment and comeback link
- `ServiceJobEvent` append-only audit/timeline record
- `ServiceJobMedia` plus upload attempt/status and visibility
- `ServiceJobLineItem`, part type and approved/final pricing
- `ServiceJobApproval` and advisor verbal-override audit
- `NotificationDelivery` with channel, attempts, provider result and retry schedule
- immutable completion/service-record projection

## API seams discovered

- IAM OTP/session outside Autoflex, then staff profile/tenant bootstrap
- `POST/GET /v1/jobs`, `GET /v1/jobs/:id`
- status transition, assignment, contact correction, on-hold/resume, cancellation and close commands
- event/note append; inspection checklist update
- media init/confirm/retry/supersede
- approval request, public response and advisor override
- notification retry, tracking-link resend and public-token rotation
- public magic-link job projection
- recent completed-job lookup and comeback creation
- handover/open-work projection with attention badges

Every mutation should carry an idempotency key and expected job version. The backend must enforce state transitions, close gates, cancellation rules and tenant scope rather than trusting the client.

## Async event flows discovered

- `JobCreated` → timeline event → consent/channel policy → localized tracking delivery
- `JobStatusChanged` → event projection → major/minor notification policy
- `ApprovalRequested/Resolved` → customer delivery, timeout/reminder, job state update
- `MediaConfirmed/Failed` → evidence event, thumbnail processing and retry status
- `JobReadyForPickup` → customer alert and later unclaimed reminder
- `JobCompleted` → immutable service record; completion summary remains a later capability
- delivery failure → retry/backoff → dead-letter/attention badge
- hold ETA elapsed → handover/dashboard attention projection

## Known mock limitations

- Session/roles are client-side demonstrations, not security.
- Workflow is held in memory/localStorage and is not safe for concurrent users.
- Browser confirmation is used for a few simulation choices.
- No real customer timeline, OTP, QR generation, files, offline queue, provider delivery, payment, invoice, ERP or inventory integration.
- The breakdown flow uses the shared Phase 0 status model rather than introducing a persisted `DIAGNOSIS` state.
