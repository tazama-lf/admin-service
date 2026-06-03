// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/enrichment-tables.repository', () => ({
  createEnrichmentTableInDb: jest.fn(),
  updateEnrichmentTableInDb: jest.fn(),
  getEnrichmentTablesByGenerationId: jest.fn(),
  deleteEnrichmentTableInDb: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/enrichment-field-strategies.repository', () => ({
  upsertEnrichmentFieldStrategyInDb: jest.fn(),
  getEnrichmentFieldStrategiesByTableId: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { HttpException } from '../../src/utils/error';
import * as enrichmentTableRepo from '../../src/repositories/simulation-studio/enrichment-tables.repository';
import * as enrichmentStrategyRepo from '../../src/repositories/simulation-studio/enrichment-field-strategies.repository';
import {
  createEnrichmentTable,
  getEnrichmentTablesWithStrategies,
  bulkUpdateEnrichmentTables,
  deleteEnrichmentTable,
  getEnrichmentFieldStrategiesForTable,
} from '../../src/services/enrichment-table.logic.service';
import type { SuiteEnrichmentTable, EnrichmentFieldStrategy } from '../../src/interface/suite-generation.interface';

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

const mockFieldStrategy: EnrichmentFieldStrategy = {
  id: 1,
  enrichment_table_id: 30,
  column_name: 'name',
  strategy_code: 'null',
  generator_options: {},
  created_at: new Date(),
};

beforeEach(() => jest.clearAllMocks());

// ── createEnrichmentTable ────────────────────────────────────────────────────

describe('createEnrichmentTable', () => {
  it('inserts table, seeds null strategy for each payload column', async () => {
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);
    (enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await createEnrichmentTable(1, 'account_enrichment', 13, { name: 'feeba', country: 'Pak' });

    expect(enrichmentTableRepo.createEnrichmentTableInDb).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_id: 1,
        table_name: 'account_enrichment',
        row_count: 13,
        payload_template_json: { name: 'feeba', country: 'Pak' },
      }),
    );
    // payload has 2 leaf columns: name, country
    expect(enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb).toHaveBeenCalledTimes(2);
    expect(enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb).toHaveBeenCalledWith(
      30,
      expect.objectContaining({ strategy_code: 'null' }),
    );
    expect(result.enrichment_table_id).toBe(30);
    expect(result.table_name).toBe('account_enrichment');
    expect(result.row_count).toBe(13);
    expect(result.field_strategies).toHaveLength(2);
  });

  it('seeds no strategies when payload is empty or undefined', async () => {
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockResolvedValue({ ...mockTable, payload_template_json: {} });
    (enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await createEnrichmentTable(1, 'empty_table', 1, {});

    expect(enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb).not.toHaveBeenCalled();
    expect(result.field_strategies).toHaveLength(0);
  });

  it('passes schema_template_json to createEnrichmentTableInDb', async () => {
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);
    (enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createEnrichmentTable(1, 'cnic', 5, { id: '123' }, { col: 'VARCHAR' });

    expect(enrichmentTableRepo.createEnrichmentTableInDb).toHaveBeenCalledWith(
      expect.objectContaining({ schema_template_json: { col: 'VARCHAR' } }),
    );
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(createEnrichmentTable(1, 'cnic', 1)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('conflict', 409);
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockRejectedValue(err);
    await expect(createEnrichmentTable(1, 'cnic', 1)).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (enrichmentTableRepo.createEnrichmentTableInDb as jest.Mock).mockRejectedValue('string error');
    await expect(createEnrichmentTable(1, 'cnic', 1)).rejects.toMatchObject({ status: 500 });
  });
});

// ── getEnrichmentTablesWithStrategies ────────────────────────────────────────

describe('getEnrichmentTablesWithStrategies', () => {
  it('returns all tables with their field strategies', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable]);
    (enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getEnrichmentTablesWithStrategies(1);

    expect(result).toHaveLength(1);
    expect(result[0].enrichment_table_id).toBe(30);
    expect(result[0].row_count).toBe(13);
    expect(result[0].field_strategies).toEqual([mockFieldStrategy]);
    expect(enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId).toHaveBeenCalledWith(30);
  });

  it('returns empty array when no tables', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([]);
    expect(await getEnrichmentTablesWithStrategies(1)).toEqual([]);
  });

  it('fetches strategies for each table independently', async () => {
    const table2 = { ...mockTable, id: 31, table_name: 'cnic' };
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable, table2]);
    (enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getEnrichmentTablesWithStrategies(1);

    expect(result).toHaveLength(2);
    expect(enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId).toHaveBeenCalledTimes(2);
    expect(enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId).toHaveBeenCalledWith(30);
    expect(enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId).toHaveBeenCalledWith(31);
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getEnrichmentTablesWithStrategies(1)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockRejectedValue('string error');
    await expect(getEnrichmentTablesWithStrategies(1)).rejects.toMatchObject({ status: 500 });
  });
});

// ── bulkUpdateEnrichmentTables ───────────────────────────────────────────────

describe('bulkUpdateEnrichmentTables', () => {
  beforeEach(() => {
    (enrichmentTableRepo.getEnrichmentTablesByGenerationId as jest.Mock).mockResolvedValue([mockTable]);
    (enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockResolvedValue([mockFieldStrategy]);
  });

  it('updates row_count and upserts strategies, returns updated tables', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);
    (enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await bulkUpdateEnrichmentTables(1, [
      {
        enrichment_table_id: 30,
        row_count: 5,
        field_strategies: [{ column_name: 'name', strategy_code: 'static', static_value: 'Ahmad' }],
      },
    ]);

    expect(enrichmentTableRepo.updateEnrichmentTableInDb).toHaveBeenCalledWith(30, { row_count: 5 });
    expect(enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb).toHaveBeenCalledWith(30, {
      column_name: 'name',
      strategy_code: 'static',
      static_value: 'Ahmad',
    });
    expect(result[0].enrichment_table_id).toBe(30);
  });

  it('skips update when no scalar fields provided', async () => {
    (enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await bulkUpdateEnrichmentTables(1, [{ enrichment_table_id: 30, field_strategies: [{ column_name: 'name', strategy_code: 'null' }] }]);

    expect(enrichmentTableRepo.updateEnrichmentTableInDb).not.toHaveBeenCalled();
    expect(enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb).toHaveBeenCalledTimes(1);
  });

  it('skips upsert when field_strategies is empty', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);

    await bulkUpdateEnrichmentTables(1, [{ enrichment_table_id: 30, row_count: 3, field_strategies: [] }]);

    expect(enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb).not.toHaveBeenCalled();
  });

  it('skips upsert when field_strategies absent', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockResolvedValue(mockTable);

    await bulkUpdateEnrichmentTables(1, [{ enrichment_table_id: 30, row_count: 3 }]);

    expect(enrichmentStrategyRepo.upsertEnrichmentFieldStrategyInDb).not.toHaveBeenCalled();
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(bulkUpdateEnrichmentTables(1, [{ enrichment_table_id: 30, row_count: 5 }])).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('not found', 404);
    (enrichmentTableRepo.updateEnrichmentTableInDb as jest.Mock).mockRejectedValue(err);
    await expect(bulkUpdateEnrichmentTables(1, [{ enrichment_table_id: 30, row_count: 5 }])).rejects.toBe(err);
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
});

// ── getEnrichmentFieldStrategiesForTable ─────────────────────────────────────

describe('getEnrichmentFieldStrategiesForTable', () => {
  it('returns field strategies for a table', async () => {
    (enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockResolvedValue([mockFieldStrategy]);
    const result = await getEnrichmentFieldStrategiesForTable(30);
    expect(result).toEqual([mockFieldStrategy]);
    expect(enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId).toHaveBeenCalledWith(30);
  });

  it('returns empty array when no strategies', async () => {
    (enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockResolvedValue([]);
    expect(await getEnrichmentFieldStrategiesForTable(30)).toEqual([]);
  });

  it('wraps error in HttpException 500', async () => {
    (enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getEnrichmentFieldStrategiesForTable(30)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (enrichmentStrategyRepo.getEnrichmentFieldStrategiesByTableId as jest.Mock).mockRejectedValue('string error');
    await expect(getEnrichmentFieldStrategiesForTable(30)).rejects.toMatchObject({ status: 500 });
  });
});
