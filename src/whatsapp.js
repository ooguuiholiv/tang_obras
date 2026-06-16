const dotenv = require('dotenv');
dotenv.config();

const WA_API_URL = process.env.WA_API_URL;
const WA_API_TOKEN = process.env.WA_API_TOKEN;
const WA_API_TYPE = process.env.WA_API_TYPE || 'evolution';
const NOTIFICATION_PHONE = process.env.NOTIFICATION_PHONE;

/**
 * Sends a WhatsApp text message using the configured WhatsApp provider.
 * @param {string} text The message content to send
 * @returns {Promise<Object>} Status of the dispatch (success, response)
 */
async function sendWhatsAppAlert(text) {
    if (!WA_API_URL || !NOTIFICATION_PHONE) {
        console.log('--- WHATSAPP SIMULATION MODE (No URL or phone configured) ---');
        console.log(`To: ${NOTIFICATION_PHONE || 'No phone'}`);
        console.log(`Message:\n${text}`);
        console.log('------------------------------------------------------------');
        return { success: true, simulated: true };
    }

    console.log(`Sending WhatsApp alert to ${NOTIFICATION_PHONE} via ${WA_API_TYPE}...`);

    try {
        let headers = {
            'Content-Type': 'application/json'
        };
        let body = {};

        if (WA_API_TYPE.toLowerCase() === 'evolution') {
            headers['apikey'] = WA_API_TOKEN;
            body = {
                number: NOTIFICATION_PHONE,
                text: text
            };
        } else if (WA_API_TYPE.toLowerCase() === 'z-api') {
            headers['Client-Token'] = WA_API_TOKEN;
            headers['client-token'] = WA_API_TOKEN; // Z-API is case-insensitive, but double check
            body = {
                phone: NOTIFICATION_PHONE,
                message: text
            };
        } else {
            throw new Error(`Unsupported WhatsApp provider type: ${WA_API_TYPE}`);
        }

        const response = await fetch(WA_API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        const status = response.status;
        const responseText = await response.text();

        console.log(`WhatsApp API response status: ${status}`);

        if (response.ok) {
            console.log('WhatsApp alert sent successfully.');
            let data = {};
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                data = { rawResponse: responseText };
            }
            return { success: true, status, data };
        } else {
            console.error(`Failed to send WhatsApp message. API Response: ${responseText}`);
            return { success: false, status, error: responseText };
        }
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWhatsAppAlert
};
