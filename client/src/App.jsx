import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';

import Dashboard from './pages/Dashboard.jsx';
import LeagueList from './pages/LeagueList.jsx';
import LeagueForm from './pages/LeagueForm.jsx';
import FighterList from './pages/FighterList.jsx';
import OfficialList from './pages/OfficialList.jsx';
import BoutList from './pages/BoutList.jsx';
import BoutForm from './pages/BoutForm.jsx';
import LiveScoring from './pages/LiveScoring.jsx';
import Scoreboard from './pages/Scoreboard.jsx';
import FightAnalytics from './pages/analytics/FightAnalytics.jsx';
import PublicFight from './pages/analytics/PublicFight.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />

        <Route path="leagues/new" element={<LeagueForm />} />
        <Route path="leagues/upcoming" element={<LeagueList scope="upcoming" />} />
        <Route path="leagues/past" element={<LeagueList scope="past" />} />

        <Route path="leagues/:id" element={<LeagueForm />} />
        <Route path="leagues/:id/fighters" element={<FighterList />} />
        <Route path="leagues/:id/judges" element={<OfficialList kind="judge" />} />
        <Route path="leagues/:id/referees" element={<OfficialList kind="referee" />} />

        <Route path="leagues/:id/bouts" element={<BoutList />} />
        <Route path="leagues/:id/bouts/new" element={<BoutForm />} />
        <Route path="leagues/:id/bouts/:boutId/edit" element={<BoutForm />} />

        <Route path="bouts/:boutId/score" element={<LiveScoring />} />
        <Route path="bouts/:boutId/summary" element={<Scoreboard />} />

        {/* Fight analytics — Engine A recording + Engine B estimates. */}
        <Route path="bouts/:boutId/analytics" element={<FightAnalytics />} />
        <Route path="bouts/:boutId/live" element={<PublicFight />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
