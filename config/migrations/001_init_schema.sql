-- ScoreHUB Initial Schema
-- Run this in Supabase SQL Editor

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Officials table (referees, judges, admins)
CREATE TABLE IF NOT EXISTS officials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'referee', 'judge')),
  email TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leagues table
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fighters table
CREATE TABLE IF NOT EXISTS fighters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight_class TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bouts (fights) table
CREATE TABLE IF NOT EXISTS bouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  fighter_a_id UUID NOT NULL REFERENCES fighters(id),
  fighter_b_id UUID NOT NULL REFERENCES fighters(id),
  referee_id UUID REFERENCES officials(id),
  bout_number INT,
  total_rounds INT DEFAULT 3,
  round_duration INT DEFAULT 180,
  scheduled_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bout judges assignment (3 judges per bout)
CREATE TABLE IF NOT EXISTS bout_judges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bout_id UUID NOT NULL REFERENCES bouts(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
  judge_position INT CHECK (judge_position IN (1, 2, 3)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(bout_id, judge_position)
);

-- Rounds table
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bout_id UUID NOT NULL REFERENCES bouts(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'submitted', 'locked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(bout_id, round_number)
);

-- Judge scorecards (one per judge per round)
CREATE TABLE IF NOT EXISTS judge_scorecards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
  fighter_a_score INT,
  fighter_b_score INT,
  live_tally JSONB DEFAULT '{"aG":0,"aVG":0,"aVVG":0,"bG":0,"bVG":0,"bVVG":0}'::jsonb,
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(round_id, judge_id)
);

-- Bout outcomes
CREATE TABLE IF NOT EXISTS bout_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bout_id UUID NOT NULL REFERENCES bouts(id) ON DELETE CASCADE UNIQUE,
  result_type TEXT NOT NULL CHECK (result_type IN ('decision', 'knockout', 'submission', 'dq')),
  decision_type TEXT CHECK (decision_type IN ('unanimous', 'split', 'majority', 'draw')),
  winner_id UUID REFERENCES fighters(id),
  referee_note TEXT,
  round_ended INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time bout state
CREATE TABLE IF NOT EXISTS bout_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bout_id UUID NOT NULL REFERENCES bouts(id) ON DELETE CASCADE UNIQUE,
  current_round INT DEFAULT 0,
  round_start_time TIMESTAMP WITH TIME ZONE,
  phase TEXT DEFAULT 'lobby' CHECK (phase IN ('lobby', 'round_live', 'round_submitted', 'round_locked', 'bout_complete')),
  connected_officials JSONB DEFAULT '{}'::jsonb,
  ready_status JSONB DEFAULT '{"J1":false,"J2":false,"J3":false}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_fighters_league ON fighters(league_id);
CREATE INDEX idx_bouts_league ON bouts(league_id);
CREATE INDEX idx_bouts_status ON bouts(status);
CREATE INDEX idx_rounds_bout ON rounds(bout_id);
CREATE INDEX idx_rounds_status ON rounds(status);
CREATE INDEX idx_scorecards_round ON judge_scorecards(round_id);
CREATE INDEX idx_scorecards_judge ON judge_scorecards(judge_id);
CREATE INDEX idx_bout_states_bout ON bout_states(bout_id);

-- Enable RLS
ALTER TABLE officials ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE fighters ENABLE ROW LEVEL SECURITY;
ALTER TABLE bouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bout_judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE bout_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bout_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow anon read/write for now (tighten with auth later)
CREATE POLICY "Allow anon read" ON officials FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON officials FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON officials FOR UPDATE USING (true);

CREATE POLICY "Allow anon read" ON leagues FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON leagues FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON leagues FOR UPDATE USING (true);

CREATE POLICY "Allow anon read" ON fighters FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON fighters FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON fighters FOR UPDATE USING (true);

CREATE POLICY "Allow anon read" ON bouts FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON bouts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON bouts FOR UPDATE USING (true);

CREATE POLICY "Allow anon read" ON bout_judges FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON bout_judges FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read" ON rounds FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON rounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON rounds FOR UPDATE USING (true);

CREATE POLICY "Allow anon read" ON judge_scorecards FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON judge_scorecards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON judge_scorecards FOR UPDATE USING (true);

CREATE POLICY "Allow anon read" ON bout_outcomes FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON bout_outcomes FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read" ON bout_states FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON bout_states FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON bout_states FOR UPDATE USING (true);
