// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type {
  SimulationSuite,
  SimulationSuitesQueryOptions,
  SimulationSuitesListResponse,
  SimulationSuitesCountsResponse,
  CreateSimulationSuiteDto,
  UpdateSimulationSuiteDto,
} from '../../interface/simulation-studio/simulation-suites.interface';

export const getSimulationSuitesCountsFromDb = async (tenantId: string): Promise<SimulationSuitesCountsResponse> => {
  const result = await handlePostExecuteSqlStatement<{
    total_suites: string | number;
    total_run: string | number;
    latest_run_at: string | null;
  }>(
    {
      text: `
        SELECT
          COUNT(DISTINCT s.id) AS total_suites,
          COUNT(r.id) AS total_run,
          MAX(r.created_at) AS latest_run_at
        FROM trs_simulation_suites s
        LEFT JOIN trs_simulation_runs r ON r.suite_id = s.id
        WHERE s.tenant_id = $1
      `,
      values: [tenantId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const row = result.rows[0] ?? {
    total_suites: '0',
    total_run: '0',
    latest_run_at: null,
  };

  return {
    total_suites: parseInt(String(row.total_suites ?? '0'), 10),
    total_run: parseInt(String(row.total_run ?? '0'), 10),
    latest_run_at: row.latest_run_at ? new Date(row.latest_run_at) : null,
  };
};

export const getSimulationSuitesFromDb = async (options: SimulationSuitesQueryOptions): Promise<SimulationSuitesListResponse> => {
  const { tenantId, search, status, ruleName, txtp, updatedFrom, updatedTo, limit = 20, offset = 0 } = options;

  const params: unknown[] = [];
  let paramIndex = 1;

  let whereClause = `WHERE tenant_id = $${paramIndex++}`;
  params.push(tenantId);

  if (search) {
    whereClause += ` AND name ILIKE $${paramIndex++}`;
    params.push(`%${search}%`);
  }

  if (status) {
    whereClause += ` AND (SELECT status FROM trs_suite_generations WHERE suite_id = trs_simulation_suites.id ORDER BY generation_number DESC LIMIT 1) = $${paramIndex++}`;
    params.push(status);
  }

  if (ruleName) {
    whereClause += ` AND rule_name ILIKE $${paramIndex++}`;
    params.push(`%${ruleName}%`);
  }

  if (txtp) {
    whereClause += ` AND primary_txtp ILIKE $${paramIndex++}`;
    params.push(`%${txtp}%`);
  }

  if (updatedFrom) {
    whereClause += ` AND updated_at >= $${paramIndex++}`;
    params.push(updatedFrom);
  }

  if (updatedTo) {
    whereClause += ` AND updated_at <= $${paramIndex++}`;
    params.push(updatedTo);
  }

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM trs_simulation_suites ${whereClause}`;
  const countResult = await handlePostExecuteSqlStatement<{ total: string }>(
    {
      text: countQuery,
      values: params,
    } satisfies PgQueryConfig,
    'simulation',
  );

  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get paginated results
  let query = `
    SELECT 
      id, tenant_id, name, description, simulation_type, rule_repo, rule_name, rule_version, rule_config,
      primary_txtp, primary_txtp_version, clone_source_suite_id, iteration_count, run_count,
      last_run_at, wizard_progress, metadata, created_by, created_by_email, created_at, updated_at
    FROM trs_simulation_suites
    ${whereClause}
    ORDER BY updated_at DESC
  `;

  const queryParams = [...params];
  queryParams.push(limit);
  queryParams.push(offset);

  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

  const result = await handlePostExecuteSqlStatement<SimulationSuite>(
    {
      text: query,
      values: queryParams,
    } satisfies PgQueryConfig,
    'simulation',
  );

  return {
    data: result.rows.map((row) => ({
      ...row,
      rule_config: row.rule_config
        ? typeof row.rule_config === 'string'
          ? (JSON.parse(row.rule_config) as Record<string, unknown>)
          : row.rule_config
        : {},
      wizard_progress: normalizeWizardProgress(row.wizard_progress),
      metadata: typeof row.metadata === 'string' ? (JSON.parse(row.metadata) as Record<string, unknown>) : row.metadata,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      last_run_at: row.last_run_at ? new Date(row.last_run_at) : undefined,
    })),
    total,
    limit,
    offset,
  };
};

const normalizeWizardProgress = (raw: unknown): Record<string, unknown> => {
  const wp = (typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : raw) as Record<string, unknown>;
  // Migrate legacy format { step, completed } → { currentStep, completedSteps }
  if (!Array.isArray(wp.completedSteps)) {
    const step = typeof wp.currentStep === 'number' ? wp.currentStep : typeof wp.step === 'number' ? wp.step : 1;
    return { ...wp, currentStep: step, completedSteps: Array.from({ length: step }, (_, i) => i + 1) };
  }
  return wp;
};

export const getSimulationSuiteByIdFromDb = async (id: number, tenantId: string): Promise<SimulationSuite | null> => {
  const query = `
    SELECT 
      id, tenant_id, name, description, simulation_type, rule_repo, rule_name, rule_version, rule_config,
      primary_txtp, primary_txtp_version, clone_source_suite_id, iteration_count, run_count,
      last_run_at, wizard_progress, metadata, created_by, created_by_email, created_at, updated_at
    FROM trs_simulation_suites
    WHERE id = $1 AND tenant_id = $2
  `;

  const result = await handlePostExecuteSqlStatement<SimulationSuite>(
    {
      text: query,
      values: [id, tenantId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  if (result.rows.length === 0) {
    return null;
  }

  const [row] = result.rows;
  return {
    ...row,
    rule_config: row.rule_config
      ? typeof row.rule_config === 'string'
        ? (JSON.parse(row.rule_config) as Record<string, unknown>)
        : row.rule_config
      : {},
    wizard_progress: normalizeWizardProgress(row.wizard_progress),
    metadata: typeof row.metadata === 'string' ? (JSON.parse(row.metadata) as Record<string, unknown>) : row.metadata,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    last_run_at: row.last_run_at ? new Date(row.last_run_at) : undefined,
  };
};

export const createSimulationSuiteInDb = async (
  payload: CreateSimulationSuiteDto,
  tenantId: string,
  userId: string,
  userEmail?: string,
): Promise<SimulationSuite> => {
  const query = `
    INSERT INTO trs_simulation_suites (
      tenant_id, name, description, simulation_type, rule_repo, rule_name, rule_version, rule_config,
      primary_txtp, primary_txtp_version, clone_source_suite_id, iteration_count, run_count,
      wizard_progress, metadata, created_by, created_by_email, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
    )
    RETURNING 
      id, tenant_id, name, description, simulation_type, rule_repo, rule_name, rule_version, rule_config,
      primary_txtp, primary_txtp_version, clone_source_suite_id, iteration_count, run_count,
      last_run_at, wizard_progress, metadata, created_by, created_by_email, created_at, updated_at
  `;

  // Initialize wizard_progress with step 1 completed
  const wizardProgress = payload.wizard_progress ?? {
    currentStep: 1,
    completedSteps: [1],
  };

  const result = await handlePostExecuteSqlStatement<SimulationSuite>(
    {
      text: query,
      values: [
        tenantId,
        payload.name,
        payload.description ?? null,
        payload.simulation_type ?? 'SINGLE_RULE',
        payload.rule_repo ?? null,
        payload.rule_name ?? null,
        payload.rule_version ?? null,
        payload.rule_config ? JSON.stringify(payload.rule_config) : null,
        payload.primary_txtp ?? null,
        payload.primary_txtp_version ?? null,
        payload.clone_source_suite_id ?? null,
        0,
        0,
        JSON.stringify(wizardProgress),
        JSON.stringify(payload.metadata ?? {}),
        userId,
        userEmail ?? null,
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const [row] = result.rows;
  return {
    ...row,
    rule_config: row.rule_config
      ? typeof row.rule_config === 'string'
        ? (JSON.parse(row.rule_config) as Record<string, unknown>)
        : row.rule_config
      : {},
    wizard_progress:
      typeof row.wizard_progress === 'string' ? (JSON.parse(row.wizard_progress) as Record<string, unknown>) : row.wizard_progress,
    metadata: typeof row.metadata === 'string' ? (JSON.parse(row.metadata) as Record<string, unknown>) : row.metadata,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
};

export const updateSimulationSuiteInDb = async (
  id: number,
  tenantId: string,
  payload: UpdateSimulationSuiteDto,
): Promise<SimulationSuite | null> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  interface FieldConfig {
    key: keyof UpdateSimulationSuiteDto;
    column: string;
    transform?: (value: unknown) => unknown;
  }

  const nullableValue = (value: unknown): unknown => value ?? null;

  const fieldConfigs: FieldConfig[] = [
    { key: 'name', column: 'name' },
    { key: 'description', column: 'description', transform: nullableValue },
    { key: 'simulation_type', column: 'simulation_type' },
    { key: 'rule_repo', column: 'rule_repo', transform: nullableValue },
    { key: 'rule_name', column: 'rule_name', transform: nullableValue },
    { key: 'rule_version', column: 'rule_version', transform: nullableValue },
    { key: 'rule_config', column: 'rule_config', transform: (value: unknown) => (value ? JSON.stringify(value) : null) },
    { key: 'primary_txtp', column: 'primary_txtp', transform: nullableValue },
    { key: 'primary_txtp_version', column: 'primary_txtp_version', transform: nullableValue },
    { key: 'iteration_count', column: 'iteration_count' },
    { key: 'run_count', column: 'run_count' },
    { key: 'last_run_at', column: 'last_run_at', transform: nullableValue },
    { key: 'wizard_progress', column: 'wizard_progress', transform: (value: unknown) => JSON.stringify(value) },
    { key: 'metadata', column: 'metadata', transform: (value: unknown) => JSON.stringify(value) },
  ];

  for (const { key, column, transform } of fieldConfigs) {
    const rawValue = payload[key];

    if (rawValue !== undefined) {
      updates.push(`${column} = $${paramIndex++}`);
      values.push(transform ? transform(rawValue) : rawValue);
    }
  }

  if (updates.length === 0) {
    return await getSimulationSuiteByIdFromDb(id, tenantId);
  }

  updates.push('updated_at = NOW()');

  const query = `
    UPDATE trs_simulation_suites
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
    RETURNING 
      id, tenant_id, name, description, simulation_type, rule_repo, rule_name, rule_version, rule_config,
      primary_txtp, primary_txtp_version, clone_source_suite_id, iteration_count, run_count,
      last_run_at, wizard_progress, metadata, created_by, created_by_email, created_at, updated_at
  `;

  values.push(id, tenantId);

  const result = await handlePostExecuteSqlStatement<SimulationSuite>(
    {
      text: query,
      values,
    } satisfies PgQueryConfig,
    'simulation',
  );

  if (result.rows.length === 0) {
    return null;
  }

  const [row] = result.rows;
  return {
    ...row,
    rule_config: row.rule_config
      ? typeof row.rule_config === 'string'
        ? (JSON.parse(row.rule_config) as Record<string, unknown>)
        : row.rule_config
      : {},
    wizard_progress:
      typeof row.wizard_progress === 'string' ? (JSON.parse(row.wizard_progress) as Record<string, unknown>) : row.wizard_progress,
    metadata: typeof row.metadata === 'string' ? (JSON.parse(row.metadata) as Record<string, unknown>) : row.metadata,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    last_run_at: row.last_run_at ? new Date(row.last_run_at) : undefined,
  };
};

export const incrementSuiteIterationCountInDb = async (suiteId: number): Promise<void> => {
  await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: 'UPDATE trs_simulation_suites SET iteration_count = iteration_count + 1, updated_at = NOW() WHERE id = $1',
      values: [suiteId],
    } satisfies PgQueryConfig,
    'simulation',
  );
};

export const incrementSuiteRunCountInDb = async (suiteId: number): Promise<void> => {
  await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: 'UPDATE trs_simulation_suites SET run_count = run_count + 1, updated_at = NOW() WHERE id = $1',
      values: [suiteId],
    } satisfies PgQueryConfig,
    'simulation',
  );
};
