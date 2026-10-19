export default function Modal({ children, onClose, dismissable = false }) {
  return (
    <div
      className="modal-backdrop"
      onClick={dismissable ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function WaitingModal({ joined, expected, onStart, canStart }) {
  return (
    <Modal>
      <h3>Please wait for others to join</h3>
      <div className="spinner-clock" />
      <p style={{ color: 'var(--ink-soft)', marginTop: 8 }}>
        {joined} / {expected} Joined
      </p>
      <button className="btn btn-primary" onClick={onStart} disabled={!canStart}>
        Start
      </button>
    </Modal>
  );
}

export function ResultModal({ title = 'Fight complete successfully', winnerName, method, onSubmit }) {
  return (
    <Modal>
      <div className="success-orb">✓</div>
      <h3>{title}</h3>
      <p style={{ margin: '0 0 6px', color: 'var(--ink-soft)' }}>Winner</p>
      <p style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 700 }}>{winnerName}</p>
      {method && <p style={{ margin: '0 0 18px', color: 'var(--ink-soft)' }}>by {method}</p>}
      <button className="btn btn-primary" onClick={onSubmit}>
        Submit and Go to Bout List
      </button>
    </Modal>
  );
}
