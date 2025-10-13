// ===== إعداد الرابط =====
const SHEET_API = "https://script.google.com/macros/s/AKfycbzvtNYeILpOCx_oymeGeit9aHs9PlFPdjaNbPdcVZ5247w4r8pG-Pz16OjCF9A3cPHJ1Q/exec";

// ===== إرسال منظم إلى Google Sheets =====
async function sendToSheet(action, data = {}, id = null) {
  try {
    const body = JSON.stringify({ action, data, id });
    const res = await fetch(SHEET_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    const result = await res.json();
    console.log("📤 رد Google Sheets:", result);
    return result;
  } catch (e) {
    console.error("❌ فشل الإرسال:", e);
    return { success: false, error: e.message };
  }
}

// ===== استرجاع البيانات من Google Sheets =====
async function fetchInventory() {
  try {
    const res = await fetch(SHEET_API);
    const result = await res.json();
    if (result.success) {
      console.log("📥 تمت استعادة البيانات:", result.inventory);
      return result.inventory;
    } else {
      console.warn("⚠️ فشل الاسترجاع:", result);
      return [];
    }
  } catch (e) {
    console.error("❌ خطأ أثناء جلب البيانات:", e);
    return [];
  }
}

// ===== مزامنة تلقائية =====
async function startAutoSync(intervalSec = 20) {
  console.log(`🔁 بدء المزامنة التلقائية كل ${intervalSec} ثانية`);
  await syncData();
  setInterval(syncData, intervalSec * 1000);
}

// ===== وظيفة المزامنة الفعلية =====
async function syncData() {
  const sheetData = await fetchInventory();

  // تحديث القاعدة المحلية أو Firebase
  if (window.cloud && typeof window.cloud.replaceCollection === "function") {
    window.cloud.replaceCollection("inventory", sheetData);
  } else {
    window.state = { inventory: sheetData };
    localStorage.setItem("inventory", JSON.stringify(sheetData));
  }
  console.log("✅ تمت المزامنة مع Google Sheets");
}

// ===== أمثلة =====
window.gsheet = {
  addItem: (item) => sendToSheet("inventory_add", item),
  updateItem: (id, data) => sendToSheet("inventory_update", data, id),
  deleteItem: (id) => sendToSheet("inventory_delete", {}, id),
  fetchAll: fetchInventory,
  startAutoSync
};
