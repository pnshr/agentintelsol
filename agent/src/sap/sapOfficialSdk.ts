import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import type { AppConfig } from "../config/env";
import type { JsonRecord, JsonValue } from "../types/json";
import type {
  SapAgentMetadata,
  SapAgentStatus,
  SapRegistrationResult,
  SapToolDiscoveryQuery,
  SapToolDiscoveryResult
} from "./sapTypes";

const SAP_SDK_PACKAGE = "@oobe-protocol-labs/synapse-sap-sdk";
const requireFromHere = createRequire(__filename);
const PUBLIC_SOLANA_READ_RPC = "https://solana-rpc.publicnode.com";

type SapOfficialConfig = Pick<
  AppConfig,
  | "AGENT_PUBLIC_URL"
  | "AGENT_X402_ENDPOINT"
  | "OOBE_API_KEY"
  | "SAP_AGENT_ID"
  | "SAP_PRIVATE_KEY"
  | "SAP_REGISTRY_ENDPOINT"
  | "SAP_ENABLE_MAINNET_WRITES"
  | "SYNAPSE_API_KEY"
>;

interface PublicKeyLike {
  toBuffer?: () => Buffer;
  toBase58?: () => string;
  toString?: () => string;
}

interface KeypairLike {
  publicKey: PublicKeyLike;
  secretKey: Uint8Array;
}

interface KeypairConstructor {
  fromSecretKey(secretKey: Uint8Array): KeypairLike;
}

interface WalletConstructor {
  new (payer: KeypairLike): unknown;
}

interface SapSdkClient {
  connection: {
    getBalance: (address: PublicKeyLike, commitment?: string) => Promise<number>;
    getAccountInfo?: (
      address: PublicKeyLike,
      commitment?: string
    ) => Promise<unknown | null>;
    sendTransaction: (transaction: unknown, options?: unknown) => Promise<string>;
  };
  agent: {
    deriveAgent?: () => readonly [PublicKeyLike, number];
    fetchNullable?: () => Promise<unknown | null>;
    fetchStatsNullable?: (agentPda: PublicKeyLike) => Promise<unknown | null>;
    register?: (args: OfficialRegisterAgentArgs) => Promise<string>;
    registerAgent?: (ctx: {
      signer: KeypairLike;
      wallet: PublicKeyLike;
      agent: PublicKeyLike;
      agentStats: PublicKeyLike;
      globalRegistry: PublicKeyLike;
      name: string;
      description: string;
      capabilities: OfficialCapability[];
      pricing: unknown[];
      protocols: string[];
      agentId: string | null;
      agentUri: string | null;
      x402Endpoint: string | null;
    }) => Promise<unknown>;
  };
  buildTransaction: (
    instructions: unknown[],
    payer: PublicKeyLike
  ) => Promise<{
    sign?: (signers: KeypairLike[]) => void;
  }>;
  fetchAccount: (name: string, address: PublicKeyLike) => Promise<unknown | null>;
}

interface SapSdkModule {
  SapClient: new (opts: {
    rpcUrl: string;
    wallet?: unknown;
    commitment?: "processed" | "confirmed" | "finalized";
  }) => SapSdkClient;
  PROGRAM_ID?: PublicKeyLike | string;
  Pdas?: {
    getAgentPDA?: (wallet: PublicKeyLike) => readonly [PublicKeyLike, number];
    getAgentStatsPDA?: (wallet: PublicKeyLike) => readonly [PublicKeyLike, number];
    getGlobalPDA?: () => readonly [PublicKeyLike, number];
    getCapabilityIndexPDA?: (
      capabilityHash: Uint8Array
    ) => readonly [PublicKeyLike, number];
    getProtocolIndexPDA?: (
      protocolHash: Uint8Array
    ) => readonly [PublicKeyLike, number];
    hashString?: (value: string) => Uint8Array;
  };
  Utils?: {
    sha256?: (value: string) => Uint8Array;
  };
  SEEDS?: {
    STATS?: string;
    AGENT_STATS?: string;
  };
  [key: string]: unknown;
}

const MIN_SAP_REGISTRATION_LAMPORTS = 150_000_000;

interface OfficialCapability {
  id: string;
  description: string | null;
  protocolId: string | null;
  version: string | null;
}

interface OfficialRegisterAgentArgs {
  name: string;
  description: string;
  capabilities: OfficialCapability[];
  pricing: unknown[];
  protocols: string[];
  agentId?: string | null;
  agentUri?: string | null;
  x402Endpoint?: string | null;
}

export interface SapOfficialSdkInfo {
  packageName: string;
  installed: boolean;
  version: string | null;
  importStyle: "commonjs";
  programId: string | null;
  topLevelExports: string[];
  pdaExports: string[];
  docs: JsonRecord;
  warnings: string[];
}

export function getSapOfficialSdkInfo(): SapOfficialSdkInfo {
  const sdk = loadSapSdk();
  const packageJson = readSapSdkPackageJson();
  const warnings: string[] = [
    "ESM import currently fails on package-internal extensionless directory imports; this project uses CommonJS require for the SDK boundary.",
    "A successful SDK import is not SAP mainnet proof. Mainnet proof still requires a funded wallet, official RPC/API access, a confirmed transaction signature, and Explorer visibility."
  ];

  return {
    packageName: SAP_SDK_PACKAGE,
    installed: true,
    version: readString(packageJson, "version"),
    importStyle: "commonjs",
    programId: publicKeyToString(sdk.PROGRAM_ID),
    topLevelExports: Object.keys(sdk).sort(),
    pdaExports: Object.keys(sdk.Pdas ?? {}).sort(),
    docs: {
      npmPackage: "https://www.npmjs.com/package/@oobe-protocol-labs/synapse-sap-sdk",
      sapSdkRepo: "https://github.com/OOBE-PROTOCOL/synapse-sap-sdk",
      synapseClientSdkDocs: "https://oobe-protocol.github.io/synapse-client-sdk/",
      synapseDocs: "https://synapse.oobeprotocol.ai/docs",
      sapOverview:
        "https://synapse.oobeprotocol.ai/blog/2026/03/xona-x-oobe-powering-autonomous-ai-agents-with-synapse-agent-protocol-on-solana"
    },
    warnings
  };
}

export async function registerAgentWithOfficialSapSdk(
  config: SapOfficialConfig,
  metadata: SapAgentMetadata
): Promise<SapRegistrationResult> {
  assertWriteConfig(config);

  const sdk = loadSapSdk();
  const { keypair, wallet, ownerWallet } = buildWallet(config.SAP_PRIVATE_KEY);
  const client = new sdk.SapClient({
    rpcUrl: config.SAP_REGISTRY_ENDPOINT,
    wallet,
    commitment: "confirmed"
  });

  const registrationArgs = buildRegisterArgs(config, metadata);
  const balance = await client.connection.getBalance(keypair.publicKey, "confirmed");
  if (balance < MIN_SAP_REGISTRATION_LAMPORTS) {
    throw new Error(
      `SAP registration requires at least ${MIN_SAP_REGISTRATION_LAMPORTS} lamports (0.15 SOL) for the SDK-declared 0.1 SOL protocol fee, two account rent allocations, and transaction fees. Current balance is ${balance} lamports (${balance / 1_000_000_000} SOL).`
    );
  }

  const txSignature = await submitSapRegistration(
    sdk,
    client,
    keypair,
    registrationArgs
  );
  const agentPda = deriveOwnAgentPda(sdk, client, keypair.publicKey);

  return {
    mode: "real",
    agentId: config.SAP_AGENT_ID || agentPda || ownerWallet,
    registryEndpoint: config.SAP_REGISTRY_ENDPOINT,
    status: "registered",
    txSignature,
    registrationPayload: {
      sdkPackage: SAP_SDK_PACKAGE,
      sdkVersion: getSapOfficialSdkInfo().version,
      programId: publicKeyToString(sdk.PROGRAM_ID),
      ownerWallet,
      agentPda,
      registrationArgs: toJsonValue(registrationArgs)
    },
    createdAt: new Date().toISOString()
  };
}

export async function discoverToolsWithOfficialSapSdk(
  config: SapOfficialConfig,
  query: SapToolDiscoveryQuery
): Promise<SapToolDiscoveryResult[]> {
  assertReadConfig(config);

  const sdk = loadSapSdk();
  const client = new sdk.SapClient({
    rpcUrl: config.SAP_REGISTRY_ENDPOINT,
    commitment: "confirmed"
  });
  const capability = query.capability ?? "solana:token-intelligence";
  const requestedProtocol = normalizeProtocol(query.protocol);
  const maxResults = query.maxResults ?? 3;
  const capabilityAgentPdas = await fetchAgentPdasForCapability(
    sdk,
    client,
    capability
  );
  const protocolAgentPdas =
    capabilityAgentPdas.length === 0 && requestedProtocol
      ? await fetchAgentPdasForProtocol(sdk, client, requestedProtocol)
      : [];
  let agentPdas =
    capabilityAgentPdas.length > 0 ? capabilityAgentPdas : protocolAgentPdas;
  let discoveryBasis: JsonRecord =
    capabilityAgentPdas.length > 0
      ? { type: "capability", value: capability }
      : protocolAgentPdas.length > 0
        ? { type: "protocol", value: requestedProtocol ?? "unknown" }
        : { type: "capability", value: capability };

  if (agentPdas.length === 0 && !isPublicSolanaReadEndpoint(config.SAP_REGISTRY_ENDPOINT)) {
    const fallbackClient = new sdk.SapClient({
      rpcUrl: PUBLIC_SOLANA_READ_RPC,
      commitment: "confirmed"
    });
    const fallbackCapabilityPdas = await fetchAgentPdasForCapability(
      sdk,
      fallbackClient,
      capability
    );
    const fallbackProtocolPdas =
      fallbackCapabilityPdas.length === 0 && requestedProtocol
        ? await fetchAgentPdasForProtocol(sdk, fallbackClient, requestedProtocol)
        : [];
    agentPdas =
      fallbackCapabilityPdas.length > 0
        ? fallbackCapabilityPdas
        : fallbackProtocolPdas;
    discoveryBasis =
      fallbackCapabilityPdas.length > 0
        ? { type: "capability", value: capability, rpcFallback: true }
        : fallbackProtocolPdas.length > 0
          ? {
              type: "protocol",
              value: requestedProtocol ?? "unknown",
              rpcFallback: true
            }
          : { type: "capability", value: capability, rpcFallback: true };
  }

  const discoveries: SapToolDiscoveryResult[] = [];
  for (const agentPda of agentPdas.slice(0, maxResults)) {
    const identity =
      (await client.fetchAccount("agentAccount", agentPda)) ??
      (isPublicSolanaReadEndpoint(config.SAP_REGISTRY_ENDPOINT)
        ? null
        : await new sdk.SapClient({
            rpcUrl: PUBLIC_SOLANA_READ_RPC,
            commitment: "confirmed"
          }).fetchAccount("agentAccount", agentPda));
    if (!isRecord(identity)) {
      continue;
    }

    const pricing = mapPricing(identity.pricing);
    discoveries.push({
      mode: "real",
      toolId: publicKeyToString(agentPda) ?? "unknown-sap-agent",
      name: readString(identity, "name") ?? "SAP Agent",
      capability,
      protocol:
        readStringArray(identity.protocols)[0] ??
        query.protocol ??
        inferProtocolId(capability, []) ??
        "sap",
      endpoint:
        readString(identity, "x402Endpoint") ??
        readString(identity, "agentUri") ??
        config.SAP_REGISTRY_ENDPOINT,
      pricing,
      reputation: {
        score: readNumber(identity, "reputationScore") ?? 0,
        uptimeBps: Math.round((readNumber(identity, "uptimePercent") ?? 0) * 100),
        latencyMs: readNumber(identity, "avgLatencyMs") ?? 0,
        calls: readNumber(identity, "totalCallsServed") ?? 0
      },
      metadata: {
        sapAgentPda: publicKeyToString(agentPda),
        ownerWallet: publicKeyToString(identity.wallet),
        agentId: readString(identity, "agentId"),
        agentUri: readString(identity, "agentUri"),
        x402Endpoint: readString(identity, "x402Endpoint"),
        capabilities: toJsonValue(identity.capabilities),
        protocols: toJsonValue(identity.protocols),
        discoveryBasis,
        mock: false
      },
      discoveredAt: new Date().toISOString()
    });
  }

  const minScore = query.minReputationScore;
  return typeof minScore === "number"
    ? discoveries.filter((tool) => tool.reputation.score >= minScore)
    : discoveries;
}

export async function getAgentStatusWithOfficialSapSdk(
  config: SapOfficialConfig,
  agentId: string
): Promise<SapAgentStatus> {
  assertStatusConfig(config);

  const sdk = loadSapSdk();
  const { keypair, wallet } = buildWallet(config.SAP_PRIVATE_KEY);
  const client = new sdk.SapClient({
    rpcUrl: config.SAP_REGISTRY_ENDPOINT,
    wallet,
    commitment: "confirmed"
  });
  const agentPda = config.SAP_AGENT_ID || deriveOwnAgentPda(sdk, client, keypair.publicKey);
  const identity =
    (agentPda ? await fetchAgentAccountByPda(client, agentPda) : null) ??
    (await client.agent.fetchNullable?.());
  const stats =
    agentPda && client.agent.fetchStatsNullable
      ? await client.agent.fetchStatsNullable({ toBase58: () => agentPda })
      : null;

  if (!isRecord(identity)) {
    const accountExists = agentPda
      ? await fetchAccountInfoExists(client, agentPda)
      : false;

    return {
      mode: "real",
      agentId,
      registryEndpoint: config.SAP_REGISTRY_ENDPOINT,
      status: accountExists ? "active" : "unknown",
      capabilities: [],
      reputation: {
        score: 0,
        uptimeBps: 0,
        latencyMs: 0,
        calls: 0
      },
      lastSeenAt: new Date().toISOString()
    };
  }

  return {
    mode: "real",
    agentId: readString(identity, "agentId") ?? agentId,
    registryEndpoint: config.SAP_REGISTRY_ENDPOINT,
    status: readBoolean(identity, "isActive") ? "active" : "inactive",
    capabilities: readCapabilities(identity.capabilities),
    reputation: {
      score: readNumber(identity, "reputationScore") ?? 0,
      uptimeBps: Math.round((readNumber(identity, "uptimePercent") ?? 0) * 100),
      latencyMs: readNumber(identity, "avgLatencyMs") ?? 0,
      calls:
        readNumber(stats, "totalCallsServed") ??
        readNumber(identity, "totalCallsServed") ??
        0
    },
    lastSeenAt: new Date().toISOString()
  };
}

async function fetchAccountInfoExists(
  client: SapSdkClient,
  agentPda: string
): Promise<boolean> {
  const publicKey = publicKeyFromString(agentPda);
  if (!publicKey || !client.connection.getAccountInfo) {
    return false;
  }

  try {
    const accountInfo = await client.connection.getAccountInfo(publicKey, "confirmed");
    if (accountInfo) {
      return true;
    }
  } catch {
    // Fall through to a public read-only RPC fallback. Some local Windows TLS
    // stacks reject api.mainnet-beta.solana.com, while public JSON-RPC reads
    // still work and are enough for registration-existence proof.
  }

  return fetchAccountExistsViaPublicRpc(agentPda);
}

async function fetchAccountExistsViaPublicRpc(agentPda: string): Promise<boolean> {
  try {
    const response = await fetch("https://solana-rpc.publicnode.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [agentPda, { encoding: "base64" }]
      })
    });
    const payload = (await response.json()) as unknown;
    return (
      isRecord(payload) &&
      isRecord(payload.result) &&
      isRecord(payload.result.value)
    );
  } catch {
    return false;
  }
}

async function fetchAgentAccountByPda(
  client: SapSdkClient,
  agentPda: string
): Promise<unknown | null> {
  const publicKey = publicKeyFromString(agentPda);
  if (!publicKey) {
    return null;
  }

  try {
    return client.fetchAccount("agentAccount", publicKey);
  } catch {
    return null;
  }
}

function loadSapSdk(): SapSdkModule {
  const sdk = requireFromHere(SAP_SDK_PACKAGE) as SapSdkModule;
  if (typeof sdk.SapClient !== "function") {
    throw new Error(
      `Installed ${SAP_SDK_PACKAGE} does not expose SapClient. Reinstall the official SDK before using SAP real mode.`
    );
  }
  return sdk;
}

function readSapSdkPackageJson(): JsonRecord {
  const packageJsonPath = findPackageJsonPath();
  if (!packageJsonPath) {
    return {};
  }

  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as JsonRecord;
}

function findPackageJsonPath(): string | null {
  let current = path.dirname(requireFromHere.resolve(SAP_SDK_PACKAGE));

  while (current !== path.dirname(current)) {
    const candidate = path.join(current, "package.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    current = path.dirname(current);
  }

  return null;
}

function buildWallet(privateKey: string): {
  keypair: KeypairLike;
  wallet: unknown;
  ownerWallet: string;
} {
  const { Keypair } = requireFromHere("@solana/web3.js") as {
    Keypair: KeypairConstructor;
  };
  const { Wallet } = requireFromHere("@coral-xyz/anchor") as {
    Wallet: WalletConstructor;
  };
  const keypair = Keypair.fromSecretKey(parsePrivateKey(privateKey));
  return {
    keypair,
    wallet: new Wallet(keypair),
    ownerWallet: publicKeyToString(keypair.publicKey) ?? ""
  };
}

async function submitSapRegistration(
  sdk: SapSdkModule,
  client: SapSdkClient,
  keypair: KeypairLike,
  args: OfficialRegisterAgentArgs
): Promise<string> {
  if (typeof client.agent.register === "function") {
    return client.agent.register(args);
  }

  if (typeof client.agent.registerAgent !== "function") {
    throw new Error(
      `${SAP_SDK_PACKAGE} does not expose agent.register or agent.registerAgent. Current SDK exports are not compatible with registration.`
    );
  }

  const [agentPda] = deriveRequiredPda(sdk, "getAgentPDA", keypair.publicKey);
  const [agentStatsPda] = deriveAgentStatsPda(sdk, agentPda);
  const [globalRegistryPda] = deriveRequiredPda(sdk, "getGlobalPDA");
  const instruction = await client.agent.registerAgent({
    signer: keypair,
    wallet: keypair.publicKey,
    agent: agentPda,
    agentStats: agentStatsPda,
    globalRegistry: globalRegistryPda,
    ...args,
    agentId: args.agentId ?? null,
    agentUri: args.agentUri ?? null,
    x402Endpoint: args.x402Endpoint ?? null
  });
  const transaction = await client.buildTransaction([instruction], keypair.publicKey);
  transaction.sign?.([keypair]);
  return client.connection.sendTransaction(transaction, {
    preflightCommitment: "confirmed",
    maxRetries: 3
  });
}

function deriveAgentStatsPda(
  sdk: SapSdkModule,
  agentPda: PublicKeyLike
): readonly [PublicKeyLike, number] {
  const { PublicKey } = requireFromHere("@solana/web3.js") as {
    PublicKey: {
      new (value: string): PublicKeyLike;
      findProgramAddressSync: (
        seeds: readonly Uint8Array[],
        programId: PublicKeyLike
      ) => readonly [PublicKeyLike, number];
    };
  };
  const programId =
    typeof sdk.PROGRAM_ID === "string"
      ? new PublicKey(sdk.PROGRAM_ID)
      : sdk.PROGRAM_ID;
  if (!programId) {
    throw new Error(`${SAP_SDK_PACKAGE} is missing PROGRAM_ID.`);
  }

  const agentBuffer = agentPda.toBuffer?.();
  if (!agentBuffer) {
    throw new Error("Unable to derive SAP agent stats PDA because agent PDA is not buffer-convertible.");
  }

  // The on-chain v2 program derives AgentStats with ["sap_stats", agent_pda].
  // The SDK's top-level Pdas.getAgentStatsPDA currently derives from wallet,
  // so the integration boundary keeps the program-compatible derivation here.
  return PublicKey.findProgramAddressSync(
    [Buffer.from(sdk.SEEDS?.STATS ?? sdk.SEEDS?.AGENT_STATS ?? "sap_stats"), agentBuffer],
    programId
  );
}

function parsePrivateKey(privateKey: string): Uint8Array {
  const trimmed = privateKey.trim();
  if (!trimmed) {
    throw new Error("SAP_PRIVATE_KEY is empty.");
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (value) =>
          typeof value !== "number" || value < 0 || value > 255 || !Number.isInteger(value)
      )
    ) {
      throw new Error("SAP_PRIVATE_KEY JSON array must contain byte values 0-255.");
    }
    return Uint8Array.from(parsed);
  }

  if (trimmed.startsWith("base64:")) {
    return Uint8Array.from(Buffer.from(trimmed.slice("base64:".length), "base64"));
  }

  const bs58 = requireFromHere("bs58") as {
    decode?: (value: string) => Uint8Array;
    default?: { decode?: (value: string) => Uint8Array };
  };
  const decode = bs58.decode ?? bs58.default?.decode;
  if (!decode) {
    throw new Error("Unable to load bs58 decoder from installed dependencies.");
  }
  return decode(trimmed);
}

function buildRegisterArgs(
  config: SapOfficialConfig,
  metadata: SapAgentMetadata
): OfficialRegisterAgentArgs {
  const protocols = uniqueStrings(metadata.protocols);
  return {
    name: metadata.name,
    description: metadata.description,
    capabilities: uniqueStrings(metadata.capabilities).map((capability) => ({
      id: capability,
      description: null,
      protocolId: inferProtocolId(capability, protocols),
      version: metadata.version
    })),
    pricing: [],
    protocols,
    agentId: config.SAP_AGENT_ID || null,
    agentUri:
      metadata.metadataUri ??
      (config.AGENT_PUBLIC_URL || metadata.endpoint || null),
    x402Endpoint:
      metadata.x402Endpoint ??
      (config.AGENT_X402_ENDPOINT || metadata.endpoint || null)
  };
}

async function fetchAgentPdasForCapability(
  sdk: SapSdkModule,
  client: SapSdkClient,
  capability: string
): Promise<PublicKeyLike[]> {
  const getCapabilityIndexPDA = sdk.Pdas?.getCapabilityIndexPDA;
  if (!getCapabilityIndexPDA) {
    throw new Error(
      `${SAP_SDK_PACKAGE} did not expose Pdas.getCapabilityIndexPDA; cannot perform real SAP discovery.`
    );
  }

  const [indexPda] = getCapabilityIndexPDA(hashString(sdk, capability));
  const index = await client.fetchAccount("capabilityIndex", indexPda);
  if (!isRecord(index) || !Array.isArray(index.agents)) {
    return [];
  }

  return index.agents.filter(isPublicKeyLike);
}

async function fetchAgentPdasForProtocol(
  sdk: SapSdkModule,
  client: SapSdkClient,
  protocol: string
): Promise<PublicKeyLike[]> {
  const getProtocolIndexPDA = sdk.Pdas?.getProtocolIndexPDA;
  if (!getProtocolIndexPDA) {
    return [];
  }

  const [indexPda] = getProtocolIndexPDA(hashString(sdk, protocol));
  const index = await client.fetchAccount("protocolIndex", indexPda);
  if (!isRecord(index) || !Array.isArray(index.agents)) {
    return [];
  }

  return index.agents.filter(isPublicKeyLike);
}

function hashString(sdk: SapSdkModule, value: string): Uint8Array {
  const sdkHash = sdk.Utils?.sha256?.(value);
  if (sdkHash?.length === 32 && sdkHash.some((byte) => byte !== 0)) {
    return sdkHash;
  }

  // Some package builds expose Pdas.hashString but return an all-zero hash.
  // Use Node crypto as a deterministic fallback for real PDA discovery.
  return new Uint8Array(createHash("sha256").update(value).digest());
}

function normalizeProtocol(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  return value.trim().replace(/^sap:/i, "");
}

function isPublicSolanaReadEndpoint(value: string): boolean {
  return value.trim().replace(/\/$/, "") === PUBLIC_SOLANA_READ_RPC;
}

function deriveOwnAgentPda(
  sdk: SapSdkModule,
  client: SapSdkClient,
  wallet?: PublicKeyLike
): string | null {
  try {
    const [agentPda] =
      wallet && sdk.Pdas?.getAgentPDA
        ? sdk.Pdas.getAgentPDA(wallet)
        : client.agent.deriveAgent?.() ?? [];
    return publicKeyToString(agentPda);
  } catch {
    return null;
  }
}

function deriveRequiredPda(
  sdk: SapSdkModule,
  name: "getAgentPDA" | "getAgentStatsPDA",
  wallet: PublicKeyLike
): readonly [PublicKeyLike, number];
function deriveRequiredPda(
  sdk: SapSdkModule,
  name: "getGlobalPDA"
): readonly [PublicKeyLike, number];
function deriveRequiredPda(
  sdk: SapSdkModule,
  name: "getAgentPDA" | "getAgentStatsPDA" | "getGlobalPDA",
  wallet?: PublicKeyLike
): readonly [PublicKeyLike, number] {
  const derive = sdk.Pdas?.[name];
  if (!derive) {
    throw new Error(`${SAP_SDK_PACKAGE} is missing Pdas.${name}.`);
  }

  if (name === "getGlobalPDA") {
    return (derive as () => readonly [PublicKeyLike, number])();
  }

  if (!wallet) {
    throw new Error(`Pdas.${name} requires a wallet public key.`);
  }

  return (derive as (wallet: PublicKeyLike) => readonly [PublicKeyLike, number])(
    wallet
  );
}

function mapPricing(value: unknown): SapToolDiscoveryResult["pricing"] {
  if (!Array.isArray(value) || value.length === 0 || !isRecord(value[0])) {
    return {
      model: "unknown",
      amountUsdc: null
    };
  }

  const first = value[0];
  const rawPrice = readNumber(first, "pricePerCall");
  const decimals = readNumber(first, "tokenDecimals") ?? 6;
  return {
    model: rawPrice && rawPrice > 0 ? "x402" : "unknown",
    amountUsdc: rawPrice ? rawPrice / 10 ** decimals : null
  };
}

function assertReadConfig(config: SapOfficialConfig): void {
  const missing = config.SAP_REGISTRY_ENDPOINT.trim()
    ? []
    : ["SAP_REGISTRY_ENDPOINT"];

  if (missing.length > 0) {
    throw new Error(
      `SAP_MOCK_MODE=false requires ${missing.join(", ")} for real SAP discovery.`
    );
  }
}

function assertStatusConfig(config: SapOfficialConfig): void {
  assertReadConfig(config);
  if (!config.SAP_PRIVATE_KEY.trim()) {
    throw new Error(
      "SAP_MOCK_MODE=false status lookup for the local agent requires SAP_PRIVATE_KEY so the SDK can derive the owner wallet PDA."
    );
  }
}

function assertWriteConfig(config: SapOfficialConfig): void {
  assertStatusConfig(config);
  if (!config.SAP_ENABLE_MAINNET_WRITES) {
    throw new Error(
      "SAP real registration is wired to the official SDK, but SAP_ENABLE_MAINNET_WRITES=false. Set it to true only after adding a funded wallet and confirming you want to submit a mainnet transaction."
    );
  }
}

function inferProtocolId(capability: string, protocols: string[]): string | null {
  const namespace = capability.split(":")[0];
  if (namespace && protocols.includes(namespace)) {
    return namespace;
  }
  return protocols[0] ?? namespace ?? null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (isRecord(item) ? readString(item, "id") : null))
    .filter((item): item is string => Boolean(item));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === "string" && nested.trim().length > 0 ? nested : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = value[key];
  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested;
  }

  if (
    isRecord(nested) &&
    typeof nested.toString === "function" &&
    nested.constructor?.name === "BN"
  ) {
    const parsed = Number(nested.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof nested === "bigint") {
    return Number(nested);
  }

  return null;
}

function readBoolean(value: unknown, key: string): boolean {
  return isRecord(value) && value[key] === true;
}

function isPublicKeyLike(value: unknown): value is PublicKeyLike {
  return (
    isRecord(value) &&
    (typeof value.toBase58 === "function" ||
      (typeof value.toBuffer === "function" &&
        value.constructor?.name === "PublicKey"))
  );
}

function publicKeyToString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (isPublicKeyLike(value)) {
    return typeof value.toBase58 === "function"
      ? value.toBase58()
      : String(value.toString?.());
  }

  return null;
}

function publicKeyFromString(value: string): PublicKeyLike | null {
  try {
    const { PublicKey } = requireFromHere("@solana/web3.js") as {
      PublicKey: new (input: string) => PublicKeyLike;
    };
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  const publicKey = publicKeyToString(value);
  if (publicKey) {
    return publicKey;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (!isRecord(value)) {
    return String(value);
  }

  if (value.constructor?.name === "BN" && typeof value.toString === "function") {
    return value.toString();
  }

  const record: JsonRecord = {};
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested !== "function") {
      record[key] = toJsonValue(nested);
    }
  }
  return record;
}
