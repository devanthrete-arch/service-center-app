import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Plus,
  Wrench,
} from 'lucide-react';
import { useStore } from '../domain/store';
import { formatWhen, istDate, istToday, OPEN_STATUSES, statusLabel } from '../domain/types';
import { Badge, Empty, statusTone } from './ui';

export function JobCard({ id }: { id: string }) {
  const { jobs, staff } = useStore();
  const job = jobs.find((item) => item.id === id);
  if (!job) return null;
  const tech = staff.find((member) => member.id === job.assignedTechnicianId);
  return (
    <Link className="job-card" to={`/jobs/${job.id}`}>
      <div className="job-head">
        <div>
          <strong>{job.vehicle?.registrationNumber ?? 'No plate'}</strong>
          <span>{job.vehicle?.makeModel ?? job.serviceType}</span>
        </div>
        <Badge tone={statusTone[job.status]}>{statusLabel(job.status)}</Badge>
      </div>
      <p>{job.customer?.name ?? job.customer?.phone ?? job.serviceType}</p>
      <div className="job-meta">
        <span>
          <Clock3 /> {formatWhen(job.estimatedReadyAt)}
        </span>
        <span>
          <Wrench /> {tech?.displayName ?? 'Unassigned'}
        </span>
        {job.waitingOnSite ? <Badge tone="green">Waiting here</Badge> : null}
        {job.priority === 'URGENT' ? <Badge tone="red">Urgent</Badge> : null}
        <ChevronRight className="chev" />
      </div>
    </Link>
  );
}

export function Dashboard() {
  const { jobs, pendingBookings, scheduledBookings, role, isDesk, me } = useStore();
  const active = jobs.filter((job) => OPEN_STATUSES.includes(job.status));
  const pending = active.filter((job) => job.status === 'AWAITING_APPROVAL').length;
  const ready = active.filter((job) => job.status === 'READY_FOR_PICKUP').length;
  const held = active.filter((job) => job.status === 'ON_HOLD').length;
  const upcoming = scheduledBookings.filter(
    (booking) =>
      (booking.status === 'AWAITING_ARRIVAL' || booking.status === 'CONFIRMED') &&
      istDate(booking.slotStart) > istToday(),
  );

  return (
    <>
      <section className="hero">
        <div>
          <Badge tone="light">{me.center.displayName.toUpperCase()}</Badge>
          <h2>
            {active.length} {role === 'technician' ? 'assigned jobs' : 'jobs'} on the floor
          </h2>
          <p>Start with approvals and arrivals, then keep the bay moving.</p>
        </div>
        {isDesk ? (
          <div className="hero-actions">
            <Link className="primary" to="/new">
              <Plus /> Walk-in
            </Link>
            <Link className="secondary light" to="/bookings">
              <CalendarDays /> Bookings
            </Link>
          </div>
        ) : null}
      </section>
      <section className="metrics">
        <Link to="/jobs">
          <span className="metric-icon blue">
            <Wrench />
          </span>
          <div>
            <strong>{active.length}</strong>
            <p>{role === 'technician' ? 'My jobs' : 'Open jobs'}</p>
          </div>
        </Link>
        <Link to="/jobs?status=AWAITING_APPROVAL">
          <span className="metric-icon amber">
            <Clock3 />
          </span>
          <div>
            <strong>{pending}</strong>
            <p>Pending approvals</p>
          </div>
        </Link>
        <Link to="/jobs?status=READY_FOR_PICKUP">
          <span className="metric-icon green">
            <CheckCircle2 />
          </span>
          <div>
            <strong>{ready}</strong>
            <p>Ready for pickup</p>
          </div>
        </Link>
        <Link to={isDesk ? '/bookings' : '/jobs?status=ON_HOLD'}>
          <span className="metric-icon red">
            {isDesk ? <CalendarDays /> : <AlertTriangle />}
          </span>
          <div>
            <strong>{isDesk ? pendingBookings.length : held}</strong>
            <p>{isDesk ? 'Booking requests' : 'On hold'}</p>
          </div>
        </Link>
      </section>
      <div className="content-grid">
        <section>
          <div className="section-head">
            <div>
              <h2>{role === 'technician' ? 'My queue' : "Today's jobs"}</h2>
              <p>Live from the workshop</p>
            </div>
            <Link to="/jobs">View all</Link>
          </div>
          <div className="job-list">
            {active.slice(0, 6).map((job) => (
              <JobCard key={job.id} id={job.id} />
            ))}
            {!active.length ? <Empty title="Nothing on the floor" copy="Walk-ins and checked-in bookings appear here." /> : null}
          </div>
        </section>
        <aside className="attention">
          <div className="section-head">
            <div>
              <h2>Needs attention</h2>
              <p>Exceptions before handover</p>
            </div>
          </div>
          {isDesk && pendingBookings.length ? (
            <Link to="/bookings">
              <span className="alert-icon orange">
                <CalendarDays />
              </span>
              <div>
                <strong>{pendingBookings.length} booking{pendingBookings.length === 1 ? '' : 's'} waiting</strong>
                <p>{pendingBookings[0].vehicleLabel} · {pendingBookings[0].registrationNumber}</p>
              </div>
              <ChevronRight />
            </Link>
          ) : null}
          {isDesk && !pendingBookings.length && upcoming.length ? (
            <Link to="/bookings">
              <span className="alert-icon orange">
                <CalendarDays />
              </span>
              <div>
                <strong>
                  {upcoming.length} upcoming visit{upcoming.length === 1 ? '' : 's'}
                </strong>
                <p>
                  {upcoming[0].vehicleLabel} · {upcoming[0].registrationNumber}
                </p>
              </div>
              <ChevronRight />
            </Link>
          ) : null}
          {pending ? (
            <Link to="/jobs?status=AWAITING_APPROVAL">
              <span className="alert-icon orange">
                <Clock3 />
              </span>
              <div>
                <strong>{pending} approval{pending === 1 ? '' : 's'} open</strong>
                <p>Owner decision or verbal override</p>
              </div>
              <ChevronRight />
            </Link>
          ) : null}
          {held ? (
            <Link to="/jobs?status=ON_HOLD">
              <span className="alert-icon orange">
                <AlertTriangle />
              </span>
              <div>
                <strong>{held} on hold</strong>
                <p>Resume when the part or customer is ready</p>
              </div>
              <ChevronRight />
            </Link>
          ) : null}
          {ready ? (
            <Link to="/jobs?status=READY_FOR_PICKUP">
              <span className="alert-icon blue">
                <CheckCircle2 />
              </span>
              <div>
                <strong>{ready} ready for pickup</strong>
                <p>Close the bill at the counter</p>
              </div>
              <ChevronRight />
            </Link>
          ) : null}
          {!pending && !held && !ready && !pendingBookings.length && !upcoming.length ? (
            <p className="empty">The floor is clear.</p>
          ) : null}
          {me.center.upiVpa ? <p className="eyebrow">Pay at counter · {me.center.upiVpa}</p> : null}
        </aside>
      </div>
    </>
  );
}

export function Jobs() {
  const { jobs } = useStore();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || 'OPEN');
  const [search, setSearch] = useState('');

  const filtered = jobs.filter((job) => {
    const statusOk =
      status === 'ALL' ||
      (status === 'OPEN' ? OPEN_STATUSES.includes(job.status) : job.status === status);
    const haystack = `${job.jobNumber} ${job.vehicle?.registrationNumber} ${job.customer?.phone} ${job.customer?.name}`.toLowerCase();
    return statusOk && haystack.includes(search.toLowerCase());
  });

  return (
    <section>
      <div className="toolbar">
        <label className="search">
          <input
            placeholder="Search registration, phone or job #"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="OPEN">All open</option>
          <option value="AWAITING_APPROVAL">Pending approval</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="ON_HOLD">On hold</option>
          <option value="READY_FOR_PICKUP">Ready</option>
          <option value="ALL">Loaded jobs</option>
        </select>
      </div>
      <div className="section-head">
        <div>
          <h2>{filtered.length} jobs</h2>
          <p>Open jobs stay loaded. Completed cards stay on the job URL after close.</p>
        </div>
      </div>
      <div className="job-list">
        {filtered.map((job) => (
          <JobCard key={job.id} id={job.id} />
        ))}
        {!filtered.length ? <Empty title="No matching jobs" copy="Try a different search or filter." /> : null}
      </div>
    </section>
  );
}
