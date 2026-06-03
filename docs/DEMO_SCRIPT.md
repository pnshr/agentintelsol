# Product Walkthrough Script

Purpose: show that AgentIntel Broker runs a complete autonomous workflow and stores an operational audit trail. Say clearly that local mock mode is for development unless real credentials are configured.

## 0:00 - Open Dashboard

Open:

```text
http://localhost:5173
```

Say:

"This is AgentIntel Broker, an autonomous Solana intelligence service. It analyzes token mints or wallets, buys paid data services when needed, and stores receipts and reports."

## 0:20 - Show Agent Status

Open Agent Status.

Point out:

- agent name;
- SAP agent id;
- total runs;
- completed runs;
- Ace service calls;
- x402 payments;
- total spend;
- mock/real mode chips.

Say:

"The status page gives an operator the run count, payment count, spend, and integration modes at a glance."

## 0:40 - Submit Token Or Wallet Address

Open New Analysis.

Use token:

```text
So11111111111111111111111111111111111111112
```

Select:

- Target type: token or wallet.
- Trigger type: API or manual.

Click Start analysis.

Say:

"After this trigger, the workflow is automatic. There is no manual approval step."

## 1:05 - Show Workflow Timeline

Open Run Detail for the completed run.

Point out timeline:

1. Trigger received.
2. Synapse RPC data fetched.
3. SAP tools discovered.
4. Ace service calls executed.
5. Receipts stored.
6. Sentinel called.
7. Report generated.

Say:

"This timeline shows the workflow from trigger to report."

## 1:30 - Show Tool Discovery And Paid Services

On Run Detail, show:

- SAP tool discovery records;
- `web_search`;
- `entity_enrichment`;
- `ai_classification`;
- reason for every paid service;
- cost and status.

Say:

"Every paid service has a stored reason, so spending is explainable and auditable."

## 2:05 - Show x402 Receipts

Open Payment Receipts.

Point out:

- service name;
- facilitator;
- cost;
- transaction signature or mock receipt id;
- status;
- timestamp.

Say:

"Mock receipts are marked as mock. Real x402 receipts are separated as the verified payment set."

## 2:25 - Show Sentinel And Report

Return to Run Detail or open Reports.

Point out:

- Sentinel timeline step;
- Sentinel result section;
- Markdown report;
- JSON report;
- risk score;
- verdict;
- paid service reasons;
- receipt payloads.

Say:

"The final report combines on-chain data, paid service outputs, Sentinel checks, and the risk engine's scoring explanation."

## 2:55 - Show Operations

Open Operations.

Point out:

- readiness status;
- operational blockers;
- API protection and rate-limit checks;
- complete run id;
- mock receipt count;
- total spend.

Say:

"The Operations page shows what is ready for local development, what has real integrations, and what still needs attention before hosted production use."
