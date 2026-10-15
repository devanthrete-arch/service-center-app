import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { WalkInFlow, canReceiveWalkIn } from '../src/screens/WalkIn';
import type { CreatedJob, IntakeCustomer, IntakeVehicle, Me } from '../src/domain/types';
import {
  clearWalkInAttempts,
  normalizeIndiaPhone,
  readWalkInAttempt,
  saveWalkInAttempt,
  walkInKey,
} from '../src/lib/walk-in';
import { setAccessToken, signOut } from '../src/lib/session';
import '../src/styles.css';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fixture = document.getElementById('fixture')!;
const status = document.getElementById('status')!;
const results = document.getElementById('results')!;
let root = createRoot(fixture);
const originalFetch = window.fetch;
const originalSession = Object.entries(sessionStorage);
const originalToken = localStorage.getItem('af_sc_access_token');
const customer: IntakeCustomer = {
  id: '10000000-0000-4000-8000-000000000001',
  revision: 1,
  name: 'Returning owner',
  phone: '+919876543210',
  accountLinkState: 'ACCOUNT_LINKED',
};
const car: IntakeVehicle = {
  id: '20000000-0000-4000-8000-000000000001',
  revision: 2,
  registrationNumber: 'KA01AB1234',
  makeModel: 'Hyundai i20',
  vehicleType: 'FOUR_WHEELER',
  hasActiveJob: false,
};
const bike: IntakeVehicle = {
  ...car,
  id: '20000000-0000-4000-8000-000000000002',
  registrationNumber: 'KA02CD4321',
  makeModel: 'Honda Activa',
  vehicleType: 'TWO_WHEELER',
};
const made: CreatedJob = {
  id: '30000000-0000-4000-8000-000000000001',
  jobNumber: 'AF-TEST-1',
  status: 'CHECKED_IN',
};
const me: Me = {
  staff: {
    id: 'test-staff',
    displayName: 'Advisor',
    designation: 'ADVISOR',
    employeeCode: null,
    isActive: true,
  },
  center: {
    id: 'test-center',
    name: 'Test center',
    displayName: 'Test center',
    publicPhone: null,
    gstin: null,
    upiVpa: null,
    expressSkipEnabled: false,
    address: { city: 'Bengaluru', formatted: null },
    autoAccept: true,
    slotCapacity: 4,
  },
  roles: ['advisor'],
  permissions: ['jobs:create', 'jobs:read'],
};
const storageKey = walkInKey(me.staff.id, me.center.id);
let persona = me;
let rows = [car, bike];
let lookupMode: 'found' | 'missing' | 'unlinked' | 'fail' | 'slow' = 'found';
let plateMode: 'new' | 'same' | 'conflict' | 'slow' = 'new';
let createMode: 'normal' | 'lost' | 'stale' | 'active' | 'deleted' = 'normal';
let paginate = false;
let unresolved = false;
let refreshFails = false;
let priorMissing = false;
let createCount = 0;
let lookupCalls = 0;
let statusCalls = 0;
let pageCalls = 0;
let refreshCount = 0;
let priorCalls = 0;
let delayed: (() => void) | null = null;
const commands: { key: string; body: string }[] = [];
const receipts = new Map<string, CreatedJob>();
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  const path = url.pathname;
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  if (path === '/v1/center/customers/lookup') {
    lookupCalls += 1;
    if (lookupMode === 'slow')
      return new Promise<Response>((resolve) => {
        delayed = () => resolve(Response.json({ status: 'FOUND', customer }));
      });
    if (lookupMode === 'fail')
      return Response.json({ message: 'Injected lookup failure' }, { status: 500 });
    if (lookupMode === 'missing') return Response.json({ status: 'NOT_FOUND' });
    return Response.json({
      status: 'FOUND',
      customer:
        lookupMode === 'unlinked' ? { ...customer, accountLinkState: 'LINK_REQUIRED' } : customer,
    });
  }
  if (path.endsWith('/vehicles')) {
    pageCalls += 1;
    return Response.json({
      customerRevision: 1,
      items: paginate ? (url.searchParams.has('cursor') ? [bike] : [car]) : rows,
      nextCursor: paginate && !url.searchParams.has('cursor') ? car.id : null,
    });
  }
  if (path.endsWith('/vehicle-lookup')) {
    if (plateMode === 'slow')
      return new Promise<Response>((resolve) => {
        delayed = () =>
          resolve(
            Response.json({
              status: 'NOT_FOUND',
              registrationNumber: body.registrationNumber,
              customerRevision: 1,
            }),
          );
      });
    if (plateMode === 'conflict')
      return Response.json(
        {
          code: 'VEHICLE_CUSTOMER_CONFLICT',
          message: 'This vehicle is already registered to another account.',
        },
        { status: 409 },
      );
    if (plateMode === 'same')
      return Response.json({
        status: 'FOUND',
        vehicle: car,
        customerRevision: 1,
      });
    return Response.json({
      status: 'NOT_FOUND',
      registrationNumber: body.registrationNumber,
      customerRevision: 1,
    });
  }
  if (path === '/v1/center/walk-ins/attempt-status') {
    statusCalls += 1;
    const job = receipts.get(String(body.idempotencyKey));
    return Response.json(
      job && !unresolved ? { status: 'CREATED', job } : { status: 'UNRESOLVED' },
    );
  }
  if (path === '/v1/jobs' && init?.method === 'POST') {
    const key = new Headers(init.headers).get('Idempotency-Key')!;
    commands.push({ key, body: String(init.body) });
    if (createMode === 'deleted')
      return Response.json({ message: 'Job unavailable' }, { status: 404 });
    if (receipts.has(key)) return Response.json(receipts.get(key), { status: 201 });
    if (createMode === 'stale')
      return Response.json(
        {
          code: 'VEHICLE_SELECTION_CHANGED',
          message: 'Vehicle selection changed. Confirm again.',
        },
        { status: 409 },
      );
    if (createMode === 'active')
      return Response.json(
        {
          code: 'ACTIVE_JOB_EXISTS',
          message: 'An active visit already exists.',
        },
        { status: 409 },
      );
    createCount += 1;
    receipts.set(key, { ...made });
    if (createMode === 'lost') {
      createMode = 'normal';
      throw new Error('Response lost after commit');
    }
    return Response.json(made, { status: 201 });
  }
  if (path.startsWith('/v1/jobs/')) {
    priorCalls += 1;
    return priorMissing
      ? Response.json({ message: 'Earlier job unavailable' }, { status: 404 })
      : Response.json({
          ...made,
          status: 'COMPLETED',
          customer: { name: customer.name, phone: customer.phone },
          vehicle: {
            registrationNumber: car.registrationNumber,
            makeModel: car.makeModel,
          },
        });
  }
  throw new Error(`Unexpected fixture request ${path}`);
};
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
function pass(name: string) {
  const item = document.createElement('li');
  item.textContent = `PASS: ${name}`;
  results.append(item);
}
const text = () => fixture.textContent ?? '';
function button(name: string) {
  const found = [...fixture.querySelectorAll('button')].find(
    (row) => row.textContent?.trim() === name,
  );
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
}
async function click(name: string) {
  await act(async () => {
    button(name).click();
  });
  if (['Open job card', 'Retry saved creation', 'Check creation result'].includes(name)) {
    await eventually(
      () =>
        Boolean(fixture.querySelector('.intake-result')) ||
        Boolean(fixture.querySelector('.notice.red')) ||
        text().includes('No completed result is available yet'),
      'Command never settled',
    );
  }
}
async function eventually(predicate: () => boolean, message: string) {
  for (let count = 0; count < 100; count += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
  }
  throw new Error(message);
}
function control(name: string) {
  const found = fixture.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `[aria-label="${name}"]`,
  );
  if (!found) throw new Error(`Missing control ${name}`);
  return found;
}
async function fill(name: string, value: string) {
  await act(async () => {
    const input = control(name);
    const prototype =
      input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(
      new Event(input instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}
async function choose(plate: string) {
  await act(async () => {
    const label = [...fixture.querySelectorAll('label')].find((row) =>
      row.textContent?.includes(plate),
    );
    check(label, `Missing vehicle ${plate}`);
    label!.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
  });
}
async function mount(comebackId?: string) {
  await act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter>
          <WalkInFlow
            key={`${persona.staff.id}:${persona.center.id}`}
            me={persona}
            technicians={[]}
            comebackId={comebackId}
            refresh={async () => {
              refreshCount += 1;
              if (refreshFails) throw new Error('Injected workshop read failure');
            }}
          />
        </MemoryRouter>
      </StrictMode>,
    ),
  );
}
async function remount(comebackId?: string) {
  await act(async () => root.unmount());
  root = createRoot(fixture);
  await mount(comebackId);
}
async function clean(comebackId?: string) {
  clearWalkInAttempts();
  lookupMode = 'found';
  plateMode = 'new';
  createMode = 'normal';
  rows = [car, bike];
  persona = me;
  paginate = false;
  unresolved = false;
  refreshFails = false;
  priorMissing = false;
  delayed = null;
  commands.length = 0;
  receipts.clear();
  createCount = lookupCalls = statusCalls = pageCalls = refreshCount = priorCalls = 0;
  await remount(comebackId);
}
async function customerStep() {
  await fill('Owner mobile', '+91 98765-43210');
  await click('Find customer');
  check(
    !fixture.querySelector('input[type="radio"]'),
    'Lookup must require explicit customer confirmation',
  );
  await click('Use this customer');
}
async function ready() {
  await customerStep();
  await choose(car.registrationNumber);
  await fill('Customer request', 'Inspect brake noise');
  await click('Continue');
}
try {
  setAccessToken('fixture-walk-in-token');
  check(
    normalizeIndiaPhone('+91 98765-43210') === customer.phone &&
      normalizeIndiaPhone('919876543210') === customer.phone,
    'Country prefix failed',
  );
  check(
    normalizeIndiaPhone('1239876543210') === null && normalizeIndiaPhone('a9876543210') === null,
    'Phone truncated or accepted letters',
  );
  await clean();
  await fill('Owner mobile', '1239876543210');
  check(button('Find customer').disabled && lookupCalls === 0, 'Invalid mobile initiated lookup');
  pass('Phone prefixes preserve the full number and invalid input never truncates.');

  await clean();
  await ready();
  check(controlExists('Vehicle type') === false, 'Review should not offer identity editing');
  await click('Open job card');
  check(text().includes('JOB CREATED') && createCount === 1, 'Returning visit not acknowledged');
  const saved = JSON.parse(commands[0].body) as Record<string, unknown>;
  check(
    saved.customerId === customer.id &&
      saved.vehicleId === car.id &&
      saved.vehicleRevision === car.revision,
    'Wrong saved selectors',
  );
  check(
    !('customerPhone' in saved) && !('vehicleType' in saved) && !('confirmedVehicleType' in saved),
    'Known car identity could drift',
  );
  pass(
    'Returning customer confirmation uses the chosen saved four-wheeler without rewriting identity.',
  );

  await clean();
  lookupMode = 'slow';
  await fill('Owner mobile', '9876543210');
  await click('Find customer');
  await fill('Owner mobile', '9765432109');
  await act(async () => delayed?.());
  check(
    !text().includes('Returning owner') && !text().includes('Use this customer'),
    'Late lookup restored old customer',
  );
  pass('Late customer response is ignored after the phone changes.');

  await clean();
  rows = [{ ...car, vehicleType: null }];
  await customerStep();
  await choose(car.registrationNumber);
  await fill('Customer request', 'Inspect noise');
  check(button('Continue').disabled, 'Unknown type defaulted');
  await fill('Vehicle type', 'FOUR_WHEELER');
  await click('Continue');
  await click('Open job card');
  check(
    JSON.parse(commands[0].body).confirmedVehicleType === 'FOUR_WHEELER',
    'Explicit unknown-type confirmation missing',
  );
  pass('Unknown historical vehicle type requires explicit confirmation.');

  await clean();
  paginate = true;
  await customerStep();
  check(!text().includes(bike.registrationNumber), 'Page one leaked page two');
  await click('Load more vehicles');
  check(text().includes(bike.registrationNumber) && pageCalls === 2, 'Pagination missing');
  pass('Saved vehicles have explicit pagination rather than an invisible first-page limit.');

  await clean();
  await customerStep();
  await choose('Another vehicle');
  await fill('Registration', 'KA09ZZ9999');
  await fill('Vehicle type', 'TWO_WHEELER');
  await fill('Customer request', 'Inspect brakes');
  check(button('Continue').disabled, 'Unvalidated plate proceeded');
  await click('Check plate');
  await click('Continue');
  await click('Open job card');
  check(
    JSON.parse(commands[0].body).newVehicle.registrationNumber === 'KA09ZZ9999',
    'New vehicle selector missing',
  );
  pass(
    'Another vehicle requires plate precheck and an explicit type; RC verification remains clearly pending.',
  );

  await clean();
  plateMode = 'same';
  await customerStep();
  await choose('Another vehicle');
  await fill('Registration', 'KA01-AB1234');
  await click('Check plate');
  check(
    (control('Vehicle type') as HTMLInputElement).readOnly &&
      text().includes('existing record is selected'),
    'Same-owner plate not resolved',
  );
  pass('An already saved plate selects its existing vehicle instead of creating a duplicate.');

  await clean();
  plateMode = 'conflict';
  await customerStep();
  await choose('Another vehicle');
  await fill('Registration', 'KA09ZZ9999');
  await click('Check plate');
  check(
    text().includes('another account') &&
      button('Continue').disabled &&
      !text().includes('Other owner'),
    'Conflict leaked owner or proceeded',
  );
  pass('A conflicting plate blocks intake without disclosing another owner.');

  await clean();
  lookupMode = 'fail';
  await fill('Owner mobile', '9876543210');
  await click('Find customer');
  check(
    text().includes('Injected lookup failure') && !text().includes('New customer'),
    'Read failure became no-match',
  );
  pass('Lookup failure remains retryable and never becomes false registration eligibility.');

  for (const mode of ['missing', 'unlinked'] as const) {
    await clean();
    lookupMode = mode;
    await fill('Owner mobile', '9876543210');
    await click('Find customer');
    check(
      text().includes('registration') &&
        !text().includes('Use this customer') &&
        !text().includes('Open job card'),
      'Registration handoff bypassed',
    );
  }
  pass('Unknown and unlinked center contacts stop at the explicit registration handoff.');

  await clean();
  await customerStep();
  await choose(car.registrationNumber);
  await fill('Customer request', 'Keep these notes');
  await fill('Odometer (km)', '12345');
  await fill('Fuel', 'Full');
  await click('Continue');
  await fill('Accessories', 'Helmet');
  await click('Back');
  check(
    control('Customer request').value === 'Keep these notes' &&
      control('Odometer (km)').value === '12345',
    'Back erased visit details',
  );
  await choose(bike.registrationNumber);
  check(
    control('Customer request').value === 'Keep these notes' &&
      control('Odometer (km)').value === '' &&
      control('Fuel').value === '',
    'Vehicle switch copied physical facts',
  );
  await click('Continue');
  check(control('Accessories').value === '', 'Vehicle switch copied accessories');
  pass('Back preserves notes; switching actual vehicles clears odometer, fuel and accessories.');

  await clean();
  await customerStep();
  await choose(car.registrationNumber);
  await fill('Customer request', 'Preserve the same visit');
  await fill('Odometer (km)', '15500');
  await click('Back');
  await click('Find customer');
  await click('Use this customer');
  await choose(car.registrationNumber);
  check(
    control('Customer request').value === 'Preserve the same visit' &&
      control('Odometer (km)').value === '15500',
    'Reconfirming the same saved vehicle erased its physical intake',
  );
  pass('Reconfirming the same customer and vehicle preserves already captured visit facts.');

  await clean();
  refreshFails = true;
  await ready();
  await click('Open job card');
  check(
    text().includes('JOB CREATED') &&
      text().includes('could not refresh') &&
      !text().includes('Open job card'),
    'Read failure became failed creation',
  );
  pass('Successful creation survives a failed workshop refresh and offers only the created job.');

  await clean();
  await ready();
  await act(async () => {
    const open = button('Open job card');
    open.click();
    open.click();
  });
  await eventually(() => text().includes('JOB CREATED'), 'Double click never completed');
  check(commands.length === 1 && createCount === 1, 'Double click created multiple attempts');
  pass('A synchronous submission guard sends one command for a double click.');

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  const lost = commands[0];
  check(readWalkInAttempt(storageKey)?.key === lost.key, 'Uncertain attempt not retained');
  await remount();
  check(text().includes('Confirm the earlier creation attempt'), 'Remount lost recovery');
  await click('Retry saved creation');
  check(
    commands[1].key === lost.key && commands[1].body === lost.body && createCount === 1,
    'Retry changed body/key or duplicated',
  );
  check(text().includes('JOB CREATED') && !readWalkInAttempt(storageKey), 'Replay not resolved');
  pass('Lost response survives remount and exact key/body retry creates no second job.');

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  const pending = readWalkInAttempt(storageKey)!;
  receipts.set(pending.key, { ...made, status: 'COMPLETED' });
  saveWalkInAttempt(storageKey, {
    ...pending,
    createdAt: Date.now() - 31 * 60_000,
  });
  await remount();
  check(
    text().includes('details have expired') && !text().includes('Retry saved creation'),
    'Expired personal body restored',
  );
  check(readWalkInAttempt(storageKey)?.bodyText === null, 'Expired body persisted');
  await click('Check creation result');
  check(
    text().includes('JOB CREATED') && commands.length === 1 && statusCalls === 1,
    'Closed-job recovery rewrote or failed',
  );
  pass(
    'Expired body is removed while its handle recovers a completed job through a read-only status call.',
  );

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  const unresolvedAttempt = readWalkInAttempt(storageKey)!;
  saveWalkInAttempt(storageKey, {
    ...unresolvedAttempt,
    createdAt: Date.now() - 31 * 60_000,
  });
  unresolved = true;
  await remount();
  await click('Check creation result');
  check(
    text().includes('does not prove creation failed') &&
      readWalkInAttempt(storageKey) &&
      button('Find customer').closest('fieldset')?.disabled,
    'Missing receipt permitted new creation',
  );
  pass('An unresolved expired attempt keeps intake blocked pending reconciliation.');

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  const realNow = Date.now;
  try {
    const later = realNow() + 31 * 60_000;
    Date.now = () => later;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    check(
      readWalkInAttempt(storageKey)?.bodyText === null && !text().includes('Retry saved creation'),
      'Wake did not expire active personal body',
    );
  } finally {
    Date.now = realNow;
  }
  pass(
    'Waking an active tab expires personal details and removes exact retry while retaining the result handle.',
  );

  await clean();
  createMode = 'lost';
  await ready();
  const originalSetItem = Storage.prototype.setItem;
  try {
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('af-sc:walk-in-attempt:')) throw new Error('Storage unavailable');
      return originalSetItem.call(this, key, value);
    };
    await click('Open job card');
    check(
      text().includes('this tab only') && readWalkInAttempt(storageKey)?.bodyText,
      'Unavailable storage did not preserve/explain in-memory recovery',
    );
    await click('Retry saved creation');
    check(
      createCount === 1 && text().includes('JOB CREATED'),
      'In-memory exact retry duplicated or failed',
    );
  } finally {
    Storage.prototype.setItem = originalSetItem;
  }
  pass(
    'Unavailable session storage keeps exact retry in memory and explains the tab-close limitation.',
  );

  await clean();
  persona = { ...me, permissions: ['jobs:create'] };
  await remount();
  await ready();
  await click('Open job card');
  check(
    text().includes('JOB CREATED') &&
      text().includes('colleague with job access') &&
      !text().includes('Open created job'),
    'Create-only creator lost acknowledgement or saw forbidden navigation',
  );
  pass('Creation-only staff receive a narrow success and authorized-colleague handoff.');

  await clean();
  createMode = 'stale';
  await ready();
  await click('Open job card');
  check(
    !readWalkInAttempt(storageKey) &&
      control('Customer request').value === 'Inspect brake noise' &&
      button('Continue').disabled,
    'Stale selection erased notes or stayed ready',
  );
  pass(
    'A rejected stale selection clears only the selection and keeps visit notes for reconfirmation.',
  );

  await clean();
  createMode = 'active';
  persona = { ...me, permissions: ['jobs:create'] };
  await remount();
  await ready();
  await click('Open job card');
  check(
    button('Continue').disabled && text().includes('No second card'),
    'Hidden active-job reference did not block',
  );
  pass(
    'An active-visit conflict remains blocking even without permission to read the existing job.',
  );

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  createMode = 'deleted';
  await click('Retry saved creation');
  check(
    readWalkInAttempt(storageKey) && !text().includes('JOB CREATED'),
    'Unavailable replay authorized recreation',
  );
  pass('A deleted/unavailable replay keeps its unresolved handle for manual reconciliation.');

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  await act(async () => signOut());
  check(
    !readWalkInAttempt(storageKey) && control('Owner mobile').value === '',
    'Sign-out left intake data',
  );
  setAccessToken('fixture-walk-in-token');
  pass('Sign-out clears the attempt and personal intake state.');

  await clean();
  await customerStep();
  await choose('Another vehicle');
  plateMode = 'slow';
  await fill('Registration', 'KA09ZZ9999');
  await click('Check plate');
  await fill('Registration', 'KA08YY8888');
  await act(async () => delayed?.());
  check(
    !text().includes('No matching center vehicle found') &&
      control('Registration').value === 'KA08YY8888',
    'Late plate result validated another plate',
  );
  pass('Late plate results cannot validate a changed registration.');

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  persona = { ...me, center: { ...me.center, id: 'different-center' } };
  await mount();
  check(
    !readWalkInAttempt(storageKey) && control('Owner mobile').value === '',
    'Center switch reused personal context',
  );
  pass('Changing center clears the previous center attempt and starts a clean identity context.');

  await clean();
  createMode = 'lost';
  await ready();
  await click('Open job card');
  persona = { ...me, permissions: ['jobs:read'] };
  await mount();
  check(
    !readWalkInAttempt(storageKey) && text().includes('Intake access required'),
    'Permission loss preserved a sensitive retry command',
  );
  pass('Permission loss removes the sensitive attempt and closes intake.');

  check(
    !canReceiveWalkIn({ ...me, roles: ['technician'] }) &&
      !canReceiveWalkIn({ ...me, permissions: ['jobs:read'] }),
    'Route authority accepted technician or missing permission',
  );
  await clean();
  persona = { ...me, roles: ['technician'] };
  await remount();
  check(
    text().includes('Intake access required') && !text().includes('Find customer'),
    'Direct route not blocked',
  );
  pass('Intake guards require both desk role and create permission.');

  await clean();
  await remount(made.id);
  await eventually(
    () => control('Owner mobile').value === customer.phone,
    'Completed prior job was not fetched directly',
  );
  check(priorCalls > 0, 'Prior job was not fetched');
  await clean();
  priorMissing = true;
  await remount(made.id);
  await eventually(
    () => text().includes('Earlier job unavailable'),
    'Missing prior job did not settle',
  );
  check(
    button('Find customer').closest('fieldset')?.disabled,
    'Missing comeback became ordinary intake',
  );
  pass('Comeback loads the explicit prior job and blocks an unavailable reference.');

  status.textContent = `Passed ${results.children.length} returning-intake scenarios.`;
} catch (err) {
  status.textContent = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  throw err;
} finally {
  await act(async () => root.unmount());
  window.fetch = originalFetch;
  clearWalkInAttempts();
  sessionStorage.clear();
  originalSession.forEach(([key, value]) => sessionStorage.setItem(key, value));
  if (originalToken) localStorage.setItem('af_sc_access_token', originalToken);
  else localStorage.removeItem('af_sc_access_token');
}
function controlExists(name: string) {
  return fixture.querySelector(`[aria-label="${name}"]`) !== null;
}
