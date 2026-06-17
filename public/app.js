// State management
let map = null;
let markersLayer = null;
let obrasLayer = null; // Separate layer for Obras circle geofences
let currentRunData = null; // Holds the fetched real-time Tangerino data
let activeTab = 'alerts'; // 'alerts', 'all', or 'obras'
let searchQuery = '';
let selectedPunchesDay = 'today'; // 'today' or 'yesterday'
let registeredObras = [];
let registeredContracts = [];
let employeeAllocations = [];
let uniqueEmployees = [];
let selectedEmployeeName = '';
let currentReportData = [];
let filteredReportData = [];
let activeSubTab = 'contracts'; // 'contracts', 'obras', or 'allocations'

// DOM Elements
const appContainer = document.getElementById('appContainer');
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const btnLogout = document.getElementById('btnLogout');

// Main Elements
const systemStatusEl = document.getElementById('systemStatus');
const btnRunCheck = document.getElementById('btnRunCheck');
const activeAlertCountEl = document.getElementById('activeAlertCount');
const alertsContainer = document.getElementById('alertsContainer');
const loadingOverlay = document.getElementById('loadingOverlay');

// Tab Buttons
const tabAlertsBtn = document.getElementById('tabAlertsBtn');
const tabAllPunchesBtn = document.getElementById('tabAllPunchesBtn');
const tabObrasBtn = document.getElementById('tabObrasBtn');
const tabAlertsCount = document.getElementById('tabAlertsCount');
const tabAllPunchesCount = document.getElementById('tabAllPunchesCount');

// Filter Elements
const filtersPanel = document.getElementById('filtersPanel');
const employeeSearchInput = document.getElementById('employeeSearchInput');
const punchesDaySelect = document.getElementById('punchesDaySelect');

// Config Details
const cfgDistance = document.getElementById('cfgDistance');
const cfgCron = document.getElementById('cfgCron');
const cfgPhone = document.getElementById('cfgPhone');
const cfgApiType = document.getElementById('cfgApiType');

// Stats Card
const statEmployees = document.getElementById('statEmployees');
const statAlerts = document.getElementById('statAlerts');
const statYesterdayPunches = document.getElementById('statYesterdayPunches');
const statTodayPunches = document.getElementById('statTodayPunches');
const statLastRunTime = document.getElementById('statLastRunTime');

// Obras Panel Elements
const obrasContainer = document.getElementById('obrasContainer');
const btnNewObra = document.getElementById('btnNewObra');
const obraForm = document.getElementById('obraForm');
const btnCancelObra = document.getElementById('btnCancelObra');
const btnSaveObra = document.getElementById('btnSaveObra');
const obrasListContainer = document.getElementById('obrasListContainer');

const allocationForm = document.getElementById('allocationForm');
const allocEmployeeSearch = document.getElementById('allocEmployeeSearch');
const allocEmployeeSelect = document.getElementById('allocEmployeeSelect');
const allocEmployeeDropdownList = document.getElementById('allocEmployeeDropdownList');
const allocObraSelect = document.getElementById('allocObraSelect');
const allocationsListContainer = document.getElementById('allocationsListContainer');

// Sub-abas de Obras & Contratos Elements
const subTabContractsBtn = document.getElementById('subTabContractsBtn');
const subTabObrasBtn = document.getElementById('subTabObrasBtn');
const subTabAllocationsBtn = document.getElementById('subTabAllocationsBtn');
const subTabContractsContainer = document.getElementById('subTabContractsContainer');
const subTabObrasContainer = document.getElementById('subTabObrasContainer');
const subTabAllocationsContainer = document.getElementById('subTabAllocationsContainer');

const contractForm = document.getElementById('contractForm');
const btnNewContract = document.getElementById('btnNewContract');
const btnCancelContract = document.getElementById('btnCancelContract');
const contractsListContainer = document.getElementById('contractsListContainer');
const obraContractSelect = document.getElementById('obraContractSelect');

// Elementos do Painel do Relatório
const tabReportBtn = document.getElementById('tabReportBtn');
const reportContainer = document.getElementById('reportContainer');
const reportForm = document.getElementById('reportForm');
const reportStartDate = document.getElementById('reportStartDate');
const reportEndDate = document.getElementById('reportEndDate');
const btnGenerateReport = document.getElementById('btnGenerateReport');
const reportActions = document.getElementById('reportActions');
const reportSearchInput = document.getElementById('reportSearchInput');
const btnExportReport = document.getElementById('btnExportReport');
const reportResultsContainer = document.getElementById('reportResultsContainer');
const reportWarningBox = document.getElementById('reportWarningBox');

// --- AUTHENTICATION HELPERS ---

async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        logout();
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }
    return response;
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('email');
    if (token && email) {
        userEmailDisplay.innerHTML = `<i class="fa-regular fa-user"></i> ${email}`;
        loginOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
        initAuthenticatedApp();
    } else {
        loginOverlay.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    loginErrorMsg.classList.add('hidden');
    
    // UI state loading
    btnLoginSubmit.disabled = true;
    btnLoginSubmit.querySelector('.spinner').classList.remove('hidden');
    btnLoginSubmit.querySelector('.btn-content').classList.add('hidden');

    const email = loginEmail.value.trim();
    const senha = loginPassword.value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        
        const result = await response.json();
        
        if (result.success && result.token) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('email', result.email);
            
            // Clean fields
            loginEmail.value = '';
            loginPassword.value = '';
            
            checkAuth();
        } else {
            throw new Error(result.message || 'Falha ao autenticar.');
        }
    } catch (error) {
        console.error('Login error:', error);
        loginErrorMsg.textContent = error.message;
        loginErrorMsg.classList.remove('hidden');
    } finally {
        btnLoginSubmit.disabled = false;
        btnLoginSubmit.querySelector('.spinner').classList.add('hidden');
        btnLoginSubmit.querySelector('.btn-content').classList.remove('hidden');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    currentRunData = null;
    registeredObras = [];
    employeeAllocations = [];
    checkAuth();
}

// --- INIT APP ---

document.addEventListener('DOMContentLoaded', () => {
    // Bind auth listeners
    loginForm.addEventListener('submit', handleLoginSubmit);
    btnLogout.addEventListener('click', logout);
    
    checkAuth();
});

function initAuthenticatedApp() {
    if (!map) {
        initMap();
        setupDashboardListeners();
        setupObrasListeners();
    }
    
    fetchStatus();
    loadContracts();
    loadObras();
    loadAllocations();
    loadRealTimeData(); // Automatically fetch all punches and load data on access
}

// Initialize Leaflet Map
function initMap() {
    // Center of Brazil coordinates
    map = L.map('map').setView([-15.793889, -47.882778], 4);
    
    // Add standard OpenStreetMap tiles (dark styling applied in style.css)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    markersLayer = L.featureGroup().addTo(map);
    obrasLayer = L.featureGroup().addTo(map);
}

function setupDashboardListeners() {
    btnRunCheck.addEventListener('click', loadRealTimeData);
    
    // Tab switching events
    tabAlertsBtn.addEventListener('click', () => switchTab('alerts'));
    tabAllPunchesBtn.addEventListener('click', () => switchTab('all'));
    tabObrasBtn.addEventListener('click', () => switchTab('obras'));
    tabReportBtn.addEventListener('click', () => switchTab('report'));
    
    // Filters events
    employeeSearchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderTabContent();
    });
    
    punchesDaySelect.addEventListener('change', (e) => {
        selectedPunchesDay = e.target.value;
        updateTabCounts();
        renderTabContent();
    });

    // Relatório Listeners
    reportForm.addEventListener('submit', generateReport);
    reportSearchInput.addEventListener('input', filterReportResults);
    btnExportReport.addEventListener('click', exportReportToCSV);
    
    // Configurar datas padrões do relatório (início do mês corrente até hoje)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    
    reportStartDate.value = formatDate(firstDayOfMonth);
    reportEndDate.value = formatDate(today);
}

// Fetch current status and settings from the server config
async function fetchStatus() {
    try {
        const response = await authenticatedFetch('/api/status');
        const data = await response.json();
        
        if (data.success) {
            // Update configuration values in dashboard UI
            cfgDistance.textContent = `${data.config.distanceLimitKm} km`;
            cfgCron.textContent = formatCronTime(data.config.cronSchedule);
            cfgPhone.textContent = data.config.notificationPhone;
            cfgApiType.textContent = data.config.whatsappType;
        }
    } catch (e) {
        console.error('Error fetching server status:', e);
    }
}

// Helper to convert cron expression into human-readable time (e.g. 0 21 * * * -> 21:00)
function formatCronTime(cronExp) {
    if (!cronExp) return 'Não agendado';
    const parts = cronExp.split(' ');
    if (parts.length >= 2) {
        const min = parts[0].padStart(2, '0');
        const hour = parts[1].padStart(2, '0');
        return `${hour}:${min}`;
    }
    return cronExp;
}

// Load real-time data from Tangerino (calls the server to fetch and parse without sending WhatsApp alerts)
async function loadRealTimeData() {
    // Show premium full-screen loading screen
    loadingOverlay.classList.remove('hidden');
    
    // Update status indicator
    const indicator = systemStatusEl.querySelector('.status-indicator');
    const statusText = systemStatusEl.querySelector('.status-text');
    indicator.className = 'status-indicator checking';
    statusText.textContent = 'Buscando pontos no Tangerino...';
    
    // Disable manual verify button during loading
    btnRunCheck.disabled = true;
    btnRunCheck.querySelector('.spinner').classList.remove('hidden');
    btnRunCheck.querySelector('.btn-content').classList.add('hidden');
    
    try {
        console.log('Fetching real-time Tangerino clock-in records...');
        const response = await authenticatedFetch('/api/realtime-data');
        const result = await response.json();
        
        if (result.success && result.data) {
            currentRunData = result.data;
            
            // Update Stats Card UI
            statEmployees.textContent = currentRunData.employeesCheckedCount || 0;
            statAlerts.textContent = currentRunData.alertsCount || 0;
            statYesterdayPunches.textContent = currentRunData.totalPunchesYesterday || 0;
            statTodayPunches.textContent = currentRunData.totalPunchesToday || 0;
            
            const runTime = new Date(currentRunData.timestamp);
            statLastRunTime.textContent = `${runTime.toLocaleDateString('pt-BR')} às ${runTime.toLocaleTimeString('pt-BR')}`;
            
            // Update map badge
            activeAlertCountEl.textContent = `${currentRunData.alertsCount} Desvio${currentRunData.alertsCount !== 1 ? 's' : ''}`;
            
            // Populate employee selection dropdown for allocations
            populateEmployeeDropdown();
            
            // Update Tab counts
            updateTabCounts();
            
            // Render active tab details and map markers
            renderTabContent();
            
            // Update status indicator
            indicator.className = 'status-indicator idle';
            statusText.textContent = 'Atualizado em tempo real';
        } else {
            alert(`Falha ao obter dados em tempo real: ${result.error || result.message}`);
            renderEmptyDashboard();
            indicator.className = 'status-indicator idle';
            statusText.textContent = 'Erro ao atualizar';
        }
    } catch (e) {
        console.error('Error loading real-time data:', e);
        // Avoid alert spamming on session expiry (already handled by fetch proxy)
        if (localStorage.getItem('token')) {
            alert(`Erro de comunicação com o servidor: ${e.message}`);
            renderEmptyDashboard();
        }
        indicator.className = 'status-indicator idle';
        statusText.textContent = 'Erro de rede';
    } finally {
        // Hide loading screen and enable button
        loadingOverlay.classList.add('hidden');
        btnRunCheck.disabled = false;
        btnRunCheck.querySelector('.spinner').classList.add('hidden');
        btnRunCheck.querySelector('.btn-content').classList.remove('hidden');
    }
}

// Switch between dashboard tabs
function switchTab(tab) {
    activeTab = tab;
    
    // Reset buttons
    tabAlertsBtn.classList.remove('active');
    tabAllPunchesBtn.classList.remove('active');
    tabObrasBtn.classList.remove('active');
    tabReportBtn.classList.remove('active');
    
    // Hide panels
    filtersPanel.classList.add('hidden');
    alertsContainer.classList.add('hidden');
    obrasContainer.classList.add('hidden');
    reportContainer.classList.add('hidden');
    
    if (tab === 'alerts') {
        tabAlertsBtn.classList.add('active');
        alertsContainer.classList.remove('hidden');
    } else if (tab === 'all') {
        tabAllPunchesBtn.classList.add('active');
        filtersPanel.classList.remove('hidden');
        alertsContainer.classList.remove('hidden');
    } else if (tab === 'obras') {
        tabObrasBtn.classList.add('active');
        obrasContainer.classList.remove('hidden');
    } else if (tab === 'report') {
        tabReportBtn.classList.add('active');
        reportContainer.classList.remove('hidden');
    }
    
    renderTabContent();
}

// Update the count badges displayed on the tabs
function updateTabCounts() {
    if (!currentRunData) {
        tabAlertsCount.textContent = '0';
        tabAllPunchesCount.textContent = '0';
        return;
    }
    
    tabAlertsCount.textContent = currentRunData.alertsCount || 0;
    
    const allPunches = selectedPunchesDay === 'today' ? (currentRunData.allPunchesToday || []) : (currentRunData.allPunchesYesterday || []);
    tabAllPunchesCount.textContent = allPunches.length;
}

// Render the active tab content (both list view and map markers)
function renderTabContent() {
    // Redraw Obras overlays on map
    plotObrasOnMap();
    
    if (!currentRunData) return;
    
    if (activeTab === 'alerts') {
        renderAlertDetails(currentRunData.alerts);
        renderMapData(currentRunData.alerts);
    } else if (activeTab === 'all') {
        renderAllPunchesDetails(currentRunData);
    } else if (activeTab === 'obras') {
        // Map markers for Obras only
        markersLayer.clearLayers();
    }
}

// Render details list for employees with critical location changes
function renderAlertDetails(alerts) {
    if (!alerts || alerts.length === 0) {
        alertsContainer.innerHTML = `
            <div class="empty-alerts">
                <div class="empty-icon"><i class="fa-solid fa-circle-check"></i></div>
                <h3>Nenhum desvio detectado</h3>
                <p>Todos os colaboradores bateram ponto próximos às suas obras alocadas ou não há dados suficientes para comparação.</p>
            </div>
        `;
        return;
    }
    
    alertsContainer.innerHTML = '';
    
    alerts.forEach(alert => {
        const timeToday = new Date(alert.pontoBatido.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateTodayFormatted = new Date(alert.pontoBatido.timestamp).toLocaleDateString('pt-BR');
        
        const card = document.createElement('div');
        card.className = 'alert-card';
        
        let waBadge = '';
        if (alert.whatsappSent) {
            waBadge = `<span class="alert-wa-status sent"><i class="fa-solid fa-check-double"></i> WhatsApp Enviado</span>`;
        } else {
            const errorMsg = alert.whatsappError ? `title="${alert.whatsappError}"` : '';
            waBadge = `<span class="alert-wa-status failed" ${errorMsg}><i class="fa-solid fa-triangle-exclamation"></i> WhatsApp Falhou</span>`;
        }

        const currentAlloc = employeeAllocations.find(a => a.employee_id === String(alert.employeeId));
        const currentObraId = currentAlloc ? currentAlloc.obra_id : null;

        const quickSelectHtml = `
            <select class="form-select quick-alloc-select" style="padding: 6px 10px; font-size: 11px; border-radius: 6px; background: rgba(18, 24, 38, 0.85); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer; outline: none; transition: var(--transition-smooth);" onchange="handleQuickAllocation('${alert.employeeId}', '${alert.employeeName.replace(/'/g, "\\'")}', this.value)">
                <option value="none">Alocar Obra...</option>
                ${registeredObras.map(o => {
                    const isSelected = currentObraId === o.id ? 'selected' : '';
                    return `<option value="${o.id}" ${isSelected}>${o.name}</option>`;
                }).join('')}
            </select>
        `;

        if (alert.type === 'no_allocation') {
            card.className += ' alert-no-allocation';
            card.innerHTML = `
                <div class="alert-card-header" style="background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.25);">
                    <span class="alert-employee"><i class="fa-solid fa-user-slash" style="color: var(--danger);"></i> ${alert.employeeName}</span>
                    <span class="alert-distance" style="background: rgba(239, 68, 68, 0.15); color: var(--danger); border-color: rgba(239, 68, 68, 0.2); text-transform: uppercase;">Sem Alocação</span>
                </div>
                <div class="alert-comparison" style="grid-template-columns: 1fr;">
                    <div class="alert-side" style="text-align: center; padding: 12px; background: rgba(255, 255, 255, 0.015); border-radius: 8px; border: 1px dashed var(--border-color);">
                        <span style="font-size: 13px; color: var(--text-secondary); display: block; margin-bottom: 8px;">
                            <i class="fa-solid fa-triangle-exclamation" style="color: var(--warning);"></i> Este colaborador bateu ponto hoje, mas <strong>não possui obra alocada</strong> no sistema.
                        </span>
                        <div style="font-size: 11px; color: var(--text-muted);">
                            Ponto batido em: <strong>${alert.pontoBatido.workPlaceName || 'Sem Obra no Ponto'}</strong> (${timeToday})
                            <br>Endereço: ${alert.pontoBatido.address}
                        </div>
                    </div>
                </div>
                <div class="alert-footer">
                    ${waBadge}
                    <div class="alert-actions" style="display: flex; gap: 8px; align-items: center;">
                        ${quickSelectHtml}
                        <a href="${alert.pontoBatido.mapUrl}" target="_blank" class="btn-small"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ver no Mapa</a>
                    </div>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="alert-card-header">
                    <span class="alert-employee"><i class="fa-solid fa-user-tie" style="color: var(--primary);"></i> ${alert.employeeName}</span>
                    <span class="alert-distance">${alert.distance} km da Obra</span>
                </div>
                <div class="alert-comparison">
                    <div class="alert-side">
                        <span class="alert-side-title">Obra Alocada</span>
                        <span class="alert-obra">${alert.obraAlocada.name}</span>
                        <span class="alert-addr" title="${alert.obraAlocada.address || 'Sem Endereço'}">${alert.obraAlocada.address || 'Sem Endereço'}</span>
                        <span class="alert-time"><i class="fa-solid fa-circle-dot" style="color: var(--warning);"></i> Raio: ${alert.obraAlocada.radius_km} km</span>
                    </div>
                    <div class="alert-arrow">
                        <i class="fa-solid fa-right-long"></i>
                    </div>
                    <div class="alert-side">
                        <span class="alert-side-title">Batida de Ponto (${dateTodayFormatted})</span>
                        <span class="alert-obra">${alert.pontoBatido.workPlaceName || 'Sem Obra no Ponto'}</span>
                        <span class="alert-addr" title="${alert.pontoBatido.address}">${alert.pontoBatido.address}</span>
                        <span class="alert-time"><i class="fa-regular fa-clock"></i> ${timeToday} (${alert.pontoBatido.type})</span>
                    </div>
                </div>
                <div class="alert-footer">
                    ${waBadge}
                    <div class="alert-actions" style="display: flex; gap: 8px; align-items: center;">
                        ${quickSelectHtml}
                        <a href="${alert.pontoBatido.mapUrl}" target="_blank" class="btn-small"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ver Batida</a>
                    </div>
                </div>
            `;
        }
        
        alertsContainer.appendChild(card);
    });
}

// Render details list for ALL employee punches (with search filter and geofence indicators)
function renderAllPunchesDetails(run) {
    const rawPunches = selectedPunchesDay === 'today' ? (run.allPunchesToday || []) : (run.allPunchesYesterday || []);
    
    // Apply search filter
    const filteredPunches = rawPunches.filter(p => 
        p.employeeName.toLowerCase().includes(searchQuery) || 
        (p.workPlaceName && p.workPlaceName.toLowerCase().includes(searchQuery)) ||
        p.address.toLowerCase().includes(searchQuery) ||
        (p.allocatedObraName && p.allocatedObraName.toLowerCase().includes(searchQuery))
    );
    
    if (filteredPunches.length === 0) {
        alertsContainer.innerHTML = `
            <div class="empty-alerts">
                <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                <h3>Nenhum registro encontrado</h3>
                <p>Nenhum ponto bateu com os termos de busca digitados.</p>
            </div>
        `;
        markersLayer.clearLayers();
        return;
    }
    
    alertsContainer.innerHTML = '';
    
    // Group punches of the same employee together for a cleaner list
    const grouped = {};
    filteredPunches.forEach(p => {
        if (!grouped[p.employeeId]) {
            grouped[p.employeeId] = [];
        }
        grouped[p.employeeId].push(p);
    });
    
    // Sort employees alphabetically
    const sortedEmployeeIds = Object.keys(grouped).sort((a, b) => 
        grouped[a][0].employeeName.localeCompare(grouped[b][0].employeeName)
    );
    
    sortedEmployeeIds.forEach(empId => {
        const punches = grouped[empId];
        const employeeName = punches[0].employeeName;
        
        punches.forEach(punch => {
            const dateObj = new Date(punch.timestamp);
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            // Check if this punch triggered an alert
            const isAlert = run.alerts.some(a => 
                a.employeeId === String(punch.employeeId) && 
                (a.todayPunch.punchId === punch.punchId || a.yesterdayPunch.punchId === punch.punchId)
            );
            
            const card = document.createElement('div');
            card.className = 'punch-card';
            
            let badgeClass = punch.type === 'IN' ? 'in' : 'out';
            let badgeText = punch.type === 'IN' ? 'Entrada' : 'Saída';
            if (isAlert) {
                badgeClass = 'alert';
                badgeText = 'Desvio Crítico';
            }
            
            const obraText = punch.workPlaceName || 'Sem Obra Cadastrada';
            const mapUrl = `https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`;
            
            // Geofence status HTML
            let geofenceBadgeHtml = '';
            let geofenceInfoHtml = '';
            if (punch.geofenceStatus === 'inside') {
                geofenceBadgeHtml = `<span class="punch-badge inside">Dentro da Obra</span>`;
                geofenceInfoHtml = `
                    <div class="punch-geofence-info inside">
                        <i class="fa-solid fa-circle-check"></i> Alocado em: <strong>${punch.allocatedObraName}</strong> (${punch.allocatedObraDistance} km de distância)
                    </div>
                `;
            } else if (punch.geofenceStatus === 'outside') {
                geofenceBadgeHtml = `<span class="punch-badge outside">Fora da Obra</span>`;
                geofenceInfoHtml = `
                    <div class="punch-geofence-info outside">
                        <i class="fa-solid fa-circle-exclamation"></i> Alocado em: <strong>${punch.allocatedObraName}</strong> mas bateu a <strong>${punch.allocatedObraDistance} km</strong> do local
                    </div>
                `;
            } else {
                geofenceBadgeHtml = `<span class="punch-badge out" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); border-color: var(--border-color);">Sem Alocação</span>`;
            }
            
            const currentAlloc = employeeAllocations.find(a => a.employee_id === String(punch.employeeId));
            const currentObraId = currentAlloc ? currentAlloc.obra_id : null;

            card.innerHTML = `
                <div class="punch-card-header">
                    <span class="punch-employee">${punch.employeeName}</span>
                    <div style="display: flex; gap: 8px;">
                        ${geofenceBadgeHtml}
                        <span class="punch-badge ${badgeClass}">${badgeText}</span>
                    </div>
                </div>
                <div class="punch-details">
                    <div class="punch-obra"><i class="fa-solid fa-building-user"></i> ${obraText}</div>
                    <div class="punch-address" title="${punch.address}"><i class="fa-solid fa-location-dot"></i> ${punch.address}</div>
                    ${geofenceInfoHtml}
                </div>
                <div class="punch-footer">
                    <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1;">
                        <span><i class="fa-regular fa-clock"></i> Horário: <strong>${timeStr}</strong></span>
                        <select class="form-select quick-alloc-select" style="padding: 6px 10px; font-size: 11px; border-radius: 6px; background: rgba(18, 24, 38, 0.85); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer; outline: none; transition: var(--transition-smooth); max-width: 180px;" onchange="handleQuickAllocation('${punch.employeeId}', '${punch.employeeName.replace(/'/g, "\\'")}', this.value)">
                            <option value="none">Alocar Obra...</option>
                            ${registeredObras.map(o => {
                                const isSelected = currentObraId === o.id ? 'selected' : '';
                                return `<option value="${o.id}" ${isSelected}>${o.name}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <a href="${mapUrl}" target="_blank" class="btn-small"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ver no Mapa</a>
                </div>
            `;
            
            alertsContainer.appendChild(card);
        });
    });
    
    // Plot all punches of selected day on the Leaflet map
    renderAllPunchesMap(filteredPunches, run.alerts);
}

// Draw alert details on the Leaflet Map
function renderMapData(alerts) {
    markersLayer.clearLayers();
    
    if (!alerts || alerts.length === 0) {
        map.setView([-15.793889, -47.882778], 4);
        return;
    }
    
    const bounds = [];
    
    alerts.forEach(alert => {
        const tLat = alert.pontoBatido.latitude;
        const tLng = alert.pontoBatido.longitude;
        
        bounds.push([tLat, tLng]);
        
        // Marcador da Batida Real (Vermelho para desvio, Laranja para sem alocação)
        const markerClass = alert.type === 'discrepancy' ? 'pulsing-map-marker' : '';
        const fillColor = alert.type === 'discrepancy' ? '#ef4444' : '#f59e0b';
        const strokeColor = alert.type === 'discrepancy' ? '#b91c1c' : '#d97706';
        
        const popupContent = alert.type === 'discrepancy' ? `
            <div style="font-family: Inter, sans-serif; font-size: 12px; color: #ffffff;">
                <strong style="color: #ef4444;">Desvio - ${alert.employeeName}</strong><br>
                <b>Obra Alocada:</b> ${alert.obraAlocada.name}<br>
                <b>Batida em:</b> ${alert.pontoBatido.workPlaceName || 'Sem Obra'}<br>
                <b>Endereço Batida:</b> ${alert.pontoBatido.address}<br>
                <b>Horário:</b> ${new Date(alert.pontoBatido.timestamp).toLocaleTimeString('pt-BR')}<br>
                <b style="color: #fca5a5;">Distância: ${alert.distance} km</b>
            </div>
        ` : `
            <div style="font-family: Inter, sans-serif; font-size: 12px; color: #ffffff;">
                <strong style="color: #fbbf24;">Sem Alocação - ${alert.employeeName}</strong><br>
                <b>Batida em:</b> ${alert.pontoBatido.workPlaceName || 'Sem Obra'}<br>
                <b>Endereço Batida:</b> ${alert.pontoBatido.address}<br>
                <b>Horário:</b> ${new Date(alert.pontoBatido.timestamp).toLocaleTimeString('pt-BR')}
            </div>
        `;
        
        const punchMarker = L.circleMarker([tLat, tLng], {
            radius: 9,
            fillColor: fillColor,
            color: strokeColor,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            className: markerClass
        }).bindPopup(popupContent);
        
        markersLayer.addLayer(punchMarker);
        
        if (alert.type === 'discrepancy' && alert.obraAlocada) {
            const oLat = alert.obraAlocada.latitude;
            const oLng = alert.obraAlocada.longitude;
            bounds.push([oLat, oLng]);
            
            // Marcador da Obra Alocada (Azul)
            const obraMarker = L.circleMarker([oLat, oLng], {
                radius: 7,
                fillColor: '#3b82f6',
                color: '#1d4ed8',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).bindPopup(`
                <div style="font-family: Inter, sans-serif; font-size: 12px; color: #ffffff;">
                    <strong style="color: #60a5fa;">Obra Alocada - ${alert.obraAlocada.name}</strong><br>
                    <b>Endereço:</b> ${alert.obraAlocada.address || 'Sem Endereço'}<br>
                    <b>Cerca:</b> ${alert.obraAlocada.radius_km} km
                </div>
            `);
            
            // Linha tracejada conectando a Obra Alocada ao ponto real
            const polyline = L.polyline([[oLat, oLng], [tLat, tLng]], {
                color: '#fbbf24',
                weight: 3,
                dashArray: '5, 8',
                opacity: 0.85
            }).bindPopup(`
                <div style="font-family: Inter, sans-serif; font-size: 12px; text-align: center; color: #ffffff;">
                    <strong>Distância do Desvio</strong><br>
                    <span style="font-size: 16px; font-weight: bold; color: #fbbf24;">${alert.distance} km</span><br>
                    Funcionário: ${alert.employeeName}
                </div>
            `);
            
            markersLayer.addLayer(obraMarker);
            markersLayer.addLayer(polyline);
        }
    });
    
    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Plot ALL employee punches on the map
function renderAllPunchesMap(punches, alerts) {
    markersLayer.clearLayers();
    
    const bounds = [];
    
    punches.forEach(punch => {
        const lat = punch.latitude;
        const lng = punch.longitude;
        bounds.push([lat, lng]);
        
        // Check if this punch is associated with a location discrepancy
        const isAlert = alerts.some(a => 
            a.employeeId === String(punch.employeeId) && 
            (a.todayPunch.punchId === punch.punchId || a.yesterdayPunch.punchId === punch.punchId)
        );
        
        let fillColor = '#10b981'; // Green for normal punches
        let color = '#047857';
        let radius = 6;
        let className = '';
        let statusTitle = `<strong style="color: #34d399;">Ponto Regular</strong>`;
        
        if (punch.geofenceStatus === 'outside') {
            fillColor = '#f59e0b'; // Orange for out-of-fence
            color = '#d97706';
            statusTitle = `<strong style="color: #fbbf24;">Fora da Obra Alocada</strong>`;
        }
        
        if (isAlert) {
            fillColor = '#ef4444'; // Red warning for alert punches
            color = '#b91c1c';
            radius = 8;
            className = 'pulsing-map-marker';
            statusTitle = `<strong style="color: #f87171;">Desvio Crítico (>50km)</strong>`;
        }
        
        const marker = L.circleMarker([lat, lng], {
            radius,
            fillColor,
            color,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
            className
        }).bindPopup(`
            <div style="font-family: Inter, sans-serif; font-size: 12px; color: #ffffff;">
                ${statusTitle}<br>
                <b>Funcionário:</b> ${punch.employeeName}<br>
                <b>Obra do Ponto:</b> ${punch.workPlaceName || 'Sem Obra'}<br>
                <b>Alocado em:</b> ${punch.allocatedObraName || 'Sem Alocação'}<br>
                <b>Tipo:</b> ${punch.type === 'IN' ? 'Entrada' : 'Saída'}<br>
                <b>Endereço:</b> ${punch.address}<br>
                <b>Horário:</b> ${new Date(punch.timestamp).toLocaleTimeString('pt-BR')}
            </div>
        `);
        
        markersLayer.addLayer(marker);
    });
    
    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

// Reset Stats and Details UI to zero/empty
function renderEmptyDashboard() {
    statEmployees.textContent = '0';
    statAlerts.textContent = '0';
    statYesterdayPunches.textContent = '0';
    statTodayPunches.textContent = '0';
    statLastRunTime.textContent = 'Nunca';
    activeAlertCountEl.textContent = '0 Desvios';
    tabAlertsCount.textContent = '0';
    tabAllPunchesCount.textContent = '0';
    
    alertsContainer.innerHTML = `
        <div class="empty-alerts">
            <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <h3>Nenhum dado carregado</h3>
            <p>Ocorreu um erro ou nenhuma verificação foi concluída ainda. Tente atualizar o painel.</p>
        </div>
    `;
    map.setView([-15.793889, -47.882778], 4);
}

// --- OBRAS & ALLOCATIONS PANEL LOGIC ---

function setupObrasListeners() {
    // Sub-tab switching events
    subTabContractsBtn.addEventListener('click', () => switchSubTab('contracts'));
    subTabObrasBtn.addEventListener('click', () => switchSubTab('obras'));
    subTabAllocationsBtn.addEventListener('click', () => switchSubTab('allocations'));

    // Contract Form Listeners
    btnNewContract.addEventListener('click', () => {
        contractForm.reset();
        document.getElementById('contractId').value = '';
        contractForm.classList.remove('hidden');
    });

    btnCancelContract.addEventListener('click', () => {
        contractForm.reset();
        contractForm.classList.add('hidden');
    });

    contractForm.addEventListener('submit', handleContractSubmit);

    btnNewObra.addEventListener('click', () => {
        obraForm.reset();
        document.getElementById('obraId').value = '';
        obraForm.classList.remove('hidden');
    });
    
    btnCancelObra.addEventListener('click', () => {
        obraForm.reset();
        obraForm.classList.add('hidden');
    });
    
    obraForm.addEventListener('submit', handleObraSubmit);
    allocationForm.addEventListener('submit', handleAllocationSubmit);

    // Custom autocomplete select events
    allocEmployeeSearch.addEventListener('focus', showEmployeeDropdown);
    allocEmployeeSearch.addEventListener('input', filterEmployeeDropdown);
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-container')) {
            allocEmployeeDropdownList.classList.add('hidden');
        }
    });
}

function showEmployeeDropdown() {
    renderEmployeeDropdownList(uniqueEmployees.slice(0, 30)); // Show first 30 initially
    allocEmployeeDropdownList.classList.remove('hidden');
}

function filterEmployeeDropdown(e) {
    const term = e.target.value.toLowerCase().trim();
    if (term === '') {
        renderEmployeeDropdownList(uniqueEmployees.slice(0, 30));
        allocEmployeeDropdownList.classList.remove('hidden');
        return;
    }
    
    const filtered = uniqueEmployees.filter(emp => 
        emp.name.toLowerCase().includes(term)
    );
    
    renderEmployeeDropdownList(filtered);
    allocEmployeeDropdownList.classList.remove('hidden');
}

function renderEmployeeDropdownList(list) {
    if (list.length === 0) {
        allocEmployeeDropdownList.innerHTML = `<div class="custom-select-no-results">Nenhum colaborador encontrado</div>`;
        return;
    }
    
    allocEmployeeDropdownList.innerHTML = '';
    list.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'custom-select-item';
        if (allocEmployeeSelect.value === String(emp.id)) {
            item.className += ' selected';
        }
        item.textContent = emp.name;
        
        item.addEventListener('click', () => {
            allocEmployeeSelect.value = emp.id;
            allocEmployeeSearch.value = emp.name;
            selectedEmployeeName = emp.name;
            allocEmployeeDropdownList.classList.add('hidden');
        });
        
        allocEmployeeDropdownList.appendChild(item);
    });
}

// Fetch registered construction sites
async function loadObras() {
    try {
        const response = await authenticatedFetch('/api/obras');
        const data = await response.json();
        if (data.success) {
            registeredObras = data.obras;
            renderObrasList();
            populateObraSelectDropdown();
            plotObrasOnMap();
        }
    } catch (e) {
        console.error('Error loading Obras:', e);
    }
}

// Fetch allocations list
async function loadAllocations() {
    try {
        const response = await authenticatedFetch('/api/allocations');
        const data = await response.json();
        if (data.success) {
            employeeAllocations = data.allocations;
            renderAllocationsList();
        }
    } catch (e) {
        console.error('Error loading Allocations:', e);
    }
}

// Render construction sites list with edit/delete buttons
function renderObrasList() {
    if (registeredObras.length === 0) {
        obrasListContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;">
                Nenhuma obra cadastrada.
            </div>
        `;
        return;
    }
    
    obrasListContainer.innerHTML = '';
    registeredObras.forEach(o => {
        const card = document.createElement('div');
        card.className = 'obra-item-card';
        card.innerHTML = `
            <div class="obra-item-info">
                <span class="obra-item-name">${o.name}</span>
                <span class="obra-item-meta"><i class="fa-solid fa-file-contract"></i> Contrato: <strong>${o.contract_name || 'Sem Contrato'}</strong></span>
                <span class="obra-item-meta"><i class="fa-solid fa-location-dot"></i> ${o.address || 'Sem Endereço'}</span>
                <span class="obra-item-meta"><i class="fa-solid fa-circle-nodes"></i> Lat: ${o.latitude} | Lng: ${o.longitude} | Raio: ${o.radius_km} km</span>
            </div>
            <div class="obra-item-actions">
                <button class="btn-icon-only edit" onclick="editObra(${o.id})" title="Editar Obra"><i class="fa-solid fa-pencil"></i></button>
                <button class="btn-icon-only delete" onclick="deleteObra(${o.id})" title="Remover Obra"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        obrasListContainer.appendChild(card);
    });
}

// Render employee allocations list
function renderAllocationsList() {
    if (employeeAllocations.length === 0) {
        allocationsListContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;">
                Nenhum colaborador alocado.
            </div>
        `;
        return;
    }
    
    allocationsListContainer.innerHTML = '';
    employeeAllocations.forEach(a => {
        const card = document.createElement('div');
        card.className = 'alloc-item-card';
        card.innerHTML = `
            <div class="alloc-item-info">
                <span class="alloc-item-emp">${a.employee_name}</span>
                <span class="alloc-item-meta">Alocado na obra: <strong class="alloc-item-obra-name">${a.obra_name}</strong></span>
            </div>
            <div class="alloc-item-actions">
                <button class="btn-icon-only delete" onclick="removeAllocation('${a.employee_id}')" title="Remover Alocação"><i class="fa-solid fa-link-slash"></i></button>
            </div>
        `;
        allocationsListContainer.appendChild(card);
    });
}

// Populate employee select dropdown dynamically based on yesterday/today punches
function populateEmployeeDropdown() {
    if (!currentRunData) return;
    
    // Find unique employees in punches
    const employees = {};
    const addEmployee = (p) => {
        employees[p.employeeId] = p.employeeName;
    };
    
    (currentRunData.allPunchesToday || []).forEach(addEmployee);
    (currentRunData.allPunchesYesterday || []).forEach(addEmployee);
    
    // Convert to array
    const list = [];
    Object.keys(employees).forEach(id => {
        list.push({ id, name: employees[id] });
    });
    
    // Sort alphabetically
    list.sort((a, b) => a.name.localeCompare(b.name));
    
    uniqueEmployees = list;
}

// Populate Obras dropdowns for allocation select
function populateObraSelectDropdown() {
    allocObraSelect.innerHTML = `
        <option value="" disabled selected>Selecione uma obra...</option>
        <option value="none">Nenhuma (Remover Alocação)</option>
    `;
    
    registeredObras.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name;
        allocObraSelect.appendChild(opt);
    });
}

// Submit handler to save Obra
async function handleObraSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('obraId').value;
    const name = document.getElementById('obraName').value.trim();
    const address = document.getElementById('obraAddress').value.trim();
    const latitude = parseFloat(document.getElementById('obraLat').value);
    const longitude = parseFloat(document.getElementById('obraLng').value);
    const radius_km = parseFloat(document.getElementById('obraRadius').value);
    const contract_id = document.getElementById('obraContractSelect').value;
    
    const body = { name, address, latitude, longitude, radius_km, contract_id };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/obras/${id}` : '/api/obras';
    
    try {
        const response = await authenticatedFetch(url, {
            method,
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            obraForm.reset();
            obraForm.classList.add('hidden');
            loadObras();
            // Reload real-time data to update geofence badges of collaborators
            loadRealTimeData();
        } else {
            alert(result.message || 'Erro ao gravar obra.');
        }
    } catch (error) {
        console.error('Error saving Obra:', error);
    }
}

// Submit handler to set Allocation
async function handleAllocationSubmit(e) {
    e.preventDefault();
    
    const employee_id = allocEmployeeSelect.value;
    const employee_name = allocEmployeeSearch.value.trim();
    const obra_val = allocObraSelect.value;
    const obra_id = obra_val === 'none' ? null : parseInt(obra_val);
    
    if (!employee_id || employee_name !== selectedEmployeeName) {
        alert('Por favor, selecione um colaborador válido da lista de buscas.');
        return;
    }
    
    const body = { employee_id, employee_name, obra_id };
    
    try {
        const response = await authenticatedFetch('/api/allocations', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            allocationForm.reset();
            allocEmployeeSearch.value = '';
            allocEmployeeSelect.value = '';
            selectedEmployeeName = '';
            loadAllocations();
            // Reload real-time data to update geofence badges of collaborators
            loadRealTimeData();
        } else {
            alert(result.message || 'Erro ao salvar alocação.');
        }
    } catch (error) {
        console.error('Error setting allocation:', error);
    }
}

// Global actions exposed to window
window.editObra = (id) => {
    const o = registeredObras.find(x => x.id === id);
    if (!o) return;
    
    document.getElementById('obraId').value = o.id;
    document.getElementById('obraName').value = o.name;
    document.getElementById('obraAddress').value = o.address || '';
    document.getElementById('obraLat').value = o.latitude;
    document.getElementById('obraLng').value = o.longitude;
    document.getElementById('obraRadius').value = o.radius_km || 1.0;
    document.getElementById('obraContractSelect').value = o.contract_id || '';
    
    obraForm.classList.remove('hidden');
    obraForm.scrollIntoView({ behavior: 'smooth' });
};

// --- CONTRACTS PANEL LOGIC ---

async function loadContracts() {
    try {
        const response = await authenticatedFetch('/api/contracts');
        const data = await response.json();
        if (data.success) {
            registeredContracts = data.contracts;
            renderContractsList();
            populateContractSelectDropdown();
        }
    } catch (e) {
        console.error('Error loading Contracts:', e);
    }
}

function renderContractsList() {
    if (registeredContracts.length === 0) {
        contractsListContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;">
                Nenhum contrato cadastrado.
            </div>
        `;
        return;
    }
    
    contractsListContainer.innerHTML = '';
    registeredContracts.forEach(c => {
        const card = document.createElement('div');
        card.className = 'obra-item-card';
        card.innerHTML = `
            <div class="obra-item-info">
                <span class="obra-item-name">${c.name}</span>
                <span class="contract-meta"><i class="fa-solid fa-hashtag"></i> Num: ${c.number_contract} | <i class="fa-solid fa-list-ol"></i> Série: ${c.serie || 'N/A'}</span>
                ${c.description ? `<div class="contract-desc">${c.description}</div>` : ''}
            </div>
            <div class="obra-item-actions">
                <button class="btn-icon-only edit" onclick="editContract('${c.id}')" title="Editar Contrato"><i class="fa-solid fa-pencil"></i></button>
                <button class="btn-icon-only delete" onclick="deleteContract('${c.id}')" title="Remover Contrato"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        contractsListContainer.appendChild(card);
    });
}

function populateContractSelectDropdown() {
    obraContractSelect.innerHTML = `
        <option value="" disabled selected>Selecione um contrato...</option>
    `;
    registeredContracts.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.number_contract})`;
        obraContractSelect.appendChild(opt);
    });
}

async function handleContractSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('contractId').value;
    const name = document.getElementById('contractName').value.trim();
    const number_contract = document.getElementById('contractNumber').value.trim();
    const serie = document.getElementById('contractSerie').value.trim();
    const description = document.getElementById('contractDescription').value.trim();

    const body = { name, number_contract, serie, description };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/contracts/${id}` : '/api/contracts';

    try {
        const response = await authenticatedFetch(url, {
            method,
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            contractForm.reset();
            contractForm.classList.add('hidden');
            await loadContracts();
        } else {
            alert(result.message || 'Erro ao salvar contrato.');
        }
    } catch (error) {
        console.error('Error saving Contract:', error);
    }
}

window.editContract = (id) => {
    const c = registeredContracts.find(x => x.id === id);
    if (!c) return;
    
    document.getElementById('contractId').value = c.id;
    document.getElementById('contractName').value = c.name;
    document.getElementById('contractNumber').value = c.number_contract;
    document.getElementById('contractSerie').value = c.serie || '';
    document.getElementById('contractDescription').value = c.description || '';
    
    contractForm.classList.remove('hidden');
    contractForm.scrollIntoView({ behavior: 'smooth' });
};

window.deleteContract = async (id) => {
    if (!confirm('Deseja excluir este contrato? (Isto falhará se houver obras vinculadas)')) return;
    try {
        const response = await authenticatedFetch(`/api/contracts/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            await loadContracts();
        } else {
            alert(result.message || 'Erro ao excluir contrato.');
        }
    } catch (e) {
        console.error(e);
    }
};

function switchSubTab(subTab) {
    activeSubTab = subTab;
    
    subTabContractsBtn.classList.remove('active');
    subTabObrasBtn.classList.remove('active');
    subTabAllocationsBtn.classList.remove('active');
    
    subTabContractsContainer.classList.add('hidden');
    subTabObrasContainer.classList.add('hidden');
    subTabAllocationsContainer.classList.add('hidden');
    
    if (subTab === 'contracts') {
        subTabContractsBtn.classList.add('active');
        subTabContractsContainer.classList.remove('hidden');
    } else if (subTab === 'obras') {
        subTabObrasBtn.classList.add('active');
        subTabObrasContainer.classList.remove('hidden');
    } else if (subTab === 'allocations') {
        subTabAllocationsBtn.classList.add('active');
        subTabAllocationsContainer.classList.remove('hidden');
    }
}

window.deleteObra = async (id) => {
    if (!confirm('Deseja excluir esta obra permanentemente?')) return;
    try {
        const response = await authenticatedFetch(`/api/obras/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            loadObras();
            loadAllocations(); // Allocations cascade delete automatically
            loadRealTimeData();
        } else {
            alert(result.message || 'Erro ao excluir.');
        }
    } catch (e) {
        console.error(e);
    }
};

window.removeAllocation = async (employeeId) => {
    if (!confirm('Deseja remover a alocação deste colaborador?')) return;
    try {
        const response = await authenticatedFetch('/api/allocations', {
            method: 'POST',
            body: JSON.stringify({ employee_id: employeeId, employee_name: 'Removal', obra_id: null })
        });
        const result = await response.json();
        if (result.success) {
            loadAllocations();
            loadRealTimeData();
        } else {
            alert(result.message || 'Erro ao remover alocação.');
        }
    } catch (e) {
        console.error(e);
    }
};

window.handleQuickAllocation = async (employeeId, employeeName, obraIdStr) => {
    const obraId = obraIdStr === 'none' || obraIdStr === '' ? null : parseInt(obraIdStr);
    
    // Mostrar loading overlay
    loadingOverlay.classList.remove('hidden');
    
    try {
        const response = await authenticatedFetch('/api/allocations', {
            method: 'POST',
            body: JSON.stringify({
                employee_id: String(employeeId),
                employee_name: employeeName,
                obra_id: obraId
            })
        });
        const result = await response.json();
        if (result.success) {
            // Recarregar alocações locais e dados em tempo real
            await loadAllocations();
            await loadRealTimeData();
        } else {
            alert(result.message || 'Erro ao salvar alocação rápida.');
            loadingOverlay.classList.add('hidden');
        }
    } catch (e) {
        console.error('Erro na alocação rápida:', e);
        alert('Erro ao se conectar com o servidor.');
        loadingOverlay.classList.add('hidden');
    }
};

// Draw construction site fences on the map
function plotObrasOnMap() {
    if (!map) return;
    obrasLayer.clearLayers();
    
    registeredObras.forEach(o => {
        // Obra marker (Orange building circle)
        const marker = L.circleMarker([o.latitude, o.longitude], {
            radius: 8,
            fillColor: '#f59e0b',
            color: '#d97706',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).bindPopup(`
            <div style="font-family: Inter, sans-serif; font-size: 12px; color: #ffffff;">
                <strong style="color: #fbbf24;"><i class="fa-solid fa-helmet-safety"></i> Obra: ${o.name}</strong><br>
                <b>Endereço:</b> ${o.address || 'Sem Endereço'}<br>
                <b>Raio da Cerca:</b> ${o.radius_km} km
            </div>
        `);
        
        // Obra radius circle (translucent orange geofence)
        const geofence = L.circle([o.latitude, o.longitude], {
            radius: o.radius_km * 1000, // Leaflet uses meters
            color: '#fbbf24',
            weight: 1,
            fillColor: '#fbbf24',
            fillOpacity: 0.12,
            dashArray: '4, 4'
        });
        
        obrasLayer.addLayer(marker);
        obrasLayer.addLayer(geofence);
    });
}

// --- REPORT GENERATION LOGIC ---

async function generateReport(e) {
    if (e) e.preventDefault();
    
    // Obter datas selecionadas
    const start = reportStartDate.value;
    const end = reportEndDate.value;
    
    if (!start || !end) {
        alert('Por favor, selecione as datas inicial e final.');
        return;
    }
    
    // Validar período longo (> 31 dias)
    const startDateObj = new Date(start + 'T00:00:00');
    const endDateObj = new Date(end + 'T00:00:00');
    const diffTime = Math.abs(endDateObj - startDateObj);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 31) {
        reportWarningBox.classList.remove('hidden');
    } else {
        reportWarningBox.classList.add('hidden');
    }
    
    // Atualizar UI para estado de carregamento
    btnGenerateReport.disabled = true;
    btnGenerateReport.querySelector('.spinner').classList.remove('hidden');
    btnGenerateReport.querySelector('.btn-content').classList.add('hidden');
    reportResultsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 30px; margin-bottom: 15px; color: var(--primary);"></i>
            <p>Buscando dados no Tangerino e processando períodos de obras. Isso pode demorar um pouco...</p>
        </div>
    `;
    
    try {
        const response = await authenticatedFetch(`/api/report?start=${start}&end=${end}`);
        const result = await response.json();
        
        if (result.success && result.report) {
            currentReportData = result.report;
            filteredReportData = [...currentReportData];
            
            // Limpar campo de busca
            reportSearchInput.value = '';
            
            // Mostrar controles adicionais (busca/exportação) se houver resultados
            if (currentReportData.length > 0) {
                reportActions.classList.remove('hidden');
            } else {
                reportActions.classList.add('hidden');
            }
            
            renderReportResults();
        } else {
            alert(`Falha ao gerar relatório: ${result.message || result.error}`);
            renderEmptyReport();
        }
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        if (localStorage.getItem('token')) {
            alert(`Erro na comunicação com o servidor: ${error.message}`);
        }
        renderEmptyReport();
    } finally {
        // Restaurar estado do botão
        btnGenerateReport.disabled = false;
        btnGenerateReport.querySelector('.spinner').classList.add('hidden');
        btnGenerateReport.querySelector('.btn-content').classList.remove('hidden');
    }
}

function renderReportResults() {
    if (filteredReportData.length === 0) {
        reportResultsContainer.innerHTML = `
            <div class="empty-report">
                <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                <h3>Nenhum resultado encontrado</h3>
                <p>Nenhum colaborador foi encontrado com os filtros e datas especificados.</p>
            </div>
        `;
        return;
    }
    
    reportResultsContainer.innerHTML = '';
    
    filteredReportData.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'report-employee-card';
        
        const header = document.createElement('div');
        header.className = 'report-employee-header';
        header.innerHTML = `
            <span class="report-employee-name">
                <i class="fa-solid fa-user-tie"></i> ${emp.employeeName}
            </span>
            <span class="report-periods-badge">${emp.periodsCount} período${emp.periodsCount !== 1 ? 's' : ''}</span>
        `;
        card.appendChild(header);
        
        const table = document.createElement('table');
        table.className = 'report-periods-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Obra / Centro de Custo</th>
                    <th>Data Inicial</th>
                    <th>Data Final</th>
                    <th style="text-align: right;">Batidas de Ponto</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        emp.periods.forEach(p => {
            const tr = document.createElement('tr');
            const isUnmapped = !p.obraId;
            const obraNameClass = isUnmapped ? 'class="unmapped"' : '';
            const obraNameText = isUnmapped ? `<i class="fa-solid fa-circle-question"></i> ${p.obraName}` : `<i class="fa-solid fa-helmet-safety" style="color: var(--warning);"></i> <strong>${p.obraName}</strong>`;
            
            tr.innerHTML = `
                <td ${obraNameClass}>${obraNameText}</td>
                <td>${p.startDate}</td>
                <td>${p.endDate}</td>
                <td style="text-align: right;"><span class="badge-count">${p.punchesCount} batida${p.punchesCount !== 1 ? 's' : ''}</span></td>
            `;
            tbody.appendChild(tr);
        });
        
        card.appendChild(table);
        reportResultsContainer.appendChild(card);
    });
}

function filterReportResults(e) {
    const term = e.target.value.toLowerCase().trim();
    if (term === '') {
        filteredReportData = [...currentReportData];
    } else {
        filteredReportData = currentReportData.filter(emp => 
            emp.employeeName.toLowerCase().includes(term)
        );
    }
    renderReportResults();
}

function exportReportToCSV() {
    if (currentReportData.length === 0) {
        alert('Não há dados de relatório para exportar.');
        return;
    }
    
    // Iniciar com o BOM UTF-8 para garantir que acentos abram corretamente no Excel
    let csvContent = "\uFEFF";
    
    // Linha de cabeçalho
    csvContent += "ID Colaborador;Nome Colaborador;Obra / Centro de Custo;Data Início;Data Fim;Batidas de Ponto\n";
    
    currentReportData.forEach(emp => {
        emp.periods.forEach(p => {
            // Escapar aspas duplas se houver no nome da obra ou do colaborador
            const cleanEmpName = emp.employeeName.replace(/"/g, '""');
            const cleanObraName = p.obraName.replace(/"/g, '""');
            csvContent += `"${emp.employeeId}";"${cleanEmpName}";"${cleanObraName}";"${p.startDate}";"${p.endDate}";${p.punchesCount}\n`;
        });
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const start = reportStartDate.value.split('-').reverse().join('-');
    const end = reportEndDate.value.split('-').reverse().join('-');
    
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_alocacao_${start}_a_${end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderEmptyReport() {
    reportActions.classList.add('hidden');
    reportResultsContainer.innerHTML = `
        <div class="empty-report">
            <div class="empty-icon"><i class="fa-solid fa-file-invoice"></i></div>
            <h3>Gerador de Relatório de Obras</h3>
            <p>Selecione um período acima e clique em "Gerar Relatório" para auditar as alocações dos colaboradores.</p>
        </div>
    `;
}
