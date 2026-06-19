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

export const leaveRequestStatuses = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export const dayParts = ["full", "morning", "afternoon"] as const;

export const shiftStatuses = ["scheduled", "cancelled"] as const;

// Index matches JS Date.getDay(): 0 = Sunday … 6 = Saturday.
export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const moshomoRoles = ["admin", "manager", "employee"] as const;

export type EmployeeStatus = (typeof employeeStatuses)[number];
export type LeaveType = (typeof leaveTypes)[number];
export type LeaveRequestStatus = (typeof leaveRequestStatuses)[number];
export type DayPart = (typeof dayParts)[number];
export type ShiftStatus = (typeof shiftStatuses)[number];
export type MoshomoRole = (typeof moshomoRoles)[number];
