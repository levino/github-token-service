import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../../migrations');

interface Migration {
  name: string;
  up: string;
  down: string;
}

function parseMigrationFile(filePath: string): { up: string; down: string } {
  const content = readFileSync(filePath, 'utf-8');

  // Extract SQL from exports.up and exports.down functions
  // These are in the format: return db.runSql(`SQL HERE`)
  const upMatch = content.match(
    /exports\.up\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?runSql\s*\(`([\s\S]*?)`\)/
  );
  const downMatch = content.match(
    /exports\.down\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?runSql\s*\(\s*['"`]([\s\S]*?)['"`]\s*\)/
  );

  // For more complex migrations with .then(), extract the first SQL
  let upSql = upMatch?.[1] || '';
  const downSql = downMatch?.[1] || '';

  // Handle migrations that chain multiple runSql calls
  const allUpSql = content.match(/runSql\s*\(\s*['"`]([\s\S]*?)['"`]\s*\)/g);
  if (allUpSql && allUpSql.length > 1) {
    upSql = allUpSql
      .map((match) => {
        const sqlMatch = match.match(/runSql\s*\(\s*['"`]([\s\S]*?)['"`]\s*\)/);
        return sqlMatch?.[1] || '';
      })
      .filter(Boolean)
      .join(';\n');
  }

  // Also check for template literal format
  if (!upSql) {
    const templateMatch = content.match(/runSql\s*\(`([\s\S]*?)`\)/);
    if (templateMatch) {
      upSql = templateMatch[1];
    }
  }

  return { up: upSql.trim(), down: downSql.trim() };
}

function getMigrations(): Migration[] {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  return files.map((file) => {
    const { up, down } = parseMigrationFile(join(migrationsDir, file));
    return { name: file, up, down };
  });
}

export function runMigrations(): void {
  const db = getDb();

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = db.prepare('SELECT name FROM migrations').all() as { name: string }[];
  const appliedNames = new Set(applied.map((m) => m.name));

  const migrations = getMigrations();

  for (const migration of migrations) {
    if (appliedNames.has(migration.name)) {
      continue;
    }

    console.log(`Running migration: ${migration.name}`);

    // Split by semicolon and run each statement
    const statements = migration.up
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (error) {
        console.error(`Error in migration ${migration.name}:`, error);
        throw error;
      }
    }

    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
  }

  console.log('Migrations complete');
}

export function rollbackMigration(): void {
  const db = getDb();

  const last = db.prepare('SELECT name FROM migrations ORDER BY run_at DESC LIMIT 1').get() as
    | { name: string }
    | undefined;
  if (!last) {
    console.log('No migrations to rollback');
    return;
  }

  const migrations = getMigrations();
  const migration = migrations.find((m) => m.name === last.name);
  if (!migration) {
    console.error(`Migration file not found: ${last.name}`);
    return;
  }

  console.log(`Rolling back: ${migration.name}`);
  db.exec(migration.down);
  db.prepare('DELETE FROM migrations WHERE name = ?').run(migration.name);
}
