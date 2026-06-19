// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { MappingPair, TxtpMapping } from '../../interface/simulation-studio/suite-generation.interface';

const mapRow = (row: Record<string, unknown>): TxtpMapping => ({
  id: row.id as number,
  primary_tx_id: row.primary_tx_id as number,
  related_tx_id: row.related_tx_id as number,
  mapping: typeof row.mapping === 'string' ? (JSON.parse(row.mapping) as MappingPair[]) : ((row.mapping as MappingPair[] | null) ?? []),
});

export const insertTxtpMappingInDb = async (primaryTxId: number, relatedTxId: number, mapping: MappingPair[]): Promise<TxtpMapping> => {
  const insertResult = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: `
        INSERT INTO trs_mapping (primary_tx_id, related_tx_id, mapping)
        VALUES ($1, $2, $3::jsonb)
        RETURNING *
      `,
      values: [primaryTxId, relatedTxId, JSON.stringify(mapping)],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRow(insertResult.rows[0]);
};

export const getTxtpMappingByIdsInDb = async (primaryTxId: number, relatedTxId: number): Promise<TxtpMapping[]> => {
  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: `
        SELECT id, primary_tx_id, related_tx_id, mapping
        FROM trs_mapping
        WHERE primary_tx_id = $1 AND related_tx_id = $2
        ORDER BY id ASC
      `,
      values: [primaryTxId, relatedTxId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRow);
};

export const deleteTxtpMappingByIdsInDb = async (primaryTxId: number, relatedTxId: number): Promise<boolean> => {
  const result = await handlePostExecuteSqlStatement<{ deleted_count: string | number }>(
    {
      text: `
        WITH deleted AS (
          DELETE FROM trs_mapping
          WHERE primary_tx_id = $1 AND related_tx_id = $2
          RETURNING id
        )
        SELECT COUNT(*) AS deleted_count FROM deleted
      `,
      values: [primaryTxId, relatedTxId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const deletedCount = parseInt(String(result.rows[0]?.deleted_count ?? '0'), 10);
  return deletedCount > 0;
};
