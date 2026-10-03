"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthExperienceShell, AuthField, AuthPrimaryButton } from "@/components/kv/auth-experience";

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const continueToApp = async () => {
    setBusy(true);
    await fetch("/api/session", { method: "POST" }).catch(() => null);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <AuthExperienceShell
      title="Figflow"
      subtitle="Convert Figma local copies into Dear ImGui C++ — free, in your browser."
      footer={
        <p className="text-[12px] text-[#9aa0a6]">
          No account. A private cookie ties uploads to this browser for two hours.
        </p>
      }
    >
      <div className="space-y-3">
        <AuthField placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        <AuthPrimaryButton type="button" disabled={busy} onClick={() => void continueToApp()}>
          {busy ? "Starting…" : "Continue"}
        </AuthPrimaryButton>
      </div>
    </AuthExperienceShell>
  );
}
