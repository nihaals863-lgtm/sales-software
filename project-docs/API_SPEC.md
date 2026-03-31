# API Specifications

*This file outlines the standard REST structures. Actual endpoint URLs will be defined here as they are built.*

## Standard Base URL
`POST /api/v1/...`
`GET /api/v1/...`

## Authentication (`/api/v1/auth`)
- `POST /login`: Receives `{ email, password }` -> Returns `{ token, user }`
- `POST /register`: Receives `{ name, email, phone, password, role }` -> Returns `{ token, user }`

## Lead & Job Endpoints
- `POST /api/v1/leads`: Generate new lead from customer
- `GET /api/v1/leads/available`: Let workers poll for open jobs near them
- `PATCH /api/v1/leads/:id/assign`: Accept a lead and convert it to a Job
- `GET /api/v1/jobs`: Get all admin jobs / Get user specific jobs via auth token

## Workflow Progression Endpoints
- `POST /api/v1/jobs/:id/photos`: Upload a photo stage
- `POST /api/v1/jobs/:id/inspection`: Submit inspection notes
- `POST /api/v1/jobs/:id/estimate`: Attach a pricing estimate
- `PATCH /api/v1/jobs/:id/estimate/approve`: Customer accepts price
- `POST /api/v1/jobs/:id/contract`: PDF generation
- `POST /api/v1/jobs/:id/invoice`: Final invoice creation

## Responses
All API responses will follow a standard pattern:
```json
{
  "success": true,
  "data": { ... },
  "message": "Action completed successfully"
}
```
*Failed Responses:*
```json
{
  "success": false,
  "error": "Detailed error message",
  "code": 404
}
```
