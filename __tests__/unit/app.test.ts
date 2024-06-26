// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pacs002, Pacs008, Pain001, Pain013 } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { databaseManager, dbInit, runServer, server } from '../../src/index';
import * as LogicService from '../../src/logic.service';
import { configuration } from '../../src/config';
import * as frmsCoelib from '@frmscoe/frms-coe-lib';
//import { DatabaseManagerMocks } from '@frmscoe/frms-coe-lib/lib/tests/mocks/mock-transactions';

beforeAll(async () => {
  await dbInit();
  await runServer();
});

afterAll((done) => {
  done();
  databaseManager.quit();
});

describe('App Controller & Logic Service', () => {
  beforeEach(() => {
    jest.spyOn(server, 'handleResponse').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleGetReportRequestByMsgId', () => {
    it('should handle happy path', async () => {
      jest.spyOn(databaseManager, 'getReportByMessageId').mockImplementation(jest.fn());

      const handleSpy = jest.spyOn(LogicService, 'handleGetReportRequestByMsgId');
      await LogicService.handleGetReportRequestByMsgId('cabb-32c3-4ecf-944e-654855c80c38');
      expect(handleSpy).toHaveBeenCalledTimes(1);
      expect(handleSpy).toHaveReturned();
    });

    it('should handle pacs.002, database error', async () => {
      jest.spyOn(databaseManager, 'getReportByMessageId').mockImplementation(() => {
        return new Promise((resolve, reject) => {
          throw new Error('Deliberate Error');
        });
      });

      let error = '';
      try {
        await LogicService.handleGetReportRequestByMsgId('cabb-32c3-4ecf-944e-654855c80c38');
      } catch (err: any) {
        error = err?.message;
      }
      expect(error).toEqual('Deliberate Error');
    });
  });

  // describe('Error cases', () => {
  //   it('should fail gracefully - rebuildCache', async () => {
  //     const request = Pacs002Sample as Pacs002;

  //     jest.spyOn(databaseManager, 'getBuffer').mockRejectedValue((key: any) => {
  //       return Promise.resolve('some error');
  //     });

  //     jest.spyOn(databaseManager, 'getTransactionPain001').mockImplementation((key: any) => {
  //       return Promise.resolve('');
  //     });

  //     jest.spyOn(databaseManager, 'getTransactionPacs008').mockImplementation((key: any) => {
  //       return Promise.resolve('');
  //     });

  //     jest.spyOn(cacheDatabaseClient, 'getTransactionHistoryPacs008').mockImplementation((key: any) => {
  //       return Promise.resolve([
  //         [
  //           JSON.parse(
  //             '{"TxTp":"pacs.008.001.10","FIToFICstmrCdt":{"GrpHdr":{"MsgId":"cabb-32c3-4ecf-944e-654855c80c38","CreDtTm":"2023-02-03T07:17:52.216Z","NbOfTxs":1,"SttlmInf":{"SttlmMtd":"CLRG"}},"CdtTrfTxInf":{"PmtId":{"InstrId":"4ca819baa65d4a2c9e062f2055525046","EndToEndId":"701b-ae14-46fd-a2cf-88dda2875fdd"},"IntrBkSttlmAmt":{"Amt":{"Amt":31020.89,"Ccy":"USD"}},"InstdAmt":{"Amt":{"Amt":9000,"Ccy":"ZAR"}},"ChrgBr":"DEBT","ChrgsInf":{"Amt":{"Amt":307.14,"Ccy":"USD"},"Agt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"typology003"}}}},"InitgPty":{"Nm":"April Blake Grant","Id":{"PrvtId":{"DtAndPlcOfBirth":{"BirthDt":"1968-02-01","CityOfBirth":"Unknown","CtryOfBirth":"ZZ"},"Othr":{"Id":"+01-710694778","SchmeNm":{"Prtry":"MSISDN"}}}},"CtctDtls":{"MobNb":"+01-710694778"}},"Dbtr":{"Nm":"April Blake Grant","Id":{"PrvtId":{"DtAndPlcOfBirth":{"BirthDt":"1968-02-01","CityOfBirth":"Unknown","CtryOfBirth":"ZZ"},"Othr":{"Id":"+01-710694778","SchmeNm":{"Prtry":"MSISDN"}}}},"CtctDtls":{"MobNb":"+01-710694778"}},"DbtrAcct":{"Id":{"Othr":{"Id":"+01-710694778","SchmeNm":{"Prtry":"MSISDN"}}},"Nm":"April Grant"},"DbtrAgt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"typology003"}}},"CdtrAgt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"dfsp002"}}},"Cdtr":{"Nm":"Felicia Easton Quill","Id":{"PrvtId":{"DtAndPlcOfBirth":{"BirthDt":"1935-05-08","CityOfBirth":"Unknown","CtryOfBirth":"ZZ"},"Othr":{"Id":"+07-197368463","SchmeNm":{"Prtry":"MSISDN"}}}},"CtctDtls":{"MobNb":"+07-197368463"}},"CdtrAcct":{"Id":{"Othr":{"Id":"+07-197368463","SchmeNm":{"Prtry":"MSISDN"}}},"Nm":"Felicia Quill"},"Purp":{"Cd":"MP2P"}},"RgltryRptg":{"Dtls":{"Tp":"BALANCE OF PAYMENTS","Cd":"100"}},"RmtInf":{"Ustrd":"Payment of USD 30713.75 from April to Felicia"},"SplmtryData":{"Envlp":{"Doc":{"Xprtn":"2023-02-03T07:17:52.216Z"}}}}}',
  //           ),
  //         ],
  //       ]);
  //     });

  //     const handleSpy = jest.spyOn(LogicService, 'handlePacs002');

  //     await LogicService.handlePacs002(request, 'pacs.002.001.12');
  //     expect(handleSpy).toBeCalledTimes(1);
  //     expect(handleSpy).toHaveReturned();

  //     jest.spyOn(databaseManager, 'getTransactionPacs008').mockImplementation((key: any) => {
  //       return Promise.resolve([[Pacs008Sample]]);
  //     });
  //     await LogicService.handlePacs002(request, 'pacs.002.001.12');
  //     expect(handleSpy).toBeCalledTimes(2);
  //     expect(handleSpy).toHaveReturned();
  //   });
  //   it('should fail gracefully - rebuildCachePain001', async () => {
  //     const request = Pain013Sample as Pain013;

  //     jest.spyOn(databaseManager, 'getBuffer').mockRejectedValue((key: any) => {
  //       return Promise.resolve('some error');
  //     });

  //     jest.spyOn(databaseManager, 'getTransactionPain001').mockImplementation((key: any) => {
  //       return Promise.resolve('');
  //     });

  //     jest.spyOn(databaseManager, 'getTransactionPacs008').mockImplementation((key: any) => {
  //       return Promise.resolve('');
  //     });

  //     jest.spyOn(cacheDatabaseClient, 'getTransactionHistoryPacs008').mockImplementation((key: any) => {
  //       return Promise.resolve([
  //         [
  //           JSON.parse(
  //             '{"TxTp":"pacs.008.001.10","FIToFICstmrCdt":{"GrpHdr":{"MsgId":"cabb-32c3-4ecf-944e-654855c80c38","CreDtTm":"2023-02-03T07:17:52.216Z","NbOfTxs":1,"SttlmInf":{"SttlmMtd":"CLRG"}},"CdtTrfTxInf":{"PmtId":{"InstrId":"4ca819baa65d4a2c9e062f2055525046","EndToEndId":"701b-ae14-46fd-a2cf-88dda2875fdd"},"IntrBkSttlmAmt":{"Amt":{"Amt":31020.89,"Ccy":"USD"}},"InstdAmt":{"Amt":{"Amt":9000,"Ccy":"ZAR"}},"ChrgBr":"DEBT","ChrgsInf":{"Amt":{"Amt":307.14,"Ccy":"USD"},"Agt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"typology003"}}}},"InitgPty":{"Nm":"April Blake Grant","Id":{"PrvtId":{"DtAndPlcOfBirth":{"BirthDt":"1968-02-01","CityOfBirth":"Unknown","CtryOfBirth":"ZZ"},"Othr":{"Id":"+01-710694778","SchmeNm":{"Prtry":"MSISDN"}}}},"CtctDtls":{"MobNb":"+01-710694778"}},"Dbtr":{"Nm":"April Blake Grant","Id":{"PrvtId":{"DtAndPlcOfBirth":{"BirthDt":"1968-02-01","CityOfBirth":"Unknown","CtryOfBirth":"ZZ"},"Othr":{"Id":"+01-710694778","SchmeNm":{"Prtry":"MSISDN"}}}},"CtctDtls":{"MobNb":"+01-710694778"}},"DbtrAcct":{"Id":{"Othr":{"Id":"+01-710694778","SchmeNm":{"Prtry":"MSISDN"}}},"Nm":"April Grant"},"DbtrAgt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"typology003"}}},"CdtrAgt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"dfsp002"}}},"Cdtr":{"Nm":"Felicia Easton Quill","Id":{"PrvtId":{"DtAndPlcOfBirth":{"BirthDt":"1935-05-08","CityOfBirth":"Unknown","CtryOfBirth":"ZZ"},"Othr":{"Id":"+07-197368463","SchmeNm":{"Prtry":"MSISDN"}}}},"CtctDtls":{"MobNb":"+07-197368463"}},"CdtrAcct":{"Id":{"Othr":{"Id":"+07-197368463","SchmeNm":{"Prtry":"MSISDN"}}},"Nm":"Felicia Quill"},"Purp":{"Cd":"MP2P"}},"RgltryRptg":{"Dtls":{"Tp":"BALANCE OF PAYMENTS","Cd":"100"}},"RmtInf":{"Ustrd":"Payment of USD 30713.75 from April to Felicia"},"SplmtryData":{"Envlp":{"Doc":{"Xprtn":"2023-02-03T07:17:52.216Z"}}}}}',
  //           ),
  //         ],
  //       ]);
  //     });

  //     jest.spyOn(databaseManager, 'getTransactionPain001').mockImplementation((key: any) => {
  //       return Promise.resolve([[Pain001Sample]]);
  //     });

  //     await LogicService.handlePain013(request, 'pain.013.001.09');
  //   });
  // });
});
