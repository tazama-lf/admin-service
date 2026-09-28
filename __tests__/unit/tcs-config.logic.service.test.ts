// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
  withConfigurationTransaction: jest.fn(async (work: (client?: unknown) => unknown) => await work(undefined)),
}));

jest.mock('../../src/repositories/configuration/tcs.config.repository', () => ({
  ConfigConflictError: class ConfigConflictError extends Error {
    constructor(message = 'Configuration has been modified by another process') {
      super(message);
      this.name = 'ConfigConflictError';
    }
  },
  createConfig: jest.fn(),
  findConfigById: jest.fn(),
  findConfigsByStatus: jest.fn(),
  updateConfig: jest.fn(),
  updateConfigByStatus: jest.fn(),
  createTransactionTypeTable: jest.fn(),
  createTazamaDataModelTable: jest.fn(),
  findAllTransactionTypes: jest.fn(),
  getPayloadByTransactionType: jest.fn(),
  getSchemaByTransactionType: jest.fn(),
  getSchemaByTransactionTypew3: jest.fn(),
  getRelatedTransactions: jest.fn(),
}));
jest.mock('../../src/services/data-model.logic.service', () => ({
  handleGetDataModelJson: jest.fn(),
}));

import * as tcsConfigService from '../../src/services/tcs-config.logic.service';
import * as tcsConfigRepository from '../../src/repositories/configuration/tcs.config.repository';
import { handleGetDataModelJson } from '../../src/services/data-model.logic.service';
import { withConfigurationTransaction } from '../../src/services/database.logic.service';
import { HttpException, HttpStatus } from '../../src/utils/error';

describe('TCS Config Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockConfigId = '1';

  beforeEach(() => {
    jest.clearAllMocks();
    (withConfigurationTransaction as jest.Mock).mockImplementation(async (work: (client?: unknown) => unknown) => await work(undefined));
    (handleGetDataModelJson as jest.Mock).mockResolvedValue({
      targetField: 'value',
      newTarget: 'value',
      oldTarget: 'value',
      target1: 'value',
      target: 'value',
      transactionDetails: {
        MsgId: 'message-id',
      },
    });
  });

  describe('handlePostConfig', () => {
    it('should create config successfully with all required fields', async () => {
      const mockConfig = {
        msgFam: 'ISO20022',
        transactionType: 'pacs.008.001.10',
        endpointPath: '/api/v1/transactions',
        version: '1.0.0',
        schema: { type: 'object', properties: {} },
        createdBy: 'user@example.com',
      };

      const mockCreatedId = 1;

      (tcsConfigRepository.createConfig as jest.Mock).mockResolvedValue(mockCreatedId);

      const result = await tcsConfigService.handlePostConfig(mockConfig, mockTenantId);

      expect(tcsConfigRepository.createConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          msgFam: mockConfig.msgFam,
          transactionType: mockConfig.transactionType,
          endpointPath: mockConfig.endpointPath,
          version: mockConfig.version,
          schema: mockConfig.schema,
          tenantId: mockTenantId,
        }),
      );
      expect(result.message).toBe('New config was saved successfully.');
      expect(result.result.id).toBe(mockCreatedId);
    });

    it('should create config with default values for optional fields', async () => {
      const mockConfig = {
        msgFam: 'ISO20022',
        transactionType: 'pacs.002.001.12',
        endpointPath: '/api/v1/payments',
        version: '2.0.0',
        schema: { type: 'object' },
      };

      const mockCreatedId = 2;

      (tcsConfigRepository.createConfig as jest.Mock).mockResolvedValue(mockCreatedId);

      const result = await tcsConfigService.handlePostConfig(mockConfig, mockTenantId);

      expect(result.result.contentType).toBe('application/json');
      expect(result.result.status).toBe('STATUS_01_IN_PROGRESS');
      expect(result.result.publishing_status).toBe('inactive');
      expect(result.result.createdBy).toBe('system');
    });

    it('should throw error when required fields are missing', async () => {
      const mockConfig = {
        msgFam: 'ISO20022',
        // Missing transactionType, endpointPath, version, and schema
      };

      (tcsConfigRepository.createConfig as jest.Mock).mockRejectedValue(new Error('Missing required fields'));

      await expect(tcsConfigService.handlePostConfig(mockConfig as any, mockTenantId)).rejects.toThrow('Failed to create configuration');
    });

    it('should throw error when config creation fails', async () => {
      const mockConfig = {
        msgFam: 'ISO20022',
        transactionType: 'pacs.008.001.10',
        endpointPath: '/api/v1/transactions',
        version: '1.0.0',
        schema: { type: 'object' },
      };

      (tcsConfigRepository.createConfig as jest.Mock).mockResolvedValue(null);

      await expect(tcsConfigService.handlePostConfig(mockConfig, mockTenantId)).rejects.toThrow('Failed to create configuration');
    });

    it('should create config with mapping and functions', async () => {
      const mockConfig = {
        msgFam: 'ISO20022',
        transactionType: 'pacs.008.001.10',
        endpointPath: '/api/v1/transactions',
        version: '1.0.0',
        schema: { type: 'object' },
        payload: {
          field1: 'value',
        },
        mapping: [
          {
            source: ['field1'],
            destination: 'target',
            type: 'direct',
          },
        ],
        functions: [
          {
            functionName: 'validateAmount',
            params: ['amount'],
            tableName: 'transactions',
            columns: ['id', 'amount'],
          },
        ],
      };

      const mockCreatedId = 3;

      (tcsConfigRepository.createConfig as jest.Mock).mockResolvedValue(mockCreatedId);

      const result = await tcsConfigService.handlePostConfig(mockConfig, mockTenantId);

      expect(result.result.mapping).toEqual(mockConfig.mapping);
      expect(result.result.functions).toEqual(mockConfig.functions);
    });

    it('should validate mappings before creating config', async () => {
      const mockConfig = {
        msgFam: 'ISO20022',
        transactionType: 'pacs.008.001.10',
        endpointPath: '/api/v1/transactions',
        version: '1.0.0',
        schema: { type: 'object' },
        payload: {
          field1: 'value',
        },
        mapping: [
          {
            source: ['missingField'],
            destination: 'target',
            type: 'direct',
          },
        ],
      };

      await expect(tcsConfigService.handlePostConfig(mockConfig, mockTenantId)).rejects.toMatchObject({
        message: 'Mapping source does not exist in payload_json: missingField',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.createConfig).not.toHaveBeenCalled();
    });
  });

  describe('handleFindConfigByID', () => {
    it('should find config by ID successfully', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        transactionType: 'pacs.008.001.10',
        endpointPath: '/api/v1/transactions',
        version: '1.0.0',
        schema: { type: 'object' },
        tenantId: mockTenantId,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      const result = await tcsConfigService.handleFindConfigByID(mockConfigId, mockTenantId);

      expect(tcsConfigRepository.findConfigById).toHaveBeenCalledWith(1, mockTenantId);
      expect(result).toEqual(mockConfig);
    });

    it('should throw error when config is not found', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(null);

      await expect(tcsConfigService.handleFindConfigByID('999', mockTenantId)).rejects.toThrow('Failed to retrieve configuration');
    });
  });

  describe('handleGetAllConfigs', () => {
    it('should retrieve all configs with pagination', async () => {
      const mockConfigs = {
        data: [
          { id: 1, msgFam: 'ISO20022', transactionType: 'pacs.008.001.10' },
          { id: 2, msgFam: 'ISO20022', transactionType: 'pacs.002.001.12' },
        ],
        total: 2,
        limit: 10,
        offset: 0,
      };

      (tcsConfigRepository.findConfigsByStatus as jest.Mock).mockResolvedValue(mockConfigs);

      const result = await tcsConfigService.handleGetAllConfigs(10, 0, {}, mockTenantId);

      expect(tcsConfigRepository.findConfigsByStatus).toHaveBeenCalledWith(10, 0, {}, mockTenantId);
      expect(result).toEqual(mockConfigs);
      expect(result.data).toHaveLength(2);
    });

    it('should handle filters when retrieving configs', async () => {
      const filters = { status: 'active', transactionType: 'pacs.008.001.10' };
      const mockConfigs = {
        data: [{ id: 1, msgFam: 'ISO20022', transactionType: 'pacs.008.001.10', status: 'active' }],
        total: 1,
        limit: 10,
        offset: 0,
      };

      (tcsConfigRepository.findConfigsByStatus as jest.Mock).mockResolvedValue(mockConfigs);

      const result = await tcsConfigService.handleGetAllConfigs(10, 0, filters, mockTenantId);

      expect(tcsConfigRepository.findConfigsByStatus).toHaveBeenCalledWith(10, 0, filters, mockTenantId);
      expect(result.data).toHaveLength(1);
    });

    it('should throw error when retrieving configs fails', async () => {
      (tcsConfigRepository.findConfigsByStatus as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(tcsConfigService.handleGetAllConfigs(10, 0, {}, mockTenantId)).rejects.toThrow('Failed to retrieve configurations');
    });
  });

  describe('handleUpdateConfig', () => {
    it('should update config successfully', async () => {
      const mockUpdatedConfig = {
        id: 1,
        msgFam: 'ISO20022Updated',
        transactionType: 'pacs.008.001.10',
        description: 'Updated description',
      };

      const updateData = {
        msgFam: 'ISO20022Updated',
        description: 'Updated description',
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue({ id: 1, revision: 3 });
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleUpdateConfig(1, mockTenantId, updateData);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, updateData, 3);
      expect(result).toEqual(mockUpdatedConfig);
    });

    it('should throw HTTP 409 when update has a revision conflict', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue({ id: 1, revision: 3 });
      (tcsConfigRepository.updateConfig as jest.Mock).mockRejectedValue(
        new HttpException('Configuration was modified by another request; retry', HttpStatus.CONFLICT),
      );

      await expect(tcsConfigService.handleUpdateConfig(1, mockTenantId, { msgFam: 'Updated' })).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { msgFam: 'Updated' }, 3);
    });

    it('should throw error when config to update is not found', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(null);

      await expect(tcsConfigService.handleUpdateConfig(999, mockTenantId, { msgFam: 'Test' })).rejects.toThrow(
        'Failed to update configuration',
      );
    });

    it('should throw error when update fails', async () => {
      (tcsConfigRepository.updateConfig as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(tcsConfigService.handleUpdateConfig(1, mockTenantId, { msgFam: 'Updated' }, '2026-04-07T10:00:00.000Z')).rejects.toThrow(
        'Failed to update configuration',
      );
    });

    it('should validate updated mappings against XML payload before updating config', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        version: '1.0.0',
        contentType: 'application/xml',
        payload: '<Document><FIToFIPmtSts><GrpHdr><MsgId>message-id</MsgId></GrpHdr></FIToFIPmtSts></Document>',
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleUpdateConfig(1, mockTenantId, {
          mapping: [
            {
              source: ['FIToFIPmtSts.GrpHdr.MissingField'],
              destination: 'transactionDetails.MsgId',
              type: 'direct',
            },
          ],
        }),
      ).rejects.toMatchObject({
        message: 'Mapping source does not exist in payload_xml: FIToFIPmtSts.GrpHdr.MissingField',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should revalidate existing mappings when payload changes', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        version: '1.0.0',
        payload: { field1: 'value' },
        mapping: [{ source: ['field1'], destination: 'target', type: 'direct' }],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(tcsConfigService.handleUpdateConfig(1, mockTenantId, { payload: { otherField: 'value' } })).rejects.toMatchObject({
        message: 'Mapping source does not exist in payload_json: field1',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should update config when updated mappings are valid', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        version: '1.0.0',
        payload: {
          field1: 'value',
        },
      };
      const updates = {
        mapping: [{ source: ['field1'], destination: 'target', type: 'direct' }],
      };
      const mockUpdatedConfig = {
        ...mockConfig,
        ...updates,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleUpdateConfig(1, mockTenantId, updates);

      expect(handleGetDataModelJson).toHaveBeenCalledWith(mockTenantId);
      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, updates, mockConfig.revision);
      expect(result).toEqual(mockUpdatedConfig);
    });
  });

  describe('handleUpdatePublishingStatus', () => {
    it('should update publishing status to active', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        publishing_status: 'inactive',
      };

      const mockUpdatedConfig = {
        id: 1,
        msgFam: 'ISO20022',
        publishing_status: 'active',
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleUpdatePublishingStatus(1, mockTenantId, 'active');

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { publishing_status: 'active' });
      expect(result.publishing_status).toBe('active');
    });

    it('should update publishing status to inactive', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        publishing_status: 'active',
      };

      const mockUpdatedConfig = {
        id: 1,
        msgFam: 'ISO20022',
        publishing_status: 'inactive',
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleUpdatePublishingStatus(1, mockTenantId, 'inactive');

      expect(result.publishing_status).toBe('inactive');
    });

    it('should throw error when config is not found', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(null);

      await expect(tcsConfigService.handleUpdatePublishingStatus(999, mockTenantId, 'active')).rejects.toThrow(
        'Failed to update publishing status',
      );
    });

    it('should throw HTTP 409 when publishing status update has a version conflict', async () => {
      const mockConfig = {
        id: 1,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockRejectedValue(new (tcsConfigRepository.ConfigConflictError as any)());

      await expect(tcsConfigService.handleUpdatePublishingStatus(1, mockTenantId, 'active')).rejects.toThrow(
        'Failed to update publishing status',
      );
    });
  });

  describe('handleCreateTransactionTypeTable', () => {
    it('should create transaction type table successfully', async () => {
      (tcsConfigRepository.createTransactionTypeTable as jest.Mock).mockResolvedValue(undefined);

      await tcsConfigService.handleCreateTransactionTypeTable('pacs_008_001_10');

      expect(tcsConfigRepository.createTransactionTypeTable).toHaveBeenCalledWith('pacs_008_001_10');
    });

    it('should throw error when transaction type is empty', async () => {
      await expect(tcsConfigService.handleCreateTransactionTypeTable('')).rejects.toThrow('Failed to create transaction type table');
    });

    it('should throw error when table creation fails', async () => {
      (tcsConfigRepository.createTransactionTypeTable as jest.Mock).mockRejectedValue(new Error('Table creation failed'));

      await expect(tcsConfigService.handleCreateTransactionTypeTable('test_table')).rejects.toThrow(
        'Failed to create transaction type table',
      );
    });
  });

  describe('handleCreateTazamaDataModelTable', () => {
    it('should create Tazama data model table successfully', async () => {
      (tcsConfigRepository.createTazamaDataModelTable as jest.Mock).mockResolvedValue(undefined);

      await tcsConfigService.handleCreateTazamaDataModelTable('tazama_test_table');

      expect(tcsConfigRepository.createTazamaDataModelTable).toHaveBeenCalledWith('tazama_test_table');
    });

    it('should throw error when table name is empty', async () => {
      await expect(tcsConfigService.handleCreateTazamaDataModelTable('')).rejects.toThrow('Failed to create data model table');
    });

    it('should throw error when table creation fails', async () => {
      (tcsConfigRepository.createTazamaDataModelTable as jest.Mock).mockRejectedValue(new Error('Table creation failed'));

      await expect(tcsConfigService.handleCreateTazamaDataModelTable('test_table')).rejects.toThrow('Failed to create data model table');
    });

    it('should propagate a 409 conflict when the table already exists', async () => {
      (tcsConfigRepository.createTazamaDataModelTable as jest.Mock).mockRejectedValue(
        new HttpException('Table "test_table" already exists', HttpStatus.CONFLICT),
      );

      await expect(tcsConfigService.handleCreateTazamaDataModelTable('test_table')).rejects.toMatchObject({
        message: 'Table "test_table" already exists',
        status: 409,
      });
    });
  });

  describe('handleUpdateConfigByStatus', () => {
    it('should update config status successfully', async () => {
      (tcsConfigRepository.updateConfigByStatus as jest.Mock).mockResolvedValue(1);

      const result = await tcsConfigService.handleUpdateConfigByStatus('1', 'active', mockTenantId);

      expect(tcsConfigRepository.updateConfigByStatus).toHaveBeenCalledWith('1', 'active', mockTenantId);
      expect(result).toBe(1);
    });

    it('should throw error when no rows are updated', async () => {
      (tcsConfigRepository.updateConfigByStatus as jest.Mock).mockRejectedValue(new Error('Configuration not found'));

      await expect(tcsConfigService.handleUpdateConfigByStatus('999', 'active', mockTenantId)).rejects.toThrow(
        'Failed to update configuration status',
      );
    });

    it('should throw error when status update fails', async () => {
      (tcsConfigRepository.updateConfigByStatus as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(tcsConfigService.handleUpdateConfigByStatus('1', 'active', mockTenantId)).rejects.toThrow(
        'Failed to update configuration status',
      );
    });
  });

  describe('handleAddMapping', () => {
    it('should add mapping to config successfully', async () => {
      const updatedAt = '2026-04-07T10:00:00.000Z';
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          field1: 'value1',
          field2: 'value2',
        },
        updatedAt: '2026-04-07T09:59:00.000Z',
        revision: 4,
      };

      const newMapping = {
        source: ['field1', 'field2'],
        destination: 'targetField',
        type: 'direct',
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [newMapping],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [newMapping] }, mockConfig.revision);
      expect(result.mapping?.[0]).toEqual(newMapping);
    });

    it('should add mapping to existing mappings', async () => {
      const updatedAt = '2026-04-07T10:00:00.000Z';
      const existingMapping = {
        source: ['oldField'],
        destination: 'oldTarget',
        type: 'transform',
      };

      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [existingMapping],
        payload: {
          oldField: 'value',
          newField: 'value',
        },
        updatedAt: '2026-04-07T09:59:00.000Z',
      };

      const newMapping = {
        source: 'newField',
        destination: 'newTarget',
        type: 'direct',
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [existingMapping, { ...newMapping, source: ['newField'] }],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping as any);
    });

    it('should throw HTTP 400 when source does not exist in payload_json', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          FIToFIPmtSts: {
            GrpHdr: {
              MsgId: 'message-id',
            },
          },
        },
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, {
          source: ['FIToFIPmtSts.GrpHdr.MissingField'],
          destination: 'transactionDetails.MissingField',
          type: 'direct',
        } as any),
      ).rejects.toMatchObject({
        message: 'Mapping source does not exist in payload_json: FIToFIPmtSts.GrpHdr.MissingField',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should add mapping when source exists at any payload_json layer', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          FIToFIPmtSts: {
            GrpHdr: {
              MsgId: 'message-id',
            },
          },
        },
      };

      const newMapping = {
        source: ['MsgId'],
        destination: 'transactionDetails.MsgId',
        type: 'direct',
      };
      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [newMapping],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [newMapping] }, mockConfig.revision);
      expect(result).toEqual(mockUpdatedConfig);
    });

    it('should add mapping when XML source exists in payload_xml', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        contentType: 'application/xml',
        mapping: [],
        payload: '<?xml version="1.0"?><FIToFIPmtSts><GrpHdr><MsgId>message-id</MsgId></GrpHdr></FIToFIPmtSts>',
      };
      const newMapping = {
        source: ['FIToFIPmtSts.GrpHdr.MsgId'],
        destination: 'transactionDetails.MsgId',
        type: 'direct',
      };
      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [newMapping],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [newMapping] }, mockConfig.revision);
      expect(result).toEqual(mockUpdatedConfig);
    });

    it('should throw HTTP 400 when XML source does not exist in payload_xml', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        contentType: 'application/xml',
        mapping: [],
        payload: '<FIToFIPmtSts><GrpHdr><MsgId>message-id</MsgId></GrpHdr></FIToFIPmtSts>',
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, {
          source: ['FIToFIPmtSts.GrpHdr.MissingField'],
          destination: 'transactionDetails.MsgId',
          type: 'direct',
        } as any),
      ).rejects.toMatchObject({
        message: 'Mapping source does not exist in payload_xml: FIToFIPmtSts.GrpHdr.MissingField',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should throw HTTP 400 when XML config has no payload_xml', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        contentType: 'application/xml',
        mapping: [],
        payload: null,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, {
          source: ['FIToFIPmtSts.GrpHdr.MsgId'],
          destination: 'transactionDetails.MsgId',
          type: 'direct',
        } as any),
      ).rejects.toMatchObject({
        message: 'payload_xml not found',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should add mapping when destination exists at any data model JSON layer', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          MsgId: 'message-id',
        },
      };
      const newMapping = {
        source: ['MsgId'],
        destination: 'MsgId',
        type: 'direct',
      };
      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [newMapping],
      };

      (handleGetDataModelJson as jest.Mock).mockResolvedValue({
        transactionDetails: {
          MsgId: 'message-id',
        },
      });
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping);

      expect(handleGetDataModelJson).toHaveBeenCalledWith(mockTenantId);
      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [newMapping] }, mockConfig.revision);
      expect(result).toEqual(mockUpdatedConfig);
    });

    it('should throw HTTP 400 when destination does not exist in data model JSON', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          MsgId: 'message-id',
        },
      };

      (handleGetDataModelJson as jest.Mock).mockResolvedValue({
        transactionDetails: {
          CreDtTm: 'created-at',
        },
      });
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, {
          source: ['MsgId'],
          destination: 'transactionDetails.MsgId',
          type: 'direct',
        } as any),
      ).rejects.toMatchObject({
        message: 'Mapping destination does not exist in data model JSON: transactionDetails.MsgId',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(handleGetDataModelJson).toHaveBeenCalledWith(mockTenantId);
      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should add mapping when source and destination exist inside arrays', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: [{ account: { Id: 'account-id' } }],
      };
      const newMapping = {
        source: ['Id'],
        destination: 'Id',
        type: 'direct',
      };
      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [newMapping],
      };

      (handleGetDataModelJson as jest.Mock).mockResolvedValue({
        transactionDetails: [{ account: { Id: 'account-id' } }],
      });
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [newMapping] }, mockConfig.revision);
      expect(result).toEqual(mockUpdatedConfig);
    });

    it('should throw HTTP 400 when data model JSON is not found', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          MsgId: 'message-id',
        },
      };

      (handleGetDataModelJson as jest.Mock).mockResolvedValue(null);
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, {
          source: ['MsgId'],
          destination: 'transactionDetails.MsgId',
          type: 'direct',
        } as any),
      ).rejects.toMatchObject({
        message: 'Data model JSON not found',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should throw HTTP 409 when source and destination composite already exists', async () => {
      const existingMapping = {
        source: ['FIToFIPmtSts.GrpHdr.MsgId'],
        destination: 'transactionDetails.MsgId',
        type: 'direct',
      };

      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [existingMapping],
        payload: {
          FIToFIPmtSts: {
            GrpHdr: {
              MsgId: 'message-id',
            },
          },
        },
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(tcsConfigService.handleAddMapping(1, mockTenantId, existingMapping)).rejects.toMatchObject({
        message: 'Mapping with the same source and destination already exists',
        status: HttpStatus.CONFLICT,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should throw HTTP 409 when destination is already mapped with another source', async () => {
      const existingMapping = {
        source: ['FIToFIPmtSts.GrpHdr.MsgId'],
        destination: 'transactionDetails.MsgId',
        type: 'direct',
      };
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [existingMapping],
        payload: {
          FIToFIPmtSts: {
            GrpHdr: {
              MsgId: 'message-id',
              CreDtTm: 'created-at',
            },
          },
        },
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, {
          source: ['FIToFIPmtSts.GrpHdr.CreDtTm'],
          destination: 'transactionDetails.MsgId',
          type: 'direct',
        } as any),
      ).rejects.toMatchObject({
        message: 'Mapping destination is already mapped: transactionDetails.MsgId',
        status: HttpStatus.CONFLICT,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should add mapping when source is undefined', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: undefined,
        updatedAt: new Date(),
      };

      const newMapping = {
        destination: 'targetField',
        type: 'direct',
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [{ ...newMapping, source: undefined }],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping as any);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(
        1,
        mockTenantId,
        expect.objectContaining({ mapping: expect.any(Array) }),
        mockConfig.revision,
      );
      expect(result).toEqual(mockUpdatedConfig);
    });

    it('should throw error when config is not found', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(null);

      await expect(
        tcsConfigService.handleAddMapping(999, mockTenantId, { source: ['field'], destination: 'target', type: 'direct' } as any),
      ).rejects.toThrow('Failed to add mapping');
    });

    it('should throw HTTP 409 when add mapping has a revision conflict', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          field: 'value',
        },
        revision: 5,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockRejectedValue(
        new HttpException('Configuration was modified by another request; retry', HttpStatus.CONFLICT),
      );

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, { source: ['field'], destination: 'target', type: 'direct' } as any),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(
        1,
        mockTenantId,
        { mapping: [{ source: ['field'], destination: 'target', type: 'direct' }] },
        5,
      );
    });

    it('should reject a mapping source that terminates at a simple array', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          tags: ['a', 'b'],
        },
        revision: 1,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(
        tcsConfigService.handleAddMapping(1, mockTenantId, { source: 'tags', destination: 'target', type: 'direct' } as any),
      ).rejects.toMatchObject({
        message: 'Mapping source does not exist in payload_json: tags',
        status: HttpStatus.BAD_REQUEST,
      });

      expect(tcsConfigRepository.updateConfig).not.toHaveBeenCalled();
    });

    it('should accept a mapping source that traverses an array of objects', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [],
        payload: {
          items: [{ amount: 10 }, { amount: 20 }],
        },
        revision: 1,
      };

      const newMapping = { source: 'items.amount', destination: 'target', type: 'direct' };
      const mockUpdatedConfig = { ...mockConfig, mapping: [newMapping] };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddMapping(1, mockTenantId, newMapping as any);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(
        1,
        mockTenantId,
        { mapping: [{ ...newMapping, source: ['items.amount'] }] },
        1,
      );
      expect(result.mapping?.[0]).toEqual(newMapping);
    });
  });

  describe('handleRemoveMapping', () => {
    it('should remove mapping from config successfully', async () => {
      const updatedAt = '2026-04-07T10:00:00.000Z';
      const mappings = [
        { source: ['field1'], destination: 'target1', type: 'direct' },
        { source: ['field2'], destination: 'target2', type: 'transform' },
      ];

      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: mappings,
        updatedAt: '2026-04-07T09:59:00.000Z',
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [mappings[1]],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleRemoveMapping(1, mockTenantId, 0);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [mappings[1]] }, mockConfig.revision);
      expect(result.mapping?.[0]).toEqual(mappings[1]);
    });

    it('should throw error when config is not found', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(null);

      await expect(tcsConfigService.handleRemoveMapping(999, mockTenantId, 0)).rejects.toThrow('Failed to remove mapping');
    });

    it('should throw error when mapping index is invalid', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [{ source: ['field1'], destination: 'target1', type: 'direct' }],
        updatedAt: new Date(),
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(tcsConfigService.handleRemoveMapping(1, mockTenantId, 5)).rejects.toThrow('Failed to remove mapping');
    });

    it('should throw HTTP 409 when remove mapping has a revision conflict', async () => {
      const mappings = [{ source: ['field1'], destination: 'target1', type: 'direct' }];
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: mappings,
        revision: 6,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockRejectedValue(
        new HttpException('Configuration was modified by another request; retry', HttpStatus.CONFLICT),
      );

      await expect(tcsConfigService.handleRemoveMapping(1, mockTenantId, 0)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [] }, 6);
    });

    it('should set mapping to empty array when last mapping is removed', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [{ source: ['field1'], destination: 'target1', type: 'direct' }],
        updatedAt: new Date(),
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleRemoveMapping(1, mockTenantId, 0);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [] }, mockConfig.revision);
      expect(result.mapping).toEqual([]);
    });

    it('should set mapping to empty array when last mapping is removed', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        mapping: [{ source: ['field1'], destination: 'target1', type: 'direct' }],
        updatedAt: new Date(),
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        mapping: [],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleRemoveMapping(1, mockTenantId, 0);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { mapping: [] }, mockConfig.revision);
      expect(result.mapping).toEqual([]);
    });
  });

  describe('handleAddFunction', () => {
    it('should add function to config successfully', async () => {
      const updatedAt = '2026-04-07T10:00:00.000Z';
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: [],
        updatedAt: '2026-04-07T09:59:00.000Z',
      };

      const newFunction = {
        functionName: 'validateAmount',
        params: ['amount', 'currency'],
        tableName: 'transactions',
        columns: ['id', 'amount', 'currency'],
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        functions: [newFunction],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddFunction(1, mockTenantId, newFunction);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { functions: [newFunction] }, mockConfig.revision);
      expect(result.functions?.[0]).toEqual(newFunction);
    });

    it('should add function with default empty arrays', async () => {
      const updatedAt = '2026-04-07T10:00:00.000Z';
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: [],
        updatedAt: '2026-04-07T09:59:00.000Z',
      };

      const newFunction = {
        functionName: 'simpleFunction',
      };

      const expectedFunction = {
        functionName: 'simpleFunction',
        params: [],
        tableName: '',
        columns: [],
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        functions: [expectedFunction],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddFunction(1, mockTenantId, newFunction);
    });

    it('should add function to config when functions list is null', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: null,
        updatedAt: new Date(),
      };

      const newFunction = {
        functionName: 'testFunction',
        params: ['param1'],
        tableName: 'testTable',
        columns: ['col1'],
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        functions: [newFunction],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleAddFunction(1, mockTenantId, newFunction);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { functions: [newFunction] }, mockConfig.revision);
      expect(result.functions?.[0]).toEqual(newFunction);
    });

    it('should throw error when config is not found', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(null);

      await expect(tcsConfigService.handleAddFunction(999, mockTenantId, { functionName: 'test' })).rejects.toThrow(
        'Failed to add function',
      );
    });

    it('should throw HTTP 409 when add function has a revision conflict', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: [],
        revision: 7,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockRejectedValue(
        new HttpException('Configuration was modified by another request; retry', HttpStatus.CONFLICT),
      );

      await expect(tcsConfigService.handleAddFunction(1, mockTenantId, { functionName: 'testFn' })).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(
        1,
        mockTenantId,
        { functions: [{ functionName: 'testFn', params: [], tableName: '', columns: [] }] },
        7,
      );
    });
  });

  describe('handleRemoveFunction', () => {
    it('should remove function from config successfully', async () => {
      const updatedAt = '2026-04-07T10:00:00.000Z';
      const functions = [
        { functionName: 'func1', params: [], tableName: '', columns: [] },
        { functionName: 'func2', params: ['param1'], tableName: 'table1', columns: ['col1'] },
      ];

      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: functions,
        updatedAt: '2026-04-07T09:59:00.000Z',
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        functions: [functions[1]],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleRemoveFunction(1, mockTenantId, 0);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { functions: [functions[1]] }, mockConfig.revision);
      expect(result.functions?.[0]).toEqual(functions[1]);
    });

    it('should throw error when config is not found', async () => {
      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(null);

      await expect(tcsConfigService.handleRemoveFunction(999, mockTenantId, 0)).rejects.toThrow('Failed to remove function');
    });

    it('should set functions to empty array when last function is removed', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: [{ functionName: 'func1', params: [], tableName: '', columns: [] }],
        updatedAt: new Date(),
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        functions: [],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleRemoveFunction(1, mockTenantId, 0);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { functions: [] }, mockConfig.revision);
      expect(result.functions).toEqual([]);
    });

    it('should set functions to empty array when last function is removed', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: [{ functionName: 'func1', params: [], tableName: '', columns: [] }],
        updatedAt: new Date(),
      };

      const mockUpdatedConfig = {
        ...mockConfig,
        functions: [],
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockResolvedValue(mockUpdatedConfig);

      const result = await tcsConfigService.handleRemoveFunction(1, mockTenantId, 0);

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { functions: [] }, mockConfig.revision);
      expect(result.functions).toEqual([]);
    });

    it('should throw error when function index is invalid', async () => {
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions: [{ functionName: 'func1', params: [], tableName: '', columns: [] }],
        updatedAt: new Date(),
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);

      await expect(tcsConfigService.handleRemoveFunction(1, mockTenantId, 10)).rejects.toThrow('Failed to remove function');
    });

    it('should throw HTTP 409 when remove function has a revision conflict', async () => {
      const functions = [{ functionName: 'func1', params: [], tableName: '', columns: [] }];
      const mockConfig = {
        id: 1,
        msgFam: 'ISO20022',
        functions,
        revision: 8,
      };

      (tcsConfigRepository.findConfigById as jest.Mock).mockResolvedValue(mockConfig);
      (tcsConfigRepository.updateConfig as jest.Mock).mockRejectedValue(
        new HttpException('Configuration was modified by another request; retry', HttpStatus.CONFLICT),
      );

      await expect(tcsConfigService.handleRemoveFunction(1, mockTenantId, 0)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

      expect(tcsConfigRepository.updateConfig).toHaveBeenCalledWith(1, mockTenantId, { functions: [] }, 8);
    });
  });

  describe('handleGetAllTransactionTypes', () => {
    it('should retrieve all transaction types', async () => {
      const mockTransactionTypes = ['pacs.008.001.10', 'pacs.002.001.12', 'pain.001.001.11'];

      (tcsConfigRepository.findAllTransactionTypes as jest.Mock).mockResolvedValue(mockTransactionTypes);

      const result = await tcsConfigService.handleGetAllTransactionTypes(mockTenantId);

      expect(tcsConfigRepository.findAllTransactionTypes).toHaveBeenCalledWith(mockTenantId);
      expect(result).toEqual(mockTransactionTypes);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no transaction types found', async () => {
      (tcsConfigRepository.findAllTransactionTypes as jest.Mock).mockResolvedValue([]);

      const result = await tcsConfigService.handleGetAllTransactionTypes(mockTenantId);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should throw error when retrieval fails', async () => {
      (tcsConfigRepository.findAllTransactionTypes as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(tcsConfigService.handleGetAllTransactionTypes(mockTenantId)).rejects.toThrow('Failed to retrieve transaction types');
    });
  });

  describe('handleGetPayloadByTransactionType', () => {
    it('should retrieve payload by transaction type', async () => {
      const mockPayload = {
        field1: 'value1',
        field2: 'value2',
        nested: {
          field3: 'value3',
        },
      };

      (tcsConfigRepository.getPayloadByTransactionType as jest.Mock).mockResolvedValue(mockPayload);

      const result = await tcsConfigService.handleGetPayloadByTransactionType('pacs.008.001.10', mockTenantId, '1.0.0');

      expect(tcsConfigRepository.getPayloadByTransactionType).toHaveBeenCalledWith('pacs.008.001.10', mockTenantId, '1.0.0');
      expect(result).toEqual(mockPayload);
    });

    it('should throw error when payload is not found', async () => {
      (tcsConfigRepository.getPayloadByTransactionType as jest.Mock).mockRejectedValue(new Error('Not found'));

      await expect(tcsConfigService.handleGetPayloadByTransactionType('invalid.type', mockTenantId, '1.0.0')).rejects.toThrow(
        'Failed to retrieve payload',
      );
    });
  });

  describe('handleGetConfigByTransactionType', () => {
    it('should retrieve config by transaction type', async () => {
      const mockConfig = {
        schema: { type: 'object' },
        mapping: { field: 'value' },
        content_type: 'JSON',
        payload_xml: null,
        payload_json: { payloadField: 'payloadValue' },
      };

      (tcsConfigRepository.getSchemaByTransactionType as jest.Mock).mockResolvedValue(mockConfig);

      const result = await tcsConfigService.handleGetConfigByTransactionType('pacs.008.001.10', '1.0.0', mockTenantId);

      expect(tcsConfigRepository.getSchemaByTransactionType).toHaveBeenCalledWith('pacs.008.001.10', '1.0.0', mockTenantId);
      expect(result).toEqual({
        schema: mockConfig.schema,
        mapping: mockConfig.mapping,
        payload: mockConfig.payload_json,
      });
    });

    it('should throw error when config is not found', async () => {
      (tcsConfigRepository.getSchemaByTransactionType as jest.Mock).mockRejectedValue(new Error('Not found'));

      await expect(tcsConfigService.handleGetConfigByTransactionType('invalid.type', '1.0.0', mockTenantId)).rejects.toThrow(
        'Configuration not found',
      );
    });

    it('should retrieve config with XML payload when content type is XML', async () => {
      const mockConfig = {
        schema: { type: 'object' },
        mapping: { field: 'value' },
        content_type: 'application/xml',
        payload_xml: '<root><data>test</data></root>',
        payload_json: null,
      };

      (tcsConfigRepository.getSchemaByTransactionType as jest.Mock).mockResolvedValue(mockConfig);

      const result = await tcsConfigService.handleGetConfigByTransactionType('pacs.008.001.10', '1.0.0', mockTenantId);

      expect(result).toEqual({
        schema: mockConfig.schema,
        mapping: mockConfig.mapping,
        payload: mockConfig.payload_xml,
      });
    });

    it('should retrieve config with XML payload when content type is XML', async () => {
      const mockConfig = {
        schema: { type: 'object' },
        mapping: { field: 'value' },
        content_type: 'application/xml',
        payload_xml: '<root><data>test</data></root>',
        payload_json: null,
      };

      (tcsConfigRepository.getSchemaByTransactionType as jest.Mock).mockResolvedValue(mockConfig);

      const result = await tcsConfigService.handleGetConfigByTransactionType('pacs.008.001.10', '1.0.0', mockTenantId);

      expect(result).toEqual({
        schema: mockConfig.schema,
        mapping: mockConfig.mapping,
        payload: mockConfig.payload_xml,
      });
    });
  });

  describe('handleGetRelatedTransactions', () => {
    it('should retrieve related transactions for a tenant', async () => {
      const mockRelatedTransactions = ['pacs.008.001.10', 'pacs.002.001.12'];

      (tcsConfigRepository.getRelatedTransactions as jest.Mock).mockResolvedValue(mockRelatedTransactions);

      const result = await tcsConfigService.handleGetRelatedTransactions(mockTenantId);

      expect(tcsConfigRepository.getRelatedTransactions).toHaveBeenCalledWith(mockTenantId);
      expect(result).toEqual(mockRelatedTransactions);
    });

    it('should return empty array when no related transactions exist', async () => {
      (tcsConfigRepository.getRelatedTransactions as jest.Mock).mockResolvedValue([]);

      const result = await tcsConfigService.handleGetRelatedTransactions(mockTenantId);

      expect(tcsConfigRepository.getRelatedTransactions).toHaveBeenCalledWith(mockTenantId);
      expect(result).toEqual([]);
    });

    it('should throw error when retrieval fails', async () => {
      (tcsConfigRepository.getRelatedTransactions as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(tcsConfigService.handleGetRelatedTransactions(mockTenantId)).rejects.toThrow('Database error');
    });
  });

  describe('handleGetConfigByTransactionTypew3', () => {
    it('returns config when found', async () => {
      const mockSchema = { type: 'object', properties: {} };
      (tcsConfigRepository.getSchemaByTransactionTypew3 as jest.Mock).mockResolvedValue(mockSchema as never);

      const result = await tcsConfigService.handleGetConfigByTransactionTypew3('pacs.008', '001.08', mockTenantId);

      expect(tcsConfigRepository.getSchemaByTransactionTypew3).toHaveBeenCalledWith('pacs.008', '001.08', mockTenantId);
      expect(result).toEqual(mockSchema);
    });

    it('throws error when config not found', async () => {
      (tcsConfigRepository.getSchemaByTransactionTypew3 as jest.Mock).mockRejectedValue(new Error('not found') as never);

      await expect(tcsConfigService.handleGetConfigByTransactionTypew3('pacs.008', '001.08', mockTenantId)).rejects.toThrow(
        'Configuration not found',
      );
    });
  });
});
