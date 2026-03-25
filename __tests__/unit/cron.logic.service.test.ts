// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as cronService from '../../src/services/cron.logic.service';
import * as cronRepository from '../../src/repositories/dataEnrichment/cron.de.repository';
import { JobStatus } from '../../src/interface/data-enrichment.interface';

jest.mock('../../src/repositories/dataEnrichment/cron.de.repository');
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Cron Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockCronId = 'cron-456';

  const mockCronJob = {
    id: mockCronId,
    name: 'daily-sync',
    cron: '0 0 * * *',
    description: 'Daily sync cron job',
    status: JobStatus.PENDING,
    comments: 'Test cron',
    created_at: '2026-01-01T00:00:00Z',
    tenant_id: mockTenantId,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePostCron', () => {
    it('should successfully create a cron job', async () => {
      const mockCreatedId = 'new-cron-123';
      (cronRepository.createCronJob as jest.Mock).mockResolvedValue(mockCreatedId);

      const result = await cronService.handlePostCron(mockCronJob, mockTenantId);

      expect(result).toEqual({ message: `Cron Job with id ${mockCreatedId} created Successfully` });
      expect(cronRepository.createCronJob).toHaveBeenCalledWith({
        ...mockCronJob,
        tenant_id: mockTenantId,
      });
    });

    it('should throw error when cron job creation fails', async () => {
      (cronRepository.createCronJob as jest.Mock).mockRejectedValue(new Error('Invalid cron expression'));

      await expect(cronService.handlePostCron(mockCronJob, mockTenantId)).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('handleGetCronById', () => {
    it('should successfully retrieve cron job by ID', async () => {
      (cronRepository.findCronJobById as jest.Mock).mockResolvedValue(mockCronJob);

      const result = await cronService.handleGetCronById(mockCronId);

      expect(result).toEqual(mockCronJob);
      expect(cronRepository.findCronJobById).toHaveBeenCalledWith(mockCronId);
    });

    it('should return null when cron job not found', async () => {
      (cronRepository.findCronJobById as jest.Mock).mockResolvedValue(null);

      const result = await cronService.handleGetCronById(mockCronId);

      expect(result).toBeNull();
    });

    it('should throw error on repository failure', async () => {
      (cronRepository.findCronJobById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(cronService.handleGetCronById(mockCronId)).rejects.toThrow('Database error');
    });
  });

  describe('handleUpdateCron', () => {
    it('should successfully update cron job', async () => {
      (cronRepository.updateCronJob as jest.Mock).mockResolvedValue(1);

      const updates = { cron: '0 12 * * *', comments: 'Updated schedule' };
      const result = await cronService.handleUpdateCron(mockCronId, updates);

      expect(result).toEqual({ message: `Cron job with id ${mockCronId} updated successfully` });
      expect(cronRepository.updateCronJob).toHaveBeenCalledWith(mockCronId, updates);
    });

    it('should throw error when no rows affected', async () => {
      (cronRepository.updateCronJob as jest.Mock).mockResolvedValue(0);

      await expect(cronService.handleUpdateCron(mockCronId, {})).rejects.toThrow(
        `No cron job found with id: ${mockCronId}`
      );
    });

    it('should throw error when update fails', async () => {
      (cronRepository.updateCronJob as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(cronService.handleUpdateCron(mockCronId, {})).rejects.toThrow('Update failed');
    });
  });

  describe('handleGetAllCrons', () => {
    it('should retrieve paginated cron jobs with filters', async () => {
      const mockResult = {
        data: [mockCronJob],
        total: 1,
        page: 1,
        totalPages: 1,
      };
      (cronRepository.getAllCronJobs as jest.Mock).mockResolvedValue(mockResult);

      const payload = { status: 'PENDING', name: 'daily' };
      const result = await cronService.handleGetAllCrons(10, 0, payload, mockTenantId);

      expect(result).toEqual(mockResult);
      expect(cronRepository.getAllCronJobs).toHaveBeenCalledWith(10, 0, payload, mockTenantId);
    });

    it('should handle empty results', async () => {
      const mockResult = { data: [], total: 0, page: 1, totalPages: 0 };
      (cronRepository.getAllCronJobs as jest.Mock).mockResolvedValue(mockResult);

      const result = await cronService.handleGetAllCrons(10, 0, {}, mockTenantId);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle date filters', async () => {
      (cronRepository.getAllCronJobs as jest.Mock).mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 });

      const payload = { created_at: '2026-01-01' };
      await cronService.handleGetAllCrons(10, 0, payload, mockTenantId);

      expect(cronRepository.getAllCronJobs).toHaveBeenCalledWith(10, 0, payload, mockTenantId);
    });

    it('should throw error on repository failure', async () => {
      (cronRepository.getAllCronJobs as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(cronService.handleGetAllCrons(10, 0, {}, mockTenantId)).rejects.toThrow('Query failed');
    });
  });

  describe('handleGetCronByStatus', () => {
    it('should retrieve cron jobs filtered by status', async () => {
      const mockJobs = [mockCronJob];
      (cronRepository.getCronJobByStatus as jest.Mock).mockResolvedValue(mockJobs);

      const result = await cronService.handleGetCronByStatus(mockTenantId, JobStatus.PENDING, 1, 10);

      expect(result).toEqual(mockJobs);
      expect(cronRepository.getCronJobByStatus).toHaveBeenCalledWith(mockTenantId, JobStatus.PENDING, 1, 10);
    });

    it('should handle different job statuses', async () => {
      const mockJobs = [{ ...mockCronJob, status: JobStatus.DEPLOYED }];
      (cronRepository.getCronJobByStatus as jest.Mock).mockResolvedValue(mockJobs);

      const result = await cronService.handleGetCronByStatus(mockTenantId, JobStatus.DEPLOYED, 1, 10);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(JobStatus.DEPLOYED);
    });

    it('should handle empty status results', async () => {
      (cronRepository.getCronJobByStatus as jest.Mock).mockResolvedValue([]);

      const result = await cronService.handleGetCronByStatus(mockTenantId, JobStatus.REJECTED, 1, 10);

      expect(result).toEqual([]);
    });

    it('should handle pagination parameters', async () => {
      (cronRepository.getCronJobByStatus as jest.Mock).mockResolvedValue([mockCronJob]);

      await cronService.handleGetCronByStatus(mockTenantId, JobStatus.PENDING, 2, 20);

      expect(cronRepository.getCronJobByStatus).toHaveBeenCalledWith(mockTenantId, JobStatus.PENDING, 2, 20);
    });

    it('should throw error on repository failure', async () => {
      (cronRepository.getCronJobByStatus as jest.Mock).mockRejectedValue(new Error('Status query failed'));

      await expect(cronService.handleGetCronByStatus(mockTenantId, JobStatus.PENDING, 1, 10)).rejects.toThrow(
        'Status query failed'
      );
    });
  });

  describe('handleUpdateCronStatus', () => {
    it('should successfully update cron job status to APPROVED', async () => {
      (cronRepository.updateCronJobByStatus as jest.Mock).mockResolvedValue(1);

      await cronService.handleUpdateCronStatus(JobStatus.APPROVED, mockCronId);

      expect(cronRepository.updateCronJobByStatus).toHaveBeenCalledWith(JobStatus.APPROVED, mockCronId, undefined);
    });

    it('should update status with reason for REJECTED', async () => {
      (cronRepository.updateCronJobByStatus as jest.Mock).mockResolvedValue(1);

      const reason = 'Invalid cron expression';
      await cronService.handleUpdateCronStatus(JobStatus.REJECTED, mockCronId, reason);

      expect(cronRepository.updateCronJobByStatus).toHaveBeenCalledWith(JobStatus.REJECTED, mockCronId, reason);
    });

    it('should update status to DEPLOYED', async () => {
      (cronRepository.updateCronJobByStatus as jest.Mock).mockResolvedValue(1);

      await cronService.handleUpdateCronStatus(JobStatus.DEPLOYED, mockCronId);

      expect(cronRepository.updateCronJobByStatus).toHaveBeenCalledWith(JobStatus.DEPLOYED, mockCronId, undefined);
    });

    it('should throw error when no rows affected', async () => {
      (cronRepository.updateCronJobByStatus as jest.Mock).mockResolvedValue(0);

      await expect(cronService.handleUpdateCronStatus(JobStatus.APPROVED, mockCronId)).rejects.toThrow(
        `No cron job found with id: ${mockCronId}`
      );
    });

    it('should throw error when status update fails', async () => {
      (cronRepository.updateCronJobByStatus as jest.Mock).mockRejectedValue(new Error('Status update failed'));

      await expect(cronService.handleUpdateCronStatus(JobStatus.APPROVED, mockCronId)).rejects.toThrow(
        'Status update failed'
      );
    });
  });
});
