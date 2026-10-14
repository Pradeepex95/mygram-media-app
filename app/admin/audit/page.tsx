import { AuditPanel } from "@/components/admin/audit-panel";

export default function AdminAuditPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit log</h1>
      <AuditPanel />
    </div>
  );
}
