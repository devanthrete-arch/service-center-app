import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, Plus } from 'lucide-react';
import { useStore } from '../domain/store';
import {
  CLOSE_CHECKS,
  FLOOR_NEXT,
  INSPECTION_KEYS,
  eventTitle,
  formatWhen,
  money,
  statusLabel,
  type Delivery,
  type JobDetail,
  type LineDraft,
  type LineKind,
  type PartType,
} from '../domain/types';
import { Badge, Empty, ErrorText, Modal, statusTone, useAction } from './ui';
import { TrackingLinkPanel } from './TrackingLinkPanel';

type Tab = 'timeline' | 'inspection' | 'estimate' | 'record';
type ModalKind = 'next' | 'note' | 'approval' | 'verbal' | 'hold' | 'skip' | 'cancel' | 'close' | 'more' | 'qc' | null;

export function JobDetailScreen() {
  const { id } = useParams();
  const store = useStore();
  const { busy, error, run } = useAction();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [tab, setTab] = useState<Tab>('timeline');
  const [modal, setModal] = useState<ModalKind>(null);
  const [loadError, setLoadError] = useState('');
  const [tracking, setTracking] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void store
      .job(id)
      .then((row) => {
        if (!cancelled) setJob(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Job not found');
      });
    void store.deliveries(id).then((rows) => {
      if (!cancelled) setDeliveries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [id, store]);

  async function apply(action: () => Promise<JobDetail>) {
    await run(async () => {
      const next = await action();
      setJob(next);
      setModal(null);
      if (id) setDeliveries(await store.deliveries(id));
    });
  }

  if (loadError) return <Empty title="Job not found" copy={loadError} />;
  if (!job) return <p>Loading job card…</p>;

  const next = FLOOR_NEXT[job.status];
  const pending = job.approvals.find((item) => item.status === 'PENDING');
  const canManage = store.isDesk;
  const express = store.me.center.expressSkipEnabled;

  return (
    <>
      <div className="detail-top">
        <div>
          <Link to="/jobs">← Jobs</Link>
          <div className="title-row">
            <h2>{job.vehicle?.registrationNumber ?? 'No plate'}</h2>
            <Badge tone={statusTone[job.status]}>{statusLabel(job.status)}</Badge>
            {job.priority === 'URGENT' ? <Badge tone="red">URGENT</Badge> : null}
            {job.comeback ? <Badge tone="purple">COMEBACK</Badge> : null}
          </div>
          <p>
            {job.jobNumber} · {job.customer?.name ?? 'Walk-in'} · {job.customer?.phone}
          </p>
        </div>
        <div className="detail-actions">
          {canManage && job.status === 'READY_FOR_PICKUP' ? (
            <button className="primary" type="button" onClick={() => setModal('close')}>
              Close and collect
            </button>
          ) : null}
          {next && !['COMPLETED', 'CANCELLED', 'ON_HOLD', 'AWAITING_APPROVAL'].includes(job.status) ? (
            <button className="primary" type="button" onClick={() => setModal('next')}>
              Next: {statusLabel(next)}
            </button>
          ) : null}
          {job.status === 'QUALITY_CHECK' ? (
            <button className="primary" type="button" onClick={() => setModal('qc')}>
              Record QC
            </button>
          ) : null}
          <button ref={moreButton} className="secondary" type="button" onClick={() => setModal('more')}>
            More
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      {tracking && <TrackingLinkPanel key={`${store.me.staff.id}:${store.me.center.id}:${job.id}`}
        jobId={job.id} staffId={store.me.staff.id} centerId={store.me.center.id}
        canReplace={store.can('jobs:update')} close={() => setTracking(false)}
        returnFocus={() => moreButton.current?.focus()}
        changed={async () => { setJob(await store.job(job.id)); }} />}
      <section className="job-summary">
        <div>
          <span>Customer request</span>
          <strong>{job.customerRequest || job.serviceType}</strong>
        </div>
        <div>
          <span>Estimated ready</span>
          <strong>{formatWhen(job.estimatedReadyAt)}</strong>
        </div>
        <div>
          <span>Assigned technician</span>
          {canManage ? (
            <select
              value={job.assignedTechnicianId ?? ''}
              disabled={busy}
              onChange={(event) =>
                void apply(() => store.assign(job, event.target.value || null))
              }
            >
              <option value="">Unassigned</option>
              {store.technicians.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          ) : (
            <strong>{job.assignedTechnician?.displayName ?? 'Unassigned'}</strong>
          )}
        </div>
        <div>
          <span>Current / pending</span>
          <strong>{money(job.totals.currentInr)}</strong>
          {Number(job.totals.pendingInr) > 0 ? <small>Pending {money(job.totals.pendingInr)}</small> : null}
          {job.budget?.exceeds ? <small>Over budget {money(job.budget.ceilingInr)}</small> : null}
        </div>
      </section>
      {job.hold ? (
        <section className="notice amber">
          On hold · {job.hold.reason}
          {job.hold.expectedResumeAt ? ` · resume ${formatWhen(job.hold.expectedResumeAt)}` : ''}
        </section>
      ) : null}
      {pending ? (
        <section className="approval-banner">
          <div>
            <Clock3 />
            <div>
              <strong>Waiting for the owner · {money(pending.totalInr)}</strong>
              <p>{pending.note || 'Additional work proposed'} · they decide in the customer app.</p>
            </div>
          </div>
          {canManage ? (
            <div>
              <button type="button" onClick={() => void apply(() => store.withdrawApproval(job, pending.id))}>
                Withdraw
              </button>
              {store.can('approvals:override') ? (
                <button className="primary" type="button" onClick={() => setModal('verbal')}>
                  Record verbal decision
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      <nav className="tabs">
        {(['timeline', 'inspection', 'estimate', 'record'] as const).map((item) => (
          <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item} type="button">
            {item === 'record' ? 'Service record' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'timeline' ? <Timeline job={job} deliveries={deliveries} onNote={() => setModal('note')} /> : null}
      {tab === 'inspection' ? <Inspection job={job} apply={apply} /> : null}
      {tab === 'estimate' ? (
        <Estimate job={job} canManage={canManage} onApproval={() => setModal('approval')} />
      ) : null}
      {tab === 'record' ? <ServiceRecord job={job} /> : null}
      {modal ? (
        <JobModal
          kind={modal}
          job={job}
          next={next}
          express={express}
          busy={busy}
          close={() => setModal(null)}
          apply={apply}
          openTracking={() => { setModal(null); setTracking(true); }}
        />
      ) : null}
    </>
  );
}

function Timeline({
  job,
  deliveries,
  onNote,
}: {
  job: JobDetail;
  deliveries: Delivery[];
  onNote: () => void;
}) {
  return (
    <div className="two-col">
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Event timeline</h3>
            <p>Append-only. Customer-visible events also go to their inbox.</p>
          </div>
          <button className="secondary compact" type="button" onClick={onNote}>
            <Plus /> Note
          </button>
        </div>
        <div className="timeline">
          {[...job.timeline].reverse().map((entry) => (
            <div className="timeline-row" key={entry.id}>
              <span className="timeline-dot" />
              <div>
                <div>
                  <strong>{eventTitle(entry)}</strong>
                  <Badge tone={entry.visibleToCustomer ? 'blue' : 'neutral'}>
                    {entry.visibleToCustomer ? 'Customer' : 'Internal'}
                  </Badge>
                </div>
                <p>{formatWhen(entry.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className="panel">
        <h3>Outbound messages</h3>
        {deliveries.map((row) => (
          <div className="delivery" key={row.id}>
            <span className={`dot ${row.status.toLowerCase()}`} />
            <div>
              <strong>
                {row.channel} · {row.status}
              </strong>
              <p>{row.templateKey}</p>
              <small>
                {row.attempts} attempt(s){row.lastError ? ` · ${row.lastError}` : ''}
              </small>
            </div>
          </div>
        ))}
        {!deliveries.length ? <Empty title="No deliveries yet" copy="Customer-visible events create simulated sends." /> : null}
      </aside>
    </div>
  );
}

function Inspection({
  job,
  apply,
}: {
  job: JobDetail;
  apply: (action: () => Promise<JobDetail>) => Promise<void>;
}) {
  const store = useStore();
  const saved = job.inspection.items ?? {};
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(INSPECTION_KEYS.map((item) => [item.key, saved[item.key]?.ok ?? false])),
  );
  const { busy, error, run } = useAction();

  return (
    <div className="two-col">
      <section className="panel">
        <h3>Inspection checklist</h3>
        <p>{job.inspection.completedAt ? `Completed ${formatWhen(job.inspection.completedAt)}` : 'Save, then mark complete.'}</p>
        <ErrorText error={error} />
        <div className="checklist">
          {INSPECTION_KEYS.map((item) => (
            <button
              className={checks[item.key] ? 'done' : ''}
              type="button"
              key={item.key}
              onClick={() => setChecks((current) => ({ ...current, [item.key]: !current[item.key] }))}
            >
              {checks[item.key] ? <CheckCircle2 /> : <span />}
              <div>
                <strong>{item.label}</strong>
                <small>{checks[item.key] ? 'Checked' : 'Needs check'}</small>
              </div>
            </button>
          ))}
        </div>
        <div className="detail-actions" style={{ marginTop: 16 }}>
          <button
            className="secondary"
            disabled={busy}
            type="button"
            onClick={() =>
              void run(() =>
                apply(() =>
                  store.saveInspection(
                    job,
                    INSPECTION_KEYS.map((item) => ({ key: item.key, label: item.label, ok: checks[item.key] })),
                    false,
                  ),
                ),
              )
            }
          >
            Save
          </button>
          <button
            className="primary"
            disabled={busy}
            type="button"
            onClick={() =>
              void run(() =>
                apply(() =>
                  store.saveInspection(
                    job,
                    INSPECTION_KEYS.map((item) => ({ key: item.key, label: item.label, ok: checks[item.key] })),
                    true,
                  ),
                ),
              )
            }
          >
            Mark inspection complete
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Evidence</h3>
            <p>Metadata only until object storage is chosen.</p>
          </div>
          <button
            className="secondary compact"
            type="button"
            onClick={() => void apply(() => store.addPhoto(job, 'Inspection photo', true))}
          >
            <Plus /> Add photo record
          </button>
        </div>
        <div className="media-grid">
          {job.media.map((item) => (
            <div className="media" key={item.id}>
              <div />
              <Badge tone={item.uploadStatus === 'CONFIRMED' ? 'green' : 'amber'}>{item.uploadStatus}</Badge>
              <strong>{item.caption || item.kind}</strong>
              <small>{item.visibleToCustomer ? 'Customer visible' : 'Internal'}</small>
            </div>
          ))}
          {!job.media.length ? <Empty title="No evidence yet" copy="Add a photo record from the floor device." /> : null}
        </div>
      </section>
    </div>
  );
}

function Estimate({
  job,
  canManage,
  onApproval,
}: {
  job: JobDetail;
  canManage: boolean;
  onApproval: () => void;
}) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Parts and labour</h3>
          <p>Included scope plus approved extras</p>
        </div>
        {canManage && !['COMPLETED', 'CANCELLED'].includes(job.status) ? (
          <button className="primary compact" type="button" onClick={onApproval}>
            <Plus /> Additional work
          </button>
        ) : null}
      </div>
      <div className="line-items">
        {job.lineItems.map((line) => (
          <div key={line.id}>
            <div>
              <strong>{line.description}</strong>
              {!!line.scope?.length && (
                <ul>
                  {line.scope.map((part, index) => (
                    <li key={index}>
                      {part.quantity} × {part.name}
                      {part.description ? ` — ${part.description}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              <span>
                {line.kind}
                {line.partType ? ` · ${line.partType}` : ''} · {line.status}
                {line.partReturnedAt ? ' · returned' : ''}
              </span>
            </div>
            <strong>{money(line.amountInr)}</strong>
          </div>
        ))}
        <div className="total">
          <span>Current total</span>
          <strong>{money(job.totals.currentInr)}</strong>
        </div>
      </div>
      {job.approvals.map((approval) => (
        <div className="approval-history" key={approval.id}>
          <Badge
            tone={
              approval.status === 'PENDING' ? 'amber' : approval.status === 'DECLINED' ? 'red' : 'green'
            }
          >
            {approval.status.replaceAll('_', ' ')}
          </Badge>
          <strong>{money(approval.totalInr)}</strong>
          <span>{approval.note}</span>
        </div>
      ))}
    </section>
  );
}

function ServiceRecord({ job }: { job: JobDetail }) {
  return (
    <section className="panel record">
      <div className="section-head">
        <div>
          <h3>{job.status === 'COMPLETED' ? 'Service record' : 'Completion preview'}</h3>
          <p>{job.status === 'COMPLETED' ? 'Closed at the counter.' : 'Final values appear after handover.'}</p>
        </div>
        {job.status === 'COMPLETED' ? <Badge tone="green">CLOSED</Badge> : null}
      </div>
      <dl>
        <div>
          <dt>Vehicle</dt>
          <dd>
            {job.vehicle?.makeModel} · {job.vehicle?.registrationNumber}
          </dd>
        </div>
        <div>
          <dt>Odometer at intake</dt>
          <dd>{job.odometerKm?.toLocaleString('en-IN') ?? '—'} km</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{job.media.length} media record(s)</dd>
        </div>
        <div>
          <dt>Final amount</dt>
          <dd>{job.close ? money(job.close.finalAmountInr) : 'Pending'}</dd>
        </div>
        <div>
          <dt>Invoice</dt>
          <dd>{job.invoice ? `${job.invoice.invoiceNumber} · ${job.invoice.status}` : '—'}</dd>
        </div>
        {job.comeback ? (
          <div>
            <dt>Linked prior job</dt>
            <dd>
              <Link to={`/jobs/${job.comeback.ofJobId}`}>Open prior card</Link>
            </dd>
          </div>
        ) : null}
      </dl>
      {job.status === 'COMPLETED' ? (
        <Link className="secondary" to={`/new?comeback=${job.id}`}>
          Create comeback job
        </Link>
      ) : null}
    </section>
  );
}

function JobModal({
  kind,
  job,
  next,
  express,
  busy,
  close,
  apply,
  openTracking,
}: {
  kind: Exclude<ModalKind, null>;
  job: JobDetail;
  next?: JobDetail['status'];
  express: boolean;
  busy: boolean;
  close: () => void;
  apply: (action: () => Promise<JobDetail>) => Promise<void>;
  openTracking: () => void;
}) {
  const store = useStore();
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(true);
  const [reason, setReason] = useState('');
  const [resumeAt, setResumeAt] = useState('');
  const [skipStep, setSkipStep] = useState<'INSPECTION' | 'QC'>('INSPECTION');
  const [qcPass, setQcPass] = useState(true);
  const [items, setItems] = useState<LineDraft[]>([
    { description: '', kind: 'PART', partType: 'OEM', unitPriceInr: 0 },
  ]);
  const [channel, setChannel] = useState<'PHONE' | 'IN_PERSON'>('PHONE');
  const [amount, setAmount] = useState(Number(job.totals.currentInr));
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD'>('UPI');
  const [reference, setReference] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [returned, setReturned] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(CLOSE_CHECKS.map((item) => [item.key, true])),
  );
  const approved = Number(job.totals.currentInr);
  const needsReason = amount !== approved;
  const skipped = job.skippedSteps.length > 0;
  const partLines = job.lineItems.filter((line) => line.kind === 'PART' && line.status !== 'DECLINED');

  if (kind === 'more') {
    return (
      <Modal title="Job actions" close={close}>
        <MoreActions job={job} express={express} apply={apply} close={close} openTracking={openTracking} />
      </Modal>
    );
  }

  const title =
    kind === 'next'
      ? `Move to ${next ? statusLabel(next) : ''}`
      : kind === 'approval'
        ? 'Request additional work'
        : kind === 'verbal'
          ? 'Record verbal decision'
          : kind === 'close'
            ? 'Close and collect'
            : kind === 'hold'
              ? 'Put on hold'
              : kind === 'skip'
                ? 'Skip a step'
                : kind === 'cancel'
                  ? 'Cancel job'
                  : kind === 'qc'
                    ? 'Quality check'
                    : 'Add note';

  return (
    <Modal title={title} close={close}>
      {kind === 'approval' ? (
        <>
          {items.map((item, index) => (
            <div className="inline-item" key={index}>
              <input
                placeholder="Line item"
                value={item.description}
                onChange={(e) =>
                  setItems((rows) => rows.map((row, i) => (i === index ? { ...row, description: e.target.value } : row)))
                }
              />
              <select
                value={item.kind}
                onChange={(e) =>
                  setItems((rows) =>
                    rows.map((row, i) => (i === index ? { ...row, kind: e.target.value as LineKind } : row)),
                  )
                }
              >
                <option>PART</option>
                <option>LABOUR</option>
                <option>FEE</option>
              </select>
              {item.kind === 'PART' ? (
                <select
                  value={item.partType}
                  onChange={(e) =>
                    setItems((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, partType: e.target.value as PartType } : row)),
                    )
                  }
                >
                  <option>OEM</option>
                  <option>OES</option>
                  <option>LOCAL</option>
                </select>
              ) : (
                <span />
              )}
              <input
                type="number"
                placeholder="₹"
                value={item.unitPriceInr || ''}
                onChange={(e) =>
                  setItems((rows) =>
                    rows.map((row, i) => (i === index ? { ...row, unitPriceInr: Number(e.target.value) } : row)),
                  )
                }
              />
            </div>
          ))}
          <button
            className="text-btn"
            type="button"
            onClick={() => setItems((rows) => [...rows, { description: '', kind: 'PART', partType: 'OEM', unitPriceInr: 0 }])}
          >
            + Add line
          </button>
        </>
      ) : null}
      {kind === 'close' ? (
        <>
          <label>
            Final amount
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label>
            Payment
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option>UPI</option>
              <option>CASH</option>
              <option>CARD</option>
            </select>
          </label>
          <label>
            Reference
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI txn or slip" />
          </label>
          {needsReason ? (
            <>
              <label>
                Why the amount changed
                <select value={adjustment} onChange={(e) => setAdjustment(e.target.value)}>
                  <option value="">Select reason</option>
                  <option value="DISCOUNT">Discount</option>
                  <option value="GOODWILL">Goodwill</option>
                  <option value="ROUNDING">Rounding</option>
                  <option value="EXTRA_LABOUR">Extra labour</option>
                  <option value="PARTS_PRICE_CHANGE">Parts price change</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              {adjustment === 'OTHER' ? (
                <label>
                  Note
                  <input value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} />
                </label>
              ) : null}
            </>
          ) : null}
          {partLines.map((line) => (
            <label className="check" key={line.id}>
              <input
                type="checkbox"
                checked={returned.includes(line.id)}
                onChange={(e) =>
                  setReturned((ids) => (e.target.checked ? [...ids, line.id] : ids.filter((id) => id !== line.id)))
                }
              />
              Returned {line.description}
            </label>
          ))}
          {skipped
            ? CLOSE_CHECKS.map((item) => (
                <label className="check" key={item.key}>
                  <input
                    type="checkbox"
                    checked={Boolean(checks[item.key])}
                    onChange={(e) => setChecks((current) => ({ ...current, [item.key]: e.target.checked }))}
                  />
                  {item.label}
                </label>
              ))
            : null}
          <label>
            Final notes
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      ) : null}
      {kind === 'hold' ? (
        <>
          <label>
            Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            Expected resume
            <input type="datetime-local" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
          </label>
        </>
      ) : null}
      {kind === 'skip' ? (
        <>
          <label>
            Step
            <select value={skipStep} onChange={(e) => setSkipStep(e.target.value as typeof skipStep)}>
              <option value="INSPECTION">Inspection</option>
              <option value="QC">Quality check</option>
            </select>
          </label>
          <label>
            Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </>
      ) : null}
      {kind === 'qc' ? (
        <>
          <label className="check">
            <input type="checkbox" checked={qcPass} onChange={(e) => setQcPass(e.target.checked)} />
            QC passed
          </label>
          <label>
            Notes {qcPass ? '' : '(required when it fails)'}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      ) : null}
      {kind === 'verbal' ? (
        <label>
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="PHONE">Phone</option>
            <option value="IN_PERSON">In person</option>
          </select>
        </label>
      ) : null}
      {['note', 'next', 'approval', 'verbal', 'cancel'].includes(kind) ? (
        <label>
          {kind === 'verbal' ? 'Audit note' : kind === 'approval' ? 'Customer message' : 'Note'}
          <textarea value={kind === 'hold' || kind === 'skip' ? reason : note} onChange={(e) => (kind === 'hold' || kind === 'skip' ? setReason : setNote)(e.target.value)} />
        </label>
      ) : null}
      {kind === 'note' ? (
        <label className="check">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Visible to the customer
        </label>
      ) : null}
      <div className="modal-actions">
        <button className="secondary" type="button" onClick={close}>
          Cancel
        </button>
        <button
          className="primary"
          type="button"
          disabled={
            busy ||
            (kind === 'note' && !note.trim()) ||
            (kind === 'verbal' && note.trim().length < 3) ||
            (kind === 'approval' && items.some((item) => !item.description || !item.unitPriceInr)) ||
            (kind === 'close' && needsReason && !adjustment) ||
            (kind === 'hold' && reason.trim().length < 3) ||
            (kind === 'skip' && reason.trim().length < 3) ||
            (kind === 'cancel' && note.trim().length < 3) ||
            (kind === 'qc' && !qcPass && !note.trim())
          }
          onClick={() => {
            if (kind === 'next' && next) return void apply(() => store.setStatus(job, next, note || undefined));
            if (kind === 'note') return void apply(() => store.addNote(job, note.trim(), visible));
            if (kind === 'approval') return void apply(() => store.requestApproval(job, items, note));
            if (kind === 'verbal' && job.pendingApprovalId) {
              const nonOem = items.some((item) => item.partType && item.partType !== 'OEM');
              const pending = job.approvals.find((item) => item.id === job.pendingApprovalId);
              const pendingNonOem = pending?.items.some((item) => item.partType && item.partType !== 'OEM');
              return void apply(() =>
                store.overrideApproval(job, job.pendingApprovalId!, {
                  approved: true,
                  acknowledgeNonOemParts: pendingNonOem || nonOem,
                  channel,
                  note: note.trim(),
                  contactPhone: job.customer?.phone,
                }),
              );
            }
            if (kind === 'hold') {
              return void apply(() =>
                store.hold(job, reason.trim(), resumeAt ? new Date(resumeAt).toISOString() : undefined),
              );
            }
            if (kind === 'skip') return void apply(() => store.skip(job, skipStep, reason.trim()));
            if (kind === 'cancel') return void apply(() => store.cancel(job, note.trim()));
            if (kind === 'qc') return void apply(() => store.qc(job, qcPass, note || undefined));
            if (kind === 'close') {
              return void apply(() =>
                store.close(job, {
                  finalAmountInr: amount,
                  adjustmentReason: needsReason ? adjustment : undefined,
                  adjustmentNote: adjustment === 'OTHER' ? adjustmentNote : undefined,
                  payment: amount > 0 ? { method, amountInr: amount, reference: reference || undefined } : undefined,
                  finalNotes: note || undefined,
                  returnedPartLineIds: returned,
                  closeChecklist: skipped ? checks : undefined,
                }),
              );
            }
          }}
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}

function MoreActions({
  job,
  express,
  apply,
  close,
  openTracking,
}: {
  job: JobDetail;
  express: boolean;
  apply: (action: () => Promise<JobDetail>) => Promise<void>;
  close: () => void;
  openTracking: () => void;
}) {
  const store = useStore();
  const [mode, setMode] = useState<'menu' | 'hold' | 'skip' | 'cancel'>('menu');
  const [reason, setReason] = useState('');
  const [resumeAt, setResumeAt] = useState('');
  const [step, setStep] = useState<'INSPECTION' | 'QC'>('INSPECTION');

  if (mode !== 'menu') {
    return (
      <>
        <label>
          {mode === 'skip' ? 'Step' : 'Reason'}
          {mode === 'skip' ? (
            <select value={step} onChange={(e) => setStep(e.target.value as typeof step)}>
              <option value="INSPECTION">Inspection</option>
              <option value="QC">Quality check</option>
            </select>
          ) : (
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </label>
        {mode === 'skip' ? (
          <label>
            Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        ) : null}
        {mode === 'hold' ? (
          <label>
            Expected resume
            <input type="datetime-local" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
          </label>
        ) : null}
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={() => setMode('menu')}>
            Back
          </button>
          <button
            className="primary"
            type="button"
            disabled={reason.trim().length < 3}
            onClick={() => {
              if (mode === 'hold') {
                return void apply(() =>
                  store.hold(job, reason.trim(), resumeAt ? new Date(resumeAt).toISOString() : undefined),
                );
              }
              if (mode === 'skip') return void apply(() => store.skip(job, step, reason.trim()));
              return void apply(() => store.cancel(job, reason.trim()));
            }}
          >
            Confirm
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="action-stack">
      {store.me.roles.some(role => ['admin', 'manager', 'advisor'].includes(role)) && store.can('jobs:read') &&
        <button type="button" onClick={openTracking}>Tracking link</button>}
      <button type="button" onClick={() => window.print()}>
        Print job card
      </button>
      {job.status === 'ON_HOLD' ? (
        <button type="button" onClick={() => void apply(() => store.resume(job))}>
          Resume work
        </button>
      ) : !['COMPLETED', 'CANCELLED', 'READY_FOR_PICKUP'].includes(job.status) ? (
        <button type="button" onClick={() => setMode('hold')}>
          Put on hold
        </button>
      ) : null}
      {express && store.isDesk && ['CHECKED_IN', 'INSPECTION', 'IN_PROGRESS', 'QUALITY_CHECK'].includes(job.status) ? (
        <button type="button" onClick={() => setMode('skip')}>
          Express skip
        </button>
      ) : null}
      {store.isDesk && ['CHECKED_IN', 'INSPECTION', 'IN_PROGRESS'].includes(job.status) ? (
        <button className="danger" type="button" onClick={() => setMode('cancel')}>
          Cancel job
        </button>
      ) : null}
      <button type="button" onClick={close}>
        Close
      </button>
    </div>
  );
}
