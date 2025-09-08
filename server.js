require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { exec } = require('child_process');
const axios = require('axios');

const app = express();
const port = Number(process.env.PORT || 5000);
app.use(express.json());

// Helper: env boolean parser
const envBool = (name, def = false) => {
  const v = process.env[name];
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

let ngrokUrl = '';

// Enkel in-memory logg för publiceringar och status
const MAX_LOG = Number(process.env.PUBLISH_LOG_SIZE || 200);
const publishLog = []; // {time, type, sensor, tempC, ok, info}
let lastSchedulerTickTime = null; // ISO string
let lastPublishBatchAt = null; // ISO string
let lastPublishCount = 0;
let lastSensors = [];
let debugMode = envBool('DEBUG_MODE', false);
const debugSensorList = (process.env.DEBUG_SENSORS || '28-TEST1,28-TEST2,cpu')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const simTemps = Object.create(null); // sensor -> tempC

function addLog(entry) {
  publishLog.push({ ...entry, time: new Date().toISOString() });
  if (publishLog.length > MAX_LOG) publishLog.splice(0, publishLog.length - MAX_LOG);
}

function simulateTemp(sensor) {
  // init defaults per sensor
  if (!(sensor in simTemps)) {
    const base = sensor === 'cpu' ? 45 : 20 + Math.random() * 10;
    simTemps[sensor] = base;
  }
  // add small jitter
  const jitter = (Math.random() - 0.5) * 0.6; // +/-0.3C
  let next = simTemps[sensor] + jitter;
  // clamp to sane range
  const min = sensor === 'cpu' ? 35 : 5;
  const max = sensor === 'cpu' ? 75 : 90;
  next = Math.max(min, Math.min(max, next));
  simTemps[sensor] = next;
  return next;
}

// Basdir för 1-wire sensorer (DS18B20)
const baseDir = process.env.W1_BASE_DIR || '/sys/bus/w1/devices/';
const deviceGlob = process.env.W1_DEVICE_GLOB || '28*';

// Funktion för att hämta alla sensorer som börjar med '28'
function getDeviceFolders() {
  try {
    return glob.sync(path.join(baseDir, deviceGlob));
  } catch (e) {
    console.error('Kunde inte läsa 1-wire enheter:', e.message);
    return [];
  }
}

// Funktion för att läsa rådata från en specifik sensor
function readTempRaw(deviceFile) {
  try {
    return fs.readFileSync(deviceFile, 'utf8').split('\n');
  } catch (e) {
    return [];
  }
}

// Funktion för att läsa och konvertera temperaturen i Celsius
function readTemp(deviceFile) {
  const lines = readTempRaw(deviceFile);
  if (lines.length >= 2 && lines[0].includes('YES')) {
    const equalsPos = lines[1].indexOf('t=');
    if (equalsPos !== -1) {
      const tempString = lines[1].substring(equalsPos + 2);
      const tempC = parseFloat(tempString) / 1000.0;
      return Number.isFinite(tempC) ? tempC : null;
    }
  }
  return null;
}

// CPU-temp som fallback
function readCpuTempC() {
  try {
    const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    const milli = parseInt(raw.trim(), 10);
    if (!Number.isNaN(milli)) return milli / 1000.0;
  } catch {}
  return null;
}

// Konfiguration för externa API:er
const API_BASE_URL = process.env.API_BASE_URL || 'https://sjoangensbastuflotte.azurewebsites.net';
const API_KEY = process.env.API_KEY || '';
const ENABLE_BATTERY_ROUTES = envBool('ENABLE_BATTERY_ROUTES', false);

if (ENABLE_BATTERY_ROUTES) {
  // Battery status
  app.get('/api/battery-status', async (req, res) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/SuanaTemp/Battery/status/latest`, {
        headers: { accept: 'text/plain', ApiKey: API_KEY },
      });
      res.json(response.data);
    } catch (error) {
      console.error('Fel vid hämtning av batteristatus:', error.message);
      res.status(500).send(`Error fetching data: ${error.message}`);
    }
  });
}

//

// Get Today Bookings
app.get('/api/bookingstoday', async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/SuanaTemp/GetTodaysBookings`, {
      headers: { accept: 'text/plain', ApiKey: API_KEY },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Fel vid hämtning av dagens bokningar:', error.message);
    res.status(500).send(`Error fetching data: ${error.message}`);
  }
});

if (ENABLE_BATTERY_ROUTES) {
  // Battery status today
  app.get('/api/batterystatustoday', async (req, res) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/SuanaTemp/Battery/status/today`, {
        headers: { accept: 'text/plain', ApiKey: API_KEY },
      });
      res.json(response.data);
    } catch (error) {
      console.error('Fel vid hämtning av batteristatus idag:', error.message);
      res.status(500).send(`Error fetching data: ${error.message}`);
    }
  });
}

// Check if is booked 
app.get('/api/IsItBooked', async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/Calendar/IsItBooked`, {
      headers: { accept: 'text/plain', ApiKey: API_KEY },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Fel vid hämtning av bokningsstatus:', error.message);
    res.status(500).send(`Error fetching data: ${error.message}`);
  }
});

// Fetch temperature for a specific ID
app.get('/api/temperature/:id', async (req, res) => {
    const id = req.params.id; // Get the ID from the request parameters
    const url = `${API_BASE_URL}/Temp/Today/${id}`;

    try {
        const response = await axios.get(url, {
            headers: { 'accept': 'text/plain', 'ApiKey': API_KEY }
        });
        res.json(response.data); // Send the fetched data as JSON
    } catch (error) {
        console.error('Error fetching temperature data:', error);
        res.status(500).send('Error fetching temperature data');
    }
});

// API-endpoint för att hämta temperaturer och sensornamn
app.get('/api/temperatures', (req, res) => {
  let temperatures = [];
  if (debugMode) {
    temperatures = debugSensorList.map((sensor) => ({
      sensor,
      temperature: Number(simulateTemp(sensor).toFixed(2)),
      unit: 'C',
      debug: true,
    }));
  } else {
    const deviceFolders = getDeviceFolders();
    temperatures = deviceFolders.map((folder) => {
      const deviceFile = path.join(folder, 'w1_slave');
      const sensorName = path.basename(folder);
      const tempC = readTemp(deviceFile);
      return {
        sensor: sensorName,
        temperature: tempC !== null ? Number(tempC.toFixed(2)) : null,
        unit: 'C',
        debug: false,
      };
    });
    // Lägg till CPU-temp som "cpu" om tillgänglig
    const cpu = readCpuTempC();
    if (cpu !== null) {
      temperatures.push({ sensor: 'cpu', temperature: Number(cpu.toFixed(2)), unit: 'C', debug: false });
    }
  }
  res.json(temperatures);
});

// Funktion för att hämta Ngrok tunnelinformation
async function fetchNgrokTunnelInfo() {
    try {
        const response = await fetch('http://localhost:4040/api/tunnels');
        const data = await response.json();
        if (data.tunnels && data.tunnels.length > 0) {
            ngrokUrl = data.tunnels[0].public_url;
        } else {
            console.error('No tunnels found');
        }
    } catch (error) {
        console.error('Error fetching Ngrok tunnel info:', error);
    }
}

// Schemalägg att hämta Ngrok tunnelinformation var 10:e sekund
//setInterval(fetchNgrokTunnelInfo, 10000);

// API-endpoint för att hämta Ngrok URL
//app.get('/api/ngrok-url', (req, res) => {
//    res.json({ url: ngrokUrl });
//});

const ENABLE_VOLTAGE_ROUTE = envBool('ENABLE_VOLTAGE_ROUTE', false);
if (ENABLE_VOLTAGE_ROUTE) {
  // Voltage monitor status (kräver python-skript och venv)
  app.get('/api/voltage_status', (req, res) => {
    const pythonScript = process.env.VOLTAGE_PY || '/home/pi/voltage.py';
    const venvPython = process.env.VOLTAGE_PYTHON || '/home/pi/.venv/bin/python';
    const command = `${venvPython} ${pythonScript}`;

    exec(command, (error, stdout, stderr) => {
      if (error) return res.status(500).send('Error running script');
      if (stderr) console.error(`Python stderr: ${stderr}`);
      try {
        const data = JSON.parse(stdout);
        res.json(data);
      } catch (parseError) {
        console.error(`Error parsing Python output: ${parseError.message}`);
        res.status(500).send('Error parsing script output');
      }
    });
  });
}



const ENABLE_HUAWEI_ROUTES = envBool('ENABLE_HUAWEI_ROUTES', false);
if (ENABLE_HUAWEI_ROUTES) {
  // API endpoint for running monitoring_status.py and returning JSON
  app.get('/api/monitoring-status', (req, res) => {
    const pythonScript = process.env.HUAWEI_MONITOR_PY || '/home/pi/monitor_status.py';
    const venvPython = process.env.HUAWEI_PYTHON || '/home/pi/.venv/bin/python3';
    const command = `${venvPython} ${pythonScript}`;

    exec(command, (error, stdout, stderr) => {
      if (error) return res.status(500).send('Error running script');
      if (stderr) console.error(`Python stderr: ${stderr}`);
      try {
        const data = JSON.parse(stdout);
        res.json(data);
      } catch (parseError) {
        console.error(`Error parsing Python output: ${parseError.message}`);
        res.status(500).send('Error parsing script output');
      }
    });
  });

  // API-endpoint to run Huawei data dump script
  app.get('/api/huawei-data', (req, res) => {
    const pythonScript = process.env.HUAWEI_DUMP_PY || '/home/pi/data_dump.py';
    const venvPython = process.env.HUAWEI_PYTHON || '/home/pi/.venv/bin/python3';
    const url = process.env.HUAWEI_ROUTER_URL || 'http://admin:admin@192.168.1.1/';
    const command = `${venvPython} ${pythonScript} ${url}`;

    exec(command, (error, stdout, stderr) => {
      if (error) return res.status(500).send('Error running script');
      if (stderr) console.error(`Python stderr: ${stderr}`);
      res.type('text/plain').send(stdout);
    });
  });
}




// /home/jesper/huawei/.venv/bin/python3 /home/jesper/huawei/data_dump.py http://admin:admin@192.168.1.1/

// API-endpoint to run Python script in .venv and return Huawei router data
app.get('/api/huawei-data', (req, res) => {
    const pythonScript = '/home/jesper/huawei/data_dump.py';  // Path to your Python script
    const venvPython = '/home/jesper/huawei/.venv/bin/python3';  // Path to Python inside .venv
    const url = 'http://admin:admin@192.168.1.1/';  // Router URL
    const command = `${venvPython} ${pythonScript} ${url}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing Python script: ${error.message}`);
            return res.status(500).send('Error running script');
        }
        if (stderr) {
            console.error(`Python stderr: ${stderr}`);
        }

        // Send the output from the Python script back to the client
        res.send(`<pre>${stdout}</pre>`);
    });
});


// Funktion f  r att skicka temperaturdata till extern API
async function sendTemperatureData(sensorName, tempC) {
    const timestamp = new Date().toISOString();

    const data = {
        tempC: tempC,
        timestamp: timestamp,
        name: sensorName
    };

    try {
        const response = await fetch(`${process.env.PUBLISH_URL || API_BASE_URL + '/SuanaTemp/TempData'}`, {
            method: 'POST',
            headers: {
                'accept': 'text/plain',
                'ApiKey': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const responseData = await response.text();
        addLog({ type: 'temp', sensor: sensorName, tempC, ok: response.ok, info: responseData.slice(0, 200) });
        console.log(`Data sent for ${sensorName}: ${responseData}`);
    } catch (error) {
        console.error(`Error sending data for ${sensorName}: ${error}`);
        addLog({ type: 'temp', sensor: sensorName, tempC, ok: false, info: String(error).slice(0, 200) });
    }
}




// Funktion f  r att schemal  gga temperaturdata
const ACTIVE_START_HOUR = Number(process.env.SCHEDULE_ACTIVE_START_HOUR || 6);
const ACTIVE_END_HOUR = Number(process.env.SCHEDULE_ACTIVE_END_HOUR || 22);
const EVERY_MINUTES = Number(process.env.SCHEDULE_EVERY_MINUTES || 5);
const PUBLISH_ENABLED = envBool('PUBLISH_ENABLED', true);
const UPDATE_BOOKINGS_ENABLED = envBool('UPDATE_BOOKINGS_ENABLED', true);

async function scheduleTemperatureSending() {
  const deviceFolders = debugMode ? [] : getDeviceFolders();
  lastSensors = debugMode ? debugSensorList.slice() : deviceFolders.map((f) => path.basename(f));
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  const inActiveWindow = hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR;
  const shouldSend = (inActiveWindow && minute % EVERY_MINUTES === 0) || minute === 0;

  lastSchedulerTickTime = now.toISOString();
  if (!shouldSend) return;

  // Läs alla sensorer
  lastPublishBatchAt = now.toISOString();
  let count = 0;
  if (debugMode) {
    lastSensors.forEach((sensorName) => {
      const tempC = simulateTemp(sensorName);
      if (PUBLISH_ENABLED) {
        sendTemperatureData(sensorName, tempC);
        count++;
      }
    });
  } else {
    deviceFolders.forEach((folder) => {
      const deviceFile = path.join(folder, 'w1_slave');
      const sensorName = path.basename(folder);
      const tempC = readTemp(deviceFile);
      if (tempC !== null && PUBLISH_ENABLED) {
        sendTemperatureData(sensorName, tempC);
        count++;
      }
    });
    // CPU-temp som extra datapunkt
    const cpu = readCpuTempC();
    if (cpu !== null && PUBLISH_ENABLED) {
      sendTemperatureData('cpu', cpu);
      count++;
    }
  }

  lastPublishCount = count;
  if (UPDATE_BOOKINGS_ENABLED) {
    fetchBookings().catch((err) => console.error('Fel vid uppdatering av bokningar:', err.message));
  }
}

async function fetchBookings() {
    const url = process.env.UPDATE_BOOKINGS_URL || `${API_BASE_URL}/Calendar/UpdateBookings`;
    
    try {
        // Send the GET request to the external API
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'accept': 'text/plain', 'ApiKey': API_KEY }
        });

        // Check if the response is okay
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get the response as text
        const data = await response.text();
        return data;  // Return the data to the caller
    } catch (error) {
        console.error(`Error fetching bookings: ${error.message}`);
        throw error;  // Propagate the error so it can be handled by the caller
    }
}

// Example route where the fetchBookings function can be used
app.get('/api/update-bookings', async (req, res) => {
    try {
        // Call the fetchBookings function and get the data
        const data = await fetchBookings();

        // Send the data back to the client
        res.send(`<pre>${data}</pre>`);
    } catch (error) {
        res.status(500).send('Error fetching bookings from API');
  }
});

// Status och logg-endpoints för frontend
app.get('/api/publish-log', (req, res) => {
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 50)));
  res.json(publishLog.slice(-limit).reverse());
});

app.get('/api/runtime-status', (req, res) => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const inActiveWindow = hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR;
  const shouldSend = (inActiveWindow && minute % EVERY_MINUTES === 0) || minute === 0;
  res.json({
    now: now.toISOString(),
    uptimeSec: Math.round(process.uptime()),
    schedule: {
      activeStartHour: ACTIVE_START_HOUR,
      activeEndHour: ACTIVE_END_HOUR,
      everyMinutes: EVERY_MINUTES,
      inActiveWindow,
      shouldSendNow: shouldSend,
      lastTick: lastSchedulerTickTime,
      lastPublishBatchAt,
      lastPublishCount,
    },
    sensors: {
      discovered: lastSensors,
      cpuTempC: debugMode ? simulateTemp('cpu') : readCpuTempC(),
    },
    flags: {
      PUBLISH_ENABLED,
      UPDATE_BOOKINGS_ENABLED,
      ENABLE_BATTERY_ROUTES,
      ENABLE_VOLTAGE_ROUTE,
      ENABLE_HUAWEI_ROUTES,
      DEBUG_MODE: debugMode,
    },
    debug: debugMode ? { sensors: debugSensorList } : null,
  });
});

// Debug mode endpoints
app.get('/api/debug', (req, res) => {
  res.json({ enabled: debugMode, sensors: debugSensorList });
});

app.post('/api/debug', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
  debugMode = enabled;
  addLog({ type: 'debug', sensor: '-', tempC: null, ok: true, info: `debugMode=${enabled}` });
  res.json({ enabled: debugMode });
});

// Hälsa
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Schemalägg var minut (intern logik avgör om sändning sker)
console.log('Startar schema: kontrollerar sändning varje minut');
setInterval(scheduleTemperatureSending, 60 * 1000);


// (Valfritt) statiska filer om mapp finns
try {
  const staticDir = path.join(__dirname, 'frontend');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }
} catch {}

// Starta servern
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
