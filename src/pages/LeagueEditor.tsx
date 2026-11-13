import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { toDateTimeLocal } from '@/lib/format';
import { useAction, useApi } from '@/lib/useApi';
import type { LeagueInput } from '@/lib/types';

const COUNTS: { key: keyof LeagueInput; label: string }[] = [
  { key: 'amateurMmaBouts', label: 'No. of Amateur MMA Bouts' },
  { key: 'proMmaBouts', label: 'No. of Pro MMA Bouts' },
  { key: 'amateurBjjBouts', label: 'No. of Amateur BJJ Bouts' },
  { key: 'proBjjBouts', label: 'No. of Pro BJJ Bouts' },
  { key: 'amateurK1Bouts', label: 'No. of Amateur K1 Bouts' },
  { key: 'proK1Bouts', label: 'No. of Pro K1 Bouts' },
];

const BLANK: LeagueInput = {
  name: '',
  startsAt: '',
  location: '',
  promoterName: '',
  logoUrl: null,
  amateurMmaBouts: 0,
  proMmaBouts: 0,
  amateurBjjBouts: 0,
  proBjjBouts: 0,
  amateurK1Bouts: 0,
  proK1Bouts: 0,
};

export default function LeagueEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const { data, error, loading, reload } = useApi(
    () => (id ? api.leagues.get(id) : Promise.resolve(null)),
    [id],
  );
  const { run, pending, error: saveError } = useAction();
  const [form, setForm] = useState<LeagueInput>(BLANK);

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name,
      startsAt: toDateTimeLocal(data.startsAt),
      location: data.location,
      promoterName: data.promoterName,
      logoUrl: data.logoUrl,
      amateurMmaBouts: data.amateurMmaBouts,
      proMmaBouts: data.proMmaBouts,
      amateurBjjBouts: data.amateurBjjBouts,
      proBjjBouts: data.proBjjBouts,
      amateurK1Bouts: data.amateurK1Bouts,
      proK1Bouts: data.proK1Bouts,
    });
  }, [data]);

  if (editing && loading) return <Loading label="Loading league…" />;
  if (editing && error) return <ErrorNote message={error} onRetry={reload} />;

  function set<K extends keyof LeagueInput>(key: K, value: LeagueInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const valid = form.name.trim().length > 1 && form.location.trim().length > 1 && form.startsAt;

  async function save() {
    const payload: LeagueInput = {
      ...form,
      startsAt: new Date(form.startsAt).toISOString(),
    };
    const result = id
      ? await run(() => api.leagues.update(id, payload))
      : await run(() => api.leagues.create(payload));
    if (result) navigate(`/leagues/${result.id}`);
  }

  return (
    <section className="py-6">
      <h1 className="mb-8 rounded-xl border border-ink-500 bg-ink-700 py-3 text-center text-base font-semibold text-white">
        {editing ? 'Edit League' : 'Create League'}
      </h1>

      <div className="grid gap-x-16 gap-y-5 md:grid-cols-2">
        <div>
          <label className="ss-label" htmlFor="lname">
            League Name
          </label>
          <input
            id="lname"
            className="ss-input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="WDS 9"
          />
        </div>

        <div>
          <label className="ss-label" htmlFor="lstarts">
            League Date &amp; Time
          </label>
          <input
            id="lstarts"
            type="datetime-local"
            className="ss-input"
            value={form.startsAt}
            onChange={(e) => set('startsAt', e.target.value)}
          />
        </div>

        <div>
          <label className="ss-label" htmlFor="lloc">
            League Location
          </label>
          <input
            id="lloc"
            className="ss-input"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Nerul, Navi Mumbai"
          />
        </div>

        <div>
          <label className="ss-label" htmlFor="lprom">
            Promoter Name
          </label>
          <input
            id="lprom"
            className="ss-input"
            value={form.promoterName}
            onChange={(e) => set('promoterName', e.target.value)}
          />
        </div>

        {COUNTS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4 rounded-full border border-ink-500 bg-ink-700 px-5 py-2">
            <span className="text-sm text-slate-300">{label}</span>
            <span className="flex items-center gap-4">
              <button
                type="button"
                aria-label={`Decrease ${label}`}
                className="text-xl leading-none text-brand-300 transition hover:text-white"
                onClick={() => set(key, Math.max(0, (form[key] as number) - 1) as never)}
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums text-white">
                {form[key] as number}
              </span>
              <button
                type="button"
                aria-label={`Increase ${label}`}
                className="text-xl leading-none text-brand-300 transition hover:text-white"
                onClick={() => set(key, ((form[key] as number) + 1) as never)}
              >
                +
              </button>
            </span>
          </div>
        ))}

        <div className="md:col-span-2">
          <label className="ss-label" htmlFor="llogo">
            League Logo URL
          </label>
          <input
            id="llogo"
            className="ss-input"
            value={form.logoUrl ?? ''}
            onChange={(e) => set('logoUrl', e.target.value || null)}
            placeholder="https://…/league-logo.png"
          />
        </div>
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
        <button type="button" className="ss-btn-primary px-16" disabled={!valid || pending} onClick={save}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <span className="w-20" />
      </div>
    </section>
  );
}
