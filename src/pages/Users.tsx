import { useState } from 'react';
import { DataTable, ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/useApi';
import type { Role, User, UserInput } from '@/lib/types';

const ROLES: Role[] = ['ADMIN', 'PROMOTER', 'JUDGE', 'REFEREE'];

const BLANK: UserInput & { id?: string } = {
  name: '',
  email: '',
  role: 'JUDGE',
  phone: '',
};

export default function Users() {
  const { data, error, loading, reload } = useApi(() => api.users.list(), []);
  const { run, pending, error: saveError } = useAction();
  const [editing, setEditing] = useState<(UserInput & { id?: string }) | null>(null);

  if (loading) return <Loading label="Loading officials…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  async function save() {
    if (!editing) return;
    const payload: UserInput = {
      name: editing.name.trim(),
      email: editing.email.trim(),
      role: editing.role,
      phone: editing.phone || null,
    };
    const saved = editing.id
      ? await run(() => api.users.update(editing.id as string, payload))
      : await run(() => api.users.create(payload));
    if (saved) {
      setEditing(null);
      reload();
    }
  }

  async function deactivate(user: User) {
    if (!window.confirm(`Deactivate ${user.name}? Their past scorecards stay on record.`)) return;
    await run(() => api.users.deactivate(user.id));
    reload();
  }

  return (
    <>
      <DataTable
        title="Officials"
        backHref="/"
        emptyMessage="No officials yet."
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'email', header: 'Email' },
          { key: 'role', header: 'Role' },
          { key: 'phone', header: 'Contact No.' },
          { key: 'edit', header: 'Edit' },
        ]}
        rows={(data ?? []).map((user) => ({
          id: user.id,
          cells: {
            name: user.active === false ? `${user.name} (inactive)` : user.name,
            email: user.email,
            role: user.role,
            phone: user.phone ?? '—',
            edit: (
              <button
                type="button"
                className="text-brand-300 hover:text-white"
                onClick={() =>
                  setEditing({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    phone: user.phone ?? '',
                  })
                }
              >
                Edit
              </button>
            ),
          },
        }))}
      />

      <div className="-mt-6 flex justify-end">
        <button type="button" className="ss-btn-primary" onClick={() => setEditing({ ...BLANK })}>
          Add Official
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/80 px-6 backdrop-blur-sm">
          <div className="ss-modal max-w-md">
            <h2 className="text-center text-lg font-bold text-white">
              {editing.id ? 'Edit official' : 'Add official'}
            </h2>

            <div className="mt-6 space-y-4">
              <div>
                <label className="ss-label" htmlFor="u-name">
                  Name
                </label>
                <input
                  id="u-name"
                  className="ss-input"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <label className="ss-label" htmlFor="u-email">
                  Email
                </label>
                <input
                  id="u-email"
                  type="email"
                  className="ss-input"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <div>
                <label className="ss-label" htmlFor="u-role">
                  Role
                </label>
                <select
                  id="u-role"
                  className="ss-input"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ss-label" htmlFor="u-phone">
                  Contact No.
                </label>
                <input
                  id="u-phone"
                  className="ss-input"
                  value={editing.phone ?? ''}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </div>
            </div>

            {saveError && (
              <p role="alert" className="mt-5 text-center text-sm text-redCorner-text">
                {saveError}
              </p>
            )}

            <div className="mt-8 flex justify-center gap-3">
              <button type="button" className="ss-btn-primary w-32" disabled={pending} onClick={save}>
                {pending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="ss-btn-ghost w-32" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>

            {editing.id && (
              <button
                type="button"
                className="ss-btn-danger mt-4 w-full"
                onClick={() => {
                  const target = (data ?? []).find((u) => u.id === editing.id);
                  if (target) {
                    setEditing(null);
                    deactivate(target);
                  }
                }}
              >
                Deactivate
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
