/**
 * Builds the heartbeat log line. Extracted from the setInterval callback so it can be
 * unit tested without waiting on real timers.
 */
export function heartbeatLog(now: Date = new Date()): [string, string] {
  return ["Worker heartbeat", now.toISOString()];
}
