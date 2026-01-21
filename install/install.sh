#!/bin/bash
#
# Cecilia OS - Single-line installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/williamsharkey/cecilia/main/install/install.sh | bash
#
# Or with custom OS name:
#   curl -fsSL https://raw.githubusercontent.com/williamsharkey/cecilia/main/install/install.sh | bash -s -- --name "MyOS" --icon "🚀"
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
OS_NAME="Cecilia"
OS_ICON="🌼"
INSTALL_DIR="/var/www/cecilia"
BACKEND="php"
DOMAIN=""
PORT="80"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            OS_NAME="$2"
            shift 2
            ;;
        --icon)
            OS_ICON="$2"
            shift 2
            ;;
        --dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --backend)
            BACKEND="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --help)
            echo "Cecilia OS Installer"
            echo ""
            echo "Usage: ./install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --name NAME      OS display name (default: Cecilia)"
            echo "  --icon EMOJI     OS icon emoji (default: 🌼)"
            echo "  --dir PATH       Installation directory (default: /var/www/cecilia)"
            echo "  --backend TYPE   Backend type: php, python, nodejs (default: php)"
            echo "  --domain DOMAIN  Domain name for SSL setup"
            echo "  --port PORT      Port to run on (default: 80)"
            echo "  --help           Show this help"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}"
echo "   ____          _ _ _       ___  ____  "
echo "  / ___|___  ___(_) (_) __ _/ _ \/ ___| "
echo " | |   / _ \/ __| | | |/ _\` | | | \___ \ "
echo " | |__| __/ (__| | | | (_| | |_| |___) |"
echo "  \____\___|\___|_|_|_|\__,_|\___/|____/ "
echo ""
echo -e "${NC}"
echo -e "Installing ${GREEN}$OS_NAME${NC} $OS_ICON"
echo -e "Backend: ${YELLOW}$BACKEND${NC}"
echo -e "Directory: ${YELLOW}$INSTALL_DIR${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    DISTRO="unknown"
fi

echo -e "${BLUE}Detected OS: $DISTRO${NC}"

# Install dependencies based on backend
install_php() {
    echo -e "${YELLOW}Installing PHP and dependencies...${NC}"

    if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
        apt-get update
        apt-get install -y php php-cli php-fpm php-json php-common nginx curl git
    elif [ "$DISTRO" = "centos" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "fedora" ]; then
        dnf install -y php php-cli php-fpm php-json nginx curl git
    elif [ "$DISTRO" = "alpine" ]; then
        apk add php php-fpm php-json nginx curl git
    else
        echo -e "${RED}Unsupported distribution for PHP: $DISTRO${NC}"
        exit 1
    fi
}

install_python() {
    echo -e "${YELLOW}Installing Python and dependencies...${NC}"

    if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
        apt-get update
        apt-get install -y python3 python3-pip python3-venv nginx curl git
    elif [ "$DISTRO" = "centos" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "fedora" ]; then
        dnf install -y python3 python3-pip nginx curl git
    elif [ "$DISTRO" = "alpine" ]; then
        apk add python3 py3-pip nginx curl git
    else
        echo -e "${RED}Unsupported distribution for Python: $DISTRO${NC}"
        exit 1
    fi
}

install_nodejs() {
    echo -e "${YELLOW}Installing Node.js and dependencies...${NC}"

    if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
        apt-get update
        apt-get install -y curl git
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif [ "$DISTRO" = "centos" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "fedora" ]; then
        dnf install -y curl git
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        dnf install -y nodejs
    elif [ "$DISTRO" = "alpine" ]; then
        apk add nodejs npm curl git
    else
        echo -e "${RED}Unsupported distribution for Node.js: $DISTRO${NC}"
        exit 1
    fi
}

# Install Claude Code
install_claude_code() {
    echo -e "${YELLOW}Installing Claude Code...${NC}"

    if command -v npm &> /dev/null; then
        npm install -g @anthropic-ai/claude-code || true
    fi
}

# Install dependencies
case $BACKEND in
    php)
        install_php
        ;;
    python)
        install_python
        ;;
    nodejs)
        install_nodejs
        ;;
    *)
        echo -e "${RED}Unknown backend: $BACKEND${NC}"
        exit 1
        ;;
esac

# Install Claude Code if npm is available
install_claude_code

# Create installation directory
echo -e "${YELLOW}Creating installation directory...${NC}"
mkdir -p "$INSTALL_DIR"

# Clone or download the repository
echo -e "${YELLOW}Downloading Cecilia OS...${NC}"
if command -v git &> /dev/null; then
    git clone https://github.com/williamsharkey/cecilia.git "$INSTALL_DIR/src" 2>/dev/null || \
    (cd "$INSTALL_DIR/src" && git pull)
else
    curl -fsSL https://github.com/williamsharkey/cecilia/archive/main.tar.gz | \
    tar -xz -C "$INSTALL_DIR" --strip-components=1
fi

# Copy backend files
echo -e "${YELLOW}Setting up $BACKEND backend...${NC}"
cp -r "$INSTALL_DIR/src/$BACKEND/"* "$INSTALL_DIR/"
cp -r "$INSTALL_DIR/src/core" "$INSTALL_DIR/"

# Create data directories
mkdir -p "$INSTALL_DIR/data/users"
mkdir -p /home

# Set permissions
chown -R www-data:www-data "$INSTALL_DIR" 2>/dev/null || \
chown -R nginx:nginx "$INSTALL_DIR" 2>/dev/null || \
chown -R apache:apache "$INSTALL_DIR" 2>/dev/null || true

chmod -R 755 "$INSTALL_DIR"
chmod -R 777 "$INSTALL_DIR/data"

# Create configuration with custom OS name
if [ "$BACKEND" = "php" ]; then
    # Update PHP config
    sed -i "s/define('OS_NAME', .*/define('OS_NAME', getenv('OS_NAME') ?: '$OS_NAME');/" "$INSTALL_DIR/config.php"
    sed -i "s/define('OS_ICON', .*/define('OS_ICON', getenv('OS_ICON') ?: '$OS_ICON');/" "$INSTALL_DIR/config.php"
fi

# Configure nginx
echo -e "${YELLOW}Configuring nginx...${NC}"
cat > /etc/nginx/sites-available/cecilia << EOF
server {
    listen $PORT;
    server_name ${DOMAIN:-_};

    root $INSTALL_DIR;
    index index.php index.html;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;

        # Pass environment variables
        fastcgi_param OS_NAME "$OS_NAME";
        fastcgi_param OS_ICON "$OS_ICON";
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/cecilia /etc/nginx/sites-enabled/cecilia 2>/dev/null || true

# Remove default site
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test nginx config
nginx -t

# Restart services
echo -e "${YELLOW}Starting services...${NC}"
systemctl restart php-fpm 2>/dev/null || systemctl restart php8.2-fpm 2>/dev/null || service php-fpm restart 2>/dev/null || true
systemctl restart nginx 2>/dev/null || service nginx restart 2>/dev/null || true

# Get IP address
IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  $OS_NAME $OS_ICON installed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Access your OS at:"
if [ -n "$DOMAIN" ]; then
    echo -e "    ${BLUE}http://$DOMAIN${NC}"
fi
echo -e "    ${BLUE}http://$IP${NC}"
echo ""
echo -e "  Installation directory: ${YELLOW}$INSTALL_DIR${NC}"
echo ""
echo -e "  To change the OS name later, edit:"
echo -e "    ${YELLOW}$INSTALL_DIR/config.php${NC}"
echo ""
echo -e "${GREEN}Enjoy your new web OS!${NC}"
