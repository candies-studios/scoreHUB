import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { Logo } from './Logo';
import type { Role } from '@/lib/types';

const LINKS: { to: string; label: string; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', roles: ['ADMIN', 'PROMOTER', 'JUDGE', 'REFEREE'] },
  { to: '/leagues/upcoming', label: 'Upcoming leagues', roles: ['ADMIN', 'PROMOTER', 'JUDGE', 'REFEREE'] },
  { to: '/leagues/past', label: 'Past leagues', roles: ['ADMIN', 'PROMOTER', 'JUDGE', 'REFEREE'] },
  { to: '/leagues/new', label: 'Create league', roles: ['ADMIN', 'PROMOTER'] },
  { to: '/users', label: 'Officials', roles: ['ADMIN'] },
];

export default function AppShell() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const visible = LINKS.filter((l) => l.roles.includes(user.role));

  return (
    <div className="ss-spotlight min-h-screen">
      <header className="relative flex items-center justify-between border-b border-ink-500/60 px-6 py-5 sm:px-8">
        <Link to="/" aria-label="ScoreHUB home" className="transition hover:opacity-80">
          <Logo size="md" />
        </Link>

        <div className="flex items-center gap-4">
          <span className="hidden text-sm font-semibold text-slate-300 sm:inline">
            Welcome {user.name}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="rounded p-1.5 text-slate-300 transition hover:bg-ink-600 hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {open && (
          <nav className="absolute right-6 top-full z-40 w-60 overflow-hidden rounded-xl border border-ink-500 bg-ink-800 py-2 shadow-card sm:right-8">
            {visible.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `block px-4 py-2.5 text-sm transition ${
                    isActive ? 'bg-ink-600 text-white' : 'text-slate-300 hover:bg-ink-700 hover:text-white'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className="my-2 border-t border-ink-500" />
            <p className="px-4 pb-1 text-xs text-slate-500">
              Signed in as {user.name} · {user.role.toLowerCase()}
            </p>
            <button
              type="button"
              onClick={signOut}
              className="block w-full px-4 py-2.5 text-left text-sm text-redCorner-text transition hover:bg-ink-700"
            >
              Sign out
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
