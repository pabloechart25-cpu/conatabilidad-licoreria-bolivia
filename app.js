// Licorería Pro - Frontend estático (GitHub Pages)
// Funciones: ventas por unidad/pack/caja, compras, inventario, KPIs, gráficos, PDF, CSV.

const $ = s => document.querySelector(s);
const id = () => Math.random().toString(36).slice(2,9);
const fmt = n => `Bs. ${Number(n||0).toFixed(2)}`;
const nowISO = () => dayjs().toISOString();
const toDay = d => dayjs(d).format('DD/MM/YYYY HH:mm');

let MODE = localStorage.getItem('lp_mode') || 'worker';
let PRODUCTS = JSON.parse(localStorage.getItem('lp_products')) || [
  // demo
  {id:id(), name:'Cerveza Corona 355ml', abv:4.5, volume:355, cost:9, price:15, units_per_pack:6, units_per_case:24, stock_units:48, img:''},
  {id:id(), name:'Whisky Johnnie Walker Red 750ml', abv:40, volume:750, cost:90, price:140, units_per_pack:1, units_per_case:12, stock_units:8, img:''},
  {id:id(), name:'Vino Malbec 750ml', abv:13.5, volume:750, cost:45, price:80, units_per_pack:1, units_per_case:12, stock_units:15, img:''},
];
let RECORDS = JSON.parse(localStorage.getItem('lp_records')) || []; // {id,type('venta'|'compra'),productId,name,qty,unitType,units,price,total,costUnit,pay,client,date}

function save(){ localStorage.setItem('lp_mode', MODE); localStorage.setItem('lp_products', JSON.stringify(PRODUCTS)); localStorage.setItem('lp_records', JSON.stringify(RECORDS)); }

// DOM
const saleForm = $('#saleForm'), buyForm = $('#buyForm');
const saleProduct = $('#saleProduct'), saleUnit = $('#saleUnit'), saleQty = $('#saleQty'), salePrice = $('#salePrice'), salePay = $('#salePay'), saleClient = $('#saleClient');
const prodList = $('#prodList'), invList = $('#invList'), recordsEl = $('#records');
const kpiToday = $('#kpiToday'), kpiWeek = $('#kpiWeek'), kpiMonth = $('#kpiMonth'), kpiProfit = $('#kpiProfit');
const filterText = $('#filterText'), filterType = $('#filterType'), fromDate=$('#fromDate'), toDate=$('#toDate');
const clearFilters = $('#clearFilters'), btnMode = $('#btnMode'), btnDark = $('#btnDark');

function renderProductSelect(){
  saleProduct.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = `${p.name} — ${fmt(p.price)} · stock ${p.stock_units}`;
    saleProduct.appendChild(opt);
  });
  const p0 = PRODUCTS[0]; if(p0) salePrice.value = p0.price;
}
function renderProducts(){
  prodList.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const li = document.createElement('li');
    const low = p.stock_units <= (p.units_per_case||12) ? '<span class="badge low">Stock bajo</span>' : '';
    li.innerHTML = `
      <div>
        <strong>${p.name}</strong> ${low}
        <div class="small">${p.abv||0}% · ${p.volume||0}ml · Costo ${fmt(p.cost)} · Precio ${fmt(p.price)}</div>
        <div class="small">Pack: ${p.units_per_pack||1} · Caja: ${p.units_per_case||12}</div>
      </div>
      <div>
        <button class="btn ghost" data-act="edit" data-id="${p.id}">Editar</button>
        <button class="btn ghost" data-act="del" data-id="${p.id}">Eliminar</button>
      </div>`;
    prodList.appendChild(li);
  });
}
function renderInventory(){
  invList.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const li = document.createElement('li');
    const low = p.stock_units <= (p.units_per_case||12) ? '<span class="badge low">Bajo</span>' : '';
    li.innerHTML = `
      <div>
        <strong>${p.name}</strong> ${low}
        <div class="small">Stock: ${p.stock_units} u.</div>
      </div>
      <div>
        <button class="btn ghost" data-act="adj" data-id="${p.id}">Ajustar</button>
      </div>`;
    invList.appendChild(li);
  });
}
function applyFilters(data){
  const txt = (filterText.value||'').toLowerCase();
  const type = filterType.value;
  const from = fromDate.value ? dayjs(fromDate.value) : null;
  const to = toDate.value ? dayjs(toDate.value) : null;
  return data.filter(r=>{
    if(type!=='all' && r.type!==type) return false;
    if(txt && !(`${r.name} ${r.client||''}`).toLowerCase().includes(txt)) return false;
    if(from && dayjs(r.date).isBefore(from,'day')) return false;
    if(to && dayjs(r.date).isAfter(to,'day')) return false;
    return true;
  });
}
function renderRecords(){
  const arr = applyFilters(RECORDS).slice().reverse();
  recordsEl.innerHTML = '';
  arr.forEach(r=>{
    const li = document.createElement('li'); li.className='record';
    li.innerHTML = `
      <div>
        <div><strong>${r.type.toUpperCase()}</strong> · ${r.name} × ${r.qty} ${r.unitType} (${r.units} u.) · ${fmt(r.total)}</div>
        <div class="small">${toDay(r.date)} · ${r.client||'—'} · ${r.pay||'—'}</div>
      </div>
      <div>
        <button class="btn ghost" data-act="edit" data-id="${r.id}">Editar</button>
        <button class="btn ghost" data-act="del" data-id="${r.id}">Eliminar</button>
      </div>`;
    recordsEl.appendChild(li);
  });
}

// KPIs + Charts
let chartSales, chartTop;
function computeKPIs(){
  const today = dayjs();
  const ventasHoy = RECORDS.filter(r=>r.type==='venta' && dayjs(r.date).isSame(today,'day')).reduce((a,b)=>a+b.total,0);
  const ventasWeek = RECORDS.filter(r=>r.type==='venta' && dayjs(r.date).isoWeek()===today.isoWeek() && dayjs(r.date).year()===today.year()).reduce((a,b)=>a+b.total,0);
  const ventasMonth = RECORDS.filter(r=>r.type==='venta' && dayjs(r.date).month()===today.month() && dayjs(r.date).year()===today.year()).reduce((a,b)=>a+b.total,0);
  const comprasMonth = RECORDS.filter(r=>r.type==='compra' && dayjs(r.date).month()===today.month() && dayjs(r.date).year()===today.year()).reduce((a,b)=>a+b.total,0);
  // Utilidad (aprox) = Σ(venta.units * (precio - costoUnit))
  const utilMonth = RECORDS.filter(r=>r.type==='venta' && dayjs(r.date).month()===today.month() && dayjs(r.date).year()===today.year())
    .reduce((a,r)=> {
      const prod = PRODUCTS.find(p=>p.id===r.productId);
      const cost = prod? prod.cost : r.costUnit || 0;
      return a + r.units * (r.price - cost);
    },0);

  kpiToday.textContent = fmt(ventasHoy);
  kpiWeek.textContent = fmt(ventasWeek);
  kpiMonth.textContent = fmt(ventasMonth);
  kpiProfit.textContent = fmt(utilMonth);

  // Chart ventas vs compras (últimos 14 días)
  const labels = [...Array(14)].map((_,i)=> dayjs().subtract(13-i,'day').format('DD/MM'));
  const ventas = labels.map(l => RECORDS.filter(r=> r.type==='venta' && dayjs(r.date).format('DD/MM')===l).reduce((a,b)=>a+b.total,0));
  const compras = labels.map(l => RECORDS.filter(r=> r.type==='compra' && dayjs(r.date).format('DD/MM')===l).reduce((a,b)=>a+b.total,0));
  if(chartSales) chartSales.destroy();
  chartSales = new Chart($('#chartSales'), {
    type:'bar',
    data:{labels, datasets:[{label:'Ventas',data:ventas, backgroundColor:'rgba(99,102,241,0.8)'},{label:'Compras',data:compras, backgroundColor:'rgba(239,68,68,0.7)'}]},
    options:{responsive:true,plugins:{legend:{position:'bottom'}}}
  });

  // Top 5 productos por unidades vendidas (últimos 30 días)
  const from30 = dayjs().subtract(30,'day');
  const map = {};
  RECORDS.filter(r=> r.type==='venta' && dayjs(r.date).isAfter(from30)).forEach(r=>{
    map[r.name] = (map[r.name]||0) + r.units;
  });
  const top = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(chartTop) chartTop.destroy();
  chartTop = new Chart($('#chartTop'), {
    type:'bar',
    data:{labels: top.map(x=>x[0]), datasets:[{label:'Unidades vendidas (30 días)', data: top.map(x=>x[1]), backgroundColor:'rgba(245,158,11,0.8)'}]},
    options:{indexAxis:'y', responsive:true, plugins:{legend:{display:false}}}
  });
}

// Helpers de unidades
function unitsFor(p, unitType, qty){
  if(unitType==='unit') return qty;
  if(unitType==='pack') return qty * (p.units_per_pack || 1);
  if(unitType==='case') return qty * (p.units_per_case || 12);
  return qty;
}

// VENTAS
saleProduct.addEventListener('change', ()=>{
  const p = PRODUCTS.find(x=>x.id===saleProduct.value);
  if(p) salePrice.value = p.price;
});

saleForm.addEventListener('submit', e=>{
  e.preventDefault();
  const pid = saleProduct.value; const p = PRODUCTS.find(x=>x.id===pid);
  if(!p) return alert('Producto inválido');
  const unitType = saleUnit.value;
  const qty = Number(saleQty.value)||1;
  const units = unitsFor(p, unitType, qty);
  const price = Number(salePrice.value)||p.price;
  const pay = $('#salePay').value;
  const client = $('#saleClient').value.trim();

  if(p.stock_units < units){
    if(!confirm(`Stock insuficiente (${p.stock_units} u.). ¿Registrar de todas formas?`)) return;
  }
  // Descontar
  p.stock_units = Math.max(0, p.stock_units - units);

  const rec = {id:id(), type:'venta', productId:pid, name:p.name, qty, unitType, units, price, total:Number((price*qty).toFixed(2)), pay, client, date: nowISO(), costUnit:p.cost};
  RECORDS.push(rec);
  save(); renderAll(); saleForm.reset(); salePrice.value = p.price;
});

// COMPRAS / REPOSICIÓN
buyForm.addEventListener('submit', e=>{
  e.preventDefault();
  const name = $('#buyName').value.trim();
  const abv = Number($('#buyABV').value)||0;
  const volume = Number($('#buyVol').value)||0;
  const cost = Number($('#buyCost').value)||0;
  const price = Number($('#buyPrice').value)||0;
  const units_per_pack = Number($('#buyPack').value)||1;
  const units_per_case = Number($('#buyCase').value)||12;
  const qtyUnits = Number($('#buyQty').value)||0;

  if(!name || !qtyUnits || !cost || !price) return;

  let p = PRODUCTS.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(p){
    // actualizar
    p.abv = abv || p.abv;
    p.volume = volume || p.volume;
    p.cost = cost;
    p.price = price;
    p.units_per_pack = units_per_pack;
    p.units_per_case = units_per_case;
    p.stock_units += qtyUnits;
  }else{
    p = {id:id(), name, abv, volume, cost, price, units_per_pack, units_per_case, stock_units: qtyUnits, img:''};
    PRODUCTS.push(p);
  }

  // registro de compra (gasto)
  const rec = {id:id(), type:'compra', productId:p.id, name:p.name, qty:qtyUnits, unitType:'unit', units:qtyUnits, price:cost, total:Number((cost*qtyUnits).toFixed(2)), pay:'efectivo', client:'', date: nowISO(), costUnit:cost};
  RECORDS.push(rec);

  save(); renderAll(); buyForm.reset();
});

// Listeners para editar/eliminar / ajustar
prodList.addEventListener('click', ev=>{
  const btn = ev.target.closest('button'); if(!btn) return;
  const act = btn.dataset.act; const pid = btn.dataset.id;
  const p = PRODUCTS.find(x=>x.id===pid); if(!p) return;
  if(act==='del'){
    if(confirm('Eliminar producto del catálogo?')){ PRODUCTS = PRODUCTS.filter(x=>x.id!==pid); save(); renderAll(); }
  }
  if(act==='edit'){
    const name = prompt('Nombre', p.name) || p.name;
    const abv = Number(prompt('ABV (%)', p.abv) || p.abv);
    const volume = Number(prompt('Volumen (ml)', p.volume) || p.volume);
    const cost = Number(prompt('Costo unitario (Bs.)', p.cost) || p.cost);
    const price = Number(prompt('Precio venta (Bs.)', p.price) || p.price);
    const upp = Number(prompt('Unidades por pack', p.units_per_pack||1) || p.units_per_pack||1);
    const upc = Number(prompt('Unidades por caja', p.units_per_case||12) || p.units_per_case||12);
    Object.assign(p, {name,abv,volume,cost,price,units_per_pack:upp,units_per_case:upc});
    save(); renderAll();
  }
});

invList.addEventListener('click', ev=>{
  const btn = ev.target.closest('button'); if(!btn) return;
  const act = btn.dataset.act; const pid = btn.dataset.id;
  const p = PRODUCTS.find(x=>x.id===pid); if(!p) return;
  if(act==='adj'){
    const add = Number(prompt('Ajuste (+/- unidades)', '6')) || 0;
    p.stock_units = Math.max(0, p.stock_units + add);
    save(); renderAll();
  }
});

recordsEl.addEventListener('click', ev=>{
  const btn = ev.target.closest('button'); if(!btn) return;
  const idr = btn.dataset.id; const act = btn.dataset.act;
  const r = RECORDS.find(x=>x.id===idr); if(!r) return;
  if(act==='del'){
    if(confirm('Eliminar registro?')){
      // revertir stock si era venta/compra
      const p = PRODUCTS.find(pp=>pp.id===r.productId);
      if(p){
        if(r.type==='venta'){ p.stock_units += r.units; }
        if(r.type==='compra'){ p.stock_units = Math.max(0, p.stock_units - r.units); }
      }
      RECORDS = RECORDS.filter(x=>x.id!==idr); save(); renderAll();
    }
  }
  if(act==='edit'){
    const qty = Number(prompt('Cantidad', r.qty) || r.qty);
    const price = Number(prompt('Precio unitario (venta/costo)', r.price) || r.price);
    const client = prompt('Cliente', r.client||'') || r.client;
    // revertir stock anterior
    const p = PRODUCTS.find(pp=>pp.id===r.productId);
    if(p){
      if(r.type==='venta'){ p.stock_units += r.units; }
      if(r.type==='compra'){ p.stock_units = Math.max(0, p.stock_units - r.units); }
      // recalcular units con misma unidad
      const units = r.unitType==='unit' ? qty : r.unitType==='pack' ? qty*(p.units_per_pack||1) : qty*(p.units_per_case||12);
      // aplicar nuevo
      if(r.type==='venta'){ p.stock_units = Math.max(0, p.stock_units - units); }
      if(r.type==='compra'){ p.stock_units += units; }
      Object.assign(r, {qty, price, total:Number((qty*price).toFixed(2)), client, units});
    }else{
      Object.assign(r, {qty, price, total:Number((qty*price).toFixed(2)), client});
    }
    save(); renderAll();
  }
});

// PDF / CSV
function genPDF(data, title, filename){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'A4'});
  doc.setFontSize(14); doc.text(title, 40, 40);
  let y = 70;
  data.forEach(r=>{
    doc.setFontSize(10);
    doc.text(`${toDay(r.date)} · ${r.type.toUpperCase()} · ${r.name} × ${r.qty} ${r.unitType} (${r.units}u) · ${fmt(r.total)} · ${r.pay||'—'} ${r.client? '· '+r.client : ''}`, 40, y);
    y+=16; if(y>760){ doc.addPage(); y=40; }
  });
  const totV = data.filter(x=>x.type==='venta').reduce((a,b)=>a+b.total,0);
  const totC = data.filter(x=>x.type==='compra').reduce((a,b)=>a+b.total,0);
  doc.text(`Total ventas: ${fmt(totV)}`,40,y+10);
  doc.text(`Total compras: ${fmt(totC)}`,40,y+28);
  doc.text(`Balance: ${fmt(totV - totC)}`,40,y+46);
  doc.save(filename);
}
function exportCSV(data, name='licoreria_export.csv'){
  const head = 'fecha,tipo,nombre,cantidad,unidad,unidades,precio,total,pago,cliente\n';
  const rows = data.map(r=>[
    dayjs(r.date).format('YYYY-MM-DD HH:mm'), r.type, `"${r.name.replaceAll('"','""')}"`, r.qty, r.unitType, r.units, r.price, r.total, r.pay||'', `"${(r.client||'').replaceAll('"','""')}"`].join(',')
  ).join('\n');
  const blob = new Blob([head+rows], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}

$('#pdfToday').addEventListener('click', ()=>{ const t=dayjs(); const d=RECORDS.filter(r=>dayjs(r.date).isSame(t,'day')); genPDF(d,'Reporte — Hoy','reporte_hoy.pdf'); });
$('#pdfWeek').addEventListener('click', ()=>{ const t=dayjs(); const d=RECORDS.filter(r=>dayjs(r.date).isoWeek()===t.isoWeek() && dayjs(r.date).year()===t.year()); genPDF(d,'Reporte — Semana','reporte_semana.pdf'); });
$('#pdfMonth').addEventListener('click', ()=>{ const t=dayjs(); const d=RECORDS.filter(r=>dayjs(r.date).month()===t.month() && dayjs(r.date).year()===t.year()); genPDF(d,'Reporte — Mes','reporte_mes.pdf'); });
$('#pdfRange').addEventListener('click', ()=>{ const d=applyFilters(RECORDS); genPDF(d,'Reporte — Rango','reporte_rango.pdf'); });
$('#csvExport').addEventListener('click', ()=> exportCSV(applyFilters(RECORDS)));

// Filtros
[filterText, filterType, fromDate, toDate].forEach(el=> el.addEventListener('input', renderRecords));
$('#clearFilters').addEventListener('click', ()=>{ filterText.value=''; filterType.value='all'; fromDate.value=''; toDate.value=''; renderRecords(); });

// Modo admin/trabajador y tema
$('#btnMode').addEventListener('click', ()=>{
  if(MODE==='worker'){
    const code = prompt('Código administrador:');
    if(code==='ADMIN123'){ MODE='admin'; alert('Modo admin activado'); } else { alert('Código inválido'); }
  } else { MODE='worker'; }
  localStorage.setItem('lp_mode', MODE); $('#btnMode').textContent = MODE==='worker' ? 'Modo: Trabajador' : 'Modo: Admin';
});
$('#btnDark').addEventListener('click', ()=>{ document.body.classList.toggle('light'); localStorage.setItem('lp_light', document.body.classList.contains('light')); });
if(localStorage.getItem('lp_light')==='true') document.body.classList.add('light');
$('#btnMode').textContent = MODE==='worker' ? 'Modo: Trabajador' : 'Modo: Admin';

// Tema claro opcional
const style = document.createElement('style');
style.textContent = `.light{--bg:#f8fafc; --card:#ffffff; --text:#0f172a; --muted:#475569; --border:rgba(2,6,23,.08)}
.light .form-grid input,.light .form-grid select{background:#fff}`;
document.head.appendChild(style);

// Render principal
function renderAll(){ renderProductSelect(); renderProducts(); renderInventory(); renderRecords(); computeKPIs(); }
renderAll(); save();
