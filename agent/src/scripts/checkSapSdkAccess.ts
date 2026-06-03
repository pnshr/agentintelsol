import { loadConfig } from "../config/env";
import { getSapOfficialSdkInfo } from "../sap/sapOfficialSdk";

const config = loadConfig();
const sdk = getSapOfficialSdkInfo();

const output = {
  sdk,
  environment: {
    SAP_MOCK_MODE: config.SAP_MOCK_MODE,
    SAP_ENABLE_MAINNET_WRITES: config.SAP_ENABLE_MAINNET_WRITES,
    SAP_AGENT_ID_SET: config.SAP_AGENT_ID.trim().length > 0,
    SAP_PRIVATE_KEY_SET: config.SAP_PRIVATE_KEY.trim().length > 0,
    SAP_REGISTRY_ENDPOINT_SET: config.SAP_REGISTRY_ENDPOINT.trim().length > 0,
    OOBE_API_KEY_SET: config.OOBE_API_KEY.trim().length > 0,
    SYNAPSE_API_KEY_SET: config.SYNAPSE_API_KEY.trim().length > 0,
    AGENT_PUBLIC_URL_SET: config.AGENT_PUBLIC_URL.trim().length > 0,
    AGENT_X402_ENDPOINT_SET: config.AGENT_X402_ENDPOINT.trim().length > 0
  },
  nextSteps: [
    "Get OOBE/Synapse API access from the official Synapse sign-up or team channel.",
    "Put the OOBE API key in OOBE_API_KEY and/or include it in SAP_REGISTRY_ENDPOINT as the official endpoint requires.",
    "Put a funded Solana agent wallet secret key in SAP_PRIVATE_KEY.",
    "Set SAP_MOCK_MODE=false only when testing real SAP reads/writes.",
    "Set SAP_ENABLE_MAINNET_WRITES=true only when you intentionally want to submit SAP registration/update transactions.",
    "After registration, copy the confirmed agent id/PDA into SAP_AGENT_ID and record the transaction signature plus registry visibility details."
  ]
};

console.log(JSON.stringify(output, null, 2));
