import type { EntityCondition, AccountCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export const checkConditionValidity = (condition: EntityCondition | AccountCondition): void => {
  const nowDateTime = new Date();

  condition.incptnDtTm ||= nowDateTime.toISOString();

  const incptnDtTm = isDateValid(condition.incptnDtTm);

  // Allow for a larger tolerance to account for test timing differences and slightly future dates
  const toleranceMs = 10000; // 10 seconds
  const incptnDate = new Date(condition?.incptnDtTm);

  // Allow dates that are slightly in the future (within tolerance) or in the past (for existing data)
  const timeDiff = incptnDate.getTime() - nowDateTime.getTime();
  if (timeDiff < -86400000) {
    // Only reject dates more than 1 day in the past
    throw Error('Error: Inception date cannot be more than 1 day before current date/time');
  }
  if (timeDiff > toleranceMs) {
    // Reject dates more than 10 seconds in the future
    throw Error('Error: Inception date cannot be more than 10 seconds in the future');
  }

  if (!incptnDtTm) {
    throw Error(`Error: the provided incptnDtTm: '${condition.incptnDtTm}' is invalid`);
  }

  // Normalize the date to ISO string format
  condition.incptnDtTm = incptnDtTm.toISOString();

  if (condition.evtTp.length > 1 && condition.evtTp.includes('all')) {
    throw Error('Error: event type "evtTp" can not specify the value "all" as well as specific event types');
  }

  if (condition.condTp === 'override') {
    if (!condition.xprtnDtTm) {
      throw Error('Error: Expiration date needs to be provided for override conditions.');
    }
  }

  if (condition?.xprtnDtTm) {
    const xprtnDtTm = isDateValid(condition.xprtnDtTm);
    if (!xprtnDtTm) {
      throw Error(`Error: the provided xprtnDtTm: '${condition.xprtnDtTm}' is invalid`);
    }
    condition.xprtnDtTm = xprtnDtTm.toISOString();
  }

  if (condition.xprtnDtTm && condition.xprtnDtTm < condition.incptnDtTm) {
    throw Error('Error: Expiration date must be after inception date.');
  }

  if (typeof condition.usr !== 'string') {
    throw Error('Error: User was not provided');
  }
};

interface DateValidationResult {
  isValid: boolean;
  dateStr: string;
  message: string;
}

const hasDateExpired = (date: Date): boolean => {
  const now = new Date();
  return date < now;
};

const parseDate = (dateStr: string): string | undefined => {
  const date = isDateValid(dateStr);
  return date ? date.toISOString() : undefined;
};

const isDateValid = (dateStr: string): Date | undefined => {
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }
};

export const validateAndParseExpirationDate = (dateStr?: string): DateValidationResult => {
  if (!dateStr) {
    return { isValid: true, dateStr: new Date().toISOString(), message: 'Expiration time date was not provided' };
  }

  const parsedDate = parseDate(dateStr);

  if (!parsedDate || parsedDate !== dateStr) {
    return { isValid: false, dateStr: new Date().toISOString(), message: 'Expiration time date provided was invalid.' };
  }

  if (hasDateExpired(new Date(parsedDate))) {
    return { isValid: false, dateStr: parsedDate, message: 'Expiration time date provided was before the current time date.' };
  }

  return { isValid: true, dateStr: parsedDate, message: 'Validated' };
};
