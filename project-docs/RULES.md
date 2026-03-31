# Development Rules & Coding Guidelines

## 1. Naming Conventions
- **Database Tables**: Plural `snake_case` (e.g., `users`, `job_photos`).
- **Database Columns**: `snake_case` (e.g., `created_at`, `is_available`).
- **TypeScript Code**: `camelCase` for properties and variables (e.g., `createdAt`, `isAvailable`).
- **Prisma Schema Mapping**: Use `@map` and `@@map` to bridge Node.js camelCase with DB snake_case.

## 2. API Best Practices
- **Never Hardcode Statuses**: Always use the predefined Prisma `enum` types (e.g., `JobStatus.IN_PROGRESS`).
- **Error Propagation**: Controllers should wrap execution in `try-catch` blocks or use a global `catchAsync` wrapper.
- **Data Validation**: Validate incoming `req.body` using a tool like Joi, Zod, or Express-Validator before hitting Prisma.

## 3. Workflow Guards (Backend Checks)
- **Do NOT trust the frontend**: Even if the frontend UI hides the "Estimate" button, the backend must STILL check if the `JobInspection` entity exists before creating a `JobEstimate`.
- **Status Dependencies**: A job cannot move to `INVOICED` if it hasn't passed the `COMPLETED` and `CONTRACT` stages.

## 4. Security
- Use **Bcrypt** to hash passwords before saving them to the DB.
- Use **JSON Web Tokens (JWT)** for authentication. Put user ID and role in the payload.
- Create middleware to protect routes based on `role` (e.g., `requireAdmin`, `requireWorker`, `requireCustomer`).

*These rules are mandatory for all contributors to ensure stability across deployments.*
