import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Role = 'advisor' | 'technician' | 'manager'
export type JobStatus = 'CHECKED_IN' | 'INSPECTION' | 'AWAITING_APPROVAL' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'READY_FOR_PICKUP' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'APPROVED_BY_ADVISOR'
export type PartType = 'OEM' | 'OES' | 'LOCAL'
export type NotificationStatus = 'SENT' | 'FAILED' | 'SUPPRESSED'

export interface Staff { id: string; name: string; role: Role }
export interface LineItem { id: string; description: string; category: 'PART' | 'LABOUR'; partType?: PartType; amount: number; approved: boolean }
export interface Media { id: string; type: 'PRE_CONDITION' | 'INSPECTION' | 'BEFORE' | 'AFTER' | 'PARTS' | 'ODOMETER' | 'COMEBACK_COMPARE'; caption: string; visibleToCustomer: boolean; uploadStatus: 'CONFIRMED' | 'FAILED'; createdAt: string }
export interface Event { id: string; type: string; message: string; actor: string; visibleToCustomer: boolean; createdAt: string }
export interface Notification { id: string; jobId: string; channel: 'WHATSAPP' | 'SMS' | 'IN_APP'; message: string; status: NotificationStatus; attempts: number; createdAt: string }
export interface Approval { id: string; status: ApprovalStatus; lineItems: LineItem[]; total: number; note: string; createdAt: string; resolvedAt?: string }
export interface Job {
  id: string; number: string; customerName: string; phone: string; secondaryPhone?: string; whoApproves: 'OWNER' | 'SECONDARY'
  vehicle: { registration: string; make: string; model: string; nickname?: string }
  request: string; serviceType: string; odometerKm: number; fuelLevel: string; accessories: string[]
  status: JobStatus; previousStatus?: JobStatus; priority: 'NORMAL' | 'URGENT'; waitingOnSite: boolean
  estimatedReadyAt: string; softEstimate: number; budgetCeiling?: number; assignedTechnicianId?: string
  locale: string; consent: boolean; createdAt: string; updatedAt: string; closedAt?: string
  events: Event[]; media: Media[]; approvals: Approval[]; lineItems: LineItem[]
  inspection: Record<string, boolean>; finalAmount?: number; paymentMode?: 'CASH' | 'UPI'; mismatchReason?: string; oldPartsReturned?: boolean
  holdReason?: string; expectedResumeAt?: string; comebackOfJobId?: string; comebackReason?: string; warrantyIntent?: boolean
}
export interface NewJob {
  customerName: string; phone: string; secondaryPhone?: string; whoApproves: 'OWNER' | 'SECONDARY'; registration: string; make: string; model: string
  request: string; serviceType: string; odometerKm: number; fuelLevel: string; accessories: string[]; estimatedReadyAt: string
  softEstimate: number; budgetCeiling?: number; waitingOnSite: boolean; locale: string; consent: boolean; urgent?: boolean; comebackOfJobId?: string; warrantyIntent?: boolean
}

const now = new Date('2026-10-04T10:30:00+05:30')
const iso = (mins = 0) => new Date(now.getTime() + mins * 60000).toISOString()
const event = (id: string, type: string, message: string, actor: string, mins: number, visible = true): Event =>
  ({ id, type, message, actor, visibleToCustomer: visible, createdAt: iso(mins) })

const staff: Staff[] = [
  { id: 's1', name: 'Asha Mehta', role: 'advisor' },
  { id: 's2', name: 'Ravi Kumar', role: 'technician' },
  { id: 's3', name: 'Nikhil Shah', role: 'technician' },
  { id: 's4', name: 'Meera Joshi', role: 'manager' },
]

const seedJobs: Job[] = [
  {
    id: 'j1', number: 'AF-1042', customerName: 'Arjun Rao', phone: '9876543210', whoApproves: 'OWNER',
    vehicle: { registration: 'MH 12 QX 4821', make: 'Honda', model: 'Activa 6G' }, request: 'Periodic service, vibration above 40 km/h',
    serviceType: 'PERIODIC_SERVICE', odometerKm: 18420, fuelLevel: '1/2', accessories: ['Helmet'], status: 'AWAITING_APPROVAL',
    priority: 'NORMAL', waitingOnSite: false, estimatedReadyAt: iso(270), softEstimate: 1200, budgetCeiling: 2500, assignedTechnicianId: 's2',
    locale: 'en-IN', consent: true, createdAt: iso(-165), updatedAt: iso(-22),
    inspection: { brakes: true, tyres: true, lights: true, fluids: true, battery: false },
    media: [{ id: 'm1', type: 'INSPECTION', caption: 'Rear brake pads near wear limit', visibleToCustomer: true, uploadStatus: 'CONFIRMED', createdAt: iso(-55) }],
    approvals: [{ id: 'a1', status: 'PENDING', total: 980, note: 'Rear brake pads should be replaced today.', createdAt: iso(-25), lineItems: [
      { id: 'l2', description: 'Rear brake pad set', category: 'PART', partType: 'OEM', amount: 680, approved: false },
      { id: 'l3', description: 'Brake fitting labour', category: 'LABOUR', amount: 300, approved: false },
    ] }],
    lineItems: [{ id: 'l1', description: 'Periodic service package', category: 'LABOUR', amount: 1200, approved: true }],
    events: [event('e1','STATUS_CHANGE','Vehicle checked in','Asha Mehta',-165), event('e2','STATUS_CHANGE','Inspection started','Asha Mehta',-82), event('e3','MEDIA_ADDED','Rear brake wear documented','Ravi Kumar',-55), event('e4','APPROVAL_REQUESTED','Approval requested for ₹980','Asha Mehta',-25)],
  },
  {
    id: 'j2', number: 'AF-1041', customerName: 'Neha Patil', phone: '9822011445', whoApproves: 'OWNER',
    vehicle: { registration: 'MH 14 LR 9920', make: 'TVS', model: 'Jupiter' }, request: 'Starter motor intermittent',
    serviceType: 'REPAIR', odometerKm: 22301, fuelLevel: '1/4', accessories: [], status: 'IN_PROGRESS', priority: 'NORMAL', waitingOnSite: true,
    estimatedReadyAt: iso(90), softEstimate: 850, assignedTechnicianId: 's3', locale: 'mr-IN', consent: true, createdAt: iso(-240), updatedAt: iso(-35),
    inspection: { brakes: true, tyres: true, lights: true, fluids: true, battery: true }, media: [], approvals: [], lineItems: [{ id: 'l4', description: 'Starter relay service', category: 'LABOUR', amount: 850, approved: true }],
    events: [event('e5','STATUS_CHANGE','Vehicle checked in','Asha Mehta',-240), event('e6','STATUS_CHANGE','Work started','Nikhil Shah',-75)],
  },
  {
    id: 'j3', number: 'AF-1040', customerName: 'Kabir Sheikh', phone: '9890022448', whoApproves: 'OWNER',
    vehicle: { registration: 'MH 12 TT 7718', make: 'Bajaj', model: 'Pulsar 150' }, request: 'Towed in — chain snapped',
    serviceType: 'BREAKDOWN', odometerKm: 34800, fuelLevel: 'Low', accessories: [], status: 'READY_FOR_PICKUP', priority: 'URGENT', waitingOnSite: false,
    estimatedReadyAt: iso(-80), softEstimate: 1850, assignedTechnicianId: 's2', locale: 'hi-IN', consent: true, createdAt: iso(-380), updatedAt: iso(-95),
    inspection: { brakes: true, tyres: true, lights: true, fluids: true, battery: true }, media: [], approvals: [{ id: 'a2', status: 'APPROVED_BY_ADVISOR', total: 1850, note: 'Approved by phone', createdAt: iso(-300), resolvedAt: iso(-295), lineItems: [] }],
    lineItems: [{ id: 'l5', description: 'Chain sprocket kit', category: 'PART', partType: 'OES', amount: 1450, approved: true }, { id: 'l6', description: 'Fitment', category: 'LABOUR', amount: 400, approved: true }],
    events: [event('e7','STATUS_CHANGE','Urgent tow-in received','Asha Mehta',-380), event('e8','APPROVAL_RESOLVED','Verbal approval recorded','Asha Mehta',-295), event('e9','STATUS_CHANGE','Ready for pickup','Ravi Kumar',-95)],
  },
  {
    id: 'j4', number: 'AF-1039', customerName: 'Maya Iyer', phone: '9764001133', whoApproves: 'OWNER',
    vehicle: { registration: 'MH 12 NK 3091', make: 'Suzuki', model: 'Access 125' }, request: 'Engine oil leak',
    serviceType: 'REPAIR', odometerKm: 12950, fuelLevel: '3/4', accessories: ['Top box'], status: 'ON_HOLD', previousStatus: 'IN_PROGRESS', holdReason: 'ORDERED', expectedResumeAt: iso(-120),
    priority: 'NORMAL', waitingOnSite: false, estimatedReadyAt: iso(600), softEstimate: 2100, budgetCeiling: 3000, assignedTechnicianId: 's3', locale: 'en-IN', consent: true, createdAt: iso(-1500), updatedAt: iso(-600),
    inspection: { brakes: true, tyres: true, lights: true, fluids: false, battery: true }, media: [], approvals: [], lineItems: [{ id: 'l7', description: 'Oil seal', category: 'PART', partType: 'OEM', amount: 900, approved: true }],
    events: [event('e10','STATUS_CHANGE','Vehicle checked in','Asha Mehta',-1500), event('e11','STATUS_CHANGE','On hold — part ordered','Asha Mehta',-600)],
  },
  {
    id: 'j5', number: 'AF-1032', customerName: 'Dev Malhotra', phone: '9811112233', whoApproves: 'OWNER',
    vehicle: { registration: 'MH 01 AB 4432', make: 'Royal Enfield', model: 'Classic 350' }, request: '30,000 km service',
    serviceType: 'PERIODIC_SERVICE', odometerKm: 30110, fuelLevel: '1/2', accessories: [], status: 'COMPLETED', priority: 'NORMAL', waitingOnSite: false,
    estimatedReadyAt: iso(-3000), softEstimate: 3200, assignedTechnicianId: 's2', locale: 'en-IN', consent: true, createdAt: iso(-10080), updatedAt: iso(-8000), closedAt: iso(-8000),
    inspection: { brakes: true, tyres: true, lights: true, fluids: true, battery: true }, media: [{ id:'m9', type:'AFTER', caption:'Completed service and cleaned chain', visibleToCustomer:true, uploadStatus:'CONFIRMED', createdAt:iso(-8100) }],
    approvals: [], finalAmount: 3200, paymentMode: 'UPI', oldPartsReturned: true,
    lineItems: [{ id: 'l8', description: '30k service package', category: 'LABOUR', amount: 3200, approved: true }],
    events: [event('e12','STATUS_CHANGE','Vehicle checked in','Asha Mehta',-10080), event('e13','JOB_CLOSED','Completed · ₹3,200 via UPI','Asha Mehta',-8000)],
  },
]

const seedNotifications: Notification[] = [
  { id:'n1', jobId:'j1', channel:'WHATSAPP', message:'Approval requested for ₹980', status:'FAILED', attempts:3, createdAt:iso(-24) },
  { id:'n2', jobId:'j2', channel:'SMS', message:'Work has started on your Jupiter', status:'SUPPRESSED', attempts:0, createdAt:iso(-74) },
  { id:'n3', jobId:'j3', channel:'WHATSAPP', message:'Your Pulsar is ready for pickup', status:'SENT', attempts:1, createdAt:iso(-94) },
  { id:'n4', jobId:'j4', channel:'SMS', message:'Service paused — part ordered', status:'SENT', attempts:1, createdAt:iso(-599) },
]

interface Store {
  jobs: Job[]; notifications: Notification[]; staff: Staff[]; role: Role; currentStaff: Staff
  signIn(role: Role): void; reset(): void; createJob(input: NewJob): Job; transition(id: string, to: JobStatus, note?: string): void
  assign(id: string, staffId: string): void; addMedia(id: string, media: Omit<Media,'id'|'createdAt'>): void
  toggleInspection(id: string, key: string): void
  addApproval(id: string, items: Omit<LineItem,'id'|'approved'>[], note: string): void; resolveApproval(id: string, decision: 'APPROVED'|'DECLINED'|'APPROVED_BY_ADVISOR', note?: string): void
  addNote(id: string, message: string, visible: boolean): void; retryNotification(notificationId: string): void
  hold(id: string, reason: string, expectedResumeAt: string): void; cancel(id: string, reason: string): void
  close(id: string, finalAmount: number, paymentMode: 'CASH'|'UPI', mismatchReason?: string, oldPartsReturned?: boolean): void
}
const StoreContext = createContext<Store | null>(null)
const KEY = 'autoflex-sc-mock-v2'

export function StoreProvider({ children }: { children: ReactNode }) {
  const persisted = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } })()
  const [jobs,setJobs] = useState<Job[]>(persisted?.jobs ?? seedJobs)
  const [notifications,setNotifications] = useState<Notification[]>(persisted?.notifications ?? seedNotifications)
  const [role,setRole] = useState<Role>(persisted?.role ?? 'advisor')
  const save = (nextJobs=jobs,nextNotifications=notifications,nextRole=role) => localStorage.setItem(KEY,JSON.stringify({jobs:nextJobs,notifications:nextNotifications,role:nextRole}))
  useEffect(()=>save(jobs,notifications,role),[jobs,notifications,role])
  const updateJobs = (fn:(jobs:Job[])=>Job[]) => setJobs(prev => { const next=fn(prev); save(next,notifications,role); return next })
  const actor = staff.find(s=>s.role===role) ?? staff[0]
  const pushEvent = (job:Job,type:string,message:string,visible=true): Job => ({...job,updatedAt:new Date().toISOString(),events:[...job.events,{id:crypto.randomUUID(),type,message,actor:actor.name,visibleToCustomer:visible,createdAt:new Date().toISOString()}]})
  const notify = (jobId:string,message:string,status:NotificationStatus='SENT') => setNotifications(prev=>{const next=[{id:crypto.randomUUID(),jobId,channel:'WHATSAPP' as const,message,status,attempts:status==='FAILED'?3:1,createdAt:new Date().toISOString()},...prev]; save(jobs,next,role); return next})
  const value = useMemo<Store>(() => ({
    jobs,notifications,staff,role,currentStaff:actor,
    signIn:(r)=>{setRole(r);save(jobs,notifications,r)},
    reset:()=>{localStorage.removeItem(KEY);setJobs(seedJobs);setNotifications(seedNotifications);setRole('advisor')},
    createJob:(input)=>{
      const id=crypto.randomUUID(); const createdAt=new Date().toISOString()
      const job:Job={id,number:`AF-${1043+jobs.length}`,customerName:input.customerName,phone:input.phone,secondaryPhone:input.secondaryPhone,whoApproves:input.whoApproves,
        vehicle:{registration:input.registration||'NO PLATE',make:input.make,model:input.model},request:input.request,serviceType:input.serviceType,odometerKm:input.odometerKm,
        fuelLevel:input.fuelLevel,accessories:input.accessories,status:'CHECKED_IN',priority:input.urgent?'URGENT':'NORMAL',waitingOnSite:input.waitingOnSite,
        estimatedReadyAt:input.estimatedReadyAt,softEstimate:input.softEstimate,budgetCeiling:input.budgetCeiling,locale:input.locale,consent:input.consent,
        createdAt,updatedAt:createdAt,events:[{id:crypto.randomUUID(),type:'STATUS_CHANGE',message:input.urgent?'Urgent vehicle received':'Vehicle checked in',actor:actor.name,visibleToCustomer:true,createdAt}],
        media:[],approvals:[],lineItems:input.softEstimate?[{id:crypto.randomUUID(),description:'Initial service estimate',category:'LABOUR',amount:input.softEstimate,approved:true}]:[],
        inspection:{brakes:false,tyres:false,lights:false,fluids:false,battery:false},comebackOfJobId:input.comebackOfJobId,warrantyIntent:input.warrantyIntent}
      const next=[job,...jobs];setJobs(next);notify(id,input.consent?'Tracking link queued (simulation)':'Notification suppressed — consent refused',input.consent?'SENT':'SUPPRESSED');save(next,notifications,role);return job
    },
    transition:(id,to,note)=>{updateJobs(all=>all.map(j=>j.id===id?{...pushEvent(j,'STATUS_CHANGE',note||`Status changed to ${to.replaceAll('_',' ')}`),status:to,previousStatus:to==='ON_HOLD'?j.status:j.previousStatus}:j));notify(id,`Status update: ${to.replaceAll('_',' ')}`)},
    assign:(id,staffId)=>updateJobs(all=>all.map(j=>j.id===id?{...pushEvent(j,'ASSIGNED',`Assigned to ${staff.find(s=>s.id===staffId)?.name}`,false),assignedTechnicianId:staffId}:j)),
    toggleInspection:(id,key)=>updateJobs(all=>all.map(j=>j.id===id?{...j,inspection:{...j.inspection,[key]:!j.inspection[key]},updatedAt:new Date().toISOString()}:j)),
    addMedia:(id,media)=>updateJobs(all=>all.map(j=>j.id===id?{...pushEvent(j,'MEDIA_ADDED',media.uploadStatus==='FAILED'?`Upload failed: ${media.caption}`:`Evidence added: ${media.caption}`,media.visibleToCustomer),media:[...j.media,{...media,id:crypto.randomUUID(),createdAt:new Date().toISOString()}]}:j)),
    addApproval:(id,items,note)=>{updateJobs(all=>all.map(j=>{if(j.id!==id)return j;const lines=items.map(i=>({...i,id:crypto.randomUUID(),approved:false}));const total=lines.reduce((s,i)=>s+i.amount,0);return {...pushEvent(j,'APPROVAL_REQUESTED',`Approval requested for ₹${total.toLocaleString('en-IN')}`),status:'AWAITING_APPROVAL',approvals:[...j.approvals,{id:crypto.randomUUID(),status:'PENDING',lineItems:lines,total,note,createdAt:new Date().toISOString()}]}}));notify(id,'Additional work approval requested')},
    resolveApproval:(id,decision,note)=>{updateJobs(all=>all.map(j=>{if(j.id!==id)return j;const approvals=j.approvals.map(a=>a.status==='PENDING'?{...a,status:decision,resolvedAt:new Date().toISOString(),note:note||a.note,lineItems:a.lineItems.map(l=>({...l,approved:decision!=='DECLINED'}))}:a);const added=approvals.flatMap(a=>a.lineItems).filter(l=>l.approved);return {...pushEvent(j,'APPROVAL_RESOLVED',decision==='DECLINED'?'Additional work declined':decision==='APPROVED_BY_ADVISOR'?'Verbal approval recorded':'Customer approved additional work'),status:'IN_PROGRESS',approvals,lineItems:[...j.lineItems,...added]}}));notify(id,decision==='DECLINED'?'Approval declined — original scope continues':'Approval confirmed — work continues')},
    addNote:(id,message,visible)=>{updateJobs(all=>all.map(j=>j.id===id?pushEvent(j,'NOTE',message,visible):j));if(visible)notify(id,`New update: ${message}`)},
    retryNotification:(nid)=>setNotifications(prev=>{const next=prev.map(n=>n.id===nid?{...n,status:'SENT' as const,attempts:n.attempts+1}:n);save(jobs,next,role);return next}),
    hold:(id,reason,expectedResumeAt)=>{updateJobs(all=>all.map(j=>j.id===id?{...pushEvent(j,'STATUS_CHANGE',`On hold — ${reason}`),previousStatus:j.status,status:'ON_HOLD',holdReason:reason,expectedResumeAt}:j));notify(id,'Service paused — we will update you when work resumes')},
    cancel:(id,reason)=>{updateJobs(all=>all.map(j=>j.id===id?{...pushEvent(j,'STATUS_CHANGE',`Job cancelled — ${reason}`),status:'CANCELLED'}:j));notify(id,'Job cancelled')},
    close:(id,finalAmount,paymentMode,mismatchReason,oldPartsReturned)=>{updateJobs(all=>all.map(j=>j.id===id?{...pushEvent(j,'JOB_CLOSED',`Completed · ₹${finalAmount.toLocaleString('en-IN')} via ${paymentMode}`),status:'COMPLETED',closedAt:new Date().toISOString(),finalAmount,paymentMode,mismatchReason,oldPartsReturned}:j));notify(id,'Service completed — permanent record available')},
  }),[jobs,notifications,role])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
export function useStore(){const value=useContext(StoreContext);if(!value)throw new Error('StoreProvider missing');return value}
export const statusLabel=(s:JobStatus)=>s.replaceAll('_',' ')
export const money=(n:number)=>`₹${n.toLocaleString('en-IN')}`
