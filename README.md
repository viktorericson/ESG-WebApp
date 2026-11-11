# ESG Rapportering

Webapp til ESG-indrapportering efter VSME. Datterselskaber og deres lokationer indrapporterer, og data samles til en konsolideret rapport for moderselskabet, der eksporteres til PowerPoint/PDF. Se [PLAN.md](PLAN.md) for den samlede plan.

**Status: Fase 1–6 er færdige.** Fase 6 er klimamål og -risici (C3/C4), lokale indsatser, Scope 3 og sammenligning med sidste år. Fase 5 er eksport til PowerPoint og PDF i Erhvervsstyrelsens ESG-skabelon. Fase 4 er konsolidering og gennemgang. Fase 3 er de automatiske beregninger med Klimakompassets emissionsfaktorer. Hele Basismodulet (B1–B11) kan indrapporteres. Det omfatter 9 selskabsmoduler (inkl. politikregister og Scope 1 med kobling til lokationer) og 5 lokationsmoduler (energi/scope 2, vand, affald, forurening og biodiversitet/vandstress) samt de relevante C-felter (C1, C2, C5, C8, C9) og modul 6 Menneskerettigheder (C6, C7). 

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

PDF-eksporten kræver LibreOffice (`brew install --cask libreoffice` på Mac, `apt install libreoffice-impress` på Linux). Findes `soffice` et andet sted end standardstien, sættes `SOFFICE_PATH`. Uden LibreOffice kan rapporter stadig hentes som PowerPoint.

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
src/lib/calc/               Beregningsmotor: energi, scope 1/2, vand, affald, sociale nøgletal og konsolidering (+ tests)
src/lib/review.ts           Klar-til-indsendelse pr. selskab og indsendelsesstatus
src/lib/export/             Eksport: eksportmodel, udfyldning af skabelonen, OOXML-værktøjer, PDF (+ tests)
templates/                  Erhvervsstyrelsens ESG-skabelon (version 3.3), som eksporten udfylder
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

## Klimamål, klimarisici og Scope 3 (fase 6)

- **Selskabsmodul 10 – Klimamål og klimarisici (C3/C4):** reduktionsmål pr. scope med basisår og målår, tiltag, omstillingsplan og klimarisici med eksponering, følsomhed, tidshorisont og tilpasning. Omstillingsplanen vises kun for sektorer med stor klimaindvirkning (NACE A–H og fast ejendom, `src/lib/nace.ts`).
- **Lokationsmodul 7 – Lokale indsatser og klimarisici:** lokale initiativer knyttes til et emne i politikregistret og kommer med i C2. Lokale klimatiltag kommer med i C3's liste over tiltag, og lokale klimafarer (skybrud, oversvømmelse mv.) kommer med i C4-tabellen.
- **Selskabsmodul 11 – Scope 3:** frivilligt forløb i fire trin: om scope 3 opgøres, vurdering af de 15 kategorier, aktiviteter og afgrænsning. Aktiviteter beregnes som mængde × Klimakompasset-faktor (395 faktorer for indkøb, transport, affald og solgte produkter) eller med leverandørens eget tal. Kategori 3 (brændsels- og energirelaterede aktiviteter) beregnes automatisk ud fra scope 1 og 2.
- **Sammenligning med sidste år:** nøgletalssiden og rapportsiden viser året før, når der er data, med ændringen i procent. Ændringer over ±50 % markeres.
- **Eksport:** Scope 3 står lige efter scope 1 og 2 (VS pkt. 52), også i en B-rapport. C3- og C4-slides udfyldes, når der er data.

## Gennemgang og konsolidering

1. Selskabet udfylder sine moduler og lokationsmoduler.
2. Når alle er færdige eller markeret "ikke relevant", indsender den selskabsansvarlige data til gennemgang. Data låses, og koncernadmin får en mail.
3. Koncernadmin godkender dem ("Godkend og lås") eller sender dem tilbage med en kommentar, der også sendes på mail. Godkendte data kan genåbnes.
4. En rapport kan først godkendes, når alle omfattede selskaber er godkendt. Derefter er alt låst.

Rapportsiden viser:
- status pr. selskab,
- koncernens konsoliderede nøgletal med fordeling pr. selskab,
- en politikmatrix (B2) på tværs af selskaberne.

Konsolideringen er fuld (100 %) for alle omfattede selskaber:
- Absolutte tal summeres.
- Rater beregnes forfra ud fra de summerede rådata: ulykkesfrekvens, lønforskel, overenskomstdækning, uddannelsestimer og medarbejderomsætning.
- CO₂e-intensiteten bruger koncernens konsoliderede omsætning, hvis den er angivet i rapportopsætningen.
- Kønsfordelingen i det øverste ledelsesorgan (C9) er det rapporterende selskabs egen.

## Eksport (PowerPoint og PDF)

På rapportsiden kan koncernadmin og læsere hente rapporten som PowerPoint eller PDF. Eksporten udfylder Erhvervsstyrelsens ESG-skabelon (`templates/esg_skabelon_dansk.pptx`):

- **Layout:** skabelonens design, begrebsforklaringer og vejledningsbokse bevares. Vejledningsslides 1–4 fjernes. Firmanavn, årstal, indholdsfortegnelse med sidetal og alle tabeller udfyldes.
- **Ikke relevante punkter:** slides fjernes, som skabelonen anviser. Det gælder fx B4, B5, materialer, lande ud over Danmark og C8/C9, når der ikke er noget at oplyse, samt hele Udvidet Modul ved en B-rapport. C3/C4 og Scope 3 fjernes, indtil de kan indrapporteres (fase 6).
- **Koncern:** tal summeres. Ja/nej-svar vises som "Ja", "Nej" eller "Delvist (x af y selskaber)", og fritekst får selskabets navn foran.
- **Lange tabeller** (lokationer, datterselskaber, affald, C2 mv.) fortsætter på en kopi af sliden, mærket "– fortsat".
- **Udkast:** en rapport, der ikke er godkendt, får "Udkast" på forsiden.
- **Logo:** koncernens logo uploades under Indstillinger. Det vises på forsiden, bagsiden og øverst på hver side.
- **PDF:** laves af LibreOffice ud fra PowerPoint-filen, så de to altid er ens. Det tager typisk 15–45 sekunder.

Udfyldningen arbejder direkte på skabelonens XML (`src/lib/export/pptx/ooxml.ts`), så alt, der ikke udfyldes, står præcis som i originalen. Kommer der en ny version af skabelonen, skal slidenumrene i `esg-template.ts` tjekkes. Testene fejler, hvis der står pladsholdere tilbage.

## Platform-admin

Platformens ejer har et admin-dashboard på `/admin` (linket "Admin" står i topmenuen). Adgangen styres af `PLATFORM_ADMIN_EMAILS` i `.env` (kommasepareret), så ingen kan give sig selv adgang gennem appen. Alle andre får 404.

- **Overblik:** antal koncerner, selskaber, brugere, filer og rapporter, de seneste hændelser i koncernerne og en log over admin-handlinger.
- **Koncerner:** selskaber med CVR og indsendelsesstatus, brugere og roller, ventende invitationer, rapporter, filer og aktivitet. Ejeren kan give sig selv adgang som læser eller koncernadmin, fx ved support. Det står i koncernens aktivitetslog.
- **Brugere:** søgning og en side pr. bruger. Her kan ejeren rette navn og e-mail, skifte mellem koncernadmin og læser, fjerne og give adgange, logge brugeren ud på alle enheder og spærre brugeren. En spærret bruger logges ud og kan ikke logge ind igen; data og adgange bevares. En koncern kan ikke stå uden koncernadmin.
- **Filer:** alle dokumentationsfiler med koncern, selskab, modul og uploader, som kan hentes eller slettes, samt koncernernes rapportlogoer.

Alle ændringer gemmes i `AdminLog`, og ændringer i en koncern skrives også i koncernens egen aktivitetslog.

## Teknik

Next.js 16 (App Router, uden Cache Components), React 19, Tailwind 4, Prisma 7 med `@prisma/adapter-pg` og PostgreSQL. Login-links og invitationer bruges via en knap (POST), så mailscannere ikke kan bruge dem op ved at åbne dem.
