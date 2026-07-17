.PHONY: check-pnpm infra-up infra-down seed api web worker pilot-up pilot-down test

check-pnpm:
	@command -v pnpm >/dev/null 2>&1 || (echo "pnpm is not available. Run: corepack enable && corepack prepare pnpm@10.11.0 --activate" && exit 1)
	@test -d node_modules || (echo "Dependencies are not installed. Run: pnpm install" && exit 1)

infra-up:
	docker-compose -f infra/docker/docker-compose.yml up -d

infra-down:
	docker-compose -f infra/docker/docker-compose.yml down

# migrate: removed — there is no database and no db:migrate script yet.
# apps/api/package.json's "migrate" script is just an echo stub. Real
# migrations are Phase 1 work (see docs/governance/ROADMAP.md).

seed: check-pnpm
	pnpm --filter api seed

api: check-pnpm
	pnpm --filter api dev

web: check-pnpm
	pnpm --filter web dev

worker: check-pnpm
	pnpm --filter worker dev

pilot-up: infra-up
	pnpm dev

pilot-down: infra-down

# rekor-verify: removed — was an empty stub. Rekor verification is Phase 2
# work (see docs/decisions/0003-rekor-transparency-log.md).

test: check-pnpm
	pnpm test

# k8s-render: removed — infra/k8s does not exist in this repo.
