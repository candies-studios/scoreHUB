export function Field({ label, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function TextField({ label, className = '', ...props }) {
  return (
    <Field label={label} className={className}>
      <input {...props} />
    </Field>
  );
}

export function SelectField({ label, className = '', options = [], placeholder, ...props }) {
  return (
    <Field label={label} className={className}>
      <select {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Stepper({ label, value, onChange, min = 0, max = 99 }) {
  const set = (next) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button type="button" onClick={() => set(Number(value) - 1)} aria-label={`Decrease ${label}`}>
        −
      </button>
      <output>{value}</output>
      <button type="button" onClick={() => set(Number(value) + 1)} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

export default Field;
