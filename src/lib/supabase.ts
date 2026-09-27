// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase credentials not configured. Check .env.local");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ Officials ============

export async function getOfficials() {
  const { data, error } = await supabase
    .from("officials")
    .select("*")
    .order("name");
  if (error) console.error("Error fetching officials:", error);
  return { data, error };
}

export async function createOfficial(official: {
  name: string;
  role: "admin" | "referee" | "judge";
  email?: string;
}) {
  const { data, error } = await supabase
    .from("officials")
    .insert([official])
    .select();
  if (error) console.error("Error creating official:", error);
  return { data, error };
}

export async function updateOfficial(
  id: string,
  updates: { name?: string; role?: string; email?: string }
) {
  const { data, error } = await supabase
    .from("officials")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) console.error("Error updating official:", error);
  return { data, error };
}

export async function deleteOfficial(id: string) {
  const { error } = await supabase.from("officials").delete().eq("id", id);
  if (error) console.error("Error deleting official:", error);
  return { error };
}

// ============ Leagues ============

export async function getLeagues() {
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) console.error("Error fetching leagues:", error);
  return { data, error };
}

export async function getLeagueById(id: string) {
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", id)
    .single();
  if (error) console.error("Error fetching league:", error);
  return { data, error };
}

export async function createLeague(league: {
  name: string;
  created_by: string;
}) {
  const { data, error } = await supabase
    .from("leagues")
    .insert([league])
    .select();
  if (error) console.error("Error creating league:", error);
  return { data, error };
}

export async function updateLeague(
  id: string,
  updates: { name?: string }
) {
  const { data, error } = await supabase
    .from("leagues")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) console.error("Error updating league:", error);
  return { data, error };
}

export async function deleteLeague(id: string) {
  const { error } = await supabase.from("leagues").delete().eq("id", id);
  if (error) console.error("Error deleting league:", error);
  return { error };
}

// ============ Fighters ============

export async function getFighters(leagueId: string) {
  const { data, error } = await supabase
    .from("fighters")
    .select("*")
    .eq("league_id", leagueId)
    .order("name");
  if (error) console.error("Error fetching fighters:", error);
  return { data, error };
}

export async function createFighter(fighter: {
  league_id: string;
  name: string;
  weight_class?: string;
}) {
  const { data, error } = await supabase
    .from("fighters")
    .insert([fighter])
    .select();
  if (error) console.error("Error creating fighter:", error);
  return { data, error };
}

export async function updateFighter(
  id: string,
  updates: { name?: string; weight_class?: string }
) {
  const { data, error } = await supabase
    .from("fighters")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) console.error("Error updating fighter:", error);
  return { data, error };
}

export async function deleteFighter(id: string) {
  const { error } = await supabase.from("fighters").delete().eq("id", id);
  if (error) console.error("Error deleting fighter:", error);
  return { error };
}

// ============ Bouts ============

export async function getBouts(leagueId: string) {
  const { data, error } = await supabase
    .from("bouts")
    .select(
      `
      *,
      fighter_a:fighters!fighter_a_id (id, name, weight_class),
      fighter_b:fighters!fighter_b_id (id, name, weight_class),
      referee:officials (id, name),
      bout_judges (
        judge_position,
        judge_id,
        officials (id, name)
      )
    `
    )
    .eq("league_id", leagueId)
    .order("bout_number");
  if (error) console.error("Error fetching bouts:", error);
  return { data, error };
}

export async function getBoutById(id: string) {
  const { data, error } = await supabase
    .from("bouts")
    .select(
      `
      *,
      fighter_a:fighters!fighter_a_id (id, name, weight_class),
      fighter_b:fighters!fighter_b_id (id, name, weight_class),
      referee:officials (id, name),
      bout_judges (
        judge_position,
        judge_id,
        officials (id, name)
      )
    `
    )
    .eq("id", id)
    .single();
  if (error) console.error("Error fetching bout:", error);
  return { data, error };
}

export async function createBout(bout: {
  league_id: string;
  fighter_a_id: string;
  fighter_b_id: string;
  referee_id?: string;
  bout_number?: number;
  total_rounds?: number;
  round_duration?: number;
  scheduled_date?: string;
}) {
  const { data, error } = await supabase
    .from("bouts")
    .insert([bout])
    .select();
  if (error) console.error("Error creating bout:", error);
  return { data: data?.[0], error };
}

export async function updateBout(
  id: string,
  updates: {
    fighter_a_id?: string;
    fighter_b_id?: string;
    referee_id?: string;
    bout_number?: number;
    total_rounds?: number;
    round_duration?: number;
    status?: string;
  }
) {
  const { data, error } = await supabase
    .from("bouts")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) console.error("Error updating bout:", error);
  return { data, error };
}

export async function deleteBout(id: string) {
  const { error } = await supabase.from("bouts").delete().eq("id", id);
  if (error) console.error("Error deleting bout:", error);
  return { error };
}

// ============ Bout Judges ============

export async function assignJudges(
  boutId: string,
  judges: { judge_id: string; judge_position: number }[]
) {
  const { error } = await supabase
    .from("bout_judges")
    .delete()
    .eq("bout_id", boutId);

  if (error) {
    console.error("Error clearing judges:", error);
    return { error };
  }

  const { data, error: insertError } = await supabase
    .from("bout_judges")
    .insert(judges.map((j) => ({ bout_id: boutId, ...j })))
    .select();

  if (insertError) console.error("Error assigning judges:", insertError);
  return { data, error: insertError };
}

// ============ Rounds ============

export async function getRounds(boutId: string) {
  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("bout_id", boutId)
    .order("round_number");
  if (error) console.error("Error fetching rounds:", error);
  return { data, error };
}

export async function createRound(round: {
  bout_id: string;
  round_number: number;
  status?: string;
}) {
  const { data, error } = await supabase
    .from("rounds")
    .insert([round])
    .select();
  if (error) console.error("Error creating round:", error);
  return { data: data?.[0], error };
}

export async function updateRound(
  id: string,
  updates: {
    started_at?: string;
    ended_at?: string;
    status?: string;
  }
) {
  const { data, error } = await supabase
    .from("rounds")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) console.error("Error updating round:", error);
  return { data, error };
}

// ============ Judge Scorecards ============

export async function getScorecards(roundId: string) {
  const { data, error } = await supabase
    .from("judge_scorecards")
    .select(
      `
      *,
      judge:officials (id, name),
      round:rounds (bout_id, round_number)
    `
    )
    .eq("round_id", roundId);
  if (error) console.error("Error fetching scorecards:", error);
  return { data, error };
}

export async function submitScorecard(scorecard: {
  round_id: string;
  judge_id: string;
  fighter_a_score: number;
  fighter_b_score: number;
  live_tally?: Record<string, number>;
}) {
  const { data, error } = await supabase
    .from("judge_scorecards")
    .upsert([{ ...scorecard, submitted_at: new Date().toISOString() }], {
      onConflict: "round_id,judge_id",
    })
    .select();
  if (error) console.error("Error submitting scorecard:", error);
  return { data: data?.[0], error };
}

export async function updateScorecard(
  id: string,
  updates: {
    fighter_a_score?: number;
    fighter_b_score?: number;
    live_tally?: Record<string, number>;
  }
) {
  const { data, error } = await supabase
    .from("judge_scorecards")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) console.error("Error updating scorecard:", error);
  return { data, error };
}

// ============ Bout State (Real-time) ============

export async function getBoutState(boutId: string) {
  const { data, error } = await supabase
    .from("bout_states")
    .select("*")
    .eq("bout_id", boutId)
    .single();
  if (error && error.code !== "PGRST116") {
    console.error("Error fetching bout state:", error);
  }
  return { data, error };
}

export async function initializeBoutState(boutId: string) {
  const { data, error } = await supabase
    .from("bout_states")
    .insert([
      {
        bout_id: boutId,
        phase: "lobby",
        connected_officials: {},
        ready_status: { J1: false, J2: false, J3: false },
      },
    ])
    .select();
  if (error) console.error("Error initializing bout state:", error);
  return { data: data?.[0], error };
}

export async function updateBoutState(
  boutId: string,
  updates: {
    current_round?: number;
    round_start_time?: string;
    phase?: string;
    connected_officials?: Record<string, any>;
    ready_status?: Record<string, boolean>;
  }
) {
  const { data, error } = await supabase
    .from("bout_states")
    .update(updates)
    .eq("bout_id", boutId)
    .select();
  if (error) console.error("Error updating bout state:", error);
  return { data, error };
}

// ============ Real-time Subscriptions ============

export function subscribeToBoutState(
  boutId: string,
  callback: (state: any) => void
) {
  const channel = supabase
    .channel(`bout:${boutId}:state`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bout_states",
        filter: `bout_id=eq.${boutId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToScorecards(
  roundId: string,
  callback: (scorecard: any) => void
) {
  const channel = supabase
    .channel(`round:${roundId}:scorecards`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "judge_scorecards",
        filter: `round_id=eq.${roundId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToRounds(
  boutId: string,
  callback: (round: any) => void
) {
  const channel = supabase
    .channel(`bout:${boutId}:rounds`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "rounds",
        filter: `bout_id=eq.${boutId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
