import { describe, it, expect, afterEach, vi } from "vitest";
import { evaluateSodPolicy } from "../src/lib/opa";

// Unit-level coverage of apps/api/src/lib/opa.ts's explicit degraded mode.
// Mocks global fetch directly (vitest's vi.fn(), no new HTTP-mocking
// dependency) so each of the three paths — OPA reachable, OPA unreachable,
// OPA reachable but non-2xx — is exercised deterministically, independent of
// whether a real OPA instance happens to be running.
describe("evaluateSodPolicy", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the real OPA result tagged degraded:false when OPA is reachable", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { deny: ["SoD violation: FI Admin + AP Payments"] } }),
    }) as unknown as typeof fetch;

    const result = await evaluateSodPolicy(["FI Admin", "AP Payments"]);

    expect(result.degraded).toBe(false);
    expect(result.degradedReason).toBeUndefined();
    expect(result.result.deny).toEqual(["SoD violation: FI Admin + AP Payments"]);
  });

  it("falls back to a local, data-driven evaluation and tags degraded:true when OPA is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;

    const result = await evaluateSodPolicy(["FI Admin", "AP Payments"]);

    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toMatch(/OPA unreachable/);
    // The fallback must independently detect the same violation, driven by
    // infra/opa/data/policy-data.json's sodPairs — not a hardcoded literal
    // duplicated in opa.ts (which could silently drift from the real data).
    expect(result.result.deny).toEqual(["SoD violation: FI Admin + AP Payments"]);
  });

  it("falls back and tags degraded:true when OPA responds with a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const result = await evaluateSodPolicy(["FI Admin", "AP Payments"]);

    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toMatch(/non-2xx status \(500\)/);
    expect(result.result.deny).toEqual(["SoD violation: FI Admin + AP Payments"]);
  });

  it("the local fallback reports no violation for role sets without a configured SoD pair", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await evaluateSodPolicy(["Standard User"]);

    expect(result.degraded).toBe(true);
    expect(result.result.deny).toEqual([]);
  });

  it("a real (mocked-2xx) OPA response with an empty deny is not falsely reported as degraded", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { deny: [] } }),
    }) as unknown as typeof fetch;

    const result = await evaluateSodPolicy(["Standard User"]);

    expect(result.degraded).toBe(false);
    expect(result.result.deny).toEqual([]);
  });
});
