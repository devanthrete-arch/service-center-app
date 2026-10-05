import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../domain/store';
import { digitsOnly, toE164 } from '../domain/types';
import { Badge, ErrorText, useAction } from './ui';

export function WalkIn({ urgent = false }: { urgent?: boolean }) {
  const { createJob, jobs, technicians } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const comeback = jobs.find((job) => job.id === params.get('comeback'));
  const { busy, error, setError, run } = useAction();
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    customerName: comeback?.customer?.name ?? '',
    phone: digitsOnly(comeback?.customer?.phone ?? ''),
    registration: comeback?.vehicle?.registrationNumber ?? '',
    makeModel: comeback?.vehicle?.makeModel ?? '',
    vehicleType: 'TWO_WHEELER' as 'TWO_WHEELER' | 'FOUR_WHEELER',
    request: comeback ? 'Same symptom returned after recent service' : '',
    serviceType: urgent ? 'Breakdown' : comeback ? 'Comeback' : 'Periodic service',
    odometerKm: String(comeback?.odometerKm ?? ''),
    fuelLevel: '1/2',
    accessories: '',
    estimatedReadyAt: new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 16),
    budgetCeiling: '',
    waitingOnSite: false,
    assignedTechnicianId: '',
    warrantyIntent: Boolean(comeback),
  });

  const set = (key: keyof typeof data, value: string | boolean) =>
    setData((current) => ({ ...current, [key]: value }));

  const duplicate = jobs.find(
    (job) =>
      data.registration &&
      job.vehicle?.registrationNumber.replace(/\s/g, '') === data.registration.replace(/\s/g, '') &&
      job.status !== 'COMPLETED' &&
      job.status !== 'CANCELLED',
  );

  return (
    <section className="wizard">
      <div className="wizard-head">
        <div>
          <Badge tone={urgent ? 'red' : comeback ? 'purple' : 'blue'}>
            {urgent ? 'BREAKDOWN' : comeback ? 'COMEBACK' : 'WALK-IN'}
          </Badge>
          <h2>{urgent ? 'Receive a breakdown' : comeback ? 'Link a warranty revisit' : 'Open a job card'}</h2>
          <p>Creates a live job at this center. The owner can track it after check-in.</p>
        </div>
        <div className="steps">
          {[1, 2, 3].map((n) => (
            <span className={n <= step ? 'active' : ''} key={n}>
              {n}
              <small>{n === 1 ? 'Customer' : n === 2 ? 'Vehicle' : 'Confirm'}</small>
            </span>
          ))}
        </div>
      </div>
      {step === 1 ? (
        <div className="form-card">
          <h3>Customer</h3>
          <div className="form-grid">
            <label>
              Customer name
              <input value={data.customerName} onChange={(e) => set('customerName', e.target.value)} />
            </label>
            <label>
              Owner phone
              <input
                inputMode="numeric"
                value={data.phone}
                onChange={(e) => set('phone', digitsOnly(e.target.value).slice(0, 10))}
                placeholder="10-digit mobile"
              />
            </label>
            <label className="check full">
              <input
                type="checkbox"
                checked={data.waitingOnSite}
                onChange={(e) => set('waitingOnSite', e.target.checked)}
              />
              Customer is waiting on-site
            </label>
          </div>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="form-card">
          <h3>Vehicle and request</h3>
          <div className="form-grid">
            <label>
              Registration
              <input
                value={data.registration}
                onChange={(e) => set('registration', e.target.value.toUpperCase())}
                placeholder="KA01AB1234"
              />
            </label>
            <label>
              Make and model
              <input value={data.makeModel} onChange={(e) => set('makeModel', e.target.value)} placeholder="Honda Activa" />
            </label>
            <label>
              Vehicle type
              <select
                value={data.vehicleType}
                onChange={(e) => set('vehicleType', e.target.value as typeof data.vehicleType)}
              >
                <option value="TWO_WHEELER">Two-wheeler</option>
                <option value="FOUR_WHEELER">Four-wheeler</option>
              </select>
            </label>
            <label>
              Odometer (km)
              <input type="number" value={data.odometerKm} onChange={(e) => set('odometerKm', e.target.value)} />
            </label>
            <label>
              Fuel
              <select value={data.fuelLevel} onChange={(e) => set('fuelLevel', e.target.value)}>
                <option>Low</option>
                <option>1/4</option>
                <option>1/2</option>
                <option>3/4</option>
                <option>Full</option>
              </select>
            </label>
            <label>
              Service type
              <select value={data.serviceType} onChange={(e) => set('serviceType', e.target.value)}>
                <option>Periodic service</option>
                <option>Repair</option>
                <option>Breakdown</option>
                <option>Comeback</option>
              </select>
            </label>
            <label className="full">
              Customer request
              <textarea value={data.request} onChange={(e) => set('request', e.target.value)} />
            </label>
          </div>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="form-card">
          <h3>Ready time and assignment</h3>
          <div className="form-grid">
            <label>
              Estimated ready
              <input
                type="datetime-local"
                value={data.estimatedReadyAt}
                onChange={(e) => set('estimatedReadyAt', e.target.value)}
              />
            </label>
            <label>
              Budget ceiling (₹)
              <input type="number" value={data.budgetCeiling} onChange={(e) => set('budgetCeiling', e.target.value)} />
            </label>
            <label>
              Technician
              <select
                value={data.assignedTechnicianId}
                onChange={(e) => set('assignedTechnicianId', e.target.value)}
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
              <input value={data.accessories} onChange={(e) => set('accessories', e.target.value)} placeholder="Helmet, top box" />
            </label>
            {comeback ? (
              <label className="check full">
                <input
                  type="checkbox"
                  checked={data.warrantyIntent}
                  onChange={(e) => set('warrantyIntent', e.target.checked)}
                />
                Expected warranty rework
              </label>
            ) : null}
          </div>
          {duplicate ? (
            <div className="notice amber">
              Open job {duplicate.jobNumber} already exists for this plate.
            </div>
          ) : null}
          <ErrorText error={error} />
        </div>
      ) : null}
      <div className="wizard-actions">
        {step > 1 ? (
          <button className="secondary" type="button" onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <button
            className="primary"
            type="button"
            disabled={
              (step === 1 && data.phone.length < 10) ||
              (step === 2 && (!data.registration.trim() || !data.request.trim()))
            }
            onClick={() => setStep((s) => s + 1)}
          >
            Continue <ChevronRight />
          </button>
        ) : (
          <button
            className="primary"
            type="button"
            disabled={busy || Boolean(duplicate)}
            onClick={() =>
              void run(async () => {
                if (duplicate) {
                  setError(`Open job ${duplicate.jobNumber} already exists.`);
                  return;
                }
                const accessories = Object.fromEntries(
                  data.accessories
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((item) => [item.toLowerCase().replace(/\s+/g, '_'), true]),
                );
                const job = await createJob({
                  customerPhone: toE164(data.phone),
                  customerName: data.customerName.trim() || undefined,
                  vehicleRegistration: data.registration.replace(/\s+/g, ''),
                  vehicleMakeModel: data.makeModel.trim() || undefined,
                  vehicleType: data.vehicleType,
                  serviceType: data.serviceType,
                  odometerKm: data.odometerKm ? Number(data.odometerKm) : undefined,
                  fuelLevel: data.fuelLevel,
                  customerRequest: data.request.trim(),
                  waitingOnSite: data.waitingOnSite,
                  priority: urgent ? 'URGENT' : 'NORMAL',
                  estimatedReadyAt: new Date(data.estimatedReadyAt).toISOString(),
                  budgetCeiling: data.budgetCeiling ? Number(data.budgetCeiling) : undefined,
                  assignedTechnicianId: data.assignedTechnicianId || undefined,
                  accessoriesChecklist: Object.keys(accessories).length ? accessories : undefined,
                  comebackOfJobId: comeback?.id,
                  comebackReason: comeback ? data.request.trim() : undefined,
                  warrantyIntent: data.warrantyIntent,
                });
                navigate(`/jobs/${job.id}`);
              })
            }
          >
            Open job card <ChevronRight />
          </button>
        )}
      </div>
    </section>
  );
}
