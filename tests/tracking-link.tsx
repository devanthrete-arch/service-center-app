import React from "react";
import { createRoot } from "react-dom/client";
import {
  TrackingLinkPanel,
  type TrackingTransport,
} from "../src/screens/TrackingLinkPanel";
import { ApiError } from "../src/lib/api";
import { ATTEMPT_PREFIX, trackingUrl } from "../src/lib/tracking-link";
import "../src/styles.css";

const id = "10000000-0000-4000-8000-000000000001";
const receipt = {
  jobId: id,
  version: 2,
  rotationId: "20000000-0000-4000-8000-000000000002",
  rotatedAt: new Date().toISOString(),
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
let root = createRoot(fixture),
  completed = 0;
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
function button(name: string) {
  const value = [...fixture.querySelectorAll("button")].find(
    (row) => row.textContent === name,
  );
  if (!value) throw new Error(`Missing ${name}`);
  value.click();
}
async function mount(
  api: TrackingTransport,
  changed: () => Promise<void> = async () => {},
  strict = false,
  canReplace = true,
) {
  const panel = (
    <TrackingLinkPanel
      jobId={id}
      staffId="staff"
      centerId="center"
      canReplace={canReplace}
      close={() => {}}
      changed={changed}
      api={api}
    />
  );
  root.render(strict ? <React.StrictMode>{panel}</React.StrictMode> : panel);
  await pause();
}
async function reset() {
  root.unmount();
  root = createRoot(fixture);
  sessionStorage.clear();
  await pause();
}
const current = async () => ({
  jobId: id,
  version: 1,
  publicToken: "old_tracking_token",
});
async function confirm() {
  button("Replace link");
  await pause();
  button("Confirm replacement");
  await pause();
}
async function test(name: string, action: () => Promise<void>) {
  await reset();
  await action();
  completed++;
  results.append(
    Object.assign(document.createElement("p"), {
      textContent: `PASS · ${name}`,
    }),
  );
}
async function run() {
  await test("Uncertain response restores the exact attempt across remount", async () => {
    const calls: unknown[] = [];
    const api: TrackingTransport = {
      current,
      rotate: async (_id, attempt) => {
        calls.push({ ...attempt });
        if (calls.length === 1) throw new Error("lost response");
        return receipt;
      },
    };
    await mount(api);
    await confirm();
    assert(fixture.textContent?.includes("uncertain"), "uncertain state");
    const stored = sessionStorage.getItem(
      `${ATTEMPT_PREFIX}staff:center:${id}`,
    );
    assert(
      stored && !stored.includes("token"),
      "only non-secret attempt stored",
    );
    root.unmount();
    root = createRoot(fixture);
    await mount(api);
    button("Check replacement result");
    await pause();
    assert(
      JSON.stringify(calls[0]) === JSON.stringify(calls[1]),
      "retry changed metadata",
    );
    assert(fixture.textContent?.includes("Tracking link replaced"), "success");
  });
  await test("Committed replacement stays successful when current-link and job refresh fail", async () => {
    let reads = 0,
      mutations = 0;
    await mount(
      {
        current: async () => {
          if (++reads > 1) throw new Error("read failure");
          return current();
        },
        rotate: async () => {
          mutations++;
          return receipt;
        },
      },
      async () => {
        throw new Error("detail read failure");
      },
    );
    await confirm();
    assert(
      fixture.textContent?.includes("Tracking link replaced"),
      "lost acknowledgement",
    );
    assert(
      fixture.textContent?.includes("Reload the job"),
      "detail refresh warning disappeared",
    );
    button("Refresh link");
    await pause();
    assert(mutations === 1, "read recovery rotated again");
  });
  await test("Conflict requires a fresh read and explicit confirmation", async () => {
    await mount({
      current,
      rotate: async () => {
        throw new ApiError(409, "changed");
      },
    });
    await confirm();
    assert(
      fixture.textContent?.includes("Refresh the link and confirm again"),
      "conflict guidance",
    );
    assert(!fixture.querySelector("input"), "stale URL remains");
    assert(sessionStorage.length === 0, "rejected attempt retained");
  });
  await test("Authorization refusal clears the URL and replacement controls", async () => {
    let reads = 0;
    await mount({
      current: async () => {
        if (++reads > 1) throw new ApiError(403, "denied");
        return current();
      },
      rotate: async () => receipt,
    });
    button("Refresh link");
    await pause();
    assert(!fixture.querySelector("input"), "secret remains");
    assert(!fixture.textContent?.includes("Replace link"), "still enabled");
    assert(
      !fixture.textContent?.includes("Refresh to try again"),
      "denied read offers unavailable retry",
    );
  });
  await test("Pending replacement allows reads after update permission is lost", async () => {
    const key = `${ATTEMPT_PREFIX}staff:center:${id}`;
    const stored = JSON.stringify({
      schema: 1,
      key: crypto.randomUUID(),
      version: 1,
      reason: "OTHER",
    });
    sessionStorage.setItem(key, stored);
    let mutations = 0;
    await mount(
      {
        current,
        rotate: async () => {
          mutations++;
          return receipt;
        },
      },
      async () => {},
      false,
      false,
    );
    button("Refresh link");
    await pause();
    assert(
      !!fixture.querySelector("input"),
      "pending attempt blocks current-link read",
    );
    assert(
      fixture.textContent?.includes("Copy link") &&
        fixture.textContent?.includes("Open timeline"),
      "pending attempt blocks sharing",
    );
    const retry = [...fixture.querySelectorAll("button")].find(
      (row) => row.textContent === "Check replacement result",
    );
    assert(retry?.disabled, "read-only actor can retry mutation");
    assert(
      !fixture.textContent?.includes("Replace link"),
      "new mutation offered while unresolved",
    );
    assert(
      sessionStorage.getItem(key) === stored && mutations === 0,
      "read discarded or replayed attempt",
    );
  });
  await test("Denied initial reads give actionable close/sign-in guidance", async () => {
    for (const status of [401, 403, 404]) {
      await reset();
      await mount({
        current: async () => {
          throw new ApiError(status, "denied");
        },
        rotate: async () => receipt,
      });
      assert(
        !fixture.textContent?.includes("Refresh to try again"),
        "incorrect retry advice",
      );
      assert(
        fixture.textContent?.includes("Close this panel"),
        "missing close guidance",
      );
      assert(!fixture.querySelector("input"), "denied read exposes URL");
      assert(
        [...fixture.querySelectorAll("button")].every(
          (row) => row.textContent === "Close",
        ),
        "denied read offers controls",
      );
    }
  });
  await test("An obsolete read cannot repopulate an unmounted panel", async () => {
    let resolve!: (
      value: Awaited<ReturnType<TrackingTransport["current"]>>,
    ) => void;
    await mount({
      current: () => new Promise((done) => (resolve = done)),
      rotate: async () => receipt,
    });
    root.unmount();
    root = createRoot(fixture);
    resolve(await current());
    await pause();
    assert(!fixture.textContent, "late response populated UI");
  });
  await test("Customer origin rejects credentials, paths and unsafe schemes", async () => {
    for (const origin of [
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com/?x=1",
      "http://example.com",
    ]) {
      let refused = false;
      try {
        trackingUrl("safe_token", origin);
      } catch {
        refused = true;
      }
      assert(refused, `accepted ${origin}`);
    }
    assert(
      trackingUrl("safe_token", "https://customer.example") ===
        "https://customer.example/t/safe_token",
      "wrong public URL",
    );
  });
  await test("Tracking dialog fits a 390px viewport", async () => {
    const frame = document.createElement("iframe");
    frame.style.width = "390px";
    frame.style.height = "844px";
    const ready = new Promise<void>(
      (resolve) => (frame.onload = () => resolve()),
    );
    frame.src = "./tracking-link.html?responsive=1";
    fixture.append(frame);
    await ready;
    await pause();
    const dialog = frame.contentDocument?.querySelector("dialog");
    assert(dialog?.open, "responsive dialog did not mount");
    const box = dialog!.getBoundingClientRect();
    assert(box.left >= 0 && box.right <= 390, "dialog overflows viewport");
    assert(
      dialog!.scrollWidth <= dialog!.clientWidth,
      "dialog content overflows horizontally",
    );
    frame.remove();
  });
  await test("StrictMode remount keeps the current link usable", async () => {
    await mount({ current, rotate: async () => receipt }, async () => {}, true);
    assert(!!fixture.querySelector("input"), "StrictMode lost current link");
    await confirm();
    assert(
      fixture.textContent?.includes("Tracking link replaced"),
      "StrictMode lost acknowledgement",
    );
  });
  await reset();
  results.append(
    Object.assign(document.createElement("p"), {
      textContent: `${completed}/10 scenarios passed`,
    }),
  );
}
void (
  new URLSearchParams(location.search).has("responsive")
    ? mount({ current, rotate: async () => receipt })
    : run()
).catch((error) =>
  results.append(
    Object.assign(document.createElement("p"), {
      textContent: `FAIL · ${String(error)}`,
    }),
  ),
);
