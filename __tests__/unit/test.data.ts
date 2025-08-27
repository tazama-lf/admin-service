import { AccountCondition, EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
const currentDateReq = new Date();
export const fixedDate = currentDateReq.toISOString();
export const incptnDtTm = new Date(currentDateReq.setMonth(currentDateReq.getMonth() + 1)).toISOString();
let timedate = new Date(currentDateReq.setMonth(currentDateReq.getMonth() + 2)).toISOString();
export const xprtnDtTm = timedate || undefined;

export const rawResponseEntity = {
  governed_as_creditor_by: [
    {
      edge: {
        source: '+27733161225MSISDN',
        destination: 'cond123',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        id: '+27733161225MSISDN',
        CreDtTm: fixedDate,
      },
      condition: {
        condId: 'cond123',
        evtTp: ['pacs.008.001.10'],
        condTp: 'overridable-block',
        prsptv: 'both',
        incptnDtTm,
        xprtnDtTm,
        condRsn: 'R001',
        ntty: {
          id: '+27733161225',
          schmeNm: {
            prtry: 'MSISDN',
          },
        },
        forceCret: true,
        usr: 'bob',
        creDtTm: fixedDate,
      },
    },
  ],
  governed_as_debtor_by: [
    {
      edge: {
        source: '+27733161225MSISDN',
        destination: 'cond123',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        id: '+27733161225MSISDN',
        CreDtTm: fixedDate,
      },
      condition: {
        condId: 'cond123',
        evtTp: ['pacs.008.001.10'],
        condTp: 'overridable-block',
        prsptv: 'both',
        incptnDtTm,
        xprtnDtTm,
        condRsn: 'R001',
        ntty: {
          id: '+27733161225',
          schmeNm: {
            prtry: 'MSISDN',
          },
        },
        forceCret: true,
        usr: 'bob',
        creDtTm: fixedDate,
      },
    },
  ],
};

export const rawResponseAccount = {
  governed_as_creditor_account_by: [
    {
      edge: {
        source: '1010101010Mxxdfsp001',
        destination: 'cond123',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        id: '010101010Mxxdfsp001',
      },
      condition: {
        condId: 'cond123',
        evtTp: ['pacs.008.001.10'],
        condTp: 'overridable-block',
        prsptv: 'both',
        incptnDtTm,
        xprtnDtTm,
        condRsn: 'R001',
        acct: {
          id: '1010101010',
          schmeNm: {
            prtry: 'Mxx',
          },
          agt: {
            finInstnId: {
              clrSysMmbId: {
                mmbId: 'dfsp001',
              },
            },
          },
        },
        forceCret: true,
        usr: 'bob',
        creDtTm: fixedDate,
      },
    },
  ],
  governed_as_debtor_account_by: [
    {
      edge: {
        source: '1010101010Mxxdfsp001',
        destination: 'cond123',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        id: '1010101010Mxxdfsp001',
      },
      condition: {
        condId: 'cond123',
        evtTp: ['pacs.008.001.10'],
        condTp: 'overridable-block',
        prsptv: 'both',
        incptnDtTm,
        xprtnDtTm,
        condRsn: 'R001',
        acct: {
          id: '1010101010',
          schmeNm: {
            prtry: 'Mxx',
          },
          agt: {
            finInstnId: {
              clrSysMmbId: {
                mmbId: 'dfsp001',
              },
            },
          },
        },
        forceCret: true,
        usr: 'bob',
        creDtTm: fixedDate,
      },
    },
  ],
};

export const accountResponse = {
  code: 200,
  result: {
    acct: {
      id: '1010101010',
      agt: {
        finInstnId: {
          clrSysMmbId: {
            mmbId: 'dfsp001',
          },
        },
      },
      schmeNm: {
        prtry: 'Mxx',
      },
    },
    conditions: [
      {
        condId: 'cond123',
        xprtnDtTm,
        condTp: 'overridable-block',
        creDtTm: fixedDate,
        incptnDtTm,
        condRsn: 'R001',
        usr: 'bob',
        prsptvs: [
          {
            prsptv: 'governed_as_creditor_account_by',
            evtTp: ['pacs.008.001.10'],
            incptnDtTm,
            xprtnDtTm,
          },
          {
            prsptv: 'governed_as_debtor_account_by',
            evtTp: ['pacs.008.001.10'],
            incptnDtTm,
            xprtnDtTm,
          },
        ],
      },
    ],
  },
};

export const entityResponse = {
  code: 200,
  result: {
    ntty: {
      id: '+27733161225',
      schmeNm: {
        prtry: 'MSISDN',
      },
    },
    conditions: [
      {
        condId: 'cond123',
        condTp: 'overridable-block',
        incptnDtTm,
        xprtnDtTm,
        condRsn: 'R001',
        usr: 'bob',
        creDtTm: fixedDate,
        prsptvs: [
          {
            prsptv: 'governed_as_creditor_by',
            evtTp: ['pacs.008.001.10'],
            incptnDtTm,
            xprtnDtTm,
          },
          {
            prsptv: 'governed_as_debtor_by',
            evtTp: ['pacs.008.001.10'],
            incptnDtTm,
            xprtnDtTm,
          },
        ],
      },
    ],
  },
};

export const sampleEntityCondition: EntityCondition = {
  evtTp: ['pacs.008.001.10', 'pacs.002.001.12'],
  condTp: 'overridable-block',
  prsptv: 'both',
  incptnDtTm,
  xprtnDtTm,
  condRsn: 'R001',
  ntty: {
    id: '+27733161225',
    schmeNm: {
      prtry: 'MSISDN',
    },
  },
  forceCret: true,
  usr: 'bob',
  creDtTm: fixedDate,
  condId: 'cond123',
};

export const sampleAccountCondition: AccountCondition = {
  evtTp: ['pacs.008.001.10', 'pacs.002.001.12'],
  condTp: 'non-overridable-block',
  prsptv: 'both',
  incptnDtTm,
  xprtnDtTm,
  condRsn: 'R001',
  acct: {
    id: '1010101010',
    schmeNm: {
      prtry: 'Mxx',
    },
    agt: {
      finInstnId: {
        clrSysMmbId: {
          mmbId: 'dfsp001',
        },
      },
    },
  },
  forceCret: true,
  usr: 'bob',
  creDtTm: fixedDate,
  condId: 'cond123',
};
