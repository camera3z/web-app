# Đăng nhập QR Menu bằng Filezuno

Áp dụng cho ứng dụng **đang chạy** tại `https://menu.filezuno.net`, repo `camera3z/web-app`, nhánh `main`. Source VPS `/opt/qrmenu`, bản web `/var/www/qrmenu`. Dùng chính Supabase project trong `/opt/qrmenu/.env.local`.

Không tạo project mới, không chạy lại schema SQL, không đổi UID/chủ sở hữu quán hoặc chuyển bản quyền. Luồng email/mật khẩu, liên kết email, khôi phục mật khẩu và key QR Menu đang có được giữ nguyên. Việc bán gói/key QR Menu qua Filezuno là bước riêng sau tích hợp tài khoản.

## 1. Cấu hình Supabase của QR Menu

Trong **project QR Menu hiện có**:

- Authentication → URL Configuration: Site URL `https://menu.filezuno.net`; Redirect URLs cho phép `https://menu.filezuno.net/`. Giữ các redirect hợp lệ đang dùng cho email/khôi phục mật khẩu.
- Authentication → Sign In / Providers: bật **Allow manual linking**. Cần cho thao tác liên kết chủ động của tài khoản cũ, nhất là khi email Filezuno khác email QR Menu.

Provider `custom:filezuno` được tạo qua công cụ dùng chung của repo `camera3z/filezuno-web`:

```sh
/opt/filezuno-web/.venv/bin/python /DUONG-DAN-STAGING/filezuno/deploy/connect-webapp-auth.py \
  --app-code qrmenu --app-name QRMenu \
  --app-url https://menu.filezuno.net --app-source /opt/qrmenu
```

Công cụ đọc cấu hình máy chủ và URL Supabase tại VPS; hỏi **secret/service_role của project QR Menu bằng nhập ẩn**. Không đưa khóa vào chat hoặc biến `VITE_`. Nó sao lưu SQLite Filezuno trong thư mục riêng của root, dùng lại sản phẩm QR Menu theo URL/tên nếu có, hoặc tạo một bản nháp nội bộ; tạo kết nối OAuth nhưng không mở bán gói. Nếu nhiều sản phẩm/quản trị viên trùng khớp, cần chỉ định `--app-id ID` hoặc `--owner-email EMAIL` theo thông báo. Không ghi đè kết nối Rentbook hay provider đã gắn client khác.

Thông số provider khi kiểm tra lại:

| Trường | Giá trị |
|---|---|
| Provider | `custom:filezuno`, OAuth2 |
| Client ID | `qrmenu` |
| Authorization | `https://filezuno.net/oauth/authorize` |
| Token | `https://filezuno.net/oauth/token` |
| Userinfo | `https://filezuno.net/oauth/userinfo` |
| Scopes | `email`, `profile` |
| PKCE | Bật |
| Callback | `https://PROJECT-QR-MENU.supabase.co/auth/v1/callback` |

Secret được dẫn xuất từ kết nối ứng dụng trên Filezuno và chỉ cài vào Supabase Auth; không nằm trong bản build. Generic OAuth2 không cần Issuer/JWKS.

## 2. Phát hành giao diện từ checkout staging

Dùng checkout mới đã ghim commit, không reset hoặc ghi đè source đang chạy:

```sh
## Cấu hình provider và phát hành trong một lệnh:
bash /DUONG-DAN-STAGING/qrmenu/deploy/connect-filezuno.sh

## Hoặc chỉ phát hành frontend sau khi provider đã cấu hình:
python3 /DUONG-DAN-STAGING/qrmenu/deploy/deploy-sso.py --source /opt/qrmenu --install-node-if-missing
```

Lệnh tổng hợp tải bản helper Filezuno đã ghim commit bằng deploy key hiện có `/root/.ssh/filezuno_deploy`, hỏi khóa Supabase qua nhập ẩn, rồi phát hành frontend. Nếu bước trước lỗi thì dừng trước bước sau. Có thể truyền thêm `--app-id ID` hoặc `--owner-email EMAIL` khi công cụ yêu cầu xác định sản phẩm/chủ sở hữu. Nó không cập nhật source đang chạy của Filezuno; máy chủ Filezuno cần đã có hỗ trợ nhiều Web App. Helper sẽ kiểm tra client OAuth qua HTTPS và dừng nếu phiên bản Filezuno hiện tại chưa chấp nhận mã mới.

Script xác minh Nginx đang phục vụ đúng `/var/www/qrmenu`, đọc **chỉ URL và public key** từ `.env.local` hiện có; build riêng với `VITE_FILEZUNO_SSO=1`. Nó sao lưu bản web, phát hành tài nguyên trước/index sau, giữ asset cũ cho tab đang mở và xác minh index/JS/CSS qua HTTPS Nginx. Nếu kiểm tra phát hành lỗi thì khôi phục tệp cũ. Source `/opt/qrmenu`, env, Nginx và dữ liệu Supabase giữ nguyên.

Script tìm Node.js 22.9+ cùng npm trong PATH, `.nvm` của QR Menu, Rentbook, các app cùng thư mục `/opt`, root và `NVM_DIR`. Lệnh tổng hợp bật `--install-node-if-missing`: nếu không có runtime phù hợp, tải Node 24 chính thức, kiểm tra SHA-256 rồi đặt riêng trong `/root/.cache/filezuno-node`. Chỉ PATH của tiến trình build dùng runtime đó; không đổi Node mặc định hoặc các dịch vụ đang chạy.

Nếu provider đã báo thành công nhưng phát hành dừng vì thiếu Node, chỉ chạy lại **deploy-sso.py** từ checkout mới với tùy chọn trên. Không cần cấu hình provider hoặc nhập lại khóa Supabase.

Nếu tự build bằng cách khác, phải đặt `VITE_FILEZUNO_SSO=1` khi build, sau khi provider đã được cấu hình. Mặc định `.env.example` để tắt tính năng trước khi kết nối.

## 3. Chủ quán đã có dữ liệu

1. Mở QR Menu, đăng nhập **bằng email QR Menu đang sở hữu quán**.
2. Vào **Tài khoản & bản quyền → Liên kết Filezuno**.
3. Đăng nhập đúng tài khoản Filezuno và chấp thuận kết nối.
4. Xác nhận quán, món, QR và hạn bản quyền vẫn đúng. Sau đó đăng xuất và thử **Đăng nhập bằng Filezuno**: phải trở lại đúng quán.

Liên kết diễn ra qua Supabase Auth trên UID cũ, không chuyển hàng dữ liệu theo email. Nếu identity đã gắn với UID khác, dừng và kiểm tra hai tài khoản; không xóa tài khoản hoặc chuyển `owner_id` bằng SQL để chữa lỗi.

Người dùng mới chọn **Đăng nhập bằng Filezuno**. Supabase có thể tự liên kết theo email đã xác minh phù hợp; khi email khác hoặc chưa chắc tài khoản, dùng bước liên kết chủ động ở trên để tránh tạo không gian trống khác tài khoản cũ.

## 4. Kiểm tra kỹ thuật

```sh
npm test
python3 tests/deploy-sso.py
VITE_FILEZUNO_SSO=1 npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
CHROMIUM_PATH=/usr/bin/chromium npm run test:sso
```

OAuth sử dụng client PKCE riêng, verifier/session tạm trong `sessionStorage` của tab. Kết quả được kiểm tra UID rồi cài vào session QR Menu thông thường; không đổi flow của các liên kết email cũ. Không gọi signOut trên client tạm vì sẽ thu hồi cả phiên vừa cài. Mã callback và dữ liệu tạm được dọn sau khi xử lý; lỗi/hủy không ghi dữ liệu quán hoặc đổi chủ sở hữu.

Các bài browser dùng SDK thật với API giả lập, không xác nhận thay cho một lần đăng nhập/liên kết trên Supabase và VPS thật. Codex hiện chưa có quyền truy cập project QR Menu qua connector hoặc SSH VPS.
