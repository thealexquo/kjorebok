# Kjørebok – oppsett på Android

En app for jobbkjøring som du legger på hjemskjermen. Du kan enten skrive inn hvor du skal, eller bare trykke **Kjør** og la GPS-en spore turen. Appen husker dato, steder, km, bompasseringer, kommentarer og parkeringsutlegg, og eksporterer alt til kjøredagboken.

---

## 1. Legg appen ut på GitHub Pages (ca. 10 min, gratis)

1. Logg inn på **github.com** (lag konto hvis du ikke har det).
2. Trykk **+** øverst til høyre → **New repository**.
   - Navn: `kjorebok`
   - Velg **Public** (koden er offentlig, men turene dine ligger bare på telefonen).
   - Trykk **Create repository**.
3. Trykk på lenken **uploading an existing file**.
4. Pakk ut zip-filen på PC-en og dra **alt innholdet** inn i vinduet: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `README.md` og **mappen `icons`**.
5. Trykk **Commit changes**.
6. Gå til **Settings** → **Pages** (i menyen til venstre).
   - Under *Build and deployment*: Source = **Deploy from a branch**, Branch = **main**, mappe = **/ (root)** → **Save**.
7. Vent 1–2 minutter. Adressen blir **`https://<brukernavnet-ditt>.github.io/kjorebok/`**.

## 2. Installer på telefonen

1. Åpne adressen i **Chrome** på Android.
2. Trykk **⋮** → **Installer app** (eller *Legg til på startskjermen*).
3. Åpne Kjørebok fra hjemskjermen og trykk **Kjør** én gang. Velg **Tillat mens appen er i bruk** når den spør om posisjon. Trykk så **Stopp** og slett testturen.

## 3. Lag en gratis TomTom-nøkkel (adresseforslag og automatisk km)

1. Gå til **developer.tomtom.com** → *Register* og lag en gratis konto.
2. Åpne **Dashboard** → **Keys**. Der ligger en ferdig nøkkel («My first API key»). Kopier den.
3. Valgfritt, men lurt: under nøkkelens innstillinger kan du begrense den til domenet `<brukernavnet-ditt>.github.io`.
4. I appen: **Innstillinger** → lim inn nøkkelen.

Uten nøkkel virker appen fortsatt, men da må du skrive km selv, og stedsnavn hentes fra OpenStreetMap.

## 4. Innstillinger i appen

- **Standard startsted:** Skriv «Sundtkvartalet» og velg forslaget fra listen, så får det koordinater. Turer som starter eller slutter innen 400 m herfra får automatisk dette navnet.
- **Standard formål:** for eksempel *Vernerunde*.
- **Bruk TomTom-rute-km:** står på som standard. Etter en GPS-tur viser appen både GPS-målt km og rute-km, og bruker rute-km (som ligner det jobbsystemet regner ut). Du kan bytte med ett trykk.
- **Bomstasjoner:** Trykk **Oppdater fra Statens vegvesen** første gang. Appen henter alle bomstasjoner med takst og rushtid og oppdaterer dem selv hver 30. dag.

## 5. Daglig bruk

**Når du vet hvor du skal:** Skriv adressen i «Hvor skal du?» og trykk **Kjør**. Eller registrer turen under **Ny tur**, med Fra/Til, «+ Via» og «↺ Tilbake til start». Km og mulige bompasseringer fylles ut automatisk.

**Når du ikke vet nøyaktig hvor byggeplassen er:** Trykk **Kjør** og bare kjør. Når du trykker **Stopp**, finner appen adressen der du stoppet.

**Under kjøring:** Ha telefonen i bilholder med skjermen på (helst med lader). Appen holder skjermen våken selv. Er skjermen av en periode, mister GPS-en sporet, men rute-km retter opp i det.

**Etter turen:** Turen havner under **Til gjennomgang**. Gi stedet et bedre navn (for eksempel «Gjerdrum skole – byggeplass»), og velg formål og prosjekt. Sjekk bompasseringene og trykk **Bekreft tur**.

**Parkering og utlegg:** Kryss av for **Parkering / utlegg** og skriv beløpet. Turen vises under **Utlegg å levere** til du trykker **Levert**.

**Når kjøredagboken skal fylles ut:** Gå til **Oversikt** og velg måned. Der ser du alle turer, total km og bompenger, og under **Steder i perioden** hvert sted med antall turer og datoer.
- **Kopier som tabell** limes rett inn i Excel.
- **Last ned CSV** gir en fil du kan åpne i Excel.
- **Del** sender en tekstoppsummering, for eksempel til e-post eller til Claude.

## 6. Automatisk start og stopp med bilens Bluetooth (MacroDroid)

1. Installer **MacroDroid** fra Play Butikk (gratisversjonen holder).
2. **Makro 1 – Start:**
   - Utløser: *Tilkobling* → **Bluetooth-hendelse** → *Enhet tilkoblet* → velg bilen.
   - Handling: **Åpne nettside** → `https://<brukernavnet-ditt>.github.io/kjorebok/?auto=start`
3. **Makro 2 – Stopp:**
   - Utløser: **Bluetooth-hendelse** → *Enhet frakoblet* → bilen.
   - Handling: **Åpne nettside** → `…/kjorebok/?auto=stop`
4. Åpnes adressen i en vanlig Chrome-fane i stedet for i appen, kan du bruke handlingen **Start snarvei** i stedet. Velg Kjørebok → *Start kjøring* / *Stopp kjøring*. Appen har disse snarveiene innebygd, og du finner dem også ved å holde fingeren på app-ikonet.

Turene havner under *Til gjennomgang*, så du kan rydde bort korte turer som ikke var jobb, for eksempel til butikken.

## 7. Data og sikkerhetskopi

- Alle turer lagres **kun på telefonen**, i appens lagring i Chrome. Ingenting sendes til andre enn TomTom (adressesøk) og Statens vegvesen (bomstasjoner).
- Sletter du Chrome-data eller bytter telefon, forsvinner turene. Ta en **sikkerhetskopi** under Innstillinger av og til, for eksempel ved hver månedsrapport. Den kan lastes inn igjen med *Gjenopprett*.

## 8. Oppdatere appen

Last opp de endrede filene til GitHub-repoet på samme måte. Øk tallet i `VERSION` øverst i `sw.js` (for eksempel `kjorebok-v2`), så henter telefonen den nye versjonen neste gang appen åpnes med nett.

## Begrensninger

- Android stopper GPS for nettapper når skjermen er av. Derfor må skjermen være på mens du kjører.
- Bompengene er **estimater**: grunntakst eller rushtakst for liten bil, uten AutoPASS-rabatt og timesregel. Noen bomstasjoner tar bare betalt i én retning. Fjern avkryssingen der det ikke stemmer, og bruk AutoPASS-fakturaen som fasit ved behov.
