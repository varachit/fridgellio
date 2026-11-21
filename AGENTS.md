# Repository Guidelines

## Project structure

Fridgellio is a monorepo with a FastAPI backend in `backend/` and a Next.js frontend in `frontend/`. `README.md` describes the household workflow and backend setup. `docs/requirements.md` defines the product rules and acceptance criteria. Update both when a scope change affects the overview and detailed behavior. See `docs/backend-stack.md` for dependencies and `docs/backend-todo.md` for implementation status.

## Development and review

Run backend checks in `backend/` with `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Use a PostgreSQL test database for migration, isolation, and concurrency checks. When changing documentation, verify that relative links resolve, tables render correctly, and examples match the stated requirements.

## Formatting and naming

Use one top-level heading per document, short descriptive section headings, and relative links for repository files. Use lower-case, hyphenated names for new documents under `docs/`. Keep stable requirement IDs such as `INV-01` and `REC-03` so reviewers can trace changes across descriptions and acceptance criteria.

## Testing guidelines

Write acceptance criteria with concrete quantities, dates, and expected outcomes. Prioritize cases that can change what a household sees or consumes, including expiry boundaries, compatible units, multiple stock entries for the same food, and insufficient stock. When implementation starts, add automated tests for these rules and a workflow check for recording a cooked meal. Choose the test framework and coverage expectations alongside the implementation.

## Commits and pull requests

Use short imperative commit summaries, for example `Document expiry and recipe ranking rules`. In pull requests, describe the intended change, link any relevant issue or requirement ID, and list what you verified. Include screenshots for future changes that affect the interface.
