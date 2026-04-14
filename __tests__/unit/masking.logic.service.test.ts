// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

jest.mock('../../src/repositories/configuration/masking.repository', () => ({
  countMasksWithFiltersInDB: jest.fn(),
  findMasksWithFiltersInDB: jest.fn(),
}));

import * as maskingLogicService from '../../src/services/masking.logic.service';
import * as maskingRepository from '../../src/repositories/configuration/masking.repository';

describe('Masking Logic Service', () => {
  const mockTenantId = 'tenant-123';

  const mockMasks = {
    result: [
      {
        id: 'uuid-1',
        tenant_id: 'DEFAULT',
        txtp: 'pain.001.001.11',
        txtp_version: '11',
        status: 'STATUS_01_IN_PROGRESS',
        fields_masked: 3,
        total_fields: 10,
        comments: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findMasksWithFilters', () => {
    it('should return all masks with no filters', async () => {
      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      const result = await maskingLogicService.findMasksWithFilters(10, 0, {}, mockTenantId);

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('', []);
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('', 1, [10, 0], 'DESC');
      expect(result.data).toEqual(mockMasks.result);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should filter by status', async () => {
      const payload = { status: 'STATUS_01_IN_PROGRESS' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      const result = await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE status = ANY($1)', [['STATUS_01_IN_PROGRESS']]);
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith(
        'WHERE status = ANY($1)',
        2,
        [['STATUS_01_IN_PROGRESS'], 10, 0],
        'DESC',
      );
      expect(result.data).toEqual(mockMasks.result);
      expect(result.total).toBe(1);
    });

    it('should filter by multiple comma-separated statuses', async () => {
      const payload = { status: 'STATUS_01_IN_PROGRESS, STATUS_04_APPROVED' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(2);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue({ result: [] });

      await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE status = ANY($1)', [
        ['STATUS_01_IN_PROGRESS', 'STATUS_04_APPROVED'],
      ]);
    });

    it('should filter by txtp', async () => {
      const payload = { txtp: 'pain.001' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      const result = await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE txtp ILIKE $1', ['%pain.001%']);
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE txtp ILIKE $1', 2, ['%pain.001%', 10, 0], 'DESC');
      expect(result.data).toEqual(mockMasks.result);
    });

    it('should filter by both status and txtp', async () => {
      const payload = { status: 'STATUS_01_IN_PROGRESS', txtp: 'pain.001' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE status = ANY($1) AND txtp ILIKE $2', [
        ['STATUS_01_IN_PROGRESS'],
        '%pain.001%',
      ]);
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith(
        'WHERE status = ANY($1) AND txtp ILIKE $2',
        3,
        [['STATUS_01_IN_PROGRESS'], '%pain.001%', 10, 0],
        'DESC',
      );
    });

    it('should apply ASC sort order when specified', async () => {
      const payload = { sortOrder: 'ASC' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('', 1, [10, 0], 'ASC');
    });

    it('should default to DESC sort order for unknown sortOrder value', async () => {
      const payload = { sortOrder: 'RANDOM' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(0);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue({ result: [] });

      await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('', 1, [10, 0], 'DESC');
    });

    it('should handle pagination correctly', async () => {
      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(50);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue({ result: [] });

      const result = await maskingLogicService.findMasksWithFilters(5, 3, {}, mockTenantId);

      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('', 1, [5, 15], 'DESC');
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(3);
      expect(result.total).toBe(50);
    });

    it('should return empty result when no masks match filters', async () => {
      const payload = { status: 'STATUS_05_REJECTED' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(0);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue({ result: [] });

      const result = await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should use default limit and offset when not provided', async () => {
      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      const result = await maskingLogicService.findMasksWithFilters(
        undefined as unknown as number,
        undefined as unknown as number,
        {},
        mockTenantId,
      );

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });
  });
});
