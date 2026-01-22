exports.up = (db) =>
  db.runSql(`
    CREATE TABLE admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    )
  `);

exports.down = (db) => db.runSql('DROP TABLE admin_sessions');
