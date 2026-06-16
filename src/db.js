const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err);
    } else {
        console.log('Successfully connected to SQLite database at:', dbPath);
    }
});

// Run DB setup
db.serialize(() => {
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Create Obras table
    db.run(`
        CREATE TABLE IF NOT EXISTS obras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            address TEXT,
            radius_km REAL DEFAULT 1.0
        )
    `);

    // Create Allocations table
    db.run(`
        CREATE TABLE IF NOT EXISTS allocations (
            employee_id TEXT PRIMARY KEY,
            employee_name TEXT NOT NULL,
            obra_id INTEGER,
            FOREIGN KEY(obra_id) REFERENCES obras(id) ON DELETE CASCADE
        )
    `);
});

// Helper wrapper to run queries returning Promises
const dbRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

const dbAll = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbGet = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// Database APIs
const getObras = () => {
    return dbAll('SELECT * FROM obras ORDER BY name ASC');
};

const getObraById = (id) => {
    return dbGet('SELECT * FROM obras WHERE id = ?', [id]);
};

const createObra = ({ name, latitude, longitude, address, radius_km }) => {
    const r = radius_km !== undefined ? parseFloat(radius_km) : 1.0;
    return dbRun(
        'INSERT INTO obras (name, latitude, longitude, address, radius_km) VALUES (?, ?, ?, ?, ?)',
        [name, parseFloat(latitude), parseFloat(longitude), address || '', r]
    );
};

const updateObra = (id, { name, latitude, longitude, address, radius_km }) => {
    const r = radius_km !== undefined ? parseFloat(radius_km) : 1.0;
    return dbRun(
        'UPDATE obras SET name = ?, latitude = ?, longitude = ?, address = ?, radius_km = ? WHERE id = ?',
        [name, parseFloat(latitude), parseFloat(longitude), address || '', r, id]
    );
};

const deleteObra = (id) => {
    return dbRun('DELETE FROM obras WHERE id = ?', [id]);
};

const getAllocations = () => {
    return dbAll(`
        SELECT a.employee_id, a.employee_name, a.obra_id, o.name as obra_name 
        FROM allocations a
        LEFT JOIN obras o ON a.obra_id = o.id
        ORDER BY a.employee_name ASC
    `);
};

const getAllocationForEmployee = (employeeId) => {
    return dbGet('SELECT * FROM allocations WHERE employee_id = ?', [employeeId]);
};

const setAllocation = async ({ employee_id, employee_name, obra_id }) => {
    if (obra_id === null || obra_id === '' || obra_id === undefined) {
        return dbRun('DELETE FROM allocations WHERE employee_id = ?', [employee_id]);
    }
    
    // Insert or replace (since employee_id is PRIMARY KEY)
    return dbRun(
        'INSERT OR REPLACE INTO allocations (employee_id, employee_name, obra_id) VALUES (?, ?, ?)',
        [employee_id, employee_name, parseInt(obra_id)]
    );
};

const deleteAllocation = (employee_id) => {
    return dbRun('DELETE FROM allocations WHERE employee_id = ?', [employee_id]);
};

module.exports = {
    getObras,
    getObraById,
    createObra,
    updateObra,
    deleteObra,
    getAllocations,
    getAllocationForEmployee,
    setAllocation,
    deleteAllocation
};
