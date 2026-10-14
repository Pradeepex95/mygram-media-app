import { requireAdmin } from "@/lib/auth/session";
import { handleRouteError, jsonOk } from "@/lib/api";
import { generateStrongPassword, generateUsername } from "@/lib/password";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk({
      username: generateUsername(),
      password: generateStrongPassword(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
