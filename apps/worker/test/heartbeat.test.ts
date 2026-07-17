import { describe, it, expect } from "vitest";
import { heartbeatLog } from "../src/heartbeat";

describe("heartbeatLog", () => {
  it("returns a fixed label and the ISO timestamp of the given date", () => {
    const fixed = new Date("2026-01-01T00:00:00.000Z");
    const [label, timestamp] = heartbeatLog(fixed);

    expect(label).toBe("Worker heartbeat");
    expect(timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("defaults to the current time when no date is given", () => {
    const before = Date.now();
    const [, timestamp] = heartbeatLog();
    const after = Date.now();

    const parsed = new Date(timestamp).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
