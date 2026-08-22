# FullSend Startup Guide

To get the FullSend project running locally, you need to start both the backend signaling server and the frontend React application.

### 1. Start the Backend

Open a terminal and run the following commands:

```bash
cd backend
bun install
bun run src/server.ts
```
*The signaling server will start on port 8080.*

### 2. Start the Frontend

Open a new, separate terminal and run the following commands:

```bash
cd frontend
bun install
bun run dev
```
*The React application will launch. Open the provided localhost URL in your browser.*
