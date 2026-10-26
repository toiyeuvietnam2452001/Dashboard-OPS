# OPS Readiness Dashboard

Dashboard báo cáo phòng OPS, có hai mặt hiển thị, cùng chạy từ một file Excel trên SharePoint:

```
                          ┌──> Các sheet dashboard trong chính file Excel (tính lại ngay khi sửa số, xem bằng tài khoản công ty)
Excel trên SharePoint ────┤
                          └──(Power Automate, theo lịch)──> data.json trên GitHub ──(Vercel tự deploy)──> https://ops-pqpoc.vercel.app
```

| File | Vai trò |
|---|---|
| `index.html` | Trang dashboard web. Mỗi lần mở trang đọc `data.json`; nếu không đọc được thì hiện số liệu dự phòng nhúng sẵn và báo đỏ ở cuối trang. |
| `data.json` | Số liệu dashboard web. **Power Automate ghi đè file này**, không sửa tay. |
| `automation/OPS_Dashboard_Data.xlsx` | File Excel nguồn. 6 sheet dashboard ở đầu (Overview, Manpower & Training, ORR, Procedures, Contracts & Permits, Commissioning), sheet "Huong dan", rồi 18 bảng số liệu. Đưa lên SharePoint, phòng OPS nhập số tại các bảng số liệu. |
| `automation/day-so-lieu-len-dashboard.ts` | Office Script: bấm là đẩy số liệu từ Excel lên GitHub, trang Vercel tự cập nhật (không cần Power Automate). |
| `automation/xuat-du-lieu-dashboard.ts` | Office Script đọc các bảng Excel và xuất JSON cho dashboard web. Chỉ đọc Excel Table, nên bỏ qua các sheet dashboard. |
| `tools/` | Mã dựng lại `index.html`, `data.json` và file Excel (xem cuối trang). |

## Dashboard trong Excel

- Các sheet dashboard chỉ chứa công thức và biểu đồ trỏ vào các bảng số liệu: sửa số ở bảng là dashboard đổi ngay, không cần Power Automate.
- Không gõ đè lên các sheet dashboard. Muốn khoá lại: chuột phải tên sheet → **Protect Sheet**.
- Biểu đồ nhân sự (60 tháng 2024–2028), ORR theo tháng, CBTA và ORR theo team vẽ theo số dòng hiện có. Cập nhật bằng cách điền số vào dòng sẵn có; nếu thêm dòng mới vào các bảng này, cần kéo rộng vùng dữ liệu của biểu đồ (chọn biểu đồ → **Select Data**).
- Bảng "PRs in progress by stage" dùng 6 tên bước cố định (`1 CSP Preparation` … `6 Contract Signing`); tên bước trong bảng "PR dang xu ly" phải trùng.

---

## Cập nhật trang Vercel: nút bấm trong Excel (không cần Premium)

Script `automation/day-so-lieu-len-dashboard.ts` đọc các bảng số liệu và ghi thẳng `data.json` lên GitHub; Vercel cập nhật trang sau 1–2 phút.

1. Tạo GitHub token như **Bước 3** bên dưới.
2. Mở file Excel trên web → **Automate → New Script** → xoá nội dung mẫu, dán toàn bộ file `day-so-lieu-len-dashboard.ts`.
3. Thay `DAN_TOKEN_VAO_DAY` ở dòng `const GITHUB_TOKEN = …` bằng token (giữ dấu ngoặc kép). Đặt tên script `Day so lieu len dashboard` → **Save script**.
4. Bấm **Run**. Lần đầu Excel có thể hỏi cho phép kết nối `api.github.com` → **Allow**. Output báo "Đã đẩy số liệu lên GitHub…" là xong.
5. (Tuỳ chọn) Trong khung script, bấm **⋯ → Add in workbook** để gắn nút bấm vào sheet Overview.

Mỗi lần nhập số xong, bấm nút này. Script chứa token: **không chia sẻ script** cho người khác; ai cần đẩy số thì tự tạo script với token của mình, hoặc nhờ người giữ token bấm.

Muốn tự động theo lịch thay vì bấm tay: làm các bước Power Automate bên dưới (cần Premium).

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

## Dựng lại từ mã nguồn (`tools/`)

Cần Python 3 và `openpyxl`. `tools/data/*.json` là số liệu gốc của báo cáo 21/10/2026.

```bash
python3 tools/build.py tools tools/data .                                   # index.html + data.json
python3 tools/excel.py tools/data /tmp/base.xlsx                            # 18 bảng số liệu + Huong dan
python3 tools/excel_dash.py /tmp/base.xlsx automation/OPS_Dashboard_Data.xlsx  # thêm 6 sheet dashboard
```
