<?php
/**
 * Cecilia OS - Terminal Execution
 *
 * Sandboxed command execution for multi-tenant users
 */

function getUserHomeDir($username) {
    return HOMES_DIR . '/' . $username;
}

function sanitizePath($path, $homeDir) {
    // Resolve the path relative to home
    if (strpos($path, '~') === 0) {
        $path = $homeDir . substr($path, 1);
    } elseif (strpos($path, '/') !== 0) {
        // Relative path - would need CWD context
        $path = $homeDir . '/' . $path;
    }

    // Resolve .. and .
    $realPath = realpath($path);
    if ($realPath === false) {
        // Path doesn't exist yet, check parent
        $parent = dirname($path);
        $realParent = realpath($parent);
        if ($realParent === false) {
            return null;
        }
        $realPath = $realParent . '/' . basename($path);
    }

    // Ensure path is within home directory
    if (strpos($realPath, realpath($homeDir)) !== 0) {
        return null;
    }

    return $realPath;
}

function isCommandAllowed($command) {
    // Extract the base command
    $parts = preg_split('/\s+/', trim($command), 2);
    $baseCmd = basename($parts[0]);

    // Check blocked list first
    if (in_array($baseCmd, BLOCKED_COMMANDS)) {
        return false;
    }

    // Check allowed list
    return in_array($baseCmd, ALLOWED_COMMANDS);
}

function handleTerminalExec() {
    $username = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $command = $input['command'] ?? '';

    if (empty($command)) {
        echo json_encode(['error' => 'No command provided']);
        return;
    }

    $homeDir = getUserHomeDir($username);

    // Ensure home directory exists
    if (!is_dir($homeDir)) {
        mkdir($homeDir, 0755, true);
    }

    // Parse command
    $parts = preg_split('/\s+/', trim($command), 2);
    $baseCmd = $parts[0];
    $args = $parts[1] ?? '';

    // Handle built-in commands
    switch ($baseCmd) {
        case 'cd':
            return handleCd($args, $homeDir, $username);
        case 'pwd':
            echo json_encode(['output' => $homeDir, 'cwd' => '~']);
            return;
        case 'claude':
            return handleClaude($args, $homeDir, $username);
    }

    // Check if command is allowed
    if (!isCommandAllowed($baseCmd)) {
        echo json_encode(['error' => "Command not allowed: $baseCmd"]);
        return;
    }

    // Execute command in user's home directory
    $fullCommand = sprintf(
        'cd %s && %s 2>&1',
        escapeshellarg($homeDir),
        $command
    );

    // Set environment for the command
    $env = [
        'HOME' => $homeDir,
        'USER' => $username,
        'PATH' => '/usr/local/bin:/usr/bin:/bin'
    ];

    $descriptorspec = [
        0 => ['pipe', 'r'],  // stdin
        1 => ['pipe', 'w'],  // stdout
        2 => ['pipe', 'w'],  // stderr
    ];

    $process = proc_open($fullCommand, $descriptorspec, $pipes, $homeDir, $env);

    if (!is_resource($process)) {
        echo json_encode(['error' => 'Failed to execute command']);
        return;
    }

    // Close stdin
    fclose($pipes[0]);

    // Read output
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    $returnCode = proc_close($process);

    $response = ['output' => rtrim($stdout)];
    if ($stderr && $returnCode !== 0) {
        $response['error'] = rtrim($stderr);
    }

    echo json_encode($response);
}

function handleCd($path, $homeDir, $username) {
    if (empty($path) || $path === '~') {
        echo json_encode(['cwd' => '~']);
        return;
    }

    $targetPath = sanitizePath($path, $homeDir);
    if ($targetPath === null || !is_dir($targetPath)) {
        echo json_encode(['error' => "cd: no such directory: $path"]);
        return;
    }

    // Convert back to ~ notation
    $displayPath = str_replace(realpath($homeDir), '~', $targetPath);

    echo json_encode(['cwd' => $displayPath]);
}

function handleClaude($args, $homeDir, $username) {
    // Check if Claude Code is installed
    exec('which claude 2>&1', $output, $returnCode);

    if ($returnCode !== 0) {
        echo json_encode([
            'output' => "Claude Code not installed.\n\nTo install, run:\nnpm install -g @anthropic-ai/claude-code\n\nOr visit: https://claude.ai/claude-code"
        ]);
        return;
    }

    // For Claude Code, we need to run it interactively
    // This is a special case - return instructions for now
    echo json_encode([
        'output' => "Claude Code is available!\n\nTo use Claude Code interactively:\n1. SSH into your account: ssh $username@" . ($_SERVER['HTTP_HOST'] ?? 'server') . "\n2. Run: claude\n\nNote: Full terminal emulation for Claude Code requires SSH access."
    ]);
}
