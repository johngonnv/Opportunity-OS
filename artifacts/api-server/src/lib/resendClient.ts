import { Resend } from "resend";

// Replit-managed Resend connector — credentials are fetched fresh each call
// because access tokens can expire. Never cache this client.
export async function getResendClient(): Promise<{ client: Resend; fromEmail: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) return null;

  try {
    const data = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      }
    ).then((r) => r.json());

    const settings = data?.items?.[0]?.settings;
    if (!settings?.api_key) return null;

    return {
      client: new Resend(settings.api_key),
      fromEmail: "Opportunity OS <support@onboard.opportunityos.org>",
    };
  } catch {
    return null;
  }
}
