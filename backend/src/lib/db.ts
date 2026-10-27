import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { config } from '../config';

export type DbRow = RowDataPacket;
export type DbResult = ResultSetHeader;

const databaseUrl = new URL(config.database.url);

export const db: Pool = mysql.createPool({
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

export async function query<T = RowDataPacket[]>(sql: string, values: unknown[] = []): Promise<T> {
  const [rows] = await db.execute<RowDataPacket[]>(sql, values as never[]);
  return rows as T;
}

export async function execute(sql: string, values: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, values as never[]);
  return result;
}

export async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}