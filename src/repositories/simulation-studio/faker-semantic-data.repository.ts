import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export interface FakerSymmetricDataType {
  id: number;
  name: string;
}

const mapRow = (row: Record<string, unknown>): FakerSymmetricDataType => ({
  id: row.id as number,
  name: row.name as string,
});

export const getFakerSymmetricDataFromDb = async (): Promise<FakerSymmetricDataType[]> => {
  const query = `
        SELECT id, name
        FROM trs_faker_symmetric_data_types
        ORDER BY id ASC
    `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRow);
};
