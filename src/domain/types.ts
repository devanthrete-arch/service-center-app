export type JobStatus =
  | 'CHECKED_IN'
  | 'INSPECTION'
  | 'AWAITING_APPROVAL'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'QUALITY_CHECK'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED'
  | 'CANCELLED';

export type Role = 'admin' | 'manager' | 'advisor' | 'technician';

export type LineKind = 'LABOUR' | 'PART' | 'FEE';
export type PartType = 'OEM' | 'OES' | 'LOCAL';
export type LineStatus = 'INCLUDED' | 'PENDING' | 'APPROVED' | 'DECLINED';
export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'DECLINED'
  | 'WITHDRAWN';

export type StaffMember = {
  id: string;
  displayName: string;
  designation: string | null;
  employeeCode: string | null;
  isActive: boolean;
};

export type Center = {
  id: string;
  name: string;
  displayName: string;
  publicPhone: string | null;
  gstin: string | null;
  upiVpa: string | null;
  expressSkipEnabled: boolean;
  address: {
    city: string | null;
    formatted: string | null;
    line1?: string | null;
    line2?: string | null;
    state?: string | null;
    postalCode?: string | null;
  };
  latitude?: number | null;
  longitude?: number | null;
  heroImageUrl?: string | null;
  photoUrls?: string[];
  googleMapsUrl?: string | null;
  autoAccept: boolean;
  slotCapacity: number;
};

export type CenterPatch = {
  upiVpa?: string;
  expressSkipEnabled?: boolean;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  heroImageUrl?: string | null;
  photoUrls?: string[];
  googleMapsUrl?: string | null;
};

export type Me = {
  staff: StaffMember;
  center: Center;
  roles: string[];
  permissions: string[];
};

export type LineItem = {
  scope?: { name: string; description: string | null; quantity: number }[];
  id: string;
  kind: LineKind;
  description: string;
  partType: PartType | null;
  quantity: number;
  unitPriceInr: string;
  amountInr: string;
  status: LineStatus;
  approvalId: string | null;
  partReturnedAt: string | null;
};

export type Approval = {
  id: string;
  version: number;
  status: ApprovalStatus;
  note: string | null;
  totalInr: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: 'CUSTOMER' | 'STAFF' | null;
  decisionChannel: string | null;
  decisionNote: string | null;
  items: LineItem[];
};

export type Media = {
  id: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  visibleToCustomer: boolean;
  uploadStatus: string;
  createdAt: string;
};

export type TimelineEntry = {
  id: string;
  type: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
  payload: Record<string, unknown> | null;
  visibleToCustomer: boolean;
  createdAt: string;
};

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: 'DUE' | 'PAID' | 'VOID';
  totalInr: string;
  paidInr: string;
  balanceInr: string;
};

export type JobSummary = {
  id: string;
  jobNumber: string | null;
  version: number;
  status: JobStatus;
  serviceType: string;
  priority: string;
  odometerKm: number | null;
  estimatedReadyAt: string | null;
  assignedTechnicianId: string | null;
  waitingOnSite: boolean;
  sourceBookingId: string | null;
  customer: { name: string | null; phone: string } | null;
  vehicle: { registrationNumber: string; makeModel: string | null } | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type JobDetail = JobSummary & {
  customerRequest: string | null;
  previousStatus: JobStatus | null;
  hold: { reason: string | null; expectedResumeAt: string | null } | null;
  cancellationReason: string | null;
  comeback: { ofJobId: string; reason: string | null; warrantyIntent: boolean } | null;
  inspection: {
    items: Record<string, { ok: boolean; label?: string; note?: string }> | null;
    completedAt: string | null;
  };
  qc: { passedAt: string | null; notes: string | null; byStaffProfileId: string | null };
  assignedTechnician: { id: string; displayName: string | null } | null;
  totals: { includedInr: string; approvedInr: string; pendingInr: string; currentInr: string };
  budget: { ceilingInr: string; projectedInr: string; exceeds: boolean } | null;
  lineItems: LineItem[];
  approvals: Approval[];
  pendingApprovalId: string | null;
  media: Media[];
  timeline: TimelineEntry[];
  skippedSteps: string[];
  pickupNote: string | null;
  close: {
    finalAmountInr: string;
    adjustmentReason: string | null;
    adjustmentNote: string | null;
    finalNotes: string | null;
    checklist: Record<string, boolean> | null;
  } | null;
  invoice: InvoiceSummary | null;
};

export type CenterBooking = {
  id: string;
  bookingNumber: string | null;
  status: string;
  estimateInr: string;
  slotStart: string;
  slotEnd: string;
  issueDescription: string | null;
  vehicleLabel: string;
  registrationNumber: string;
  items: { name: string; priceInr: string }[];
  serviceJobId: string | null;
  customer: { profileId: string; name: string | null; phone: string | null };
  vehicle: { make: string; model: string; currentOdometerKm: number | null } | null;
};

export type Delivery = {
  id: string;
  jobId: string | null;
  channel: string;
  templateKey: string;
  recipient: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

export type IntakeVehicleType = 'TWO_WHEELER' | 'FOUR_WHEELER';
export type CreatedJob = {
  id: string;
  jobNumber: string | null;
  status: JobStatus;
};
export type IntakeCustomer = {
  id: string;
  revision: number;
  name: string | null;
  phone: string;
  accountLinkState: 'ACCOUNT_LINKED' | 'LINK_REQUIRED';
};
export type IntakeVehicle = {
  id: string;
  revision: number;
  registrationNumber: string;
  makeModel: string | null;
  vehicleType: IntakeVehicleType | null;
  hasActiveJob: boolean;
  activeJob?: CreatedJob | null;
};
export type IntakeVehiclePage = {
  items: IntakeVehicle[];
  nextCursor: string | null;
  customerRevision: number;
};
export type WalkInInput = {
  customerId: string;
  customerRevision: number;
  vehicleId?: string;
  vehicleRevision?: number;
  confirmedVehicleType?: IntakeVehicleType;
  newVehicle?: {
    registrationNumber: string;
    vehicleType: IntakeVehicleType;
    makeModel?: string;
  };
  serviceType: string;
  odometerKm?: number;
  fuelLevel?: string;
  customerRequest?: string;
  waitingOnSite?: boolean;
  priority?: 'NORMAL' | 'URGENT';
  estimatedReadyAt?: string;
  budgetCeiling?: number;
  assignedTechnicianId?: string;
  accessoriesChecklist?: Record<string, unknown>;
  comebackOfJobId?: string;
  comebackReason?: string;
  warrantyIntent?: boolean;
};

export type LineDraft = {
  kind: LineKind;
  description: string;
  partType?: PartType;
  quantity?: number;
  unitPriceInr: number;
};

export const INSPECTION_KEYS = [
  { key: 'brakes', label: 'Brakes' },
  { key: 'tyres', label: 'Tyres' },
  { key: 'lights', label: 'Lights' },
  { key: 'fluids', label: 'Fluids' },
  { key: 'battery', label: 'Battery' },
  { key: 'chain', label: 'Chain / drive' },
] as const;

export const CLOSE_CHECKS = [
  { key: 'work_verified', label: 'Work verified' },
  { key: 'road_test', label: 'Road test done' },
  { key: 'no_tools_left', label: 'No tools left in the vehicle' },
  { key: 'customer_briefed', label: 'Customer briefed' },
] as const;

export const FLOOR_NEXT: Partial<Record<JobStatus, JobStatus>> = {
  CHECKED_IN: 'INSPECTION',
  INSPECTION: 'IN_PROGRESS',
  IN_PROGRESS: 'QUALITY_CHECK',
};

export const OPEN_STATUSES: JobStatus[] = [
  'CHECKED_IN',
  'INSPECTION',
  'AWAITING_APPROVAL',
  'IN_PROGRESS',
  'ON_HOLD',
  'QUALITY_CHECK',
  'READY_FOR_PICKUP',
];

export function statusLabel(status: JobStatus): string {
  return {
    CHECKED_IN: 'Checked in',
    INSPECTION: 'Inspection',
    AWAITING_APPROVAL: 'Waiting for approval',
    IN_PROGRESS: 'In progress',
    ON_HOLD: 'On hold',
    QUALITY_CHECK: 'Quality check',
    READY_FOR_PICKUP: 'Ready for pickup',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }[status];
}

export function money(value: string | number | null | undefined): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function formatSlot(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function istToday(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });
}

export function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function formatIstDay(isoOrDate: string): string {
  const date = isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T00:00:00+05:30`;
  return new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function toE164(phone: string): string {
  const digits = digitsOnly(phone).slice(-10);
  return `+91${digits}`;
}

export function primaryRole(roles: string[]): Role {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('manager')) return 'manager';
  if (roles.includes('advisor')) return 'advisor';
  return 'technician';
}

export function roleLabel(role: Role): string {
  return { admin: 'Admin', manager: 'Manager', advisor: 'Advisor', technician: 'Technician' }[role];
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function eventTitle(entry: TimelineEntry): string {
  const payload = entry.payload ?? {};
  const text = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string) : '');
  switch (entry.type) {
    case 'STATUS_CHANGE':
      return entry.toStatus ? statusLabel(entry.toStatus) : 'Status changed';
    case 'NOTE':
      return text('message') || 'Note';
    case 'APPROVAL_REQUESTED':
      return `Approval requested · ${money(text('totalInr'))}`;
    case 'APPROVAL_RESOLVED':
      return `Approval ${text('status').toLowerCase() || 'resolved'}`;
    case 'MEDIA_ADDED':
      return text('caption') || 'Photo added';
    case 'INSPECTION_RECORDED':
      return 'Inspection updated';
    case 'INSPECTION_SKIPPED':
      return 'Inspection skipped';
    case 'QC_SKIPPED':
      return 'Quality check skipped';
    case 'INVOICE_ISSUED':
      return `Bill ${text('invoiceNumber')}`;
    case 'PAYMENT_RECORDED':
      return `Payment · ${text('method')}`;
    default:
      return entry.type.replaceAll('_', ' ').toLowerCase();
  }
}

export const DEV_PERSONAS: { key: string; name: string; role: string; detail: string }[] = [
  {
    key: 'manager',
    name: 'Meera Iyer',
    role: 'Manager',
    detail: 'Floor, roster, bills, and verbal overrides',
  },
  {
    key: 'advisor',
    name: 'Arjun Rao',
    role: 'Advisor',
    detail: 'Walk-ins, bookings, and approvals',
  },
  {
    key: 'technician',
    name: 'Ravi Kumar',
    role: 'Technician',
    detail: 'Assigned jobs on the floor',
  },
  {
    key: 'technician2',
    name: 'Sana Sheikh',
    role: 'Technician',
    detail: 'Second technician on the roster',
  },
];
