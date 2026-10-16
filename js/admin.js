'use strict';
// One controller for the admin interface. Each function renders one screen.
// Query-string navigation keeps this a simple static site with normal browser history.
const requestedPage = new URLSearchParams(location.search).get('page') || 'login';
const page = [
  'login',
  'dashboard',
  'rooms',
  'room-types',
  'reservations',
  'staff',
  'customers',
  'payments',
  'reports',
].includes(requestedPage)
  ? requestedPage
  : 'dashboard';
document.body.dataset.page = page;
HC.run(async () => {
await HC.auth.ready;
if (['login', 'register'].includes(page)) {
  HC.mountAuth('admin');
} else {
  HC.mountShell('admin', [
    ['dashboard', 'Dashboard', 'dashboard'],
    ['rooms', 'Rooms', 'rooms'],
    ['room-types', 'Room Types', 'rooms'],
    ['reservations', 'Reservations', 'reservations'],
    ['customers', 'Customers', 'people'],
    ['staff', 'Staff', 'people'],
    ['payments', 'Payments', 'payments'],
    ['reports', 'Reports', 'reports'],
  ]);
  const screens = {
    dashboard: showDashboard,
    rooms: showRooms,
    'room-types': showRoomTypes,
    reservations: showReservations,
    staff: showStaff,
    customers: showCustomers,
    payments: showPayments,
    reports: showReports,
  };
  screens[page]();
}

});

// dashboard screen
function showDashboard() {
  return HC.run(async () => {
    const [rooms, reservations, customers, payments, activity] = await Promise.all([
      HC.api.loadRooms(),
      HC.api.loadReservations(),
      HC.api.loadCustomers(),
      HC.api.loadPayments(),
      HC.api.loadActivity(),
    ]);
    const revenue = payments
      .filter((p) => p.status === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);
    HC.page(
      `Your hotel overview for ${HC.date(HC.today())}.`,
      /* HTML */ `<div class="stats">
          ${HC.stat('Total Rooms', rooms.length, 'Across all room types')}${HC.stat(
            'Occupied Rooms',
            rooms.filter((r) => r.status === 'Occupied').length,
            'Current in-house stays',
          )}${HC.stat(
            'Available Rooms',
            rooms.filter((r) => r.status === 'Available').length,
            'Ready for guests',
          )}${HC.stat('Total Reservations', reservations.length, 'All demo stays')}${HC.stat(
            'Revenue',
            HC.money(revenue),
            'Paid demo transactions',
          )}${HC.stat('Customers', customers.length, 'Guest profiles')}
        </div>
        <div class="operation-grid">
          <section class="card">
            <div class="card-heading">
              <h2>Recent reservations</h2>
              <a href="index.html?page=reservations" class="small">View all</a>
            </div>
            <div class="card-body">
              ${HC.reservationsTable(reservations.slice(-5).reverse(), true)}
            </div>
          </section>
          <section class="card card-body">
            <h3>Room occupancy</h3>
            ${HC.roomOverview(rooms)}
          </section>
        </div>
        <div class="grid grid-2">
          <section class="card">
            <div class="card-heading">
              <h2>Latest payments</h2>
              <a href="index.html?page=payments" class="small">View all</a>
            </div>
            <div class="card-body">
              ${HC.table(
                ['Reservation', 'Amount', 'Status'],
                payments
                  .slice(-4)
                  .reverse()
                  .map(
                    (p) =>
                      /* HTML */ `<tr>
                        <td>${p.reservationId}</td>
                        <td>${HC.money(p.amount)}</td>
                        <td>${HC.badge(p.status)}</td>
                      </tr>`,
                  ),
              )}
            </div>
          </section>
          <section class="card card-body">
            <h3>Staff activity</h3>
            ${activity
              .slice(-4)
              .reverse()
              .map(
                (a) =>
                  /* HTML */ `<div class="activity-item">
                    <p class="small">
                      <strong>${HC.escape(a.actor)}</strong> ${HC.escape(a.message)}
                    </p>
                    <span class="small muted">${HC.escape(a.time)}</span>
                  </div>`,
              )
              .join('')}
          </section>
        </div>`,
      '<a class="btn-secondary" href="index.html?page=reports">View Reports</a>',
    );
  });
}

// rooms screen
function showRooms() {
  return HC.run(() =>
    HC.mountManager({
      singular: 'Room',
      plural: 'Rooms',
      description: 'Manage your room inventory and availability.',
      headers: ['Room ID', 'Room Number', 'Room Type', 'Floor', 'Status'],
      load: () => HC.api.loadRooms(),
      save: (id, data) => HC.api.saveRoom(id, data),
      remove: (id) => HC.api.deleteRoom(id),
      cells: (r) => [
        r.id,
        /* HTML */ `<strong>${HC.escape(r.number)}</strong>`,
        HC.escape(r.type),
        r.floor,
        HC.badge(r.status),
      ],
      fields: async (r) => {
        const types = await HC.api.loadRoomTypes();
        return `${HC.field('Room number', 'number', r?.number || '', 'text', 'required maxlength="10"')}${HC.select(
          'Room type',
          'type',
          types.map((t) => t.name),
          r?.type || types[0]?.name,
        )}${HC.field('Floor', 'floor', r?.floor ?? 1, 'number', 'required min="0" max="99"')}${HC.select('Operational status', 'operationalStatus', [['ready', 'Ready'], ['maintenance', 'Maintenance'], ['inactive', 'Inactive']], r?.operationalStatus || 'ready')}`;
      },
    }),
  );
}

// room types screen
function showRoomTypes() {
  return HC.run(() =>
    HC.mountManager({
      singular: 'Room Type',
      plural: 'Room Types',
      description: 'Define the spaces, comforts, and rates guests can choose from.',
      headers: ['Type ID', 'Room Type', 'Price Per Night', 'Capacity', 'Beds', 'Description', 'Offering'],
      load: () => HC.api.loadRoomTypes(),
      save: (id, data) => HC.api.saveRoomType(id, data),
      remove: (id) => HC.api.deleteRoomType(id),
      cells: (r) => [
        r.id,
        /* HTML */ `<strong>${HC.escape(r.name)}</strong>`,
        HC.money(r.price),
        `${r.capacity} guests`,
        HC.escape(r.beds),
        HC.escape(r.description),
        HC.badge(r.isActive ? 'Active' : 'Inactive'),
      ],
      fields: async (r) =>
        `${HC.field('Room type', 'name', r?.name || '', 'text', 'required maxlength="50"')}${HC.field('Price per night (USD)', 'price', r?.price || 150, 'number', 'required min="0.01" max="10000" step="0.01"')}${HC.field('Capacity', 'capacity', r?.capacity || 2, 'number', 'required min="1" max="6"')}${HC.select('Offering status', 'isActive', [['true', 'Active'], ['false', 'Inactive']], String(r?.isActive ?? true))}${HC.field('Beds', 'beds', r?.beds || '1 king bed', 'text', 'required maxlength="60"')}<div class="form-group span-2"><label for="type-description">Description</label><textarea id="type-description" name="description" required maxlength="250">${HC.escape(r?.description || '')}</textarea></div>`,
    }),
  );
}

// reservations screen
function showReservations() {
  return HC.run(() => HC.mountReservationManagement(true));
}

// staff screen
function showStaff() {
  return HC.run(() =>
    HC.mountManager({
      singular: 'Staff Member',
      plural: 'Staff',
      description: 'The people behind every brighter stay.',
      headers: ['Staff ID', 'Name', 'Role', 'Email', 'Phone', 'Status'],
      load: () => HC.api.loadStaff(),
      save: (id, data) => HC.api.saveStaff(id, data),
      remove: (id) => HC.api.deleteStaff(id),
      cells: (r) => [
        r.id,
        /* HTML */ `<strong>${HC.escape(r.name)}</strong>`,
        HC.escape(r.role),
        HC.escape(r.email),
        HC.escape(r.phone),
        HC.badge(r.status),
      ],
      fields: async (r) =>
        `${HC.field('Full name', 'name', r?.name || '', 'text', 'required maxlength="80"')}${HC.select('Role', 'role', ['Receptionist', 'Manager', 'Admin'], r?.role || 'Receptionist')}${HC.field('Email', 'email', r?.email || '', 'email', 'required')}${HC.field(r ? 'New password (leave blank to keep current)' : 'Password', 'password', '', 'password', `${r ? '' : 'required'} minlength="8" maxlength="128" autocomplete="new-password"`)}${HC.field('Phone', 'phone', r?.phone || '', 'tel', 'required minlength="7" maxlength="25"')}${HC.select('Status', 'status', ['Active', 'Inactive'], r?.status || 'Active')}`,
    }),
  );
}

// customers screen
function showCustomers() {
  return HC.run(async () => {
    const [customers, reservations] = await Promise.all([
      HC.api.loadCustomers(),
      HC.api.loadReservations(),
    ]);
    HC.page(
      'Guest relationships, from their first stay to their next.',
      /* HTML */ `<div class="card filter-bar">
          ${HC.field(
            'Search customers',
            'search',
            '',
            'search',
            'placeholder="Name, email, or customer ID"',
          )}${HC.select('Status', 'status', [['', 'All statuses'], 'Active', 'Inactive'])}
        </div>
        <div class="card" id="customer-table"></div>`,
    );
    function paint() {
      const search = document.querySelector('#field-search').value.toLowerCase();
      const status = document.querySelector('#field-status').value;
      document.querySelector('#customer-table').innerHTML = HC.table(
        ['Customer ID', 'Name', 'Email', 'Phone', 'Total Reservations', 'Status'],
        customers
          .filter(
            (c) =>
              `${c.id} ${c.name} ${c.email}`.toLowerCase().includes(search) &&
              (!status || c.status === status),
          )
          .map(
            (c) =>
              /* HTML */ `<tr>
                <td>${c.id}</td>
                <td class="table-primary">${HC.escape(c.name)}</td>
                <td>${HC.escape(c.email)}</td>
                <td class="nowrap">${HC.escape(c.phone)}</td>
                <td>${reservations.filter((r) => r.customerId === c.id).length}</td>
                <td>${HC.badge(c.status)}</td>
              </tr>`,
          ),
      );
    }
    document.querySelector('#field-search').oninput = paint;
    document.querySelector('#field-status').onchange = paint;
    paint();
  });
}

// payments screen
function showPayments() {
  return HC.run(async () => {
    const payments = await HC.api.loadPayments();
    HC.page(
      'Track every sample payment and outstanding balance.',
      /* HTML */ `<div class="stats">
          ${HC.stat(
            'Collected Revenue',
            HC.money(payments.filter((p) => p.status === 'Paid').reduce((s, p) => s + p.amount, 0)),
            'Paid demo transactions',
          )}${HC.stat(
            'Pending Balance',
            HC.money(
              payments.filter((p) => p.status === 'Pending').reduce((s, p) => s + p.amount, 0),
            ),
            'Awaiting payment',
          )}${HC.stat('Transactions', payments.length, 'All demo transactions')}
        </div>
        <div class="card filter-bar">
          ${HC.field(
            'Search payments',
            'search',
            '',
            'search',
            'placeholder="Payment, reservation, or customer"',
          )}${HC.select('Payment status', 'status', [
            ['', 'All statuses'],
            'Pending',
            'Paid',
            'Failed',
            'Refunded',
            'Voided',
          ])}
        </div>
        <div class="card" id="payment-table"></div>`,
    );
    function paint() {
      const query = document.querySelector('#field-search').value.toLowerCase();
      const status = document.querySelector('#field-status').value;
      document.querySelector('#payment-table').innerHTML = HC.table(
        ['Payment ID', 'Reservation ID', 'Customer', 'Amount', 'Method', 'Status', 'Date'],
        payments
          .filter(
            (p) =>
              `${p.id} ${p.reservationId} ${p.customer}`.toLowerCase().includes(query) &&
              (!status || p.status === status),
          )
          .map(
            (p) =>
              /* HTML */ `<tr>
                <td>${p.id}</td>
                <td>${p.reservationId}</td>
                <td>${HC.escape(p.customer)}</td>
                <td class="table-primary">${HC.money(p.amount)}</td>
                <td>${HC.escape(p.method)}</td>
                <td>${HC.badge(p.status)}</td>
                <td class="nowrap">${HC.date(p.date)}</td>
              </tr>`,
          ),
      );
    }
    document.querySelector('#field-search').oninput = paint;
    document.querySelector('#field-status').onchange = paint;
    paint();
  });
}

// reports screen
function showReports() {
  return HC.run(async () => {
    const [rooms, reservations, payments, customers] = await Promise.all([
      HC.api.loadRooms(),
      HC.api.loadReservations(),
      HC.api.loadPayments(),
      HC.api.loadCustomers(),
    ]);
    const occupied = rooms.filter((r) => r.status === 'Occupied').length;
    const occupancy = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;
    const revenue = payments
      .filter((p) => p.status === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);
    const reports = [
      [
        'Occupancy Report',
        `${occupancy}%`,
        `${occupied} of ${rooms.length} rooms currently occupied`,
        'rooms',
      ],
      [
        'Revenue Report',
        HC.money(revenue),
        'Total collected from paid demo transactions',
        'reports',
      ],
      [
        'Reservation Report',
        reservations.length,
        `${reservations.filter((r) => r.status === 'Confirmed').length} confirmed · ${reservations.filter((r) => r.status === 'Pending').length} pending`,
        'reservations',
      ],
      [
        'Payment Report',
        payments.length,
        `${payments.filter((p) => p.status === 'Paid').length} paid · ${payments.filter((p) => p.status === 'Pending').length} pending`,
        'payments',
      ],
      [
        'Customer Report',
        customers.length,
        `${customers.filter((c) => c.status === 'Active').length} active guest profiles`,
        'people',
      ],
    ];
    HC.page(
      'A simple snapshot of how your hotel is doing.',
      /* HTML */ `<div class="notice">
          Sample values calculated from the local database. Report generation and downloads can
          be added later.
        </div>
        <div class="grid grid-3">
          ${reports
            .map(
              ([title, value, description, icon]) =>
                /* HTML */ `<article class="card card-body report-card">
                  ${HC.icon(icon)}
                  <h2>${title}</h2>
                  <div class="report-value">${value}</div>
                  <p class="muted">${description}</p>
                  ${title === 'Occupancy Report'
                    ? /* HTML */ `<progress
                        class="progress"
                        value="${occupancy}"
                        max="100"
                        aria-label="Room occupancy"
                      >
                        ${occupancy}%
                      </progress>`
                    : ''}
                </article>`,
            )
            .join('')}
        </div>`,
    );
  });
}
