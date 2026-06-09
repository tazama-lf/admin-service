import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

import {
  getSimulationSuitesCountsFromDb,
  getSimulationSuitesFromDb,
  getSimulationSuiteByIdFromDb,
  createSimulationSuiteInDb,
  updateSimulationSuiteInDb,
} from '../../../src/repositories/simulation-studio/suites.repository';

describe('Suites Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSimulationSuitesFromDb should apply all filters and return parsed data', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ total: '1' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          tenant_id: 'tenant-a',
          name: 'Suite A',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: '{"currentStep":1}',
          metadata: '{"source":"ui"}',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    });

    const result = await getSimulationSuitesFromDb({
      tenantId: 'tenant-a',
      search: 'suite',
      status: 'DRAFT' as any,
      ruleName: 'Rule 1',
      txtp: 'pacs.008',
      updatedFrom: new Date('2026-05-01'),
      updatedTo: new Date('2026-05-31'),
      limit: 10,
      offset: 5,
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].wizard_progress).toEqual({ currentStep: 1, completedSteps: [1] });
    expect(result.data[0].metadata).toEqual({ source: 'ui' });

    const countQuery = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string };
    expect(countQuery.text).toContain('COUNT(*)');
    const dataQuery = mockHandlePostExecuteSqlStatement.mock.calls[1][0] as { text: string };
    expect(dataQuery.text).toContain('ORDER BY updated_at DESC');
  });

  it('getSimulationSuitesCountsFromDb should return parsed counts and latest run date', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          total_suites: '12',
          total_draft_suites: '5',
          total_completed_suites: '4',
          latest_run_at: '2026-06-08T10:15:00.000Z',
        },
      ],
    });

    const result = await getSimulationSuitesCountsFromDb('tenant-a');

    expect(result.total_suites).toBe(12);
    expect(result.total_draft_suites).toBe(5);
    expect(result.total_completed_suites).toBe(4);
    expect(result.latest_run_at).toBeInstanceOf(Date);
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('COUNT(*) AS total_suites'), values: ['tenant-a'] }),
      'simulation',
    );
  });

  it('getSimulationSuitesCountsFromDb should fallback to zeros when row missing', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await getSimulationSuitesCountsFromDb('tenant-a');

    expect(result).toEqual({
      total_suites: 0,
      total_draft_suites: 0,
      total_completed_suites: 0,
      latest_run_at: null,
    });
  });

  it('getSimulationSuiteByIdFromDb should return null when missing', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await getSimulationSuiteByIdFromDb(99, 'tenant-a');

    expect(result).toBeNull();
  });

  it('getSimulationSuiteByIdFromDb should parse row when found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 1,
          tenant_id: 'tenant-a',
          name: 'Suite A',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: '{}',
          metadata: '{}',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
          last_run_at: '2026-05-02T00:00:00.000Z',
        },
      ],
    });

    const result = await getSimulationSuiteByIdFromDb(1, 'tenant-a');

    expect(result?.id).toBe(1);
    expect(result?.last_run_at).toBeInstanceOf(Date);
  });

  it('getSimulationSuiteByIdFromDb should preserve object fields and undefined last_run_at', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 2,
          tenant_id: 'tenant-a',
          name: 'Suite B',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: { currentStep: 1 },
          metadata: { source: 'api' },
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    });

    const result = await getSimulationSuiteByIdFromDb(2, 'tenant-a');

    expect(result?.wizard_progress).toEqual({ currentStep: 1, completedSteps: [1] });
    expect(result?.metadata).toEqual({ source: 'api' });
    expect(result?.last_run_at).toBeUndefined();
  });

  it('createSimulationSuiteInDb should apply defaults and initialize wizard progress', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 1,
          tenant_id: 'tenant-a',
          name: 'Suite A',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: '{"currentStep":1,"completedSteps":[1]}',
          metadata: '{}',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    const result = await createSimulationSuiteInDb({ name: 'Suite A' } as any, 'tenant-a', 'user-a');

    expect(result.name).toBe('Suite A');
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { values: unknown[] };
    expect(callArg.values[3]).toBe('SINGLE_RULE');
    expect(callArg.values[4]).toBe('DRAFT');
    expect(callArg.values[14]).toBe(JSON.stringify({ currentStep: 1, completedSteps: [1] }));
  });

  it('createSimulationSuiteInDb should keep provided wizard progress and user email', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 2,
          tenant_id: 'tenant-a',
          name: 'Suite B',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: '{"currentStep":2}',
          metadata: '{}',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    const result = await createSimulationSuiteInDb(
      {
        name: 'Suite B',
        wizard_progress: { currentStep: 2, completedSteps: [1, 2] },
        metadata: { channel: 'wizard' },
      } as any,
      'tenant-a',
      'user-a',
      'user-a@example.com',
    );

    expect(result.name).toBe('Suite B');
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { values: unknown[] };
    expect(callArg.values[14]).toBe(JSON.stringify({ currentStep: 2, completedSteps: [1, 2] }));
    expect(callArg.values[15]).toBe(JSON.stringify({ channel: 'wizard' }));
    expect(callArg.values[17]).toBe('user-a@example.com');
  });

  it('updateSimulationSuiteInDb should return existing record when payload has no updates', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 1,
          tenant_id: 'tenant-a',
          name: 'Suite A',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: '{}',
          metadata: '{}',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    const result = await updateSimulationSuiteInDb(1, 'tenant-a', {} as any);

    expect(result?.id).toBe(1);
    const queryArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string };
    expect(queryArg.text).toContain('WHERE id = $1 AND tenant_id = $2');
  });

  it('updateSimulationSuiteInDb should apply dynamic updates and return parsed result', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 1,
          tenant_id: 'tenant-a',
          name: 'Suite Updated',
          simulation_type: 'SINGLE_RULE',
          status: 'RUNNING',
          wizard_progress: '{"currentStep":2}',
          metadata: '{"step":2}',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
          last_run_at: '2026-05-02T10:00:00.000Z',
        },
      ],
    });

    const result = await updateSimulationSuiteInDb(1, 'tenant-a', {
      name: 'Suite Updated',
      description: '',
      status: 'RUNNING' as any,
      primary_txtp: '',
      wizard_progress: { currentStep: 2 },
      metadata: { step: 2 },
    } as any);

    expect(result?.name).toBe('Suite Updated');
    expect(result?.wizard_progress).toEqual({ currentStep: 2 });
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('updated_at = NOW()');
    expect(callArg.values).toContain(1);
    expect(callArg.values).toContain('tenant-a');
  });

  it('updateSimulationSuiteInDb should return null when update returns no rows', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await updateSimulationSuiteInDb(1, 'tenant-a', { status: 'FAILED' as any } as any);

    expect(result).toBeNull();
  });

  it('getSimulationSuitesFromDb should preserve object JSON fields without parsing', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ total: '1' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          tenant_id: 'tenant-a',
          name: 'Suite C',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: { currentStep: 3 },
          metadata: { updatedBy: 'svc' },
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-03T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    });

    const result = await getSimulationSuitesFromDb({ tenantId: 'tenant-a' } as any);

    expect(result.total).toBe(1);
    expect(result.data[0].wizard_progress).toEqual({ currentStep: 3, completedSteps: [1, 2, 3] });
    expect(result.data[0].metadata).toEqual({ updatedBy: 'svc' });
    expect(result.data[0].last_run_at).toBeUndefined();
  });

  it('getSimulationSuitesFromDb should map last_run_at to Date when present', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ total: '1' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 11,
          tenant_id: 'tenant-a',
          name: 'Suite D',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: '{}',
          metadata: '{}',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-03T00:00:00.000Z',
          last_run_at: '2026-05-03T10:00:00.000Z',
        },
      ],
    });

    const result = await getSimulationSuitesFromDb({ tenantId: 'tenant-a' } as any);

    expect(result.data[0].last_run_at).toBeInstanceOf(Date);
  });

  it('getSimulationSuitesFromDb should fallback total to 0 when count row is missing', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const result = await getSimulationSuitesFromDb({ tenantId: 'tenant-a' } as any);

    expect(result.total).toBe(0);
    expect(result.data).toEqual([]);
  });

  it('createSimulationSuiteInDb passes rule_config as JSON string and returns it parsed', async () => {
    const ruleConfig = { threshold: 1000, band: 'high' };
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 5,
          tenant_id: 'tenant-a',
          name: 'Suite E',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: JSON.stringify(ruleConfig),
          wizard_progress: '{"currentStep":1,"completedSteps":[1]}',
          metadata: '{}',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    const result = await createSimulationSuiteInDb({ name: 'Suite E', rule_config: ruleConfig } as any, 'tenant-a', 'user-a');

    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { values: unknown[] };
    // rule_config is at index 8 (0-based) in the INSERT values
    expect(callArg.values[8]).toBe(JSON.stringify(ruleConfig));
    expect(result.rule_config).toEqual(ruleConfig);
  });

  it('createSimulationSuiteInDb returns empty object rule_config when column is null', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 6,
          tenant_id: 'tenant-a',
          name: 'Suite F',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: null,
          wizard_progress: '{}',
          metadata: '{}',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    const result = await createSimulationSuiteInDb({ name: 'Suite F' } as any, 'tenant-a', 'user-a');

    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { values: unknown[] };
    expect(callArg.values[8]).toBeNull(); // no rule_config passed
    expect(result.rule_config).toEqual({});
  });

  it('updateSimulationSuiteInDb updates rule_config and returns it parsed', async () => {
    const ruleConfig = { limit: 500 };
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 1,
          tenant_id: 'tenant-a',
          name: 'Suite A',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: JSON.stringify(ruleConfig),
          wizard_progress: '{}',
          metadata: '{}',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    const result = await updateSimulationSuiteInDb(1, 'tenant-a', { rule_config: ruleConfig } as any);

    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('rule_config');
    expect(callArg.values).toContain(JSON.stringify(ruleConfig));
    expect(result!.rule_config).toEqual(ruleConfig);
  });

  it('getSimulationSuiteByIdFromDb returns rule_config parsed from string', async () => {
    const ruleConfig = { mode: 'strict' };
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 3,
          tenant_id: 'tenant-a',
          name: 'Suite G',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: JSON.stringify(ruleConfig),
          wizard_progress: '{"currentStep":1,"completedSteps":[1]}',
          metadata: '{}',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    });

    const result = await getSimulationSuiteByIdFromDb(3, 'tenant-a');

    expect(result?.rule_config).toEqual(ruleConfig);
  });

  it('getSimulationSuitesFromDb returns rule_config parsed from string', async () => {
    const ruleConfig = { velocity: 10 };
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ total: '1' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          tenant_id: 'tenant-a',
          name: 'Suite H',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: JSON.stringify(ruleConfig),
          wizard_progress: { currentStep: 1, completedSteps: [1] },
          metadata: {},
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    });

    const result = await getSimulationSuitesFromDb({ tenantId: 'tenant-a' } as any);

    expect(result.data[0].rule_config).toEqual(ruleConfig);
  });

  it('createSimulationSuiteInDb should preserve object wizard and metadata in returned row', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 3,
          tenant_id: 'tenant-a',
          name: 'Suite Obj',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: { currentStep: 4 },
          metadata: { owner: 'qa' },
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    const result = await createSimulationSuiteInDb({ name: 'Suite Obj' } as any, 'tenant-a', 'user-a');

    expect(result.wizard_progress).toEqual({ currentStep: 4 });
    expect(result.metadata).toEqual({ owner: 'qa' });
  });

  it('updateSimulationSuiteInDb should map object fields and null last_run_at in response', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 4,
          tenant_id: 'tenant-a',
          name: 'Suite Obj Updated',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          wizard_progress: { currentStep: 5 },
          metadata: { phase: 'done' },
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    });

    const result = await updateSimulationSuiteInDb(4, 'tenant-a', {
      description: null,
      rule_repo: null,
      rule_name: null,
      rule_version: null,
      primary_txtp: null,
      primary_txtp_version: null,
      last_run_at: null,
    } as any);

    expect(result?.wizard_progress).toEqual({ currentStep: 5 });
    expect(result?.metadata).toEqual({ phase: 'done' });
    expect(result?.last_run_at).toBeUndefined();

    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { values: unknown[] };
    expect(callArg.values).toContain(null);
  });

  it('createSimulationSuiteInDb returns rule_config unchanged when already object', async () => {
    const ruleConfig = { threshold: 500 };
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 7,
          tenant_id: 'tenant-a',
          name: 'X',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: ruleConfig,
          wizard_progress: '{}',
          metadata: '{}',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    } as never);
    const result = await createSimulationSuiteInDb({ name: 'X' } as any, 'tenant-a', 'user-a');
    expect(result.rule_config).toEqual(ruleConfig);
  });

  it('getSimulationSuiteByIdFromDb returns rule_config unchanged when already object', async () => {
    const ruleConfig = { mode: 'fast' };
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 8,
          tenant_id: 'tenant-a',
          name: 'Y',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: ruleConfig,
          wizard_progress: '{"currentStep":1,"completedSteps":[1]}',
          metadata: '{}',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    } as never);
    const result = await getSimulationSuiteByIdFromDb(8, 'tenant-a');
    expect(result?.rule_config).toEqual(ruleConfig);
  });

  it('getSimulationSuitesFromDb returns rule_config unchanged when already object', async () => {
    const ruleConfig = { cap: 999 };
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ total: '1' }] } as never).mockResolvedValueOnce({
      rows: [
        {
          id: 13,
          tenant_id: 'tenant-a',
          name: 'Z',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: ruleConfig,
          wizard_progress: { currentStep: 1, completedSteps: [1] },
          metadata: {},
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
          last_run_at: null,
        },
      ],
    } as never);
    const result = await getSimulationSuitesFromDb({ tenantId: 'tenant-a' } as any);
    expect(result.data[0].rule_config).toEqual(ruleConfig);
  });

  it('updateSimulationSuiteInDb returns rule_config unchanged when already object', async () => {
    const ruleConfig = { version: 2 };
    mockHandlePostExecuteSqlStatement.mockResolvedValue({
      rows: [
        {
          id: 9,
          tenant_id: 'tenant-a',
          name: 'W',
          simulation_type: 'SINGLE_RULE',
          status: 'DRAFT',
          rule_config: ruleConfig,
          wizard_progress: '{}',
          metadata: '{}',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    } as never);
    const result = await updateSimulationSuiteInDb(9, 'tenant-a', { name: 'W' } as any);
    expect(result?.rule_config).toEqual(ruleConfig);
  });
});
