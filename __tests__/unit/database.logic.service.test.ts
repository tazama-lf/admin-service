// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as databaseService from '../../src/services/database.logic.service';

// Mock the index module that exports databaseManager and loggerService
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
  databaseManager: {
    _configuration: {
      query: jest.fn(),
    },
    _eventHistory: {
      query: jest.fn(),
    },
    _evaluation: {
      query: jest.fn(),
    },
    _rawHistory: {
      query: jest.fn(),
    },
  },
}));

// Import the mocked modules
import { databaseManager } from '../../src';

describe('Database Logic Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePostExecuteSqlStatement', () => {
    const mockQueryConfig = {
      text: 'SELECT * FROM test_table WHERE id = $1',
      values: [123],
    };

    const mockQueryResult = {
      rows: [{ id: 123, name: 'test' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    };

    it('should execute query on configuration database', async () => {
      (databaseManager._configuration.query as jest.Mock).mockResolvedValue(mockQueryResult);

      const result = await databaseService.handlePostExecuteSqlStatement(mockQueryConfig, 'configuration');

      expect(result).toEqual(mockQueryResult);
      expect(databaseManager._configuration.query).toHaveBeenCalledWith(
        mockQueryConfig.text,
        mockQueryConfig.values
      );
    });

    it('should execute query on event_history database', async () => {
      (databaseManager._eventHistory.query as jest.Mock).mockResolvedValue(mockQueryResult);

      const result = await databaseService.handlePostExecuteSqlStatement(mockQueryConfig, 'event_history');

      expect(result).toEqual(mockQueryResult);
      expect(databaseManager._eventHistory.query).toHaveBeenCalledWith(
        mockQueryConfig.text,
        mockQueryConfig.values
      );
    });

    it('should execute query on evaluation database', async () => {
      (databaseManager._evaluation.query as jest.Mock).mockResolvedValue(mockQueryResult);

      const result = await databaseService.handlePostExecuteSqlStatement(mockQueryConfig, 'evaluation');

      expect(result).toEqual(mockQueryResult);
      expect(databaseManager._evaluation.query).toHaveBeenCalledWith(mockQueryConfig.text, mockQueryConfig.values);
    });

    it('should execute query on raw_history database', async () => {
      (databaseManager._rawHistory.query as jest.Mock).mockResolvedValue(mockQueryResult);

      const result = await databaseService.handlePostExecuteSqlStatement(mockQueryConfig, 'raw_history');

      expect(result).toEqual(mockQueryResult);
      expect(databaseManager._rawHistory.query).toHaveBeenCalledWith(mockQueryConfig.text, mockQueryConfig.values);
    });

    it('should throw error for invalid database name', async () => {
      await expect(
        databaseService.handlePostExecuteSqlStatement(mockQueryConfig, 'invalid_db')
      ).rejects.toThrow('Specified database was not found.');
    });

    it('should throw error when query fails', async () => {
      (databaseManager._configuration.query as jest.Mock).mockRejectedValue(
        new Error('Connection timeout')
      );

      await expect(
        databaseService.handlePostExecuteSqlStatement(mockQueryConfig, 'configuration')
      ).rejects.toThrow('Connection timeout');
    });
  });
});
