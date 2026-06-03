import type { AppConfig } from "../config/env";
import type { BalanceSummary } from "./balanceTypes";

const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDC_DECIMALS = 6;
const SOL_DECIMALS = 1_000_000_000;
const DEFAULT_ACE_SERVICES_PER_FULL_RUN = 3;

export async function getBalanceSummary(config: AppConfig): Promise<BalanceSummary> {
  const [ace, sentinel] = await Promise.all([
    getAceBalance(config),
    getSentinelBalance(config)
  ]);

  return {
    checkedAt: new Date().toISOString(),
    ace,
    sentinel
  };
}

async function getAceBalance(config: AppConfig): Promise<BalanceSummary["ace"]> {
  const walletAddress = normalizeEvmAddress(config.ACE_ACCOUNT_ID);
  const requiredUsdcForFullRun =
    config.ACE_X402_MAX_PAYMENT_USDC * DEFAULT_ACE_SERVICES_PER_FULL_RUN;

  if (!walletAddress || config.ACE_MOCK_MODE) {
    return {
      network: config.ACE_X402_NETWORK,
      walletAddress: walletAddress ?? null,
      usdcBalance: null,
      nativeBalance: null,
      requiredUsdcForFullRun,
      check: {
        status: config.ACE_MOCK_MODE ? "unconfigured" : "needs_funding",
        message: config.ACE_MOCK_MODE
          ? "Ace is in mock mode; no real x402 funding is needed."
          : "ACE_ACCOUNT_ID is missing or is not an EVM address."
      }
    };
  }

  try {
    const [nativeWeiHex, usdcRawHex] = await Promise.all([
      evmRpc(config.BASE_RPC_URL, "eth_getBalance", [walletAddress, "latest"]),
      evmRpc(config.BASE_RPC_URL, "eth_call", [
        {
          to: BASE_USDC_ADDRESS,
          data: buildErc20BalanceOfData(walletAddress)
        },
        "latest"
      ])
    ]);
    const nativeBalance = Number(BigInt(nativeWeiHex)) / 1e18;
    const usdcBalance = Number(BigInt(usdcRawHex)) / 10 ** BASE_USDC_DECIMALS;
    const hasEnoughUsdc = usdcBalance >= requiredUsdcForFullRun;
    const hasGas = nativeBalance > 0;

    return {
      network: config.ACE_X402_NETWORK,
      walletAddress,
      usdcBalance,
      nativeBalance,
      requiredUsdcForFullRun,
      check: {
        status: hasEnoughUsdc && hasGas ? "ready" : "needs_funding",
        message:
          hasEnoughUsdc && hasGas
            ? "Ace payer has enough USDC for the configured full-run cap and has native gas."
            : buildAceFundingMessage({
                usdcBalance,
                nativeBalance,
                requiredUsdcForFullRun
              })
      }
    };
  } catch (error) {
    return {
      network: config.ACE_X402_NETWORK,
      walletAddress,
      usdcBalance: null,
      nativeBalance: null,
      requiredUsdcForFullRun,
      check: {
        status: "error",
        message:
          error instanceof Error
            ? `Unable to read Base balances: ${error.message}`
            : "Unable to read Base balances."
      }
    };
  }
}

async function getSentinelBalance(
  config: AppConfig
): Promise<BalanceSummary["sentinel"]> {
  const walletAddress = config.SENTINEL_DEPOSITOR_WALLET.trim() || null;
  const minEscrowSol = config.SENTINEL_MIN_ESCROW_LAMPORTS / SOL_DECIMALS;

  if (!walletAddress || config.SENTINEL_MOCK_MODE) {
    return {
      network: "solana",
      walletAddress,
      solBalance: null,
      minEscrowSol,
      check: {
        status: config.SENTINEL_MOCK_MODE ? "unconfigured" : "needs_funding",
        message: config.SENTINEL_MOCK_MODE
          ? "Sentinel is in mock mode; no Solana escrow funding is needed."
          : "SENTINEL_DEPOSITOR_WALLET is missing."
      }
    };
  }

  try {
    const response = await fetchJsonRpc("https://solana-rpc.publicnode.com", {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [walletAddress]
    });
    const lamports = readNestedNumber(response, ["result", "value"]);
    if (lamports === null) {
      throw new Error("Solana RPC response did not include result.value.");
    }

    const solBalance = lamports / SOL_DECIMALS;
    return {
      network: "solana",
      walletAddress,
      solBalance,
      minEscrowSol,
      check: {
        status: solBalance >= minEscrowSol ? "ready" : "needs_funding",
        message:
          solBalance >= minEscrowSol
            ? "Sentinel depositor has enough SOL to maintain or top up the configured escrow minimum."
            : `Sentinel depositor needs at least ${minEscrowSol.toFixed(4)} SOL for the configured escrow minimum.`
      }
    };
  } catch (error) {
    return {
      network: "solana",
      walletAddress,
      solBalance: null,
      minEscrowSol,
      check: {
        status: "error",
        message:
          error instanceof Error
            ? `Unable to read Solana balance: ${error.message}`
            : "Unable to read Solana balance."
      }
    };
  }
}

async function evmRpc(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<string> {
  const payload = await fetchJsonRpc(rpcUrl, {
    jsonrpc: "2.0",
    id: 1,
    method,
    params
  });

  if (
    typeof payload === "object" &&
    payload !== null &&
    "result" in payload &&
    typeof payload.result === "string"
  ) {
    return payload.result;
  }

  throw new Error(`RPC ${method} did not return a hex result.`);
}

async function fetchJsonRpc(
  url: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const parsed = (await response.json()) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("RPC response was not an object.");
  }

  if (
    "error" in parsed &&
    typeof parsed.error === "object" &&
    parsed.error !== null
  ) {
    throw new Error(JSON.stringify(parsed.error));
  }

  return parsed as Record<string, unknown>;
}

function buildErc20BalanceOfData(address: string): string {
  return `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function normalizeEvmAddress(value: string): string | null {
  const trimmed = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : null;
}

function readNestedNumber(value: unknown, path: string[]): number | null {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function buildAceFundingMessage(input: {
  usdcBalance: number;
  nativeBalance: number;
  requiredUsdcForFullRun: number;
}): string {
  const needs: string[] = [];
  if (input.usdcBalance < input.requiredUsdcForFullRun) {
    needs.push(
      `${(input.requiredUsdcForFullRun - input.usdcBalance).toFixed(2)} more USDC on Base`
    );
  }

  if (input.nativeBalance <= 0) {
    needs.push("native ETH on Base for gas");
  }

  return `Ace payer needs ${needs.join(" and ")}.`;
}
