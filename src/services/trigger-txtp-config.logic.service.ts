// SPDX-License-Identifier: Apache-2.0
import type {
  TriggerFieldOverride,
  AddTriggerTxtpConfigDto,
  BulkTriggerConfigItemDto,
  TriggerTxtpConfigWithOverrides,
} from '../interface/suite-generation.interface';
import {
  createTriggerTxtpConfigInDb,
  updateTriggerTxtpConfigInDb,
  getTriggerTxtpConfigsByGenerationId,
} from '../repositories/simulation-studio/trigger-txtp-configs.repository';
import {
  upsertTriggerFieldOverrideInDb,
  getTriggerFieldOverridesByConfigId,
} from '../repositories/simulation-studio/trigger-field-strategies.repository';
import { getSchemaByTransactionType } from '../repositories/configuration/tcs.config.repository';
import { ContentType } from '@tazama-lf/tcs-lib';
import { HttpException, HttpStatus } from '../utils/error';

// ── Internal helpers ─────────────────────────────────────────────────────────

const flattenPayloadPaths = (obj: unknown, prefix = ''): string[] => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
      return flattenPayloadPaths(val, path);
    }
    return [path];
  });
};

// ── Shared factory ───────────────────────────────────────────────────────────

interface CreateTriggerConfigOptions {
  generationId: number;
  txtp: string;
  txtpVersion: string;
  messageCount: number;
  displayOrder: number;
  tenantId: string;
}

/**
 * Creates a trigger txtp config row using sample payload from tcs_config as payload_template_json.
 * Seeds all payload field paths with override_type = 'null' (use payload as-is, no transformation).
 * Throws if tcs_config row not found.
 */
export const createTriggerConfigWithDefaultStrategies = async (
  opts: CreateTriggerConfigOptions,
): Promise<TriggerTxtpConfigWithOverrides> => {
  const { generationId, txtp, txtpVersion, messageCount, displayOrder, tenantId } = opts;
  const tcsRow = await getSchemaByTransactionType(txtp, txtpVersion, tenantId);

  // const schema = tcsRow.schema as Record<string, unknown>;
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
  });

  // Use payload for field paths;
  const fieldPaths = flattenPayloadPaths(payloadTemplate);
  const fieldOverrides = await Promise.all(
    fieldPaths.map(async (path) => await upsertTriggerFieldOverrideInDb(config.id, { field_path: path, override_type: 'null' })),
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
    field_overrides: fieldOverrides,
  };
};

// ── Step 1 ───────────────────────────────────────────────────────────────────

/**
 * Called during suite creation. Creates the primary trigger config. message_count = 1.
 */
export const createTriggerTxtpConfig = async (
  generationId: number,
  txtp: string,
  txtpVersion: string,
  tenantId: string,
): Promise<TriggerTxtpConfigWithOverrides> => {
  try {
    return await createTriggerConfigWithDefaultStrategies({ generationId, txtp, txtpVersion, messageCount: 1, displayOrder: 1, tenantId });
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
 */
export const addTriggerTxtpConfig = async (
  generationId: number,
  dto: AddTriggerTxtpConfigDto,
  tenantId: string,
): Promise<TriggerTxtpConfigWithOverrides> => {
  try {
    const existing = await getTriggerTxtpConfigsByGenerationId(generationId);
    const displayOrder = existing.length + 1;
    return await createTriggerConfigWithDefaultStrategies({
      generationId,
      txtp: dto.txtp,
      txtpVersion: dto.txtp_version,
      messageCount: dto.message_count ?? 1,
      displayOrder,
      tenantId,
    });
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to add trigger txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 3: GET all ──────────────────────────────────────────────────────────

export const getTriggerConfigsWithOverrides = async (generationId: number): Promise<TriggerTxtpConfigWithOverrides[]> => {
  try {
    const configs = await getTriggerTxtpConfigsByGenerationId(generationId);
    return await Promise.all(
      configs.map(async (config) => {
        const fieldOverrides = await getTriggerFieldOverridesByConfigId(config.id);
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
          field_overrides: fieldOverrides,
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
): Promise<TriggerTxtpConfigWithOverrides[]> => {
  try {
    await Promise.all(
      items.map(async (item) => {
        const { trigger_txtp_config_id: configId, field_overrides: fieldOverrides, ...updateFields } = item;
        // Skip malformed entries instead of issuing DB writes with an undefined id.
        if (!Number.isInteger(configId) || configId <= 0) return;
        if (Object.keys(updateFields).length > 0) {
          await updateTriggerTxtpConfigInDb(configId, updateFields);
        }
        if (Array.isArray(fieldOverrides) && fieldOverrides.length > 0) {
          await Promise.all(fieldOverrides.map(async (o) => await upsertTriggerFieldOverrideInDb(configId, o)));
        }
      }),
    );
    return await getTriggerConfigsWithOverrides(generationId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to bulk update trigger configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Read helper ──────────────────────────────────────────────────────────────

export const getTriggerFieldOverridesForConfig = async (triggerTxtpConfigId: number): Promise<TriggerFieldOverride[]> => {
  try {
    return await getTriggerFieldOverridesByConfigId(triggerTxtpConfigId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve trigger field overrides: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
