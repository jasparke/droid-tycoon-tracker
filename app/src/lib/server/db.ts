import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt');
export const db = drizzle(client, { schema });
export type Db = typeof db;

// The drizzle-wrapped client; sync services rely on its mutated jsonb serializer — do NOT
// create a separate unwrapped postgres() connection for them. drizzle() rewires this client's
// json/jsonb serializers to a transparent passthrough (it does its own JSON encoding for
// query-builder writes), so raw tagged-query writes via sql.json()/tx.json() must hand it an
// already-stringified value. A fresh postgres() connection would not have this rewiring and
// would behave differently.
export const sql = client;
