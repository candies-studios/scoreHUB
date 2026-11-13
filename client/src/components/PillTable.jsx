/**
 * The pill-style table used across every list screen.
 *
 * columns: [{ key, label, headClass?, cellClass?, render?(row), onClick?(row) }]
 */
export default function PillTable({ columns, rows, keyField = '_id', empty = 'Nothing here yet.' }) {
  const template = columns.map((c) => c.width || '1fr').join(' ');

  return (
    <div className="pill-table">
      <div className="pill-row" style={{ gridTemplateColumns: template }}>
        {columns.map((col) => (
          <div key={col.key} className={`pill-head ${col.headClass || ''}`}>
            {col.label}
          </div>
        ))}
      </div>

      {rows.length === 0 && <div className="empty">{empty}</div>}

      {rows.map((row) => (
        <div
          className="pill-row"
          style={{ gridTemplateColumns: template }}
          key={row[keyField] || row.id}
        >
          {columns.map((col) => {
            const clickable = typeof col.onClick === 'function';
            return (
              <div
                key={col.key}
                className={`pill-cell ${col.cellClass || ''} ${clickable ? 'link' : ''}`}
                onClick={clickable ? () => col.onClick(row) : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => (e.key === 'Enter' || e.key === ' ') && col.onClick(row)
                    : undefined
                }
              >
                {col.render ? col.render(row) : row[col.key] ?? '—'}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
