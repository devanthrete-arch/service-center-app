import { useEffect, useState, type FormEvent } from 'react';
import { staffApi } from '../domain/client';
import type { Center, CenterPatch } from '../domain/types';
import { errorMessage } from '../lib/api';

type Form = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  formatted: string;
  latitude: string;
  longitude: string;
  googleMapsUrl: string;
  heroImageUrl: string;
  photoUrls: string;
};

function formFrom(center: Center): Form {
  return {
    line1: center.address.line1 ?? '',
    line2: center.address.line2 ?? '',
    city: center.address.city ?? '',
    state: center.address.state ?? '',
    postalCode: center.address.postalCode ?? '',
    formatted: center.address.formatted ?? '',
    latitude:
      center.latitude === null || center.latitude === undefined ? '' : String(center.latitude),
    longitude:
      center.longitude === null || center.longitude === undefined ? '' : String(center.longitude),
    googleMapsUrl: center.googleMapsUrl ?? '',
    heroImageUrl: center.heroImageUrl ?? '',
    photoUrls: (center.photoUrls ?? []).join('\n'),
  };
}

function imageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function googleMapsUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port)
      return false;
    const host = parsed.hostname.toLowerCase();
    const mapsPath = parsed.pathname === '/maps' || parsed.pathname.startsWith('/maps/');
    return (
      (host === 'maps.app.goo.gl' && parsed.pathname !== '/') ||
      (host === 'goo.gl' && mapsPath) ||
      ['maps.google.com', 'maps.google.co.in'].includes(host) ||
      (['google.com', 'www.google.com', 'google.co.in', 'www.google.co.in'].includes(host) &&
        mapsPath)
    );
  } catch {
    return false;
  }
}

function nullable(value: string) {
  return value.trim() || null;
}

function patchFrom(form: Form): CenterPatch {
  const lat = form.latitude.trim();
  const lng = form.longitude.trim();
  if (Boolean(lat) !== Boolean(lng))
    throw new Error('Enter both latitude and longitude, or clear both.');
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const latitude = lat ? Number(lat) : null;
  const longitude = lng ? Number(lng) : null;
  if (
    lat &&
    (!decimal.test(lat) || !Number.isFinite(latitude) || latitude! < -90 || latitude! > 90)
  ) {
    throw new Error('Latitude must be a decimal number between −90 and 90.');
  }
  if (
    lng &&
    (!decimal.test(lng) || !Number.isFinite(longitude) || longitude! < -180 || longitude! > 180)
  ) {
    throw new Error('Longitude must be a decimal number between −180 and 180.');
  }
  const postalCode = nullable(form.postalCode);
  if (postalCode && !/^[1-9]\d{5}$/.test(postalCode))
    throw new Error('Enter a valid six-digit Indian PIN code.');
  const map = nullable(form.googleMapsUrl);
  if (map && !googleMapsUrl(map)) throw new Error('Use an HTTPS Google Maps link.');
  const hero = nullable(form.heroImageUrl);
  if (hero && !imageUrl(hero))
    throw new Error('The cover photo must have an HTTP or HTTPS image URL.');
  const photos = [
    ...new Set(
      form.photoUrls
        .split(/[\r\n]+/)
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  ];
  if (photos.length > 8) throw new Error('Add up to eight gallery photo URLs.');
  if (photos.some((url) => url.length > 1024 || !imageUrl(url))) {
    throw new Error(
      'Each gallery photo needs a valid HTTP or HTTPS image URL, up to 1,024 characters.',
    );
  }
  return {
    addressLine1: nullable(form.line1),
    addressLine2: nullable(form.line2),
    city: nullable(form.city),
    state: nullable(form.state),
    postalCode,
    formattedAddress: nullable(form.formatted),
    latitude,
    longitude,
    googleMapsUrl: map,
    heroImageUrl: hero,
    photoUrls: photos,
  };
}

export function CenterProfileEditor({
  centerId,
  save,
}: {
  centerId: string;
  save: (patch: CenterPatch) => Promise<void>;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setForm(null);
    setLoadError('');
    staffApi
      .center()
      .then((center) => {
        if (live) setForm(formFrom(center));
      })
      .catch((failure) => {
        if (live) setLoadError(errorMessage(failure, 'Could not load the center profile.'));
      });
    return () => {
      live = false;
    };
  }, [centerId, revision]);
  function change(field: keyof Form, value: string) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setError('');
    setSaved(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form || busy) return;
    setError('');
    setSaved(false);
    let patch: CenterPatch;
    try {
      patch = patchFrom(form);
    } catch (failure) {
      setError(errorMessage(failure));
      return;
    }
    setBusy(true);
    try {
      await save(patch);
      setSaved(true);
      setForm((current) =>
        current ? { ...current, photoUrls: patch.photoUrls!.join('\n') } : current,
      );
    } catch (failure) {
      setError(errorMessage(failure, 'Could not save the center profile.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel center-profile-editor" aria-labelledby="center-profile-title">
      <h2 id="center-profile-title">Location and photos</h2>
      <p className="center-profile-help">
        Help customers find your center and see the workshop before booking.
      </p>
      {!form && !loadError && <p role="status">Loading center profile…</p>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Retry center profile
          </button>
        </div>
      )}
      {form && (
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <legend>Center address</legend>
            <label>
              Address line 1
              <input
                value={form.line1}
                maxLength={500}
                autoComplete="address-line1"
                onChange={(event) => change('line1', event.target.value)}
              />
            </label>
            <label>
              Address line 2
              <input
                value={form.line2}
                maxLength={500}
                autoComplete="address-line2"
                onChange={(event) => change('line2', event.target.value)}
              />
            </label>
            <div className="center-profile-fields">
              <label>
                City
                <input
                  value={form.city}
                  maxLength={100}
                  autoComplete="address-level2"
                  onChange={(event) => change('city', event.target.value)}
                />
              </label>
              <label>
                State
                <input
                  value={form.state}
                  maxLength={100}
                  autoComplete="address-level1"
                  onChange={(event) => change('state', event.target.value)}
                />
              </label>
              <label>
                PIN code
                <input
                  value={form.postalCode}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  onChange={(event) => change('postalCode', event.target.value)}
                />
              </label>
            </div>
            <label>
              Address shown to customers
              <textarea
                value={form.formatted}
                maxLength={512}
                onChange={(event) => change('formatted', event.target.value)}
              />
            </label>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Map location</legend>
            <p className="center-profile-help">
              Coordinates let nearby customers discover the center. Enter both, or leave both empty.
              A Maps link alone does not set coordinates.
            </p>
            <div className="center-profile-fields">
              <label>
                Latitude
                <input
                  value={form.latitude}
                  inputMode="decimal"
                  maxLength={50}
                  placeholder="12.9716"
                  onChange={(event) => change('latitude', event.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  value={form.longitude}
                  inputMode="decimal"
                  maxLength={50}
                  placeholder="77.5946"
                  onChange={(event) => change('longitude', event.target.value)}
                />
              </label>
            </div>
            <label>
              Google Maps link
              <input
                type="url"
                value={form.googleMapsUrl}
                maxLength={1024}
                placeholder="https://www.google.com/maps/…"
                onChange={(event) => change('googleMapsUrl', event.target.value)}
              />
            </label>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Workshop photos</legend>
            <p className="center-profile-help">
              Use photos of your own center. Without center photos, customers see clearly labeled
              stock illustrations.
            </p>
            <label>
              Cover photo URL
              <input
                type="url"
                value={form.heroImageUrl}
                maxLength={1024}
                placeholder="https://…"
                onChange={(event) => change('heroImageUrl', event.target.value)}
              />
            </label>
            <label>
              Gallery photo URLs
              <textarea
                value={form.photoUrls}
                maxLength={8 * 1025}
                placeholder="One image URL per line"
                onChange={(event) => change('photoUrls', event.target.value)}
              />
            </label>
            <p className="center-profile-help">
              Up to eight image URLs, one per line. The cover appears first and repeated images
              appear once. Empty fields remove saved photos.
            </p>
          </fieldset>
          {error && (
            <p className="notice red" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="center-profile-saved" role="status">
              Center location and photos saved.
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving center profile…' : 'Save location and photos'}
          </button>
        </form>
      )}
    </section>
  );
}
