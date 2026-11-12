import { Outlet } from 'react-router-dom';
import TopBar from './TopBar.jsx';
import { READ_ONLY } from '../api/client.js';

export default function Layout() {
  return (
    <div className="app-shell">
      <TopBar />
      {READ_ONLY && <ReadOnlyBanner />}
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Shown whenever no API is configured.
 *
 * It must be clear about one thing above all: the data on screen is the REAL
 * wdsmma.com card, not sample data. What is missing is the backend, so nothing
 * can be saved. Calling this "demo mode" made people think the fighters were
 * made up, which they are not.
 */
function ReadOnlyBanner() {
  return (
    <div
      style={{
        background: '#eff6ff',
        borderBottom: '1px solid #bfdbfe',
        color: '#1e3a5f',
        fontSize: '0.82rem',
        padding: '9px 24px',
        textAlign: 'center',
        lineHeight: 1.55,
      }}
    >
      <strong>Read-only</strong> — live event data from{' '}
      <a
        href="https://www.wdsmma.com"
        target="_blank"
        rel="noreferrer"
        style={{ color: '#1d4ed8', textDecoration: 'underline' }}
      >
        wdsmma.com
      </a>
      . Browsing works. Editing, judge scoring and live stats need the API connected.
    </div>
  );
}
