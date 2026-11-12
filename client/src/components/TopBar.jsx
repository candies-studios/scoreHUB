import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Brand from './Brand.jsx';

export default function TopBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <header className="topbar">
      <Brand onClick={() => navigate('/')} />
      <nav className="topnav" aria-label="Main">
        <NavLink to="/events">Events</NavLink>
        <NavLink to="/athletes">Athletes</NavLink>
        <NavLink to="/academies">Academies</NavLink>
        <NavLink to="/rankings">Rankings</NavLink>
        <NavLink to="/leagues/upcoming">Leagues</NavLink>
      </nav>
      <div className="topbar-right" ref={ref}>
        <button
          className="menu-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label="Open menu"
          aria-expanded={open}
        >
          ☰
        </button>
        {open && (
          <div className="menu-pop">
            <button onClick={() => go('/')}>Dashboard</button>
            <button onClick={() => go('/events')}>Events</button>
            <button onClick={() => go('/events/new')}>Create Event</button>
            <button onClick={() => go('/athletes')}>Athletes</button>
            <button onClick={() => go('/academies')}>Academies</button>
            <button onClick={() => go('/rankings')}>Rankings</button>
            <hr />
            <button onClick={() => go('/leagues/new')}>Create League</button>
            <button onClick={() => go('/leagues/upcoming')}>Upcoming Leagues</button>
            <button onClick={() => go('/leagues/past')}>Past Leagues</button>
          </div>
        )}
      </div>
    </header>
  );
}
