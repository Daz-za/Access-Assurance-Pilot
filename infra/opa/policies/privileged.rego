package access.privileged

import rego.v1

# Privileged roles are data-driven (infra/opa/data/policy-data.json,
# data.tenants.default.privilegedRoles), not a hardcoded role-name literal —
# see docs/governance/ROADMAP.md's Phase 1 requirement. Single "default"
# tenant for now; no multi-tenancy in scope.

default flag := false

flag if {
	input.role in data.tenants.default.privilegedRoles
}

message := "Privileged role requires enhanced review" if {
	flag
}
