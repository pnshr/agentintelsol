# SAP Registration

This file records the current SAP registration details for AgentIntel Broker. It is operational documentation for maintainers; it does not include private keys.

## Registration

- Agent name: `AgentIntel Broker`
- SAP agent PDA: `6t5H8ZNjnxdbfq5NjJW52YXPEqZyMgghMzXgj31SzYpV`
- Owner wallet: `ANFveKRdoMv9CbJ2MXbBUabtC8J9uyj327ThoafKzvvw`
- SAP program id: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
- Official SDK package: `@oobe-protocol-labs/synapse-sap-sdk@0.18.0`
- Mainnet transaction signature: `q32VMFpkbE88p2LGtE2UMahsdFGX2nauH22cyFit26VdAoP3dtQ1iV88kjSL54LWPAjCNZkxHAkxAitYN5wHhnQ`
- Checked transaction status: `finalized`
- Checked slot: `422337033`
- Checked agent account owner: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
- Checked agent account space: `5462`
- SAP `x402` protocol-index transaction: `uaiqCKcR9c2HJvbpTgmKYLimwTeUz7gejAotzr12fDzMRtjPk8qSGegiQDXYnsymnhjWKoghchWXGF6D2oQN9Ym`

## Registered Capabilities

- `solana:token-intelligence`
- `solana:wallet-intelligence`
- `sap:tool-discovery`
- `x402:paid-tool-use`
- `audit:structured-report`

## Registered Protocols

- `sap`
- `synapse-rpc`
- `x402`
- `synapse-sentinel`

## Maintenance Notes

- `SAP_ENABLE_MAINNET_WRITES` should stay `false` unless a maintainer intentionally submits a registration or index transaction.
- The local SAP private key belongs only in local secret/env files.
- If the public agent URL changes, update the SAP metadata through the guarded SAP registration/update flow.
- Verify discovery with `npm --prefix agent run sap:discovery`.
