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

// Tournament module (Smoothcomp-style events, brackets, mats, rankings)
import EventsHome from './pages/events/EventsHome.jsx';
import EventForm from './pages/events/EventForm.jsx';
import EventPage from './pages/events/EventPage.jsx';
import EventManage from './pages/events/EventManage.jsx';
import MatScreen from './pages/events/MatScreen.jsx';
import MatchScoreboard from './pages/events/MatchScoreboard.jsx';
import AthleteList from './pages/community/AthleteList.jsx';
import AthleteProfile from './pages/community/AthleteProfile.jsx';
import AcademyList from './pages/community/AcademyList.jsx';
import AcademyProfile from './pages/community/AcademyProfile.jsx';
import Rankings from './pages/community/Rankings.jsx';

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

        {/* Tournaments */}
        <Route path="events" element={<EventsHome />} />
        <Route path="events/new" element={<EventForm />} />
        <Route path="events/:id" element={<EventPage />} />
        <Route path="events/:id/edit" element={<EventForm />} />
        <Route path="events/:id/manage" element={<EventManage />} />
        <Route path="events/:id/mats/:mat" element={<MatScreen />} />
        <Route path="matches/:id/scoreboard" element={<MatchScoreboard />} />

        <Route path="athletes" element={<AthleteList />} />
        <Route path="athletes/:id" element={<AthleteProfile />} />
        <Route path="academies" element={<AcademyList />} />
        <Route path="academies/:id" element={<AcademyProfile />} />
        <Route path="rankings" element={<Rankings />} />
      </Route>

      {/* Full-screen audience display, no app chrome. */}
      <Route path="matches/:id/display" element={<MatchScoreboard display />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
