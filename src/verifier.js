const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const tangerino = require('./tangerino');
const { getDistance } = require('./distance');
const { sendWhatsAppAlert } = require('./whatsapp');
const db = require('./db');

const DISTANCE_LIMIT_KM = parseFloat(process.env.DISTANCE_LIMIT_KM || '50');
const HISTORY_FILE_PATH = path.join(__dirname, '../checks_history.json');

/**
 * Renders a date to a string formatted as YYYY-MM-DD in local time
 * @param {Date} date The date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
function formatDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Runs the check comparing yesterday's and today's clock-ins.
 * @returns {Promise<Object>} Verification summary results
 */
async function runVerification(sendAlerts = true) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const todayStr = formatDateString(today);
    const yesterdayStr = formatDateString(yesterday);

    console.log(`Running verification for Yesterday (${yesterdayStr}) and Today (${todayStr})...`);

    // Define time window for both days
    const rangeStart = new Date(yesterday);
    rangeStart.setHours(0, 0, 0, 0);
    
    const rangeEnd = new Date(today);
    rangeEnd.setHours(23, 59, 59, 999);

    let rawPunches;
    try {
        rawPunches = await tangerino.fetchAllPunches(rangeStart, rangeEnd);
    } catch (error) {
        console.error('Failed to retrieve punches from Tangerino:', error);
        return {
            success: false,
            error: `Tangerino fetch failed: ${error.message}`,
            timestamp: new Date().toISOString()
        };
    }

    // Fetch all allocations and Obras from SQLite
    let allocationsList = [];
    let obrasList = [];
    try {
        allocationsList = await db.getAllocations();
        obrasList = await db.getObras();
    } catch (e) {
        console.error('Error loading database for geofence check:', e);
    }

    const allocationsMap = {};
    allocationsList.forEach(a => {
        allocationsMap[a.employee_id] = a;
    });

    const obrasMap = {};
    obrasList.forEach(o => {
        obrasMap[o.id] = o;
    });

    const parsedPunches = tangerino.parsePunches(rawPunches);
    
    // Enrich punches with geofence information
    parsedPunches.forEach(p => {
        const allocation = allocationsMap[p.employeeId];
        if (allocation) {
            const obra = obrasMap[allocation.obra_id];
            if (obra) {
                const distToObra = getDistance(
                    p.latitude,
                    p.longitude,
                    obra.latitude,
                    obra.longitude
                );
                p.allocatedObraId = obra.id;
                p.allocatedObraName = obra.name;
                p.allocatedObraDistance = parseFloat(distToObra.toFixed(2));
                p.allocatedObraRadius = obra.radius_km;
                p.geofenceStatus = distToObra <= obra.radius_km ? 'inside' : 'outside';
            } else {
                p.geofenceStatus = 'none';
            }
        } else {
            p.geofenceStatus = 'none';
        }
    });

    console.log(`Parsed ${parsedPunches.length} valid coordinate punch events.`);

    // Split punches into yesterday and today
    const yesterdayPunches = parsedPunches.filter(p => p.date === yesterdayStr);
    const todayPunches = parsedPunches.filter(p => p.date === todayStr);

    console.log(`Punches yesterday: ${yesterdayPunches.length}, today: ${todayPunches.length}`);

    // Group punches by employeeId
    const employeesYesterday = {};
    for (const p of yesterdayPunches) {
        if (!employeesYesterday[p.employeeId]) {
            employeesYesterday[p.employeeId] = [];
        }
        employeesYesterday[p.employeeId].push(p);
    }

    const employeesToday = {};
    for (const p of todayPunches) {
        if (!employeesToday[p.employeeId]) {
            employeesToday[p.employeeId] = [];
        }
        employeesToday[p.employeeId].push(p);
    }

    const alerts = [];
    const checkedEmployees = new Set();

    // Check distance discrepancies or missing allocations for employees who clocked in today
    for (const employeeId in employeesToday) {
        checkedEmployees.add(employeeId);
        const todayEvents = employeesToday[employeeId];
        const employeeName = todayEvents[0].employeeName;

        const allocation = allocationsMap[employeeId];

        if (!allocation || !allocation.obra_id) {
            // Colaborador sem alocação
            alerts.push({
                employeeId,
                employeeName,
                type: 'no_allocation',
                distance: 0,
                obraAlocada: null,
                pontoBatido: {
                    punchId: todayEvents[0].punchId,
                    type: todayEvents[0].type,
                    timestamp: todayEvents[0].timestamp,
                    date: todayEvents[0].date,
                    latitude: todayEvents[0].latitude,
                    longitude: todayEvents[0].longitude,
                    address: todayEvents[0].address,
                    workPlaceName: todayEvents[0].workPlaceName,
                    mapUrl: `https://www.google.com/maps?q=${todayEvents[0].latitude},${todayEvents[0].longitude}`
                },
                whatsappSent: false,
                whatsappError: null
            });
            continue;
        }

        const obra = obrasMap[allocation.obra_id];
        if (!obra) {
            // Caso a obra vinculada na alocação não exista mais
            alerts.push({
                employeeId,
                employeeName,
                type: 'no_allocation',
                distance: 0,
                obraAlocada: null,
                pontoBatido: {
                    punchId: todayEvents[0].punchId,
                    type: todayEvents[0].type,
                    timestamp: todayEvents[0].timestamp,
                    date: todayEvents[0].date,
                    latitude: todayEvents[0].latitude,
                    longitude: todayEvents[0].longitude,
                    address: todayEvents[0].address,
                    workPlaceName: todayEvents[0].workPlaceName,
                    mapUrl: `https://www.google.com/maps?q=${todayEvents[0].latitude},${todayEvents[0].longitude}`
                },
                whatsappSent: false,
                whatsappError: null
            });
            continue;
        }

        // Se está alocado e a obra existe, verificar a distância de cada batida de hoje
        for (const tEvent of todayEvents) {
            const dist = getDistance(
                tEvent.latitude,
                tEvent.longitude,
                obra.latitude,
                obra.longitude
            );

            // Alerta se a distância for maior que a configurada (ex: 50km)
            if (dist > DISTANCE_LIMIT_KM) {
                const punchMapUrl = `https://www.google.com/maps?q=${tEvent.latitude},${tEvent.longitude}`;

                // Evitar alertas duplicados de desvio para o mesmo colaborador a menos de 1km da mesma batida
                const isDuplicate = alerts.some(a => 
                    a.employeeId === employeeId && 
                    a.type === 'discrepancy' &&
                    getDistance(a.pontoBatido.latitude, a.pontoBatido.longitude, tEvent.latitude, tEvent.longitude) < 1.0
                );

                if (!isDuplicate) {
                    alerts.push({
                        employeeId,
                        employeeName,
                        type: 'discrepancy',
                        distance: parseFloat(dist.toFixed(2)),
                        obraAlocada: {
                            id: obra.id,
                            name: obra.name,
                            address: obra.address,
                            latitude: obra.latitude,
                            longitude: obra.longitude,
                            radius_km: obra.radius_km
                        },
                        pontoBatido: {
                            punchId: tEvent.punchId,
                            type: tEvent.type,
                            timestamp: tEvent.timestamp,
                            date: tEvent.date,
                            latitude: tEvent.latitude,
                            longitude: tEvent.longitude,
                            address: tEvent.address,
                            workPlaceName: tEvent.workPlaceName,
                            mapUrl: punchMapUrl
                        },
                        whatsappSent: false,
                        whatsappError: null
                    });
                }
            }
        }
    }

    console.log(`Verification complete. Found ${alerts.length} location discrepancies or allocation issues.`);

    // Send WhatsApp notifications for each alert (only if sendAlerts is true and enabled via env)
    const enableWhatsApp = process.env.SEND_WHATSAPP_ALERTS === 'true';
    if (sendAlerts && enableWhatsApp) {
        for (const alert of alerts) {
            let messageText = '';
            
            if (alert.type === 'discrepancy') {
                const timeToday = new Date(alert.pontoBatido.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const dateTodayFormatted = new Date(alert.pontoBatido.timestamp).toLocaleDateString('pt-BR');
                const obraHoje = alert.pontoBatido.workPlaceName || 'Obra não cadastrada no Ponto';

                messageText = 
`⚠️ *ALERTA: Desvio de Obra Alocada*
👤 *Funcionário:* ${alert.employeeName}
📍 *Distância:* ${alert.distance} km da obra alocada

*DADOS DA OBRA ALOCADA:*
• Obra: ${alert.obraAlocada.name}
• Endereço: ${alert.obraAlocada.address || 'Sem Endereço'}

*DADOS DA BATIDA REAL DE HOJE (${dateTodayFormatted}):*
• Horário: ${timeToday} (${alert.pontoBatido.type})
• Ponto batido em: ${obraHoje}
• Endereço: ${alert.pontoBatido.address}
• GPS: ${alert.pontoBatido.mapUrl}

_Verifique se a alocação de centro de custo do funcionário está correta._`;
            } else if (alert.type === 'no_allocation') {
                const timeToday = new Date(alert.pontoBatido.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const dateTodayFormatted = new Date(alert.pontoBatido.timestamp).toLocaleDateString('pt-BR');
                const obraHoje = alert.pontoBatido.workPlaceName || 'Obra não cadastrada no Ponto';

                messageText = 
`⚠️ *ALERTA: Colaborador Sem Alocação*
👤 *Funcionário:* ${alert.employeeName}
📍 *Status:* Bateu ponto mas não está alocado a nenhuma obra.

*DADOS DA BATIDA DE HOJE (${dateTodayFormatted}):*
• Horário: ${timeToday} (${alert.pontoBatido.type})
• Ponto batido em: ${obraHoje}
• Endereço: ${alert.pontoBatido.address}
• GPS: ${alert.pontoBatido.mapUrl}

_Por favor, acesse o painel TangObras e aloque este colaborador._`;
            }

            if (messageText) {
                const waResult = await sendWhatsAppAlert(messageText);
                if (waResult.success) {
                    alert.whatsappSent = true;
                } else {
                    alert.whatsappError = waResult.error || 'Unknown error';
                }
            }
        }
    }

    const checkResult = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        yesterdayDate: yesterdayStr,
        todayDate: todayStr,
        totalPunchesYesterday: yesterdayPunches.length,
        totalPunchesToday: todayPunches.length,
        employeesCheckedCount: checkedEmployees.size,
        alertsCount: alerts.length,
        alerts,
        allPunchesYesterday: yesterdayPunches,
        allPunchesToday: todayPunches
    };

    // Save check in history file
    try {
        let history = [];
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const fileData = fs.readFileSync(HISTORY_FILE_PATH, 'utf8');
            history = JSON.parse(fileData);
        }
        
        // Add to the beginning of the list, limit history to 50 runs to conserve disk space
        history.unshift(checkResult);
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        
        fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history, null, 2));
        console.log('Saved verification results to history.');
    } catch (e) {
        console.error('Failed to save checks history file:', e);
    }

    return {
        success: true,
        data: checkResult
    };
}

module.exports = {
    runVerification
};
