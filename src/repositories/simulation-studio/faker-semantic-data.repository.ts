import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export interface FakerSemanticDataType {
  id: number;
  name: string;
}

const mapRow = (row: Record<string, unknown>): FakerSemanticDataType => ({
  id: row.id as number,
  name: row.name as string,
});

export const getFakerSemanticDataFromDb = async (): Promise<FakerSemanticDataType[]> => {
  const query = `
        SELECT id, name
        FROM trs_faker_semantic_data_types
        ORDER BY id ASC
    `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRow);
};
