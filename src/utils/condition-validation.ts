import { type EntityCondition, type AccountCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export const checkConditionValidity = (condition: EntityCondition | AccountCondition): void => {
  const nowDateTime = new Date().toISOString();

  const incptnDtTm = isDateValid(condition.incptnDtTm);
  if (!incptnDtTm) {
    throw Error(`Error: the provided incptnDtTm: '${condition.incptnDtTm}' is invalid`);
  }
  condition.incptnDtTm = incptnDtTm.toISOString();

  if (condition.evtTp.length > 1 && condition.evtTp.includes('all')) {
    throw Error('Error: event type "evtTp" can not specify the value "all" as well as specific event types');
  }

  if (condition?.incptnDtTm < nowDateTime) {
    throw Error('Error: Inception date cannot be in the past');
  }

  if (condition.condTp === 'override') {
    if (condition.xprtnDtTm) {
      const xprtnDtTm = isDateValid(condition.xprtnDtTm);
      if (!xprtnDtTm) {
        throw Error(`Error: the provided xprtnDtTm: '${condition.xprtnDtTm}' is invalid`);
      } else {
        condition.xprtnDtTm = xprtnDtTm.toISOString();
      }
    } else {
      throw Error('Error: Expiration date needs to be provided for override conditions.');
    }
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

  if (!parsedDate) {
    return { isValid: false, dateStr: new Date().toISOString(), message: 'Expiration time date provided was invalid.' };
  }

  if (hasDateExpired(new Date(parsedDate))) {
    return { isValid: false, dateStr: parsedDate, message: 'Expiration time date provided was before the current time date.' };
  }

  return { isValid: true, dateStr: parsedDate, message: 'Validated' };
};
