declare module "x402-fetch" {
  export type PaymentRequirementsSelector = (
    requirements: unknown[],
    network?: string | string[],
    scheme?: "exact"
  ) => unknown;

  export function createSigner(
    network: string,
    privateKey: string
  ): Promise<unknown>;

  export function wrapFetchWithPayment(
    fetch: typeof globalThis.fetch,
    walletClient: unknown,
    maxValue?: bigint,
    paymentRequirementsSelector?: PaymentRequirementsSelector,
    config?: unknown
  ): typeof globalThis.fetch;

  export function decodeXPaymentResponse(header: string): unknown;
}

