// === إعداد رابط Google Script ===
const SHEET_API = "https://script.google.com/macros/s/AKfycbx05TgLh5QnIuWyms5VtVJ1rPC2awqP6plwuwUYSbVA-LlIlgPJ14XwqGnA_FFEKcbSHQ/exec";

// === عرض في الكونسول ===
function log(...args) {
  console.log("🧾", ...args);
}

// === إرسال بيانات إلى الجدول ===
async function sendToSheet(action, data = {}, id = null) {
  try {
    log(`📤 إرسال (${action})`, data);
    const res = await fetch(SHEET_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data, id }),
    });
    const result = await res.json();
    log("📩 رد Google Sheets:", result);
    return result;
  } catch (e) {
    log("❌ خطأ في الإرسال:", e.message);
  }
}

// === استرجاع جميع الصفوف ===
async function fetchAll() {
  try {
    log("📥 جلب البيانات من Google Sheets...");
    const res = await fetch(SHEET_API);
    const result = await res.json();
    if (result.success) {
      log("✅ البيانات المسترجعة:", result.items);
      return result.items;
    } else {
      log("⚠️ فشل الجلب:", result);
      return [];
    }
  } catch (e) {
    log("❌ خطأ أثناء الجلب:", e.message);
    return [];
  }
}

// === مزامنة تلقائية كل X ثانية ===
async function startAutoSync(intervalSec = 15) {
  log(`🔁 تشغيل المزامنة التلقائية كل ${intervalSec} ثانية`);
  await syncNow();
  setInterval(syncNow, intervalSec * 1000);
}

async function syncNow() {
  const data = await fetchAll();
  if (Array.isArray(data)) {
    window.state = { inventory: data };
    localStorage.setItem("inventory", JSON.stringify(data));
    log("🗂️ تمت مزامنة البيانات:", data.length, "صفوف");
  }
}

// === واجهة عامة ===
window.gsheet = {
  add: (item) => sendToSheet("add", item),
  update: (id, item) => sendToSheet("update", item, id),
  remove: (id) => sendToSheet("delete", {}, id),
  fetch: fetchAll,
  sync: startAutoSync,
};

// === تجربة فورية عند التحميل ===
log("✅ gsheets.js جاهز");
