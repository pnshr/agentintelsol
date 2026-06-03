# Integration Guide

This guide explains how to move from mock mode toward real SAP, Synapse RPC, Ace Data Cloud x402, and Sentinel integrations.

Do not enable real-mode production traffic until the relevant section below is completed and verified.

## Integration Status

Start the backend and call:

```text
GET /api/integration-status
```

Response:

```json
{
  "sap": "mock | configured | missing_config",
  "synapseRpc": "mock | configured | missing_config",
  "aceX402": "mock | configured | missing_config",
  "sentinel": "mock | configured | missing_config"
}
```

Meanings:

- `mock`: mock mode is enabled.
- `configured`: mock mode is disabled and required env vars are present.
- `missing_config`: mock mode is disabled but required env vars are missing.

`configured` is not evidence of successful execution. It only confirms local configuration presence.

## Environment File

Copy:

```powershell
Copy-Item agent/.env.example agent/.env
```

Then edit `agent/.env`.

## SAP

Variables:

```text
AGENT_PUBLIC_URL=
AGENT_X402_ENDPOINT=
OOBE_API_KEY=
SAP_AGENT_ID=
SAP_PRIVATE_KEY=
SAP_REGISTRY_ENDPOINT=https://us-1-mainnet.oobeprotocol.ai?api_key=YOUR_OOBE_API_KEY
SAP_ENABLE_MAINNET_WRITES=false
SAP_MOCK_MODE=false
```

Current code:

- `agent/src/sap/sapClient.ts`
- `agent/src/sap/sapOfficialSdk.ts`
- Official npm package installed: `@oobe-protocol-labs/synapse-sap-sdk@0.18.0`.
- Real registration uses the official SDK when `SAP_MOCK_MODE=false` and `SAP_ENABLE_MAINNET_WRITES=true`.
- Real discovery reads the SAP capability index PDA first, then falls back to the SAP protocol index when a protocol such as `x402` is supplied and no capability matches exist. It does not fabricate discovery results.
- Real status lookup fetches the local wallet's SAP agent account through the SDK.

Check local SDK access:

```powershell
npm run sap:check
```

Check current real SAP discovery:

```powershell
npm --prefix agent run sap:discovery
```

Expected output includes:

- SDK package name and version.
- SAP program id.
- exported `SapClient`.
- exported PDA helpers.
- env readiness booleans, without printing secrets.

Real registration command:

```powershell
npm run sap:register
```

Current SAP registration record:

- SAP agent PDA: `6t5H8ZNjnxdbfq5NjJW52YXPEqZyMgghMzXgj31SzYpV`
- Owner wallet: `ANFveKRdoMv9CbJ2MXbBUabtC8J9uyj327ThoafKzvvw`
- Transaction: `q32VMFpkbE88p2LGtE2UMahsdFGX2nauH22cyFit26VdAoP3dtQ1iV88kjSL54LWPAjCNZkxHAkxAitYN5wHhnQ`
- Status checked through Solana JSON-RPC: `finalized`
- `x402` protocol-index add transaction: `uaiqCKcR9c2HJvbpTgmKYLimwTeUz7gejAotzr12fDzMRtjPk8qSGegiQDXYnsymnhjWKoghchWXGF6D2oQN9Ym`
- Current discovery check: `npm --prefix agent run sap:discovery` returns 5 real non-mock tools, including AceDataCloud.
- Safety restored after registration: `SAP_ENABLE_MAINNET_WRITES=false`

Safety behavior:

- With `SAP_ENABLE_MAINNET_WRITES=false`, registration throws before submitting a transaction.
- With missing `SAP_PRIVATE_KEY` or `SAP_REGISTRY_ENDPOINT`, registration throws before SDK execution.
- With `SAP_MOCK_MODE=true`, `sap:register` refuses to run so a mock dry-run cannot be mistaken for mainnet registration.
- With valid config and `SAP_ENABLE_MAINNET_WRITES=true`, the SDK attempts a real SAP registration transaction.

Expected real registration flow:

1. Get official OOBE/Synapse API access from the Synapse sign-up/team channel.
2. Build `SAP_REGISTRY_ENDPOINT` using the official mainnet endpoint and API key.
3. Put a funded Solana agent wallet secret key in `SAP_PRIVATE_KEY`.
4. Set a public backend URL in `AGENT_PUBLIC_URL`.
5. Set a public x402 endpoint in `AGENT_X402_ENDPOINT`, if available.
6. Run `npm run sap:check`.
7. Set `SAP_MOCK_MODE=false`.
8. Set `SAP_ENABLE_MAINNET_WRITES=true` only when ready to pay transaction fees/rent.
9. Run `npm run sap:register`.
10. Store returned agent id/PDA and transaction signature.
11. Confirm SAP Explorer or registry visibility.

Implementation notes:

- The SDK's CommonJS entry works in this project.
- Direct ESM import currently fails on package-internal extensionless directory imports, so the boundary intentionally uses CommonJS `require`.
- The current npm top-level exports include `SapClient` and `Pdas`, but not the documented high-level `DiscoveryRegistry`; discovery therefore uses PDA index reads and protocol-index fallback until that registry is exported.
- `npm audit --omit=dev` currently reports vulnerabilities in the official SDK dependency chain. Do not treat the local SDK installation as production-approved without dependency review.

## Synapse RPC

Variables:

```text
SYNAPSE_RPC_URL=
SYNAPSE_API_KEY=
SYNAPSE_MOCK_MODE=false
```

Current code:

- `agent/src/synapse/synapseRpcClient.ts`
- Real mode uses standard JSON-RPC over `SYNAPSE_RPC_URL`.

Implemented methods:

- `getAccountInfo`
- `getTokenSupply`
- `getTokenLargestAccounts`
- `getMultipleAccounts`
- `getSignaturesForAddress`
- `getTransaction`

Limit:

- Token metadata name, symbol, and URI are not fully resolved in real mode yet.

Expected real implementation:

1. Confirm the official Synapse RPC URL and authentication header expectations.
2. Add rate limits, retries, and payload hashing.
3. Add token metadata through official Synapse asset API, Metaplex metadata parsing, or documented SDK.
4. Store raw payload hashes in audit records when useful for operations.

## Ace Data Cloud x402

Variables:

```text
ACE_API_KEY=
ACE_SERVICE_BASE_URL=https://api.acedata.cloud
ACE_ACCOUNT_ID=
ACE_PLATFORM_BASE_URL=https://platform.acedata.cloud
ACE_PLATFORM_TOKEN=
ACE_X402_FACILITATOR_URL=
ACE_X402_PRIVATE_KEY=
ACE_X402_NETWORK=base
ACE_X402_MAX_PAYMENT_USDC=1
ACE_X402_REQUIRE_PAYMENT=true
ACE_X402_ORDER_ID_WEB_SEARCH=
ACE_X402_ORDER_ID_ENTITY_ENRICHMENT=
ACE_X402_ORDER_ID_AI_CLASSIFICATION=
ACE_WEB_SEARCH_PATH=/serp/google
ACE_ENTITY_ENRICHMENT_PATH=/webextrator/extract
ACE_AI_CLASSIFICATION_PATH=/openai/chat/completions
ACE_AI_MODEL=gpt-4o-mini
ACE_MOCK_MODE=false
```

Current code:

- `agent/src/ace/aceX402Client.ts`
- Real mode validates service and x402 config.
- Real mode calls Ace Data Cloud service endpoints.
- Real mode uses `x402-fetch` to sign x402 payment headers.
- Real mode stores `X-PAYMENT-RESPONSE` as non-mock receipt evidence.
- If `ACE_X402_REQUIRE_PAYMENT=true`, a workflow fails rather than storing a non-x402 receipt.

Expected real implementation:

1. Create or identify Ace platform orders for each paid service.
2. Put the order ids in the per-service `ACE_X402_ORDER_ID_*` env vars.
3. Fund the Base USDC wallet represented by `ACE_X402_PRIVATE_KEY`.
4. Run `npm run ace:check` and confirm `readyForRealX402Receipts=true`.
5. Run the workflow with `ACE_MOCK_MODE=false` and `ACE_X402_REQUIRE_PAYMENT=true`.
6. Confirm each payment receipt has status `settled`, `mock: false`, and an `xPaymentResponse`.

Security note:

- Do not store production private keys in SQLite or report payloads.
- Prefer a signer abstraction or secure wallet integration over raw private keys.

## Sentinel

Variables:

```text
SENTINEL_AGENT_ID=AzqhCKhku9TX3ScVtQw5nffLJ6PoA8r3P6HiTdinuAKz
SENTINEL_ENDPOINT=https://agent.sentinel.oobeprotocol.ai
SENTINEL_CHECK_PATH=/tools/:name
SENTINEL_HTTP_METHOD=POST
SENTINEL_API_KEY=
SENTINEL_MERCHANT_WALLET=Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph
SENTINEL_DEPOSITOR_WALLET=<your funded SAP depositor wallet>
SENTINEL_TOOL_TOKEN=spl-token_rugCheck
SENTINEL_TOOL_WALLET=spl-token_getTokenAccounts
SENTINEL_MIN_ESCROW_LAMPORTS=10000000
SENTINEL_MOCK_MODE=false
```

Current code:

- `agent/src/sentinel/sentinelClient.ts`
- Real mode validates config.
- Public Sentinel is wired as a SAP x402 gateway:
  - `GET /health`
  - `GET /tools`
  - `POST /tools/:name`
- The adapter uses `spl-token_rugCheck` for token targets and `spl-token_getTokenAccounts` for wallet targets by default.
- Real mode sends `x-sap-depositor` and requires a funded SAP escrow before the Sentinel tool can execute.
- Tool payloads must be wrapped as `{ "input": { ...tool arguments } }`; sending raw `{ "mint": "..." }` or `{ "wallet": "..." }` causes a schema mismatch.
- Real mode stores request hash, response hash, endpoint, tool name, depositor wallet, merchant wallet, and raw payload.

Confirmed public gateway semantics:

- Without escrow, the gateway returns `402 payment_required` or `escrow_not_funded`.
- A successful real call requires opening/top-up of a SAP escrow for the depositor wallet.
- Current project evidence: funded escrow plus HTTP 200 non-mock `spl-token_rugCheck` response with batched SAP x402 settlement metadata.
- Store evidence in `sentinel_checks`.
- Show evidence in Run Detail and Reports.

## Verification Checklist

Before claiming real integration:

- `GET /api/integration-status` returns `configured` for the integration being tested.
- The workflow completes without using mock mode for that integration.
- Stored raw response includes `mock: false` where applicable.
- Dashboard shows receipts and audit details.
- Reports include reasons for tool buying and receipt references.
- SAP Explorer or registry shows the agent when SAP real mode is enabled.
- Real x402 receipts can be traced to facilitator output when Ace real mode is enabled.
