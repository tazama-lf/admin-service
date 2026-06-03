// SPDX-License-Identifier: Apache-2.0
import type {
  EnrichmentFieldStrategy,
  EnrichmentTableWithStrategies,
  BulkEnrichmentUpdateItemDto,
} from '../interface/suite-generation.interface';
import {
  createEnrichmentTableInDb,
  updateEnrichmentTableInDb,
  getEnrichmentTablesByGenerationId,
  deleteEnrichmentTableInDb,
} from '../repositories/simulation-studio/enrichment-tables.repository';
import {
  upsertEnrichmentFieldStrategyInDb,
  getEnrichmentFieldStrategiesByTableId,
} from '../repositories/simulation-studio/enrichment-field-strategies.repository';
import { HttpException, HttpStatus } from '../utils/error';

// ── Internal helpers ─────────────────────────────────────────────────────────

const flattenColumnNames = (obj: unknown, prefix = ''): string[] => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
      return flattenColumnNames(val, path);
    }
    return [path];
  });
};

// ── Step 4: Create enrichment table ──────────────────────────────────────────

/**
 * POST — creates enrichment table row + seeds all payload column names with strategy_code = 'null'.
 */
export const createEnrichmentTable = async (
  generationId: number,
  tableName: string,
  rowCount: number,
  payloadTemplateJson?: Record<string, unknown>,
  schemaTemplateJson?: Record<string, unknown>,
): Promise<EnrichmentTableWithStrategies> => {
  try {
    const table = await createEnrichmentTableInDb({
      generation_id: generationId,
      table_name: tableName,
      row_count: rowCount,
      payload_template_json: payloadTemplateJson,
      schema_template_json: schemaTemplateJson,
    });

    const columnNames = flattenColumnNames(payloadTemplateJson ?? {});
    const fieldStrategies = await Promise.all(
      columnNames.map(async (col) => await upsertEnrichmentFieldStrategyInDb(table.id, { column_name: col, strategy_code: 'null' })),
    );

    return {
      enrichment_table_id: table.id,
      table_name: table.table_name,
      table_order: table.table_order,
      row_count: table.row_count,
      payload_template_json: table.payload_template_json,
      schema_template_json: table.schema_template_json,
      field_strategies: fieldStrategies,
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create enrichment table: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 4: GET all ───────────────────────────────────────────────────────────

export const getEnrichmentTablesWithStrategies = async (generationId: number): Promise<EnrichmentTableWithStrategies[]> => {
  try {
    const tables = await getEnrichmentTablesByGenerationId(generationId);
    return await Promise.all(
      tables.map(async (table) => {
        const fieldStrategies = await getEnrichmentFieldStrategiesByTableId(table.id);
        return {
          enrichment_table_id: table.id,
          table_name: table.table_name,
          table_order: table.table_order,
          row_count: table.row_count,
          payload_template_json: table.payload_template_json,
          schema_template_json: table.schema_template_json,
          field_strategies: fieldStrategies,
        };
      }),
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve enrichment tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 4: Bulk update ───────────────────────────────────────────────────────

export const bulkUpdateEnrichmentTables = async (
  generationId: number,
  items: BulkEnrichmentUpdateItemDto[],
): Promise<EnrichmentTableWithStrategies[]> => {
  try {
    await Promise.all(
      items.map(async (item) => {
        const { enrichment_table_id: tableId, field_strategies: fieldStrategies, ...updateFields } = item;
        if (Object.keys(updateFields).length > 0) {
          await updateEnrichmentTableInDb(tableId, updateFields);
        }
        if (Array.isArray(fieldStrategies) && fieldStrategies.length > 0) {
          await Promise.all(fieldStrategies.map(async (s) => await upsertEnrichmentFieldStrategyInDb(tableId, s)));
        }
      }),
    );
    return await getEnrichmentTablesWithStrategies(generationId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to bulk update enrichment tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 4: Delete ────────────────────────────────────────────────────────────

export const deleteEnrichmentTable = async (tableId: number): Promise<void> => {
  try {
    const deleted = await deleteEnrichmentTableInDb(tableId);
    if (!deleted) throw new HttpException(`Enrichment table ${tableId} not found`, HttpStatus.NOT_FOUND);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to delete enrichment table: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Read helper ───────────────────────────────────────────────────────────────

export const getEnrichmentFieldStrategiesForTable = async (enrichmentTableId: number): Promise<EnrichmentFieldStrategy[]> => {
  try {
    return await getEnrichmentFieldStrategiesByTableId(enrichmentTableId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve enrichment field strategies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
