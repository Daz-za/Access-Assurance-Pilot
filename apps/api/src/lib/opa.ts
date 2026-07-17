import fs from "node:fs";
import path from "node:path";

const OPA_URL = process.env.OPA_URL || "http://localhost:8181";

// Same policy data OPA itself is fed (infra/docker/docker-compose.yml mounts
// infra/opa/data into the OPA container). Read directly rather than
// hardcoding the role-pair literals here too, so the degraded-mode fallback
// can't silently drift from the real policy data (see
// docs/governance/ROADMAP.md's Phase 1 requirement). Loaded once at module
// scope with a plain fs.readFileSync + JSON.parse (not a static `import ...
// json`) because the file lives outside apps/api's tsconfig `rootDir`
// ("src"), which a TS json-module import would reject at compile time; a
// runtime read has no such constraint and this file ships alongside the repo
// in every environment this pilot actually runs in.
interface PolicyData {
  tenants: Record<string, { sodPairs: [string, string][]; privilegedRoles: string[] }>;
}

const POLICY_DATA_PATH = path.resolve(__dirname, "../../../../infra/opa/data/policy-data.json");
const policyData: PolicyData = JSON.parse(fs.readFileSync(POLICY_DATA_PATH, "utf8"));

export interface SodPolicyResult {
  result: { deny: string[] };
  // Explicit, truthful degraded-mode tag — the whole point of this module.
  // A degraded (local-fallback) evaluation must never look identical to a
  // real OPA evaluation to any downstream consumer (the decision route,
  // the stored ReviewDecision.policyResult, the audit trail).
  degraded: boolean;
  degradedReason?: string;
}

function localFallbackSod(roles: string[], degradedReason: string): SodPolicyResult {
  const { sodPairs } = policyData.tenants.default;
  const deny = sodPairs
    .filter(([a, b]) => roles.includes(a) && roles.includes(b))
    .map(([a, b]) => `SoD violation: ${a} + ${b}`);

  return {
    result: { deny },
    degraded: true,
    degradedReason,
  };
}

export async function evaluateSodPolicy(roles: string[]): Promise<SodPolicyResult> {
  try {
    const response = await fetch(`${OPA_URL}/v1/data/access/sod`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: { roles } }),
    });

    if (!response.ok) {
      return localFallbackSod(roles, `OPA returned non-2xx status (${response.status})`);
    }

    const result = (await response.json()) as { result?: { deny?: string[] } };
    return { result: { deny: result.result?.deny ?? [] }, degraded: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return localFallbackSod(roles, `OPA unreachable: ${reason}`);
  }
}
