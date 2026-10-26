/**
 * Office Script "Day so lieu len dashboard"
 *
 * Bấm Run (hoặc nút gắn trong sheet) để đọc mọi Excel Table trong file này và ghi thành
 * data.json trên GitHub. Vercel thấy thay đổi sẽ cập nhật https://ops-pqpoc.vercel.app sau 1–2 phút.
 *
 * Trước khi dùng: dán GitHub token (fine-grained, chỉ repo Dashboard-OPS, quyền Contents: Read and write)
 * vào GITHUB_TOKEN bên dưới rồi Save. Không chia sẻ script này cho người khác vì nó chứa token.
 */
const GITHUB_TOKEN = "DAN_TOKEN_VAO_DAY";
const REPO = "toiyeuvietnam2452001/Dashboard-OPS";
const FILE = "data.json";
const BRANCH = "main";

async function main(workbook: ExcelScript.Workbook): Promise<string> {
  if (GITHUB_TOKEN.indexOf("DAN_") === 0) {
    throw new Error("Chưa dán GitHub token vào dòng GITHUB_TOKEN ở đầu script.");
  }
  const json = buildJson(workbook);
  const url = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // GitHub needs the current file's sha to replace it.
  let sha = "";
  const current = await fetch(`${url}?ref=${BRANCH}`, { headers: headers });
  if (current.status === 200) {
    const info: GitHubFile = await current.json();
    sha = info.sha;
  } else if (current.status !== 404) {
    throw new Error(`Không đọc được data.json trên GitHub (mã ${current.status}). ${hint(current.status)}`);
  }

  const body: PutBody = { message: `Cập nhật số liệu dashboard ${new Date().toISOString()}`, content: base64Utf8(json), branch: BRANCH };
  if (sha) body.sha = sha;
  const result = await fetch(url, { method: "PUT", headers: headers, body: JSON.stringify(body) });
  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Không ghi được data.json lên GitHub (mã ${result.status}). ${hint(result.status)}`);
  }
  const done = `Đã đẩy số liệu lên GitHub. Dashboard https://ops-pqpoc.vercel.app cập nhật sau 1–2 phút.`;
  console.log(done);
  return done;
}

interface GitHubFile {
  sha: string;
}
interface PutBody {
  message: string;
  content: string;
  branch: string;
  sha?: string;
}

function hint(status: number): string {
  if (status === 401) return "Token sai hoặc đã hết hạn: tạo token mới và dán lại.";
  if (status === 403 || status === 404) return "Token chưa được cấp repo Dashboard-OPS hoặc thiếu quyền Contents: Read and write.";
  if (status === 409 || status === 422) return "Có người vừa cập nhật cùng lúc: bấm chạy lại.";
  return "Thử chạy lại sau ít phút.";
}

// ---- same export as "Xuat du lieu dashboard" ----------------------------------------------------
type Cell = string | number | boolean | null;
interface Row {
  [column: string]: Cell;
}
const DATE_COLUMNS = ["month", "period", "report_date", "issue_date", "expiry_date", "renewal_date",
  "plan_start", "plan_finish", "actual_start", "actual_finish"];

function buildJson(workbook: ExcelScript.Workbook): string {
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

function clean(column: string, v: string | number | boolean): Cell {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  if (typeof v === "number" && DATE_COLUMNS.indexOf(column) >= 0) {
    if (column === "period" && v < 3000) return String(v);
    const iso = new Date(Math.round((v - 25569) * 86400000)).toISOString();
    return column === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
  }
  return v;
}

// GitHub wants the file as base64 of its UTF-8 bytes (data has Vietnamese text).
function base64Utf8(s: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const n = (bytes[i] << 16) | ((has1 ? bytes[i + 1] : 0) << 8) | (has2 ? bytes[i + 2] : 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (has1 ? A[(n >> 6) & 63] : "=") + (has2 ? A[n & 63] : "=");
  }
  return out;
}
