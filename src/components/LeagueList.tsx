// src/components/LeagueList.tsx
import { useEffect, useState } from "react";
import { getLeagues, deleteLeague } from "@/lib/supabase";

interface League {
  id: string;
  name: string;
  created_at: string;
}

export function LeagueList() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeagues() {
      setLoading(true);
      const { data, error } = await getLeagues();
      if (error) {
        setError(error.message);
      } else {
        setLeagues(data || []);
      }
      setLoading(false);
    }
    loadLeagues();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this league?")) return;
    const { error } = await deleteLeague(id);
    if (error) {
      setError(error.message);
    } else {
      setLeagues((prev) => prev.filter((l) => l.id !== id));
    }
  };

  if (loading) return <div>Loading leagues...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="league-list">
      <h2>Leagues</h2>
      {leagues.length === 0 ? (
        <p>No leagues yet.</p>
      ) : (
        <ul>
          {leagues.map((league) => (
            <li key={league.id}>
              <span>{league.name}</span>
              <button onClick={() => handleDelete(league.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
