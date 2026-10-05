import { autoflex } from '../lib/api';
import type {
  Center,
  CenterBooking,
  Delivery,
  JobDetail,
  JobStatus,
  JobSummary,
  LineDraft,
  LineItem,
  Me,
  Media,
  StaffMember,
  TimelineEntry,
  WalkInInput,
} from './types';

const get = <T>(path: string) => autoflex<T>(path, {}, true);

function command<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  version?: number,
): Promise<T> {
  const headers: Record<string, string> = {
    'Idempotency-Key': crypto.randomUUID(),
  };
  if (version !== undefined) headers['If-Match'] = String(version);
  return autoflex<T>(
    path,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    true,
  );
}

export const staffApi = {
  me: () => get<Me>('/v1/staff/me'),
  roster: () => get<StaffMember[]>('/v1/staff'),
  center: () => get<Center>('/v1/center'),
  updateCenter: (patch: { upiVpa?: string; expressSkipEnabled?: boolean }) =>
    command<Center>('PATCH', '/v1/center', patch),

  jobs: (query: { status?: JobStatus; active?: boolean; assignedTo?: string; search?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.active) params.set('active', 'true');
    if (query.assignedTo) params.set('assignedTo', query.assignedTo);
    if (query.search) params.set('search', query.search);
    params.set('limit', String(query.limit ?? 100));
    return get<{ data: JobSummary[]; total: number }>(`/v1/jobs?${params}`);
  },
  job: (id: string) => get<JobDetail>(`/v1/jobs/${id}`),
  createJob: (input: WalkInInput) => command<JobDetail>('POST', '/v1/jobs', input),
  patchJob: (id: string, body: Record<string, unknown>, version: number) =>
    command<JobDetail>('PATCH', `/v1/jobs/${id}`, body, version),
  setStatus: (id: string, status: JobStatus, version: number, note?: string) =>
    command<JobDetail>('PATCH', `/v1/jobs/${id}/status`, { status, note }, version),
  hold: (id: string, reason: string, version: number, expectedResumeAt?: string) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/hold`, { reason, expectedResumeAt }, version),
  resume: (id: string, version: number) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/resume`, {}, version),
  skip: (id: string, step: 'INSPECTION' | 'QC', reason: string, version: number) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/skip`, { step, reason }, version),
  cancel: (id: string, reason: string, version: number) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/cancel`, { reason }, version),
  assign: (id: string, staffProfileId: string | null, version: number) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/assign`, { staffProfileId }, version),
  addNote: (id: string, message: string, visibleToCustomer: boolean) =>
    command<TimelineEntry>('POST', `/v1/jobs/${id}/notes`, { message, visibleToCustomer }),
  inspection: (
    id: string,
    items: { key: string; label?: string; ok: boolean; note?: string }[],
    complete: boolean,
    version: number,
  ) => command<JobDetail>('PUT', `/v1/jobs/${id}/inspection`, { items, complete }, version),
  qc: (id: string, passed: boolean, version: number, notes?: string) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/qc`, { passed, notes }, version),
  addLine: (id: string, item: LineDraft, version: number) =>
    command<LineItem>('POST', `/v1/jobs/${id}/line-items`, item, version),
  requestApproval: (id: string, items: LineDraft[], note: string, version: number) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/approvals`, { items, note }, version),
  overrideApproval: (
    id: string,
    approvalId: string,
    body: {
      approved?: boolean;
      decisions?: { lineItemId: string; approved: boolean }[];
      acknowledgeNonOemParts?: boolean;
      channel: 'PHONE' | 'IN_PERSON';
      note: string;
      contactPhone?: string;
    },
    version: number,
  ) => command<JobDetail>('POST', `/v1/jobs/${id}/approvals/${approvalId}/override`, body, version),
  withdrawApproval: (id: string, approvalId: string, version: number) =>
    command<JobDetail>('POST', `/v1/jobs/${id}/approvals/${approvalId}/withdraw`, {}, version),
  addMedia: (
    id: string,
    body: { kind: string; mimeType: string; sizeBytes: number; caption?: string; visibleToCustomer?: boolean },
  ) => command<Media>('POST', `/v1/jobs/${id}/media`, body),
  confirmMedia: (id: string, mediaId: string) =>
    command<Media>('POST', `/v1/jobs/${id}/media/${mediaId}/confirm`),
  issueInvoice: (
    id: string,
    body: { finalAmountInr?: number; adjustmentReason?: string; adjustmentNote?: string; notes?: string },
    version: number,
  ) => command<unknown>('POST', `/v1/jobs/${id}/invoice`, body, version),
  close: (
    id: string,
    body: {
      finalAmountInr?: number;
      adjustmentReason?: string;
      adjustmentNote?: string;
      notes?: string;
      payment?: { method: 'CASH' | 'UPI' | 'CARD'; amountInr: number; reference?: string };
      finalNotes?: string;
      returnedPartLineIds?: string[];
      closeChecklist?: Record<string, boolean>;
    },
    version: number,
  ) => command<JobDetail>('POST', `/v1/jobs/${id}/close`, body, version),
  deliveries: (id: string) => get<Delivery[]>(`/v1/jobs/${id}/notifications`),

  dayBookings: (date: string) =>
    get<{ date: string; from: string; to: string; items: CenterBooking[] }>(
      `/v1/center/bookings?date=${date}`,
    ),
  rangeBookings: (from: string, to: string) =>
    get<{ date: string; from: string; to: string; items: CenterBooking[] }>(
      `/v1/center/bookings?from=${from}&to=${to}`,
    ),
  pendingBookings: () => get<CenterBooking[]>('/v1/center/bookings/pending'),
  confirmBooking: (id: string) => command<CenterBooking>('POST', `/v1/center/bookings/${id}/confirm`),
  declineBooking: (id: string, reason: string) =>
    command<CenterBooking>('POST', `/v1/center/bookings/${id}/decline`, { reason }),
  markNoShow: (id: string) => command<CenterBooking>('POST', `/v1/center/bookings/${id}/no-show`),
  checkInBooking: (
    id: string,
    body: { odometerKm?: number; fuelLevel?: string; assignedTechnicianId?: string },
  ) =>
    command<{ booking: CenterBooking; job: { id: string; jobNumber: string | null } }>(
      'POST',
      `/v1/center/bookings/${id}/check-in`,
      body,
    ),
};
