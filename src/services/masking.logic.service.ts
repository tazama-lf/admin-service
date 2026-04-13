import { loggerService } from '..';
import { createMasking } from '../repositories/configuration/masking.repository';

export const handlePostMask = async (mask: Record<string, unknown>, tenantId: string): Promise<{ message: string }> => {
  try {
    loggerService.log('Started handling post request of mask configuration executed');

    const maskData = (mask.maskData as Record<string, unknown>) || mask;
    const body = { ...maskData, tenant_id: tenantId };
    const createdMaskId = await createMasking(body);

    loggerService.log('New mask configuration was saved successfully.');

    return {
      message: `Masking Configuration with id ${createdMaskId} created Successfully`,
    };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting masking configuration with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
