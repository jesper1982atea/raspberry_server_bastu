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
   cp .env.example .env   # För lokal körning
   # Eller använd systemd‑env på /etc/raspberry-bastu.env (se installscript)

3) Installera och sätt upp som systemd‑tjänst:
   chmod +x scripts/install.sh
   ./scripts/install.sh

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
