// SPDX-License-Identifier: Apache-2.0
import type {
  SuiteEnrichmentTable,
  SuiteEnrichmentTableWithStrategies,
  BulkEnrichmentUpdateItemDto,
} from '../interface/simulation-studio/suite-generation.interface';
import {
  createEnrichmentTableInDb,
  getNextEnrichmentTableOrderInDb,
  updateEnrichmentTableInDb,
  getEnrichmentTablesByGenerationId,
  deleteEnrichmentTableInDb,
} from '../repositories/simulation-studio/enrichment-tables.repository';
import { getEnrichmentFieldStrategiesByTableId } from '../repositories/simulation-studio/enrichment-field-strategies.repository';
import { HttpException, HttpStatus } from '../utils/error';

export const createEnrichmentTable = async (
  generationId: number,
  tableName: string,
  rowCount: number,
  payloadTemplateJson?: Record<string, unknown>,
  schemaTemplateJson?: Record<string, unknown>,
): Promise<SuiteEnrichmentTable> => {
  try {
    // Keep ordering stable by assigning the next server-side order for the generation.
    const tableOrder = await getNextEnrichmentTableOrderInDb(generationId);
    const table = await createEnrichmentTableInDb({
      generation_id: generationId,
      table_name: tableName,
      table_order: tableOrder,
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

export const getEnrichmentTables = async (generationId: number): Promise<SuiteEnrichmentTable[]> => {
  try {
    return await getEnrichmentTablesByGenerationId(generationId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve enrichment tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getEnrichmentTablesWithStrategies = async (generationId: number): Promise<SuiteEnrichmentTableWithStrategies[]> => {
  try {
    const tables = await getEnrichmentTablesByGenerationId(generationId);
    return await Promise.all(
      tables.map(async (table) => ({
        ...table,
        field_strategies: await getEnrichmentFieldStrategiesByTableId(table.id),
      })),
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve enrichment tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const bulkUpdateEnrichmentTables = async (
  generationId: number,
  items: BulkEnrichmentUpdateItemDto[],
): Promise<SuiteEnrichmentTable[]> => {
  try {
    await Promise.all(
      items.map(async (item) => {
        const { id: tableId, ...updateFields } = item;
        if (!Number.isInteger(tableId) || tableId <= 0) return;
        if (Object.keys(updateFields).length > 0) {
          const updated = await updateEnrichmentTableInDb(tableId, generationId, updateFields);
          if (!updated) {
            throw new HttpException(`Enrichment table ${tableId} not found for generation ${generationId}`, HttpStatus.NOT_FOUND);
          }
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
