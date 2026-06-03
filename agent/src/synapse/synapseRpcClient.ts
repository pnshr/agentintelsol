import { PublicKey } from "@solana/web3.js";

import type { AppConfig } from "../config/env";
import type { JsonRecord, JsonValue } from "../types/json";
import {
  mockId,
  mockSolanaSignature,
  nowIso,
  numberFromHash
} from "../utils/mockData";
import type {
  AccountInfo,
  RecentTransfer,
  SynapseRpcConfig,
  SynapseRpcEnvelope,
  TokenHolder,
  TokenMetadata,
  TokenSupply,
  WalletTransaction
} from "./synapseTypes";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const METAPLEX_TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export class SynapseRpcClient {
  private readonly config: SynapseRpcConfig;

  public constructor(
    config: Pick<AppConfig, "SYNAPSE_RPC_URL" | "SYNAPSE_API_KEY" | "SYNAPSE_MOCK_MODE">
  ) {
    this.config = {
      rpcUrl: config.SYNAPSE_RPC_URL,
      apiKey: config.SYNAPSE_API_KEY,
      mockMode: config.SYNAPSE_MOCK_MODE
    };
  }

  public async getTokenMetadata(
    mintAddress: string
  ): Promise<SynapseRpcEnvelope<TokenMetadata>> {
    if (!this.config.mockMode) {
      try {
        const accountInfo = await this.requestRpc<RealAccountInfoResult>(
          "getAccountInfo",
          [
            mintAddress,
            {
              encoding: "base64",
              commitment: "confirmed"
            }
          ]
        );
        const parsedMint = parseSplMintAccount(accountInfo.value);
        const metaplexMetadata = await this.tryGetMetaplexTokenMetadata(
          mintAddress
        );
        const metadata = metaplexMetadata.ok ? metaplexMetadata.data : null;

        return wrapReal("getTokenMetadata", { mintAddress }, accountInfo, {
          mintAddress,
          name: metadata?.name ?? "",
          symbol: metadata?.symbol ?? "",
          uri: metadata?.uri ?? null,
          decimals: parsedMint.decimals,
          mintAuthority: parsedMint.mintAuthority,
          freezeAuthority: parsedMint.freezeAuthority,
          updateAuthority: metadata?.updateAuthority ?? null,
          metadataAddress: metadata?.metadataAddress ?? null
        });
      } catch (error) {
        const supply = await this.tryRequestRpc<RealTokenSupplyResult>(
          "getTokenSupply",
          [
            mintAddress,
            {
              commitment: "confirmed"
            }
          ]
        );

        return wrapReal(
          "getTokenMetadata",
          { mintAddress },
          {
            error: errorMessage(error),
            fallback: supply.ok
              ? "Used getTokenSupply decimals after getAccountInfo failed."
              : "Metadata unavailable after getAccountInfo failed.",
            fallbackSupply: supply.ok ? supply.result : null,
            fallbackError: supply.ok ? null : supply.error
          },
          {
            mintAddress,
            name: "",
            symbol: "",
            uri: null,
            decimals: supply.ok ? supply.result.value.decimals : 0,
            mintAuthority: null,
            freezeAuthority: null,
            updateAuthority: null,
            metadataAddress: null
          }
        );
      }
    }

    const decimals = numberFromHash(`${mintAddress}:decimals`, 6, 9);
    const authoritySeed = numberFromHash(`${mintAddress}:authority`, 0, 100);
    const data: TokenMetadata = {
      mintAddress,
      name: `Mock Token ${mintAddress.slice(0, 4).toUpperCase()}`,
      symbol: `M${mintAddress.slice(0, 3).toUpperCase()}`,
      uri: `https://metadata.mock.agentintel.local/${mintAddress}.json`,
      decimals,
      mintAuthority:
        authoritySeed > 35 ? mockAddress("mint-authority", mintAddress) : null,
      freezeAuthority:
        authoritySeed > 70 ? mockAddress("freeze-authority", mintAddress) : null,
      updateAuthority: mockAddress("update-authority", mintAddress),
      metadataAddress: mockAddress("metadata", mintAddress)
    };

    return wrap("getTokenMetadata", { mintAddress }, data);
  }

  public async getTokenSupply(
    mintAddress: string
  ): Promise<SynapseRpcEnvelope<TokenSupply>> {
    if (!this.config.mockMode) {
      const result = await this.requestRpc<RealTokenSupplyResult>("getTokenSupply", [
        mintAddress,
        {
          commitment: "confirmed"
        }
      ]);
      const value = result.value;

      return wrapReal("getTokenSupply", { mintAddress }, result, {
        mintAddress,
        amount: value.amount,
        decimals: value.decimals,
        uiAmount: value.uiAmount ?? 0,
        uiAmountString: value.uiAmountString,
        slot: result.context.slot
      });
    }

    const decimals = numberFromHash(`${mintAddress}:decimals`, 6, 9);
    const uiAmount = numberFromHash(`${mintAddress}:supply`, 5_000_000, 950_000_000);
    const amount = BigInt(uiAmount) * 10n ** BigInt(decimals);

    return wrap("getTokenSupply", { mintAddress }, {
      mintAddress,
      amount: amount.toString(),
      decimals,
      uiAmount,
      uiAmountString: uiAmount.toLocaleString("en-US"),
      slot: numberFromHash(`${mintAddress}:slot`, 280_000_000, 390_000_000)
    });
  }

  public async getTopHolders(
    mintAddress: string
  ): Promise<SynapseRpcEnvelope<TokenHolder[]>> {
    if (!this.config.mockMode) {
      try {
        const largestAccounts = await this.requestRpc<RealLargestAccountsResult>(
          "getTokenLargestAccounts",
          [
            mintAddress,
            {
              commitment: "confirmed"
            }
          ]
        );
        const supply = await this.requestRpc<RealTokenSupplyResult>("getTokenSupply", [
          mintAddress,
          {
            commitment: "confirmed"
          }
        ]);
        const tokenAccounts = largestAccounts.value.map((account) => account.address);
        const owners = await this.getTokenAccountOwners(tokenAccounts);
        const totalSupply = Number(supply.value.uiAmount ?? 0);

        const holders = largestAccounts.value.map((account, index) => ({
          rank: index + 1,
          owner: owners.get(account.address) ?? "unknown",
          tokenAccount: account.address,
          amount: account.amount,
          uiAmount: account.uiAmount ?? 0,
          percentage:
            totalSupply > 0 && account.uiAmount !== null
              ? Number(((account.uiAmount / totalSupply) * 100).toFixed(4))
              : 0
        }));

        return wrapReal(
          "getTopHolders",
          { mintAddress },
          {
            largestAccounts,
            supply,
            ownerResolution: "getMultipleAccounts(jsonParsed)"
          },
          holders
        );
      } catch (error) {
        return wrapReal(
          "getTopHolders",
          { mintAddress },
          {
            error: errorMessage(error),
            fallback: "Holder data unavailable from Synapse RPC for this run."
          },
          []
        );
      }
    }

    const holders: TokenHolder[] = Array.from({ length: 10 }, (_, index) => {
      const rank = index + 1;
      const percentage = Number(
        Math.max(0.8, 28 / rank + numberFromHash(`${mintAddress}:${rank}`, 0, 80) / 100).toFixed(2)
      );

      return {
        rank,
        owner: mockAddress(`holder-owner-${rank}`, mintAddress),
        tokenAccount: mockAddress(`holder-token-account-${rank}`, mintAddress),
        amount: String(numberFromHash(`${mintAddress}:holder:${rank}`, 10_000, 90_000_000)),
        uiAmount: numberFromHash(`${mintAddress}:holder-ui:${rank}`, 1_000, 5_000_000),
        percentage
      };
    });

    return wrap("getTopHolders", { mintAddress }, holders);
  }

  public async getRecentTransfers(
    address: string
  ): Promise<SynapseRpcEnvelope<RecentTransfer[]>> {
    if (!this.config.mockMode) {
      const signaturesResult = await this.tryGetSignaturesForAddress(address, 8);
      if (!signaturesResult.ok) {
        return wrapReal(
          "getRecentTransfers",
          { address },
          {
            error: signaturesResult.error,
            fallback: "Recent transfers unavailable because signature lookup failed."
          },
          []
        );
      }

      const signatures = signaturesResult.result;
      const transactions = await Promise.all(
        signatures.map(async (signature) => ({
          signature,
          transaction: await this.tryGetParsedTransaction(signature.signature)
        }))
      );
      const transfers = transactions
        .filter(
          (
            item
          ): item is { signature: RealSignatureInfo; transaction: RealParsedTransaction } =>
            Boolean(item.transaction)
        )
        .map((item) =>
          mapTransactionToRecentTransfer(
            address,
            item.signature.signature,
            item.transaction
          )
        );

      return wrapReal(
        "getRecentTransfers",
        { address },
        {
          signatures,
          transactionCount: transactions.length,
          transactionErrors: transactions.filter((item) => !item.transaction).length
        },
        transfers
      );
    }

    const transfers: RecentTransfer[] = Array.from({ length: 8 }, (_, index) => ({
      signature: mockSolanaSignature({ address, index, type: "transfer" }),
      slot: numberFromHash(`${address}:transfer-slot:${index}`, 300_000_000, 390_000_000),
      blockTime: new Date(Date.now() - index * 45 * 60 * 1000).toISOString(),
      source: index % 2 === 0 ? address : mockAddress(`transfer-source-${index}`, address),
      destination:
        index % 2 === 0 ? mockAddress(`transfer-destination-${index}`, address) : address,
      mint: mockAddress(`transfer-mint-${index}`, address),
      amount: numberFromHash(`${address}:transfer-amount:${index}`, 1, 80_000),
      status: "finalized"
    }));

    return wrap("getRecentTransfers", { address }, transfers);
  }

  public async getWalletTransactions(
    walletAddress: string
  ): Promise<SynapseRpcEnvelope<WalletTransaction[]>> {
    if (!this.config.mockMode) {
      const signaturesResult = await this.tryGetSignaturesForAddress(walletAddress, 12);
      if (!signaturesResult.ok) {
        return wrapReal(
          "getWalletTransactions",
          { walletAddress },
          {
            error: signaturesResult.error,
            fallback: "Wallet transactions unavailable because signature lookup failed."
          },
          []
        );
      }

      const signatures = signaturesResult.result;
      const transactions = await Promise.all(
        signatures.map(async (signature) => ({
          signature,
          transaction: await this.tryGetParsedTransaction(signature.signature)
        }))
      );
      const walletTransactions = transactions
        .filter(
          (
            item
          ): item is { signature: RealSignatureInfo; transaction: RealParsedTransaction } =>
            Boolean(item.transaction)
        )
        .map((item) =>
          mapParsedWalletTransaction(
            item.signature.signature,
            item.transaction
          )
        );

      return wrapReal(
        "getWalletTransactions",
        { walletAddress },
        {
          signatures,
          transactionCount: transactions.length,
          transactionErrors: transactions.filter((item) => !item.transaction).length
        },
        walletTransactions
      );
    }

    const transactions: WalletTransaction[] = Array.from({ length: 12 }, (_, index) => ({
      signature: mockSolanaSignature({ walletAddress, index, type: "wallet_tx" }),
      slot: numberFromHash(`${walletAddress}:tx-slot:${index}`, 300_000_000, 390_000_000),
      blockTime: new Date(Date.now() - index * 30 * 60 * 1000).toISOString(),
      feeLamports: numberFromHash(`${walletAddress}:fee:${index}`, 5000, 25000),
      programIds: [
        "11111111111111111111111111111111",
        mockAddress(`program-${index}`, walletAddress)
      ],
      tokenMints: [mockAddress(`wallet-mint-${index}`, walletAddress)],
      status: index % 11 === 0 ? "confirmed" : "finalized"
    }));

    return wrap("getWalletTransactions", { walletAddress }, transactions);
  }

  public async getAccountInfo(
    address: string
  ): Promise<SynapseRpcEnvelope<AccountInfo>> {
    if (!this.config.mockMode) {
      try {
        const result = await this.requestRpc<RealAccountInfoResult>("getAccountInfo", [
          address,
          {
            encoding: "base64",
            commitment: "confirmed"
          }
        ]);
        const value = result.value;

        return wrapReal("getAccountInfo", { address }, result, {
          address,
          executable: value?.executable ?? false,
          lamports: value?.lamports ?? 0,
          ownerProgram: value?.owner ?? "unknown",
          rentEpoch: value?.rentEpoch ?? null,
          dataLength: getAccountDataLength(value)
        });
      } catch (error) {
        return wrapReal(
          "getAccountInfo",
          { address },
          {
            error: errorMessage(error),
            fallback: "Account info unavailable from Synapse RPC for this run."
          },
          {
            address,
            executable: false,
            lamports: 0,
            ownerProgram: "unavailable",
            rentEpoch: null,
            dataLength: 0
          }
        );
      }
    }

    return wrap("getAccountInfo", { address }, {
      address,
      executable: false,
      lamports: numberFromHash(`${address}:lamports`, 1_000_000, 90_000_000_000),
      ownerProgram: mockAddress("owner-program", address),
      rentEpoch: null,
      dataLength: numberFromHash(`${address}:data-length`, 0, 512)
    });
  }

  private async requestRpc<T>(method: string, params: unknown[]): Promise<T> {
    if (!this.config.rpcUrl.trim()) {
      throw new Error(
        "SYNAPSE_RPC_URL is required when SYNAPSE_MOCK_MODE=false."
      );
    }

    const response = await fetch(this.config.rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey
          ? {
              Authorization: `Bearer ${this.config.apiKey}`,
              "X-API-Key": this.config.apiKey
            }
          : {})
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: mockId("synapse_rpc", { method, params, at: Date.now() }, 10),
        method,
        params
      })
    });

    const text = await response.text();
    const payload = parseRpcPayload<T>(text);

    if (!response.ok) {
      throw new Error(
        `Synapse RPC ${method} HTTP ${response.status}: ${
          payload.error?.message ?? response.statusText
        }`
      );
    }

    if (payload.error || payload.result === undefined) {
      throw new Error(
        `Synapse RPC ${method} failed: ${
          payload.error?.message ?? response.statusText
        }`
      );
    }

    return payload.result;
  }

  private async tryRequestRpc<T>(
    method: string,
    params: unknown[]
  ): Promise<
    | { ok: true; result: T }
    | { ok: false; error: string }
  > {
    try {
      return {
        ok: true,
        result: await this.requestRpc<T>(method, params)
      };
    } catch (error) {
      return {
        ok: false,
        error: errorMessage(error)
      };
    }
  }

  private async tryGetSignaturesForAddress(
    address: string,
    limit: number
  ): Promise<
    | { ok: true; result: RealSignatureInfo[] }
    | { ok: false; error: string }
  > {
    return this.tryRequestRpc<RealSignatureInfo[]>("getSignaturesForAddress", [
      address,
      {
        limit,
        commitment: "confirmed"
      }
    ]);
  }

  private async tryGetParsedTransaction(
    signature: string
  ): Promise<RealParsedTransaction | null> {
    const result = await this.tryRequestRpc<RealParsedTransaction | null>(
      "getTransaction",
      [
        signature,
        {
          encoding: "jsonParsed",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        }
      ]
    );

    return result.ok ? result.result : null;
  }
  private async getSignaturesForAddress(
    address: string,
    limit: number
  ): Promise<RealSignatureInfo[]> {
    return this.requestRpc<RealSignatureInfo[]>("getSignaturesForAddress", [
      address,
      {
        limit,
        commitment: "confirmed"
      }
    ]);
  }

  private async getParsedTransaction(
    signature: string
  ): Promise<RealParsedTransaction | null> {
    return this.requestRpc<RealParsedTransaction | null>("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      }
    ]);
  }

  private async getTokenAccountOwners(
    tokenAccounts: string[]
  ): Promise<Map<string, string>> {
    if (tokenAccounts.length === 0) {
      return new Map();
    }

    const result = await this.requestRpc<RealMultipleAccountsResult>(
      "getMultipleAccounts",
      [
        tokenAccounts,
        {
          encoding: "jsonParsed",
          commitment: "confirmed"
        }
      ]
    );
    const owners = new Map<string, string>();

    result.value.forEach((account, index) => {
      const tokenAccount = tokenAccounts[index];
      const owner = account?.data?.parsed?.info?.owner;

      if (tokenAccount && typeof owner === "string") {
        owners.set(tokenAccount, owner);
      }
    });

    return owners;
  }

  private async tryGetMetaplexTokenMetadata(
    mintAddress: string
  ): Promise<
    | {
        ok: true;
        data: {
          name: string;
          symbol: string;
          uri: string | null;
          updateAuthority: string | null;
          metadataAddress: string;
        };
      }
    | { ok: false; error: string }
  > {
    try {
      const mintPublicKey = new PublicKey(mintAddress);
      const [metadataPublicKey] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METAPLEX_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintPublicKey.toBuffer()
        ],
        METAPLEX_TOKEN_METADATA_PROGRAM_ID
      );
      const result = await this.requestRpc<RealAccountInfoResult>("getAccountInfo", [
        metadataPublicKey.toBase58(),
        {
          encoding: "base64",
          commitment: "confirmed"
        }
      ]);

      return {
        ok: true,
        data: parseMetaplexMetadataAccount(
          result.value,
          metadataPublicKey.toBase58()
        )
      };
    } catch (error) {
      return {
        ok: false,
        error: errorMessage(error)
      };
    }
  }
}

function parseRpcPayload<T>(text: string): {
  result?: T;
  error?: { code?: number; message?: string; data?: unknown };
} {
  try {
    return JSON.parse(text) as {
      result?: T;
      error?: { code?: number; message?: string; data?: unknown };
    };
  } catch {
    return {
      error: {
        message: text.slice(0, 200) || "Non-JSON RPC response"
      }
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wrap<T>(
  method: string,
  params: JsonRecord,
  data: T
): SynapseRpcEnvelope<T> {
  return {
    mode: "mock",
    source: "synapse_rpc",
    fetchedAt: nowIso(),
    rawResponse: {
      mock: true,
      method,
      params,
      note: "Mock Synapse RPC response; no network call was made."
    },
    data
  };
}

function wrapReal<T>(
  method: string,
  params: JsonRecord,
  result: unknown,
  data: T
): SynapseRpcEnvelope<T> {
  return {
    mode: "real",
    source: "synapse_rpc",
    fetchedAt: nowIso(),
    rawResponse: {
      mock: false,
      method,
      params,
      result: toJsonValue(result)
    },
    data
  };
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

function parseSplMintAccount(value: RealAccountInfo | null): {
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
} {
  if (!value) {
    return {
      decimals: 0,
      mintAuthority: null,
      freezeAuthority: null
    };
  }

  const rawData = Array.isArray(value.data) ? value.data[0] : value.data;
  const buffer =
    typeof rawData === "string" ? Buffer.from(rawData, "base64") : Buffer.alloc(0);

  if (buffer.length < 82) {
    return {
      decimals: 0,
      mintAuthority: null,
      freezeAuthority: null
    };
  }

  const mintAuthorityOption = buffer.readUInt32LE(0);
  const freezeAuthorityOption = buffer.readUInt32LE(46);

  return {
    decimals: buffer.readUInt8(44),
    mintAuthority:
      mintAuthorityOption === 0 ? null : encodeBase58(buffer.subarray(4, 36)),
    freezeAuthority:
      freezeAuthorityOption === 0 ? null : encodeBase58(buffer.subarray(50, 82))
  };
}

function parseMetaplexMetadataAccount(
  value: RealAccountInfo | null,
  metadataAddress: string
): {
  name: string;
  symbol: string;
  uri: string | null;
  updateAuthority: string | null;
  metadataAddress: string;
} {
  const rawData = value && Array.isArray(value.data) ? value.data[0] : value?.data;
  const buffer =
    typeof rawData === "string" ? Buffer.from(rawData, "base64") : Buffer.alloc(0);

  if (buffer.length < 65) {
    return {
      name: "",
      symbol: "",
      uri: null,
      updateAuthority: null,
      metadataAddress
    };
  }

  const updateAuthority = new PublicKey(buffer.subarray(1, 33)).toBase58();
  let offset = 65;
  const name = readBorshString(buffer, offset);
  offset = name.nextOffset;
  const symbol = readBorshString(buffer, offset);
  offset = symbol.nextOffset;
  const uri = readBorshString(buffer, offset);

  return {
    name: cleanMetadataString(name.value),
    symbol: cleanMetadataString(symbol.value),
    uri: cleanMetadataString(uri.value) || null,
    updateAuthority,
    metadataAddress
  };
}

function readBorshString(
  buffer: Buffer,
  offset: number
): { value: string; nextOffset: number } {
  if (offset + 4 > buffer.length) {
    return { value: "", nextOffset: buffer.length };
  }

  const length = buffer.readUInt32LE(offset);
  const valueStart = offset + 4;
  const valueEnd = Math.min(valueStart + length, buffer.length);

  return {
    value: buffer.subarray(valueStart, valueEnd).toString("utf8"),
    nextOffset: valueEnd
  };
}

function cleanMetadataString(value: string): string {
  return value.replace(/\0/g, "").trim();
}

function getAccountDataLength(value: RealAccountInfo | null): number {
  if (!value) {
    return 0;
  }

  const rawData = Array.isArray(value.data) ? value.data[0] : value.data;

  if (typeof rawData !== "string") {
    return 0;
  }

  return Buffer.byteLength(rawData, "base64");
}

function mapParsedWalletTransaction(
  signature: string,
  transaction: RealParsedTransaction
): WalletTransaction {
  return {
    signature,
    slot: transaction.slot,
    blockTime: blockTimeToIso(transaction.blockTime),
    feeLamports: transaction.meta?.fee ?? 0,
    programIds: extractProgramIds(transaction),
    tokenMints: extractTokenMints(transaction),
    status: transaction.meta?.err ? "failed" : "finalized"
  };
}

function mapTransactionToRecentTransfer(
  address: string,
  signature: string,
  transaction: RealParsedTransaction
): RecentTransfer {
  const tokenBalance = [
    ...(transaction.meta?.postTokenBalances ?? []),
    ...(transaction.meta?.preTokenBalances ?? [])
  ].find((balance) => balance.owner === address || balance.mint === address);

  return {
    signature,
    slot: transaction.slot,
    blockTime: blockTimeToIso(transaction.blockTime),
    source: address,
    destination: "unknown",
    mint: tokenBalance?.mint ?? null,
    amount: tokenBalance?.uiTokenAmount?.uiAmount ?? null,
    status: transaction.meta?.err ? "failed" : "finalized"
  };
}

function blockTimeToIso(blockTime: number | null | undefined): string {
  return blockTime ? new Date(blockTime * 1000).toISOString() : nowIso();
}

function extractProgramIds(transaction: RealParsedTransaction): string[] {
  const instructions = transaction.transaction.message.instructions ?? [];
  const ids = instructions
    .map((instruction) => instruction.programId)
    .filter((programId): programId is string => typeof programId === "string");

  return Array.from(new Set(ids));
}

function extractTokenMints(transaction: RealParsedTransaction): string[] {
  const balances = [
    ...(transaction.meta?.preTokenBalances ?? []),
    ...(transaction.meta?.postTokenBalances ?? [])
  ];
  const mints = balances
    .map((balance) => balance.mint)
    .filter((mint): mint is string => typeof mint === "string");

  return Array.from(new Set(mints));
}

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "";
  }

  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;

    for (let index = 0; index < digits.length; index += 1) {
      const value = (digits[index] ?? 0) * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }

    digits.push(0);
  }

  return digits
    .reverse()
    .map((digit) => BASE58_ALPHABET[digit] ?? "1")
    .join("");
}

function mockAddress(label: string, input: string): string {
  return mockId("sol", { label, input }, 40).replace("sol_", "").padEnd(44, "1");
}

interface RealAccountInfoResult {
  context: {
    slot: number;
  };
  value: RealAccountInfo | null;
}

interface RealAccountInfo {
  data: string | [string, string];
  executable: boolean;
  lamports: number;
  owner: string;
  rentEpoch?: number;
}

interface RealTokenSupplyResult {
  context: {
    slot: number;
  };
  value: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

interface RealLargestAccountsResult {
  context: {
    slot: number;
  };
  value: Array<{
    address: string;
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  }>;
}

interface RealMultipleAccountsResult {
  context: {
    slot: number;
  };
  value: Array<{
    data?: {
      parsed?: {
        info?: {
          owner?: unknown;
        };
      };
    };
  } | null>;
}

interface RealSignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus?: string;
}

interface RealParsedTransaction {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preTokenBalances?: RealTokenBalance[];
    postTokenBalances?: RealTokenBalance[];
  } | null;
  transaction: {
    signatures: string[];
    message: {
      instructions?: Array<{
        programId?: string;
      }>;
    };
  };
}

interface RealTokenBalance {
  mint: string;
  owner?: string;
  uiTokenAmount?: {
    uiAmount: number | null;
  };
}
