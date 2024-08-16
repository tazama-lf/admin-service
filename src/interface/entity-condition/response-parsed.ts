import { type EntityCondition } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { type Condition } from '@frmscoe/frms-coe-lib/lib/interfaces/event-flow/Condition';
import type { Edge, Entity } from './response-raw';

export interface RawCondition extends Condition {
  _key: string;
  _id: string;
  _rev: string;
}

export interface Entry {
  edge: Edge;
  entity: Entity;
  condition: RawCondition;
}

export interface Prsptv {
  prsptv: string;
  evtTp: string[];
  incptnDtTm: string;
  xprtnDtTm: string;
}

export interface ConditionDetails extends Pick<Prsptv, 'incptnDtTm' | 'xprtnDtTm'> {
  condId: string;
  condTp: string;
  condRsn: string;
  usr: string;
  creDtTm: string;
  prsptvs: Prsptv[];
}

export interface EntityConditionResponse extends EntityCondition {
  conditions: ConditionDetails[];
}
