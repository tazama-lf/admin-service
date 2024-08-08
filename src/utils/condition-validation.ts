import { type EntityCondition, type AccountCondition } from '@frmscoe/frms-coe-lib/lib/interfaces';

const checkConditionValidity = (condition: EntityCondition | AccountCondition): void => {
  const nowDateTime = new Date().toISOString();

  if (!condition?.incptnDtTm) {
    condition.incptnDtTm = nowDateTime;
  }

  if (condition?.incptnDtTm < nowDateTime) {
    throw Error('Error: Inception date cannot be past the current time.');
  }

  if (condition.condTp === 'override' && !condition?.xprtnDtTm) {
    throw Error('Error: Expiration date needs to be provided for override conditions.');
  }

  if (condition.xprtnDtTm && condition?.xprtnDtTm < condition.incptnDtTm) {
    throw Error('Error: Expiration date must be after inception date.');
  }

  if (typeof condition.usr !== 'string') {
    throw Error('Error: User was not provided');
  }
};

export default checkConditionValidity;
