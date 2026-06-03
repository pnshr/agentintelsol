import pino, { type Logger } from "pino";
import type { AppConfig } from "../config/env";

export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.NODE_ENV === "test" ? "silent" : "info",
    base: {
      service: "agentintel-broker-agent",
      env: config.NODE_ENV
    },
    redact: {
      paths: [
        "SAP_PRIVATE_KEY",
        "OOBE_API_KEY",
        "SYNAPSE_API_KEY",
        "ACE_API_KEY",
        "ACE_X402_PRIVATE_KEY",
        "SENTINEL_API_KEY",
        "API_AUTH_TOKEN",
        "*.SAP_PRIVATE_KEY",
        "*.OOBE_API_KEY",
        "*.SYNAPSE_API_KEY",
        "*.ACE_API_KEY",
        "*.ACE_X402_PRIVATE_KEY",
        "*.SENTINEL_API_KEY",
        "*.API_AUTH_TOKEN",
        "config.SAP_PRIVATE_KEY",
        "config.OOBE_API_KEY",
        "config.SYNAPSE_API_KEY",
        "config.ACE_API_KEY",
        "config.ACE_X402_PRIVATE_KEY",
        "config.SENTINEL_API_KEY",
        "config.API_AUTH_TOKEN"
      ],
      censor: "[redacted]"
    }
  });
}
