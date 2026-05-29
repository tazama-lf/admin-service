// SPDX-License-Identifier: Apache-2.0
import { SIMULATION_SUITE_DESCRIPTION_MAX_LENGTH, SIMULATION_SUITE_NAME_MAX_LENGTH } from '../interface/simulation-suites.interface';
import { HttpException, HttpStatus } from './error';

export const validateSimulationSuiteLengthConstraints = (payload: { name?: string; description?: string }): void => {
  if (payload.name && payload.name.length > SIMULATION_SUITE_NAME_MAX_LENGTH) {
    throw new HttpException(`Simulation suite name cannot exceed ${SIMULATION_SUITE_NAME_MAX_LENGTH} characters`, HttpStatus.BAD_REQUEST);
  }

  if (payload.description && payload.description.length > SIMULATION_SUITE_DESCRIPTION_MAX_LENGTH) {
    throw new HttpException(
      `Simulation suite description cannot exceed ${SIMULATION_SUITE_DESCRIPTION_MAX_LENGTH} characters`,
      HttpStatus.BAD_REQUEST,
    );
  }
};
