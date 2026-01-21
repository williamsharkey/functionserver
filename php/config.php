<?php
/**
 * Cecilia OS - Configuration
 *
 * Customize these values for your installation
 */

// OS Branding - Change these to customize your OS
define('OS_NAME', getenv('OS_NAME') ?: 'Cecilia');
define('OS_ICON', getenv('OS_ICON') ?: "\u{1F33C}"); // Sunflower emoji

// Icons - Customize the UI icons
define('TERMINAL_ICON', "\u{1F4BB}"); // Laptop
define('FOLDER_ICON', "\u{1F4C1}");   // Folder
define('SETTINGS_ICON', "\u{2699}");  // Gear
define('LOGOUT_ICON', "\u{1F6AA}");   // Door

// API Configuration
define('API_BASE', getenv('API_BASE') ?: '/api');

// Paths
define('DATA_DIR', getenv('DATA_DIR') ?: __DIR__ . '/data');
define('USERS_DIR', DATA_DIR . '/users');
define('HOMES_DIR', getenv('HOMES_DIR') ?: '/home');

// Session
define('SESSION_SECRET', getenv('SESSION_SECRET') ?: 'change-this-secret-key-in-production');
define('SESSION_EXPIRY', 86400 * 7); // 7 days

// Security
define('ALLOWED_COMMANDS', [
    'ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'wc',
    'mkdir', 'rmdir', 'touch', 'cp', 'mv', 'rm',
    'echo', 'date', 'whoami', 'id', 'uname',
    'grep', 'find', 'sort', 'uniq', 'diff',
    'tar', 'gzip', 'gunzip', 'zip', 'unzip',
    'curl', 'wget',
    'node', 'npm', 'npx', 'python', 'python3', 'pip', 'pip3',
    'git', 'claude', 'vim', 'nano', 'less', 'more'
]);

// Commands that are always blocked
define('BLOCKED_COMMANDS', [
    'sudo', 'su', 'passwd', 'useradd', 'userdel', 'usermod',
    'chown', 'chmod', 'chgrp',
    'mount', 'umount',
    'reboot', 'shutdown', 'halt', 'poweroff',
    'systemctl', 'service',
    'iptables', 'ufw',
    'dd', 'mkfs', 'fdisk', 'parted'
]);

// Create data directories if they don't exist
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}
if (!is_dir(USERS_DIR)) {
    mkdir(USERS_DIR, 0755, true);
}
