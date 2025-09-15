# Database Role and Data Authority

This document outlines the data authority hierarchy, database roles, and denormalization strategy for the application's data storage systems: PostgreSQL, Cosmos DB, and Redis.

## Data Authority Hierarchy

### 1. PostgreSQL (Primary Source of Truth)
**Authoritative for:**
- User accounts and authentication
- Core business entities (orders, transactions, customers)
- Financial records
- Audit logs
- Reference data (product catalog, pricing, etc.)
- Complex relationships and transactions

**Characteristics:**
- ACID compliance
- Strong consistency
- Complex queries and joins
- Full-text search capabilities

### 2. Cosmos DB (Secondary Source / Denormalized Data)
**Authoritative for:**
- User-generated content
- Documents and media metadata
- Event sourcing data
- Time-series data

**Characteristics:**
- High write throughput
- Schema flexibility
- Global distribution
- Eventual consistency

### 3. Redis (Ephemeral Cache)
**Authoritative for:**
- Session data
- Rate limiting counters
- Real-time analytics
- Temporary data

**Characteristics:**
- In-memory performance
- Data expiration
- Pub/sub capabilities
- Distributed locks

## Denormalization Strategy

### When to Denormalize
1. **Performance Optimization**
   - Frequently accessed data that requires low-latency reads
   - Complex joins that impact query performance
   - Aggregated data for dashboards and reports

2. **Use Case Specific**
   - Real-time analytics
   - Search functionality
   - Recommendation engines

### Denormalization Patterns

#### 1. Read Models
```
PostgreSQL (Source of Truth) → Denormalized View → Cosmos DB
```
- Used for: Complex queries, reporting, analytics
- Update strategy: Event-driven updates, batch processing
- Consistency: Eventual

#### 2. Materialized Views
```
PostgreSQL → Materialized View (refreshed periodically)
```
- Used for: Complex aggregations, dashboards
- Update strategy: Scheduled refresh, trigger-based
- Consistency: Near real-time

#### 3. Cached Queries
```
PostgreSQL → Redis (cached results)
```
- Used for: Frequently accessed data, session storage
- Update strategy: Cache invalidation on write
- TTL: Configurable based on data volatility

## Data Synchronization

### PostgreSQL to Cosmos DB
1. **Change Data Capture (CDC)**
   - Use Debezium or similar tools for real-time data synchronization
   - Handle schema evolution carefully

2. **Dual Writes**
   - Application-level synchronization
   - Requires distributed transaction handling

### Cache Invalidation
1. **Write-Through**
   - Update cache and database in a single transaction
   - Ensures cache consistency but can impact write performance

2. **Write-Behind**
   - Update cache first, then asynchronously update the database
   - Better write performance but potential for data loss

3. **Time-To-Live (TTL)**
   - Automatic cache expiration
   - Simple but may serve stale data

## Database Roles and Permissions

### PostgreSQL Roles
```sql
-- Application Role
CREATE ROLE app_readwrite;
GRANT CONNECT ON DATABASE myapp TO app_readwrite;
GRANT USAGE ON SCHEMA public TO app_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;

-- Read-only Role
CREATE ROLE app_readonly;
GRANT CONNECT ON DATABASE myapp TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
```

### Cosmos DB Permissions
- Use Resource Tokens for fine-grained access control
- Implement Row-Level Security (RLS) where applicable
- Use least privilege principle for all database users

## Monitoring and Maintenance

### Key Metrics to Monitor
1. **PostgreSQL**
   - Replication lag
   - Connection pool usage
   - Query performance
   - Deadlocks

2. **Cosmos DB**
   - Request units (RUs)
   - Throttling events
   - Indexing performance

3. **Redis**
   - Memory usage
   - Cache hit ratio
   - Eviction rate

### Maintenance Tasks
1. **PostgreSQL**
   - Regular VACUUM and ANALYZE
   - Index maintenance
   - Backup verification

2. **Cosmos DB**
   - Index optimization
   - Partition key review
   - Cost optimization

3. **Redis**
   - Memory optimization
   - Key eviction policies
   - Cluster health checks

## Disaster Recovery

### Recovery Point Objective (RPO) & Recovery Time Objective (RTO)
- **PostgreSQL**: RPO = 5 minutes, RTO = 15 minutes
- **Cosmos DB**: RPO = 15 minutes, RTO = 30 minutes
- **Redis**: RPO = 1 minute (cache miss), RTO = 5 minutes

### Backup Strategy
1. **PostgreSQL**
   - Continuous archiving and point-in-time recovery (PITR)
   - Daily full backups with WAL archiving

2. **Cosmos DB**
   - Built-in automatic backups
   - Geo-redundant storage

3. **Redis**
   - RDB snapshots
   - AOF persistence for critical data

## Best Practices

1. **Data Modeling**
   - Design for the access pattern
   - Consider read/write ratio
   - Plan for growth and scaling

2. **Query Optimization**
   - Use appropriate indexes
   - Avoid N+1 queries
   - Monitor and optimize slow queries

3. **Security**
   - Encrypt data at rest and in transit
   - Regular security audits
   - Principle of least privilege

4. **Documentation**
   - Maintain data dictionary
   - Document schema changes
   - Keep runbooks updated

## Change Management

### Schema Changes
1. Use migrations for all database changes
2. Test changes in staging first
3. Have rollback procedures in place
4. Coordinate with application deployments

### Data Migrations
1. Plan for zero-downtime deployments
2. Use feature flags for gradual rollouts
3. Monitor performance impact
4. Have a rollback plan

## Glossary

- **SLA**: Service Level Agreement
- **RPO**: Recovery Point Objective
- **RTO**: Recovery Time Objective
- **CDC**: Change Data Capture
- **TTL**: Time To Live
- **RU**: Request Unit (Cosmos DB)
- **WAL**: Write-Ahead Logging (PostgreSQL)
