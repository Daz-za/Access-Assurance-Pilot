.PHONY: check-pnpm infra-up infra-down migrate seed api web worker pilot-up pilot-down test

check-pnpm:
	@command -v pnpm >/dev/null 2>&1 || (echo "pnpm is not available. Run: corepack enable && corepack prepare pnpm@10.11.0 --activate" && exit 1)
	@test -d node_modules || (echo "Dependencies are not installed. Run: pnpm install" && exit 1)

infra-up:
	docker-compose -f infra/docker/docker-compose.yml up -d

infra-down:
	docker-compose -f infra/docker/docker-compose.yml down

# Applies packages/db/prisma/migrations against DATABASE_URL (see .env.example).
# Requires a reachable Postgres — `make infra-up` starts one via docker-compose.
migrate: check-pnpm
	pnpm --filter api migrate

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
