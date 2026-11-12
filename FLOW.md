# Flowet i ESG-rapporteringsværktøjet

Dokumentet beskriver hele forløbet fra den første login til en færdig rapport i PowerPoint eller PDF. Det følger appen, som den er efter fase 1–6. Tekniske detaljer står i [README.md](README.md), og den samlede plan står i [PLAN.md](PLAN.md).

```
Login ─► Opret koncern ─► Selskaber og lokationer ─► Inviter brugere ─► Rapporteringsår
   ─► Rapportopsætning ─► Indrapportering (moduler) ─► Nøgletal beregnes
   ─► Selskab indsender ─► Koncernadmin godkender ─► Rapport godkendes ─► Eksport
```

---

## 0. Roller

| Rolle | Hvem | Kan |
|---|---|---|
| **Koncernadmin** (`ORG_ADMIN`) | Den, der styrer rapporteringen i koncernen | Alt i koncernen: struktur, brugere, rapportår, rapporter, godkendelse og eksport |
| **Selskabsansvarlig** (`COMPANY_MANAGER`) | Kontaktperson i et datterselskab | Ét selskab: stamdata, lokationer, moduler, invitationer til selskabet og indsendelse |
| **Lokationsbidragyder** (`LOCATION_CONTRIBUTOR`) | Fx driftsleder på et lager | Kun lokationsmodulerne for én lokation |
| **Læser/revisor** (`VIEWER`) | Revisor, ledelse | Kan se alt, også rapporter og eksport, men ikke ændre noget |
| **Platform-admin** | Platformens ejer (`PLATFORM_ADMIN_EMAILS`) | Admin-dashboard på `/admin` på tværs af koncerner |

Har man ikke adgang til noget, vises en 404-side, så man ikke kan se, at det findes.

---

## 1. Login

**Sider:** `/login` → mail → `/auth/verify`

1. Brugeren skriver sin e-mail på `/login`.
2. Der sendes et login-link, som virker i 15 minutter. Svaret er det samme, uanset om adressen findes, så det ikke afslører, hvem der har adgang.
3. Linket åbner `/auth/verify`, hvor brugeren trykker på en knap for at logge ind. Knappen findes, fordi mailscannere ellers kan bruge linket op ved at åbne det.
4. Der oprettes en session, og brugeren sendes til forsiden `/`.

Uden `SMTP_URL` (i udvikling) vises linket direkte på siden og i serverkonsollen.

## 2. Opret koncern (første gang)

**Side:** `/`

- Har brugeren adgang til **én** koncern, sendes hen direkte videre til `/org/[orgId]`.
- Har hen adgang til **flere**, vælger hen koncern.
- Har hen **ingen**, og er tilmelding slået til (`allowSignup`), kan hen oprette en koncern: koncernens navn plus det øverste moderselskab med navn og CVR. Brugeren bliver koncernadmin.

## 3. Koncernstruktur: selskaber og lokationer

**Sider:** `/org/[orgId]`, `/org/[orgId]/companies/new`, `/org/[orgId]/companies/[companyId]`, `/org/[orgId]/locations/[locationId]`

Hierarkiet er **Koncern → Selskab (med moderselskab) → Lokation**.

1. **Datterselskaber** oprettes med CVR. Ved opslag i CVR hentes navn, adresse, selskabsform og branchekoder (NACE). Hvert selskab har et standardvalg for, om det tages med i konsoliderede rapporter. Valget kan ændres for hver rapport.
2. **Lokationer** oprettes under et selskab: navn, adresse, funktion og om selskabet ejer, lejer eller driver lokationen. Der kan også angives driftsperiode og geolokation.
   - Appen kan foreslå lokationer ud fra selskabets produktionsenheder i CVR.
   - Adressen kan geokodes til koordinater (B1 pkt. 27e).
3. Selskaber og lokationer arkiveres i stedet for at blive slettet.

## 4. Inviter brugere

**Side:** `/org/[orgId]/members` (og invitationsfelter på selskabs- og lokationssiderne)

1. Koncernadmin (eller en selskabsansvarlig inden for sit selskab) inviterer en e-mail med en rolle og, hvis det er relevant, et selskab eller en lokation.
2. Den inviterede får en mail med et link til `/invite/[token]`. Linket virker i et begrænset antal dage.
3. Når hen accepterer, oprettes brugeren og adgangen, og hen logges ind og sendes til koncernen. Invitationslinket beviser, at hen ejer mailadressen.

Invitationer kan trækkes tilbage, og adgange kan fjernes. En koncern skal altid have mindst én koncernadmin.

## 5. Rapporteringsår

**Side:** `/org/[orgId]/reports` (oprettelse af år)

1. Koncernadmin opretter et rapporteringsår med start- og slutdato. Året følger regnskabsåret.
2. Appen opretter **automatisk en koncernrapport** for året ("ESG-opgørelse ÅÅÅÅ"):
   - Har moderselskabet datterselskaber, bliver den **konsolideret**, og de selskaber, der er markeret til konsolidering, tages med.
   - Ellers bliver den **individuel**.
3. Brugeren sendes videre til rapportens side.

Data indsamles **pr. selskab og rapporteringsår**, ikke pr. rapport. Samme data kan derfor bruges i flere rapporter, fx både koncernrapporten og en individuel rapport for et datterselskab.

## 6. Rapportopsætning

**Sider:** `/org/[orgId]/reports/new`, `/org/[orgId]/reports/[reportId]`

En rapport er en opsætning over et rapporteringsår:

| Felt | Betydning |
|---|---|
| Modul | **B** (Basismodul, B1–B11) eller **B+C** (plus Udvidet Modul, C1–C9) |
| Afgrænsning | **Individuel** (kun det rapporterende selskab) eller **konsolideret** (plus udvalgte datterselskaber) |
| Rapporterende selskab | Normalt moderselskabet |
| Omfattede selskaber | Hvilke selskaber der tælles med |
| Undtagelser og udeladelser | Fritekst (B1) |
| Konsolideret omsætning | Fra koncernregnskabet. Bruges til CO₂e-intensitet, så koncerninterne salg ikke tælles dobbelt |

Valget **B+C** styrer, at C-felterne vises i modulerne for de omfattede selskaber.

### Emissionsfaktorer (valgfrit)

**Side:** `/org/[orgId]/settings/factors`

Som standard bruges Klimakompassets officielle emissionsfaktorer for rapporteringsåret. Koncernadmin kan kopiere sættet, rette enkelte faktorer (fx leverandørspecifikke) og vælge sættet for et bestemt år. Det kan ikke ændres, når året har en godkendt rapport.

### Logo (valgfrit)

Under **Indstillinger** kan koncernens logo uploades. Det kommer med i eksporten.

## 7. Indrapportering (moduler)

**Sider:** `/org/[orgId]/companies/[companyId]/modules/[moduleKey]` og `/org/[orgId]/locations/[locationId]/modules/[moduleKey]`

Selskabet og dets lokationer udfylder modulerne for det valgte år.

### Selskabsmoduler

| # | Modul | VS |
|---|---|---|
| 1 | Generelle oplysninger | B1, C1 |
| 2 | Politikker, praksisser og initiativer (politikregister) | B2, B7, C2 |
| 3 | Medarbejdere og ansættelsesforhold | B8, C5 |
| 4 | Arbejdsmiljø og sikkerhed | B9 |
| 5 | Løn, overenskomst og uddannelse | B10 |
| 6 | Menneskerettigheder | C6, C7 |
| 7 | Ledelse og forretningsadfærd | B11, C8, C9 |
| 8 | Direkte emissioner – Scope 1 (med kobling til lokationer) | B3 |
| 9 | Materialer og ressourceforbrug | B7 |
| 10 | Klimamål og klimarisici | C3, C4 |
| 11 | Scope 3 – værdikæden (frivilligt) | B3 |

### Lokationsmoduler

| # | Modul | VS |
|---|---|---|
| 1 | Generelle lokationsoplysninger (fra stamdata) | B1 |
| 2 | Energi og scope 2 | B3 |
| 3 | Vand | B6 |
| 4 | Affald | B7 |
| 5 | Forurening | B4 |
| 6 | Biodiversitet og geografiske forhold | B5, B6 |
| 7 | Lokale indsatser og klimarisici | B2, C2, C3, C4 |

### Sådan virker et modul

- **Autosave:** svar gemmes ca. 1 sekund efter sidste ændring.
- **Felter tilpasser sig:** felter vises eller skjules ud fra andre svar ("vis hvis Ja"), antal ansatte (fx krav over 10 ansatte) og om rapporten er B eller B+C.
- **Vejledning:** hvert felt har en vejledningstekst og en henvisning til VS-punktet.
- **Dokumentation:** der kan uploades filer pr. sektion.
- **Data mangler:** en sektion kan markeres som manglende med en begrundelse.
- **Plausibilitetstjek:** advarsler, der ikke blokerer, fx når antal ansatte i B8 ikke passer med B1.
- **Status pr. modul:** *Ikke startet → I gang → Færdig*, eller *Ikke relevant* med begrundelse.

Data låses, når selskabet er indsendt eller indgår i en godkendt rapport.

## 8. Automatiske beregninger

**Sider:** selskabssiden og `/org/[orgId]/companies/[companyId]/results` ("Se alle nøgletal")

Nøgletallene beregnes direkte fra de gemte svar, uden et ekstra trin:

- **Energi (MWh)** ud fra brændsler (standardbrændværdier) og el/fjernvarme.
- **Scope 1** ud fra brændsler, kørsel og kølemidler.
- **Scope 2**, både lokationsbaseret (Miljødeklarationen) og markedsbaseret (Eldeklarationen og oprindelsesgarantier).
- **Scope 3** som mængde × faktor eller leverandørens eget tal. Kategori 3 beregnes ud fra scope 1 og 2.
- **Vand, affald og sociale nøgletal**, fx ulykkesfrekvens, lønforskel og medarbejderomsætning.
- **Sammenligning med sidste år.** Ændringer over ±50 % markeres.

Manglende faktorer, estimater og manglende input vises som bemærkninger. Appen gætter ikke.

## 9. Indsendelse fra selskabet

**Komponent:** indsendelsespanelet på selskabssiden

1. Når **alle** selskabets moduler og lokationsmoduler står som *Færdig* eller *Ikke relevant*, kan den selskabsansvarlige trykke **Indsend**. Der kan skrives en kommentar.
2. Selskabets status går fra `DRAFT` til `SUBMITTED`. Data låses.
3. Koncernadmin får en mail med et link til selskabet.

## 10. Gennemgang hos koncernadmin

Koncernadmin gennemgår data og nøgletal og vælger:

- **Godkend og lås**: status bliver `APPROVED`.
- **Send tilbage** med en kommentar (påkrævet): status bliver `RETURNED`, og data låses op. Den selskabsansvarlige får en mail med kommentaren og et link.
  → Selskabet retter og indsender igen (tilbage til trin 9).

Godkendte data kan genåbnes, så længe selskabet ikke indgår i en godkendt rapport.

```
DRAFT ──Indsend──► SUBMITTED ──Godkend──► APPROVED
  ▲                    │                      │
  └──── RETURNED ◄─────┴──── Send tilbage ────┘
```

## 11. Konsolidering og rapportgodkendelse

**Side:** `/org/[orgId]/reports/[reportId]`

Rapportsiden viser:
- status for hvert omfattet selskab,
- koncernens konsoliderede nøgletal med fordeling pr. selskab,
- en politikmatrix (B2) på tværs af selskaberne,
- sammenligning med sidste år.

**Konsolideringsregler** (fuld konsolidering, 100 %):
- Absolutte tal summeres.
- Rater beregnes forfra ud fra de summerede rådata (ulykkesfrekvens, lønforskel, overenskomstdækning, uddannelsestimer, medarbejderomsætning).
- CO₂e-intensiteten bruger den konsoliderede omsætning, hvis den er angivet.
- Kønsfordelingen i øverste ledelsesorgan (C9) er det rapporterende selskabs egen.

**Rapportstatus:** *Under udarbejdelse* (`DRAFT`) → *Til gennemgang* (`IN_REVIEW`) → *Godkendt* (`APPROVED`).

En rapport kan først godkendes, når **alle omfattede selskaber er godkendt**. Når rapporten er godkendt, er den låst og kan ikke slettes, og selskabernes data for året er låst. Skal noget rettes, sættes rapporten tilbage til *Under udarbejdelse*.

## 12. Eksport

**Endpoint:** `/api/reports/[reportId]/export?format=pptx|pdf`. Koncernadmin og læsere kan hente rapporten.

- **PowerPoint:** Erhvervsstyrelsens ESG-skabelon (v3.3) udfyldes. Det gælder firmanavn, årstal, indholdsfortegnelse, tabeller og logo.
- Slides, der ikke er relevante, fjernes, som skabelonen anviser. Ved en B-rapport fjernes hele Udvidet Modul.
- I en koncernrapport summeres tal. Ja/nej-svar vises som "Ja", "Nej" eller "Delvist (x af y)". Fritekst får selskabets navn foran.
- Lange tabeller fortsætter på ekstra slides, mærket "– fortsat".
- En rapport, der ikke er godkendt, får **"Udkast"** på forsiden.
- **PDF** laves af LibreOffice ud fra PowerPoint-filen og tager typisk 15–45 sekunder.

Eksporten kan hentes når som helst som udkast. Den endelige version hentes, når rapporten er godkendt.

---

## Næste år

1. Koncernadmin opretter et nyt rapporteringsår. Der laves automatisk en ny koncernrapport.
2. Struktur, brugere og adgange er de samme som sidste år. Data for det nye år starter forfra.
3. Nøgletal og rapportsiden viser automatisk ændringen fra sidste år.

## Sporbarhed

- Alle ændringer i en koncern (selskaber, invitationer, indsendelser, godkendelser, rapportstatus, eksport) logges i koncernens **aktivitetslog** (`AuditLog`).
- Handlinger i platformens admin-dashboard logges i `AdminLog` og også i koncernens egen log.
