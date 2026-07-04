import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt');
export const db = drizzle(client, { schema });
export type Db = typeof db;
