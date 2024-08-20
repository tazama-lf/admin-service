import { type EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { type Condition } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/Condition';
import type { Edge, Entity } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';
import { type MetaData } from '@tazama-lf/frms-coe-lib/lib/interfaces/metaData';

export interface Entry {
  edge: Edge;
  entity: Entity;
  condition: MetaData & Condition;
}
export interface ConditionDetails extends Pick<Condition, 'incptnDtTm' | 'xprtnDtTm'> {
  condId: string;
  condTp: string;
  condRsn: string;
  usr: string;
  creDtTm: string;
  prsptvs: Array<Pick<Condition, 'prsptv' | 'evtTp' | 'incptnDtTm' | 'xprtnDtTm'>>;
}

export interface EntityConditionResponse extends EntityCondition {
  conditions: ConditionDetails[];
}
