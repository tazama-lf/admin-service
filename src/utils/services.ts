// SPDX-License-Identifier: Apache-2.0
import { CreateDatabaseManager } from '@frmscoe/frms-coe-lib';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-extraneous-class */
export class Singleton {
  private static dbManager: any;

  public static async getDatabaseManager(databaseManagerConfig: any): Promise<typeof databaseManagerConfig> {
    if (!Singleton.dbManager) Singleton.dbManager = await CreateDatabaseManager(databaseManagerConfig);

    return Singleton.dbManager;
  }
}
