import { Outlet } from 'react-router-dom';
import TopBar from './TopBar.jsx';

export default function Layout() {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
