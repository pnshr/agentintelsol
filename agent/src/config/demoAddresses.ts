import type { AppConfig } from "./env";
import type { WorkflowTargetType } from "../workflow/workflowTypes";

export const DEFAULT_DEMO_TOKEN_ADDRESS =
  "So11111111111111111111111111111111111111112";

export const DEFAULT_DEMO_WALLET_ADDRESS =
  "11111111111111111111111111111111";

export interface DemoAddressConfig {
  token: string;
  wallet: string;
}

export function getDemoAddresses(
  config: Pick<AppConfig, "DEMO_TOKEN_ADDRESS" | "DEMO_WALLET_ADDRESS">
): DemoAddressConfig {
  return {
    token: config.DEMO_TOKEN_ADDRESS || DEFAULT_DEMO_TOKEN_ADDRESS,
    wallet: config.DEMO_WALLET_ADDRESS || DEFAULT_DEMO_WALLET_ADDRESS
  };
}

export function getDemoAddress(
  config: Pick<AppConfig, "DEMO_TOKEN_ADDRESS" | "DEMO_WALLET_ADDRESS">,
  targetType: WorkflowTargetType
): string {
  return getDemoAddresses(config)[targetType];
}
