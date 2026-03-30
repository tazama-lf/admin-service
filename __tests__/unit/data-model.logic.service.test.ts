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
  const mockedGetDataModelJson = dataModelRepository.getDataModelJson as jest.MockedFunction<typeof dataModelRepository.getDataModelJson>;
  const mockedUpsertDataModelJson = dataModelRepository.upsertDataModelJson as jest.MockedFunction<
    typeof dataModelRepository.upsertDataModelJson
  >;
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
      mockedGetDataModelJson.mockResolvedValue(mockDataModel);

      const result = await dataModelService.handleGetDataModelJson(mockTenantId);

      expect(result).toEqual(mockDataModel);
      expect(dataModelRepository.getDataModelJson).toHaveBeenCalledWith(mockTenantId);
    });

    it('should clone default tenant data model when tenant data model is not found', async () => {
      mockedGetDataModelJson.mockResolvedValueOnce(null).mockResolvedValueOnce(mockDataModel);
      mockedUpsertDataModelJson.mockResolvedValue({
        tenant_id: mockTenantId,
        updated_at: '2026-01-01T00:00:00.000Z',
      });

      const result = await dataModelService.handleGetDataModelJson(mockTenantId);

      expect(result).toEqual(mockDataModel);
      expect(dataModelRepository.getDataModelJson).toHaveBeenNthCalledWith(1, mockTenantId);
      expect(dataModelRepository.getDataModelJson).toHaveBeenNthCalledWith(2, 'default');
      expect(dataModelRepository.upsertDataModelJson).toHaveBeenCalledWith(mockTenantId, mockDataModel);
    });

    it('should return null when tenant and default data models are not found', async () => {
      mockedGetDataModelJson.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await dataModelService.handleGetDataModelJson(mockTenantId);

      expect(result).toBeNull();
      expect(dataModelRepository.getDataModelJson).toHaveBeenNthCalledWith(1, mockTenantId);
      expect(dataModelRepository.getDataModelJson).toHaveBeenNthCalledWith(2, 'default');
      expect(dataModelRepository.upsertDataModelJson).not.toHaveBeenCalled();
    });

    it('should throw error on repository failure', async () => {
      mockedGetDataModelJson.mockRejectedValue(new Error('Database error'));

      await expect(dataModelService.handleGetDataModelJson(mockTenantId)).rejects.toThrow('Database error');
    });
  });

  describe('handleUpsertDataModelJson', () => {
    it('should successfully upsert data model JSON', async () => {
      const mockResult = { tenant_id: mockTenantId, updated_at: '2026-01-01T00:00:00.000Z' };
      mockedUpsertDataModelJson.mockResolvedValue(mockResult);

      const result = await dataModelService.handleUpsertDataModelJson(mockTenantId, mockDataModel);

      expect(result).toEqual(mockResult);
      expect(dataModelRepository.upsertDataModelJson).toHaveBeenCalledWith(mockTenantId, mockDataModel);
    });

    it('should handle upsert for new tenant', async () => {
      const newTenantId = 'new-tenant';
      const mockResult = { tenant_id: newTenantId, updated_at: '2026-01-01T00:00:00.000Z' };
      mockedUpsertDataModelJson.mockResolvedValue(mockResult);

      const result = await dataModelService.handleUpsertDataModelJson(newTenantId, mockDataModel);

      expect(result.tenant_id).toBe(newTenantId);
      expect(dataModelRepository.upsertDataModelJson).toHaveBeenCalledWith(newTenantId, mockDataModel);
    });

    it('should throw error when upsert fails', async () => {
      mockedUpsertDataModelJson.mockRejectedValue(new Error('Upsert failed'));

      await expect(dataModelService.handleUpsertDataModelJson(mockTenantId, mockDataModel)).rejects.toThrow('Upsert failed');
    });
  });
});
