# Emissionsfaktorer

`klimakompasset_emissionsfaktorark_2015-2035_2024_v5.xlsx` er Klimakompassets emissionsfaktorark
(Energistyrelsen, "emissionsfaktorark_2015-2035_2024_v._5.xlsx"), hentet fra
https://ens.dk/analyser-og-statistik/beregning-af-klimaaftryk (link "Klimakompassets emissionsfaktorer").

Ét ark pr. år (2015–2035) med nøgle, kategori, enhed, scope 1/2/3 og "udenfor scope" (kg CO2e pr. enhed) samt kilde.
GWP-værdier følger IPCC AR6 (CH4 = 28, N2O = 273), jf. Klimakompassets udvidede vejledning 2025.

Importér/opdatér faktorsættet i databasen:

    npm run factors:import -- data/factors/klimakompasset_emissionsfaktorark_2015-2035_2024_v5.xlsx

Ved en ny version fra Energistyrelsen: læg filen her og kør importen med et nyt versionsnavn
(`--version "2025 v1"`). Eksisterende rapporteringsår bevarer det faktorsæt, de er beregnet med.
