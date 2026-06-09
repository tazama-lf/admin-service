// SPDX-License-Identifier: Apache-2.0
import type {
  AddTriggerTxtpConfigDto,
  BulkTriggerConfigItemDto,
  TriggerFieldStrategy,
  TriggerTxtpConfigWithStrategies,
} from '../interface/simulation-studio/trigger-txtp.interface';
import {
  createTriggerTxtpConfigInDb,
  updateTriggerTxtpConfigInDb,
  getTriggerTxtpConfigsByGenerationId,
  getTriggerTxtpConfigByIdInDb,
} from '../repositories/simulation-studio/trigger-txtp-configs.repository';
import {
  upsertTriggerFieldStrategyInDb,
  getTriggerFieldStrategiesByConfigId,
} from '../repositories/simulation-studio/trigger-field-strategies.repository';
import { getSchemaByTransactionType } from '../repositories/configuration/tcs.config.repository';
import { ContentType } from '@tazama-lf/tcs-lib';
import { HttpException, HttpStatus } from '../utils/error';
import { flattenPayloadPaths } from '../utils/helper';

// ── Shared factory ───────────────────────────────────────────────────────────

interface CreateTriggerConfigOptions {
  generationId: number;
  txtp: string;
  txtpVersion: string;
  messageCount: number;
  displayOrder: number;
  tenantId: string;
  relatedTxtpConfigId?: number | null;
}

export const createTriggerConfigWithDefaultStrategies = async (
  opts: CreateTriggerConfigOptions,
): Promise<TriggerTxtpConfigWithStrategies> => {
  const { generationId, txtp, txtpVersion, messageCount, displayOrder, tenantId, relatedTxtpConfigId } = opts;

  const tcsRow = await getSchemaByTransactionType(txtp, txtpVersion, tenantId);

  const payloadTemplate = (tcsRow.content_type === (ContentType.XML as string) ? tcsRow.payload_xml : tcsRow.payload_json) as
    | Record<string, unknown>
    | undefined;

  const config = await createTriggerTxtpConfigInDb({
    generation_id: generationId,
    txtp,
    txtp_version: txtpVersion,
    display_order: displayOrder,
    message_count: messageCount,
    payload_template_json: payloadTemplate ?? {},
    related_txtp_config_id: relatedTxtpConfigId ?? null,
    related_transaction: tcsRow.related_transaction ?? null,
  });

  const fieldPaths = flattenPayloadPaths(payloadTemplate);
  const fieldStrategies = await Promise.all(
    fieldPaths.map(async (path) => await upsertTriggerFieldStrategyInDb(config.id, { field_path: path, strategy_code: 'keep_sample' })),
  );

  return {
    trigger_txtp_config_id: config.id,
    txtp: config.txtp,
    txtp_version: config.txtp_version,
    message_count: config.message_count,
    display_order: config.display_order,
    payload_template_json: config.payload_template_json,
    link_to_context_pairs: config.link_to_context_pairs,
    expected_result_band: config.expected_result_band,
    notes: config.notes,
    related_txtp_config_id: config.related_txtp_config_id,
    field_strategies: fieldStrategies,
    related_transaction: config.related_transaction ?? '',
  };
};

// ── Step 1 ───────────────────────────────────────────────────────────────────

/**
 * Called during suite creation. Creates primary trigger config (display_order=1,
 * message_count=1). If tcs_config has related_transaction, also creates a secondary
 * trigger config (display_order=2) with related_txtp_config_id = primary id.
 */
export const createTriggerTxtpConfig = async (
  generationId: number,
  txtp: string,
  txtpVersion: string,
  tenantId: string,
): Promise<TriggerTxtpConfigWithStrategies> => {
  try {
    const tcsRow = await getSchemaByTransactionType(txtp, txtpVersion, tenantId);

    const payloadTemplate = (tcsRow.content_type === (ContentType.XML as string) ? tcsRow.payload_xml : tcsRow.payload_json) as
      | Record<string, unknown>
      | undefined;

    const primaryConfig = await createTriggerTxtpConfigInDb({
      generation_id: generationId,
      txtp,
      txtp_version: txtpVersion,
      display_order: 1,
      message_count: 1,
      payload_template_json: payloadTemplate ?? {},
      related_txtp_config_id: null,
      related_transaction: tcsRow.related_transaction ?? null,
    });

    const fieldPaths = flattenPayloadPaths(payloadTemplate);
    const fieldStrategies = await Promise.all(
      fieldPaths.map(
        async (path) => await upsertTriggerFieldStrategyInDb(primaryConfig.id, { field_path: path, strategy_code: 'keep_sample' }),
      ),
    );

    // const relatedTransactionPath = tcsRow.related_transaction ?? null;
    // if (relatedTransactionPath !== null) {
    //   const { txtp: relatedTxtp, version: relatedVersion } = gettxtpAndVersionFromUrl(relatedTransactionPath);
    //   const relatedtTcsRow = await getSchemaByTransactionType(relatedTxtp, relatedVersion, tenantId);

    //   const payloadTemplate = (
    //     relatedtTcsRow.content_type === (ContentType.XML as string) ? relatedtTcsRow.payload_xml : relatedtTcsRow.payload_json
    //   ) as Record<string, unknown> | undefined;

    //   const relatedConfig = await createTriggerTxtpConfigInDb({
    //     generation_id: generationId,
    //     txtp: relatedTxtp,
    //     txtp_version: relatedVersion,
    //     display_order: 2,
    //     message_count: 1,
    //     payload_template_json: payloadTemplate ?? {},
    //     related_txtp_config_id: primaryConfig.id,
    //   });

    //   const fieldPaths = flattenPayloadPaths(payloadTemplate);
    //   await Promise.all(
    //     fieldPaths.map(async (path) => await upsertTriggerFieldOverrideInDb(relatedConfig.id, { field_path: path, override_type: 'null' })),
    //   );
    // }

    return {
      trigger_txtp_config_id: primaryConfig.id,
      txtp: primaryConfig.txtp,
      txtp_version: primaryConfig.txtp_version,
      message_count: primaryConfig.message_count,
      display_order: primaryConfig.display_order,
      payload_template_json: primaryConfig.payload_template_json,
      link_to_context_pairs: primaryConfig.link_to_context_pairs,
      expected_result_band: primaryConfig.expected_result_band,
      notes: primaryConfig.notes,
      related_txtp_config_id: null,
      field_strategies: fieldStrategies,
      related_transaction: primaryConfig.related_transaction ?? '',
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create trigger txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 3: Add TXTP ─────────────────────────────────────────────────────────

/**
 * Called when user clicks "Add TXTP" in Step 3. display_order = existing count + 1.
 * If dto.related_trigger_txtp_id is provided, updates that config's related_txtp_config_id
 * to point to the newly created config.
 */
export const addTriggerTxtpConfig = async (
  generationId: number,
  dto: AddTriggerTxtpConfigDto,
  tenantId: string,
): Promise<TriggerTxtpConfigWithStrategies> => {
  try {
    const existing = await getTriggerTxtpConfigsByGenerationId(generationId);
    const displayOrder = existing.length + 1;
    const newConfig = await createTriggerConfigWithDefaultStrategies({
      generationId,
      txtp: dto.txtp,
      txtpVersion: dto.txtp_version,
      messageCount: dto.message_count ?? 1,
      displayOrder,
      tenantId,
    });

    if (dto.related_trigger_txtp_id) {
      await updateTriggerTxtpConfigInDb(dto.related_trigger_txtp_id, {
        related_txtp_config_id: newConfig.trigger_txtp_config_id,
      });
    }

    return newConfig;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to add trigger txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 3: GET all ──────────────────────────────────────────────────────────

export const getTriggerConfigsWithStrategies = async (generationId: number): Promise<TriggerTxtpConfigWithStrategies[]> => {
  try {
    const configs = await getTriggerTxtpConfigsByGenerationId(generationId);
    if (configs.length === 0) return [];
    return await Promise.all(
      configs.map(async (config) => {
        const fieldStrategies = await getTriggerFieldStrategiesByConfigId(config.id);
        return {
          trigger_txtp_config_id: config.id,
          txtp: config.txtp,
          txtp_version: config.txtp_version,
          message_count: config.message_count,
          display_order: config.display_order,
          payload_template_json: config.payload_template_json,
          link_to_context_pairs: config.link_to_context_pairs,
          expected_result_band: config.expected_result_band,
          notes: config.notes,
          related_txtp_config_id: config.related_txtp_config_id ?? null,
          field_strategies: fieldStrategies,
          related_transaction: config.related_transaction ?? '',
        };
      }),
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve trigger configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 3: Bulk update ──────────────────────────────────────────────────────

export const bulkUpdateTriggerConfigs = async (
  generationId: number,
  items: BulkTriggerConfigItemDto[],
): Promise<TriggerTxtpConfigWithStrategies[]> => {
  try {
    await Promise.all(
      items.map(async (item) => {
        const { trigger_txtp_config_id: configId, field_strategies: fieldStrategies, ...updateFields } = item;
        // Skip malformed entries instead of issuing DB writes with an undefined id.
        if (!Number.isInteger(configId) || configId <= 0) return;
        if (Object.keys(updateFields).length > 0) {
          await updateTriggerTxtpConfigInDb(configId, updateFields);
        }
        if (Array.isArray(fieldStrategies) && fieldStrategies.length > 0) {
          await Promise.all(fieldStrategies.map(async (s) => await upsertTriggerFieldStrategyInDb(configId, s)));
        }
      }),
    );
    return await getTriggerConfigsWithStrategies(generationId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to bulk update trigger configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── GET by ID ────────────────────────────────────────────────────────────────

export const getTriggerConfigById = async (configId: number): Promise<TriggerTxtpConfigWithStrategies | null> => {
  try {
    const config = await getTriggerTxtpConfigByIdInDb(configId);
    if (!config) return null;
    const fieldStrategies = await getTriggerFieldStrategiesByConfigId(config.id);
    return {
      trigger_txtp_config_id: config.id,
      txtp: config.txtp,
      txtp_version: config.txtp_version,
      message_count: config.message_count,
      display_order: config.display_order,
      payload_template_json: config.payload_template_json,
      link_to_context_pairs: config.link_to_context_pairs,
      expected_result_band: config.expected_result_band,
      notes: config.notes,
      related_txtp_config_id: config.related_txtp_config_id ?? null,
      field_strategies: fieldStrategies,
      related_transaction: config.related_transaction ?? '',
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve trigger config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Read helper ──────────────────────────────────────────────────────────────

export const getTriggerFieldStrategiesForConfig = async (triggerTxtpConfigId: number): Promise<TriggerFieldStrategy[]> => {
  try {
    return await getTriggerFieldStrategiesByConfigId(triggerTxtpConfigId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve trigger field strategies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
