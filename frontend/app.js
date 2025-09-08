const El = (sel) => document.querySelector(sel);

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

function formatTime(iso) {
  if (!iso) return '–';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function formatUptime(sec) {
  if (sec == null) return '–';
  const s = Number(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return `${d}d ${h}h ${m}m ${ss}s`;
}

async function updateHealth() {
  try {
    const [status, temps] = await Promise.all([
      fetchJson('/api/runtime-status'),
      fetchJson('/api/temperatures'),
    ]);

    // Indicator
    const pill = El('#service-indicator');
    pill.textContent = 'IGÅNG';
    pill.classList.remove('down');
    pill.classList.add('up');

    // Health
    El('#now').textContent = formatTime(status.now);
    El('#uptime').textContent = formatUptime(status.uptimeSec);
    El('#lastTick').textContent = formatTime(status.schedule.lastTick);
    El('#lastPublishBatchAt').textContent = formatTime(status.schedule.lastPublishBatchAt);
    El('#lastPublishCount').textContent = status.schedule.lastPublishCount ?? 0;

    // Schedule
    El('#activeWindow').textContent = `${status.schedule.activeStartHour}:00–${status.schedule.activeEndHour}:00`;
    El('#everyMinutes').textContent = `${status.schedule.everyMinutes} min`;
    El('#inActiveWindow').textContent = status.schedule.inActiveWindow ? 'Ja' : 'Nej';
    El('#shouldSendNow').textContent = status.schedule.shouldSendNow ? 'Ja' : 'Nej';

    // Sensors
    const list = El('#sensorsList');
    list.innerHTML = '';
    temps.forEach(t => {
      const div = document.createElement('div');
      div.className = 'list-item';
      const name = t.sensor;
      const val = (t.temperature ?? '–');
      div.innerHTML = `<span>${name}</span><span>${val} °C</span>`;
      list.appendChild(div);
    });
  } catch (e) {
    const pill = El('#service-indicator');
    pill.textContent = 'NERE';
    pill.classList.remove('up');
    pill.classList.add('down');
  }
}

async function updateLog() {
  try {
    const log = await fetchJson('/api/publish-log?limit=100');
    const tbody = document.querySelector('#logTable tbody');
    tbody.innerHTML = '';
    log.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatTime(row.time)}</td>
        <td>${row.type || ''}</td>
        <td>${row.sensor || ''}</td>
        <td>${row.tempC != null ? Number(row.tempC).toFixed(2) : ''}</td>
        <td><span class="badge ${row.ok ? 'ok' : 'fail'}">${row.ok ? 'OK' : 'FAIL'}</span></td>
        <td title="${row.info || ''}">${(row.info || '').slice(0, 80)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    // ignore for now
  }
}

function tick() {
  updateHealth();
  updateLog();
}

tick();
setInterval(tick, 10000);

