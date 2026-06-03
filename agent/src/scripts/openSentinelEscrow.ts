import { createRequire } from "node:module";
import { loadConfig } from "../config/env";

const requireFromHere = createRequire(__filename);

interface PublicKeyLike {
  toBase58: () => string;
}

interface KeypairLike {
  publicKey: PublicKeyLike;
  secretKey: Uint8Array;
}

interface KeypairConstructor {
  fromSecretKey(secretKey: Uint8Array): KeypairLike;
}

interface PublicKeyConstructor {
  new (value: string): PublicKeyLike;
}

interface WalletConstructor {
  new (payer: KeypairLike): unknown;
}

interface SapClientLike {
  connection: {
    getBalance: (address: PublicKeyLike, commitment?: string) => Promise<number>;
    getAccountInfo: (
      address: PublicKeyLike,
      commitment?: string
    ) => Promise<{ lamports: number; data: Uint8Array } | null>;
  };
  fetchAccount?: (name: string, address: PublicKeyLike) => Promise<unknown | null>;
  program: {
    methods: {
      createEscrowV2: (...args: unknown[]) => RpcBuilderLike;
      depositEscrowV2: (...args: unknown[]) => RpcBuilderLike;
    };
  };
}

interface RpcBuilderLike {
  accounts: (accounts: Record<string, unknown>) => RpcBuilderLike;
  remainingAccounts: (accounts: unknown[]) => RpcBuilderLike;
  signers: (signers: KeypairLike[]) => RpcBuilderLike;
  rpc: () => Promise<string>;
}

interface SapSdkLike {
  SapClient: new (opts: {
    rpcUrl: string;
    wallet?: unknown;
    commitment?: "processed" | "confirmed" | "finalized";
  }) => SapClientLike;
  Pdas?: {
    getAgentPDA?: (wallet: PublicKeyLike) => readonly [PublicKeyLike, number];
  };
  Accounts?: {
    fetchEscrowAccountV2?: (
      connection: unknown,
      pubkey: PublicKeyLike
    ) => Promise<unknown | null>;
  };
}

interface BNConstructor {
  new (value: number | string | bigint): unknown;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const sdk = requireFromHere("@oobe-protocol-labs/synapse-sap-sdk") as SapSdkLike;
  const { Keypair, PublicKey } = requireFromHere("@solana/web3.js") as {
    Keypair: KeypairConstructor;
    PublicKey: PublicKeyConstructor;
  };
  const { Wallet, BN } = requireFromHere("@coral-xyz/anchor") as {
    Wallet: WalletConstructor;
    BN: BNConstructor;
  };

  if (!config.SAP_PRIVATE_KEY.trim()) {
    throw new Error("SAP_PRIVATE_KEY is required to open or top up Sentinel escrow.");
  }

  if (!config.SAP_REGISTRY_ENDPOINT.trim()) {
    throw new Error("SAP_REGISTRY_ENDPOINT is required for SAP escrow operations.");
  }

  const keypair = Keypair.fromSecretKey(parsePrivateKey(config.SAP_PRIVATE_KEY));
  const ownerWallet = keypair.publicKey.toBase58();
  if (
    config.SENTINEL_DEPOSITOR_WALLET &&
    ownerWallet !== config.SENTINEL_DEPOSITOR_WALLET
  ) {
    throw new Error(
      `SAP_PRIVATE_KEY derives ${ownerWallet}, but SENTINEL_DEPOSITOR_WALLET is ${config.SENTINEL_DEPOSITOR_WALLET}. Refusing to create escrow for the wrong depositor.`
    );
  }

  if (!sdk.Pdas?.getAgentPDA) {
    throw new Error("Installed SAP SDK does not expose Pdas.getAgentPDA.");
  }

  const client = new sdk.SapClient({
    rpcUrl: config.SAP_REGISTRY_ENDPOINT,
    wallet: new Wallet(keypair),
    commitment: "confirmed"
  });
  const merchantWallet = new PublicKey(config.SENTINEL_MERCHANT_WALLET);
  const systemProgram = new PublicKey("11111111111111111111111111111111");
  const [sentinelAgentPda] = sdk.Pdas.getAgentPDA(merchantWallet);
  const [escrowPda] = deriveEscrowV2Pda(
    sdk,
    sentinelAgentPda,
    keypair.publicKey,
    config.SENTINEL_ESCROW_NONCE,
    PublicKey,
    BN
  );
  const nonce = config.SENTINEL_ESCROW_NONCE;
  const targetDeposit = config.SENTINEL_ESCROW_DEPOSIT_LAMPORTS;
  const ownerBalance = await client.connection.getBalance(keypair.publicKey, "confirmed");
  const existing = await fetchEscrowNullable(sdk, client, escrowPda);
  const existingBalance = readBnLike(existing, "balance") ?? 0;
  const topUpAmount = Math.max(0, targetDeposit - existingBalance);

  const summary = {
    writeEnabled: config.SENTINEL_OPEN_ESCROW_WRITE,
    ownerWallet,
    ownerBalanceLamports: ownerBalance,
    ownerBalanceSol: ownerBalance / 1_000_000_000,
    sentinelMerchantWallet: config.SENTINEL_MERCHANT_WALLET,
    sentinelAgentPda: sentinelAgentPda.toBase58(),
    escrowPda: escrowPda.toBase58(),
    arbiterWallet: ownerWallet,
    escrowNonce: nonce,
    targetDepositLamports: targetDeposit,
    existingEscrowFound: Boolean(existing),
    existingEscrowBalanceLamports: existingBalance,
    topUpAmountLamports: topUpAmount,
    pricePerCallLamports: 1000,
    maxCalls: Math.floor(targetDeposit / 1000),
    dryRunNote:
      "Default mode does not send a transaction. Set SENTINEL_OPEN_ESCROW_WRITE=true only when you intentionally want to spend SOL."
  };

  if (!config.SENTINEL_OPEN_ESCROW_WRITE) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (targetDeposit < config.SENTINEL_MIN_ESCROW_LAMPORTS) {
    throw new Error(
      `SENTINEL_ESCROW_DEPOSIT_LAMPORTS must be at least ${config.SENTINEL_MIN_ESCROW_LAMPORTS}.`
    );
  }

  if (!existing) {
    const txSignature = await client.program.methods
      .createEscrowV2(
        new BN(nonce),
        new BN(1000),
        new BN(Math.floor(targetDeposit / 1000)),
        new BN(targetDeposit),
        new BN(0),
        [],
        null,
        9,
        2,
        new BN(2160),
        null,
        keypair.publicKey
      )
      .accounts({
        depositor: keypair.publicKey,
        agent: sentinelAgentPda,
        escrow: escrowPda,
        systemProgram
      })
      .remainingAccounts([])
      .signers([keypair])
      .rpc();
    console.log(JSON.stringify({ ...summary, action: "created", txSignature }, null, 2));
    return;
  }

  if (topUpAmount > 0) {
    const txSignature = await client.program.methods
      .depositEscrowV2(new BN(nonce), new BN(topUpAmount))
      .accounts({
        depositor: keypair.publicKey,
        escrow: escrowPda,
        systemProgram
      })
      .remainingAccounts([])
      .signers([keypair])
      .rpc();
    console.log(JSON.stringify({ ...summary, action: "topped_up", txSignature }, null, 2));
    return;
  }

  console.log(JSON.stringify({ ...summary, action: "already_funded" }, null, 2));
}

function deriveEscrowV2Pda(
  sdk: SapSdkLike,
  agentPda: PublicKeyLike,
  depositor: PublicKeyLike,
  nonce: number,
  PublicKey: PublicKeyConstructor & {
    findProgramAddressSync?: (
      seeds: readonly Uint8Array[],
      programId: PublicKeyLike
    ) => readonly [PublicKeyLike, number];
  },
  BN: BNConstructor
): readonly [PublicKeyLike, number] {
  const programId = new PublicKey(readProgramId(sdk));
  if (!PublicKey.findProgramAddressSync) {
    throw new Error("@solana/web3.js PublicKey.findProgramAddressSync is unavailable.");
  }
  const nonceBuffer = bnToBufferLe(new BN(nonce), 8);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("sap_escrow_v2"),
      publicKeyBuffer(agentPda),
      publicKeyBuffer(depositor),
      nonceBuffer
    ],
    programId
  );
}

async function fetchEscrowNullable(
  sdk: SapSdkLike,
  client: SapClientLike,
  escrowPda: PublicKeyLike
): Promise<unknown | null> {
  if (client.fetchAccount) {
    const account = await client.fetchAccount("escrowAccountV2", escrowPda);
    if (account) {
      return account;
    }
  }

  if (sdk.Accounts?.fetchEscrowAccountV2) {
    try {
      return await sdk.Accounts.fetchEscrowAccountV2(client.connection, escrowPda);
    } catch (error) {
      const rawAccount = await client.connection.getAccountInfo(escrowPda, "confirmed");
      if (!rawAccount) {
        return null;
      }

      return {
        parserWarning:
          error instanceof Error ? error.message : "Unable to parse escrow account",
        rawAccountLamports: rawAccount.lamports,
        rawAccountDataLength: rawAccount.data.length
      };
    }
  }

  const rawAccount = await client.connection.getAccountInfo(escrowPda, "confirmed");
  return rawAccount
    ? {
        rawAccountLamports: rawAccount.lamports,
        rawAccountDataLength: rawAccount.data.length
      }
    : null;
}

function readProgramId(sdk: SapSdkLike): string {
  const value = (sdk as unknown as { PROGRAM_ID?: unknown }).PROGRAM_ID;
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toBase58" in value &&
    typeof value.toBase58 === "function"
  ) {
    return value.toBase58();
  }

  throw new Error("Installed SAP SDK does not expose PROGRAM_ID.");
}

function publicKeyBuffer(publicKey: PublicKeyLike): Buffer {
  const maybeBuffer = (publicKey as unknown as { toBuffer?: () => Buffer }).toBuffer?.();
  if (!maybeBuffer) {
    throw new Error(`Public key ${publicKey.toBase58()} cannot be converted to a buffer.`);
  }
  return maybeBuffer;
}

function bnToBufferLe(value: unknown, bytes: number): Buffer {
  if (
    typeof value === "object" &&
    value !== null &&
    "toArrayLike" in value &&
    typeof value.toArrayLike === "function"
  ) {
    return value.toArrayLike(Buffer, "le", bytes);
  }

  const output = Buffer.alloc(bytes);
  output.writeBigUInt64LE(BigInt(String(value)));
  return output;
}

function parsePrivateKey(privateKey: string): Uint8Array {
  const trimmed = privateKey.trim();

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

function readBnLike(value: unknown, key: string): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const nested = (value as Record<string, unknown>)[key];
  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested;
  }

  if (typeof nested === "bigint") {
    return Number(nested);
  }

  if (
    typeof nested === "object" &&
    nested !== null &&
    "toString" in nested &&
    typeof nested.toString === "function"
  ) {
    const parsed = Number(nested.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
