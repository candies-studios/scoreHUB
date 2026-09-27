// src/components/BoutList.tsx
import { useEffect, useState } from "react";
import { getBouts, deleteBout, subscribeToBoutState } from "@/lib/supabase";

interface Bout {
  id: string;
  bout_number: number;
  status: string;
  fighter_a: { id: string; name: string };
  fighter_b: { id: string; name: string };
  referee?: { id: string; name: string };
  bout_judges?: Array<{
    judge_position: number;
    officials: { id: string; name: string };
  }>;
}

export function BoutList({ leagueId }: { leagueId: string }) {
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boutStates, setBoutStates] = useState<Record<string, any>>({});

  useEffect(() => {
    async function loadBouts() {
      setLoading(true);
      const { data, error } = await getBouts(leagueId);
      if (error) {
        setError(error.message);
      } else {
        setBouts(data || []);
        // Subscribe to real-time updates for each bout
        data?.forEach((bout) => {
          const unsubscribe = subscribeToBoutState(bout.id, (state) => {
            setBoutStates((prev) => ({ ...prev, [bout.id]: state }));
          });
          return unsubscribe;
        });
      }
      setLoading(false);
    }
    loadBouts();
  }, [leagueId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bout?")) return;
    const { error } = await deleteBout(id);
    if (error) {
      setError(error.message);
    } else {
      setBouts((prev) => prev.filter((b) => b.id !== id));
    }
  };

  if (loading) return <div>Loading bouts...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="bout-list">
      <h2>Bouts</h2>
      {bouts.length === 0 ? (
        <p>No bouts yet.</p>
      ) : (
        <div className="bouts-grid">
          {bouts.map((bout) => {
            const state = boutStates[bout.id];
            return (
              <div key={bout.id} className="bout-card">
                <div className="bout-header">
                  <h3>Bout #{bout.bout_number}</h3>
                  <span className={`status ${bout.status}`}>{bout.status}</span>
                </div>
                <div className="fighters">
                  <div className="fighter red">
                    <strong>{bout.fighter_a.name}</strong>
                  </div>
                  <div className="vs">VS</div>
                  <div className="fighter blue">
                    <strong>{bout.fighter_b.name}</strong>
                  </div>
                </div>
                <div className="officials">
                  {bout.referee && <p>Ref: {bout.referee.name}</p>}
                  <p>
                    Judges:{" "}
                    {bout.bout_judges
                      ?.map((j) => j.officials.name)
                      .join(", ")}
                  </p>
                </div>
                {state && (
                  <div className="bout-state">
                    <p>Phase: {state.phase}</p>
                    <p>Round: {state.current_round}</p>
                  </div>
                )}
                <button className="delete-btn" onClick={() => handleDelete(bout.id)}>
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
