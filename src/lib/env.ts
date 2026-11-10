export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  allowSignup: (process.env.ALLOW_SIGNUP ?? "true") === "true",
  smtpUrl: process.env.SMTP_URL,
  mailFrom: process.env.MAIL_FROM ?? "ESG Rapportering <noreply@localhost>",
  isProd: process.env.NODE_ENV === "production",
};

/** I udvikling uden SMTP vises links direkte i UI'et, så flowet kan testes uden mail. */
export const showDevLinks = !env.isProd && !env.smtpUrl;
