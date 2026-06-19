// Moshomo app/module registry — single source of truth for the workspace.
//
// Each "app" (module) declares its hash section, icon, status, nav group, and
// which roles see it (with a per-role label + order). The sidebar nav, /app
// section routing, grouping, and access rules all derive from here, so adding a
// future app (e.g. Time tracking, Invoicing) is one registry entry + one slice.

export type Role = "admin" | "manager" | "employee";
export type IconName =
  | "home"
  | "people"
  | "building"
  | "leave"
  | "shifts"
  | "sparkles"
  | "settings"
  | "profile";
export type AppStatus = "live" | "coming-soon";
export type AppGroup = "main" | "manage" | "apps" | "account";
export type RoleNav = { label: string; order: number };

export type AppModule = {
  /** Stable module id. */
  id: string;
  /** URL hash key. "" is the dashboard/home. */
  section: string;
  icon: IconName;
  status: AppStatus;
  /** Which sidebar group this module belongs to. */
  group: AppGroup;
  /** Which roles see this module, with their label + order within the group. */
  roles: Partial<Record<Role, RoleNav>>;
};

/** Ordered sidebar groups. A missing label renders without a header. */
export const APP_GROUPS: { id: AppGroup; label?: string; order: number }[] = [
  { id: "main", order: 0 },
  { id: "manage", label: "Workspace", order: 1 },
  { id: "apps", label: "Apps", order: 2 },
  { id: "account", label: "Account", order: 3 },
];

export const APP_MODULES: AppModule[] = [
  {
    id: "dashboard",
    section: "",
    icon: "home",
    status: "live",
    group: "main",
    roles: {
      admin: { label: "Dashboard", order: 0 },
      manager: { label: "Dashboard", order: 0 },
      employee: { label: "Home", order: 0 },
    },
  },
  {
    id: "employees",
    section: "employees",
    icon: "people",
    status: "live",
    group: "manage",
    roles: {
      admin: { label: "Employees", order: 0 },
      manager: { label: "Team", order: 0 },
    },
  },
  {
    id: "departments",
    section: "departments",
    icon: "building",
    status: "live",
    group: "manage",
    roles: {
      admin: { label: "Departments", order: 1 },
    },
  },
  {
    id: "leave",
    section: "leave",
    icon: "leave",
    status: "live",
    group: "apps",
    roles: {
      admin: { label: "Leave", order: 0 },
      manager: { label: "Leave", order: 0 },
      employee: { label: "Leave", order: 1 },
    },
  },
  {
    id: "shifts",
    section: "shifts",
    icon: "shifts",
    status: "live",
    group: "apps",
    roles: {
      admin: { label: "Shifts", order: 1 },
      manager: { label: "Shifts", order: 1 },
      employee: { label: "My Shifts", order: 0 },
    },
  },
  {
    id: "assistant",
    section: "assistant",
    icon: "sparkles",
    status: "live",
    group: "apps",
    roles: {
      admin: { label: "AI Assistant", order: 2 },
      manager: { label: "AI Assistant", order: 2 },
      employee: { label: "Assistant", order: 2 },
    },
  },
  {
    id: "settings",
    section: "settings",
    icon: "settings",
    status: "live",
    group: "account",
    roles: {
      admin: { label: "Settings", order: 0 },
    },
  },
  {
    id: "profile",
    section: "profile",
    icon: "profile",
    status: "coming-soon",
    group: "account",
    roles: {
      manager: { label: "Profile", order: 0 },
      employee: { label: "Profile", order: 0 },
    },
  },
  // Future apps register here under group "apps", e.g.:
  // { id: "timesheets", section: "timesheets", icon: "shifts", status: "coming-soon",
  //   group: "apps", roles: { admin: { label: "Time tracking", order: 3 } } },
  // { id: "invoicing", section: "invoicing", icon: "building", status: "coming-soon",
  //   group: "apps", roles: { admin: { label: "Invoicing", order: 4 } } },
];

export type NavGroup = {
  id: AppGroup;
  label?: string;
  modules: AppModule[];
};

/** Sidebar groups (in order) with their visible modules for a role. */
export function navGroupsFor(role: Role): NavGroup[] {
  return APP_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    modules: APP_MODULES.filter((module) => module.group === group.id && module.roles[role]).sort(
      (a, b) => a.roles[role]!.order - b.roles[role]!.order,
    ),
  })).filter((group) => group.modules.length > 0);
}

/** The modular "apps" (group "apps") visible to a role, in order. */
export function appModulesFor(role: Role): AppModule[] {
  return APP_MODULES.filter((module) => module.group === "apps" && module.roles[role]).sort(
    (a, b) => a.roles[role]!.order - b.roles[role]!.order,
  );
}

/** Resolve the active module from a hash section key for a given role. */
export function moduleForSection(section: string, role: Role): AppModule | undefined {
  const key = section === "home" ? "" : section;
  return APP_MODULES.find((module) => module.section === key && module.roles[role]);
}
