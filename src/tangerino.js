const dotenv = require('dotenv');
dotenv.config();

const TANGERINO_AUTH = process.env.TANGERINO_AUTH;
const BASE_URL = 'https://apis.tangerino.com.br/punch';

/**
 * Fetches all punches for a specific date range, handling pagination automatically.
 * @param {Date} startDate Start date
 * @param {Date} endDate End date
 * @returns {Promise<Array>} List of all punches in the period
 */
async function fetchAllPunches(startDate, endDate) {
    if (!TANGERINO_AUTH) {
        throw new Error('TANGERINO_AUTH is not configured in environmental variables.');
    }

    const startMillis = startDate.getTime();
    const endMillis = endDate.getTime();
    
    const size = 500; // Large page size to minimize requests
    let page = 1;
    let allPunches = [];
    let totalPages = 1;

    console.log(`Starting fetch of punches from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    do {
        const url = `${BASE_URL}/?startDateInMillis=${startMillis}&endDateInMillis=${endMillis}&size=${size}&page=${page}`;
        console.log(`Fetching Tangerino page ${page}...`);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': TANGERINO_AUTH,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Tangerino API returned status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        if (data && data.content) {
            allPunches = allPunches.concat(data.content);
            totalPages = data.totalPages || 1;
            console.log(`Page ${page} fetched. Added ${data.content.length} records. Total so far: ${allPunches.length}`);
        } else {
            console.log(`Page ${page} returned no content.`);
            break;
        }

        page++;
    } while (page <= totalPages);

    console.log(`Fetch complete. Retrieved a total of ${allPunches.length} punch records.`);
    return allPunches;
}

/**
 * Parses raw punches and extracts clean coordinates for each employee.
 * @param {Array} rawPunches Raw punches fetched from the API
 * @returns {Array} List of parsed punch events with coordinates
 */
function parsePunches(rawPunches) {
    const parsed = [];

    for (const record of rawPunches) {
        const employeeId = record.employeeId || (record.employee && record.employee.id);
        const employeeName = record.employeeName || (record.employee && record.employee.name) || 'Unknown Employee';
        
        if (!employeeId) continue;

        // Process locationIn
        if (record.locationIn && typeof record.locationIn.latitude === 'number' && typeof record.locationIn.longitude === 'number') {
            parsed.push({
                punchId: record.id,
                employeeId,
                employeeName,
                date: record.date, // YYYY-MM-DD
                timestamp: record.dateIn || record.dateInFull || record.date,
                type: 'IN',
                latitude: record.locationIn.latitude,
                longitude: record.locationIn.longitude,
                address: record.locationIn.address || record.locationIn.formatAddress || 'No address details',
                workPlaceName: record.workPlace ? record.workPlace.name : null
            });
        }

        // Process locationOut
        if (record.locationOut && typeof record.locationOut.latitude === 'number' && typeof record.locationOut.longitude === 'number') {
            parsed.push({
                punchId: record.id,
                employeeId,
                employeeName,
                date: record.date, // YYYY-MM-DD
                timestamp: record.dateOut || record.dateOutFull || record.date,
                type: 'OUT',
                latitude: record.locationOut.latitude,
                longitude: record.locationOut.longitude,
                address: record.locationOut.address || record.locationOut.formatAddress || 'No address details',
                workPlaceName: record.workPlace ? record.workPlace.name : null
            });
        }
    }

    return parsed;
}

module.exports = {
    fetchAllPunches,
    parsePunches
};
