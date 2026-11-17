// Bruges af docker-entrypoint.sh: afslutter med 0, hvis databasen har et fælles faktorsæt, ellers 3.
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const { rows } = await client.query('SELECT count(*)::int AS n FROM "FactorSet" WHERE "organizationId" IS NULL');
  process.exitCode = rows[0].n > 0 ? 0 : 3;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
