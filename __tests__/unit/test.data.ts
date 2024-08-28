import { AccountCondition, EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export const fixedDate = '2024-08-06T10:00:00.000Z';
export const incptnDtTm = '2024-08-07T10:00:00.000Z';
export const xprtnDtTm = '2024-08-08T10:00:00.000Z';

export const rawResponseEntity = {
  governed_as_creditor_by: [
    {
      edge: {
        _key: '2110+27733161225MSISDN',
        _id: 'governed_as_creditor_by/2110+27733161225MSISDN',
        _from: 'entities/+27733161225MSISDN',
        _to: 'conditions/2110',
        _rev: '_iTm1jLS---',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        _key: '+27733161225MSISDN',
        _id: 'entities/+27733161225MSISDN',
        _rev: '_iTm1jLG---',
        Id: '+27733161225MSISDN',
        CreDtTm: fixedDate,
      },
      condition: {
        _key: '2110',
        _id: 'conditions/2110',
        _rev: '_iTm1jK6---',
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
        _key: '2110+27733161225MSISDN',
        _id: 'governed_as_debtor_by/2110+27733161225MSISDN',
        _from: 'entities/+27733161225MSISDN',
        _to: 'conditions/2110',
        _rev: '_iTm1jLW---',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        _key: '+27733161225MSISDN',
        _id: 'entities/+27733161225MSISDN',
        _rev: '_iTm1jLG---',
        Id: '+27733161225MSISDN',
        CreDtTm: fixedDate,
      },
      condition: {
        _key: '2110',
        _id: 'conditions/2110',
        _rev: '_iTm1jK6---',
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
  governed_as_creditor_by: [
    {
      edge: {
        _key: '21101010101010Mxxdfsp001',
        _id: 'governed_as_creditor_by/21101010101010Mxxdfsp001',
        _from: 'accounts/1010101010Mxxdfsp001',
        _to: 'conditions/2110',
        _rev: '_iU7ER2a---',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        _key: '1010101010Mxxdfsp001',
        _id: 'accounts/1010101010Mxxdfsp001',
        _rev: '_iU7ER2G---',
      },
      condition: {
        _key: '2110',
        _id: 'conditions/2110',
        _rev: '_iU7ER2----',
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
  governed_as_debtor_by: [
    {
      edge: {
        _key: '21101010101010Mxxdfsp001',
        _id: 'governed_as_debtor_by/21101010101010Mxxdfsp001',
        _from: 'accounts/1010101010Mxxdfsp001',
        _to: 'conditions/2110',
        _rev: '_iU7ER2e---',
        evtTp: ['pacs.008.001.10'],
        incptnDtTm,
        xprtnDtTm,
      },
      result: {
        _key: '1010101010Mxxdfsp001',
        _id: 'accounts/1010101010Mxxdfsp001',
        _rev: '_iU7ER2G---',
      },
      condition: {
        _key: '2110',
        _id: 'conditions/2110',
        _rev: '_iU7ER2----',
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
      condId: '2110',
      xprtnDtTm,
      condTp: 'overridable-block',
      creDtTm: fixedDate,
      incptnDtTm,
      condRsn: 'R001',
      usr: 'bob',
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
};

export const entityResponse = {
  ntty: {
    id: '+27733161225',
    schmeNm: {
      prtry: 'MSISDN',
    },
  },
  conditions: [
    {
      condId: '2110',
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
};

export const sampleAccountCondition: AccountCondition = {
  evtTp: ['pacs.008.001.10', 'pacs.002.001.12'],
  condTp: 'non-overridable-block',
  prsptv: 'both',
  incptnDtTm,
  xprtnDtTm,
  condRsn: 'R001',
  acct: {
    id: '1010101012',
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
};
