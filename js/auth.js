'use strict';
// Flask checks email/password against MySQL and remembers the signed-in account.
HC.auth = {
  current: null,
  async login(role, email, password) {
    await HC.auth.ready;
    const response = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, email, password }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not log in.');
    HC.auth.current = result.user;
    return result;
  },
  async register(details) {
    await HC.auth.ready;
    const response = await fetch('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create your account.');
    HC.auth.current = result.user;
    return result;
  },
  async logout() {
    const response = await fetch('/api/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Could not log out. Please try again.');
    HC.auth.current = null;
    location.href = '/';
  },
  async switchAccount() {
    const response = await fetch('/api/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Could not switch accounts. Please try again.');
    HC.auth.current = null;
    location.href = '/customer/index.html?page=login';
  },
};
HC.auth.ready = fetch('/api/session', { cache: 'no-store' })
  .then(async response => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not check login status.');
    HC.auth.current = result.user;
    return result.user;
  });
// Keep the login form usable while displaying a clear connection error.
HC.auth.ready.catch(error => HC.toast(error.message));
