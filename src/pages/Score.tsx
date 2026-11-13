import { Link, useParams } from 'react-router-dom';
import { ErrorNote, Loading } from '@/components/DataTable';
import { ScoreSheet } from '@/components/ScoreSheet';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSession } from '@/lib/session';

export default function Score() {
  const { boutId = '' } = useParams<{ boutId: string }>();
  const { user } = useSession();
  const { data, error, loading, reload } = useApi(() => api.bouts.get(boutId), [boutId]);

  if (loading) return <Loading label="Opening the sheet…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data || !user) return <ErrorNote message="Bout not found." />;

  const seat = data.judges?.find((j) => j.judgeId === user.id)?.seat ?? null;
  const isOfficial =
    seat !== null ||
    data.refereeId === user.id ||
    user.role === 'ADMIN' ||
    user.role === 'PROMOTER';

  if (!isOfficial) {
    return (
      <div className="ss-card mx-auto my-16 max-w-lg text-center">
        <h1 className="text-lg font-bold text-white">You are not an official on this bout</h1>
        <p className="mt-3 text-sm text-slate-400">
          Only seated judges, the referee and organisers can open a scoring sheet.
        </p>
        <Link to={`/bouts/${boutId}/scoreboard`} className="ss-btn-primary mt-6 inline-flex">
          View the scoreboard instead
        </Link>
      </div>
    );
  }

  const mine = (data.roundScores ?? []).filter((r) => r.judgeId === user.id && r.submitted);

  return (
    <ScoreSheet
      onChanged={reload}
      submittedRounds={mine.map((r) => r.roundNumber)}
      viewer={{
        id: user.id,
        name: user.name,
        role: user.role,
        seat,
      }}
      bout={{
        id: data.id,
        boutNumber: data.boutNumber,
        boutName: data.boutName,
        boutType: data.boutType,
        discipline: data.discipline,
        ringNo: data.ringNo,
        totalRounds: data.totalRounds,
        roundDuration: data.roundDuration,
        currentRound: data.currentRound,
        status: data.status,
        refereeName: data.referee?.name ?? null,
        blueFighterName: data.blueFighter?.name ?? 'Blue corner',
        redFighterName: data.redFighter?.name ?? 'Red corner',
        judgeCount: data.judges?.length ?? 3,
      }}
    />
  );
}
