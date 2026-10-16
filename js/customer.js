'use strict';
// One controller for the customer interface. Each function renders one screen.
// Query-string navigation keeps this a simple static site with normal browser history.
const requestedPage = new URLSearchParams(location.search).get('page') || 'login';
const page = [
  'login',
  'register',
  'dashboard',
  'rooms',
  'booking',
  'reservations',
  'payment',
  'profile',
].includes(requestedPage)
  ? requestedPage
  : 'dashboard';
document.body.dataset.page = page;
HC.run(async () => {
await HC.auth.ready;
if (['login', 'register'].includes(page)) {
  HC.mountAuth('customer');
} else {
  HC.mountShell('customer', [
    ['dashboard', 'Dashboard', 'dashboard'],
    ['rooms', 'Rooms', 'rooms'],
    ['reservations', 'My Reservations', 'reservations'],
    ['payment', 'Payments', 'payments'],
    ['profile', 'Profile', 'people'],
  ]);
  const screens = {
    dashboard: showDashboard,
    rooms: showRooms,
    booking: showBooking,
    reservations: showReservations,
    payment: showPayment,
    profile: showProfile,
  };
  screens[page]();
}

});

// dashboard screen
function showDashboard() {
  return HC.run(async () => {
    const [profile, rooms, reservations, payments] = await Promise.all([
      HC.api.loadProfile(),
      HC.api.loadRooms(),
      HC.api.loadReservations({ customerId: 'C001' }),
      HC.api.loadPayments({ customerId: 'C001' }),
    ]);
    const upcoming = reservations
      .filter((r) => ['Confirmed', 'Pending', 'Checked In'].includes(r.status))
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
    HC.page(
      'A little planning. A lot to look forward to.',
      /* HTML */ `<section class="stay-banner">
          <div>
            <p class="eyebrow">YOUR NEXT CHAPTER</p>
            <h2>Welcome, ${HC.escape(profile.name.split(' ')[0])}.</h2>
            <p>
              Ocean air, slow mornings, and a place to call your own. Your next getaway is waiting.
            </p>
            <a class="btn-primary" href="index.html?page=rooms">Find Your Next Stay</a>
          </div>
          <img
            src="../assets/images/hotel/resort.jpg"
            alt="A sunlit resort pool surrounded by palms"
            width="640"
            height="400"
          />
        </section>
        <div class="stats">
          ${HC.stat('Total Bookings', reservations.length, 'Your travel memories')}${HC.stat(
            'Upcoming Stay',
            upcoming ? HC.date(upcoming.checkIn) : 'Plan a stay',
            upcoming ? upcoming.id : 'Explore our rooms',
          )}${HC.stat(
            'Pending Payments',
            HC.money(
              payments.filter((p) => p.status === 'Pending').reduce((sum, p) => sum + p.amount, 0),
            ),
            'Manage your stay',
          )}
        </div>
        <section class="card">
          <div class="card-heading">
            <h2>Your upcoming reservation</h2>
            <a href="index.html?page=reservations" class="small">My Reservations</a>
          </div>
          <div class="card-body">
            ${upcoming
              ? /* HTML */ `<div class="upcoming-room">
                  <img
                    src="../${rooms.find((r) => r.id === upcoming.roomId)?.image}"
                    alt="${HC.escape(upcoming.roomName)}"
                  />
                  <div>
                    ${HC.badge(upcoming.status)}
                    <h3>${HC.escape(upcoming.roomName)}</h3>
                    <p class="muted">
                      ${HC.date(upcoming.checkIn)} – ${HC.date(upcoming.checkOut)} ·
                      ${upcoming.guests} guests
                    </p>
                  </div>
                </div>`
              : '<p>No upcoming stay yet. Find your next favorite room.</p>'}
            <hr />
            <div class="quick-links">
              <a class="btn-secondary" href="index.html?page=reservations">My Reservations</a
              ><a class="btn btn-quiet" href="index.html?page=payment">Payments</a
              ><a class="btn btn-quiet" href="index.html?page=rooms">Browse Rooms</a>
            </div>
          </div>
        </section>
        <section>
          <div class="section-heading">
            <h2>Picked for your next escape</h2>
            <a href="index.html?page=rooms">View all rooms</a>
          </div>
          <div class="grid grid-3">
            ${rooms
              .filter((r) => r.status === 'Available')
              .slice(0, 3)
              .map((r) => HC.roomCard(r))
              .join('')}
          </div>
        </section>`,
    );
  });
}

// rooms screen
function showRooms() {
  return HC.run(async () => {
    const params = new URLSearchParams(location.search);
    const types = await HC.api.loadRoomTypes();
    HC.page(
      'Find a space that feels like you.',
      /* HTML */ `<form class="card filter-bar room-filters" id="room-filters">
          ${HC.field(
            'Check in',
            'checkIn',
            params.get('checkIn') || HC.today(7),
            'date',
            `required min="${HC.today()}"`,
          )}${HC.field(
            'Check out',
            'checkOut',
            params.get('checkOut') || HC.today(10),
            'date',
            'required',
          )}${HC.select(
            'Room type',
            'type',
            [['', 'All room types'], ...types.map((t) => t.name)],
            params.get('type') || '',
          )}${HC.select(
            'Guests',
            'guests',
            [
              ['1', '1 guest'],
              ['2', '2 guests'],
              ['3', '3 guests'],
              ['4', '4 guests'],
              ['6', '6 guests'],
            ],
            params.get('guests') || '2',
          )}${HC.select(
            'Maximum price',
            'price',
            [
              ['', 'Any price'],
              ['200', 'Up to $200'],
              ['300', 'Up to $300'],
              ['500', 'Up to $500'],
            ],
            '',
          )}<button class="btn-primary" type="submit">Find Rooms</button
          ><button class="btn btn-quiet" type="reset">Reset</button>
        </form>
        <p class="results-count" id="room-count" role="status"></p>
        <div class="grid grid-3" id="room-results"></div>`,
    );
    const form = document.querySelector('#room-filters');
    function syncDates() {
      const start = form.elements.checkIn;
      const end = form.elements.checkOut;
      if (!start.value) return;
      end.min = new Date(Date.parse(start.value) + 86400000).toISOString().slice(0, 10);
      if (end.value <= start.value) end.value = end.min;
    }
    form.elements.checkIn.addEventListener('change', syncDates);
    syncDates();
    async function render() {
      const values = Object.fromEntries(new FormData(form));
      if (!form.reportValidity()) return;
      if (!(HC.nights(values.checkIn, values.checkOut) > 0)) {
        HC.toast('Choose a check-out date after check-in.');
        return;
      }
      const rooms = (await HC.api.loadRooms(values)).filter((room) => room.status === 'Available');
      const query = `&${new URLSearchParams({ checkIn: values.checkIn, checkOut: values.checkOut, guests: values.guests })}`;
      document.querySelector('#room-count').textContent =
        `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} match your stay · Prices in USD per night`;
      document.querySelector('#room-results').innerHTML = rooms.length
        ? rooms.map((r) => HC.roomCard(r, '../', query)).join('')
        : '<div class="card empty-state span-2">No rooms match these dates and filters. Try different dates, fewer guests, or a higher price limit.</div>';
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      HC.run(render);
    });
    form.addEventListener('reset', () =>
      setTimeout(() => {
        form.elements.type.value = '';
        form.elements.price.value = '';
        form.elements.guests.value = '2';
        form.elements.checkIn.value = HC.today(7);
        form.elements.checkOut.value = HC.today(10);
        syncDates();
        HC.run(render);
      }, 0),
    );
    await render();
  });
}

// booking screen
function showBooking() {
  return HC.run(async () => {
    const params = new URLSearchParams(location.search);
    const rooms = await HC.api.loadRooms();
    const room = rooms.find((r) => r.id === Number(params.get('room')));
    if (!room || ['Maintenance', 'Inactive'].includes(room.status)) {
      HC.page(
        'Choose your perfect room first.',
        '<div class="card card-body"><h2>This room is unavailable.</h2><p>Browse the current room selection to start a reservation.</p><a class="btn-primary" href="index.html?page=rooms">Browse Rooms</a></div>',
      );
      return;
    }
    HC.page(
      'A few details, then something to look forward to.',
      /* HTML */ `<div class="booking-layout">
        <section class="card">
          <img class="booking-image" src="../${room.image}" alt="${HC.escape(room.name)}" />
          <div class="card-body">
            <p class="eyebrow">${HC.escape(room.type)}</p>
            <h2>${HC.escape(room.name)}</h2>
            <p class="muted">${HC.escape(room.description)}</p>
            <form id="booking-form" class="stack">
              <div class="form-grid">
                ${HC.field(
                  'Check in',
                  'checkIn',
                  params.get('checkIn') || HC.today(7),
                  'date',
                  `required min="${HC.today()}"`,
                )}${HC.field(
                  'Check out',
                  'checkOut',
                  params.get('checkOut') || HC.today(10),
                  'date',
                  'required',
                )}${HC.select(
                  'Number of guests',
                  'guests',
                  Array.from({ length: room.capacity }, (_, i) => [
                    String(i + 1),
                    `${i + 1} ${i ? 'guests' : 'guest'}`,
                  ]),
                  params.get('guests') || '2',
                )}
              </div>
              <div class="form-group">
                <label for="requests">Special requests <span class="muted">(optional)</span></label
                ><textarea
                  id="requests"
                  name="requests"
                  maxlength="500"
                  placeholder="Anything we should know for your stay?"
                ></textarea>
              </div>
              <p class="error" id="booking-error" role="alert" hidden></p>
              <button type="submit" class="btn-primary full-width">Confirm Booking</button>
            </form>
          </div>
        </section>
        <aside class="card card-body booking-summary">
          <p class="eyebrow">YOUR GETAWAY</p>
          <h2>Stay summary</h2>
          <div id="booking-summary" aria-live="polite"></div>
          <hr />
          <p class="small muted">
            Sample prices in USD. No extra fees are added in this prototype. You can choose a
            payment method after confirming.
          </p>
        </aside>
      </div>`,
    );
    const form = document.querySelector('#booking-form');
    function update() {
      const values = Object.fromEntries(new FormData(form));
      const nights = HC.nights(values.checkIn, values.checkOut);
      if (values.checkIn)
        form.elements.checkOut.min = new Date(Date.parse(values.checkIn) + 86400000)
          .toISOString()
          .slice(0, 10);
      document.querySelector('#booking-summary').innerHTML = /* HTML */ `<div class="summary-row">
          <span>Room</span><strong>${HC.escape(room.name)}</strong>
        </div>
        <div class="summary-row">
          <span>Guests</span><strong>${HC.escape(values.guests)}</strong>
        </div>
        <div class="summary-row">
          <span>Price per night</span><strong>${HC.money(room.price)}</strong>
        </div>
        <div class="summary-row">
          <span>Number of nights</span
          ><strong>${nights > 0 ? nights : 'Choose valid dates'}</strong>
        </div>
        <div class="summary-row total">
          <span>Total</span><span>${nights > 0 ? HC.money(nights * room.price) : '—'}</span>
        </div>`;
    }
    form.addEventListener('input', update);
    update();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const reservation = await HC.api.createReservation({
          ...Object.fromEntries(new FormData(form)),
          roomId: room.id,
        });
        location.href = `index.html?page=payment&reservation=${reservation.id}&created=1`;
      } catch (error) {
        document.querySelector('#booking-error').textContent = error.message;
        document.querySelector('#booking-error').hidden = false;
        button.disabled = false;
      }
    });
  });
}

// reservations screen
function showReservations() {
  return HC.run(async function renderReservations() {
    const [reservations, rooms] = await Promise.all([
      HC.api.loadReservations({ customerId: 'C001' }),
      HC.api.loadRooms(),
    ]);
    HC.page(
      'Your stays, all in one place.',
      /* HTML */ `<div class="filter-bar card">
          ${HC.select('Reservation status', 'status', [
            ['', 'All stays'],
            'Pending',
            'Confirmed',
            'Cancelled',
            'Completed',
            'Checked In',
          ])}
        </div>
        <div id="reservation-list" class="stack"></div>`,
      '<a class="btn-primary" href="index.html?page=rooms">Book a Stay</a>',
    );
    function paint() {
      const status = document.querySelector('#field-status').value;
      const matches = reservations.filter((r) => !status || r.status === status);
      document.querySelector('#reservation-list').innerHTML = matches.length
        ? matches
            .map(
              (r) =>
                /* HTML */ `<article class="card reservation-card">
                  <img
                    src="../${rooms.find((room) => room.id === r.roomId)?.image ||
                    'assets/images/rooms/deluxe.jpg'}"
                    alt="${HC.escape(r.roomName)}"
                  />
                  <div class="card-body">
                    <div class="reservation-head">
                      <div>
                        <p class="eyebrow">${HC.escape(r.id)}</p>
                        <h3>${HC.escape(r.roomName)}</h3>
                      </div>
                      ${HC.badge(r.status)}
                    </div>
                    <p class="muted">
                      ${HC.date(r.checkIn)} – ${HC.date(r.checkOut)} · ${r.guests} guests ·
                      ${HC.nights(r.checkIn, r.checkOut)} nights
                    </p>
                    <div class="room-bottom">
                      <span class="price">${HC.money(r.total)}</span>
                      <div class="actions">
                        <button class="btn-secondary btn-small" data-view="${r.id}">
                          View Details</button
                        >${['Pending', 'Confirmed'].includes(r.status)
                          ? /* HTML */ `<button
                              class="btn btn-quiet btn-small danger"
                              data-cancel="${r.id}"
                            >
                              Cancel
                            </button>`
                          : ''}
                      </div>
                    </div>
                  </div>
                </article>`,
            )
            .join('')
        : '<div class="card empty-state">No reservations in this view. <a href="index.html?page=rooms">Explore rooms</a>.</div>';
    }
    document.querySelector('#field-status').onchange = paint;
    paint();
    document.querySelector('#reservation-list').onclick = (event) => {
      const view = event.target.closest('[data-view]');
      const cancel = event.target.closest('[data-cancel]');
      if (view) {
        const r = reservations.find((item) => item.id === view.dataset.view);
        HC.reservationDetails(r, true);
      }
      if (cancel)
        HC.confirm(
          'Cancel this stay?',
          'Your reservation will be cancelled. Unpaid payments remain in history as Voided; paid payments become Refunded.',
          'Cancel Reservation',
          () =>
            HC.run(async () => {
              await HC.api.cancelReservation(cancel.dataset.cancel);
              await renderReservations();
              HC.toast('Reservation cancelled.');
            }),
        );
    };
  });
}

// payment screen
function showPayment() {
  return HC.run(async function renderPayments() {
    const params = new URLSearchParams(location.search);
    const [reservations, payments] = await Promise.all([
      HC.api.loadReservations({ customerId: 'C001' }),
      HC.api.loadPayments({ customerId: 'C001' }),
    ]);
    const selected =
      reservations.find((r) => r.id === params.get('reservation') && r.status !== 'Cancelled') ||
      reservations.find((r) => ['Confirmed', 'Pending', 'Checked In'].includes(r.status));
    const payment = payments.find((p) => p.reservationId === selected?.id);
    HC.page(
      'Choose how you would like to settle your stay.',
      `${params.get('created') ? '<div class="notice">Your demo reservation is confirmed. Choose a payment method below.</div>' : ''}<div class="grid grid-2"><section class="card card-body"><p class="eyebrow">YOUR RESERVATION</p><h2>Payment details</h2>${
        selected
          ? `${HC.select(
              'Reservation',
              'reservation',
              reservations
                .filter((r) => r.status !== 'Cancelled')
                .map((r) => [r.id, `${r.id} · ${r.roomName}`]),
              selected.id,
            )}<div class="summary-row"><span>Room</span><strong>${HC.escape(selected.roomName)}</strong></div><div class="summary-row"><span>Dates</span><span>${HC.date(selected.checkIn)} – ${HC.date(selected.checkOut)}</span></div><div class="summary-row"><span>Status</span>${HC.badge(payment?.status || 'Pending')}</div><div class="summary-row total"><span>Amount due</span><span>${HC.money(['Paid', 'Refunded', 'Voided'].includes(payment?.status) || selected.status === 'Cancelled' ? 0 : selected.total)}</span></div>`
          : '<p>No reservation selected. <a href="index.html?page=rooms">Book your next stay</a>.</p>'
      }</section><section class="card card-body"><h2>Payment method</h2><form id="payment-form" class="stack"><fieldset class="stack"><legend>Choose a method</legend>${[
        ['Card', 'Simulate a card payment'],
        ['Digital Wallet', 'Simulate a wallet payment'],
        ['Pay at Hotel', 'Keep the balance due until arrival'],
      ]
        .map(
          ([method, text], index) =>
            /* HTML */ `<label class="payment-choice"
              ><input
                type="radio"
                name="method"
                value="${method}"
                ${index === 0 ? 'checked' : ''}
              /><span>${method}<small>${text}</small></span></label
            >`,
        )
        .join(
          '',
        )}</fieldset><p class="notice">Demo only. No card numbers, wallet access, or real charges are collected.</p><button type="submit" class="btn-primary full-width" ${!selected || ['Paid', 'Refunded', 'Voided'].includes(payment?.status) || selected.status === 'Cancelled' ? 'disabled' : ''}>Confirm Demo Payment</button></form></section></div><section class="card"><div class="card-heading"><h2>Payment history</h2></div><div class="card-body">${HC.table(
        ['Payment ID', 'Reservation', 'Amount', 'Method', 'Status', 'Date'],
        payments.map(
          (p) =>
            /* HTML */ `<tr>
              <td>${p.id}</td>
              <td>${p.reservationId}</td>
              <td>${HC.money(p.amount)}</td>
              <td>${HC.escape(p.method)}</td>
              <td>${HC.badge(p.status)}</td>
              <td>${HC.date(p.date)}</td>
            </tr>`,
        ),
      )}</div></section>`,
    );
    document.querySelector('#field-reservation')?.addEventListener('change', (event) => {
      location.href = `index.html?page=payment&reservation=${event.target.value}`;
    });
    document.querySelector('#payment-form').onsubmit = (event) => {
      event.preventDefault();
      if (!selected) return;
      const method = new FormData(event.target).get('method');
      HC.confirm(
        'Confirm demo payment?',
        `${HC.money(selected.total)} · ${method}. ${method === 'Pay at Hotel' ? 'The balance will stay pending.' : 'This only marks the sample payment as paid.'}`,
        'Confirm',
        () =>
          HC.run(async () => {
            await HC.api.payReservation(selected.id, method);
            history.replaceState(null, '', `index.html?page=payment&reservation=${selected.id}`);
            await renderPayments();
            HC.toast(
              method === 'Pay at Hotel'
                ? 'Payment at hotel selected. Balance remains pending.'
                : 'Demo payment recorded.',
            );
          }),
      );
    };
  });
}

// profile screen
function showProfile() {
  return HC.run(async () => {
    const profile = await HC.api.loadProfile();
    HC.page(
      'The details that make your stay yours.',
      /* HTML */ `<section class="card card-body">
        <h2>Guest profile</h2>
        <form class="stack" id="profile-form">
          <div class="form-grid">
            ${HC.field(
              'Full name',
              'name',
              profile.name,
              'text',
              'required maxlength="80"',
            )}${HC.field('Email address', 'email', profile.email, 'email', 'required')}${HC.field(
              'Phone number',
              'phone',
              profile.phone,
              'tel',
              'required minlength="7" maxlength="25"',
            )}
          </div>
          <button class="btn-primary" type="submit">Save Profile</button>
        </form>
      </section>`,
    );
    document.querySelector('#profile-form').onsubmit = (event) => {
      event.preventDefault();
      HC.run(async () => {
        await HC.api.updateProfile(Object.fromEntries(new FormData(event.target)));
        await HC.refreshGuestName();
        HC.toast('Profile updated.');
      });
    };
  });
}
