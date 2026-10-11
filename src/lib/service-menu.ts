import { autoflex } from "./api";
export type VehicleType = "TWO_WHEELER" | "FOUR_WHEELER";
export type Definition = {
  id: string;
  name: string;
  description: string;
  category: string;
  aliases: string[];
  vehicleTypes: VehicleType[];
};
export type MenuService = {
  id: string;
  version: number;
  serviceDefinitionId: string | null;
  name: string;
  description: string | null;
  vehicleType: VehicleType | null;
  priceInr: string;
  priceIsStarting: boolean;
  durationMinutes: number;
  isActive: boolean;
};
export type MenuPackage = MenuService & {
  available: boolean;
  components: { offeringId: string; quantity: number; name: string }[];
};
export type MenuAttempt = {
  key: string;
  path: string;
  method: "POST" | "PATCH" | "PUT";
  body: Record<string, unknown>;
  version?: number;
};
const PREFIX = "af_sc_menu_attempt:";
export const menuKey = (staff: string, center: string) =>
  `${PREFIX}${staff}:${center}`;
export function clearMenuAttempts() {
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => sessionStorage.removeItem(k));
}
export function readMenuAttempt(key: string): MenuAttempt | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(key) ?? "null",
    ) as MenuAttempt | null;
    if (
      value &&
      /^\/v1\/center\/(offerings|packages)(\/[a-f0-9-]{36})?$/.test(
        value.path,
      ) &&
      ["POST", "PATCH", "PUT"].includes(value.method) &&
      value.key &&
      value.body &&
      typeof value.body === "object"
    )
      return value;
  } catch {
    /* Invalid local draft is not a command. */
  }
  sessionStorage.removeItem(key);
  return null;
}
export async function sendMenuAttempt(a: MenuAttempt) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    return await autoflex(
      a.path,
      {
        method: a.method,
        signal: controller.signal,
        body: JSON.stringify(a.body),
        headers: {
          "Idempotency-Key": a.key,
          ...(a.version ? { "If-Match": String(a.version) } : {}),
        },
      },
      true,
    );
  } finally {
    window.clearTimeout(timer);
  }
}
export const menuApi = {
  definitions: async () => {
    const items: Definition[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page: { items: Definition[]; nextOffset: number | null } =
        await autoflex(`/v1/marketplace/services?offset=${offset}&limit=200`);
      items.push(...page.items);
      offset = page.nextOffset;
    }
    return { items };
  },
  services: () => autoflex<MenuService[]>("/v1/center/offerings", {}, true),
  packages: () => autoflex<MenuPackage[]>("/v1/center/packages", {}, true),
};
