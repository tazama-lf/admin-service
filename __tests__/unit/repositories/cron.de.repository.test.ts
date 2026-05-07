// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src/utils/enrichment-utils', () => ({
  validateColumnKeys: jest.fn(),
}));

import {
  createCronJob,
  findCronJobById,
  updateCronJob,
  getAllCronJobs,
  getCronJobByStatus,
  updateCronJobByStatus,
} from '../../../src/repositories/dataEnrichment/cron.de.repository';
import { validateColumnKeys } from '../../../src/utils/enrichment-utils';
import { JobStatus } from '../../../src/interface/data-enrichment.interface';

const mockValidateColumnKeys = validateColumnKeys as jest.MockedFunction<typeof validateColumnKeys>;

describe('Cron DE Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCronJob', () => {
    const mockCronData = {
      name: 'test-cron',
      cron: '0 0 * * *',
      iterations: 5,
      status: JobStatus.PENDING,
      tenant_id: 'tenant-123',
      comments: 'Test cron job',
      schedule_id: 'schedule-1',
    };

    it('should create a cron job successfully and return the inserted id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 42 }],
        rowCount: 1,
      });

      const result = await createCronJob(mockCronData);

      expect(result).toBe(42);
      expect(mockValidateColumnKeys).toHaveBeenCalledWith(Object.keys(mockCronData), expect.any(Set), 'tcs_cron_jobs insert');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO tcs_cron_jobs'),
          values: Object.values(mockCronData),
        }),
        'configuration',
      );
    });

    it('should exclude id from insert if present in cronData', async () => {
      const cronDataWithId = { id: 999, ...mockCronData };
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 42 }],
        rowCount: 1,
      });

      const result = await createCronJob(cronDataWithId);

      expect(result).toBe(42);
      expect(mockValidateColumnKeys).toHaveBeenCalledWith(Object.keys(mockCronData), expect.any(Set), 'tcs_cron_jobs insert');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: Object.values(mockCronData),
        }),
        'configuration',
      );
    });

    it('should throw error when no ID is returned', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(createCronJob(mockCronData)).rejects.toThrow('Failed to create cron job: Failed to insert cron job: No ID returned.');
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database connection failed'));

      await expect(createCronJob(mockCronData)).rejects.toThrow('Failed to create cron job: Database connection failed');
    });

    it('should throw error when validateColumnKeys fails', async () => {
      mockValidateColumnKeys.mockImplementation(() => {
        throw new Error('Invalid column key');
      });

      await expect(createCronJob(mockCronData)).rejects.toThrow('Failed to create cron job: Invalid column key');
    });
  });

  describe('findCronJobById', () => {
    const mockCronJob = {
      id: 'cron-123',
      name: 'test-cron',
      cron: '0 0 * * *',
      iterations: 5,
      status: JobStatus.PENDING,
      tenant_id: 'tenant-123',
      comments: 'Test cron job',
      schedule_id: 'schedule-1',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    };

    it('should return cron job when found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockCronJob],
        rowCount: 1,
      });

      const result = await findCronJobById('cron-123');

      expect(result).toEqual(mockCronJob);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'SELECT * FROM tcs_cron_jobs WHERE id = $1 LIMIT 1;',
          values: ['cron-123'],
        }),
        'configuration',
      );
    });

    it('should return null when cron job not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findCronJobById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(findCronJobById('cron-123')).rejects.toThrow('Failed to find cron job: Database error');
    });
  });

  describe('updateCronJob', () => {
    const mockUpdateData = {
      name: 'updated-cron',
      status: JobStatus.APPROVED,
    };

    it('should update cron job successfully', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await updateCronJob('cron-123', mockUpdateData);

      expect(result).toBe(1);
      expect(mockValidateColumnKeys).toHaveBeenCalledWith(Object.keys(mockUpdateData), expect.any(Set), 'tcs_cron_jobs update');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UPDATE tcs_cron_jobs'),
          values: [...Object.values(mockUpdateData), 'cron-123'],
        }),
        'configuration',
      );
    });

    it('should include updated_at in SET clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await updateCronJob('cron-123', mockUpdateData);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('updated_at = NOW()'),
        }),
        'configuration',
      );
    });

    it('should throw error when cron job not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(updateCronJob('non-existent-id', mockUpdateData)).rejects.toThrow(
        'Failed to update cron job: No cron job found with id: non-existent-id',
      );
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(updateCronJob('cron-123', mockUpdateData)).rejects.toThrow('Failed to update cron job: Database error');
    });

    it('should throw error when validateColumnKeys fails', async () => {
      mockValidateColumnKeys.mockImplementation(() => {
        throw new Error('Invalid column');
      });

      await expect(updateCronJob('cron-123', mockUpdateData)).rejects.toThrow('Failed to update cron job: Invalid column');
    });
  });

  describe('getAllCronJobs', () => {
    const mockCronJobs = [
      {
        id: 'cron-1',
        name: 'test-cron-1',
        status: JobStatus.PENDING,
        tenant_id: 'tenant-123',
        created_at: new Date('2026-01-01'),
      },
      {
        id: 'cron-2',
        name: 'test-cron-2',
        status: JobStatus.APPROVED,
        tenant_id: 'tenant-123',
        created_at: new Date('2026-01-02'),
      },
    ];

    it('should return paginated cron jobs with default filters', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '2' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: mockCronJobs,
          rowCount: 2,
        });

      const result = await getAllCronJobs(10, 0, {}, 'tenant-123');

      expect(result).toEqual({
        data: mockCronJobs,
        total: 2,
        limit: 10,
        offset: 0,
      });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(2);
    });

    it('should filter by status', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [mockCronJobs[0]],
          rowCount: 1,
        });

      const result = await getAllCronJobs(10, 0, { status: 'PENDING' }, 'tenant-123');

      expect(result.total).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('status = ANY($2)'),
        }),
        'configuration',
      );
    });

    it('should filter by multiple statuses', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '2' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: mockCronJobs,
          rowCount: 2,
        });

      await getAllCronJobs(10, 0, { status: 'PENDING,APPROVED' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([['PENDING', 'APPROVED']]),
        }),
        'configuration',
      );
    });

    it('should filter by name with LIKE pattern', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [mockCronJobs[0]],
          rowCount: 1,
        });

      await getAllCronJobs(10, 0, { name: 'test' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('name LIKE'),
          values: expect.arrayContaining(['%test%']),
        }),
        'configuration',
      );
    });

    it('should filter by createdAt date', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [mockCronJobs[0]],
          rowCount: 1,
        });

      await getAllCronJobs(10, 0, { createdAt: '2026-01-01' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('DATE(created_at) ='),
          values: expect.arrayContaining(['2026-01-01']),
        }),
        'configuration',
      );
    });

    it('should combine multiple filters', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [mockCronJobs[0]],
          rowCount: 1,
        });

      await getAllCronJobs(10, 0, { status: 'PENDING', name: 'test', createdAt: '2026-01-01' }, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('status = ANY'),
        }),
        'configuration',
      );
    });

    it('should apply pagination with custom limit and offset', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '100' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: mockCronJobs,
          rowCount: 2,
        });

      const result = await getAllCronJobs(20, 40, {}, 'tenant-123');

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([20, 40]),
        }),
        'configuration',
      );
    });

    it('should order by updated_at DESC', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '2' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: mockCronJobs,
          rowCount: 2,
        });

      await getAllCronJobs(10, 0, {}, 'tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY updated_at DESC'),
        }),
        'configuration',
      );
    });
  });

  describe('getCronJobByStatus', () => {
    const mockCronJobs = [
      {
        id: 'cron-1',
        name: 'test-cron-1',
        status: JobStatus.PENDING,
        tenant_id: 'tenant-123',
        created_at: new Date('2026-01-01'),
      },
    ];

    it('should return cron jobs by status with pagination', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockCronJobs,
        rowCount: 1,
      });

      const result = await getCronJobByStatus('tenant-123', JobStatus.PENDING, 1, 10);

      expect(result).toEqual(mockCronJobs);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('WHERE tenant_id = $1'),
          values: ['tenant-123', JobStatus.PENDING, 10, 0],
        }),
        'configuration',
      );
    });

    it('should calculate correct offset for page 2', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockCronJobs,
        rowCount: 1,
      });

      await getCronJobByStatus('tenant-123', JobStatus.APPROVED, 2, 10);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([10, 10]),
        }),
        'configuration',
      );
    });

    it('should calculate correct offset for page 3 with custom limit', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getCronJobByStatus('tenant-123', JobStatus.REJECTED, 3, 20);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([20, 40]),
        }),
        'configuration',
      );
    });

    it('should order by created_at DESC', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockCronJobs,
        rowCount: 1,
      });

      await getCronJobByStatus('tenant-123', JobStatus.PENDING, 1, 10);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY created_at DESC'),
        }),
        'configuration',
      );
    });

    it('should return empty array when no jobs found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await getCronJobByStatus('tenant-123', JobStatus.PENDING, 1, 10);

      expect(result).toEqual([]);
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(getCronJobByStatus('tenant-123', JobStatus.PENDING, 1, 10)).rejects.toThrow('Failed to fetch cron jobs: Database error');
    });
  });

  describe('updateCronJobByStatus', () => {
    it('should update status to APPROVED without reason', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      const result = await updateCronJobByStatus(JobStatus.APPROVED, 'cron-123');

      expect(result).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('status = $1'),
          values: [JobStatus.APPROVED, 'cron-123'],
        }),
        'configuration',
      );
    });

    it('should update status to APPROVED with reason and include comments', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      const result = await updateCronJobByStatus(JobStatus.APPROVED, 'cron-123', 'Approved by admin');

      expect(result).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('comments = $2'),
          values: [JobStatus.APPROVED, 'Approved by admin', 'cron-123'],
        }),
        'configuration',
      );
    });

    it('should update status to REJECTED with reason', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      const result = await updateCronJobByStatus(JobStatus.REJECTED, 'cron-123', 'Invalid configuration');

      expect(result).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('comments = $2'),
          values: [JobStatus.REJECTED, 'Invalid configuration', 'cron-123'],
        }),
        'configuration',
      );
    });

    it('should update status to PENDING without comments', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      await updateCronJobByStatus(JobStatus.PENDING, 'cron-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [JobStatus.PENDING, 'cron-123'],
        }),
        'configuration',
      );
    });

    it('should include updated_at = NOW() in SET clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      await updateCronJobByStatus(JobStatus.APPROVED, 'cron-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('updated_at = NOW()'),
        }),
        'configuration',
      );
    });

    it('should include RETURNING id in query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      await updateCronJobByStatus(JobStatus.APPROVED, 'cron-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('RETURNING id'),
        }),
        'configuration',
      );
    });

    it('should throw error when cron job not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(updateCronJobByStatus(JobStatus.APPROVED, 'non-existent-id')).rejects.toThrow(
        'Failed to update cron job status: No cron job found with id: non-existent-id',
      );
    });

    it('should throw error when database operation fails', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Database error'));

      await expect(updateCronJobByStatus(JobStatus.APPROVED, 'cron-123')).rejects.toThrow(
        'Failed to update cron job status: Database error',
      );
    });
  });
});
