const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

const { runVerification } = require('./src/verifier');
const db = require('./src/db');
const tangerino = require('./src/tangerino');

const app = express();
const PORT = process.env.PORT || 3000;
const HISTORY_FILE_PATH = path.join(__dirname, 'checks_history.json');
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 21 * * *';
const JWT_SECRET = process.env.JWT_SECRET || 'tang_obras_super_secret_key_992288';

// Locking mechanism to prevent parallel manual/scheduled checks
let isChecking = false;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Authentication Route (No Token Required)
 * Proxies credentials to https://users.francosys.com.br/api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios.' });
    }

    try {
        console.log(`Forwarding authentication request for ${email} to users.francosys.com.br`);
        const externalResponse = await fetch('https://users.francosys.com.br/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const externalText = await externalResponse.text();
        let externalData = {};
        try {
            externalData = JSON.parse(externalText);
        } catch (e) {
            // Not JSON
        }

        if (!externalResponse.ok) {
            return res.status(externalResponse.status).json({
                success: false,
                message: externalData.message || 'Falha na autenticação da FrancoSys.'
            });
        }

        // Generate local session token
        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({
            success: true,
            token,
            email
        });
    } catch (error) {
        console.error('Error proxying auth to FrancoSys:', error);
        res.status(500).json({ success: false, message: 'Erro ao conectar à API de autenticação externa.' });
    }
});

/**
 * JWT Authentication Middleware
 * Protects all routes declared below it
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ success: false, message: 'Sessão expirada ou inválida.' });
        }
        req.user = user;
        next();
    });
};

// Apply JWT check middleware to all /api routes below this line
app.use('/api', authenticateToken);

/**
 * Endpoint to retrieve server configurations and current status
 */
app.get('/api/status', (req, res) => {
    // Hide secret parts of tokens for safety
    const formatToken = (t) => {
        if (!t) return 'Not Configured';
        if (t.length <= 15) return '***';
        return `${t.slice(0, 10)}...${t.slice(-5)}`;
    };

    res.json({
        success: true,
        status: isChecking ? 'running_check' : 'idle',
        port: PORT,
        config: {
            whatsappType: process.env.WA_API_TYPE || 'evolution',
            whatsappUrl: process.env.WA_API_URL || 'Not Configured',
            whatsappToken: formatToken(process.env.WA_API_TOKEN),
            tangerinoAuth: formatToken(process.env.TANGERINO_AUTH),
            notificationPhone: process.env.NOTIFICATION_PHONE || 'Not Configured',
            distanceLimitKm: parseFloat(process.env.DISTANCE_LIMIT_KM || '50'),
            cronSchedule: CRON_SCHEDULE
        }
    });
});

/**
 * Endpoint to fetch past check runs history
 */
app.get('/api/history', (req, res) => {
    try {
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf8');
            const history = JSON.parse(data);
            return res.json({ success: true, history });
        }
        return res.json({ success: true, history: [] });
    } catch (error) {
        console.error('Error loading history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Endpoint to manually trigger the location check verification and send alerts (with WhatsApp)
 */
app.post('/api/verify', async (req, res) => {
    if (isChecking) {
        return res.status(429).json({
            success: false,
            message: 'A verification check is already in progress. Please wait.'
        });
    }

    isChecking = true;
    try {
        console.log('Manual verification triggered via API.');
        const result = await runVerification(true); // sendAlerts = true
        isChecking = false;
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        isChecking = false;
        console.error('Error in manual verification endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint to retrieve real-time Tangerino data for the dashboard (without WhatsApp notifications)
 */
app.get('/api/realtime-data', async (req, res) => {
    if (isChecking) {
        return res.status(429).json({
            success: false,
            message: 'A data fetch is already in progress. Please wait.'
        });
    }

    isChecking = true;
    try {
        console.log('Real-time data fetch triggered via API.');
        const result = await runVerification(false); // sendAlerts = false
        isChecking = false;
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        isChecking = false;
        console.error('Error in real-time data endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Obras CRUD Routes
 */
app.get('/api/obras', async (req, res) => {
    try {
        const obras = await db.getObras();
        res.json({ success: true, obras });
    } catch (error) {
        console.error('Error listing Obras:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obras', async (req, res) => {
    try {
        const { name, latitude, longitude, address, radius_km, contract_id } = req.body;
        if (!name || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, message: 'Nome, latitude e longitude são obrigatórios.' });
        }
        const result = await db.createObra({ name, latitude, longitude, address, radius_km, contract_id });
        res.json({ success: true, id: result.lastID, message: 'Obra criada com sucesso.' });
    } catch (error) {
        console.error('Error creating Obra:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/obras/:id', async (req, res) => {
    try {
        const { name, latitude, longitude, address, radius_km, contract_id } = req.body;
        if (!name || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, message: 'Nome, latitude e longitude são obrigatórios.' });
        }
        await db.updateObra(req.params.id, { name, latitude, longitude, address, radius_km, contract_id });
        res.json({ success: true, message: 'Obra atualizada com sucesso.' });
    } catch (error) {
        console.error('Error updating Obra:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/obras/:id', async (req, res) => {
    try {
        // Validação de Integridade: Impedir exclusão se houver colaboradores alocados
        const linkedAllocations = await db.getAllocationsByObraId(req.params.id);
        if (linkedAllocations && linkedAllocations.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Não é permitido excluir uma obra com colaboradores alocados. Desaloque-os primeiro.' 
            });
        }
        await db.deleteObra(req.params.id);
        res.json({ success: true, message: 'Obra removida com sucesso.' });
    } catch (error) {
        console.error('Error deleting Obra:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Contracts CRUD Routes
 */
app.get('/api/contracts', async (req, res) => {
    try {
        const contracts = await db.getContracts();
        res.json({ success: true, contracts });
    } catch (error) {
        console.error('Error listing Contracts:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/contracts', async (req, res) => {
    try {
        const { name, description, number_contract, serie } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Nome do contrato é obrigatório.' });
        }
        const result = await db.createContract({ name, description, number_contract, serie });
        res.json({ success: true, id: result.id, message: 'Contrato criado com sucesso.' });
    } catch (error) {
        console.error('Error creating Contract:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/contracts/:id', async (req, res) => {
    try {
        const { name, description, number_contract, serie } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Nome do contrato é obrigatório.' });
        }
        await db.updateContract(req.params.id, { name, description, number_contract, serie });
        res.json({ success: true, message: 'Contrato atualizado com sucesso.' });
    } catch (error) {
        console.error('Error updating Contract:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/contracts/:id', async (req, res) => {
    try {
        // Validação de Integridade: Impedir exclusão se houver obras vinculadas
        const linkedObras = await db.getObrasByContractId(req.params.id);
        if (linkedObras && linkedObras.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Não é permitido excluir um contrato com obras vinculadas. Remova as obras primeiro.' 
            });
        }
        await db.deleteContract(req.params.id);
        res.json({ success: true, message: 'Contrato removido com sucesso.' });
    } catch (error) {
        console.error('Error deleting Contract:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Employee Allocations Routes
 */
app.get('/api/allocations', async (req, res) => {
    try {
        const allocations = await db.getAllocations();
        res.json({ success: true, allocations });
    } catch (error) {
        console.error('Error listing Allocations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/allocations', async (req, res) => {
    try {
        const { employee_id, employee_name, obra_id } = req.body;
        if (!employee_id || !employee_name) {
            return res.status(400).json({ success: false, message: 'ID e Nome do colaborador são obrigatórios.' });
        }
        await db.setAllocation({ employee_id, employee_name, obra_id });
        res.json({ success: true, message: 'Alocação configurada com sucesso.' });
    } catch (error) {
        console.error('Error configuring Allocation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Rota de Relatório de Histórico de Obras por Período
 */
app.get('/api/report', async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ success: false, message: 'Parâmetros start e end são obrigatórios.' });
    }

    try {
        console.log(`Gerando relatório de obras de ${start} até ${end}...`);
        
        // 1. Converter strings de data para objetos Date
        const startDate = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T23:59:59');

        // 2. Buscar batidas do Tangerino para o período
        const rawPunches = await tangerino.fetchAllPunches(startDate, endDate);
        const parsedPunches = tangerino.parsePunches(rawPunches);
        
        // 3. Buscar obras registradas
        const obrasList = await db.getObras();

        const { getDistance } = require('./src/distance');

        // 4. Mapear cada batida de ponto para uma obra com base nas coordenadas GPS
        const mappedPunches = parsedPunches.map(punch => {
            let matchedObra = null;
            let minDistance = Infinity;

            for (const obra of obrasList) {
                const dist = getDistance(
                    punch.latitude,
                    punch.longitude,
                    obra.latitude,
                    obra.longitude
                );

                if (dist <= obra.radius_km && dist < minDistance) {
                    minDistance = dist;
                    matchedObra = obra;
                }
            }

            return {
                ...punch,
                obraId: matchedObra ? matchedObra.id : null,
                obraName: matchedObra ? matchedObra.name : 'Outros Locais (Não Mapeado)'
            };
        });

        // 5. Agrupar batidas por funcionário e ordenar cronologicamente
        const employeePunches = {};
        mappedPunches.forEach(punch => {
            if (!employeePunches[punch.employeeId]) {
                employeePunches[punch.employeeId] = [];
            }
            employeePunches[punch.employeeId].push(punch);
        });

        const reportData = [];

        for (const empId in employeePunches) {
            const punches = employeePunches[empId];
            
            // Ordenar por data/hora crescente
            punches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const empName = punches[0].employeeName;
            const periods = [];

            let currentPeriod = null;

            punches.forEach(punch => {
                const dateStr = punch.date; // AAAA-MM-DD
                const formattedDate = dateStr.split('-').reverse().join('/'); // DD/MM/AAAA

                if (!currentPeriod) {
                    // Inicializar primeiro período
                    currentPeriod = {
                        obraId: punch.obraId,
                        obraName: punch.obraName,
                        startDate: formattedDate,
                        endDate: formattedDate,
                        startDateRaw: dateStr,
                        endDateRaw: dateStr,
                        punchesCount: 1
                    };
                } else if (currentPeriod.obraId === punch.obraId) {
                    // O mesmo local de trabalho: estende a data final e soma batida
                    currentPeriod.endDate = formattedDate;
                    currentPeriod.endDateRaw = dateStr;
                    currentPeriod.punchesCount++;
                } else {
                    // Mudou de obra: fecha período atual e inicia novo
                    periods.push(currentPeriod);
                    currentPeriod = {
                        obraId: punch.obraId,
                        obraName: punch.obraName,
                        startDate: formattedDate,
                        endDate: formattedDate,
                        startDateRaw: dateStr,
                        endDateRaw: dateStr,
                        punchesCount: 1
                    };
                }
            });

            if (currentPeriod) {
                periods.push(currentPeriod);
            }

            reportData.push({
                employeeId: empId,
                employeeName: empName,
                periodsCount: periods.length,
                periods
            });
        }

        // Ordenar funcionários por nome
        reportData.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

        res.json({
            success: true,
            start,
            end,
            totalEmployees: reportData.length,
            report: reportData
        });

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Rota para consultar o trajeto de um funcionário específico nos últimos N dias (padrão 45 dias)
 */
app.get('/api/employees/:employeeId/trajectory', async (req, res) => {
    const { employeeId } = req.params;
    const days = parseInt(req.query.days || '45');
    
    try {
        console.log(`Buscando trajeto do funcionário ${employeeId} nos últimos ${days} dias...`);
        
        // Calcular intervalo de datas
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        
        // Ajustar horas
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        // Buscar batidas no Tangerino para o período filtrando por employeeId
        const rawPunches = await tangerino.fetchAllPunches(startDate, endDate, employeeId);
        let parsedPunches = tangerino.parsePunches(rawPunches);
        
        // Caso a API do Tangerino não filtre, filtramos aqui no backend para garantir
        parsedPunches = parsedPunches.filter(p => String(p.employeeId) === String(employeeId));
        
        // Ordenar cronologicamente (da mais antiga para a mais recente)
        parsedPunches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Buscar a alocação atual do colaborador no banco SQLite
        const allocation = await db.getAllocationForEmployee(employeeId);
        
        let obraAlocada = null;
        if (allocation && allocation.obra_id) {
            obraAlocada = await db.getObraById(allocation.obra_id);
        }
        
        const { getDistance } = require('./src/distance');
        
        const enrichedPunches = parsedPunches.map(p => {
            let distance = null;
            let geofenceStatus = 'none';
            
            if (obraAlocada) {
                distance = getDistance(
                    p.latitude,
                    p.longitude,
                    obraAlocada.latitude,
                    obraAlocada.longitude
                );
                distance = parseFloat(distance.toFixed(2));
                geofenceStatus = distance <= obraAlocada.radius_km ? 'inside' : 'outside';
            }
            
            return {
                ...p,
                allocatedObraId: obraAlocada ? obraAlocada.id : null,
                allocatedObraName: obraAlocada ? obraAlocada.name : null,
                allocatedObraDistance: distance,
                allocatedObraRadius: obraAlocada ? obraAlocada.radius_km : null,
                geofenceStatus
            };
        });
        
        res.json({
            success: true,
            employeeId,
            employeeName: enrichedPunches.length > 0 ? enrichedPunches[0].employeeName : '',
            obraAlocada,
            punches: enrichedPunches
        });
        
    } catch (error) {
        console.error('Erro ao buscar trajeto do funcionário:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// Setup scheduled daily background checks using node-cron
if (cron.validate(CRON_SCHEDULE)) {
    console.log(`Setting up cron schedule: "${CRON_SCHEDULE}"`);
    cron.schedule(CRON_SCHEDULE, async () => {
        console.log(`[Cron Job] Executing scheduled location check at ${new Date().toISOString()}`);
        if (isChecking) {
            console.log('[Cron Job] Check skipped: another check is already in progress.');
            return;
        }

        isChecking = true;
        try {
            await runVerification();
        } catch (e) {
            console.error('[Cron Job] Error running scheduled verification:', e);
        } finally {
            isChecking = false;
        }
    });
} else {
    console.error(`Invalid cron schedule: "${CRON_SCHEDULE}". Scheduled checks will not run.`);
}

// Start Express server
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`Tangerino Obra Alert Server running on port ${PORT}`);
    console.log(`Local URL: http://localhost:${PORT}`);
    console.log(`===================================================`);
});
