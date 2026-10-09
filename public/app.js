// ===================== Utilidades =====================
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtN=(n,d=2)=>Number(n||0).toLocaleString("es-BO",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtQ=n=>Number(n||0).toLocaleString("es-BO",{maximumFractionDigits:3});
const money=n=>`${EMP?.moneda||"Bs"} ${fmtN(n)}`;
const fdate=s=>{ if(!s) return ""; const d=new Date(s.replace(" ","T")+"Z"); return d.toLocaleString("es-BO",{dateStyle:"short",timeStyle:"short"}); };
const today=()=>{ const d=new Date(); return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
const daysAgo=n=>{ const d=new Date(Date.now()-n*864e5); return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),3800); }
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
let TOKEN=ls.get("ag-token"), USER=null, EMP=null, SUCS=[], ALLSUCS=[], SUC=null;
async function api(path,opt={}){
  const r=await fetch("/api/"+path,{method:opt.method||(opt.body?"POST":"GET"),headers:{"content-type":"application/json",...(TOKEN?{authorization:"Bearer "+TOKEN}:{})},body:opt.body?JSON.stringify(opt.body):undefined});
  const j=await r.json().catch(()=>({ok:false,error:"Sin conexión con el servidor"}));
  if(r.status===401 && path!=="login" && path!=="setup"){ logoutLocal(); throw new Error(j.error||"Sesión vencida"); }
  if(!j.ok) throw new Error(j.error||"Error"); return j;
}
const can=p=>USER&&!USER.super&&USER.permisos.includes(p);
function dialog(html,onReady){ $("dlgBody").innerHTML=html; const d=$("dlg"); if(!d.open) d.showModal(); onReady&&onReady($("dlgBody")); }
function closeDlg(){ $("dlg").close(); }
const imgUrl=p=>p.tiene_imagen?`/api/img?id=${p.id}&v=${encodeURIComponent(p.actualizado||"")}`:"";
const sucName=id=>(ALLSUCS.find(s=>s.id===id)||SUCS.find(s=>s.id===id)||{}).nombre||"—";
const stockEn=(p,sid)=>Number(p.stock?.[sid]||0);
const val=(b,s)=>b.querySelector(s)?.value??"";

// ===================== Inicio, instalación y login =====================
function show(v){ ["vSetup","vLogin","vApp"].forEach(x=>$(x).classList.toggle("hidden",x!==v)); }
async function boot(){
  if(TOKEN){ try{ setUser((await api("login")).usuario); return startApp(); }catch(e){} }
  try{ const s=await api("setup"); if(s.necesita) return show("vSetup"); }catch(e){}
  show("vLogin"); $("lgUser").focus();
}
$("suBtn").onclick=async()=>{ $("suErr").textContent="";
  try{ await api("setup",{body:{setup_key:$("suKey").value,nombre:$("suNombre").value,usuario:$("suUser").value,password:$("suPass").value}});
    $("lgUser").value=$("suUser").value; toast("Usuario de plataforma creado. Ahora ingresa."); show("vLogin"); }catch(e){ $("suErr").textContent=e.message; } };
function setUser(u){ USER=u; EMP=u.empresa||null; SUCS=u.sucursales||[]; const saved=+ls.get("ag-suc-"+u.id); SUC=SUCS.some(s=>s.id===saved)?saved:(SUCS[0]?.id||null); }
async function doLogin(){ $("lgErr").textContent=""; $("lgBtn").disabled=true;
  try{ const j=await api("login",{body:{usuario:$("lgUser").value,password:$("lgPass").value}}); TOKEN=j.token; ls.set("ag-token",TOKEN); $("lgPass").value=""; setUser(j.usuario); startApp(); }
  catch(e){ $("lgErr").textContent=e.message; } $("lgBtn").disabled=false; }
$("lgBtn").onclick=doLogin; $("lgPass").addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
function logoutLocal(){ endTour(); TOKEN=null; USER=null; ls.del("ag-token"); show("vLogin"); }
$("logout").onclick=async()=>{ try{ await api("login",{method:"DELETE"}); }catch(e){} logoutLocal(); };

// ===================== Navegación =====================
const VIEWS=[
  {id:"plataforma",t:"Empresas",ok:()=>USER.super,f:viewPlataforma},
  {id:"panel",t:"Dashboard",ok:()=>!USER.super,f:viewPanel},
  {id:"registrar",t:"Registrar",ok:()=>can("registrar")||can("mantenimiento"),f:viewRegistrar},
  {id:"vehiculos",t:"Vehículos",ok:()=>!USER.super,f:viewVehiculos},
  {id:"mantenimiento",t:"Mantenimiento",ok:()=>can("mantenimiento")||can("vehiculos"),f:viewMantenimiento},
  {id:"historial",t:"Historial",ok:()=>can("registrar")||can("reportes")||can("mantenimiento"),f:viewHistorial},
  {id:"reportes",t:"Costos",ok:()=>can("reportes"),f:viewReportes},
  {id:"conductores",t:"Conductores",ok:()=>can("vehiculos"),f:viewConductores},
  {id:"sucursales",t:"Parqueos",ok:()=>can("sucursales"),f:viewSucursales},
  {id:"usuarios",t:"Usuarios",ok:()=>can("usuarios"),f:viewUsuarios},
  {id:"config",t:"Empresa",ok:()=>can("usuarios"),f:viewConfig}];
let CUR=null;
async function startApp(){ show("vApp"); $("who").textContent=USER.nombre;
  if(!$("helpBtn")){ const hb=document.createElement("button"); hb.id="helpBtn"; hb.className="sec"; hb.title="¿Cómo se usa esta pantalla?"; hb.setAttribute("aria-label","Ayuda de esta pantalla"); hb.textContent="?";
    hb.onclick=()=>startTour(CUR,true); $("logout").before(hb); }
  $("brand").textContent=USER.super?"Plataforma":EMP.nombre; document.title=(USER.super?"Plataforma":EMP.nombre)+" · FlotaControl";
  if(!USER.super){ try{ ALLSUCS=(await api("m/sucursales")).items; }catch(e){ ALLSUCS=SUCS; } }
  drawSucSel(); drawAviso();
  const vs=VIEWS.filter(v=>v.ok()); $("nav").innerHTML=vs.map(v=>`<button data-v="${v.id}">${v.t}</button>`).join("");
  $("nav").querySelectorAll("button").forEach(b=>b.onclick=()=>go(b.dataset.v));
  if(!vs.length){ $("main").innerHTML=`<div class="card">Tu usuario no tiene permisos asignados. Pide al administrador que te los active.</div>`; return; }
  if(!USER.super&&!SUCS.length){ $("main").innerHTML=`<div class="card">Tu usuario no tiene sucursales asignadas o no hay sucursales activas.</div>`; }
  const hv=location.hash.match(/^#v=([a-f0-9]+)/i);
  if(hv&&!USER.super){ history.replaceState(null,"",location.pathname); try{ await cargarVeh(); const v=VEH.find(x=>x.codigo===hv[1].toLowerCase()); if(v&&(can("registrar")||can("mantenimiento"))){ PRESEL={vehiculo_id:v.id}; return go("registrar"); } }catch(e){} }
  go(vs[0].id); }
function drawAviso(){ let a=$("aviso"); if(!a){ a=document.createElement("div"); a.id="aviso"; $("main").before(a); }
  const v=USER.aviso; a.innerHTML=v?`<div style="max-width:1200px;margin:12px auto 0;padding:0 16px"><div class="card" style="border-color:var(--${v.nivel});background:var(--${v.nivel}-soft);color:var(--${v.nivel});font-weight:600">${v.nivel==="bad"?"⛔":"⚠️"} ${esc(v.texto)}</div></div>`:""; }
function drawSucSel(){ const w=$("sucWrap"); if(USER.super||!SUCS.length){ w.innerHTML=""; return; }
  w.innerHTML=SUCS.length>1?`<select id="sucSel" aria-label="Sucursal">${SUCS.map(s=>`<option value="${s.id}" ${s.id===SUC?"selected":""}>📍 ${esc(s.nombre)}</option>`).join("")}</select>`:`<span class="chip">📍 ${esc(SUCS[0].nombre)}</span>`;
  const s=$("sucSel"); if(s) s.onchange=()=>{ SUC=+s.value; ls.set("ag-suc-"+USER.id,SUC); if(CUR) go(CUR); }; }
function go(id){ CUR=id; $("nav").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.v===id)); const v=VIEWS.find(x=>x.id===id);
  $("main").innerHTML=`<p class="muted">Cargando…</p>`; endTour();
  v.f().then(()=>{ if(CUR===id) setTimeout(()=>maybeTour(id),350); }).catch(e=>{ $("main").innerHTML=`<div class="card err">${esc(e.message)}</div>`; }); }

// ===================== Plataforma (dueño) =====================
let PLAT=null;
const diasA=(f,h)=>Math.round((new Date(f+"T12:00:00Z")-new Date(h+"T12:00:00Z"))/864e5);
function estadoEmp(e){ const h=PLAT.hoy; if(!e.activo) return ["Suspendida","bad"]; if(!e.vence) return ["Sin vencimiento","ok"];
  const d=diasA(e.vence,h); if(d<-PLAT.gracia) return ["Bloqueada por falta de pago","bad"]; if(d<0) return [`En gracia (${PLAT.gracia+d} días)`,"bad"]; if(d<=7) return [`Vence en ${d} días`,"warn"]; return ["Al día","ok"]; }
const precioEmp=e=>e.precio??PLAT.planes[e.plan||"emprendedor"].precio;
async function viewPlataforma(){ PLAT=await api("plataforma"); const E=PLAT.empresas, h=PLAT.hoy;
  const activas=E.filter(e=>e.activo&&(!e.vence||diasA(e.vence,h)>=-PLAT.gracia)), mrr=activas.reduce((a,e)=>a+precioEmp(e),0);
  const porCobrar=E.filter(e=>e.activo&&e.vence&&diasA(e.vence,h)<=7);
  $("main").innerHTML=`<h2>Empresas</h2><div class="kpis"><div class="card kpi"><div class="v">${activas.length} / ${E.length}</div><div class="l">Empresas activas</div></div>
    <div class="card kpi"><div class="v num">Bs ${fmtN(mrr,0)}</div><div class="l">Ingreso mensual esperado</div></div>
    <div class="card kpi"><div class="v num">Bs ${fmtN(PLAT.cobrado_mes.total,0)}</div><div class="l">Cobrado este mes (${PLAT.cobrado_mes.n} pagos)</div></div>
    <div class="card kpi"><div class="v" style="color:${porCobrar.length?"var(--warn)":"inherit"}">${porCobrar.length}</div><div class="l">Por cobrar (vencen en 7 días o vencidas)</div></div></div>
    <div class="toolbar"><button id="enew">+ Nueva empresa</button></div>
    <div class="card tbl"><table><thead><tr><th>Empresa</th><th>Plan</th><th class="n">Precio</th><th>Vence</th><th>Estado</th><th>Uso</th><th class="n">Registros 30d</th><th></th></tr></thead><tbody>
    ${E.map(e=>{ const [t,c]=estadoEmp(e), L=PLAT.planes[e.plan||"emprendedor"]; return `<tr class="click" data-id="${e.id}"><td><b>${esc(e.nombre)}</b><br><small class="muted">${esc(e.admins||"")}</small></td>
      <td>${esc(L.nombre)}</td><td class="n">Bs ${fmtN(precioEmp(e),0)}</td><td>${esc(e.vence||"—")}<br><small class="muted">${e.ultimo_pago?"Últ. pago "+esc(e.ultimo_pago.slice(0,10)):"Sin pagos"}</small></td>
      <td><span class="chip ${c}">${t}</span></td><td><small>${e.vehiculos} vehículos · ${e.sucursales} parqueos · ${e.usuarios} usu</small></td><td class="n">${e.eventos_30d}</td>
      <td class="right">${e.vence&&diasA(e.vence,h)<=7&&e.telefono_admin?`<a class="btn sec" data-wa="${e.id}" target="_blank" rel="noopener">Recordar</a>`:""}</td></tr>`; }).join("")||'<tr><td colspan="8" class="muted">Crea tu primera empresa.</td></tr>'}</tbody></table></div>`;
  $("main").querySelectorAll("[data-wa]").forEach(a=>{ const e=E.find(x=>x.id==a.dataset.wa), t=e.telefono_admin.length===8?"591"+e.telefono_admin:e.telefono_admin;
    a.href=`https://wa.me/${t}?text=${encodeURIComponent(recordatorio(e))}`; a.onclick=ev=>ev.stopPropagation(); });
  $("enew").onclick=()=>empresaForm(null);
  const tb=$("enew").parentElement; const bd=document.createElement("button"); bd.className="sec"; bd.textContent="🧪 Crear / regenerar empresa demo"; tb.appendChild(bd);
  bd.onclick=async()=>{ if(!confirm("Se crea (o se borra y vuelve a crear) la empresa 'Transportes Demo' con 6 meses de datos ficticios. ¿Continuar?")) return; bd.disabled=true; bd.textContent="Generando datos…";
    try{ const r=await api("demo",{body:{}}); dialog(`<h3>🧪 Empresa demo lista</h3><p><b>${esc(r.empresa)}</b> con ${r.registros} registros de los últimos 6 meses.</p>
      <div class="tbl"><table><thead><tr><th>Usuario</th><th>Contraseña</th><th>Qué ve</th></tr></thead><tbody>${r.usuarios.map(u=>`<tr><td><b>${esc(u.usuario)}</b></td><td>${esc(u.clave)}</td><td><small>${esc(u.perfil)}</small></td></tr>`).join("")}</tbody></table></div>
      <p class="muted">Ábrelo en otra ventana privada o en otro navegador para no cerrar tu sesión. Regenérala antes de cada demo para que las fechas queden al día.</p><div class="acts"><button id="dx">Listo</button></div>`, B=>B.querySelector("#dx").onclick=()=>{ closeDlg(); go("plataforma"); }); }
    catch(e){ toast(e.message); } bd.disabled=false; bd.textContent="🧪 Crear / regenerar empresa demo"; };
  document.querySelectorAll("#main tr[data-id]").forEach(tr=>tr.onclick=e=>{ if(e.target.closest("a")) return; empresaForm(E.find(x=>x.id==tr.dataset.id)); }); }
function recordatorio(e){ const d=diasA(e.vence,PLAT.hoy);
  return `Hola, te escribimos por el sistema de inventario de *${e.nombre}*. ${d>=0?`Tu suscripción vence el ${e.vence}.`:`Tu suscripción venció el ${e.vence} y el sistema se bloqueará pronto.`} El monto es *Bs ${fmtN(precioEmp(e),0)}* al mes. Puedes pagar por QR o transferencia y enviarnos el comprobante por aquí. ¡Gracias!`; }
const planOpts=sel=>Object.entries(PLAT.planes).map(([k,p])=>`<option value="${k}" ${k===sel?"selected":""}>${p.nombre} — Bs ${p.precio}/mes (${p.vehiculos??"∞"} vehículos, ${p.sucursales??"∞"} parqueos, ${p.usuarios??"∞"} usu)</option>`).join("");
async function empresaForm(e){
  if(!e) return dialog(`<h3>Nueva empresa</h3><div class="row"><div class="field"><label>Nombre de la empresa *</label><input id="en"></div><div class="field"><label>Identificador web (catálogo)</label><input id="es" placeholder="se genera del nombre"></div></div>
      <div class="field"><label>Plan</label><select id="epl">${planOpts("basico")}</select></div>
      <div class="row"><div class="field"><label>Precio especial (vacío = el del plan)</label><input id="epr" inputmode="decimal"></div><div class="field"><label>Prueba gratis hasta</label><input type="date" id="ev" value="${sumarDiasLocal(14)}"></div></div>
      <h3>Administrador de la empresa</h3><div class="row"><div class="field"><label>Nombre</label><input id="an"></div><div class="field"><label>Celular (para cobros)</label><input id="at" inputmode="tel"></div></div>
      <div class="row"><div class="field"><label>Usuario *</label><input id="au" autocapitalize="none" placeholder="ej: juan.ferreteria"></div><div class="field"><label>Contraseña inicial *</label><input id="ap" type="password"></div></div>
      <div class="err" id="eerr"></div><div class="acts"><button class="sec" id="ex">Cancelar</button><button id="eok">Crear empresa</button></div>`, b=>{
      b.querySelector("#ex").onclick=closeDlg;
      b.querySelector("#eok").onclick=async()=>{ try{ const r=await api("plataforma",{body:{nombre:val(b,"#en"),slug:val(b,"#es"),plan:val(b,"#epl"),precio:val(b,"#epr"),vence:val(b,"#ev"),
          admin_nombre:val(b,"#an"),telefono_admin:val(b,"#at"),admin_usuario:val(b,"#au"),admin_password:val(b,"#ap")}}); closeDlg(); toast("Empresa creada"); go("plataforma"); }
        catch(x){ b.querySelector("#eerr").textContent=x.message; } }; });
  const pg=(await api("plataforma?pagos="+e.id)).pagos, [t,c]=estadoEmp(e), pr=precioEmp(e);
  dialog(`<h3>${esc(e.nombre)} <span class="chip ${c}">${t}</span></h3><p class="muted">Vence: <b>${esc(e.vence||"sin vencimiento")}</b></p>
    <div class="card" style="background:var(--accent-soft);border-color:var(--accent)"><h3>💰 Registrar pago</h3>
      <div class="row"><div class="field"><label>Meses que cubre</label><select id="pm">${[1,2,3,6,12].map(m=>`<option value="${m}">${m} ${m===1?"mes":"meses"}</option>`).join("")}</select></div>
        <div class="field"><label>Monto (Bs)</label><input id="pmo" inputmode="decimal" value="${pr}"></div>
        <div class="field"><label>Método</label><select id="pmt"><option>QR</option><option>Transferencia</option><option>Efectivo</option><option>Otro</option></select></div></div>
      <div class="row"><div class="field"><label>N° de comprobante</label><input id="pref"></div><div class="field"><label>Nota</label><input id="pno"></div></div>
      <p class="muted" id="pinfo"></p><button id="pok">Registrar pago</button></div>
    <h3 style="margin-top:16px">Plan y datos</h3>
    <div class="row"><div class="field"><label>Nombre</label><input id="en" value="${esc(e.nombre)}"></div><div class="field"><label>Celular del administrador (cobros)</label><input id="et" value="${esc(e.telefono_admin||"")}" inputmode="tel"></div></div>
    <div class="field"><label>Plan</label><select id="epl">${planOpts(e.plan||"emprendedor")}</select></div>
    <div class="row"><div class="field"><label>Precio especial (vacío = del plan)</label><input id="epr" inputmode="decimal" value="${e.precio??""}"></div><div class="field"><label>Vencimiento (ajuste manual)</label><input type="date" id="ev" value="${esc(e.vence||"")}"></div></div>
    <div class="row"><div class="field"><label>Límite parqueos (vacío = plan)</label><input id="ls" inputmode="numeric" value="${e.max_sucursales??""}"></div><div class="field"><label>Límite usuarios</label><input id="lu" inputmode="numeric" value="${e.max_usuarios??""}"></div><div class="field"><label>Límite vehículos</label><input id="lv" inputmode="numeric" value="${e.max_vehiculos??""}"></div></div>
    <label class="check"><input type="checkbox" id="ea" ${e.activo?"checked":""}> Empresa activa (desmarca para suspender de inmediato)</label>
    <div class="acts" style="justify-content:flex-start"><button class="sec" id="eok">Guardar cambios</button></div>
    <h3 style="margin-top:16px">Historial de pagos</h3><div class="tbl"><table><thead><tr><th>Fecha</th><th class="n">Monto</th><th>Meses</th><th>Nuevo vencimiento</th><th>Método</th><th>Comprobante</th></tr></thead><tbody>
      ${pg.map(p=>`<tr><td>${esc(p.fecha.slice(0,10))}</td><td class="n">Bs ${fmtN(p.monto)}</td><td>${p.meses}</td><td>${esc(p.vence_nuevo)}</td><td>${esc(p.metodo||"")}</td><td>${esc(p.ref||"")}</td></tr>`).join("")||'<tr><td colspan="6" class="muted">Sin pagos registrados.</td></tr>'}</tbody></table></div>
    <h3 style="margin-top:16px">Restablecer contraseña</h3><div class="row"><div class="field"><label>Usuario</label><input id="ru" placeholder="${esc((e.admins||"").split(", ")[0]||"")}"></div><div class="field"><label>Nueva contraseña</label><input id="rp" type="password"></div></div>
    <div class="err" id="eerr"></div><div class="acts"><button class="sec" id="erst">Restablecer</button>${e.telefono_admin?`<a class="btn sec" id="ewa" target="_blank" rel="noopener">Recordar pago por WhatsApp</a>`:""}<button class="sec" id="ex">Cerrar</button></div>`, b=>{
    const errEl=b.querySelector("#eerr"), base=e.vence&&e.vence>=PLAT.hoy?e.vence:PLAT.hoy;
    const info=()=>{ const m=+val(b,"#pm"); b.querySelector("#pinfo").textContent=`El nuevo vencimiento será el ${sumarMesesLocal(base,m)}.`; b.querySelector("#pmo").value=fmtN(pr*m,0).replace(/\./g,"").replace(",","."); };
    b.querySelector("#pm").onchange=info; info();
    const wa=b.querySelector("#ewa"); if(wa){ const t=e.telefono_admin.length===8?"591"+e.telefono_admin:e.telefono_admin; wa.href=`https://wa.me/${t}?text=${encodeURIComponent(recordatorio(e))}`; }
    b.querySelector("#ex").onclick=closeDlg;
    b.querySelector("#pok").onclick=async()=>{ errEl.textContent="";
      try{ const r=await api("plataforma",{body:{id:e.id,pago:{meses:val(b,"#pm"),monto:val(b,"#pmo"),metodo:val(b,"#pmt"),ref:val(b,"#pref"),nota:val(b,"#pno")}}});
        closeDlg(); toast(`Pago registrado. Vence el ${r.vence}`); go("plataforma"); }catch(x){ errEl.textContent=x.message; } };
    b.querySelector("#eok").onclick=async()=>{ errEl.textContent="";
      try{ await api("plataforma",{body:{id:e.id,nombre:val(b,"#en"),telefono_admin:val(b,"#et"),plan:val(b,"#epl"),precio:val(b,"#epr"),vence:val(b,"#ev"),activo:b.querySelector("#ea").checked,
          max_sucursales:val(b,"#ls"),max_usuarios:val(b,"#lu"),max_vehiculos:val(b,"#lv")}}); closeDlg(); toast("Empresa actualizada"); go("plataforma"); }catch(x){ errEl.textContent=x.message; } };
    b.querySelector("#erst").onclick=async()=>{ errEl.textContent="";
      try{ await api("plataforma",{body:{id:e.id,reset_usuario:val(b,"#ru"),reset_password:val(b,"#rp")}}); toast("Contraseña restablecida"); b.querySelector("#rp").value=""; }catch(x){ errEl.textContent=x.message; } }; }); }
function sumarDiasLocal(n){ return daysAgo(-n); }
function sumarMesesLocal(f,m){ const x=new Date(f+"T12:00:00Z"), d=x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth()+m); const fin=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate(); x.setUTCDate(Math.min(d,fin)); return x.toISOString().slice(0,10); }

// ===================== Sucursales =====================
async function viewSucursales(){ ALLSUCS=(await api("m/sucursales")).items;
  $("main").innerHTML=`<h2>Parqueos</h2><div class="toolbar"><button id="snew">+ Nuevo parqueo</button></div><div class="card tbl"><table><thead><tr><th>Nombre</th><th>Dirección</th><th class="n">Vehículos</th><th>Estado</th></tr></thead><tbody>
    ${ALLSUCS.map(s=>`<tr class="click" data-id="${s.id}"><td>${esc(s.nombre)}</td><td>${esc(s.direccion)}</td><td class="n">${s.vehiculos}</td><td>${s.activo?'<span class="chip ok">Activa</span>':'<span class="chip">Inactiva</span>'}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted">Cada vehículo pertenece a un parqueo (base, sucursal o garaje). En Usuarios eliges a qué parqueos accede cada uno: un conductor asignado a un parqueo solo ve los vehículos de ese parqueo.</p>`;
  const form=s=>dialog(`<h3>${s?"Editar":"Nuevo"} parqueo</h3><div class="field"><label>Nombre *</label><input id="sn" value="${esc(s?.nombre||"")}"></div>
    <div class="row"><div class="field"><label>Dirección</label><input id="sa" value="${esc(s?.direccion||"")}"></div><div class="field"><label>Teléfono</label><input id="st" value="${esc(s?.telefono||"")}"></div></div>
    ${s?`<label class="check"><input type="checkbox" id="sac" ${s.activo?"checked":""}> Activa</label>`:""}<div class="err" id="serr"></div><div class="acts"><button class="sec" id="sx">Cancelar</button><button id="sok">Guardar</button></div>`, b=>{
    b.querySelector("#sx").onclick=closeDlg;
    b.querySelector("#sok").onclick=async()=>{ try{ await api("m/sucursales",{body:{id:s?.id,nombre:val(b,"#sn"),direccion:val(b,"#sa"),telefono:val(b,"#st"),activo:s?b.querySelector("#sac").checked:true}});
      closeDlg(); toast("Parqueo guardado"); const me=await api("login"); setUser(me.usuario); drawSucSel(); go("sucursales"); }catch(e){ b.querySelector("#serr").textContent=e.message; } }; });
  $("snew").onclick=()=>form(null); document.querySelectorAll("#main tr[data-id]").forEach(tr=>tr.onclick=()=>form(ALLSUCS.find(s=>s.id==tr.dataset.id))); }

// ===================== Usuarios =====================
const PRESETS={Administrador:["registrar","mantenimiento","vehiculos","reportes","sucursales","usuarios"],"Jefe de flota":["registrar","mantenimiento","vehiculos","reportes"],"Conductor":["registrar"]};
async function viewUsuarios(){ const j=await api("usuarios"); ALLSUCS=(await api("m/sucursales")).items;
  $("main").innerHTML=`<h2>Usuarios y permisos</h2><div class="toolbar"><button id="unew">+ Nuevo usuario</button></div><div class="card tbl"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Parqueos</th><th>Permisos</th><th>Estado</th></tr></thead><tbody>
    ${j.usuarios.map(u=>`<tr class="click" data-id="${u.id}"><td>${esc(u.nombre)}</td><td>${esc(u.usuario)}</td><td><small>${u.sucursales.length?u.sucursales.map(sucName).map(esc).join(", "):"Todas"}</small></td>
      <td>${u.permisos.map(p=>`<span class="chip">${esc(j.permisos[p]||p)}</span>`).join(" ")}</td><td>${u.activo?'<span class="chip ok">Activo</span>':'<span class="chip bad">Inactivo</span>'}</td></tr>`).join("")}</tbody></table></div>`;
  $("unew").onclick=()=>userForm(null,j.permisos); document.querySelectorAll("#main tr[data-id]").forEach(tr=>tr.onclick=()=>userForm(j.usuarios.find(u=>u.id==tr.dataset.id),j.permisos)); }
function userForm(u,P){ const perms=new Set(u?u.permisos:PRESETS.Vendedor), sucs=new Set(u?u.sucursales:[]);
  dialog(`<h3>${u?"Editar usuario":"Nuevo usuario"}</h3><div class="row"><div class="field"><label>Nombre</label><input id="un" value="${esc(u?.nombre||"")}"></div>
    <div class="field"><label>Usuario (único en toda la plataforma)</label><input id="uu" value="${esc(u?.usuario||"")}" ${u?"disabled":""} autocapitalize="none" placeholder="ej: ana.${esc(EMP.slug)}"></div></div>
    <div class="field"><label>${u?"Nueva contraseña (vacía = no cambia)":"Contraseña (mínimo 8)"}</label><input id="up" type="password" autocomplete="new-password"></div>
    <label>Parqueos a los que tiene acceso</label><div class="perms" style="margin-bottom:12px">${ALLSUCS.filter(s=>s.activo).map(s=>`<label class="check"><input type="checkbox" data-suc="${s.id}" ${sucs.has(s.id)?"checked":""}> ${esc(s.nombre)}</label>`).join("")}</div>
    <p class="muted" style="margin-top:-6px">Si no marcas ninguna, tiene acceso a todas.</p>
    <label>Permisos</label><div class="preset">${Object.keys(PRESETS).map(k=>`<button class="sec" data-pre="${esc(k)}">${esc(k)}</button>`).join("")}</div>
    <div class="perms">${Object.entries(P).map(([k,t])=>`<label class="check"><input type="checkbox" data-perm="${k}" ${perms.has(k)?"checked":""}> ${esc(t)}</label>`).join("")}</div>
    ${u?`<label class="check" style="margin-top:10px"><input type="checkbox" id="ua" ${u.activo?"checked":""}> Usuario activo</label>`:""}
    <div class="err" id="uerr"></div><div class="acts"><button class="sec" id="ux">Cancelar</button><button id="uok">Guardar</button></div>`, b=>{
    b.querySelectorAll("[data-pre]").forEach(x=>x.onclick=()=>{ const s=PRESETS[x.dataset.pre]; b.querySelectorAll("[data-perm]").forEach(c=>c.checked=s.includes(c.dataset.perm)); });
    b.querySelector("#ux").onclick=closeDlg;
    b.querySelector("#uok").onclick=async()=>{ b.querySelector("#uerr").textContent="";
      const body={nombre:val(b,"#un"),permisos:[...b.querySelectorAll("[data-perm]:checked")].map(c=>c.dataset.perm),sucursales:[...b.querySelectorAll("[data-suc]:checked")].map(c=>+c.dataset.suc)};
      const pw=val(b,"#up"); if(pw) body.password=pw; if(u){ body.id=u.id; body.activo=b.querySelector("#ua").checked; } else body.usuario=val(b,"#uu");
      try{ await api("usuarios",{body}); closeDlg(); toast("Usuario guardado"); go("usuarios"); }catch(e){ b.querySelector("#uerr").textContent=e.message; } }; }); }

// ===================== Cámara: lector de códigos =====================
let ZX=null;
function loadZXing(){ if(window.ZXing) return Promise.resolve(); if(ZX) return ZX;
  ZX=new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js"; s.onload=res; s.onerror=()=>{ ZX=null; rej(new Error("lib")); }; document.head.appendChild(s); }); return ZX; }
function beepScan(){ try{ const C=window.AudioContext||window.webkitAudioContext; const a=beepScan.c||(beepScan.c=new C()), o=a.createOscillator(), g=a.createGain(); o.frequency.value=1200; g.gain.value=.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+.09); }catch(e){} }
async function scan({titulo="Escanear código",continuo=false,onCode}){
  const ov=document.createElement("div"); ov.className="scan"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-label",titulo);
  ov.innerHTML=`<div class="scanbox"><div class="scanhd"><b>${esc(titulo)}</b><button class="sec" id="scx">${continuo?"Listo":"Cerrar"}</button></div>
    <div class="scanvid"><video playsinline muted autoplay></video><div class="scanline"></div></div><p id="scmsg" aria-live="polite">Abriendo la cámara…</p>
    ${continuo?`<div class="scanlog" id="sclog"></div>`:""}<div class="inline"><div class="field" style="margin:0"><input id="scman" placeholder="O escribe el código" inputmode="numeric"></div><button id="scok">OK</button></div></div>`;
  document.body.appendChild(ov);
  const video=ov.querySelector("video"), msg=ov.querySelector("#scmsg"); let stream=null, stop=false, last="", lastT=0, reader=null;
  const close=()=>{ stop=true; try{ reader&&reader.reset(); }catch(e){} [stream,video.srcObject].forEach(s=>s&&s.getTracks&&s.getTracks().forEach(t=>t.stop())); ov.remove(); };
  const hit=code=>{ code=String(code||"").trim(); if(!code) return; const now=Date.now(); if(code===last&&now-lastT<2500) return; last=code; lastT=now;
    beepScan(); if(navigator.vibrate) navigator.vibrate(60); const r=onCode(code)||("Leído: "+code); msg.textContent=r;
    const log=ov.querySelector("#sclog"); if(log){ const d=document.createElement("div"); d.textContent=r; log.prepend(d); }
    if(!continuo) setTimeout(close,350); };
  ov.querySelector("#scx").onclick=close; ov.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); });
  ov.querySelector("#scok").onclick=()=>{ const i=ov.querySelector("#scman"); hit(i.value); i.value=""; };
  ov.querySelector("#scman").addEventListener("keydown",e=>{ if(e.key==="Enter") ov.querySelector("#scok").click(); });
  if(!navigator.mediaDevices?.getUserMedia){ msg.textContent="Este navegador no permite usar la cámara. Escribe el código abajo."; return; }
  const fallo=e=>{ if(stop) return; msg.textContent=e&&e.name==="NotAllowedError"?"No diste permiso para usar la cámara. Actívalo en el candado de la barra de direcciones, o escribe el código abajo."
    :e&&e.name==="NotFoundError"?"No se encontró una cámara en este equipo. Escribe el código abajo.":"No se pudo abrir la cámara. Escribe el código abajo."; };
  try{
    const fmts=("BarcodeDetector" in window)&&BarcodeDetector.getSupportedFormats?await BarcodeDetector.getSupportedFormats():[];
    if(fmts.includes("ean_13")){ // lector nativo (Chrome en Android)
      const det=new BarcodeDetector({formats:fmts.filter(f=>["ean_13","ean_8","upc_a","upc_e","code_128","code_39","code_93","itf","codabar","qr_code"].includes(f))});
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280}},audio:false});
      if(stop){ stream.getTracks().forEach(t=>t.stop()); return; } video.srcObject=stream; await video.play(); msg.textContent="Apunta al código de barras";
      const loop=async()=>{ if(stop) return; try{ const r=await det.detect(video); if(r[0]) hit(r[0].rawValue); }catch(e){} setTimeout(loop,150); }; loop();
    } else { // iPhone y otros navegadores: librería ZXing
      await loadZXing(); if(stop) return; reader=new ZXing.BrowserMultiFormatReader(); msg.textContent="Apunta al código de barras";
      await reader.decodeFromConstraints({video:{facingMode:{ideal:"environment"}},audio:false},video,res=>{ if(res&&!stop) hit(res.getText()); });
      if(stop) try{ reader.reset(); }catch(e){}
    }
  }catch(e){ fallo(e); }
}

// ===================== Parqueo: utilidades =====================
const TZ="America/La_Paz";
const hora=s=>s?new Date(s).toLocaleString("es-BO",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}):"";
const fechaHora=s=>s?new Date(s).toLocaleString("es-BO",{timeZone:TZ,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
const dur=m=>{ m=Math.max(0,Math.round(m||0)); const d=Math.floor(m/1440), h=Math.floor(m%1440/60), mi=m%60; return (d?`${d} d `:"")+(d||h?`${h} h `:"")+`${mi} min`; };
const sucActual=()=>SUCS.find(s=>s.id===SUC)||SUCS[0];
let TAR=[], TIMER=null;
async function cargarTarifas(){ TAR=(await api("tarifas")).tarifas; return TAR; }
const tarDe=sid=>TAR.filter(t=>t.sucursal_id===sid&&t.activo);
function tarifaTexto(t){ if(t.modo==="plana") return `Tarifa plana ${money(t.precio_plano)} (sin límite de tiempo)`;
  const f=t.fraccion_min===60?"hora":`${t.fraccion_min} min`; return `${money(t.precio_hora)}/hora, cobro cada ${f}${t.tolerancia_min?` · ${t.tolerancia_min} min de tolerancia`:""}${t.minimo?` · mínimo ${money(t.minimo)}`:""}${t.tope_dia?` · máximo ${money(t.tope_dia)} por día`:""}`; }
// misma fórmula que el servidor, para simular en pantalla
function calcLocal(t,min){ min=Math.max(0,Math.ceil(min)); if(t.modo==="plana") return +t.precio_plano||0; if(min<=(t.tolerancia_min||0)) return 0;
  const fr=Math.max(1,t.fraccion_min||60), pf=(t.precio_hora||0)*fr/60, tramo=m=>{ if(m<=0) return 0; let v=Math.ceil(m/fr)*pf; v=Math.max(v,t.minimo||0); return t.tope_dia>0?Math.min(v,t.tope_dia):v; };
  return Math.round((t.tope_dia>0&&min>1440?Math.floor(min/1440)*t.tope_dia+tramo(min%1440):tramo(min))*100)/100; }
async function fotoUrl(k){ if(!k) return ""; try{ const r=await fetch("/api/foto?k="+encodeURIComponent(k),{headers:{authorization:"Bearer "+TOKEN}}); if(!r.ok) return ""; return URL.createObjectURL(await r.blob()); }catch(e){ return ""; } }
async function pintarFotos(root){ for(const img of root.querySelectorAll("img[data-k]")){ const u=await fotoUrl(img.dataset.k); if(u) img.src=u; else img.replaceWith(Object.assign(document.createElement("span"),{className:"muted",textContent:"Foto no disponible"})); } }
function comprimirFoto(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file), im=new Image();
  im.onload=()=>{ const k=Math.min(1,900/Math.max(im.width,im.height)), c=document.createElement("canvas"); c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
    c.getContext("2d").drawImage(im,0,0,c.width,c.height); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg",.7)); }; im.onerror=()=>{ URL.revokeObjectURL(u); rej(); }; im.src=u; }); }
const fotoCampo=(id,label)=>`<div class="field"><label>${label}</label><div class="toolbar" style="margin:0;align-items:center">
  <button type="button" class="sec" id="${id}Cam">📷 Tomar foto</button><label class="btn sec" style="margin:0;color:var(--ink)">🖼️ Elegir archivo<input type="file" id="${id}" accept="image/*" hidden></label>
  <img id="${id}Prev" class="hidden" alt="Foto tomada" style="height:70px;border-radius:8px"></div></div>`;
function enlazarFoto(B,id,set){ const listo=d=>{ set(d); const p=B.querySelector("#"+id+"Prev"); p.src=d; p.classList.remove("hidden"); };
  B.querySelector("#"+id).onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ listo(await comprimirFoto(f)); }catch(x){ toast("No se pudo leer la foto"); } };
  B.querySelector("#"+id+"Cam").onclick=()=>camaraFoto().then(d=>{ if(d) listo(d); }); }
// Cámara en vivo (celular o cámara web de la PC). Devuelve la foto comprimida, o null si se cancela.
function camaraFoto(){ return new Promise(resolve=>{
  const ov=document.createElement("div"); ov.className="scan"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-label","Tomar foto");
  ov.innerHTML=`<div class="scanbox"><div class="scanhd"><b>📷 Tomar foto</b><button class="sec" id="cx">Cancelar</button></div>
    <div class="scanvid" style="aspect-ratio:4/3"><video playsinline muted autoplay></video></div><p id="cm" aria-live="polite">Abriendo la cámara…</p>
    <div class="toolbar" style="margin:0"><button id="cs" style="flex:1;font-size:1.1rem;padding:12px" disabled>Capturar</button><button class="sec hidden" id="cf">Cambiar cámara</button></div>
    <p class="muted" style="margin-top:10px">¿No funciona? <label class="link" style="color:var(--accent);cursor:pointer;text-decoration:underline">usa la cámara del sistema<input type="file" id="ci" accept="image/*" capture="environment" hidden></label></p></div>`;
  ov.querySelector(".scanvid").style.setProperty("--x","0"); document.body.appendChild(ov);
  const v=ov.querySelector("video"), msg=ov.querySelector("#cm"); let stream=null, cams=[], idx=0, done=false;
  const stop=()=>{ if(stream) stream.getTracks().forEach(t=>t.stop()); stream=null; };
  const fin=d=>{ if(done) return; done=true; stop(); ov.remove(); resolve(d); };
  const abrir=async()=>{ stop(); try{
      const c=cams[idx]; stream=await navigator.mediaDevices.getUserMedia({video:c?{deviceId:{exact:c.deviceId}}:{facingMode:{ideal:"environment"},width:{ideal:1280}},audio:false});
      v.srcObject=stream; await v.play(); msg.textContent="Encuadra el vehículo y la placa"; ov.querySelector("#cs").disabled=false;
      if(!cams.length){ cams=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput"); if(cams.length>1) ov.querySelector("#cf").classList.remove("hidden"); }
    }catch(e){ msg.textContent=e&&e.name==="NotAllowedError"?"No diste permiso para usar la cámara. Actívalo en el candado 🔒 de la barra de direcciones, o usa la cámara del sistema (abajo).":e&&e.name==="NotFoundError"?"No se encontró una cámara en este equipo. Usa la opción de abajo para elegir una foto.":"No se pudo abrir la cámara. Usa la opción de abajo."; } };
  ov.querySelector("#cx").onclick=()=>fin(null); ov.addEventListener("keydown",e=>{ if(e.key==="Escape") fin(null); });
  ov.querySelector("#cf").onclick=()=>{ idx=(idx+1)%cams.length; abrir(); };
  ov.querySelector("#cs").onclick=()=>{ if(!v.videoWidth) return; const k=Math.min(1,900/Math.max(v.videoWidth,v.videoHeight)), c=document.createElement("canvas");
    c.width=Math.round(v.videoWidth*k); c.height=Math.round(v.videoHeight*k); c.getContext("2d").drawImage(v,0,0,c.width,c.height); beepScan(); fin(c.toDataURL("image/jpeg",.7)); };
  ov.querySelector("#ci").onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ fin(await comprimirFoto(f)); }catch(x){ toast("No se pudo leer la foto"); } };
  if(!navigator.mediaDevices?.getUserMedia){ msg.textContent="Este navegador no permite abrir la cámara directo. Usa la opción de abajo."; return; }
  abrir(); }); }
function qrSvg(texto){ try{ const q=qrcode(0,"M"); q.addData(texto); q.make(); return q.createSvgTag({cellSize:4,margin:2}); }catch(e){ return ""; } }
function imprimir(html){ const w=window.open("","_blank","width=380,height=640"); if(!w) return toast("Permite ventanas emergentes para imprimir");
  w.document.write(`<html><head><title>Ticket</title><style>@page{size:58mm auto;margin:3mm}body{font-family:monospace,system-ui;width:52mm;margin:0 auto;font-size:12px;color:#000}h2,h3{margin:4px 0;text-align:center}.c{text-align:center}.big{font-size:22px;font-weight:800;letter-spacing:2px}hr{border:0;border-top:1px dashed #000}table{width:100%}td.r{text-align:right}svg{width:38mm;height:38mm}</style></head><body>${html}<script>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close(); }
function ticketHtml(t){ return `<h3>${esc(EMP.nombre)}</h3><div class="c">${esc(t.sucursal||"")}${EMP.direccion?`<br>${esc(EMP.direccion)}`:""}</div><hr><div class="c">TICKET</div><div class="c big">${esc(t.id)}</div>
  <div class="c">${qrSvg(t.id)}</div><table><tr><td>Placa</td><td class="r"><b>${esc(t.placa)}</b></td></tr><tr><td>Tipo</td><td class="r">${esc(t.tarifa)}</td></tr><tr><td>Entrada</td><td class="r">${fechaHora(t.entrada)}</td></tr></table>
  <hr><div class="c">Presente este ticket a la salida</div>${EMP.ticket_pie?`<div class="c">${esc(EMP.ticket_pie)}</div>`:""}`; }
function reciboHtml(r){ return `<h3>${esc(EMP.nombre)}</h3><div class="c">${esc(r.sucursal||"")}</div><hr><table><tr><td>Ticket</td><td class="r">${esc(r.id)}</td></tr><tr><td>Placa</td><td class="r"><b>${esc(r.placa)}</b></td></tr>
  <tr><td>Tipo</td><td class="r">${esc(r.tarifa)}</td></tr><tr><td>Entrada</td><td class="r">${fechaHora(r.entrada)}</td></tr><tr><td>Salida</td><td class="r">${fechaHora(r.salida)}</td></tr><tr><td>Tiempo</td><td class="r">${dur(r.minutos)}</td></tr></table><hr>
  <table><tr><td><b>TOTAL</b></td><td class="r big" style="font-size:18px">${money(r.monto)}</td></tr><tr><td>Pago</td><td class="r">${({efectivo:"Efectivo",qr:"QR",otro:"Otro"})[r.metodo]||""}</td></tr></table><hr>${EMP.ticket_pie?`<div class="c">${esc(EMP.ticket_pie)}</div>`:""}`; }

// ===================== Flota: datos y utilidades =====================
let VEH=[], COND=[], PRESEL=null;
const TIPOS_EV={combustible:["⛽","Combustible"],mantenimiento:["🔧","Mantenimiento"],lavado:["🧽","Lavado"],gasto:["🧾","Otro gasto"],kilometraje:["📍","Kilometraje"]};
const fmtKm=n=>`${fmtQ(Math.round(n||0))} km`;
const fechaCorta=f=>f?new Date(f+"T12:00:00Z").toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}):"—";
async function cargarVeh(){ VEH=(await api("vehiculos")).vehiculos; return VEH; }
async function cargarCond(){ COND=(await api("conductores")).conductores; return COND; }
const nivelVeh=v=>v.alertas.some(a=>a.nivel==="bad")?"bad":v.alertas.length?"warn":"ok";
const linkQR=v=>`${location.origin}/#v=${v.codigo}`;
function etiquetaQR(v){ imprimir(`<h3>${esc(EMP.nombre)}</h3><div class="c big">${esc(v.placa)}</div><div class="c">${qrSvg(linkQR(v))}</div><div class="c">Escanea para registrar combustible, lavado o kilometraje</div>`); }

// ===================== Dashboard =====================
const barras=(items,key,lab)=>{ const max=Math.max(1,...items.map(x=>x[key]||0)); return items.map(x=>`<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="min-width:74px;font-size:.85rem">${esc(x[lab])}</span>
  <div style="flex:1;background:var(--bg);border-radius:6px;height:16px;overflow:hidden"><div style="height:100%;width:${(x[key]||0)/max*100}%;background:var(--accent)"></div></div><span class="num" style="min-width:90px;text-align:right;font-size:.85rem">${money(x[key]||0)}</span></div>`).join("")||'<p class="muted">Sin datos</p>'; };
const estChip=e=>`<span class="chip ${e==="vencido"?"bad":e==="proximo"?"warn":e==="sin_registro"?"":"ok"}">${e==="vencido"?"Vencido":e==="proximo"?"Próximo":e==="sin_registro"?"Sin registro":"Planificado"}</span>`;
async function viewPanel(){ const admin=can("reportes"); let par=PRESEL?.panel_suc??"", hor=90;
  $("main").innerHTML=`<div class="toolbar" style="justify-content:space-between"><h2 style="margin:0">${admin?"Dashboard de la flota":"Mi panel"}</h2>
    <div class="toolbar" style="margin:0">${SUCS.length>1?`<div><label>Parqueo</label><select id="dp"><option value="">Todos</option>${SUCS.map(s=>`<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></div>`:""}
    ${admin?`<div><label>Desde</label><input type="date" id="dd" value="${daysAgo(29)}"></div><div><label>Hasta</label><input type="date" id="dh" value="${today()}"></div>`:""}<div><label>Planificados a</label><select id="dz"><option value="30">30 días</option><option value="60">60 días</option><option value="90" selected>90 días</option><option value="365">1 año</option></select></div></div></div>
    ${can("registrar")?`<div class="toolbar"><button id="preg">➕ Registrar</button><button class="sec" id="pscan">📷 Escanear QR del vehículo</button></div>`:""}<div id="dout"><p class="muted">Cargando…</p></div>`;
  if($("dp")) $("dp").value=par;
  const load=async()=>{ const p=$("dp")?.value||""; hor=+$("dz").value; VEH=(await api("vehiculos")).vehiculos;
    const j=await api(`dashboard?${p?"sucursal_id="+p+"&":""}${admin?`desde=${$("dd").value}&hasta=${$("dh").value}`:""}`); if(j.vacio){ $("dout").innerHTML='<div class="card"><p class="muted">Sin parqueos asignados.</p></div>'; return; }
    const lim=new Date(Date.now()+hor*864e5).toISOString().slice(0,10), plan=j.planificados.filter(x=>x.estado==="vencido"||x.estado==="proximo"||(x.estimada&&x.estimada<=lim));
    const venc=plan.filter(x=>x.estado==="vencido").length, prox=plan.filter(x=>x.estado==="proximo").length, T=j.parqueos.reduce((a,x)=>({total:a.total+(x.total||0),man:a.man+(x.mantenimiento||0),comb:a.comb+(x.combustible||0),l:a.l+x.litros}),{total:0,man:0,comb:0,l:0});
    const tablaPlan=`<div class="card tbl"><h3>🗓️ Mantenimientos planificados <small class="muted">(vencidos y próximos ${hor} días)</small></h3><table><thead><tr><th>Vehículo</th>${SUCS.length>1?"<th>Parqueo</th>":""}<th>Mantenimiento</th><th>Fecha estimada</th><th>Km objetivo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${plan.map(x=>`<tr><td><b>${esc(x.placa)}</b></td>${SUCS.length>1?`<td>${esc(x.sucursal)}</td>`:""}<td>${esc(x.plan)}</td><td>${x.estimada?fechaCorta(x.estimada):"—"}${x.km_dia?`<br><small class="muted">~${x.km_dia} km/día</small>`:""}</td>
        <td>${x.proxKm!=null?fmtKm(x.proxKm):"—"}${x.faltaKm!=null?`<br><small class="muted">${x.faltaKm<=0?"pasado "+fmtKm(-x.faltaKm):"faltan "+fmtKm(x.faltaKm)}</small>`:""}</td><td>${estChip(x.estado)}</td>
        <td>${can("mantenimiento")?`<button class="sec" data-r="${x.vehiculo_id}:${x.plan_id}">Registrar</button>`:""}</td></tr>`).join("")||`<tr><td colspan="7" class="muted">Nada planificado en los próximos ${hor} días. ✅</td></tr>`}</tbody></table></div>`;
    const tablaRea=`<div class="card tbl"><h3>🔧 Mantenimientos realizados <small class="muted">(${admin?`${fechaCorta(j.desde)} – ${fechaCorta(j.hasta)}`:"últimos 30 días"})</small></h3><table><thead><tr><th>Fecha</th><th>Vehículo</th><th>Trabajo</th><th>Taller</th><th class="n">Km</th>${j.costos?'<th class="n">Costo</th>':""}</tr></thead><tbody>
      ${j.realizados.map(x=>`<tr><td>${fechaHora(x.fecha).split(",")[0]}</td><td><b>${esc(x.placa)}</b></td><td>${esc(x.plan||x.detalle||"Correctivo")}</td><td>${esc(x.proveedor||"")}</td><td class="n">${x.km!=null?fmtQ(Math.round(x.km)):""}</td>${j.costos?`<td class="n">${money(x.monto)}</td>`:""}</tr>`).join("")||'<tr><td colspan="6" class="muted">Sin mantenimientos en este período.</td></tr>'}</tbody></table></div>`;
    const docs=j.documentos.length?`<div class="card" style="margin-top:12px"><h3>📄 Documentos vencidos o por vencer</h3>${j.documentos.map(x=>`<div><span class="chip ${x.estado==="vencido"?"bad":"warn"}">${x.estado==="vencido"?"Vencido":`${x.dias} días`}</span> <b>${esc(x.placa)}</b> · ${esc(x.doc)} · ${fechaCorta(x.fecha)}</div>`).join("")}</div>`:"";
    if(admin){
      const meses=[...new Set(j.meses.map(m=>m.mes))].map(m=>({mes:m,total:j.meses.filter(x=>x.mes===m).reduce((a,x)=>a+x.total,0)}));
      $("dout").innerHTML=`<div class="kpis"><div class="card kpi"><div class="v">${j.vehiculos.length}</div><div class="l">Vehículos${SUCS.length>1&&!$("dp")?.value?` en ${j.parqueos.length} parqueos`:""}</div></div>
        <div class="card kpi"><div class="v" style="color:${venc?"var(--bad)":"inherit"}">${venc}</div><div class="l">Mantenimientos vencidos</div></div><div class="card kpi"><div class="v" style="color:${prox?"var(--warn)":"inherit"}">${prox}</div><div class="l">Próximos</div></div>
        <div class="card kpi"><div class="v">${j.realizados.length}</div><div class="l">Realizados en el período</div></div><div class="card kpi"><div class="v num">${money(T.total)}</div><div class="l">Gasto del período (mant. ${money(T.man)})</div></div></div>
        ${tablaPlan}<div style="margin-top:12px">${tablaRea}</div>${docs}
        <div class="row" style="align-items:flex-start;margin-top:12px">${j.parqueos.length>1?`<div class="card tbl"><h3>Por parqueo</h3><table><thead><tr><th>Parqueo</th><th class="n">Vehículos</th><th class="n">Vencidos</th><th class="n">Próximos</th><th class="n">Combustible</th><th class="n">Mantenim.</th><th class="n">Total</th></tr></thead><tbody>
          ${j.parqueos.map(x=>`<tr class="click" data-ps="${x.sucursal_id}"><td><b>${esc(x.nombre)}</b></td><td class="n">${x.vehiculos}</td><td class="n" style="color:${x.vencidos?"var(--bad)":"inherit"}">${x.vencidos}</td><td class="n">${x.proximos}</td><td class="n">${money(x.combustible)}</td><td class="n">${money(x.mantenimiento)}</td><td class="n"><b>${money(x.total)}</b></td></tr>`).join("")}</tbody></table></div>`:""}
          <div class="card"><h3>Gasto por mes</h3>${barras(meses,"total","mes")}</div>${j.parqueos.length>1?"":`<div class="card"><h3>Gasto del período por tipo</h3>${barras([{t:"⛽ Combustible",v:T.comb},{t:"🔧 Mantenim.",v:T.man},{t:"🧽 Lavados",v:j.parqueos.reduce((a,x)=>a+(x.lavado||0),0)},{t:"🧾 Otros",v:j.parqueos.reduce((a,x)=>a+(x.gasto||0),0)}],"v","t")}</div>`}</div>`;
    } else {
      $("dout").innerHTML=`<div class="pgrid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));margin-bottom:12px">${j.vehiculos.map(v=>{ const ps=j.planificados.filter(x=>x.vehiculo_id===v.id&&x.estado!=="ok"&&x.estado!=="sin_registro");
        return `<div class="card" style="padding:12px"><b style="font-size:1.2rem">${esc(v.placa)}</b> <span class="chip ${ps.some(x=>x.estado==="vencido")?"bad":ps.length?"warn":"ok"}">${ps.some(x=>x.estado==="vencido")?"Mantenimiento vencido":ps.length?"Mantenimiento próximo":"Al día"}</span>
          <div class="muted">${esc([v.marca,v.modelo].filter(Boolean).join(" "))}${SUCS.length>1?" · "+esc(v.sucursal):""}</div><div>${fmtKm(v.km_actual)}</div>${can("registrar")?`<button class="sec" data-rv="${v.id}" style="margin-top:8px">➕ Registrar</button>`:""}</div>`; }).join("")||'<p class="muted">No hay vehículos en tus parqueos.</p>'}</div>
        ${tablaPlan}<div style="margin-top:12px">${tablaRea}</div>${docs}`;
    }
    $("dout").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{ const [vi,pi]=b.dataset.r.split(":").map(Number); PRESEL={vehiculo_id:vi,tipo:"mantenimiento",plan_id:pi}; go("registrar"); });
    $("dout").querySelectorAll("[data-rv]").forEach(b=>b.onclick=()=>{ PRESEL={vehiculo_id:+b.dataset.rv}; go("registrar"); });
    $("dout").querySelectorAll("[data-ps]").forEach(tr=>tr.onclick=()=>{ if($("dp")){ $("dp").value=tr.dataset.ps; load(); } }); };
  ["#dp","#dd","#dh","#dz"].forEach(s=>{ const e=$("main").querySelector(s); if(e) e.onchange=()=>load().catch(x=>toast(x.message)); });
  if($("preg")) $("preg").onclick=()=>go("registrar"); if($("pscan")) $("pscan").onclick=()=>escanearVeh(); PRESEL=null;
  await load(); }
function escanearVeh(){ scan({titulo:"Escanear QR del vehículo",onCode:c=>{ const m=String(c).match(/#v=([a-f0-9]+)/i)||[null,c]; const v=VEH.find(x=>x.codigo===m[1].toLowerCase());
  if(!v) return "⚠️ Ese QR no es de un vehículo de tu flota"; PRESEL={vehiculo_id:v.id}; setTimeout(()=>go("registrar"),300); return "✓ "+v.placa; }}); }

// ===================== Registrar =====================
async function viewRegistrar(){ await cargarVeh(); const act=VEH.filter(v=>v.estado!=="baja");
  const pre=PRESEL||{}; PRESEL=null; let tipo=pre.tipo||"combustible", vid=pre.vehiculo_id||(act.length===1?act[0].id:null), f1=null, f2=null;
  const tipos=Object.keys(TIPOS_EV).filter(t=>t==="mantenimiento"?can("mantenimiento"):can("registrar"));
  if(!tipos.includes(tipo)) tipo=tipos[0];
  if(!act.length){ $("main").innerHTML='<div class="card"><p class="muted">No hay vehículos activos.</p></div>'; return; }
  $("main").innerHTML=`<h2>Registrar</h2><div class="card" style="max-width:640px">
    <div class="inline"><div class="field"><label>Vehículo *</label><select id="rv"><option value="">Elige el vehículo</option>${act.map(v=>`<option value="${v.id}" ${v.id===vid?"selected":""}>${esc(v.placa)} · ${esc(v.marca)} ${esc(v.modelo)}</option>`).join("")}</select></div>
      <button class="sec" id="rsc" style="margin-bottom:12px">📷 QR</button></div><p class="muted" id="rinfo"></p>
    <div class="toolbar" id="rtip" style="margin:4px 0 12px">${tipos.map(t=>`<button data-t="${t}">${TIPOS_EV[t][0]} ${TIPOS_EV[t][1]}</button>`).join("")}</div>
    <div id="rform"></div><div class="err" id="re"></div><button id="rok" style="width:100%;font-size:1.05rem;padding:12px">Guardar</button></div>`;
  const veh=()=>VEH.find(v=>v.id===+$("rv").value);
  const form=()=>{ const v=veh(); $("rtip").querySelectorAll("[data-t]").forEach(b=>b.className=b.dataset.t===tipo?"":"sec");
    $("rinfo").textContent=v?`Último km: ${fmtKm(v.km_actual)}${v.conductor?` · Conductor: ${v.conductor}`:""}${v.rendimiento_esp?` · Esperado ${v.rendimiento_esp} km/l`:""}`:"";
    const km=`<div class="field"><label>Kilometraje (odómetro)${["combustible","kilometraje"].includes(tipo)?" *":""}</label><input id="fk" inputmode="numeric" placeholder="${v?Math.round(v.km_actual):""}"></div>`;
    const fecha=`<div class="field"><label>Fecha</label><input type="date" id="ff" value="${today()}" max="${today()}"></div>`;
    const prov=(l,ph)=>`<div class="field"><label>${l}</label><input id="fp" placeholder="${ph}"></div>`, det=`<div class="field"><label>Detalle</label><input id="fd"></div>`;
    const mon=r=>`<div class="field"><label>Monto (${esc(EMP.moneda)})${r?" *":""}</label><input id="fm" inputmode="decimal"></div>`;
    const planes=v?v.planes:[];
    $("rform").innerHTML=({
      combustible:`<div class="row">${km}<div class="field"><label>Litros *</label><input id="fl" inputmode="decimal"></div>${mon(1)}</div>
        <label class="check"><input type="checkbox" id="fll" checked> Tanque lleno (necesario para calcular el rendimiento km/l)</label>
        <div class="row" style="margin-top:8px">${prov("Estación de servicio","Ej: YPFB Av. Banzer")}${fecha}</div>${fotoCampo("f1","Foto del surtidor o la factura")}${fotoCampo("f2","Foto del odómetro")}`,
      mantenimiento:`<div class="field"><label>Mantenimiento</label><select id="fpl"><option value="">Otro (correctivo o no programado)</option>${planes.map(p=>`<option value="${p.id}" ${pre.plan_id===p.id?"selected":""}>${esc(p.nombre)}${p.estado==="vencido"?" (vencido)":p.estado==="proximo"?" (próximo)":""}</option>`).join("")}</select></div>
        <div class="row">${km}${mon(0)}${fecha}</div><div class="row">${prov("Taller","Ej: Taller Mecánico Rojas")}${det}</div>${fotoCampo("f1","Foto de la factura o el trabajo")}`,
      lavado:`<div class="row">${mon(1)}${km}${fecha}</div><div class="row">${prov("Lavadero","")}<div class="field"><label>Tipo de lavado</label><select id="fd"><option>Lavado simple</option><option>Lavado completo</option><option>Lavado de motor</option><option>Aspirado</option></select></div></div>${fotoCampo("f1","Foto (opcional)")}`,
      gasto:`<div class="row"><div class="field"><label>Tipo de gasto</label><select id="fc"><option>Peaje</option><option>Repuesto</option><option>Llantas</option><option>Multa</option><option>Seguro / SOAT</option><option>Parqueo</option><option>Otro</option></select></div>${mon(1)}${fecha}</div>
        <div class="row">${km}${prov("Proveedor","")}</div>${det}${fotoCampo("f1","Foto del comprobante")}`,
      kilometraje:`<div class="row">${km}${fecha}</div>${det}${fotoCampo("f1","Foto del odómetro (opcional)")}`})[tipo];
    f1=f2=null; if($("f1")) enlazarFoto($("rform"),"f1",d=>f1=d); if($("f2")) enlazarFoto($("rform"),"f2",d=>f2=d); };
  $("rv").onchange=form; $("rtip").querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{ tipo=b.dataset.t; form(); });
  $("rsc").onclick=()=>scan({titulo:"Escanear QR del vehículo",onCode:c=>{ const m=String(c).match(/#v=([a-f0-9]+)/i)||[null,c]; const v=act.find(x=>x.codigo===String(m[1]).toLowerCase()); if(!v) return "⚠️ No es un vehículo de tu flota"; $("rv").value=v.id; form(); return "✓ "+v.placa; }});
  form();
  const guardar=async confirmar=>{ $("re").textContent=""; if(!$("rv").value) return $("re").textContent="Elige el vehículo";
    const g=id=>$(id)?$(id).value.replace(",","."):"";
    const body={tipo,vehiculo_id:+$("rv").value,km:g("fk"),litros:g("fl"),monto:g("fm"),lleno:$("fll")?$("fll").checked:true,proveedor:$("fp")?.value||"",detalle:$("fd")?.value||"",categoria:$("fc")?.value||"",plan_id:$("fpl")?.value||null,fecha:$("ff")?.value||"",foto1:f1,foto2:f2,confirmar_km:confirmar};
    $("rok").disabled=true;
    try{ const r=await api("eventos",{body}); beepScan();
      toast(r.rendimiento?`Guardado · Rendimiento ${fmtN(r.rendimiento)} km/l`:"Guardado"); if(r.alertas?.length) alert("⚠️ Atención:\n"+r.alertas.join("\n")); PRESEL={vehiculo_id:body.vehiculo_id,tipo}; go("registrar"); }
    catch(e){ $("rok").disabled=false; if(/menor al último|más que el último/.test(e.message)&&confirm(e.message+"\n\n¿Guardar igual?")) return guardar(true); $("re").textContent=e.message; } };
  $("rok").onclick=()=>guardar(false); }

// ===================== Vehículos =====================
async function viewVehiculos(){ await cargarVeh(); const P=USER.plan||{};
  $("main").innerHTML=`<h2>Vehículos</h2><div class="toolbar"><div class="grow"><label>Buscar</label><input id="vq" placeholder="Placa, marca o conductor"></div>
    <label class="check" style="margin-bottom:8px"><input type="checkbox" id="vb"> Ver dados de baja</label>${can("vehiculos")?`<button id="vnew">+ Nuevo vehículo</button>`:""}</div>
    ${P.vehiculos!=null?`<p class="muted">Plan ${esc(P.nombre)}: ${VEH.filter(v=>v.estado!=="baja").length} de ${P.vehiculos} vehículos.</p>`:""}<div class="pgrid" id="vgrid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))"></div>`;
  const draw=()=>{ const q=$("vq").value.toLowerCase(), b=$("vb").checked;
    $("vgrid").innerHTML=VEH.filter(v=>(b||v.estado!=="baja")&&(!q||(v.placa+" "+v.marca+" "+v.modelo+" "+(v.conductor||"")).toLowerCase().includes(q))).map(v=>{ const n=nivelVeh(v);
      return `<div class="card click" data-v="${v.id}" style="cursor:pointer;padding:12px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:1.25rem;letter-spacing:1px">${esc(v.placa)}</b>
        <span class="chip ${v.estado==="baja"?"":v.estado==="taller"?"warn":n}">${v.estado==="baja"?"Baja":v.estado==="taller"?"En taller":n==="ok"?"Al día":v.alertas.length+" alerta"+(v.alertas.length>1?"s":"")}</span></div>
        <div class="muted">${esc([v.marca,v.modelo,v.anio].filter(Boolean).join(" "))}${SUCS.length>1?` · ${esc(v.sucursal)}`:""}</div><div>${fmtKm(v.km_actual)}${v.rendimiento_ult?` · ${fmtN(v.rendimiento_ult)} km/l`:""}</div>
        <small class="muted">${v.conductor?"👤 "+esc(v.conductor):"Sin conductor asignado"}</small></div>`; }).join("")||'<p class="muted">Sin vehículos.</p>';
    $("vgrid").querySelectorAll("[data-v]").forEach(x=>x.onclick=()=>vehiculoDetalle(+x.dataset.v)); };
  $("vq").oninput=draw; $("vb").onchange=draw; draw(); if($("vnew")) $("vnew").onclick=()=>vehiculoForm(null); }
function vehiculoDetalle(id){ const v=VEH.find(x=>x.id===id); if(!v) return;
  const doc=(n,f,d)=>`<tr><td>${n}</td><td>${fechaCorta(f)}</td><td>${d?`<span class="chip ${d.estado==="ok"?"ok":d.estado==="proximo"?"warn":"bad"}">${d.estado==="vencido"?"Vencido":d.estado==="proximo"?`${d.dias} días`:"Vigente"}</span>`:'<span class="muted">Sin fecha</span>'}</td></tr>`;
  dialog(`<div style="display:flex;gap:12px;align-items:center">${v.foto?`<img data-k="${esc(v.foto)}" alt="" style="width:90px;height:68px;object-fit:cover;border-radius:8px">`:""}<div><h3 style="margin:0">${esc(v.placa)}</h3>
    <div class="muted">${esc([v.marca,v.modelo,v.anio,v.tipo].filter(Boolean).join(" · "))} · ${esc(v.combustible)}</div><div>${fmtKm(v.km_actual)}${v.conductor?` · 👤 ${esc(v.conductor)}`:""}</div></div></div>
    ${v.alertas.length?`<div style="margin-top:10px">${v.alertas.map(a=>`<div><span class="chip ${a.nivel}">${a.nivel==="bad"?"Vencido":"Atención"}</span> ${esc(a.texto)}</div>`).join("")}</div>`:""}
    <h3 style="margin-top:14px">Mantenimiento preventivo</h3><div class="tbl"><table><thead><tr><th>Plan</th><th>Cada</th><th>Último</th><th>Próximo</th><th></th></tr></thead><tbody>
    ${v.planes.map(p=>`<tr><td>${esc(p.nombre)}</td><td><small>${p.cada_km?fmtKm(p.cada_km):""}${p.cada_km&&p.cada_dias?" o ":""}${p.cada_dias?p.cada_dias+" días":""}</small></td><td><small>${p.ultima_fecha?fechaCorta(p.ultima_fecha):"—"}${p.ultimo_km?"<br>"+fmtKm(p.ultimo_km):""}</small></td>
      <td><span class="chip ${p.estado==="vencido"?"bad":p.estado==="proximo"?"warn":"ok"}">${p.proxKm!=null?fmtKm(p.proxKm):""}${p.proxKm!=null&&p.proxFecha?" / ":""}${p.proxFecha?fechaCorta(p.proxFecha):""}</span></td>
      <td>${can("mantenimiento")?`<button class="link" data-pe="${p.id}">Editar</button>`:""}</td></tr>`).join("")||'<tr><td colspan="5" class="muted">Sin planes.</td></tr>'}</tbody></table></div>
    ${can("mantenimiento")?`<button class="sec" id="dpn" style="margin-top:6px">+ Agregar plan</button>`:""}
    <h3 style="margin-top:14px">Documentos</h3><div class="tbl"><table>${doc("SOAT",v.soat_vence,v.docs.soat)}${doc("Inspección técnica",v.itv_vence,v.docs.itv)}${doc("Seguro",v.seguro_vence,v.docs.seguro)}${v.conductor?doc("Licencia de "+esc(v.conductor),v.licencia_vence,v.docs.licencia):""}</table></div>
    <div class="acts">${can("vehiculos")?`<button class="sec" id="ded">Editar vehículo</button>`:""}<button class="sec" id="dqr">🏷️ Imprimir QR</button><button class="sec" id="dhi">Historial</button>${can("registrar")?`<button id="dre">➕ Registrar</button>`:""}<button class="sec" id="dx">Cerrar</button></div>`, B=>{
    pintarFotos(B); B.querySelector("#dx").onclick=closeDlg; B.querySelector("#dqr").onclick=()=>etiquetaQR(v);
    B.querySelector("#dhi").onclick=()=>{ closeDlg(); PRESEL={vehiculo_id:v.id}; go("historial"); };
    const re=B.querySelector("#dre"); if(re) re.onclick=()=>{ closeDlg(); PRESEL={vehiculo_id:v.id}; go("registrar"); };
    const ed=B.querySelector("#ded"); if(ed) ed.onclick=()=>vehiculoForm(v);
    const pn=B.querySelector("#dpn"); if(pn) pn.onclick=()=>planForm(v,null);
    B.querySelectorAll("[data-pe]").forEach(x=>x.onclick=()=>planForm(v,v.planes.find(p=>p.id==x.dataset.pe))); }); }
async function vehiculoForm(v){ await cargarCond(); let foto;
  dialog(`<h3>${v?"Editar vehículo":"Nuevo vehículo"}</h3><div class="row"><div class="field"><label>Placa *</label><input id="vp" value="${esc(v?.placa||"")}" autocapitalize="characters"></div>
    ${SUCS.length>1?`<div class="field"><label>Parqueo</label><select id="vs">${SUCS.map(s=>`<option value="${s.id}" ${s.id===(v?.sucursal_id??SUC)?"selected":""}>${esc(s.nombre)}</option>`).join("")}</select></div>`:""}</div>
    <div class="row"><div class="field"><label>Marca</label><input id="vma" value="${esc(v?.marca||"")}"></div><div class="field"><label>Modelo</label><input id="vmo" value="${esc(v?.modelo||"")}"></div><div class="field"><label>Año</label><input id="van" inputmode="numeric" value="${v?.anio||""}"></div></div>
    <div class="row"><div class="field"><label>Tipo</label><input id="vt" list="vtl" value="${esc(v?.tipo||"")}"><datalist id="vtl"><option value="Camioneta"><option value="Automóvil"><option value="Furgón"><option value="Camión"><option value="Motocicleta"></datalist></div>
      <div class="field"><label>Combustible</label><select id="vc">${["Gasolina","Diésel","GNV","Eléctrico"].map(x=>`<option ${x===(v?.combustible||"Gasolina")?"selected":""}>${x}</option>`).join("")}</select></div></div>
    <div class="row"><div class="field"><label>Tanque (litros)</label><input id="vta" inputmode="decimal" value="${v?.tanque_l||""}"></div><div class="field"><label>Rendimiento esperado (km/l)</label><input id="vre" inputmode="decimal" value="${v?.rendimiento_esp||""}"></div>
      ${v?"":`<div class="field"><label>Kilometraje actual</label><input id="vkm" inputmode="numeric"></div>`}</div>
    <div class="row"><div class="field"><label>Conductor asignado</label><select id="vco"><option value="">Sin conductor</option>${COND.filter(c=>c.activo).map(c=>`<option value="${c.id}" ${c.id===v?.conductor_id?"selected":""}>${esc(c.nombre)}</option>`).join("")}</select></div>
      <div class="field"><label>Estado</label><select id="ves">${[["activo","Activo"],["taller","En taller"],["baja","Dado de baja"]].map(([k,t])=>`<option value="${k}" ${k===(v?.estado||"activo")?"selected":""}>${t}</option>`).join("")}</select></div></div>
    <div class="row"><div class="field"><label>SOAT vence</label><input type="date" id="vso" value="${v?.soat_vence||""}"></div><div class="field"><label>Inspección técnica vence</label><input type="date" id="vit" value="${v?.itv_vence||""}"></div><div class="field"><label>Seguro vence</label><input type="date" id="vse" value="${v?.seguro_vence||""}"></div></div>
    ${fotoCampo("vf","Foto del vehículo")}<div class="field"><label>Notas</label><textarea id="vn">${esc(v?.notas||"")}</textarea></div>
    ${v?"":'<p class="muted">Se crean planes de mantenimiento de ejemplo (aceite, filtro de aire, llantas, frenos) desde el kilometraje actual. Ajústalos después.</p>'}
    <div class="err" id="ve"></div><div class="acts"><button class="sec" id="vx">Cancelar</button><button id="vok">Guardar</button></div>`, B=>{
    enlazarFoto(B,"vf",d=>foto=d); B.querySelector("#vx").onclick=closeDlg;
    B.querySelector("#vok").onclick=async()=>{ try{ await api("vehiculos",{body:{id:v?.id,placa:val(B,"#vp"),sucursal_id:+(val(B,"#vs")||v?.sucursal_id||SUC),marca:val(B,"#vma"),modelo:val(B,"#vmo"),anio:val(B,"#van"),tipo:val(B,"#vt"),combustible:val(B,"#vc"),
        tanque_l:val(B,"#vta").replace(",","."),rendimiento_esp:val(B,"#vre").replace(",","."),km_actual:val(B,"#vkm"),conductor_id:val(B,"#vco"),estado:val(B,"#ves"),soat_vence:val(B,"#vso"),itv_vence:val(B,"#vit"),seguro_vence:val(B,"#vse"),notas:val(B,"#vn"),foto}});
      closeDlg(); toast("Vehículo guardado"); go(CUR); }catch(e){ B.querySelector("#ve").textContent=e.message; } }; }); }
function planForm(v,p){ dialog(`<h3>${p?"Editar plan":"Nuevo plan"} · ${esc(v.placa)}</h3><div class="field"><label>Nombre *</label><input id="pn" value="${esc(p?.nombre||"")}" placeholder="Ej: Cambio de aceite"></div>
  <div class="row"><div class="field"><label>Cada (km)</label><input id="pk" inputmode="numeric" value="${p?.cada_km||""}"></div><div class="field"><label>y/o cada (días)</label><input id="pd" inputmode="numeric" value="${p?.cada_dias||""}"></div></div>
  <div class="row"><div class="field"><label>Último realizado (km)</label><input id="puk" inputmode="numeric" value="${p?.ultimo_km??Math.round(v.km_actual)}"></div><div class="field"><label>Último realizado (fecha)</label><input type="date" id="puf" value="${p?.ultima_fecha||today()}"></div></div>
  <p class="muted">Lo que llegue primero (km o días) dispara la alerta. Al registrar un mantenimiento con este plan, se actualiza solo.</p>
  <div class="err" id="pe"></div><div class="acts">${p?`<button class="danger" id="pdel" style="margin-right:auto">Quitar plan</button>`:""}<button class="sec" id="px">Cancelar</button><button id="pok">Guardar</button></div>`, B=>{
  B.querySelector("#px").onclick=()=>{ closeDlg(); vehiculoDetalle(v.id); };
  const del=B.querySelector("#pdel"); if(del) del.onclick=async()=>{ try{ await api("planes",{body:{id:p.id,vehiculo_id:v.id,borrar:true}}); await cargarVeh(); toast("Plan quitado"); vehiculoDetalle(v.id); }catch(e){ B.querySelector("#pe").textContent=e.message; } };
  B.querySelector("#pok").onclick=async()=>{ try{ await api("planes",{body:{id:p?.id,vehiculo_id:v.id,nombre:val(B,"#pn"),cada_km:val(B,"#pk"),cada_dias:val(B,"#pd"),ultimo_km:val(B,"#puk"),ultima_fecha:val(B,"#puf")}}); await cargarVeh(); toast("Plan guardado"); vehiculoDetalle(v.id); }
    catch(e){ B.querySelector("#pe").textContent=e.message; } }; }); }

// ===================== Mantenimiento (toda la flota) =====================
async function viewMantenimiento(){ await cargarVeh(); const ord={vencido:0,proximo:1,sin_registro:2,ok:3};
  const filas=VEH.filter(v=>v.estado!=="baja").flatMap(v=>v.planes.map(p=>({v,p}))).sort((a,b)=>ord[a.p.estado]-ord[b.p.estado]||(a.p.faltaKm??1e9)-(b.p.faltaKm??1e9));
  $("main").innerHTML=`<h2>Mantenimiento preventivo</h2><p class="muted">Todos los planes de la flota, primero los vencidos. Los planes se configuran en cada vehículo.</p>
    <div class="card tbl"><table><thead><tr><th>Vehículo</th><th>Plan</th><th>Km actual</th><th>Próximo</th><th>Estado</th><th></th></tr></thead><tbody>
    ${filas.map(({v,p})=>`<tr><td><b>${esc(v.placa)}</b></td><td>${esc(p.nombre)}</td><td>${fmtKm(v.km_actual)}</td><td><small>${p.proxKm!=null?fmtKm(p.proxKm):""}${p.proxKm!=null&&p.proxFecha?"<br>":""}${p.proxFecha?fechaCorta(p.proxFecha):""}</small></td>
      <td><span class="chip ${p.estado==="vencido"?"bad":p.estado==="proximo"?"warn":"ok"}">${p.estado==="vencido"?"Vencido":p.estado==="proximo"?"Próximo":"Al día"}</span><br><small class="muted">${p.faltaKm!=null?(p.faltaKm<=0?`pasado ${fmtKm(-p.faltaKm)}`:`faltan ${fmtKm(p.faltaKm)}`):""}${p.faltaDias!=null?` · ${p.faltaDias<=0?`hace ${-p.faltaDias} d`:`${p.faltaDias} d`}`:""}</small></td>
      <td>${can("mantenimiento")?`<button class="sec" data-r="${v.id}:${p.id}">Registrar</button>`:""}</td></tr>`).join("")||'<tr><td colspan="6" class="muted">Sin planes de mantenimiento.</td></tr>'}</tbody></table></div>`;
  $("main").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{ const [vi,pi]=b.dataset.r.split(":").map(Number); PRESEL={vehiculo_id:vi,tipo:"mantenimiento",plan_id:pi}; go("registrar"); }); }

// ===================== Historial =====================
async function viewHistorial(){ await cargarVeh(); const pre=PRESEL||{}; PRESEL=null; const rep=can("reportes");
  $("main").innerHTML=`<h2>Historial</h2>${rep?"":'<p class="muted">Ves los registros que hiciste tú.</p>'}<div class="toolbar"><div><label>Vehículo</label><select id="hv"><option value="">Todos</option>${VEH.map(v=>`<option value="${v.id}" ${v.id===pre.vehiculo_id?"selected":""}>${esc(v.placa)}</option>`).join("")}</select></div>
    <div><label>Tipo</label><select id="ht"><option value="">Todos</option>${Object.entries(TIPOS_EV).map(([k,[i,t]])=>`<option value="${k}">${i} ${t}</option>`).join("")}</select></div>
    <div><label>Desde</label><input type="date" id="hd" value="${daysAgo(30)}"></div><div><label>Hasta</label><input type="date" id="hh" value="${today()}"></div><button class="sec" id="hgo">Ver</button></div>
    <div class="card tbl"><table><thead><tr><th>Fecha</th><th>Vehículo</th><th>Tipo</th><th>Detalle</th><th class="n">Km</th><th class="n">Monto</th></tr></thead><tbody id="hrows"></tbody></table></div>`;
  const load=async()=>{ const j=await api(`eventos?vehiculo_id=${$("hv").value}&tipo=${$("ht").value}&desde=${$("hd").value}&hasta=${$("hh").value}`);
    $("hrows").innerHTML=j.eventos.map(e=>`<tr class="click" data-id="${e.id}" style="${e.anulado?"opacity:.5;text-decoration:line-through":""}"><td>${fechaHora(e.fecha)}</td><td><b>${esc(e.placa)}</b></td><td>${TIPOS_EV[e.tipo][0]} ${TIPOS_EV[e.tipo][1]}</td>
      <td><small>${e.tipo==="combustible"?`${fmtN(e.litros)} L${e.rendimiento?` · <b>${fmtN(e.rendimiento)} km/l</b>`:""}`:esc(e.plan||e.categoria||e.detalle||"")}${e.proveedor?` · ${esc(e.proveedor)}`:""}</small>${e.alerta?`<br><span class="chip warn">${esc(e.alerta)}</span>`:""}</td>
      <td class="n">${e.km!=null?fmtQ(Math.round(e.km)):""}</td><td class="n">${e.monto?money(e.monto):""}</td></tr>`).join("")||'<tr><td colspan="6" class="muted">Sin registros.</td></tr>';
    $("hrows").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>{ const e=j.eventos.find(x=>x.id==tr.dataset.id);
      dialog(`<h3>${TIPOS_EV[e.tipo][0]} ${TIPOS_EV[e.tipo][1]} · ${esc(e.placa)}</h3><p class="muted">${fechaHora(e.fecha)} · ${esc(e.usuario||"")}${e.conductor?` · Conductor: ${esc(e.conductor)}`:""}</p>
        <div class="tbl"><table>${[["Kilometraje",e.km!=null?fmtKm(e.km):""],["Litros",e.litros?fmtN(e.litros):""],["Rendimiento",e.rendimiento?fmtN(e.rendimiento)+" km/l":""],["Monto",e.monto?money(e.monto):""],["Plan",e.plan||""],["Tipo de gasto",e.categoria||""],["Proveedor",e.proveedor||""],["Detalle",e.detalle||""],["Alerta",e.alerta||""]].filter(x=>x[1]).map(([a,b])=>`<tr><td>${a}</td><td>${esc(b)}</td></tr>`).join("")}</table></div>
        <div class="row" style="margin-top:10px">${[e.foto1,e.foto2].filter(Boolean).map(k=>`<img data-k="${esc(k)}" alt="Foto" style="max-width:100%;border-radius:8px">`).join("")}</div>
        <div class="acts">${rep&&!e.anulado?`<button class="danger" id="han" style="margin-right:auto">Anular</button>`:""}<button id="hx">Cerrar</button></div>`, B=>{ pintarFotos(B); B.querySelector("#hx").onclick=closeDlg;
        const an=B.querySelector("#han"); if(an) an.onclick=async()=>{ const m=prompt("Motivo de la anulación:"); if(!m) return; try{ await api("eventos",{body:{id:e.id,anular:true,motivo:m}}); closeDlg(); toast("Registro anulado"); load(); }catch(x){ toast(x.message); } }; }); }); };
  $("hgo").onclick=()=>load().catch(e=>toast(e.message)); ["#hv","#ht"].forEach(s=>$("main").querySelector(s).onchange=$("hgo").onclick); await load(); }

// ===================== Reportes =====================
async function viewReportes(){
  $("main").innerHTML=`<h2>Reportes de costos</h2><div class="toolbar"><div><label>Desde</label><input type="date" id="rd" value="${daysAgo(29)}"></div><div><label>Hasta</label><input type="date" id="rh" value="${today()}"></div>
    ${SUCS.length>1?`<div><label>Parqueo</label><select id="rs"><option value="">Todos</option>${SUCS.map(s=>`<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></div>`:""}<button class="sec" id="rgo">Ver</button><button class="sec" id="rcsv">Descargar CSV</button></div><div id="rout"></div>`;
  let J=null;
  const load=async()=>{ const rs=$("rs")?.value||""; J=await api(`reportes?desde=${$("rd").value}&hasta=${$("rh").value}${rs?"&sucursal_id="+rs:""}`);
    const T=J.vehiculos.reduce((a,v)=>({total:a.total+v.total,comb:a.comb+v.combustible,km:a.km+(v.km||0),l:a.l+v.litros}),{total:0,comb:0,km:0,l:0});
    $("rout").innerHTML=`<div class="kpis"><div class="card kpi"><div class="v num">${money(T.total)}</div><div class="l">Gasto total</div></div><div class="card kpi"><div class="v num">${money(T.comb)}</div><div class="l">Combustible (${fmtN(T.l,0)} L)</div></div>
      <div class="card kpi"><div class="v">${fmtKm(T.km)}</div><div class="l">Recorrido registrado</div></div><div class="card kpi"><div class="v num">${T.km?money(T.total/T.km):"—"}</div><div class="l">Costo por km</div></div></div>
      <div class="card tbl"><h3>Por vehículo</h3><table><thead><tr><th>Vehículo</th><th class="n">Km</th><th class="n">Litros</th><th class="n">km/l</th><th class="n">Combustible</th><th class="n">Mantenim.</th><th class="n">Lavados</th><th class="n">Otros</th><th class="n">Total</th><th class="n">Bs/km</th></tr></thead><tbody>
      ${J.vehiculos.map(v=>`<tr><td><b>${esc(v.placa)}</b>${v.alertas?` <span class="chip warn">${v.alertas} alertas</span>`:""}</td><td class="n">${fmtQ(Math.round(v.km||0))}</td><td class="n">${fmtN(v.litros,0)}</td>
        <td class="n">${v.rendimiento?`<span class="${v.rendimiento_esp&&v.rendimiento<v.rendimiento_esp*.85?"err":""}">${fmtN(v.rendimiento)}</span>`:"—"}</td><td class="n">${money(v.combustible)}</td><td class="n">${money(v.mantenimiento)}</td><td class="n">${money(v.lavado)}</td><td class="n">${money(v.gastos)}</td>
        <td class="n"><b>${money(v.total)}</b></td><td class="n">${v.km?fmtN(v.total/v.km):"—"}</td></tr>`).join("")||'<tr><td colspan="10" class="muted">Sin datos en este período.</td></tr>'}</tbody></table></div>
      <div class="row" style="align-items:flex-start;margin-top:12px"><div class="card tbl"><h3>Por tipo</h3><table>${J.tipos.map(t=>`<tr><td>${TIPOS_EV[t.tipo][0]} ${TIPOS_EV[t.tipo][1]}</td><td class="n">${t.cantidad}</td><td class="n">${money(t.total)}</td></tr>`).join("")||'<tr><td class="muted">Sin datos</td></tr>'}</table></div>
      <div class="card tbl"><h3>Por mes</h3><table>${J.meses.map(m=>`<tr><td>${esc(m.mes)}</td><td class="n">${money(m.total)}</td><td class="n muted">comb. ${money(m.combustible)}</td></tr>`).join("")||'<tr><td class="muted">Sin datos</td></tr>'}</table></div></div>`; };
  $("rgo").onclick=()=>load().catch(e=>toast(e.message));
  $("rcsv").onclick=()=>{ if(!J) return; const h=["Placa","Km","Litros","km/l","Combustible","Mantenimiento","Lavados","Otros","Total"];
    const csv=[h.join(";"),...J.vehiculos.map(v=>[v.placa,Math.round(v.km||0),v.litros,v.rendimiento?.toFixed(2)||"",v.combustible,v.mantenimiento,v.lavado,v.gastos,v.total].join(";"))].join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"})); a.download=`flota_${$("rd").value}_${$("rh").value}.csv`; a.click(); };
  await load(); }

// ===================== Conductores =====================
async function viewConductores(){ await cargarCond(); const hoy=today();
  $("main").innerHTML=`<h2>Conductores</h2><div class="toolbar">${can("vehiculos")?`<button id="cnew">+ Nuevo conductor</button>`:""}</div><div class="card tbl"><table><thead><tr><th>Nombre</th><th>CI</th><th>Teléfono</th><th>Licencia</th><th>Vehículos</th></tr></thead><tbody>
    ${COND.map(c=>{ const d=c.licencia_vence?Math.round((new Date(c.licencia_vence)-new Date(hoy))/864e5):null; return `<tr class="click" data-id="${c.id}" style="${c.activo?"":"opacity:.5"}"><td>${esc(c.nombre)}</td><td>${esc(c.ci)}</td><td>${esc(c.telefono)}</td>
      <td>${esc(c.licencia_cat)} ${c.licencia_vence?`<span class="chip ${d<0?"bad":d<=30?"warn":"ok"}">${d<0?"Vencida":"vence "+fechaCorta(c.licencia_vence)}</span>`:""}</td><td><small>${esc(c.vehiculos||"")}</small></td></tr>`; }).join("")||'<tr><td colspan="5" class="muted">Sin conductores.</td></tr>'}</tbody></table></div>`;
  const form=c=>dialog(`<h3>${c?"Editar":"Nuevo"} conductor</h3><div class="field"><label>Nombre *</label><input id="cn" value="${esc(c?.nombre||"")}"></div>
    <div class="row"><div class="field"><label>CI</label><input id="cc" value="${esc(c?.ci||"")}"></div><div class="field"><label>Teléfono</label><input id="ct" value="${esc(c?.telefono||"")}"></div></div>
    <div class="row"><div class="field"><label>Categoría de licencia</label><input id="cl" value="${esc(c?.licencia_cat||"")}" placeholder="Ej: B, C, P"></div><div class="field"><label>Licencia vence</label><input type="date" id="cv" value="${c?.licencia_vence||""}"></div></div>
    ${c?`<label class="check"><input type="checkbox" id="ca" ${c.activo?"checked":""}> Activo</label>`:""}<div class="err" id="ce"></div><div class="acts"><button class="sec" id="cx">Cancelar</button><button id="cok">Guardar</button></div>`, B=>{
    B.querySelector("#cx").onclick=closeDlg;
    B.querySelector("#cok").onclick=async()=>{ try{ await api("conductores",{body:{id:c?.id,nombre:val(B,"#cn"),ci:val(B,"#cc"),telefono:val(B,"#ct"),licencia_cat:val(B,"#cl"),licencia_vence:val(B,"#cv"),activo:c?B.querySelector("#ca").checked:true}}); closeDlg(); toast("Guardado"); go("conductores"); }
      catch(e){ B.querySelector("#ce").textContent=e.message; } }; });
  if($("cnew")) $("cnew").onclick=()=>form(null); if(can("vehiculos")) $("main").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>form(COND.find(c=>c.id==tr.dataset.id))); }

// ===================== Empresa =====================
async function viewConfig(){ const P=USER.plan||{};
  $("main").innerHTML=`<h2>Datos de la empresa</h2><div class="card" style="max-width:640px">
    <div class="field"><label>Nombre</label><input id="cn" value="${esc(EMP.nombre)}"></div>
    <div class="row"><div class="field"><label>WhatsApp</label><input id="cw" inputmode="tel" value="${esc(EMP.whatsapp||"")}"></div><div class="field"><label>Moneda</label><input id="cm" value="${esc(EMP.moneda)}"></div></div>
    <div class="field"><label>Dirección</label><input id="cd" value="${esc(EMP.direccion||"")}"></div>
    <div class="row"><div class="field"><label>Alertar si el rendimiento cae más de (%)</label><input id="ctc" inputmode="numeric" value="${EMP.tolerancia_consumo}"></div><div class="field"><label>Guardar fotos durante (días)</label><input id="cr" inputmode="numeric" value="${EMP.retencion_fotos}"></div></div>
    <p class="muted">Ejemplo: con 20%, un vehículo que debería hacer 10 km/l da alerta si baja de 8 km/l.</p>
    <div class="acts" style="justify-content:flex-start"><button id="cok">Guardar</button></div></div>
    <div class="card" style="max-width:640px;margin-top:12px"><h3>Tu plan: ${esc(P.nombre||"")}</h3><p>Vence: <b>${esc(EMP.vence||"sin vencimiento")}</b></p><p class="muted">Hasta ${P.vehiculos??"ilimitados"} vehículos, ${P.sucursales??"ilimitados"} parqueos y ${P.usuarios??"ilimitados"} usuarios.</p></div>`;
  $("cok").onclick=async()=>{ try{ EMP=(await api("config",{body:{nombre:$("cn").value,whatsapp:$("cw").value,moneda:$("cm").value,direccion:$("cd").value,tolerancia_consumo:$("ctc").value,retencion_fotos:$("cr").value}})).empresa;
    $("brand").textContent=EMP.nombre; toast("Guardado"); }catch(e){ toast(e.message); } }; }
// ===================== Ayuda guiada =====================
// Cada paso: [selector, título, texto]. Los pasos cuyo elemento no existe (por permisos) se saltan solos.
const TOURS={
  _inicio:[[null,"¡Bienvenido! 👋","Te mostramos en 1 minuto cómo controlar tu flota. Puedes saltar esta guía cuando quieras."],
    ["#nav","Menú","Panel para las alertas, Registrar para cargas y gastos, Vehículos para la ficha de cada uno."],["#helpBtn","Ayuda","Toca este botón cuando tengas dudas."]],
  plataforma:[["#main .kpis","Tu negocio de un vistazo","Empresas activas, ingreso esperado, cobrado del mes y por cobrar."],["#enew","Nueva empresa","Crea un cliente con su plan y su administrador."]],
  panel:[["#dout .kpis","Resumen","Vehículos, mantenimientos vencidos y próximos, realizados y gasto del período."],["#dout .card.tbl","Planificados","Los próximos mantenimientos con fecha estimada según cuántos km recorre cada vehículo por día."],["#dp","Por parqueo","Filtra por parqueo o mira todos juntos."]],
  registrar:[["#rsc","QR del vehículo","Pega el QR impreso en cada vehículo: el conductor lo escanea y se elige solo."],["#rtip","Qué registrar","Combustible calcula el rendimiento km/l y avisa si el vehículo consume de más."]],
  vehiculos:[["#vnew","Nuevo vehículo","Placa, documentos con vencimiento, conductor y rendimiento esperado. Se crean planes de mantenimiento de ejemplo."]],
  mantenimiento:[["#main .card","Planes de toda la flota","Primero lo vencido. Toca Registrar cuando se haga el mantenimiento y el próximo se recalcula solo."]],
  reportes:[["#rout .kpis","Costos","Gasto total, combustible, recorrido y costo por km del período. Descarga el detalle en CSV para Excel."]],
  conductores:[["#cnew","Conductores","Con su licencia y vencimiento: te avisamos antes de que venza."]],
  sucursales:[["#snew","Parqueos","Crea un parqueo por cada base o garaje y asigna ahí sus vehículos."]],usuarios:[["#unew","Usuarios","Perfiles listos: Administrador, Jefe de flota o Conductor."]],
  config:[["#ctc","Alertas de consumo","Cuánto puede bajar el rendimiento antes de avisar."]]
};
let TOUR=null;
const tourKey=v=>`tour-${USER?.id}-${v}`;
const TOUR_VISTOS=new Set();
const tourVisto=v=>TOUR_VISTOS.has(tourKey(v))||!!ls.get(tourKey(v));
const marcarTour=v=>{ TOUR_VISTOS.add(tourKey(v)); ls.set(tourKey(v),"1"); };
const toursApagados=()=>TOUR_VISTOS.has(tourKey("_off"))||!!ls.get(tourKey("_off"));
function maybeTour(view){ if(!USER||toursApagados()) return;
  if(!tourVisto("_inicio")){ startTour("_inicio",false,()=>{ if(TOURS[view]&&!tourVisto(view)&&!toursApagados()) startTour(view); }); return; }
  if(TOURS[view]&&!tourVisto(view)) startTour(view); }
function startTour(view,force,after){ const steps=(TOURS[view]||[]).filter(([sel])=>!sel||document.querySelector(sel));
  if(!steps.length){ if(force) toast("Esta pantalla no tiene ayuda guiada."); return; }
  endTour(); const block=document.createElement("div"), hole=document.createElement("div"), tip=document.createElement("div");
  block.className="tour-block"; hole.className="tour-hole"; tip.className="tour-tip"; tip.setAttribute("role","dialog"); tip.setAttribute("aria-live","polite");
  document.body.append(block,hole,tip); TOUR={view,steps,i:0,block,hole,tip,after}; drawTour();
  block.onclick=()=>nextTour(); }
function drawTour(){ const T=TOUR; if(!T) return; const [sel,tt,tx]=T.steps[T.i], el=sel&&document.querySelector(sel);
  T.tip.innerHTML=`<h4>${esc(tt)}</h4><p>${esc(tx)}</p><div class="tacts"><span class="step">${T.i+1} de ${T.steps.length}</span><span class="sp"></span>
    <button class="link" id="tOff" title="Puedes verlas cuando quieras con el botón ?">No mostrar más</button><button class="link" id="tSkip">Saltar</button>${T.i?`<button class="sec" id="tPrev">Anterior</button>`:""}<button id="tNext">${T.i===T.steps.length-1?"¡Listo!":"Siguiente"}</button></div>`;
  T.tip.querySelector("#tSkip").onclick=()=>endTour(true);
  T.tip.querySelector("#tOff").onclick=()=>{ TOUR_VISTOS.add(tourKey("_off")); ls.set(tourKey("_off"),"1"); if(TOUR) TOUR.after=null; endTour(true); toast("Listo, no se mostrarán más guías. Si las necesitas, toca el botón ?"); }; T.tip.querySelector("#tNext").onclick=nextTour; const p=T.tip.querySelector("#tPrev"); if(p) p.onclick=()=>{ T.i--; drawTour(); };
  T.tip.querySelector("#tNext").focus({preventScroll:true});
  if(!el){ T.hole.className="tour-hole none"; Object.assign(T.tip.style,{left:`calc(50% - ${Math.min(360,innerWidth-24)/2}px)`,top:"30%"}); return; }
  el.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  setTimeout(()=>{ if(!TOUR) return; const r=el.getBoundingClientRect(), pad=6, vh=innerHeight, vw=innerWidth;
    const h=Math.min(r.height,vh*0.6); T.hole.className="tour-hole";
    Object.assign(T.hole.style,{left:(r.left-pad)+"px",top:(r.top-pad)+"px",width:(r.width+pad*2)+"px",height:(h+pad*2)+"px"});
    const tw=T.tip.offsetWidth, th=T.tip.offsetHeight; let top=r.top+h+pad+12; if(top+th>vh-12) top=Math.max(12,r.top-pad-12-th);
    const left=Math.min(Math.max(12,r.left),vw-tw-12); Object.assign(T.tip.style,{left:left+"px",top:top+"px"}); },320); }
function nextTour(){ if(!TOUR) return; if(TOUR.i<TOUR.steps.length-1){ TOUR.i++; drawTour(); } else endTour(true); }
function endTour(done){ if(!TOUR) return; const {view,block,hole,tip,after}=TOUR; block.remove(); hole.remove(); tip.remove(); TOUR=null;
  marcarTour(view); if(done&&after) after(); }
document.addEventListener("keydown",e=>{ if(!TOUR) return; if(e.key==="Escape") endTour(true); else if(e.key==="ArrowRight") nextTour(); else if(e.key==="ArrowLeft"&&TOUR.i){ TOUR.i--; drawTour(); } });
addEventListener("resize",()=>{ if(TOUR) drawTour(); });

boot();
