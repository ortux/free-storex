"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.query = query;
exports.execute = execute;
exports.transaction = transaction;
const promise_1 = __importDefault(require("mysql2/promise"));
const config_1 = require("../config");
const databaseUrl = new URL(config_1.config.database.url);
exports.db = promise_1.default.createPool({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
    ssl: databaseUrl.searchParams.get('ssl') === 'true' ? { rejectUnauthorized: true } : undefined,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: 'Z',
    dateStrings: false,
});
async function query(sql, values = []) {
    const [rows] = await exports.db.execute(sql, values);
    return rows;
}
async function execute(sql, values = []) {
    const [result] = await exports.db.execute(sql, values);
    return result;
}
async function transaction(work) {
    const connection = await exports.db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
}
