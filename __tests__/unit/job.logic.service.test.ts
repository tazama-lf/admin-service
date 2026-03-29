// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as jobLogicService from '../../src/services/job.logic.service';
import * as jobRepository from '../../src/repositories/dataEnrichment/job.de.repository';
import { ConfigType, JobStatus, ScheduleStatus } from '../../src/interface/data-enrichment.interface';

jest.mock('../../src/repositories/dataEnrichment/job.de.repository');
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Job Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockJobId = 'job-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCreatePushJob', () => {
    it('should successfully create a push job', async () => {
      const mockPushJob = {
        name: 'Test Push Job',
        schedule: '0 0 * * *',
        endpoint: 'http://example.com/api',
        method: 'POST',
      };

      (jobRepository.createPushJob as jest.Mock).mockResolvedValue('new-job-id-123');

      const result = await jobLogicService.handleCreatePushJob(mockPushJob, mockTenantId);

      expect(jobRepository.createPushJob).toHaveBeenCalledWith({
        ...mockPushJob,
        tenant_id: mockTenantId,
      });
      expect(result).toEqual({
        message: 'Push Job with id new-job-id-123 created Successfully',
      });
    });

    it('should throw error when push job creation fails', async () => {
      const mockPushJob = {
        name: 'Test Push Job',
        schedule: '0 0 * * *',
      };

      (jobRepository.createPushJob as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(jobLogicService.handleCreatePushJob(mockPushJob, mockTenantId)).rejects.toThrow('Database error');
    });
  });

  describe('handleGetAllJobs', () => {
    it('should successfully retrieve all jobs with pagination', async () => {
      const mockJobs = {
        data: [
          { id: '1', name: 'Job 1', status: 'active' },
          { id: '2', name: 'Job 2', status: 'inactive' },
        ],
        total: 2,
        limit: 10,
        offset: 0,
      };

      (jobRepository.getAllJobs as jest.Mock).mockResolvedValue(mockJobs);

      const result = await jobLogicService.handleGetAllJobs(10, 0, {}, mockTenantId);

      expect(jobRepository.getAllJobs).toHaveBeenCalledWith(10, 0, {}, mockTenantId);
      expect(result).toEqual(mockJobs);
      expect(result.data).toHaveLength(2);
    });

    it('should handle filters when retrieving jobs', async () => {
      const mockFilters = { status: 'active', name: 'Test' };
      const mockJobs = {
        data: [{ id: '1', name: 'Test Job', status: 'active' }],
        total: 1,
        limit: 10,
        offset: 0,
      };

      (jobRepository.getAllJobs as jest.Mock).mockResolvedValue(mockJobs);

      const result = await jobLogicService.handleGetAllJobs(10, 0, mockFilters, mockTenantId);

      expect(jobRepository.getAllJobs).toHaveBeenCalledWith(10, 0, mockFilters, mockTenantId);
      expect(result.data).toHaveLength(1);
    });

    it('should throw error when retrieving jobs fails', async () => {
      (jobRepository.getAllJobs as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      await expect(jobLogicService.handleGetAllJobs(10, 0, {}, mockTenantId)).rejects.toThrow('Database connection failed');
    });
  });

  describe('handleCreatePullJob', () => {
    it('should successfully create a pull job', async () => {
      const mockPullJob = {
        name: 'Test Pull Job',
        schedule: '0 */2 * * *',
        source: 'database',
        query: 'SELECT * FROM table',
      };

      const mockResult = { success: true, message: 'Job created' };
      (jobRepository.createPullJob as jest.Mock).mockResolvedValue(mockResult);

      const result = await jobLogicService.handleCreatePullJob(mockPullJob, mockTenantId);

      expect(jobRepository.createPullJob).toHaveBeenCalledWith({
        ...mockPullJob,
        tenant_id: mockTenantId,
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw error when pull job creation fails', async () => {
      const mockPullJob = {
        name: 'Test Pull Job',
      };

      (jobRepository.createPullJob as jest.Mock).mockRejectedValue(new Error('Invalid job configuration'));

      await expect(jobLogicService.handleCreatePullJob(mockPullJob, mockTenantId)).rejects.toThrow('Invalid job configuration');
    });
  });

  describe('handleGetJobHistory', () => {
    it('should successfully retrieve job history', async () => {
      const mockHistory = {
        data: [
          { id: '1', job_id: 'job-1', status: 'completed', executed_at: '2026-01-01T10:00:00Z' },
          { id: '2', job_id: 'job-1', status: 'failed', executed_at: '2026-01-02T10:00:00Z' },
        ],
        total: 2,
        limit: 10,
        offset: 0,
      };

      (jobRepository.getJobHistory as jest.Mock).mockResolvedValue(mockHistory);

      const result = await jobLogicService.handleGetJobHistory(10, 0, mockTenantId, {});

      expect(jobRepository.getJobHistory).toHaveBeenCalledWith(10, 0, mockTenantId, {});
      expect(result).toEqual(mockHistory);
      expect(result.data).toHaveLength(2);
    });

    it('should handle filters in job history retrieval', async () => {
      const mockFilters = { status: 'failed' };
      const mockHistory = {
        data: [{ id: '2', job_id: 'job-1', status: 'failed' }],
        total: 1,
        limit: 10,
        offset: 0,
      };

      (jobRepository.getJobHistory as jest.Mock).mockResolvedValue(mockHistory);

      const result = await jobLogicService.handleGetJobHistory(10, 0, mockTenantId, mockFilters);

      expect(jobRepository.getJobHistory).toHaveBeenCalledWith(10, 0, mockTenantId, mockFilters);
      expect(result.data).toHaveLength(1);
    });

    it('should throw error when retrieving job history fails', async () => {
      (jobRepository.getJobHistory as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(jobLogicService.handleGetJobHistory(10, 0, mockTenantId)).rejects.toThrow('Query failed');
    });
  });

  describe('handleFindJobById', () => {
    it('should find a push job by id', async () => {
      const mockJob = {
        id: mockJobId,
        name: 'Test Job',
        status: 'active',
        tenant_id: mockTenantId,
      };

      (jobRepository.findJobById as jest.Mock).mockResolvedValue(mockJob);

      const result = await jobLogicService.handleFindJobById(mockJobId, ConfigType.PUSH);

      expect(jobRepository.findJobById).toHaveBeenCalledWith(mockJobId, 'tcs_push_jobs');
      expect(result).toEqual(mockJob);
    });

    it('should find a pull job by id', async () => {
      const mockJob = {
        id: mockJobId,
        name: 'Test Pull Job',
        status: 'active',
        tenant_id: mockTenantId,
      };

      (jobRepository.findJobById as jest.Mock).mockResolvedValue(mockJob);

      const result = await jobLogicService.handleFindJobById(mockJobId, ConfigType.PULL);

      expect(jobRepository.findJobById).toHaveBeenCalledWith(mockJobId, 'tcs_pull_jobs');
      expect(result).toEqual(mockJob);
    });

    it('should return null when job is not found', async () => {
      (jobRepository.findJobById as jest.Mock).mockResolvedValue(null);

      const result = await jobLogicService.handleFindJobById('non-existent-id', ConfigType.PUSH);

      expect(result).toBeNull();
    });

    it('should throw error when finding job by id fails', async () => {
      (jobRepository.findJobById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(jobLogicService.handleFindJobById(mockJobId, ConfigType.PUSH)).rejects.toThrow('Database error');
    });
  });

  describe('handleGetJobsByStatus', () => {
    it('should retrieve jobs by status', async () => {
      const mockJobs = [
        { id: '1', name: 'Job 1', status: JobStatus.RUNNING },
        { id: '2', name: 'Job 2', status: JobStatus.RUNNING },
      ];

      (jobRepository.getJobsByStatus as jest.Mock).mockResolvedValue(mockJobs);

      const result = await jobLogicService.handleGetJobsByStatus(mockTenantId, JobStatus.RUNNING, 1, 10);

      expect(jobRepository.getJobsByStatus).toHaveBeenCalledWith(mockTenantId, JobStatus.RUNNING, 1, 10);
      expect(result).toEqual(mockJobs);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no jobs match status', async () => {
      (jobRepository.getJobsByStatus as jest.Mock).mockResolvedValue([]);

      const result = await jobLogicService.handleGetJobsByStatus(mockTenantId, JobStatus.FAILED, 1, 10);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should throw error when retrieving jobs by status fails', async () => {
      (jobRepository.getJobsByStatus as jest.Mock).mockRejectedValue(new Error('Query execution failed'));

      await expect(jobLogicService.handleGetJobsByStatus(mockTenantId, JobStatus.RUNNING, 1, 10)).rejects.toThrow('Query execution failed');
    });
  });

  describe('handleUpdateJob', () => {
    it('should successfully update a push job', async () => {
      const mockUpdates = {
        name: 'Updated Job Name',
        schedule: '0 1 * * *',
      };

      const mockResult = { success: true, message: 'Job updated successfully' };
      (jobRepository.updateJob as jest.Mock).mockResolvedValue(mockResult);

      const result = await jobLogicService.handleUpdateJob(mockJobId, mockUpdates, ConfigType.PUSH);

      expect(jobRepository.updateJob).toHaveBeenCalledWith(mockJobId, mockUpdates, ConfigType.PUSH);
      expect(result).toEqual(mockResult);
    });

    it('should successfully update a pull job', async () => {
      const mockUpdates = {
        query: 'SELECT * FROM updated_table',
      };

      const mockResult = { success: true, message: 'Job updated successfully' };
      (jobRepository.updateJob as jest.Mock).mockResolvedValue(mockResult);

      const result = await jobLogicService.handleUpdateJob(mockJobId, mockUpdates, ConfigType.PULL);

      expect(jobRepository.updateJob).toHaveBeenCalledWith(mockJobId, mockUpdates, ConfigType.PULL);
      expect(result).toEqual(mockResult);
    });

    it('should throw error when job update fails', async () => {
      const mockUpdates = { name: 'Updated Name' };
      (jobRepository.updateJob as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(jobLogicService.handleUpdateJob(mockJobId, mockUpdates, ConfigType.PUSH)).rejects.toThrow('Update failed');
    });
  });

  describe('handleUpdateJobActivation', () => {
    it('should activate a job', async () => {
      const mockUpdatedJob = [
        {
          id: mockJobId,
          name: 'Test Job',
          status: ScheduleStatus.ACTIVE,
        },
      ];

      (jobRepository.updateJobActivation as jest.Mock).mockResolvedValue(mockUpdatedJob);

      const result = await jobLogicService.handleUpdateJobActivation(mockJobId, ScheduleStatus.ACTIVE, ConfigType.PUSH);

      expect(jobRepository.updateJobActivation).toHaveBeenCalledWith(mockJobId, ScheduleStatus.ACTIVE, ConfigType.PUSH);
      expect(result).toEqual(mockUpdatedJob);
    });

    it('should deactivate a job', async () => {
      const mockUpdatedJob = [
        {
          id: mockJobId,
          name: 'Test Job',
          status: ScheduleStatus.INACTIVE,
        },
      ];

      (jobRepository.updateJobActivation as jest.Mock).mockResolvedValue(mockUpdatedJob);

      const result = await jobLogicService.handleUpdateJobActivation(mockJobId, ScheduleStatus.INACTIVE, ConfigType.PULL);

      expect(jobRepository.updateJobActivation).toHaveBeenCalledWith(mockJobId, ScheduleStatus.INACTIVE, ConfigType.PULL);
      expect(result).toEqual(mockUpdatedJob);
    });

    it('should throw error when job activation update fails', async () => {
      (jobRepository.updateJobActivation as jest.Mock).mockRejectedValue(new Error('Activation update failed'));

      await expect(jobLogicService.handleUpdateJobActivation(mockJobId, ScheduleStatus.ACTIVE, ConfigType.PUSH)).rejects.toThrow(
        'Activation update failed',
      );
    });
  });

  describe('handleUpdateJobByStatus', () => {
    it('should update job status successfully', async () => {
      (jobRepository.updateJobByStatus as jest.Mock).mockResolvedValue(1);

      const result = await jobLogicService.handleUpdateJobByStatus(JobStatus.COMPLETED, mockJobId, ConfigType.PUSH);

      expect(jobRepository.updateJobByStatus).toHaveBeenCalledWith(JobStatus.COMPLETED, mockJobId, ConfigType.PUSH, undefined);
      expect(result).toBe(1);
    });

    it('should update job status with reason', async () => {
      const reason = 'Job completed successfully';
      (jobRepository.updateJobByStatus as jest.Mock).mockResolvedValue(1);

      const result = await jobLogicService.handleUpdateJobByStatus(JobStatus.COMPLETED, mockJobId, ConfigType.PUSH, reason);

      expect(jobRepository.updateJobByStatus).toHaveBeenCalledWith(JobStatus.COMPLETED, mockJobId, ConfigType.PUSH, reason);
      expect(result).toBe(1);
    });

    it('should handle job status update to failed', async () => {
      const reason = 'Database connection timeout';
      (jobRepository.updateJobByStatus as jest.Mock).mockResolvedValue(1);

      const result = await jobLogicService.handleUpdateJobByStatus(JobStatus.FAILED, mockJobId, ConfigType.PULL, reason);

      expect(jobRepository.updateJobByStatus).toHaveBeenCalledWith(JobStatus.FAILED, mockJobId, ConfigType.PULL, reason);
      expect(result).toBe(1);
    });

    it('should throw error when status update fails', async () => {
      (jobRepository.updateJobByStatus as jest.Mock).mockRejectedValue(new Error('Status update failed'));

      await expect(jobLogicService.handleUpdateJobByStatus(JobStatus.COMPLETED, mockJobId, ConfigType.PUSH)).rejects.toThrow(
        'Status update failed',
      );
    });
  });

  describe('handleTableExist', () => {
    it('should return true when table exists', async () => {
      (jobRepository.tableExist as jest.Mock).mockResolvedValue(true);

      const result = await jobLogicService.handleTableExist('test_table');

      expect(jobRepository.tableExist).toHaveBeenCalledWith('test_table');
      expect(result).toBe(true);
    });

    it('should return false when table does not exist', async () => {
      (jobRepository.tableExist as jest.Mock).mockResolvedValue(false);

      const result = await jobLogicService.handleTableExist('non_existent_table');

      expect(jobRepository.tableExist).toHaveBeenCalledWith('non_existent_table');
      expect(result).toBe(false);
    });

    it('should throw error when table existence check fails', async () => {
      (jobRepository.tableExist as jest.Mock).mockRejectedValue(new Error('Database connection error'));

      await expect(jobLogicService.handleTableExist('test_table')).rejects.toThrow('Database connection error');
    });
  });

  describe('handleValidateExisting', () => {
    it('should validate existing table successfully', async () => {
      (jobRepository.validateExisting as jest.Mock).mockResolvedValue(true);

      const result = await jobLogicService.handleValidateExisting('valid_table');

      expect(jobRepository.validateExisting).toHaveBeenCalledWith('valid_table');
      expect(result).toBe(true);
    });

    it('should return false for invalid table', async () => {
      (jobRepository.validateExisting as jest.Mock).mockResolvedValue(false);

      const result = await jobLogicService.handleValidateExisting('invalid_table');

      expect(result).toBe(false);
    });

    it('should throw error when validation fails', async () => {
      (jobRepository.validateExisting as jest.Mock).mockRejectedValue(new Error('Validation error'));

      await expect(jobLogicService.handleValidateExisting('test_table')).rejects.toThrow('Validation error');
    });
  });

  describe('handleValidateActive', () => {
    it('should validate active push jobs successfully', async () => {
      (jobRepository.validateActive as jest.Mock).mockResolvedValue(undefined);

      await jobLogicService.handleValidateActive('test_table', ConfigType.PUSH);

      expect(jobRepository.validateActive).toHaveBeenCalledWith('test_table', ConfigType.PUSH);
    });

    it('should validate active pull jobs successfully', async () => {
      (jobRepository.validateActive as jest.Mock).mockResolvedValue(undefined);

      await jobLogicService.handleValidateActive('test_table', ConfigType.PULL);

      expect(jobRepository.validateActive).toHaveBeenCalledWith('test_table', ConfigType.PULL);
    });

    it('should throw error when active validation fails', async () => {
      (jobRepository.validateActive as jest.Mock).mockRejectedValue(new Error('Active validation failed'));

      await expect(jobLogicService.handleValidateActive('test_table', ConfigType.PUSH)).rejects.toThrow('Active validation failed');
    });
  });
});
