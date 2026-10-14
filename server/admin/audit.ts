import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clampPageSize, decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination";

export async function writeAuditLog(params: {
  actorId: string;
  targetId?: string | null;
  action: AuditAction;
  metadata?: Prisma.InputJsonValue;
  client?: Prisma.TransactionClient;
}) {
  const client = params.client ?? prisma;
  return client.auditLog.create({
    data: {
      actorId: params.actorId,
      targetId: params.targetId ?? undefined,
      action: params.action,
      metadata: params.metadata,
    },
  });
}

export async function listAuditLogs(params: { cursor?: string; take?: number }) {
  const take = clampPageSize(params.take);
  const cursor = decodeTimeCursor(params.cursor);
  const rows = await prisma.auditLog.findMany({
    take: take + 1,
    where: cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      action: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, username: true } },
      target: { select: { id: true, username: true } },
    },
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return {
    items,
    nextCursor:
      hasMore && items.length
        ? encodeTimeCursor({
            createdAt: items[items.length - 1].createdAt,
            id: items[items.length - 1].id,
          })
        : null,
  };
}
