.PHONY: check-pnpm infra-up infra-down migrate seed api web worker pilot-up pilot-down rekor-verify test k8s-render

check-pnpm:
	@command -v pnpm >/dev/null 2>&1 || (echo "pnpm is not available. Run: corepack enable && corepack prepare pnpm@10.11.0 --activate" && exit 1)
	@test -d node_modules || (echo "Dependencies are not installed. Run: pnpm install" && exit 1)

infra-up:
	docker-compose -f infra/docker/docker-compose.yml up -d

infra-down:
	docker-compose -f infra/docker/docker-compose.yml down

migrate:
	pnpm --filter api db:migrate

seed:
	pnpm --filter api db:seed

api: check-pnpm
	pnpm --filter api dev

web: check-pnpm
	pnpm --filter web dev

worker: check-pnpm
	pnpm --filter worker dev

pilot-up: infra-up
	pnpm dev

pilot-down: infra-down

rekor-verify:
	# Add rekor verification command here

test: check-pnpm
	pnpm test

k8s-render:
	kustomize build infra/k8s/overlays/dev