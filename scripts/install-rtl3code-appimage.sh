#!/usr/bin/env bash
set -euo pipefail

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) asset_arch=x86_64 ;;
  Linux/aarch64 | Linux/arm64) asset_arch=arm64 ;;
  *) printf 'RTL3Code AppImage requires Linux x86_64 or arm64.\n' >&2; exit 1 ;;
esac

release_url=https://github.com/ekrako/RTL3Code/releases/latest/download
asset="RTL3Code-$asset_arch.AppImage"
data_root="${XDG_DATA_HOME:-$HOME/.local/share}"
install_root="$data_root/rtl3code"
bin_root="$HOME/.local/bin"
mkdir -p "$install_root" "$bin_root" "$data_root/applications"
stage=$(mktemp -d "$install_root/.install.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT

for file in "$asset" rtl3code-icon.png SHA256SUMS; do
  curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
    "$release_url/$file" --output "$stage/$file"
done
(
  cd "$stage"
  for file in "$asset" rtl3code-icon.png; do
    awk -v file="$file" '$2 == file || $2 == "*" file { print $1 "  " file }' SHA256SUMS > verify.sha256
    [[ $(wc -l < verify.sha256) -eq 1 ]] || { printf 'Missing or duplicate checksum for %s\n' "$file" >&2; exit 1; }
    sha256sum --check verify.sha256
  done
)
chmod 755 "$stage/$asset"
mv -f "$stage/$asset" "$install_root/$asset"
mv -f "$stage/rtl3code-icon.png" "$install_root/icon.png"

if [[ -f "$bin_root/rtl3code" && ! -f "$bin_root/rtl3code.before-appimage" ]]; then
  cp -p "$bin_root/rtl3code" "$bin_root/rtl3code.before-appimage"
fi
{
  printf '#!/usr/bin/env bash\nset -euo pipefail\n'
  printf 'export RTL3CODE_HOME="${RTL3CODE_HOME:-$HOME/.rtl3code}"\n'
  printf 'export T3CODE_HOME="$RTL3CODE_HOME"\n'
  printf 'export T3CODE_DESKTOP_LAUNCHER_PATH=%q\n' "$bin_root/rtl3code"
  printf 'unset ELECTRON_RUN_AS_NODE VITE_DEV_SERVER_URL T3CODE_PORT T3CODE_DESKTOP_WS_URL\n'
  printf 'exec %q "$@"\n' "$install_root/$asset"
} > "$stage/rtl3code"
chmod 755 "$stage/rtl3code"
mv -f "$stage/rtl3code" "$bin_root/rtl3code"

# Desktop Exec has its own quoting rules, independent of shell quoting.
desktop_quote() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//\$/\\\$}
  value=${value//\`/\\\`}
  value=${value//%/%%}
  printf '"%s"' "$value"
}
{
  printf '[Desktop Entry]\nType=Application\nName=RTL3Code\n'
  printf 'Comment=Independent RTL interface for coding agents\n'
  printf 'Exec='; desktop_quote "$bin_root/rtl3code"; printf ' %%U\n'
  printf 'Icon=%s\nTerminal=false\nCategories=Development;\n' "$install_root/icon.png"
  printf 'StartupWMClass=io.github.ekrako.RTL3Code\n'
  printf 'MimeType=x-scheme-handler/rtl3code;\n'
} > "$data_root/applications/rtl3code.desktop"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$data_root/applications"
fi
printf 'Installed RTL3Code at %s. Launch with %s.\n' "$install_root/$asset" "$bin_root/rtl3code"
