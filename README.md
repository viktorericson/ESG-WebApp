# ESG Rapportering

Webapp til ESG-indrapportering efter VSME. Datterselskaber og deres lokationer indrapporterer, og data samles til en konsolideret rapport for moderselskabet, der eksporteres til PowerPoint/PDF. Se [PLAN.md](PLAN.md) for den samlede plan.

**Status: Fase 1, 1b og 2a er færdige.** Fase 2a er skemamotoren med de første moduler: B1 for selskaber og energi/scope 2 for lokationer. De omfatter login med magic link, koncernstruktur (koncern → selskaber → lokationer med geolokation og driftsperiode), roller og invitationer, aktivitetslog og rapportopsætning. Rapportopsætningen dækker rapporteringsår og rapporter med B eller B+C, individuel eller konsolideret afgrænsning, omfattede selskaber, udeladelser og godkendelsesstatus. Modulstrukturen er beskrevet i [ModulOpdeling.md](ModulOpdeling.md).

## Kom i gang

Kræver Node 20+. Databasen er en lokal Postgres via `prisma dev`, så Docker er ikke nødvendig.

```bash
npm install
cp .env.example .env
npm run db:start        # starter lokal Postgres i baggrunden
npx prisma migrate dev  # opretter tabellerne
npm run dev
```

Åbn http://localhost:3000 og log ind med en vilkårlig e-mail. Uden `SMTP_URL` vises login- og invitationslinks direkte på siden og i serverkonsollen.

> `prisma dev` kører kun én database (`template1`), så Prisma bruger den separate skygge-server på port 51219 til migreringer (`SHADOW_DATABASE_URL`). `npm run db:start` låser portene, så de passer med `.env.example`.

## Scripts

| Script | Formål |
|---|---|
| `npm run dev` | Udviklingsserver |
| `npm run build` | Produktionsbuild |
| `npm test` | Enhedstests (vitest) |
| `npm run typecheck` | Genererer route-typer og kører TypeScript |
| `npm run db:start` / `db:stop` | Start/stop lokal Postgres |
| `npm run db:migrate` | Ny migration efter ændring i `prisma/schema.prisma` |
| `npm run db:studio` | Prisma Studio (se data) |

## Struktur

```
prisma/schema.prisma        Datamodel
src/lib/permissions.ts      Adgangsregler (rene funktioner + tests)
src/lib/report-scope.ts     Rapportafgrænsning: individuel/konsolideret, omfattede selskaber (+ tests)
src/lib/forms/              Skemamotor: typer, engine (synlighed/validering/fremdrift), registry og moduler
src/lib/module-data.ts      Adgang, kontekst (B/B+C, antal ansatte) og lås for moduldata
src/lib/storage.ts          Fil-lagring (lokal disk i udvikling, interface til S3/Azure)
src/components/forms/       Modulformular med autosave, felter, tabeller og dokumentationsblok
src/lib/auth.ts             Session → bruger → adgang (Data Access Layer)
src/lib/actions/            Server actions (login, koncern, selskaber, lokationer, invitationer)
src/lib/validation.ts       zod-skemaer
src/app/org/[orgId]/        Koncernens sider
src/components/             UI-komponenter
```

## Roller

| Rolle | Adgang |
|---|---|
| Koncernadmin | Alt i koncernen: struktur, brugere, rapporter |
| Selskabsansvarlig | Ét selskab: stamdata, lokationer og invitationer til selskabet |
| Lokationsbidragyder | Én lokation (indrapportering fra fase 2) |
| Læser/revisor | Kan se alt inkl. rapporter, men ikke ændre noget |

Manglende adgang vises som 404, så det ikke afsløres, hvad der findes. Hver server action tjekker selv adgangen.

## Rapportmodel

Data indsamles pr. **selskab og rapporteringsår** og genbruges på tværs af rapporter. En **rapport** er en opsætning over året:
- modul (B eller B+C),
- individuel eller konsolideret afgrænsning,
- rapporterende selskab og omfattede selskaber,
- undtagelser og udeladelser,
- status (under udarbejdelse → til gennemgang → godkendt).

Når et rapporteringsår oprettes, laves der automatisk en koncernrapport. Konsolideringsflaget på et selskab er kun standardvalget, og det kan ændres for hver rapport. En godkendt rapport er låst.

## Skemaer (moduler)

Hvert modul defineres i `src/lib/forms/modules/*.ts` som sektioner og felter. Hvert felt har:
- type,
- VS-mapping (fx `B1.27e.iv`),
- krav (fx kun over 10 ansatte),
- betingelser ("vis hvis Ja"),
- vejledningstekster.

Samme definition bruges af formularen og af serverens validering. Et nyt modul tilføjes ved at skrive definitionen og registrere den i `registry.ts`.

- Svar gemmes automatisk (ca. 1 sekund efter sidste ændring) pr. modul, mål (selskab eller lokation) og rapporteringsår.
- Status: ikke startet → i gang → færdig, eller ikke relevant med begrundelse. En sektion kan markeres "data mangler" med en begrundelse.
- C-felter vises kun, når en rapport for selskabet i året er sat til B+C.
- Data låses, når selskabet indgår i en godkendt rapport.

## Teknik

Next.js 16 (App Router, uden Cache Components), React 19, Tailwind 4, Prisma 7 med `@prisma/adapter-pg` og PostgreSQL. Login-links og invitationer bruges via en knap (POST), så mailscannere ikke kan bruge dem op ved at åbne dem.
