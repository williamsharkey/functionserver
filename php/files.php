<?php
/**
 * Cecilia OS - File Operations
 *
 * Sandboxed file management for multi-tenant users
 */

function resolvePath($path, $homeDir) {
    // Handle ~ notation
    if (strpos($path, '~') === 0) {
        $path = $homeDir . substr($path, 1);
    } elseif (strpos($path, '/') !== 0) {
        // Relative path
        $path = $homeDir . '/' . $path;
    }

    // Normalize path
    $parts = explode('/', $path);
    $normalized = [];
    foreach ($parts as $part) {
        if ($part === '' || $part === '.') continue;
        if ($part === '..') {
            array_pop($normalized);
        } else {
            $normalized[] = $part;
        }
    }
    $resolved = '/' . implode('/', $normalized);

    // Security check: must be within home directory
    $realHome = realpath($homeDir);
    if ($realHome === false) {
        return null;
    }

    // For existing paths, use realpath
    $realPath = realpath($resolved);
    if ($realPath !== false) {
        if (strpos($realPath, $realHome) !== 0) {
            return null; // Path escape attempt
        }
        return $realPath;
    }

    // For non-existing paths, check parent
    $parent = dirname($resolved);
    $realParent = realpath($parent);
    if ($realParent === false || strpos($realParent, $realHome) !== 0) {
        return null;
    }

    return $realParent . '/' . basename($resolved);
}

function getFileInfo($path, $homeDir) {
    $stat = stat($path);
    $isDir = is_dir($path);

    // Convert to ~ notation for display
    $displayPath = str_replace(realpath($homeDir), '~', $path);

    return [
        'name' => basename($path),
        'path' => $displayPath,
        'type' => $isDir ? 'directory' : 'file',
        'size' => $isDir ? 0 : filesize($path),
        'modified' => $stat['mtime'],
        'permissions' => substr(sprintf('%o', fileperms($path)), -4)
    ];
}

function handleFileList() {
    $username = requireAuth();
    $homeDir = getUserHomeDir($username);

    $path = $_GET['path'] ?? '~';
    $resolved = resolvePath($path, $homeDir);

    if ($resolved === null || !is_dir($resolved)) {
        echo json_encode(['error' => 'Invalid directory']);
        return;
    }

    $files = [];
    $entries = scandir($resolved);

    foreach ($entries as $entry) {
        if ($entry === '.') continue;
        $fullPath = $resolved . '/' . $entry;
        $files[] = getFileInfo($fullPath, $homeDir);
    }

    // Sort: directories first, then by name
    usort($files, function($a, $b) {
        if ($a['type'] !== $b['type']) {
            return $a['type'] === 'directory' ? -1 : 1;
        }
        return strcasecmp($a['name'], $b['name']);
    });

    echo json_encode([
        'path' => str_replace(realpath($homeDir), '~', $resolved),
        'files' => $files
    ]);
}

function handleFileRead() {
    $username = requireAuth();
    $homeDir = getUserHomeDir($username);

    $input = json_decode(file_get_contents('php://input'), true);
    $path = $input['path'] ?? '';

    $resolved = resolvePath($path, $homeDir);

    if ($resolved === null || !file_exists($resolved)) {
        echo json_encode(['error' => 'File not found']);
        return;
    }

    if (is_dir($resolved)) {
        echo json_encode(['error' => 'Cannot read directory as file']);
        return;
    }

    // Limit file size
    $maxSize = 1024 * 1024; // 1MB
    if (filesize($resolved) > $maxSize) {
        echo json_encode(['error' => 'File too large (max 1MB)']);
        return;
    }

    $content = file_get_contents($resolved);

    // Detect if binary
    $isBinary = preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', substr($content, 0, 1024));

    if ($isBinary) {
        echo json_encode([
            'error' => 'Binary file',
            'info' => getFileInfo($resolved, $homeDir)
        ]);
        return;
    }

    echo json_encode([
        'content' => $content,
        'info' => getFileInfo($resolved, $homeDir)
    ]);
}

function handleFileWrite() {
    $username = requireAuth();
    $homeDir = getUserHomeDir($username);

    $input = json_decode(file_get_contents('php://input'), true);
    $path = $input['path'] ?? '';
    $content = $input['content'] ?? '';

    if (empty($path)) {
        echo json_encode(['error' => 'Path required']);
        return;
    }

    $resolved = resolvePath($path, $homeDir);

    if ($resolved === null) {
        echo json_encode(['error' => 'Invalid path']);
        return;
    }

    // Ensure parent directory exists
    $parent = dirname($resolved);
    if (!is_dir($parent)) {
        mkdir($parent, 0755, true);
    }

    if (file_put_contents($resolved, $content) === false) {
        echo json_encode(['error' => 'Failed to write file']);
        return;
    }

    echo json_encode([
        'success' => true,
        'info' => getFileInfo($resolved, $homeDir)
    ]);
}

function handleFileDelete() {
    $username = requireAuth();
    $homeDir = getUserHomeDir($username);

    $input = json_decode(file_get_contents('php://input'), true);
    $path = $input['path'] ?? '';

    $resolved = resolvePath($path, $homeDir);

    if ($resolved === null || !file_exists($resolved)) {
        echo json_encode(['error' => 'File not found']);
        return;
    }

    // Prevent deleting home directory
    if ($resolved === realpath($homeDir)) {
        echo json_encode(['error' => 'Cannot delete home directory']);
        return;
    }

    if (is_dir($resolved)) {
        // Only delete empty directories
        if (count(scandir($resolved)) > 2) {
            echo json_encode(['error' => 'Directory not empty']);
            return;
        }
        if (!rmdir($resolved)) {
            echo json_encode(['error' => 'Failed to delete directory']);
            return;
        }
    } else {
        if (!unlink($resolved)) {
            echo json_encode(['error' => 'Failed to delete file']);
            return;
        }
    }

    echo json_encode(['success' => true]);
}

function handleFileMkdir() {
    $username = requireAuth();
    $homeDir = getUserHomeDir($username);

    $input = json_decode(file_get_contents('php://input'), true);
    $path = $input['path'] ?? '';

    if (empty($path)) {
        echo json_encode(['error' => 'Path required']);
        return;
    }

    $resolved = resolvePath($path, $homeDir);

    if ($resolved === null) {
        echo json_encode(['error' => 'Invalid path']);
        return;
    }

    if (file_exists($resolved)) {
        echo json_encode(['error' => 'Path already exists']);
        return;
    }

    if (!mkdir($resolved, 0755, true)) {
        echo json_encode(['error' => 'Failed to create directory']);
        return;
    }

    echo json_encode([
        'success' => true,
        'info' => getFileInfo($resolved, $homeDir)
    ]);
}
