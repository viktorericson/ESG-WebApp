const graph = { tenantId: process.env.MS_GRAPH_TENANT_ID, clientId: process.env.MS_GRAPH_CLIENT_ID, clientSecret: process.env.MS_GRAPH_CLIENT_SECRET };

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  allowSignup: (process.env.ALLOW_SIGNUP ?? "true") === "true",
  smtpUrl: process.env.SMTP_URL,
  /** Mail via Microsoft Graph (Entra-app). Bruges frem for SMTP, når alle tre værdier er sat. */
  graph: graph.tenantId && graph.clientId && graph.clientSecret ? { tenantId: graph.tenantId, clientId: graph.clientId, clientSecret: graph.clientSecret } : null,
  mailFrom: process.env.MAIL_FROM ?? "ESG Rapportering <noreply@localhost>",
  isProd: process.env.NODE_ENV === "production",
  /** Platformens ejere (kommasepareret): får adgang til /admin på tværs af alle koncerner */
  platformAdmins: (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};

export const isPlatformAdmin = (email: string | null | undefined) => !!email && env.platformAdmins.includes(email.toLowerCase());

/** I udvikling uden mailopsætning vises links direkte i UI'et, så flowet kan testes uden mail. */
export const showDevLinks = !env.isProd && !env.smtpUrl && !env.graph;
