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

Staff tokens come from `POST /v1/dev/session` with a persona. Frevels IAM is the later sign-in path.
