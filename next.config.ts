import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Appen er login-baseret og fuldt dynamisk, så vi bruger ikke Cache Components.
  serverExternalPackages: ["pg", "nodemailer"],
  // Eksporten læser PowerPoint-skabelonen fra disken – den skal med i server-bundtet
  outputFileTracingIncludes: {
    "/api/reports/\\[reportId\\]/export": ["./templates/**/*"],
  },
  // Tillad dev-serveren bag en ngrok-tunnel (kun relevant for `next dev`)
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev"],
  // Landingssiden er en statisk side i public/landing. Et redirect (ikke rewrite), så sidens relative
  // stier (assets/...) løses fra /landing/ og ikke fra roden.
  async redirects() {
    return [{ source: "/landing", destination: "/landing/index.html", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
