// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src/utils/enrichment-utils', () => ({
  validateColumnKeys: jest.fn(),
  validateTableName: jest.fn(),
}));

import {
  tableExist,
  validateExisting,
  validateActive,
  createPushJob,
  createPullJob,
  getJobHistory,
  getAllJobs,
  findJobById,
  getJobsByStatus,
  updateJob,
  updateJobActivation,
  updateJobByStatus,
} from '../../../src/repositories/dataEnrichment/job.de.repository';
import { validateColumnKeys, validateTableName } from '../../../src/utils/enrichment-utils';
import { ConfigType, JobStatus, ScheduleStatus } from '../../../src/interface/data-enrichment.interface';

const mockValidateColumnKeys = validateColumnKeys as jest.MockedFunction<typeof validateColumnKeys>;
const mockValidateTableName = validateTableName as jest.MockedFunction<typeof validateTableName>;

describe('Job DE Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tableExist', () => {
    it('should return true when table exists', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
      });

      const result = await tableExist('test_table');

      expect(result).toBe(true);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('SELECT EXISTS'),
          values: ['test_table'],
        }),
        'configuration',
      );
    });

    it('should return false when table does not exist', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ exists: false }],
        rowCount: 1,
      });

      const result = await tableExist('non_existent_table');

      expect(result).toBe(false);
    });

    it('should trim and lowercase table name', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
      });

      await tableExist('  TEST_TABLE  ');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['test_table'],
        }),
        'configuration',
      );
    });

    it('should return false when exists is undefined', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{}],
        rowCount: 1,
      });

      const result = await tableExist('test_table');

      expect(result).toBe(false);
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(tableExist('test_table')).rejects.toThrow('Failed to check if table "test_table" exists: Database error');
    });
  });

  describe('validateExisting', () => {
    it('should return true when table exists in database', async () => {
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pull jobs
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // push jobs
        .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 }); // tableExist

      const result = await validateExisting('test_table');

      expect(result).toBe(true);
      expect(mockValidateTableName).toHaveBeenCalledWith('test_table');
    });

    it('should return true when table exists in pull jobs', async () => {
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // pull jobs
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // push jobs
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }); // tableExist

      const result = await validateExisting('test_table');

      expect(result).toBe(true);
    });

    it('should return true when table exists in push jobs', async () => {
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pull jobs
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // push jobs
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }); // tableExist

      const result = await validateExisting('test_table');

      expect(result).toBe(true);
    });

    it('should return false when table does not exist anywhere', async () => {
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pull jobs
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // push jobs
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }); // tableExist

      const result = await validateExisting('test_table');

      expect(result).toBe(false);
    });

    it('should throw error when validateTableName fails', async () => {
      mockValidateTableName.mockImplementation(() => {
        throw new Error('Invalid table name');
      });

      await expect(validateExisting('bad_table')).rejects.toThrow('Failed to validate existing table "bad_table": Invalid table name');
    });
  });

  describe('validateActive', () => {
    it('should not throw error when no active jobs exist for pull type', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ count: '0' }],
        rowCount: 1,
      });

      await expect(validateActive('test_table', ConfigType.PULL)).resolves.not.toThrow();

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('tcs_pull_jobs'),
          values: ['test_table'],
        }),
        'configuration',
      );
    });

    it('should not throw error when no active jobs exist for push type', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ count: '0' }],
        rowCount: 1,
      });

      await expect(validateActive('test_table', ConfigType.PUSH)).resolves.not.toThrow();

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('tcs_push_jobs'),
        }),
        'configuration',
      );
    });

    it('should throw error when active jobs exist', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ count: '2' }],
        rowCount: 1,
      });

      await expect(validateActive('test_table', ConfigType.PULL)).rejects.toThrow('Deactivate jobs with the table name used');
    });

    it('should throw wrapped error for database failures', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(validateActive('test_table', ConfigType.PULL)).rejects.toThrow('Failed to validate active jobs for table "test_table"');
    });
  });

  describe('createPushJob', () => {
    const mockPushJob = {
      endpoint_name: 'test-endpoint',
      path: '/api/test',
      mode: 'batch',
      table_name: 'test_table',
      description: 'Test push job',
      version: 'v1',
      status: JobStatus.PENDING,
      publishing_status: 'inactive',
      tenant_id: 'tenant-123',
      comments: 'Test comments',
    };

    it('should create push job successfully and return the inserted id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 42 }],
        rowCount: 1,
      });

      const result = await createPushJob(mockPushJob);

      expect(result).toBe(42);
      expect(mockValidateColumnKeys).toHaveBeenCalledWith(Object.keys(mockPushJob), expect.any(Set), 'tcs_push_jobs insert');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO tcs_push_jobs'),
          values: Object.values(mockPushJob),
        }),
        'configuration',
      );
    });

    it('should validate active jobs when status is DEPLOYED', async () => {
      const deployedJob = { ...mockPushJob, status: JobStatus.DEPLOYED };
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // validateActive
        .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 }); // insert

      await createPushJob(deployedJob);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('COUNT(*)'),
        }),
        'configuration',
      );
    });

    it('should exclude id from insert if present in job data', async () => {
      const jobWithId = { id: 999, ...mockPushJob };
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 42 }],
        rowCount: 1,
      });

      const result = await createPushJob(jobWithId);

      expect(result).toBe(42);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: Object.values(mockPushJob),
        }),
        'configuration',
      );
    });

    it('should throw error when no ID is returned', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(createPushJob(mockPushJob)).rejects.toThrow('Failed to create job: Failed to insert push job: No ID returned.');
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(createPushJob(mockPushJob)).rejects.toThrow('Failed to create job: Database error');
    });
  });

  describe('createPullJob', () => {
    const mockPullJob = {
      endpoint_name: 'test-endpoint',
      mode: 'batch',
      table_name: 'test_table',
      description: 'Test pull job',
      source_type: 'database',
      file: null,
      connection: '{}',
      version: 'v1',
      status: JobStatus.PENDING,
      publishing_status: 'inactive',
      tenant_id: 'tenant-123',
      schedule_id: 'schedule-1',
      comments: 'Test comments',
    };

    it('should create pull job successfully when table does not exist', async () => {
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // validateExisting - pull
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // validateExisting - push
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }) // validateExisting - tableExist
        .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 }); // insert

      const result = await createPullJob(mockPullJob);

      expect(result).toEqual({
        success: true,
        message: 'Pull Job Created Successfully ',
      });
      expect(mockValidateColumnKeys).toHaveBeenCalledWith(Object.keys(mockPullJob), expect.any(Set), 'tcs_pull_jobs insert');
    });

    it('should create pull job successfully when table exists', async () => {
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // validateExisting - pull
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // validateExisting - push
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }) // validateExisting - tableExist
        .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 }); // insert

      const result = await createPullJob(mockPullJob);

      expect(result).toEqual({
        success: true,
        message: 'Pull Job Created Successfully with an existing table',
      });
    });

    it('should validate active jobs when status is DEPLOYED', async () => {
      const deployedJob = { ...mockPullJob, status: JobStatus.DEPLOYED };
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // validateExisting - pull
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // validateExisting - push
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }) // validateExisting - tableExist
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // validateActive
        .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 }); // insert

      await createPullJob(deployedJob);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('COUNT(*)'),
        }),
        'configuration',
      );
    });

    it('should exclude id from insert if present in job data', async () => {
      const jobWithId = { id: 999, ...mockPullJob };
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // validateExisting - pull
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // validateExisting - push
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }) // validateExisting - tableExist
        .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 }); // insert

      await createPullJob(jobWithId);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: Object.values(mockPullJob),
        }),
        'configuration',
      );
    });

    it('should throw error when database operation fails', async () => {
      mockValidateTableName.mockImplementation(() => {});
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(createPullJob(mockPullJob)).rejects.toThrow('Failed to create pull job');
    });
  });

  describe('getJobHistory', () => {
    const mockJobHistory = [
      {
        id: 'history-1',
        job_id: 'job-1',
        job_type: 'pull',
        tenant_id: 'tenant-123',
        created_at: new Date('2026-01-01'),
        exception: null,
        endpoint_name: 'test-endpoint',
        table_name: 'test_table',
      },
    ];

    it('should return paginated job history with default filters', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 }) // count
        .mockResolvedValueOnce({ rows: mockJobHistory, rowCount: 1 }); // data

      const result = await getJobHistory(10, 0, 'tenant-123', {});

      expect(result).toEqual({
        data: mockJobHistory,
        total: 1,
        limit: 10,
        offset: 0,
      });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(2);
    });

    it('should filter by createdAt', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockJobHistory, rowCount: 1 });

      await getJobHistory(10, 0, 'tenant-123', { createdAt: '2026-01-01' });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('DATE(ph.created_at) ='),
          values: expect.arrayContaining(['2026-01-01']),
        }),
        'configuration',
      );
    });

    it('should filter by exception with LIKE pattern', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockJobHistory, rowCount: 1 });

      await getJobHistory(10, 0, 'tenant-123', { exception: 'timeout' });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ph.exception LIKE'),
          values: expect.arrayContaining(['%timeout%']),
        }),
        'configuration',
      );
    });

    it('should filter by endpointName with ILIKE pattern', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockJobHistory, rowCount: 1 });

      await getJobHistory(10, 0, 'tenant-123', { endpointName: 'test' });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('pj.endpoint_name ILIKE'),
          values: expect.arrayContaining(['%test%']),
        }),
        'configuration',
      );
    });

    it('should combine multiple filters', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockJobHistory, rowCount: 1 });

      await getJobHistory(10, 0, 'tenant-123', { createdAt: '2026-01-01', exception: 'error', endpointName: 'test' });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining(['tenant-123', '2026-01-01', '%error%', '%test%']),
        }),
        'configuration',
      );
    });

    it('should apply pagination with custom limit and offset', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '100' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockJobHistory, rowCount: 1 });

      const result = await getJobHistory(20, 40, 'tenant-123', {});

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(getJobHistory(10, 0, 'tenant-123', {})).rejects.toThrow('Error fetching job_history: Database error');
    });
  });

  describe('getAllJobs', () => {
    const mockJobs = [
      {
        id: 'job-1',
        endpoint_name: 'test-endpoint',
        status: JobStatus.PENDING,
        tenant_id: 'tenant-123',
        type: 'push',
      },
      {
        id: 'job-2',
        endpoint_name: 'test-endpoint-2',
        status: JobStatus.APPROVED,
        tenant_id: 'tenant-123',
        type: 'pull',
      },
    ];

    it('should return paginated jobs with default filters', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 }) // count
        .mockResolvedValueOnce({ rows: mockJobs, rowCount: 2 }); // data

      const result = await getAllJobs(10, 0, {}, 'tenant-123');

      expect(result).toEqual({
        data: mockJobs,
        total: 2,
        limit: 10,
        offset: 0,
      });
    });

    it('should filter by status', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockJobs[0]], rowCount: 1 });

      await getAllJobs(10, 0, { status: 'PENDING' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('status = ANY'),
        }),
        'configuration',
      );
    });

    it('should filter by multiple statuses', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockJobs, rowCount: 2 });

      await getAllJobs(10, 0, { status: 'PENDING,APPROVED' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([['PENDING', 'APPROVED']]),
        }),
        'configuration',
      );
    });

    it('should filter by endpointName', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockJobs[0]], rowCount: 1 });

      await getAllJobs(10, 0, { endpointName: 'test' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('endpoint_name LIKE'),
          values: expect.arrayContaining(['%test%']),
        }),
        'configuration',
      );
    });

    it('should filter by createdAt', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockJobs[0]], rowCount: 1 });

      await getAllJobs(10, 0, { createdAt: '2026-01-01' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('DATE(created_at) ='),
          values: expect.arrayContaining(['2026-01-01']),
        }),
        'configuration',
      );
    });
  });

  describe('findJobById', () => {
    const mockJob = {
      id: 'job-123',
      endpoint_name: 'test-endpoint',
      status: JobStatus.PENDING,
      tenant_id: 'tenant-123',
    };

    it('should return job when found in tcs_push_jobs', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockJob],
        rowCount: 1,
      });

      const result = await findJobById('job-123', 'tcs_push_jobs');

      expect(result).toEqual(mockJob);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('SELECT * FROM tcs_push_jobs'),
          values: ['job-123'],
        }),
        'configuration',
      );
    });

    it('should return job when found in tcs_pull_jobs', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockJob],
        rowCount: 1,
      });

      const result = await findJobById('job-123', 'tcs_pull_jobs');

      expect(result).toEqual(mockJob);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('SELECT * FROM tcs_pull_jobs'),
        }),
        'configuration',
      );
    });

    it('should return null when job not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findJobById('non-existent-id', 'tcs_push_jobs');

      expect(result).toBeNull();
    });

    it('should throw error for invalid table name', async () => {
      await expect(findJobById('job-123', 'invalid_table')).rejects.toThrow('Failed to find job: Invalid table name: invalid_table');
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(findJobById('job-123', 'tcs_push_jobs')).rejects.toThrow('Failed to find job: Database error');
    });
  });

  describe('getJobsByStatus', () => {
    const mockJobSummaries = [
      {
        id: 'job-1',
        endpoint_name: 'test-endpoint',
        status: JobStatus.PENDING,
        type: 'push',
      },
    ];

    it('should return jobs by status with pagination', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockJobSummaries,
        rowCount: 1,
      });

      const result = await getJobsByStatus('tenant-123', JobStatus.PENDING, 1, 10);

      expect(result).toEqual(mockJobSummaries);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UNION ALL'),
          values: ['tenant-123', JobStatus.PENDING, 10, 0],
        }),
        'configuration',
      );
    });

    it('should calculate correct offset for page 2', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockJobSummaries,
        rowCount: 1,
      });

      await getJobsByStatus('tenant-123', JobStatus.APPROVED, 2, 10);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([10, 10]),
        }),
        'configuration',
      );
    });

    it('should return empty array when no jobs found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await getJobsByStatus('tenant-123', JobStatus.PENDING, 1, 10);

      expect(result).toEqual([]);
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(getJobsByStatus('tenant-123', JobStatus.PENDING, 1, 10)).rejects.toThrow('Failed to fetch jobs: Database error');
    });
  });

  describe('updateJob', () => {
    const mockUpdateData = {
      endpoint_name: 'updated-endpoint',
      status: JobStatus.APPROVED,
    };

    it('should update push job successfully', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 'job-123' }],
        rowCount: 1,
      });

      const result = await updateJob('job-123', mockUpdateData, ConfigType.PUSH);

      expect(result).toEqual({
        success: true,
        message: 'Job with id "job-123" successfully updated',
      });
      expect(mockValidateColumnKeys).toHaveBeenCalledWith(Object.keys(mockUpdateData), expect.any(Set), 'tcs_push_jobs update');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UPDATE tcs_push_jobs'),
          values: [...Object.values(mockUpdateData), 'job-123'],
        }),
        'configuration',
      );
    });

    it('should update pull job successfully', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 'job-123' }],
        rowCount: 1,
      });

      const result = await updateJob('job-123', mockUpdateData, ConfigType.PULL);

      expect(result).toEqual({
        success: true,
        message: 'Job with id "job-123" successfully updated',
      });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UPDATE tcs_pull_jobs'),
        }),
        'configuration',
      );
    });

    it('should include updated_at in SET clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 'job-123' }],
        rowCount: 1,
      });

      await updateJob('job-123', mockUpdateData, ConfigType.PUSH);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('updated_at = NOW()'),
        }),
        'configuration',
      );
    });

    it('should throw error when no fields provided', async () => {
      await expect(updateJob('job-123', {}, ConfigType.PUSH)).rejects.toThrow('Failed to update job: No fields provided to update');
    });

    it('should throw error when job not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(updateJob('non-existent-id', mockUpdateData, ConfigType.PUSH)).rejects.toThrow(
        'Failed to update job: Job with id "non-existent-id" not found or no changes were made',
      );
    });

    it('should throw error when validateColumnKeys fails', async () => {
      mockValidateColumnKeys.mockImplementation(() => {
        throw new Error('Invalid column');
      });

      await expect(updateJob('job-123', mockUpdateData, ConfigType.PUSH)).rejects.toThrow('Failed to update job: Invalid column');
    });
  });

  describe('updateJobActivation', () => {
    const mockJob = {
      id: 'job-123',
      table_name: 'test_table',
      status: JobStatus.PENDING,
    };

    it('should update push job activation to ACTIVE', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [mockJob], rowCount: 1 }) // findJobById
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // validateActive
        .mockResolvedValueOnce({ rows: [{ ...mockJob, publishing_status: 'active' }], rowCount: 1 }); // update

      const result = await updateJobActivation('job-123', ScheduleStatus.ACTIVE, ConfigType.PUSH);

      expect(result).toHaveLength(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UPDATE tcs_push_jobs'),
          values: [ScheduleStatus.ACTIVE, 'job-123'],
        }),
        'configuration',
      );
    });

    it('should update pull job activation to INACTIVE without validation', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [mockJob], rowCount: 1 }) // findJobById
        .mockResolvedValueOnce({ rows: [{ ...mockJob, publishing_status: 'inactive' }], rowCount: 1 }); // update

      const result = await updateJobActivation('job-123', ScheduleStatus.INACTIVE, ConfigType.PULL);

      expect(result).toHaveLength(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(2); // No validateActive call
    });

    it('should throw error when job not found', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // findJobById returns null
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // update returns empty

      await expect(updateJobActivation('non-existent-id', ScheduleStatus.ACTIVE, ConfigType.PUSH)).rejects.toThrow(
        'Failed to update job publishing status',
      );
    });

    it('should throw error when active jobs exist', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [mockJob], rowCount: 1 }) // findJobById
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 }); // validateActive

      await expect(updateJobActivation('job-123', ScheduleStatus.ACTIVE, ConfigType.PUSH)).rejects.toThrow(
        'Failed to update job publishing status: Deactivate jobs with the table name used',
      );
    });
  });

  describe('updateJobByStatus', () => {
    it('should update push job status to APPROVED without reason', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      const result = await updateJobByStatus(JobStatus.APPROVED, 'job-123', ConfigType.PUSH);

      expect(result).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UPDATE tcs_push_jobs'),
          values: [JobStatus.APPROVED, 'job-123'],
        }),
        'configuration',
      );
    });

    it('should update pull job status to APPROVED with reason', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      const result = await updateJobByStatus(JobStatus.APPROVED, 'job-123', ConfigType.PULL, 'Approved by admin');

      expect(result).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UPDATE tcs_pull_jobs'),
          values: [JobStatus.APPROVED, 'Approved by admin', 'job-123'],
        }),
        'configuration',
      );
    });

    it('should update status to REJECTED with reason', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      await updateJobByStatus(JobStatus.REJECTED, 'job-123', ConfigType.PUSH, 'Invalid configuration');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('comments = $2'),
          values: [JobStatus.REJECTED, 'Invalid configuration', 'job-123'],
        }),
        'configuration',
      );
    });

    it('should include updated_at and RETURNING id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      await updateJobByStatus(JobStatus.APPROVED, 'job-123', ConfigType.PUSH);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/updated_at = NOW\(\).*RETURNING id/s),
        }),
        'configuration',
      );
    });

    it('should throw error when job not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(updateJobByStatus(JobStatus.APPROVED, 'non-existent-id', ConfigType.PUSH)).rejects.toThrow(
        'Failed to update job status: No job found with id: non-existent-id',
      );
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(updateJobByStatus(JobStatus.APPROVED, 'job-123', ConfigType.PUSH)).rejects.toThrow(
        'Failed to update job status: Database error',
      );
    });
  });
});
