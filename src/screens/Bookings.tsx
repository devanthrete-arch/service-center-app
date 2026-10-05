import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../domain/store';
import { formatIstDay, formatSlot, formatWhen, istDate, istToday, money, type CenterBooking } from '../domain/types';
import { Badge, Empty, ErrorText, Modal, useAction } from './ui';

function BookingCard({
  booking,
  busy,
  onCheckIn,
  onNoShow,
  onOpenJob,
}: {
  booking: CenterBooking;
  busy: boolean;
  onCheckIn: () => void;
  onNoShow: () => void;
  onOpenJob: () => void;
}) {
  return (
    <article className="job-card">
      <div className="job-head">
        <div>
          <strong>{booking.registrationNumber}</strong>
          <span>
            {formatSlot(booking.slotStart)}–{formatSlot(booking.slotEnd)} · {booking.bookingNumber}
          </span>
        </div>
        <Badge tone={booking.status === 'CHECKED_IN' ? 'green' : booking.status === 'NO_SHOW' ? 'red' : 'blue'}>
          {booking.status.replaceAll('_', ' ')}
        </Badge>
      </div>
      <p>
        {booking.customer.name ?? booking.customer.phone} · {booking.vehicleLabel}
      </p>
      {booking.status === 'AWAITING_ARRIVAL' || booking.status === 'CONFIRMED' ? (
        <div className="detail-actions">
          <button className="primary compact" disabled={busy} onClick={onCheckIn}>
            Check in
          </button>
          <button className="secondary compact" disabled={busy} onClick={onNoShow}>
            No-show
          </button>
        </div>
      ) : null}
      {booking.serviceJobId ? (
        <button className="text-btn" type="button" onClick={onOpenJob}>
          Open job card →
        </button>
      ) : null}
    </article>
  );
}

export function Bookings() {
  const { pendingBookings, scheduledBookings, technicians, confirmBooking, declineBooking, markNoShow, checkInBooking } =
    useStore();
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [odometer, setOdometer] = useState('');
  const [techId, setTechId] = useState('');
  const today = istToday();
  const groups = useMemo(() => {
    const byDay = new Map<string, CenterBooking[]>();
    for (const booking of scheduledBookings) {
      if (booking.status === 'PENDING_CENTER' || booking.status === 'CANCELLED') continue;
      const day = istDate(booking.slotStart);
      const list = byDay.get(day) ?? [];
      list.push(booking);
      byDay.set(day, list);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledBookings]);
  const todayBookings = groups.find(([day]) => day === today)?.[1] ?? [];
  const upcoming = groups.filter(([day]) => day > today);

  const checkInTarget = [...pendingBookings, ...scheduledBookings].find((item) => item.id === checkInId);

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Booking queue</h2>
          <p>Confirm requests, then check the vehicle in when it arrives.</p>
        </div>
      </div>
      <ErrorText error={error} />
      <h3>Waiting for the center</h3>
      <div className="job-list">
        {pendingBookings.map((booking) => (
          <article className="job-card" key={booking.id}>
            <div className="job-head">
              <div>
                <strong>{booking.registrationNumber}</strong>
                <span>
                  {booking.customer.name ?? booking.customer.phone} · {booking.bookingNumber}
                </span>
              </div>
              <Badge tone="amber">Requested</Badge>
            </div>
            <p>
              {booking.vehicleLabel} · {formatWhen(booking.slotStart)} · {money(booking.estimateInr)}
            </p>
            <p>{booking.issueDescription || booking.items.map((item) => item.name).join(', ')}</p>
            <div className="detail-actions">
              <button className="primary compact" disabled={busy} onClick={() => void run(() => confirmBooking(booking.id))}>
                Confirm
              </button>
              <button className="secondary compact" disabled={busy} onClick={() => setDeclineId(booking.id)}>
                Decline
              </button>
            </div>
          </article>
        ))}
        {!pendingBookings.length ? <Empty title="No pending requests" copy="New customer bookings land here." /> : null}
      </div>
      <h3>Today</h3>
      <div className="job-list">
        {todayBookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            busy={busy}
            onCheckIn={() => setCheckInId(booking.id)}
            onNoShow={() => void run(() => markNoShow(booking.id))}
            onOpenJob={() => navigate(`/jobs/${booking.serviceJobId}`)}
          />
        ))}
        {!todayBookings.length ? <Empty title="No bookings today" copy="Confirmed visits for later days stay below." /> : null}
      </div>
      {upcoming.map(([day, bookings]) => (
        <div key={day}>
          <h3>{formatIstDay(day)}</h3>
          <div className="job-list">
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                busy={busy}
                onCheckIn={() => setCheckInId(booking.id)}
                onNoShow={() => void run(() => markNoShow(booking.id))}
                onOpenJob={() => navigate(`/jobs/${booking.serviceJobId}`)}
              />
            ))}
          </div>
        </div>
      ))}
      {!upcoming.length && !todayBookings.length ? (
        <Empty title="No confirmed visits" copy="Accepted bookings for the next two weeks appear here." />
      ) : null}
      {declineId ? (
        <Modal title="Decline booking" close={() => setDeclineId(null)}>
          <label>
            Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Slot full, vehicle type, etc." />
          </label>
          <div className="modal-actions">
            <button className="secondary" type="button" onClick={() => setDeclineId(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={reason.trim().length < 3 || busy}
              onClick={() =>
                void run(async () => {
                  await declineBooking(declineId, reason.trim());
                  setDeclineId(null);
                  setReason('');
                })
              }
            >
              Decline
            </button>
          </div>
        </Modal>
      ) : null}
      {checkInId && checkInTarget ? (
        <Modal title={`Check in ${checkInTarget.registrationNumber}`} close={() => setCheckInId(null)}>
          <label>
            Odometer (km)
            <input
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder={String(checkInTarget.vehicle?.currentOdometerKm ?? '')}
            />
          </label>
          <label>
            Assign technician
            <select value={techId} onChange={(e) => setTechId(e.target.value)}>
              <option value="">Unassigned</option>
              {technicians.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button className="secondary" type="button" onClick={() => setCheckInId(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const jobId = await checkInBooking(checkInId, {
                    odometerKm: odometer ? Number(odometer) : undefined,
                    assignedTechnicianId: techId || undefined,
                  });
                  setCheckInId(null);
                  navigate(`/jobs/${jobId}`);
                })
              }
            >
              Open job card
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
