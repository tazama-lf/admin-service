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
import {
  getEnrichmentFieldStrategiesByTableId,
  insertEnrichmentFieldStrategyInDb,
  deleteEnrichmentFieldStrategiesByTableIdInDb,
} from '../repositories/simulation-studio/enrichment-field-strategies.repository';
import { fieldStrategiesFromSchemaTemplate } from '../utils/enrichment-schema-template';
import { HttpException, HttpStatus } from '../utils/error';

/**
 * Re-derive `trs_suite_enrichment_field_strategies` rows from the UI-supplied
 * schema_template_json. Replaces any existing rows for the table so the strategy
 * set always reflects the latest UI submission. No-op when no schema is supplied.
 */
const syncFieldStrategiesFromSchemaTemplate = async (
  tableId: number,
  schemaTemplateJson: Record<string, unknown> | undefined,
): Promise<void> => {
  if (schemaTemplateJson === undefined) return;
  await deleteEnrichmentFieldStrategiesByTableIdInDb(tableId);
  const rows = fieldStrategiesFromSchemaTemplate(schemaTemplateJson);
  for (const row of rows) {
    await insertEnrichmentFieldStrategyInDb(tableId, row);
  }
};

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
    await syncFieldStrategiesFromSchemaTemplate(table.id, schemaTemplateJson);
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
        // Re-sync field strategies whenever the UI sends a fresh schema_template_json.
        if (updateFields.schema_template_json !== undefined) {
          await syncFieldStrategiesFromSchemaTemplate(tableId, updateFields.schema_template_json);
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
