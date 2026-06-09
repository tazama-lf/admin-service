// SPDX-License-Identifier: Apache-2.0
import type { TxtpMapping, UpsertTxtpMappingDto } from '../interface/simulation-studio/suite-generation.interface';
import {
  insertTxtpMappingInDb,
  getTxtpMappingByIdsInDb,
  deleteTxtpMappingByIdsInDb,
} from '../repositories/simulation-studio/txtp-mapping.repository';
import { HttpException, HttpStatus } from '../utils/error';

const validateIds = (primaryTxtpId: number, relatedTxtpId: number): void => {
  if (!Number.isInteger(primaryTxtpId) || primaryTxtpId <= 0) {
    throw new HttpException('primary_txtp_id must be a positive integer', HttpStatus.BAD_REQUEST);
  }

  if (!Number.isInteger(relatedTxtpId) || relatedTxtpId <= 0) {
    throw new HttpException('related_txtp_id must be a positive integer', HttpStatus.BAD_REQUEST);
  }
};

export const createTxtpMapping = async (dto: UpsertTxtpMappingDto): Promise<TxtpMapping> => {
  try {
    const { primary_txtp_id: primaryTxtpId, related_txtp_id: relatedTxtpId, mapping } = dto;
    validateIds(primaryTxtpId, relatedTxtpId);

    if (!Array.isArray(mapping)) {
      throw new HttpException('mapping must be an array', HttpStatus.BAD_REQUEST);
    }

    return await insertTxtpMappingInDb(primaryTxtpId, relatedTxtpId, mapping);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to save mapping: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getTxtpMappings = async (primaryTxtpId: number, relatedTxtpId: number): Promise<TxtpMapping[]> => {
  try {
    validateIds(primaryTxtpId, relatedTxtpId);
    return await getTxtpMappingByIdsInDb(primaryTxtpId, relatedTxtpId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to fetch mapping: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const upsertTxtpMapping = async (dto: UpsertTxtpMappingDto): Promise<TxtpMapping> => await createTxtpMapping(dto);

export const deleteTxtpMapping = async (primaryTxtpId: number, relatedTxtpId: number): Promise<boolean> => {
  try {
    validateIds(primaryTxtpId, relatedTxtpId);
    return await deleteTxtpMappingByIdsInDb(primaryTxtpId, relatedTxtpId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to delete mapping: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
