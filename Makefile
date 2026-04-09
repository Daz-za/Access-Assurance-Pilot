.PHONY: demo-up demo-api demo-web demo-worker test k8s-render

demo-up:
	pnpm dev

demo-api:
	pnpm --filter api dev

demo-web:
	pnpm --filter web dev

demo-worker:
	pnpm --filter worker dev

test:
	pnpm test

k8s-render:
	kustomize build infra/k8s/overlays/dev