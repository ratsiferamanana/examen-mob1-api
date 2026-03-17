import { BasicConfiguration, TransactionConfiguration } from "@clients";

import { getPrismaClient } from "@/configs";

export class ConfigurationServices {
  public static async getOne(accountId: string) {
    const configuration = await getPrismaClient().configuration.findFirst({ where: { accountId }, include: { subscription: true } });
    if (!configuration) {
      return await getPrismaClient().configuration.create({
        data: { accountId, currency: "MGA", loginWithoutPassword: false, transactionCountDays: 1, transactionReccurency: 1 },
        include: { subscription: true },
      });
    }
    return configuration;
  }

  public static async updateBasicConfiguration(accountId: string, basicConfiguration: BasicConfiguration) {
    const configuration: any = await this.getOne(accountId);
    return await getPrismaClient().configuration.update({
      data: { currency: basicConfiguration.currency, loginWithoutPassword: basicConfiguration.loginWithoutPassword },
      where: { id: configuration.id },
      include: { subscription: true },
    });
  }

  public static async updateTransactionConfiguration(accountId: string, transactionConfiguration: TransactionConfiguration) {
    const configuration: any = await this.getOne(accountId);
    return await getPrismaClient().configuration.update({
      data: { transactionCountDays: transactionConfiguration.countDays, transactionReccurency: transactionConfiguration.reccurency },
      where: { id: configuration.id },
      include: { subscription: true },
    });
  }
}