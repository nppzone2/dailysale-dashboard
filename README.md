# Distributor Sales Performance

Dashboard theo dõi Target, Sale In, Sale Out và Allocation của các NPP vùng HCM Zone 2, kèm số YTD. Do RTC - Future Fit phụ trách. Dashboard tự cập nhật mỗi khi có file dữ liệu mới.

## Cập nhật dữ liệu

1. Mở thư mục **`input/`** trên trang GitHub của repo.
2. Bấm **Add file → Upload files** rồi kéo thả file. Có thể thả nhiều file cùng lúc.
3. Bấm **Commit changes** và đợi khoảng 2–3 phút. Tab **Actions** hiện dấu ✓ xanh là xong.

| Khi nào | File cần tải |
|---|---|
| Hằng ngày | `SO_Invoice`, `SaleOut_by_Seller`, `Dis_Sale_by_Date`, `Online_Order`. Tracking Allocation: Sale In thực tế = Dis Sale by Date đến D-1 (theo ngày order) + đơn Delivery; Pending = đơn khác Backorder và Delivery |
| Hằng tuần | `Allocation_Current_Month`: sheet **Allocation** có cột `Batch 1`, `Batch 2`… và sheet **Upload Date** ghi ngày chia từng batch |
| Đầu tháng | `Target_Current_Month` |
| Đầu tháng (tồn kho) | File **Stock** tồn đầu ngày 01 (cột `Alpha_Name`, `ShortCode`, `Sum of Stock`, `Sum of Daily Sales Out`). Dashboard tính Tồn hiện tại = Tồn đầu tháng + Sale In MTD − Sale Out MTD và số ngày tồn; ngưỡng đánh giá sửa ở `stock_days` trong `engine/config.json` |
| Khi đổi mã SKU | `Item_Master` |
| Khi đổi định mức xe hoặc Ontop | `Tham_chieu_xe` (tải từ tab **Tham chiếu xe** của tài khoản Admin): mỗi NPP một dòng: Khu vực, NPP, OnTop HL Group AA, OnTop HL Group BB, HL của 1 xe |
| Chốt tháng | `Target_Total_YYYYMM` của tháng vừa kết thúc **cùng lúc với** `Target_Current_Month` của tháng mới |

Dashboard nhận loại file theo **tiêu đề cột**, không theo tên file. Đổi tên file vẫn chạy được.

- **SO Invoice:** đây là số lũy kế từ đầu tháng. Mỗi lần tải lên, file mới thay toàn bộ Sale In của tháng.
- **SaleOut by Seller:** file không có cột ngày. Mỗi lần tải được lưu thành một mốc lũy kế, gắn với ngày Sale In mới nhất, để vẽ xu hướng Sale Out theo ngày.
- **Chốt tháng:** khi tháng đang chạy đã có file `Target_Total`, file Target hoặc Allocation tải sau đó được tự gán sang tháng kế tiếp. Tháng cũ chuyển vào **YTD as of M-1**.
- **Trường hợp đặc biệt:** cần ép tháng hoặc ép ngày chốt Sale Out thì sửa `engine/config.json`, chạy xong thì xoá lại về rỗng.

Sau khi xử lý, workflow **xoá file Excel gốc** khỏi `input/`. Toàn bộ dữ liệu được giữ trong kho mã hoá `input/vault/state.enc`, khoá dẫn xuất từ `ADMIN_PASSWORD`.

## Cảnh báo khi tải sai dữ liệu nguồn

Mỗi lần cập nhật, dashboard tự kiểm tra file tải lên:

| Tình huống | Xử lý |
|---|---|
| File không phải nguồn của dashboard (ví dụ file TMS, Fill Rate), file hỏng | Bỏ qua và xoá file đó, các file đúng vẫn được cập nhật |
| SO Invoice cũ hơn dữ liệu đang có trong cùng tháng | Bỏ qua để giữ số mới nhất |
| Sale In theo SO Invoice lệch quá 3% so với Dis Sale by Date | Vẫn cập nhật, báo để kiểm tra đơn vị Case/HL |
| SO Invoice xuất theo HL | Tự quy đổi sang Case |
| Xuất hiện mã NPP mới, SKU thiếu hệ số HL | Ghi chú để kiểm tra |

Khi có lỗi quan trọng, lượt chạy trong tab **Actions** hiện **dấu ✗ đỏ** và GitHub gửi email cho người upload. Chi tiết nằm ở mục **Summary** của lượt chạy. Admin cũng thấy khung cảnh báo ở đầu dashboard, bấm **Đã xem** để ẩn.

## Tạm khoá trang để bảo trì

1. Vào tab **Actions** → **Cập nhật dashboard** → **Run workflow**.
2. Ở ô **Chọn thao tác**, chọn **Bật bảo trì**. Có thể nhập thông báo, ví dụ "Đang cập nhật số liệu, dự kiến mở lại lúc 14:00".
3. Bấm **Run workflow** và đợi khoảng 1–2 phút.

Trong lúc bảo trì, NPP và ASM chỉ thấy trang thông báo, không mở được số liệu. Admin vẫn đăng nhập được qua liên kết **Đăng nhập quản trị** để kiểm tra. Các lần upload dữ liệu trong lúc bảo trì vẫn được xử lý bình thường nhưng chưa phát hành cho NPP và ASM.

Mở lại: làm tương tự và chọn **Tắt bảo trì**.

## Cài đặt lần đầu (làm một lần)

1. **Đặt mật khẩu** ở Settings → Secrets and variables → Actions → New repository secret:

   | Secret | Bắt buộc | Dùng cho |
   |---|---|---|
   | `ADMIN_PASSWORD` | Có | Tài khoản `ADMIN` (xem toàn vùng). Đây cũng là khoá của kho dữ liệu. |
   | `ASM_PASSWORD` | Có | Mật khẩu chung cho ASM |
   | `NPP_PASSWORD` | Có | Mật khẩu chung cho NPP |
   | `NPP_PASSWORDS` | Tuỳ chọn | Mật khẩu riêng từng NPP, JSON theo mã NPP hoặc DisCode: `{"P444":"...","10260129":"..."}` |
   | `ASM_PASSWORDS` | Tuỳ chọn | Mật khẩu riêng từng khu vực: `{"HCM3":"...","HCM5":"..."}` |

2. **Bật trang web** ở Settings → Pages → Build and deployment → Source: chọn **GitHub Actions**.
3. **Tải dữ liệu lần đầu** vào `input/`: Item Master, các file `Target_Total` từ T1 đến tháng gần nhất, Target Current Month, SO Invoice, SaleOut by Seller và Allocation.

Link trang hiện ở Settings → Pages, dạng `https://nppzone2.github.io/dailysale-dashboard/`.

**Đổi mật khẩu:** sửa secret, rồi vào tab Actions → Cập nhật dashboard → **Run workflow**. Lưu ý: đổi `ADMIN_PASSWORD` thì kho cũ không mở được nữa. Khi đó cần xoá `input/vault/state.enc` và tải lại toàn bộ file dữ liệu.

## Đăng nhập

| Tài khoản | Tên đăng nhập | Thấy gì |
|---|---|---|
| Admin | `ADMIN` | Toàn vùng, lọc theo khu vực và NPP |
| ASM | Mã khu vực: `HCM3`, `HCM4`, `HCM5`, `HCM11` | Khu vực của mình, chọn được từng NPP trong khu vực |
| NPP | DisCode, ví dụ `10260129` | Chỉ số của NPP đó |

DisCode lấy từ cột `Distributor_ID` (SO Invoice) và `Seller_ID` (SaleOut by Seller).

## Bảo mật

Mỗi tài khoản nhận một gói dữ liệu riêng: NPP chỉ có số của mình, ASM chỉ có số của khu vực mình. Mỗi gói được mã hoá AES-GCM, khoá dẫn xuất PBKDF2-SHA256 từ mật khẩu. Xem mã nguồn trang cũng không đọc được số liệu, và mật khẩu không nằm trong repo.

Khi dùng mật khẩu chung, một NPP biết DisCode của NPP khác thì mở được gói của NPP đó. Muốn tách hẳn, đặt `NPP_PASSWORDS`.

Nếu repo công khai, file Excel đã tải lên vẫn còn trong lịch sử commit dù đã bị xoá khỏi thư mục. Muốn kín hoàn toàn, chuyển repo sang **Private**. GitHub Pages cho repo Private cần gói GitHub Pro hoặc Team.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `input/` | Nơi tải file Excel; `input/vault/state.enc` là kho dữ liệu mã hoá |
| `engine/read_xlsx.py` | Đọc file Excel |
| `engine/parse.js` | Nhận loại file, chuẩn hoá và gộp dữ liệu |
| `engine/build.js` | Mở/lưu kho, cắt dữ liệu theo tài khoản, mã hoá, ghi `docs/index.html` |
| `engine/app.js`, `engine/style.css` | Giao diện dashboard |
| `.github/workflows/refresh.yml` | Workflow tự cập nhật và đăng lên GitHub Pages |
