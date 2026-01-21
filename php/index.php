<?php
/**
 * Cecilia OS - PHP Backend
 * Multi-tenant web-based operating system
 *
 * Single entry point router
 */

// Load configuration
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/terminal.php';
require_once __DIR__ . '/files.php';

// Enable CORS for development
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// Parse request
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = trim($uri, '/');

// API Routes
if (preg_match('/^api\/(.+)/', $uri, $matches)) {
    $endpoint = $matches[1];
    header('Content-Type: application/json');

    switch ($endpoint) {
        // Auth endpoints
        case 'auth/login':
            handleLogin();
            break;
        case 'auth/register':
            handleRegister();
            break;
        case 'auth/verify':
            handleVerify();
            break;

        // Terminal endpoint
        case 'terminal/exec':
            handleTerminalExec();
            break;

        // File endpoints
        case 'files/list':
            handleFileList();
            break;
        case 'files/read':
            handleFileRead();
            break;
        case 'files/write':
            handleFileWrite();
            break;
        case 'files/delete':
            handleFileDelete();
            break;
        case 'files/mkdir':
            handleFileMkdir();
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Endpoint not found']);
    }
    exit;
}

// Serve the OS interface
serveOS();

function serveOS() {
    // Read the core OS template
    $osTemplate = file_get_contents(__DIR__ . '/../core/os.html');

    if ($osTemplate === false) {
        // Fallback: look in same directory
        $osTemplate = file_get_contents(__DIR__ . '/os.html');
    }

    if ($osTemplate === false) {
        die('Error: OS template not found');
    }

    // Replace placeholders with configuration
    $replacements = [
        '{{OS_NAME}}' => OS_NAME,
        '{{OS_ICON}}' => OS_ICON,
        '{{API_BASE}}' => API_BASE,
        '{{TERMINAL_ICON}}' => TERMINAL_ICON,
        '{{FOLDER_ICON}}' => FOLDER_ICON,
        '{{SETTINGS_ICON}}' => SETTINGS_ICON,
        '{{LOGOUT_ICON}}' => LOGOUT_ICON,
    ];

    $html = str_replace(array_keys($replacements), array_values($replacements), $osTemplate);

    header('Content-Type: text/html; charset=utf-8');
    echo $html;
}
