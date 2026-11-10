# MotoRoute Builder

Planificador de rutes per a motoristes: carretera o trail, nivell de dificultat, rangs de quilòmetres, meteo a l'hora de pas, parades de benzina segons **La meva moto** i allotjaments al final de cada etapa.

Web app (mòbil i escriptori) feta amb React, TypeScript, Vite i MapLibre. Totes les dades són reals i gratuïtes; no cal cap clau d'API.

| Funció | Servei |
| --- | --- |
| Mapa | [OpenFreeMap](https://openfreemap.org) (OpenStreetMap) |
| Rutes amb perfil de moto i pistes | [Valhalla](https://valhalla.github.io/valhalla/) (servidor públic de FOSSGIS) |
| Elevació i meteo per hores | [Open-Meteo](https://open-meteo.com) |
| Preus de benzina en temps real | [Geoportal de Gasolineras (MITECO)](https://geoportalgasolineras.es) |
| Allotjaments | OpenStreetMap via Overpass API |
| Cerca de llocs | Photon (OpenStreetMap) |

## Posar-la en marxa al teu ordinador

1. Instal·la [Node.js](https://nodejs.org) 20 o superior.
2. Obre un terminal a aquesta carpeta i executa:

   ```bash
   npm install
   npm run dev
   ```

3. Obre l'adreça que surt al terminal (normalment http://localhost:5173).

Per provar-la al mòbil dins la mateixa xarxa wifi: `npm run dev -- --host` i obre l'adreça «Network» des del mòbil.

## Publicar-la a GitHub Pages (gratuït, automàtic)

El workflow `.github/workflows/deploy.yml` construeix i publica la web a cada `push` a `main` i cada 30 minuts, per refrescar els preus de la benzina.

1. Puja el projecte a un repositori públic de GitHub.
2. A **Settings → Pages → Build and deployment → Source**, tria **GitHub Actions**.
3. La web queda a `https://<usuari>.github.io/<repositori>/`.

A GitHub Pages no hi ha servidor propi: les rutes es demanen directament al servidor públic de Valhalla, i els preus del MITECO els descarrega el workflow (`scripts/fetch-fuel.py`) a `data/fuel.json`.

## Grava (com Strava)

L'apartat **Grava** segueix la ruta amb el GPS del telèfon (cal donar permís de localització) i mostra en directe km, temps, velocitat i altitud. Es pot pausar, i si la pàgina es tanca, la gravació es recupera en pausa. En acabar, calcula desnivell, corbes i dificultat. La ruta es desa a «Les meves rutes → Gravades» i es pot compartir a Social o exportar a GPX.

- Filtres de senyal: es descarten posicions amb precisió pitjor que 40 m, moviments de menys de 8 m (soroll quan estàs aturat) i salts impossibles. El temps en moviment només compta per sobre de 3 km/h.
- Mentre graves, la pantalla es manté encesa (Screen Wake Lock). Una web no pot gravar amb la pantalla apagada: el telèfon atura el GPS. Per gravar en segon pla cal empaquetar-la com a app nativa (per exemple, amb Capacitor).

## App d'iPhone (grava amb la pantalla apagada)

La carpeta `ios/` conté l'app nativa (Capacitor). És la mateixa web, però amb el GPS en segon pla: continua gravant amb la pantalla apagada o el mòbil a la butxaca.

Instal·lació gratuïta des d'un Mac (el teu Apple ID normal; l'app caduca cada 7 dies i s'ha de tornar a instal·lar):

1. Instal·la **Xcode** des de l'App Store del Mac i obre'l un cop per acabar la instal·lació.
2. Instal·la **Node.js** (nodejs.org, versió LTS).
3. Al Terminal:

   ```bash
   git clone https://github.com/Marc-cellmm/motoroute-builder.git
   cd motoroute-builder
   npm install
   npm run ios
   ```

   S'obrirà Xcode amb el projecte.
4. A Xcode: **Settings → Accounts → +** i afegeix el teu Apple ID.
5. Selecciona el projecte **App → Signing & Capabilities → Team**: tria el teu nom (*Personal Team*). Si diu que l'identificador ja existeix, canvia el *Bundle Identifier* per un altre (per exemple `com.elteunom.motoroute`).
6. Connecta l'iPhone amb el cable. A l'iPhone: **Configuració → Privacitat i seguretat → Mode de desenvolupador → activa'l** (es reinicia).
7. A Xcode, tria el teu iPhone a dalt i prem ▶ (Run).
8. La primera vegada, a l'iPhone: **Configuració → General → VPN i gestió de dispositius → el teu Apple ID → Confia**.

Per actualitzar-la (o quan caduqui): `git pull`, `npm install`, `npm run ios` i torna a prémer ▶.

## Comptes i Social (Supabase)

Abans d'entrar a l'app cal crear un compte amb correu i contrasenya i omplir el perfil de motorista (nom, any de naixement, d'on ets, carretera o muntanya, experiència, moto i interessos). El perfil posa els valors per defecte del Planificar i les motos queden desades al compte.

Els motoristes publiquen rutes que han fet (des d'un GPX o d'una ruta desada), hi donen m'agrada i les guarden per fer-les. Les guardades apareixen a «Les meves rutes → Guardades».

1. Crea un projecte gratuït a [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: enganxa i executa `supabase/schema.sql`.
3. **SQL Editor → New query**: enganxa i executa `supabase/accounts.sql` (perfil, dades privades i esborrar el compte) després `supabase/photos.sql` (foto de perfil i fotos de la moto a Supabase Storage) i `supabase/country.sql` (país del perfil).
4. **Authentication → Sign In / Providers → Email**: desactiva *Confirm email* mentre no tinguis un servidor de correu propi. El servidor de correu de Supabase només envia a membres de l'equip del projecte i 2 correus per hora. Per enviar confirmacions i recuperar contrasenyes a qualsevol usuari, configura un SMTP propi (Brevo o Resend tenen pla gratuït) a **Authentication → Emails → SMTP Settings** i torna a activar *Confirm email*.
5. Entrar amb el mòbil (SMS) necessita un proveïdor de SMS de pagament (Twilio, Vonage o MessageBird) a **Authentication → Sign In / Providers → Phone**.
6. Posa la *Project URL* i la clau *anon/publishable* a `src/config.ts` (o a les variables `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`). Aquestes dues són públiques per disseny. La clau *service_role* no ha d'anar mai a la web.

Seguretat: les polítiques RLS de l'esquema fan que tothom pugui llegir rutes i perfils, però cadascú només pot crear, editar o esborrar el que és seu. Qui ha donat m'agrada o ha guardat què només ho veu el mateix usuari.

Si algú ja tenia un nom de motorista amb l'accés anònim antic, en crear el compte des del mateix navegador se li passen el nom, les rutes publicades, els m'agrada i els guardats. L'edat i les preferències (taula `rider_settings`) només les pot llegir el mateix usuari. El compte es pot esborrar des de Perfil. El pla gratuït de Supabase pausa el projecte després d'una setmana sense ús.

## Publicar-la per fer-la servir des del mòbil (Vercel, gratuït)

1. Puja aquesta carpeta a un repositori de GitHub.
2. A [vercel.com](https://vercel.com), «Add New Project» i importa el repositori. Vercel detecta Vite automàticament.
3. Les funcions de la carpeta `api/` fan de pont amb Valhalla i el MITECO (que no permeten crides directes des del navegador).

Un cop publicada, des del mòbil pots fer «Afegeix a la pantalla d'inici» perquè s'obri com una app.

## Idiomes

L'app està en 12 idiomes: espanyol, català, anglès, francès, alemany, italià, portuguès, neerlandès, romanès, rus, àrab marroquí (darija, de dreta a esquerra) i xinès. El primer cop que s'obre pregunta l'idioma i el país; després es pot canviar a Perfil → Idioma.

- El text original (català) és la clau: `t("Text")`. Les traduccions són a `src/i18n/locales/<codi>.json`.
- Després de canviar textos: `node scripts/i18n-extract.mjs` actualitza `src/i18n/catalog.json`. Un text sense traducció es mostra en català.
- Les indicacions de veu de la navegació les genera Valhalla, que no té àrab ni xinès: en darija surten en francès i en xinès, en anglès.

## Com funciona

- **La meva moto**: tries el model del catàleg (o l'entres a mà). L'app guarda el dipòsit, la reserva i el consum. Amb el botó «He repostat», el consum real substitueix progressivament el de fitxa.
- **Planificar**: assistent en 4 passos (modalitat i moto → origen i destinació o ruta circular → distància i dificultat → dates i etapes). Genera fins a 3 alternatives.
- **Dificultat**: es calcula per trams de 5 km (radi de corba, corbes per km, pendent i superfície). El nivell de la ruta és el percentil 90, de manera que un pas tècnic curt també compta.
- **Meteo**: previsió a l'hora estimada de pas per cada tram, amb alertes de vent, pluja, tempesta, gel i calor, i les tres millors hores de sortida.
- **Benzina**: benzineres a menys de 2 km del traçat (5 km en trail). Recomana parar abans d'entrar en reserva, amb un marge del 15 %, a la més barata de la finestra segura i oberta a l'hora de pas. També avisa dels trams sense benzineres.
- **Allotjament**: hotels, cases rurals, albergs i càmpings a 10 km del final de cada etapa, filtrables per tipus i estrelles.
- Les rutes i les motos es desen al navegador. Les rutes es poden exportar a GPX.

## Limitacions d'aquesta versió

- Els preus de benzina només cobreixen Espanya.
- El servidor públic de Valhalla és per a ús moderat. Per a molts usuaris, munta el teu propi Valhalla o GraphHopper i defineix `VALHALLA_URL` a Vercel.
- Open-Meteo és gratuït per a ús no comercial; per a un producte comercial cal el seu pla de pagament.
- Els allotjaments no tenen preus ni disponibilitat. Això requereix un acord de partner amb Booking o Expedia (fase 2 del document de disseny).
- Al catàleg de motos, només la Royal Enfield Interceptor 650 està verificada amb la fitxa oficial. La resta són valors aproximats que convé revisar.
- En mode Trail, el motor respecta les restriccions d'accés d'OpenStreetMap, però pot haver-hi prohibicions locals que no hi constin. Comprova sempre la normativa (a Catalunya, la Llei 9/1995).

## Desenvolupament

```bash
npm test        # proves de la lògica (autonomia, parades, meteo, corbes)
npm run build   # comprovació de tipus i build de producció
```

Estructura:

```text
api/              funcions serverless (proxy Valhalla i MITECO)
src/lib/          lògica: routing, scoring, weather, fuel, places, pipeline
src/components/   interfície: assistent, La meva moto, mapa, detall de ruta
```
