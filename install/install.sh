#!/bin/bash
#
# Cecilia OS - Universal Installer
#
# Supports: Linux (Ubuntu, Debian, CentOS, Fedora, Alpine, Arch), macOS, WSL
# Backends: php, python, nodejs, go, ruby, deno, bun
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/williamsharkey/cecilia/main/install/install.sh | bash
#
# Custom install:
#   curl -fsSL ... | bash -s -- --name "MyOS" --icon "🚀" --backend go
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
OS_NAME="Cecilia"
OS_ICON="🌼"
INSTALL_DIR="/var/www/cecilia"
BACKEND="nodejs"
DOMAIN=""
PORT="8080"
DEV_MODE=false

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
            INSTALL_DIR="$HOME/cecilia"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            PLATFORM="windows"
            INSTALL_DIR="$HOME/cecilia"
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
        elif [ -f /etc/redhat-release ]; then
            DISTRO="rhel"
        elif [ -f /etc/alpine-release ]; then
            DISTRO="alpine"
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
        --dev)
            DEV_MODE=true
            shift
            ;;
        --help|-h)
            echo "Cecilia OS Universal Installer"
            echo ""
            echo "Usage: ./install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --name NAME      OS display name (default: Cecilia)"
            echo "  --icon EMOJI     OS icon emoji (default: 🌼)"
            echo "  --dir PATH       Installation directory"
            echo "  --backend TYPE   Backend: php, python, nodejs, go, ruby, deno, bun"
            echo "  --domain DOMAIN  Domain name for SSL"
            echo "  --port PORT      Port (default: 8080)"
            echo "  --dev            Development mode (no sudo, local dirs)"
            echo "  --help           Show this help"
            echo ""
            echo "Examples:"
            echo "  # Quick install with Node.js"
            echo "  curl -fsSL URL | bash"
            echo ""
            echo "  # Custom name with Go backend"
            echo '  curl -fsSL URL | bash -s -- --name "MyOS" --backend go'
            echo ""
            echo "  # Local development"
            echo "  ./install.sh --dev --backend bun"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Detect platform
detect_platform

echo -e "${CYAN}"
cat << 'EOF'
   ____          _ _ _       ___  ____
  / ___|___  ___(_) (_) __ _/ _ \/ ___|
 | |   / _ \/ __| | | |/ _` | | | \___ \
 | |__| __/ (__| | | | (_| | |_| |___) |
  \____\___|\___|_|_|_|\__,_|\___/|____/
EOF
echo -e "${NC}"
echo -e "Installing ${GREEN}$OS_NAME${NC} $OS_ICON"
echo -e "Platform: ${YELLOW}$PLATFORM${NC} $([ -n "$DISTRO" ] && echo "($DISTRO)")"
echo -e "Backend: ${YELLOW}$BACKEND${NC}"
echo -e "Directory: ${YELLOW}$INSTALL_DIR${NC}"
echo ""

# Check for sudo (not needed on macOS dev mode)
SUDO=""
if [ "$DEV_MODE" = false ] && [ "$PLATFORM" != "macos" ]; then
    if [ "$EUID" -ne 0 ]; then
        if command -v sudo &> /dev/null; then
            SUDO="sudo"
        else
            echo -e "${RED}Please run as root or install sudo${NC}"
            exit 1
        fi
    fi
fi

# Package manager detection
install_package() {
    local pkg=$1
    echo -e "${BLUE}Installing $pkg...${NC}"

    case "$DISTRO" in
        ubuntu|debian|pop|linuxmint)
            $SUDO apt-get update -qq
            $SUDO apt-get install -y -qq "$pkg"
            ;;
        centos|rhel|fedora|rocky|alma)
            $SUDO dnf install -y "$pkg" 2>/dev/null || $SUDO yum install -y "$pkg"
            ;;
        alpine)
            $SUDO apk add --no-cache "$pkg"
            ;;
        arch|manjaro)
            $SUDO pacman -S --noconfirm "$pkg"
            ;;
        opensuse*)
            $SUDO zypper install -y "$pkg"
            ;;
        *)
            if [ "$PLATFORM" = "macos" ]; then
                if ! command -v brew &> /dev/null; then
                    echo -e "${YELLOW}Installing Homebrew...${NC}"
                    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                fi
                brew install "$pkg"
            else
                echo -e "${RED}Unknown package manager for: $DISTRO${NC}"
                return 1
            fi
            ;;
    esac
}

# Install common dependencies
install_common() {
    echo -e "${YELLOW}Installing common dependencies...${NC}"

    case "$DISTRO" in
        ubuntu|debian|pop|linuxmint)
            $SUDO apt-get update -qq
            $SUDO apt-get install -y -qq curl git wget
            ;;
        centos|rhel|fedora|rocky|alma)
            $SUDO dnf install -y curl git wget 2>/dev/null || $SUDO yum install -y curl git wget
            ;;
        alpine)
            $SUDO apk add --no-cache curl git wget bash
            ;;
        arch|manjaro)
            $SUDO pacman -S --noconfirm curl git wget
            ;;
        *)
            if [ "$PLATFORM" = "macos" ]; then
                # macOS has curl, git usually available
                command -v git &> /dev/null || brew install git
            fi
            ;;
    esac
}

# Backend installers
install_php() {
    echo -e "${YELLOW}Installing PHP...${NC}"
    case "$DISTRO" in
        ubuntu|debian|pop|linuxmint)
            $SUDO apt-get install -y -qq php php-cli php-fpm php-json php-common
            ;;
        centos|rhel|fedora|rocky|alma)
            $SUDO dnf install -y php php-cli php-fpm php-json
            ;;
        alpine)
            $SUDO apk add --no-cache php php-fpm php-json
            ;;
        arch|manjaro)
            $SUDO pacman -S --noconfirm php php-fpm
            ;;
        *)
            if [ "$PLATFORM" = "macos" ]; then
                brew install php
            fi
            ;;
    esac
}

install_python() {
    echo -e "${YELLOW}Installing Python...${NC}"
    case "$DISTRO" in
        ubuntu|debian|pop|linuxmint)
            $SUDO apt-get install -y -qq python3 python3-pip python3-venv
            ;;
        centos|rhel|fedora|rocky|alma)
            $SUDO dnf install -y python3 python3-pip
            ;;
        alpine)
            $SUDO apk add --no-cache python3 py3-pip
            ;;
        arch|manjaro)
            $SUDO pacman -S --noconfirm python python-pip
            ;;
        *)
            if [ "$PLATFORM" = "macos" ]; then
                brew install python3
            fi
            ;;
    esac
}

install_nodejs() {
    echo -e "${YELLOW}Installing Node.js...${NC}"

    # Use fnm, nvm, or direct install
    if command -v node &> /dev/null && [ "$(node -v | cut -d. -f1 | tr -d 'v')" -ge 18 ]; then
        echo -e "${GREEN}Node.js already installed${NC}"
        return
    fi

    case "$DISTRO" in
        ubuntu|debian|pop|linuxmint)
            curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
            $SUDO apt-get install -y -qq nodejs
            ;;
        centos|rhel|fedora|rocky|alma)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
            $SUDO dnf install -y nodejs
            ;;
        alpine)
            $SUDO apk add --no-cache nodejs npm
            ;;
        arch|manjaro)
            $SUDO pacman -S --noconfirm nodejs npm
            ;;
        *)
            if [ "$PLATFORM" = "macos" ]; then
                brew install node
            fi
            ;;
    esac
}

install_go() {
    echo -e "${YELLOW}Installing Go...${NC}"

    if command -v go &> /dev/null; then
        echo -e "${GREEN}Go already installed${NC}"
        return
    fi

    GO_VERSION="1.21.5"
    case "$PLATFORM" in
        linux|wsl)
            ARCH=$(uname -m)
            case $ARCH in
                x86_64) ARCH="amd64" ;;
                aarch64) ARCH="arm64" ;;
            esac
            curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" | $SUDO tar -C /usr/local -xzf -
            echo 'export PATH=$PATH:/usr/local/go/bin' | $SUDO tee /etc/profile.d/go.sh
            export PATH=$PATH:/usr/local/go/bin
            ;;
        macos)
            brew install go
            ;;
    esac
}

install_ruby() {
    echo -e "${YELLOW}Installing Ruby...${NC}"
    case "$DISTRO" in
        ubuntu|debian|pop|linuxmint)
            $SUDO apt-get install -y -qq ruby ruby-dev ruby-bundler
            ;;
        centos|rhel|fedora|rocky|alma)
            $SUDO dnf install -y ruby ruby-devel rubygem-bundler
            ;;
        alpine)
            $SUDO apk add --no-cache ruby ruby-dev ruby-bundler
            ;;
        arch|manjaro)
            $SUDO pacman -S --noconfirm ruby rubygems
            ;;
        *)
            if [ "$PLATFORM" = "macos" ]; then
                brew install ruby
            fi
            ;;
    esac
}

install_deno() {
    echo -e "${YELLOW}Installing Deno...${NC}"

    if command -v deno &> /dev/null; then
        echo -e "${GREEN}Deno already installed${NC}"
        return
    fi

    curl -fsSL https://deno.land/install.sh | sh
    export DENO_INSTALL="$HOME/.deno"
    export PATH="$DENO_INSTALL/bin:$PATH"
}

install_bun() {
    echo -e "${YELLOW}Installing Bun...${NC}"

    if command -v bun &> /dev/null; then
        echo -e "${GREEN}Bun already installed${NC}"
        return
    fi

    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
}

# Install Claude Code
install_claude_code() {
    echo -e "${YELLOW}Installing Claude Code...${NC}"

    if command -v npm &> /dev/null; then
        npm install -g @anthropic-ai/claude-code 2>/dev/null || true
    fi
}

# Main installation
install_common

case $BACKEND in
    php)
        install_php
        ;;
    python)
        install_python
        ;;
    nodejs|node)
        install_nodejs
        ;;
    go|golang)
        install_go
        ;;
    ruby)
        install_ruby
        ;;
    deno)
        install_deno
        ;;
    bun)
        install_bun
        ;;
    *)
        echo -e "${RED}Unknown backend: $BACKEND${NC}"
        echo "Available: php, python, nodejs, go, ruby, deno, bun"
        exit 1
        ;;
esac

# Install Claude Code if npm available
install_claude_code

# Create installation directory
echo -e "${YELLOW}Setting up installation...${NC}"
mkdir -p "$INSTALL_DIR"

# Download Cecilia
echo -e "${YELLOW}Downloading Cecilia OS...${NC}"
if command -v git &> /dev/null; then
    if [ -d "$INSTALL_DIR/.git" ]; then
        cd "$INSTALL_DIR" && git pull
    else
        git clone https://github.com/williamsharkey/cecilia.git "$INSTALL_DIR/repo" 2>/dev/null || true
        if [ -d "$INSTALL_DIR/repo" ]; then
            cp -r "$INSTALL_DIR/repo/"* "$INSTALL_DIR/"
            rm -rf "$INSTALL_DIR/repo"
        fi
    fi
else
    curl -fsSL https://github.com/williamsharkey/cecilia/archive/main.tar.gz | \
    tar -xz -C "$INSTALL_DIR" --strip-components=1
fi

# Copy backend files
echo -e "${YELLOW}Configuring $BACKEND backend...${NC}"
cp -r "$INSTALL_DIR/$BACKEND/"* "$INSTALL_DIR/" 2>/dev/null || true
cp -r "$INSTALL_DIR/core" "$INSTALL_DIR/" 2>/dev/null || true

# Create data directories
mkdir -p "$INSTALL_DIR/data/users"

# Set permissions
if [ "$DEV_MODE" = false ] && [ -n "$SUDO" ]; then
    $SUDO chown -R $(whoami):$(whoami) "$INSTALL_DIR" 2>/dev/null || true
fi
chmod -R 755 "$INSTALL_DIR"

# Install backend dependencies
cd "$INSTALL_DIR"
case $BACKEND in
    nodejs|node)
        npm install 2>/dev/null || true
        ;;
    python)
        pip3 install -r requirements.txt 2>/dev/null || python3 -m pip install -r requirements.txt 2>/dev/null || true
        ;;
    go|golang)
        go mod download 2>/dev/null || true
        go build -o cecilia 2>/dev/null || true
        ;;
    ruby)
        bundle install 2>/dev/null || gem install sinatra sinatra-contrib bcrypt puma 2>/dev/null || true
        ;;
    deno)
        # Deno caches on first run
        ;;
    bun)
        # Bun has no external deps
        ;;
esac

# Create start script
cat > "$INSTALL_DIR/start.sh" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
export OS_NAME="$OS_NAME"
export OS_ICON="$OS_ICON"
export PORT="$PORT"

case "$BACKEND" in
    php)
        php -S 0.0.0.0:\$PORT
        ;;
    python)
        python3 app.py
        ;;
    nodejs|node)
        node server.js
        ;;
    go|golang)
        ./cecilia 2>/dev/null || go run main.go
        ;;
    ruby)
        ruby app.rb
        ;;
    deno)
        deno task start
        ;;
    bun)
        bun run server.ts
        ;;
esac
EOF
chmod +x "$INSTALL_DIR/start.sh"

# Get IP address
IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  $OS_ICON $OS_NAME installed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Start the server:${NC}"
echo -e "    ${YELLOW}cd $INSTALL_DIR && ./start.sh${NC}"
echo ""
echo -e "  ${CYAN}Access your OS at:${NC}"
if [ -n "$DOMAIN" ]; then
    echo -e "    ${BLUE}http://$DOMAIN:$PORT${NC}"
fi
echo -e "    ${BLUE}http://$IP:$PORT${NC}"
echo -e "    ${BLUE}http://localhost:$PORT${NC}"
echo ""
echo -e "  ${CYAN}Directory:${NC} ${YELLOW}$INSTALL_DIR${NC}"
echo -e "  ${CYAN}Backend:${NC} ${YELLOW}$BACKEND${NC}"
echo ""
echo -e "${GREEN}Enjoy your new web OS!${NC}"
