// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from '@jest/globals';
import { validateSelectQuery } from '../../src/utils/validateQuery';

describe('validateSelectQuery', () => {
  describe('Valid SELECT queries', () => {
    it('should accept a simple SELECT query', () => {
      const query = 'SELECT * FROM users';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept SELECT with WHERE clause', () => {
      const query = 'SELECT id, name FROM users WHERE status = $1';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept SELECT with JOIN', () => {
      const query = 'SELECT u.id, u.name FROM users u JOIN orders o ON u.id = o.user_id';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept SELECT with ORDER BY and LIMIT', () => {
      const query = 'SELECT * FROM users ORDER BY created_at DESC LIMIT 10';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept WITH (CTE) queries', () => {
      const query = `
        WITH active_users AS (
          SELECT * FROM users WHERE status = 'active'
        )
        SELECT * FROM active_users
      `;
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept UNION queries', () => {
      const query = 'SELECT id FROM users UNION SELECT id FROM admins';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept queries with template placeholders {{ variable }}', () => {
      const query = 'SELECT * FROM users WHERE account = {{ accountId }} AND status = {{ status }}';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept complex queries with multiple template placeholders', () => {
      const query = `
        WITH all_success AS (
          SELECT DISTINCT EndToEndId FROM transaction
          WHERE source = {{ creditorAccount }}
            AND TxTp = 'pacs.002.001.12'
            AND TxSts = 'ACCC'
        )
        SELECT t.Amt AS "Amt"
        FROM transaction t
        JOIN all_success s USING (EndToEndId)
        WHERE t.TxTp = 'pacs.008.001.10'
        ORDER BY t.CreDtTm DESC
      `;
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept queries with parameterized values', () => {
      const query = 'SELECT * FROM users WHERE id = $1 AND tenant_id = $2';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept queries with GROUP BY and HAVING', () => {
      const query = 'SELECT status, COUNT(*) FROM users GROUP BY status HAVING COUNT(*) > 5';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });
  });

  describe('Invalid queries', () => {
    // Write/DDL statements are no longer rejected here — query-node executes on a read-only
    // DB role, so the database rejects mutations/DDL. validateSelectQuery only enforces
    // parseable + single-statement (the AST table/tenant logic depends on that shape).
    it('should accept INSERT/UPDATE/DELETE/DROP at parse layer (DB role rejects at execution)', () => {
      expect(() => validateSelectQuery('INSERT INTO users (name) VALUES ($1)')).not.toThrow();
      expect(() => validateSelectQuery('UPDATE users SET status = $1 WHERE id = $2')).not.toThrow();
      expect(() => validateSelectQuery('DELETE FROM users WHERE id = $1')).not.toThrow();
      expect(() => validateSelectQuery('DROP TABLE users')).not.toThrow();
    });

    it('should reject multiple statements', () => {
      const query = 'SELECT * FROM users; SELECT * FROM orders';
      expect(() => validateSelectQuery(query)).toThrow('Only a single statement is allowed — multiple statements detected.');
    });

    it('should reject empty queries', () => {
      const query = '';
      expect(() => validateSelectQuery(query)).toThrow('Invalid SQL syntax');
    });

    it('should reject queries with invalid syntax', () => {
      const query = 'SELECT * FROM users WHERE';
      expect(() => validateSelectQuery(query)).toThrow('Invalid SQL syntax');
    });

    it('should reject SQL injection attempts', () => {
      const query = 'SELECT * FROM users WHERE id = 1; DROP TABLE users; --';
      expect(() => validateSelectQuery(query)).toThrow();
    });
  });

  describe('Template placeholder replacement', () => {
    it('should replace single template placeholder with $1', () => {
      const query = 'SELECT * FROM users WHERE name = {{ userName }}';
      const { ast, parsedSql } = validateSelectQuery(query);
      expect(ast.length).toBeGreaterThan(0);
      expect(parsedSql).toBe('SELECT * FROM users WHERE name = $1');
    });

    it('should replace multiple template placeholders with sequential parameters', () => {
      const query = 'SELECT * FROM users WHERE name = {{ userName }} AND age = {{ userAge }}';
      const { ast, parsedSql } = validateSelectQuery(query);
      expect(ast.length).toBeGreaterThan(0);
      expect(parsedSql).toBe('SELECT * FROM users WHERE name = $1 AND age = $2');
    });

    it('should handle template placeholders with spaces', () => {
      const query = 'SELECT * FROM users WHERE name = {{  userName  }}';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should accept queries with comments', () => {
      const query = `
        -- This is a comment
        SELECT * FROM users
        /* Multi-line comment */
        WHERE status = 'active'
      `;
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept queries with subqueries', () => {
      const query = 'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });

    it('should accept VALUES queries', () => {
      const query = 'VALUES (1, 2), (3, 4)';
      expect(() => validateSelectQuery(query)).not.toThrow();
    });
  });
});
