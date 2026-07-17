package access.sod

import rego.v1

# Segregation-of-duties pairs are data-driven (infra/opa/data/policy-data.json,
# data.tenants.default.sodPairs), not hardcoded role-name literals — see
# docs/governance/ROADMAP.md's Phase 1 requirement. Single "default" tenant
# for now; no multi-tenancy in scope.

default allow := true

deny contains msg if {
	some pair in data.tenants.default.sodPairs
	pair[0] in input.roles
	pair[1] in input.roles
	msg := sprintf("SoD violation: %s + %s", [pair[0], pair[1]])
}
