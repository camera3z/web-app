# QRMenu

Ứng dụng menu điện tử tiếng Việt cho quán ăn và cà phê. Quản lý món, giá, trạng thái phục vụ; menu trên điện thoại và mã QR riêng từng quán.

## Chạy nhanh

Node.js >=22.9:

```sh
npm ci
npm run dev
```

- **Chưa cấu hình Supabase:** chạy demo, dữ liệu lưu tại trình duyệt. QR demo không đồng bộ sang điện thoại khác.
- **Có cấu hình Supabase:** đăng nhập email/mật khẩu hoặc liên kết email, kích hoạt bản quyền, lưu quán và thực đơn online. Mỗi tài khoản có một quán và một đường dẫn QR cố định. Không dùng dữ liệu demo thay thế khi lỗi mạng.

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

`npm test` kiểm tra SQL thực thi trên PostgreSQL WASM (PGlite), gồm RLS, cô lập quán, key kích hoạt, hết hạn/thu hồi, dữ liệu không hợp lệ và xung đột phiên bản. Tắt test process isolation vì runtime WASM có thể kết thúc worker trước khi runner báo số bài kiểm tra trên một số phiên bản Node. Lệnh phải báo 29 bài kiểm tra trở lên, không chỉ báo tên file.

`test:browser` tự khởi động hai Vite server tại cổng 5186/5187, kiểm tra demo và online bằng API Supabase giả lập. Không dùng project hoặc tài khoản thật. Cần Chromium và quyền mở cổng local.

## Kiến trúc và phạm vi

- Frontend Vite + JavaScript, Supabase Auth + PostgreSQL RPC.
- Bảng `restaurants` chứa thông tin quán và tối đa 500 món trong JSONB; lưu nguyên menu theo phiên bản để tránh ghi đè từ nhiều thiết bị.
- RLS chỉ cho chủ quán đọc dữ liệu của mình. Trình duyệt không có quyền ghi trực tiếp bảng; RPC kiểm tra tài khoản, bản quyền và dữ liệu trên mọi lần ghi.
- Menu công khai đọc qua RPC theo slug ngẫu nhiên cố định, không lộ owner ID, email hoặc hash key. Menu ẩn khi không có bản quyền hiệu lực. Sau khi chỉnh sửa, khách tải lại menu để nhận dữ liệu mới; chưa có realtime.
- Mỗi key gắn với tài khoản kích hoạt đầu tiên; nhiều key có thể gia hạn quyền cho cùng tài khoản. CLI quản trị tạo/gia hạn/thu hồi key qua service role, không có quyền quản trị trong frontend.
- Ảnh minh họa lưu cục bộ; hỗ trợ URL ảnh HTTPS. Đã có chọn ảnh JPG/PNG/WebP (tối đa 5 MB), thu nhỏ và tải lên Supabase Storage; cần chạy `supabase/storage.sql`. Chưa có thanh toán tự động, trang admin cấp key, đặt món hoặc quản lý bàn.
- Dữ liệu demo không tự nhập sang tài khoản online, tránh đưa nhầm dữ liệu trình duyệt vào quán.

**Trạng thái:** đã triển khai mã và kiểm tra SQL + giao diện giả lập. Chưa kết nối Supabase thật, kiểm tra gửi email thực tế hay triển khai tên miền. Cần hoàn thành các bước trong hướng dẫn và kiểm tra trên hai tài khoản/thiết bị trước khi vận hành thương mại.

## Ảnh món ăn

Chạy `supabase/storage.sql` trong Supabase SQL Editor trước khi dùng upload. Chọn ảnh từ thiết bị trong form món: JPG/PNG/WebP, tối đa 5 MB; ảnh được chuyển WebP, cạnh dài tối đa 1600px. Ảnh chỉ tải lên khi Lưu món. Storage giới hạn MIME/size và kiểm tra tài khoản + bản quyền còn hiệu lực trên insert/delete. Mỗi chủ quán chỉ ghi trong thư mục UID của mình, không ghi đè ảnh cũ. Bucket `menu-images` công khai để khách xem menu; ảnh vẫn truy cập được bằng URL kể cả khi bản quyền hết hạn. Không lưu tài liệu riêng tư vào bucket này. Ảnh cũ/ảnh tải thành công nhưng lưu menu thất bại được giữ lại để không vô tình xóa ảnh đang sử dụng; chưa có dọn ảnh mồ côi tự động. Demo lưu ảnh trong localStorage, có thể báo lỗi khi hết dung lượng.

## Danh mục tùy chỉnh

Chủ quán nhập tên mới hoặc chọn gợi ý đã dùng trong ô Danh mục (1–80 ký tự). Danh mục lưu theo từng quán, được giữ kể cả khi xóa món cuối cùng. Không phân biệt chữ hoa/thường khi chọn lại tên trên giao diện. Menu khách chỉ hiện các danh mục có món; trang quản lý giữ cả các nhóm đã dùng. Bản nâng cấp cần chạy `supabase/categories.sql` trước khi cập nhật frontend; script giữ nguyên món và bản quyền, chuyển các nhóm hiện tại vào danh sách riêng của quán. Hệ thống hỗ trợ thực đơn quán ăn, nhà hàng và đồ uống; dữ liệu demo cà phê chỉ là ví dụ.

## Phiên đăng nhập

Quay lại tab với cùng tài khoản không khởi động lại giao diện hoặc xóa form đang nhập. Chỉ đổi tài khoản/đăng xuất mới tải lại không gian. Lần mở trang hoặc tải lại trang vẫn cần kết nối Supabase; yêu cầu tải dữ liệu quá 20 giây sẽ hiện thông báo và nút Thử lại. Chưa hỗ trợ lưu form nháp qua việc đóng tab hoặc tải lại trang.

## Đăng ký và mật khẩu

Trang Tài khoản & bản quyền có đăng ký email/mật khẩu, đăng nhập mật khẩu, quên mật khẩu và liên kết đăng nhập tùy chọn. Mật khẩu mới tối thiểu 8 ký tự, có nhập xác nhận. Supabase Auth xử lý mật khẩu; ứng dụng không tự lưu mật khẩu vào database/localStorage. Người đăng ký mới cần xác nhận email nếu Confirm email được bật. Đăng ký tài khoản không tự cấp bản quyền. Tài khoản cũ dùng magic link có thể dùng Quên mật khẩu hoặc Đặt / đổi mật khẩu khi đã đăng nhập; giữ nguyên UID và dữ liệu quán. Thêm URL chính xác `https://TEN-MIEN/?reset=1` vào Supabase Authentication → URL Configuration → Redirect URLs để liên kết khôi phục quay về form đặt mật khẩu. Email gửi thật và cập nhật mật khẩu trên project thật cần kiểm tra sau khi triển khai; kiểm thử tự động sử dụng API giả lập.

## Giới hạn đăng ký/email

Giao diện phân biệt `over_email_send_rate_limit` với HTTP 429 chung; không coi mọi lỗi 429 là lỗi người dùng. Gửi email thành công hoặc gặp giới hạn sẽ khóa gửi lại với đếm ngược; mặc định chờ cục bộ 60 giây nếu SDK không cung cấp thời gian chờ. Đây không phải thời điểm chắc chắn hạn mức server phục hồi. Các form đăng ký/khôi phục/liên kết email dùng chung khoảng chờ, đăng nhập mật khẩu không bị khóa bởi giới hạn email. Chỉ lưu deadline trong trình duyệt, không lưu email/mật khẩu. Cần cấu hình custom SMTP trong Supabase khi dùng với khách hàng thật; sửa frontend không gỡ hạn mức hoặc cấu hình nhà cung cấp email.
