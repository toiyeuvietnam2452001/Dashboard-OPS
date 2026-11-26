# OPS Readiness Dashboard: hướng dẫn cho phiên làm việc mới

Tài liệu bàn giao giữa các phiên Claude. Đọc hết trước khi làm. Người dùng là phòng Vận hành Khai thác (OPS) PQPOC, viết tiếng Việt và xưng "anh"; Claude trả lời tiếng Việt.

- Dashboard: https://ops-pqpoc.vercel.app
- Repo: `toiyeuvietnam2452001/Dashboard-OPS`, nhánh `main`. Repo **public**: không đổi visibility, không đưa thông tin cá nhân (tên, email) vào repo.
- Notion: trang **OPS Dashboard Data** (`405522d7e51f809a879ece6c52b97ad4`), mỗi hạng mục là một bảng; ID trong `tools/notion-sources.json`.

## 1. Quy tắc làm việc của người dùng (bắt buộc)

1. **Không tự suy diễn rồi kết luận.** Số liệu và trạng thái lấy nguyên văn từ nguồn. Gặp chỗ chưa rõ hoặc nguồn mâu thuẫn thì **hỏi lại**; hiển thị cả hai số kèm ghi chú, không tự chọn.
2. **Chính xác tuyệt đối** khi nhập số từ ảnh, Excel hoặc PDF. Nhập xong phải đọc lại để đối chiếu: so Notion, rồi so `data.json` sau khi đồng bộ.
3. **Mọi chữ trên dashboard viết bằng văn viết, chuyên nghiệp**, không dùng văn nói. Người dùng từng dừng một lần viết lại hàng loạt: muốn viết lại nội dung của người khác thì **đề xuất trước, chờ duyệt**.
4. **Không bao giờ yêu cầu dán token/secret vào chat.**
5. **Xoá dữ liệu Notion phải được xác nhận rõ ràng.**
6. Không gắn nhãn sai: "OOSS Contractors" **không phải** Outsource. Outsource là một phần của Offshore, nhưng Offshore không nhất thiết là Outsource. Không tự thêm nhãn như "PQ staff".
7. **Không đánh số hạng mục và mục con trên giao diện** (đã bỏ "1. Manpower", "2.1", "6.1"…). Chỉ giữ cột STT/No. trong bảng và số bước/giai đoạn để đối chiếu với file gốc.
8. Bên IT lưu ý: AI là dịch vụ bên thứ ba nên cần chủ dữ liệu đồng ý. Tôn trọng điều này khi đề xuất tích hợp mới.

## 2. Kiến trúc và luồng dữ liệu

```
Claude nhập số vào Notion ──> api/data.js trên Vercel đọc Notion trực tiếp (NOTION_TOKEN, đệm 60 s)
Claude sửa code tools/page.html ──> build ra index.html ──> push GitHub ──> Vercel tự deploy
GitHub Action sync-notion.yml (15 phút/lần, có thể chạy tay) ──> data.json (dự phòng) + history/<ngày>[/<giờphút>].json
```

- `tools/page.html`: **nguồn duy nhất** của giao diện (CSS, HTML, JS). Không sửa thẳng `index.html`.
- Build: `python3 tools/build.py tools tools/data .`, ghi ra `index.html`. Sau khi sửa `page.html` luôn build lại và commit cả hai file.
- `tools/data/<id>.json`: dữ liệu dự phòng nhúng vào trang, phải khớp Notion.
- `tools/i18n-vi.json`: `ui` = chữ cố định trong HTML (khoá là câu tiếng Anh nguyên văn, đã trim); `data` = nhãn lấy từ Notion. Chữ sinh từ JS dùng `L('EN', 'VI')`, nhãn dữ liệu dùng `D(text)`.
- `lib/notion.js`: đọc Notion, gồm bảng `SORTS` (thứ tự dòng theo bảng) và `cell()` (date chỉ lấy ngày bắt đầu).
- Các script là IIFE riêng. `window.dash` cung cấp `dash.data(id)` (trả `{status, data}`), `dash.calc(...)`, `dash.onData`, `H.*` (định dạng ngày/số), `L`, `D`.

**Thêm một bảng Notion mới phải sửa 5 chỗ:**
1. `tools/notion-sources.json`: `database` (id không gạch) và `data_source` (uuid). File thụt lề 1 khoảng trắng.
2. `lib/notion.js`, bảng `SORTS`.
3. `tools/build.py`, danh sách `IDS`.
4. `tools/data/<id>.json`: dữ liệu dự phòng.
5. Tab Thay đổi trong `page.html`: danh sách bảng (tên EN/VI, tab), `KEYS` và `rowLabel`.

**Kiểm tra sau khi sửa:**
- Chạy thử: copy `index.html` và `data.json` vào một thư mục, chạy `python3 -m http.server`, chụp bằng Playwright (sáng, tối, 390px, `?lang=vi`). Chặn `**/api/**` để dùng `data.json`. Kiểm tra trang không tràn ngang (`scrollWidth - innerWidth = 0`) và không có lỗi trang.
- Đồng bộ Notion bằng tay: `gh api -X POST repos/toiyeuvietnam2452001/Dashboard-OPS/actions/workflows/sync-notion.yml/dispatches -f ref=main`. Đợi run xong, `git pull`, rồi so `data.json` với `tools/data/*.json`. (gh GraphQL bị chặn, chỉ dùng `gh api` REST.)
- Trạng thái deploy: `gh api repos/<repo>/commits/<sha>/statuses --jq '.[0].state'`.
- Commit kết thúc bằng 2 dòng attribution do hệ thống cung cấp. Trước khi push chạy `git pull --rebase`, vì Action đẩy commit "Sync report data from Notion" thường xuyên.

## 3. Giao diện hiện tại (đến 26/11/2026)

Tab, mỗi tab có màu riêng qua `[data-page]`: Overview, Manpower, Training, Applications, Certificates & licenses, Procedures, Logistics & services, Contracts, Coordination, ORR checklist, Preservation & commissioning. Tab Changes chỉ hiện khi chủ sở hữu đăng nhập.

**Thiết kế chung:**
- Mọi trang theo phong cách kính (glass) giống Overview: section có lớp `.gl`, nền chuyển màu nhiều vệt sáng theo màu tab; thẻ và ô KPI trong mờ.
- Thẻ có dải tiêu đề `.ops-bcard` + `h2.ops-banner`; đầu trang là hàng ô KPI `.ops-tiles`, dựng bằng `kpiTile()`.
- Chuyển tab: ô màu trượt `.ops-tab-ind`; trang trượt vào theo hướng di chuyển, các khối hiện lần lượt.
- Số chạy (count-up): Overview dùng `ovCountUp`; các trang khác dùng `pageCountUp`, chạy khi khối cuộn vào màn hình, thanh và vòng tròn lớn dần, ngày tháng giữ nguyên, khi in thì hiện ngay giá trị cuối.
- Logo và favicon nhúng base64 trong `build.py`.

**Nội dung từng tab (tóm tắt):**
- **Overview**: 2 khối lớn (ORR, Manpower), thẻ 10 hạng mục có RAG, mục Cần chú ý, mục Mốc tiến độ.
- **Manpower** (`manpower`, `manpower_groups`, `staffing`):
  - Nguồn chính: Excel "Mob Plan and Actual OPS 11Nov2026", sheet Ramp Up Chart_02.
  - Ô Outsource (Offshore) **tạm lấy từ file Presentation** (9/38), dùng bảng `staffing`.
- **Training**: ma trận HSE, Đào tạo bắt buộc (6 vòng tròn), lịch đào tạo vendor (dòng thời gian), CBTA theo CPP/WHP, danh mục module, bảng CBTA theo team, dòng cập nhật CBTA (workstreams, item CBTA).
- **Applications** (`workstreams` area Applications, `cmms`, `edms_*`):
  - Thẻ cho PDMS, AIMS, OSCC, HRIS, EAM/SAP, CMMS (OA), OMS, EDMS Portal.
  - Khối "Triển khai EDMS Portal": tiến độ giai đoạn, việc chờ PQPOC phê duyệt, hoạt động trong tuần, lịch dự án kèm dòng thời gian.
- **Certificates & licenses** (`permits`, 54 giấy phép, 8 team): ô KPI, lọc theo team, tìm kiếm. Tên team bỏ tiền tố số khi hiển thị.
- **Procedures** (`procedures`): HSE và General operation.
- **Logistics & services**: thẻ dịch vụ, tiến độ đấu thầu (`tender_schedule`).
- **Contracts** (`contract_packages`, `pr_pipeline`, `packages_no_pr`): thanh bước theo trạng thái, danh sách gói, biểu đồ ROS.
- **Coordination**: Coordination procedure, Production profile.
- **ORR checklist** (`orr_curve`, `orr_teams`, `orr_team_plan`, `orr_departments`, `orr_risks`, `orr_elements`, `orr_groups`).
- **Preservation & commissioning** (`precom_plan`, `startup_sequence`, workstreams area Commissioning).

## 4. Dữ liệu đã nhập và quyết định đã chốt

- **ORR**: từ 5 ảnh chụp ORR Checklist (của OPS và các phòng ban). Toàn checklist có 698 hạng mục, đạt 65,6%; OPS teams tháng 10/2026 đạt 71,3%, kế hoạch 66,7%.
- **Manpower**: Excel 11Nov2026 là nguồn chính (người dùng chốt). Đã đối chiếu với Excel 14Sep2026 và file Presentation.
- **Contracts**: từ 3 ảnh chụp (Overview 30 gói). PR = Purchase Requisition. Các bước: 1 CSP Preparation, 2 CSP Approval, 3 Bidding, 4 Evaluation, 5 TCEAR Approval, 6 Contract Signing. TCEAR thường hiểu là Technical & Commercial Evaluation and Award Recommendation, **chưa được xác nhận**; dashboard giữ nguyên chữ "TCEAR".
- **Applications**:
  - OSCC: "ITB issued 06 Nov 26".
  - HRIS: "Functional configuration completed. NGS is finalising the reporting module."
  - Các trạng thái PDMS, EAM/SAP, OMS đã được viết lại bằng tiếng Anh văn viết.
- **EDMS Portal**: báo cáo tuần EDMS-WR-TT-PQPOC-008, kỳ 09–14/11/2026, nhà thầu True Technology, Contract Addendum No. 01 to Contract No. 3100000176.
  - Tiến độ tổng 67,90%; go-live theo kế hoạch 11/12/2026.
  - Solution Design và Test Plan đang chờ PQPOC phê duyệt.
  - Có 3 bảng Notion: `edms_reports` (mỗi báo cáo một dòng), `edms_schedule` (Appendix 1, trường `seq` giữ thứ tự dòng), `edms_activities` (Section I và II).
  - **Báo cáo tuần sau:** thêm dòng mới vào cả 3 bảng với `report` = số tài liệu mới. Dashboard tự hiển thị báo cáo có `period_to` mới nhất.
- **CBTA**: dòng cập nhật ghi "Wellhead 98,5%, CPP 84,5%, completion expected by end of December 2026"; bảng CBTA tính ra WHP 92,5%, CPP 80,6%. Hiện hiển thị cả hai, chờ người dùng chọn số chính thức.
- **Mandatory HSE (offshore)**: tổng 700/1.385 khóa.

## 5. Việc đang chờ người dùng trả lời (không tự quyết)

- Đưa 4 việc EDMS đã qua hạn kế hoạch vào mục "Cần chú ý" trên Overview?
- Số CBTA chính thức: cập nhật 98,5/84,5 hay tính theo module?
- Manpower: Offshore tháng 10 là 47 (gõ tay trong file) hay 62 (tính theo công thức)? Onshore 32 hay 33? Outsource 9 hay 16? Số "thực tế" của các tháng tương lai?
- ORR: bảng tổng nào là chính thức (hai bảng đang lệch nhau)? Các dòng Offshore và Production OPS chưa có số? Phạm vi bộ lọc ORR Checklist; nội dung đầy đủ dòng 631?
- Q'TY của gói ITB là 2 hay 3? Ý nghĩa các màu trong Excel? Tên "EnI" hay "Enl"?
- Dịch vụ y tế (Medical services) trong Logistics: có dùng gói Offshore Medical Services không?
- Viết lại sang văn viết các trạng thái còn văn nói ở Logistics (Helicopter, Vessel inspection, MGO, Crew change, Catering) và Coordination: **đề xuất trước, chờ duyệt**.
- Giữ hay hoàn tác các bản viết lại của HRIS, PDMS, EAM/SAP, OMS?
- Ngưỡng RAG và ghi chú các mốc (MC, RFSU còn TBC).
- Danh mục Lab cho Onshore/Offshore trong mẫu quy trình.
- Bị chặn: tự đồng bộ SharePoint và Power BI.

## 6. Sản phẩm ngoài dashboard đã làm

Các file sau nằm trong scratchpad của phiên cũ và **có thể đã mất**; cần lại thì tạo lại:
- Mẫu Excel quy trình: `General_Operation_Procedures_Template.xlsx` và `Procedures_Preservation_Operation_Template.xlsx`, có thêm lựa chọn ở cột "Level of Document".
- Email gửi các leader nhờ tích cột "Operation Procedure" (danh sách thả xuống) trong file ORR Checklist của phòng. File Excel đó nằm trên máy người dùng, không có đường dẫn chung.
