# QRMenu

Ứng dụng menu điện tử tiếng Việt cho quán ăn và cà phê. Quản lý món, giá, trạng thái phục vụ; menu trên điện thoại và mã QR riêng từng quán.

## Chạy nhanh

Node.js >=22.9:

```sh
npm ci
npm run dev
```

- **Chưa cấu hình Supabase:** chạy demo, dữ liệu lưu tại trình duyệt. QR demo không đồng bộ sang điện thoại khác.
- **Có cấu hình Supabase:** đăng nhập email, kích hoạt bản quyền, lưu quán và thực đơn online. Mỗi tài khoản có một quán và một đường dẫn QR cố định. Không dùng dữ liệu demo thay thế khi lỗi mạng.

Hướng dẫn kết nối, cấp key và đưa lên tên miền: **[docs/setup.vi.md](docs/setup.vi.md)**.

## Kiểm tra

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Nếu đã có Chromium hệ thống:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

`npm test` kiểm tra SQL thực thi trên PostgreSQL WASM (PGlite), gồm RLS, cô lập quán, key kích hoạt, hết hạn/thu hồi, dữ liệu không hợp lệ và xung đột phiên bản. Tắt test process isolation vì runtime WASM có thể kết thúc worker trước khi runner báo số bài kiểm tra trên một số phiên bản Node. Lệnh phải báo 14 bài kiểm tra trở lên, không chỉ báo tên file.

`test:browser` tự khởi động hai Vite server tại cổng 5186/5187, kiểm tra demo và online bằng API Supabase giả lập. Không dùng project hoặc tài khoản thật. Cần Chromium và quyền mở cổng local.

## Kiến trúc và phạm vi

- Frontend Vite + JavaScript, Supabase Auth + PostgreSQL RPC.
- Bảng `restaurants` chứa thông tin quán và tối đa 500 món trong JSONB; lưu nguyên menu theo phiên bản để tránh ghi đè từ nhiều thiết bị.
- RLS chỉ cho chủ quán đọc dữ liệu của mình. Trình duyệt không có quyền ghi trực tiếp bảng; RPC kiểm tra tài khoản, bản quyền và dữ liệu trên mọi lần ghi.
- Menu công khai đọc qua RPC theo slug ngẫu nhiên cố định, không lộ owner ID, email hoặc hash key. Menu ẩn khi không có bản quyền hiệu lực. Sau khi chỉnh sửa, khách tải lại menu để nhận dữ liệu mới; chưa có realtime.
- Mỗi key gắn với tài khoản kích hoạt đầu tiên; nhiều key có thể gia hạn quyền cho cùng tài khoản. CLI quản trị tạo/gia hạn/thu hồi key qua service role, không có quyền quản trị trong frontend.
- Ảnh minh họa lưu cục bộ; hỗ trợ URL ảnh HTTPS. Chưa có upload ảnh, thanh toán tự động, trang admin cấp key, đặt món hoặc quản lý bàn.
- Dữ liệu demo không tự nhập sang tài khoản online, tránh đưa nhầm dữ liệu trình duyệt vào quán.

**Trạng thái:** đã triển khai mã và kiểm tra SQL + giao diện giả lập. Chưa kết nối Supabase thật, kiểm tra gửi email thực tế hay triển khai tên miền. Cần hoàn thành các bước trong hướng dẫn và kiểm tra trên hai tài khoản/thiết bị trước khi vận hành thương mại.
