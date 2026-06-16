async function testGet() {
    const url = 'https://users.francosys.com.br/';
    console.log(`Sending GET to ${url}`);

    try {
        const response = await fetch(url);
        console.log(`Status: ${response.status} ${response.statusText}`);
        const responseText = await response.text();
        console.log(`Response text: ${responseText.slice(0, 500)}`);
    } catch (e) {
        console.error('Error connecting to auth API:', e);
    }
}

testGet();
