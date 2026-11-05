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
