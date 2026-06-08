import { randomIntBelow } from './hash';

export function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alphabet[randomIntBelow(alphabet.length)]).join('');
}
