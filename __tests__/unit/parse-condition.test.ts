// SPDX-License-Identifier: Apache-2.0
import { parseConditionEntity, parseConditionAccount } from '../../src/utils/parse-condition';
import type {
  ConditionDetails,
  EntityConditionResponse,
  AccountConditionResponse,
} from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import type {
  RawConditionResponse,
  EntityCondition,
  AccountCondition,
  Ntty,
  Acct,
} from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';

describe('parse-condition', () => {
  const mockTenantId = 'test-tenant-123';

  const mockDate1 = '2024-01-01T10:00:00Z';
  const mockDate2 = '2024-01-02T10:00:00Z';
  const mockDate3 = '2024-01-03T10:00:00Z';

  const mockNtty: Ntty = {
    id: 'entity-123',
    schmeNm: {
      prtry: 'test-scheme',
    },
  };

  const mockAcct: Acct = {
    id: 'account-123',
    schmeNm: {
      prtry: 'test-scheme',
    },
    agt: {
      finInstnId: {
        clrSysMmbId: {
          mmbId: 'member-123',
        },
      },
    },
  };

  // Helper function to create mock EntityCondition
  const createMockEntityCondition = (condId: string, creDtTm: string, updDtTm?: string): EntityCondition => ({
    condId,
    evtTp: ['test-event'],
    tenantId: mockTenantId,
    condTp: 'test-type',
    prsptv: 'governed_as_creditor_by',
    incptnDtTm: '2024-01-01T00:00:00Z',
    xprtnDtTm: '2024-12-31T23:59:59Z',
    condRsn: 'test-reason',
    forceCret: false,
    usr: 'test-user',
    creDtTm,
    updDtTm,
    ntty: mockNtty,
  });

  // Helper function to create mock AccountCondition
  const createMockAccountCondition = (condId: string, creDtTm: string, updDtTm?: string): AccountCondition => ({
    condId,
    evtTp: ['test-event'],
    tenantId: mockTenantId,
    condTp: 'test-type',
    prsptv: 'governed_as_creditor_account_by',
    incptnDtTm: '2024-01-01T00:00:00Z',
    xprtnDtTm: '2024-12-31T23:59:59Z',
    condRsn: 'test-reason',
    forceCret: false,
    usr: 'test-user',
    creDtTm,
    updDtTm,
    acct: mockAcct,
  });

  describe('parseConditionEntity', () => {
    it('should return a ConditionDetails object containing creDtTm and updDtTm fields when both are set', () => {
      const mockCondition = createMockEntityCondition('cond-1', mockDate1, mockDate2);
      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'entity-1', creDtTm: mockDate1, TenantId: mockTenantId },
              condition: mockCondition,
            },
          ],
          governed_as_debtor_by: [],
          governed_as_creditor_account_by: [],
          governed_as_debtor_account_by: [],
        },
      ];

      const result: EntityConditionResponse = parseConditionEntity(mockInput, mockTenantId);

      expect(result).toBeDefined();
      expect(result.conditions).toHaveLength(1);
      expect(result.ntty).toEqual(mockNtty);

      const condition = result.conditions[0];
      expect(condition.creDtTm).toBe(mockDate1);
      expect(condition.updDtTm).toBe(mockDate2);
      expect(condition.condId).toBe('cond-1');
      expect(condition.condTp).toBe('test-type');
      expect(condition.tenantId).toBe(mockTenantId);
    });

    it('should omit updDtTm field from response when it is absent/undefined', () => {
      const mockCondition = createMockEntityCondition('cond-1', mockDate1); // No updDtTm
      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'entity-1', creDtTm: mockDate1, TenantId: mockTenantId },
              condition: mockCondition,
            },
          ],
          governed_as_debtor_by: [],
          governed_as_creditor_account_by: [],
          governed_as_debtor_account_by: [],
        },
      ];

      const result: EntityConditionResponse = parseConditionEntity(mockInput, mockTenantId);

      expect(result.conditions).toHaveLength(1);

      const condition = result.conditions[0];
      expect(condition.creDtTm).toBe(mockDate1);
      expect(condition.updDtTm).toBeUndefined();
    });

    it('should merge duplicate conditions with same condId under different perspectives into one ConditionDetails with multiple prsptvs entries', () => {
      const creditorCondition = createMockEntityCondition('cond-1', mockDate1, mockDate2);
      const debtorCondition = { ...createMockEntityCondition('cond-1', mockDate1, mockDate2), prsptv: 'governed_as_debtor_by' };

      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'entity-1', creDtTm: mockDate1, TenantId: mockTenantId },
              condition: creditorCondition,
            },
          ],
          governed_as_debtor_by: [
            {
              edge: {
                id: 'edge-2',
                source: 'source-2',
                destination: 'dest-2',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'entity-1', creDtTm: mockDate1, TenantId: mockTenantId },
              condition: debtorCondition,
            },
          ],
          governed_as_creditor_account_by: [],
          governed_as_debtor_account_by: [],
        },
      ];

      const result: EntityConditionResponse = parseConditionEntity(mockInput, mockTenantId);

      expect(result.conditions).toHaveLength(1); // Only one condition due to deduplication

      const condition = result.conditions[0];
      expect(condition.condId).toBe('cond-1');
      expect(condition.prsptvs).toHaveLength(2); // Two perspectives merged
      expect(condition.prsptvs[0].prsptv).toBe('governed_as_creditor_by');
      expect(condition.prsptvs[1].prsptv).toBe('governed_as_debtor_by');
    });

    it('should return conditions sorted by creDtTm in ascending order', () => {
      const condition1 = createMockEntityCondition('cond-1', mockDate3, mockDate3); // Latest
      const condition2 = createMockEntityCondition('cond-2', mockDate1, mockDate1); // Earliest
      const condition3 = createMockEntityCondition('cond-3', mockDate2, mockDate2); // Middle

      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'entity-1', creDtTm: mockDate3, TenantId: mockTenantId },
              condition: condition1,
            },
            {
              edge: {
                id: 'edge-2',
                source: 'source-2',
                destination: 'dest-2',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'entity-2', creDtTm: mockDate1, TenantId: mockTenantId },
              condition: condition2,
            },
            {
              edge: {
                id: 'edge-3',
                source: 'source-3',
                destination: 'dest-3',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'entity-3', creDtTm: mockDate2, TenantId: mockTenantId },
              condition: condition3,
            },
          ],
          governed_as_debtor_by: [],
          governed_as_creditor_account_by: [],
          governed_as_debtor_account_by: [],
        },
      ];

      const result: EntityConditionResponse = parseConditionEntity(mockInput, mockTenantId);

      expect(result.conditions).toHaveLength(3);

      // Check that conditions are sorted by creDtTm ascending
      expect(result.conditions[0].condId).toBe('cond-2'); // mockDate1 (earliest)
      expect(result.conditions[1].condId).toBe('cond-3'); // mockDate2 (middle)
      expect(result.conditions[2].condId).toBe('cond-1'); // mockDate3 (latest)

      expect(result.conditions[0].creDtTm).toBe(mockDate1);
      expect(result.conditions[1].creDtTm).toBe(mockDate2);
      expect(result.conditions[2].creDtTm).toBe(mockDate3);
    });

    it('should handle empty input gracefully', () => {
      const result: EntityConditionResponse = parseConditionEntity([], mockTenantId);

      expect(result.conditions).toHaveLength(0);
      expect(result.ntty).toBeUndefined();
    });
  });

  describe('parseConditionAccount', () => {
    it('should return a ConditionDetails object containing creDtTm and updDtTm fields when both are set', () => {
      const mockCondition = createMockAccountCondition('cond-1', mockDate1, mockDate2);
      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_account_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'account-1', TenantId: mockTenantId },
              condition: mockCondition,
            },
          ],
          governed_as_debtor_account_by: [],
          governed_as_creditor_by: [],
          governed_as_debtor_by: [],
        },
      ];

      const result: AccountConditionResponse = parseConditionAccount(mockInput, mockTenantId);

      expect(result).toBeDefined();
      expect(result.conditions).toHaveLength(1);
      expect(result.acct).toEqual(mockAcct);

      const condition = result.conditions[0];
      expect(condition.creDtTm).toBe(mockDate1);
      expect(condition.updDtTm).toBe(mockDate2);
      expect(condition.condId).toBe('cond-1');
      expect(condition.condTp).toBe('test-type');
      expect(condition.tenantId).toBe(mockTenantId);
    });

    it('should omit updDtTm field from response when it is absent/undefined', () => {
      const mockCondition = createMockAccountCondition('cond-1', mockDate1); // No updDtTm
      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_account_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'account-1', TenantId: mockTenantId },
              condition: mockCondition,
            },
          ],
          governed_as_debtor_account_by: [],
          governed_as_creditor_by: [],
          governed_as_debtor_by: [],
        },
      ];

      const result: AccountConditionResponse = parseConditionAccount(mockInput, mockTenantId);

      expect(result.conditions).toHaveLength(1);

      const condition = result.conditions[0];
      expect(condition.creDtTm).toBe(mockDate1);
      expect(condition.updDtTm).toBeUndefined();
    });

    it('should merge duplicate conditions with same condId under different perspectives into one ConditionDetails with multiple prsptvs entries', () => {
      const creditorCondition = createMockAccountCondition('cond-1', mockDate1, mockDate2);
      const debtorCondition = { ...createMockAccountCondition('cond-1', mockDate1, mockDate2), prsptv: 'governed_as_debtor_account_by' };

      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_account_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'account-1', TenantId: mockTenantId },
              condition: creditorCondition,
            },
          ],
          governed_as_debtor_account_by: [
            {
              edge: {
                id: 'edge-2',
                source: 'source-2',
                destination: 'dest-2',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'account-1', TenantId: mockTenantId },
              condition: debtorCondition,
            },
          ],
          governed_as_creditor_by: [],
          governed_as_debtor_by: [],
        },
      ];

      const result: AccountConditionResponse = parseConditionAccount(mockInput, mockTenantId);

      expect(result.conditions).toHaveLength(1); // Only one condition due to deduplication

      const condition = result.conditions[0];
      expect(condition.condId).toBe('cond-1');
      expect(condition.prsptvs).toHaveLength(2); // Two perspectives merged
      expect(condition.prsptvs[0].prsptv).toBe('governed_as_creditor_account_by');
      expect(condition.prsptvs[1].prsptv).toBe('governed_as_debtor_account_by');
    });

    it('should return conditions sorted by creDtTm in ascending order', () => {
      const condition1 = createMockAccountCondition('cond-1', mockDate3, mockDate3); // Latest
      const condition2 = createMockAccountCondition('cond-2', mockDate1, mockDate1); // Earliest
      const condition3 = createMockAccountCondition('cond-3', mockDate2, mockDate2); // Middle

      const mockInput: RawConditionResponse[] = [
        {
          governed_as_creditor_account_by: [
            {
              edge: {
                id: 'edge-1',
                source: 'source-1',
                destination: 'dest-1',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'account-1', TenantId: mockTenantId },
              condition: condition1,
            },
            {
              edge: {
                id: 'edge-2',
                source: 'source-2',
                destination: 'dest-2',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'account-2', TenantId: mockTenantId },
              condition: condition2,
            },
            {
              edge: {
                id: 'edge-3',
                source: 'source-3',
                destination: 'dest-3',
                evtTp: ['test-event'],
                tenantId: mockTenantId,
                incptnDtTm: '2024-01-01T00:00:00Z',
              },
              result: { id: 'account-3', TenantId: mockTenantId },
              condition: condition3,
            },
          ],
          governed_as_debtor_account_by: [],
          governed_as_creditor_by: [],
          governed_as_debtor_by: [],
        },
      ];

      const result: AccountConditionResponse = parseConditionAccount(mockInput, mockTenantId);

      expect(result.conditions).toHaveLength(3);

      // Check that conditions are sorted by creDtTm ascending
      expect(result.conditions[0].condId).toBe('cond-2'); // mockDate1 (earliest)
      expect(result.conditions[1].condId).toBe('cond-3'); // mockDate2 (middle)
      expect(result.conditions[2].condId).toBe('cond-1'); // mockDate3 (latest)

      expect(result.conditions[0].creDtTm).toBe(mockDate1);
      expect(result.conditions[1].creDtTm).toBe(mockDate2);
      expect(result.conditions[2].creDtTm).toBe(mockDate3);
    });

    it('should handle empty input gracefully', () => {
      const result: AccountConditionResponse = parseConditionAccount([], mockTenantId);

      expect(result.conditions).toHaveLength(0);
      expect(result.acct).toBeUndefined();
    });
  });
});
