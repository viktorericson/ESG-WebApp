import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Appen er login-baseret og fuldt dynamisk, så vi bruger ikke Cache Components.
  serverExternalPackages: ["pg", "nodemailer"],
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
