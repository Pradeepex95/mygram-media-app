import { PrismaClient } from "@prisma/client";

const isDevelopment = process.env.NODE_ENV === "development";

function createPrismaClient() {
  const client = new PrismaClient({
    log: isDevelopment
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ]
      : [{ emit: "stdout", level: "error" }],
    transactionOptions: {
      maxWait: 5_000,
      timeout: 10_000,
    },
  });

  if (isDevelopment) {
    const threshold = Number(process.env.DB_SLOW_QUERY_MS ?? 200);
    client.$on("query", (event) => {
      if (event.duration >= threshold) {
        console.warn(
          JSON.stringify({
            event: "slow_database_query",
            durationMs: event.duration,
            target: event.target,
            query: event.query.replace(/\s+/g, " ").slice(0, 500),
          }),
        );
      }
    });
  }

  return client;
}

type PrismaSingleton = ReturnType<typeof createPrismaClient>;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaSingleton };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
