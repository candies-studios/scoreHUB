import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { ROUND_DURATIONS, durationLabel, toDateInput } from '@/lib/format';
import { useAction, useApi } from '@/lib/useApi';
import type { BoutInput, Discipline, Fighter, User } from '@/lib/types';

const BLANK: BoutInput = {
  boutNumber: 1,
  boutName: '',
  discipline: 'MMA',
  boutType: 'PROFESSIONAL',
  boutDate: '',
  ringNo: '',
  totalRounds: 3,
  roundDuration: 300,
  blueFighterId: null,
  redFighterId: null,
  refereeId: null,
  judgeIds: [],
};

export default function BoutEditor() {
  const { id = '', boutId } = useParams<{ id: string; boutId: string }>();
  const navigate = useNavigate();
  const editing = Boolean(boutId);

  const refs = useApi(
    () =>
      Promise.all([
        api.fighters.listByLeague(id),
        api.users.list('JUDGE'),
        api.users.list('REFEREE'),
        boutId ? api.bouts.get(boutId) : Promise.resolve(null),
      ]),
    [id, boutId],
  );
  const { run, pending, error: saveError } = useAction();
  const [form, setForm] = useState<BoutInput>(BLANK);

  const bout = refs.data?.[3] ?? null;

  useEffect(() => {
    if (!bout) return;
    setForm({
      boutNumber: bout.boutNumber,
      boutName: bout.boutName ?? '',
      discipline: bout.discipline,
      boutType: bout.boutType,
      boutDate: toDateInput(bout.boutDate),
      ringNo: bout.ringNo ?? '',
      totalRounds: bout.totalRounds,
      roundDuration: bout.roundDuration,
      blueFighterId: bout.blueFighterId,
      redFighterId: bout.redFighterId,
      refereeId: bout.refereeId,
      judgeIds: (bout.judges ?? []).sort((a, b) => a.seat - b.seat).map((j) => j.judgeId),
    });
  }, [bout]);

  if (refs.loading) return <Loading label="Loading bout…" />;
  if (refs.error) return <ErrorNote message={refs.error} onRetry={refs.reload} />;

  const fighters: Fighter[] = refs.data?.[0] ?? [];
  const judges: User[] = refs.data?.[1] ?? [];
  const referees: User[] = refs.data?.[2] ?? [];

  function set<K extends keyof BoutInput>(key: K, value: BoutInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setJudge(index: number, judgeId: string) {
    setForm((f) => {
      const next = [...f.judgeIds];
      next[index] = judgeId;
      return { ...f, judgeIds: next.filter(Boolean) };
    });
  }

  async function save() {
    const payload: BoutInput = {
      ...form,
      boutName: form.boutName || null,
      ringNo: form.ringNo || null,
      boutDate: new Date(form.boutDate || Date.now()).toISOString(),
      judgeIds: form.judgeIds.filter(Boolean),
    };
    const saved = boutId
      ? await run(() => api.bouts.update(boutId, payload))
      : await run(() => api.bouts.create(id, payload));
    if (saved) navigate(`/leagues/${id}/bouts`);
  }

  const blue = fighters.find((f) => f.id === form.blueFighterId);
  const red = fighters.find((f) => f.id === form.redFighterId);

  return (
    <section className="py-6">
      <h1 className="mb-8 rounded-xl border border-ink-500 bg-ink-700 py-3 text-center text-base font-semibold text-white">
        {editing ? 'Edit Bout' : 'Add Bout'}
      </h1>

      <div className="grid gap-x-16 gap-y-5 md:grid-cols-2">
        <div>
          <label className="ss-label" htmlFor="btype">
            Bout Type
          </label>
          <select
            id="btype"
            className="ss-input"
            value={form.boutType}
            onChange={(e) => set('boutType', e.target.value as BoutInput['boutType'])}
          >
            <option value="PROFESSIONAL">Professional</option>
            <option value="AMATEUR">Amateur</option>
          </select>
        </div>

        <div>
          <label className="ss-label" htmlFor="bdate">
            Bout Date
          </label>
          <input
            id="bdate"
            type="date"
            className="ss-input"
            value={form.boutDate}
            onChange={(e) => set('boutDate', e.target.value)}
          />
        </div>

        <div>
          <label className="ss-label" htmlFor="bnum">
            Bout Number
          </label>
          <input
            id="bnum"
            className="ss-input"
            inputMode="numeric"
            value={form.boutNumber}
            onChange={(e) => set('boutNumber', Number(e.target.value.replace(/\D/g, '')) || 1)}
          />
        </div>

        <div>
          <label className="ss-label" htmlFor="bname">
            Bout Name
          </label>
          <input
            id="bname"
            className="ss-input"
            placeholder="Flyweight"
            value={form.boutName ?? ''}
            onChange={(e) => set('boutName', e.target.value)}
          />
        </div>

        <div>
          <label className="ss-label" htmlFor="brounds">
            Total Rounds
          </label>
          <select
            id="brounds"
            className="ss-input"
            value={form.totalRounds}
            onChange={(e) => set('totalRounds', Number(e.target.value))}
          >
            {[1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ss-label" htmlFor="bdur">
            Round Duration
          </label>
          <select
            id="bdur"
            className="ss-input"
            value={form.roundDuration}
            onChange={(e) => set('roundDuration', Number(e.target.value))}
          >
            {ROUND_DURATIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {durationLabel(seconds)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ss-label" htmlFor="bdisc">
            Discipline
          </label>
          <select
            id="bdisc"
            className="ss-input"
            value={form.discipline}
            onChange={(e) => set('discipline', e.target.value as Discipline)}
          >
            <option value="MMA">MMA</option>
            <option value="BJJ">BJJ</option>
            <option value="K1">K1</option>
          </select>
        </div>

        <div>
          <label className="ss-label" htmlFor="bring">
            Ring No
          </label>
          <input
            id="bring"
            className="ss-input"
            value={form.ringNo ?? ''}
            onChange={(e) => set('ringNo', e.target.value)}
          />
        </div>
      </div>

      {/* --- corners ------------------------------------------------------- */}
      <div className="mt-10 grid items-start gap-6 md:grid-cols-[1fr_auto_1fr]">
        <div>
          <label className="ss-label" htmlFor="blue">
            Blue Corner
          </label>
          <select
            id="blue"
            className="ss-input border-blueCorner-border bg-blueCorner-bg text-center font-semibold text-blueCorner-text"
            value={form.blueFighterId ?? ''}
            onChange={(e) => set('blueFighterId', e.target.value || null)}
          >
            <option value="">Select fighter</option>
            {fighters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {blue && (
            <p className="mt-3 text-center text-xs text-slate-400">
              {blue.record ?? '—'} · {blue.team ?? 'Unattached'}
            </p>
          )}
        </div>

        <p className="self-center text-center text-4xl font-black italic text-white">VS</p>

        <div>
          <label className="ss-label" htmlFor="red">
            Red Corner
          </label>
          <select
            id="red"
            className="ss-input border-redCorner-border bg-redCorner-bg text-center font-semibold text-redCorner-text"
            value={form.redFighterId ?? ''}
            onChange={(e) => set('redFighterId', e.target.value || null)}
          >
            <option value="">Select fighter</option>
            {fighters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {red && (
            <p className="mt-3 text-center text-xs text-slate-400">
              {red.record ?? '—'} · {red.team ?? 'Unattached'}
            </p>
          )}
        </div>
      </div>

      {/* --- officials ----------------------------------------------------- */}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((seat) => (
          <div key={seat}>
            <label className="ss-label" htmlFor={`judge-${seat}`}>
              Add Judge {seat + 1}
            </label>
            <select
              id={`judge-${seat}`}
              className="ss-input"
              value={form.judgeIds[seat] ?? ''}
              onChange={(e) => setJudge(seat, e.target.value)}
            >
              <option value="">Select judge</option>
              {judges.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-6 max-w-md">
        <label className="ss-label" htmlFor="ref">
          Add Referee
        </label>
        <select
          id="ref"
          className="ss-input"
          value={form.refereeId ?? ''}
          onChange={(e) => set('refereeId', e.target.value || null)}
        >
          <option value="">Select referee</option>
          {referees.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {saveError && (
        <p role="alert" className="mt-6 text-center text-sm font-medium text-redCorner-text">
          {saveError}
        </p>
      )}

      <div className="mt-10 flex items-center justify-between gap-4">
        <button type="button" className="ss-btn-ghost" onClick={() => navigate(-1)}>
          Back
        </button>
        <button type="button" className="ss-btn-primary px-16" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : editing ? 'Update' : 'Create bout'}
        </button>
        <span className="w-20" />
      </div>
    </section>
  );
}
