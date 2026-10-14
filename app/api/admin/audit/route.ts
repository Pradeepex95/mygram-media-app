import { requireAdmin } from "@/lib/auth/session";
import { handleRouteError, jsonOk } from "@/lib/api";
import { paginatedQuerySchema } from "@/lib/validations";
import { listAuditLogs } from "@/server/admin/audit";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const query = paginatedQuerySchema.parse({
      cursor: searchParams.get("cursor") ?? undefined,
      take: searchParams.get("take") ?? undefined,
    });
    return jsonOk(await listAuditLogs(query));
  } catch (error) {
    return handleRouteError(error);
  }
}
