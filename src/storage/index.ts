import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { config } from '#config/index.js';

const connectionString = config.supabase.url!;
if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

// Disable prefetch as it is not supported for "Transaction" pool mode
export const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
export type DB = typeof db;
