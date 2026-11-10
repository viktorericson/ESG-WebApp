# ESG-rapporteringsapp – plan

Grundlag: de fire Jotform-skemaer og Erhvervsstyrelsens PowerPoint-skabelon `ESG_skabelon_dansk.pptx` (41 slides). Skabelonen følger VSME: Basismodul B1–B11 og Udvidet Modul C1–C9.

Målet er at erstatte Jotform-flowet med én webapp, hvor:
1. hvert datterselskab (og hver af dets lokationer) indrapporterer sine data,
2. appen selv omregner enheder og beregner KPI'er og CO₂e,
3. modervirksomheden får en konsolideret rapport,
4. rapporten eksporteres til PowerPoint i Erhvervsstyrelsens skabelon og til PDF.

---

## 1. Hvad skemaerne indeholder i dag

### A. "ESG rapporteringsspørgeskema – Basis" (252224840425350) → én pr. selskab
| VSME | Felter |
|---|---|
| B1 | Rapporteringsår, navn, CVR, individuelt/konsolideret, juridisk form, NACE-koder, balance, omsætning, FTE, datterselskaber (navn, CVR, adresse), bæredygtighedscertificeringer (navn, udsteder, dato, score og upload) |
| B2 | For 10 emner (klima, forurening, vand, biodiversitet, cirkulær økonomi, egen arbejdsstyrke, værdikæde, lokalsamfund, forbrugere, forretningsadfærd): praksis/politik (Ja, offentlig / Ja, ikke offentlig / Nej) + mål (Ja/Nej) + kommentar |
| B4 | Rapporteringspligt for forurening (lovpligtig / frivillig via EMAS eller ISO 14001 / nej) + tabel: stof, medie (luft/vand/jord), kg, link |
| B7 | Cirkulær økonomi (Ja/Nej + beskrivelse), betydelige materialeflows (Ja/Nej) + tabel: materiale, enhed, mængde, formål |
| B8 | Medarbejdertabel: land, køn, ansættelsestype, enhed (antal/FTE), værdi. Medarbejderomsætning (>50 ansatte): fratrådte, antal ved start og slut *(hører reelt under C5, se 1b)* |
| B9 | Arbejdsulykker, dødsfald |
| B10 | Minimumsløn via overenskomst, alle ≥ minimumsløn, antal dækket af overenskomst, arbejdstimer, bruttoløn og træningstimer pr. køn |
| B11 | Domme og bøder for korruption og bestikkelse |

### B. "Lokationer og faciliteter" (252291732722051) → én pr. selskab
Liste med lokation (type) og adresse. Den bliver til **Location**-objekter i appen.

### C. "Lokation/facilitetsbaseret data" (252224434601042) → én pr. lokation
Funktion · naturorienteret område (ha, beskrivelse, upload) · indkøbt el (kWh/MWh/GJ, eldeklaration eller miljødeklaration) · egenproduceret el · fjernvarme · vand (indtag, regnvand, ikke-udledt vand og udledning, i L eller m³) · affald (type, enhed, genereret, farligt/ikke-farligt, genanvendt, bortskaffet).
For hver datatype: **datakilde** (system, afdeling, person, rolle), upload og kommentar.

### D. "Klimaregnskab scope 1" (251511980285357) → én pr. selskab
- Mobil forbrænding: køretøjstype og drivmiddel (16 typer) samt enhed (km/L/kWh/kr.) og mængde
- Stationær forbrænding: brændsel (11 typer), enhed (L/m³/Nm³/ton), mængde, og naturgas med biogasandel
- Procesudledninger: drivhusgas (CO₂, CH₄, N₂O, HFC'er, PFC'er, SF₆, NF₃) og mængde i kg eller ton

### Huller i forhold til skabelonen (skal tilføjes i appen)
- **B3**: CO₂e-intensitet (t CO₂e pr. mio. kr. omsætning) og opdeling af energi i vedvarende og ikke-vedvarende. Begge beregnes, men kræver faktorer og VE-andele.
- **B5**: om lokationen ligger *i eller nær et biodiversitetsfølsomt område* (skemaet spørger kun til "naturorienteret område").
- **B6**: om lokationen ligger i et område med høj vandstress (vandforbrug skal kun oplyses dér).
- **B7**: EAK-koder på affald, så affald kan opdeles i farligt og ikke-farligt efter skabelonen.
- **B9**: arbejdsulykker skal dækkes for både egne ansatte og ikke-ansatte (afklares).
- **C1–C9** (Udvidet Modul) findes ikke i skemaerne. Det er fase 2.
- Scope 2 markedsbaseret og scope 3 indgår ikke (scope 3 er valgfrit i Udvidet Modul).
- **B1**: geolokation (koordinater) for lokationer, som selskabet ejer, lejer eller forvalter (skabelonens pkt. 27e vi–vii).

---

## 1b. Modulstruktur (fra ModulOpdeling.md)

[ModulOpdeling.md](ModulOpdeling.md) er nu **styrende for, hvordan appen organiseres**. Skemaerne er ikke længere bygget som 1:1-kopier af de fire Jotform-skemaer. Jotform-felterne fordeles i stedet i disse moduler:

**Rapportopsætning** (over selskaberne): periode, standardversion, valg af B eller B+C, individuel eller konsolideret rapport, hvilke selskaber der indgår, undtagelser og udeladelser samt kontrol og godkendelse.

**Selskabsblok** (samme opbygning for moder- og datterselskab, så moderens egne data ligger i dets egen blok):

| # | Selskabsmodul | B | C (kun ved B+C) | Kilde i dag |
|---|---|---|---|---|
| 1 | Generelle oplysninger | B1 | C1 | Basis |
| 2 | Politikker, praksisser og initiativer | B2, B7 cirkulær | C2 | Basis |
| 3 | Medarbejdere | B8 | C5 | Basis |
| 4 | Arbejdsmiljø og sikkerhed | B9 | – | Basis |
| 5 | Løn, overenskomst og uddannelse | B10 | – | Basis |
| 6 | Menneskerettigheder | (B2-register) | C6, C7 | nyt |
| 7 | Ledelse og forretningsadfærd | B11 | C8, C9 | Basis |
| 8 | Scope 1 | B3 | (C3) | Scope 1 |
| 9 | Materialer | B7 masseflow | – | Basis |
| 10 | Klimamål og klimarisici | (B3) | C3, C4 | nyt |

**Lokationsblok** (én pr. lokation):

| # | Lokationsmodul | B | C | Kilde i dag |
|---|---|---|---|---|
| 1 | Generelle lokationsoplysninger | B1 (geolokation) | – | Lokationer |
| 2 | Energi og scope 2 | B3 | (C3) | Lokationsdata |
| 3 | Vand | B6 | – | Lokationsdata |
| 4 | Affald | B7 | – | Lokationsdata |
| 5 | Forurening | B4 | – | **flyttes fra Basis** |
| 6 | Biodiversitet og vandstress | B5 (+ B6-hjælp) | – | Lokationsdata + nyt |
| 7 | Lokale indsatser og klimarisici | (B2-register) | C2, C3, C4 | nyt |

**Scope 3**: et selvstændigt modul med eget forløb (vælg relevante kategorier → data → beregning → afgrænsning). Hver registrering knyttes til et selskab og evt. en lokation.

Konsekvenser for designet:
- **Rettelse:** Medarbejderomsætning hører under **C5**, ikke B8. Det bekræftes af skabelonen (slide 33). Jotform har den i Basis.
- **Fælles politikregister (B2):** Politikker indtastes én gang pr. selskab. C2, C6 og de lokale indsatser linker til registret i stedet for at gentage data.
- **Scope 1-kilder** registreres på selskabet, men kan knyttes til en lokation (fx et gasfyr på lageret). De indgår både i scope 1 og i energiforbruget og vises i lokationens energioverblik, men tælles kun én gang.
- **Stamdata og periodedata adskilles** i hvert modul. Fx er forsyningsform og målernummer stamdata, mens årets kWh er periodedata. Stamdata genbruges fra år til år.
- **C-felter vises kun, når rapporten er sat til B+C.** Derfor kan C-modulerne bygges gradvist uden at ændre B-flowet.
- **Hvert felt mappes til ét eller flere VS-punkter** (fx `B8.40a`). Den mapping bruger både statusoversigten og rapportgeneratoren.
- **Medarbejderdata findes kun på selskabsniveau**, aldrig på lokationerne.

---

## 2. Automatiske beregninger

Alle beregninger ligger i én ren TypeScript-pakke (`/packages/calc`) med enhedstests mod håndregnede eksempler og Klimakompasset.

| KPI (slide) | Beregning |
|---|---|
| Energi i MWh (s. 11) | kWh ÷ 1000, GJ ÷ 3,6. Brændsler omregnes til MWh med brændværdi. Egenproduceret el, biogasandel og VE-andel fra miljødeklaration tæller som vedvarende |
| Scope 1 (s. 12) | Σ mængde × emissionsfaktor (brændsel og køretøj). Proces: kg gas × GWP. Kr. bruges kun som fallback (spend-baseret, markeres som estimat) |
| Scope 2, lokationsbaseret | el (MWh) × national elfaktor for året + fjernvarme × fjernvarmefaktor. Markedsbaseret som ekstra, når der findes miljødeklaration |
| CO₂e-intensitet | (scope 1 + 2) ÷ omsætning i mio. kr. |
| Vandforbrug (s. 15) | indtag + regnvand − udledning |
| Affald (s. 17) | Σ pr. farlig/ikke-farlig, genanvendelsesandel = genanvendt ÷ genereret |
| Ansatte (s. 19–20) | Pivot af medarbejdertabellen: kontrakttype, køn og land |
| Ulykkesfrekvens (s. 21) | ulykker ÷ (timer mænd + timer kvinder) × 200.000 |
| Lønforskel (s. 22) | (timeløn M − timeløn K) ÷ timeløn M × 100, hvor timeløn = bruttoløn ÷ timer |
| Overenskomstdækning (s. 23) | dækket ÷ ansatte i alt × 100 |
| Træningstimer pr. ansat (s. 23) | træningstimer ÷ antal ansatte, samlet og pr. køn |
| Medarbejderomsætning (C5) | fratrådte ÷ gennemsnit(start, slut) × 100 |

**Faktorbibliotek**: versioneret tabel pr. år med kilde. Indhold: Energistyrelsens standardfaktorer for brændsler, Energinets deklaration for el, fjernvarme, køretøjsfaktorer og GWP (AR5/AR6). Admin kan opdatere faktorerne. En rapport gemmer hvilken faktorversion den er beregnet med, så tallene kan reproduceres.

---

## 3. Konsolidering (moder ← datterselskaber)

- Hierarki: **Koncern → Selskab (CVR, parent) → Lokation**. Hvert selskab har et flag for om det indgår i konsolideringen (VSME: fuld konsolidering af datterselskaber).
- **Absolutte tal summeres** (MWh, t CO₂e, m³, kg affald, ansatte, timer, lønsummer, ulykker osv.).
- **Nøgletal genberegnes ud fra de summerede rådata**. Der tages aldrig gennemsnit af procenter, fx beregnes lønforskel og ulykkesfrekvens på koncernens samlede timer og lønsummer.
- Kvalitative svar (B2-politikker, certificeringer, forurening, cirkulær økonomi) vises i en matrix pr. selskab. Moderen skriver eller godkender en koncerntekst, og der er forslag som "Ja, hvis mindst ét selskab har politik".
- Rapporten vises med koncerntotal og drill-down pr. selskab. Selskabsoversigten bliver til B1-tabellen "datterselskaber, der indgår".
- Hvert selskab får også sin egen rapport, som kan eksporteres separat.

---

## 4. Brugerflow og roller

| Rolle | Kan |
|---|---|
| Koncernadmin | Opretter koncern, selskaber og rapporteringsår, inviterer, ser status, godkender, eksporterer |
| Selskabsansvarlig | Udfylder Basis og Scope 1, opretter lokationer, inviterer lokationsansvarlige, indsender |
| Lokationsbidragyder | Udfylder kun sin lokation |
| Læser/revisor | Read-only + adgang til dokumentation |

Flow: Opret rapporteringsår → invitér selskaber via mail-link → selskab udfylder (autosave, "gem og fortsæt senere", fremdriftsbjælke pr. sektion) → **Indsend** → koncernadmin gennemgår (kommentarer pr. felt, send tilbage) → **Godkend og lås** → konsolidér → eksport.

Datakvalitet:
- hvert afsnit har en status: *udfyldt / ikke relevant / data mangler + begrundelse*,
- obligatoriske felter afhænger af virksomhedens størrelse (≤10 eller >10 ansatte, jf. slide 2–4),
- plausibilitetstjek mod sidste år (±50 %) og mod andre selskaber (fx kWh pr. m² eller pr. FTE),
- auditlog over ændringer og dokumentationsfiler pr. datapunkt.

---

## 5. Eksport

- **PowerPoint**: Erhvervsstyrelsens skabelon bruges som master. Placeholders udfyldes ("KLIK FOR AT INDSÆTTE FIRMANAVN", "[Indsæt …]", tabeller, sidetal i indholdsfortegnelsen), og slides for "ikke relevant"-punkter fjernes, som skabelonen selv anviser. Der tilføjes grafer (energimix, scope-fordeling, CO₂e pr. selskab) og et appendiks pr. datterselskab. Værktøj: `pptx-automizer` (template-baseret) og evt. `pptxgenjs` til grafer.
- **PDF**: Den genererede PPTX konverteres med LibreOffice headless, så PDF og PPT altid er identiske.
- **Excel/CSV**: alle rådata og beregninger til revisor (nice-to-have i v1).

---

## 6. Teknisk forslag

| Lag | Valg | Hvorfor |
|---|---|---|
| Frontend + API | Next.js (App Router) + TypeScript | Én kodebase, server actions til formularer |
| UI | Tailwind + shadcn/ui, react-hook-form + zod | Hurtige, validerede skemaer |
| Database | PostgreSQL + Prisma | Relationelt hierarki, nemme aggregeringer |
| Auth | Auth.js (magic link) eller Supabase Auth | Invitationer uden passwords |
| Filer | S3-kompatibel storage i EU | Dokumentationsuploads |
| Eksportjob | Separat worker (Docker med LibreOffice) | PPTX→PDF kan ikke køre serverless |
| Hosting | EU-region (GDPR, persondata om løn og køn) | |

**Skemamotor**: Spørgsmålene defineres som typed config (sektion → felter → betingelser → repeterbare tabeller), ikke som hårdkodede sider. Så kan Jotform-logikken ("vis hvis Ja") genskabes, og spørgsmål kan rettes uden ny kode. De gentagne felter for datakilde, upload og kommentar bliver én genbrugelig komponent.

Datamodel (kerne):
```
Organization ─┬─ Company (cvr, parentId, consolidate, size)
              │     └─ Location (type, address, biodiversitySensitive, waterStress)
              ├─ ReportingPeriod (year, start, end, factorSetId)
              └─ User / Membership (role, scope: org|company|location)
Submission (periodId, companyId|locationId, questionnaire, status, answers JSONB)
Evidence (submissionId, fieldKey, file, system, department, person, role, comment)
FactorSet / EmissionFactor (key, unit, kgCO2e, MWh-per-unit, renewableShare, source)
CalculatedResult (cached, factorSetId, version)
AuditLog
```
Svarene ligger i JSONB pr. skema, valideret med zod. Beregningsmotoren kører på dem og gemmer resultater, så rapporten er reproducerbar.

---

## 7. Faser

| Fase | Indhold | Leverance |
|---|---|---|
| 0. Afklaring | Svar på åbne spørgsmål, valg af faktorkilde, godkendelse af datamodel | Låst scope |
| 1. Fundament ✅ | Repo, auth, koncern/selskab/lokation, roller, invitationer | Man kan oprette en koncern og invitere |
| 1b. Rapportopsætning ✅ | Periode → "rapport" med B/B+C, individuel/konsolideret, omfattede selskaber. Geolokation og driftsperiode på lokationer | Rammen fra ModulOpdeling er på plads |
| 2. Skemaer | Skemamotor med VS-mapping + B-felterne i de 10 selskabsmoduler og 7 lokationsmoduler (afsnit 1b), politikregister, autosave, uploads, datakilder, status pr. modul | Datterselskaber kan indrapportere Basismodulet |
| 3. Beregninger | Faktorbibliotek, enhedsomregning, alle KPI'er i tabellen ovenfor, tests | Live nøgletal pr. selskab |
| 4. Konsolidering | Koncerndashboard, statusoverblik, review og godkendelse, lås | Samlet koncernopgørelse |
| 5. Eksport | PPTX fra skabelon, PDF, Excel | Færdig rapport |
| 6. Udvidelser | C-felterne i modulerne (vises ved B+C), Scope 3-forløb, sammenligning med sidste år, import af gamle Jotform-svar | v2 |

Første milepæl (fase 1–3 + simpel eksport) giver et end-to-end flow for ét selskab. Konsolidering bygges ovenpå.

---

## 8. Åbne spørgsmål
1. Hvem udfylder? Jeres konsulenter for kunderne eller kunderne selv? Skal appen håndtere **flere koncerner/kunder** (multi-tenant)?
2. Hosting og stack: er der krav (Azure, Vercel/Supabase, on-prem)?
3. Faktorkilde: Energistyrelsen/Klimakompasset? Hvilket GWP-sæt (AR5 eller AR6)?
4. Skal Udvidet Modul (C1–C9) med i første version?
5. Findes der eksisterende Jotform-svar, som skal importeres?
6. Konsolidering: altid 100 % for datterselskaber, eller også ejerandelsbaseret?
7. Skal PPTX følge Erhvervsstyrelsens layout 1:1, eller med jeres eget branding?
