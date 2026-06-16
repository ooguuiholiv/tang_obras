async function fetchAppJs() {
    const url = 'https://users.francosys.com.br/app.js';
    try {
        const response = await fetch(url);
        const text = await response.text();
        const fs = require('fs');
        fs.writeFileSync('auth_app.js', text);
        console.log("Saved auth_app.js successfully!");
        
        // Let's print some parts of the code containing "fetch" or "login" or "api"
        const lines = text.split('\n');
        console.log("=== SCANNING FOR INTERESTING CODE ===");
        lines.forEach((line, index) => {
            if (line.includes('fetch') || line.includes('login') || line.includes('api') || line.includes('email') || line.includes('senha')) {
                console.log(`Line ${index + 1}: ${line.trim().slice(0, 150)}`);
            }
        });
    } catch (e) {
        console.error(e);
    }
}

fetchAppJs();
