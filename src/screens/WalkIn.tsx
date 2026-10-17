import { RegistrationHandoff } from './RegistrationHandoff';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../domain/store';
import { staffApi } from '../domain/client';
import type {
  CreatedJob,
  IntakeCustomer,
  IntakeVehicle,
  IntakeVehicleType,
  JobDetail,
  Me,
  StaffMember,
  WalkInInput,
} from '../domain/types';
import { ApiError, errorMessage } from '../lib/api';
import { SIGNED_OUT_EVENT } from '../lib/session';
import {
  normalizeIndiaPhone,
  normalizePlate,
  prepareWalkInAttempt,
  readWalkInAttempt,
  removeWalkInAttempt,
  retainWalkInIdentity,
  saveWalkInAttempt,
  walkInApi,
  walkInKey,
  type WalkInAttempt,
} from '../lib/walk-in';
import { Badge, ErrorText } from './ui';

export function canReceiveWalkIn(me: Me) {
  return (
    me.permissions.includes('jobs:create') &&
    me.roles.some((role) => ['admin', 'manager', 'advisor'].includes(role))
  );
}
export function WalkIn({ urgent = false }: { urgent?: boolean }) {
  const { me, technicians, refresh } = useStore();
  const [params] = useSearchParams();
  if (!canReceiveWalkIn(me))
    return (
      <section className="form-card">
        <h2>Intake access required</h2>
        <p>
          An administrator, manager or advisor with intake permission must receive this vehicle.
        </p>
      </section>
    );
  return (
    <WalkInFlow
      key={`${me.staff.id}:${me.center.id}:${params.get('comeback') ?? ''}:${urgent}`}
      me={me}
      technicians={technicians}
      urgent={urgent}
      comebackId={params.get('comeback')}
      refresh={refresh}
    />
  );
}
function localReadyTime() {
  const date = new Date(Date.now() + 4 * 3_600_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const typeLabel = (type: IntakeVehicleType | null | '') =>
  type === 'TWO_WHEELER'
    ? 'Two-wheeler'
    : type === 'FOUR_WHEELER'
      ? 'Four-wheeler'
      : 'Type needs confirmation';
type Props = {
  me: Me;
  technicians: StaffMember[];
  urgent?: boolean;
  comebackId?: string | null;
  refresh?: () => Promise<void>;
};
export function WalkInFlow({ me, technicians, urgent = false, comebackId = null, refresh }: Props) {
  const navigate = useNavigate();
  const storageKey = walkInKey(me.staff.id, me.center.id);
  const canRead = me.permissions.includes('jobs:read');
  const allowed = canReceiveWalkIn(me);
  const live = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const physicalVehicleIdentity = useRef<string | null>(null);
  const lookupController = useRef<AbortController | null>(null);
  const resultController = useRef<AbortController | null>(null);
  const focusResult = useRef<HTMLDivElement>(null);
  const customerResult = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [match, setMatch] = useState<IntakeCustomer | null>(null);
  const [customer, setCustomer] = useState<IntakeCustomer | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'found' | 'not-found'>('idle');
  const [vehicles, setVehicles] = useState<IntakeVehicle[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicle, setVehicle] = useState<IntakeVehicle | null>(null);
  const [another, setAnother] = useState(false);
  const [registration, setRegistration] = useState('');
  const [plateReady, setPlateReady] = useState(false);
  const [checkingPlate, setCheckingPlate] = useState(false);
  const [confirmedType, setConfirmedType] = useState<IntakeVehicleType | ''>('');
  const [makeModel, setMakeModel] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<WalkInAttempt | null>(() => readWalkInAttempt(storageKey));
  const [created, setCreated] = useState<CreatedJob | null>(null);
  const [prior, setPrior] = useState<JobDetail | null>(null);
  const [priorLoading, setPriorLoading] = useState(Boolean(comebackId));
  const [priorError, setPriorError] = useState('');
  const [priorReload, setPriorReload] = useState(0);
  const [activeJob, setActiveJob] = useState<CreatedJob | null>(null);
  const [activeBlocked, setActiveBlocked] = useState(false);
  const [data, setData] = useState({
    request: '',
    serviceType: urgent ? 'Breakdown' : comebackId ? 'Comeback' : 'Periodic service',
    odometerKm: '',
    fuelLevel: '',
    accessories: '',
    estimatedReadyAt: localReadyTime(),
    budgetCeiling: '',
    waitingOnSite: false,
    assignedTechnicianId: '',
    warrantyIntent: Boolean(comebackId),
  });
  const normalizedPhone = normalizeIndiaPhone(phone);
  const type = vehicle?.vehicleType ?? confirmedType;
  const vehicleReady =
    customer &&
    (vehicle || (another && plateReady)) &&
    type &&
    !vehicle?.hasActiveJob &&
    !activeBlocked;
  const locked = Boolean(attempt) || busy;
  const validNumber = (value: string, integer = false) =>
    value === '' ||
    (Number.isFinite(Number(value)) &&
      Number(value) >= 0 &&
      (!integer || Number.isSafeInteger(Number(value))));
  const validVisit =
    data.request.trim().length > 0 &&
    data.request.trim().length <= 2000 &&
    validNumber(data.odometerKm, true) &&
    validNumber(data.budgetCeiling) &&
    data.estimatedReadyAt !== '' &&
    Number.isFinite(new Date(data.estimatedReadyAt).getTime());

  const cancelLookup = () => {
    generation.current += 1;
    lookupController.current?.abort();
    lookupController.current = null;
  };
  const startLookup = () => {
    cancelLookup();
    const controller = new AbortController();
    lookupController.current = controller;
    return { controller, ticket: generation.current };
  };
  const current = (ticket: number) => live.current && generation.current === ticket;
  const resetPhysical = () =>
    setData((value) => ({
      ...value,
      odometerKm: '',
      fuelLevel: '',
      accessories: '',
    }));
  const confirmPhysicalVehicle = (identity: string) => {
    if (physicalVehicleIdentity.current && physicalVehicleIdentity.current !== identity)
      resetPhysical();
    physicalVehicleIdentity.current = identity;
  };
  const resetVehicle = () => {
    setVehicle(null);
    setAnother(false);
    setRegistration('');
    setPlateReady(false);
    setConfirmedType('');
    setMakeModel('');
    setActiveJob(null);
    setActiveBlocked(false);
  };
  const resetCustomer = () => {
    setMatch(null);
    setCustomer(null);
    setVehicles([]);
    setCursor(null);
    setVehiclesLoaded(false);
    setLoadingVehicles(false);
    setCheckingPlate(false);
    resetVehicle();
  };
  const deny = (err: unknown) => {
    if (err instanceof ApiError && [401, 403].includes(err.status)) {
      removeWalkInAttempt(storageKey);
      setAttempt(null);
      resetCustomer();
      setPhone('');
      physicalVehicleIdentity.current = null;
      setData((value) => ({
        ...value,
        request: '',
        accessories: '',
        odometerKm: '',
        fuelLevel: '',
        budgetCeiling: '',
      }));
      setStep(1);
      setMessage('');
      setError(
        err.status === 401
          ? 'Sign in again to receive this vehicle.'
          : 'Intake access is no longer available. Ask an authorized colleague.',
      );
      return true;
    }
    return false;
  };
  useEffect(() => {
    live.current = true;
    retainWalkInIdentity(storageKey);
    const signedOut = () => {
      cancelLookup();
      resultController.current?.abort();
      removeWalkInAttempt(storageKey);
      setAttempt(null);
      resetCustomer();
      setPhone('');
      physicalVehicleIdentity.current = null;
      setData((value) => ({
        ...value,
        request: '',
        accessories: '',
        odometerKm: '',
        fuelLevel: '',
        budgetCeiling: '',
      }));
      setCreated(null);
      setStep(1);
      setLookup('idle');
      setMessage('');
      setError('');
    };
    window.addEventListener(SIGNED_OUT_EVENT, signedOut);
    return () => {
      live.current = false;
      cancelLookup();
      resultController.current?.abort();
      window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
    };
  }, [storageKey]);
  useEffect(() => {
    if (!attempt?.bodyText) return;
    const expire = () => {
      if (Date.now() - attempt.createdAt < 30 * 60_000) return;
      const expired = { ...attempt, bodyText: null };
      saveWalkInAttempt(storageKey, expired);
      setAttempt(expired);
    };
    const timer = window.setTimeout(
      expire,
      Math.max(0, attempt.createdAt + 30 * 60_000 - Date.now()),
    );
    document.addEventListener('visibilitychange', expire);
    window.addEventListener('focus', expire);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', expire);
      window.removeEventListener('focus', expire);
    };
  }, [attempt, storageKey]);
  useEffect(() => {
    if (!allowed) {
      cancelLookup();
      removeWalkInAttempt(storageKey);
      setAttempt(null);
      resetCustomer();
      physicalVehicleIdentity.current = null;
      setPhone('');
      setData((value) => ({
        ...value,
        request: '',
        accessories: '',
        odometerKm: '',
        fuelLevel: '',
        budgetCeiling: '',
      }));
    }
  }, [allowed, storageKey]);
  useEffect(() => {
    if (!comebackId) return;
    let valid = true;
    setPriorLoading(true);
    setPriorError('');
    if (!canRead) {
      setPriorError('Reading the earlier job requires job access. Ask an authorized colleague.');
      setPriorLoading(false);
      return;
    }
    void staffApi
      .job(comebackId)
      .then((job) => {
        if (!valid) return;
        if (job.status !== 'COMPLETED')
          throw new Error('Only a completed visit can be linked as a comeback.');
        if (!job.customer?.phone)
          throw new Error('The earlier customer record is unavailable. Resolve it before intake.');
        setPrior(job);
        setPhone(job.customer.phone);
        setData((value) => ({
          ...value,
          request: value.request || 'Same symptom returned after recent service',
        }));
      })
      .catch((err: unknown) => {
        if (valid) setPriorError(errorMessage(err, 'Could not load the earlier visit.'));
      })
      .finally(() => {
        if (valid) setPriorLoading(false);
      });
    return () => {
      valid = false;
    };
  }, [comebackId, priorReload, canRead]);
  useEffect(() => {
    if (error || message) focusResult.current?.focus();
    else if (lookup === 'found' || lookup === 'not-found') customerResult.current?.focus();
  }, [lookup, error, message]);

  async function findCustomer() {
    if (!normalizedPhone || lookup === 'loading' || locked || !allowed) return;
    const { controller, ticket } = startLookup();
    resetCustomer();
    setLookup('loading');
    setError('');
    setMessage('');
    try {
      const result = await walkInApi.customer(normalizedPhone, controller.signal);
      if (!current(ticket)) return;
      if (result.status === 'FOUND') {
        setMatch(result.customer);
        setLookup('found');
      } else setLookup('not-found');
    } catch (err) {
      if (!current(ticket)) return;
      setLookup('idle');
      if (!deny(err)) setError(errorMessage(err, 'Customer lookup failed. Try again.'));
    }
  }
  async function loadVehicles(selected: IntakeCustomer, next?: string) {
    const { controller, ticket } = startLookup();
    setLoadingVehicles(true);
    setError('');
    try {
      const page = await walkInApi.vehicles(selected.id, next, controller.signal);
      if (!current(ticket)) return;
      if (page.customerRevision !== selected.revision) {
        resetCustomer();
        setStep(1);
        setLookup('idle');
        setError('The customer record changed. Find and confirm the customer again.');
        return;
      }
      setVehicles((previous) =>
        next
          ? [...previous, ...page.items.filter((row) => !previous.some((old) => old.id === row.id))]
          : page.items,
      );
      setCursor(page.nextCursor);
      setVehiclesLoaded(true);
    } catch (err) {
      if (current(ticket) && !deny(err))
        setError(errorMessage(err, 'Could not load saved vehicles. Try again.'));
    } finally {
      if (current(ticket)) setLoadingVehicles(false);
    }
  }
  function useCustomer() {
    if (!match || match.accountLinkState !== 'ACCOUNT_LINKED' || locked) return;
    setCustomer(match);
    setStep(2);
    void loadVehicles(match);
  }
  function chooseVehicle(row: IntakeVehicle) {
    cancelLookup();
    setCheckingPlate(false);
    setLoadingVehicles(false);
    confirmPhysicalVehicle(`saved:${row.id}`);
    setVehicle(row);
    setAnother(false);
    setRegistration(row.registrationNumber);
    setMakeModel('');
    setConfirmedType('');
    setPlateReady(false);
    setError('');
    setMessage('');
    setActiveJob(row.activeJob ?? null);
    setActiveBlocked(row.hasActiveJob);
  }
  function chooseAnother() {
    cancelLookup();
    setCheckingPlate(false);
    setLoadingVehicles(false);
    if (!another) {
      resetPhysical();
      physicalVehicleIdentity.current = null;
    }
    resetVehicle();
    setAnother(true);
    setError('');
    setMessage('');
  }
  async function checkPlate() {
    const plate = normalizePlate(registration);
    if (!customer || !plate || checkingPlate || locked) return;
    const { controller, ticket } = startLookup();
    setCheckingPlate(true);
    setPlateReady(false);
    setError('');
    setMessage('');
    try {
      const result = await walkInApi.vehicle(customer.id, plate, controller.signal);
      if (!current(ticket)) return;
      if (result.customerRevision !== customer.revision) {
        resetCustomer();
        setLookup('idle');
        setStep(1);
        setError('The customer record changed. Find and confirm the customer again.');
        return;
      }
      if (result.status === 'FOUND') {
        setVehicles((value) =>
          value.some((row) => row.id === result.vehicle.id)
            ? value.map((row) => (row.id === result.vehicle.id ? result.vehicle : row))
            : [...value, result.vehicle],
        );
        chooseVehicle(result.vehicle);
        setMessage(
          'This plate is already saved for this customer. Its existing record is selected.',
        );
      } else {
        setRegistration(result.registrationNumber);
        setPlateReady(true);
        confirmPhysicalVehicle(`new:${result.registrationNumber}`);
      }
    } catch (err) {
      if (current(ticket) && !deny(err))
        setError(errorMessage(err, 'Plate lookup failed. Try again.'));
    } finally {
      if (current(ticket)) setCheckingPlate(false);
    }
  }
  function acknowledge(job: CreatedJob) {
    if (!live.current) return;
    removeWalkInAttempt(storageKey);
    setAttempt(null);
    setCreated(job);
    setError('');
    setMessage('');
    if (refresh)
      void refresh().catch(() => {
        if (live.current)
          setMessage(
            'Job created. The workshop list could not refresh; the created job is still available.',
          );
      });
  }
  function failedCommand(err: unknown, retry: boolean) {
    if (deny(err)) return;
    if (
      err instanceof ApiError &&
      err.status >= 400 &&
      err.status < 500 &&
      err.status !== 408 &&
      err.status !== 429 &&
      !(retry && (err.status === 404 || (err.status === 422 && !err.code)))
    ) {
      removeWalkInAttempt(storageKey);
      setAttempt(null);
      if (err.code === 'CUSTOMER_SELECTION_CHANGED' || err.code === 'ACCOUNT_LINK_REQUIRED') {
        resetCustomer();
        setLookup('idle');
        setStep(1);
      } else if (
        [
          'VEHICLE_SELECTION_CHANGED',
          'VEHICLE_CUSTOMER_CONFLICT',
          'VEHICLE_LOOKUP_AMBIGUOUS',
        ].includes(err.code ?? '')
      ) {
        setVehicle(null);
        setPlateReady(false);
        setStep(2);
      }
      const candidate = err.details?.activeJob;
      if (err.code === 'ACTIVE_JOB_EXISTS') {
        setActiveBlocked(true);
        setStep(2);
        if (
          candidate &&
          typeof candidate === 'object' &&
          typeof (candidate as CreatedJob).id === 'string'
        )
          setActiveJob(candidate as CreatedJob);
      }
      setError(errorMessage(err));
    } else
      setError(
        'Creation is not confirmed. Check the creation result before opening another job card.',
      );
  }
  async function send(attemptToSend: WalkInAttempt, retry: boolean) {
    const ticket = generation.current;
    try {
      const result = await walkInApi.send(attemptToSend);
      if (current(ticket)) acknowledge(result);
    } catch (err) {
      if (current(ticket)) failedCommand(err, retry);
    }
  }
  async function create() {
    if (
      inFlight.current ||
      locked ||
      !vehicleReady ||
      !validVisit ||
      !allowed ||
      (comebackId && !prior)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const identityTicket = generation.current;
    try {
      const accessories = Object.fromEntries(
        data.accessories
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => [item.toLowerCase().replace(/\s+/g, '_'), true]),
      );
      const input: WalkInInput = {
        customerId: customer!.id,
        customerRevision: customer!.revision,
        ...(vehicle
          ? {
              vehicleId: vehicle.id,
              vehicleRevision: vehicle.revision,
              ...(!vehicle.vehicleType
                ? { confirmedVehicleType: confirmedType as IntakeVehicleType }
                : {}),
            }
          : {
              newVehicle: {
                registrationNumber: normalizePlate(registration)!,
                vehicleType: confirmedType as IntakeVehicleType,
                ...(makeModel.trim() ? { makeModel: makeModel.trim() } : {}),
              },
            }),
        serviceType: data.serviceType,
        customerRequest: data.request.trim(),
        ...(data.odometerKm ? { odometerKm: Number(data.odometerKm) } : {}),
        ...(data.fuelLevel ? { fuelLevel: data.fuelLevel } : {}),
        waitingOnSite: data.waitingOnSite,
        priority: urgent ? 'URGENT' : 'NORMAL',
        estimatedReadyAt: new Date(data.estimatedReadyAt).toISOString(),
        ...(data.budgetCeiling ? { budgetCeiling: Number(data.budgetCeiling) } : {}),
        ...(data.assignedTechnicianId ? { assignedTechnicianId: data.assignedTechnicianId } : {}),
        ...(Object.keys(accessories).length ? { accessoriesChecklist: accessories } : {}),
        ...(prior
          ? {
              comebackOfJobId: prior.id,
              comebackReason: data.request.trim(),
              warrantyIntent: data.warrantyIntent,
            }
          : {}),
      };
      const nextAttempt = await prepareWalkInAttempt(input);
      if (!live.current || generation.current !== identityTicket) return;
      const persisted = saveWalkInAttempt(storageKey, nextAttempt);
      setAttempt(nextAttempt);
      if (!persisted)
        setMessage(
          'Recovery is available in this tab only. Keep it open until creation is confirmed.',
        );
      await send(nextAttempt, false);
    } catch (err) {
      if (live.current) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function checkResult() {
    if (!attempt || inFlight.current || !allowed) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    resultController.current = controller;
    const ticket = generation.current;
    try {
      const result = await walkInApi.status(attempt, controller.signal);
      if (!current(ticket)) return;
      if (result.status === 'CREATED') acknowledge(result.job);
      else {
        const latest = readWalkInAttempt(storageKey);
        setAttempt(latest ?? { ...attempt, bodyText: null });
        setMessage(
          'No completed result is available yet. This does not prove creation failed. Retry only the saved command, or reconcile the visit with an authorized colleague.',
        );
      }
    } catch (err) {
      if (current(ticket) && !deny(err))
        setError(
          errorMessage(err, 'Could not check creation. Keep this attempt until it is resolved.'),
        );
    } finally {
      inFlight.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function retry() {
    if (!attempt || inFlight.current || !allowed) return;
    const latest = readWalkInAttempt(storageKey);
    if (!latest?.bodyText) {
      setAttempt(latest ?? { ...attempt, bodyText: null });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await send(latest, true);
    } finally {
      inFlight.current = false;
      if (live.current) setBusy(false);
    }
  }
  if (!allowed)
    return (
      <section className="form-card">
        <h2>Intake access required</h2>
        <p>Ask an authorized advisor or manager.</p>
      </section>
    );
  if (created)
    return (
      <section className="form-card intake-result" role="status">
        <Badge tone="green">JOB CREATED</Badge>
        <h2>Job card {created.jobNumber || 'created'}</h2>
        <p>The visit was saved at {me.center.displayName || me.center.name}.</p>
        {message ? <p className="notice amber">{message}</p> : null}
        {canRead ? (
          <button className="primary" type="button" onClick={() => navigate(`/jobs/${created.id}`)}>
            Open created job
          </button>
        ) : (
          <p>Ask a colleague with job access to open this card. Creation is complete.</p>
        )}
      </section>
    );
  return (
    <section className="wizard walk-in">
      <div className="wizard-head">
        <div>
          <Badge tone={urgent ? 'red' : comebackId ? 'purple' : 'blue'}>
            {urgent ? 'BREAKDOWN' : comebackId ? 'COMEBACK' : 'WALK-IN'}
          </Badge>
          <h2>
            {urgent
              ? 'Receive a breakdown'
              : comebackId
                ? 'Link a warranty revisit'
                : 'Open a job card'}
          </h2>
          <p>
            Confirm the customer and the vehicle brought to{' '}
            {me.center.displayName || me.center.name}.
          </p>
        </div>
        <div className="steps">
          {[1, 2, 3].map((number) => (
            <span className={number <= step ? 'active' : ''} key={number}>
              {number}
              <small>{number === 1 ? 'Customer' : number === 2 ? 'Vehicle' : 'Review'}</small>
            </span>
          ))}
        </div>
      </div>
      {comebackId ? (
        <div className="notice blue" role="status">
          {priorLoading
            ? 'Loading the earlier completed visit…'
            : priorError ||
              `Earlier visit: ${prior?.jobNumber || 'unavailable'}. Confirm the same customer and vehicle.`}
          {priorError && canRead ? (
            <button
              type="button"
              className="text-btn"
              onClick={() => setPriorReload((value) => value + 1)}
            >
              Retry earlier visit
            </button>
          ) : null}
        </div>
      ) : null}
      {attempt ? (
        <div className="form-card intake-recovery" role="status">
          <h3>Confirm the earlier creation attempt</h3>
          <p>
            {attempt.bodyText
              ? 'The exact request is saved. Check its result before retrying.'
              : 'Personal intake details have expired. The result handle remains; check it or reconcile the original visit. A missing result never permits automatic recreation.'}
          </p>
          <div className="intake-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void checkResult()}
            >
              Check creation result
            </button>
            {attempt.bodyText ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void retry()}
              >
                Retry saved creation
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div ref={focusResult} tabIndex={-1} className="intake-feedback" aria-live="polite">
        <ErrorText error={error} />
        {message ? <p className="notice amber">{message}</p> : null}
        {activeJob && canRead ? (
          <Link className="text-btn" to={`/jobs/${activeJob.id}`}>
            Open existing job {activeJob.jobNumber}
          </Link>
        ) : null}
      </div>
      <fieldset className="intake-fields" disabled={locked || priorLoading || Boolean(priorError)}>
        {step === 1 ? (
          <div className="form-card">
            <h3>Find or register the customer</h3>
            <div className="form-grid">
              <label className="full">
                Owner mobile
                <input
                  aria-label="Owner mobile"
                  type="tel"
                  inputMode="tel"
                  maxLength={24}
                  value={phone}
                  placeholder="10-digit mobile or +91 mobile"
                  onChange={(event) => {
                    cancelLookup();
                    setPhone(event.target.value);
                    resetCustomer();
                    setLookup('idle');
                    setError('');
                    setMessage('');
                  }}
                />
              </label>
              {phone && !normalizedPhone ? (
                <p className="full notice amber">
                  Enter a valid Indian mobile number. We keep the full input and never trim it to
                  another number.
                </p>
              ) : null}
              <button
                type="button"
                className="secondary"
                disabled={!normalizedPhone || lookup === 'loading'}
                onClick={() => void findCustomer()}
              >
                {lookup === 'loading' ? 'Finding customer…' : 'Find customer'}
              </button>
              {lookup === 'found' && match ? (
                <div
                  className="full intake-customer"
                  ref={customerResult}
                  tabIndex={-1}
                  aria-live="polite"
                >
                  <strong>{match.name || 'Name not recorded'}</strong>
                  <p>{match.phone}</p>
                  <p>Saved identity is read-only here. Resolve corrections separately.</p>
                  {match.accountLinkState === 'ACCOUNT_LINKED' ? (
                    <button className="primary" type="button" onClick={useCustomer}>
                      Use this customer
                    </button>
                  ) : (
                    <RegistrationHandoff key={normalizedPhone} phone={normalizedPhone!} linked={()=>void findCustomer()}/>
                  )}
                </div>
              ) : null}
              {lookup === 'not-found' ? (
                <div
                  className="full notice amber"
                  ref={customerResult}
                  tabIndex={-1}
                  aria-live="polite"
                >
                  <RegistrationHandoff key={normalizedPhone} phone={normalizedPhone!} linked={()=>void findCustomer()}/>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="form-card">
            <h3>Select the vehicle brought today</h3>
            <p>
              {customer?.name || 'Customer'} · {customer?.phone}
            </p>
            <div className="intake-vehicles" role="group" aria-label="Saved vehicles">
              {vehicles.map((row) => (
                <label className="intake-vehicle" key={row.id}>
                  <input
                    type="radio"
                    name="intake-vehicle"
                    checked={vehicle?.id === row.id}
                    onChange={() => chooseVehicle(row)}
                  />
                  <span>
                    <strong>{row.registrationNumber}</strong>
                    <small>
                      {row.makeModel || 'Make/model not recorded'} · {typeLabel(row.vehicleType)}
                    </small>
                    {row.hasActiveJob ? (
                      <small className="intake-open">An active visit already exists.</small>
                    ) : null}
                  </span>
                </label>
              ))}
              {loadingVehicles ? <p role="status">Loading saved vehicles…</p> : null}
              {vehiclesLoaded && !vehicles.length ? <p>No saved vehicles at this center.</p> : null}
              {!vehiclesLoaded && !loadingVehicles && customer ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void loadVehicles(customer)}
                >
                  Retry saved vehicles
                </button>
              ) : null}
              {cursor && customer ? (
                <button
                  className="text-btn"
                  type="button"
                  disabled={loadingVehicles}
                  onClick={() => void loadVehicles(customer, cursor)}
                >
                  Load more vehicles
                </button>
              ) : null}
              <label className="intake-vehicle">
                <input
                  type="radio"
                  name="intake-vehicle"
                  checked={another}
                  onChange={chooseAnother}
                />
                <span>{vehicles.length ? 'Another vehicle' : 'Add vehicle for this visit'}</span>
              </label>
            </div>
            {activeBlocked ? (
              <p className="notice amber">
                This vehicle already has an active job.{' '}
                {canRead && activeJob
                  ? 'Open the existing visit above.'
                  : 'Ask a colleague with job access to open it.'}{' '}
                No second card can be opened.
              </p>
            ) : null}
            <div className="form-grid">
              {another ? (
                <>
                  <label>
                    Registration
                    <input
                      aria-label="Registration"
                      value={registration}
                      maxLength={32}
                      placeholder="KA01AB1234"
                      onChange={(event) => {
                        if (normalizePlate(event.target.value) !== normalizePlate(registration)) {
                          resetPhysical();
                          physicalVehicleIdentity.current = null;
                        }
                        cancelLookup();
                        setCheckingPlate(false);
                        setRegistration(event.target.value.toUpperCase());
                        setPlateReady(false);
                        setActiveBlocked(false);
                        setActiveJob(null);
                        setError('');
                        setMessage('');
                      }}
                    />
                  </label>
                  <button
                    className="secondary"
                    type="button"
                    disabled={!normalizePlate(registration) || checkingPlate}
                    onClick={() => void checkPlate()}
                  >
                    {checkingPlate ? 'Checking plate…' : 'Check plate'}
                  </button>
                  {plateReady ? (
                    <p className="full notice blue">
                      No matching center vehicle found. Capture this vehicle for the visit. RC
                      ownership verification through VAHAN is pending; this is not proof of
                      ownership.
                    </p>
                  ) : null}
                  <label>
                    Make and model
                    <input
                      aria-label="Make and model"
                      maxLength={255}
                      value={makeModel}
                      onChange={(event) => setMakeModel(event.target.value)}
                      placeholder="Honda Activa"
                    />
                  </label>
                </>
              ) : null}
              {vehicle || another ? (
                <label>
                  Vehicle type
                  {vehicle?.vehicleType ? (
                    <input
                      readOnly
                      value={typeLabel(vehicle.vehicleType)}
                      aria-label="Vehicle type"
                    />
                  ) : (
                    <select
                      aria-label="Vehicle type"
                      value={confirmedType}
                      onChange={(event) =>
                        setConfirmedType(event.target.value as IntakeVehicleType | '')
                      }
                    >
                      <option value="">Choose the vehicle type</option>
                      <option value="TWO_WHEELER">Two-wheeler</option>
                      <option value="FOUR_WHEELER">Four-wheeler</option>
                    </select>
                  )}
                </label>
              ) : null}
              <label>
                Odometer (km)
                <input
                  aria-label="Odometer (km)"
                  type="number"
                  min="0"
                  step="1"
                  value={data.odometerKm}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      odometerKm: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Fuel
                <select
                  aria-label="Fuel"
                  value={data.fuelLevel}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      fuelLevel: event.target.value,
                    }))
                  }
                >
                  <option value="">Not recorded</option>
                  {['Low', '1/4', '1/2', '3/4', 'Full'].map((fuel) => (
                    <option key={fuel}>{fuel}</option>
                  ))}
                </select>
              </label>
              <label>
                Service type
                <select
                  value={data.serviceType}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      serviceType: event.target.value,
                    }))
                  }
                >
                  {['Periodic service', 'Repair', 'Breakdown', 'Comeback'].map((service) => (
                    <option key={service}>{service}</option>
                  ))}
                </select>
              </label>
              <label className="full">
                Customer request
                <textarea
                  aria-label="Customer request"
                  value={data.request}
                  maxLength={2000}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      request: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="check full">
                <input
                  type="checkbox"
                  checked={data.waitingOnSite}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      waitingOnSite: event.target.checked,
                    }))
                  }
                />
                Customer is waiting on-site
              </label>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="form-card">
            <h3>Review this visit</h3>
            <div className="intake-review">
              <p>
                <strong>{customer?.name || 'Customer'}</strong> · {customer?.phone}
              </p>
              <p>
                <strong>{vehicle?.registrationNumber || normalizePlate(registration)}</strong> ·{' '}
                {typeLabel(type)}
              </p>
              <p>
                {data.serviceType} · {data.request}
              </p>
              <small>Review notes and budget after changing customer or vehicle.</small>
            </div>
            <div className="form-grid">
              <label>
                Estimated ready
                <input
                  type="datetime-local"
                  value={data.estimatedReadyAt}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      estimatedReadyAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Budget ceiling (₹)
                <input
                  aria-label="Budget ceiling"
                  type="number"
                  min="0"
                  value={data.budgetCeiling}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      budgetCeiling: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Technician
                <select
                  value={data.assignedTechnicianId}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      assignedTechnicianId: event.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {technicians.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Accessories
                <input
                  aria-label="Accessories"
                  value={data.accessories}
                  maxLength={1000}
                  onChange={(event) =>
                    setData((value) => ({
                      ...value,
                      accessories: event.target.value,
                    }))
                  }
                  placeholder="Helmet, top box"
                />
              </label>
              {prior ? (
                <label className="check full">
                  <input
                    type="checkbox"
                    checked={data.warrantyIntent}
                    onChange={(event) =>
                      setData((value) => ({
                        ...value,
                        warrantyIntent: event.target.checked,
                      }))
                    }
                  />
                  Expected warranty rework (eligibility resolved separately)
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="wizard-actions">
          {step > 1 ? (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                cancelLookup();
                setCheckingPlate(false);
                setLoadingVehicles(false);
                setStep((value) => value - 1);
                setError('');
              }}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {step === 2 ? (
            <button
              className="primary"
              type="button"
              disabled={
                !vehicleReady ||
                !data.request.trim() ||
                !validNumber(data.odometerKm, true) ||
                checkingPlate
              }
              onClick={() => setStep(3)}
            >
              Continue <ChevronRight />
            </button>
          ) : null}
          {step === 3 ? (
            <button
              className="primary"
              type="button"
              disabled={!vehicleReady || !validVisit || Boolean(activeJob)}
              onClick={() => void create()}
            >
              Open job card <ChevronRight />
            </button>
          ) : null}
        </div>
      </fieldset>
    </section>
  );
}
