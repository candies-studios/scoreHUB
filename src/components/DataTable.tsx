import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type Column = {
  key: string;
  header: string;
};

export type Row = {
  id: string;
  cells: Record<string, ReactNode>;
};

/**
 * The pill-row table used across every list screen. Each cell is its own
 * rounded chip rather than a bordered grid — it reads at a glance from a
 * cage-side laptop.
 */
export function DataTable({
  title,
  columns,
  rows,
  action,
  emptyMessage = 'Nothing here yet.',
  backHref,
}: {
  title: string;
  columns: Column[];
  rows: Row[];
  action?: { href: string; label: string };
  emptyMessage?: string;
  backHref?: string;
}) {
  return (
    <section className="py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="flex-1 text-center text-base font-semibold text-slate-200">{title}</h1>
        {action && (
          <Link to={action.href} className="ss-btn-primary shrink-0">
            {action.label}
          </Link>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px] space-y-3">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map((c) => (
              <div key={c.key} className="ss-th">
                {c.header}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">{emptyMessage}</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
              >
                {columns.map((c) => (
                  <div key={c.key} className="ss-td flex items-center justify-center">
                    {row.cells[c.key] ?? '—'}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {backHref && (
        <div className="mt-8">
          <Link to={backHref} className="ss-btn-ghost">
            Back
          </Link>
        </div>
      )}
    </section>
  );
}

/** Shared loading / error / empty furniture for data-backed screens. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="py-16 text-center text-sm text-slate-400">{label}</p>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ss-card mx-auto my-10 max-w-xl text-center">
      <p className="text-sm font-medium text-redCorner-text">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="ss-btn-ghost mt-5">
          Try again
        </button>
      )}
    </div>
  );
}
