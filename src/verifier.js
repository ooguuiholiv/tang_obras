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

    // Check distance discrepancies for employees who clocked in today
    for (const employeeId in employeesToday) {
        checkedEmployees.add(employeeId);
        const todayEvents = employeesToday[employeeId];
        const yesterdayEvents = employeesYesterday[employeeId];

        // Skip if there are no punches from yesterday to compare against
        if (!yesterdayEvents || yesterdayEvents.length === 0) {
            continue;
        }

        const employeeName = todayEvents[0].employeeName;

        for (const tEvent of todayEvents) {
            let minDistance = Infinity;
            let closestYesterdayEvent = null;

            // Calculate distance to all yesterday's locations and find the closest one
            for (const yEvent of yesterdayEvents) {
                const dist = getDistance(
                    tEvent.latitude,
                    tEvent.longitude,
                    yEvent.latitude,
                    yEvent.longitude
                );

                if (dist < minDistance) {
                    minDistance = dist;
                    closestYesterdayEvent = yEvent;
                }
            }

            // If the closest location from yesterday is further than the limit, trigger alert
            if (minDistance > DISTANCE_LIMIT_KM) {
                // Formulate maps URL
                const todayMapUrl = `https://www.google.com/maps?q=${tEvent.latitude},${tEvent.longitude}`;
                const yesterdayMapUrl = `https://www.google.com/maps?q=${closestYesterdayEvent.latitude},${closestYesterdayEvent.longitude}`;

                // Check if this alert is already added (e.g. avoid duplicate alerts for the same employee clocking in twice in the same distant place)
                const isDuplicate = alerts.some(a => 
                    a.employeeId === employeeId && 
                    getDistance(a.todayPunch.latitude, a.todayPunch.longitude, tEvent.latitude, tEvent.longitude) < 1.0
                );

                if (!isDuplicate) {
                    alerts.push({
                        employeeId,
                        employeeName,
                        distance: parseFloat(minDistance.toFixed(2)),
                        todayPunch: {
                            punchId: tEvent.punchId,
                            type: tEvent.type,
                            timestamp: tEvent.timestamp,
                            latitude: tEvent.latitude,
                            longitude: tEvent.longitude,
                            address: tEvent.address,
                            workPlaceName: tEvent.workPlaceName,
                            mapUrl: todayMapUrl
                        },
                        yesterdayPunch: {
                            punchId: closestYesterdayEvent.punchId,
                            type: closestYesterdayEvent.type,
                            timestamp: closestYesterdayEvent.timestamp,
                            latitude: closestYesterdayEvent.latitude,
                            longitude: closestYesterdayEvent.longitude,
                            address: closestYesterdayEvent.address,
                            workPlaceName: closestYesterdayEvent.workPlaceName,
                            mapUrl: yesterdayMapUrl
                        },
                        whatsappSent: false,
                        whatsappError: null
                    });
                }
            }
        }
    }

    console.log(`Verification complete. Found ${alerts.length} location discrepancies.`);

    // Send WhatsApp notifications for each alert (only if sendAlerts is true and enabled via env)
    const enableWhatsApp = process.env.SEND_WHATSAPP_ALERTS === 'true';
    if (sendAlerts && enableWhatsApp) {
        for (const alert of alerts) {
        const timeToday = new Date(alert.todayPunch.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateTodayFormatted = new Date(alert.todayPunch.timestamp).toLocaleDateString('pt-BR');
        const timeYesterday = new Date(alert.yesterdayPunch.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateYesterdayFormatted = new Date(alert.yesterdayPunch.timestamp).toLocaleDateString('pt-BR');

        const obraHoje = alert.todayPunch.workPlaceName || 'Obra não cadastrada no Ponto';
        const obraOntem = alert.yesterdayPunch.workPlaceName || 'Obra não cadastrada no Ponto';

        // Format Portuguese notification message
        const messageText = 
`⚠️ *ALERTA: Mudança de Obra/Localização*
👤 *Funcionário:* ${alert.employeeName}
📍 *Distância:* ${alert.distance} km

*REGISTRO DE HOJE (${dateTodayFormatted}):*
• Horário: ${timeToday} (${alert.todayPunch.type})
• Obra: ${obraHoje}
• Endereço: ${alert.todayPunch.address}
• GPS: ${alert.todayPunch.mapUrl}

*REGISTRO DE ONTEM (${dateYesterdayFormatted}):*
• Horário: ${timeYesterday} (${alert.yesterdayPunch.type})
• Obra: ${obraOntem}
• Endereço: ${alert.yesterdayPunch.address}
• GPS: ${alert.yesterdayPunch.mapUrl}

_Verifique se a alocação de centro de custo do funcionário está correta._`;

        const waResult = await sendWhatsAppAlert(messageText);
        if (waResult.success) {
            alert.whatsappSent = true;
        } else {
            alert.whatsappError = waResult.error || 'Unknown error';
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
