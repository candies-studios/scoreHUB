const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
};

export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', DATE_OPTS).format(date);
}

export function formatTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .toLowerCase();
}

/** Value for <input type="datetime-local">, in the browser's own offset. */
export function toDateTimeLocal(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function toDateInput(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function durationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return `${m} Minute${m === 1 ? '' : 's'}`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export const ROUND_DURATIONS = [60, 120, 180, 240, 300, 600];
