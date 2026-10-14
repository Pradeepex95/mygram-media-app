import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function writeAuditLog(params: {
  actorId: string;
  targetId?: string | null;
  action: AuditAction;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      targetId: params.targetId ?? undefined,
      action: params.action,
      metadata: params.metadata,
    },
  });
}

export async function listAuditLogs(params: {
  cursor?: string;
  take?: number;
}) {
  const take = params.take ?? 50;
  return prisma.auditLog.findMany({
    take: take + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      actor: { select: { id: true, username: true } },
      target: { select: { id: true, username: true } },
    },
  });
}
