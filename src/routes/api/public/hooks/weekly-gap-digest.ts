import { createFileRoute } from "@tanstack/react-router";

/**
 * Weekly gap digest.
 *
 * Emails each org admin a plain-text summary of the last 7 days of gap events
 * (type = 'not_accounted_for' or legacy 'off_script'), grouped by org.
 *
 * SETUP REQUIRED (do this once in the backend dashboard):
 *
 * 1. Email provider — pick one:
 *    a) Resend: connect the Resend app connector, then this route reads
 *       LOVABLE_API_KEY + RESEND_API_KEY automatically.
 *    b) Any SMTP: replace the sendEmail() body with your SMTP client.
 *    Set FROM_EMAIL below (or via env) to a verified sender.
 *
 * 2. Cron — schedule this route weekly with pg_cron. Example (Mondays 09:00 UTC):
 *
 *      select cron.schedule(
 *        'weekly-gap-digest',
 *        '0 9 * * 1',
 *        $$ select net.http_post(
 *          url  := 'https://<your-stable-url>/api/public/hooks/weekly-gap-digest',
 *          headers := '{"Content-Type":"application/json","apikey":"<anon-key>"}'::jsonb,
 *          body := '{}'::jsonb
 *        ); $$
 *      );
 *
 * This route is under /api/public/* so it bypasses auth on published sites.
 * It performs no writes — it only reads gap events with the service role and
 * dispatches email.
 */

const FROM_EMAIL = process.env.WEEKLY_DIGEST_FROM ?? "gaps@example.com";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

async function sendEmail(to: string, subject: string, text: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    console.warn("[weekly-gap-digest] no email provider configured — skipping send", { to, subject });
    return { skipped: true };
  }
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`email send failed (${res.status}): ${body}`);
  }
  return res.json();
}

interface GapEvent {
  id: string;
  created_at: string;
  step_id: string;
  section_type: string | null;
  detail: string | null;
  org_id: string;
  type: string;
  run_id: string;
}

export const Route = createFileRoute("/api/public/hooks/weekly-gap-digest")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: events, error: eventsErr } = await supabaseAdmin
          .from("events")
          .select("id, created_at, step_id, section_type, detail, org_id, type, run_id")
          .in("type", ["not_accounted_for", "off_script"])
          .gte("created_at", since)
          .order("created_at", { ascending: false });
        if (eventsErr) throw eventsErr;

        const byOrg = new Map<string, GapEvent[]>();
        ((events ?? []) as GapEvent[]).forEach((e) => {
          const list = byOrg.get(e.org_id) ?? [];
          list.push(e);
          byOrg.set(e.org_id, list);
        });

        if (byOrg.size === 0) {
          return Response.json({ ok: true, orgs: 0, sent: 0 });
        }

        const { data: orgs } = await supabaseAdmin
          .from("orgs")
          .select("id, name")
          .in("id", Array.from(byOrg.keys()));
        const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name] as const));

        // Admins per org
        const { data: adminRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = (adminRoles ?? []).map((r) => r.user_id);
        const { data: adminProfiles } = adminIds.length
          ? await supabaseAdmin.from("profiles").select("id, org_id").in("id", adminIds)
          : { data: [] as { id: string; org_id: string }[] };

        // Auth admin gives us email per user
        let sent = 0;
        for (const [orgId, gaps] of byOrg) {
          const admins = (adminProfiles ?? []).filter((p) => p.org_id === orgId);
          if (admins.length === 0) continue;

          const lines = gaps
            .map((g) => {
              const when = new Date(g.created_at).toLocaleString();
              const section = g.section_type ?? "—";
              const detail = g.detail ?? "(no detail captured)";
              return `• [${when}] section=${section}\n    "${detail}"`;
            })
            .join("\n\n");

          const body = [
            `Weekly gaps for ${orgName.get(orgId) ?? "your team"}`,
            `${gaps.length} moment${gaps.length === 1 ? "" : "s"} where the prospect said something the script didn't cover.`,
            "",
            lines,
            "",
            "Review and add responses in the Gaps inbox.",
          ].join("\n");

          for (const admin of admins) {
            const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(admin.id);
            const email = userRes?.user?.email;
            if (!email) continue;
            try {
              await sendEmail(email, `Weekly gaps — ${gaps.length} to review`, body);
              sent += 1;
            } catch (err) {
              console.error("[weekly-gap-digest] send failed", { email, err });
            }
          }
        }

        return Response.json({ ok: true, orgs: byOrg.size, sent });
      },
    },
  },
});
