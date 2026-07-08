#!/usr/bin/env bash
# Dither Booth CLI bootstrap installer.
# Usage:
#   curl -fsSL https://github.com/99stud/dither_booth/releases/latest/download/install.sh | sudo bash
set -euo pipefail

REPO="${BOOTH_REPO_SLUG:-99stud/dither_booth}"
VERSION="${BOOTH_VERSION:-latest}"
INSTALL_DIR="${BOOTH_INSTALL_DIR:-/usr/local/bin}"
BIN_NAME="booth"

err() {
  echo "error: $*" >&2
  exit 1
}

arch_raw="$(uname -m)"
case "$arch_raw" in
  aarch64 | arm64) arch="arm64" ;;
  x86_64 | amd64) arch="x64" ;;
  *) err "unsupported architecture: $arch_raw (need arm64 64-bit Pi OS or x64)" ;;
esac

if [ "$(uname -s)" != "Linux" ]; then
  err "this installer only supports Linux"
fi

asset="booth-linux-${arch}"

if [ "$VERSION" = "latest" ]; then
  url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
  url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "Downloading ${asset} (${VERSION})..."
curl -fsSL "$url" -o "$tmp" || err "download failed: $url"

chmod +x "$tmp"

target="${INSTALL_DIR}/${BIN_NAME}"
echo "Installing to ${target}..."

if [ -w "$INSTALL_DIR" ]; then
  mv "$tmp" "$target"
else
  sudo mv "$tmp" "$target"
fi
trap - EXIT

echo "Installed. Run: ${BIN_NAME} --help"
