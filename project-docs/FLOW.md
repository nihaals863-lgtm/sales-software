# System Data Flow

## Step 1. Customer Request (The Lead Stage)
1. Customer uses the *Website/Web App* and logs in (auth handled securely via token).
2. Customer sets location (Drop a Pin), category (e.g., Plumbing), and writes a description.
3. System hits `POST /leads`.
4. Lead is saved strictly with `status: "OPEN"`.
5. *Geo-Location Routing:* Backend finds all `isAvailable: true` Workers whose `categories` match the Lead and who are nearby.

## Step 2. Worker Acceptance (The Job Selection)
1. Worker receives push notification (FCM) or sees the Lead on their APK dashboard.
2. The Worker clicks "Accept Job".
3. System hits `PATCH /leads/:id/assign`.
4. Lead status shifts to `ASSIGNED`.
5. A **new Job record is born** (1-to-1 connection).
6. Job automatically turns into `status: "SCHEDULED"`.
7. Once the date/time arrives, the Walker marks "Start Trip", setting Job Status to `IN_PROGRESS`.

## Step 3. The Strict Workflow (The Inspection Phase)
1. Worker arrives on site and opens the Job.
2. System enforces workflow via state guards:
   - **Photos First**: Worker takes "BEFORE" photos. Hits `POST /jobs/:id/photos`.
   - **Inspection Second**: Worker adds assessment notes and gets customer signature on their device. Hits `POST /jobs/:id/inspection`.
   - **Estimate Third**: Worker dictates pricing. Hits `POST /jobs/:id/estimate`.
   - *WAITING STAGE*: System pings Customer App.
   - **Customer Approval**: Customer accepts the price limit via their web portal.

## Step 4. Execution & Billing (The Final Stages)
1. Worker finishes the job and uploads "AFTER" photos.
2. **Contract generation**: Worker marks completion, terms become legally binding via `POST /jobs/:id/contract`.
3. **Invoice**: Finally, `POST /jobs/:id/invoice` is hit. Customers must fulfill payment online (Integration pending). The Job is updated to `COMPLETED`.
