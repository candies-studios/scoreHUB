import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import { Boundary, SetupNotice } from '@/components/Boundary';
import Bouts from '@/pages/Bouts';
import BoutEditor from '@/pages/BoutEditor';
import Dashboard from '@/pages/Dashboard';
import FighterEditor from '@/pages/FighterEditor';
import Fighters from '@/pages/Fighters';
import LeagueDetail from '@/pages/LeagueDetail';
import LeagueEditor from '@/pages/LeagueEditor';
import Leagues from '@/pages/Leagues';
import Login from '@/pages/Login';
import Officials from '@/pages/Officials';
import Score from '@/pages/Score';
import Scoreboard from '@/pages/Scoreboard';
import Users from '@/pages/Users';
import { SessionProvider } from '@/lib/session';

export default function App() {
  return (
    <Boundary>
      <SetupNotice />
      <SessionProvider>
        <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leagues/upcoming" element={<Leagues filter="upcoming" />} />
            <Route path="/leagues/past" element={<Leagues filter="past" />} />
            <Route path="/leagues/new" element={<LeagueEditor />} />
            <Route path="/leagues/:id" element={<LeagueDetail />} />
            <Route path="/leagues/:id/edit" element={<LeagueEditor />} />
            <Route path="/leagues/:id/fighters" element={<Fighters />} />
            <Route path="/leagues/:id/fighters/new" element={<FighterEditor />} />
            <Route path="/leagues/:id/fighters/:fighterId" element={<FighterEditor />} />
            <Route path="/leagues/:id/bouts" element={<Bouts />} />
            <Route path="/leagues/:id/bouts/new" element={<BoutEditor />} />
            <Route path="/leagues/:id/bouts/:boutId" element={<BoutEditor />} />
            <Route path="/leagues/:id/officials" element={<Officials />} />
            <Route path="/users" element={<Users />} />
            <Route path="/bouts/:boutId/score" element={<Score />} />
            <Route path="/bouts/:boutId/scoreboard" element={<Scoreboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </SessionProvider>
    </Boundary>
  );
}
