# Browser regression fixtures

`/tests/walk-in.html` mounts the actual returning-customer intake component in StrictMode. It covers explicit customer/vehicle confirmation, phone-prefix validation without truncation, paginated vehicles, known and unknown vehicle types, plate conflicts, slow-response invalidation, registration handoffs, Back/vehicle-switch behavior, stable exact creation retries, closed-job recovery after personal draft expiry, active-tab expiry on wake, unavailable storage, creation-only permissions, refresh failure, active-job conflicts, sign-out/center/permission cleanup, and completed-job comeback lookup. API transport uses controlled test responses; no workshop records are written. It restores the original token and session storage. Open it on a dedicated development origin without simultaneous account work.

With the desk Vite server running, open `/tests/service-menu.html`. Six StrictMode scenarios mount the actual menu editor: a new shared activity covering bikes and cars, legacy type preservation, lost response with exact retry across remount, stale form recovery, successful save plus failed refresh, and sign-out cleanup. API reads and command transport are controlled test doubles; the fixture restores storage afterward. Use a dedicated development origin without simultaneous account work.

`/tests/tracking-link.html` covers the existing tracking link dialog. Production builds typecheck these fixture files but do not execute their assertions or bundle their HTML entry points.

`/tests/center-profile.html` covers seven location/photo editor scenarios: full-profile loading and zero coordinates, strict coordinate pairs/ranges and clears, HTTPS Maps allowlist, trimmed/deduplicated gallery URLs and size bounds, nullable clears, save failure preserving input and load failure/retry. It uses controlled API responses and excludes unrelated UPI/workflow fields from the profile command.

Manager scheduling: `/tests/booking-schedule.html` verifies the actual editor, weekly closure/impact, persistent exact retry, denied access and sign-out cleanup (10 assertions).
