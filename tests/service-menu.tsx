import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MenuEditor } from '../src/screens/ServiceMenu';
import { menuApi, menuKey, readMenuAttempt, type MenuService } from '../src/lib/service-menu';
import { clearAccessToken } from '../src/lib/session';
import '../src/styles.css';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fixture = document.getElementById('fixture')!;
const status = document.getElementById('status')!;
const results = document.getElementById('results')!;
let root = createRoot(fixture);
const key = menuKey('test-staff', 'test-center');
const storedSession = Object.entries(sessionStorage);
const token = localStorage.getItem('af_sc_access_token');
const fetchBefore = window.fetch;
const methods = { ...menuApi };
let row: MenuService = {
  id: '10000000-0000-4000-8000-000000000001',
  version: 1,
  serviceDefinitionId: null,
  name: 'Legacy inspection',
  description: 'Inspection only',
  vehicleType: null,
  priceInr: '100.00',
  priceIsStarting: false,
  durationMinutes: 30,
  isActive: true,
};
let mode: 'normal' | 'lost' | 'conflict' | 'refresh-failure' = 'normal';
let failRead = false;
const calls: { key: string; version: string; body: Record<string, unknown> }[] = [];
const receipts = new Map<string, MenuService>();
menuApi.definitions = async () => ({
  items: [{
    id: 'd0000000-0000-4000-8000-000000000002',
    name: 'Wheel balancing',
    description: 'Balance a wheel',
    category: 'Tyres & wheels',
    aliases: ['balancing'],
    vehicleTypes: ['TWO_WHEELER', 'FOUR_WHEELER'],
  }],
});
menuApi.packages = async () => [];
menuApi.services = async () => {
  if (failRead) {
    failRead = false;
    throw new Error('Injected read failure');
  }
  return [{ ...row }];
};
window.fetch = async (_input, init) => {
  if (init?.method !== 'PATCH') throw new Error('Unexpected test transport');
  const headers = new Headers(init.headers);
  const call = {
    key: headers.get('Idempotency-Key')!,
    version: headers.get('If-Match')!,
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  };
  calls.push(call);
  if (receipts.has(call.key)) return Response.json(receipts.get(call.key));
  if (mode === 'conflict') {
    mode = 'normal';
    row = { ...row, name: 'Edited by another manager', version: row.version + 1 };
    return Response.json({ message: 'Menu changed' }, { status: 409 });
  }
  row = { ...row, ...call.body, version: row.version + 1 } as MenuService;
  receipts.set(call.key, { ...row });
  if (mode === 'lost') {
    mode = 'normal';
    throw new Error('Lost response after commit');
  }
  if (mode === 'refresh-failure') {
    mode = 'normal';
    failRead = true;
  }
  return Response.json(row);
};
function check(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
function pass(name: string) {
  const li = document.createElement('li');
  li.textContent = `PASS: ${name}`;
  results.append(li);
}
function button(name: string) {
  const button = [...fixture.querySelectorAll('button')].find((b) => b.textContent === name);
  if (!button) throw new Error(`Missing ${name}`);
  return button;
}
async function click(name: string) {
  await act(async () => {
    button(name).click();
  });
}
async function mount() {
  await act(async () => {
    root.render(
      <StrictMode>
        <MenuEditor staffId="test-staff" centerId="test-center" />
      </StrictMode>,
    );
  });
}
async function remount() {
  await act(async () => root.unmount());
  root = createRoot(fixture);
  await mount();
}
function nameInput() {
  return fixture.querySelector<HTMLInputElement>('.menu-form input:not([type])')!;
}
async function fillName(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      nameInput(),
      value,
    );
    nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
try {
  sessionStorage.removeItem(key);
  await mount();
  await click('Configure service');
  const vehicleType = [...fixture.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Vehicle type'))
    ?.querySelector('select');
  check(vehicleType?.value === '', 'A new shared service should start as all vehicle types');
  check(vehicleType?.querySelector('option[value=""]'), 'Missing all-types choice');
  await click('Cancel');
  pass('A new service can cover both bike and car from one catalog activity.');
  await click('Edit Legacy inspection');
  await click('Save service');
  check(
    !('vehicleType' in calls[0].body),
    'Editing an all-types legacy service must omit vehicleType',
  );
  check(row.vehicleType === null, 'Legacy type was changed');
  pass('Editing a legacy option preserves its all-types identity.');

  mode = 'lost';
  await click('Edit Legacy inspection');
  await fillName('Saved despite lost response');
  await click('Save service');
  const lost = calls.at(-1)!;
  const version = row.version;
  check(readMenuAttempt(key)?.key === lost.key, 'Uncertain attempt not saved');
  await remount();
  const count = calls.length;
  await click('Refresh menu');
  check(calls.length === count, 'Refresh must never replay a write');
  check(button('Add a custom service').disabled, 'New writes must wait for the pending attempt');
  await click('Check save result');
  check(
    calls.at(-1)?.key === lost.key &&
      calls.at(-1)?.version === lost.version &&
      JSON.stringify(calls.at(-1)?.body) === JSON.stringify(lost.body),
    'Retry altered the command',
  );
  check(
    row.version === version && !readMenuAttempt(key),
    'Replay mutated again or retained the attempt',
  );
  pass('Lost response survives remount; refresh only reads and exact retry does not duplicate.');

  await click(`Edit ${row.name}`);
  await fillName('My unsaved wording');
  mode = 'conflict';
  await click('Save service');
  check(nameInput().value === 'My unsaved wording', 'Conflict erased the unsaved form');
  check(!readMenuAttempt(key), 'Rejected stale attempt should clear');
  await click('Load latest item');
  check(nameInput().value === 'Edited by another manager', 'Latest form not loaded');
  const latest = row.version;
  await click('Save service');
  check(calls.at(-1)?.version === String(latest), 'Save did not use refreshed version');
  pass('Stale edits preserve the draft and explicitly load the latest version.');

  mode = 'refresh-failure';
  await click(`Edit ${row.name}`);
  await click('Save service');
  check(
    !readMenuAttempt(key) && fixture.textContent?.includes('Saved, but the menu could not refresh'),
    'Committed edit must remain successful when read fails',
  );
  const writes = calls.length;
  await click('Refresh menu');
  check(calls.length === writes, 'Refresh after commit duplicated a save');
  pass('Successful save plus failed refresh does not create an uncertain command.');

  sessionStorage.setItem(
    key,
    JSON.stringify({
      key: 'pending-key',
      path: `/v1/center/offerings/${row.id}`,
      method: 'PATCH',
      body: { isActive: false },
      version: row.version,
    }),
  );
  clearAccessToken();
  check(!readMenuAttempt(key), 'Sign-out failed to clear saved attempts');
  pass('Sign-out clears menu attempts.');
  status.textContent = 'All 6 service-menu scenarios passed.';
} catch (e) {
  status.textContent = `FAILED: ${e instanceof Error ? e.message : e}`;
  console.error(e);
} finally {
  await act(async () => root.unmount());
  Object.assign(menuApi, methods);
  window.fetch = fetchBefore;
  sessionStorage.clear();
  for (const [name, value] of storedSession) sessionStorage.setItem(name, value);
  if (token === null) localStorage.removeItem('af_sc_access_token');
  else localStorage.setItem('af_sc_access_token', token);
}
