// SPDX-License-Identifier: Apache-2.0
import { loggerService } from '..';
import { countSimulationsInDB, createSimulationInDB, findSimulationsInDB } from '../repositories/configuration/simulation.repository';

export const createSimulation = async (body: Record<string, unknown>, tenantId: string): Promise<{ message: string; id: number }> => {
  try {
    loggerService.log(`Creating simulation for tenant ${tenantId}`);

    const typedBody = body as {
      simulation_id?: string;
      total_record?: number;
      record_processed?: number;
      sim_status?: string;
    };

    if (!typedBody.simulation_id) throw new Error('simulation_id is required');

    const data: Record<string, unknown> = {
      simulation_id: typedBody.simulation_id,
      tenant_id: tenantId,
      ...(typedBody.total_record !== undefined && { total_record: typedBody.total_record }),
      ...(typedBody.record_processed !== undefined && { record_processed: typedBody.record_processed }),
      ...(typedBody.sim_status !== undefined && { sim_status: typedBody.sim_status }),
    };

    const id = await createSimulationInDB(data);
    loggerService.log(`Simulation created with id ${id} for tenant ${tenantId}`);
    return { message: `Simulation with id ${id} created successfully`, id };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error creating simulation: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const findSimulations = async (
  limit = 10,
  offset = 0,
  tenantId: string,
): Promise<{ data: unknown; total: number; limit: number; offset: number }> => {
  try {
    loggerService.log(`Fetching simulations for tenant ${tenantId} with limit=${limit}, offset=${offset}`);

    const total = await countSimulationsInDB(tenantId);
    const response = await findSimulationsInDB(tenantId, limit, offset * limit);

    loggerService.log(`Retrieved ${total} simulation records for tenant ${tenantId}`);

    return { data: response.result, total, limit, offset };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error fetching simulations: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
