#!/bin/bash
#
# Function Server - Single-line installer
#
# Usage:
#   curl -fsSL https://functionserver.com/install | bash
#
# Options:
#   curl -fsSL https://functionserver.com/install | bash -s -- --name "MyOS" --icon "🚀"
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default configuration
OS_NAME="Function Server"
OS_ICON="⚡"
INSTALL_DIR="/opt/functionserver"
DOMAIN=""
PORT="8080"

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Linux*)
            if grep -q Microsoft /proc/version 2>/dev/null; then
                PLATFORM="wsl"
            else
                PLATFORM="linux"
            fi
            ;;
        Darwin*)
            PLATFORM="macos"
            INSTALL_DIR="$HOME/functionserver"
            ;;
        *)
            PLATFORM="unknown"
            ;;
    esac

    # Detect Linux distribution
    if [ "$PLATFORM" = "linux" ] || [ "$PLATFORM" = "wsl" ]; then
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            DISTRO=$ID
        else
            DISTRO="unknown"
        fi
    fi
}

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
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Function Server Installer"
            echo ""
            echo "Usage: curl -fsSL https://functionserver.com/install | bash"
            echo ""
            echo "Options:"
            echo "  --name NAME      OS display name (default: Function Server)"
            echo "  --icon EMOJI     OS icon emoji (default: ⚡)"
            echo "  --dir PATH       Installation directory"
            echo "  --domain DOMAIN  Domain name"
            echo "  --port PORT      Port (default: 8080)"
            echo "  --help           Show this help"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

detect_platform

echo -e "${CYAN}"
cat << 'EOF'
  ___              _   _            ___
 | __|  _ _ _  __ | |_(_)___ _ _   / __| ___ _ ___ _____ _ _
 | _| || | ' \/ _||  _| / _ \ ' \  \__ \/ -_) '_\ V / -_) '_|
 |_| \_,_|_||_\__| \__|_\___/_||_| |___/\___|_|  \_/\___|_|
EOF
echo -e "${NC}"
echo -e "Installing ${GREEN}$OS_NAME${NC} $OS_ICON"
echo -e "Platform: ${YELLOW}$PLATFORM${NC} $([ -n "$DISTRO" ] && echo "($DISTRO)")"
echo ""

# Check for root/sudo
SUDO=""
if [ "$PLATFORM" != "macos" ] && [ "$EUID" -ne 0 ]; then
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        echo -e "${RED}Please run as root or install sudo${NC}"
        exit 1
    fi
fi

# Install Go if not present
install_go() {
    if command -v go &> /dev/null; then
        echo -e "${GREEN}Go already installed: $(go version)${NC}"
        return
    fi

    echo -e "${YELLOW}Installing Go...${NC}"
    GO_VERSION="1.22.0"

    case "$PLATFORM" in
        linux|wsl)
            ARCH=$(uname -m)
            case $ARCH in
                x86_64) ARCH="amd64" ;;
                aarch64|arm64) ARCH="arm64" ;;
            esac
            curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz
            $SUDO rm -rf /usr/local/go
            $SUDO tar -C /usr/local -xzf /tmp/go.tar.gz
            rm /tmp/go.tar.gz
            export PATH=$PATH:/usr/local/go/bin
            echo 'export PATH=$PATH:/usr/local/go/bin' | $SUDO tee /etc/profile.d/go.sh > /dev/null
            ;;
        macos)
            if command -v brew &> /dev/null; then
                brew install go
            else
                echo -e "${RED}Please install Homebrew first: https://brew.sh${NC}"
                exit 1
            fi
            ;;
    esac
}

# Install common tools
echo -e "${YELLOW}Checking dependencies...${NC}"
case "$DISTRO" in
    ubuntu|debian|pop)
        $SUDO apt-get update -qq
        $SUDO apt-get install -y -qq curl git
        ;;
    centos|rhel|fedora|rocky|alma)
        $SUDO dnf install -y curl git 2>/dev/null || $SUDO yum install -y curl git
        ;;
    alpine)
        $SUDO apk add --no-cache curl git bash
        ;;
    arch|manjaro)
        $SUDO pacman -S --noconfirm curl git
        ;;
esac

install_go

# Create installation directory
echo -e "${YELLOW}Setting up ${INSTALL_DIR}...${NC}"
$SUDO mkdir -p "$INSTALL_DIR"
$SUDO chown $(whoami) "$INSTALL_DIR"

# Download source
echo -e "${YELLOW}Downloading Function Server...${NC}"
cd "$INSTALL_DIR"
if [ -d ".git" ]; then
    git pull
else
    git clone --depth 1 https://github.com/williamsharkey/cecilia.git .
fi

# Build
echo -e "${YELLOW}Building...${NC}"
cd "$INSTALL_DIR/go"
go build -o functionserver main.go

# Create data directories
mkdir -p "$INSTALL_DIR/data/users"

# Create systemd service (Linux only)
if [ "$PLATFORM" = "linux" ] && command -v systemctl &> /dev/null; then
    echo -e "${YELLOW}Creating systemd service...${NC}"
    $SUDO tee /etc/systemd/system/functionserver.service > /dev/null << EOF
[Unit]
Description=Function Server
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR/go
Environment=OS_NAME=$OS_NAME
Environment=OS_ICON=$OS_ICON
Environment=PORT=$PORT
ExecStart=$INSTALL_DIR/go/functionserver
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable functionserver
fi

# Create start script
cat > "$INSTALL_DIR/start.sh" << EOF
#!/bin/bash
cd "$INSTALL_DIR/go"
export OS_NAME="$OS_NAME"
export OS_ICON="$OS_ICON"
export PORT="$PORT"
./functionserver
EOF
chmod +x "$INSTALL_DIR/start.sh"

# Get IP
IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  $OS_ICON $OS_NAME installed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
if [ "$PLATFORM" = "linux" ] && command -v systemctl &> /dev/null; then
    echo -e "  ${CYAN}Start the server:${NC}"
    echo -e "    ${YELLOW}sudo systemctl start functionserver${NC}"
    echo ""
    echo -e "  ${CYAN}View logs:${NC}"
    echo -e "    ${YELLOW}sudo journalctl -u functionserver -f${NC}"
else
    echo -e "  ${CYAN}Start the server:${NC}"
    echo -e "    ${YELLOW}$INSTALL_DIR/start.sh${NC}"
fi
echo ""
echo -e "  ${CYAN}Access your server at:${NC}"
if [ -n "$DOMAIN" ]; then
    echo -e "    ${BLUE}http://$DOMAIN${NC}"
fi
echo -e "    ${BLUE}http://$IP:$PORT${NC}"
echo ""
