#!/usr/bin/env python3
"""
Cecilia OS - Python Backend
Multi-tenant web-based operating system

Run with: python app.py
Or with gunicorn: gunicorn -w 4 -b 0.0.0.0:8080 app:app
"""

import os
import json
import hashlib
import hmac
import time
import subprocess
import secrets
from pathlib import Path
from functools import wraps
from flask import Flask, request, jsonify, send_file, Response

app = Flask(__name__)

# Configuration
OS_NAME = os.environ.get('OS_NAME', 'Cecilia')
OS_ICON = os.environ.get('OS_ICON', '🌼')
API_BASE = os.environ.get('API_BASE', '/api')
DATA_DIR = Path(os.environ.get('DATA_DIR', './data'))
USERS_DIR = DATA_DIR / 'users'
HOMES_DIR = Path(os.environ.get('HOMES_DIR', '/home'))
SESSION_SECRET = os.environ.get('SESSION_SECRET', 'change-this-secret-key-in-production')
SESSION_EXPIRY = 86400 * 7  # 7 days

# Icons
TERMINAL_ICON = '💻'
FOLDER_ICON = '📁'
SETTINGS_ICON = '⚙'
LOGOUT_ICON = '🚪'

# Security
ALLOWED_COMMANDS = [
    'ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'wc',
    'mkdir', 'rmdir', 'touch', 'cp', 'mv', 'rm',
    'echo', 'date', 'whoami', 'id', 'uname',
    'grep', 'find', 'sort', 'uniq', 'diff',
    'tar', 'gzip', 'gunzip', 'zip', 'unzip',
    'curl', 'wget',
    'node', 'npm', 'npx', 'python', 'python3', 'pip', 'pip3',
    'git', 'claude', 'vim', 'nano', 'less', 'more'
]

BLOCKED_COMMANDS = [
    'sudo', 'su', 'passwd', 'useradd', 'userdel', 'usermod',
    'chown', 'chmod', 'chgrp',
    'mount', 'umount',
    'reboot', 'shutdown', 'halt', 'poweroff',
    'systemctl', 'service',
    'iptables', 'ufw',
    'dd', 'mkfs', 'fdisk', 'parted'
]

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
USERS_DIR.mkdir(parents=True, exist_ok=True)


# ==================== AUTH ====================
def generate_token(username: str) -> str:
    """Generate a session token for a user."""
    payload = {
        'username': username,
        'exp': int(time.time()) + SESSION_EXPIRY,
        'rand': secrets.token_hex(16)
    }
    import base64
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    signature = hmac.new(SESSION_SECRET.encode(), data.encode(), hashlib.sha256).hexdigest()
    return f"{data}.{signature}"


def verify_token(token: str) -> str | None:
    """Verify a session token and return the username."""
    try:
        parts = token.split('.')
        if len(parts) != 2:
            return None

        data, signature = parts
        expected_sig = hmac.new(SESSION_SECRET.encode(), data.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None

        import base64
        payload = json.loads(base64.b64decode(data))
        if payload.get('exp', 0) < time.time():
            return None

        return payload.get('username')
    except Exception:
        return None


def require_auth(f):
    """Decorator to require authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authorization required'}), 401

        token = auth_header[7:]
        username = verify_token(token)
        if not username:
            return jsonify({'error': 'Invalid or expired token'}), 401

        return f(username, *args, **kwargs)
    return decorated


def get_user_file(username: str) -> Path:
    return USERS_DIR / f"{username}.json"


def load_user(username: str) -> dict | None:
    user_file = get_user_file(username)
    if not user_file.exists():
        return None
    return json.loads(user_file.read_text())


def save_user(username: str, data: dict):
    user_file = get_user_file(username)
    user_file.write_text(json.dumps(data, indent=2))


def validate_username(username: str) -> bool:
    import re
    return bool(re.match(r'^[a-z][a-z0-9_]{2,31}$', username))


def create_linux_user(username: str) -> bool:
    """Create a Linux user with home directory."""
    home_dir = HOMES_DIR / username

    # Check if user exists
    result = subprocess.run(['id', username], capture_output=True)
    if result.returncode == 0:
        home_dir.mkdir(parents=True, exist_ok=True)
        return True

    # Try to create user (requires sudo)
    try:
        subprocess.run(
            ['sudo', 'useradd', '-m', '-d', str(home_dir), '-s', '/bin/bash', username],
            capture_output=True, check=True
        )
    except subprocess.CalledProcessError:
        # Fallback: just create home directory
        home_dir.mkdir(parents=True, exist_ok=True)

    return home_dir.exists()


# ==================== ROUTES ====================
@app.route('/')
def serve_os():
    """Serve the OS interface."""
    core_path = Path(__file__).parent.parent / 'core' / 'os.html'
    if not core_path.exists():
        core_path = Path(__file__).parent / 'os.html'

    if not core_path.exists():
        return "Error: OS template not found", 500

    html = core_path.read_text()

    replacements = {
        '{{OS_NAME}}': OS_NAME,
        '{{OS_ICON}}': OS_ICON,
        '{{API_BASE}}': API_BASE,
        '{{TERMINAL_ICON}}': TERMINAL_ICON,
        '{{FOLDER_ICON}}': FOLDER_ICON,
        '{{SETTINGS_ICON}}': SETTINGS_ICON,
        '{{LOGOUT_ICON}}': LOGOUT_ICON,
    }

    for key, value in replacements.items():
        html = html.replace(key, value)

    return Response(html, mimetype='text/html')


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '')
    password = data.get('password', '')

    if not validate_username(username):
        return jsonify({'error': 'Invalid username format'})

    user = load_user(username)
    if not user:
        return jsonify({'error': 'User not found'})

    # Verify password
    import bcrypt
    if not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
        return jsonify({'error': 'Invalid password'})

    # Update last login
    user['last_login'] = int(time.time())
    save_user(username, user)

    token = generate_token(username)
    return jsonify({
        'success': True,
        'username': username,
        'token': token
    })


@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '')
    password = data.get('password', '')

    if not validate_username(username):
        return jsonify({'error': 'Invalid username. Must be 3-32 chars, start with letter, lowercase alphanumeric only.'})

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'})

    if get_user_file(username).exists():
        return jsonify({'error': 'Username already taken'})

    if not create_linux_user(username):
        return jsonify({'error': 'Could not create user directory'})

    # Hash password
    import bcrypt
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    user_data = {
        'username': username,
        'password_hash': password_hash,
        'created': int(time.time()),
        'last_login': int(time.time())
    }

    save_user(username, user_data)

    token = generate_token(username)
    return jsonify({
        'success': True,
        'username': username,
        'token': token
    })


@app.route('/api/auth/verify', methods=['POST'])
def verify():
    data = request.get_json()
    token = data.get('token', '')
    username = data.get('username', '')

    token_user = verify_token(token)
    if token_user and token_user == username:
        return jsonify({'valid': True, 'username': username})
    return jsonify({'valid': False})


@app.route('/api/terminal/exec', methods=['POST'])
@require_auth
def terminal_exec(username):
    data = request.get_json()
    command = data.get('command', '').strip()

    if not command:
        return jsonify({'error': 'No command provided'})

    home_dir = HOMES_DIR / username
    home_dir.mkdir(parents=True, exist_ok=True)

    # Parse command
    parts = command.split(None, 1)
    base_cmd = parts[0]
    args = parts[1] if len(parts) > 1 else ''

    # Check blocked commands
    if base_cmd in BLOCKED_COMMANDS:
        return jsonify({'error': f'Command not allowed: {base_cmd}'})

    # Check allowed commands
    if base_cmd not in ALLOWED_COMMANDS:
        # Built-in commands
        if base_cmd == 'help':
            return jsonify({'output': 'Available commands: ' + ', '.join(sorted(ALLOWED_COMMANDS))})
        return jsonify({'error': f'Command not allowed: {base_cmd}'})

    # Execute command
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(home_dir),
            capture_output=True,
            text=True,
            timeout=30,
            env={
                'HOME': str(home_dir),
                'USER': username,
                'PATH': '/usr/local/bin:/usr/bin:/bin'
            }
        )

        response = {'output': result.stdout.rstrip()}
        if result.stderr and result.returncode != 0:
            response['error'] = result.stderr.rstrip()

        return jsonify(response)
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Command timed out'})
    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/api/files/list', methods=['GET'])
@require_auth
def file_list(username):
    home_dir = HOMES_DIR / username
    path = request.args.get('path', '~')

    # Resolve path
    if path.startswith('~'):
        resolved = home_dir / path[1:].lstrip('/')
    else:
        resolved = Path(path)

    # Security check
    try:
        resolved = resolved.resolve()
        if not str(resolved).startswith(str(home_dir.resolve())):
            return jsonify({'error': 'Access denied'})
    except Exception:
        return jsonify({'error': 'Invalid path'})

    if not resolved.is_dir():
        return jsonify({'error': 'Not a directory'})

    files = []
    for entry in sorted(resolved.iterdir()):
        files.append({
            'name': entry.name,
            'type': 'directory' if entry.is_dir() else 'file',
            'size': entry.stat().st_size if entry.is_file() else 0,
            'modified': int(entry.stat().st_mtime)
        })

    # Sort: directories first
    files.sort(key=lambda x: (x['type'] != 'directory', x['name'].lower()))

    display_path = str(resolved).replace(str(home_dir.resolve()), '~')
    return jsonify({'path': display_path, 'files': files})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
