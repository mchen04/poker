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
  width = 1200,
}: {
  playerCount: number;
  isMobile: boolean;
  isLandscape: boolean;
  /** Measured felt width in px — keeps edge seat pods from clipping on narrow felts. */
  width?: number;
}): { xRadius: number; yRadius: number; opponentScale: number } {
  const n = playerCount;
  if (isMobile) {
    const xRadius = isLandscape ? (n >= 5 ? 29 : 32) : n >= 5 ? 40 : 43;
    const yRadius = isLandscape ? (n >= 5 ? 32 : 36) : n >= 5 ? 23 : 28;
    const opponentScale = Math.max(0.6, 1 - Math.max(0, n - 4) * 0.04);
    return { xRadius, yRadius, opponentScale };
  }
  // A seat pod is up to ~132px wide, so its center must stay ~72px in from either
  // edge or it clips off-screen. On a wide desktop felt that's a small percentage,
  // so we keep the roomy 46 radius; on a narrow felt (tablet, split-screen) we pull
  // the edge seats inward proportionally instead of letting them spill past the edge.
  const marginPct = (72 / Math.max(width, 1)) * 100;
  const xRadius = Math.max(36, Math.min(46, 50 - marginPct));
  const yRadius = 43;
  const opponentScale = width < 820 ? 0.9 : 1;
  return { xRadius, yRadius, opponentScale };
}
