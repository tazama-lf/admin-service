// SPDX-License-Identifier: Apache-2.0
import type {
  ContextFieldStrategy,
  AddContextTxtpConfigDto,
  BulkConfigItemDto,
  ContextTxtpConfigWithStrategies,
  SuiteContextTxtpConfig,
} from '../interface/simulation-studio/suite-generation.interface';
import {
  createContextTxtpConfigInDb,
  updateContextTxtpConfigInDb,
  getContextTxtpConfigsByGenerationId,
  deleteContextTxtpConfigInDb,
  getContextTxtpConfigById,
} from '../repositories/simulation-studio/context-txtp-configs.repository';
import {
  upsertFieldStrategyInDb,
  getFieldStrategiesByContextConfigId,
} from '../repositories/simulation-studio/context-field-strategies.repository';
import { getSchemaByTransactionType } from '../repositories/configuration/tcs.config.repository';
import { ContentType } from '@tazama-lf/tcs-lib';
import { HttpException, HttpStatus } from '../utils/error';

// ── Internal helpers ─────────────────────────────────────────────────────────

const flattenSchemaPaths = (obj: unknown, prefix = ''): string[] => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
      return flattenSchemaPaths(val, path);
    }
    return [path];
  });
};

// ── Shared factory ───────────────────────────────────────────────────────────

/**
 * Creates a context txtp config row and seeds all field paths with strategy_code = 'keep_sample'.
 * Used by Step 1 (suite creation) and Step 2 (Add TXTP button).
 * Throws HttpException if tcs_config row not found.
 */
interface CreateConfigOptions {
  generationId: number;
  txtp: string;
  txtpVersion: string;
  messageCount: number;
  displayOrder: number;
  tenantId: string;
  relatedTxtpConfigId?: number | null;
}

export const createConfigWithDefaultStrategies = async (opts: CreateConfigOptions): Promise<ContextTxtpConfigWithStrategies> => {
  const { generationId, txtp, txtpVersion, messageCount, displayOrder, tenantId, relatedTxtpConfigId } = opts;
  const tcsRow = await getSchemaByTransactionType(txtp, txtpVersion, tenantId);
  const schema = tcsRow.schema as Record<string, unknown>;
  const samplePayload = (tcsRow.content_type === (ContentType.XML as string) ? tcsRow.payload_xml : tcsRow.payload_json) as
    | Record<string, unknown>
    | undefined;

  const config = await createContextTxtpConfigInDb({
    generation_id: generationId,
    txtp,
    txtp_version: txtpVersion,
    display_order: displayOrder,
    message_count: messageCount,
    schema_snapshot: schema,
    sample_payload_snapshot: samplePayload,
    related_txtp_config_id: relatedTxtpConfigId ?? null,
    related_transaction: tcsRow.related_transaction ?? null,
  });

  const schemaFallback = (schema.properties as Record<string, unknown> | undefined) ?? schema;
  const fieldPaths = flattenSchemaPaths(samplePayload ?? schemaFallback);
  const fieldStrategies = await Promise.all(
    fieldPaths.map(async (path) => await upsertFieldStrategyInDb(config.id, { field_path: path, strategy_code: 'keep_sample' })),
  );

  return {
    context_txtp_config_id: config.id,
    txtp: config.txtp,
    txtp_version: config.txtp_version,
    message_count: config.message_count,
    display_order: config.display_order,
    schema_snapshot: config.schema_snapshot,
    sample_payload_snapshot: config.sample_payload_snapshot,
    field_strategies: fieldStrategies,
    related_txtp_config_id: relatedTxtpConfigId ?? null,
    related_transaction: config.related_transaction ?? null,
  };
};

// ── Step 1 ───────────────────────────────────────────────────────────────────

/**
 * Called during suite creation. Creates the primary context txtp config (display_order=1)
 * with default keep_sample strategies. If the primary tcs_config has a related_transaction,
 * also creates a secondary config (display_order=2) with related_txtp_config_id pointing
 * back to the primary.
 *
 * Returns [primary, related?] — caller receives array but for suite creation only cares
 * about side-effects. Related config is created silently; if lookup fails it is skipped.
 */
export const createContextTxtpConfig = async (
  generationId: number,
  txtp: string,
  txtpVersion: string,
  tenantId: string,
): Promise<ContextTxtpConfigWithStrategies> => {
  try {
    const tcsRow = await getSchemaByTransactionType(txtp, txtpVersion, tenantId);

    const schema = tcsRow.schema as Record<string, unknown>;
    const samplePayload = (tcsRow.content_type === (ContentType.XML as string) ? tcsRow.payload_xml : tcsRow.payload_json) as
      | Record<string, unknown>
      | undefined;

    const primaryConfig = await createContextTxtpConfigInDb({
      generation_id: generationId,
      txtp,
      txtp_version: txtpVersion,
      display_order: 1,
      message_count: 100,
      schema_snapshot: schema,
      sample_payload_snapshot: samplePayload,
      related_txtp_config_id: null,
      related_transaction: tcsRow.related_transaction ?? null,
    });

    const schemaFallback = (schema.properties as Record<string, unknown> | undefined) ?? schema;
    const fieldPaths = flattenSchemaPaths(samplePayload ?? schemaFallback);
    const fieldStrategies = await Promise.all(
      fieldPaths.map(async (path) => await upsertFieldStrategyInDb(primaryConfig.id, { field_path: path, strategy_code: 'keep_sample' })),
    );

    // Create related config if tcs_config has related_transaction
    return {
      context_txtp_config_id: primaryConfig.id,
      txtp: primaryConfig.txtp,
      txtp_version: primaryConfig.txtp_version,
      message_count: primaryConfig.message_count,
      display_order: primaryConfig.display_order,
      schema_snapshot: primaryConfig.schema_snapshot,
      sample_payload_snapshot: primaryConfig.sample_payload_snapshot,
      related_txtp_config_id: null,
      related_transaction: primaryConfig.related_transaction ?? null,
      field_strategies: fieldStrategies,
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create context txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 2: Add TXTP ─────────────────────────────────────────────────────────

/**
 * Called when user clicks "Add TXTP". display_order = existing count + 1.
 */
export const addContextTxtpConfig = async (
  generationId: number,
  dto: AddContextTxtpConfigDto,
  tenantId: string,
): Promise<ContextTxtpConfigWithStrategies> => {
  try {
    const existing = await getContextTxtpConfigsByGenerationId(generationId);
    const displayOrder = existing.length + 1;

    const config = await createConfigWithDefaultStrategies({
      generationId,
      txtp: dto.txtp,
      txtpVersion: dto.txtp_version,
      messageCount: dto.message_count ?? 100,
      displayOrder,
      tenantId,
    });

    if (dto.related_context_txtp_id) {
      await getContextTxtpAnsAddRelatedConfig(dto.related_context_txtp_id, config.context_txtp_config_id);
    }
    return config;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to add context txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getContextTxtpAnsAddRelatedConfig = async (
  configId: number,
  relatedConfigId: number,
): Promise<SuiteContextTxtpConfig | null> => {
  const existingContextTxtp = await getContextTxtpConfigById(configId);
  if (!existingContextTxtp) {
    throw new HttpException(`Context txtp config with id ${configId} not found`, HttpStatus.NOT_FOUND);
  }

  const updatedContextTxtp = await updateContextTxtpConfigInDb(configId, { related_txtp_config_id: relatedConfigId });
  return updatedContextTxtp;
};
// ── Step 2: GET all ──────────────────────────────────────────────────────────

/**
 * Returns all context configs with field strategies for a generation.
 */
export const getContextConfigsWithStrategies = async (
  generationId: number,
  _tenantId?: string,
): Promise<ContextTxtpConfigWithStrategies[]> => {
  try {
    const configs = await getContextTxtpConfigsByGenerationId(generationId);
    return await Promise.all(
      configs.map(async (config) => {
        const fieldStrategies = await getFieldStrategiesByContextConfigId(config.id);
        return {
          context_txtp_config_id: config.id,
          txtp: config.txtp,
          txtp_version: config.txtp_version,
          message_count: config.message_count,
          display_order: config.display_order,
          schema_snapshot: config.schema_snapshot,
          sample_payload_snapshot: config.sample_payload_snapshot,
          related_txtp_config_id: config.related_txtp_config_id ?? null,
          related_transaction: config.related_transaction ?? null,
          field_strategies: fieldStrategies,
        };
      }),
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve context configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 2: Bulk update ──────────────────────────────────────────────────────

/**
 * Bulk update message_count + field strategies for all provided configs.
 * Silently skips missing context_txtp_config_id entries.
 * Returns full updated state for the generation.
 */
export const bulkUpdateContextConfigs = async (
  generationId: number,
  items: BulkConfigItemDto[],
  tenantId: string,
): Promise<ContextTxtpConfigWithStrategies[]> => {
  try {
    await Promise.all(
      items.map(async (item) => {
        const { context_txtp_config_id: contextTxtpConfigId, field_strategies: fieldStrategies, ...updateFields } = item;
        if (Object.keys(updateFields).length > 0) {
          await updateContextTxtpConfigInDb(contextTxtpConfigId, updateFields);
        }
        if (Array.isArray(fieldStrategies) && fieldStrategies.length > 0) {
          await Promise.all(fieldStrategies.map(async (s) => await upsertFieldStrategyInDb(contextTxtpConfigId, s)));
        }
      }),
    );
    return await getContextConfigsWithStrategies(generationId, tenantId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to bulk update context configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Delete context txtp config ───────────────────────────────────────────────

export const deleteContextTxtpConfig = async (configId: number): Promise<void> => {
  try {
    const deleted = await deleteContextTxtpConfigInDb(configId);
    if (!deleted) throw new HttpException(`Context txtp config ${configId} not found`, HttpStatus.NOT_FOUND);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to delete context txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Read helper ──────────────────────────────────────────────────────────────

export const getFieldStrategiesForContextConfig = async (contextTxtpConfigId: number): Promise<ContextFieldStrategy[]> => {
  try {
    return await getFieldStrategiesByContextConfigId(contextTxtpConfigId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve field strategies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
