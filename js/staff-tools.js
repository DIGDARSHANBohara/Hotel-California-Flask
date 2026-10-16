'use strict';
HC.roomOverview = function (rooms) {
  return ['Available', 'Reserved', 'Occupied', 'Maintenance', 'Inactive']
    .map((status) => {
      const count = rooms.filter((r) => r.status === status).length;
      return /* HTML */ `<div class="activity-item">
        <div class="summary-row">
          <span>${HC.badge(status)}</span><strong>${count} rooms</strong>
        </div>
        <progress
          class="progress"
          value="${count}"
          max="${rooms.length || 1}"
          aria-label="${status} rooms"
        >
          ${count}
        </progress>
      </div>`;
    })
    .join('');
};
HC.mountStayOperation = async function (checkout = false) {
  const targetStatus = checkout ? 'Checked In' : 'Confirmed';
  HC.page(
    checkout
      ? 'Close out a stay and prepare the room for its next guest.'
      : 'A warm welcome starts here. Find today’s expected guests.',
    /* HTML */ `<div class="notice">
        ${checkout
          ? 'Only checked-in stays appear here. Pending balances must be settled before checkout.'
          : 'Only confirmed reservations arriving today or earlier are eligible for check-in.'}
      </div>
      <form class="card filter-bar" id="stay-search">
        ${HC.field(
          'Reservation ID or guest name',
          'search',
          '',
          'search',
          'placeholder="Try HC-1003 or a guest name"',
        )}<button class="btn-secondary" type="submit">Search Reservation</button>
      </form>
      <div id="stay-results" class="grid grid-2"></div>`,
  );
  const form = document.querySelector('#stay-search');
  async function paint() {
    const reservations = (
      await HC.api.loadReservations({ status: targetStatus, search: form.elements.search.value })
    ).filter((r) => checkout || (r.checkIn <= HC.today() && r.checkOut > HC.today()));
    document.querySelector('#stay-results').innerHTML = reservations.length
      ? reservations
          .map(
            (r) =>
              /* HTML */ `<article class="card card-body">
                <div class="reservation-head">
                  <div>
                    <p class="eyebrow">${r.id}</p>
                    <h2>${HC.escape(r.guest)}</h2>
                  </div>
                  ${HC.badge(r.status)}
                </div>
                <div class="summary-row">
                  <span>Room</span
                  ><strong>${HC.escape(r.roomNumber)} · ${HC.escape(r.roomType)}</strong>
                </div>
                <div class="summary-row">
                  <span>Stay dates</span><span>${HC.date(r.checkIn)} – ${HC.date(r.checkOut)}</span>
                </div>
                <div class="summary-row"><span>Guests</span><span>${r.guests}</span></div>
                <div class="summary-row">
                  <span>Payment status</span>${HC.badge(r.paymentStatus)}
                </div>
                <div class="summary-row total">
                  <span>Total amount</span><span>${HC.money(r.total)}</span>
                </div>
                <hr />
                ${checkout && r.paymentStatus !== 'Paid'
                  ? /* HTML */ `<button class="btn-secondary full-width" data-settle="${r.id}">
                      Record Demo Payment at Hotel
                    </button>`
                  : /* HTML */ `<button class="btn-primary full-width" data-process="${r.id}">
                      Confirm Check ${checkout ? 'Out' : 'In'}
                    </button>`}
              </article>`,
          )
          .join('')
      : '<div class="card empty-state span-2">No eligible reservations match your search.</div>';
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    HC.run(paint);
  };
  form.oninput = () => HC.run(paint);
  document.querySelector('#stay-results').onclick = (event) => {
    const button = event.target.closest('[data-process]');
    const settle = event.target.closest('[data-settle]');
    if (button)
      HC.confirm(
        `Confirm check ${checkout ? 'out' : 'in'}?`,
        `${button.dataset.process}: this updates the demo reservation and room status.`,
        'Confirm',
        () =>
          HC.run(async () => {
            await HC.api.transitionStay(
              button.dataset.process,
              checkout ? 'Completed' : 'Checked In',
            );
            await paint();
            HC.toast(
              checkout
                ? 'Guest checked out. Room availability has been updated.'
                : 'Guest checked in. Room is occupied.',
            );
          }),
      );
    if (settle)
      HC.confirm(
        'Record payment at hotel?',
        'This marks the demo balance as paid. No money is collected.',
        'Record Demo Payment',
        () =>
          HC.run(async () => {
            await HC.api.payReservation(settle.dataset.settle, 'Pay at Hotel', true);
            await paint();
            HC.toast('Demo payment recorded. Checkout is ready.');
          }),
      );
  };
  await paint();
};

('use strict');
HC.mountManager = async function (config) {
  HC.page(
    config.description,
    /* HTML */ `<div class="card filter-bar">
        ${HC.field(
          `Search ${config.plural.toLowerCase()}`,
          'search',
          '',
          'search',
          'placeholder="Search records…"',
        )}
      </div>
      <div class="card" id="management-table"></div>`,
    /* HTML */ `<button class="btn-primary" id="add-record">Add ${config.singular}</button>`,
  );
  let records = [];
  async function paint() {
    records = await config.load();
    const query = document.querySelector('#field-search').value.toLowerCase();
    const matches = records.filter((record) =>
      Object.values(record).join(' ').toLowerCase().includes(query),
    );
    document.querySelector('#management-table').innerHTML = HC.table(
      [...config.headers, 'Actions'],
      matches.map(
        (record) =>
          /* HTML */ `<tr>
            ${config
              .cells(record)
              .map((cell) => /* HTML */ `<td>${cell}</td>`)
              .join('')}
            <td>
              <div class="actions">
                <button class="text-button" data-edit="${record.id}">Edit</button
                ><button class="text-button danger" data-delete="${record.id}">Delete</button>
              </div>
            </td>
          </tr>`,
      ),
    );
  }
  async function edit(record = null) {
    const fields = await config.fields(record);
    HC.modal(
      `${record ? 'Edit' : 'Add'} ${config.singular}`,
      /* HTML */ `<form id="record-form" class="stack">
        <div class="form-grid">${fields}</div>
        <p class="error" id="record-error" role="alert" hidden></p>
        <p class="small muted">Changes are saved in the local database and shared across preview tabs.</p>
        <button class="btn-primary" type="submit">Save ${config.singular}</button>
      </form>`,
      (dialog) => {
        dialog.querySelector('form').onsubmit = async (event) => {
          event.preventDefault();
          const button = event.target.querySelector('[type=submit]');
          button.disabled = true;
          try {
            await config.save(record?.id, Object.fromEntries(new FormData(event.target)));
            dialog.close();
            await paint();
            HC.toast(`${config.singular} saved.`);
          } catch (error) {
            const message = dialog.querySelector('#record-error');
            message.textContent = error.message;
            message.hidden = false;
            button.disabled = false;
          }
        };
      },
    );
  }
  document.querySelector('#add-record').onclick = () => HC.run(() => edit());
  document.querySelector('#field-search').oninput = () => HC.run(paint);
  document.querySelector('#management-table').onclick = (event) => {
    const editButton = event.target.closest('[data-edit]');
    const deleteButton = event.target.closest('[data-delete]');
    if (editButton)
      HC.run(() => edit(records.find((r) => String(r.id) === editButton.dataset.edit)));
    if (deleteButton)
      HC.confirm(
        `Delete ${config.singular.toLowerCase()}?`,
        'This removes the selected demo record. Referenced records cannot be deleted.',
        'Delete',
        () =>
          HC.run(async () => {
            await config.remove(deleteButton.dataset.delete);
            await paint();
            HC.toast(`${config.singular} deleted.`);
          }),
      );
  };
  await paint();
};
