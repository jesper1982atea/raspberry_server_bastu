Raspberry Bastu Server
======================

En enkel Node.js-server för Raspberry Pi som läser temperatur från 1‑Wire (DS18B20) och CPU, skickar mätvärden enligt schema och exponerar API-endpoints. Kan konfigureras via .env och köras som systemd‑tjänst vid uppstart.

Krav
----
- Raspberry Pi med Raspberry Pi OS
- Node.js 18 eller nyare
- Aktiverad 1‑Wire om du använder DS18B20 (raspi-config)

Installation (GitHub‑repo)
--------------------------
1) Klona repot på din Raspberry Pi:
   git clone https://github.com/<ditt-konto>/raspberry_server_bastu.git
   cd raspberry_server_bastu

2) Konfigurera miljövariabler:
   Installationsscriptet skapar både lokal `.env` och `/etc/raspberry-bastu.env`.
   Du kan redigera värden i efterhand, främst `API_KEY`.

3) Installera och sätt upp som systemd‑tjänst:
   chmod +x scripts/install.sh
   ./scripts/install.sh

Uppdatera och starta om
-----------------------
- Från repo‑roten:
  - scripts/update.sh
- Gör manuellt:
  - git pull --rebase  (om repo är kopplat)
  - npm ci --omit=dev  (eller npm install --omit=dev)
  - sudo systemctl restart raspberry-bastu
  - sudo systemctl status raspberry-bastu
  - journalctl -u raspberry-bastu -f

Automatisk omstart vid fel/omboot
---------------------------------
- systemd‑uniten är konfigurerad med `Restart=always` och `WantedBy=multi-user.target`.
- Tjänsten startar vid boot och försöker startas om vid krasch.

4) Kontrollera status/loggar:
   sudo systemctl status raspberry-bastu
   journalctl -u raspberry-bastu -f

Aktivera 1‑Wire (DS18B20)
-------------------------
- Kör: sudo raspi-config
- Interface Options → 1‑Wire → Enable
- Starta om: sudo reboot
- Sensorer dyker under: /sys/bus/w1/devices/28*/w1_slave

Konfiguration (.env)
--------------------
Se `.env.example` för alla alternativ. Viktiga:
- PORT: lyssningsport (default 5000)
- API_BASE_URL, API_KEY: dina externa API‑inställningar
- PUBLISH_ENABLED, PUBLISH_URL: styr sändning av temperaturdata
- UPDATE_BOOKINGS_ENABLED, UPDATE_BOOKINGS_URL: hämtning/uppdatering av bokningar
- SCHEDULE_ACTIVE_START_HOUR, SCHEDULE_ACTIVE_END_HOUR, SCHEDULE_EVERY_MINUTES: schema
- ENABLE_*: aktivera valfria rutter (batteri, voltage, huawei)
  - ENABLE_BM2_BATTERY_ROUTE: aktiverar endpoint som läser BM2‑spänning via Python (enstaka mätning)
  - PUBLISH_BATTERY_ENABLED: postar BM2‑batterispänning enligt samma schema som temperaturer
  - PUBLISH_BATTERY_URL: endpoint för att posta batterispänning (om blankt används default `/SuanaTemp/Battery/Voltage` under API_BASE_URL)
- DEBUG_MODE: starta i debug‑läge (simulerade sensorer)
- DEBUG_SENSORS: kommaseparerad lista (t.ex. 28-TEST1,28-TEST2,cpu)

Köra lokalt
-----------
- Installera beroenden: npm install
- Starta: npm start
- Hälsa: curl http://localhost:5000/health
- Lokala temperaturer: curl http://localhost:5000/api/temperatures
- Frontend: öppna http://localhost:5000/ i webbläsare

API‑endpoints
-------------
- GET /health: enkel hälsokoll
- GET /api/temperatures: listar DS18B20‑sensorer + CPU‑temp
- GET /api/temperature/:id: proxar Temp/Today/<id> mot API_BASE_URL
- GET /api/bookingstoday: proxar dagliga bokningar
- GET /api/IsItBooked: proxar bokningsstatus
- GET /api/update-bookings: triggar uppdatering (server → externt API)
- (Valfritt) /api/battery-status, /api/batterystatustoday, /api/voltage_status, /api/huawei-*
- (Valfritt) /api/battery_voltage_once (BM2 via Python, returnerar { voltage, unit })
- Frontend-backend:
  - GET /api/runtime-status: körstatus, schema, sensorer
  - GET /api/publish-log: senaste publiceringar (limit=)
  - GET /api/debug: hämta debug‑läge och sensorer
  - POST /api/debug { enabled: boolean }: sätt debug‑läge
  - GET /api/update-bookings: manuell uppdatering (visas i dashboard)

Hur sändning fungerar
---------------------
- En intern timer körs varje minut.
- Sändning sker:
  - Var SCHEDULE_EVERY_MINUTES minut mellan SCHEDULE_ACTIVE_START_HOUR–SCHEDULE_ACTIVE_END_HOUR
  - Samt varje heltimme (minute === 0)
- Publicering och bokningsuppdatering kan stängas av via env.
  - Batterispänning: sätt `PUBLISH_BATTERY_ENABLED=true`. Servern läser BM2 en gång och postar till `PUBLISH_BATTERY_URL` per schema.

Felsökning
----------
- Kolla loggar: journalctl -u raspberry-bastu -f
- 1‑Wire saknas? Kontrollera att modulerna laddats och att filer finns under /sys/bus/w1/devices
- Kontrollera att API_KEY är satt om du använder externa API:er

Säkerhet
--------
- Lägg ALDRIG känsliga värden i källkod. Använd .env eller /etc/raspberry-bastu.env

Licens
------
- Privat/anpassad. Lägg till licens om du publicerar öppet.

BM2-batteri (enkel mätning)
---------------------------
- Script: `scripts/read_battery_once.js` spawnar ett Python‑skript som skriver endast volt till stdout (t.ex. `12.54`).
- Aktivera API‑route: sätt `ENABLE_BM2_BATTERY_ROUTE=true` i `.env` och starta om tjänsten.
- Miljövariabler:
  - `BM2_PYTHON`: sökväg till Python i venv (default: `/home/jesper/bm2-battery-monitor/.venv/bin/python`)
  - `BM2_SCRIPT`: sökväg till `voltage_once.py` som skriver spänning (default: `/home/jesper/bm2-battery-monitor/bm2_python/voltage_once.py`)
  - `BM2_TIMEOUT_MS`: timeout för körning (default: `70000`)
- Testa lokalt:
  - `node scripts/read_battery_once.js` → skriver t.ex. `12.54`
  - `curl http://localhost:5000/api/battery_voltage_once` → `{ "voltage": 12.54, "unit": "V" }`

Schemalagd publicering av batterispänning
----------------------------------------
- Sätt `PUBLISH_BATTERY_ENABLED=true` i `.env`.
- Valfritt: sätt `PUBLISH_BATTERY_URL` (annars används `API_BASE_URL + '/SuanaTemp/Battery/Voltage'`).
- Värdet loggas i publish-loggen som `type: 'battery'`, `sensor: 'bm2'` (kolumnen visar siffran i °C‑kolumnen).
