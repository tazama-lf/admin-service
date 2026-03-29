// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as dataModelService from '../../src/services/data-model.logic.service';
import * as dataModelRepository from '../../src/repositories';

jest.mock('../../src/repositories', () => ({
  getDataModelJson: jest.fn(),
  upsertDataModelJson: jest.fn(),
}));
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Data Model Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockDataModel = {
    version: '1.0.0',
    entities: [
      { name: 'Transaction', fields: ['id', 'amount'] },
      { name: 'Customer', fields: ['id', 'name'] },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleGetDataModelJson', () => {
    it('should successfully retrieve data model JSON', async () => {
      (dataModelRepository.getDataModelJson as jest.Mock).mockResolvedValue(mockDataModel);

      const result = await dataModelService.handleGetDataModelJson(mockTenantId);

      expect(result).toEqual(mockDataModel);
      expect(dataModelRepository.getDataModelJson).toHaveBeenCalledWith(mockTenantId);
    });

    it('should return null when data model not found', async () => {
      (dataModelRepository.getDataModelJson as jest.Mock).mockResolvedValue(null);

      const result = await dataModelService.handleGetDataModelJson(mockTenantId);

      expect(result).toBeNull();
    });

    it('should throw error on repository failure', async () => {
      (dataModelRepository.getDataModelJson as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(dataModelService.handleGetDataModelJson(mockTenantId)).rejects.toThrow('Database error');
    });
  });

  describe('handleUpsertDataModelJson', () => {
    it('should successfully upsert data model JSON', async () => {
      const mockResult = { success: true, message: 'Data model updated' };
      (dataModelRepository.upsertDataModelJson as jest.Mock).mockResolvedValue(mockResult);

      const result = await dataModelService.handleUpsertDataModelJson(mockTenantId, mockDataModel);

      expect(result).toEqual(mockResult);
      expect(dataModelRepository.upsertDataModelJson).toHaveBeenCalledWith(mockTenantId, mockDataModel);
    });

    it('should handle upsert for new tenant', async () => {
      const newTenantId = 'new-tenant';
      const mockResult = { success: true, message: 'Data model created' };
      (dataModelRepository.upsertDataModelJson as jest.Mock).mockResolvedValue(mockResult);

      const result = await dataModelService.handleUpsertDataModelJson(newTenantId, mockDataModel);

      expect(result.success).toBe(true);
      expect(dataModelRepository.upsertDataModelJson).toHaveBeenCalledWith(newTenantId, mockDataModel);
    });

    it('should throw error when upsert fails', async () => {
      (dataModelRepository.upsertDataModelJson as jest.Mock).mockRejectedValue(new Error('Upsert failed'));

      await expect(dataModelService.handleUpsertDataModelJson(mockTenantId, mockDataModel)).rejects.toThrow('Upsert failed');
    });
  });
});
