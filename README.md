# OPS Readiness Dashboard

Dashboard báo cáo phòng OPS, host trên Vercel. Số liệu nhập trong Excel trên SharePoint, Power Automate tự đẩy lên GitHub, Vercel tự cập nhật trang.

```
Excel trên SharePoint ──(Power Automate, theo lịch)──> data.json trên GitHub ──(Vercel tự deploy)──> Dashboard
```

| File | Vai trò |
|---|---|
| `index.html` | Trang dashboard. Mỗi lần mở trang đọc `data.json`; nếu không đọc được thì hiện số liệu dự phòng nhúng sẵn và báo đỏ ở cuối trang. |
| `data.json` | Số liệu dashboard. **Power Automate ghi đè file này**, không sửa tay. |
| `automation/OPS_Dashboard_Data.xlsx` | Mẫu file Excel nguồn: 18 bảng + sheet "Huong dan". Đưa lên SharePoint, phòng OPS nhập số tại đây. |
| `automation/xuat-du-lieu-dashboard.ts` | Office Script đọc các bảng Excel và xuất JSON. |

---

## Bước 1: Đưa file Excel lên SharePoint

1. Tải `automation/OPS_Dashboard_Data.xlsx` lên thư viện tài liệu của site OPS, ví dụ `Documents/Dashboard/OPS_Dashboard_Data.xlsx`.
2. Cấp quyền chỉnh sửa cho những người nhập số.
3. Quy tắc nhập liệu nằm trong sheet **Huong dan**. Quan trọng nhất: **không đổi tên bảng và tên cột**.

## Bước 2: Tạo Office Script

1. Mở file Excel trên trình duyệt (Excel for the web), chọn tab **Automate → New Script**.
2. Xoá nội dung mẫu, dán toàn bộ nội dung file `automation/xuat-du-lieu-dashboard.ts`.
3. Đổi tên script thành **Xuat du lieu dashboard** rồi **Save**.
4. Bấm **Run** thử: khung Output hiện ra một chuỗi JSON dài là đúng.

## Bước 3: Tạo GitHub token (để Power Automate được ghi file)

1. Vào <https://github.com/settings/personal-access-tokens/new> (fine-grained token).
2. **Token name**: `power-automate-ops-dashboard`. **Expiration**: chọn 1 năm và ghi lịch nhắc gia hạn.
3. **Repository access**: *Only select repositories* → `Dashboard-OPS`.
4. **Permissions → Repository permissions → Contents**: *Read and write*. Không cấp quyền nào khác.
5. **Generate token**, copy chuỗi `github_pat_…`. Chuỗi này chỉ hiện một lần; không gửi qua chat, email.

## Bước 4: Tạo luồng Power Automate

> Cần action **HTTP** (Premium). Nếu tài khoản không có Premium, xem mục "Không có Premium" ở cuối.

Vào <https://make.powerautomate.com>, chọn **Create → Scheduled cloud flow**, đặt tên `OPS dashboard – day so lieu`.

**4.1. Recurrence** (lịch chạy)
- Interval `1`, Frequency `Hour`. Mở *Show advanced options*: Time zone `(UTC+07:00) Bangkok, Hanoi, Jakarta`; *At these hours* chọn 7–19 nếu chỉ cần trong giờ hành chính.
- Mỗi lần chạy tạo một bản deploy Vercel. Gói Hobby cho tối đa 100 lần/ngày, nên chạy mỗi giờ là thoải mái.

**4.2. Excel Online (Business) → Run script**, đổi tên action thành `Doc Excel`
- Location: site SharePoint OPS. Document Library: `Documents`. File: `OPS_Dashboard_Data.xlsx`. Script: `Xuat du lieu dashboard`.

**4.3. HTTP**, đổi tên thành `Lay sha` (lấy mã phiên bản hiện tại của data.json)
- Method: `GET`
- URI: `https://api.github.com/repos/toiyeuvietnam2452001/Dashboard-OPS/contents/data.json?ref=main`
- Headers:
  | Key | Value |
  |---|---|
  | `Authorization` | `Bearer github_pat_…` (token ở bước 3) |
  | `Accept` | `application/vnd.github+json` |
  | `User-Agent` | `ops-dashboard-flow` |
- Settings (dấu ⋯ → Settings): bật **Secure inputs** và **Secure outputs** để token không hiện trong lịch sử chạy.

**4.4. HTTP**, đổi tên thành `Day len GitHub`
- Method: `PUT`
- URI: `https://api.github.com/repos/toiyeuvietnam2452001/Dashboard-OPS/contents/data.json`
- Headers: giống bước 4.3.
- Body (dán nguyên văn):
  ```json
  {
    "message": "Cập nhật số liệu dashboard @{convertFromUtc(utcNow(), 'SE Asia Standard Time', 'dd/MM/yyyy HH:mm')}",
    "content": "@{base64(outputs('Doc_Excel')?['body/result'])}",
    "sha": "@{body('Lay_sha')?['sha']}",
    "branch": "main"
  }
  ```
  Tên trong biểu thức dùng dấu gạch dưới thay khoảng trắng: `Doc_Excel`, `Lay_sha`. Nếu đặt tên action khác thì sửa lại cho khớp.
- Settings: bật **Secure inputs**.

**4.5. Save → Test → Manually → Run flow.** Thành công khi:
- Cả 4 bước có dấu tích xanh, bước cuối trả về mã `200`.
- Repo GitHub có commit mới "Cập nhật số liệu dashboard …".
- Sau 1–2 phút, dòng cuối dashboard hiện "Số liệu cập nhật lúc …" với giờ vừa chạy.

## Lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| `Lay sha` báo 401 | Token sai hoặc hết hạn. Tạo token mới (bước 3), thay ở cả hai action HTTP. |
| `Lay sha` báo 404 | Sai tên repo trong URI, hoặc token chưa chọn repo `Dashboard-OPS`. |
| `Day len GitHub` báo 409/422 | Sai `sha`. Kiểm tra biểu thức `body('Lay_sha')?['sha']` khớp tên action. |
| `Doc Excel` lỗi | Script chưa lưu, hoặc file đang bị khoá. Mở file trên web và chạy script thử. |
| Dashboard báo đỏ "Không đọc được data.json" | `data.json` bị hỏng (thường do sửa tay). Chạy lại luồng để ghi đè. |
| Một phần dashboard trống | Đổi tên bảng/cột trong Excel. Đối chiếu sheet "Huong dan" và đặt lại đúng tên. |

## Không có Premium

Action HTTP là Premium. Nếu tài khoản Microsoft 365 không có, hỏi IT xin license Power Automate Premium cho một tài khoản chạy luồng, hoặc cho luồng chạy dưới tài khoản đã có Premium. Các bước khác giữ nguyên.
