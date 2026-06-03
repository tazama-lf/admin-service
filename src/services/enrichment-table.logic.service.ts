// SPDX-License-Identifier: Apache-2.0
import type { SuiteEnrichmentTable, BulkEnrichmentUpdateItemDto } from '../interface/suite-generation.interface';
import {
  createEnrichmentTableInDb,
  updateEnrichmentTableInDb,
  getEnrichmentTablesByGenerationId,
  deleteEnrichmentTableInDb,
} from '../repositories/simulation-studio/enrichment-tables.repository';
import { HttpException, HttpStatus } from '../utils/error';

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
): Promise<SuiteEnrichmentTable> => {
  try {
    const table = await createEnrichmentTableInDb({
      generation_id: generationId,
      table_name: tableName,
      row_count: rowCount,
      payload_template_json: payloadTemplateJson,
      schema_template_json: schemaTemplateJson,
    });

    return table;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create enrichment table: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 4: GET all ───────────────────────────────────────────────────────────

export const getEnrichmentTables = async (generationId: number): Promise<SuiteEnrichmentTable[]> => {
  try {
    const tables = await getEnrichmentTablesByGenerationId(generationId);
    return tables;
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
): Promise<SuiteEnrichmentTable[]> => {
  try {
    await Promise.all(
      items.map(async (item) => {
        const { id: tableId, ...updateFields } = item;
        if (Object.keys(updateFields).length > 0) {
          await updateEnrichmentTableInDb(tableId, updateFields);
        }
      }),
    );
    return await getEnrichmentTables(generationId);
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
