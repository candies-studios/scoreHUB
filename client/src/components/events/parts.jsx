import { Link } from 'react-router-dom';
import { BELT_COLORS, STATUS_LABEL, cap, fmtDateRange, fullName, money, sportLabel } from '../../utils/tournament.js';
import { mediaUrl } from '../../api/client.js';

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="ev-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          className={`ev-tab ${value === t.value ? 'active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count != null && <span className="ev-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function BeltChip({ belt }) {
  if (!belt) return null;
  return (
    <span className="belt-chip" title={`${cap(belt)} belt`}>
      <span className="belt-swatch" style={{ background: BELT_COLORS[belt] || '#ddd' }} />
      {belt === 'all' ? 'All belts' : cap(belt)}
    </span>
  );
}

export function Medal({ place }) {
  const cls = place === 1 ? 'gold' : place === 2 ? 'silver' : 'bronze';
  return <span className={`medal ${cls}`} aria-label={`Place ${place}`}>{place}</span>;
}

export function StatusBadge({ status }) {
  const cls = status === 'live' ? 'live' : status === 'completed' ? 'done' : status === 'registration' ? 'open' : '';
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status] || cap(status)}</span>;
}

export function AthleteLink({ athlete, showAcademy = true }) {
  if (!athlete) return <span className="muted">TBD</span>;
  return (
    <span className="athlete-link">
      <Link to={`/athletes/${athlete._id}`}>{fullName(athlete)}</Link>
      {showAcademy && athlete.academy?.name && <small>{athlete.academy.name}</small>}
    </span>
  );
}

export function EventCard({ event }) {
  const d = new Date(event.startDate);
  return (
    <Link to={`/events/${event._id}`} className="event-card">
      <div className="event-date">
        <span className="event-day">{d.getDate()}</span>
        <span className="event-month">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
      </div>
      <div className="event-body">
        {event.coverUrl && <img className="event-cover" src={mediaUrl(event.coverUrl)} alt="" />}
        <div className="event-meta">
          <StatusBadge status={event.status} />
          <span className="muted">{sportLabel(event.sport)}</span>
        </div>
        <h3>{event.name}</h3>
        <p className="muted">
          {fmtDateRange(event.startDate, event.endDate)} · {[event.city, event.country].filter(Boolean).join(', ') || 'Venue TBA'}
        </p>
        <div className="event-foot">
          <span>{event.registrationCount ?? 0} registered</span>
          <span>{money(event.fee)}</span>
        </div>
      </div>
    </Link>
  );
}

export function Loading({ what = 'Loading' }) {
  return <div className="empty">{what}…</div>;
}

export function Stat({ label, value }) {
  return (
    <div className="ev-stat">
      <span className="ev-stat-value">{value}</span>
      <span className="ev-stat-label">{label}</span>
    </div>
  );
}
