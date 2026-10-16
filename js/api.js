'use strict';
// All hotel records now come from the local server and its MySQL database.
HC.api = (() => {
  const role = ['customer','receptionist','admin'].find(name => document.body.classList.contains(name)) || 'public';
  async function request(method, args) {
    let response;
    try {
      response = await fetch('/api/' + role + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch {
      throw new Error('Cannot reach the database server. Start the Flask project with .\\.venv\\Scripts\\python.exe app.py.');
    }
    if (!(response.headers.get('content-type') || '').includes('application/json'))
      throw new Error('Open http://localhost:5000 after starting app.py to use the database.');
    const result = await response.json();
    if (response.status === 401 || response.status === 403) {
      const login = new URL('index.html', location.href);
      login.searchParams.set('page', 'login');
      login.searchParams.set('next', location.pathname + location.search);
      location.replace(login);
    }
    if (!response.ok) throw new Error(result.error || 'Database request failed.');
    return result;
  }
  return Object.fromEntries([
    'loadRooms',
    'loadRoomTypes',
    'loadProfile',
    'loadCustomers',
    'loadStaff',
    'loadActivity',
    'loadReservations',
    'loadPayments',
    'updateProfile',
    'createReservation',
    'updateReservation',
    'cancelReservation',
    'payReservation',
    'transitionStay',
    'saveRoom',
    'deleteRoom',
    'saveRoomType',
    'deleteRoomType',
    'saveStaff',
    'deleteStaff'
  ].map(method => [method, (...args) => request(method, args)]));
})();
