async function fetchFullPage() {
    const url = 'https://users.francosys.com.br/';
    try {
        const response = await fetch(url);
        const text = await response.text();
        
        console.log("=== SCRIPT TAGS ===");
        const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = scriptRegex.exec(text)) !== null) {
            console.log("TAG:", match[0].slice(0, 200) + (match[0].length > 200 ? "..." : ""));
            if (match[1].trim()) {
                console.log("CONTENT:", match[1].slice(0, 500) + (match[1].length > 500 ? "..." : ""));
            }
        }
        
        console.log("\n=== LINK STYLES ===");
        const linkRegex = /<link\b[^>]*>/gi;
        while ((match = linkRegex.exec(text)) !== null) {
            console.log(match[0]);
        }
        
        // Save full HTML for inspection
        const fs = require('fs');
        fs.writeFileSync('auth_page.html', text);
        console.log("\nSaved full HTML to auth_page.html");
    } catch (e) {
        console.error(e);
    }
}

fetchFullPage();
