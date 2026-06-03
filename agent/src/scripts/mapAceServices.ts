import { loadConfig } from "../config/env";
import type { AceServiceName } from "../ace/aceTypes";

const config = loadConfig();
const token = config.ACE_PLATFORM_TOKEN || config.ACE_API_KEY;

const serviceTargets: Record<
  AceServiceName,
  {
    env: string;
    preferredAlias: string;
    configuredPath: string;
  }
> = {
  web_search: {
    env: "ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH",
    preferredAlias: "serp",
    configuredPath: config.ACE_WEB_SEARCH_PATH
  },
  entity_enrichment: {
    env: "ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT",
    preferredAlias: "webextrator",
    configuredPath: config.ACE_ENTITY_ENRICHMENT_PATH
  },
  ai_classification: {
    env: "ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION",
    preferredAlias: "openai",
    configuredPath: config.ACE_AI_CLASSIFICATION_PATH
  }
};

async function main(): Promise<void> {
  const servicesPayload = await aceGet("/api/v1/services/?limit=500&offset=0");
  const services = Array.isArray(servicesPayload.items)
    ? servicesPayload.items.map(toRecord)
    : [];
  const results = [];

  for (const [serviceName, target] of Object.entries(serviceTargets) as Array<
    [AceServiceName, (typeof serviceTargets)[AceServiceName]]
  >) {
    const service = findService(services, target);
    const serviceId = service ? readString(service, "id") : null;
    const applicationLookup = serviceId
      ? await tryFindApplications(serviceId)
      : {
          ok: false,
          status: null,
          reason: "Service was not found, so application lookup was skipped.",
          candidates: []
        };

    results.push({
      serviceName,
      applicationIdEnv: target.env,
      configuredAcePath: target.configuredPath,
      service: service
        ? {
            id: readString(service, "id"),
            title: readString(service, "title"),
            alias: readString(service, "alias"),
            apiIds: Array.isArray(service.api_ids)
              ? service.api_ids.slice(0, 8)
              : []
          }
        : null,
      packages: summarizePackages(service),
      applicationLookup,
      nextStep:
        applicationLookup.candidates.length > 0
          ? `Copy one candidate id into ${target.env}.`
          : `Open Ace Platform, apply/enable this service for your account, then copy the created application id into ${target.env}.`
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        platformBaseUrl: config.ACE_PLATFORM_BASE_URL,
        note:
          "application_id is account-specific. It is not the same as service.id. This command does not create orders or submit payments.",
        results
      },
      null,
      2
    )
  );
}

async function tryFindApplications(serviceId: string): Promise<{
  ok: boolean;
  status: number | null;
  reason: string | null;
  candidates: Array<Record<string, unknown>>;
}> {
  if (!token.trim()) {
    return {
      ok: false,
      status: null,
      reason: "ACE_PLATFORM_TOKEN or ACE_API_KEY is not configured.",
      candidates: []
    };
  }

  const query = new URLSearchParams({
    limit: "20",
    offset: "0",
    type: "Usage",
    service_id: serviceId
  });

  if (config.ACE_ACCOUNT_ID.trim()) {
    query.set("user_id", config.ACE_ACCOUNT_ID.trim());
  }

  const response = await fetch(
    new URL(`/api/v1/applications/?${query}`, config.ACE_PLATFORM_BASE_URL),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason:
        response.status === 401 || response.status === 403
          ? "The configured token cannot read Ace account applications."
          : JSON.stringify(payload).slice(0, 500),
      candidates: []
    };
  }

  const items = Array.isArray(payload.items) ? payload.items.map(toRecord) : [];

  return {
    ok: true,
    status: response.status,
    reason: null,
    candidates: items.map((item) => ({
      id: readString(item, "id"),
      serviceId: readString(item, "service_id"),
      remainingAmount: readNumber(item, "remaining_amount"),
      usedAmount: readNumber(item, "used_amount"),
      scope: readString(item, "scope")
    }))
  };
}

async function aceGet(path: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (token.trim()) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    new URL(path, config.ACE_PLATFORM_BASE_URL),
    { headers }
  );
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Ace service map fetch failed with HTTP ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

function findService(
  services: Array<Record<string, unknown>>,
  target: { preferredAlias: string; configuredPath: string }
): Record<string, unknown> | null {
  const aliasMatch = services.find(
    (service) => readString(service, "alias") === target.preferredAlias
  );

  if (aliasMatch) {
    return aliasMatch;
  }

  const path = target.configuredPath.toLowerCase();
  return (
    services.find((service) =>
      JSON.stringify(service).toLowerCase().includes(path)
    ) ?? null
  );
}

function summarizePackages(
  service: Record<string, unknown> | null
): Array<Record<string, unknown>> {
  if (!service || !Array.isArray(service.packages)) {
    return [];
  }

  return service.packages.slice(0, 5).map((item) => {
    const record = toRecord(item);
    return {
      id: readString(record, "id"),
      amount: readNumber(record, "amount"),
      price: readNumber(record, "price"),
      type: readString(record, "type")
    };
  });
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return toRecord(JSON.parse(text));
  } catch {
    return { rawText: text };
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const nested = value[key];
  return typeof nested === "string" && nested.trim().length > 0 ? nested : null;
}

function readNumber(value: Record<string, unknown>, key: string): number | null {
  const nested = value[key];

  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested;
  }

  if (typeof nested === "string") {
    const parsed = Number(nested);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
