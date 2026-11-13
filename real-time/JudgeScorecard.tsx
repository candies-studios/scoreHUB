// src/components/JudgeScorecard.tsx
import { useEffect, useState } from "react";
import {
  submitScorecard,
  subscribeToScorecards,
  getScorecards,
  getRounds,
} from "@/lib/supabase";

interface Scorecard {
  id: string;
  judge_id: string;
  fighter_a_score: number;
  fighter_b_score: number;
  submitted_at: string;
  judge?: { id: string; name: string };
}

export function JudgeScorecard({
  roundId,
  judgeId,
  fighterAName,
  fighterBName,
}: {
  roundId: string;
  judgeId: string;
  fighterAName: string;
  fighterBName: string;
}) {
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [scoreA, setScoreA] = useState(10);
  const [scoreB, setScoreB] = useState(9);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load existing scorecards for this round
    async function loadScorecards() {
      const { data, error } = await getScorecards(roundId);
      if (error) {
        setError(error.message);
      } else {
        setScorecards(data || []);
        // Check if this judge already submitted
        const myCard = data?.find((c) => c.judge_id === judgeId);
        if (myCard) {
          setSubmitted(true);
          setScoreA(myCard.fighter_a_score);
          setScoreB(myCard.fighter_b_score);
        }
      }
    }
    loadScorecards();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToScorecards(roundId, (newCard) => {
      setScorecards((prev) => {
        const existing = prev.find((c) => c.id === newCard.id);
        if (existing) {
          return prev.map((c) => (c.id === newCard.id ? newCard : c));
        }
        return [...prev, newCard];
      });
    });

    return unsubscribe;
  }, [roundId, judgeId]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const { error } = await submitScorecard({
      round_id: roundId,
      judge_id: judgeId,
      fighter_a_score: scoreA,
      fighter_b_score: scoreB,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSubmitted(true);
    }
  };

  return (
    <div className="scorecard">
      <h2>Score This Round</h2>

      {error && <div className="error">{error}</div>}

      <div className="score-inputs">
        <div className="score-group">
          <label>{fighterAName}</label>
          <input
            type="number"
            min="0"
            max="10"
            value={scoreA}
            onChange={(e) => setScoreA(parseInt(e.target.value))}
            disabled={submitted}
          />
        </div>
        <div className="score-group">
          <label>{fighterBName}</label>
          <input
            type="number"
            min="0"
            max="10"
            value={scoreB}
            onChange={(e) => setScoreB(parseInt(e.target.value))}
            disabled={submitted}
          />
        </div>
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="submit-btn"
        >
          {loading ? "Submitting..." : "Submit Score"}
        </button>
      ) : (
        <div className="submitted-notice">
          ✓ Your score submitted: {scoreA} - {scoreB}
        </div>
      )}

      <div className="all-scorecards">
        <h3>All Judges' Scores</h3>
        {scorecards.length === 0 ? (
          <p>Waiting for judge submissions...</p>
        ) : (
          <ul>
            {scorecards.map((card) => (
              <li key={card.id}>
                <strong>{card.judge?.name || "Judge"}</strong>: {card.fighter_a_score}
                -{card.fighter_b_score}
                {card.submitted_at && (
                  <span className="time">
                    ({new Date(card.submitted_at).toLocaleTimeString()})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
