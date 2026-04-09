.PHONY: infra-up infra-down infra-logs demo-up demo-reset migrate seed test opa-test k8s-render

infra-up:
	docker compose -f infra/docker/docker-compose.yml up -d postgres redis minio opa

infra-down:
	docker compose -f infra/docker/docker-compose.yml down -v

infra-logs:
	docker compose -f infra/docker/docker-compose.yml logs -f postgres redis minio opa

demo-up: infra-up
	pnpm dev

demo-reset: infra-down infra-up

migrate:
	pnpm --filter api run migrate

seed:
	pnpm --filter api run seed

test:
	pnpm test

opa-test:
	docker compose -f infra/docker/docker-compose.yml exec opa opa test /policies

k8s-render:
	kustomize build infra/k8s/overlays/dev
