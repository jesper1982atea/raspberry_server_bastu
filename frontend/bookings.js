function $(sel) { return document.querySelector(sel); }

function fmt(iso) {
  if (!iso) return '–';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

async function refreshBookingsCard() {
  try {
    const r = await fetch('/api/runtime-status');
    if (!r.ok) throw new Error('runtime-status ' + r.status);
    const status = await r.json();
    $('#book-lastAt').textContent = fmt(status.bookings?.lastAt);
    $('#book-ok').textContent = status.bookings?.ok == null ? '–' : (status.bookings.ok ? 'OK' : 'FAIL');
    $('#book-status').textContent = status.bookings?.statusCode ?? '–';
    const info = status.bookings?.info ? String(status.bookings.info) : '';
    $('#book-info').textContent = info.slice(0,80) || '–';
    $('#book-info').title = info;
  } catch (e) {
    // ignore
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('#btnBookings');
  if (btn) {
    btn.addEventListener('click', async () => {
      try {
        await fetch('/api/update-bookings');
      } catch {}
      refreshBookingsCard();
    });
  }
  refreshBookingsCard();
  setInterval(refreshBookingsCard, 10000);
});

