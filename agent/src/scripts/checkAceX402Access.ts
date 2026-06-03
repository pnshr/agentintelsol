import { loadConfig } from "../config/env";

const config = loadConfig();

const serviceOrderIds = {
  webSearch: Boolean(config.ACE_X402_ORDER_ID_WEB_SEARCH),
  entityEnrichment: Boolean(config.ACE_X402_ORDER_ID_ENTITY_ENRICHMENT),
  aiClassification: Boolean(config.ACE_X402_ORDER_ID_AI_CLASSIFICATION)
};

const serviceOrderApplicationIds = {
  webSearch: Boolean(config.ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH),
  entityEnrichment: Boolean(config.ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT),
  aiClassification: Boolean(config.ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION)
};

const serviceOrderPackageIds = {
  webSearch: Boolean(config.ACE_X402_ORDER_PACKAGE_ID_WEB_SEARCH),
  entityEnrichment: Boolean(config.ACE_X402_ORDER_PACKAGE_ID_ENTITY_ENRICHMENT),
  aiClassification: Boolean(config.ACE_X402_ORDER_PACKAGE_ID_AI_CLASSIFICATION)
};

const result = {
  mockMode: config.ACE_MOCK_MODE,
  serviceApi: {
    apiKeySet: Boolean(config.ACE_API_KEY),
    serviceBaseUrl: config.ACE_SERVICE_BASE_URL || null,
    accountIdSet: Boolean(config.ACE_ACCOUNT_ID),
    paths: {
      webSearch: config.ACE_WEB_SEARCH_PATH,
      entityEnrichment: config.ACE_ENTITY_ENRICHMENT_PATH,
      aiClassification: config.ACE_AI_CLASSIFICATION_PATH
    },
    aiModel: config.ACE_AI_MODEL
  },
  x402: {
    packageInstalled: true,
    platformBaseUrl: config.ACE_PLATFORM_BASE_URL || null,
    platformTokenSet: Boolean(config.ACE_PLATFORM_TOKEN || config.ACE_API_KEY),
    facilitatorUrlSet: Boolean(config.ACE_X402_FACILITATOR_URL),
    privateKeySet: Boolean(config.ACE_X402_PRIVATE_KEY),
    network: config.ACE_X402_NETWORK,
    maxPaymentUsdc: config.ACE_X402_MAX_PAYMENT_USDC,
    requirePayment: config.ACE_X402_REQUIRE_PAYMENT,
    autoCreateOrders: config.ACE_X402_AUTO_CREATE_ORDERS,
    fallbackOrderIdSet: Boolean(config.ACE_X402_ORDER_ID),
    serviceOrderIds,
    serviceOrderApplicationIds,
    serviceOrderPackageIds,
    serviceOrderAmounts: {
      webSearch: config.ACE_X402_ORDER_AMOUNT_WEB_SEARCH,
      entityEnrichment: config.ACE_X402_ORDER_AMOUNT_ENTITY_ENRICHMENT,
      aiClassification: config.ACE_X402_ORDER_AMOUNT_AI_CLASSIFICATION
    }
  },
  readyForRealAceServiceCalls: Boolean(
    config.ACE_API_KEY &&
      config.ACE_ACCOUNT_ID &&
      config.ACE_SERVICE_BASE_URL &&
      !config.ACE_MOCK_MODE
  ),
  readyForRealX402Receipts: Boolean(
    !config.ACE_MOCK_MODE &&
      config.ACE_API_KEY &&
      config.ACE_ACCOUNT_ID &&
      config.ACE_SERVICE_BASE_URL &&
      config.ACE_PLATFORM_BASE_URL &&
      (config.ACE_PLATFORM_TOKEN || config.ACE_API_KEY) &&
      config.ACE_X402_FACILITATOR_URL &&
      config.ACE_X402_PRIVATE_KEY &&
      (config.ACE_X402_AUTO_CREATE_ORDERS
        ? serviceOrderApplicationIds.webSearch &&
          serviceOrderApplicationIds.entityEnrichment &&
          serviceOrderApplicationIds.aiClassification &&
          serviceOrderPackageIds.webSearch &&
          serviceOrderPackageIds.entityEnrichment &&
          serviceOrderPackageIds.aiClassification
        : serviceOrderIds.webSearch &&
          serviceOrderIds.entityEnrichment &&
          serviceOrderIds.aiClassification)
  ),
  note:
    "This check does not submit payments. A real paid run requires ACE_MOCK_MODE=false and valid Ace API/x402 credentials. If ACE_X402_AUTO_CREATE_ORDERS=true, the platform token must be allowed to POST /api/v1/orders/."
};

console.log(JSON.stringify(result, null, 2));
