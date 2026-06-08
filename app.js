const API = 'https://eventful-backend-1sc1.onrender.com';
let state = {
  token: localStorage.getItem('evtToken'),
  user: JSON.parse(localStorage.getItem('evtUser') || 'null'),
  events: [], currentPage: 1, totalPages: 1,
  category: '', search: '', searchTimer: null,
  currentTab: 'overview',
};

/* ---- Auth helpers ---- */
const isLoggedIn = () => !!state.token;
const isCreator  = () => state.user?.role === 'creator' || state.user?.role === 'admin';

async function api(method, path, body, raw = true) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(API + path, opts);
  const json = await res.json();
  if (!res.ok) throw json;
  return raw ? json : json.data;
}

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  updateAuthUI();
  loadEvents();
  setupRoleCards();
  if (isLoggedIn()) {
    loadNotifCount();
    setInterval(loadNotifCount, 60000);
  }
});

/* =============================================
   NAVBAR
   ============================================= */
function initNavbar() {
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
  });
}

function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}

function toggleAvatarMenu() {
  document.getElementById('avatarDropdown').classList.toggle('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.avatar-menu')) {
    document.getElementById('avatarDropdown')?.classList.remove('open');
  }
});

function updateAuthUI() {
  const guestNav = document.getElementById('guestNav');
  const authNav  = document.getElementById('authNav');
  if (!guestNav || !authNav) return;

  if (isLoggedIn() && state.user) {
    guestNav.style.display = 'none';
    authNav.style.display = 'flex';
    document.getElementById('userAvatar').textContent = state.user.firstName[0].toUpperCase();
    document.getElementById('avatarName').textContent = `${state.user.firstName} ${state.user.lastName}`;
    document.getElementById('avatarRole').textContent = state.user.role;
    // Show/hide creator-only tabs
    document.querySelectorAll('[data-creator-only]').forEach(el => {
      el.style.display = isCreator() ? '' : 'none';
    });
  } else {
    guestNav.style.display = 'flex';
    authNav.style.display = 'none';
  }
}

/* =============================================
   AUTH
   ============================================= */
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  setLoading(btn, true);

  try {
    const data = await api('POST', '/auth/login', {
      email: document.getElementById('loginEmail').value,
      password: document.getElementById('loginPassword').value,
    },true);
    saveAuth(data);
    closeModal('loginModal');
    toast('success', 'Welcome back!', `Hello, ${data.user.firstName}!`);
    updateAuthUI();
    loadNotifCount();
  } catch (err) {
    errEl.textContent = err?.message || 'Invalid credentials';
    errEl.style.display = 'block';
  } finally {
    setLoading(btn, false, 'Sign In');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  const errEl = document.getElementById('registerError');
  errEl.style.display = 'none';
  setLoading(btn, true);

  const role = document.querySelector('input[name="role"]:checked')?.value || 'eventee';
  try {
    const data = await api('POST', '/auth/register', {
      firstName: document.getElementById('regFirstName').value,
      lastName: document.getElementById('regLastName').value,
      email: document.getElementById('regEmail').value,
      password: document.getElementById('regPassword').value,
      role,
    },true);
    saveAuth(data);
    closeModal('registerModal');
    toast('success', 'Account created!', `Welcome to Eventful, ${data.user.firstName}!`);
    updateAuthUI();
  } catch (err) {
    const msg = Array.isArray(err?.errors) ? err.errors.join(', ') : (err?.message || 'Registration failed');
    errEl.textContent = msg;
    errEl.style.display = 'block';
  } finally {
    setLoading(btn, false, 'Create Account');
  }
}

function saveAuth(data) {
  const payload = data.data || data; // handles both shapes
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem('evtToken', payload.token);
  localStorage.setItem('evtUser', JSON.stringify(payload.user));
}

async function logout() {
  try { await api('POST', '/auth/logout'); } catch {}
  state.token = null; state.user = null;
  localStorage.removeItem('evtToken');
  localStorage.removeItem('evtUser');
  updateAuthUI();
  hideDashboard();
  toast('info', 'Logged out', 'See you next time!');
}

function setupRoleCards() {
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

/* =============================================
   EVENTS
   ============================================= */
async function loadEvents(page = 1) {
  state.currentPage = page;
  const grid = document.getElementById('eventsGrid');
  grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading events...</p></div>`;

  const params = new URLSearchParams({
    page, limit: 12, status: 'published',
    ...(state.category ? { category: state.category } : {}),
    ...(state.search ? { search: state.search } : {}),
  });

  try {
    const result = await api('GET', `/events?${params}`, null, true);
     console.log('API result:', result);
    renderEvents(result.data || []);
    renderPagination(result.meta);
    updateStats(result.meta?.total);
  } catch {
    grid.innerHTML = `<div class="empty-state"><p>⚠️ Failed to load events</p></div>`;
  }
}

function renderEvents(events) {
  const grid = document.getElementById('eventsGrid');
  if (!events.length) {
    grid.innerHTML = `<div class="empty-state"><p>😕 No events found. Try different filters.</p></div>`;
    return;
  }
  grid.innerHTML = events.map(evt => {
    const date = new Date(evt.startDate).toLocaleDateString('en-NG', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const time = new Date(evt.startDate).toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' });
    const sold = evt.soldTickets >= evt.totalTickets;
    const catEmoji = { concert:'🎵', theater:'🎭', sports:'⚽', cultural:'🏛️', conference:'💼', workshop:'🛠️', exhibition:'🖼️' }[evt.category] || '📅';
    const price = evt.isFree ? '<span class="event-price" style="color:var(--success)">FREE</span>' :
      `<span class="event-price">₦${Number(evt.price).toLocaleString()}<span class="event-price-sub">/ticket</span></span>`;
    return `
    <div class="event-card" onclick="openEvent('${evt.id}')">
      ${evt.bannerImage
        ? `<img class="event-card-img" src="${evt.bannerImage}" alt="${evt.title}" onerror="this.outerHTML='<div class=event-card-img>${catEmoji}</div>'">`
        : `<div class="event-card-img">${catEmoji}</div>`}
      ${sold ? '<div class="event-sold-out">SOLD OUT</div>' : ''}
      <div class="event-card-body">
        <div class="event-card-meta">
          <span class="event-category">${evt.category || 'other'}</span>
          ${evt.isFree ? '<span class="event-free-badge">FREE</span>' : ''}
        </div>
        <div class="event-card-title">${escHtml(evt.title)}</div>
        <div class="event-card-date">📅 ${date} · ${time}</div>
        <div class="event-card-venue">📍 ${escHtml(evt.venue)}${evt.city ? `, ${evt.city}` : ''}</div>
        <div class="event-card-footer">
          ${price}
          <span class="event-tickets-left">${evt.totalTickets - evt.soldTickets} left</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderPagination(meta) {
  if (!meta || meta.totalPages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="loadEvents(${meta.page-1})" ${!meta.hasPrev?'disabled':''}>← Prev</button>`;
  const start = Math.max(1, meta.page - 2), end = Math.min(meta.totalPages, meta.page + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === meta.page ? 'active' : ''}" onclick="loadEvents(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="loadEvents(${meta.page+1})" ${!meta.hasNext?'disabled':''}>Next →</button>`;
  document.getElementById('pagination').innerHTML = html;
}

function updateStats(total) {
  if (total !== undefined) document.getElementById('statEvents').textContent = total?.toLocaleString() || '—';
}

function filterCategory(cat) {
  state.category = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  loadEvents(1);
}

function debounceSearch(val) {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => { state.search = val; loadEvents(1); }, 400);
}

function searchEvents() {
  state.search = document.getElementById('heroSearch').value;
  document.getElementById('events').scrollIntoView({ behavior: 'smooth' });
  loadEvents(1);
}

/* =============================================
   EVENT DETAIL
   ============================================= */
async function openEvent(id) {
  openModal('eventModal');
  document.getElementById('eventModalContent').innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  try {
    const [evt, shareData] = await Promise.all([
      api('GET', `/events/${id}`),
      api('GET', `/events/${id}/share`),
    ],null,true);
    renderEventModal(evt, shareData);
  } catch {
    document.getElementById('eventModalContent').innerHTML = `<p style="color:var(--danger)">Failed to load event details.</p>`;
  }
}

function renderEventModal(evt, shareData) {
  const date = new Date(evt.startDate).toLocaleString('en-NG', { weekday:'long', month:'long', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const catEmoji = { concert:'🎵', theater:'🎭', sports:'⚽', cultural:'🏛️', conference:'💼', workshop:'🛠️' }[evt.category] || '📅';
  const sold = evt.soldTickets >= evt.totalTickets;
  const buyBtn = sold
    ? `<button class="btn btn-danger" disabled>Sold Out</button>`
    : !isLoggedIn()
    ? `<button class="btn btn-primary btn-lg" onclick="openModal('loginModal')">Login to Buy Ticket</button>`
    : `<button class="btn btn-primary btn-lg" onclick="buyTicket('${evt.id}', ${evt.isFree})">
        ${evt.isFree ? '🎫 Get Free Ticket' : `🛒 Buy for ₦${Number(evt.price).toLocaleString()}`}
       </button>`;

  document.getElementById('eventModalContent').innerHTML = `
    <div style="position:relative">
      ${evt.bannerImage
        ? `<img src="${evt.bannerImage}" style="width:100%;height:240px;object-fit:cover;border-radius:12px;margin-bottom:24px" onerror="this.style.display='none'">`
        : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:64px">${catEmoji}</div>`}
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <span class="event-category">${evt.category}</span>
        ${evt.isFree ? '<span class="event-free-badge">FREE EVENT</span>' : ''}
        <span class="status-badge status-${evt.status}">${evt.status}</span>
      </div>
      <h2 style="font-size:26px;font-weight:800;margin-bottom:16px">${escHtml(evt.title)}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;background:rgba(255,255,255,0.03);border-radius:12px;padding:20px">
        <div><div style="color:var(--text-muted);font-size:12px;text-transform:uppercase;margin-bottom:4px">Date & Time</div><div style="font-weight:600">📅 ${date}</div></div>
        <div><div style="color:var(--text-muted);font-size:12px;text-transform:uppercase;margin-bottom:4px">Venue</div><div style="font-weight:600">📍 ${escHtml(evt.venue)}${evt.city ? `, ${evt.city}` : ''}</div></div>
        <div><div style="color:var(--text-muted);font-size:12px;text-transform:uppercase;margin-bottom:4px">Price</div><div style="font-weight:600;font-size:20px;color:var(--primary-light)">${evt.isFree ? 'FREE' : `₦${Number(evt.price).toLocaleString()}`}</div></div>
        <div><div style="color:var(--text-muted);font-size:12px;text-transform:uppercase;margin-bottom:4px">Availability</div><div style="font-weight:600">${sold ? '❌ Sold Out' : `✅ ${evt.totalTickets - evt.soldTickets} of ${evt.totalTickets} left`}</div></div>
      </div>
      <div style="margin-bottom:24px">
        <h4 style="margin-bottom:10px;color:var(--text-muted)">About This Event</h4>
        <p style="color:var(--text-muted);line-height:1.7">${escHtml(evt.description)}</p>
      </div>
      ${evt.tags?.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">${evt.tags.map(t => `<span style="padding:4px 12px;background:rgba(108,60,225,0.15);border-radius:12px;font-size:12px;color:var(--primary-light)">#${t}</span>`).join('')}</div>` : ''}
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        ${buyBtn}
      </div>
      <div style="margin-top:24px;border-top:1px solid var(--border);padding-top:20px">
        <h4 style="margin-bottom:12px;font-size:14px;color:var(--text-muted)">Share this event</h4>
        <div class="share-buttons">
          <a class="share-btn share-twitter" href="${shareData.socialLinks.twitter}" target="_blank">𝕏 Twitter</a>
          <a class="share-btn share-whatsapp" href="${shareData.socialLinks.whatsapp}" target="_blank">💬 WhatsApp</a>
          <a class="share-btn share-facebook" href="${shareData.socialLinks.facebook}" target="_blank">f Facebook</a>
          <a class="share-btn share-telegram" href="${shareData.socialLinks.telegram}" target="_blank">✈ Telegram</a>
          <a class="share-btn share-linkedin" href="${shareData.socialLinks.linkedin}" target="_blank">in LinkedIn</a>
          <button class="share-btn share-copy" onclick="copyLink('${shareData.shareUrl}')">🔗 Copy Link</button>
        </div>
      </div>
    </div>`;
}

async function buyTicket(eventId, isFree, reminders = []) {
  if (!isLoggedIn()) { openModal('loginModal'); return; }
  closeModal('eventModal');

  // Show reminder selection for paid events
  if (!isFree) {
    showReminderPicker(eventId);
    return;
  }
  await doReserveTicket(eventId, []);
}

function showReminderPicker(eventId) {
  const options = ['15m','30m','1h','3h','6h','12h','1d','2d','1w'];
  const labels = { '15m':'15 min','30m':'30 min','1h':'1 hour','3h':'3 hours','6h':'6 hours','12h':'12 hours','1d':'1 day','2d':'2 days','1w':'1 week' };
  const content = `
    <h3 style="margin-bottom:8px">🔔 Set Reminders</h3>
    <p style="color:var(--text-muted);margin-bottom:20px;font-size:14px">Get notified before the event. Select all that apply.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px" id="reminderPicker">
      ${options.map(o => `<button class="btn btn-ghost btn-sm reminder-opt" data-val="${o}" onclick="toggleReminder(this)">${labels[o]}</button>`).join('')}
    </div>
    <div style="display:flex;gap:12px">
      <button class="btn btn-primary" onclick="confirmBuyWithReminders('${eventId}')">Continue to Payment</button>
      <button class="btn btn-ghost" onclick="doReserveTicket('${eventId}',[])">Skip & Continue</button>
    </div>`;
  document.getElementById('eventModalContent').innerHTML = content;
  openModal('eventModal');
}

function toggleReminder(btn) {
  btn.classList.toggle('active');
  btn.style.background = btn.classList.contains('active') ? 'var(--primary)' : '';
  btn.style.color = btn.classList.contains('active') ? '#fff' : '';
}

async function confirmBuyWithReminders(eventId) {
  const selected = [...document.querySelectorAll('.reminder-opt.active')].map(b => b.dataset.val);
  closeModal('eventModal');
  await doReserveTicket(eventId, selected);
}

async function doReserveTicket(eventId, userReminders = []) {
  try {
    const ticket = await api('POST', '/tickets', { eventId, userReminders });
    if (ticket.status === 'paid') {
      toast('success', '🎉 Ticket Confirmed!', 'Check your email for your QR code.');
      showDashboard('my-tickets');
      return;
    }
    // Paid ticket — go to payment
    const payData = await api('POST', '/payments/initialize', {
      ticketId: ticket.id,
      callbackUrl: `${window.location.origin}/frontend/payment-success.html`,
    });
    window.location.href = payData.authorizationUrl;
  } catch (err) {
    toast('error', 'Error', err?.message || 'Could not process ticket');
  }
}

/* =============================================
   DASHBOARD
   ============================================= */
function showDashboard(tab = 'overview') {
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('events').style.display = 'none';
  document.querySelector('.hero').style.display = 'none';
  document.querySelector('.categories-section').style.display = 'none';
  document.querySelector('.how-section').style.display = 'none';
  switchTab(tab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideDashboard() {
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('events').style.display = '';
  document.querySelector('.hero').style.display = '';
  document.querySelector('.categories-section').style.display = '';
  document.querySelector('.how-section').style.display = '';
}

function showSection(section) {
  showDashboard(section);
  document.getElementById('avatarDropdown').classList.remove('open');
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.id === `tab-${tab}`));
  const content = document.getElementById('dashboardContent');
  content.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  const loaders = {
    'overview': loadOverview,
    'my-events': loadMyEvents,
    'create-event': renderCreateEvent,
    'my-tickets': loadMyTickets,
    'analytics': loadAnalytics,
    'notifications': loadNotifications,
  };
  (loaders[tab] || loadOverview)();
}

async function loadOverview() {
  const content = document.getElementById('dashboardContent');
  if (isCreator()) {
    try {
      const data = await api('GET', '/analytics/overview', null, true);
      const s = data.summary;
      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-value">${s.totalEvents}</div><div class="stat-label">Total Events</div></div>
          <div class="stat-card"><div class="stat-icon">🎟️</div><div class="stat-value">${s.totalTicketsSold}</div><div class="stat-label">Tickets Sold</div></div>
          <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value">₦${Number(s.totalRevenue).toLocaleString()}</div><div class="stat-label">Total Revenue</div></div>
          <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">${s.attendanceRate}</div><div class="stat-label">Attendance Rate</div><div class="stat-sub">${s.scannedTickets} scanned</div></div>
        </div>
        <h3 style="margin-bottom:16px">Recent Events</h3>
        ${renderEventsTable(data.recentEvents)}`;
    } catch { content.innerHTML = `<p class="text-muted">Overview not available.</p>`; }
  } else {
    content.innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:56px;margin-bottom:16px">👋</div>
        <h2>Welcome, ${state.user?.firstName}!</h2>
        <p class="text-muted" style="margin:12px 0 28px">Ready to explore amazing events? Browse and buy tickets below.</p>
        <button class="btn btn-primary btn-lg" onclick="hideDashboard()">🔍 Explore Events</button>
      </div>`;
  }
}

function renderEventsTable(events) {
  if (!events?.length) return `<p class="text-muted">No events yet.</p>`;
  return `<div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>Event</th><th>Date</th><th>Tickets Sold</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${events.map(e => `<tr>
      <td style="font-weight:600">${escHtml(e.title)}</td>
      <td>${new Date(e.startDate).toLocaleDateString('en-NG')}</td>
      <td>${e.soldTickets} / ${e.totalTickets}</td>
      <td><span class="status-badge status-${e.status}">${e.status}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="loadEventAnalytics('${e.id}')">Analytics</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function loadMyEvents() {
  const content = document.getElementById('dashboardContent');
  try {
    const result = await api('GET', '/events/my?limit=50');
    const events = result.data || [];
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <h3>My Events (${events.length})</h3>
        <button class="btn btn-primary" onclick="switchTab('create-event')">+ New Event</button>
      </div>
      ${events.length ? `<div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Title</th><th>Date</th><th>Venue</th><th>Price</th><th>Tickets</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${events.map(e => `<tr>
          <td style="font-weight:600;max-width:200px">${escHtml(e.title)}</td>
          <td>${new Date(e.startDate).toLocaleDateString('en-NG')}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(e.venue)}</td>
          <td>${e.isFree ? 'FREE' : '₦'+Number(e.price).toLocaleString()}</td>
          <td>${e.soldTickets}/${e.totalTickets}</td>
          <td><span class="status-badge status-${e.status}">${e.status}</span></td>
          <td style="display:flex;gap:6px">
            ${e.status === 'draft' ? `<button class="btn btn-success btn-sm" onclick="publishEvent('${e.id}')">Publish</button>` : ''}
            ${e.status === 'published' ? `<button class="btn btn-danger btn-sm" onclick="cancelEvent('${e.id}')">Cancel</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="viewEventTickets('${e.id}')">Tickets</button>
          </td>
        </tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><p>No events yet. <a onclick="switchTab('create-event')" style="color:var(--primary-light);cursor:pointer">Create your first event!</a></p></div>`}`;
  } catch { content.innerHTML = `<p class="text-danger">Failed to load events.</p>`; }
}

function renderCreateEvent() {
  const content = document.getElementById('dashboardContent');
  const reminders = ['15m','30m','1h','3h','6h','12h','1d','2d','3d','1w','2w'];
  const cats = ['concert','theater','sports','cultural','conference','workshop','exhibition','other'];
  content.innerHTML = `
    <div class="form-section">
      <h3>🎪 Create New Event</h3>
      <form id="createEventForm" onsubmit="handleCreateEvent(event)">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Event Title *</label>
            <input type="text" id="evtTitle" placeholder="e.g. Lagos Jazz Festival 2025" required />
          </div>
          <div class="form-group span-2">
            <label>Description *</label>
            <textarea id="evtDesc" placeholder="Describe your event..." required></textarea>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="evtCategory">${cats.map(c => `<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label>Venue *</label>
            <input type="text" id="evtVenue" placeholder="e.g. Eko Hotel & Suites" required />
          </div>
          <div class="form-group">
            <label>City</label>
            <input type="text" id="evtCity" placeholder="Lagos" />
          </div>
          <div class="form-group">
            <label>Country</label>
            <input type="text" id="evtCountry" placeholder="Nigeria" value="Nigeria" />
          </div>
          <div class="form-group">
            <label>Start Date & Time *</label>
            <input type="datetime-local" id="evtStart" required />
          </div>
          <div class="form-group">
            <label>End Date & Time *</label>
            <input type="datetime-local" id="evtEnd" required />
          </div>
          <div class="form-group">
            <label>Total Tickets</label>
            <input type="number" id="evtTotalTickets" placeholder="100" value="100" min="1" />
          </div>
          <div class="form-group">
            <label>Ticket Price (₦)</label>
            <input type="number" id="evtPrice" placeholder="0 for free" value="0" min="0" step="100" />
          </div>
          <div class="form-group span-2">
            <label>Banner Image URL (optional)</label>
            <input type="url" id="evtBanner" placeholder="https://..." />
          </div>
          <div class="form-group span-2">
            <label>Reminder Options <span style="color:var(--text-dim)">(select all attendees should be reminded)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:8px" id="reminderOptions">
              ${reminders.map(r => `<button type="button" class="btn btn-ghost btn-sm reminder-opt2" data-val="${r}" onclick="toggleReminder2(this)">${r}</button>`).join('')}
            </div>
          </div>
        </div>
        <div id="createEventError" class="form-error"></div>
        <div style="display:flex;gap:12px;margin-top:24px">
          <button type="submit" class="btn btn-primary" id="createEvtBtn">Create Event (Draft)</button>
          <button type="button" class="btn btn-ghost" onclick="switchTab('my-events')">Cancel</button>
        </div>
      </form>
    </div>`;
}

function toggleReminder2(btn) {
  btn.classList.toggle('active');
  btn.style.background = btn.classList.contains('active') ? 'var(--primary)' : '';
  btn.style.color = btn.classList.contains('active') ? '#fff' : '';
}

async function handleCreateEvent(e) {
  e.preventDefault();
  const btn = document.getElementById('createEvtBtn');
  const errEl = document.getElementById('createEventError');
  errEl.style.display = 'none';
  setLoading(btn, true);
  const reminders = [...document.querySelectorAll('.reminder-opt2.active')].map(b => b.dataset.val);
  const price = parseFloat(document.getElementById('evtPrice').value) || 0;
  try {
    const evt = await api('POST', '/events', {
      title: document.getElementById('evtTitle').value,
      description: document.getElementById('evtDesc').value,
      category: document.getElementById('evtCategory').value,
      venue: document.getElementById('evtVenue').value,
      city: document.getElementById('evtCity').value,
      country: document.getElementById('evtCountry').value,
      startDate: document.getElementById('evtStart').value,
      endDate: document.getElementById('evtEnd').value,
      totalTickets: parseInt(document.getElementById('evtTotalTickets').value) || 100,
      price, isFree: price === 0,
      bannerImage: document.getElementById('evtBanner').value || undefined,
      reminderOptions: reminders,
    });
    toast('success', 'Event Created!', `"${evt.title}" saved as draft. Publish when ready.`);
    switchTab('my-events');
  } catch (err) {
    const msg = Array.isArray(err?.errors) ? err.errors.join(', ') : (err?.message || 'Failed to create event');
    errEl.textContent = msg; errEl.style.display = 'block';
  } finally { setLoading(btn, false, 'Create Event (Draft)'); }
}

async function publishEvent(id) {
  try {
    await api('PATCH', `/events/${id}/publish`);
    toast('success', 'Published!', 'Event is now live.');
    loadMyEvents();
  } catch (err) { toast('error', 'Error', err?.message); }
}

async function cancelEvent(id) {
  if (!confirm('Cancel this event? Attendees will be notified.')) return;
  try {
    await api('PATCH', `/events/${id}/cancel`);
    toast('info', 'Cancelled', 'Event has been cancelled.');
    loadMyEvents();
  } catch (err) { toast('error', 'Error', err?.message); }
}

async function loadMyTickets() {
  const content = document.getElementById('dashboardContent');
  try {
    const result = await api('GET', '/tickets/my?limit=50');
    const tickets = result.data || [];
    content.innerHTML = `<h3 style="margin-bottom:20px">My Tickets (${tickets.length})</h3>`;
    if (!tickets.length) {
      content.innerHTML += `<div class="empty-state"><p>No tickets yet. <a onclick="hideDashboard()" style="color:var(--primary-light);cursor:pointer">Explore events</a> to get started!</p></div>`;
      return;
    }
    content.innerHTML += `<div class="ticket-cards">${tickets.map(t => {
      const evt = t.event || {};
      const date = evt.startDate ? new Date(evt.startDate).toLocaleDateString('en-NG', { weekday:'short', month:'short', day:'numeric' }) : '';
      const cats = { concert:'🎵', theater:'🎭', sports:'⚽', cultural:'🏛️' };
      return `<div class="ticket-card">
        <div class="ticket-event-thumb">${cats[evt.category] || '📅'}</div>
        <div class="ticket-info">
          <h4>${escHtml(evt.title || 'Event')}</h4>
          <p>📅 ${date}</p>
          <p>📍 ${escHtml(evt.venue || '')}</p>
          <span class="ticket-code">${t.ticketCode}</span>
          <span class="status-badge status-${t.status}" style="margin-left:8px">${t.status}</span>
        </div>
        <div class="ticket-actions">
          ${t.status === 'paid' || t.status === 'used' ? `<button class="btn btn-ghost btn-sm" onclick="viewQR('${t.id}')">View QR</button>` : ''}
          ${t.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="payTicket('${t.id}')">Pay Now</button>` : ''}
          ${t.status === 'paid' ? `<button class="btn btn-ghost btn-sm" onclick="manageReminders('${t.id}')">🔔 Reminders</button>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch { content.innerHTML = `<p class="text-danger">Failed to load tickets.</p>`; }
}

async function viewQR(ticketId) {
  try {
    const data = await api('GET', `/qr/ticket/${ticketId}`);
    const modal = document.getElementById('eventModal');
    document.getElementById('eventModalContent').innerHTML = `
      <h3>🎟️ Your QR Code</h3>
      <p style="color:var(--text-muted);margin:8px 0 16px">Show this at the event entrance for entry.</p>
      <div style="text-align:center">
        <div class="qr-display"><img src="${data.qrCode}" alt="QR Code" /></div>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px">Screenshot this QR code and save it</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="downloadQR('${ticketId}')">⬇ Download QR</button>
      </div>`;
    openModal('eventModal');
  } catch (err) { toast('error', 'Error', err?.message); }
}

function downloadQR(ticketId) {
  const img = document.querySelector('.qr-display img');
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.src; a.download = `ticket-${ticketId}.png`; a.click();
}

async function payTicket(ticketId) {
  try {
    const payData = await api('POST', '/payments/initialize', { ticketId });
    window.location.href = payData.authorizationUrl;
  } catch (err) { toast('error', 'Payment Error', err?.message); }
}

async function manageReminders(ticketId) {
  const options = ['15m','30m','1h','3h','6h','12h','1d','2d','3d','1w','2w'];
  const labels = { '15m':'15 min','30m':'30 min','1h':'1 hour','3h':'3 hours','6h':'6 hours','12h':'12 hours','1d':'1 day','2d':'2 days','3d':'3 days','1w':'1 week','2w':'2 weeks' };
  document.getElementById('eventModalContent').innerHTML = `
    <h3 style="margin-bottom:8px">🔔 Manage Reminders</h3>
    <p style="color:var(--text-muted);margin-bottom:20px;font-size:14px">Choose when you want to be reminded before this event.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px" id="reminderPicker">
      ${options.map(o => `<button class="btn btn-ghost btn-sm reminder-opt" data-val="${o}" onclick="toggleReminder(this)">${labels[o]}</button>`).join('')}
    </div>
    <button class="btn btn-primary" onclick="saveReminders('${ticketId}')">Save Reminders</button>`;
  openModal('eventModal');
}

async function saveReminders(ticketId) {
  const selected = [...document.querySelectorAll('.reminder-opt.active')].map(b => b.dataset.val);
  try {
    await api('PATCH', `/tickets/${ticketId}/reminders`, { userReminders: selected });
    closeModal('eventModal');
    toast('success', 'Reminders saved!', `You'll be notified ${selected.join(', ')} before the event.`);
  } catch (err) { toast('error', 'Error', err?.message); }
}

async function loadAnalytics() {
  const content = document.getElementById('dashboardContent');
  try {
    const data = await api('GET', '/analytics/overview');
    const s = data.summary;
    content.innerHTML = `
      <h3 style="margin-bottom:24px">📊 Analytics Overview</h3>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-value">${s.totalEvents}</div><div class="stat-label">Total Events</div><div class="stat-sub">${s.publishedEvents} published</div></div>
        <div class="stat-card"><div class="stat-icon">🎟️</div><div class="stat-value">${s.totalTicketsSold}</div><div class="stat-label">Tickets Sold</div></div>
        <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value">₦${Number(s.totalRevenue).toLocaleString()}</div><div class="stat-label">Total Revenue</div></div>
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${s.attendanceRate}</div><div class="stat-label">Attendance Rate</div><div class="stat-sub">${s.scannedTickets} checked in</div></div>
      </div>
      <h3 style="margin:32px 0 16px">Monthly Revenue (Last 6 Months)</h3>
      ${data.monthlyRevenue?.length ? renderRevenueChart(data.monthlyRevenue) : '<p class="text-muted">No revenue data yet.</p>'}
      <h3 style="margin:32px 0 16px">Event Performance</h3>
      ${renderEventsTable(data.recentEvents)}`;
  } catch { content.innerHTML = `<p class="text-danger">Analytics unavailable.</p>`; }
}

function renderRevenueChart(monthly) {
  const max = Math.max(...monthly.map(m => m.revenue || 0), 1);
  return `<div style="display:flex;align-items:flex-end;gap:8px;height:160px;background:var(--bg-card);border-radius:var(--radius);padding:20px;border:1px solid var(--border)">
    ${monthly.map(m => {
      const h = Math.round((m.revenue / max) * 100);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text-muted)">₦${Number(m.revenue).toLocaleString()}</span>
        <div style="width:100%;height:${h}%;background:linear-gradient(180deg,var(--primary-light),var(--primary));border-radius:4px 4px 0 0;min-height:4px"></div>
        <span style="font-size:11px;color:var(--text-muted)">${m.month?.slice(5)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

async function viewEventTickets(eventId) {
  const content = document.getElementById('dashboardContent');
  content.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  switchTabNoLoad('my-events');
  try {
    const result = await api('GET', `/tickets/event/${eventId}?limit=100`);
    const tickets = result.data || [];
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
        <button class="btn btn-ghost btn-sm" onclick="loadMyEvents()">← Back</button>
        <h3>Event Tickets (${result.meta?.total || tickets.length})</h3>
      </div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Attendee</th><th>Email</th><th>Ticket Code</th><th>Status</th><th>Paid At</th><th>Scanned At</th></tr></thead>
        <tbody>${tickets.map(t => `<tr>
          <td>${escHtml(t.user?.firstName || '')} ${escHtml(t.user?.lastName || '')}</td>
          <td>${escHtml(t.user?.email || '')}</td>
          <td><code>${t.ticketCode}</code></td>
          <td><span class="status-badge status-${t.status}">${t.status}</span></td>
          <td>${t.paidAt ? new Date(t.paidAt).toLocaleDateString('en-NG') : '—'}</td>
          <td>${t.scannedAt ? new Date(t.scannedAt).toLocaleString('en-NG') : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  } catch { content.innerHTML = `<p class="text-danger">Failed to load tickets.</p>`; }
}

function switchTabNoLoad(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.id === `tab-${tab}`));
}

async function loadNotifications() {
  const content = document.getElementById('dashboardContent');
  try {
    const result = await api('GET', '/notifications?limit=30');
    const notifs = result.data || [];
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3>Notifications (${result.meta?.total || notifs.length})</h3>
        ${notifs.length ? `<button class="btn btn-ghost btn-sm" onclick="markAllRead()">Mark all read</button>` : ''}
      </div>
      ${notifs.length ? `<div class="notif-list">${notifs.map(n => `
        <div class="notif-item ${!n.isRead ? 'unread' : ''}" onclick="markRead('${n.id}')">
          <div class="notif-icon">${notifIcon(n.type)}</div>
          <div class="notif-content">
            <h5>${escHtml(n.title)}</h5>
            <p>${escHtml(n.message)}</p>
            <div class="notif-time">${timeAgo(n.createdAt)}</div>
          </div>
        </div>`).join('')}</div>` : `<div class="empty-state"><p>🔔 No notifications yet.</p></div>`}`;
  } catch { content.innerHTML = `<p class="text-danger">Failed to load notifications.</p>`; }
}

function notifIcon(type) {
  const icons = { event_reminder:'⏰', ticket_purchased:'🎟️', payment_success:'💳', payment_failed:'❌', event_cancelled:'🚫', event_updated:'📝', qr_scanned:'✅' };
  return icons[type] || '🔔';
}

async function markRead(id) {
  try {
    await api('PATCH', `/notifications/${id}/read`);
    loadNotifications();
    loadNotifCount();
  } catch {}
}

async function markAllRead() {
  try {
    await api('PATCH', '/notifications/read-all');
    loadNotifications();
    loadNotifCount();
  } catch {}
}

async function loadNotifCount() {
  if (!isLoggedIn()) return;
  try {
    const data = await api('GET', '/notifications/unread-count');
    const count = data.count || 0;
    ['notifBadge', 'tabNotifBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = count > 0 ? count : ''; el.style.display = count > 0 ? '' : 'none'; }
    });
  } catch {}
}

/* =============================================
   MODALS
   ============================================= */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
}

function switchModal(from, to) { closeModal(from); openModal(to); }

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
});

/* =============================================
   TOAST
   ============================================= */
function toast(type, title, message) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-icon">${icons[type]||'🔔'}</div><div class="toast-text"><strong>${escHtml(title)}</strong><span>${escHtml(message)}</span></div>`;
  el.onclick = () => el.remove();
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }, 4000);
}

/* =============================================
   UTILS
   ============================================= */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setLoading(btn, loading, label = '') {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn.dataset.label = btn.textContent; btn.textContent = 'Loading...'; }
  else { btn.textContent = label || btn.dataset.label || 'Submit'; }
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => toast('success', 'Copied!', 'Link copied to clipboard')).catch(() => toast('error','Error','Could not copy'));
}

function togglePassword(id) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}