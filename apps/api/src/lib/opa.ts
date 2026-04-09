const OPA_URL = process.env.OPA_URL || "http://localhost:8181";

function localFallbackSod(roles: string[]) {
  const hasFiAdmin = roles.includes("FI Admin");
  const hasApPayments = roles.includes("AP Payments");

  return {
    result: {
      deny: hasFiAdmin && hasApPayments
        ? ["SoD violation: FI Admin + AP Payments"]
        : []
    }
  };
}

export async function evaluateSodPolicy(roles: string[]) {
  try {
    const response = await fetch(`${OPA_URL}/v1/data/access/sod`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input: { roles } })
    });

    if (!response.ok) {
      return localFallbackSod(roles);
    }

    return response.json();
  } catch {
    return localFallbackSod(roles);
  }
}