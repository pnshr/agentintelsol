import type { Logger } from "pino";
import type { AppConfig } from "../config/env";

export type IntegrationReadiness = "mock" | "configured" | "missing_config";

export interface IntegrationStatus {
  sap: IntegrationReadiness;
  synapseRpc: IntegrationReadiness;
  aceX402: IntegrationReadiness;
  sentinel: IntegrationReadiness;
}

export function getIntegrationStatus(config: AppConfig): IntegrationStatus {
  return {
    sap: config.SAP_MOCK_MODE
      ? "mock"
      : hasAll(
            config.SAP_AGENT_ID,
            config.SAP_PRIVATE_KEY,
            config.SAP_REGISTRY_ENDPOINT
          )
        ? "configured"
        : "missing_config",
    synapseRpc: config.SYNAPSE_MOCK_MODE
      ? "mock"
      : hasAll(config.SYNAPSE_RPC_URL, config.SYNAPSE_API_KEY)
        ? "configured"
        : "missing_config",
    aceX402: config.ACE_MOCK_MODE
      ? "mock"
      : hasAceConfig(config)
        ? "configured"
        : "missing_config",
    sentinel: config.SENTINEL_MOCK_MODE
      ? "mock"
      : hasAll(
            config.SENTINEL_AGENT_ID,
            config.SENTINEL_ENDPOINT,
            config.SENTINEL_CHECK_PATH,
            config.SENTINEL_MERCHANT_WALLET,
            config.SENTINEL_DEPOSITOR_WALLET,
            config.SENTINEL_TOOL_TOKEN,
            config.SENTINEL_TOOL_WALLET
          )
        ? "configured"
        : "missing_config"
  };
}

export function logMockModeWarnings(config: AppConfig, logger: Logger): void {
  const status = getIntegrationStatus(config);
  const mockIntegrations = Object.entries(status)
    .filter(([, value]) => value === "mock")
    .map(([name]) => name);

  if (mockIntegrations.length === 0) {
    return;
  }

  logger.warn(
    {
      mockIntegrations,
      notice:
        "Mock mode is enabled for one or more integrations. Local audit records may include mock receipts and must not be represented as real settlement."
    },
    "Integration mock mode enabled"
  );
}

function hasAll(...values: string[]): boolean {
  return values.every((value) => value.trim().length > 0);
}

function hasAceConfig(config: AppConfig): boolean {
  const baseConfigPresent = hasAll(
    config.ACE_API_KEY,
    config.ACE_ACCOUNT_ID,
    config.ACE_SERVICE_BASE_URL,
    config.ACE_X402_PRIVATE_KEY,
    config.ACE_PLATFORM_BASE_URL,
    config.ACE_X402_FACILITATOR_URL
  );
  const paymentTokenPresent = hasAll(config.ACE_PLATFORM_TOKEN) || hasAll(config.ACE_API_KEY);

  if (!baseConfigPresent || !paymentTokenPresent) {
    return false;
  }

  if (!config.ACE_X402_REQUIRE_PAYMENT) {
    return true;
  }

  if (config.ACE_X402_AUTO_CREATE_ORDERS) {
    return hasAll(
      config.ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH,
      config.ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT,
      config.ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION
    );
  }

  return hasAll(
    config.ACE_X402_ORDER_ID_WEB_SEARCH,
    config.ACE_X402_ORDER_ID_ENTITY_ENRICHMENT,
    config.ACE_X402_ORDER_ID_AI_CLASSIFICATION
  );
}
