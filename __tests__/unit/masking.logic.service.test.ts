// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../src/repositories/configuration/masking.repository', () => ({
  countMasksWithFiltersInDB: jest.fn(),
  findMasksWithFiltersInDB: jest.fn(),
  createMasking: jest.fn(),
  updateMaskingInDB: jest.fn(),
  findMaskByIdInDB: jest.fn(),
  getExcludedTypes: jest.fn(),
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

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1', ['tenant-123']);
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1', 2, ['tenant-123', 10, 0], 'DESC');
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

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1 AND status = ANY($2)', [
        'tenant-123',
        ['STATUS_01_IN_PROGRESS'],
      ]);
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith(
        'WHERE tenant_id = $1 AND status = ANY($2)',
        3,
        ['tenant-123', ['STATUS_01_IN_PROGRESS'], 10, 0],
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

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1 AND status = ANY($2)', [
        'tenant-123',
        ['STATUS_01_IN_PROGRESS', 'STATUS_04_APPROVED'],
      ]);
    });

    it('should filter by txtp', async () => {
      const payload = { txtp: 'pain.001' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      const result = await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1 AND txtp ILIKE $2', [
        'tenant-123',
        '%pain.001%',
      ]);
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith(
        'WHERE tenant_id = $1 AND txtp ILIKE $2',
        3,
        ['tenant-123', '%pain.001%', 10, 0],
        'DESC',
      );
      expect(result.data).toEqual(mockMasks.result);
    });

    it('should filter by both status and txtp', async () => {
      const payload = { status: 'STATUS_01_IN_PROGRESS', txtp: 'pain.001' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.countMasksWithFiltersInDB).toHaveBeenCalledWith(
        'WHERE tenant_id = $1 AND status = ANY($2) AND txtp ILIKE $3',
        ['tenant-123', ['STATUS_01_IN_PROGRESS'], '%pain.001%'],
      );
      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith(
        'WHERE tenant_id = $1 AND status = ANY($2) AND txtp ILIKE $3',
        4,
        ['tenant-123', ['STATUS_01_IN_PROGRESS'], '%pain.001%', 10, 0],
        'DESC',
      );
    });

    it('should apply ASC sort order when specified', async () => {
      const payload = { sortOrder: 'ASC' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue(mockMasks);

      await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1', 2, ['tenant-123', 10, 0], 'ASC');
    });

    it('should default to DESC sort order for unknown sortOrder value', async () => {
      const payload = { sortOrder: 'RANDOM' };

      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(0);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue({ result: [] });

      await maskingLogicService.findMasksWithFilters(10, 0, payload, mockTenantId);

      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1', 2, ['tenant-123', 10, 0], 'DESC');
    });

    it('should handle pagination correctly', async () => {
      (maskingRepository.countMasksWithFiltersInDB as jest.Mock).mockResolvedValue(50);
      (maskingRepository.findMasksWithFiltersInDB as jest.Mock).mockResolvedValue({ result: [] });

      const result = await maskingLogicService.findMasksWithFilters(5, 3, {}, mockTenantId);

      expect(maskingRepository.findMasksWithFiltersInDB).toHaveBeenCalledWith('WHERE tenant_id = $1', 2, ['tenant-123', 5, 15], 'DESC');
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

  describe('handlePostMask', () => {
    it('should create a masking configuration successfully', async () => {
      (maskingRepository.createMasking as jest.Mock).mockResolvedValue(42);

      const mask = { txtp: 'pain.001.001.11', txtp_version: '11' };
      const result = await maskingLogicService.handlePostMask(mask, mockTenantId);

      expect(maskingRepository.createMasking).toHaveBeenCalledWith({
        txtp: 'pain.001.001.11',
        txtp_version: '11',
        tenant_id: mockTenantId,
      });
      expect(result).toEqual({ message: 'Masking Configuration with id 42 created Successfully', id: 42 });
    });

    it('should unwrap maskData property if present', async () => {
      (maskingRepository.createMasking as jest.Mock).mockResolvedValue(7);

      const mask = { maskData: { txtp: 'pacs.008.001.10', txtp_version: '10' } };
      const result = await maskingLogicService.handlePostMask(mask, mockTenantId);

      expect(maskingRepository.createMasking).toHaveBeenCalledWith({
        txtp: 'pacs.008.001.10',
        txtp_version: '10',
        tenant_id: mockTenantId,
      });
      expect(result.message).toContain('7');
    });

    it('should throw an error when createMasking fails', async () => {
      (maskingRepository.createMasking as jest.Mock).mockRejectedValue(new Error('DB insert failed'));

      await expect(maskingLogicService.handlePostMask({ txtp: 'pain.001.001.11' }, mockTenantId)).rejects.toThrow('DB insert failed');
    });
  });

  describe('handleUpdateMask', () => {
    const mockUpdatedMask = {
      id: 123,
      tenant_id: 'tenant-123',
      txtp: 'pain.001.001.11',
      txtp_version: '11',
      status: 'STATUS_02_COMPLETED',
      fields_masked: 10,
      total_fields: 10,
      comments: 'Updated successfully',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    it('should update masking configuration successfully', async () => {
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue(mockUpdatedMask);

      const updateData = { status: 'STATUS_02_COMPLETED', fields_masked: 10 };
      const result = await maskingLogicService.handleUpdateMask(123, mockTenantId, updateData);

      expect(maskingRepository.updateMaskingInDB).toHaveBeenCalledWith(123, mockTenantId, updateData);
      expect(result).toEqual(mockUpdatedMask);
    });

    it('should throw an error when updateMaskingInDB fails', async () => {
      (maskingRepository.updateMaskingInDB as jest.Mock).mockRejectedValue(new Error('Update failed'));

      const updateData = { status: 'STATUS_02_COMPLETED' };
      await expect(maskingLogicService.handleUpdateMask(123, mockTenantId, updateData)).rejects.toThrow('Update failed');
    });

    it('should throw an error when masking configuration not found', async () => {
      (maskingRepository.updateMaskingInDB as jest.Mock).mockRejectedValue(new Error('Masking configuration with id 999 not found'));

      await expect(maskingLogicService.handleUpdateMask(999, mockTenantId, { status: 'STATUS_02_COMPLETED' })).rejects.toThrow(
        'Masking configuration with id 999 not found',
      );
    });

    it('should update with multiple fields', async () => {
      const mockMultiFieldUpdate = { ...mockUpdatedMask, comments: 'Multiple fields updated' };
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue(mockMultiFieldUpdate);

      const updateData = { status: 'STATUS_02_COMPLETED', fields_masked: 10, comments: 'Multiple fields updated' };
      const result = await maskingLogicService.handleUpdateMask(123, mockTenantId, updateData);

      expect(result.comments).toBe('Multiple fields updated');
    });
  });

  describe('handleGetMaskById', () => {
    const mockMask = {
      id: 123,
      tenant_id: 'tenant-123',
      txtp: 'pain.001.001.11',
      txtp_version: '11',
      tokenize: false,
      status: 'STATUS_01_IN_PROGRESS',
      fields_masked: 5,
      total_fields: 10,
      comments: 'Test mask',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    it('should retrieve masking configuration successfully', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMask);

      const result = await maskingLogicService.handleGetMaskById(123, mockTenantId);

      expect(maskingRepository.findMaskByIdInDB).toHaveBeenCalledWith(123, mockTenantId);
      expect(result).toEqual(mockMask);
    });

    it('should return null when masking configuration not found', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(null);

      const result = await maskingLogicService.handleGetMaskById(999, mockTenantId);

      expect(result).toBeNull();
    });

    it('should throw an error when findMaskByIdInDB fails', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      await expect(maskingLogicService.handleGetMaskById(123, mockTenantId)).rejects.toThrow('Database connection failed');
    });
  });

  describe('handleReviewMask', () => {
    const mockMaskUnderReview = {
      id: 123,
      tenant_id: 'tenant-123',
      txtp: 'pain.001.001.11',
      txtp_version: '11',
      tokenize: false,
      status: 'STATUS_03_UNDER_REVIEW',
      fields_masked: 10,
      total_fields: 10,
      comments: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    const mockApprovedMask = {
      ...mockMaskUnderReview,
      status: 'STATUS_04_APPROVED',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    const mockRejectedMask = {
      ...mockMaskUnderReview,
      status: 'STATUS_05_REJECTED',
      comments: 'Rejected for testing',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should approve masking configuration successfully', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue(mockApprovedMask);

      const result = await maskingLogicService.handleReviewMask(123, mockTenantId, 'approve');

      expect(maskingRepository.findMaskByIdInDB).toHaveBeenCalledWith(123, mockTenantId);
      expect(maskingRepository.updateMaskingInDB).toHaveBeenCalledWith(123, mockTenantId, { status: 'STATUS_04_APPROVED' });
      expect(result).toEqual(mockApprovedMask);
    });

    it('should approve with comments', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue({ ...mockApprovedMask, comments: 'Looks good' });

      const result = await maskingLogicService.handleReviewMask(123, mockTenantId, 'approve', 'Looks good');

      expect(maskingRepository.updateMaskingInDB).toHaveBeenCalledWith(123, mockTenantId, {
        status: 'STATUS_04_APPROVED',
        comments: 'Looks good',
      });
      expect(result.comments).toBe('Looks good');
    });

    it('should reject masking configuration with comments', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue(mockRejectedMask);

      const result = await maskingLogicService.handleReviewMask(123, mockTenantId, 'reject', 'Rejected for testing');

      expect(maskingRepository.updateMaskingInDB).toHaveBeenCalledWith(123, mockTenantId, {
        status: 'STATUS_05_REJECTED',
        comments: 'Rejected for testing',
      });
      expect(result).toEqual(mockRejectedMask);
    });

    it('should throw error when rejecting without comments', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);

      await expect(maskingLogicService.handleReviewMask(123, mockTenantId, 'reject')).rejects.toThrow(
        'A comment is required when rejecting a masking configuration',
      );
    });

    it('should throw error when rejecting with empty comments', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);

      await expect(maskingLogicService.handleReviewMask(123, mockTenantId, 'reject', '   ')).rejects.toThrow(
        'A comment is required when rejecting a masking configuration',
      );
    });

    it('should throw error when masking configuration not found', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(null);

      await expect(maskingLogicService.handleReviewMask(999, mockTenantId, 'approve')).rejects.toThrow(
        'Masking configuration with id 999 not found',
      );
    });

    it('should throw error when masking configuration is not under review', async () => {
      const mockMaskCompleted = { ...mockMaskUnderReview, status: 'STATUS_02_COMPLETED' };
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskCompleted);

      await expect(maskingLogicService.handleReviewMask(123, mockTenantId, 'approve')).rejects.toThrow(
        "Cannot review masking configuration with status 'STATUS_02_COMPLETED'. Only configurations with status 'STATUS_03_UNDER_REVIEW' can be reviewed.",
      );
    });

    it('should throw error when trying to review already approved masking', async () => {
      const mockMaskApproved = { ...mockMaskUnderReview, status: 'STATUS_04_APPROVED' };
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskApproved);

      await expect(maskingLogicService.handleReviewMask(123, mockTenantId, 'reject', 'Late rejection')).rejects.toThrow(
        "Cannot review masking configuration with status 'STATUS_04_APPROVED'",
      );
    });

    it('should throw error when trying to review already rejected masking', async () => {
      const mockMaskRejected = { ...mockMaskUnderReview, status: 'STATUS_05_REJECTED' };
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskRejected);

      await expect(maskingLogicService.handleReviewMask(123, mockTenantId, 'approve')).rejects.toThrow(
        "Cannot review masking configuration with status 'STATUS_05_REJECTED'",
      );
    });

    it('should trim comments before checking if empty', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue(mockRejectedMask);

      const result = await maskingLogicService.handleReviewMask(123, mockTenantId, 'reject', '  Needs revision  ');

      expect(maskingRepository.updateMaskingInDB).toHaveBeenCalledWith(123, mockTenantId, {
        status: 'STATUS_05_REJECTED',
        comments: 'Needs revision',
      });
    });

    it('should handle database error during update', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);
      (maskingRepository.updateMaskingInDB as jest.Mock).mockRejectedValue(new Error('Database update failed'));

      await expect(maskingLogicService.handleReviewMask(123, mockTenantId, 'approve')).rejects.toThrow('Database update failed');
    });

    it('should approve without adding comments when not provided', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue(mockApprovedMask);

      await maskingLogicService.handleReviewMask(123, mockTenantId, 'approve');

      expect(maskingRepository.updateMaskingInDB).toHaveBeenCalledWith(123, mockTenantId, { status: 'STATUS_04_APPROVED' });
    });

    it('should not add comments field when comment is empty string after trimming', async () => {
      (maskingRepository.findMaskByIdInDB as jest.Mock).mockResolvedValue(mockMaskUnderReview);
      (maskingRepository.updateMaskingInDB as jest.Mock).mockResolvedValue(mockApprovedMask);

      await maskingLogicService.handleReviewMask(123, mockTenantId, 'approve', '   ');

      expect(maskingRepository.updateMaskingInDB).toHaveBeenCalledWith(123, mockTenantId, { status: 'STATUS_04_APPROVED' });
    });
  });

  describe('handleGetExcludedTypes', () => {
    const mockExcludedTypes = [
      { masking_id: 'uuid-1', txtp: 'pain.001.001.11', txtp_version: '11', record_status: 'Exists' },
      { masking_id: null, txtp: 'pacs.008.001.10', txtp_version: '10', record_status: 'Not Exists' },
    ];

    it('should return excluded types successfully', async () => {
      (maskingRepository.getExcludedTypes as jest.Mock).mockResolvedValue(mockExcludedTypes);

      const result = await maskingLogicService.handleGetExcludedTypes(mockTenantId);

      expect(maskingRepository.getExcludedTypes).toHaveBeenCalledWith(mockTenantId);
      expect(result).toEqual(mockExcludedTypes);
    });

    it('should return empty array when no excluded types found', async () => {
      (maskingRepository.getExcludedTypes as jest.Mock).mockResolvedValue([]);

      const result = await maskingLogicService.handleGetExcludedTypes(mockTenantId);

      expect(result).toEqual([]);
    });

    it('should return null when repository returns null', async () => {
      (maskingRepository.getExcludedTypes as jest.Mock).mockResolvedValue(null);

      const result = await maskingLogicService.handleGetExcludedTypes(mockTenantId);

      expect(result).toBeNull();
    });

    it('should throw an error when getExcludedTypes fails', async () => {
      (maskingRepository.getExcludedTypes as jest.Mock).mockRejectedValue(new Error('DB query failed'));

      await expect(maskingLogicService.handleGetExcludedTypes(mockTenantId)).rejects.toThrow('DB query failed');
    });
  });
});
