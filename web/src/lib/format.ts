/** Date formatting via Intl — no date library needed for four formats. */

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = parse(iso);
  if (!date) return iso; // never hide a value just because it won't parse
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

/** "Fri, Aug 14" — journal list rows. */
export const shortDate = (iso: string) =>
  format(iso, { weekday: 'short', month: 'short', day: 'numeric' });

/** "Friday, August 14, 2026 at 9:30 PM" — session detail heading. */
export const longDate = (iso: string) =>
  format(iso, { dateStyle: 'full', timeStyle: 'short' });

/** "Aug 14, 26" — compact stats. */
export const statDate = (iso: string) =>
  format(iso, { month: 'short', day: 'numeric', year: '2-digit' });
