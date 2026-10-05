import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, Bike, CalendarDays, Home, List, Menu, Plus, Wrench, type LucideIcon } from 'lucide-react';
import { useStore } from '../domain/store';
import { initials, OPEN_STATUSES, roleLabel } from '../domain/types';

function pageTitle(path: string): string {
  if (path === '/') return 'Floor board';
  if (path === '/jobs') return 'Jobs';
  if (path.startsWith('/jobs/')) return 'Job card';
  if (path === '/new') return 'Walk-in';
  if (path === '/bookings') return 'Bookings';
  if (path === '/handover') return 'Shift board';
  if (path === '/more') return 'Workspace';
  return 'Workshop';
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, role, jobs, pendingBookings, isDesk } = useStore();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const openCount = jobs.filter((job) => OPEN_STATUSES.includes(job.status)).length;
  const nav: [string, string, LucideIcon][] = [
    ['/', 'Home', Home],
    ['/jobs', 'Jobs', List],
    isDesk ? ['/new', 'New', Plus] : ['/jobs', 'Queue', List],
    isDesk ? ['/bookings', 'Bookings', CalendarDays] : ['/more', 'More', Menu],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <div className="logo-mark small">
            <Bike />
            <Wrench />
          </div>
          <span>
            AUTOFLEX
            <small>{me.center.displayName}</small>
          </span>
        </Link>
        <nav>
          {nav.map(([to, label, Icon]) => (
            <NavLink key={`${to}-${label}`} to={to} end={to === '/'}>
              <Icon />
              <span>{label}</span>
              {label === 'Jobs' ? <em>{openCount}</em> : null}
              {label === 'Bookings' && pendingBookings.length ? <em>{pendingBookings.length}</em> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sim-card">
          <Wrench />
          <div>
            <strong>{me.center.displayName}</strong>
            <span>{me.center.address.city ?? 'Workshop'} · live API</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div>
            <p className="eyebrow">{me.center.address.city?.toUpperCase() ?? 'WORKSHOP'}</p>
            <h1>{pageTitle(location.pathname)}</h1>
          </div>
          <div className="header-actions">
            {isDesk ? (
              <Link className="icon-btn" to="/bookings" aria-label="Bookings">
                <Bell />
                {pendingBookings.length ? <i>{pendingBookings.length}</i> : null}
              </Link>
            ) : null}
            <button className="profile" type="button" onClick={() => setOpen(!open)}>
              <span>{initials(me.staff.displayName)}</span>
              <div>
                <strong>{me.staff.displayName}</strong>
                <small>
                  {roleLabel(role)}
                  {me.staff.employeeCode ? ` · ${me.staff.employeeCode}` : ''}
                </small>
              </div>
            </button>
            {open ? (
              <div className="role-menu">
                <p>Signed in</p>
                <Link to="/more" onClick={() => setOpen(false)}>
                  Workspace and sign out
                </Link>
              </div>
            ) : null}
          </div>
        </header>
        <div className="page">{children}</div>
      </div>
      <nav className="bottom-nav">
        {nav.map(([to, label, Icon]) => (
          <NavLink key={`${to}-${label}-m`} to={to} end={to === '/'}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
