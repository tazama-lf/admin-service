import type { Ntty, Acct } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';

interface ExpireCondition {
  condId: string;
  xprtnDtTm: string;
}

export interface ExpireAccountCondition extends ExpireCondition {
  acct: Acct;
}

export interface ExpireEntityCondition extends ExpireCondition {
  ntty: Ntty;
}
