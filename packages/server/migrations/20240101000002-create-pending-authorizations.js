exports.up = function(db) {
  return db.runSql(`
    CREATE TABLE pending_authorizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_code TEXT UNIQUE NOT NULL,
      user_code TEXT UNIQUE NOT NULL,
      devpod_name TEXT NOT NULL,
      requested_repos TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).then(() => {
    return db.runSql('CREATE INDEX idx_pending_user_code ON pending_authorizations(user_code)');
  }).then(() => {
    return db.runSql('CREATE INDEX idx_pending_status ON pending_authorizations(status)');
  });
};

exports.down = function(db) {
  return db.runSql('DROP TABLE pending_authorizations');
};
