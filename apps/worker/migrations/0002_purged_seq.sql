-- D§3.12 sync `reset`: highest seq of a purged tombstone per user; a cursor below it may have missed deletes.
ALTER TABLE users ADD COLUMN purged_seq INTEGER NOT NULL DEFAULT 0;
