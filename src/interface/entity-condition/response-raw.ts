export interface MetaData {
  _key: string;
  _id: string;
  _rev: string;
}

export interface RawEntityConditionResponse {
  governed_as_creditor_by: Result[];
  governed_as_debtor_by: Result[];
}

export interface Result {
  edge: Edge;
  entity: Entity;
  condition: Condition;
}

export interface Edge extends MetaData {
  _from: string;
  _to: string;
  evtTp: string[];
  incptnDtTm: string;
  xprtnDtTm: string;
}

export interface Entity extends MetaData {
  Id: string;
  CreDtTm: string;
}

export interface Condition extends MetaData {
  evtTp: string[];
  condTp: string;
  prsptv: string;
  incptnDtTm: string;
  xprtnDtTm: string;
  condRsn: string;
  ntty: Ntty;
  forceCret: boolean;
  usr: string;
  creDtTm: string;
}

export interface Ntty {
  id: string;
  schmeNm: SchmeNm;
}

export interface SchmeNm {
  prtry: string;
}
