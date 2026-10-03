import { UploadDropzone } from "@/components/app/upload-dropzone";
import { UploadList } from "@/components/app/upload-list";
import { ownerId } from "@/server/owner";
import { listProjects, listUploads } from "@/server/store";
import { uploadView } from "@/server/views";

export const metadata = { title: "Convert" };

export default async function ConvertPage() {
  const owner = await ownerId();
  const uploads = owner ? await listUploads(owner) : [];
  const views = await Promise.all(uploads.map(async (u) => uploadView(u, await listProjects(u.id))));

  return (
    <div className="space-y-6">
      <header className="kv-page-header !mb-0">
        <div className="kv-page-header-main">
          <h1 className="kv-page-title">Convert</h1>
          <p className="kv-page-subtitle">Drop a Figma local copy (.fig) to generate a Dear ImGui C++ project.</p>
        </div>
      </header>

      <UploadDropzone />

      <UploadList uploads={views} />
    </div>
  );
}
