// Format a non-negative number of seconds for human display.
// - < 60s          → "30s"
// - < 60m          → "5m" or "5m 30s" (only show seconds when nonzero)
// - >= 60m         → "1h 5m" or "2h" (drop seconds entirely at the hour scale)
//
// Returns "0s" for 0; defensive but matches the seconds-bracket so display stays
// consistent with how the jar chip historically reads.
export function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
