export const grad = (hue: number) =>
  `linear-gradient(135deg,hsl(${hue} 75% 58%),hsl(${(hue + 40) % 360} 70% 48%))`;

export const initials = (name: string | null | undefined) =>
  (name ?? '?').split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();

export const cgpa = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(2));

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(Number(v))}%`);

export function passRate(passed: number, total: number, inProgress: number) {
  const graded = total - inProgress;
  return graded > 0 ? Math.round((passed / graded) * 100) : 0;
}
