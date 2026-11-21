# Repository Guidelines

## Project structure

Fridgellio is in the requirements stage. `README.md` describes the household workflow, first-release scope, and proposed architecture. `docs/requirements.md` defines the product rules and acceptance criteria. Update both when a scope change affects the overview and detailed behavior. The planned monorepo has a Next.js frontend in `apps/web/` and a FastAPI backend in `apps/api/`. See `docs/backend-stack.md` for planned backend dependencies.

## Development and review

The repository currently contains Markdown documentation. There are no build, lint, or test commands. When changing documentation, verify that relative links resolve, tables render correctly, and examples still match the stated requirements. Document the actual setup and verification commands when implementation starts.

## Formatting and naming

Use one top-level heading per document, short descriptive section headings, and relative links for repository files. Use lower-case, hyphenated names for new documents under `docs/`. Keep stable requirement IDs such as `INV-01` and `REC-03` so reviewers can trace changes across descriptions and acceptance criteria.

## Testing guidelines

Write acceptance criteria with concrete quantities, dates, and expected outcomes. Prioritize cases that can change what a household sees or consumes, including expiry boundaries, compatible units, multiple stock entries for the same food, and insufficient stock. When implementation starts, add automated tests for these rules and a workflow check for recording a cooked meal. Choose the test framework and coverage expectations alongside the implementation.

## Commits and pull requests

Use short imperative commit summaries, for example `Document expiry and recipe ranking rules`. In pull requests, describe the intended change, link any relevant issue or requirement ID, and list what you verified. Include screenshots for future changes that affect the interface.
