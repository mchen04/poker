export function cleanName(input: string): string {
  return input.replace(/[^\w .'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

export function cleanChat(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}
