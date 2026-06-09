/**
 * Position of a fixed table seat on the elliptical felt, in percent (0–100).
 *
 * The ring always has `maxSeats` slots so chairs never reflow as players sit,
 * stand, or move — every seat index owns a stable spot. `anchorSeat` is rotated
 * to 90° (bottom-center): that's the viewer's own seat, so "you" always sit at
 * the bottom and the rest of the table fans out around you. When the viewer has
 * no seat yet, pass 0 so seat 1 anchors the bottom.
 */
export function getSeatPosition(
  seat: number,
  maxSeats: number,
  anchorSeat: number,
  xRadius = 40,
  yRadius = 37
): { x: number; y: number } {
  const step = 360 / Math.max(maxSeats, 1);
  // 0° = right, 90° = bottom. Positive-modulo so a negative offset still wraps to [0,360).
  const angleDeg = ((((seat - anchorSeat) * step + 90) % 360) + 360) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: 50 + xRadius * Math.cos(angleRad),
    y: 50 + yRadius * Math.sin(angleRad),
  };
}

export function computeTableLayout({
  seatCount,
  isMobile,
  isLandscape,
  width = 1200,
}: {
  /** Total seats on the ring (the room's maxSeats) — drives pod scale + spacing. */
  seatCount: number;
  isMobile: boolean;
  isLandscape: boolean;
  /** Measured felt width in px — keeps edge seat pods from clipping on narrow felts. */
  width?: number;
}): { xRadius: number; yRadius: number; opponentScale: number } {
  const n = seatCount;
  if (isMobile) {
    const xRadius = isLandscape ? 34 : 40;
    const yRadius = isLandscape ? 33 : 30;
    const opponentScale = Math.max(0.55, 1 - Math.max(0, n - 4) * 0.045);
    return { xRadius, yRadius, opponentScale };
  }
  // Pull the ring in from the rail so top seats clear the header and the bottom
  // (your) seat clears the table edge. A seat pod is ~132px wide, so its center
  // must stay ~78px in from either edge; on a narrow felt we tighten further.
  const marginPct = (78 / Math.max(width, 1)) * 100;
  const xRadius = Math.max(33, Math.min(40, 50 - marginPct));
  const yRadius = 37;
  const opponentScale = (width < 860 ? 0.86 : 1) * (n >= 8 ? 0.92 : 1);
  return { xRadius, yRadius, opponentScale };
}
