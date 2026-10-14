import { requireAdmin } from "@/lib/auth/session";
import { handleRouteError, jsonOk } from "@/lib/api";
import { listAuditLogs } from "@/server/admin/audit";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const logs = await listAuditLogs({ cursor, take: 50 });
    const hasMore = logs.length > 50;
    const items = hasMore ? logs.slice(0, 50) : logs;
    return jsonOk({
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
