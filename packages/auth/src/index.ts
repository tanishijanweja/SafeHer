import { createPrismaClient } from "@safe-her/db";
import { env } from "@safe-her/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";

import { sendTransactionalEmail } from "./email";
import { checkPasswordStrength } from "./password-policy";

function maskEmail(email: string): string {
  return email.replace(/^(.)(.*)@(.*)$/u, "$1***@$3");
}

function buildEmail(path: string): { html: string; text: string } {
  const baseURL = env.BETTER_AUTH_URL.replace(/\/$/, "");
  const href = `${baseURL}${path}`;
  return {
    html: `<p>Tap here: <a href="${href}">${href}</a></p><p>If you didn't request this, you can safely ignore it.</p>`,
    text: `Use this link: ${href}\n\nIf you didn't request this, you can safely ignore it.`,
  };
}

export function createAuth() {
  const prisma = createPrismaClient();

  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),

    trustedOrigins: [env.CORS_ORIGIN],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // No session is created on sign-up: a duplicate email therefore returns
      // the same generic response as a successful one, which closes the
      // account-enumeration oracle (attacker can no longer probe who is
      // registered). Users sign in immediately after creating their account.
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        // `url` (or the fallback) is the reset link. Only ever hand it to the
        // mail transport — never return it in an API response, or an attacker
        // could request a reset for any account and take it over.
        void sendTransactionalEmail({
          to: user.email,
          subject: "Reset your SafeHer password",
          ...buildEmail(url ?? "/"),
        }).catch((error) =>
          console.warn(`[auth] reset email failed for ${maskEmail(user.email)}:`, error),
        );
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url, token }) => {
        await sendTransactionalEmail({
          to: user.email,
          subject: "Verify your SafeHer email",
          ...buildEmail(
            url ?? (token ? `/verify-email?token=${encodeURIComponent(token)}` : "/"),
          ),
        }).catch((error) =>
          console.warn(`[auth] verification email failed for ${maskEmail(user.email)}:`, error),
        );
      },
    },

    // Enforce the password policy server-side on every credential-change path
    // (sign-up, reset-password, change-password). Client-side validation is
    // mirrored in the sign-up form for instant feedback, but the server is the
    // source of truth.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path !== "/sign-up/email" &&
          ctx.path !== "/reset-password" &&
          ctx.path !== "/change-password"
        ) {
          return;
        }
        const body = (ctx.body ?? {}) as {
          password?: string;
          email?: string;
          name?: string;
          newPassword?: string;
        };
        const password = body.password ?? body.newPassword ?? "";
        const error = checkPasswordStrength(password, {
          email: body.email,
          name: body.name,
        });
        if (error) {
          throw new APIError("BAD_REQUEST", { message: error });
        }
      }),
    },

    plugins: [
      twoFactor({
        issuer: "SafeHer",
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 900,
        },
      }),
    ],

    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: true,
        httpOnly: true,
        path: "/",
      },
    },
  });
}

export const auth = createAuth();