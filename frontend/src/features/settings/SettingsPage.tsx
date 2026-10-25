import { useState } from "react";
import { Building2, KeyRound, Landmark, LayoutList, SlidersHorizontal, UserCog, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SideTabs, type TabItem } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthProvider";
import { AccountsTab } from "./AccountsTab";
import { RoomConfigTab } from "./RoomConfigTab";
import { UsersTab } from "./UsersTab";
import { RolesTab } from "./RolesTab";
import { MenusTab } from "./MenusTab";
import { PermissionsTab } from "./PermissionsTab";
import { GeneralTab } from "./GeneralTab";

const TABS: (TabItem & { adminOnly: boolean })[] = [
  { id: "accounts", label: "Collection Accounts", icon: Landmark, adminOnly: false },
  { id: "rooms", label: "Room Configuration", icon: Building2, adminOnly: false },
  { id: "users", label: "Users", icon: Users, adminOnly: true },
  { id: "roles", label: "Roles", icon: UserCog, adminOnly: true },
  { id: "menus", label: "Menus", icon: LayoutList, adminOnly: true },
  { id: "permissions", label: "Permissions", icon: KeyRound, adminOnly: true },
  { id: "general", label: "General Settings", icon: SlidersHorizontal, adminOnly: true },
];

export function SettingsPage() {
  const { isSuperAdmin } = useAuth();
  // Admin tabs are hidden here and also refused by the API (requireRoles SUPER_ADMIN).
  const visible = TABS.filter((t) => !t.adminOnly || isSuperAdmin);
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem("ggp_settings_tab");
    return visible.some((t) => t.id === saved) ? saved! : visible[0]!.id;
  });

  const select = (id: string) => {
    setTab(id);
    sessionStorage.setItem("ggp_settings_tab", id);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Business configuration and access control." />
      <div className="flex flex-col gap-5 lg:flex-row">
        <nav className="lg:w-56 lg:shrink-0">
          <SideTabs tabs={visible} value={tab} onChange={select} label="Settings sections" />
        </nav>
        <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0 flex-1">
          {tab === "accounts" && <AccountsTab />}
          {tab === "rooms" && <RoomConfigTab />}
          {isSuperAdmin && tab === "users" && <UsersTab />}
          {isSuperAdmin && tab === "roles" && <RolesTab />}
          {isSuperAdmin && tab === "menus" && <MenusTab />}
          {isSuperAdmin && tab === "permissions" && <PermissionsTab />}
          {isSuperAdmin && tab === "general" && <GeneralTab />}
        </section>
      </div>
    </div>
  );
}
