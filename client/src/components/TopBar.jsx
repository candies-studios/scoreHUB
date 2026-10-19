import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
            <button onClick={() => go('/leagues/new')}>Create League</button>
            <button onClick={() => go('/leagues/upcoming')}>Upcoming Leagues</button>
            <button onClick={() => go('/leagues/past')}>Past Leagues</button>
          </div>
        )}
      </div>
    </header>
  );
}
