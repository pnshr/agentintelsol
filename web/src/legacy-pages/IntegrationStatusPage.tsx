import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorState, LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import type { IntegrationStatus } from "../types";

const labels: Array<{
  key: keyof IntegrationStatus;
  label: string;
  realRequirement: string;
}> = [
  {
    key: "sap",
    label: "SAP",
    realRequirement: "Needs SAP agent id, private key, registry endpoint, and registry visibility."
  },
  {
    key: "synapseRpc",
    label: "Synapse RPC",
    realRequirement: "Needs Synapse RPC URL/API key and real RPC payloads in reports."
  },
  {
    key: "aceX402",
    label: "Ace Data Cloud x402",
    realRequirement: "Needs Ace service endpoints, x402 signing, facilitator settlement, and real receipts."
  },
  {
    key: "sentinel",
    label: "Synapse Sentinel",
    realRequirement: "Needs Sentinel gateway configuration and result payload schema."
  }
];

export function IntegrationStatusPage({ refreshKey }: { refreshKey: number }) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    api
      .getIntegrationStatus()
      .then((data) => mounted && setStatus(data))
      .catch((err: unknown) =>
        mounted &&
        setError(
          err instanceof Error ? err.message : "Unable to load integration status"
        )
      );
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!status) {
    return <LoadingState label="Loading integration status" />;
  }

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>Integration Status</h1>
          <p>Configuration status for external services</p>
        </div>
      </div>

      <div className="notice warnNotice">
        <strong>Operational note:</strong>{" "}
        <span>A configured adapter still needs a successful workflow run before it is useful in production.</span>
      </div>

      <div className="statusGrid">
        {labels.map((item) => (
          <div className="dataPanel" key={item.key}>
            <div className="panelHeader">
              <strong>{item.label}</strong>
              <StatusPill value={status[item.key]} />
            </div>
            <p>{describeStatus(status[item.key])}</p>
            <small>{item.realRequirement}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function describeStatus(value: IntegrationStatus[keyof IntegrationStatus]): string {
  if (value === "mock") {
    return "Mock mode is enabled for local development.";
  }

  if (value === "configured") {
    return "Required environment variables are present. Confirm with a successful run.";
  }

  return "Mock mode is disabled and required environment variables are missing.";
}
