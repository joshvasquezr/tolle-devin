-- D§4.2 D1 schema (P6.1). The server stores only email, user id and highlights (SPEC §7).
CREATE TABLE users (
  id          TEXT PRIMARY KEY,            -- random 128-bit, hex
  email       TEXT NOT NULL UNIQUE,        -- lowercase
  created_at  INTEGER NOT NULL,            -- unix seconds
  seq         INTEGER NOT NULL DEFAULT 0   -- per-user sync counter
);

CREATE TABLE login_tokens (
  token_hash  TEXT PRIMARY KEY,            -- sha-256 hex
  email       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('web','native')),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE highlights (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verse_id    INTEGER NOT NULL,
  color       TEXT,                        -- NULL when deleted = 1
  updated_at  INTEGER NOT NULL,            -- unix ms, clamped
  deleted     INTEGER NOT NULL DEFAULT 0,
  seq         INTEGER NOT NULL,
  PRIMARY KEY (user_id, verse_id)
) WITHOUT ROWID;
CREATE INDEX highlights_seq ON highlights(user_id, seq);
