const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../../../config');
const logger = require('../../logger').child({ module: 'migrations' });

class Migrator {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'scripts');
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
    });
    
    // Ensure migrations table exists
    this.ensureMigrationsTable();
  }

  /**
   * Ensure the migrations table exists
   */
  async ensureMigrationsTable() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    } finally {
      client.release();
    }
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations() {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT name FROM migrations ORDER BY name');
      return result.rows.map(row => row.name);
    } finally {
      client.release();
    }
  }

  /**
   * Get list of migration files
   */
  getMigrationFiles() {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
      return [];
    }
    
    return fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  /**
   * Run all pending migrations
   */
  async up() {
    const applied = await this.getAppliedMigrations();
    const files = this.getMigrationFiles();
    const pending = files.filter(file => !applied.includes(file));
    
    if (pending.length === 0) {
      logger.info('No pending migrations');
      return [];
    }
    
    logger.info(`Found ${pending.length} pending migrations`);
    
    const client = await this.pool.connect();
    const executed = [];
    
    try {
      await client.query('BEGIN');
      
      for (const file of pending) {
        const filePath = path.join(this.migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        logger.info(`Running migration: ${file}`);
        await client.query(sql);
        
        // Record migration
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [file]
        );
        
        executed.push(file);
        logger.info(`Successfully applied migration: ${file}`);
      }
      
      await client.query('COMMIT');
      return executed;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message }, `Migration failed: ${file}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Rollback the last batch of migrations
   */
  async down(count = 1) {
    const applied = await this.getAppliedMigrations();
    const toRollback = applied.slice(-count);
    
    if (toRollback.length === 0) {
      logger.info('No migrations to rollback');
      return [];
    }
    
    logger.info(`Rolling back ${toRollback.length} migrations`);
    
    const client = await this.pool.connect();
    const rolledBack = [];
    
    try {
      await client.query('BEGIN');
      
      // Roll back in reverse order
      for (const file of toRollback.reverse()) {
        const filePath = path.join(this.migrationsDir, file.replace(/\.sql$/, '.down.sql'));
        
        if (!fs.existsSync(filePath)) {
          logger.warn(`No rollback script found for: ${file}`);
          continue;
        }
        
        const sql = fs.readFileSync(filePath, 'utf8');
        logger.info(`Rolling back migration: ${file}`);
        
        await client.query(sql);
        
        // Remove migration record
        await client.query(
          'DELETE FROM migrations WHERE name = $1',
          [file]
        );
        
        rolledBack.push(file);
        logger.info(`Successfully rolled back migration: ${file}`);
      }
      
      await client.query('COMMIT');
      return rolledBack;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message }, 'Rollback failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new migration file
   */
  create(name) {
    if (!name) {
      throw new Error('Migration name is required');
    }
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const fileName = `${timestamp}_${name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}.sql`;
    const filePath = path.join(this.migrationsDir, fileName);
    
    // Create migrations directory if it doesn't exist
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }
    
    // Create migration file with template
    const template = `-- Migration: ${name}
-- Created at: ${new Date().toISOString()}

-- Up migration
-- Add your SQL here

-- Example:
-- CREATE TABLE IF NOT EXISTS example (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );
`;
    
    fs.writeFileSync(filePath, template);
    logger.info(`Created migration: ${filePath}`);
    
    // Create down migration file
    const downFilePath = path.join(this.migrationsDir, fileName.replace(/\.sql$/, '.down.sql'));
    const downTemplate = `-- Rollback migration for: ${name}
-- This will be executed when rolling back this migration

-- Example:
-- DROP TABLE IF EXISTS example;
`;
    
    fs.writeFileSync(downFilePath, downTemplate);
    
    return filePath;
  }

  /**
   * Close the database connection
   */
  async close() {
    await this.pool.end();
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  const migrator = new Migrator();
  
  const run = async () => {
    try {
      switch (command) {
        case 'up':
          const applied = await migrator.up();
          console.log(`Applied ${applied.length} migrations`);
          break;
          
        case 'down':
          const count = parseInt(process.argv[3] || '1', 10);
          const rolledBack = await migrator.down(count);
          console.log(`Rolled back ${rolledBack.length} migrations`);
          break;
          
        case 'create':
          const name = process.argv[3];
          if (!name) {
            console.error('Migration name is required');
            process.exit(1);
          }
          const filePath = migrator.create(name);
          console.log(`Created migration: ${filePath}`);
          break;
          
        case 'status':
          const appliedMigrations = await migrator.getAppliedMigrations();
          const allMigrations = migrator.getMigrationFiles();
          
          console.log('\nApplied migrations:');
          appliedMigrations.forEach(m => console.log(`  ✔ ${m}`));
          
          const pending = allMigrations.filter(m => !appliedMigrations.includes(m));
          if (pending.length > 0) {
            console.log('\nPending migrations:');
            pending.forEach(m => console.log(`  ◌ ${m}`));
          }
          
          console.log(`\nTotal: ${appliedMigrations.length} applied, ${pending.length} pending`);
          break;
          
        default:
          console.log('Usage:');
          console.log('  node migrate.js up           - Run all pending migrations');
          console.log('  node migrate.js down [count] - Rollback migrations (default: 1)');
          console.log('  node migrate.js create <name> - Create a new migration');
          console.log('  node migrate.js status       - Show migration status');
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      await migrator.close();
    }
  };
  
  run();
}

module.exports = Migrator;
