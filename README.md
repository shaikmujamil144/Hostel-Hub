# HostelHub

Production-oriented full-stack SaaS hostel management platform for managing 5000+ students across multiple hostels with tenant isolation, role-based access, real-time updates, and online rent collection.

## Features

- Multi-tenant architecture (single app, isolated hostel data)
- JWT authentication and role-based access control (Admin, Staff, Student)
- Student lifecycle management
- Room and occupancy management
- Booking flow with overbooking prevention
- Complaint management with live status updates
- Payment flow with Razorpay order and verification
- Dashboard metrics (occupancy, revenue, complaints)
- Pagination, search, rate limiting, validation, and audit logging

## Tech Stack

Frontend:
- React (Vite)
- Tailwind CSS
- Axios
- React Router

Backend:
- Node.js
- Express.js
- TypeScript
- Socket.io

Database:
- MongoDB Atlas
- Mongoose

Auth and Security:
- JWT
- Helmet
- Express Rate Limit
- Zod request validation

Deployment:
- Frontend: Vercel
- Backend: Render or Railway
- Database: MongoDB Atlas

## Monorepo Structure

```text
HostelHub/
	apps/
		api/      # Express + Mongoose backend
		web/      # React + Vite frontend
	packages/
		shared/   # Shared constants/types/utilities
		db/       # Optional Prisma playground package (not API runtime)
	infra/
		docker-compose.yml
		nginx.conf
```

## Backend Architecture (MVC)

```text
apps/api/src/
	config/
	controllers/
	middleware/
	models/
	routes/
	services/
	validators/
	types/
```

## Frontend Architecture

```text
apps/web/src/
	components/
	pages/
	services/
	context/
	hooks/
```

## Quick Start (Local)

1. Install dependencies from repository root.

```bash
npm install
```

2. Create env files.

```bash
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
```

3. Configure backend env values in `apps/api/.env`.

```env
NODE_ENV=development
PORT=5000
MONGO_URI=<mongodb-atlas-uri>
JWT_SECRET=<strong-random-secret>
FRONTEND_URL=http://localhost:5173
RAZORPAY_KEY_ID=<your-key-id>
RAZORPAY_KEY_SECRET=<your-key-secret>
RAZORPAY_WEBHOOK_SECRET=<your-webhook-secret>
AUTO_ESCALATION_ENABLED=true
AUTO_ESCALATION_INTERVAL_MS=300000
AUTO_ESCALATION_LOCK_TTL_MS=600000
```

4. Configure frontend env in `apps/web/.env`.

```env
VITE_API_URL=http://localhost:5000/api
```

5. Run both apps from repository root.

```bash
npm run dev
```

6. Access services.

- Frontend: http://localhost:5173
- API health: http://localhost:5000/api/health

## Useful Commands

```bash
npm run dev         # api + web in parallel
npm run dev:api     # backend only
npm run dev:web     # frontend only
npm run build       # build all packages/apps
npm run build:api   # build backend
npm run build:web   # build frontend
npm run start       # run built backend
```

## REST API Endpoints

Auth:
- GET /api/auth/hostels
- POST /api/auth/register
- POST /api/auth/login

Dashboard:
- GET /api/dashboard/stats
- GET /api/dashboard/analytics (includes priority split, SLA metrics, and complaint forecast)
- GET /api/dashboard/network-analytics (Admin only, cross-hostel owner portfolio)

Students:
- GET /api/students?page=1&limit=20&search=john
- GET /api/students/export
- GET /api/students/:id
- DELETE /api/students/:id

Rooms:
- GET /api/rooms?page=1&limit=20&search=A-101
- POST /api/rooms

Bookings:
- GET /api/bookings?page=1&limit=20&status=Active
- POST /api/bookings

Payments:
- GET /api/payments?page=1&limit=20&status=Paid
- GET /api/payments/export?status=Paid
- GET /api/payments/:id/invoice
- POST /api/payments/order
- POST /api/payments/verify
- POST /api/payments/webhook

Complaints:
- GET /api/complaints?page=1&limit=20&status=Open&assignedTo=<userId>&priority=High&sortBy=priority&search=wifi&overdueOnly=true
- GET /api/complaints/assignees
- GET /api/complaints/:id
- POST /api/complaints
- PUT /api/complaints/:id
- PUT /api/complaints/:id/assign
- POST /api/complaints/escalate-overdue

Hostels:
- GET /api/hostels/me
- GET /api/hostels/me/sla-policy
- GET /api/hostels/owned
- POST /api/hostels
- PATCH /api/hostels/me/plan

Hostel creation payload (admin):
- name
- subscriptionPlan
- floors[] with floorNumber and rooms[]
- each room has roomLabel and beds
- referenceImages[] (data URLs for reference pictures)

SLA and Escalation:
- SLA due time is computed from hostel subscription plan and complaint priority.
- Automatic escalation sweep runs in background for overdue complaints.
- Escalation level cap and re-escalation windows are plan-based.
- Escalation scheduler uses a MongoDB distributed lock to avoid duplicate sweeps in multi-instance deployments.

Notifications:
- GET /api/notifications?page=1&limit=20&unreadOnly=true
- PATCH /api/notifications/:id/read
- PATCH /api/notifications/mark-all-read

Audit:
- GET /api/audit-logs?page=1&limit=20

## Multi-Tenant Data Model (Target)

Core collections:
- Hostels: name, ownerId, subscriptionPlan
- Users: name, email, passwordHash, role, hostelId
- Rooms: roomNumber, capacity, currentOccupancy, type, monthlyRent, hostelId
- Bookings: userId, roomId, status, dates, hostelId
- Payments: userId, bookingId, amount, status, gatewayIds, hostelId
- Complaints: userId, title, description, status, priorityLabel, priorityScore, priorityFactors[], assignedTo, assignedAt, firstResponseAt, resolvedAt, slaDueAt, escalatedAt, escalationLevel, history[], hostelId

Isolation strategy:
- Every tenant-owned document stores `hostelId`.
- Every read/write filter includes `{ hostelId: req.user.hostelId }`.
- Never trust client-provided tenant id for authorization decisions.

## Security Checklist

- JWT auth middleware for protected routes
- Role guards for admin/staff/student access
- Helmet for secure headers
- Rate limiting on global and auth endpoints
- Input validation with Zod
- Audit logs for privileged actions
- Avoid default secrets in production

## SaaS Implementation Roadmap

### Level 1: Foundation
- Setup Express + MongoDB + React connectivity
- Implement auth (register/login)
- Implement student and room CRUD
- Build basic dashboard
- Validate APIs in Postman

### Level 2: SaaS Core
- Introduce Hostel model
- Add `hostelId` to all tenant-owned collections
- Update all APIs for tenant filtering
- Enforce role permissions cleanly

### Level 3: Real-World Features
- Booking APIs with occupancy checks
- Complaint lifecycle APIs
- Notification service hooks

### Level 4: Payments
- Payment model and payment history
- Razorpay order + verification flow
- Persist gateway references and payment status
- Invoice metadata and receipt tracking

### Level 5: Real-Time
- Socket.io namespace/room by tenant
- Real-time complaint and notification events
- Frontend event listeners with reconnection handling

### Level 6: Scale and Optimization
- Pagination and searchable listing APIs
- Compound indexes (`hostelId`, `role`, `status`, timestamps)
- Lean queries for list endpoints
- Efficient dashboard aggregation pipelines

### Level 7: Advanced SaaS
- Multi-hostel analytics dashboards
- CSV/Excel export
- PDF invoice generation
- Dark mode and accessibility improvements

### Level 8: Optional AI
- AI priority scoring for complaints
- Predictive occupancy/revenue analytics

## Testing

Manual API testing:
- Use Postman collections for auth, room, student, booking, payment, complaint flows.

Recommended automated testing:
- Backend: Jest + Supertest for route and auth tests.
- Frontend: component and integration tests for core pages.

Validation scenarios:
- Unauthorized access blocked

## Tenant Backfill Migration

Use this once when upgrading older data that does not yet have `hostelId` on tenant-owned collections.

1. Preview changes (no writes):

```bash
npm --prefix apps/api run migrate:tenant-backfill -- --dry-run
```

2. Apply changes:

```bash
npm --prefix apps/api run migrate:tenant-backfill
```

Optional env for naming the fallback tenant used by legacy records:

```env
LEGACY_HOSTEL_NAME=Legacy Hostel
```
- Cross-tenant access blocked
- Overbooking prevented
- Payment signature verification success/failure

## Deployment

### Vercel (Frontend)
- Deploy `apps/web`.
- Set env: `VITE_API_URL=https://<api-domain>/api`.

### Render or Railway (Backend)
- Deploy `apps/api`.
- Set env: `MONGO_URI`, `JWT_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `FRONTEND_URL`.

### MongoDB Atlas
- Create production cluster.
- Restrict network access and DB users.
- Enable backups and monitoring alerts.

## Docker (Single Host)

From `infra/`:

```bash
docker compose up --build
```

Services:
- Web: http://localhost:8080
- API: http://localhost:5000/api/health
- MongoDB: mongodb://localhost:27017

## Health Endpoint

- GET /api/health

Example:

```bash
curl http://localhost:5000/api/health
```

## License

MIT