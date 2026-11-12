import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tournamentApi } from '../../api/tournamentApi.js';
import { errMsg } from '../../api/client.js';
import { EventCard, Loading, Tabs } from '../../components/events/parts.jsx';
import { SPORTS } from '../../utils/tournament.js';

export default function EventsHome() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') || 'upcoming';
  const sport = params.get('sport') || '';
  const [q, setQ] = useState(params.get('q') || '');
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setEvents(null);
    const id = setTimeout(() => {
      tournamentApi
        .list({ scope, sport: sport || undefined, q: q || undefined })
        .then(setEvents)
        .catch((e) => {
          setError(errMsg(e));
          setEvents([]);
        });
    }, 200);
    return () => clearTimeout(id);
  }, [scope, sport, q]);

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <section className="ev-hero">
        <div>
          <h1>Events</h1>
          <p>Find a tournament, register, and follow brackets and mats live.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/events/new')}>
          + Create event
        </button>
      </section>

      <div className="ev-toolbar">
        <Tabs
          value={scope}
          onChange={(v) => set('scope', v)}
          tabs={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="ev-filters">
          <input
            className="ev-input"
            placeholder="Search events, cities, organisers"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              set('q', e.target.value);
            }}
          />
          <select className="ev-input" value={sport} onChange={(e) => set('sport', e.target.value)}>
            <option value="">All sports</option>
            {SPORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!events ? (
        <Loading what="Loading events" />
      ) : events.length === 0 ? (
        <div className="empty">No {scope === 'all' ? '' : scope} events found.</div>
      ) : (
        <div className="event-grid">
          {events.map((ev) => <EventCard key={ev._id} event={ev} />)}
        </div>
      )}
    </>
  );
}
