// ===== إعداد رابط Google Apps Script Web App =====
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbz0sqe3_5rSiSVUZBAXpTYRK_snSyVvCQGYCHRNy4BIWmI54GqP6_qgNR2-HYLLC6cOcA/exec";

// ===== دالة إرسال آمنة بدون خطأ CORS =====
async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      mode: "cors", // يسمح بـ CORS
      headers: {
        "Content-Type": "application/json",
      },
    });
    return await response.json();
  } catch (err) {
    console.warn("⚠️ فشل الاتصال المباشر بسبب CORS، سيتم استخدام الخطة B:", err.message);

    // 🧩 الخطة B — عبر proxy من Google Apps Script نفسه
    try {
      const proxyUrl = `${SHEETS_URL}?proxyMode=true&t=${Date.now()}`;
      const resp = await fetch(proxyUrl, {
        method: "POST",
        body: options.body || null,
      });
      return await resp.json();
    } catch (e2) {
      console.error("❌ كلا الطريقتين فشلتا:", e2);
      return null;
    }
  }
}

// ===== إرسال بيانات إلى Google Sheets =====
async function postToSheet(payload) {
  if (!SHEETS_URL) return console.warn("❌ لم يتم تحديد الرابط");

  console.log("📤 إرسال البيانات:", payload);
  const result = await safeFetch(SHEETS_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result && result.success) {
    console.log("✅ تم الحفظ:", result.message || "تم بنجاح");
  } else {
    console.warn("⚠️ فشل في الحفظ:", result?.error || "غير معروف");
  }
}

// ===== استرجاع كل البيانات =====
async function syncFromSheet() {
  const result = await safeFetch(SHEETS_URL, {
    method: "POST",
    body: JSON.stringify({ type: "sync_read" }),
  });

  if (result && result.success) {
    console.log("✅ تم جلب البيانات من Sheets");
    return result.data;
  } else {
    console.warn("⚠️ فشل في قراءة البيانات:", result?.error);
    return null;
  }
}

// ===== فحص عدد الصفوف =====
async function getSheetRowCount() {
  const result = await safeFetch(SHEETS_URL, {
    method: "POST",
    body: JSON.stringify({ type: "get_row_count" }),
  });

  return result?.rowCount || 0;
}

// ===== دمج البيانات الجديدة مع Firebase =====
async function mergeNewSheetData() {
  if (!window.cloud || !window.state) {
    console.warn("⚠️ لا يمكن الدمج، لم يتم تحميل Firebase أو state");
    return;
  }

  console.log("🔄 فحص بيانات جديدة...");
  const sheetData = await syncFromSheet();
  if (!sheetData) return;

  let hasChanges = false;

  for (const item of sheetData.inventory || []) {
    if (!window.state.inventory.some(i => i.id === item.id)) {
      await window.cloud.addInventory(item);
      console.log("✅ تمت إضافة عنصر:", item.name);
      hasChanges = true;
    }
  }

  for (const loan of sheetData.loans || []) {
    if (!window.state.loans.some(l => l.id === loan.id)) {
      await window.cloud.addLoan(loan);
      console.log("✅ تمت إضافة إعارة جديدة");
      hasChanges = true;
    }
  }

  for (const ret of sheetData.returns || []) {
    if (!window.state.returns.some(r => r.id === ret.id)) {
      await window.cloud.addReturn(ret);
      console.log("✅ تمت إضافة إرجاع جديد");
      hasChanges = true;
    }
  }

  if (hasChanges) console.log("✅ تم الدمج بنجاح!");
  else console.log("ℹ️ لا توجد بيانات جديدة.");
}

// ===== مراقبة تلقائية =====
let autoSyncTimer = null;
async function startAutoSync(interval = 20) {
  if (autoSyncTimer) {
    console.warn("⚠️ المزامنة التلقائية تعمل بالفعل");
    return;
  }

  console.log(`📡 بدء المراقبة (كل ${interval} ثانية)`);
  let lastCount = await getSheetRowCount();

  autoSyncTimer = setInterval(async () => {
    const newCount = await getSheetRowCount();
    if (newCount > lastCount) {
      console.log(`🆕 تم اكتشاف ${newCount - lastCount} صفوف جديدة`);
      lastCount = newCount;
      await mergeNewSheetData();
    }
  }, interval * 1000);
}

// ===== إيقاف المزامنة =====
function stopAutoSync() {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    console.log("⏹️ تم إيقاف المراقبة");
  }
}

// ===== ربط الأحداث مع Firebase =====
window.gsheetHooks = {
  inventory: {
    onAdd: (row) => postToSheet({ type: "inventory_add", timestamp: new Date().toLocaleString("ar-SA"), data: row }),
    onUpdate: (id, changes) => postToSheet({ type: "inventory_update", id, changes, timestamp: new Date().toLocaleString("ar-SA") }),
    onDelete: (id) => postToSheet({ type: "inventory_delete", id, timestamp: new Date().toLocaleString("ar-SA") })
  },
  loans: {
    onAdd: (row) => postToSheet({ type: "loan_add", timestamp: new Date().toLocaleString("ar-SA"), data: row }),
    onDelete: (id) => postToSheet({ type: "loan_delete", id, timestamp: new Date().toLocaleString("ar-SA") })
  },
  returns: {
    onAdd: (row) => postToSheet({ type: "return_add", timestamp: new Date().toLocaleString("ar-SA"), data: row }),
    onDelete: (id) => postToSheet({ type: "return_delete", id, timestamp: new Date().toLocaleString("ar-SA") })
  }
};

// ===== تصدير الدوال =====
window.sheetSync = {
  postToSheet,
  syncFromSheet,
  mergeNewSheetData,
  startAutoSync,
  stopAutoSync,
  getSheetRowCount
};

console.log("✅ Google Sheets Sync (CORS Safe Version) Ready");
