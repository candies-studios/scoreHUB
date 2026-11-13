import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/useApi';
import type { FighterInput } from '@/lib/types';

const FIELDS: { key: keyof FighterInput; label: string; placeholder?: string }[] = [
  { key: 'name', label: 'Fighter Name', placeholder: 'Full name' },
  { key: 'team', label: 'Team / Gym' },
  { key: 'coachName', label: 'Coach Name' },
  { key: 'weightClass', label: 'Weight Class', placeholder: 'Flyweight' },
  { key: 'record', label: 'Record', placeholder: '8-2-0' },
  { key: 'contactNo', label: 'Contact No.' },
  { key: 'photoUrl', label: 'Photo URL', placeholder: 'https://…' },
];

const BLANK: FighterInput = {
  name: '',
  team: '',
  coachName: '',
  weightClass: '',
  record: '',
  contactNo: '',
  photoUrl: '',
};

export default function FighterEditor() {
  const { id = '', fighterId } = useParams<{ id: string; fighterId: string }>();
  const navigate = useNavigate();
  const editing = Boolean(fighterId);

  const { data, error, loading, reload } = useApi(
    () => (fighterId ? api.fighters.get(fighterId) : Promise.resolve(null)),
    [fighterId],
  );
  const { run, pending, error: saveError } = useAction();
  const [form, setForm] = useState<FighterInput>(BLANK);

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name,
      team: data.team ?? '',
      coachName: data.coachName ?? '',
      weightClass: data.weightClass ?? '',
      record: data.record ?? '',
      contactNo: data.contactNo ?? '',
      photoUrl: data.photoUrl ?? '',
    });
  }, [data]);

  if (editing && loading) return <Loading label="Loading fighter…" />;
  if (editing && error) return <ErrorNote message={error} onRetry={reload} />;

  async function save() {
    // Empty strings become null so optional columns stay clean.
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]),
    ) as unknown as FighterInput;
    payload.name = form.name.trim();

    const saved = fighterId
      ? await run(() => api.fighters.update(fighterId, payload))
      : await run(() => api.fighters.create(id, payload));
    if (saved) navigate(`/leagues/${id}/fighters`);
  }

  return (
    <section className="py-6">
      <h1 className="mb-8 rounded-xl border border-ink-500 bg-ink-700 py-3 text-center text-base font-semibold text-white">
        {editing ? 'Edit Fighter' : 'Add Fighter'}
      </h1>

      <div className="grid gap-x-16 gap-y-5 md:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="ss-label" htmlFor={`f-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`f-${field.key}`}
              className="ss-input"
              placeholder={field.placeholder}
              value={(form[field.key] as string) ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
            />
          </div>
        ))}
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
        <button
          type="button"
          className="ss-btn-primary px-16"
          disabled={pending || form.name.trim().length < 2}
          onClick={save}
        >
          {pending ? 'Saving…' : editing ? 'Update' : 'Save'}
        </button>
        <span className="w-20" />
      </div>
    </section>
  );
}
