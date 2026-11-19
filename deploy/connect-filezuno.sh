#!/usr/bin/env bash
# Run from a pinned staging copy of camera3z/web-app on the existing VPS.
set -euo pipefail

qrmenu_checkout=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ $EUID -ne 0 || ! -t 0 ]]; then
  echo 'Chạy trực tiếp bằng root trong terminal VPS để nhập khóa ẩn.' >&2
  exit 1
fi
if [[ "$qrmenu_checkout" == '/opt/qrmenu' || ! -f /opt/qrmenu/.env.local || ! -x /opt/filezuno-web/.venv/bin/python ]]; then
  echo 'Cần checkout staging riêng, source /opt/qrmenu và Python của Filezuno hiện có.' >&2
  exit 1
fi
if [[ ! -r /root/.ssh/filezuno_deploy ]]; then
  echo 'Chưa tìm thấy deploy key Filezuno hiện có tại /root/.ssh/filezuno_deploy. Chưa thay đổi hệ thống.' >&2
  exit 1
fi

filezuno_auth_stage=$(mktemp -d /root/qrmenu-auth-setup.XXXXXX)
GIT_SSH_COMMAND='ssh -i /root/.ssh/filezuno_deploy -o IdentitiesOnly=yes' \
  git clone --quiet --branch r2-private-storage --single-branch \
  git@github.com:camera3z/filezuno-web.git "$filezuno_auth_stage/filezuno"
git -C "$filezuno_auth_stage/filezuno" checkout --quiet --detach 7f3f2bf69a9f4391e0f0c478a644f50e92d16846

/opt/filezuno-web/.venv/bin/python "$filezuno_auth_stage/filezuno/deploy/connect-webapp-auth.py" \
  --app-code qrmenu --app-name QRMenu --app-url https://menu.filezuno.net \
  --app-source /opt/qrmenu "$@"
python3 "$qrmenu_checkout/deploy/deploy-sso.py" --source /opt/qrmenu --install-node-if-missing
