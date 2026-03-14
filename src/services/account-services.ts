import { Account } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { v4 } from "uuid";

import { getPrismaClient } from "@/configs";
import { ApiError } from "@/errors";

export class AccountServices {
  private static googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  static async singUp(userId: string, account: Account) {
    const accountExistUsername = await getPrismaClient().account.findFirst({ where: { OR: [{ username: account.username }, { email: account.email }] } });

    if (accountExistUsername) {
      const isEmailExisting = account.email === accountExistUsername.email;
      throw new ApiError((isEmailExisting ? "Email" : "Username") + "=" + (isEmailExisting ? account.email : account.username) + " is already used", 400);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(account.password, salt);
    const parsedAccount: Account = { ...account, id: userId, password: hashedPassword };

    const createdAccount = await getPrismaClient().account.create({
      data: { ...parsedAccount },
    });
    createdAccount.password = undefined;
    return createdAccount;
  }

  static async signIn(email: string, password: string) {
    const account = await getPrismaClient().account.findFirst({ where: { email } });

    if (!account) throw new ApiError(`Account with email=${email} not found`, 404);

    const validPassword = await bcrypt.compare(password, account.password);
    if (!validPassword) throw new ApiError(`Bad password`, 400);
    const token = jwt.sign({ id: account.id, username: account.username, email: account.email }, process.env.JWT_SECRET, { expiresIn: "10h" });
    account.password = undefined;
    return { token, account: account };
  }

  static async getOneById(accountId: string) {
    return await getPrismaClient().account.findUnique({ where: { id: accountId } });
  }

  static async signInWithGoogle(idToken: string) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new ApiError("GOOGLE_CLIENT_ID missing in backend environment", 500);
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      throw new ApiError("Google authentication failed: email missing", 400);
    }

    const email = payload.email.toLowerCase();
    const prisma = getPrismaClient();
    let account = await prisma.account.findFirst({ where: { email } });

    if (!account) {
      const baseUsername = (payload.name || email.split("@")[0] || "google-user").replace(/\s+/g, "").toLowerCase();
      let candidate = baseUsername || `user-${payload.sub?.slice(-6) ?? Date.now()}`;
      let suffix = 0;
      while (await prisma.account.findFirst({ where: { username: candidate } })) {
        suffix += 1;
        candidate = `${baseUsername}${suffix}`;
      }

      const randomPassword = Math.random().toString(36).slice(-12);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      account = await prisma.account.create({
        data: {
          id: v4(),
          username: candidate,
          email,
          password: hashedPassword,
        },
      });
    }

    const token = jwt.sign({ id: account.id, username: account.username, email: account.email }, process.env.JWT_SECRET, { expiresIn: "10h" });
    account.password = undefined;
    return { token, account };
  }
}
