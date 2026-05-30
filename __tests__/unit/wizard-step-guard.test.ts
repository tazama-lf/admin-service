// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from '@jest/globals';
import { assertPreviousStepComplete } from '../../src/utils/wizard-step-guard';
import { HttpException } from '../../src/utils/error';
import type { WizardProgress } from '../../src/interface/simulation-suites.interface';

describe('assertPreviousStepComplete', () => {
  it('does not throw when required step is in completedSteps', () => {
    const progress: WizardProgress = { completedSteps: [1] };
    expect(() => assertPreviousStepComplete(progress, 1)).not.toThrow();
  });

  it('throws 428 when required step missing from completedSteps', () => {
    const progress: WizardProgress = { completedSteps: [] };
    expect(() => assertPreviousStepComplete(progress, 1)).toThrow(HttpException);
  });

  it('throws 428 with correct message', () => {
    const progress: WizardProgress = { completedSteps: [1] };
    try {
      assertPreviousStepComplete(progress, 2);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).status).toBe(428);
      expect((err as HttpException).response).toBe('Step 2 must be completed before proceeding to step 3');
    }
  });

  it('throws when completedSteps has other steps but not the required one', () => {
    const progress: WizardProgress = { completedSteps: [1, 3] };
    expect(() => assertPreviousStepComplete(progress, 2)).toThrow(HttpException);
  });

  it('does not throw when multiple steps completed and required step present', () => {
    const progress: WizardProgress = { completedSteps: [1, 2, 3] };
    expect(() => assertPreviousStepComplete(progress, 3)).not.toThrow();
  });

  it('treats missing completedSteps as empty array', () => {
    const progress: WizardProgress = {};
    expect(() => assertPreviousStepComplete(progress, 1)).toThrow(HttpException);
  });

  it('treats non-array completedSteps as empty array', () => {
    const progress: WizardProgress = { completedSteps: 'invalid' as unknown as number[] };
    expect(() => assertPreviousStepComplete(progress, 1)).toThrow(HttpException);
  });
});
