// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/suite-generations.repository', () => ({
  updateGenerationStatusInDb: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { HttpException } from '../../src/utils/error';
import * as generationsRepo from '../../src/repositories/simulation-studio/suite-generations.repository';
import { updateGenerationStatus } from '../../src/services/trs-suite-generation.logic.service';
import type { SuiteGeneration } from '../../src/interface/suite-generation.interface';

const mockGeneration: SuiteGeneration = {
  id: 1,
  suite_id: 42,
  generation_number: 1,
  status: 'DRAFT',
  simulation_type: 'SINGLE_RULE',
  context_count: 0,
  trigger_count: 0,
  enrichment_table_count: 0,
  generated_context_count: 0,
  generated_trigger_count: 0,
  generated_enrichment_row_count: 0,
  context_field_config_count: 0,
  trigger_field_config_count: 0,
  enrichment_field_config_count: 0,
  wizard_snapshot: {},
  generation_metadata: {},
  created_by: 'user-1',
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => jest.clearAllMocks());

describe('updateGenerationStatus', () => {
  it('updates generation status to COMPLETED', async () => {
    const updated = { ...mockGeneration, status: 'COMPLETED' };
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockResolvedValue(updated);

    const result = await updateGenerationStatus(1, 'COMPLETED');
    expect(result).toEqual(updated);
    expect(generationsRepo.updateGenerationStatusInDb).toHaveBeenCalledWith(1, 'COMPLETED');
  });

  it('updates generation status to FAILED', async () => {
    const updated = { ...mockGeneration, status: 'FAILED' };
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockResolvedValue(updated);

    const result = await updateGenerationStatus(1, 'FAILED');
    expect(result).toEqual(updated);
    expect(generationsRepo.updateGenerationStatusInDb).toHaveBeenCalledWith(1, 'FAILED');
  });

  it('updates generation status to RUNNING', async () => {
    const updated = { ...mockGeneration, status: 'RUNNING' };
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockResolvedValue(updated);

    const result = await updateGenerationStatus(1, 'RUNNING');
    expect(result).toEqual(updated);
    expect(generationsRepo.updateGenerationStatusInDb).toHaveBeenCalledWith(1, 'RUNNING');
  });

  it('updates generation status to READY', async () => {
    const updated = { ...mockGeneration, status: 'READY' };
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockResolvedValue(updated);

    const result = await updateGenerationStatus(1, 'READY');
    expect(result).toEqual(updated);
    expect(generationsRepo.updateGenerationStatusInDb).toHaveBeenCalledWith(1, 'READY');
  });

  it('throws 400 BAD_REQUEST for invalid status', async () => {
    await expect(updateGenerationStatus(1, 'INVALID_STATUS')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Invalid generation status'),
    });

    expect(generationsRepo.updateGenerationStatusInDb).not.toHaveBeenCalled();
  });

  it('throws 404 NOT_FOUND when generation does not exist', async () => {
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockResolvedValue(null);

    await expect(updateGenerationStatus(999, 'COMPLETED')).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('not found'),
    });
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('db error', 500);
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockRejectedValue(httpErr);

    await expect(updateGenerationStatus(1, 'COMPLETED')).rejects.toBe(httpErr);
  });

  it('wraps unknown Error in HttpException 500', async () => {
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockRejectedValue(new Error('db fail'));

    await expect(updateGenerationStatus(1, 'COMPLETED')).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (generationsRepo.updateGenerationStatusInDb as jest.Mock).mockRejectedValue('string error');

    await expect(updateGenerationStatus(1, 'COMPLETED')).rejects.toMatchObject({ status: 500 });
  });
});
