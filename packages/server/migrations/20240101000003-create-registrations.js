exports.up = (db) =>
  db
    .runSql(`
    CREATE TABLE registrations (
      id TEXT PRIMARY KEY,
      devpod_name TEXT NOT NULL,
      registration_token_hash TEXT UNIQUE NOT NULL,
      allowed_repos TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      last_token_request TEXT,
      token_request_count INTEGER NOT NULL DEFAULT 0
    )
  `)
    .then(() => {
      return db.runSql(
        'CREATE INDEX idx_registrations_token_hash ON registrations(registration_token_hash)'
      );
    });

exports.down = (db) => db.runSql('DROP TABLE registrations');
