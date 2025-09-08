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
