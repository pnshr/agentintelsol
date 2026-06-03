import dotenv from "dotenv";
import { z } from "zod";
import {
  DEFAULT_DEMO_TOKEN_ADDRESS,
  DEFAULT_DEMO_WALLET_ADDRESS
} from "./demoAddresses";

dotenv.config();

const booleanFromString = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, ctx) => {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected true or false"
    });
    return z.NEVER;
  });

const numericString = z.coerce.number().finite().nonnegative();

const envSchema = z.object({
  AGENT_PUBLIC_URL: z.string().default(""),
  AGENT_X402_ENDPOINT: z.string().default(""),
  OOBE_API_KEY: z.string().default(""),
  SAP_AGENT_ID: z.string().default(""),
  SAP_PRIVATE_KEY: z.string().default(""),
  SAP_REGISTRY_ENDPOINT: z.string().default(""),
  SAP_ENABLE_MAINNET_WRITES: booleanFromString.default("false"),
  SAP_MOCK_MODE: booleanFromString.default("true"),
  SYNAPSE_RPC_URL: z.string().default(""),
  SYNAPSE_API_KEY: z.string().default(""),
  SYNAPSE_MOCK_MODE: booleanFromString.default("true"),
  ACE_API_KEY: z.string().default(""),
  ACE_SERVICE_BASE_URL: z.string().default(""),
  ACE_PLATFORM_BASE_URL: z.string().default("https://platform.acedata.cloud"),
  ACE_PLATFORM_TOKEN: z.string().default(""),
  ACE_X402_FACILITATOR_URL: z.string().default(""),
  ACE_X402_PRIVATE_KEY: z.string().default(""),
  ACE_X402_NETWORK: z.string().default("base"),
  BASE_RPC_URL: z.string().default("https://mainnet.base.org"),
  ACE_X402_MAX_PAYMENT_USDC: numericString.default(1),
  ACE_X402_REQUIRE_PAYMENT: booleanFromString.default("false"),
  ACE_X402_AUTO_CREATE_ORDERS: booleanFromString.default("false"),
  ACE_X402_ORDER_ID: z.string().default(""),
  ACE_X402_ORDER_ID_WEB_SEARCH: z.string().default(""),
  ACE_X402_ORDER_ID_ENTITY_ENRICHMENT: z.string().default(""),
  ACE_X402_ORDER_ID_AI_CLASSIFICATION: z.string().default(""),
  ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH: z.string().default(""),
  ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT: z.string().default(""),
  ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION: z.string().default(""),
  ACE_X402_ORDER_PACKAGE_ID_WEB_SEARCH: z.string().default(""),
  ACE_X402_ORDER_PACKAGE_ID_ENTITY_ENRICHMENT: z.string().default(""),
  ACE_X402_ORDER_PACKAGE_ID_AI_CLASSIFICATION: z.string().default(""),
  ACE_X402_ORDER_AMOUNT_WEB_SEARCH: numericString.default(1),
  ACE_X402_ORDER_AMOUNT_ENTITY_ENRICHMENT: numericString.default(1),
  ACE_X402_ORDER_AMOUNT_AI_CLASSIFICATION: numericString.default(1),
  ACE_ACCOUNT_ID: z.string().default(""),
  ACE_WEB_SEARCH_PATH: z.string().default("/serp/google"),
  ACE_ENTITY_ENRICHMENT_PATH: z.string().default("/webextrator/extract"),
  ACE_AI_CLASSIFICATION_PATH: z.string().default("/openai/chat/completions"),
  ACE_AI_MODEL: z.string().default("gpt-4o-mini"),
  ACE_MOCK_MODE: booleanFromString.default("true"),
  SENTINEL_AGENT_ID: z
    .string()
    .default("AzqhCKhku9TX3ScVtQw5nffLJ6PoA8r3P6HiTdinuAKz"),
  SENTINEL_ENDPOINT: z
    .string()
    .default("https://agent.sentinel.oobeprotocol.ai"),
  SENTINEL_CHECK_PATH: z.string().default("/tools/:name"),
  SENTINEL_HTTP_METHOD: z.enum(["POST", "PUT"]).default("POST"),
  SENTINEL_API_KEY: z.string().default(""),
  SENTINEL_MERCHANT_WALLET: z
    .string()
    .default("Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph"),
  SENTINEL_DEPOSITOR_WALLET: z.string().default(""),
  SENTINEL_TOOL_TOKEN: z.string().default("spl-token_rugCheck"),
  SENTINEL_TOOL_WALLET: z.string().default("spl-token_getTokenAccounts"),
  SENTINEL_MIN_ESCROW_LAMPORTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(10_000_000),
  SENTINEL_ESCROW_NONCE: z.coerce.number().int().nonnegative().default(0),
  SENTINEL_ESCROW_DEPOSIT_LAMPORTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(10_000_000),
  SENTINEL_OPEN_ESCROW_WRITE: booleanFromString.default("false"),
  SENTINEL_MOCK_MODE: booleanFromString.default("true"),
  DEMO_TOKEN_ADDRESS: z.string().default(DEFAULT_DEMO_TOKEN_ADDRESS),
  DEMO_WALLET_ADDRESS: z.string().default(DEFAULT_DEMO_WALLET_ADDRESS),
  DATABASE_URL: z.string().min(1).default("file:./data/agentintel.db"),
  API_AUTH_TOKEN: z.string().default(""),
  CORS_ORIGIN: z.string().default(""),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(240),
  REQUIRE_REAL_INTEGRATIONS_FOR_PRODUCTION: booleanFromString.default("false"),
  MAX_DAILY_SPEND_USDC: numericString.default(10),
  MAX_SPEND_PER_RUN_USDC: numericString.default(1),
  MAX_TOOL_CALLS_PER_RUN: z.coerce.number().int().positive().default(20),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001)
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${message}`);
  }

  return parsed.data;
}
