.PHONY: check-pnpm demo-up demo-api demo-web demo-worker test k8s-render

check-pnpm:
	@command -v pnpm >/dev/null 2>&1 || (echo "pnpm is not available. Run: corepack enable && corepack prepare pnpm@10.11.0 --activate" && exit 1)
	@test -d node_modules || (echo "Dependencies are not installed. Run: pnpm install" && exit 1)

demo-up: check-pnpm
	pnpm dev

demo-api: check-pnpm
	pnpm --filter api dev

demo-web: check-pnpm
	pnpm --filter web dev

demo-worker: check-pnpm
	pnpm --filter worker dev

test: check-pnpm
	pnpm test

k8s-render:
	kustomize build infra/k8s/overlays/dev