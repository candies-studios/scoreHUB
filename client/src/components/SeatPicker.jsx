import Modal from './Modal.jsx';

/**
 * The identity step that replaces a login: on opening a bout you say which
 * of the three panel seats you are, or that you're only watching.
 */
export default function SeatPicker({ bout, onPick, onCancel }) {
  const judges = bout?.judges || [];

  return (
    <Modal>
      <h3>Who are you?</h3>
      <p style={{ color: 'var(--ink-soft)', margin: '0 0 20px' }}>
        Bout {bout?.boutNo} · {bout?.boutName || bout?.discipline}
      </p>

      <div className="stack">
        {judges.map((j, i) => (
          <button
            key={j._id}
            className="btn btn-ghost btn-block"
            onClick={() => onPick(j._id)}
          >
            Judge {i + 1} — {j.name}
          </button>
        ))}

        {judges.length === 0 && (
          <p className="error-text">
            No judges assigned to this bout yet. Add a panel in the bout form first.
          </p>
        )}

        <button className="btn btn-primary btn-block" onClick={() => onPick('supervisor')}>
          Watch as supervisor
        </button>

        {onCancel && (
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Back
          </button>
        )}
      </div>

      <p className="hint">
        Your choice is remembered on this device for this bout. A supervisor sees every
        judge&apos;s card live but cannot score.
      </p>
    </Modal>
  );
}
