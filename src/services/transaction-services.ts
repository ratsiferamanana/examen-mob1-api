import { Label } from "@clients";
import { Transaction as PrismaTransaction } from "@prisma/client";

import { getPrismaClient } from "@/configs";
import { ApiError } from "@/errors";
import { TransactionFilters } from "@/types";
import { filterIfNotNull, filterIfNotNullDate, filterIfNotNullNumber } from "@/utilities";
import { LabelValidator } from "@/validator";

import { WalletServices } from "./wallet-services";

export class TransactionServices {
  static async create(accountId: string, walletId: string, transaction: PrismaTransaction, labels: Label[]) {
    const mappedLabelsIds = await LabelValidator.list(accountId, labels);

    if (new Date(transaction.date).getTime() <= new Date().getTime()) {
      const currentWallet = await WalletServices.getOneById(accountId, walletId);
      // IN = revenu → on ajoute, OUT = dépense → on soustrait
      currentWallet.amount += transaction.amount * (transaction.type === "IN" ? 1 : -1);
      await getPrismaClient().wallet.update({
        data: { amount: currentWallet.amount },
        where: { id: walletId },
      });
    }

    return (await getPrismaClient().transaction.create({
      data: { ...transaction, labels: { connect: mappedLabelsIds } },
      include: { labels: true },
    })) as PrismaTransaction;
  }

  static async update(accountId: string, walletId: string, transactionId: string, transaction: PrismaTransaction, labels: Label[]) {
    const getTransactionById = await getPrismaClient().transaction.findFirst({ where: { id: transactionId, accountId, walletId } });
    if (!getTransactionById) throw new ApiError(`Transaction with id=${transactionId} not found`, 404);

    // Recalcul correct du solde wallet lors d'une modification
    if (new Date(transaction.date).getTime() <= new Date().getTime()) {
      const currentWallet = await WalletServices.getOneById(accountId, walletId);

      // 1. On annule l'effet de l'ancienne transaction
      currentWallet.amount -= getTransactionById.amount * (getTransactionById.type === "IN" ? 1 : -1);

      // 2. On applique l'effet de la nouvelle transaction
      currentWallet.amount += transaction.amount * (transaction.type === "IN" ? 1 : -1);

      await getPrismaClient().wallet.update({
        data: { amount: currentWallet.amount },
        where: { id: walletId },
      });
    }

    const mappedLabelsIds = await LabelValidator.list(accountId, labels);

    return await getPrismaClient().transaction.update({
      data: { ...transaction, labels: { set: mappedLabelsIds } },
      where: { id: transactionId },
      include: { labels: true },
    });
  }

  static async getOneById(accountId: string, walletId: string, transactionId: string) {
    const getTransactionById = await getPrismaClient().transaction.findFirst({ where: { id: transactionId, walletId, accountId }, include: { labels: true } });
    if (!getTransactionById) throw new ApiError(`Transaction with id=${transactionId} not found`, 404);
    return getTransactionById;
  }

  static async deleteOneById(accountId: string, walletId: string, transactionId: string) {
    const getTransactionById = await getPrismaClient().transaction.findFirst({ where: { id: transactionId, walletId, accountId }, include: { labels: true } });
    if (!getTransactionById) throw new ApiError(`Transaction with id=${transactionId} not found`, 404);

    // On annule l'effet de la transaction supprimée sur le wallet
    const wallet = await WalletServices.getOneById(accountId, walletId);
    wallet.amount -= getTransactionById.amount * (getTransactionById.type === "IN" ? 1 : -1);
    await getPrismaClient().wallet.update({
      data: { amount: wallet.amount },
      where: { id: wallet.id },
    });

    await getPrismaClient().transaction.delete({ where: { id: transactionId } });
    return getTransactionById;
  }

  static async getAll(accountId: string, query: TransactionFilters) {
    const { page, pageSize, walletId, endingDate, label, maxAmount, minAmount, sort = "desc", sortBy = "date", startingDate, type } = query;

    return await getPrismaClient().transaction.findMany({
      take: pageSize,
      skip: pageSize * (page - 1),
      where: {
        accountId,
        ...filterIfNotNull("walletId", walletId),
        ...filterIfNotNull("type", type),
        ...filterIfNotNull("labels", label, () => ({ some: { id: { in: label } } })),
        amount: { ...filterIfNotNullNumber("gte", minAmount), ...filterIfNotNullNumber("lte", maxAmount) },
        date: { ...filterIfNotNullDate("gte", startingDate), ...filterIfNotNullDate("lte", endingDate) },
      },
      orderBy: {
        [sortBy]: sort,
      },
      include: { labels: true },
    });
  }
}