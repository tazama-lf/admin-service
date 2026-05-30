// SPDX-License-Identifier: Apache-2.0
import { HttpException, HttpStatus } from './error';
import type { WizardProgress } from '../interface/simulation-suites.interface';

/**
 * Throws 428 if the required previous step is not marked complete in wizard_progress.
 *
 * wizard_progress.completedSteps is the source of truth.
 * Suite creation (POST /suites) marks step 1 complete automatically.
 * Every subsequent step API must call this with requiredStep = currentStep - 1.
 *
 * @param wizardProgress - wizard_progress from trs_simulation_suites
 * @param requiredStep   - the step that must already be complete (e.g. 1 for step-2 APIs)
 */
export const assertPreviousStepComplete = (wizardProgress: WizardProgress, requiredStep: number): void => {
  const completedSteps = Array.isArray(wizardProgress.completedSteps) ? wizardProgress.completedSteps : [];

  if (!completedSteps.includes(requiredStep)) {
    throw new HttpException(
      `Step ${requiredStep} must be completed before proceeding to step ${requiredStep + 1}`,
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
};
