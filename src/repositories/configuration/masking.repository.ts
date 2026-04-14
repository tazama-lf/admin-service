import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import { validateColumnKeys } from '../../utils/enrichment-utils';

const ALLOWED_MASKING_COLUMNS = new Set(['tenant_id', 'txtp', 'txtp_version']);

export const createMasking = async (maskingData: Record<string, unknown>): Promise<number> => {
  try {
    const keys = Object.keys(maskingData);
    validateColumnKeys(keys, ALLOWED_MASKING_COLUMNS, 'trs_masking insert');
    const values = Object.values(maskingData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const insertQuery = `
      INSERT INTO trs_masking (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING id;
    `;
    const result = await handlePostExecuteSqlStatement<{ id: number }>(
      {
        text: insertQuery,
        values,
      } satisfies PgQueryConfig,
      'configuration',
    );

    const insertedId = result.rows[0]?.id;

    if (!insertedId) {
      throw new Error('Failed to insert masking configuration: No ID returned.');
    }

    return insertedId;
  } catch (error) {
    throw new Error(`Failed to create masking configuration: ${(error as Error).message}`, { cause: error });
  }
};
