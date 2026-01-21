# Function Server - Development Plan

## Vision

Function Server is a multi-tenant web OS platform that combines:
- **ALGO OS** UI (Windows 95-style desktop from laserbarf.com)
- **JavaScript.IDE** for creating artifacts/apps
- **Real Linux integration** for shell access
- **Public hosting** for user-created apps
- **App Store** for sharing and installing artifacts

Anyone can install Function Server on a droplet and become a host owner, offering free and paid accounts to users.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Function Server                          │
├─────────────────────────────────────────────────────────────┤
│  Landing Page (/)          │  App Store (/store)            │
│  - Marketing               │  - Browse apps                 │
│  - Install instructions    │  - Install to your OS          │
├─────────────────────────────────────────────────────────────┤
│  Public Pages (/username/*)                                  │
│  - Static files from ~/public                                │
│  - User-created artifacts                                    │
├─────────────────────────────────────────────────────────────┤
│  ALGO OS (/app)                                              │
│  - JavaScript.IDE          - AI Wizards (Claude/GPT/Gemini) │
│  - Terminal (real shell)   - File Manager                   │
│  - Notepad                 - Web Browser                    │
│  - Chat                    - Settings                       │
├─────────────────────────────────────────────────────────────┤
│  API Layer (/api)                                            │
│  - Auth (PAM + OAuth)      - Terminal exec                  │
│  - Files CRUD              - App Store                      │
│  - Public folder serving   - Stripe billing                 │
├─────────────────────────────────────────────────────────────┤
│  Linux Layer                                                 │
│  - Real user accounts      - cgroups quotas                 │
│  - Home directories        - Namespace isolation            │
└─────────────────────────────────────────────────────────────┘
```

---

## User Tiers

### 1. Public/Free Tier
- **Auth**: Claude API key, Google OAuth, or email verification
- **Gets**:
  - JavaScript.IDE for creating artifacts
  - AI Wizards (using their own API keys)
  - ~/public folder for hosting (limited storage)
  - Basic file storage in browser localStorage
- **Restrictions**:
  - No real shell access
  - No server-side code execution
  - Storage quota (e.g., 100MB)

### 2. Shell Tier (Paid)
- **Auth**: Linux PAM (real system account)
- **Gets**:
  - Everything in Free tier
  - Real terminal with shell access
  - Server-side file system
  - Can run Claude Code, node, python, git, etc.
  - Larger storage quota
  - Custom domain support for public folder
- **Isolation**:
  - Separate Linux user account
  - cgroups for CPU/memory limits
  - chroot or namespace isolation
  - Restricted command list (no sudo, systemctl, etc.)

### 3. Admin Tier
- **Auth**: Linux PAM + sudoers
- **Gets**:
  - Full droplet access
  - User management
  - Billing configuration
  - System settings
  - Root public folder (site homepage)

---

## URL Structure

```
/                       → Landing page (or admin's public folder if configured)
/app                    → ALGO OS (requires login)
/store                  → App Store
/install                → Install script
/api/*                  → API endpoints

/username               → User's ~/public/index.html
/username/myapp         → User's ~/public/myapp/
/username/myapp/sub     → User's ~/public/myapp/sub/

Special:
/admin                  → Admin panel
/login                  → Direct login page
/register               → Direct registration
```

---

## Implementation Phases

### Phase 1: Integrate ALGO OS ✓ (partial)
- [x] Basic OS shell (current os.html)
- [ ] Port full ALGO OS from laserbarf (algo-artifact.html)
- [ ] JavaScript.IDE with live preview
- [ ] File system API (server-backed, not just localStorage)
- [ ] AI Wizards integration

### Phase 2: Multi-Tenant Foundation
- [ ] Linux PAM authentication
- [ ] Real user account creation (useradd)
- [ ] Home directory setup with proper permissions
- [ ] cgroups resource limits
- [ ] Session management improvements

### Phase 3: Public Folders
- [ ] Serve ~/public at /username/
- [ ] Static file serving (html, css, js, images)
- [ ] Directory listing (optional)
- [ ] Custom 404 pages
- [ ] Admin root public folder

### Phase 4: App Store
- [ ] App manifest format (name, description, icon, files)
- [ ] Publish apps from JavaScript.IDE
- [ ] Browse/search apps
- [ ] Install apps to user's OS
- [ ] Rating/reviews (optional)

### Phase 5: Billing & Quotas
- [ ] Stripe integration
- [ ] Plan configuration (free limits, paid tiers)
- [ ] Storage quota enforcement
- [ ] Usage tracking
- [ ] Host owner settings

### Phase 6: Advanced Features
- [ ] Custom domains per user
- [ ] WebSocket for real-time terminal (PTY)
- [ ] Collaborative editing
- [ ] Git integration
- [ ] Docker container isolation (optional)

---

## Technical Details

### PAM Authentication (Go)
```go
import "github.com/msteinert/pam"

func pamAuth(username, password string) error {
    t, err := pam.StartFunc("login", username,
        func(s pam.Style, msg string) (string, error) {
            return password, nil
        })
    if err != nil {
        return err
    }
    return t.Authenticate(0)
}
```

### User Creation
```bash
# Create user with home directory
useradd -m -s /bin/bash -G functionserver $USERNAME

# Set quota
setquota -u $USERNAME 500M 600M 0 0 /home

# Create public folder
mkdir -p /home/$USERNAME/public
chown $USERNAME:$USERNAME /home/$USERNAME/public
```

### cgroups Resource Limits
```bash
# Create cgroup for user
cgcreate -g cpu,memory:/functionserver/$USERNAME
cgset -r cpu.max="50000 100000" /functionserver/$USERNAME  # 50% CPU
cgset -r memory.max=512M /functionserver/$USERNAME
```

### App Manifest Format
```json
{
  "name": "My Cool App",
  "id": "my-cool-app",
  "version": "1.0.0",
  "description": "A cool app built with JavaScript.IDE",
  "author": "username",
  "icon": "🚀",
  "main": "index.html",
  "files": ["index.html", "style.css", "app.js"],
  "permissions": ["storage", "network"]
}
```

### Public Folder Routing
```go
// In main.go
mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    path := r.URL.Path

    // Check if it's a username path
    parts := strings.Split(strings.Trim(path, "/"), "/")
    if len(parts) > 0 && userExists(parts[0]) {
        servePublicFolder(w, r, parts[0], parts[1:])
        return
    }

    // Otherwise serve landing page
    serveLandingPage(w, r)
})
```

---

## Auth Options for Free Tier

| Method | Pros | Cons |
|--------|------|------|
| Claude API Key | Already verified, hooks into AI features | Requires Anthropic account |
| Google OAuth | Easy, widely adopted | Need Google Cloud setup |
| GitHub OAuth | Developer-focused audience | Need GitHub app |
| Email + Code | Universal, no dependencies | Email delivery issues |
| OpenAI/Gemini Key | Alternative AI verification | Multiple providers |

**Recommendation**: Start with Claude API key (primary audience) + Email verification (fallback).

---

## Files to Modify/Create

### Core Server
- `go/main.go` - Add PAM auth, public folder routing, user management
- `go/pam.go` - PAM authentication wrapper
- `go/users.go` - User creation, quotas, cgroups
- `go/public.go` - Public folder serving
- `go/store.go` - App store API

### Frontend
- `core/os.html` - Replace with full ALGO OS from laserbarf
- `core/apps/` - Individual app files (if splitting)
- `www/store.html` - App store UI

### Config
- `config.yaml` - Server configuration
- `plans.yaml` - Billing plans and limits

---

## Next Steps (Immediate)

1. **Copy ALGO OS** from laserbarf to Function Server
2. **Adapt file system** to use server API instead of localStorage
3. **Wire up JavaScript.IDE** to save files server-side
4. **Implement public folder serving** at /username/
5. **Test artifact creation → public hosting flow**

---

## Questions to Resolve

1. Should free tier have any server-side storage, or purely localStorage?
2. How to handle artifact "publishing" - manual or automatic?
3. App store moderation - open or curated?
4. Default apps to include vs. installable from store?
5. Pricing structure for host owners to set?
