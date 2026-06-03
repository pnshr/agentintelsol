export interface BalanceCheck {
  status: "ready" | "needs_funding" | "unconfigured" | "error";
  message: string;
}

export interface AceBalance {
  network: string;
  walletAddress: string | null;
  usdcBalance: number | null;
  nativeBalance: number | null;
  requiredUsdcForFullRun: number;
  check: BalanceCheck;
}

export interface SentinelBalance {
  network: "solana";
  walletAddress: string | null;
  solBalance: number | null;
  minEscrowSol: number;
  check: BalanceCheck;
}

export interface BalanceSummary {
  checkedAt: string;
  ace: AceBalance;
  sentinel: SentinelBalance;
}
