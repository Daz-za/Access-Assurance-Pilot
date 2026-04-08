const OPA_URL = process.env.OPA_URL || "http://localhost:8181";

export async function evaluateSodPolicy(roles: string[]) {
  try {
    const response = await fetch(`${OPA_URL}/v1/data/access/sod`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: { roles } }),
    });

    if (!response.ok) {
      return { deny: [] };
    }

    return response.json();
  } catch {
    return { deny: [] };
  }
}
