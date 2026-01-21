<?php
/**
 * Cecilia OS - Authentication
 *
 * Multi-tenant user management with Linux user creation
 */

function getUserFile($username) {
    return USERS_DIR . '/' . $username . '.json';
}

function userExists($username) {
    return file_exists(getUserFile($username));
}

function loadUser($username) {
    $file = getUserFile($username);
    if (!file_exists($file)) {
        return null;
    }
    return json_decode(file_get_contents($file), true);
}

function saveUser($username, $data) {
    $file = getUserFile($username);
    return file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
}

function generateToken($username) {
    $payload = [
        'username' => $username,
        'exp' => time() + SESSION_EXPIRY,
        'rand' => bin2hex(random_bytes(16))
    ];
    $data = base64_encode(json_encode($payload));
    $signature = hash_hmac('sha256', $data, SESSION_SECRET);
    return $data . '.' . $signature;
}

function verifyToken($token) {
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return null;
    }

    $data = $parts[0];
    $signature = $parts[1];

    if (hash_hmac('sha256', $data, SESSION_SECRET) !== $signature) {
        return null;
    }

    $payload = json_decode(base64_decode($data), true);
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
        return null;
    }

    return $payload['username'];
}

function validateUsername($username) {
    // 3-32 chars, starts with letter, lowercase alphanumeric and underscore only
    return preg_match('/^[a-z][a-z0-9_]{2,31}$/', $username);
}

function createLinuxUser($username) {
    // Create Linux user with home directory
    // This requires the web server to have sudo permissions for useradd
    // or you can run this script with appropriate privileges

    $homeDir = HOMES_DIR . '/' . $username;

    // Check if user already exists
    exec('id ' . escapeshellarg($username) . ' 2>&1', $output, $returnCode);
    if ($returnCode === 0) {
        // User already exists, just ensure home dir
        if (!is_dir($homeDir)) {
            mkdir($homeDir, 0755, true);
        }
        return true;
    }

    // Try to create user (requires sudo privileges)
    // In production, you might use a privileged helper script
    $cmd = sprintf(
        'sudo useradd -m -d %s -s /bin/bash %s 2>&1',
        escapeshellarg($homeDir),
        escapeshellarg($username)
    );

    exec($cmd, $output, $returnCode);

    if ($returnCode !== 0) {
        // Fallback: just create home directory without Linux user
        // This works for sandboxed file operations
        if (!is_dir($homeDir)) {
            mkdir($homeDir, 0755, true);
        }
        error_log("Could not create Linux user $username: " . implode("\n", $output));
    }

    return is_dir($homeDir);
}

function handleLogin() {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';

    if (!validateUsername($username)) {
        echo json_encode(['error' => 'Invalid username format']);
        return;
    }

    $user = loadUser($username);
    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }

    if (!password_verify($password, $user['password_hash'])) {
        echo json_encode(['error' => 'Invalid password']);
        return;
    }

    // Update last login
    $user['last_login'] = time();
    saveUser($username, $user);

    $token = generateToken($username);
    echo json_encode([
        'success' => true,
        'username' => $username,
        'token' => $token
    ]);
}

function handleRegister() {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';

    if (!validateUsername($username)) {
        echo json_encode(['error' => 'Invalid username. Must be 3-32 chars, start with letter, lowercase alphanumeric only.']);
        return;
    }

    if (strlen($password) < 6) {
        echo json_encode(['error' => 'Password must be at least 6 characters']);
        return;
    }

    if (userExists($username)) {
        echo json_encode(['error' => 'Username already taken']);
        return;
    }

    // Create Linux user and home directory
    if (!createLinuxUser($username)) {
        echo json_encode(['error' => 'Could not create user directory']);
        return;
    }

    // Save user data
    $userData = [
        'username' => $username,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'created' => time(),
        'last_login' => time()
    ];

    if (!saveUser($username, $userData)) {
        echo json_encode(['error' => 'Could not save user data']);
        return;
    }

    $token = generateToken($username);
    echo json_encode([
        'success' => true,
        'username' => $username,
        'token' => $token
    ]);
}

function handleVerify() {
    $input = json_decode(file_get_contents('php://input'), true);
    $token = $input['token'] ?? '';
    $username = $input['username'] ?? '';

    $tokenUser = verifyToken($token);

    if ($tokenUser && $tokenUser === $username) {
        echo json_encode(['valid' => true, 'username' => $username]);
    } else {
        echo json_encode(['valid' => false]);
    }
}

function requireAuth() {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['error' => 'Authorization required']);
        exit;
    }

    $username = verifyToken($matches[1]);
    if (!$username) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or expired token']);
        exit;
    }

    return $username;
}
