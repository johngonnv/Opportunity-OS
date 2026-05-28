import { Resend } from "resend";

// Production-ready Resend client (works on Railway and elsewhere).
// Requires RESEND_API_KEY to be set in the environment.
export async function getResendClient(): Promise<{ client: Resend; fromEmail: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }

  const fromEmail =
    process.env.INVITE_FROM_EMAIL || "Opportunity OS <noreply@opportunityos.com>";

  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}
