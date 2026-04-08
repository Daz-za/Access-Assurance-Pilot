pilot-up:
	docker compose -f infra/docker/docker-compose.yml up --build -d
	make migrate
	make seed

pilot-down:
	docker compose -f infra/docker/docker-compose.yml down -v

logs:
	docker compose -f infra/docker/docker-compose.yml logs -f

migrate:
	pnpm --filter api run migrate

seed:
	pnpm --filter api run seed

test:
	pnpm test

opa-test:
	docker compose exec opa opa test /policies

k8s-render:
	kustomize build infra/k8s/overlays/dev
