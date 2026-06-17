# Product Boundaries

Moshomo V1 is an AI-native workforce operating system focused on employee records, leave, smart shifts, and Pori-assisted workforce operations.

## V1 In Scope

- Employee management.
- Leave requests, approvals, balances, and team calendar views.
- Smart shift templates, assignment, weekly/monthly schedules, availability, gap detection, and replacement suggestions.
- Pori workforce assistant for manager and employee questions.
- Role-aware web app for admins, managers, and employees.
- Role-aware mobile app for admins, managers, and employees.

## V1 Out Of Scope

- Payroll, payslips, attendance tracking, clock-in/out, GPS tracking, recruitment, performance management, and benefits.

## Rules

- Treat `PRD.txt` as the current product source of truth until implementation docs replace parts of it.
- Do not introduce payroll or attendance features into V1 work unless the user explicitly changes scope.
- Preserve the single app, single database, and single authentication direction unless an architecture decision changes it.
- Keep business permissions consistent across web and mobile; do not use the client platform as an authorization boundary.
- If a request conflicts with the PRD, document the conflict before changing code.
