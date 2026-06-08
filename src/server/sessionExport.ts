import type { RoomInternal } from './room';

export function finalizeStacks(room: RoomInternal): void {
  room.players.forEach((player) => {
    if (player.seat !== null) player.cashOut = player.stack;
  });
}

export function buildSessionExport(room: RoomInternal, exportJson: string): { exportText: string; exportJson: string } {
  const lines = [
    `Feltline private play-money session ${room.code}`,
    `Room: ${room.settings.roomName}`,
    `Created: ${new Date(room.createdAt).toISOString()}`,
    '',
    'Ledger',
    ...[...room.players.values()].map((player) => `${player.name}: buy-ins ${player.buyInTotal}, stack ${player.stack}, cash-out ${player.cashOut}, up/down ${player.cashOut - player.buyInTotal}`),
    '',
    'Audit',
    ...room.audit.map((entry) => `${new Date(entry.at).toISOString()} [${entry.type}] ${entry.message}`)
  ];
  return { exportText: lines.join('\n'), exportJson };
}
