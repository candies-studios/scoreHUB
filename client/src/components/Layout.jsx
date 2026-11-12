import { Outlet } from 'react-router-dom';
import TopBar from './TopBar.jsx';
import { DEMO_MODE } from '../api/client.js';

export default function Layout() {
  return (
    <div className="app-shell">
      <TopBar />
      {DEMO_MODE && <DemoBanner />}
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Shown whenever no API is configured. Being explicit beats letting someone
 * add a fighter, see it vanish on refresh, and conclude the app is broken.
 */
function DemoBanner() {
  return (
    <div
      style={{
        background: '#fff7ed',
        borderBottom: '1px solid #fed7aa',
        color: '#7c2d12',
        fontSize: '0.82rem',
        padding: '8px 24px',
        textAlign: 'center',
        lineHeight: 1.5,
      }}
    >
      <strong>Demo mode</strong> — showing the bundled WDS event data. Browsing works;
      saving and live scoring need the API. Set the <code>API_URL</code> repository
      variable to connect a backend.
    </div>
  );
}
