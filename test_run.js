const { runVerification } = require('./src/verifier');
const tangerino = require('./src/tangerino');
const fs = require('fs');

async function testRun() {
    console.log("=========================================");
    console.log("STARTING TEST RUN FOR VERIFICATION SYSTEM");
    console.log("=========================================");

    const originalFetchAllPunches = tangerino.fetchAllPunches;

    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log(`[Test Run] todayStr in test_run: ${todayStr}`);
    console.log(`[Test Run] yesterdayStr in test_run: ${yesterdayStr}`);

    tangerino.fetchAllPunches = async function(start, end) {
        console.log("[Test Mock] Intercepted fetchAllPunches request.");
        let realPunches = [];
        try {
            realPunches = await originalFetchAllPunches(start, end);
        } catch (e) {
            console.log("[Test Mock] Real fetch failed:", e.message);
        }

        console.log(`[Test Mock] Real punches fetched: ${realPunches.length}. Injecting mock test punch records...`);

        const mockPunches = [
            {
                id: 999999001,
                date: yesterdayStr,
                dateIn: yesterday.getTime() - (4 * 60 * 60 * 1000),
                dateInFull: yesterday.getTime() - (4 * 60 * 60 * 1000),
                employeeId: 8888888,
                employeeName: "FUNCIONÁRIO TESTE DESVIO",
                locationIn: {
                    id: 888888801,
                    latitude: -19.921898,
                    longitude: -43.936493,
                    address: "Praça da Liberdade, Funcionários - Belo Horizonte, Minas Gerais"
                }
            },
            {
                id: 999999002,
                date: todayStr,
                dateIn: Date.now() - (2 * 60 * 60 * 1000),
                dateInFull: Date.now() - (2 * 60 * 60 * 1000),
                employeeId: 8888888,
                employeeName: "FUNCIONÁRIO TESTE DESVIO",
                locationIn: {
                    id: 888888802,
                    latitude: -20.144444,
                    longitude: -44.890278,
                    address: "Avenida Jove Soares, Centro - Divinópolis, Minas Gerais",
                    workPlace: {
                        name: "Obra Edifício Central"
                    }
                },
                workPlace: {
                    name: "Obra Edifício Central"
                }
            }
        ];

        return realPunches.concat(mockPunches);
    };

    try {
        const result = await runVerification();
        
        console.log("=========================================");
        console.log("VERIFICATION TEST COMPLETED STATUS:", result.success ? "SUCCESS" : "FAILED");
        console.log("=========================================");
        
        if (result.success) {
            console.log(`Employees Checked: ${result.data.employeesCheckedCount}`);
            console.log(`Alerts Triggered: ${result.data.alertsCount}`);
            
            const testAlert = result.data.alerts.find(a => a.employeeId === '8888888');
            if (testAlert) {
                console.log(`TEST PASSED: Triggered alert for employee "${testAlert.employeeName}"`);
                console.log(`Calculated Distance: ${testAlert.distance} km`);
            } else {
                console.log("TEST FAILED: No alert was triggered for mock employee 8888888.");
                console.log("All alert employee IDs in result:", result.data.alerts.map(a => a.employeeId));
            }
        }
    } catch (e) {
        console.error("Test run crashed with error:", e);
    } finally {
        tangerino.fetchAllPunches = originalFetchAllPunches;
    }
}

testRun();
