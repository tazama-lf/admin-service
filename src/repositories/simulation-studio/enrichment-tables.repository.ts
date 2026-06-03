// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { SuiteEnrichmentTable, CreateEnrichmentTableDto, UpdateEnrichmentTableDto } from '../../interface/suite-generation.interface';

const parseJsonCol = (val: unknown): Record<string, unknown> | undefined =>
  val ? (typeof val === 'string' ? (JSON.parse(val) as Record<string, unknown>) : (val as Record<string, unknown>)) : undefined;

const mapRow = (row: Record<string, unknown>): SuiteEnrichmentTable => ({
  id: row.id as number,
  generation_id: row.generation_id as number,
  table_name: row.table_name as string,
  table_order: row.table_order as number,
  row_count: row.row_count as number,
  payload_template_json: parseJsonCol(row.payload_template_json),
  schema_template_json: parseJsonCol(row.schema_template_json),
  faker_profile:
    typeof row.faker_profile === 'string'
      ? (JSON.parse(row.faker_profile) as Record<string, unknown>)
      : row.faker_profile
        ? (row.faker_profile as Record<string, unknown>)
        : {},
  created_at: new Date(row.created_at as string),
});

export const createEnrichmentTableInDb = async (dto: CreateEnrichmentTableDto): Promise<SuiteEnrichmentTable> => {
  const query = `
    INSERT INTO trs_suite_enrichment_tables (
      generation_id, table_name, table_order, row_count,
      payload_template_json, schema_template_json, faker_profile, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [
        dto.generation_id,
        dto.table_name,
        dto.table_order ?? 1,
        dto.row_count,
        dto.payload_template_json ? JSON.stringify(dto.payload_template_json) : null,
        dto.schema_template_json ? JSON.stringify(dto.schema_template_json) : null,
        JSON.stringify(dto.faker_profile ?? {}),
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRow(result.rows[0]);
};

export const updateEnrichmentTableInDb = async (id: number, dto: UpdateEnrichmentTableDto): Promise<SuiteEnrichmentTable | null> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (dto.row_count !== undefined) {
    updates.push(`row_count = $${idx++}`);
    values.push(dto.row_count);
  }
  if (dto.payload_template_json !== undefined) {
    updates.push(`payload_template_json = $${idx++}`);
    values.push(JSON.stringify(dto.payload_template_json));
  }
  if (dto.schema_template_json !== undefined) {
    updates.push(`schema_template_json = $${idx++}`);
    values.push(JSON.stringify(dto.schema_template_json));
  }
  if (dto.faker_profile !== undefined) {
    updates.push(`faker_profile = $${idx++}`);
    values.push(JSON.stringify(dto.faker_profile));
  }

  if (updates.length === 0) {
    const existing = await handlePostExecuteSqlStatement<Record<string, unknown>>(
      { text: 'SELECT * FROM trs_suite_enrichment_tables WHERE id = $1', values: [id] } satisfies PgQueryConfig,
      'simulation',
    );
    return existing.rows.length ? mapRow(existing.rows[0]) : null;
  }

  values.push(id);
  const query = `UPDATE trs_suite_enrichment_tables SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.length ? mapRow(result.rows[0]) : null;
};

export const getEnrichmentTablesByGenerationId = async (generationId: number): Promise<SuiteEnrichmentTable[]> => {
  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: 'SELECT * FROM trs_suite_enrichment_tables WHERE generation_id = $1 ORDER BY table_order ASC',
      values: [generationId],
    } satisfies PgQueryConfig,
    'simulation',
  );
  return result.rows.map(mapRow);
};

export const deleteEnrichmentTableInDb = async (id: number): Promise<boolean> => {
  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: 'DELETE FROM trs_suite_enrichment_tables WHERE id = $1 RETURNING id', values: [id] } satisfies PgQueryConfig,
    'simulation',
  );
  return result.rows.length > 0;
};
