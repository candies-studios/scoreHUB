import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATEGORY_LABELS,
  FINISH_LABELS,
  SCORE_CATEGORIES,
  emptyRoundTally,
  formatMarks,
  suggestRoundScore,
  type FinishType,
  type Mark,
  type RoundTally,
  type ScoreCategory,
} from '@/lib/scoring';
import { durationLabel } from '@/lib/format';
import { ApiError, api } from '@/lib/api';
import { useBoutSocket } from '@/lib/useBoutSocket';
import { RoundTimer } from './RoundTimer';

export type ScoreSheetBout = {
  id: string;
  boutNumber: number;
  boutName: string | null;
  boutType: string;
  discipline: string;
  ringNo: string | null;
  totalRounds: number;
  roundDuration: number;
  currentRound: number;
  status: string;
  refereeName: string | null;
  blueFighterName: string;
  redFighterName: string;
  judgeCount: number;
};

export type ScoreSheetViewer = {
  id: string;
  name: string;
  role: 'JUDGE' | 'REFEREE' | 'ADMIN' | 'PROMOTER';
  seat: number | null;
};

const FINISHES: FinishType[] = [
  'KO_HEAD',
  'KO_BODY',
  'TKO',
  'NO_CONTEST',
  'RNC',
  'SUBMISSION',
  'DQ',
];

const MARKS: Mark[] = ['1', '0', '+'];

export function ScoreSheet({
  bout,
  viewer,
  submittedRounds,
  onChanged,
}: {
  bout: ScoreSheetBout;
  viewer: ScoreSheetViewer;
  submittedRounds: number[];
  /** Re-reads the bout from the API after a write, replacing router.refresh(). */
  onChanged: () => void;
}) {
  const [round, setRound] = useState(Math.max(1, bout.currentRound || 1));
  const [tally, setTally] = useState<RoundTally>(emptyRoundTally());
  const [overrideBlue, setOverrideBlue] = useState<number | ''>('');
  const [overrideRed, setOverrideRed] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number[]>(submittedRounds);
  const [confirmFinish, setConfirmFinish] = useState<FinishType | null>(null);
  const [finishCorner, setFinishCorner] = useState<'BLUE' | 'RED'>('BLUE');

  const socket = useBoutSocket({
    boutId: bout.id,
    userId: viewer.id,
    name: viewer.name,
    role: viewer.role,
    seat: viewer.seat ?? undefined,
    expectedJudges: bout.judgeCount || 3,
    roundDuration: bout.roundDuration,
    currentRound: bout.currentRound || 1,
  });

  const suggestion = useMemo(() => suggestRoundScore(tally), [tally]);
  const isJudge = viewer.role === 'JUDGE' && viewer.seat != null;
  const alreadySubmitted = done.includes(round);
  const boutOver = Boolean(socket.finished) || bout.status === 'COMPLETED';
  const clockRunning = socket.roundStartedAt != null;
  const waitingForRoom = !socket.presence?.ready && !boutOver;

  function addMark(corner: 'BLUE' | 'RED', category: ScoreCategory, mark: Mark) {
    if (alreadySubmitted || boutOver) return;
    setTally((t) => ({
      ...t,
      [corner]: { ...t[corner], [category]: [...t[corner][category], mark] },
    }));
  }

  function undoMark(corner: 'BLUE' | 'RED', category: ScoreCategory) {
    if (alreadySubmitted || boutOver) return;
    setTally((t) => ({
      ...t,
      [corner]: { ...t[corner], [category]: t[corner][category].slice(0, -1) },
    }));
  }

  async function submitRound() {
    setSaving(true);
    setError(null);

    const blueScore = overrideBlue === '' ? suggestion.blue : Number(overrideBlue);
    const redScore = overrideRed === '' ? suggestion.red : Number(overrideRed);

    try {
      const result = await api.bouts.submitRound(bout.id, {
        roundNumber: round,
        tally,
        blueScore,
        redScore,
      });
      setDone((d) => [...d, round]);
      socket.announceSubmit(round);
      setNotice(
        result.roundComplete
          ? result.outcome
            ? result.outcome.summary
            : 'All judges are in — next round is ready.'
          : 'Card submitted. Waiting for the other judges.',
      );
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit this round');
    } finally {
      setSaving(false);
    }
  }

  function goToNextRound() {
    const next = round + 1;
    if (next > bout.totalRounds) return;
    setRound(next);
    setTally(emptyRoundTally());
    setOverrideBlue('');
    setOverrideRed('');
    setNotice(null);
    socket.nextRound();
  }

  async function applyFinish(finish: FinishType) {
    setSaving(true);
    setError(null);
    const winnerCorner = finish === 'NO_CONTEST' ? null : finishCorner;

    try {
      const result = await api.bouts.finish(bout.id, {
        resultType: finish,
        winnerCorner,
        endRound: round,
      });
      socket.announceFinish(finish, winnerCorner);
      setNotice(result.summary);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record this finish');
    } finally {
      setSaving(false);
      setConfirmFinish(null);
    }
  }

  return (
    <div className="relative py-6">
      {/* --- waiting gate --------------------------------------------------- */}
      {waitingForRoom && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/80 px-6 backdrop-blur-sm">
          <div className="ss-modal max-w-md text-center">
            <h2 className="text-xl font-bold text-white">Please wait for others to join</h2>
            <div className="my-8 flex justify-center">
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden>
                <circle cx="36" cy="36" r="30" stroke="#29b6ff" strokeWidth="6" />
                <path
                  d="M36 20v17l11 7"
                  stroke="#29b6ff"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="mb-6 text-sm text-slate-300">
              {socket.presence?.joined ?? 0} / {bout.judgeCount || 3} joined
            </p>
            <button
              type="button"
              onClick={socket.start}
              disabled={!socket.presence?.ready}
              className="ss-btn-primary w-40"
            >
              Start
            </button>
            {!socket.connected && (
              <p className="mt-4 text-xs text-amber-300">
                {socket.error ?? 'Reconnecting to the scoring server…'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- header --------------------------------------------------------- */}
      <div className="mb-6 flex items-start justify-between gap-6">
        <h1 className="flex-1 text-center text-base font-semibold text-slate-200">Memory Sheet</h1>
        <RoundTimer startedAt={socket.roundStartedAt} duration={bout.roundDuration} />
      </div>

      <div className="grid gap-x-10 gap-y-4 md:grid-cols-[1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <Field label="Bout type" value={titleCase(bout.boutType)} />
          <Field label="Bouts no" value={String(bout.boutNumber)} />
          <Field label="Judge No" value={viewer.seat ? String(viewer.seat) : '—'} />
        </div>
        <div className="space-y-4">
          <Field label="Ring no" value={bout.ringNo ?? '—'} />
          <Field label="Judge Name" value={viewer.name} />
          <Field label="Referee Name" value={bout.refereeName ?? '—'} />
        </div>

        <div className="grid grid-cols-4 gap-3 self-start">
          {FINISHES.map((f) => (
            <button
              key={f}
              type="button"
              disabled={boutOver || saving}
              onClick={() => setConfirmFinish(f)}
              className="rounded-full border border-ink-500 px-2 py-2 text-xs font-medium text-slate-200 transition hover:border-redCorner-border hover:bg-redCorner-bg hover:text-redCorner-text disabled:opacity-40"
            >
              {FINISH_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* --- the sheet ------------------------------------------------------ */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(180px,220px)_1fr_1fr]">
        <div className="space-y-3">
          <div className="rounded-xl bg-brand-grad px-4 py-4 text-center text-sm font-semibold text-white">
            Round {round}
            <span className="ml-1 font-normal opacity-70">of {bout.totalRounds}</span>
          </div>
          {SCORE_CATEGORIES.map((c) => (
            <div
              key={c}
              className="flex min-h-[72px] items-center justify-center whitespace-pre-line rounded-xl bg-ink-700 px-3 py-4 text-center text-sm font-medium text-slate-200"
            >
              {CATEGORY_LABELS[c]}
            </div>
          ))}
        </div>

        <CornerColumn
          corner="BLUE"
          title="Blue Corner"
          fighterName={bout.blueFighterName}
          tally={tally}
          disabled={alreadySubmitted || boutOver || !clockRunning}
          onMark={addMark}
          onUndo={undoMark}
        />

        <CornerColumn
          corner="RED"
          title="Red Corner"
          fighterName={bout.redFighterName}
          tally={tally}
          disabled={alreadySubmitted || boutOver || !clockRunning}
          onMark={addMark}
          onUndo={undoMark}
        />
      </div>

      {/* --- final score row ------------------------------------------------ */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <span className="rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white">
          Final score
        </span>

        <ScoreSelect
          label="Blue corner round score"
          value={overrideBlue === '' ? suggestion.blue : overrideBlue}
          onChange={setOverrideBlue}
          tone="blue"
          disabled={alreadySubmitted || boutOver}
        />
        <ScoreSelect
          label="Red corner round score"
          value={overrideRed === '' ? suggestion.red : overrideRed}
          onChange={setOverrideRed}
          tone="red"
          disabled={alreadySubmitted || boutOver}
        />

        <span className="text-xs text-slate-400">{suggestion.rationale}</span>

        <span className="ml-auto text-xs text-slate-400">
          Round length {durationLabel(bout.roundDuration)} · {bout.discipline}
        </span>
      </div>

      {/* --- actions -------------------------------------------------------- */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        {!clockRunning && !boutOver && socket.presence?.ready && !alreadySubmitted && (
          <button type="button" onClick={socket.start} className="ss-btn-success px-12">
            Start round
          </button>
        )}

        {clockRunning && (
          <button type="button" onClick={socket.pause} className="ss-btn-ghost px-8">
            Stop clock
          </button>
        )}

        {isJudge && !alreadySubmitted && !boutOver && (
          <button
            type="button"
            onClick={submitRound}
            disabled={saving || !clockRunning}
            className="ss-btn-primary px-12"
          >
            {saving ? 'Submitting…' : `Submit round ${round}`}
          </button>
        )}

        {alreadySubmitted && !boutOver && round < bout.totalRounds && (
          <button
            type="button"
            onClick={goToNextRound}
            disabled={!socket.roundLocked}
            className="ss-btn-primary px-12"
          >
            {socket.roundLocked ? `Start round ${round + 1}` : 'Waiting for other judges…'}
          </button>
        )}
      </div>

      {/* --- status strip --------------------------------------------------- */}
      <div className="mt-6 space-y-2 text-center">
        {error && (
          <p role="alert" className="text-sm font-medium text-redCorner-text">
            {error}
          </p>
        )}
        {notice && <p className="text-sm font-medium text-brand-300">{notice}</p>}
        {alreadySubmitted && !socket.roundLocked && !boutOver && (
          <p className="text-sm font-medium text-redCorner-text">Please wait for other judges</p>
        )}
        {socket.presence && (
          <p className="text-xs text-slate-400">
            {socket.presence.joined} of {socket.presence.expected} judges connected ·{' '}
            {socket.presence.submitted.length} submitted this round
            {!socket.connected && ' · offline'}
          </p>
        )}
        {boutOver && (
          <Link to={`/bouts/${bout.id}/scoreboard`} className="ss-btn-primary mt-4 inline-flex">
            View combined scoreboard
          </Link>
        )}
      </div>

      {/* --- finish confirmation ------------------------------------------- */}
      {confirmFinish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/80 px-6 backdrop-blur-sm">
          <div className="ss-modal max-w-lg text-center">
            <h2 className="text-lg font-bold text-white">
              Record {FINISH_LABELS[confirmFinish]}?
            </h2>

            {confirmFinish !== 'NO_CONTEST' && (
              <div className="mt-6">
                <p className="mb-3 text-sm text-slate-400">Winner</p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFinishCorner('BLUE')}
                    className={`rounded-full px-6 py-2 text-sm font-semibold ${
                      finishCorner === 'BLUE'
                        ? 'bg-blueCorner-bg text-blueCorner-text ring-2 ring-brand-400'
                        : 'bg-ink-600 text-slate-400'
                    }`}
                  >
                    {bout.blueFighterName}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinishCorner('RED')}
                    className={`rounded-full px-6 py-2 text-sm font-semibold ${
                      finishCorner === 'RED'
                        ? 'bg-redCorner-bg text-redCorner-text ring-2 ring-red-300'
                        : 'bg-ink-600 text-slate-400'
                    }`}
                  >
                    {bout.redFighterName}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-center gap-4">
              <button
                type="button"
                onClick={() => applyFinish(confirmFinish)}
                disabled={saving}
                className="ss-btn-primary w-32"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmFinish(null)}
                className="ss-btn-ghost w-32"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CornerColumn({
  corner,
  title,
  fighterName,
  tally,
  disabled,
  onMark,
  onUndo,
}: {
  corner: 'BLUE' | 'RED';
  title: string;
  fighterName: string;
  tally: RoundTally;
  disabled: boolean;
  onMark: (corner: 'BLUE' | 'RED', category: ScoreCategory, mark: Mark) => void;
  onUndo: (corner: 'BLUE' | 'RED', category: ScoreCategory) => void;
}) {
  const isBlue = corner === 'BLUE';
  const shell = isBlue
    ? 'border-blueCorner-border bg-blueCorner-bg/40'
    : 'border-redCorner-border bg-redCorner-bg/40';
  const heading = isBlue ? 'text-blueCorner-text' : 'text-redCorner-text';
  const button = isBlue
    ? 'border-blueCorner-border bg-ink-800 text-blueCorner-text hover:bg-blueCorner-bg'
    : 'border-redCorner-border bg-ink-800 text-redCorner-text hover:bg-redCorner-bg';
  const readout = isBlue
    ? 'border-blueCorner-border bg-blueCorner-bg text-blueCorner-text'
    : 'border-redCorner-border bg-redCorner-bg text-redCorner-text';

  return (
    <div className={`rounded-xl border p-3 ${shell}`}>
      <div className="mb-3 text-center">
        <p className={`text-sm font-bold ${heading}`}>{title}</p>
        <p className="text-xs text-slate-400">{fighterName}</p>
      </div>

      <div className="space-y-3">
        {SCORE_CATEGORIES.map((category) => (
          <div key={category} className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {MARKS.map((mark) => (
                <button
                  key={mark}
                  type="button"
                  disabled={disabled}
                  onClick={() => onMark(corner, category, mark)}
                  aria-label={`${title} ${category} ${mark}`}
                  className={`tally-cell rounded-full border py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${button}`}
                >
                  {mark}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={disabled || tally[corner][category].length === 0}
              onClick={() => onUndo(corner, category)}
              title="Tap to undo the last mark"
              className={`min-h-[38px] w-full rounded-full border px-3 py-2 text-left text-xs tabular-nums transition disabled:cursor-default ${readout}`}
            >
              {formatMarks(tally[corner][category]) || ' '}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreSelect({
  label,
  value,
  onChange,
  tone,
  disabled,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  tone: 'blue' | 'red';
  disabled: boolean;
}) {
  return (
    <select
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={`w-32 rounded-full border px-4 py-2 text-sm font-semibold ${
        tone === 'blue'
          ? 'border-blueCorner-border bg-blueCorner-bg text-blueCorner-text'
          : 'border-redCorner-border bg-redCorner-bg text-redCorner-text'
      } disabled:opacity-50`}
    >
      {[10, 9, 8, 7, 6].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="ss-label">{label}</span>
      <div className="ss-input bg-ink-700 text-slate-200">{value}</div>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
