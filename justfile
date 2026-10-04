# justfile — setup / test / lint / run are the contract every repo keeps (~/claude-computer/docs/DEV-GUIDELINES.md).
# The recipes mirror CI (.github/workflows/ci.yml). Deploys happen on push to main (Vercel), not from here.

setup:
    pnpm install
    uv sync

dev:
    pnpm dev

run: dev

build:
    pnpm build

# Vitest unit tests and the Python pipeline tests. Playwright e2e is separate: `pnpm test:e2e`.
test:
    pnpm test
    uv run python -m pytest tests/python -q

# ESLint, tsc, ruff (check and format), and the docs in the documentation standard.
lint:
    pnpm lint
    pnpm typecheck
    uv run ruff check scripts tests
    uv run ruff format --check scripts tests
    docs-build --check docs
