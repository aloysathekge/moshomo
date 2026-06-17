// Moshomo app/module registry — single source of truth for the workspace.
//
// Each "app" (module) declares its hash section, icon, status, and which roles
// see it (with a per-role label + nav order). The sidebar nav, /app section
// routing, and access rules all derive from here, so adding a future app
// (e.g. Time tracking, Invoicing) is one registry entry + one vertical slice.

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
export type RoleNav = { label: string; order: number };

export type AppModule = {
  /** Stable module id. */
  id: string;
  /** URL hash key. "" is the dashboard/home. */
  section: string;
  icon: IconName;
  status: AppStatus;
  /** Which roles see this app, with their label + nav order. */
  roles: Partial<Record<Role, RoleNav>>;
};

export const APP_MODULES: AppModule[] = [
  {
    id: "dashboard",
    section: "",
    icon: "home",
    status: "live",
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
    roles: {
      admin: { label: "Employees", order: 1 },
      manager: { label: "Team", order: 1 },
    },
  },
  {
    id: "departments",
    section: "departments",
    icon: "building",
    status: "live",
    roles: {
      admin: { label: "Departments", order: 2 },
    },
  },
  {
    id: "leave",
    section: "leave",
    icon: "leave",
    status: "coming-soon",
    roles: {
      admin: { label: "Leave", order: 3 },
      manager: { label: "Leave", order: 2 },
      employee: { label: "Leave", order: 2 },
    },
  },
  {
    id: "shifts",
    section: "shifts",
    icon: "shifts",
    status: "coming-soon",
    roles: {
      admin: { label: "Shifts", order: 4 },
      manager: { label: "Shifts", order: 3 },
      employee: { label: "My Shifts", order: 1 },
    },
  },
  {
    id: "assistant",
    section: "assistant",
    icon: "sparkles",
    status: "coming-soon",
    roles: {
      admin: { label: "AI Assistant", order: 5 },
      manager: { label: "AI Assistant", order: 4 },
      employee: { label: "Assistant", order: 3 },
    },
  },
  {
    id: "settings",
    section: "settings",
    icon: "settings",
    status: "live",
    roles: {
      admin: { label: "Settings", order: 6 },
    },
  },
  {
    id: "profile",
    section: "profile",
    icon: "profile",
    status: "coming-soon",
    roles: {
      manager: { label: "Profile", order: 5 },
      employee: { label: "Profile", order: 4 },
    },
  },
  // Future apps register here, e.g.:
  // { id: "timesheets", section: "timesheets", icon: "shifts", status: "coming-soon",
  //   roles: { admin: { label: "Time tracking", order: 7 } } },
  // { id: "invoicing", section: "invoicing", icon: "building", status: "coming-soon",
  //   roles: { admin: { label: "Invoicing", order: 8 } } },
];

/** Apps visible to a role, in nav order. */
export function navModulesFor(role: Role): AppModule[] {
  return APP_MODULES.filter((module) => module.roles[role]).sort(
    (a, b) => a.roles[role]!.order - b.roles[role]!.order,
  );
}

/** Resolve the active app from a hash section key for a given role. */
export function moduleForSection(section: string, role: Role): AppModule | undefined {
  const key = section === "home" ? "" : section;
  return APP_MODULES.find((module) => module.section === key && module.roles[role]);
}
