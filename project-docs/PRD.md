# Product Requirements Document (PRD)

## 1. Product Overview
The Sales Software platform manages the lifecycle of customer service requests (leads) from creation to assignment, and ultimately through a complete job workflow (Photos, Inspection, Estimate, Contract, Invoice).

## 2. Target Audience
- **Admin**: Manages all jobs, assigns leads, monitors workforce, and handles finances.
- **Worker (Professional)**: Receives leads, goes on-site, uploads photos, submits estimates, and completes jobs.
- **Customer**: Requests services, approves estimates, signs contracts, and pays invoices.

## 3. Core Features
- **Lead Management**: Incoming requests that can be accepted or assigned.
- **Job Workflow Controls**: A strict step-by-step process. No step can be skipped.
  1. *Photos* (Before/Process/After)
  2. *Inspection* (Notes & Signature)
  3. *Estimate* (Pricing & Approval)
  4. *Contract* (Terms & Signature)
  5. *Invoice* (Final Payment status)
- **Role-Based Access Control**: Different access levels for Admin, Worker, and Customer.
- **Geo-Location**: Tracking and assigning workers based on current coordinates (lat/lng).

*Note: This file will be continuously updated as the backend logic expands.*
