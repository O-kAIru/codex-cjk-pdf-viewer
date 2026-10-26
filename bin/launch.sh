#!/bin/sh
# GUI applications do not necessarily inherit an interactive shell's NVM PATH.
# Find a supported runtime without sourcing profiles or changing global config.
set -u

cjk_launcher_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
cjk_plugin_dir=$(CDPATH= cd -- "$cjk_launcher_dir/.." && pwd) || exit 1
cjk_server="$cjk_plugin_dir/dist/server.mjs"

if [ ! -r "$cjk_server" ]; then
  printf '%s\n' 'CJK PDF Viewer: dist/server.mjs is missing; install a built release.' >&2
  exit 1
fi

cjk_probe_node() {
  [ -n "$1" ] && [ -x "$1" ] || return 1
  cjk_probe_major=$("$1" -p "process.versions.node.split('.')[0]" 2>/dev/null) || return 1
  case "$cjk_probe_major" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$cjk_probe_major" -ge 22 ] || return 1
  cjk_node="$1"
  cjk_node_major="$cjk_probe_major"
  return 0
}

cjk_node=''
cjk_node_major=''
if [ -n "${CJK_PDF_NODE-}" ]; then
  if ! cjk_probe_node "$CJK_PDF_NODE"; then
    printf '%s\n' 'CJK PDF Viewer: CJK_PDF_NODE must point to an executable Node.js 22 or later.' >&2
    exit 1
  fi
else
  cjk_path_node=$(command -v node 2>/dev/null || :)
  if ! cjk_probe_node "$cjk_path_node"; then
    for cjk_candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
      cjk_probe_node "$cjk_candidate" && break
    done
  fi
  if [ -z "$cjk_node" ]; then
    cjk_nvm_dir=${NVM_DIR-}
    if [ -z "$cjk_nvm_dir" ] && [ -n "${HOME-}" ]; then
      cjk_nvm_dir="$HOME/.nvm"
    fi
    if [ -n "$cjk_nvm_dir" ]; then
      for cjk_candidate in "$cjk_nvm_dir"/versions/node/*/bin/node; do
        cjk_probe_node "$cjk_candidate" && break
      done
    fi
  fi
fi

if [ -z "$cjk_node" ]; then
  printf '%s\n' 'CJK PDF Viewer: Node.js 22 or later was not found. Install a supported runtime or set CJK_PDF_NODE to its executable.' >&2
  exit 1
fi

# Runtime probes and diagnostics must never corrupt the MCP stream on stdout.
printf 'CJK PDF Viewer: starting with Node.js %s (%s)\n' "$cjk_node_major" "$cjk_node" >&2
exec "$cjk_node" "$cjk_server"
