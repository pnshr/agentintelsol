export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatMoney(value: number | null | undefined): string {
  return `$${(value ?? 0).toFixed(2)} USDC`;
}

export function formatTokenAmount(
  value: number | null | undefined,
  symbol: string,
  decimals = 4
): string {
  if (value === null || value === undefined) {
    return "Unavailable";
  }

  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: value === 0 ? 0 : Math.min(2, decimals)
  })} ${symbol}`;
}

export function shortId(value: string | null | undefined, length = 8): string {
  if (!value) {
    return "None";
  }

  if (value.length <= length * 2 + 3) {
    return value;
  }

  return `${value.slice(0, length)}...${value.slice(-length)}`;
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
