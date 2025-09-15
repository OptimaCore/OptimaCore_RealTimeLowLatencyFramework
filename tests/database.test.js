const { expect } = require('chai');
const { Pool } = require('pg');
const mockPool = require('pg-mock').mockPool;
const dbPool = require('../services/database/pool');
const query = require('../services/database/query');
const migrator = require('../services/database/migrations/migrate');

// Mock the config
jest.mock('../../config', () => ({
  database: {
    host: 'localhost',
    port: 5432,
    user: 'test',
    password: 'test',
    database: 'testdb',
    maxConnections: 10,
    idleTimeout: 30000,
    connectionTimeout: 2000,
    ssl: false,
    replicas: [
      { host: 'replica1', port: 5432 },
      { host: 'replica2', port: 5432 }
    ]
  }
}));

describe('Database Layer', () => {
  let mockPgPool;
  
  beforeAll(() => {
    // Create a mock pool
    mockPgPool = new mockPool({
      query: (queryText, params) => {
        // Mock responses based on query
        if (queryText.includes('SELECT 1')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] });
        }
        if (queryText.includes('SELECT * FROM users')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Test User', email: 'test@example.com' }]
          });
        }
        return Promise.resolve({ rows: [] });
      }
    });
    
    // Replace the actual pool with our mock
    dbPool.primaryPool = mockPgPool;
    dbPool.replicaPools = [mockPgPool, mockPgPool];
  });
  
  afterAll(async () => {
    await dbPool.close();
  });
  
  describe('Database Pool', () => {
    it('should initialize with primary and replica pools', () => {
      expect(dbPool.primaryPool).to.exist;
      expect(dbPool.replicaPools).to.have.length(2);
    });
    
    it('should execute read queries using replicas', async () => {
      const result = await dbPool.readQuery('SELECT 1');
      expect(result.rows[0]['?column?']).to.equal(1);
    });
    
    it('should execute write queries using primary', async () => {
      const result = await dbPool.writeQuery('INSERT INTO test VALUES ($1)', [1]);
      expect(result).to.exist;
    });
  });
  
  describe('Query Executor', () => {
    it('should execute queries with parameters', async () => {
      const result = await query.query('SELECT * FROM users WHERE id = $1', [1]);
      expect(result.rows[0].name).to.equal('Test User');
    });
    
    it('should handle transactions', async () => {
      const result = await query.transaction(async (client) => {
        const res = await client.query('SELECT 1');
        return res.rows[0];
      });
      expect(result['?column?']).to.equal(1);
    });
    
    it('should handle batch operations', async () => {
      const queries = [
        { text: 'SELECT 1' },
        { text: 'SELECT 2' }
      ];
      const results = await query.batch(queries);
      expect(results).to.have.length(2);
    });
  });
  
  describe('Migrations', () => {
    let migratorInstance;
    
    beforeEach(() => {
      migratorInstance = new migrator();
      migratorInstance.pool = mockPgPool;
    });
    
    it('should ensure migrations table exists', async () => {
      await migratorInstance.ensureMigrationsTable();
      // If no error, the test passes
      expect(true).to.be.true;
    });
    
    it('should get applied migrations', async () => {
      const migrations = await migratorInstance.getAppliedMigrations();
      expect(migrations).to.be.an('array');
    });
    
    it('should create a new migration file', () => {
      const fs = require('fs');
      const path = require('path');
      
      // Mock fs
      const mockMkdirSync = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      const mockWriteFileSync = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      
      migratorInstance.create('test_migration');
      
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledTimes(2); // Up and down migrations
      
      // Cleanup
      mockMkdirSync.mockRestore();
      mockWriteFileSync.mockRestore();
    });
  });
  
  describe('Error Handling', () => {
    it('should handle query errors', async () => {
      // Mock a failing query
      const error = new Error('Connection failed');
      mockPgPool.query = jest.fn().mockRejectedValueOnce(error);
      
      try {
        await query.query('SELECT * FROM non_existent_table');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.equal('Connection failed');
      }
    });
    
    it('should handle transaction rollback', async () => {
      const error = new Error('Transaction failed');
      
      try {
        await query.transaction(async (client) => {
          await client.query('SELECT 1');
          throw error;
        });
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.equal(error);
      }
    });
  });
});
