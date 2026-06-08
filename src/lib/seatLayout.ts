export function getSeatPosition(
  playerIndex: number,
  totalPlayers: number,
  selfIndex: number,
  xRadius = 41,
  yRadius = 38
): { x: number; y: number } {
  const step = 360 / totalPlayers;
  // Self always at 90° (bottom center). Angle 0° = right, 90° = bottom.
  // Positive-modulo so a negative (playerIndex - selfIndex) still wraps to [0,360).
  const angleDeg = ((((playerIndex - selfIndex) * step + 90) % 360) + 360) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: 50 + xRadius * Math.cos(angleRad),
    y: 50 + yRadius * Math.sin(angleRad),
  };
}

export function computeTableLayout({
  playerCount,
  isMobile,
  isLandscape,
}: {
  playerCount: number;
  isMobile: boolean;
  isLandscape: boolean;
}): { xRadius: number; yRadius: number; opponentScale: number } {
  const n = playerCount;
  const xRadius = isMobile ? (isLandscape ? (n >= 5 ? 29 : 32) : n >= 5 ? 40 : 43) : 46;
  const yRadius = isMobile ? (isLandscape ? (n >= 5 ? 32 : 36) : n >= 5 ? 23 : 28) : 43;
  const opponentScale = isMobile ? Math.max(0.6, 1 - Math.max(0, n - 4) * 0.04) : 1;
  return { xRadius, yRadius, opponentScale };
}
