// Применяет SQL-миграции из supabase/migrations к базе по DATABASE_URL.
// Уже применённые файлы запоминаются в таблице private._migrations и повторно не запускаются.
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('Не задан DATABASE_URL в .env');
	process.exit(1);
}

const dir = new URL('../supabase/migrations/', import.meta.url);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
	// Служебная таблица лежит в схеме private: её не видно через API
	await client.query('create schema if not exists private');
	await client.query(`do $$ begin
		if to_regclass('public._migrations') is not null then
			alter table public._migrations set schema private;
		end if;
	end $$`);
	await client.query(`create table if not exists private._migrations (
		name text primary key,
		applied_at timestamptz not null default now()
	)`);
	await client.query('revoke all on private._migrations from public, anon, authenticated');

	const { rows } = await client.query('select name from private._migrations');
	const applied = new Set(rows.map((r) => r.name));
	const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

	for (const file of files) {
		if (applied.has(file)) {
			console.log(`пропуск   ${file}`);
			continue;
		}
		const sql = await readFile(new URL(file, dir), 'utf8');
		// Каждая миграция — в транзакции: либо применится целиком, либо никак
		await client.query('begin');
		try {
			await client.query(sql);
			await client.query('insert into private._migrations (name) values ($1)', [file]);
			await client.query('commit');
			console.log(`применена ${file}`);
		} catch (err) {
			await client.query('rollback');
			throw err;
		}
	}
} finally {
	await client.end();
}
