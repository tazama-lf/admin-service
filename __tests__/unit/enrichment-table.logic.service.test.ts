// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/enrichment-tables.repository', () => ({
  createEnrichmentTableInDb: jest.fn(),
  getNextEnrichmentTableOrderInDb: jest.fn(),
  updateEnrichmentTableInDb: jest.fn(),
  getEnrichmentTablesByGenerationId: jest.fn(),
  deleteEnrichmentTableInDb: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/enrichment-field-strategies.repository', () => ({
  getEnrichmentFieldStrategiesByTableId: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { HttpException } from '../../src/utils/error';
import * as enrichmentTableRepo from '../../src/repositories/simulation-studio/enrichment-tables.repository';
import * as enrichmentFieldStrategiesRepo from '../../src/repositories/simulation-studio/enrichment-field-strategies.repository';
import {
  createEnrichmentTable,
  getEnrichmentTables,
  getEnrichmentTablesWithStrategies,
  bulkUpdateEnrichmentTables,
  deleteEnrichmentTable,
} from '../../src/services/enrichment-table.logic.service';
import type { SuiteEnrichmentTable } from '../../src/interface/suite-generation.interface';

const mockTable: SuiteEnrichmentTable = {
  id: 30,
  generation_id: 1,
  table_name: 'account_enrichment',
  table_order: 1,
  row_count: 13,
  payload_template_json: { name: 'feeba', country: 'Pak' },
  faker_profile: {},
  created_at: new Date(),
};

beforeEach(() => jest.clearAllMocks());

// ── createEnrichmentTable ────────────────────────────────────────────────────

describe('createEnrichmentTable', () => {
  it('inserts table and returns SuiteEnrichmentTable', async () => {
    (enrichmentTableRepo.getNextEnrichmentTableOrderInDb as jest.Mock).mockResolvedValue(1);
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);

    const result = await createEnrichmentTable(1, 'account_enrichment', 13, { name: 'feeba', country: 'Pak' });

    expect(enrichmentTableRepo.createEnrichmentTableInDb).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_id: 1,
        table_name: 'account_enrichment',
        table_order: 1,
        row_count: 13,
        payload_template_json: { name: 'feeba', country: 'Pak' },
      }),
    );
    expect(result.id).toBe(30);
    expect(result.table_name).toBe('account_enrichment');
    expect(result.row_count).toBe(13);
  });

  it('passes schema_template_json to createEnrichmentTableInDb', async () => {
    (enrichmentTableRepo.getNextEnrichmentTableOrderInDb as jest.Mock).mockResolvedValue(1);
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);

    await createEnrichmentTable(1, 'cnic', 5, { id: '123' }, { col: 'VARCHAR' });

    expect(enrichmentTableRepo.createEnrichmentTableInDb).toHaveBeenCalledWith(
      expect.objectContaining({ schema_template_json: { col: 'VARCHAR' } }),
    );
  });

  it('omits optional fields when not provided', async () => {
    (enrichmentTableRepo.getNextEnrichmentTableOrderInDb as jest.Mock).mockResolvedValue(1);
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);

    await createEnrichmentTable(1, 'bare', 1);

    expect(enrichmentTableRepo.createEnrichmentTableInDb).toHaveBeenCalledWith(
      expect.objectContaining({ generation_id: 1, table_name: 'bare', row_count: 1 }),
    );
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentTableRepo.getNextEnrichmentTableOrderInDb as jest.Mock).mockResolvedValue(1);
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(createEnrichmentTable(1, 'cnic', 1)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    (enrichmentTableRepo.getNextEnrichmentTableOrderInDb as jest.Mock).mockResolvedValue(1);
    const err = new HttpException('conflict', 409);
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockRejectedValue(err);
    await expect(createEnrichmentTable(1, 'cnic', 1)).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (enrichmentTableRepo.getNextEnrichmentTableOrderInDb as jest.Mock).mockResolvedValue(1);
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockRejectedValue('string error');
    await expect(createEnrichmentTable(1, 'cnic', 1)).rejects.toMatchObject({ status: 500 });
  });
});

// ── getEnrichmentTables ──────────────────────────────────────────────────────

describe('getEnrichmentTables', () => {
  it('returns all tables for a generation', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable]);

    const result = await getEnrichmentTables(1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(30);
    expect(result[0].table_name).toBe('account_enrichment');
    expect(result[0].row_count).toBe(13);
    expect(enrichmentTableRepo.getEnrichmentTablesByGenerationId).toHaveBeenCalledWith(1);
  });

  it('returns empty array when no tables', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([]);
    expect(await getEnrichmentTables(1)).toEqual([]);
  });

  it('returns multiple tables', async () => {
    const table2 = { ...mockTable, id: 31, table_name: 'cnic' };
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable, table2]);

    const result = await getEnrichmentTables(1);

    expect(result).toHaveLength(2);
    expect(result[1].id).toBe(31);
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getEnrichmentTables(1)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockRejectedValue('string error');
    await expect(getEnrichmentTables(1)).rejects.toMatchObject({ status: 500 });
  });
});

// ── bulkUpdateEnrichmentTables ───────────────────────────────────────────────

describe('bulkUpdateEnrichmentTables', () => {
  beforeEach(() => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable]);
  });

  it('calls updateEnrichmentTableInDb with id and update fields, returns updated list', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);

    const result = await bulkUpdateEnrichmentTables(1, [{ id: 30, row_count: 5 }]);

    expect(enrichmentTableRepo.updateEnrichmentTableInDb).toHaveBeenCalledWith(30, 1, { row_count: 5 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(30);
  });

  it('skips updateEnrichmentTableInDb when no scalar update fields provided', async () => {
    await bulkUpdateEnrichmentTables(1, [{ id: 30 }]);

    expect(enrichmentTableRepo.updateEnrichmentTableInDb).not.toHaveBeenCalled();
  });

  it('processes multiple items in parallel', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable, { ...mockTable, id: 31 }]);

    await bulkUpdateEnrichmentTables(1, [
      { id: 30, row_count: 5 },
      { id: 31, row_count: 10 },
    ]);

    expect(enrichmentTableRepo.updateEnrichmentTableInDb).toHaveBeenCalledTimes(2);
    expect(enrichmentTableRepo.updateEnrichmentTableInDb).toHaveBeenCalledWith(30, 1, { row_count: 5 });
    expect(enrichmentTableRepo.updateEnrichmentTableInDb).toHaveBeenCalledWith(31, 1, { row_count: 10 });
  });

  it('throws 404 when an update target is outside the generation', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockResolvedValue(null);
    await expect(bulkUpdateEnrichmentTables(1, [{ id: 30, row_count: 5 }])).rejects.toMatchObject({ status: 404 });
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(bulkUpdateEnrichmentTables(1, [{ id: 30, row_count: 5 }])).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('not found', 404);
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockRejectedValue(err);
    await expect(bulkUpdateEnrichmentTables(1, [{ id: 30, row_count: 5 }])).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockRejectedValue('string error');
    await expect(bulkUpdateEnrichmentTables(1, [{ id: 30, row_count: 5 }])).rejects.toMatchObject({ status: 500 });
  });
});

// ── deleteEnrichmentTable ────────────────────────────────────────────────────

describe('deleteEnrichmentTable', () => {
  it('deletes table successfully (field strategies cascade via FK)', async () => {
    (enrichmentTableRepo.deleteEnrichmentTableInDb as jest.Mock).mockResolvedValue(true);
    await expect(deleteEnrichmentTable(30)).resolves.toBeUndefined();
    expect(enrichmentTableRepo.deleteEnrichmentTableInDb).toHaveBeenCalledWith(30);
  });

  it('throws 404 when table not found', async () => {
    (enrichmentTableRepo.deleteEnrichmentTableInDb as jest.Mock).mockResolvedValue(false);
    await expect(deleteEnrichmentTable(999)).rejects.toMatchObject({ status: 404 });
  });

  it('wraps DB error in HttpException 500', async () => {
    (enrichmentTableRepo.deleteEnrichmentTableInDb as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(deleteEnrichmentTable(30)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('forbidden', 403);
    (enrichmentTableRepo.deleteEnrichmentTableInDb as jest.Mock).mockRejectedValue(err);
    await expect(deleteEnrichmentTable(30)).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (enrichmentTableRepo.deleteEnrichmentTableInDb as jest.Mock).mockRejectedValue('string error');
    await expect(deleteEnrichmentTable(30)).rejects.toMatchObject({ status: 500 });
  });
});

describe('getEnrichmentTablesWithStrategies', () => {
  it('returns tables with their field strategies', async () => {
    const strategies = [{ id: 1, table_id: 30, field_name: 'account' }];
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable] as never);
    (enrichmentFieldStrategiesRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockResolvedValue(strategies as never);

    const result = await getEnrichmentTablesWithStrategies(1);

    expect(result).toEqual([{ ...mockTable, field_strategies: strategies }]);
    expect(enrichmentFieldStrategiesRepo.getEnrichmentFieldStrategiesByTableId).toHaveBeenCalledWith(mockTable.id);
  });

  it('returns empty array when no tables exist', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([] as never);

    const result = await getEnrichmentTablesWithStrategies(1);

    expect(result).toEqual([]);
    expect(enrichmentFieldStrategiesRepo.getEnrichmentFieldStrategiesByTableId).not.toHaveBeenCalled();
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockRejectedValue(new Error('db fail') as never);

    await expect(getEnrichmentTablesWithStrategies(1)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('not found', 404);
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockRejectedValue(err as never);

    await expect(getEnrichmentTablesWithStrategies(1)).rejects.toBe(err);
  });
});
