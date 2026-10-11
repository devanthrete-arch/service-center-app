import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CenterProfileEditor } from '../src/screens/CenterProfileEditor';
import { staffApi } from '../src/domain/client';
import type { Center, CenterPatch } from '../src/domain/types';
import '../src/styles.css';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fixture = document.getElementById('fixture')!;
const results = document.getElementById('results')!;
const status = document.getElementById('status')!;
let root = createRoot(fixture);
const originalCenter = staffApi.center;
const originalFetch = window.fetch;
window.fetch = async () => {
  throw new Error('Unexpected real network access in center profile fixture');
};
const center: Center = {
  id: 'fixture-center',
  name: 'Fixture workshop',
  displayName: 'Fixture workshop',
  publicPhone: null,
  gstin: null,
  upiVpa: 'workshop@bank',
  expressSkipEnabled: true,
  autoAccept: true,
  slotCapacity: 2,
  address: {
    line1: 'Workshop road',
    line2: 'Near the park',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    formatted: 'Workshop road, Bengaluru 560001',
  },
  latitude: 0,
  longitude: 0,
  heroImageUrl: 'https://example.com/cover.jpg',
  photoUrls: ['https://example.com/front.jpg', 'https://example.com/bay.jpg'],
  googleMapsUrl: 'https://www.google.com/maps/place/Workshop',
};
let loadFails = false;
let saveFails = false;
const patches: CenterPatch[] = [];
staffApi.center = async () => {
  if (loadFails) throw new Error('Profile loading failed in fixture');
  return { ...center, address: { ...center.address }, photoUrls: [...center.photoUrls!] };
};
async function save(patch: CenterPatch) {
  if (saveFails) throw new Error('Profile save failed in fixture');
  patches.push(patch);
}
let count = 0;
function check(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
function pass(message: string) {
  const item = document.createElement('li');
  item.textContent = `PASS: ${message}`;
  results.append(item);
  count++;
}
async function mount() {
  await act(async () => root.unmount());
  root = createRoot(fixture);
  await act(async () =>
    root.render(
      <StrictMode>
        <CenterProfileEditor centerId={center.id} save={save} />
      </StrictMode>,
    ),
  );
}
function field(name: string) {
  const input = [...fixture.querySelectorAll('label')]
    .find((label) => label.firstChild?.textContent?.trim() === name)
    ?.querySelector('input,textarea') as HTMLInputElement | HTMLTextAreaElement | undefined;
  if (!input) throw new Error(`Missing field ${name}`);
  return input;
}
async function fill(name: string, value: string) {
  const input = field(name);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(name = 'Save location and photos') {
  const button = [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === name,
  );
  check(button, `Missing button ${name}`);
  await act(async () => button!.click());
}
function lastPatch() {
  return patches[patches.length - 1];
}
try {
  await mount();
  check(
    field('Address line 1').value === 'Workshop road' &&
      field('State').value === 'Karnataka' &&
      field('Latitude').value === '0' &&
      field('Longitude').value === '0' &&
      field('Gallery photo URLs').value.includes('front.jpg'),
    'The editor must load the full center rather than start with incomplete staff summary data',
  );
  await click();
  check(
    patches.length === 1 &&
      lastPatch().latitude === 0 &&
      lastPatch().longitude === 0 &&
      lastPatch().addressLine2 === 'Near the park' &&
      !('upiVpa' in lastPatch()) &&
      !('expressSkipEnabled' in lastPatch()),
    'Saving location and photos must preserve zero coordinates and omit unrelated UPI/workflow settings',
  );
  pass(
    'The full center loads without losing address/photos; saving preserves zero coordinates and leaves unrelated settings out of the command.',
  );

  await fill('Latitude', '12.5oops');
  await click();
  check(
    patches.length === 1 && fixture.textContent?.includes('Latitude must be a decimal number'),
    'Malformed latitude must not become NaN serialized as null',
  );
  await fill('Latitude', '91');
  await click();
  check(
    patches.length === 1 && fixture.textContent?.includes('Latitude must be a decimal number'),
    'Out-of-range latitude must block save',
  );
  await fill('Latitude', '');
  await click();
  check(
    patches.length === 1 && fixture.textContent?.includes('Enter both latitude and longitude'),
    'A single empty coordinate must not clear only half the pair',
  );
  await fill('Longitude', '');
  await click();
  check(
    lastPatch().latitude === null && lastPatch().longitude === null,
    'An intentionally empty pair must clear both stored coordinates',
  );
  pass(
    'Malformed, out-of-range and unpaired coordinates are rejected; an empty pair explicitly clears both.',
  );

  const beforeInvalidMap = patches.length;
  await fill('Google Maps link', 'https://www.google.com.evil.test/maps/place/Workshop');
  await click();
  check(
    patches.length === beforeInvalidMap &&
      fixture.textContent?.includes('Use an HTTPS Google Maps link.'),
    'A lookalike Maps host must be rejected',
  );
  await fill('Google Maps link', 'https://user:password@www.google.com/maps/place/Workshop');
  await click();
  check(patches.length === beforeInvalidMap, 'Maps URLs containing credentials must be rejected');
  await fill('Google Maps link', 'https://www.google.com:444/maps/place/Workshop');
  await click();
  check(patches.length === beforeInvalidMap, 'Nonstandard Maps ports must be rejected');
  await fill('Google Maps link', 'https://maps.app.goo.gl/example');
  await click();
  check(
    lastPatch().googleMapsUrl === 'https://maps.app.goo.gl/example',
    'An allowed short Maps link must be accepted',
  );
  pass(
    'Maps links use the agreed HTTPS allowlist and reject lookalike hosts, credentials and nondefault ports.',
  );

  await fill(
    'Gallery photo URLs',
    ' https://example.com/front.jpg \nhttps://example.com/bay.jpg\nhttps://example.com/front.jpg\n',
  );
  await click();
  check(
    lastPatch().photoUrls?.length === 2 &&
      field('Gallery photo URLs').value ===
        'https://example.com/front.jpg\nhttps://example.com/bay.jpg',
    'Gallery duplicates must be normalized without duplicate displayed photos',
  );
  const beforeTooMany = patches.length;
  await fill(
    'Gallery photo URLs',
    Array.from({ length: 9 }, (_, index) => `https://example.com/photo-${index}.jpg`).join('\n'),
  );
  await click();
  check(
    patches.length === beforeTooMany &&
      fixture.textContent?.includes('Add up to eight gallery photo URLs.'),
    'A ninth distinct gallery photo must block save',
  );
  await fill('Gallery photo URLs', 'javascript:alert(1)');
  await click();
  check(
    patches.length === beforeTooMany &&
      fixture.textContent?.includes('Each gallery photo needs a valid HTTP or HTTPS'),
    'Non-image URL schemes must not reach the save command',
  );
  pass(
    'Gallery URLs are trimmed and deduplicated; size limits and unsafe schemes block submission.',
  );

  await fill('Gallery photo URLs', '');
  await fill('Cover photo URL', '');
  await fill('Google Maps link', '');
  await fill('City', '');
  await fill('State', '');
  await fill('PIN code', '');
  await fill('Address line 1', '');
  await fill('Address line 2', '');
  await fill('Address shown to customers', '');
  await click();
  check(
    lastPatch().heroImageUrl === null &&
      lastPatch().googleMapsUrl === null &&
      lastPatch().photoUrls?.length === 0 &&
      lastPatch().city === null &&
      lastPatch().state === null &&
      lastPatch().postalCode === null &&
      lastPatch().addressLine1 === null &&
      lastPatch().formattedAddress === null,
    'Empty fields must send explicit clears instead of leaving old customer-facing values in place',
  );
  pass('Empty photo, map and address fields send explicit null/empty-array clears.');

  saveFails = true;
  await fill('City', 'Pune');
  await fill('Address shown to customers', 'Unsaved customer-facing address');
  await click();
  check(
    field('City').value === 'Pune' &&
      field('Address shown to customers').value === 'Unsaved customer-facing address' &&
      fixture.textContent?.includes('Profile save failed in fixture'),
    'A failed save must keep the manager’s unsaved profile changes editable',
  );
  saveFails = false;
  await click();
  check(
    lastPatch().city === 'Pune' &&
      fixture.textContent?.includes('Center location and photos saved.'),
    'Retry must save the preserved editor draft',
  );
  pass('A failed save preserves the edited profile for a successful retry.');

  loadFails = true;
  await mount();
  check(
    !fixture.querySelector('form') &&
      fixture.textContent?.includes('Profile loading failed in fixture'),
    'A failed full-center load must not offer a blank destructive form',
  );
  loadFails = false;
  await click('Retry center profile');
  check(
    field('City').value === 'Bengaluru' && field('Cover photo URL').value === center.heroImageUrl,
    'Retrying a failed load must recover the actual full center data',
  );
  pass(
    'Load failure blocks editing; retry recovers the existing center profile rather than saving blank defaults.',
  );
  status.textContent = `All ${count} center profile scenarios passed.`;
} catch (error) {
  status.textContent = `FAILED: ${error instanceof Error ? error.message : error}`;
  console.error(error);
} finally {
  await act(async () => root.unmount());
  staffApi.center = originalCenter;
  window.fetch = originalFetch;
}
