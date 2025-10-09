// Optional Google Sheets sync hooks.
// Requires window.gsheetSyncConfig defined in gsheets-config.js

function gsheetsEnabled(){
  return Boolean(window.gsheetSyncConfig && window.gsheetSyncConfig.enabled && window.gsheetSyncConfig.endpointUrl);
}

async function postToSheet(payload){
  if(!gsheetsEnabled()) return;
  try{
    await fetch(window.gsheetSyncConfig.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }catch(e){ console.warn('gsheets sync failed', e); }
}

// Hooks
window.gsheetHooks = {
  inventory: {
    onAdd: (row)=> postToSheet({ t:'inventory_add', row }),
    onUpdate: (id, changes)=> postToSheet({ t:'inventory_update', id, changes }),
    onDelete: (id)=> postToSheet({ t:'inventory_delete', id })
  },
  loans: {
    onAdd: (row)=> postToSheet({ t:'loan_add', row }),
    onDelete: (id)=> postToSheet({ t:'loan_delete', id })
  },
  returns: {
    onAdd: (row)=> postToSheet({ t:'return_add', row }),
    onDelete: (id)=> postToSheet({ t:'return_delete', id })
  }
};


