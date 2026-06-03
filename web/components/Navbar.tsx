import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  ExternalLink,
  Menu,
  Orbit,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
  Zap
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/src/api";
import { formatTokenAmount, shortId } from "@/src/format";
import type { BalanceSummary, PageKey } from "@/src/types";

const navItems: Array<{ label: string; page: PageKey }> = [
  { label: "Agent", page: "home" },
  { label: "Analysis", page: "new-analysis" },
  { label: "Runs", page: "runs" },
  { label: "Receipts", page: "receipts" },
  { label: "Reports", page: "reports" },
  { label: "Readiness", page: "readiness" }
];

function selectAgentPage(page: PageKey) {
  window.dispatchEvent(new CustomEvent<PageKey>("nebula:select-agent-page", { detail: page }));
  document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [balances, setBalances] = useState<BalanceSummary | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadBalances = () => {
    setIsBalanceLoading(true);
    setBalanceError(null);
    api
      .getBalances()
      .then((summary) => setBalances(summary))
      .catch((error: unknown) =>
        setBalanceError(error instanceof Error ? error.message : "Unable to load wallet balances")
      )
      .finally(() => setIsBalanceLoading(false));
  };

  useEffect(() => {
    if (isWalletOpen && !balances && !isBalanceLoading) {
      loadBalances();
    }
  }, [balances, isBalanceLoading, isWalletOpen]);

  const copyAddress = async (key: string, address: string | null) => {
    if (!address) {
      return;
    }

    await navigator.clipboard.writeText(address);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55 }}
      className="sticky top-5 z-50 mx-auto w-[min(1160px,calc(100%-28px))]"
    >
      <nav className="glass-surface navbar-glass px-3 py-3 sm:px-4" aria-label="Primary navigation">
        <div className="flex items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-3" aria-label="Nebula home">
            <span className="logo-orb grid size-11 place-items-center border border-sky-300/30 bg-sky-300/15 text-sky-100">
              <Orbit className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-50 drop-shadow-[0_0_18px_rgba(125,211,252,0.22)]">
              Nebula
            </span>
          </a>

          <div className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => selectAgentPage(item.page)}
                className="nav-link rounded-2xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-slate-50"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative hidden items-center gap-3 sm:flex">
            <button
              type="button"
              className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-sky-300/40 hover:bg-white/15"
            >
              Pro Account
            </button>
            <button
              type="button"
              className="profile-button wallet-button flex size-11 items-center justify-center border border-violet-300/30 bg-violet-300/15 text-violet-100 transition hover:border-violet-200/60"
              aria-label="Open funding wallet"
              title="Open funding wallet"
              onClick={() => setIsWalletOpen((value) => !value)}
            >
              <WalletCards className="size-5" aria-hidden="true" />
            </button>

            <AnimatePresence>
              {isWalletOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className="wallet-panel"
                >
                  <div className="wallet-panel-header">
                    <div className="wallet-panel-title">
                      <span>Funding wallet</span>
                      <strong>Ace & Sentinel balances</strong>
                      <p>Fund service wallets for x402 payments and Sentinel checks.</p>
                    </div>
                    <button
                      type="button"
                      className="wallet-icon-button"
                      onClick={loadBalances}
                      disabled={isBalanceLoading}
                      aria-label="Refresh balances"
                      title="Refresh balances"
                    >
                      <RefreshCw className={isBalanceLoading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                    </button>
                  </div>

                  {balanceError && <div className="wallet-error">{balanceError}</div>}

                  {balances ? (
                    <div className="wallet-funding-grid">
                      <FundingCard
                        title="Ace x402"
                        icon="ace"
                        network={balances.ace.network}
                        address={balances.ace.walletAddress}
                        primaryBalance={formatTokenAmount(balances.ace.usdcBalance, "USDC", 2)}
                        secondaryBalance={formatTokenAmount(balances.ace.nativeBalance, "ETH", 6)}
                        requirement={`Keep at least ${formatTokenAmount(balances.ace.requiredUsdcForFullRun, "USDC", 2)} for a full run.`}
                        instruction="Send Base USDC to this address. Keep a small ETH gas balance for x402 payments."
                        status={balances.ace.check.message}
                        explorerUrl={balances.ace.walletAddress ? `https://basescan.org/address/${balances.ace.walletAddress}` : null}
                        copied={copiedKey === "ace"}
                        onCopy={() => copyAddress("ace", balances.ace.walletAddress)}
                      />
                      <FundingCard
                        title="Sentinel"
                        icon="sentinel"
                        network="Solana"
                        address={balances.sentinel.walletAddress}
                        primaryBalance={formatTokenAmount(balances.sentinel.solBalance, "SOL", 6)}
                        secondaryBalance={null}
                        requirement={`Escrow minimum: ${formatTokenAmount(balances.sentinel.minEscrowSol, "SOL", 6)}.`}
                        instruction="Send SOL to this depositor wallet so Sentinel escrow checks can run."
                        status={balances.sentinel.check.message}
                        explorerUrl={balances.sentinel.walletAddress ? `https://solscan.io/account/${balances.sentinel.walletAddress}` : null}
                        copied={copiedKey === "sentinel"}
                        onCopy={() => copyAddress("sentinel", balances.sentinel.walletAddress)}
                      />
                    </div>
                  ) : (
                    <div className="wallet-loading">
                      {isBalanceLoading ? "Loading balances..." : "Open the panel to load funding addresses."}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-slate-100 lg:hidden"
            aria-label="Toggle navigation"
            title="Toggle navigation"
            onClick={() => setIsOpen((value) => !value)}
          >
            {isOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden lg:hidden"
            >
              <div className="mt-3 grid gap-1 border-t border-white/10 pt-3">
                {navItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      selectAgentPage(item.page);
                      setIsOpen(false);
                    }}
                  className="nav-link rounded-2xl px-3 py-2 text-left text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-slate-50"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}

function FundingCard({
  title,
  icon,
  network,
  address,
  primaryBalance,
  secondaryBalance,
  requirement,
  instruction,
  status,
  explorerUrl,
  copied,
  onCopy
}: {
  title: string;
  icon: "ace" | "sentinel";
  network: string;
  address: string | null;
  primaryBalance: string;
  secondaryBalance: string | null;
  requirement: string;
  instruction: string;
  status: string;
  explorerUrl: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className={`wallet-funding-card wallet-funding-card-${icon}`}>
      <div className="wallet-card-topline">
        <div className="wallet-service-mark" aria-hidden="true">
          {icon === "ace" ? <Zap className="size-4" /> : <ShieldCheck className="size-4" />}
        </div>
        <div className="wallet-service-copy">
          <span>{network}</span>
          <strong>{title}</strong>
        </div>
        <span className="wallet-network-pill">{network}</span>
      </div>

      <p className="wallet-card-description">{instruction}</p>

      <div className="wallet-balance-grid">
        <div>
          <span>Available</span>
          <strong>{primaryBalance}</strong>
        </div>
        {secondaryBalance && (
          <div>
            <span>Gas</span>
            <strong>{secondaryBalance}</strong>
          </div>
        )}
      </div>

      <div className="wallet-address-box">
        <div>
          <span>Deposit address</span>
          <strong>{address ? shortId(address, 7) : "Not configured"}</strong>
        </div>
        <button
          type="button"
          className="wallet-copy-button"
          onClick={onCopy}
          disabled={!address}
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="wallet-note-list">
        <small>{requirement}</small>
        <small>{status}</small>
      </div>

      {explorerUrl && (
        <a className="wallet-explorer-link" href={explorerUrl} target="_blank" rel="noreferrer">
          Open explorer
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
