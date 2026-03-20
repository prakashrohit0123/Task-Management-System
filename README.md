# Task Management System (Full-Stack)

This is a simple full-stack task manager I built using **Node.js + Express** for the backend and **Next.js (App Router)** for the frontend.

It handles authentication, task CRUD, filtering, and a few UX things like toast notifications and auto token refresh.

---

## What you need before running this

* Node.js (v18+)
* npm (v9+)


---

## Folder structure (quick overview)

```
taskapp/
  backend/      → API + DB
  frontend/     → UI (Next.js)
```

Inside backend:

* Prisma schema for DB
* Controllers for auth + tasks
* Middleware (auth + error handling)
* Routes

Inside frontend:

* App router pages (login, register, dashboard)
* Toast system
* Auth utility (handles tokens + API calls)

---

## How to run this locally

### Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run dev
```

Runs on:

```
http://localhost:5000
```

Create a `.env` file in backend:

```
DATABASE_URL="file:./dev.db"
ACCESS_TOKEN_SECRET="change-this"
REFRESH_TOKEN_SECRET="change-this-too"
PORT=5000
```

---

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on:

```
http://localhost:3000
```

Create `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## API

Auth routes:

* `POST /auth/register`
* `POST /auth/login`
* `POST /auth/refresh`
* `POST /auth/logout`

Task routes:

* `GET /tasks`
* `POST /tasks`
* `GET /tasks/:id`
* `PATCH /tasks/:id`
* `DELETE /tasks/:id`
* `PATCH /tasks/:id/toggle`

Most task routes require a valid access token.

---

## How auth actually works here

* On login → you get:

  * access token (short-lived ~15 min)
  * refresh token (long-lived ~7 days)

* Every request:

  ```
  Authorization: Bearer <accessToken>
  ```

* If access token expires:

  * frontend automatically calls `/auth/refresh`
  * gets a new token
  * retries the original request

* Logout:

  * refresh token is cleared server-side

---

## Token storage (important detail)

* accessToken → stored in memory (not localStorage)
* refreshToken → stored in localStorage

Reason:

* avoids exposing access token to XSS
* still keeps session alive across reloads

---

## Features

* Auth with JWT (access + refresh)
* Password hashing using bcrypt
* Full task CRUD
* Status cycle:

  ```
  PENDING → IN_PROGRESS → DONE
  ```
* Pagination
* Search (debounced)
* Filter by status
* Auto token refresh
* Toast notifications

---

## Tech used

Backend:

* Node.js
* Express
* Prisma
* SQLite
* JWT + bcrypt

Frontend:

* Next.js 14 (App Router)
* TypeScript
* CSS Modules
* Native fetch