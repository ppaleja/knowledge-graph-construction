import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString, { prepare: false });

async function run() {
    console.log("Enabling pgvector extension...");
    try {
        await client`CREATE EXTENSION IF NOT EXISTS vector`;
        console.log("Success: pgvector enabled");
    } catch (e) {
        console.error("Error enabling pgvector:", e);
    } finally {
        await client.end();
    }
}

run();
