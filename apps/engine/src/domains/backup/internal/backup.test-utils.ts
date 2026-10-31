import type { EventBackups } from "./event-backups";

/** Backups that never write, for contexts that don't test them. */
export const createEventBackupsStub = (): EventBackups => ({
  start: () => {},
  beforeEdit: () => Promise.resolve(),
  stop: () => Promise.resolve(),
});
