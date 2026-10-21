import pg from 'pg';
import { readFile } from 'node:fs/promises';
export let pool;
if (process.env.MEMORY_DB === 'true') {
  const { newDb } = await import('pg-mem');
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  pool = new adapter.Pool();
} else {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. See .env.example and README.md.');
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
}
export const query = (sql, values=[]) => pool.query(sql, values);
export async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
  catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function migrate() { await query(await readFile(new URL('./schema.sql',import.meta.url),'utf8')); }
