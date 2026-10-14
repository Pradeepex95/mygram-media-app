import { ContentPanel } from "@/components/admin/content-panel";

export default function AdminContentPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Content moderation</h1>
      <ContentPanel />
    </div>
  );
}
