'use strict';
// One controller for the receptionist interface. Each function renders one screen.
// Query-string navigation keeps this a simple static site with normal browser history.
const requestedPage = new URLSearchParams(location.search).get('page') || 'login';
const page = [
  'login',
  'dashboard',
  'reservations',
  'check-in',
  'check-out',
  'guests',
  'rooms',
].includes(requestedPage)
  ? requestedPage
  : 'dashboard';
document.body.dataset.page = page;
HC.run(async () => {
await HC.auth.ready;
if (['login', 'register'].includes(page)) {
  HC.mountAuth('receptionist');
} else {
  HC.mountShell('receptionist', [
    ['dashboard', 'Dashboard', 'dashboard'],
    ['reservations', 'Reservations', 'reservations'],
    ['check-in', 'Check In', 'entry'],
    ['check-out', 'Check Out', 'entry'],
    ['guests', 'Guests', 'people'],
    ['rooms', 'Room Status', 'rooms'],
  ]);
  const screens = {
    dashboard: showDashboard,
    reservations: showReservations,
    'check-in': showCheckIn,
    'check-out': showCheckOut,
    guests: showGuests,
    rooms: showRooms,
  };
  screens[page]();
}

});

// dashboard screen
function showDashboard() {
  return HC.run(async () => {
    const [rooms, reservations] = await Promise.all([
      HC.api.loadRooms(),
      HC.api.loadReservations(),
    ]);
    const arrivals = reservations.filter(
      (r) => r.checkIn === HC.today() && ['Confirmed', 'Checked In'].includes(r.status),
    );
    const departures = reservations.filter(
      (r) => r.checkOut === HC.today() && ['Checked In', 'Completed'].includes(r.status),
    );
    HC.page(
      `Here’s what’s happening today, ${HC.date(HC.today())}.`,
      /* HTML */ `<div class="stats">
          ${HC.stat("Today's Arrivals", arrivals.length, 'Expected and checked in')}${HC.stat(
            "Today's Departures",
            departures.length,
            'Due out and completed',
          )}${HC.stat(
            'Available Rooms',
            rooms.filter((r) => r.status === 'Available').length,
            'Ready to welcome',
          )}${HC.stat(
            'Occupied Rooms',
            rooms.filter((r) => r.status === 'Occupied').length,
            'Guests in house',
          )}${HC.stat(
            'Pending Reservations',
            reservations.filter((r) => r.status === 'Pending').length,
            'Awaiting confirmation',
          )}
        </div>
        <div class="operation-grid">
          <section class="card">
            <div class="card-heading">
              <h2>Recent bookings</h2>
              <a href="index.html?page=reservations" class="small">View all</a>
            </div>
            <div class="card-body">
              ${HC.reservationsTable(reservations.slice(-6).reverse(), true)}
            </div>
          </section>
          <section class="card card-body">
            <h2>Room status</h2>
            ${HC.roomOverview(rooms)}
          </section>
        </div>
        <section class="card card-body">
          <h2>Front desk shortcuts</h2>
          <div class="actions">
            <a class="btn-primary" href="index.html?page=check-in">Check In a Guest</a
            ><a class="btn-secondary" href="index.html?page=check-out">Check Out</a
            ><a class="btn btn-quiet" href="index.html?page=guests">Guest Directory</a>
          </div>
        </section>`,
      '<a class="btn-primary" href="index.html?page=check-in">Manage Arrivals</a>',
    );
  });
}

// reservations screen
function showReservations() {
  return HC.run(() => HC.mountReservationManagement(false));
}

// check in screen
function showCheckIn() {
  return HC.run(() => HC.mountStayOperation(false));
}

// check out screen
function showCheckOut() {
  return HC.run(() => HC.mountStayOperation(true));
}

// guests screen
function showGuests() {
  return HC.run(async () => {
    const [customers, reservations] = await Promise.all([
      HC.api.loadCustomers(),
      HC.api.loadReservations(),
    ]);
    HC.page(
      'Keep every guest’s stay in view.',
      /* HTML */ `<div class="card filter-bar">
          ${HC.field(
            'Search guests',
            'search',
            '',
            'search',
            'placeholder="Name, email, or guest ID"',
          )}
        </div>
        <div class="card" id="guests-table"></div>`,
    );
    function paint() {
      const search = document.querySelector('#field-search').value.toLowerCase();
      document.querySelector('#guests-table').innerHTML = HC.table(
        ['Guest ID', 'Name', 'Email', 'Phone', 'Current Room', 'Reservation', 'Status'],
        customers
          .filter((c) => `${c.id} ${c.name} ${c.email}`.toLowerCase().includes(search))
          .map((c) => {
            const stay =
              reservations.find((r) => r.customerId === c.id && r.status === 'Checked In') ||
              reservations.find(
                (r) => r.customerId === c.id && ['Confirmed', 'Pending'].includes(r.status),
              );
            return /* HTML */ `<tr>
              <td>${c.id}</td>
              <td class="table-primary">${HC.escape(c.name)}</td>
              <td>${HC.escape(c.email)}</td>
              <td class="nowrap">${HC.escape(c.phone)}</td>
              <td>${stay?.status === 'Checked In' ? HC.escape(stay.roomNumber) : '—'}</td>
              <td>${stay?.id || '—'}</td>
              <td>${HC.badge(stay?.status || 'No active stay')}</td>
            </tr>`;
          }),
      );
    }
    document.querySelector('#field-search').oninput = paint;
    paint();
  });
}

// rooms screen
function showRooms() {
  return HC.run(async () => {
    const rooms = await HC.api.loadRooms();
    HC.page(
      'A live view of your demo room inventory.',
      /* HTML */ `<div class="card filter-bar">
          ${HC.select('Room status', 'status', [
            ['', 'All rooms'],
            'Available',
            'Reserved',
            'Occupied',
            'Maintenance',
            'Inactive',
          ])}
        </div>
        <div class="grid grid-3" id="room-status-grid"></div>`,
    );
    function paint() {
      const filter = document.querySelector('#field-status').value;
      const matches = rooms.filter((r) => !filter || r.status === filter);
      document.querySelector('#room-status-grid').innerHTML = matches.length
        ? matches
            .map(
              (r) =>
                /* HTML */ `<article class="card room-status-tile" data-status="${r.status}">
                  <div class="summary-row">
                    <h3>Room ${HC.escape(r.number)}</h3>
                    ${HC.badge(r.status)}
                  </div>
                  <p>${HC.escape(r.type)}</p>
                  <p class="small muted">Floor ${r.floor} · Up to ${r.capacity} guests</p>
                  <p class="small muted">${HC.escape(r.name)}</p>
                </article>`,
            )
            .join('')
        : '<div class="card empty-state">No rooms with this status.</div>';
    }
    document.querySelector('#field-status').onchange = paint;
    paint();
  });
}
