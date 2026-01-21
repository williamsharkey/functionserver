# TICKET-WORKER.md - FunctionServer Cloud OS Agent Setup

## Overview
You are an AI agent helping build features for FunctionServer Cloud OS.

**Check open tickets:** https://functionserver.com/api/tickets?room=algo-world

---

## FunctionServer Cloud OS Overview

FunctionServer is a cloud-based operating system with a Windows 98-style desktop interface. Users can run apps, manage files, and develop new applications.

### Key Concepts
- **System Apps**: Admin-controlled apps installed by default (read-only, can be forked)
- **User Apps**: Created in JS.IDE, stored per-user
- **Desktop**: Windows 98-style interface with icons, taskbar, start menu
- **Folders**: File system with Programs, Documents, Trash folders

### Project Structure
```
/go/main.go           - Go server (auth, storage, APIs)
/core/algo-os.html    - Main OS frontend (HTML/JS)
/core/algo-os.css     - OS styles
/core/apps/*.js       - System apps
/www/                 - Static assets, screenshots
```

---

## How to Work on Tickets

### 1. Local Development
```bash
cd /Users/william/Desktop/functionserver/go
go build -o functionserver .
./functionserver
```
Server runs at http://localhost:8080

### 2. SSH Access (Production)
```bash
ssh root@functionserver.com
```
Server path: `/opt/functionserver/`

### 3. Deploy Commands
```bash
# Deploy core files
scp core/algo-os.* root@functionserver.com:/opt/functionserver/core/

# Deploy system apps
scp core/apps/*.js root@functionserver.com:/opt/functionserver/core/apps/

# Deploy server
scp go/main.go root@functionserver.com:/opt/functionserver/go/
ssh root@functionserver.com "cd /opt/functionserver/go && go build -o functionserver . && systemctl restart functionserver"
```

### 4. Posting Ticket Replies
```
[TICKET-REPLY:TICKET_ID] Your message here [STATUS:status]

#algo-world:dolphin42
```

Status options: `open`, `working`, `complete`

### 5. Testing
- Local: http://localhost:8080/app
- Production: https://functionserver.com/app
- Ticket API: https://functionserver.com/api/tickets?room=algo-world

---

## Architecture Notes

### System Apps
- Stored in `/core/apps/*.js`
- Loaded via `/api/system-apps` endpoint
- Run in global scope with `ALGO.createWindow()` API
- Prefix functions with unique prefix (e.g., `_tm_` for Ticket Manager)

### User Apps
- Created in JS.IDE
- Stored in user's localStorage and server-side
- Can be installed to desktop/Programs folder

### APIs
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/files/list` - List user files
- `POST /api/files/save` - Save file
- `GET /api/system-apps` - Get system apps
- `GET /api/tickets` - Get tickets

## Workflow
1. Check tickets at the API endpoint
2. Pick a ticket and post "working" status
3. Make changes locally, test at localhost:8080/app
4. Deploy to production
5. Test at functionserver.com/app
6. Post "complete" status with summary
