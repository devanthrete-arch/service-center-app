import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { errorMessage } from '../lib/api';
import { getAccessToken } from '../lib/session';
import { staffApi } from './client';
import {
  istDate,
  istToday,
  primaryRole,
  type CenterBooking,
  type CenterPatch,
  type Delivery,
  type JobDetail,
  type JobStatus,
  type JobSummary,
  type LineDraft,
  type Me,
  type Role,
  type StaffMember,
  type WalkInInput,
} from './types';

type Store = {
  me: Me;
  role: Role;
  jobs: JobSummary[];
  pendingBookings: CenterBooking[];
  scheduledBookings: CenterBooking[];
  todayBookings: CenterBooking[];
  staff: StaffMember[];
  technicians: StaffMember[];
  can: (permission: string) => boolean;
  isDesk: boolean;
  refresh: () => Promise<void>;
  job: (id: string) => Promise<JobDetail>;
  deliveries: (id: string) => Promise<Delivery[]>;
  createJob: (input: WalkInInput) => Promise<JobDetail>;
  setStatus: (job: JobDetail, status: JobStatus, note?: string) => Promise<JobDetail>;
  hold: (job: JobDetail, reason: string, expectedResumeAt?: string) => Promise<JobDetail>;
  resume: (job: JobDetail) => Promise<JobDetail>;
  skip: (job: JobDetail, step: 'INSPECTION' | 'QC', reason: string) => Promise<JobDetail>;
  cancel: (job: JobDetail, reason: string) => Promise<JobDetail>;
  assign: (job: JobDetail, staffProfileId: string | null) => Promise<JobDetail>;
  addNote: (job: JobDetail, message: string, visibleToCustomer: boolean) => Promise<JobDetail>;
  saveInspection: (
    job: JobDetail,
    items: { key: string; label?: string; ok: boolean; note?: string }[],
    complete: boolean,
  ) => Promise<JobDetail>;
  qc: (job: JobDetail, passed: boolean, notes?: string) => Promise<JobDetail>;
  addLine: (job: JobDetail, item: LineDraft) => Promise<JobDetail>;
  requestApproval: (job: JobDetail, items: LineDraft[], note: string) => Promise<JobDetail>;
  overrideApproval: (
    job: JobDetail,
    approvalId: string,
    body: {
      approved: boolean;
      acknowledgeNonOemParts?: boolean;
      channel: 'PHONE' | 'IN_PERSON';
      note: string;
      contactPhone?: string;
    },
  ) => Promise<JobDetail>;
  withdrawApproval: (job: JobDetail, approvalId: string) => Promise<JobDetail>;
  addPhoto: (job: JobDetail, caption: string, visibleToCustomer: boolean) => Promise<JobDetail>;
  close: (
    job: JobDetail,
    body: {
      finalAmountInr?: number;
      adjustmentReason?: string;
      adjustmentNote?: string;
      payment?: { method: 'CASH' | 'UPI' | 'CARD'; amountInr: number; reference?: string };
      finalNotes?: string;
      returnedPartLineIds?: string[];
      closeChecklist?: Record<string, boolean>;
    },
  ) => Promise<JobDetail>;
  confirmBooking: (id: string) => Promise<void>;
  declineBooking: (id: string, reason: string) => Promise<void>;
  markNoShow: (id: string) => Promise<void>;
  checkInBooking: (
    id: string,
    body: { odometerKm?: number; fuelLevel?: string; assignedTechnicianId?: string },
  ) => Promise<string>;
  updateCenter: (patch: CenterPatch) => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [pendingBookings, setPendingBookings] = useState<CenterBooking[]>([]);
  const [scheduledBookings, setScheduledBookings] = useState<CenterBooking[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const profile = await staffApi.me();
    const technicianOnly =
      profile.roles.includes('technician') &&
      !profile.roles.some((role) => ['admin', 'manager', 'advisor'].includes(role));
    const desk = profile.permissions.includes('bookings:read');
    const [list, pending, scheduled, roster] = await Promise.all([
      staffApi.jobs({
        active: true,
        assignedTo: technicianOnly ? 'me' : undefined,
        limit: 100,
      }),
      desk ? staffApi.pendingBookings() : Promise.resolve([]),
      desk ? staffApi.rangeBookings(istToday(), istToday(13)) : Promise.resolve({ items: [] }),
      desk ? staffApi.roster().catch(() => []) : Promise.resolve([]),
    ]);
    setMe(profile);
    setJobs(list.data);
    setPendingBookings(pending);
    setScheduledBookings(scheduled.items);
    setStaff(roster);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) return;
    void refresh()
      .then(() => setError(''))
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load the workshop')))
      .finally(() => setReady(true));
  }, [refresh]);

  const after = useCallback(
    async (job: JobDetail) => {
      await refresh();
      return job;
    },
    [refresh],
  );

  const reloadJob = useCallback(async (id: string) => after(await staffApi.job(id)), [after]);

  const value = useMemo<Store | null>(() => {
    if (!me) return null;
    const role = primaryRole(me.roles);
    return {
      me,
      role,
      jobs,
      pendingBookings,
      scheduledBookings,
      todayBookings: scheduledBookings.filter(
        (booking) => istDate(booking.slotStart) === istToday(),
      ),
      staff,
      technicians: staff.filter((member) => member.designation === 'TECHNICIAN'),
      can: (permission) => me.permissions.includes(permission),
      isDesk: me.permissions.includes('jobs:create'),
      refresh,
      job: (id) => staffApi.job(id),
      deliveries: (id) => staffApi.deliveries(id).catch(() => []),
      createJob: async (input) => after(await staffApi.createJob(input)),
      setStatus: async (job, status, note) =>
        after(await staffApi.setStatus(job.id, status, job.version, note)),
      hold: async (job, reason, expectedResumeAt) =>
        after(await staffApi.hold(job.id, reason, job.version, expectedResumeAt)),
      resume: async (job) => after(await staffApi.resume(job.id, job.version)),
      skip: async (job, step, reason) =>
        after(await staffApi.skip(job.id, step, reason, job.version)),
      cancel: async (job, reason) => after(await staffApi.cancel(job.id, reason, job.version)),
      assign: async (job, staffProfileId) =>
        after(await staffApi.assign(job.id, staffProfileId, job.version)),
      addNote: async (job, message, visibleToCustomer) => {
        await staffApi.addNote(job.id, message, visibleToCustomer);
        return reloadJob(job.id);
      },
      saveInspection: async (job, items, complete) =>
        after(await staffApi.inspection(job.id, items, complete, job.version)),
      qc: async (job, passed, notes) =>
        after(await staffApi.qc(job.id, passed, job.version, notes)),
      addLine: async (job, item) => {
        await staffApi.addLine(job.id, item, job.version);
        return reloadJob(job.id);
      },
      requestApproval: async (job, items, note) =>
        after(await staffApi.requestApproval(job.id, items, note, job.version)),
      overrideApproval: async (job, approvalId, body) =>
        after(await staffApi.overrideApproval(job.id, approvalId, body, job.version)),
      withdrawApproval: async (job, approvalId) =>
        after(await staffApi.withdrawApproval(job.id, approvalId, job.version)),
      addPhoto: async (job, caption, visibleToCustomer) => {
        const media = await staffApi.addMedia(job.id, {
          kind: 'INSPECTION',
          mimeType: 'image/jpeg',
          sizeBytes: 120_000,
          caption,
          visibleToCustomer,
        });
        await staffApi.confirmMedia(job.id, media.id);
        return reloadJob(job.id);
      },
      close: async (job, body) => after(await staffApi.close(job.id, body, job.version)),
      confirmBooking: async (id) => {
        await staffApi.confirmBooking(id);
        await refresh();
      },
      declineBooking: async (id, reason) => {
        await staffApi.declineBooking(id, reason);
        await refresh();
      },
      markNoShow: async (id) => {
        await staffApi.markNoShow(id);
        await refresh();
      },
      checkInBooking: async (id, body) => {
        const result = await staffApi.checkInBooking(id, body);
        await refresh();
        return result.job.id;
      },
      updateCenter: async (patch) => {
        const center = await staffApi.updateCenter(patch);
        setMe((current) => (current ? { ...current, center } : current));
      },
    };
  }, [me, jobs, pendingBookings, scheduledBookings, staff, refresh, after, reloadJob]);

  if (!getAccessToken()) return children;
  if (!value) {
    return (
      <main className="center-state">
        {error ? (
          <div className="empty">
            <h3>Workshop unavailable</h3>
            <p className="notice red">{error}</p>
            <button className="primary" type="button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : (
          <p>Loading the workshop…</p>
        )}
      </main>
    );
  }
  if (!ready && error) {
    return (
      <main className="center-state">
        <div className="empty">
          <h3>Workshop unavailable</h3>
          <p className="notice red">{error}</p>
        </div>
      </main>
    );
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}
