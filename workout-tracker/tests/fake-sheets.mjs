// An in-memory stand-in for Google Sheets that runs Code.gs. It mimics the
// Sheets behaviours that bite: "8-10" auto-converting to a date, a leading '
// meaning "store as text", and number-looking strings becoming numbers.

import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const CODE = fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

export function makeEnv() {
  const sheets = new Map();
  const props = new Map();
  const mail = [];

  class Range {
    constructor(sh, row, col, nr, nc) {
      Object.assign(this, { sh, row, col, nr, nc });
    }
    getRow() {
      return this.row;
    }
    getValues() {
      const out = [];
      for (let r = 0; r < this.nr; r++) {
        const row = [];
        for (let c = 0; c < this.nc; c++) row.push(this.sh.get(this.row + r, this.col + c));
        out.push(row);
      }
      return out;
    }
    getValue() {
      return this.getValues()[0][0];
    }
    setValues(v) {
      v.forEach((row, r) => row.forEach((val, c) => this.sh.put(this.row + r, this.col + c, val)));
      return this;
    }
    setValue(v) {
      return this.setValues([[v]]);
    }
    setNumberFormat(f) {
      for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) this.sh.fmt.set(this.sh.k(this.row + r, this.col + c), f);
      return this;
    }
    setNumberFormats(m) {
      m.forEach((row, r) => row.forEach((f, c) => this.sh.fmt.set(this.sh.k(this.row + r, this.col + c), f)));
      return this;
    }
    setFontWeight() {
      return this;
    }
    setDataValidation() {
      return this;
    }
    createTextFinder(text) {
      const self = this;
      return {
        matchEntireCell() {
          return this;
        },
        findNext() {
          for (let r = self.row; r < self.row + self.nr; r++)
            for (let c = self.col; c < self.col + self.nc; c++)
              if (String(self.sh.get(r, c)) === text) return new Range(self.sh, r, c, 1, 1);
          return null;
        },
      };
    }
  }

  class Sheet {
    constructor(name) {
      this.name = name;
      this.cells = new Map();
      this.fmt = new Map();
      this.maxRows = 1000;
    }
    k(r, c) {
      return `${r}:${c}`;
    }
    get(r, c) {
      const v = this.cells.get(this.k(r, c));
      return v === undefined ? "" : v;
    }
    put(r, c, v) {
      if (typeof v === "string" && v.startsWith("'")) v = v.slice(1);
      else if (typeof v === "string" && /^[=+]/.test(v)) throw new Error(`formula written to ${this.name}: ${v}`);
      else if (typeof v === "string" && this.fmt.get(this.k(r, c)) !== "@") {
        const m = v.match(/^(\d{1,2})-(\d{1,2})$/);
        if (m) v = new Date(2026, Number(m[1]) - 1, Number(m[2]));
        else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
      }
      if (v === "" || v == null) this.cells.delete(this.k(r, c));
      else this.cells.set(this.k(r, c), v);
      if (r > this.maxRows) this.maxRows = r;
    }
    getName() {
      return this.name;
    }
    getLastRow() {
      let m = 0;
      for (const key of this.cells.keys()) m = Math.max(m, Number(key.split(":")[0]));
      return m;
    }
    getLastColumn() {
      let m = 0;
      for (const key of this.cells.keys()) m = Math.max(m, Number(key.split(":")[1]));
      return m;
    }
    getMaxRows() {
      return this.maxRows;
    }
    getRange(r, c, nr = 1, nc = 1) {
      return new Range(this, r, c, nr, nc);
    }
    setFrozenRows() {}
    deleteRow(row) {
      const shift = (map) => {
        const next = new Map();
        for (const [key, v] of map) {
          const [r, c] = key.split(":").map(Number);
          if (r === row) continue;
          next.set(this.k(r > row ? r - 1 : r, c), v);
        }
        return next;
      };
      this.cells = shift(this.cells);
      this.fmt = shift(this.fmt);
    }
  }

  const ss = {
    getId: () => "sheet-1",
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => {
      const s = new Sheet(n);
      sheets.set(n, s);
      return s;
    },
    getSheets: () => [...sheets.values()],
    deleteSheet: (s) => sheets.delete(s.name),
  };
  sheets.set("Sheet1", new Sheet("Sheet1"));

  const builder = () => ({
    requireValueInRange() {
      return this;
    },
    requireCheckbox() {
      return this;
    },
    setAllowInvalid() {
      return this;
    },
    build() {
      return {};
    },
  });

  const ctx = vm.createContext({
    SpreadsheetApp: { getActive: () => ss, openById: () => ss, newDataValidation: builder },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }),
      MimeType: { JSON: "application/json" },
    },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => "UTC" },
    MailApp: { sendEmail: (...a) => mail.push(a) },
    console,
  });
  vm.runInContext(CODE, ctx);
  return { ctx, sheets, mail };
}

export function rowsOf(sheet) {
  const width = sheet.getLastColumn();
  const head = sheet.getRange(1, 1, 1, width).getValues()[0];
  const out = [];
  for (let r = 2; r <= sheet.getLastRow(); r++) {
    const vals = sheet.getRange(r, 1, 1, width).getValues()[0];
    out.push(Object.fromEntries(head.map((h, i) => [h, vals[i]])));
  }
  return out;
}
