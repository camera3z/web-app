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

`npm test` kiểm tra SQL thực thi trên PostgreSQL WASM (PGlite), gồm RLS, cô lập quán, key kích hoạt, hết hạn/thu hồi, dữ liệu không hợp lệ và xung đột phiên bản. Tắt test process isolation vì runtime WASM có thể kết thúc worker trước khi runner báo số bài kiểm tra trên một số phiên bản Node. Lệnh phải báo 40 bài kiểm tra trở lên, không chỉ báo tên file.

`test:browser` tự khởi động hai Vite server tại cổng 5186/5187, kiểm tra demo và online bằng API Supabase giả lập. Không dùng project hoặc tài khoản thật. Cần Chromium và quyền mở cổng local.

## Kiến trúc và phạm vi

- Frontend Vite + JavaScript, Supabase Auth + PostgreSQL RPC.
- Bảng `restaurants` chứa thông tin quán và tối đa 500 món trong JSONB; lưu nguyên menu theo phiên bản để tránh ghi đè từ nhiều thiết bị.
- RLS chỉ cho chủ quán đọc dữ liệu của mình. Trình duyệt không có quyền ghi trực tiếp bảng; RPC kiểm tra tài khoản, bản quyền và dữ liệu trên mọi lần ghi.
- Menu công khai đọc qua RPC theo slug ngẫu nhiên cố định, không lộ owner ID, email hoặc hash key. Menu ẩn khi không có bản quyền hiệu lực. Sau khi chỉnh sửa, khách tải lại menu để nhận dữ liệu mới; chưa có realtime.
- Mỗi key gắn với tài khoản kích hoạt đầu tiên; nhiều key có thể gia hạn quyền cho cùng tài khoản. CLI quản trị tạo/gia hạn/thu hồi key qua service role, không có quyền quản trị trong frontend.
- Ảnh minh họa lưu cục bộ; hỗ trợ URL ảnh HTTPS. Đã có chọn ảnh JPG/PNG/WebP (tối đa 5 MB), thu nhỏ và tải lên Supabase Storage; cần chạy `supabase/storage.sql`. Chưa có thanh toán tự động, trang admin cấp key hoặc quản lý bàn.
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

## Gọi món bằng QR chung

Chạy thêm `supabase/orders.sql` sau schema.sql rồi cập nhật frontend. Menu khách có bộ chọn SL: − 0 + ngay trên từng món, đồng bộ hai chiều với giỏ bên dưới. Tăng từ 0 để chọn món, giảm về 0 để bỏ món, tối đa 99/món; có ghi chú và nút Gửi đơn. Chọn số lượng chỉ cập nhật giỏ, không tự gửi đơn. Không cần tài khoản khách hoặc số bàn; một QR chung cho quán. Quán đối chiếu mã đơn với khách và tự giao món/thanh toán ngoài ứng dụng.

Trang Đơn gọi món có hàng chờ cũ nhất trước và lịch sử mới nhất trước; tối đa 200 đơn mỗi danh sách. Tổng hợp món tính trong danh sách đang chờ (Mới/Đã nhận/Đang chuẩn bị), không phải thống kê toàn bộ lịch sử. Tự tải lại mỗi 10 giây khi trang đang mở và tab hiển thị; không có thông báo khi đóng trang hoặc push notification.

Giá/tổng/thời gian lấy từ server, lưu snapshot tên/giá/số lượng; giá đổi hoặc món hết sẽ yêu cầu kiểm tra lại menu. Dùng request UUID để gửi lại cùng đơn an toàn khi mất mạng; giữ yêu cầu chưa rõ kết quả trong localStorage và khóa chỉnh giỏ đến khi thử lại. Các lỗi server rõ ràng cho sửa giỏ. Receipt lưu mã đơn gần nhất trên trình duyệt; chưa có trang theo dõi trạng thái trực tiếp dành cho khách. Không phải xác nhận quán đã nhận/phục vụ hay thanh toán thành công.

RLS chỉ chủ quán đọc đơn, cập nhật trạng thái qua RPC kiểm tra chủ sở hữu + license + trạng thái hiện tại. RPC công khai cho phép tạo đơn, không đọc danh sách khách/quán khác. Giới hạn mỗi client UUID 5 đơn/phút/quán, 50 dòng và 500 phần/đơn; UUID trình duyệt không phải định danh chống bot đáng tin cậy. Nếu triển khai rộng cần bổ sung chống spam ở gateway/CAPTCHA; không có xác minh danh tính khách trong bản này. Đơn cũ vẫn giữ để quán tra cứu khi license hết hạn; tạo/cập nhật trạng thái yêu cầu license hiệu lực.

Kiểm thử SQL dùng PostgreSQL WASM; kiểm thử trình duyệt dùng API giả lập gồm mất phản hồi sau khi server tạo đơn rồi gửi lại. Cần kiểm tra một đơn thực tế trên điện thoại và trang quản lý sau khi chạy migration/deploy.

Giỏ chưa gửi chỉ giữ trong lần mở trang hiện tại: mở lại hoặc tải lại menu bắt đầu số lượng 0, không tự chọn từ bản nháp cũ. Chuyển danh mục trong cùng trang vẫn giữ lựa chọn. Nút Xóa giỏ bỏ toàn bộ lựa chọn và ghi chú. Riêng yêu cầu đã gửi nhưng chưa xác định kết quả vẫn được khôi phục/khóa chỉnh để gửi lại an toàn, và mã đơn đã gửi gần nhất vẫn được giữ.

Trang chủ mặc định là bảng điều hành đơn hàng trực tiếp, không phải trang giới thiệu hoặc tab thực đơn. Có bốn ô số liệu (đang chờ, mới, đã nhận, đang chuẩn bị), bảng đơn gọn với thời gian tạo/cập nhật, món, ghi chú, tổng số phần, tổng tiền, trạng thái và thao tác. Có tìm theo mã/món/ghi chú, lọc theo trạng thái, lịch sử và tổng món cần chuẩn bị theo bộ lọc. Mục Đơn gọi món dùng cùng bảng đầy đủ; mục Thực đơn tách riêng. Desktop dùng bảng, điện thoại xếp thành từng dòng thông tin. Số liệu dựa trên tối đa 200 đơn đang chờ; lịch sử tối đa 200 đơn hoàn tất mới nhất. Không phải báo cáo doanh thu toàn bộ.

## Thu tiền mặt và in phiếu

Chạy `supabase/payments.sql` sau orders.sql trước khi cập nhật frontend. Đơn cũ mặc định chưa thanh toán; hệ thống không suy đoán đã thu tiền. Mỗi đơn có trạng thái thanh toán độc lập với trạng thái phục vụ, lưu phương thức cash, thời gian thu và tiền khách đưa. Nút Thu tiền mặt mở form tính tiền thừa, chỉ xác nhận sau khi đã nhận tiền. RPC khóa đơn và trả lại kết quả cũ nếu gửi lặp, không thu hai lần. Không cho hoàn tất phục vụ khi chưa thanh toán và không cho từ chối đơn đã thu tiền. Chưa có hoàn tiền/hủy thanh toán hoặc nhiều lần thanh toán.

In tạm tính trước khi thu tiền; In phiếu sau khi thu tiền. Cửa sổ phiếu có mã đơn, cửa hàng/địa chỉ, món/số lượng/đơn giá/thành tiền, tổng, ghi chú, trạng thái thanh toán, tiền khách đưa/thừa. Trình duyệt mở hộp thoại in; máy in phải được cài trên máy của quán. Bố cục dạng phiếu rộng 72 mm, dùng giấy 80 mm hoặc in trên A4 theo cài đặt máy in. Không hỗ trợ in im lặng hoặc kết nối trực tiếp máy in Bluetooth/USB từ website. Kiểm thử xác minh nội dung cửa sổ phiếu, không xác minh máy in vật lý.
