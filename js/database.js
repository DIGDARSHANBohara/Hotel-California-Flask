'use strict';
const labels = { users:'Users', room_types:'Room Types', rooms:'Rooms', amenities:'Amenities', room_amenities:'Room Amenities', reservations:'Reservations', payments:'Payments', activity_logs:'Activity Logs' };
const descriptions = {
  users:'Customer and staff accounts share this table. Passwords are stored as hashes and hidden in this viewer.',
  room_types:'Categories define the nightly rate, guest capacity, and whether new bookings are offered.',
  rooms:'Physical rooms link to a category. Operational status is stored; Reserved and Occupied are derived from stays.',
  amenities:'One definition per amenity, such as Wi-Fi, Balcony, or Private pool.',
  room_amenities:'Each pair connects a physical room with an amenity. The pair is the primary key.',
  reservations:'Each stay links a customer and a room. Rates are saved snapshots; names and totals come from joins and calculations.',
  payments:'One full-payment summary per stay. Unpaid cancellations remain as Voided; paid cancellations become Refunded.',
  activity_logs:'A UTC record of important actions and the sample user responsible for each change.',
};
let selected = new URLSearchParams(location.search).get('table') || 'reservations';
if (!Object.hasOwn(labels,selected)) selected = 'reservations';
let requestVersion = 0;
async function load() {
  const version = ++requestVersion;
  const records = document.querySelector('#records');
  records.setAttribute('aria-busy','true');
  document.querySelector('#database-error').hidden = true;
  try {
    const response = await fetch('/api/database?table=' + encodeURIComponent(selected), { cache:'no-store' });
    if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Start the Flask database preview with app.py.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load records.');
    if (version !== requestVersion) return;
    document.querySelector('#connection').textContent = data.engine + ' · Connected';
    document.querySelector('#filename').textContent = data.database;
    document.querySelector('#tables').innerHTML = data.tables.map(t => `<button class="table-button" type="button" data-table="${t.name}" aria-current="${t.name === selected}">${labels[t.name]}<span>${t.count}</span></button>`).join('');
    document.querySelector('#table-title').textContent = labels[selected];
    document.querySelector('#table-description').textContent = descriptions[selected];
    const total = data.tables.find(t => t.name === selected).count;
    document.querySelector('#row-count').textContent = `${total} ${total === 1 ? 'record' : 'records'}`;
    document.querySelector('#query').textContent = data.query;
    document.querySelector('#updated').textContent = `Updated ${new Date().toLocaleTimeString()}${total > 200 ? ' · Showing the first 200 records' : ''}`;
    records.innerHTML = HC.table(data.columns.map(c => c.name), data.rows.map(row => `<tr>${data.columns.map(c => `<td>${HC.escape(row[c.name] == null ? 'NULL' : typeof row[c.name] === 'object' ? JSON.stringify(row[c.name]) : row[c.name])}</td>`).join('')}</tr>`));
    document.querySelector('#schema').innerHTML = HC.table(['Column','Type','Required','Primary key'],data.columns.map(c => `<tr><td><code>${HC.escape(c.name)}</code></td><td>${HC.escape(c.type)}</td><td>${c.notnull || c.pk ? 'Yes' : 'No'}</td><td>${c.pk ? 'Yes' : '—'}</td></tr>`)) + '<hr />' + (data.relationships.length ? data.relationships.map(r => `<p class="small"><code>${HC.escape(r.from)}</code> → <code>${HC.escape(r.table)}.${HC.escape(r.to)}</code></p>`).join('') : '<p class="small muted">This table has no outgoing foreign keys.</p>');
    history.replaceState(null,'','?table=' + selected);
  } catch (error) {
    if (version !== requestVersion) return;
    document.querySelector('#connection').textContent = 'Connection unavailable';
    document.querySelector('#database-error').textContent = error.message;
    document.querySelector('#database-error').hidden = false;
  } finally { if (version === requestVersion) records.setAttribute('aria-busy','false'); }
}
document.querySelector('#tables').onclick = event => { const button = event.target.closest('[data-table]'); if (button) { selected = button.dataset.table; load(); } };
document.querySelector('#refresh').onclick = load;
load();
