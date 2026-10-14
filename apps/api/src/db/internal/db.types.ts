import type { db } from "#db/index";

export type DB = typeof db;
export type DbTransaction = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run a synchronous bun-sqlite query: the client or a transaction. */
export type DbExecutor = DB | DbTransaction;
