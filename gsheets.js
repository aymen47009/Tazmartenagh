// ✅ Google Sheets sync hooks (JSONP version)
// Requires window.gsheetSyncConfig defined in gsheets-config.js

function gsheetsEnabled() {
  return Boolean(
    window.gsheetSyncConfig &&
    window.gsheetSyncConfig.enabled &&
    window.gsheetSyncConfig.endpointUrl
  );
}

// ✅ JSONP helper — bypasses CORS restrictions
function jsonpPost(endpoint, payload, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "gs_cb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);

    window[callbackName] = function (resp) {
      resolve(resp);
      cleanup();
    };

    function cleanup() {
      try {
        delete window[callbackName];
      } catch (e) {
        window[callbackName] = undefined;
      }
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    }

    const script = document.createElement("script");
    const q =
      "?callback=" +
      encodeURIComponent(callbackName) +
      "&payload=" +
      encodeURIComponent(JSON.stringify(payload));

    script.src = endpoint + q;
    script.onerror = function () {
      reject(new Error("JSONP load error"));
      cleanup();
    };

    document.body.appendChild(script);

    const timer = setTimeout(() => {
      reject(new Error("JSONP timeout"));
      cleanup();
    }, timeout);
  });
}

// ✅ Unified function to send data
async function postToSheet(payload) {
  if (!gsheetsEnabled()) return;

  try {
    // Try JSONP first
    const resp = await jsonpPost(window.gsheetSyncConfig.endpointUrl, payload);
    console.log("✅ Google Sheet updated via JSONP:", resp);
  } catch (err) {
    console.warn("⚠️ JSONP failed, trying fetch...", err);
    try {
      await fetch(window.gsheetSyncConfig.endpointUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("✅ Google Sheet updated via fetch");
    } catch (e2) {
      console.error("❌ Google Sheets sync failed completely", e2);
    }
  }
}

// ✅ Hooks — called automatically when data changes
window.gsheetHooks = {
  inventory: {
    onAdd: (row) => postToSheet({ t: "inventory_add", row }),
    onUpdate: (id, changes) =>
      postToSheet({ t: "inventory_update", id, changes }),
    onDelete: (id) => postToSheet({ t: "inventory_delete", id }),
  },
  loans: {
    onAdd: (row) => postToSheet({ t: "loan_add", row }),
    onDelete: (id) => postToSheet({ t: "loan_delete", id }),
  },
  returns: {
    onAdd: (row) => postToSheet({ t: "return_add", row }),
    onDelete: (id) => postToSheet({ t: "return_delete", id }),
  },
};
