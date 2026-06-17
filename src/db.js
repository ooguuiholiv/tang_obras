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

    // Create Contracts table
    db.run(`
        CREATE TABLE IF NOT EXISTS contracts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            number_contract TEXT,
            serie TEXT
        )
    `);

    // Create Obras table
    db.run(`
        CREATE TABLE IF NOT EXISTS obras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            address TEXT,
            radius_km REAL DEFAULT 1.0,
            contract_id TEXT,
            FOREIGN KEY(contract_id) REFERENCES contracts(id) ON DELETE SET NULL
        )
    `);

    // Migração: Adicionar coluna contract_id caso a tabela de obras já existisse sem ela
    db.run(`
        ALTER TABLE obras ADD COLUMN contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL
    `, (err) => {
        if (err) {
            // Ignora se o erro for de coluna duplicada
            if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
                console.log('Nota da migração do SQLite (adicionar contract_id):', err.message);
            }
        } else {
            console.log('Coluna contract_id adicionada com sucesso à tabela obras.');
        }
    });

    // Create Allocations table
    db.run(`
        CREATE TABLE IF NOT EXISTS allocations (
            employee_id TEXT PRIMARY KEY,
            employee_name TEXT NOT NULL,
            obra_id INTEGER,
            FOREIGN KEY(obra_id) REFERENCES obras(id)
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
const getContracts = () => {
    return dbAll('SELECT * FROM contracts ORDER BY name ASC');
};

const getContractById = (id) => {
    return dbGet('SELECT * FROM contracts WHERE id = ?', [id]);
};

const createContract = ({ name, description, number_contract, serie }) => {
    const { randomUUID } = require('crypto');
    const id = randomUUID();
    return dbRun(
        'INSERT INTO contracts (id, name, description, number_contract, serie) VALUES (?, ?, ?, ?, ?)',
        [id, name, description || '', number_contract || '', serie || '']
    ).then(res => {
        res.id = id;
        return res;
    });
};

const updateContract = (id, { name, description, number_contract, serie }) => {
    return dbRun(
        'UPDATE contracts SET name = ?, description = ?, number_contract = ?, serie = ? WHERE id = ?',
        [name, description || '', number_contract || '', serie || '', id]
    );
};

const deleteContract = (id) => {
    return dbRun('DELETE FROM contracts WHERE id = ?', [id]);
};

const getObrasByContractId = (contractId) => {
    return dbAll('SELECT * FROM obras WHERE contract_id = ?', [contractId]);
};

const getAllocationsByObraId = (obraId) => {
    return dbAll('SELECT * FROM allocations WHERE obra_id = ?', [obraId]);
};

const getObras = () => {
    return dbAll(`
        SELECT o.*, c.name as contract_name 
        FROM obras o 
        LEFT JOIN contracts c ON o.contract_id = c.id 
        ORDER BY o.name ASC
    `);
};

const getObraById = (id) => {
    return dbGet('SELECT * FROM obras WHERE id = ?', [id]);
};

const createObra = ({ name, latitude, longitude, address, radius_km, contract_id }) => {
    const r = radius_km !== undefined ? parseFloat(radius_km) : 1.0;
    return dbRun(
        'INSERT INTO obras (name, latitude, longitude, address, radius_km, contract_id) VALUES (?, ?, ?, ?, ?, ?)',
        [name, parseFloat(latitude), parseFloat(longitude), address || '', r, contract_id || null]
    );
};

const updateObra = (id, { name, latitude, longitude, address, radius_km, contract_id }) => {
    const r = radius_km !== undefined ? parseFloat(radius_km) : 1.0;
    return dbRun(
        'UPDATE obras SET name = ?, latitude = ?, longitude = ?, address = ?, radius_km = ?, contract_id = ? WHERE id = ?',
        [name, parseFloat(latitude), parseFloat(longitude), address || '', r, contract_id || null, id]
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
    getContracts,
    getContractById,
    createContract,
    updateContract,
    deleteContract,
    getObrasByContractId,
    getAllocationsByObraId,
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
