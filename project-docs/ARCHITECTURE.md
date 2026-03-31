# Architecture Document

## 1. System Overview
The backend application follows a RESTful API structure built on **Node.js** and **Express.js**, integrated with **Prisma ORM** for database interaction, specifically targeting **MySQL**.

## 2. Technology Stack
- **Runtime Environment:** Node.js
- **Framework:** Express.js
- **Database ORM:** Prisma
- **Database Engine:** MySQL
- **Language:** JavaScript (ES6+ Node.js standard)
- **Deployment Strategy:** Designed for Railway (Using @@map strategy for CamelCase vs snake_case).

## 3. Directory Structure
```
sales-backend/
├── prisma/             # Schema & Migrations
├── project-docs/       # Project-wide Documentation
├── src/
│   ├── app.ts          # Express configuration
│   ├── server.ts       # Application entry point
│   ├── config/         # Environment variables & constants
│   ├── controllers/    # Request handlers
│   ├── middlewares/    # Custom middlewares (auth, errors)
│   ├── routes/         # Express routing mapping
│   ├── services/       # Business logic (DB queries)
│   └── utils/          # Helpers (validation, formatting)
```

## 4. Key Architectural Patterns
- **Separation of Concerns:** Controllers handle inputs, Services handle business/database logic, leaving routes thin.
- **Relational Integrity:** Prisma enforces Foreign Key checks and Cascading Deletes.
- **Error Handling Strategy:** A unified AppError class handles throw/catch sequences up to a global error handler.

*Note: This architecture will evolve with the introduction of WebSockets or Third-Party Services.*
