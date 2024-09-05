import { type EntityCondition, type AccountCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';

const checkConditionValidity = (condition: EntityCondition | AccountCondition): void => {
  const nowDateTime = new Date().toISOString();

  if (!condition?.incptnDtTm) {
    condition.incptnDtTm = nowDateTime;
  }

  if (condition.evtTp.length > 1 && condition.evtTp.includes('all')) {
    throw Error('Error: event type "evtTp" can not specify the value "all" as well as specific event types');
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

  if (condition?.xprtnDtTm) {
    const expirationDate = new Date(condition.xprtnDtTm);
    if (isNaN(expirationDate.getTime())) {
      throw Error('Error: Expiration date provided was invalid.');
    }
  }

  if (condition?.incptnDtTm) {
    const inceptionnDate = new Date(condition.incptnDtTm);
    if (isNaN(inceptionnDate.getTime())) {
      throw Error('Error: Inception date provided was invalid.');
    }
  }
};

export const isDateValid = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

export const hasDateExpired = (date: Date): boolean => {
  const now = new Date();
  return date < now;
};

export default checkConditionValidity;
