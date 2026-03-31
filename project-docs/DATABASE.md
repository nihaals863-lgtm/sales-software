# Database Documentation

## 1. Relational Map (Prisma ORM)
The backend leverages an entity-relationship structure designed around the Lead -> Job paradigm, backed by **MySQL**. To bypass table casing collisions across environments (e.g., Windows local, Linux Railway server), the database explicitly maps JS CamelCase fields to `snake_case` tables and columns via `@@map` and `@map`.

## 2. Core Entities
### Users (Table: `users`)
- `role`: (`ADMIN`, `WORKER`, `CUSTOMER`)
- Worker specific fields (`is_available`, `lat`, `lng`, `fcm_token`) allow geolocation tracking without muddying customer profiles.

### Categories (Table: `categories` & `worker_categories`)
- Provides filtering limits on Lead assignments (e.g., A "Plumbing" Lead won't go to an "Electrical" Category worker).

### Leads & Jobs (Table: `leads` & `jobs`)
- A Lead originates as a customer's query (`OPEN`, `ASSIGNED`, `REJECTED`).
- A Job connects 1-to-1 (`lead_id`, `customer_id`, `worker_id`) and establishes final scheduling.
- **Status lifecycle:** `SCHEDULED` -> `IN_PROGRESS` -> `ESTIMATED` -> `INVOICED` -> `COMPLETED`.

## 3. Workflow Entities (Job Attachments)
These strictly follow a specific 1-to-many or 1-to-1 relationship to a Job:
1. **`job_photos`**: Must happen first. (`BEFORE`, `PROCESS`, `AFTER`).
2. **`job_inspections`**: Contains detailed assessment notes.
3. **`job_estimates`**: Includes dynamic pricing lists and customer boolean consent.
4. **`job_contracts`**: Follows estimate approval; creates a binding agreement document link.
5. **`job_invoices`**: Replaces the estimate upon final payment rendering.

*Note: Cascade deletes are in place. If a Job is deleted, its photos, estimates, invoices, etc., are also wiped.*
