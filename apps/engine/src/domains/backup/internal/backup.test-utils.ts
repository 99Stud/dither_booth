import type { EventBackups } from "./event-backups";

/** Backups that never write, for contexts that don't test them. */
export const createEventBackupsStub = (): EventBackups => ({
  start: () => Promise.resolve(),
  beforeEdit: () => Promise.resolve(),
  stop: () => Promise.resolve(),
});
