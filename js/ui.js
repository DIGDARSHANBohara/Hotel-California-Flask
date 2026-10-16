// utils

window.HC = window.HC || {};
Object.assign(HC, {
  escape(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  },
  money(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(value);
  },
  today(offset = 0) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  },
  date(value) {
    return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  },
  nights(start, end) {
    return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
  },
  badge(status) {
    return /* HTML */ `<span
      class="badge status-${HC.escape(status.toLowerCase().replaceAll(' ', '-'))}"
      >${HC.escape(status)}</span
    >`;
  },
  toast(message) {
    let toast = document.querySelector('#toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(HC.toastTimer);
    HC.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 4500);
  },
  modal(title, content, onReady) {
    document.querySelector('#shared-dialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'shared-dialog';
    dialog.className = 'dialog';
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.innerHTML = /* HTML */ `<div class="dialog-head">
        <h2 id="dialog-title">${HC.escape(title)}</h2>
        <button class="text-button" aria-label="Close dialog" data-close>✕</button>
      </div>
      <div class="dialog-body">${content}</div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          dialog.close();
      }
    });
    dialog.showModal();
    onReady?.(dialog);
    return dialog;
  },
  confirm(title, message, action, callback) {
    HC.modal(
      title,
      /* HTML */ `<p>${HC.escape(message)}</p>
        <div class="dialog-actions">
          <button class="btn btn-quiet" data-back>Go back</button
          ><button class="btn-primary" data-confirm>${HC.escape(action)}</button>
        </div>`,
      (dialog) => {
        dialog.querySelector('[data-back]').onclick = () => dialog.close();
        dialog.querySelector('[data-confirm]').onclick = async () => {
          dialog.close();
          await callback();
        };
      },
    );
  },
  async run(task) {
    try {
      return await task();
    } catch (error) {
      HC.toast(error.message || 'Something went wrong. Please try again.');
      console.error(error);
    }
  },
  table(headers, rows, empty = 'No matching records found.') {
    return /* HTML */ `<div
      class="table-wrap"
      tabindex="0"
      role="region"
      aria-label="${HC.escape(headers[0])} records"
    >
      <table>
        <thead>
          <tr>
            ${headers.map((h) => /* HTML */ `<th scope="col">${HC.escape(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.join('')
            : /* HTML */ `<tr>
                <td colspan="${headers.length}" class="empty-state">${HC.escape(empty)}</td>
              </tr>`}
        </tbody>
      </table>
    </div>`;
  },
  stat(label, value, foot = 'Demo data') {
    return /* HTML */ `<div class="card stat">
      <div class="stat-label">${HC.escape(label)}</div>
      <div class="stat-value">${HC.escape(value)}</div>
      <div class="stat-foot">${HC.escape(foot)}</div>
    </div>`;
  },
  field(label, name, value = '', type = 'text', extra = '') {
    return /* HTML */ `<div class="form-group">
      <label for="field-${name}">${HC.escape(label)}</label
      ><input
        id="field-${name}"
        name="${name}"
        type="${type}"
        value="${HC.escape(value)}"
        ${extra}
      />
    </div>`;
  },
  select(label, name, choices, value = '', extra = '') {
    return /* HTML */ `<div class="form-group">
      <label for="field-${name}">${HC.escape(label)}</label
      ><select id="field-${name}" name="${name}" ${extra}>
        ${choices
          .map((choice) => {
            const [v, labelText] = Array.isArray(choice) ? choice : [choice, choice];
            return /* HTML */ `<option
              value="${HC.escape(v)}"
              ${String(v) === String(value) ? 'selected' : ''}
            >
              ${HC.escape(labelText)}
            </option>`;
          })
          .join('')}
      </select>
    </div>`;
  },
  roomCard(room, prefix = '../', query = '') {
    return /* HTML */ `<article class="card room-card">
      <div class="room-top">
        <img
          src="${prefix}${HC.escape(room.image)}"
          alt="${HC.escape(room.name)}"
          loading="lazy"
          width="640"
          height="420"
        />${HC.badge(room.status)}
      </div>
      <div class="card-body">
        <p class="eyebrow">${HC.escape(room.type)}</p>
        <h3>${HC.escape(room.name)}</h3>
        <p>${HC.escape(room.description)}</p>
        <div class="room-meta">
          <span>Up to ${room.capacity} guests</span><span>${HC.escape(room.beds)}</span
          ><span>${HC.escape(room.amenities.join(' · '))}</span>
        </div>
        <div class="room-bottom">
          <span class="price">${HC.money(room.price)} <small>/ night</small></span
          >${room.status === 'Available'
            ? /* HTML */ `<a
                class="btn-secondary btn-small"
                href="${prefix}customer/index.html?page=booking&room=${room.id}${query}"
                >Book Now</a
              >`
            : '<span class="muted small">Unavailable</span>'}
        </div>
      </div>
    </article>`;
  },
  brand(prefix = '../') {
    return /* HTML */ `<a class="brand" href="${prefix}index.html"
      ><span class="brand-mark" aria-hidden="true">H</span
      ><span class="brand-name">HOTEL CALIFORNIA<small>STAY A LITTLE LONGER</small></span></a
    >`;
  },
  icon(name) {
    const paths = {
      dashboard:
        '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      rooms: '<path d="M3 18V7m18 11V7M3 14h18M6 10h4m4 0h4M3 18v3m18-3v3"/>',
      reservations:
        '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h3"/>',
      people:
        '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v2"/>',
      payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
      reports: '<path d="M4 3v18h17M8 17v-5m5 5V7m5 10V4"/>',
      entry: '<path d="M13 3h7v18h-7M3 12h12m-4-4 4 4-4 4"/>',
    };
    return /* HTML */ `<span class="nav-icon" aria-hidden="true"
      ><svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        ${paths[name] || paths.rooms}
      </svg></span
    >`;
  },
});

// layout

HC.mountShell = function (role, navigation) {
  const page = document.body.dataset.page;
  const current = navigation.find((item) => item[0] === page) || [
    page,
    page === 'booking' ? 'Book Your Stay' : 'Welcome',
  ];
  document.title = `${current[1]} · Hotel California`;
  const accountRole = HC.auth.current?.role || role;
  const name = HC.auth.current?.name || { customer: 'Alex Morgan', receptionist: 'Jamie Rivera', admin: 'Taylor Brooks' }[role];
  document.querySelector('#app').innerHTML = /* HTML */ `<div class="app-shell">
    <aside class="sidebar" id="sidebar">
      ${HC.brand()}
      <p class="sidebar-label">
        ${role === 'customer' ? 'Your stay' : role === 'admin' ? 'Hotel management' : 'Front desk'}
      </p>
      <nav aria-label="${role} navigation">
        ${navigation
          .map(
            ([url, label, icon]) =>
              /* HTML */ `<a
                href="index.html?page=${url}"
                ${page === url ? 'aria-current="page"' : ''}
                >${HC.icon(icon)}${label}</a
              >`,
          )
          .join('')}
      </nav>
      <a class="logout" href="../index.html" data-logout>${HC.icon('entry')}Log Out</a>
      ${role === 'admin' ? '<a class="small" href="../database/">View Database</a>' : ''}<p class="small muted">Local database preview</p>
    </aside>
    <div class="app-area">
      <header class="app-topbar">
        <button class="menu-toggle" aria-expanded="false" aria-controls="sidebar">☰ Menu</button>
        <p>Hotel California <span aria-hidden="true">/</span> ${current?.[1] || 'Welcome'}</p>
        <div class="user-chip">
          <span class="badge">${accountRole[0].toUpperCase() + accountRole.slice(1)}</span
          ><span class="avatar" aria-hidden="true"
            >${HC.escape(name
              .split(' ')
              .map((n) => n[0])
              .join(''))}</span
          ><span class="account-name">${HC.escape(name)}</span>
          <a class="profile-link" href="/customer/index.html?page=login" data-switch-account>Switch Account</a>
        </div>
      </header>
      <main class="app-main" id="main" tabindex="-1">
        <div class="page-header">
          <div>
            <p class="eyebrow">
              ${role === 'customer' ? 'Make yourself at home' : 'Hotel California'} ·
              ${role === 'customer'
                ? 'Guest space'
                : role === 'admin'
                  ? 'Administration'
                  : 'Front desk'}
            </p>
            <h1>${current?.[1] || 'Welcome'}</h1>
            <p class="muted" id="page-description"></p>
          </div>
          <div id="page-actions"></div>
        </div>
        <div id="page-content" class="stack" aria-busy="true">
          <p class="notice">Loading your workspace…</p>
        </div>
      </main>
    </div>
  </div>`;
  const toggle = document.querySelector('.menu-toggle');
  document.querySelector('[data-switch-account]').onclick = event => {
    event.preventDefault();
    HC.run(HC.auth.switchAccount);
  };
  document.querySelector('[data-logout]').onclick = event => {
    event.preventDefault();
    HC.run(HC.auth.logout);
  };
  toggle.onclick = () => {
    const open = document.querySelector('#sidebar').classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelector('#sidebar').classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  if (role === 'customer') HC.run(HC.refreshGuestName);
};
HC.refreshGuestName = async function () {
  const profile = await HC.api.loadProfile();
  const chip = document.querySelector('.user-chip');
  if (!chip) return;
  chip.querySelector('.account-name').textContent = profile.name;
  HC.auth.current.name = profile.name;
  chip.querySelector('.avatar').textContent = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
};
HC.page = function (description, content, actions = '') {
  document.querySelector('#page-description').textContent = description;
  document.querySelector('#page-actions').innerHTML = actions;
  const root = document.querySelector('#page-content');
  root.innerHTML = content;
  root.setAttribute('aria-busy', 'false');
};

// auth

HC.mountLogin = function (role) {
  const params = new URLSearchParams(location.search);
  const selectedRole = params.get('role') === 'manager' ? 'manager' : role;
  document.title = 'Log In · Hotel California';
  document.querySelector('#app').innerHTML = /* HTML */ `<main class="auth-layout" id="main">
    <section class="auth-visual" aria-label="Hotel California resort">${HC.brand()}
      <div><p class="eyebrow">GOOD STAYS, BRIGHTER DAYS</p><h2>Your next chapter<br>starts with a stay.</h2></div>
    </section>
    <section class="auth-panel"><div class="auth-content">
      <div class="auth-mobile-brand">${HC.brand()}</div>
      <p class="eyebrow">CHOOSE YOUR PORTAL</p><h1>Log in to Hotel California</h1>
      <p class="muted">Choose how you would like to use the hotel website.</p>
      <form id="auth-form" class="stack">
        ${HC.select('Log in as', 'role', [['customer', 'Customer'], ['receptionist', 'Receptionist'], ['admin', 'Admin'], ['manager', 'Manager']], selectedRole)}
        ${HC.field('Email address', 'email', '', 'email', 'required autocomplete="username" maxlength="254" placeholder="you@example.com"')}
        ${HC.field('Password', 'password', '', 'password', 'required autocomplete="current-password" maxlength="128"')}
        <p id="auth-error" class="error" role="alert" hidden></p>
        <button class="btn-primary full-width" type="submit">Log In</button>
      </form>
      <p class="small">New customer? <a href="../customer/index.html?page=register">Create an account</a></p>
      <a class="back-link" href="../index.html">Back to homepage</a>
    </div></section>
  </main>`;
  const form = document.querySelector('#auth-form');
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const error = document.querySelector('#auth-error');
    button.disabled = true;
    error.hidden = true;
    try {
      const result = await HC.auth.login(form.elements.role.value, form.elements.email.value, form.elements.password.value);
      const portal = result.user.role === 'manager' ? 'receptionist' : result.user.role;
      const next = new URL(params.get('next') || result.portal, location.origin);
      const allowed = next.origin === location.origin && (next.pathname === `/${portal}/index.html` ||
        (result.user.role === 'admin' && ['/database/', '/database/index.html'].includes(next.pathname)));
      location.href = allowed ? next.href : result.portal;
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      button.disabled = false;
    }
  };
};

HC.mountAuth = function (role) {
  const register = document.body.dataset.page === 'register';
  if (!register) return HC.mountLogin(role);
  document.title = `${register ? 'Register' : 'Login'} · ${role[0].toUpperCase() + role.slice(1)} · Hotel California`;
  const title = register
    ? 'A brighter stay starts here'
    : role === 'customer'
      ? 'Welcome back'
      : role === 'receptionist'
        ? 'Welcome to the front desk'
        : 'Your hotel, at a glance';
  document.querySelector('#app').innerHTML = /* HTML */ `<main class="auth-layout" id="main">
    <section class="auth-visual" aria-label="Hotel California resort">
      ${HC.brand()}
      <div>
        <p class="eyebrow">GOOD STAYS, BRIGHTER DAYS</p>
        <h2>Your next chapter<br />starts with a stay.</h2>
        <p>A little space to unwind. A lot to look forward to.</p>
      </div>
    </section>
    <section class="auth-panel">
      <div class="auth-content">
        <div class="auth-mobile-brand">${HC.brand()}</div>
        <p class="eyebrow">${HC.escape(role)} ${register ? 'registration' : 'login'}</p>
        <h1>${title}</h1>
        <p class="muted">
          ${register
            ? 'Create your customer account and explore your next getaway.'
            : 'Step inside your Hotel California space.'}
        </p>
        <form id="auth-form" class="stack">
          ${register
            ? HC.field(
                'Full name',
                'name',
                '',
                'text',
                'required autocomplete="name" maxlength="80"',
              )
            : ''}${HC.field(
            'Email address',
            'email',
            '',
            'email',
            'required autocomplete="email" placeholder="alex@example.com"',
          )}${register
            ? HC.field(
                'Phone number',
                'phone',
                '',
                'tel',
                'required autocomplete="tel" minlength="7" maxlength="25"',
              )
            : ''}${HC.field(
            'Password',
            'password',
            '',
            'password',
            `required autocomplete="${register ? 'new-password' : 'current-password'}" ${register ? 'minlength="8"' : ''}`,
          )}${register
            ? HC.field(
                'Confirm password',
                'confirmPassword',
                '',
                'password',
                'required autocomplete="new-password" minlength="8"',
              )
            : '<label class="checkbox-label"><input type="checkbox" name="remember"> Remember me <span class="muted small">(demo only)</span></label>'}
          <p id="auth-error" class="error" role="alert" hidden></p>
          <button class="btn-primary full-width" type="submit">
            ${register ? 'Create Account' : 'Login'}
          </button>
        </form>
        ${role === 'customer'
          ? /* HTML */ `<p class="small">
              ${register
                ? 'Already have an account? <a href="index.html?page=login">Log in</a>'
                : 'New here? <a href="index.html?page=register">Create an account</a>'}
            </p>`
          : ''}<a class="back-link" href="../index.html">Back to homepage</a>
      </div>
    </section>
  </main>`;
  const form = document.querySelector('#auth-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const error = document.querySelector('#auth-error');
    if (register && values.get('password') !== values.get('confirmPassword')) {
      error.textContent = 'The passwords do not match.';
      error.hidden = false;
      return;
    }
    if (register && !String(values.get('name')).trim()) {
      error.textContent = 'Enter your full name.';
      error.hidden = false;
      return;
    }
    if (register) {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      error.hidden = true;
      HC.auth.register({
          name: String(values.get('name')).trim(),
          email: values.get('email'),
          phone: values.get('phone'),
          password: values.get('password'),
          confirmPassword: values.get('confirmPassword'),
        }).then(() => {
        location.href = 'index.html?page=dashboard';
      }).catch(problem => {
        error.textContent = problem.message;
        error.hidden = false;
        button.disabled = false;
      });
    } else {
      location.href = 'index.html?page=dashboard';
    }
  });
};

// shared-reservations

HC.reservationDetails = function (reservation, customer = false) {
  const r = reservation;
  HC.modal(
    `Reservation ${r.id}`,
    `${HC.badge(r.status)}<h3>${HC.escape(r.roomName)}</h3><div class="summary-row"><span>Guest</span><strong>${HC.escape(r.guest)}</strong></div><div class="summary-row"><span>Check in</span><span>${HC.date(r.checkIn)}</span></div><div class="summary-row"><span>Check out</span><span>${HC.date(r.checkOut)}</span></div><div class="summary-row"><span>Guests</span><span>${r.guests}</span></div><div class="summary-row"><span>Payment</span>${HC.badge(r.paymentStatus)}</div><div class="summary-row total"><span>Total</span><span>${HC.money(r.total)}</span></div>${
      r.requests
        ? /* HTML */ `<hr />
            <p class="small"><strong>Special requests:</strong> ${HC.escape(r.requests)}</p>`
        : ''
    }${customer && r.paymentStatus === 'Pending' && r.status !== 'Cancelled' ? /* HTML */ `<div class="dialog-actions"><a class="btn-primary" href="index.html?page=payment&reservation=${r.id}">Go to Payment</a></div>` : ''}`,
  );
};
HC.reservationsTable = function (reservations, compact = false) {
  return HC.table(
    compact
      ? ['Reservation', 'Guest', 'Room', 'Check In', 'Status']
      : [
          'Reservation ID',
          'Guest',
          'Room Type',
          'Check In',
          'Check Out',
          'Guests',
          'Payment',
          'Status',
          'Actions',
        ],
    reservations.map(
      (r) =>
        /* HTML */ `<tr>
          <td class="table-primary">${r.id}</td>
          <td>${HC.escape(r.guest)}</td>
          <td>
            ${HC.escape(r.roomType)}<span class="table-sub">Room ${HC.escape(r.roomNumber)}</span>
          </td>
          <td class="nowrap">${HC.date(r.checkIn)}</td>
          ${compact
            ? ''
            : /* HTML */ `<td class="nowrap">${HC.date(r.checkOut)}</td>
                <td>${r.guests}</td>
                <td>${HC.badge(r.paymentStatus)}</td>`}
          <td>${HC.badge(r.status)}</td>
          ${compact
            ? ''
            : /* HTML */ `<td>
                <div class="actions">
                  <button class="text-button" data-view="${r.id}">View</button>${[
                    'Confirmed',
                    'Pending',
                  ].includes(r.status)
                    ? /* HTML */ `<button class="text-button" data-edit="${r.id}">Edit</button
                        ><button class="text-button danger" data-cancel="${r.id}">Cancel</button>`
                    : ''}
                </div>
              </td>`}
        </tr>`,
    ),
  );
};
HC.mountReservationManagement = async function (admin = false) {
  const types = await HC.api.loadRoomTypes();
  HC.page(
    admin
      ? 'A complete view of every stay, from arrival to departure.'
      : 'Find a guest, adjust a stay, or check reservation details.',
    /* HTML */ `<form class="card filter-bar" id="reservation-filters">
        ${HC.field(
          'Guest or reservation ID',
          'search',
          '',
          'search',
          'placeholder="Search reservations…"',
        )}${HC.select('Status', 'status', [
          ['', 'All statuses'],
          'Pending',
          'Confirmed',
          'Checked In',
          'Completed',
          'Cancelled',
        ])}${admin
          ? `${HC.field('Stay date', 'date', '', 'date')}${HC.select('Room type', 'type', [['', 'All room types'], ...types.map((t) => t.name)])}`
          : ''}<button type="reset" class="btn btn-quiet">Reset</button>
      </form>
      <div class="card" id="reservation-table"></div>`,
  );
  const form = document.querySelector('#reservation-filters');
  let reservations = [];
  async function paint() {
    reservations = await HC.api.loadReservations(Object.fromEntries(new FormData(form)));
    document.querySelector('#reservation-table').innerHTML = HC.reservationsTable(reservations);
  }
  form.oninput = () => HC.run(paint);
  form.onsubmit = (event) => event.preventDefault();
  form.onreset = () => setTimeout(() => HC.run(paint), 0);
  document.querySelector('#reservation-table').onclick = (event) => {
    const view = event.target.closest('[data-view]');
    const edit = event.target.closest('[data-edit]');
    const cancel = event.target.closest('[data-cancel]');
    if (view) HC.reservationDetails(reservations.find((r) => r.id === view.dataset.view));
    if (cancel)
      HC.confirm(
        'Cancel reservation?',
        'This cancels the stay and retains its payment as Voided or Refunded.',
        'Cancel Reservation',
        () =>
          HC.run(async () => {
            await HC.api.cancelReservation(cancel.dataset.cancel);
            await paint();
            HC.toast('Reservation cancelled.');
          }),
      );
    if (edit) {
      const r = reservations.find((item) => item.id === edit.dataset.edit);
      HC.modal(
        `Edit ${r.id}`,
        /* HTML */ `<form id="edit-reservation" class="stack">
          <div class="form-grid">
            ${HC.field(
              'Check in',
              'checkIn',
              r.checkIn,
              'date',
              `required min="${HC.today()}"`,
            )}${HC.field('Check out', 'checkOut', r.checkOut, 'date', 'required')}${HC.field(
              'Guests',
              'guests',
              r.guests,
              'number',
              'min="1" max="6" required',
            )}${HC.select('Status', 'status', ['Pending', 'Confirmed'], r.status)}
          </div>
          <p class="small muted">
            Changing dates recalculates the sample total. Paid stays must keep the same total.
          </p>
          <p class="error" id="edit-error" role="alert" hidden></p>
          <button type="submit" class="btn-primary">Save Changes</button>
        </form>`,
        (dialog) => {
          dialog.querySelector('form').onsubmit = async (event) => {
            event.preventDefault();
            try {
              await HC.api.updateReservation(r.id, Object.fromEntries(new FormData(event.target)));
              dialog.close();
              await paint();
              HC.toast('Reservation updated.');
            } catch (error) {
              const target = dialog.querySelector('#edit-error');
              target.textContent = error.message;
              target.hidden = false;
            }
          };
        },
      );
    }
  };
  await paint();
};
