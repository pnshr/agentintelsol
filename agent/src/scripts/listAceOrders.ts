import { loadConfig } from "../config/env";

const config = loadConfig();
const token = config.ACE_PLATFORM_TOKEN || config.ACE_API_KEY;

async function main(): Promise<void> {
  if (!token.trim()) {
    throw new Error(
      "ACE_PLATFORM_TOKEN or ACE_API_KEY is required to list Ace platform orders."
    );
  }

  const response = await fetch(
    new URL("/api/v1/orders/?limit=3&offset=0", config.ACE_PLATFORM_BASE_URL),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );
  const body = await response.text();

  if (!response.ok) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          hint:
            response.status === 401
              ? "The configured token is not accepted as an Ace Platform Token for orders. Create one at https://platform.acedata.cloud/console/platform-tokens."
              : "Ace platform orders endpoint returned a non-success status.",
          bodyPreview: body.slice(0, 500)
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  let parsed: unknown = body;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Keep text body when the platform does not return JSON.
  }

  const orders =
    parsed && typeof parsed === "object" && "items" in parsed
      ? {
          count:
            "count" in parsed && typeof parsed.count === "number"
              ? parsed.count
              : undefined,
          items: Array.isArray(parsed.items)
            ? parsed.items.map((item) => summarizeOrder(item))
            : []
        }
      : parsed;

  console.log(
    JSON.stringify(
      {
        ok: true,
        status: response.status,
        orders
      },
      null,
      2
    )
  );
}

function summarizeOrder(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") {
    return { value: item };
  }

  const order = item as Record<string, unknown>;
  const application = order.application as Record<string, unknown> | undefined;
  const service = application?.service as Record<string, unknown> | undefined;

  return {
    id: order.id,
    applicationId: order.application_id,
    service: service?.title,
    description: order.description,
    price: order.price,
    state: order.state,
    payWay: order.pay_way,
    createdAt: order.created_at,
    expiresAt: order.expired_at
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
