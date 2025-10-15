import { AccountCondition, EntityCondition, RawConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// Create dates without mutating the same object
const currentDate = new Date();
export const fixedDate = currentDate.toISOString();

// Create a new date for inception time (current time + 5 minutes to pass validation)
const inceptionDate = new Date(currentDate.getTime() + 5 * 60 * 1000);
export const incptnDtTm = inceptionDate.toISOString();

// Create a new date for expiration time (2 months from now)
const expirationDate = new Date();
expirationDate.setMonth(expirationDate.getMonth() + 2);
export const xprtnDtTm = expirationDate.toISOString();

export const rawResponseEntity = {
  governed_as_creditor_by: [
    {
      edge: {
        source: '+27733161225MSISDN',
        destination: 'cond123',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
        tenantId: 'DEFAULT',
      },
      result: {
        id: '+27733161225MSISDN',
        CreDtTm: fixedDate,
        TenantId: 'DEFAULT',
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
        tenantId: 'DEFAULT',
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
        tenantId: 'DEFAULT',
      },
      result: {
        id: '+27733161225MSISDN',
        CreDtTm: fixedDate,
        TenantId: 'DEFAULT',
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
        tenantId: 'DEFAULT',
      },
    },
  ],
  governed_as_creditor_account_by: [],
  governed_as_debtor_account_by: [],
};

export const rawResponseAccount: RawConditionResponse = {
  governed_as_creditor_account_by: [
    {
      edge: {
        id: 'edge-id-1',
        source: '1010101010Mxxdfsp001',
        destination: 'cond123',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
        tenantId: 'DEFAULT',
      },
      result: {
        id: '1010101010Mxxdfsp001',
        TenantId: 'DEFAULT',
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
        tenantId: 'DEFAULT',
      },
    },
  ],
  governed_as_debtor_account_by: [
    {
      edge: {
        id: 'edge-id-2',
        source: '1010101010Mxxdfsp001',
        destination: 'cond123',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
        tenantId: 'DEFAULT',
      },
      result: {
        id: '1010101010Mxxdfsp001',
        TenantId: 'DEFAULT',
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
        tenantId: 'DEFAULT',
      },
    },
  ],
  governed_as_creditor_by: [],
  governed_as_debtor_by: [],
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
        tenantId: 'DEFAULT',
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
        tenantId: 'DEFAULT',
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
  condId: '2110',
  tenantId: 'DEFAULT',
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
  condId: '2110',
  tenantId: 'DEFAULT',
};
