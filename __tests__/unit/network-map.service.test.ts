// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as networkMapService from '../../src/services/network-map.service';
import * as networkMapRepository from '../../src/repositories/configuration/network.map.repository';

jest.mock('../../src/repositories/configuration/network.map.repository');
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Network Map Service', () => {
  const tenantId = 'test-tenant';
  const mockConfiguration = {
    messages: [
      {
        id: 'msg-001',
        cfg: '1.0.0',
        txTp: 'pain.001.001.03',
        channels: [
          {
            id: 'channel-001',
            cfg: '1.0.0',
            typologies: [
              {
                id: 'typology-001',
                cfg: '1.0.0',
                rules: [{ id: 'rule-001', cfg: '1.0.0' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const mockNetworkMap = {
    id: 1,
    active: true,
    cfg: '1.0.0',
    configuration: mockConfiguration,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findActiveNetworkMap', () => {
    it('should successfully retrieve active network map configuration', async () => {
      (networkMapRepository.findActiveNetworkMapInDb as jest.Mock).mockResolvedValue(mockNetworkMap);

      const result = await networkMapService.findActiveNetworkMap(tenantId);

      expect(result).toEqual(mockConfiguration);
      expect(networkMapRepository.findActiveNetworkMapInDb).toHaveBeenCalledWith(tenantId);
    });

    it('should return null when no active network map exists', async () => {
      (networkMapRepository.findActiveNetworkMapInDb as jest.Mock).mockResolvedValue(null);

      const result = await networkMapService.findActiveNetworkMap(tenantId);

      expect(result).toBeNull();
    });

    it('should throw error on repository failure', async () => {
      (networkMapRepository.findActiveNetworkMapInDb as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(networkMapService.findActiveNetworkMap(tenantId)).rejects.toThrow('Database connection failed');
    });

    it('should handle network map with empty messages', async () => {
      const emptyConfiguration = { messages: [] };
      const emptyNetworkMap = { ...mockNetworkMap, configuration: emptyConfiguration };
      (networkMapRepository.findActiveNetworkMapInDb as jest.Mock).mockResolvedValue(emptyNetworkMap);

      const result = await networkMapService.findActiveNetworkMap(tenantId);

      expect(result).toEqual(emptyConfiguration);
    });

    it('should handle network map with multiple messages', async () => {
      const multiMessageConfig = {
        messages: [
          mockConfiguration.messages[0],
          { ...mockConfiguration.messages[0], id: 'msg-002', txTp: 'pain.002.001.03' },
        ],
      };
      const multiMessageMap = { ...mockNetworkMap, configuration: multiMessageConfig };
      (networkMapRepository.findActiveNetworkMapInDb as jest.Mock).mockResolvedValue(multiMessageMap);

      const result = await networkMapService.findActiveNetworkMap(tenantId);

      expect(result).toEqual(multiMessageConfig);
    });
  });
});
