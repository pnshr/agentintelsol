# Anti-Wash Policy

AgentIntel Broker is designed to avoid artificial loops, spam, and wash-style usage. The workflow buys tools only when a deterministic policy selects them and every paid call has a stored reason.

## Implemented Controls

Location:

- `agent/src/payments/spendingPolicy.ts`
- `agent/src/payments/paymentTypes.ts`
- `agent/src/payments/spendingPolicy.test.ts`

## Rules

1. Max spend per run.
2. Max daily spend.
3. Max tool calls per run.
4. No repeated identical target more than 3 times per day.
5. No agent-to-itself payment loop.
6. Every paid call must have a non-empty `reason_for_call`.
7. Every paid call must be attached to a workflow run.
8. Every receipt must include service name, cost, status, facilitator, and timestamp.

## Budget Variables

Configured in `agent/.env`:

```text
MAX_DAILY_SPEND_USDC=10
MAX_SPEND_PER_RUN_USDC=1
MAX_TOOL_CALLS_PER_RUN=20
```

## Reasoned Tool Buying

Each paid Ace call must have a reason before it can execute.

Examples:

- Web search is purchased because token metadata contains external links or identity hints.
- Entity enrichment is purchased because project names, links, or wallet counterparties need normalization.
- AI classification is purchased because structured evidence needs a constrained risk rubric.

The reason is stored in:

- `ace_service_calls.reason_for_call`
- `spending_events.reason`
- final JSON and Markdown reports
- dashboard Paid Services table

## Repeated Target Limit

The policy blocks more than three identical target analyses per day. This avoids repeatedly analyzing the same address just to create artificial service usage or payment rows.

## Self-Payment Check

The policy blocks service names that match configured self identifiers:

- `SAP_AGENT_ID`
- `ACE_ACCOUNT_ID`

This prevents obvious agent-to-itself payment loops.

## Receipt Validation

Spending events require receipt fields:

- service name
- cost
- status
- facilitator
- timestamp

Mock receipts are allowed for local development mode only and are labeled as mock.

## Tests

Covered cases:

- exceeding max spend per run
- missing reason for call
- too many tool calls
- repeated target limit
- normal valid service call
- self-payment loop

Run:

```powershell
npm run test
```

## Operations Review

To review anti-wash behavior:

1. Open `agent/src/payments/spendingPolicy.ts`.
2. Open `agent/src/payments/spendingPolicy.test.ts`.
3. Open a completed report and inspect "Anti-wash legitimacy notes".
4. Open Run Detail and confirm each paid service includes a reason.
5. Open Payment Receipts and confirm receipts are attached to workflow runs.
