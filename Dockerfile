# Produktionsimage til CapRover eller anden Docker-hosting. Se "Drift" i README.md.
# Node 24 følger med npm 11, som package-lock.json er skrevet med (npm 10 afviser den ved "npm ci")
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Build ----------
FROM base AS build
# postinstall kører "prisma generate", så skema og konfiguration skal med før npm ci
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

# ---------- Kørsel ----------
FROM base AS runner
# PDF-eksport kræver LibreOffice (ca. 500 MB ekstra og en del hukommelse under konvertering).
# Slå til med: docker build --build-arg INSTALL_LIBREOFFICE=true – eller ret standardværdien her.
ARG INSTALL_LIBREOFFICE=false
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && if [ "$INSTALL_LIBREOFFICE" = "true" ]; then apt-get install -y --no-install-recommends libreoffice-impress fonts-liberation fonts-dejavu; fi \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  UPLOAD_DIR=/app/uploads

# Hele projektet inkl. devDependencies: prisma (migreringer) og tsx (import af emissionsfaktorer) bruges i containeren
COPY --from=build --chown=node:node /app ./
# Mappen skal findes med rette ejer, så et vedvarende volumen på /app/uploads får skriveadgang
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node
EXPOSE 3000
CMD ["sh", "docker-entrypoint.sh"]
