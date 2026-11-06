# Thiết lập QRMenu online

## 1. Tạo project Supabase

1. Đăng nhập https://supabase.com và chọn New project.
2. Chọn tổ chức, đặt tên project và mật khẩu database mạnh. Lưu mật khẩu ở nơi riêng; QRMenu không cần mật khẩu database trong frontend.
3. Chọn vùng gần khách hàng, tạo project và chờ khởi tạo hoàn tất.
4. Trong phần Connect / Project Settings / API, lấy Project URL và **publishable key** (hoặc legacy anon key). Tên vị trí có thể thay đổi theo giao diện Supabase.

URL và public key dùng trong frontend. **Không dùng secret/service_role key tại bất kỳ biến VITE_ nào.**

## 2. Khởi tạo database

1. Mở SQL Editor của Supabase, tạo query mới.
2. Sao chép toàn bộ `supabase/schema.sql`, nhấn Run bằng tài khoản quản trị project.
3. Kiểm tra có bảng `licenses`, `restaurants` và ba hàm `activate_license`, `save_restaurant`, `get_public_menu`.

Để bật chọn ảnh từ thiết bị, chạy thêm toàn bộ `supabase/storage.sql` trong query riêng. Script tạo bucket công khai `menu-images`, giới hạn ảnh 5 MB và phân quyền theo chủ quán/bản quyền.

Script có thể chạy lại khi nâng cấp từ bản QRMenu trước. Không chỉnh quyền bảng thành public và không tắt RLS. Nếu gặp lỗi, lưu nội dung lỗi để xử lý trước khi dùng ứng dụng.

## 3. Cấu hình ứng dụng

Trong thư mục dự án:

```sh
cp .env.example .env.local
```

Điền vào `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Dùng thông tin project vừa tạo, không dùng nguyên các giá trị minh họa trên. File `.env.local` đã được Git bỏ qua.

```sh
npm ci
npm run dev
```

Sau mỗi lần đổi biến môi trường, khởi động lại server. Với bản đã deploy, cần build/deploy lại vì Vite đóng gói biến VITE_ lúc build.

## 4. Bật đăng nhập email

Trong Supabase Authentication:

1. Bật Email provider.
2. Đặt Site URL là địa chỉ ứng dụng hiện sử dụng.
3. Thêm chính xác URL gốc của ứng dụng (gồm scheme và port nếu chạy local) vào Redirect URLs. Ví dụ nếu dùng Vite mặc định trên máy cá nhân, dùng `http://localhost:5173`.
4. Với tên miền thật, cập nhật Site URL và thêm URL HTTPS tương ứng vào Redirect URLs.
5. Để gửi email cho khách hàng thực tế, cấu hình SMTP theo hướng dẫn Supabase; dịch vụ email thử nghiệm mặc định có giới hạn người nhận/tần suất.

Trong QRMenu, mở **Tài khoản & bản quyền**, nhập email và nhấn Gửi liên kết đăng nhập. Mở liên kết trên trình duyệt bạn muốn quản lý. Nếu quét email bằng phần mềm bảo mật làm liên kết hết hiệu lực, gửi lại và kiểm tra cấu hình email theo tài liệu Supabase.

## 5. Cấp key cho khách

Chỉ chủ phần mềm thực hiện trên máy quản trị đáng tin cậy. Khách hàng không cần quyền service role.

```sh
cp .env.admin.example .env.admin
```

Điền Project URL và **legacy service_role key** hoặc secret key server có quyền service role vào `.env.admin`. File này đã bị Git bỏ qua; không gửi cho khách, không đưa vào hosting frontend hoặc nội dung chat. Chỉ `.env.local` dùng public key được cấu hình cho frontend.

Tạo key có hạn 365 ngày từ thời điểm cấp:

```sh
npm run license -- create 365
```

Lệnh trả về ID bản quyền, hạn sử dụng và key kích hoạt. Database chỉ lưu hash; hãy lưu key gốc và giao riêng cho khách. Key là dữ liệu nhạy cảm, không chụp hoặc công khai đầu ra lệnh.

Thu hồi bằng ID của bản quyền:

```sh
npm run license -- revoke LICENSE_UUID
```

Gia hạn 365 ngày **tính từ thời điểm chạy lệnh**, đồng thời bỏ trạng thái thu hồi:

```sh
npm run license -- renew LICENSE_UUID 365
```

Thay `LICENSE_UUID` bằng ID thực tế. Lệnh renew không cộng dồn ngày còn lại. Nếu tài khoản có nhiều key, còn bất kỳ key chưa thu hồi và chưa hết hạn thì quyền sử dụng vẫn hoạt động; cần thu hồi từng key để khóa hoàn toàn tài khoản đó.

Không khôi phục key bị mất từ hash; cấp key mới và thu hồi key cũ nếu cần. Công cụ không có chức năng liệt kê người dùng hoặc xuất thông tin bí mật.

## 6. Khách kích hoạt và tạo quán

1. Đăng nhập email.
2. Mở Tài khoản & bản quyền, nhập key và nhấn Kích hoạt bản quyền.
3. Mở Thông tin quán, nhập tên, lời chào, địa chỉ rồi nhấn Lưu thông tin. Lần lưu này tạo quán với thực đơn trống và đường dẫn riêng.
4. Mở Thực đơn để thêm món, chọn ảnh từ thiết bị hoặc nhập URL HTTPS, giá và trạng thái phục vụ.
5. Mở Mã QR để xem đường dẫn và tải PNG.

Key gắn với tài khoản đầu tiên kích hoạt. Key hết hạn hoặc bị thu hồi không thể kích hoạt; cập nhật thực đơn cũng bị từ chối phía database. Khi không còn key hiệu lực, menu công khai ẩn nhưng dữ liệu vẫn được giữ để có thể gia hạn.

Dữ liệu demo không tự nhập lên tài khoản. Một tài khoản hiện quản lý một quán; chưa có chia sẻ quyền cho nhân viên hoặc quản lý nhiều chi nhánh.

## 7. Đưa lên tên miền

Có thể dùng dịch vụ hosting frontend hỗ trợ Vite như Vercel hoặc Netlify:

- Build command: `npm run build`
- Output directory: `dist`
- Node.js: 22.9 trở lên
- Biến môi trường build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Không cấu hình service role trên hosting frontend. Không tải `.env.admin` lên máy chủ public.

Tên miền phải chạy HTTPS. Cập nhật Site URL và Redirect URLs trong Supabase theo bước 4. Ứng dụng dùng đường dẫn dạng `https://TEN-MIEN/?menu=quan-...`, không cần rewrite route động.

Chỉ tải và in QR **sau khi mở ứng dụng trên tên miền chính thức**. QR tạo ở localhost không dùng được trên điện thoại khác. Slug của quán giữ nguyên khi sửa tên/món; chuyển tên miền làm QR cũ trỏ về tên miền cũ, cần duy trì redirect hoặc in lại QR.

## 8. Kiểm tra trước khi dùng thật

1. Đăng nhập tài khoản A, kích hoạt key và tạo quán, thêm một món.
2. Mở liên kết menu trong cửa sổ ẩn danh và trên điện thoại dùng mạng khác: phải thấy cùng quán/món/giá mà không đăng nhập.
3. Sửa giá trên máy quản lý; tải lại menu điện thoại và xác nhận giá mới.
4. Đổi món sang Tạm hết; khách vẫn thấy món kèm nhãn tạm hết.
5. Đăng nhập tài khoản B: không được thấy hoặc sửa quán của A. B không thể dùng key đã gắn với A.
6. Mở hai tab quản lý, lưu ở tab thứ nhất rồi lưu ở tab thứ hai: tab thứ hai phải báo dữ liệu đã thay đổi, không ghi đè. Tải lại để lấy bản mới.
7. Thu hồi key thử nghiệm: thao tác ghi phải bị từ chối và tải lại menu công khai phải báo chưa sẵn sàng. Nếu có nhiều key trên cùng tài khoản, thu hồi tất cả key còn hiệu lực để kiểm tra.
8. Gia hạn lại key, kiểm tra quán xuất hiện và cập nhật được.
9. Ngắt mạng: ứng dụng phải báo lỗi, không chuyển sang dữ liệu demo và không báo lưu thành công.

Các bài kiểm tra tự động dùng PostgreSQL WASM và API giả lập; không thay thế các bước kiểm tra dự án Supabase thật này.

## 9. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Vẫn thấy bản demo | Kiểm tra đủ hai biến VITE_, khởi động lại hoặc build/deploy lại. |
| Báo thiếu bảng/hàm | Chạy toàn bộ schema.sql trên đúng project. |
| Không nhận email | Kiểm tra spam, Email provider, SMTP, giới hạn gửi và danh sách redirect. |
| Key đã được sử dụng | Đăng nhập đúng tài khoản đã kích hoạt; tài khoản khác không thể nhận lại key. |
| Không lưu được dù đã đăng nhập | Kiểm tra key còn hiệu lực, kết nối mạng, schema và thông báo lỗi cụ thể. |
| Xung đột dữ liệu | Tải lại để lấy phiên bản mới rồi nhập lại thay đổi; không tự động ghi đè. |
| Khách không thấy menu | Kiểm tra đúng tên miền, slug, quán đã được lưu, và còn bản quyền hiệu lực. |

## Nâng cấp danh mục tự nhập

Với dự án đã cài đặt, chạy `supabase/categories.sql` trong SQL Editor trước khi cập nhật frontend. Script chỉ thêm danh sách danh mục riêng cho từng quán và cập nhật hàm lưu thực đơn; không xóa món, quán hoặc bản quyền. Bản cài mới dùng schema.sql đã có sẵn tính năng này. Ô Danh mục cho phép gõ mới hoặc chọn gợi ý đã lưu; danh mục mới được lưu khi Lưu món thành công.

## Đăng ký, đăng nhập email/mật khẩu

Sau khi cập nhật frontend, trang tài khoản mặc định có email + mật khẩu và nút Đăng ký. Bật Email provider và cho phép đăng ký tài khoản trong Supabase Authentication. Giữ xác nhận email cho khách mới. Site URL là `https://menu.filezuno.net`; trong Redirect URLs thêm `https://menu.filezuno.net/?reset=1`, giữ các URL gốc hiện có. Không cần SQL mới cho tính năng này.

Khách đăng ký bằng email và mật khẩu mới (ít nhất 8 ký tự), xác nhận email rồi đăng nhập. Sau đó kích hoạt key để tạo/sửa menu. Khách đã đăng nhập bằng liên kết email trước đây không cần tạo tài khoản lại: dùng cùng email tại Quên mật khẩu, mở liên kết mới nhất rồi đặt mật khẩu; hoặc vào Tài khoản & bản quyền → Đặt / đổi mật khẩu khi đã đăng nhập. Dữ liệu quán và bản quyền giữ nguyên.

Supabase xử lý lưu trữ mật khẩu; không thêm bảng passwords, không dùng service_role ở frontend. Dịch vụ gửi email có thể yêu cầu SMTP và có giới hạn gửi. Đăng nhập bằng mật khẩu giảm nhu cầu email mỗi lần sử dụng nhưng vẫn cần email cho xác nhận tài khoản/khôi phục mật khẩu. Cần kiểm tra một tài khoản mới, email xác nhận và quên mật khẩu thật sau khi deploy; kiểm thử mock không xác minh nhà cung cấp email.

## Xử lý 429 và gửi email thực tế

Trong Authentication Logs, kiểm tra error code: `over_email_send_rate_limit` là hạn mức gửi email; `over_request_rate_limit` là giới hạn yêu cầu, không tự kết luận do SMTP. Không liên tục bấm Đăng ký. Ứng dụng có khoảng chờ mặc định 60 giây khi thiếu thông tin Retry-After; thời gian này chỉ ngăn gửi dồn, không hứa hạn mức phục hồi sau 60 giây.

Để dùng custom SMTP: chọn nhà cung cấp email giao dịch, xác minh tên miền gửi bằng các bản ghi DNS mà nhà cung cấp cấp, rồi vào Supabase Authentication → Email / SMTP Settings để bật custom SMTP. Nhập Sender email đã xác minh, Sender name QRMenu, Host, Port, Username và Password theo tài liệu nhà cung cấp. Nhập mật khẩu SMTP/API key trực tiếp trong Supabase, không đưa vào VITE_, GitHub hoặc chat. Lưu cấu hình, kiểm tra hạn mức Authentication → Rate Limits phù hợp gói dịch vụ và năng lực SMTP; không tắt bảo vệ tần suất để chữa lỗi.

Kiểm tra một email đăng ký và một email khôi phục thật sau khi xác minh sender và lưu cấu hình. Nếu chưa có nhà cung cấp SMTP thì đây là bước chưa hoàn tất; không coi việc cập nhật frontend là đã sửa xong dịch vụ email.

## Bật gọi món từ menu khách

1. Supabase SQL Editor: chạy toàn bộ `supabase/orders.sql` trong query riêng, sau khi đã cài schema.sql. Script có thể chạy lại, không xóa dữ liệu.
2. Cập nhật mã từ GitHub, build rồi triển khai assets/index.html mới lên VPS theo quy trình có sao lưu. Không cần đổi QR hoặc số bàn.
3. Mở menu khách bằng điện thoại, thêm món/số lượng và ghi chú; nhấn Gửi đơn một lần. Ghi lại mã đơn.
4. Mở Đơn gọi món ở tài khoản chủ quán; làm mới hoặc chờ tối đa khoảng 10 giây khi tab đang mở. Đối chiếu mã/tổng/món; xử lý Nhận đơn → Bắt đầu chuẩn bị → Đã phục vụ.
5. Kiểm tra Lịch sử và thử đơn Từ chối. Tổng món đang chờ phải giảm sau khi hoàn tất/từ chối.
6. Khách chưa xác định được kết quả do mất mạng: dùng nút Thử lại yêu cầu cũ, không xóa dữ liệu trình duyệt để gửi một đơn mới. Server trả lại cùng mã nếu đã nhận.

Một QR chung, không lưu số bàn hoặc yêu cầu khách cung cấp số điện thoại. Quán tổ chức giao món bằng mã đơn và tự thu tiền. Lưu ý hàng chờ tự làm mới khi mở trang, chưa có push/âm báo; tối đa 200 đơn được hiển thị mỗi danh sách.

## In đơn khi chuẩn bị

Nếu đã chạy payments.sql, chạy toàn bộ supabase/order-workflow.sql trước khi cập nhật frontend. Script gỡ ràng buộc thanh toán bắt buộc, giữ nguyên đơn/dữ liệu đã có. Không chạy lại payments.sql sau bước này.

Sau cập nhật, chọn Nhận đơn, rồi Bắt đầu chuẩn bị. Lúc này In đơn xuất hiện cạnh Đã phục vụ. In đơn mở phiếu gọi món trong cửa sổ mới và hộp thoại in; chọn máy in đã cài trên máy quán, kiểm tra khổ giấy/xem trước. Khi xong nhấn Đã phục vụ để chuyển vào Lịch sử. Không bắt buộc in hoặc xác nhận thu tiền. Đơn đã phục vụ có thể in lại trong Lịch sử.

## QR chung đặt từ xa, QR bàn tùy chọn

1. Với dự án đã chạy tables.sql cũ, chạy supabase/optional-tables.sql trong SQL Editor để mở lại đơn từ xa và thêm hàm tạo riêng từng bàn. Script giữ nguyên đơn và bàn đã có. Cài mới chạy tables.sql mới sau các script đơn/luồng phục vụ.
2. Cập nhật frontend trên VPS. QR chung cũ tiếp tục cho chọn món, số lượng và gửi đơn không số bàn; không phải in lại mã chung.
3. Nếu cần QR bàn: Mã QR → Thêm QR theo bàn (tùy chọn) → nhập 3 → Mở / Tạo QR bàn. Chỉ Bàn 03 được tạo nếu chưa có; không tạo hàng loạt. Có thể nhập số bàn đã có để mở lại đúng mã cũ.
4. Chọn Sao chép link hoặc In QR bàn này. Nhãn có số bàn lớn. Khách dùng QR này thấy Bàn 03, đơn và phiếu in ghi Bàn 03.
5. Kiểm tra cả hai: đơn QR chung hiển thị Không số bàn · Từ xa, đơn QR bàn hiển thị số bàn. Dùng bộ lọc để tách hai nhóm.

QR bàn có thể được chia sẻ/chụp ảnh; đây không phải xác minh khách đang có mặt tại quán. Không có cơ chế mở/đóng bàn theo phiên trong bản này.

## Bật thống kê doanh thu

1. Chạy toàn bộ `supabase/revenue.sql` trong query mới sau khi đã có orders.sql. Script có thể chạy lại và không xóa đơn.
2. Cập nhật frontend/build lên VPS, tải lại trang bằng Ctrl+Shift+R.
3. Mở Thống kê. Chọn Ngày/Tháng/Năm, chọn kỳ rồi Xem thống kê. Giờ báo cáo là Việt Nam UTC+7, bao gồm toàn bộ đơn trong database của quán.
4. Đối chiếu một đơn chuyển sang Đã phục vụ: giá trị sẽ vào kỳ hoàn tất (không phải ngày khách đặt). Tải lại báo cáo để thấy số mới. Tiền mặt đã ghi nhận chỉ phản ánh các bản ghi thanh toán thực có, không tự đánh dấu đơn đã phục vụ là đã thu tiền.

Dữ liệu cũ trước khi cài đặt chưa có completed_at, dùng updated_at gần đúng. Vì luồng hiện tại không bắt buộc thu tiền, không dùng giá trị đơn hoàn tất làm số thực thu chính xác. Chưa có báo cáo chi phí/lợi nhuận hoặc khấu trừ hoàn tiền.

## Chuông vàng báo đơn mới

Chỉ cập nhật frontend, không cần SQL. Đăng nhập chủ quán, mở Thống kê hoặc Thực đơn; dùng điện thoại gửi một đơn test. Trong khoảng 10 giây khi tab quản lý đang mở, chuông phải vàng kèm số đơn mới. Nhấn chuông mở danh sách lọc Mới, nhận đơn để số đếm giảm. Nếu hết đơn mới chuông trở lại bình thường. Đóng trình duyệt sẽ không có thông báo đẩy; tab ẩn kiểm tra lại khi được mở.

## Danh sách bàn đã lưu

Mở Mã QR → QR theo bàn (tùy chọn) để tải danh sách các bàn đã tạo. Nhập 1 rồi Thêm bàn, tiếp tục nhập 2 rồi Thêm bàn: cả hai được giữ trong danh sách. Mỗi bàn có Sao chép link / In QR riêng. Danh sách có tìm kiếm và chia trang 12 bàn, không tự tạo 50 bàn. Bản sửa hiển thị danh sách chỉ cần cập nhật frontend, không chạy SQL mới.

## Xóa bàn

Chạy supabase/delete-tables.sql trong SQL Editor, sau đó cập nhật VPS. Trong Mã QR → QR theo bàn, nhấn Xóa bàn ở đúng bàn rồi xác nhận. Bàn bị bỏ khỏi danh sách, mã QR ngừng nhận đơn mới; đơn cũ vẫn giữ nguyên. Nếu chỉ bấm nhầm, chọn Hủy trong hộp xác nhận. Nếu đã xác nhận và muốn dùng lại số bàn, thêm lại số đó rồi in QR mới; không dùng lại nhãn cũ. Thao tác không xóa đơn hoặc ảnh hưởng QR chung.
