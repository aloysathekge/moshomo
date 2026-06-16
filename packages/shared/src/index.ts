export const employeeStatuses = [
  "active",
  "suspended",
  "terminated",
  "resigned",
] as const;

export const leaveTypes = [
  "annual",
  "sick",
  "family_responsibility",
  "unpaid",
] as const;

export const moshomoRoles = ["admin", "manager", "employee"] as const;

export type EmployeeStatus = (typeof employeeStatuses)[number];
export type LeaveType = (typeof leaveTypes)[number];
export type MoshomoRole = (typeof moshomoRoles)[number];
