import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

import { getDataModelJson, upsertDataModelJson } from '../../../src/repositories/configuration/data-model.repository';

describe('Data Model Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDataModelJson', () => {
    it('should return null when no rows are found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

      const result = await getDataModelJson('tenant-a');

      expect(result).toBeNull();
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.objectContaining({ values: ['tenant-a'] }), 'configuration');
    });

    it('should return data_model_json when row exists', async () => {
      const dataModel = { fields: [{ key: 'name', type: 'string' }] };
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ data_model_json: dataModel }] });

      const result = await getDataModelJson('tenant-a');

      expect(result).toEqual(dataModel);
    });
  });

  describe('upsertDataModelJson', () => {
    it('should upsert and return tenant_id and updated_at', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ tenant_id: 'tenant-a', updated_at: '2026-05-26T00:00:00.000Z' }],
      });

      const payload = { model: { a: 1 } };
      const result = await upsertDataModelJson('tenant-a', payload);

      expect(result).toEqual({ tenant_id: 'tenant-a', updated_at: '2026-05-26T00:00:00.000Z' });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['tenant-a', JSON.stringify(payload)],
        }),
        'configuration',
      );
    });

    it('should throw when upsert returns no rows', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

      await expect(upsertDataModelJson('tenant-a', { x: true })).rejects.toThrow('Failed to upsert data model JSON');
    });
  });
});
