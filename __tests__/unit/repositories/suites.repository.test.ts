import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

import {
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
    expect(callArg.values[13]).toBe(JSON.stringify({ currentStep: 1, completedSteps: [1] }));
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
    expect(callArg.values[13]).toBe(JSON.stringify({ currentStep: 2, completedSteps: [1, 2] }));
    expect(callArg.values[14]).toBe(JSON.stringify({ channel: 'wizard' }));
    expect(callArg.values[16]).toBe('user-a@example.com');
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
});
