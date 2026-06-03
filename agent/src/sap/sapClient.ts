import type { AppConfig } from "../config/env";
import type { AppDatabase } from "../db/runsRepository";
import { toolDiscoveries } from "../db/schema";
import { mockId, mockSolanaSignature, nowIso, numberFromHash } from "../utils/mockData";
import {
  discoverToolsWithOfficialSapSdk,
  getAgentStatusWithOfficialSapSdk,
  registerAgentWithOfficialSapSdk
} from "./sapOfficialSdk";
import type {
  SapAgentMetadata,
  SapAgentStatus,
  SapRecordedToolDiscovery,
  SapRegistrationResult,
  SapToolDiscoveryQuery,
  SapToolDiscoveryResult
} from "./sapTypes";

export interface SapClientOptions {
  config: Pick<
    AppConfig,
    | "AGENT_PUBLIC_URL"
    | "AGENT_X402_ENDPOINT"
    | "OOBE_API_KEY"
    | "SAP_AGENT_ID"
    | "SAP_PRIVATE_KEY"
    | "SAP_REGISTRY_ENDPOINT"
    | "SAP_ENABLE_MAINNET_WRITES"
    | "SAP_MOCK_MODE"
    | "SYNAPSE_API_KEY"
  >;
  db?: AppDatabase;
}

export class SapClient {
  private readonly config: SapClientOptions["config"];
  private readonly db: AppDatabase | undefined;

  public constructor(options: SapClientOptions) {
    this.config = options.config;
    this.db = options.db;
  }

  public async registerAgent(
    metadata: SapAgentMetadata
  ): Promise<SapRegistrationResult> {
    if (!this.config.SAP_MOCK_MODE) {
      // TODO(real SAP): Confirm the current production metadata shape with
      // the current SAP Explorer. This branch uses the
      // official @oobe-protocol-labs/synapse-sap-sdk and only writes to
      // mainnet when SAP_ENABLE_MAINNET_WRITES=true.
      return registerAgentWithOfficialSapSdk(this.config, metadata);
    }

    const agentId =
      this.config.SAP_AGENT_ID || mockId("sap_agent", metadata.name, 12);

    return {
      mode: "mock",
      agentId,
      registryEndpoint:
        this.config.SAP_REGISTRY_ENDPOINT || "mock://synapse-sap-registry",
      status: "dry_run",
      txSignature: mockSolanaSignature({ agentId, metadata }),
      registrationPayload: {
        name: metadata.name,
        version: metadata.version,
        capabilities: metadata.capabilities,
        protocols: metadata.protocols,
        mock: true
      },
      createdAt: nowIso()
    };
  }

  public async discoverTools(
    query: SapToolDiscoveryQuery
  ): Promise<SapToolDiscoveryResult[]> {
    if (!this.config.SAP_MOCK_MODE) {
      // TODO(real SAP): Replace the fallback PDA index scan with the SDK's
      // high-level discovery registry once it is exported from the official
      // npm package. Current implementation reads the capability index PDA and
      // hydrates agent identities without fabricating results.
      return discoverToolsWithOfficialSapSdk(this.config, query);
    }

    const capability = query.capability ?? "solana:intelligence";
    const protocol = query.protocol ?? "sap:x402";
    const maxResults = query.maxResults ?? 3;

    const tools: SapToolDiscoveryResult[] = [
      buildMockTool(query, {
        capability,
        protocol,
        name: "Ace Web Intelligence",
        amountUsdc: 0.03,
        index: 1
      }),
      buildMockTool(query, {
        capability: "entity:enrichment",
        protocol,
        name: "Ace Entity Enrichment",
        amountUsdc: 0.04,
        index: 2
      }),
      buildMockTool(query, {
        capability: "ai:risk-classification",
        protocol,
        name: "Ace AI Classification",
        amountUsdc: 0.05,
        index: 3
      })
    ];

    return tools.slice(0, maxResults);
  }

  public async getAgentStatus(agentId: string): Promise<SapAgentStatus> {
    if (!this.config.SAP_MOCK_MODE) {
      // TODO(real SAP): Add SAP Explorer visibility metadata once the official
      // Explorer API endpoint is published. This branch fetches the local
      // wallet's SAP account through the official SDK.
      return getAgentStatusWithOfficialSapSdk(this.config, agentId);
    }

    return {
      mode: "mock",
      agentId,
      registryEndpoint:
        this.config.SAP_REGISTRY_ENDPOINT || "mock://synapse-sap-registry",
      status: "active",
      capabilities: [
        "solana:token-intelligence",
        "solana:wallet-intelligence",
        "x402:paid-tool-use",
        "proof:structured-report"
      ],
      reputation: {
        score: numberFromHash(agentId, 82, 97),
        uptimeBps: numberFromHash(`${agentId}:uptime`, 9850, 9995),
        latencyMs: numberFromHash(`${agentId}:latency`, 42, 130),
        calls: numberFromHash(`${agentId}:calls`, 120, 2400)
      },
      lastSeenAt: nowIso()
    };
  }

  public async recordToolDiscovery(
    runId: string,
    tools: SapToolDiscoveryResult[]
  ): Promise<SapRecordedToolDiscovery[]> {
    const createdAt = new Date();
    const emptyDiscoveryRecord = {
      id: mockId("sap_discovery", { runId, toolId: "sap_no_match" }, 18),
      runId,
      toolId: "sap_no_match",
      capability: "sap:discovery",
      selectedTool: "No SAP tools matched this query",
      persisted: Boolean(this.db),
      createdAt: createdAt.toISOString()
    };

    if (tools.length === 0) {
      if (!this.db) {
        return [{ ...emptyDiscoveryRecord, persisted: false }];
      }

      await this.db.insert(toolDiscoveries).values({
        id: emptyDiscoveryRecord.id,
        runId,
        provider: "sap",
        capability: emptyDiscoveryRecord.capability,
        selectedTool: emptyDiscoveryRecord.selectedTool,
        discoveryPayload: {
          mode: this.config.SAP_MOCK_MODE ? "mock" : "real",
          toolCount: 0,
          note:
            "SAP discovery was executed, but no matching tools were returned by the current registry/index query."
        },
        createdAt
      });

      return [emptyDiscoveryRecord];
    }

    const records = tools.map((tool) => ({
      id: mockId("sap_discovery", { runId, toolId: tool.toolId }, 18),
      runId,
      toolId: tool.toolId,
      capability: tool.capability,
      selectedTool: tool.name,
      persisted: Boolean(this.db),
      createdAt: createdAt.toISOString()
    }));

    if (!this.db) {
      return records.map((record) => ({ ...record, persisted: false }));
    }

    await this.db.insert(toolDiscoveries).values(
      tools.map((tool) => ({
        id: mockId("sap_discovery", { runId, toolId: tool.toolId }, 18),
        runId,
        provider: "sap",
        capability: tool.capability,
        selectedTool: tool.name,
        discoveryPayload: {
          mode: tool.mode,
          toolId: tool.toolId,
          endpoint: tool.endpoint,
          pricing: tool.pricing,
          reputation: tool.reputation,
          metadata: tool.metadata
        },
        createdAt
      }))
    );

    return records;
  }

}

function buildMockTool(
  query: SapToolDiscoveryQuery,
  input: {
    name: string;
    capability: string;
    protocol: string;
    amountUsdc: number;
    index: number;
  }
): SapToolDiscoveryResult {
  const toolId = mockId("sap_tool", { query, input }, 14);

  return {
    mode: "mock",
    toolId,
    name: input.name,
    capability: input.capability,
    protocol: input.protocol,
    endpoint: `mock://sap/tools/${toolId}`,
    pricing: {
      model: "x402",
      amountUsdc: input.amountUsdc
    },
    reputation: {
      score: numberFromHash(toolId, 80, 98),
      uptimeBps: numberFromHash(`${toolId}:uptime`, 9800, 9999),
      latencyMs: numberFromHash(`${toolId}:latency`, 50, 180),
      calls: numberFromHash(`${toolId}:calls`, 75, 5000)
    },
    metadata: {
      targetType: query.targetType ?? "token",
      tags: query.tags ?? [],
      mock: true,
      note: "Mock SAP discovery result; not an on-chain discovery."
    },
    discoveredAt: nowIso()
  };
}
