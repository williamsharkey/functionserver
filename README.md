# Cecilia OS

A minimal, multi-tenant web-based operating system that you can install on any server with a single command.

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/williamsharkey/cecilia/main/install/install.sh | sudo bash
```

### Custom OS Name

```bash
curl -fsSL https://raw.githubusercontent.com/williamsharkey/cecilia/main/install/install.sh | sudo bash -s -- --name "MyOS" --icon "🚀"
```

## Features

- **Multi-tenant**: Multiple users can share a single installation
- **Terminal**: Full terminal access with Claude Code support
- **Configurable**: Change the OS name and branding
- **Multiple backends**: PHP, Python, or Node.js

## Backend Options

### PHP (Default)
```bash
./install.sh --backend php
```

### Python
```bash
./install.sh --backend python
```

### Node.js
```bash
./install.sh --backend nodejs
```

## Manual Installation

### PHP
```bash
cd /var/www
git clone https://github.com/williamsharkey/cecilia.git
cp -r cecilia/php/* .
cp -r cecilia/core .
```

### Python
```bash
cd /var/www
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/python
pip install -r requirements.txt
python app.py
```

### Node.js
```bash
cd /var/www
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/nodejs
npm install
npm start
```

## Configuration

Set environment variables to customize:

| Variable | Description | Default |
|----------|-------------|---------|
| `OS_NAME` | Display name of the OS | Cecilia |
| `OS_ICON` | Emoji icon for the OS | 🌼 |
| `API_BASE` | API endpoint base path | /api |
| `DATA_DIR` | Data storage directory | ./data |
| `HOMES_DIR` | User home directories | /home |
| `SESSION_SECRET` | Secret for session tokens | (random) |

## User Management

Users can self-register through the web interface. Each user gets:
- Their own home directory (`/home/username`)
- Sandboxed terminal access
- File management

## Claude Code Support

Claude Code is fully supported in the terminal. After logging in:

1. Open the Terminal app
2. Run `claude` to start Claude Code

For full interactive support, SSH into your account:
```bash
ssh username@your-server.com
claude
```

## Security

- All terminal commands are sandboxed to the user's home directory
- Dangerous commands (sudo, chmod, etc.) are blocked
- Sessions expire after 7 days
- Passwords are hashed with bcrypt

## License

MIT
