import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@safe-her/env/server";

import { PrismaClient } from "../prisma/generated/client";

export * from "../prisma/generated/enums";

export function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();
export default prisma;
