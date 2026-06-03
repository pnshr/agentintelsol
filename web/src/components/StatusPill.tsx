export function StatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className =
    normalized.includes("fail") ||
    normalized.includes("avoid") ||
    normalized.includes("high_risk") ||
    normalized.includes("risky") ||
    normalized.includes("missing") ||
    normalized.includes("blocked")
    ? "pill danger"
    : normalized.includes("complete") ||
        normalized.includes("pass") ||
        normalized.includes("safe") ||
        normalized.includes("ready") ||
        normalized.includes("settled")
      ? "pill success"
      : normalized.includes("mock") ||
          normalized.includes("warning") ||
          normalized.includes("monitor") ||
          normalized.includes("pending")
        ? "pill warn"
        : "pill";

  return <span className={className}>{value}</span>;
}
