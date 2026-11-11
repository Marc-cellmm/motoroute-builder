#!/usr/bin/env bash
# Empaqueta l'app d'iPhone en un zip que s'obre directament amb Xcode, sense Node.js.
# Requereix haver executat abans `npm run build:ios` (web compilada i sincronitzada a ios/).
set -euo pipefail

OUT="$(cd "$(dirname "${1:-MotoRoute-iPhone.zip}")" && pwd)/$(basename "${1:-MotoRoute-iPhone.zip}")"
STAGE="$(mktemp -d)/MotoRoute-iPhone"
mkdir -p "$STAGE/node_modules/@capacitor-community"

# Projecte Xcode amb la web ja copiada (ios/App/App/public)
cp -R ios "$STAGE/"
rm -rf "$STAGE/ios/App/build" "$STAGE/ios/App/DerivedData"
find "$STAGE/ios" -name xcuserdata -type d -prune -exec rm -rf {} +
# El Package.swift del projecte apunta a ../../../node_modules/<plugin>: hi copiem només el plugin
cp -R node_modules/@capacitor-community/background-geolocation "$STAGE/node_modules/@capacitor-community/"

cat > "$STAGE/LLEGEIX-ME.txt" <<'TXT'
MotoRoute per a iPhone
======================

1. Obre ios/App/App.xcodeproj amb Xcode (doble clic).
   La primera vegada Xcode descarrega uns paquets (Capacitor): espera que acabi.
2. Xcode → Settings → Accounts → + → afegeix el teu Apple ID.
3. A l'esquerra clica "App" → pestanya "Signing & Capabilities" → Team: tria el teu nom (Personal Team).
   Si diu que el Bundle Identifier no està disponible, canvia'l (p. ex. com.elteunom.motoroute).
4. Connecta l'iPhone amb el cable.
   A l'iPhone: Configuració → Privacitat i seguretat → Mode de desenvolupador → activa'l.
5. A dalt d'Xcode tria el teu iPhone i prem ▶ (Run).
6. La primera vegada, a l'iPhone: Configuració → General → VPN i gestió de dispositius →
   el teu Apple ID → Confia.

Amb un Apple ID gratuït l'app caduca cada 7 dies: torna a prémer ▶ amb l'iPhone connectat.
TXT

cat > "$STAGE/LEEME.txt" <<'TXT'
MotoRoute para iPhone
=====================

1. Abre ios/App/App.xcodeproj con Xcode (doble clic).
   La primera vez Xcode descarga unos paquetes (Capacitor): espera a que termine.
2. Xcode → Settings → Accounts → + → añade tu Apple ID.
3. A la izquierda haz clic en "App" → pestaña "Signing & Capabilities" → Team: elige tu nombre (Personal Team).
   Si dice que el Bundle Identifier no está disponible, cámbialo (p. ej. com.tunombre.motoroute).
4. Conecta el iPhone con el cable.
   En el iPhone: Ajustes → Privacidad y seguridad → Modo de desarrollador → actívalo.
5. Arriba en Xcode elige tu iPhone y pulsa ▶ (Run).
6. La primera vez, en el iPhone: Ajustes → General → VPN y gestión de dispositivos →
   tu Apple ID → Confiar.

Con un Apple ID gratuito la app caduca cada 7 días: vuelve a pulsar ▶ con el iPhone conectado.

Tu cuenta: al abrir la app entras con tu correo y contraseña. El perfil, las motos, las fotos
y las rutas publicadas se guardan en la nube (Supabase), así que son los mismos en la web y en
cualquier iPhone donde entres con esa cuenta.
TXT

rm -f "$OUT"
(cd "$(dirname "$STAGE")" && zip -qry "$OUT" MotoRoute-iPhone)
echo "Creat $OUT"
