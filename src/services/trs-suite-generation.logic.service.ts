// SPDX-License-Identifier: Apache-2.0
import type {
  SuiteGeneration,
  SuiteContextTxtpConfig,
  ContextFieldStrategy,
  UpdateContextTxtpConfigDto,
  UpsertFieldStrategyDto,
} from '../interface/suite-generation.interface';
import type { SimulationSuite } from '../interface/simulation-suites.interface';
import {
  createSuiteGenerationInDb,
  getNextGenerationNumber,
  getGenerationsBySuiteId,
  getLatestGenerationBySuiteId,
} from '../repositories/simulation-studio/suite-generations.repository';
import {
  createContextTxtpConfigInDb,
  updateContextTxtpConfigInDb,
  getContextTxtpConfigsByGenerationId,
} from '../repositories/simulation-studio/context-txtp-configs.repository';
import {
  upsertFieldStrategyInDb,
  getFieldStrategiesByContextConfigId,
} from '../repositories/simulation-studio/context-field-strategies.repository';
import { getSchemaByTransactionType } from '../repositories/configuration/tcs.config.repository';
import { HttpException, HttpStatus } from '../utils/error';

// ── Suite Creation flow ──────────────────────────────────────────────────────

/**
 * Step 1 — called from createSimulationSuite.
 * INSERTs trs_suite_generations with generation_number=1, status=DRAFT.
 */
export const createSuiteGeneration = async (suite: SimulationSuite, userId: string, userEmail?: string): Promise<SuiteGeneration> => {
  try {
    const generationNumber = await getNextGenerationNumber(suite.id);

    return await createSuiteGenerationInDb(
      {
        suite_id: suite.id,
        simulation_type: suite.simulation_type,
        rule_repo: suite.rule_repo,
        rule_version: suite.rule_version,
        wizard_snapshot: suite.wizard_progress,
        generation_metadata: {},
      },
      generationNumber,
      userId,
      userEmail,
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create suite generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Step 1 — called from createSimulationSuite after generation is created.
 * Fetches schema + sample_payload from tcs_config, then INSERTs trs_suite_context_txtp_configs.
 * Returns null silently if no tcs_config row exists for the txtp+version yet.
 */
export const createContextTxtpConfig = async (
  generationId: number,
  txtp: string,
  txtpVersion: string,
  tenantId: string,
): Promise<SuiteContextTxtpConfig | null> => {
  try {
    let schema: Record<string, unknown>;
    let samplePayload: Record<string, unknown> | undefined;

    try {
      const row = await getSchemaByTransactionType(txtp, txtpVersion, tenantId);
      schema = row.schema as Record<string, unknown>;
      samplePayload = (row.content_type === 'JSON' ? row.payload_json : row.payload_xml) as Record<string, unknown> | undefined;
    } catch {
      return null;
    }

    return await createContextTxtpConfigInDb({
      generation_id: generationId,
      txtp,
      txtp_version: txtpVersion,
      display_order: 1,
      message_count: 1,
      schema_snapshot: schema,
      sample_payload_snapshot: samplePayload,
    });
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create context txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Step 2 — Context Config update ──────────────────────────────────────────

/**
 * Step 2 — update message_count / faker_seed / generator_profile on an existing
 * trs_suite_context_txtp_configs row.
 */
export const updateContextTxtpConfig = async (configId: number, dto: UpdateContextTxtpConfigDto): Promise<SuiteContextTxtpConfig> => {
  try {
    const updated = await updateContextTxtpConfigInDb(configId, dto);
    if (updated == null) throw new HttpException(`Context txtp config ${configId} not found`, HttpStatus.NOT_FOUND);
    return updated;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to update context txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Step 2 — upsert one or many field strategies for a context_txtp_config row.
 * ON CONFLICT (context_txtp_config_id, field_path) → update strategy columns.
 */
export const upsertContextFieldStrategies = async (
  contextTxtpConfigId: number,
  strategies: UpsertFieldStrategyDto[],
): Promise<ContextFieldStrategy[]> => {
  try {
    return await Promise.all(strategies.map(async (s) => await upsertFieldStrategyInDb(contextTxtpConfigId, s)));
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to upsert field strategies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Read helpers ─────────────────────────────────────────────────────────────

export const getGenerationsForSuite = async (suiteId: number): Promise<SuiteGeneration[]> => {
  try {
    return await getGenerationsBySuiteId(suiteId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve generations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getLatestGenerationForSuite = async (suiteId: number): Promise<SuiteGeneration | null> => {
  try {
    return await getLatestGenerationBySuiteId(suiteId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve latest generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getContextConfigsForGeneration = async (generationId: number): Promise<SuiteContextTxtpConfig[]> => {
  try {
    return await getContextTxtpConfigsByGenerationId(generationId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve context configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

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
