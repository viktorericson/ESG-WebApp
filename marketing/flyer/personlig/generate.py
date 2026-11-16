#!/usr/bin/env python3
"""Personlige 3-fold-foldere til blomster-turen.

Kør:  python3 generate.py          (skriver <slug>.html og <slug>.pdf for hver virksomhed)
Teksterne for hver virksomhed står i COMPANIES nedenfor. Fælles layout står i TEMPLATE.
Den almindelige folder (../trifold.html) bliver ikke rørt.
"""
import html
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"

ICONS = {
    "leaf": '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-5 6-8 10-10"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    "chart": '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
    "eye": '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "handshake": '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5 5 0 0 1 5.7-1l.4.2a3 3 0 0 0 2.5 0L21 3"/><path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8"/>',
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    "bike": '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l3 11.5M5.5 17.5 9 10h7l-4.5 7.5H5.5M12 6h2"/>',
    "star": '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    "box": '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    "recycle": '<path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L7 10"/><path d="M11 19h8.2a1.8 1.8 0 0 0 1.6-2.7L19 13"/><path d="m14 16-3 3 3 3M8.3 13.4 7 10l-3.4 1.3"/><path d="m9.4 5.3 1-1.7a1.8 1.8 0 0 1 3.1 0L17.6 10"/><path d="m13.4 9.8 4.2.2.8-3.5"/>',
    "cup": '<path d="M5 8h12v6a6 6 0 0 1-12 0z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M11 2v3M14 2v3"/>',
}


def icon(name):
    return f'<svg viewBox="0 0 24 24">{ICONS[name]}</svg>'


# ---------------------------------------------------------------------------
# Indhold pr. virksomhed. free=True giver tilbuddet om en gratis første rapport.
# Fakta er hentet fra virksomhedernes egne hjemmesider (november 2026).
# ---------------------------------------------------------------------------
COMPANIES = [
    dict(
        slug="by-expressen", name="By-Expressen", free=True,
        h1="I kører grønt.<br><span>Lad os vise det i&nbsp;tal.</span>",
        lead="Hver levering på ladcykel er en tur, der ikke blev kørt i varebil. En ESG-rapport gør forskellen målbar for jer og for jeres kunder.",
        cover_rows=["CO₂e sparet i forhold til varebil", "Medarbejderejerskab og arbejdsmiljø", "Udviklingen år for år"],
        letter="Vi kom forbi på cykel, for hvordan ellers? Vi har valgt jer, fordi I allerede gør det, en ESG-rapport handler om. I fragter byens varer uden udledning, og I er ejet af medarbejderne. Det fortjener at blive dokumenteret.",
        facts=[("100 % emissionsfri", "Levering på ladcykel"), ("Medarbejderejet", "Uafhængig og ejet af holdet"), ("Grønt bindeled", "Mellem byens virksomheder og kunder")],
        why_h="Det kan en ESG-rapport gøre for By-Expressen",
        angles=[
            ("bike", "Hele forretningsmodellen i tal", "Jeres model er bygget på grøn fragt. Rapporten viser det sort på hvidt."),
            ("leaf", "CO₂ sparet mod almindelig fragt", "Vi regner jeres leveringer om til CO₂e undgået i forhold til varebil, et tal I kan give videre til jeres kunder."),
            ("users", "Medarbejderne i centrum", "Ejerskab, arbejdsmiljø og trivsel er en stor del af ESG. Her har I noget at vise frem."),
            ("chart", "Indblik og udvikling over tid", "En rapport om året giver jer et fast overblik og viser, hvordan I udvikler jer."),
        ],
        kpis=[
              ('CO₂e undgået', 'i forhold til varebil', 'Miljø', 'Et tal I kan sætte på hvert tilbud'),
              ('CO₂e pr. levering', 'jeres eget aftryk', 'Miljø', 'Kunderne kan bruge det i deres Scope 3'),
              ('Leveringer', 'pr. år og pr. cykel', 'Miljø', 'Grundlaget for alle jeres CO₂-tal'),
              ('Ejerskab', 'andel ejet af medarbejdere', 'Ledelse', 'Viser, at I ejes af dem, der kører'),
              ('Arbejdsmiljø', 'ulykker og sygefravær', 'Social', 'Sikkerhed i trafikken, dokumenteret'),
              ('Udvikling', 'fra år til år', 'ESG', 'Se, om jeres tiltag&nbsp;virker'),
        ],
        pcf=None,
    ),
    dict(
        slug="b93", name="B.93", free=True,
        h1="Ansvar på og<br><span>uden for banen.</span>",
        lead="En ESG-rapport viser, at B.93 tager ansvar, og giver jer noget konkret at vise sponsorer og partnere.",
        cover_rows=["Klimaaftryk for klubhus og anlæg", "Fællesskab, frivillige og ungdom", "Udviklingen sæson for sæson"],
        letter="Vi kom forbi med en blomst, fordi vi synes, I passer perfekt til ESG. En klub med rødder tilbage til 1893 og mange anlæg på Østerbro har en stor historie at fortælle om ansvar. Den vil vi gerne hjælpe jer med at fortælle i tal.",
        facts=[("Siden 1893", "En af Danmarks ældste klubber"), ("Fodbold og tennis", "Og mange andre idrætter"), ("Østerbro", "Klubhus, hal og stadion")],
        why_h="Det kan en ESG-rapport gøre for B.93",
        angles=[
            ("shield", "Vis, at klubben tager ansvar", "Energi, vand og affald fra anlæggene og det sociale arbejde samlet ét sted."),
            ("star", "Et stærkere omdømme", "ESG passer til jeres profil som klub for byen. En rapport gør det synligt."),
            ("handshake", "Noget at vise sponsorer og partnere", "Flere virksomheder skal selv rapportere ESG. Med en rapport fra B.93 er det lettere at vælge jer som partner."),
            ("chart", "Indblik og udvikling over tid", "Følg klubbens tal fra sæson til sæson, og se hvad der virker."),
        ],
        kpis=[
              ('Energi', 'klubhus og haller', 'Miljø', 'Find de største besparelser'),
              ('Vand', 'baner og anlæg', 'Miljø', 'Vanding og omklædning i tal'),
              ('Affald', 'fra kampe og events', 'Miljø', 'Mål effekten af sortering'),
              ('Frivillige', 'og ansatte', 'Social', 'Synliggør klubbens største ressource'),
              ('Sociale initiativer', 'i lokalområdet', 'Social', 'Noget konkret at vise sponsorerne'),
              ('Udvikling', 'sæson for sæson', 'ESG', 'Se, om jeres tiltag&nbsp;virker'),
        ],
        pcf=None,
    ),
    dict(
        slug="smag", name="SMAG", free=True,
        h1="God mad.<br><span>Gode tal bag.</span>",
        lead="En ESG-rapport viser, at SMAG tager ansvar, og giver jeres erhvervskunder de klimadata, de selv skal bruge.",
        cover_rows=["Klimaaftryk fra råvarer og køkkener", "Madspild og emballage", "Data til jeres erhvervskunder"],
        letter="Vi kom forbi med en blomst, fordi I passer perfekt til ESG. I laver sund mad med sæsonens grønt fra fire steder i København. Mange af jeres kunder skal selv opgøre deres klimaaftryk, og der er frokostordning og catering en del af regnestykket.",
        facts=[("4 steder", "Fra Carlsberg Byen til Lufthavnen"), ("Catering og frokost", "Til fester, events og hverdag"), ("Sæsonens grønt", "Sund mad, der er lavet til at dele")],
        why_h="Det kan en ESG-rapport gøre for SMAG",
        angles=[
            ("shield", "Vis, at I tager ansvar", "Råvarer, energi, madspild og medarbejdere samlet i én rapport efter VS-standarden."),
            ("handshake", "Data til jeres erhvervskunder", "Virksomheder med frokostordning og catering skal medregne maden i deres Scope 3. Med jeres tal bliver I leverandøren, der gør det let."),
            ("eye", "Indblik i egen forretning", "Se hvor energi, råvarer og affald fylder på tværs af jeres køkkener og steder."),
            ("chart", "Udvikling over tid", "En rapport om året viser, hvordan I flytter jer."),
        ],
        kpis=[
              ('Energi', 'pr. køkken og sted', 'Miljø', 'Sammenlign jeres fire steder'),
              ('Råvarer', 'klimaaftryk', 'Miljø', 'Ofte den største del af aftrykket'),
              ('Madspild', 'kg pr. år', 'Miljø', 'Sparer både CO₂ og penge'),
              ('Emballage', 'og affald', 'Miljø', 'Især til take-away og catering'),
              ('CO₂e pr. kuvert', 'til jeres kunder', 'Miljø', 'Klar til erhvervskunders Scope 3'),
              ('Udvikling', 'fra år til år', 'ESG', 'Se, om jeres tiltag&nbsp;virker'),
        ],
        pcf=None,
    ),
    dict(
        slug="larry-vs-harry", name="Larry vs Harry", free=False,
        h1="I flytter byen<br><span>væk fra varebilen.</span>",
        lead="Lad en ESG-rapport dokumentere jeres eget klimaaftryk og vise virksomheder, der overvejer en elcykel, hvad skiftet betyder.",
        cover_rows=["Klimaaftryk fra produktion og fragt", "Ansvar i leverandørkæden", "Udviklingen år for år"],
        letter="Vi kom forbi med en blomst, fordi I har en af de stærkeste ESG-profiler, vi kender. Siden 2008 har Bullitten vist byer verden over, at varer kan flyttes uden bil. Det fortjener en rapport, der viser jeres eget aftryk lige så tydeligt.",
        facts=[("Siden 2008", "Bullitten i kommerciel brug"), ("Designet i København", "Og kørt i byer verden over"), ("5 års stelgaranti", "Bygget til at holde")],
        why_h="Det kan en ESG-rapport gøre for Larry vs Harry",
        angles=[
            ("shield", "Vis, at I tager ansvar", "Jeres produkt er grønt. Rapporten viser, at virksomheden bag også er det."),
            ("leaf", "Dokumentér jeres klimaaftryk", "Fra aluminiumsstel og komponenter til fragten ud til forhandlerne."),
            ("bike", "Et showcase for virksomheder", "Når en virksomhed overvejer at skifte varebilen ud med en elcykel, kan jeres tal være en del af beslutningen."),
            ("chart", "Indblik og udvikling over tid", "Følg jeres aftryk fra år til år, og se hvor I flytter mest."),
        ],
        kpis=[
              ('Scope 1, 2 og 3', 'hele virksomheden', 'Miljø', 'Hele aftrykket samlet ét&nbsp;sted'),
              ('CO₂e pr. Bullitt', 'fra stel til levering', 'Miljø', 'Sammenlign med en varebil'),
              ('Materialer', 'og leverandører', 'Miljø', 'Find de største kilder i produktionen'),
              ('Medarbejdere', 'og arbejdsmiljø', 'Social', 'Trivsel og sikkerhed i&nbsp;tal'),
              ('Levetid', 'garanti og reservedele', 'Miljø', 'Dokumentér, at cyklen holder længe'),
              ('Udvikling', 'fra år til år', 'ESG', 'Se, om jeres tiltag&nbsp;virker'),
        ],
        pcf=("Klimaregnskab pr. Bullitt", "CO₂e for en enkelt cykel, som jeres erhvervskunder kan bruge i deres egne regnskaber. Pris efter aftale."),
    ),
    dict(
        slug="mater", name="Mater", free=False,
        h1="I skriver allerede<br><span>om bæredygtighed.</span>",
        lead="Næste skridt er en årlig ESG-rapport, der samler det hele i tal efter VS-standarden.",
        cover_rows=["Affald genbrugt i Matek", "Klimaaftryk fra produktion og fragt", "Udviklingen år for år"],
        letter="Vi kom forbi med en blomst, fordi I gør noget, de fleste kun taler om. I laver møbler af kaffeskaller, savsmuld og e-affald, tager møbler retur og designer dem, så de kan skilles ad og repareres. En årlig ESG-rapport giver jer et fast sted at vise det frem.",
        facts=[("Siden 2007", "A New Danish Classic"), ("Matek", "Møbler lavet af affald"), ("Mater Take-back", "Møblerne kommer retur")],
        why_h="Det kan en ESG-rapport gøre for Mater",
        angles=[
            ("star", "Fra fortællinger til tal", "I fortæller allerede om bæredygtighed. En rapport efter VS-standarden gør det sammenligneligt og troværdigt."),
            ("shield", "Vis, at I tager ansvar", "Materialer, leverandører og Code of Conduct samlet i én årlig rapport."),
            ("eye", "Indblik i egen forretning", "Se hvor udledningerne opstår, fra råmaterialer til showrooms."),
            ("chart", "Udvikling over tid", "Følg hvor meget affald, der bliver til møbler, år for år."),
        ],
        kpis=[
              ('Affald i Matek', 'tons genbrugt pr. år', 'Miljø', 'Gør jeres materiale målbart'),
              ('Scope 1, 2 og 3', 'hele virksomheden', 'Miljø', 'Hele aftrykket samlet ét&nbsp;sted'),
              ('Take-back', 'og reparationer', 'Miljø', 'Viser cirkulariteten i tal'),
              ('Leverandører', 'og Code of Conduct', 'Ledelse', 'Ansvar i hele værdikæden'),
              ('Medarbejdere', 'og arbejdsmiljø', 'Social', 'Trivsel og sikkerhed i&nbsp;tal'),
              ('Udvikling', 'fra år til år', 'ESG', 'Se, om jeres tiltag&nbsp;virker'),
        ],
        pcf=("Klimaregnskab pr. møbel", "CO₂e for et enkelt møbel, klar til arkitekter, indkøbere og udbud. Pris efter aftale."),
    ),
    dict(
        slug="noerrebrew", name="Nørrebrew", free=False,
        h1="Bedre drikke.<br><span>Bedre data.</span>",
        lead="En ESG-rapport passer til jeres brand og dokumenterer klimaaftrykket bag det, I brygger.",
        cover_rows=["Klimaaftryk fra råvarer og emballage", "Økologi og leverandører", "Udviklingen år for år"],
        letter="Vi kom forbi med en blomst, fordi I passer perfekt til ESG. I er født på Nørrebro med ét mål, bedre drikke, og er vokset fra maté til et drikkevarehus i hele landet. Det er en rejse, der fortjener at blive fulgt i tal.",
        facts=[("Født på Nørrebro", "Med ét mål: bedre drikke"), ("Maté til øl", "Kombucha, mixers og energidrik"), ("Økologisk øl", "Uden at gå på kompromis med smagen")],
        why_h="Det kan en ESG-rapport gøre for Nørrebrew",
        angles=[
            ("star", "Passer til jeres brand", "Bedre drikke handler også om, hvordan de bliver lavet. En rapport viser det."),
            ("leaf", "Dokumentér jeres klimaaftryk", "Råvarer, emballage og transport ud til forhandlerne samlet i ét regnskab."),
            ("eye", "Indblik i egen forretning", "Se hvilke produkter og led i kæden, der fylder mest."),
            ("chart", "Udvikling over tid", "Følg jeres tal, mens I vokser, år for år."),
        ],
        kpis=[
              ('CO₂e pr. produkt', 'pr. dåse eller flaske', 'Miljø', 'Til forhandlere og kunder'),
              ('Emballage', 'materialer og genbrug', 'Miljø', 'Dåse, glas og pant i tal'),
              ('Økologi', 'andel af råvarer', 'Miljø', 'Dokumentér det, I allerede gør'),
              ('Transport', 'ud til forhandlere', 'Miljø', 'Find den grønneste vej ud'),
              ('Energi og vand', 'i produktionen', 'Miljø', 'Find de største besparelser'),
              ('Udvikling', 'fra år til år', 'ESG', 'Se, om jeres tiltag&nbsp;virker'),
        ],
        pcf=("Klimaregnskab pr. drik", "CO₂e for et enkelt produkt, som jeres forhandlere og kunder kan bruge. Pris efter aftale."),
    ),
]

CSS = (HERE.parent / "trifold.html").read_text(encoding="utf-8").split("<style>")[1].split("</style>")[0]

EXTRA_CSS = """
  .logo { width: 100%; }
  .to { font-size: 7.4pt; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-top: 12mm; }
  .to b { color: var(--blue); }
  /* Seks lige store felter (99 mm), så for- og bagside passer ved dobbeltsidet print */
  .sheet--out, .sheet--in { grid-template-columns: 99mm 99mm 99mm; }
  .sheet--out::before, .sheet--in::before { left: 99mm; }
  .sheet--out::after, .sheet--in::after { left: 198mm; }
  .sticker { position: absolute; right: 5mm; top: -13mm; z-index: 2; width: 27mm; height: 27mm; border-radius: 50%; background: var(--blue); color: #fff;
    display: grid; place-items: center; text-align: center; font-size: 7.4pt; line-height: 1.15; font-weight: 600; transform: rotate(8deg); border: .9mm solid #fff; }
  .sticker b { display: block; font-size: 12pt; font-weight: 700; letter-spacing: -0.02em; }
  .rows { list-style: none; display: grid; gap: 2mm; margin-top: 3.5mm; }
  .rows li { display: flex; align-items: center; gap: 2.4mm; font-size: 7.4pt; padding: 2mm 2.6mm; border-radius: 1.6mm; background: var(--tint); }
  .rows li::before { content: ""; width: 2.8mm; height: 2.8mm; border-radius: .6mm; flex: none;
    background: var(--blue) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4 8.3 2.6 2.6L12 5.4' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/100% no-repeat; }
  .hello { font-size: 22pt; font-weight: 700; letter-spacing: -0.02em; margin-top: 4mm; }
  .letter { font-size: 11pt !important; line-height: 1.55 !important; margin-top: 4mm; color: #e6f1fb !important; }
  .sign { font-size: 9pt !important; margin-top: 4mm; color: #fff !important; font-weight: 500; }
  .angles { display: grid; gap: 3.5mm; margin-top: 6mm; }
  .angle { display: grid; grid-template-columns: 8mm 1fr; gap: 3mm; background: #fff; border-radius: 2.5mm; padding: 4.2mm 4mm; }
  .angle svg { width: 8mm; height: 8mm; padding: 1.7mm; border-radius: 2mm; background: var(--blue-soft); stroke: var(--blue); fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .angle b { display: block; font-size: 9.2pt; font-weight: 600; }
  .angle p { font-size: 7.9pt; line-height: 1.45; margin-top: .5mm; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 2.8mm; margin-top: 6mm; }
  .kpi { border: .3mm solid var(--line); border-radius: 2mm; padding: 3.6mm 3.4mm; }
  .kpi b { display: block; font-size: 9pt; font-weight: 600; }
  .kpi span { font-size: 6.8pt; color: var(--muted); }
  .kpi { display: flex; flex-direction: column; }
  .kpi small { align-self: flex-start; font-size: 5.8pt; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--blue); background: var(--blue-soft); border-radius: 1mm; padding: .4mm 1.4mm; margin-bottom: 1.4mm; }
  .kpi em { display: block; font-style: normal; font-size: 6.9pt; line-height: 1.35; color: var(--navy); font-weight: 500; margin-top: auto; padding-top: 1.8mm; border-top: .3mm solid var(--line); }
  .kpi em::before { content: "→ "; color: var(--blue); font-weight: 700; }
  .kpi span { margin-bottom: 1.8mm; }
  .note { font-size: 6.6pt !important; margin-top: 2mm; font-style: italic; }
  .mini-steps { list-style: none; display: grid; gap: 2.2mm; margin-top: 3mm; counter-reset: s; }
  .mini-steps li { display: grid; grid-template-columns: 6mm 1fr; gap: 2.5mm; align-items: center; font-size: 7.8pt; counter-increment: s; }
  .mini-steps li::before { content: counter(s); width: 6mm; height: 6mm; border-radius: 1.4mm; background: var(--blue); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 8pt; }
  .partner { margin-top: auto; background: var(--navy); color: #fff; border-radius: 2.5mm; padding: 4mm; font-size: 8pt; line-height: 1.45; color: #d3e5f5; }
  .partner b { display: block; color: #fff; font-size: 9pt; font-weight: 600; margin-bottom: .6mm; }
  .free-price { font-size: 34pt; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
  .after { font-size: 7.2pt !important; margin-top: 3mm; }
  .after b { color: var(--navy); }
"""

FILES = """<div class="files big">
        <span class="file"><img src="../powerpoint.png" alt="">ESG-rapport</span>
        <span class="file"><em style="background:#c62f2f">PDF</em>ESG-rapport</span>
        <span class="file"><img src="../excel.png" alt="">Klimaregnskab</span>
      </div>"""


def offer_panel(c):
    name = c["name"]
    pcf = c["pcf"] or ("Klimaregnskab for produkter", "CO₂e pr. produkt eller leverance. Pris efter aftale.")
    pcf_html = f'<div class="pcf"><b>{pcf[0]}</b>{pcf[1]}</div>'
    if c["free"]:
        return f"""
  <div class="panel">
    <p class="label">Et tilbud til {name}</p>
    <h2>Jeres første ESG-rapport er <span class="b">gratis</span></h2>
    <p style="margin-top:3mm">I er en af de første tre virksomheder, vi giver det her tilbud. Vi laver hele jeres første rapport uden beregning, så I kan prøve platformen og samarbejdet.</p>
    <div class="plan plan--main">
      <div class="plan__top"><b>Første rapport</b><span class="plan__tag">Til {name}</span></div>
      <div class="free-price" style="margin-top:2mm">0 kr.</div>
      <ul class="checks checks--sm">
        <li>Fast konsulent koblet på jer</li>
        <li>Vi samler og taster jeres data</li>
        <li>Klimaregnskab for Scope 1, 2 og 3</li>
        <li>Færdig rapport efter VS-standarden</li>
        <li>Rapport i PowerPoint og PDF</li>
      </ul>
    </div>
    <p class="after">Til gengæld vil vi gerne fortælle andre om samarbejdet, hvis I er glade for resultatet.</p>
    <p class="after" style="margin-top:auto">Vil I fortsætte bagefter, koster det <b>14.999 kr.</b> om året med konsulent eller <b>7.499 kr.</b> for kun platformen, ekskl. moms. I bestemmer selv.</p>
  </div>"""
    return f"""
  <div class="panel">
    <p class="label">Pris</p>
    <h2>To faste priser om året</h2>
    <p style="margin-top:2mm">Platformen er med i begge, så I ikke skal købe et andet ESG-system.</p>
    <div class="plan plan--main">
      <div class="plan__top"><b>Platform + konsulent</b><span class="plan__tag">Anbefalet</span></div>
      <div class="plan__price">14.999 kr.<small>om året ekskl. moms</small></div>
      <ul class="checks checks--sm">
        <li>Fast konsulent koblet på jer</li>
        <li>Vi samler og taster jeres data</li>
        <li>Klimaregnskab for Scope 1, 2 og 3</li>
        <li>Færdig rapport efter VS-standarden</li>
        <li>I betaler kun, hvis I er tilfredse</li>
      </ul>
    </div>
    <div class="plan">
      <div class="plan__top"><b>Kun platform</b></div>
      <div class="plan__price">7.499 kr.<small>om året ekskl. moms</small></div>
      <ul class="checks checks--sm">
        <li>Adgang til esgBRICKS</li>
        <li>I taster selv jeres data ind</li>
        <li>Automatisk CO₂e-beregning</li>
        <li>Rapport i PowerPoint og PDF</li>
      </ul>
    </div>
    {pcf_html}
  </div>"""


def render(c):
    name = c["name"]
    facts = "".join(f'<div class="fact"><b>{a}</b><span>{b}</span></div>' for a, b in c["facts"])
    rows = "".join(f"<li>{r}</li>" for r in c["cover_rows"])
    angles = "".join(f'<div class="angle">{icon(i)}<div><b>{t}</b><p>{d}</p></div></div>' for i, t, d in c["angles"])
    kpis = "".join(f'<div class="kpi"><small>{t}</small><b>{a}</b><span>{b}</span><em>{u}</em></div>' for a, b, t, u in c["kpis"])
    sticker = '<div class="sticker"><div><b>Gratis</b>første<br>rapport</div></div>' if c["free"] else ""
    pill = '' if c["free"] else '<span class="pill">Klar til jer</span>'
    back_h = "Sig ja til jeres gratis rapport" if c["free"] else "Book et uforpligtende opkald"
    back_p = ("Ring, skriv eller scan koden, så finder vi et tidspunkt og går i gang med jeres første rapport."
              if c["free"] else "Vi ringer og hører, hvad I skal bruge rapporten til, og hvad det kræver af jer.")
    return f"""<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<title>esgBRICKS til {html.escape(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}{EXTRA_CSS}</style>
</head>
<body>

<!-- ================= YDERSIDE: klap | bagside | forside ================= -->
<section class="sheet sheet--out">

  <!-- Klap: et personligt brev (det første, man ser, når forsiden åbnes) -->
  <div class="panel panel--blue">
    <p class="label">Med en blomst fra os</p>
    <p class="hello">Hej {name},</p>
    <p class="letter">{c["letter"]}</p>
    <p class="sign">Holdet bag esgBRICKS</p>
    <div class="facts">{facts}</div>
  </div>

  <!-- Bagside -->
  <div class="panel panel--navy">
    <p class="label">Kom i gang</p>
    <h2>{back_h}</h2>
    <p style="margin-top:3mm">{back_p}</p>
    <div class="contact">
      <div><span>Web</span><b>www.esgbricks.com</b></div>
      <div><span>Mail</span><b>mads.frost@capana.dk</b></div>
      <div><span>Telefon</span>+45 20 87 02 11</div>
    </div>
    <div class="qr"><img src="../qr.svg" alt="QR-kode til booking"></div>
    <p class="qr-note">Scan og book et tidspunkt</p>
    <p class="legal">esgBRICKS, powered by Capana</p>
  </div>

  <!-- Forside -->
  <div class="panel">
    <img class="logo" src="../logo.png" alt="esgBRICKS, powered by Capana">
    <p class="to">Til <b>{name}</b></p>
    <h1 style="margin-top:3mm">{c["h1"]}</h1>
    <p style="margin-top:4mm">{c["lead"]}</p>
    <div class="bricks" style="margin:auto -10mm -11mm; background:var(--navy); padding:7mm 8mm 9mm; position:relative">
      {sticker}
      <div class="card">
        <div class="card__head"><b>ESG-rapport · {name}</b>{pill}</div>
        <ul class="rows">{rows}</ul>
      </div>
    </div>
  </div>
</section>

<!-- ================= INDERSIDE: venstre | midte | klap ================= -->
<section class="sheet sheet--in">

  <!-- Venstre: hvorfor netop dem -->
  <div class="panel panel--tint">
    <p class="label">Hvorfor jer</p>
    <h2>{c["why_h"]}</h2>
    <div class="angles">{angles}</div>
    <div class="partner"><b>Jeres faste ESG-partner</b>Vi lærer {name} at kende og laver rapporten med jer år efter år.</div>
  </div>

  <!-- Midte: hvad rapporten kunne vise -->
  <div class="panel">
    <p class="label">Sådan kunne jeres rapport se ud</p>
    <h2>Nøgletal for {name}</h2>
    <div class="kpis">{kpis}</div>
    <p class="note">Eksempler på nøgletal. Vi finder de rigtige sammen med jer.</p>
    <div style="margin-top:auto; padding-top:4mm">
      <p class="label">Sådan foregår det</p>
      <ol class="mini-steps">
        <li>Vi samler jeres ESG-data</li>
        <li>Vi beregner jeres CO₂e</li>
        <li>I får den færdige rapport</li>
      </ol>
      {FILES}
    </div>
  </div>

  <!-- Højre (klappens inderside): tilbud eller pris -->{offer_panel(c)}
</section>

</body>
</html>
"""


def main():
    for c in COMPANIES:
        out = HERE / f"{c['slug']}.html"
        out.write_text(render(c), encoding="utf-8")
        pdf = HERE / f"esgBRICKS-{c['slug']}.pdf"
        subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        "--virtual-time-budget=8000", f"--print-to-pdf={pdf}", out.as_uri()],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print("skrev", pdf.name)


if __name__ == "__main__":
    main()
