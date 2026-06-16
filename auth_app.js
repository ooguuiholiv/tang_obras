(function () {
  const API_BASE = window.API_BASE || 'http://localhost:3000/api';

  // DOM Elements
  const el = {
    loginView: document.getElementById('login-view'),
    dashboardView: document.getElementById('dashboard-view'),
    loginForm: document.getElementById('login-form'),
    loginMsg: document.getElementById('login-msg'),
    userDisplay: document.getElementById('user-display'),
    usersTableBody: document.querySelector('#users-table tbody'),
    btnNew: document.getElementById('btn-new'),
    btnLogout: document.getElementById('btn-logout'),
    search: document.getElementById('search'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    userForm: document.getElementById('user-form'),
    modalCancel: document.getElementById('modal-cancel'),
    modalMsg: document.getElementById('modal-msg')
  };

  let editMode = false;
  let currentUserId = null;
  let allUsers = [];

  // --- Auth Logic ---

  async function login(email, senha) {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha na autenticação');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user_email', email);
      showDashboard();
    } catch (err) {
      showMessage(el.loginMsg, err.message, 'error');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user_email');
    showLogin();
  }

  // --- UI Navigation ---

  function showDashboard() {
    el.loginView.classList.add('hidden');
    el.dashboardView.classList.remove('hidden');
    const email = localStorage.getItem('user_email');
    el.userDisplay.textContent = `Operador: ${email}`;
    loadUsers();
  }

  function showLogin() {
    el.dashboardView.classList.add('hidden');
    el.loginView.classList.remove('hidden');
  }

  // --- User Management ---

  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        logout();
        throw new Error('Sessão expirada');
      }
      throw new Error(data.message || 'Erro na operação');
    }
    return data;
  }

  async function loadUsers() {
    el.usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px;"><i class="ph ph-circle-notch animate-spin"></i> Sincronizando dados...</td></tr>`;
    try {
      allUsers = await apiFetch('/users');
      renderUsers(allUsers);
    } catch (err) {
      el.usersTableBody.innerHTML = `<tr><td colspan="5" class="msg-error" style="text-align:center;">Erro: ${err.message}</td></tr>`;
    }
  }

  function renderUsers(users) {
    if (users.length === 0) {
      el.usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Nenhum registro encontrado no sistema.</td></tr>`;
      return;
    }

    el.usersTableBody.innerHTML = users.map(user => `
      <tr data-id="${user._id}">
        <td>
          <div class="user-name">${escapeHtml(user.nome)} ${escapeHtml(user.sobrenome || '')}</div>
        </td>
        <td>
          <div class="user-email">${escapeHtml(user.email)}</div>
        </td>
        <td>
          <div class="user-meta">${escapeHtml(user.empresa || 'N/A')}</div>
        </td>
        <td>
          <div class="user-meta">${escapeHtml(user.site || 'N/A')}</div>
        </td>
        <td>
          <div class="actions-cell">
            <button class="icon-btn edit" onclick="window.appActions.editUser('${user._id}')" title="Editar">
              <i class="ph ph-pencil-simple"></i>
            </button>
            <button class="icon-btn delete" onclick="window.appActions.deleteUser('${user._id}')" title="Excluir">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function handleUserSubmit(e) {
    e.preventDefault();
    const formData = new FormData(el.userForm);
    const data = Object.fromEntries(formData.entries());

    // Clean empty fields
    Object.keys(data).forEach(key => {
      if (data[key] === '') delete data[key];
    });

    try {
      if (editMode) {
        await apiFetch(`/users/${currentUserId}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
      } else {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }
      closeModal();
      loadUsers();
    } catch (err) {
      showMessage(el.modalMsg, err.message, 'error');
    }
  }

  // --- Utils ---

  function showMessage(target, text, type) {
    target.textContent = text;
    target.className = `msg msg-${type}`;
    setTimeout(() => {
      target.textContent = '';
      target.className = 'msg';
    }, 5000);
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function openModal(user = null) {
    el.modalMsg.textContent = '';
    el.userForm.reset();
    if (user) {
      editMode = true;
      currentUserId = user._id;
      el.modalTitle.textContent = 'Editar Registro';
      el.userForm.nome.value = user.nome || '';
      el.userForm.sobrenome.value = user.sobrenome || '';
      el.userForm.empresa.value = user.empresa || '';
      el.userForm.site.value = user.site || '';
      el.userForm.email.value = user.email || '';
      el.userForm.senha.placeholder = '•••••••• (ou em branco)';
    } else {
      editMode = false;
      currentUserId = null;
      el.modalTitle.textContent = 'Novo Registro';
      el.userForm.senha.placeholder = '••••••••';
    }
    el.modal.classList.remove('hidden');
  }

  function closeModal() {
    el.modal.classList.add('hidden');
  }

  // --- Actions Exposed Globally ---

  window.appActions = {
    editUser: (id) => {
      const user = allUsers.find(u => u._id === id);
      if (user) openModal(user);
    },
    deleteUser: async (id) => {
      if (confirm('Tem certeza que deseja apagar este registro permanentemente?')) {
        try {
          await apiFetch(`/users/${id}`, { method: 'DELETE' });
          loadUsers();
        } catch (err) {
          alert('Erro ao excluir: ' + err.message);
        }
      }
    }
  };

  // --- Event Listeners ---

  el.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    login(el.loginForm.email.value, el.loginForm.senha.value);
  });

  el.btnLogout.addEventListener('click', logout);
  el.btnNew.addEventListener('click', () => openModal());
  el.modalCancel.addEventListener('click', closeModal);
  el.userForm.addEventListener('submit', handleUserSubmit);

  el.search.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u =>
      (u.nome + ' ' + (u.sobrenome || '')).toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.empresa || '').toLowerCase().includes(term)
    );
    renderUsers(filtered);
  });

  // --- Init ---

  document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
      showDashboard();
    } else {
      showLogin();
    }
  });

})();
