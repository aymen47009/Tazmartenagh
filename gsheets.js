// ✅ Optional Google Sheets sync hooks with JSONP fallback (CORS-free)
// Requires window.gsheetSyncConfig defined in gsheets-config.js

// Helper: check if sync is enabled
function gsheetsEnabled() {
  return Boolean(window.gsheetSyncConfig && window.gsheetSyncConfig.enabled && window.gsheetSyncConfig.endpointUrl);
}

// ✅ JSONP helper — bypasses CORS
function jsonpPost(endpoint, payload, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const callbackName = 'gs_cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

    // define callback
    window[callbackName] = function (resp) {
      resolve(resp);
      // cleanup
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };

    // build URL
    const query =
      '?callback=' + encodeURIComponent(callbackName) +
      '&payload=' + encodeURIComponent(JSON.stringify(payload));

    // create script element
    const script = document.createElement('script');
    script.src = endpoint + query;
    script.onerror = function (e) {
      reject(new Error('JSONP load error'));
      try { delete window[callbackName]; } catch (e) { }
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };

    document.body.appendChild(script);

    // timeout
    const timer = setTimeout(() => {
      reject(new Error('JSONP timeout'));
      try { delete window[callbackName]; } catch (e) { }
      if (script.parentNode) script.parentNode.removeChild(script);
    }, timeout);
  });
}

// ✅ Main post function — tries JSONP first, fallback to fetch if allowed
async function postToSheet(payload) {
  if (!gsheetsEnabled()) return;
  const endpoint = window.gsheetSyncConfig.endpointUrl;

  try {
    // try JSONP first
    const resp = await jsonpPost(endpoint, payload);
    console.log('✅ Google Sheets JSONP success:', resp);
  } catch (err) {
    console.warn('⚠️ JSONP failed, trying fetch...', err);
    try {
      // fallback to normal fetch
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('✅ fetch fallback success', await response.text());
    } catch (e2) {
      console.error('❌ Google Sheets sync failed completely', e2);
    }
  }
}

// ✅ Hooks — define all events that send data to Google Sheets
window.gsheetHooks = {
  inventory: {
    onAdd: (row) => postToSheet({ t: 'inventory_add', row }),
    onUpdate: (id, changes) => postToSheet({ t: 'inventory_update', id, changes }),
    onDelete: (id) => postToSheet({ t: 'inventory_delete', id })
  },
  loans: {
    onAdd: (row) => postToSheet({ t: 'loan_add', row }),
    onDelete: (id) => postToSheet({ t: 'loan_delete', id })
  },
  returns: {
    onAdd: (row) => postToSheet({ t: 'return_add', row }),
    onDelete: (id) => postToSheet({ t: 'return_delete', id })
  }
};

// ✅ Log to confirm it's loaded
console.log("📄 gsheets.js loaded successfully");
