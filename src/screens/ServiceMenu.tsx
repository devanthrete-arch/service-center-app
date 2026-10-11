import { useEffect, useState, type FormEvent } from "react";
import { useStore } from "../domain/store";
import { money } from "../domain/types";
import { ApiError, errorMessage } from "../lib/api";
import {
  menuApi,
  menuKey,
  readMenuAttempt,
  sendMenuAttempt,
  type Definition,
  type MenuAttempt,
  type MenuPackage,
  type MenuService,
  type VehicleType,
} from "../lib/service-menu";

type Edit = {
  kind: "SERVICE" | "PACKAGE";
  item?: MenuService | MenuPackage;
  definition?: Definition;
};
export function ServiceMenu() {
  const { me, can } = useStore();
  const allowed =
    can("center:manage") &&
    me.roles.some((r) => r === "admin" || r === "manager");
  if (!allowed)
    return (
      <section className="panel">
        <h2>Services & packages</h2>
        <p>A center manager manages this menu.</p>
      </section>
    );
  return (
    <MenuEditor
      key={`${me.staff.id}:${me.center.id}`}
      staffId={me.staff.id}
      centerId={me.center.id}
    />
  );
}
export function MenuEditor({
  staffId,
  centerId,
}: {
  staffId: string;
  centerId: string;
}) {
  const storageKey = menuKey(staffId, centerId);
  const [services, setServices] = useState<MenuService[]>([]);
  const [packages, setPackages] = useState<MenuPackage[]>([]);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState<MenuAttempt | null>(() =>
    readMenuAttempt(storageKey),
  );
  async function refresh() {
    const [catalog, menu, bundles] = await Promise.all([
      menuApi.definitions(),
      menuApi.services(),
      menuApi.packages(),
    ]);
    setDefinitions(catalog.items);
    setServices(menu);
    setPackages(bundles);
    setLoaded(true);
  }
  useEffect(() => {
    let live = true;
    Promise.all([menuApi.definitions(), menuApi.services(), menuApi.packages()])
      .then(([catalog, menu, bundles]) => {
        if (live) {
          setDefinitions(catalog.items);
          setServices(menu);
          setPackages(bundles);
          setLoaded(true);
        }
      })
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, []);
  async function save(a: MenuAttempt) {
    if (busy) return;
    setBusy(true);
    setStale(false);
    setError("");
    setMessage("");
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(a));
      setAttempt(a);
      await sendMenuAttempt(a);
      sessionStorage.removeItem(storageKey);
      setAttempt(null);
      setEdit(null);
      setMessage("Saved. Customers see the current available menu.");
      try {
        await refresh();
      } catch (e) {
        setError(`Saved, but the menu could not refresh. ${errorMessage(e)}`);
      }
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![408, 429].includes(e.status)
      ) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
      }
      if (e instanceof ApiError && e.status === 409) setStale(true);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !!attempt;
  return (
    <div className="service-menu">
      <section className="panel">
        <h2>Services & packages</h2>
        <p>
          Select the services your center provides, set their price and scope,
          then group them into packages when useful. Pausing an item affects new
          bookings.
        </p>
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            void refresh().catch((e) => setError(errorMessage(e)));
          }}
        >
          Refresh menu
        </button>
        {attempt && (
          <div className="menu-retry">
            <p>
              The last save needs confirmation. Retry the same save before
              making another change.
            </p>
            <button disabled={busy} onClick={() => void save(attempt)}>
              {busy ? "Checking…" : "Check save result"}
            </button>
          </div>
        )}
        {stale && edit?.item && (
          <div>
            <p>
              Your form was kept, but another edit was saved first. Load the
              latest item to replace this unsaved form.
            </p>
            <button
              disabled={busy}
              onClick={() => {
                void Promise.all([menuApi.services(), menuApi.packages()])
                  .then(([rows, bundles]) => {
                    setServices(rows);
                    setPackages(bundles);
                    const latest = (
                      edit.kind === "PACKAGE" ? bundles : rows
                    ).find((r) => r.id === edit.item?.id);
                    if (latest) setEdit({ ...edit, item: latest });
                    setStale(false);
                    setError("");
                  })
                  .catch((e) => setError(errorMessage(e)));
              }}
            >
              Load latest item
            </button>
          </div>
        )}
        {!loaded && !error && <p role="status">Loading menu…</p>}
      </section>
      {edit && (
        <ServiceForm
          key={`${edit.kind}:${edit.item?.id ?? edit.definition?.id ?? "new"}:${edit.item?.version ?? 0}`}
          edit={edit}
          services={services}
          definitions={definitions}
          disabled={disabled}
          close={() => setEdit(null)}
          save={(body) =>
            void save({
              key: crypto.randomUUID(),
              path: `/v1/center/${edit.kind === "PACKAGE" ? "packages" : "offerings"}${edit.item ? "/" + edit.item.id : ""}`,
              method: edit.item
                ? edit.kind === "PACKAGE"
                  ? "PUT"
                  : "PATCH"
                : "POST",
              body,
              version: edit.item?.version,
            })
          }
        />
      )}
      <section className="panel">
        <h2>Your services</h2>
        <button
          disabled={disabled}
          onClick={() => setEdit({ kind: "SERVICE" })}
        >
          Add a custom service
        </button>
        {loaded && !services.length && (
          <p>
            No services configured yet. Choose an activity from the catalog
            below.
          </p>
        )}
        {services.map((s) => (
          <article className="menu-row" key={s.id}>
            <div>
              <h3>{s.name}</h3>
              <p>{s.description || "No scope description"}</p>
              <small>
                {s.vehicleType === "FOUR_WHEELER"
                  ? "Car"
                  : s.vehicleType === "TWO_WHEELER"
                    ? "Bike"
                    : "All center vehicle types"}{" "}
                · {s.priceIsStarting ? "From " : ""}
                {money(s.priceInr)} · {s.isActive ? "Available" : "Paused"}
              </small>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={s.isActive}
                  disabled={disabled}
                  onChange={() =>
                    void save({
                      key: crypto.randomUUID(),
                      path: `/v1/center/offerings/${s.id}`,
                      method: "PATCH",
                      body: { isActive: !s.isActive },
                      version: s.version,
                    })
                  }
                />{" "}
                Provides this service
              </label>
              <button
                disabled={disabled}
                onClick={() => setEdit({ kind: "SERVICE", item: s })}
              >
                Edit {s.name}
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Service catalog</h2>
        <label>
          Find an activity
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tyre change, brakes, oil…"
          />
        </label>
        {loaded && !definitions.length && (
          <p>The shared service catalog has not been loaded yet.</p>
        )}
        {definitions
          .filter((d) =>
            [d.name, d.category, ...d.aliases].some((v) =>
              v.toLowerCase().includes(query.toLowerCase()),
            ),
          )
          .map((d) => (
            <article className="menu-row" key={d.id}>
              <div>
                <small>{d.category}</small>
                <h3>{d.name}</h3>
                <p>{d.description}</p>
              </div>
              <button
                disabled={disabled}
                onClick={() => setEdit({ kind: "SERVICE", definition: d })}
              >
                {services.some((s) => s.serviceDefinitionId === d.id)
                  ? "Add another option"
                  : "Configure service"}
              </button>
            </article>
          ))}
      </section>
      <section className="panel">
        <h2>Packages</h2>
        <button
          disabled={disabled || services.filter((s) => s.isActive).length < 2}
          onClick={() => setEdit({ kind: "PACKAGE" })}
        >
          Create package
        </button>
        {packages.map((p) => (
          <article className="menu-row" key={p.id}>
            <div>
              <h3>{p.name}</h3>
              <p>
                {p.priceIsStarting ? "From " : ""}
                {money(p.priceInr)} ·{" "}
                {p.available ? "Available" : "Unavailable or paused"}
              </p>
              <ul>
                {p.components.map((c) => (
                  <li key={c.offeringId}>
                    {c.quantity} × {c.name}
                  </li>
                ))}
              </ul>
            </div>
            <button
              disabled={disabled}
              onClick={() => setEdit({ kind: "PACKAGE", item: p })}
            >
              Edit {p.name}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
function ServiceForm({
  edit,
  services,
  definitions,
  disabled,
  close,
  save,
}: {
  edit: Edit;
  services: MenuService[];
  definitions: Definition[];
  disabled: boolean;
  close: () => void;
  save: (body: Record<string, unknown>) => void;
}) {
  const item = edit.item;
  const [name, setName] = useState(item?.name ?? edit.definition?.name ?? "");
  const [description, setDescription] = useState(
    item?.description ?? edit.definition?.description ?? "",
  );
  const [definitionId, setDefinitionId] = useState(
    item?.serviceDefinitionId ?? edit.definition?.id ?? "",
  );
  const [type, setType] = useState<VehicleType | "">(
    item
      ? (item.vehicleType ?? "")
      : edit.definition?.vehicleTypes.length === 2
        ? ""
        : (edit.definition?.vehicleTypes[0] ?? ""),
  );
  const selectedDefinition = definitions.find((d) => d.id === definitionId);
  const supportsAllTypes =
    !selectedDefinition || selectedDefinition.vehicleTypes.length === 2;
  const [price, setPrice] = useState(item?.priceInr ?? "");
  const [starting, setStarting] = useState(item?.priceIsStarting ?? false);
  const [duration, setDuration] = useState(String(item?.durationMinutes ?? 60));
  const [active, setActive] = useState(item?.isActive ?? true);
  const [components, setComponents] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (edit.kind === "PACKAGE" && item
        ? (item as MenuPackage).components
        : []
      ).map((c) => [c.offeringId, c.quantity]),
    ),
  );
  const packageMode = edit.kind === "PACKAGE";
  function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      ...(type ? { vehicleType: type } : {}),
      priceInr: Number(price),
      priceIsStarting: starting,
      durationMinutes: Number(duration),
    };
    if (packageMode) {
      body.components = Object.entries(components).map(
        ([offeringId, quantity]) => ({
          offeringId,
          quantity,
        }),
      );
      body.isActive = active;
    } else {
      if (definitionId) body.serviceDefinitionId = definitionId;
      if (item) body.isActive = active;
    }
    save(body);
  }
  return (
    <form className="panel menu-form" onSubmit={submit}>
      <h2>
        {item ? "Edit" : "Configure"} {packageMode ? "package" : "service"}
      </h2>
      <fieldset disabled={disabled}>
        {!packageMode && (
          <label>
            Shared activity
            <select
              value={definitionId}
              disabled={!!item?.serviceDefinitionId}
              onChange={(e) => {
                const nextId = e.target.value;
                setDefinitionId(nextId);
                const definition = definitions.find((d) => d.id === nextId);
                if (
                  definition &&
                  (type === "" || !definition.vehicleTypes.includes(type))
                )
                  setType(
                    definition.vehicleTypes.length === 2
                      ? ""
                      : definition.vehicleTypes[0],
                  );
              }}
            >
              <option value="">Custom service</option>
              {definitions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Name
          <input
            autoFocus
            required
            minLength={2}
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          What is included and excluded?
          <textarea
            required
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Vehicle type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as VehicleType | "")}
          >
            {!packageMode &&
              (supportsAllTypes || (item && !item.vehicleType)) && (
                <option value="">All center vehicle types</option>
              )}
            {(!selectedDefinition ||
              selectedDefinition.vehicleTypes.includes("TWO_WHEELER")) && (
              <option value="TWO_WHEELER">Bike / scooter</option>
            )}
            {(!selectedDefinition ||
              selectedDefinition.vehicleTypes.includes("FOUR_WHEELER")) && (
              <option value="FOUR_WHEELER">Car</option>
            )}
          </select>
        </label>
        <label>
          Price in INR
          <input
            type="number"
            required
            min="0"
            max="9999999"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={starting}
            onChange={(e) => setStarting(e.target.checked)}
          />{" "}
          Starting price (final scope may vary)
        </label>
        <label>
          Expected duration in minutes
          <input
            type="number"
            required
            min="15"
            max="1440"
            step="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
        {(item || packageMode) && (
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />{" "}
            Available for new bookings
          </label>
        )}
        {packageMode && (
          <fieldset>
            <legend>
              Included services — select at least two distinct activities
            </legend>
            {Object.keys(components)
              .filter((id) => !services.some((service) => service.id === id))
              .map((id) => (
                <div className="menu-component" key={id}>
                  <span>
                    {(item as MenuPackage | undefined)?.components.find(
                      (component) => component.offeringId === id,
                    )?.name ?? "Unavailable service"}{" "}
                    (removed from menu)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setComponents((old) => {
                        const next = { ...old };
                        delete next[id];
                        return next;
                      })
                    }
                  >
                    Remove unavailable component
                  </button>
                </div>
              ))}
            {services
              .filter((s) => s.isActive || components[s.id])
              .map((s) => (
                <div className="menu-component" key={s.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!components[s.id]}
                      onChange={(e) =>
                        setComponents((old) => {
                          const next = { ...old };
                          if (e.target.checked) next[s.id] = 1;
                          else delete next[s.id];
                          return next;
                        })
                      }
                    />{" "}
                    {s.name}
                    {!s.isActive ? " (paused)" : ""}
                  </label>
                  {components[s.id] && (
                    <label>
                      Quantity
                      <input
                        aria-label={`Quantity of ${s.name}`}
                        type="number"
                        min="1"
                        max="20"
                        required
                        value={components[s.id]}
                        onChange={(e) =>
                          setComponents((old) => ({
                            ...old,
                            [s.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  )}
                </div>
              ))}
          </fieldset>
        )}
        <p>
          State the exact parts, materials and quantities included. The package
          price is charged once.
        </p>
        <button
          className="primary"
          disabled={packageMode && Object.keys(components).length < 2}
        >
          Save {packageMode ? "package" : "service"}
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
      </fieldset>
    </form>
  );
}
