// 🔄 Google Sheets Sync (Bi-Directional) - بدون مكتبات خارجية
// إعدادات الاتصال
const SHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbz0sqe3_5rSiSVUZBAXpTYRK_snSyVvCQGYCHRNy4BIWmI54GqP6_qgNR2-HYLLC6cOcA/exec";

// تخزين آخر حالة مزامنة
let lastSheetData = { inventory: [], loans: [], returns: [] };
let autoSyncInterval = null;

window.sheetSync = {
  // إرسال عملية إلى Google Sheets
  async send(type, data) {
    try {
      console.log("📤 إرسال إلى Google Sheets:", type, data);
      const res = await fetch(SHEET_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data, timestamp: new Date().toLocaleString("ar-SA") })
      });
      const result = await res.json();
      console.log("✅ تم الحفظ في Google Sheets:", result);
      return result;
    } catch (e) {
      console.error("❌ فشل إرسال البيانات:", e);
    }
  },

  // استيراد البيانات من Google Sheets
  async pullFromSheet() {
    try {
      const res = await fetch(SHEET_WEBAPP_URL + "?action=getAll");
      const data = await res.json();

      if (!data || typeof data !== "object") {
        console.warn("⚠️ لم يتم الحصول على بيانات صالحة من Google Sheets");
        return;
      }

      console.log("📥 بيانات Google Sheets المستلمة:", data);

      // مزامنة البيانات الجديدة مع القاعدة فقط إذا تغيّرت
      for (const key of ["inventory", "loans", "returns"]) {
        const newData = data[key] || [];
        const oldData = JSON.stringify(lastSheetData[key]);
        const newStr = JSON.stringify(newData);

        if (newStr !== oldData) {
          lastSheetData[key] = newData;
          if (window.cloud && typeof window.cloud.replaceCollection === "function") {
            console.log(`🔄 تحديث ${key} في القاعدة`);
            window.cloud.replaceCollection(key, newData);
          } else if (window.state) {
            console.log(`💾 تحديث ${key} في localStorage`);
            window.state[key] = newData;
            localStorage.setItem(key, JSON.stringify(newData));
          }
        }
      }

    } catch (e) {
      console.error("❌ فشل استيراد البيانات من Google Sheets:", e);
    }
  },

  // مزامنة تلقائية
  startAutoSync(intervalSec = 15) {
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    console.log(`🔁 بدء المزامنة التلقائية كل ${intervalSec} ثانية`);
    this.pullFromSheet(); // أول مرة
    autoSyncInterval = setInterval(() => this.pullFromSheet(), intervalSec * 1000);
  },

  stopAutoSync() {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      console.log("⏸️ تم إيقاف المزامنة التلقائية");
    }
  }
};

// ✅ دمج المزامنة مع التطبيق
window.gsheetHooks = {
  inventory: {
    onAdd: (item) => window.sheetSync.send("inventory_add", item),
    onUpdate: (id, item) => window.sheetSync.send("inventory_update", { id, ...item }),
    onDelete: (id) => window.sheetSync.send("inventory_delete", { id })
  },
  loans: {
    onAdd: (loan) => window.sheetSync.send("loan_add", loan),
    onUpdate: (id, loan) => window.sheetSync.send("loan_update", { id, ...loan }),
    onDelete: (id) => window.sheetSync.send("loan_delete", { id })
  },
  returns: {
    onAdd: (ret) => window.sheetSync.send("return_add", ret),
    onUpdate: (id, ret) => window.sheetSync.send("return_update", { id, ...ret }),
    onDelete: (id) => window.sheetSync.send("return_delete", { id })
  }
};

// 🔧 تهيئة كائن cloud الوهمي إذا لم يكن موجودًا
if (!window.cloud) {
  window.cloud = {
    replaceCollection: (key, data) => {
      console.log(`🗂️ تحديث محلي لـ ${key} (${data.length} صفوف)`);
      window.state[key] = data;
      localStorage.setItem(key, JSON.stringify(data));
    }
  };
}

console.log("✅ Google Sheets Sync Initialized (Two-Way)");
