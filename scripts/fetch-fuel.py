"""Descarrega els preus de carburant del MITECO i en desa una versió reduïda.

S'executa al workflow de GitHub Pages cada 30 minuts. Si el MITECO no respon,
reutilitza el darrer fitxer publicat (FALLBACK_URL) perquè la web no es quedi
sense preus.

Ús: python3 scripts/fetch-fuel.py public/data/fuel.json
"""
import json
import os
import sys
import urllib.request

MITECO = (
    "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/"
    "PreciosCarburantes/EstacionesTerrestres/"
)
KEEP = [
    "IDEESS", "Rótulo", "Dirección", "Municipio", "Latitud", "Longitud (WGS84)",
    "Horario", "Precio Gasolina 95 E5", "Precio Gasolina 98 E5",
]


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "MotoRouteBuilder/0.1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8-sig"))


def main(out: str) -> None:
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        data = get(MITECO)
        stations = [{k: e.get(k, "") for k in KEEP} for e in data["ListaEESSPrecio"]]
        payload = {"Fecha": data.get("Fecha", ""), "ListaEESSPrecio": stations, "ResultadoConsulta": "OK"}
        print(f"MITECO: {len(stations)} estacions ({payload['Fecha']})")
    except Exception as err:  # noqa: BLE001
        print(f"MITECO no disponible ({err}); provo el darrer fitxer publicat")
        fallback = os.environ.get("FALLBACK_URL")
        try:
            payload = get(fallback) if fallback else {"ListaEESSPrecio": []}
        except Exception as err2:  # noqa: BLE001
            print(f"Sense fitxer anterior ({err2}); es publica buit")
            payload = {"ListaEESSPrecio": [], "ResultadoConsulta": "ERROR"}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "public/data/fuel.json")
