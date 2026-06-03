# AgentIntel Broker - Project State

Current status: AgentIntel Broker is a working autonomous Solana intelligence service with a TypeScript backend, React dashboard, SQLite audit storage, SAP discovery, Synapse RPC, Ace x402 service calls, Sentinel checks, risk scoring, reports, and operational readiness checks.

Last updated: 2026-05-31

## Product Positioning

AgentIntel Broker is packaged as a standalone product.

The product workflow is:

1. Receive a token mint or wallet address.
2. Validate the Solana address.
3. Fetch on-chain evidence through Synapse RPC-compatible calls.
4. Discover SAP tools.
5. Decide which paid Ace Data Cloud services are justified.
6. Enforce spending and anti-wash policy.
7. Execute paid x402 service calls.
8. Store receipts and spending events.
9. Run a Sentinel check.
10. Score risk.
11. Generate JSON and Markdown reports.
12. Show the run in the operations dashboard.

## Current Runtime Projects

- `agent/`: backend service.
- `web/`: React dashboard.
- `docs/`: product architecture, integration, operations, and anti-wash documentation.

## Backend

Implemented:

- Fastify API.
- Strict TypeScript.
- Typed dotenv/Zod config.
- SQLite through Node `node:sqlite`.
- Drizzle schema definitions.
- Structured pino logging.
- Spending policy and tests.
- Workflow orchestrator.
- Risk engine.
- Report generator.
- SAP, Synapse RPC, Ace x402, and Sentinel adapters.
- Operational readiness endpoint.
- Public balance endpoint for operational funding checks.
- JSON audit bundle endpoint.

Important endpoints:

- `GET /api/health`
- `GET /api/readiness`
- `GET /api/integration-status`
- `POST /api/analyze`
- `POST /api/scheduled-demo-run`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/runs`
- `GET /api/dashboard/runs/:id`
- `GET /api/dashboard/receipts`
- `GET /api/dashboard/reports`
- `GET /api/payments/:runId`
- `GET /api/reports/:id`
- `GET /api/balances`
- `GET /api/audit/:runId`

## Dashboard

The dashboard now presents product operations only.

Pages:

- Agent Status
- New Analysis
- Workflow Runs
- Run Detail
- Payment Receipts
- Reports
- Integration Status
- Operations

Agent Status now includes a Balances panel:

- Ace x402 payer address, Base USDC, Base ETH, and configured full-run USDC cap.
- Sentinel depositor address, SOL balance, and configured escrow minimum.
- Funding status messages for both payment surfaces.

Removed from the product UI:

- external-review-only checklist page;
- non-product review wording;
- special-case run labels.

Replacement language:

- verified run
- verified payment set
- audit bundle
- operational blockers
- production readiness

## Integrations

SAP:

- Official SAP SDK boundary is installed and wired.
- Agent registration details are stored in `docs/SAP_REGISTRATION.md`.
- Real discovery checks capability indexes first, then falls back to SAP `x402` protocol-index discovery.
- `npm --prefix agent run sap:discovery` currently returns non-mock SAP tools including AceDataCloud.

Synapse RPC:

- Standard Solana JSON-RPC methods are implemented where possible.
- Real mode is controlled by `SYNAPSE_MOCK_MODE=false` and configured RPC credentials.

Ace x402:

- Three service methods exist: web search, entity enrichment, and AI classification.
- Real x402 uses `x402-fetch`.
- Receipts are stored in `payment_receipts` and surfaced in the dashboard.

Sentinel:

- Real public SAP x402 gateway flow is implemented.
- Sentinel results are stored in `sentinel_checks` and included in reports.

## Safety

Implemented spending controls:

- max spend per run;
- max daily spend;
- max paid tool calls per run;
- repeated target limit;
- no agent-to-itself payment loop;
- required reason for every paid call;
- receipt field validation.

Tests cover spending policy, risk scenarios, report generation, and readiness.

## Product Documentation

Current docs:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/INTEGRATION_GUIDE.md`
- `docs/ANTI_WASH_POLICY.md`
- `docs/DEMO_SCRIPT.md`
- `docs/SAP_REGISTRATION.md`

Removed product-facing docs:

- external-review checklist docs;
- scorecard docs;
- one-off review docs.

## Latest Product Cleanup

Completed:

- Removed the external-review checklist from the dashboard.
- Removed non-product language from the primary UI.
- Replaced special-case run labels with "verified run".
- Replaced old export wording with "audit bundle".
- Added `/api/audit/:runId` for run audit exports.
- Added `/api/balances` and an Agent Status balance panel.
- Rewrote README as product documentation.
- Rewrote demo script as a product walkthrough.
- Replaced SAP evidence doc with SAP registration documentation.
- Removed external-review-only docs from `docs/`.

Verification after cleanup:

- `npm.cmd run typecheck` passed in `agent`.
- `npm.cmd test` passed in `agent`: 13 tests.
- `npm.cmd run build` passed in `agent`.
- `npm.cmd run build` passed in `web`.

## Run Locally

Backend:

```powershell
npm run dev:backend
```

Frontend:

```powershell
npm run dev:frontend
```

Open:

```text
http://localhost:5173
```

## Next Product Work

- Add durable queue for long-running analyses.
- Add formal migrations.
- Add managed secrets for hosted deployment.
- Add per-user authorization and account model.
- Add persistent log storage with redaction.
- Add monitoring, alerts, backup, and recovery.
