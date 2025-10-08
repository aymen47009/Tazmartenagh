// Simple PWA Inventory Manager (Arabic, RTL)
// Storage keys
const STORAGE_KEYS = {
  SETTINGS: 'settings',
  INVENTORY: 'inventory',
  LOANS: 'loans',
  RETURNS: 'returns',
  SESSION: 'session'
};

const DEFAULT_LOGIN_CODE = '1234'; // shared simple code

// State
let state = {
  inventory: [], // {id, name, initialQty, totalQty, notes}
  loans: [],     // {id, itemName, qty, person, phone, dept, date, due}
  returns: []    // {id, date, itemName, qty, damaged, notes}
};
let useCloud = false; // toggled when Firebase is ready

// Utilities
const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0,10);

function loadAll(){
  state.inventory = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY) || '[]');
  state.loans = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOANS) || '[]');
  state.returns = JSON.parse(localStorage.getItem(STORAGE_KEYS.RETURNS) || '[]');
}
function save(key){
  if(key === STORAGE_KEYS.INVENTORY) localStorage.setItem(key, JSON.stringify(state.inventory));
  if(key === STORAGE_KEYS.LOANS) localStorage.setItem(key, JSON.stringify(state.loans));
  if(key === STORAGE_KEYS.RETURNS) localStorage.setItem(key, JSON.stringify(state.returns));
}

function getAvailableFor(name){
  const total = (state.inventory.find(i=>i.name===name)?.totalQty) || 0;
  const loaned = state.loans.filter(l=>l.itemName===name).reduce((s,l)=>s+Number(l.qty||0),0);
  const returned = state.returns.filter(r=>r.itemName===name).reduce((s,r)=>s+Number(r.qty||0),0);
  return total - loaned + returned;
}

function getReturnedQtyForLoan(loanId){
  return state.returns
    .filter(r => r.loanId === loanId)
    .reduce((sum, r) => sum + Number(r.qty || 0), 0);
}

function isLoanFullyReturned(loan){
  const returnedQty = getReturnedQtyForLoan(loan.id);
  return returnedQty >= Number(loan.qty || 0);
}

// Session / Login
function isLoggedIn(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION)||'{}').ok === true; }catch{ return false }
}
function setLoggedIn(ok){
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ ok }));
}

// Routing
const routes = ['inventory','loans','returns','reports'];
function goto(route){
  routes.forEach(r=>{
    document.getElementById('route-'+r).classList.toggle('hidden', r!==route);
    document.querySelector(`[data-route="${r}"]`).classList.toggle('active', r===route);
  });
  if(route==='inventory') renderInventory();
  if(route==='loans') renderLoans();
  if(route==='returns') renderReturns();
  if(route==='reports') renderReports();
  history.replaceState({}, '', `#${route}`);
}

// Render helpers
function renderInventory(filter=''){
  const list = document.getElementById('inventoryList');
  const q = filter.trim();
  const items = state.inventory
    .filter(i=> i.name.includes(q))
    .sort((a,b)=> a.name.localeCompare(b.name,'ar'));
  list.innerHTML = '';
  for(const it of items){
    const available = getAvailableFor(it.name);
    const el = document.createElement('div');
    el.className='item';
    el.innerHTML = `
      <div>
        <div>${it.name}</div>
        <div class="meta">الكلية: ${it.totalQty} • الأصل: ${it.initialQty}</div>
      </div>
      <div class="qty" title="المتاحة">${available}</div>
      <div class="actions">
        <button class="btn" data-act="qr">QR</button>
        <button class="btn" data-act="edit">تعديل</button>
      </div>`;
    el.querySelector('[data-act="edit"]').onclick = ()=> openItemDialog(it.id);
    el.querySelector('[data-act="qr"]').onclick = ()=> showItemQr(it);
    list.appendChild(el);
  }
  // datalists for forms
  fillDatalists();
}

function renderLoans(filter=''){
  const list = document.getElementById('loansList');
  const q = filter.trim();
  const items = state.loans
    .filter(l=> [l.itemName,l.person,l.dept,l.phone].some(x=> (x||'').includes(q)))
    .sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  list.innerHTML='';
  for(const it of items){
    const returnedQty = getReturnedQtyForLoan(it.id);
    const isFullyReturned = isLoanFullyReturned(it);
    const remainingQty = Number(it.qty) - returnedQty;
    
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div>
        <div>${it.itemName} • ${it.qty} ${isFullyReturned ? '(مُرجع بالكامل)' : `(مُرجع: ${returnedQty}, متبقي: ${remainingQty})`}</div>
        <div class="meta">${it.person||''} • ${it.dept||''} • ${it.phone||''}</div>
      </div>
      <div class="meta">${it.date||''}</div>
      <div class="actions">
        <button class="btn ${isFullyReturned ? 'secondary' : ''}" data-act="return" ${isFullyReturned ? 'disabled' : ''}>${isFullyReturned ? 'مُرجع' : 'إرجاع'}</button>
        <button class="btn danger" data-act="del">حذف</button>
      </div>`;
    el.querySelector('[data-act="del"]').onclick = ()=>{
      if(useCloud && window.cloud){ window.cloud.deleteLoan(it.id); }
      else {
        state.loans = state.loans.filter(x=>x.id!==it.id);
        save(STORAGE_KEYS.LOANS);
        renderLoans(q);
        renderInventory(document.getElementById('inventorySearch').value||'');
        renderReports();
      }
    };
    el.querySelector('[data-act="return"]').onclick = ()=>{
      if(isFullyReturned) {
        alert('هذه السلفية مُرجعة بالكامل');
        return;
      }
      // Navigate to returns tab
      goto('returns');
      // Pre-fill the return form
      document.getElementById('ret_item').value = it.itemName;
      document.getElementById('ret_qty').value = remainingQty; // Set remaining quantity
      // Store loan ID for linking
      document.getElementById('ret_loanId').value = it.id;
      // Focus on notes field for additional info
      setTimeout(() => {
        document.getElementById('ret_notes').focus();
      }, 100);
    };
    list.appendChild(el);
  }
}

function renderReturns(filter=''){
  const list = document.getElementById('returnsList');
  const q = filter.trim();
  const items = state.returns
    .filter(r=> [r.itemName,r.notes].some(x=> (x||'').includes(q)))
    .sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  list.innerHTML='';
  for(const it of items){
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div>
        <div>${it.itemName} • مرجعة: ${it.qty} • تالفة: ${it.damaged||0}</div>
        <div class="meta">${it.notes||''}</div>
      </div>
      <div class="meta">${it.date||''}</div>
      <div class="actions">
        <button class="btn danger" data-act="del">حذف</button>
      </div>`;
    el.querySelector('[data-act="del"]').onclick = ()=>{
      if(useCloud && window.cloud){ window.cloud.deleteReturn(it.id); }
      else {
        state.returns = state.returns.filter(x=>x.id!==it.id);
        save(STORAGE_KEYS.RETURNS);
        renderReturns(q);
        renderInventory(document.getElementById('inventorySearch').value||'');
        renderReports();
      }
    };
    list.appendChild(el);
  }
}

function renderReports(){
  const totalLoaned = state.loans.reduce((s,l)=> s + Number(l.qty||0), 0);
  document.getElementById('stat_total_loaned').textContent = totalLoaned;
  const today = todayStr();
  const dueToday = state.loans.filter(l=> l.due && l.due <= today && !returnedEnough(l)).length;
  document.getElementById('stat_due_today').textContent = dueToday;
  const dueList = document.getElementById('dueList');
  dueList.innerHTML='';
  for(const l of state.loans.filter(l=> l.due && l.due <= today)){
    const el = document.createElement('div');
    el.className='item';
    el.innerHTML = `<div>${l.itemName} • ${l.qty} • ${l.person||''}</div><div class="meta">${l.due}</div><div></div>`;
    dueList.appendChild(el);
  }
}
function returnedEnough(loan){
  // Optional enhancement: track returns per loan; currently we aggregate per item only
  return false;
}

function fillDatalists(){
  const names = [...new Set(state.inventory.map(i=>i.name))].sort((a,b)=>a.localeCompare(b,'ar'));
  const dl1 = document.getElementById('itemsDatalist');
  const dl2 = document.getElementById('itemsDatalist2');
  dl1.innerHTML = names.map(n=>`<option value="${n}"></option>`).join('');
  dl2.innerHTML = dl1.innerHTML;
}

// Item dialog
const itemDialog = document.getElementById('itemDialog');
let editingItemId = null;
function openItemDialog(id){
  editingItemId = id || null;
  const isEdit = Boolean(id);
  document.getElementById('itemDialogTitle').textContent = isEdit ? 'تعديل عتاد' : 'إضافة عتاد';
  const it = isEdit ? state.inventory.find(i=>i.id===id) : { name:'', initialQty:0, totalQty:0, notes:'' };
  document.getElementById('f_name').value = it.name || '';
  document.getElementById('f_initialQty').value = it.initialQty || 0;
  document.getElementById('f_totalQty').value = it.totalQty || 0;
  document.getElementById('f_notes').value = it.notes || '';
  document.getElementById('deleteItemBtn').style.display = isEdit ? 'inline-flex':'none';
  document.getElementById('qrContainer').innerHTML='';
  document.getElementById('scanContainer').classList.add('hidden');
  if(typeof itemDialog.showModal === 'function') itemDialog.showModal();
}

function submitItemDialog(ok){
  if(!ok){ itemDialog.close(); return; }
  const name = document.getElementById('f_name').value.trim();
  const initialQty = Number(document.getElementById('f_initialQty').value||0);
  const totalQty = Number(document.getElementById('f_totalQty').value||0);
  const notes = document.getElementById('f_notes').value.trim();
  if(!name) return;
  const payload = { name, initialQty, totalQty, notes };
  if(useCloud && window.cloud){
    if(editingItemId){ window.cloud.updateInventory(editingItemId, payload); }
    else { window.cloud.addInventory(payload); }
  } else {
    if(editingItemId){
      const it = state.inventory.find(i=>i.id===editingItemId);
      if(!it) return; Object.assign(it, payload);
    } else {
      state.inventory.push({ id: uid(), ...payload });
    }
    save(STORAGE_KEYS.INVENTORY);
    renderInventory(document.getElementById('inventorySearch').value||'');
    fillDatalists();
  }
  itemDialog.close();
}

function deleteEditingItem(){
  if(!editingItemId) return;
  if(useCloud && window.cloud){ window.cloud.deleteInventory(editingItemId); }
  else {
    state.inventory = state.inventory.filter(i=>i.id!==editingItemId);
    save(STORAGE_KEYS.INVENTORY);
    renderInventory(document.getElementById('inventorySearch').value||'');
  }
  itemDialog.close();
}

// QR generation / scanning for items
async function showItemQr(it){
  openItemDialog(it.id);
  const status = document.getElementById('qrStatus');
  status.textContent = '';
  
  // Wait for QRCode library to load (max 3 seconds)
  let attempts = 0;
  while (!window.QRCode && attempts < 30) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  console.log('QRCode available:', !!window.QRCode, 'after', attempts * 100, 'ms');
  if(!window.QRCode){ 
    status.textContent = 'مكتبة QR غير محملة - تأكد من الاتصال بالإنترنت'; 
    console.error('QRCode library not loaded after timeout');
    return; 
  }
  
  const payload = JSON.stringify({ t:'item', id: it.id, name: it.name });
  console.log('QR payload:', payload);
  
  const el = document.getElementById('qrContainer');
  el.innerHTML='';
  status.textContent = 'جاري توليد الرمز...';
  
  // Use callback-based toCanvas (more reliable)
  const canvas = document.createElement('canvas');
  window.QRCode.toCanvas(canvas, payload, { 
    width: 220, 
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  }, function (error) {
    if (error) {
      console.error('QR generation failed:', error);
      status.textContent = 'فشل توليد رمز QR: ' + error.message;
    } else {
      console.log('QR generated successfully');
      el.appendChild(canvas);
      status.textContent = 'تم توليد الرمز بنجاح';
    }
  });
}

let scanRAF=null, scanStream=null;
async function startScan(videoEl, onResult){
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoEl.srcObject = scanStream;
    await videoEl.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const loop = ()=>{
      if(videoEl.readyState === videoEl.HAVE_ENOUGH_DATA){
        canvas.width = videoEl.videoWidth; canvas.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0,0,canvas.width,canvas.height);
        const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if(code && code.data){ onResult(code.data); return; }
      }
      scanRAF = requestAnimationFrame(loop);
    };
    loop();
  }catch(e){ console.warn('scan failed', e); }
}
function stopScan(){
  if(scanRAF) cancelAnimationFrame(scanRAF);
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); }
  scanRAF=null; scanStream=null;
}

// Event wiring
function init(){
  loadAll();
  const logged = isLoggedIn();
  document.getElementById('view-login').classList.toggle('hidden', logged);
  document.getElementById('view-shell').classList.toggle('hidden', !logged);
  document.getElementById('logoutBtn').hidden = !logged;

  // Login
  document.getElementById('loginForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const code = document.getElementById('loginCode').value.trim();
    if(code === (JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)||'{}').loginCode || DEFAULT_LOGIN_CODE)){
      setLoggedIn(true);
      init();
    } else alert('رمز غير صحيح');
  });
  document.getElementById('logoutBtn').onclick = ()=>{ setLoggedIn(false); init(); };

  // Tabs
  document.querySelectorAll('.tabs .tab').forEach(b=> b.onclick = ()=> goto(b.dataset.route));

  // Inventory
  document.getElementById('addItemBtn').onclick = ()=> openItemDialog();
  document.getElementById('inventorySearch').addEventListener('input', (e)=> renderInventory(e.target.value));
  document.getElementById('itemForm').addEventListener('close', ()=>{});
  document.getElementById('itemDialog').addEventListener('close', ()=>{});
  document.getElementById('deleteItemBtn').onclick = deleteEditingItem;
  document.getElementById('itemForm').addEventListener('submit', (e)=>{ e.preventDefault(); submitItemDialog(true); });
  document.getElementById('genQrBtn').addEventListener('click', (e)=>{ 
    e.preventDefault();
    const status = document.getElementById('qrStatus');
    status.textContent = '';
    
    // Validate fields
    const name = document.getElementById('f_name').value.trim();
    if(!name){ 
      status.textContent = 'الرجاء إدخال اسم العتاد أولاً'; 
      return; 
    }
    
    // Ensure item exists (save if new)
    if(!editingItemId){
      // Save the item first
      const initialQty = Number(document.getElementById('f_initialQty').value||0);
      const totalQty = Number(document.getElementById('f_totalQty').value||0);
      const notes = document.getElementById('f_notes').value.trim();
      
      const newItem = { id: uid(), name, initialQty, totalQty, notes };
      if(useCloud && window.cloud){ 
        window.cloud.addInventory(newItem);
        // Wait a moment for cloud sync, then show QR
        setTimeout(() => showItemQr(newItem), 500);
      } else {
        state.inventory.push(newItem);
        save(STORAGE_KEYS.INVENTORY);
        showItemQr(newItem);
      }
    } else {
      const it = state.inventory.find(i=>i.id===editingItemId);
      if(!it){ 
        status.textContent = 'العنصر غير موجود'; 
        return; 
      }
      showItemQr(it);
    }
  });
  document.getElementById('scanQrBtn').addEventListener('click', async (e)=>{ e.preventDefault();
    document.getElementById('scanContainer').classList.remove('hidden');
    startScan(document.getElementById('scanVideo'), (data)=>{
      try{
        const obj = JSON.parse(data);
        if(obj.t==='item'){
          stopScan();
          document.getElementById('scanContainer').classList.add('hidden');
          const it = state.inventory.find(i=>i.id===obj.id) || state.inventory.find(i=>i.name===obj.name);
          if(it) openItemDialog(it.id);
        }
      }catch{}
    });
  });
  document.getElementById('stopScanBtn').onclick = ()=>{ stopScan(); document.getElementById('scanContainer').classList.add('hidden'); };

  // Loans
  document.getElementById('loan_date').value = todayStr();
  document.getElementById('loanForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const rec = {
      id: uid(),
      itemName: document.getElementById('loan_item').value.trim(),
      qty: Number(document.getElementById('loan_qty').value||0),
      person: document.getElementById('loan_person').value.trim(),
      phone: document.getElementById('loan_phone').value.trim(),
      dept: document.getElementById('loan_dept').value.trim(),
      date: document.getElementById('loan_date').value,
      due: document.getElementById('loan_due').value,
      returnedQty: 0 // Track returned quantity
    };
    if(!rec.itemName || rec.qty<=0) return;
    // Prevent negative available
    if(getAvailableFor(rec.itemName) - rec.qty < 0){ alert('الكمية غير متاحة'); return; }
    if(useCloud && window.cloud){ const { id, ...doc } = rec; window.cloud.addLoan(doc); }
    else {
      state.loans.push(rec); save(STORAGE_KEYS.LOANS);
      renderLoans(document.getElementById('loanSearch').value||'');
      renderInventory(document.getElementById('inventorySearch').value||'');
      renderReports();
    }
    (e.target).reset(); document.getElementById('loan_date').value = todayStr();
  });
  document.getElementById('loanSearch').addEventListener('input', (e)=> renderLoans(e.target.value));
  document.getElementById('scanLoanQrBtn').onclick = ()=>{
    document.getElementById('loanScanArea').classList.remove('hidden');
    startScan(document.getElementById('loanScanVideo'), (data)=>{
      try{ const o = JSON.parse(data); if(o.t==='item'){ stopScan(); document.getElementById('loanScanArea').classList.add('hidden'); document.getElementById('loan_item').value = (state.inventory.find(i=>i.id===o.id)?.name)||o.name||''; } }catch{}
    });
  };
  document.getElementById('stopLoanScanBtn').onclick = ()=>{ stopScan(); document.getElementById('loanScanArea').classList.add('hidden'); };

  // Returns
  document.getElementById('ret_date').value = todayStr();
  document.getElementById('returnForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const loanId = document.getElementById('ret_loanId').value;
    const rec = {
      id: uid(),
      date: document.getElementById('ret_date').value,
      itemName: document.getElementById('ret_item').value.trim(),
      qty: Number(document.getElementById('ret_qty').value||0),
      damaged: Number(document.getElementById('ret_damaged').value||0),
      notes: document.getElementById('ret_notes').value.trim(),
      loanId: loanId || null // Link to loan if available
    };
    if(!rec.itemName) return;
    
    // If linked to a loan, validate quantity
    if(loanId) {
      const loan = state.loans.find(l => l.id === loanId);
      if(loan) {
        const alreadyReturned = getReturnedQtyForLoan(loanId);
        const maxReturnable = Number(loan.qty) - alreadyReturned;
        if(rec.qty > maxReturnable) {
          alert(`لا يمكن إرجاع أكثر من ${maxReturnable} (المتبقي من السلفية)`);
          return;
        }
      }
    }
    
    if(useCloud && window.cloud){ const { id, ...doc } = rec; window.cloud.addReturn(doc); }
    else {
      state.returns.push(rec); save(STORAGE_KEYS.RETURNS);
      renderReturns(document.getElementById('returnSearch').value||'');
      renderLoans(document.getElementById('loanSearch').value||''); // Refresh loans to show updated status
      renderInventory(document.getElementById('inventorySearch').value||'');
      renderReports();
    }
    (e.target).reset(); document.getElementById('ret_date').value = todayStr(); document.getElementById('ret_damaged').value = 0;
  });
  document.getElementById('returnSearch').addEventListener('input', (e)=> renderReturns(e.target.value));

  // Install prompt
  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; document.getElementById('installBtn').hidden = false; });
  document.getElementById('installBtn').onclick = async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; document.getElementById('installBtn').hidden = true; };

  // Initial route
  const hash = (location.hash||'').replace('#','');
  goto(routes.includes(hash)?hash:'inventory');

  // Try connect to Firebase cloud (if config exists and script loaded)
  let tries = 0; const maxTries = 40; // ~4s
  const t = setInterval(()=>{
    tries++;
    if(window.cloud){
      clearInterval(t);
      useCloud = true;
      // Subscribe to collections
      window.cloud.subscribeInventory((rows)=>{ state.inventory = rows; if(location.hash.includes('inventory')||!location.hash) renderInventory(document.getElementById('inventorySearch').value||''); fillDatalists(); });
      window.cloud.subscribeLoans((rows)=>{ state.loans = rows; if(location.hash.includes('loans')) renderLoans(document.getElementById('loanSearch').value||''); renderReports(); });
      window.cloud.subscribeReturns((rows)=>{ state.returns = rows; if(location.hash.includes('returns')) renderReturns(document.getElementById('returnSearch').value||''); renderReports(); });
    }
    if(tries>=maxTries) clearInterval(t);
  }, 100);
}

window.addEventListener('DOMContentLoaded', init);


