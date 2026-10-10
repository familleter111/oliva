"use client";

import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui";

export function LogoutButton({ csrf }: { csrf: string }) {
  const logout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST", headers: { "x-oliva-csrf": csrf }, credentials: "same-origin" }).catch(() => undefined);
    window.location.assign("/admin/login");
  };
  return (
    <Button onClick={logout}>
      <SignOut size={18} /> Se déconnecter
    </Button>
  );
}
