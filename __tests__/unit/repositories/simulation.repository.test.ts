// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  createSimulationInDB,
  countSimulationsInDB,
  findSimulationsInDB,
  getSimulationStatsFromDB,
  getSimulationResultsFromDB,
} from '../../../src/repositories/configuration/simulation.repository';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: any[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
}));

const rows = (data: Record<string, unknown>[]) => ({ rows: data });

const mockSequence = (...results: any[]) => {
  let call = 0;
  mockHandlePostExecuteSqlStatement.mockImplementation(async () => results[call++] ?? results[results.length - 1]);
};

describe('simulation.repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSimulationInDB', () => {
    it('inserts and returns simulation_id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(rows([{ simulation_id: 'sim001' }]));

      const id = await createSimulationInDB({
        simulation_id: 'sim001',
        tenant_id: 'tenant-1',
        total_record: 100,
        sim_status: 'RUNNING',
      });

      expect(id).toBe('sim001');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(1);
      const [queryConfig, db] = mockHandlePostExecuteSqlStatement.mock.calls[0] as any[];
      expect(db).toBe('configuration');
      expect(queryConfig.text).toContain('INSERT INTO trs_simulation');
      expect(queryConfig.text).toContain('RETURNING simulation_id');
    });

    it('throws when an invalid column is provided', async () => {
      await expect(createSimulationInDB({ simulation_id: 'sim001', tenant_id: 't1', bad_col: 'x' })).rejects.toThrow(
        'Invalid columns for trs_simulation insert: bad_col',
      );
      expect(mockHandlePostExecuteSqlStatement).not.toHaveBeenCalled();
    });

    it('throws when no simulation_id is returned from DB', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(rows([]));

      await expect(createSimulationInDB({ simulation_id: 'sim001', tenant_id: 't1' })).rejects.toThrow(
        'Failed to insert simulation: No simulation_id returned.',
      );
    });

    it('accepts all allowed column names', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(rows([{ simulation_id: 'sim002' }]));

      const id = await createSimulationInDB({
        simulation_id: 'sim002',
        total_record: 50,
        record_processed: 10,
        sim_status: 'RUNNING',
        tenant_id: 'tenant-2',
        total_iterations: 3,
      });

      expect(id).toBe('sim002');
    });
  });

  describe('countSimulationsInDB', () => {
    it('returns parsed count', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(rows([{ count: '42' }]));

      const count = await countSimulationsInDB('tenant-1');

      expect(count).toBe(42);
      const [queryConfig, db] = mockHandlePostExecuteSqlStatement.mock.calls[0] as any[];
      expect(db).toBe('configuration');
      expect(queryConfig.values).toEqual(['tenant-1']);
    });

    it('returns 0 when count is undefined', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(rows([{}]));
      const count = await countSimulationsInDB('tenant-1');
      expect(count).toBe(0);
    });
  });

  describe('findSimulationsInDB', () => {
    it('returns result rows wrapped in result key', async () => {
      const mockData = [{ simulation_id: 'sim001', sim_status: 'COMPLETED' }];
      mockHandlePostExecuteSqlStatement.mockResolvedValue(rows(mockData));

      const result = await findSimulationsInDB('tenant-1', 10, 0);

      expect(result).toEqual({ result: mockData });
      const [queryConfig, db] = mockHandlePostExecuteSqlStatement.mock.calls[0] as any[];
      expect(db).toBe('configuration');
      expect(queryConfig.values).toEqual(['tenant-1', 10, 0]);
      expect(queryConfig.text).toContain('total_iterations');
    });
  });

  describe('getSimulationStatsFromDB', () => {
    const sim = 'sim015';
    const iterationNo = '1';
    const tenantId = 'tenant-1';

    const buildStatsMocks = (opts: {
      total?: string;
      evaluated?: string;
      nalt?: string;
      runDateTime?: string | null;
      firstTs?: string | null;
      lastTs?: string | null;
    }) => {
      mockSequence(
        rows([{ cnt: opts.total ?? '100' }]),
        rows([{ cnt: opts.evaluated ?? '80' }]),
        rows([{ cnt: opts.nalt ?? '10' }]),
        rows([{ run_date_and_time: opts.runDateTime ?? '2026-05-06T10:00:00+05:00' }]),
        rows([{ first_ts: opts.firstTs ?? '2026-05-06T10:00:00.000Z', last_ts: opts.lastTs ?? '2026-05-06T10:02:30.000Z' }]),
      );
    };

    it('returns correct stats with all fields', async () => {
      buildStatsMocks({
        total: '200',
        evaluated: '150',
        nalt: '30',
        runDateTime: '2026-05-06T10:00:00+05:00',
        firstTs: '2026-05-06T05:00:00.000Z',
        lastTs: '2026-05-06T05:02:45.000Z',
      });

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);

      expect(stats.total_no_of_records).toBe(200);
      expect(stats.records_evaluated).toBe(150);
      expect(stats.alerts_not_generated).toBe(30);
      expect(stats.alerts_generated).toBe(120);
      expect(stats.run_date_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(stats.replay_duration).toBe('2m 45s');
    });

    it('formats replay_duration with hours when >= 3600 seconds', async () => {
      buildStatsMocks({
        firstTs: '2026-05-06T05:00:00.000Z',
        lastTs: '2026-05-06T06:05:10.000Z', // 1h 5m 10s
      });

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.replay_duration).toBe('1h 5m 10s');
    });

    it('formats replay_duration in seconds only when < 60 seconds', async () => {
      buildStatsMocks({
        firstTs: '2026-05-06T05:00:00.000Z',
        lastTs: '2026-05-06T05:00:45.000Z', // 45s
      });

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.replay_duration).toBe('45s');
    });

    it('returns null run_date_time when no iteration record found', async () => {
      mockSequence(
        rows([{ cnt: '10' }]),
        rows([{ cnt: '8' }]),
        rows([{ cnt: '2' }]),
        rows([]),
        rows([{ first_ts: '2026-05-06T05:00:00.000Z', last_ts: '2026-05-06T05:01:00.000Z' }]),
      );

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.run_date_time).toBeNull();
    });

    it('returns null replay_duration when firstTs is null', async () => {
      mockSequence(
        rows([{ cnt: '10' }]),
        rows([{ cnt: '8' }]),
        rows([{ cnt: '2' }]),
        rows([{ run_date_and_time: '2026-05-06T10:00:00+05:00' }]),
        rows([{ first_ts: null, last_ts: null }]),
      );

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.replay_duration).toBeNull();
    });

    it('returns null replay_duration when lastTs is null', async () => {
      mockSequence(
        rows([{ cnt: '10' }]),
        rows([{ cnt: '8' }]),
        rows([{ cnt: '2' }]),
        rows([{ run_date_and_time: '2026-05-06T10:00:00+05:00' }]),
        rows([{ first_ts: '2026-05-06T05:00:00.000Z', last_ts: null }]),
      );

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.replay_duration).toBeNull();
    });

    it('throws on invalid sim table name', async () => {
      await expect(getSimulationStatsFromDB('invalid-name!', '1', tenantId)).rejects.toThrow('Invalid simulation table name');
    });

    it('queries configuration DB for iteration_record', async () => {
      buildStatsMocks({});

      await getSimulationStatsFromDB(sim, iterationNo, tenantId);

      const calls = mockHandlePostExecuteSqlStatement.mock.calls as any[][];

      expect(calls[3][1]).toBe('configuration');
      expect(calls[3][0].text).toContain('iteration_record');
      expect(calls[3][0].text).toContain('LOWER(REPLACE(simulation_id');
    });

    it('queries simulation DB for timing', async () => {
      buildStatsMocks({});
      await getSimulationStatsFromDB(sim, iterationNo, tenantId);

      const calls = mockHandlePostExecuteSqlStatement.mock.calls as any[][];

      expect(calls[4][1]).toBe('simulation');
      expect(calls[4][0].text).toContain('MIN(credttm)');
      expect(calls[4][0].text).toContain('MAX(credttm)');
    });
  });

  describe('getSimulationResultsFromDB', () => {
    const sim = 'sim015';
    const iterationNo = '1';
    const tenantId = 'tenant-1';

    const makeEvaluation = (status: string, typologies: any[] = []) => ({
      report: {
        status,
        tadpResult: {
          typologyResult: typologies,
        },
      },
    });

    const mockCountAndRows = (count: string, resultRows: any[]) => {
      mockHandlePostExecuteSqlStatement.mockResolvedValueOnce(rows([{ cnt: count }])).mockResolvedValueOnce(rows(resultRows));
    };

    it('returns paginated results with correct shape', async () => {
      const evalData = makeEvaluation('ALRT', [
        {
          id: 'typo-001',
          result: 95.5,
          ruleResults: [{ id: 'rule-001', wght: 0.5, subRuleRef: '.01' }],
        },
      ]);

      mockCountAndRows('5', [
        {
          msg_id: 'msg001',
          msg_type: 'pacs.008',
          outcome: 'Hit',
          time: '2026-05-06T05:00:00.000Z',
          evaluation: evalData,
        },
      ]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);

      expect(result.total).toBe(5);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
      expect(result.data).toHaveLength(1);

      const row = result.data[0];
      expect(row.msg_id).toBe('msg001');
      expect(row.msg_type).toBe('pacs.008');
      expect(row.outcome).toBe('Hit');
      expect(row.triggered_typologies).toHaveLength(1);
      expect(row.triggered_typologies[0].name).toBe('typo-001');
      expect(row.triggered_typologies[0].score).toBe(95.5);
      expect(row.triggered_typologies[0].rules[0].ruleId).toBe('rule-001');
      expect(row.triggered_typologies[0].rules[0].weight).toBe(0.5);
      expect(row.triggered_typologies[0].rules[0].subRef).toBe('.01');
      expect(row.triggered_rules).toHaveLength(1);
      expect(row.triggered_rules[0]).toMatchObject({ id: 'rule-001' });
    });

    it('handles No-Hit row (null evaluation)', async () => {
      mockCountAndRows('1', [
        {
          msg_id: 'msg002',
          msg_type: 'pacs.002',
          outcome: 'No-Hit',
          time: null,
          evaluation: null,
        },
      ]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);

      const row = result.data[0];
      expect(row.outcome).toBe('No-Hit');
      expect(row.time).toBeNull();
      expect(row.triggered_rules).toHaveLength(0);
      expect(row.triggered_typologies).toHaveLength(0);
    });

    it('handles evaluation without typologyResult', async () => {
      mockCountAndRows('1', [
        {
          msg_id: 'msg003',
          msg_type: 'pacs.008',
          outcome: 'Hit',
          time: '2026-05-06T05:00:00.000Z',
          evaluation: { report: { status: 'ALRT', tadpResult: {} } },
        },
      ]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.data[0].triggered_typologies).toHaveLength(0);
      expect(result.data[0].triggered_rules).toHaveLength(0);
    });

    it('applies msg_id filter', async () => {
      mockCountAndRows('0', []);

      await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0, { msg_id: 'abc' });

      const calls = mockHandlePostExecuteSqlStatement.mock.calls as any[][];
      expect(calls[0][0].text).toContain('ILIKE');
      expect(calls[0][0].values).toContain('%abc%');
    });

    it('applies msg_type filter', async () => {
      mockCountAndRows('0', []);

      await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0, { msg_type: 'pacs' });

      const calls = mockHandlePostExecuteSqlStatement.mock.calls as any[][];
      expect(calls[0][0].text).toContain("payload->>'TxTp' ILIKE");
      expect(calls[0][0].values).toContain('%pacs%');
    });

    it('applies outcome Hit filter (IS NOT NULL)', async () => {
      mockCountAndRows('0', []);

      await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0, { outcome: 'Hit' });

      const calls = mockHandlePostExecuteSqlStatement.mock.calls as any[][];
      expect(calls[0][0].text).toContain('r.msg_id IS NOT NULL');
    });

    it('applies outcome No-Hit filter (IS NULL)', async () => {
      mockCountAndRows('0', []);

      await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0, { outcome: 'No-Hit' });

      const calls = mockHandlePostExecuteSqlStatement.mock.calls as any[][];
      expect(calls[0][0].text).toContain('r.msg_id IS NULL');
    });

    it('applies combined msg_id + msg_type + outcome filters', async () => {
      mockCountAndRows('0', []);

      await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0, {
        msg_id: 'msg',
        msg_type: 'pacs',
        outcome: 'Hit',
      });

      const calls = mockHandlePostExecuteSqlStatement.mock.calls as any[][];
      const text: string = calls[0][0].text;
      expect(text).toContain('ILIKE');
      expect(text).toContain("payload->>'TxTp' ILIKE");
      expect(text).toContain('r.msg_id IS NOT NULL');
    });

    it('throws on invalid sim table name', async () => {
      await expect(getSimulationResultsFromDB('bad name!', iterationNo, tenantId, 10, 0)).rejects.toThrow('Invalid simulation table name');
    });

    it('returns empty data when total is 0', async () => {
      mockCountAndRows('0', []);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('extracts triggered_rules from multiple typologies', async () => {
      const evalData = makeEvaluation('ALRT', [
        {
          id: 'typo-001',
          result: 80,
          ruleResults: [{ id: 'r1', wght: 0.4, subRuleRef: '.01' }],
        },
        {
          id: 'typo-002',
          result: 90,
          ruleResults: [
            { id: 'r2', wght: 0.6, subRuleRef: '.02' },
            { id: 'r3', wght: 0.2, subRuleRef: '.03' },
          ],
        },
      ]);

      mockCountAndRows('1', [{ msg_id: 'msg004', msg_type: 'pacs.008', outcome: 'Hit', time: null, evaluation: evalData }]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.data[0].triggered_rules).toHaveLength(3);
      expect(result.data[0].triggered_typologies).toHaveLength(2);
    });

    it('handles missing wght and subRuleRef gracefully', async () => {
      const evalData = makeEvaluation('ALRT', [{ id: 'typo-001', result: 80, ruleResults: [{ id: 'r1' }] }]);

      mockCountAndRows('1', [{ msg_id: 'msg005', msg_type: 'pacs.008', outcome: 'Hit', time: null, evaluation: evalData }]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      const rule = result.data[0].triggered_typologies[0].rules[0];
      expect(rule.weight).toBe(0);
      expect(rule.subRef).toBe('');
    });

    it('handles missing msg_type (returns empty string)', async () => {
      mockCountAndRows('1', [{ msg_id: 'msg006', msg_type: null, outcome: 'No-Hit', time: null, evaluation: null }]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.data[0].msg_type).toBe('');
    });

    it('returns 0 total when count row has no cnt field', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValueOnce(rows([{}])).mockResolvedValueOnce(rows([]));

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.total).toBe(0);
    });

    it('defaults typology score to 0 when result field is absent', async () => {
      const evalData = {
        report: {
          status: 'ALRT',
          tadpResult: {
            typologyResult: [{ id: 'typo-001', ruleResults: [] }],
          },
        },
      };

      mockCountAndRows('1', [{ msg_id: 'msg007', msg_type: 'pacs.008', outcome: 'Hit', time: null, evaluation: evalData }]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.data[0].triggered_typologies[0].score).toBe(0);
    });

    it('handles typo.ruleResults being null (falls back to [])', async () => {
      const evalData = {
        report: {
          status: 'ALRT',
          tadpResult: {
            typologyResult: [{ id: 'typo-001', result: 80, ruleResults: null }],
          },
        },
      };

      mockCountAndRows('1', [{ msg_id: 'msg008', msg_type: 'pacs.008', outcome: 'Hit', time: null, evaluation: evalData }]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.data[0].triggered_typologies[0].rules).toHaveLength(0);
      expect(result.data[0].triggered_rules).toHaveLength(0);
    });

    it('uses subRuleRef value when present in rule', async () => {
      const evalData = {
        report: {
          status: 'ALRT',
          tadpResult: {
            typologyResult: [{ id: 'typo-001', result: 80, ruleResults: [{ id: 'r1', wght: 0.5, subRuleRef: '.01' }] }],
          },
        },
      };

      mockCountAndRows('1', [{ msg_id: 'msg009', msg_type: 'pacs.008', outcome: 'Hit', time: null, evaluation: evalData }]);

      const result = await getSimulationResultsFromDB(sim, iterationNo, tenantId, 10, 0);
      expect(result.data[0].triggered_typologies[0].rules[0].subRef).toBe('.01');
    });
  });

  describe('getSimulationStatsFromDB — empty row branches', () => {
    const sim = 'sim015';
    const iterationNo = '1';
    const tenantId = 'tenant-1';

    it('defaults total_no_of_records to 0 when totalQuery row has no cnt', async () => {
      mockSequence(
        rows([{}]),
        rows([{ cnt: '0' }]),
        rows([{ cnt: '0' }]),
        rows([{ run_date_and_time: '2026-05-06T10:00:00+05:00' }]),
        rows([{ first_ts: null, last_ts: null }]),
      );

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.total_no_of_records).toBe(0);
    });

    it('defaults records_evaluated to 0 when evaluatedQuery row has no cnt', async () => {
      mockSequence(
        rows([{ cnt: '10' }]),
        rows([{}]),
        rows([{ cnt: '0' }]),
        rows([{ run_date_and_time: null }]),
        rows([{ first_ts: null, last_ts: null }]),
      );

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.records_evaluated).toBe(0);
    });

    it('defaults alerts_not_generated to 0 when naltQuery row has no cnt', async () => {
      mockSequence(
        rows([{ cnt: '10' }]),
        rows([{ cnt: '5' }]),
        rows([{}]),
        rows([{ run_date_and_time: null }]),
        rows([{ first_ts: null, last_ts: null }]),
      );

      const stats = await getSimulationStatsFromDB(sim, iterationNo, tenantId);
      expect(stats.alerts_not_generated).toBe(0);
      expect(stats.alerts_generated).toBe(5);
    });
  });
});
