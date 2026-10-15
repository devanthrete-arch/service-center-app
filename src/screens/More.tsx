import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, ChevronRight, MessageSquare, Zap } from 'lucide-react';
import { useStore } from '../domain/store';
import { formatWhen, OPEN_STATUSES, roleLabel, statusLabel } from '../domain/types';
import { Badge, ErrorText, statusTone, useAction } from './ui';
import { signOut } from '../lib/session';
import { CenterProfileEditor } from './CenterProfileEditor';

export function Handover() {
  const { jobs, addNote, job: loadJob } = useStore();
  const queue = jobs.filter((job) => OPEN_STATUSES.includes(job.status));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { error, run } = useAction();

  return (
    <section>
      <div className="notice blue">
        <MessageSquare />
        <div>
          <strong>Shift board</strong>
          <p>This is a live projection of open jobs. Notes stay on the job timeline.</p>
        </div>
      </div>
      <ErrorText error={error} />
      <div className="handover-grid">
        {queue.map((job) => {
          const flags = [
            job.status === 'AWAITING_APPROVAL' && 'Pending approval',
            job.status === 'ON_HOLD' && 'On hold',
            job.status === 'READY_FOR_PICKUP' && 'Unclaimed ready',
            job.waitingOnSite && 'Waiting on-site',
          ].filter(Boolean);
          return (
            <article className="handover-card" key={job.id}>
              <div>
                <Link to={`/jobs/${job.id}`}>
                  <strong>
                    {job.jobNumber} · {job.vehicle?.registrationNumber}
                  </strong>
                </Link>
                <Badge tone={statusTone[job.status]}>{statusLabel(job.status)}</Badge>
              </div>
              <p>{job.customer?.name ?? job.serviceType}</p>
              <div className="flag-row">
                {flags.map(String).map((flag) => (
                  <Badge tone={flag === 'Waiting on-site' ? 'green' : 'amber'} key={flag}>
                    {flag}
                  </Badge>
                ))}
              </div>
              <p>{formatWhen(job.estimatedReadyAt)}</p>
              <div className="note-row">
                <input
                  placeholder="Internal handover note"
                  value={notes[job.id] || ''}
                  onChange={(e) =>
                    setNotes((current) => ({ ...current, [job.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  disabled={!notes[job.id]}
                  onClick={() =>
                    void run(async () => {
                      const full = await loadJob(job.id);
                      await addNote(full, notes[job.id], false);
                      setNotes((current) => ({ ...current, [job.id]: '' }));
                    })
                  }
                >
                  Save
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function More() {
  const { me, role, updateCenter, isDesk } = useStore();
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const [upi, setUpi] = useState(me.center.upiVpa ?? '');
  const [express, setExpress] = useState(me.center.expressSkipEnabled);
  const canManageProfile =
    ['admin', 'manager'].includes(role) && me.permissions.includes('center:manage');

  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>Center</h2>
        <dl className="settings">
          <div>
            <dt>Workshop</dt>
            <dd>{me.center.displayName}</dd>
          </div>
          <div>
            <dt>Signed in</dt>
            <dd>
              {me.staff.displayName} · {roleLabel(role)}
            </dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{me.center.publicPhone ?? '—'}</dd>
          </div>
          <div>
            <dt>GSTIN</dt>
            <dd>{me.center.gstin ?? '—'}</dd>
          </div>
        </dl>
        {isDesk && me.permissions.includes('center:manage') ? (
          <>
            <label>
              UPI id for the counter
              <input
                value={upi}
                onChange={(e) => setUpi(e.target.value)}
                placeholder="apexauto@okhdfcbank"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={express}
                onChange={(e) => setExpress(e.target.checked)}
              />
              Allow express skip of inspection and QC
            </label>
            <ErrorText error={error} />
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  updateCenter({ upiVpa: upi || undefined, expressSkipEnabled: express }),
                )
              }
            >
              Save center settings
            </button>
          </>
        ) : (
          <p>UPI · {me.center.upiVpa ?? 'not set'}</p>
        )}
      </section>
      <section className="panel">
        <h2>Shortcuts</h2>
        <div className="shortcut-list">
          {canManageProfile && <Link to="/booking-schedule"><CalendarDays /> Working hours & booking slots<ChevronRight /></Link>}
          {isDesk ? (
            <Link to="/new">
              <Zap /> Walk-in
              <ChevronRight />
            </Link>
          ) : null}
          {isDesk ? (
            <Link to="/bookings">
              <CalendarDays /> Booking queue
              <ChevronRight />
            </Link>
          ) : null}
          <Link to="/handover">
            <MessageSquare /> Shift board
            <ChevronRight />
          </Link>
          <Link to="/jobs">
            <Bell /> Open jobs
            <ChevronRight />
          </Link>
        </div>
        <button
          className="secondary logout"
          type="button"
          onClick={() => {
            signOut();
            navigate('/login', { replace: true });
          }}
        >
          Sign out
        </button>
      </section>
      {canManageProfile && (
        <CenterProfileEditor key={me.center.id} centerId={me.center.id} save={updateCenter} />
      )}
    </div>
  );
}
