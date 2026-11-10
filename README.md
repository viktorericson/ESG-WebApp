# ESG Rapportering

Webapp til ESG-indrapportering efter VSME. Datterselskaber og deres lokationer indrapporterer, og data samles til en konsolideret rapport for moderselskabet, der eksporteres til PowerPoint/PDF. Se [PLAN.md](PLAN.md) for den samlede plan.

**Status: Fase 1, 2 og 3 er færdige.** Fase 3 er de automatiske beregninger med Klimakompassets emissionsfaktorer. Hele Basismodulet (B1–B11) kan indrapporteres. Det omfatter 9 selskabsmoduler (inkl. politikregister og Scope 1 med kobling til lokationer) og 5 lokationsmoduler (energi/scope 2, vand, affald, forurening og biodiversitet/vandstress) samt de relevante C-felter (C1, C2, C5, C8, C9). Tilbage er C-modulerne om menneskerettigheder (C6/C7), klimamål og -risici (C3/C4) og lokale indsatser, som hører til fase 6.

## Kom i gang

Kræver Node 20+. Databasen er en lokal Postgres via `prisma dev`, så Docker er ikke nødvendig.

```bash
npm install
cp .env.example .env
npm run db:start        # starter lokal Postgres i baggrunden
npx prisma migrate dev  # opretter tabellerne
npm run factors:import -- data/factors/klimakompasset_emissionsfaktorark_2015-2035_2024_v5.xlsx
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
| `npm run factors:import -- <xlsx>` | Importér Klimakompassets emissionsfaktorark som faktorsæt (se `data/factors/README.md`) |

## Struktur

```
prisma/schema.prisma        Datamodel
src/lib/permissions.ts      Adgangsregler (rene funktioner + tests)
src/lib/report-scope.ts     Rapportafgrænsning: individuel/konsolideret, omfattede selskaber (+ tests)
src/lib/forms/              Skemamotor: typer, engine (synlighed/validering/fremdrift), registry og moduler
src/lib/module-data.ts      Adgang, kontekst (B/B+C, antal ansatte) og lås for moduldata
src/lib/storage.ts          Fil-lagring (lokal disk i udvikling, interface til S3/Azure)
src/lib/calc/               Beregningsmotor: energi, scope 1/2, vand, affald og sociale nøgletal (+ tests)
data/factors/               Klimakompassets emissionsfaktorark (Energistyrelsen)
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
- Moduler kan have plausibilitetstjek (`checks`), der advarer uden at blokere. Fx sammenlignes antal ansatte i B8 med B1, og arbejdstimer pr. ansat tjekkes.

## Beregninger og emissionsfaktorer

Nøgletallene beregnes direkte fra de gemte svar. De vises på selskabssiden og under "Se alle nøgletal".

- **Faktorer:** Klimakompassets emissionsfaktorark fra Energistyrelsen (2015–2035, scope 1/2/3 og biogen CO₂ pr. år, GWP efter IPCC AR6). Beregningen bruger faktorerne for selve rapporteringsåret.
- **Scope 2:** Beregnes som Klimakompasset gør. Lokationsbaseret bruger Energinets Miljødeklaration (kræves af VSME). Markedsbaseret bruger Eldeklarationen, hvor el dækket af oprindelsesgarantier trækkes fra. Fjernvarme bruger Klimakompassets landsgennemsnit; markedsbaseret kan bruge leverandørens egen faktor.
- **Energi (MWh):** Brændsler omregnes med Energistyrelsens standardbrændværdier for 2024 (`src/lib/calc/energy-content.ts`, hvor afledte værdier er dokumenteret). Kørte km omregnes til liter via Klimakompassets faktorer.
- **Egne faktorsæt:** Under Indstillinger → Emissionsfaktorer kan et officielt sæt kopieres og enkelte faktorer rettes, fx leverandørspecifikke værdier. Hvert rapporteringsår kan bruge sit eget sæt. Kan ikke ændres, når året har en godkendt rapport.
- **Bemærkninger:** Manglende faktorer, estimater og manglende input vises som bemærkninger ved nøgletallene i stedet for at blive gættet.

## Teknik

Next.js 16 (App Router, uden Cache Components), React 19, Tailwind 4, Prisma 7 med `@prisma/adapter-pg` og PostgreSQL. Login-links og invitationer bruges via en knap (POST), så mailscannere ikke kan bruge dem op ved at åbne dem.
