/**
 * Office Script "Xuat du lieu dashboard"
 *
 * Đọc mọi Excel Table trong file OPS_Dashboard_Data.xlsx và trả về một chuỗi JSON
 * (mỗi bảng thành một danh sách dòng, khoá là tên cột). Power Automate gọi script này
 * bằng action "Run script" rồi đẩy kết quả lên GitHub thành file data.json.
 */
function main(workbook: ExcelScript.Workbook): string {
  const out: { [table: string]: Row[] | string } = {};
  for (const table of workbook.getTables()) {
    const values = table.getRange().getValues();
    const head = values[0].map((h) => String(h).trim());
    out[table.getName()] = values
      .slice(1)
      .filter((r) => r.some((v) => v !== "" && v !== null))
      .map((r) => {
        const row: Row = {};
        head.forEach((h, i) => (row[h] = clean(h, r[i])));
        return row;
      });
  }
  out["_updated_at"] = new Date().toISOString();
  return JSON.stringify(out);
}

type Cell = string | number | boolean | null;
interface Row {
  [column: string]: Cell;
}

// Cột chứa ngày/tháng: nếu Excel lỡ đổi thành số ngày (serial) thì đổi lại về chữ.
const DATE_COLUMNS = ["month", "period", "report_date", "issue_date", "expiry_date", "renewal_date",
  "plan_start", "plan_finish", "actual_start", "actual_finish"];

function clean(column: string, v: string | number | boolean): Cell {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  if (typeof v === "number" && DATE_COLUMNS.indexOf(column) >= 0) {
    if (column === "period" && v < 3000) return String(v); // chỉ có năm, ví dụ 2028
    const iso = new Date(Math.round((v - 25569) * 86400000)).toISOString();
    return column === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
  }
  return v;
}
