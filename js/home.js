'use strict';
HC.run(async () => {
  const user = await HC.auth.ready;
  if (!user) return;
  const portal = user.role === 'manager' ? 'receptionist' : user.role;
  const account = document.querySelector('#account-link');
  account.textContent = 'My Portal';
  account.href = `/${portal}/index.html?page=dashboard`;
  document.querySelector('#access-status').textContent = `Signed in as ${user.name} · ${user.role}`;
  const logout = document.querySelector('#home-logout');
  logout.hidden = false;
  logout.onclick = () => HC.run(HC.auth.logout);
});
document.querySelector('#year').textContent = new Date().getFullYear();
const menu = document.querySelector('.menu-toggle');
menu.onclick = () => {
  const open = document.querySelector('#public-nav').classList.toggle('is-open');
  menu.setAttribute('aria-expanded', String(open));
};
const checkIn = document.querySelector('#check-in');
const checkOut = document.querySelector('#check-out');
checkIn.min = HC.today();
checkIn.value = HC.today(7);
checkOut.value = HC.today(10);
function syncDates() {
  checkOut.min = new Date(Date.parse(checkIn.value) + 86400000).toISOString().slice(0, 10);
  if (checkOut.value <= checkIn.value) checkOut.value = checkOut.min;
}
checkIn.addEventListener('change', syncDates);
syncDates();
document.querySelector('#availability-form').addEventListener('submit', (event) => {
  if (HC.nights(checkIn.value, checkOut.value) < 1) {
    event.preventDefault();
    checkOut.setCustomValidity('Check-out must be after check-in.');
    checkOut.reportValidity();
  }
});
checkOut.addEventListener('input', () => checkOut.setCustomValidity(''));
document.querySelectorAll('[data-experience]').forEach(
  (button) =>
    (button.onclick = () => {
      const dining = button.dataset.experience === 'dining';
      HC.modal(
        dining ? 'Dine & Unwind' : 'Relax & Rejuvenate',
        /* HTML */ `<p>
            ${dining
              ? 'Slow breakfasts, seasonal coastal dishes, and a table with a view. Enjoy all-day dining during your stay.'
              : 'Find a quiet moment with a spa treatment, a restorative swim, or a peaceful afternoon by the pool.'}
          </p>
          <p class="notice">
            Sample experience. Ask the front desk about dining and wellness when you arrive.
          </p>
          <div class="dialog-actions">
            <a class="btn-primary" href="customer/index.html?page=rooms">Explore Rooms</a>
          </div>`,
      );
    }),
);
HC.run(async () => {
  const rooms = await HC.api.loadRooms();
  document.querySelector('#featured-rooms').innerHTML = rooms
    .slice(0, 3)
    .map((room) => HC.roomCard(room, ''))
    .join('');
});
