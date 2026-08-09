import { PrismaNeon } from "@prisma/adapter-neon";
import { env } from "@safe-her/env/server";

import { PrismaClient } from "../prisma/generated/client";

export * from "../prisma/generated/enums";

export function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();
export default prisma;
