// ===================== Utilidades =====================
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtN=(n,d=2)=>Number(n||0).toLocaleString("es-BO",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtQ=n=>Number(n||0).toLocaleString("es-BO",{maximumFractionDigits:3});
const money=n=>`${EMP?.moneda||"Bs"} ${fmtN(n)}`;
const today=()=>{ const d=new Date(); return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
const daysAgo=n=>{ const d=new Date(Date.now()-n*864e5); return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),3800); }
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){return false}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
let TOKEN=ls.get("ag-token"), OFFLINE=false, USER=null, EMP=null, SUCS=[], ALLSUCS=[], SUC=null;
async function api(path,opt={}){
  let r; try{ r=await fetch("/api/"+path,{method:opt.method||(opt.body?"POST":"GET"),headers:{"content-type":"application/json",...(TOKEN?{authorization:"Bearer "+TOKEN}:{})},body:opt.body?JSON.stringify(opt.body):undefined}); }
  catch(e){ const x=new Error("Sin conexión con el servidor"); x.offline=true; throw x; }
  const j=await r.json().catch(()=>({ok:false,error:"Respuesta no válida del servidor"}));
  if(r.status===401 && path!=="login" && path!=="setup"){ logoutLocal(); throw new Error(j.error||"Sesión vencida"); }
  if(!j.ok) throw new Error(j.error||"Error"); return j;
}
const can=p=>USER&&!USER.super&&USER.permisos.includes(p);
function dialog(html,onReady){ $("dlgBody").innerHTML=html; const d=$("dlg"); if(!d.open) d.showModal(); onReady&&onReady($("dlgBody")); }
function closeDlg(){ $("dlg").close(); }
// Diálogo secundario, apilado sobre el principal, para confirmar, avisar o pedir un texto. Reemplaza alert/confirm/prompt.
function pregunta({titulo="",texto="",input=null,ok="Aceptar",cancelar="Cancelar",peligro=false}){ return new Promise(res=>{ const d=$("dlg2"), B=$("dlg2Body");
  B.innerHTML=`${titulo?`<h3>${esc(titulo)}</h3>`:""}${texto?`<p style="white-space:pre-line;margin:0 0 8px">${esc(texto)}</p>`:""}${input?`<div class="field"><label>${esc(input)}</label><input id="pqIn" autocomplete="off"></div>`:""}
    <div class="acts">${cancelar?`<button class="sec" id="pqNo">${esc(cancelar)}</button>`:""}<button id="pqOk" class="${peligro?"danger":""}">${esc(ok)}</button></div>`;
  const fin=v=>{ d.close(); res(v); }; B.querySelector("#pqOk").onclick=()=>fin(input?B.querySelector("#pqIn").value.trim():true);
  const no=B.querySelector("#pqNo"); if(no) no.onclick=()=>fin(input?null:false); d.oncancel=e=>{ e.preventDefault(); fin(input?null:false); };
  if(!d.open) d.showModal(); const i=B.querySelector("#pqIn"); (i||B.querySelector("#pqOk")).focus(); if(i) i.onkeydown=e=>{ if(e.key==="Enter") B.querySelector("#pqOk").click(); }; }); }
const confirmar=(texto,opt={})=>pregunta({texto,ok:"Sí, continuar",...opt});
const avisar=(texto,titulo="")=>pregunta({titulo,texto,cancelar:null,ok:"Entendido"});
function descargar(texto,nombre,tipo="text/csv"){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\ufeff"+texto],{type:tipo})); a.download=nombre; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); }
const sucName=id=>(ALLSUCS.find(s=>s.id===id)||SUCS.find(s=>s.id===id)||{}).nombre||"—";
const val=(b,s)=>b.querySelector(s)?.value??"";

// ===================== Inicio, instalación y login =====================
function show(v){ ["vSetup","vLogin","vApp","vPub"].forEach(x=>$(x).classList.toggle("hidden",x!==v)); }
async function boot(){
  if(TOKEN){ try{ const u=(await api("login")).usuario; ls.set("ag-user",JSON.stringify(u)); setUser(u); return startApp(); }
    catch(e){ const c=ls.get("ag-user"); if(e.offline&&c){ OFFLINE=true; setUser(JSON.parse(c)); return startApp(); } } }
  const hv=location.hash.match(/^#v=([a-f0-9]+)/i); if(hv) return fichaPublica(hv[1]); // QR escaneado sin sesión: ficha pública del vehículo
  try{ const s=await api("setup"); if(s.necesita) return show("vSetup"); }catch(e){}
  show("vLogin"); $("lgUser").focus();
}
$("suBtn").onclick=async()=>{ $("suErr").textContent="";
  try{ await api("setup",{body:{setup_key:$("suKey").value,nombre:$("suNombre").value,usuario:$("suUser").value,password:$("suPass").value}});
    $("lgUser").value=$("suUser").value; toast("Usuario de plataforma creado. Ahora ingresa."); show("vLogin"); }catch(e){ $("suErr").textContent=e.message; } };
function setUser(u){ USER=u; EMP=u.empresa||null; SUCS=u.sucursales||[]; const saved=+ls.get("ag-suc-"+u.id); SUC=SUCS.some(s=>s.id===saved)?saved:(SUCS[0]?.id||null); }
async function doLogin(){ $("lgErr").textContent=""; $("lgBtn").disabled=true;
  try{ const j=await api("login",{body:{usuario:$("lgUser").value,password:$("lgPass").value}}); TOKEN=j.token; ls.set("ag-token",TOKEN); ls.set("ag-user",JSON.stringify(j.usuario)); $("lgPass").value=""; setUser(j.usuario); startApp(); }
  catch(e){ $("lgErr").textContent=e.message; } $("lgBtn").disabled=false; }
$("lgForm").onsubmit=e=>{ e.preventDefault(); doLogin(); };
function logoutLocal(){ endTour(); TOKEN=null; USER=null; ls.del("ag-token"); ls.del("ag-user"); pintarCola(); show("vLogin"); }
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
  {id:"proveedores",t:"Proveedores",ok:()=>can("mantenimiento")||can("vehiculos"),f:viewProveedores},
  {id:"repuestos",t:"Repuestos",ok:()=>can("mantenimiento"),f:viewRepuestos},
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
  pintarCola(); enviarCola();
  if(OFFLINE){ OFFLINE=false; toast("Sin conexión: puedes registrar y se enviará cuando vuelva la señal"); if(vs.some(v=>v.id==="registrar")) return go("registrar"); }
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
const precioEmp=e=>e.precio??PLAT.planes[e.plan||"basico"].precio;
async function viewPlataforma(){ PLAT=await api("plataforma"); const E=PLAT.empresas, h=PLAT.hoy;
  const activas=E.filter(e=>e.activo&&(!e.vence||diasA(e.vence,h)>=-PLAT.gracia)), mrr=activas.reduce((a,e)=>a+precioEmp(e),0);
  const porCobrar=E.filter(e=>e.activo&&e.vence&&diasA(e.vence,h)<=7);
  $("main").innerHTML=`<h2>Empresas</h2><div class="kpis"><div class="card kpi"><div class="v">${activas.length} / ${E.length}</div><div class="l">Empresas activas</div></div>
    <div class="card kpi"><div class="v num">Bs ${fmtN(mrr,0)}</div><div class="l">Ingreso mensual esperado</div></div>
    <div class="card kpi"><div class="v num">Bs ${fmtN(PLAT.cobrado_mes.total,0)}</div><div class="l">Cobrado este mes (${PLAT.cobrado_mes.n} pagos)</div></div>
    <div class="card kpi"><div class="v" style="color:${porCobrar.length?"var(--warn)":"inherit"}">${porCobrar.length}</div><div class="l">Por cobrar (vencen en 7 días o vencidas)</div></div></div>
    <div class="toolbar"><button id="enew">+ Nueva empresa</button></div>
    <div class="card tbl"><table><thead><tr><th>Empresa</th><th>Plan</th><th class="n">Precio</th><th>Vence</th><th>Estado</th><th>Uso</th><th class="n">Registros 30d</th><th></th></tr></thead><tbody>
    ${E.map(e=>{ const [t,c]=estadoEmp(e), L=PLAT.planes[e.plan||"basico"]; return `<tr class="click" data-id="${e.id}"><td><b>${esc(e.nombre)}</b><br><small class="muted">${esc(e.admins||"")}</small></td>
      <td>${esc(L.nombre)}</td><td class="n">Bs ${fmtN(precioEmp(e),0)}</td><td>${esc(e.vence||"—")}<br><small class="muted">${e.ultimo_pago?"Últ. pago "+esc(e.ultimo_pago.slice(0,10)):"Sin pagos"}</small></td>
      <td><span class="chip ${c}">${t}</span></td><td><small>${e.vehiculos} vehículos · ${e.sucursales} parqueos · ${e.usuarios} usu</small></td><td class="n">${e.eventos_30d}</td>
      <td class="right">${e.vence&&diasA(e.vence,h)<=7&&e.telefono_admin?`<a class="btn sec" data-wa="${e.id}" target="_blank" rel="noopener">Recordar</a>`:""}</td></tr>`; }).join("")||'<tr><td colspan="8" class="muted">Crea tu primera empresa.</td></tr>'}</tbody></table></div>`;
  $("main").querySelectorAll("[data-wa]").forEach(a=>{ const e=E.find(x=>x.id==a.dataset.wa), t=e.telefono_admin.length===8?"591"+e.telefono_admin:e.telefono_admin;
    a.href=`https://wa.me/${t}?text=${encodeURIComponent(recordatorio(e))}`; a.onclick=ev=>ev.stopPropagation(); });
  $("enew").onclick=()=>empresaForm(null);
  const tb=$("enew").parentElement; const bd=document.createElement("button"); bd.className="sec"; bd.textContent="🧪 Crear / regenerar empresa demo"; tb.appendChild(bd);
  bd.onclick=async()=>{ if(!await confirmar("Se crea (o se borra y vuelve a crear) la empresa 'Transportes Demo' con 6 meses de datos ficticios. ¿Continuar?")) return; bd.disabled=true; bd.textContent="Generando datos…";
    try{ const r=await api("demo",{body:{}}); dialog(`<h3>🧪 Empresa demo lista</h3><p><b>${esc(r.empresa)}</b> con ${r.registros} registros de los últimos 6 meses.</p>
      <div class="tbl"><table><thead><tr><th>Usuario</th><th>Contraseña</th><th>Qué ve</th></tr></thead><tbody>${r.usuarios.map(u=>`<tr><td><b>${esc(u.usuario)}</b></td><td>${esc(u.clave)}</td><td><small>${esc(u.perfil)}</small></td></tr>`).join("")}</tbody></table></div>
      <p class="muted">Ábrelo en otra ventana privada o en otro navegador para no cerrar tu sesión. Regenérala antes de cada demo para que las fechas queden al día.</p><div class="acts"><button id="dx">Listo</button></div>`, B=>B.querySelector("#dx").onclick=()=>{ closeDlg(); go("plataforma"); }); }
    catch(e){ toast(e.message); } bd.disabled=false; bd.textContent="🧪 Crear / regenerar empresa demo"; };
  document.querySelectorAll("#main tr[data-id]").forEach(tr=>tr.onclick=e=>{ if(e.target.closest("a")) return; empresaForm(E.find(x=>x.id==tr.dataset.id)); }); }
function recordatorio(e){ const d=diasA(e.vence,PLAT.hoy);
  return `Hola, te escribimos por el sistema de control de flota de *${e.nombre}*. ${d>=0?`Tu suscripción vence el ${e.vence}.`:`Tu suscripción venció el ${e.vence} y el sistema se bloqueará pronto.`} El monto es *Bs ${fmtN(precioEmp(e),0)}* al mes. Puedes pagar por QR o transferencia y enviarnos el comprobante por aquí. ¡Gracias!`; }
const planOpts=sel=>Object.entries(PLAT.planes).map(([k,p])=>`<option value="${k}" ${k===sel?"selected":""}>${p.nombre} — Bs ${p.precio}/mes (${p.vehiculos??"∞"} vehículos, ${p.sucursales??"∞"} parqueos, ${p.usuarios??"∞"} usu)</option>`).join("");
async function empresaForm(e){
  if(!e) return dialog(`<h3>Nueva empresa</h3><div class="row"><div class="field"><label>Nombre de la empresa *</label><input id="en"></div><div class="field"><label>Identificador web</label><input id="es" placeholder="se genera del nombre"></div></div>
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
    <div class="field"><label>Plan</label><select id="epl">${planOpts(e.plan||"basico")}</select></div>
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
    <div class="field"><label>Presupuesto mensual del parqueo (${esc(EMP.moneda)}, vacío = sin límite)</label><input id="sp" inputmode="decimal" value="${s?.presupuesto_mes||""}"></div>
    ${s?`<label class="check"><input type="checkbox" id="sac" ${s.activo?"checked":""}> Activa</label>`:""}<div class="err" id="serr"></div><div class="acts"><button class="sec" id="sx">Cancelar</button><button id="sok">Guardar</button></div>`, b=>{
    b.querySelector("#sx").onclick=closeDlg;
    b.querySelector("#sok").onclick=async()=>{ try{ await api("m/sucursales",{body:{id:s?.id,nombre:val(b,"#sn"),direccion:val(b,"#sa"),telefono:val(b,"#st"),presupuesto_mes:val(b,"#sp").replace(",","."),activo:s?b.querySelector("#sac").checked:true}});
      closeDlg(); toast("Parqueo guardado"); const me=await api("login"); setUser(me.usuario); drawSucSel(); go("sucursales"); }catch(e){ b.querySelector("#serr").textContent=e.message; } }; });
  $("snew").onclick=()=>form(null); document.querySelectorAll("#main tr[data-id]").forEach(tr=>tr.onclick=()=>form(ALLSUCS.find(s=>s.id==tr.dataset.id))); }

// ===================== Usuarios =====================
const PRESETS={Administrador:["registrar","mantenimiento","vehiculos","reportes","sucursales","usuarios"],"Jefe de flota":["registrar","mantenimiento","vehiculos","reportes"],"Conductor":["registrar"]};
async function viewUsuarios(){ const j=await api("usuarios"); ALLSUCS=(await api("m/sucursales")).items;
  $("main").innerHTML=`<h2>Usuarios y permisos</h2><div class="toolbar"><button id="unew">+ Nuevo usuario</button></div><div class="card tbl"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Parqueos</th><th>Permisos</th><th>Estado</th></tr></thead><tbody>
    ${j.usuarios.map(u=>`<tr class="click" data-id="${u.id}"><td>${esc(u.nombre)}</td><td>${esc(u.usuario)}</td><td><small>${u.sucursales.length?u.sucursales.map(sucName).map(esc).join(", "):"Todas"}</small></td>
      <td>${u.permisos.map(p=>`<span class="chip">${esc(j.permisos[p]||p)}</span>`).join(" ")}</td><td>${u.activo?'<span class="chip ok">Activo</span>':'<span class="chip bad">Inactivo</span>'}</td></tr>`).join("")}</tbody></table></div>`;
  $("unew").onclick=()=>userForm(null,j.permisos); document.querySelectorAll("#main tr[data-id]").forEach(tr=>tr.onclick=()=>userForm(j.usuarios.find(u=>u.id==tr.dataset.id),j.permisos)); }
function userForm(u,P){ const perms=new Set(u?u.permisos:PRESETS.Conductor), sucs=new Set(u?u.sucursales:[]);
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

// ===================== Fechas, fotos, cámara e impresión =====================
const TZ="America/La_Paz";
const fechaHora=s=>s?new Date(s).toLocaleString("es-BO",{timeZone:TZ,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
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
  w.document.write(`<html><head><title>Etiqueta</title><style>@page{size:58mm auto;margin:3mm}body{font-family:monospace,system-ui;width:52mm;margin:0 auto;font-size:12px;color:#000}h2,h3{margin:4px 0;text-align:center}.c{text-align:center}.big{font-size:22px;font-weight:800;letter-spacing:2px}hr{border:0;border-top:1px dashed #000}table{width:100%}td.r{text-align:right}svg{width:38mm;height:38mm}</style></head><body>${html}<script>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close(); }

// ===================== Flota: datos y utilidades =====================
let VEH=[], COND=[], PROV=[], PRESEL=null;
const TIPOS_EV={combustible:["⛽","Combustible"],mantenimiento:["🔧","Mantenimiento"],lavado:["🧽","Lavado"],gasto:["🧾","Otro gasto"],kilometraje:["📍","Kilometraje"]};
const fmtKm=n=>`${fmtQ(Math.round(n||0))} km`;
const fechaCorta=f=>f?new Date(f+"T12:00:00Z").toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}):"—";
async function cargarVeh(){ try{ VEH=(await api("vehiculos")).vehiculos; ls.set("ag-veh-"+USER.id,JSON.stringify(VEH)); }
  catch(e){ if(!e.offline) throw e; VEH=JSON.parse(ls.get("ag-veh-"+USER.id)||"null"); if(!VEH) throw e; toast("Sin conexión: se muestra la última lista de vehículos guardada"); } return VEH; }
async function cargarCond(){ try{ COND=(await api("conductores")).conductores; ls.set("ag-cond-"+USER.id,JSON.stringify(COND)); }
  catch(e){ if(!e.offline) throw e; COND=JSON.parse(ls.get("ag-cond-"+USER.id)||"[]"); } return COND; }
const DOC1=()=>EMP?.doc1||"SOAT", DOC2=()=>EMP?.doc2||"Inspección técnica";
const selCond=(id,sel,vacio="Sin conductor")=>`<select id="${id}"><option value="">${vacio}</option>${COND.filter(c=>c.activo||c.id===sel).map(c=>`<option value="${c.id}" ${c.id===sel?"selected":""}>${esc(c.nombre)}</option>`).join("")}</select>`;
async function cargarProv(){ try{ PROV=(await api("proveedores")).proveedores; ls.set("ag-prov-"+USER.id,JSON.stringify(PROV)); }
  catch(e){ if(!e.offline) throw e; PROV=JSON.parse(ls.get("ag-prov-"+USER.id)||"[]"); } return PROV; }
// Proveedores: qué tipo usa cada registro y sus nombres en pantalla [singular, plural, "el/la ..."]
const TIPO_PROV={combustible:"surtidor",mantenimiento:"taller",lavado:"lavadero",gasto:"proveedor"};
const ETIQ_PROV={surtidor:["Estación de servicio","Estaciones de servicio","la estación de servicio"],taller:["Taller","Talleres","el taller"],lavadero:["Lavadero","Lavaderos","el lavadero"],proveedor:["Proveedor","Otros proveedores","el proveedor"]};
const provDe=tp=>PROV.filter(p=>p.tipo===tp&&p.activo), puedeProv=()=>can("mantenimiento")||can("vehiculos");
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
async function nuevoProv(tp,nombre){ try{ const r=await api("proveedores",{body:{tipo:tp,nombre}}); const p={id:r.id,tipo:tp,nombre,telefono:"",nota:"",activo:1,usos:0}; PROV.push(p); ls.set("ag-prov-"+USER.id,JSON.stringify(PROV)); toast("Agregado a la lista de proveedores"); return p; }
  catch(e){ toast(e.message); return null; } }
// Campo con lista desplegable y buscador. Si la lista tiene elementos solo se puede elegir uno de ellos; si está vacía es texto libre.
const comboHTML=(id,label,hay,ph)=>`<div class="field"><label>${label}</label><div class="combo"><input id="${id}" autocomplete="off" placeholder="${hay?"Busca y elige de la lista":esc(ph||"")}"><div class="opts hidden" id="${id}L"></div></div><small class="muted" id="${id}H"></small></div>`;
function combo(B,id,items,o={}){ const inp=B.querySelector("#"+id), box=B.querySelector("#"+id+"L"), hint=B.querySelector("#"+id+"H"); let sel=null, idx=-1, lista=[];
  const pista=()=>{ if(!hint) return; const pl=(o.plural||"proveedores").toLowerCase(); hint.textContent=items.length?"":o.nuevo?`La lista de ${pl} está vacía: escribe el nombre y elige «+ Agregar» para guardarlo. Desde entonces solo se podrá elegir de la lista.`:`Aún no hay ${pl} en la lista; escribe el nombre. Pide al jefe de flota que cargue la lista en Proveedores.`; };
  pista();
  const set=p=>{ sel=p; if(p) inp.value=p.nombre; inp.dataset.id=p?p.id:""; };
  const marcar=()=>inp.classList.toggle("bad",items.length>0&&!!inp.value.trim()&&!inp.dataset.id&&inp.value.trim()!==(o.valor||""));
  const cerrar=()=>{ box.classList.add("hidden"); idx=-1; };
  const elegir=p=>{ set(p); cerrar(); marcar(); };
  const abrir=()=>{ if(!items.length&&!o.nuevo) return; const q=norm(inp.value); lista=items.filter(p=>!q||norm(p.nombre).includes(q)).slice(0,40); const exacto=items.some(p=>norm(p.nombre)===q);
    box.innerHTML=lista.map((p,i)=>`<div class="opt${i===idx?" act":""}" data-i="${i}">${esc(p.nombre)}${p.telefono?`<small>${esc(p.telefono)}</small>`:""}</div>`).join("")
      +(lista.length?"":'<div class="opt muted">No hay coincidencias</div>')+(o.nuevo&&q&&!exacto?`<div class="opt add" data-add="1">+ Agregar «${esc(inp.value.trim())}»</div>`:"");
    box.classList.remove("hidden"); box.querySelector(".opt.act")?.scrollIntoView({block:"nearest"});
    box.querySelectorAll(".opt[data-i]").forEach(el=>el.onpointerdown=ev=>{ ev.preventDefault(); elegir(lista[+el.dataset.i]); });
    const a=box.querySelector("[data-add]"); if(a) a.onpointerdown=async ev=>{ ev.preventDefault(); cerrar(); const p=await o.nuevo(inp.value.trim()); if(p){ items.push(p); pista(); elegir(p); } }; };
  inp.oninput=()=>{ sel=null; inp.dataset.id=""; inp.classList.remove("bad"); idx=-1; abrir(); };
  inp.onfocus=abrir; inp.onblur=()=>{ cerrar(); if(!sel){ const m=items.find(p=>norm(p.nombre)===norm(inp.value)); if(m) set(m); } marcar(); };
  inp.onkeydown=ev=>{ if(ev.key==="ArrowDown"){ idx=Math.min(idx+1,Math.max(lista.length-1,0)); abrir(); ev.preventDefault(); }
    else if(ev.key==="ArrowUp"){ idx=Math.max(idx-1,0); abrir(); ev.preventDefault(); }
    else if(ev.key==="Enter"){ ev.preventDefault(); if(idx>=0&&lista[idx]) elegir(lista[idx]); else if(lista.length===1&&!box.classList.contains("hidden")) elegir(lista[0]); else inp.blur(); }
    else if(ev.key==="Escape") cerrar(); };
  if(o.valor){ inp.value=o.valor; const m=items.find(p=>norm(p.nombre)===norm(o.valor)); if(m) set(m); }
  return { get:()=>{ const v=inp.value.trim(); if(items.length&&v&&!inp.dataset.id&&v!==(o.valor||"")) return {error:`Elige ${o.etiq||"el proveedor"} de la lista`+(o.nuevo?" o agrégalo con «+ Agregar»":". Si falta, pide que lo agreguen en Proveedores")};
    return {proveedor:v,proveedor_id:inp.dataset.id?+inp.dataset.id:null}; } }; }
const nivelVeh=v=>v.alertas.some(a=>a.nivel==="bad")?"bad":v.alertas.length?"warn":"ok";
const linkQR=v=>`${location.origin}/#v=${v.codigo}`;
function etiquetaQR(v){ imprimir(`<h3>${esc(EMP.nombre)}</h3><div class="c big">${esc(v.placa)}</div><div class="c">${qrSvg(linkQR(v))}</div><div class="c">Escanea para registrar combustible, lavado o kilometraje</div>`); }

// ===================== Dashboard =====================
// Gráficos SVG propios (sin librerías): paleta categórica validada para daltonismo en claro y oscuro.
const PAL_L=["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#008300"], PAL_D=["#3987e5","#d95926","#199e70","#c98500","#d55181","#008300"];
const pal=i=>(matchMedia("(prefers-color-scheme: dark)").matches?PAL_D:PAL_L)[i%6];
const fmtK=n=>n>=1e6?fmtN(n/1e6,1)+" M":n>=1e4?fmtN(n/1e3,0)+" k":fmtN(n,0);
let TIP=null; function tipShow(html,x,y){ if(!TIP){ TIP=document.createElement("div"); TIP.id="tip"; document.body.appendChild(TIP); } TIP.innerHTML=html; TIP.classList.add("show"); const w=TIP.offsetWidth, h=TIP.offsetHeight; TIP.style.left=Math.min(innerWidth-w-8,x+14)+"px"; TIP.style.top=Math.max(8,y-h-14)+"px"; } function tipHide(){ if(TIP) TIP.classList.remove("show"); }
const mesCorto=m=>{ const [y,mo]=m.split("-"); return ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][+mo-1]+(mo==="01"?" "+y.slice(2):""); };
// Línea: {etiquetas:[...], series:[{nombre, valores:[...]}]} → SVG con grilla, marcadores, etiqueta al final y crosshair con tooltip
function chartLinea(el,{etiquetas,series}){ const W=640,H=240,L=46,R=70,T=16,B=28, n=etiquetas.length; if(!n||!series.some(s=>s.valores.some(v=>v>0))){ el.innerHTML='<p class="vacio">Sin datos en este período</p>'; return; }
  const max=Math.max(1,...series.flatMap(s=>s.valores)), X=i=>n===1?(L+W-R)/2:L+i*(W-L-R)/(n-1), Y=v=>T+(H-T-B)*(1-v/max);
  const grid=[0,.5,1].map(f=>`<line class="gl" x1="${L}" x2="${W-R}" y1="${Y(max*f)}" y2="${Y(max*f)}"/><text x="${L-6}" y="${Y(max*f)+4}" text-anchor="end">${fmtK(max*f)}</text>`).join("");
  const xs=etiquetas.map((e,i)=>(n<=12||i%2===0)?`<text x="${X(i)}" y="${H-8}" text-anchor="middle">${esc(mesCorto(e))}</text>`:"").join("");
  const paths=series.map((s,k)=>`<path class="ser" stroke="${pal(k)}" d="${s.valores.map((v,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(v).toFixed(1)).join(" ")}"/>${s.valores.map((v,i)=>`<circle class="mk" cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="${pal(k)}"/>`).join("")}
    <text x="${W-R+8}" y="${Y(s.valores[n-1])+4}" style="fill:var(--ink);font-weight:600">${esc(s.nombre)}</text>`).join("");
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por mes">${grid}${xs}${paths}<line class="cross" id="cx" y1="${T}" y2="${H-B}"/><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent" id="hit"/></svg>
    <div class="leg">${series.map((s,k)=>`<span style="--c:${pal(k)}">${esc(s.nombre)}</span>`).join("")}</div>`;
  const svg=el.querySelector("svg"), cx=el.querySelector("#cx"), hit=el.querySelector("#hit");
  hit.onmousemove=ev=>{ const r=svg.getBoundingClientRect(), x=(ev.clientX-r.left)*W/r.width, i=n===1?0:Math.max(0,Math.min(n-1,Math.round((x-L)/((W-L-R)/(n-1))))); cx.setAttribute("x1",X(i)); cx.setAttribute("x2",X(i)); cx.style.opacity=1;
    tipShow(`<b>${esc(mesCorto(etiquetas[i]))}</b>${series.map((s,k)=>`<br><span style="color:${pal(k)}">●</span> ${esc(s.nombre)}: ${money(s.valores[i])}`).join("")}<br>Total: <b>${money(series.reduce((a,s)=>a+s.valores[i],0))}</b>`,ev.clientX,ev.clientY); };
  hit.onmouseleave=()=>{ cx.style.opacity=0; tipHide(); }; }
// Dona: {items:[{nombre,total}]} con máximo 5 categorías + Otros, total al centro y leyenda con valores
function chartDona(el,items,total){ const top=items.slice(0,5), otros=items.slice(5).reduce((a,x)=>a+x.total,0); if(otros>0) top.push({nombre:"Otros",total:otros});
  const sum=top.reduce((a,x)=>a+x.total,0); if(!sum){ el.innerHTML='<p class="vacio">Sin datos en este período</p>'; return; }
  const r=60,c=2*Math.PI*r; let off=0;
  const arcs=top.map((x,k)=>{ const f=x.total/sum, len=Math.max(0,f*c-2); const s=`<circle cx="75" cy="75" r="${r}" fill="none" stroke="${pal(k)}" stroke-width="22" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)" data-i="${k}"/>`; off+=f*c; return s; }).join("");
  el.innerHTML=`<div class="dona"><svg viewBox="0 0 150 150" role="img" aria-label="Gasto por categoría">${arcs}<text x="75" y="71" text-anchor="middle" style="fill:var(--ink);font-size:15px;font-weight:700">${esc(fmtK(total??sum))}</text><text x="75" y="88" text-anchor="middle">${esc(EMP.moneda)} total</text></svg>
    <div class="lg">${top.map((x,k)=>`<div data-i="${k}"><span><i style="--c:${pal(k)}"></i>${esc(x.nombre)}</span><span class="num">${money(x.total)} <small class="muted">${Math.round(x.total/sum*100)}%</small></span></div>`).join("")}</div></div>`;
  el.querySelectorAll("circle[data-i]").forEach(ci=>{ const x=top[+ci.dataset.i]; ci.onmousemove=ev=>tipShow(`<b>${esc(x.nombre)}</b><br>${money(x.total)} · ${Math.round(x.total/sum*100)}%`,ev.clientX,ev.clientY); ci.onmouseleave=tipHide; }); }
// Barras horizontales: items [{nombre,total,...}] en un solo tono, valor en la punta
function chartBarras(el,items,{color,sub}={}){ if(!items.length){ el.innerHTML='<p class="vacio">Sin datos en este período</p>'; return; } const max=Math.max(1,...items.map(x=>x.total));
  el.innerHTML=`<div class="hbar">${items.map(x=>`<div class="lb" title="${esc(x.nombre)}">${esc(x.nombre)}</div><div class="bw" data-t="${esc(x.nombre)}: ${money(x.total)}${sub?sub(x):""}"><div class="b" style="width:${Math.max(1,x.total/max*100)}%;background:${color||pal(0)}"></div><span class="n num">${fmtK(x.total)}</span></div>`).join("")}</div>`;
  el.querySelectorAll(".bw").forEach(b=>{ b.onmousemove=ev=>tipShow(b.dataset.t,ev.clientX,ev.clientY); b.onmouseleave=tipHide; }); }
const estChip=e=>`<span class="chip ${e==="vencido"?"bad":e==="proximo"?"warn":e==="sin_registro"?"":"ok"}">${e==="vencido"?"Vencido":e==="proximo"?"Próximo":e==="sin_registro"?"Sin registro":"Planificado"}</span>`;
const RANGOS={mes:()=>[today().slice(0,8)+"01",today()],ant:()=>{ const d=new Date(); d.setDate(0); const h=new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); return [h.slice(0,8)+"01",h]; },tri:()=>[daysAgo(89),today()],anio:()=>[today().slice(0,4)+"-01-01",today()],doce:()=>[daysAgo(364),today()]};
async function viewPanel(){ const admin=can("reportes"); let par=PRESEL?.panel_suc??"", hor=90, rango=ls.get("ag-rango")||"mes";
  $("main").innerHTML=`<div class="toolbar" style="justify-content:space-between;align-items:center"><h2 style="margin:0">${admin?"Dashboard de la flota":"Mi panel"}</h2>
    <div class="toolbar" style="margin:0">${SUCS.length>1?`<div><label>Parqueo</label><select id="dp"><option value="">Todos los parqueos</option>${SUCS.map(s=>`<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></div>`:""}
    <div><label>Planificados a</label><select id="dz"><option value="30">30 días</option><option value="60">60 días</option><option value="90" selected>90 días</option><option value="365">1 año</option></select></div></div></div>
    ${admin?`<div class="toolbar" style="align-items:center"><div class="chips" id="drg">${[["mes","Este mes"],["ant","Mes anterior"],["tri","3 meses"],["anio","Este año"],["doce","12 meses"],["custom","Personalizado"]].map(([k,t])=>`<button class="sec" data-rg="${k}">${t}</button>`).join("")}</div>
      <div id="dcus" class="toolbar hidden" style="margin:0"><div><label>Desde</label><input type="date" id="dd"></div><div><label>Hasta</label><input type="date" id="dh"></div></div></div>`:""}
    <div class="toolbar">${can("registrar")?`<button id="preg">➕ Registrar</button><button class="sec" id="pscan">📷 Escanear QR del vehículo</button>`:""}<button class="sec" id="pwa" title="Abre WhatsApp con el resumen de vencidos, próximos y documentos">💬 Resumen por WhatsApp</button></div><div id="dout"><p class="muted">Cargando…</p></div>`;
  if($("dp")) $("dp").value=par;
  const setRango=k=>{ rango=k; ls.set("ag-rango",k); $("main").querySelectorAll("[data-rg]").forEach(b=>b.className=b.dataset.rg===k?"":"sec"); $("dcus").classList.toggle("hidden",k!=="custom"); if(k!=="custom"){ const [a,b]=RANGOS[k](); $("dd").value=a; $("dh").value=b; } else { if(!$("dd").value){ const [a,b]=RANGOS.mes(); $("dd").value=a; $("dh").value=b; } } };
  if(admin) setRango(RANGOS[rango]||rango==="custom"?rango:"mes");
  const load=async()=>{ const p=$("dp")?.value||""; hor=+$("dz").value; VEH=(await api("vehiculos")).vehiculos;
    const j=await api(`dashboard?${p?"sucursal_id="+p+"&":""}${admin?`desde=${$("dd").value}&hasta=${$("dh").value}`:""}`); if(j.vacio){ $("dout").innerHTML='<div class="card"><p class="muted">Sin parqueos asignados.</p></div>'; return; }
    const lim=new Date(Date.now()+hor*864e5).toISOString().slice(0,10), plan=j.planificados.filter(x=>x.estado==="vencido"||x.estado==="proximo"||(x.estimada&&x.estimada<=lim));
    const venc=plan.filter(x=>x.estado==="vencido").length, prox=plan.filter(x=>x.estado==="proximo").length, T=j.parqueos.reduce((a,x)=>({total:a.total+(x.total||0),man:a.man+(x.mantenimiento||0),comb:a.comb+(x.combustible||0),lav:a.lav+(x.lavado||0),otr:a.otr+(x.gasto||0),l:a.l+x.litros}),{total:0,man:0,comb:0,lav:0,otr:0,l:0});
    const tablaPlan=`<div class="card tbl"><h3>🗓️ Mantenimientos planificados <small class="muted">(vencidos y próximos ${hor} días)</small></h3><table><thead><tr><th>Vehículo</th>${SUCS.length>1?"<th>Parqueo</th>":""}<th>Mantenimiento</th><th>Fecha estimada</th><th>Km objetivo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${plan.map(x=>`<tr><td><b>${esc(x.placa)}</b></td>${SUCS.length>1?`<td>${esc(x.sucursal)}</td>`:""}<td>${esc(x.plan)}</td><td>${x.estimada?fechaCorta(x.estimada):"—"}${x.km_dia?`<br><small class="muted">~${x.km_dia} km/día</small>`:""}</td>
        <td>${x.proxKm!=null?fmtKm(x.proxKm):"—"}${x.faltaKm!=null?`<br><small class="muted">${x.faltaKm<=0?"pasado "+fmtKm(-x.faltaKm):"faltan "+fmtKm(x.faltaKm)}</small>`:""}</td><td>${estChip(x.estado)}</td>
        <td>${can("mantenimiento")?`<button class="sec" data-r="${x.vehiculo_id}:${x.plan_id}">Registrar</button>`:""}</td></tr>`).join("")||`<tr><td colspan="7" class="muted">Nada planificado en los próximos ${hor} días. ✅</td></tr>`}</tbody></table></div>`;
    const tablaRea=`<div class="card tbl"><h3>🔧 Mantenimientos realizados <small class="muted">(${admin?`${fechaCorta(j.desde)} – ${fechaCorta(j.hasta)}`:"últimos 30 días"})</small></h3><table><thead><tr><th>Fecha</th><th>Vehículo</th><th>Trabajo</th><th>Taller</th><th class="n">Km</th>${j.costos?'<th class="n">Costo</th>':""}</tr></thead><tbody>
      ${j.realizados.map(x=>`<tr><td>${fechaHora(x.fecha).split(",")[0]}</td><td><b>${esc(x.placa)}</b></td><td>${esc(x.plan||x.detalle||"Correctivo")}</td><td>${esc(x.proveedor||"")}</td><td class="n">${x.km!=null?fmtQ(Math.round(x.km)):""}</td>${j.costos?`<td class="n">${money(x.monto)}</td>`:""}</tr>`).join("")||'<tr><td colspan="6" class="muted">Sin mantenimientos en este período.</td></tr>'}</tbody></table></div>`;
    const docs=j.documentos.length?`<div class="card" style="margin-top:12px"><h3>📄 Documentos vencidos o por vencer</h3>${j.documentos.map(x=>`<div><span class="chip ${x.estado==="vencido"?"bad":"warn"}">${x.estado==="vencido"?"Vencido":`${x.dias} días`}</span> <b>${esc(x.placa)}</b> · ${esc(x.doc)} · ${fechaCorta(x.fecha)}</div>`).join("")}</div>`:"";
    const barPres=x=>{ const p=x.gastado/x.presupuesto*100, col=p>=100?"var(--bad)":p>=80?"var(--warn)":"var(--accent)"; return `<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:.9rem"><span><b>${esc(x.placa||x.nombre)}</b>${x.placa&&SUCS.length>1?` <small class="muted">${esc(x.sucursal)}</small>`:x.placa?"":' <small class="muted">parqueo</small>'}</span><span class="num">${money(x.gastado)} / ${money(x.presupuesto)} · <b style="color:${col}">${Math.round(p)}%</b></span></div><div style="background:var(--bg);border-radius:6px;height:10px;overflow:hidden"><div style="height:100%;width:${Math.min(100,p)}%;background:${col}"></div></div></div>`; };
    const PR=j.presupuestos||{parqueos:[],vehiculos:[]}, presCard=(PR.parqueos.length||PR.vehiculos.length)?`<div class="card" style="margin-top:12px"><h3>💸 Presupuesto de ${esc(j.mes)} <small class="muted">(gastado / presupuesto)</small></h3>${PR.parqueos.map(barPres).join("")}${PR.vehiculos.map(barPres).join("")}</div>`:"";
    const repCard=j.repuestos_min?.length?`<div class="card" style="margin-top:12px"><h3>📦 Repuestos bajo mínimo</h3>${j.repuestos_min.map(r=>`<div><span class="chip ${r.stock<=0?"bad":"warn"}">${fmtQ(r.stock)} ${esc(r.unidad)}</span> <b>${esc(r.nombre)}</b> <small class="muted">mínimo ${fmtQ(r.minimo)}</small></div>`).join("")}${can("mantenimiento")?`<button class="sec" id="prep" style="margin-top:8px">Ver repuestos</button>`:""}</div>`:"";
    if(admin){ const G=j.graficos||{}, per=`${fechaCorta(j.desde)} – ${fechaCorta(j.hasta)}`, nv=j.vehiculos.length;
      $("dout").innerHTML=`<div class="kpis">
        <div class="card kpi hero"><div class="v num">${money(T.total)}</div><div class="l">Gasto total · ${per}</div></div>
        <div class="card kpi"><div class="v num">${G.km>0?money(T.total/G.km):"—"}</div><div class="l">Costo por km · ${fmtKm(G.km||0)} recorridos</div></div>
        <div class="card kpi"><div class="v num">${nv?money(T.total/nv):"—"}</div><div class="l">Promedio por vehículo (${nv})</div></div>
        <div class="card kpi"><div class="v" style="color:${venc?"var(--bad)":"inherit"}">${venc}</div><div class="l">Mantenimientos vencidos</div></div>
        <div class="card kpi"><div class="v" style="color:${prox?"var(--warn)":"inherit"}">${prox}</div><div class="l">Próximos</div></div>
        <div class="card kpi"><div class="v num">${fmtN(T.l,0)} L</div><div class="l">Combustible · ${money(T.comb)}</div></div></div>
        ${j.parqueos.length>1?`<div class="pgrid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:12px">${j.parqueos.map((x,k)=>`<div class="card ptile ${$("dp")?.value==x.sucursal_id?"on":""}" data-ps="${x.sucursal_id}" style="border-top-color:${pal(k)}"><b>${esc(x.nombre)}</b><div class="v num">${money(x.total)}</div><small>${x.vehiculos} vehículos · ${x.vehiculos?money(x.total/x.vehiculos):"—"} c/u</small><small>Mantenimiento ${money(x.mantenimiento)}</small>${x.vencidos?`<span class="chip bad" style="margin-top:4px">${x.vencidos} vencido${x.vencidos>1?"s":""}</span>`:x.proximos?`<span class="chip warn" style="margin-top:4px">${x.proximos} próximo${x.proximos>1?"s":""}</span>`:'<span class="chip ok" style="margin-top:4px">Al día</span>'}</div>`).join("")}</div>`:""}
        <div class="grid2"><div class="card chart"><h3>📈 Gasto por mes <small class="muted">(últimos 12 meses)</small></h3><div id="gLinea"></div></div><div class="card chart"><h3>🧾 ¿En qué se gasta? <small class="muted">(${per})</small></h3><div id="gDona"></div></div></div>
        <div class="grid3"><div class="card chart"><h3>🏪 Por proveedor</h3><div id="gProv"></div></div><div class="card chart"><h3>🚚 Vehículos que más gastan</h3><div id="gVeh"></div></div><div class="card chart"><h3>🔧 Trabajos de mantenimiento</h3><div id="gTrab"></div></div></div>
        ${tablaPlan}<div style="margin-top:12px">${tablaRea}</div>${docs}${presCard}${repCard}`;
      const meses=[...new Set(j.meses.map(m=>m.mes))].sort(), serie=f=>meses.map(m=>j.meses.filter(x=>x.mes===m&&f(x.tipo)).reduce((a,x)=>a+x.total,0));
      chartLinea($("gLinea"),{etiquetas:meses,series:[{nombre:"Combustible",valores:serie(t=>t==="combustible")},{nombre:"Mantenimiento",valores:serie(t=>t==="mantenimiento")},{nombre:"Otros",valores:serie(t=>t!=="combustible"&&t!=="mantenimiento")}]});
      chartDona($("gDona"),G.categorias||[],T.total);
      chartBarras($("gProv"),G.proveedores||[],{color:pal(0),sub:x=>` · ${x.n} registro${x.n>1?"s":""}`});
      chartBarras($("gVeh"),G.top_vehiculos||[],{color:pal(2),sub:x=>x.km>0?` · ${fmtKm(x.km)} · ${money(x.total/x.km)}/km`:""});
      chartBarras($("gTrab"),G.trabajos||[],{color:pal(1),sub:x=>` · ${x.n} vez${x.n>1?"es":""}`});
    } else {
      $("dout").innerHTML=`<div class="pgrid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));margin-bottom:12px">${j.vehiculos.map(v=>{ const ps=j.planificados.filter(x=>x.vehiculo_id===v.id&&x.estado!=="ok"&&x.estado!=="sin_registro");
        return `<div class="card" style="padding:12px"><b style="font-size:1.2rem">${esc(v.placa)}</b> <span class="chip ${ps.some(x=>x.estado==="vencido")?"bad":ps.length?"warn":"ok"}">${ps.some(x=>x.estado==="vencido")?"Mantenimiento vencido":ps.length?"Mantenimiento próximo":"Al día"}</span>
          <div class="muted">${esc([v.marca,v.modelo].filter(Boolean).join(" "))}${SUCS.length>1?" · "+esc(v.sucursal):""}</div><div>${fmtKm(v.km_actual)}</div>${can("registrar")?`<button class="sec" data-rv="${v.id}" style="margin-top:8px">➕ Registrar</button>`:""}</div>`; }).join("")||'<p class="muted">No hay vehículos en tus parqueos.</p>'}</div>
        ${tablaPlan}<div style="margin-top:12px">${tablaRea}</div>${docs}${repCard}`;
    }
    const prep=$("prep"); if(prep) prep.onclick=()=>go("repuestos");
    $("dout").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{ const [vi,pi]=b.dataset.r.split(":").map(Number); PRESEL={vehiculo_id:vi,tipo:"mantenimiento",plan_id:pi}; go("registrar"); });
    $("dout").querySelectorAll("[data-rv]").forEach(b=>b.onclick=()=>{ PRESEL={vehiculo_id:+b.dataset.rv}; go("registrar"); });
    $("dout").querySelectorAll("[data-ps]").forEach(tr=>tr.onclick=()=>{ if($("dp")){ $("dp").value=$("dp").value==tr.dataset.ps?"":tr.dataset.ps; load(); } });
    const pwa=$("pwa"); if(pwa) pwa.onclick=()=>{ const Ls=[`*${EMP.nombre}* · Resumen de flota al ${fechaCorta(j.hoy)}`], ve=plan.filter(x=>x.estado==="vencido"), pr=plan.filter(x=>x.estado!=="vencido");
      const li=x=>`• ${x.placa}: ${x.plan}${x.faltaKm!=null?` (${x.faltaKm<=0?"pasado "+fmtKm(-x.faltaKm):"faltan "+fmtKm(x.faltaKm)})`:""}${x.estimada?` · ${fechaCorta(x.estimada)}`:""}`;
      if(ve.length) Ls.push("",`⛔ *Mantenimientos vencidos (${ve.length})*`,...ve.map(li));
      if(pr.length) Ls.push("",`🔧 *Próximos ${hor} días (${pr.length})*`,...pr.slice(0,15).map(li),...(pr.length>15?[`… y ${pr.length-15} más`]:[]));
      if(j.documentos.length) Ls.push("",`📄 *Documentos (${j.documentos.length})*`,...j.documentos.map(x=>`• ${x.placa}: ${x.doc} ${x.estado==="vencido"?`vencido hace ${-x.dias} días`:`vence en ${x.dias} días`} (${fechaCorta(x.fecha)})`));
      const sup=[...PR.parqueos,...PR.vehiculos].filter(x=>x.gastado>x.presupuesto); if(sup.length) Ls.push("",`💸 *Presupuesto superado (${sup.length})*`,...sup.map(x=>`• ${x.placa||x.nombre}: ${money(x.gastado)} de ${money(x.presupuesto)}`));
      if(j.repuestos_min?.length) Ls.push("",`📦 *Repuestos bajo mínimo (${j.repuestos_min.length})*`,...j.repuestos_min.map(r=>`• ${r.nombre}: ${fmtQ(r.stock)} ${r.unidad} (mínimo ${fmtQ(r.minimo)})`));
      if(admin) Ls.push("",`💰 *Gasto ${fechaCorta(j.desde)} – ${fechaCorta(j.hasta)}*: ${money(T.total)} (combustible ${money(T.comb)}, mantenimiento ${money(T.man)})`);
      if(Ls.length===1) Ls.push("","✅ Sin mantenimientos ni documentos pendientes.");
      const t=(EMP.whatsapp||"").replace(/\D/g,""); open(`https://wa.me/${t.length===8?"591"+t:t}?text=${encodeURIComponent(Ls.join("\n"))}`,"_blank","noopener"); }; };
  ["#dp","#dd","#dh","#dz"].forEach(s=>{ const e=$("main").querySelector(s); if(e) e.onchange=()=>{ if(s==="#dd"||s==="#dh") setRango("custom"); load().catch(x=>toast(x.message)); }; });
  $("main").querySelectorAll("[data-rg]").forEach(b=>b.onclick=()=>{ setRango(b.dataset.rg); if(b.dataset.rg!=="custom") load().catch(x=>toast(x.message)); });
  if($("preg")) $("preg").onclick=()=>go("registrar"); if($("pscan")) $("pscan").onclick=()=>escanearVeh(); PRESEL=null;
  await load(); }
function escanearVeh(){ scan({titulo:"Escanear QR del vehículo",onCode:c=>{ const m=String(c).match(/#v=([a-f0-9]+)/i)||[null,c]; const v=VEH.find(x=>x.codigo===m[1].toLowerCase());
  if(!v) return "⚠️ Ese QR no es de un vehículo de tu flota"; PRESEL={vehiculo_id:v.id}; setTimeout(()=>go("registrar"),300); return "✓ "+v.placa; }}); }

// ===================== Registrar =====================
async function viewRegistrar(){ await cargarVeh(); const act=VEH.filter(v=>v.estado!=="baja");
  const pre=PRESEL||{}; PRESEL=null; let tipo=pre.tipo||"combustible", vid=pre.vehiculo_id||(act.length===1?act[0].id:null), f1=null, f2=null, CB=null;
  await cargarProv(); await cargarCond();
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
    const tp=TIPO_PROV[tipo], prov=(l,ph)=>comboHTML("fp",l,provDe(tp).length,ph), det=`<div class="field"><label>Detalle</label><input id="fd"></div>`;
    const fac=`<div class="field"><label>N° de factura</label><input id="ffa" placeholder="Opcional"></div>`, cond=`<div class="field"><label>Conductor (quién manejaba)</label>${selCond("fco",v?.conductor_id||null)}</div>`;
    const mon=r=>`<div class="field"><label>Monto (${esc(EMP.moneda)})${r?" *":""}</label><input id="fm" inputmode="decimal"></div>`;
    const planes=v?v.planes:[];
    $("rform").innerHTML=({
      combustible:`<div class="row">${km}<div class="field"><label>Litros *</label><input id="fl" inputmode="decimal"></div>${mon(1)}</div>
        <label class="check"><input type="checkbox" id="fll" checked> Tanque lleno (necesario para calcular el rendimiento km/l)</label>
        <div class="row" style="margin-top:8px">${prov("Estación de servicio","Ej: YPFB Av. Banzer")}${fecha}</div><div class="row">${fac}${cond}</div>${fotoCampo("f1","Foto del surtidor o la factura"+(EMP.foto_obligatoria?" *":""))}${fotoCampo("f2","Foto del odómetro")}`,
      mantenimiento:`<div class="field"><label>Mantenimiento</label><select id="fpl"><option value="">Otro (correctivo o no programado)</option>${planes.map(p=>`<option value="${p.id}" ${pre.plan_id===p.id?"selected":""}>${esc(p.nombre)}${p.estado==="vencido"?" (vencido)":p.estado==="proximo"?" (próximo)":""}</option>`).join("")}</select></div>
        <div class="row">${km}${mon(0)}${fecha}</div><div class="row">${prov("Taller","Ej: Taller Mecánico Rojas")}${det}</div><div class="row">${fac}${cond}</div>${fotoCampo("f1","Foto de la factura o el trabajo"+(EMP.foto_obligatoria?" *":""))}`,
      lavado:`<div class="row">${mon(1)}${km}${fecha}</div><div class="row">${prov("Lavadero","")}<div class="field"><label>Tipo de lavado</label><select id="fd"><option>Lavado simple</option><option>Lavado completo</option><option>Lavado de motor</option><option>Aspirado</option></select></div></div><div class="row">${fac}${cond}</div>${fotoCampo("f1","Foto (opcional)")}`,
      gasto:`<div class="row"><div class="field"><label>Tipo de gasto</label><select id="fc"><option>Peaje</option><option>Repuesto</option><option>Llantas</option><option>Multa</option><option>Seguro / SOAT</option><option>Parqueo</option><option>Otro</option></select></div>${mon(1)}${fecha}</div>
        <div class="row">${km}${prov("Proveedor","")}</div><div class="row">${fac}${cond}</div>${det}${fotoCampo("f1","Foto del comprobante")}`,
      kilometraje:`<div class="row">${km}${fecha}${cond}</div>${det}${fotoCampo("f1","Foto del odómetro (opcional)")}`})[tipo];
    CB=$("fp")?combo($("rform"),"fp",provDe(tp),{etiq:ETIQ_PROV[tp][2],plural:ETIQ_PROV[tp][1],nuevo:puedeProv()?n=>nuevoProv(tp,n):null}):null;
    f1=f2=null; if($("f1")) enlazarFoto($("rform"),"f1",d=>f1=d); if($("f2")) enlazarFoto($("rform"),"f2",d=>f2=d); };
  $("rv").onchange=form; $("rtip").querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{ tipo=b.dataset.t; form(); });
  $("rsc").onclick=()=>scan({titulo:"Escanear QR del vehículo",onCode:c=>{ const m=String(c).match(/#v=([a-f0-9]+)/i)||[null,c]; const v=act.find(x=>x.codigo===String(m[1]).toLowerCase()); if(!v) return "⚠️ No es un vehículo de tu flota"; $("rv").value=v.id; form(); return "✓ "+v.placa; }});
  form();
  const guardar=async confirmar=>{ $("re").textContent=""; if(!$("rv").value) return $("re").textContent="Elige el vehículo";
    const g=id=>$(id)?$(id).value.replace(",","."):""; const pv=CB?CB.get():{proveedor:""}; if(pv.error) return $("re").textContent=pv.error;
    if(EMP.foto_obligatoria&&["combustible","mantenimiento"].includes(tipo)&&!f1) return $("re").textContent="Tu empresa exige la foto de la factura en este registro. Tómala o elige el archivo antes de guardar.";
    const body={tipo,vehiculo_id:+$("rv").value,km:g("fk"),litros:g("fl"),monto:g("fm"),lleno:$("fll")?$("fll").checked:true,proveedor:pv.proveedor,proveedor_id:pv.proveedor_id||null,factura:$("ffa")?.value||"",conductor_id:$("fco")?$("fco").value:undefined,detalle:$("fd")?.value||"",categoria:$("fc")?.value||"",plan_id:$("fpl")?.value||null,fecha:$("ff")?.value||"",foto1:f1,foto2:f2,confirmar_km:confirmar};
    $("rok").disabled=true;
    try{ const r=await api("eventos",{body}); beepScan();
      toast(r.rendimiento?`Guardado · Rendimiento ${fmtN(r.rendimiento)} km/l`:"Guardado"); if(r.alertas?.length) await avisar(r.alertas.join("\n"),"⚠️ Atención"); PRESEL={vehiculo_id:body.vehiculo_id,tipo}; go("registrar"); }
    catch(e){ $("rok").disabled=false;
      if(e.offline){ if(encolar(body)){ toast("Sin conexión: el registro quedó guardado en este equipo y se enviará solo cuando vuelva la señal"); PRESEL={vehiculo_id:body.vehiculo_id,tipo}; return go("registrar"); } return $("re").textContent="Sin conexión y sin espacio para guardar el registro en este equipo"; }
      if(/menor al último|más que el último/.test(e.message)&&await confirmar(e.message+"\n\n¿Guardar igual?",{ok:"Guardar igual"})) return guardar(true); $("re").textContent=e.message; } };
  $("rok").onclick=()=>guardar(false); }

// ===================== Vehículos =====================
async function viewVehiculos(){ await cargarVeh(); const P=USER.plan||{};
  $("main").innerHTML=`<h2>Vehículos</h2><div class="toolbar"><div class="grow"><label>Buscar</label><input id="vq" placeholder="Placa, marca o conductor"></div>
    ${SUCS.length>1?`<div><label>Parqueo</label><select id="vsf"><option value="">Todos</option>${SUCS.map(s=>`<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></div>`:""}
    <div><label>Estado</label><select id="vef"><option value="">Todos</option><option value="alerta">Con alertas</option><option value="ok">Al día</option><option value="taller">En taller</option></select></div>
    <label class="check" style="margin-bottom:8px"><input type="checkbox" id="vb"> Ver dados de baja</label>${can("vehiculos")?`<button id="vnew">+ Nuevo vehículo</button>`:""}</div>
    ${P.vehiculos!=null?`<p class="muted">Plan ${esc(P.nombre)}: ${VEH.filter(v=>v.estado!=="baja").length} de ${P.vehiculos} vehículos.</p>`:""}<div class="pgrid" id="vgrid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))"></div>`;
  const draw=()=>{ const q=$("vq").value.toLowerCase(), b=$("vb").checked, sp=+($("vsf")?.value||0), ef=$("vef").value;
    $("vgrid").innerHTML=VEH.filter(v=>(b||v.estado!=="baja")&&(!sp||v.sucursal_id===sp)&&(!ef||(ef==="alerta"?v.alertas.length>0:ef==="ok"?!v.alertas.length&&v.estado==="activo":v.estado===ef))&&(!q||(v.placa+" "+v.marca+" "+v.modelo+" "+(v.conductor||"")).toLowerCase().includes(q))).map(v=>{ const n=nivelVeh(v);
      return `<div class="card click" data-v="${v.id}" style="cursor:pointer;padding:12px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:1.25rem;letter-spacing:1px">${esc(v.placa)}</b>
        <span class="chip ${v.estado==="baja"?"":v.estado==="taller"?"warn":n}">${v.estado==="baja"?"Baja":v.estado==="taller"?"En taller":n==="ok"?"Al día":v.alertas.length+" alerta"+(v.alertas.length>1?"s":"")}</span></div>
        <div class="muted">${esc([v.marca,v.modelo,v.anio].filter(Boolean).join(" "))}${SUCS.length>1?` · ${esc(v.sucursal)}`:""}</div><div>${fmtKm(v.km_actual)}${v.rendimiento_ult?` · ${fmtN(v.rendimiento_ult)} km/l`:""}${v.costo_km_30d?` · ${money(v.costo_km_30d)}/km`:""}</div>
        <small class="muted">${v.conductor?"👤 "+esc(v.conductor):"Sin conductor asignado"}</small></div>`; }).join("")||'<p class="muted">Sin vehículos.</p>';
    $("vgrid").querySelectorAll("[data-v]").forEach(x=>x.onclick=()=>vehiculoDetalle(+x.dataset.v)); };
  $("vq").oninput=draw; $("vb").onchange=draw; $("vef").onchange=draw; if($("vsf")) $("vsf").onchange=draw; draw(); if($("vnew")) $("vnew").onclick=()=>vehiculoForm(null); }
function vehiculoDetalle(id){ const v=VEH.find(x=>x.id===id); if(!v) return;
  const doc=(n,f,d)=>`<tr><td>${n}</td><td>${fechaCorta(f)}</td><td>${d?`<span class="chip ${d.estado==="ok"?"ok":d.estado==="proximo"?"warn":"bad"}">${d.estado==="vencido"?"Vencido":d.estado==="proximo"?`${d.dias} días`:"Vigente"}</span>`:'<span class="muted">Sin fecha</span>'}</td></tr>`;
  dialog(`<div style="display:flex;gap:12px;align-items:center">${v.foto?`<img data-k="${esc(v.foto)}" alt="" style="width:90px;height:68px;object-fit:cover;border-radius:8px">`:""}<div><h3 style="margin:0">${esc(v.placa)}</h3>
    <div class="muted">${esc([v.marca,v.modelo,v.anio,v.tipo].filter(Boolean).join(" · "))} · ${esc(v.combustible)}</div><div>${fmtKm(v.km_actual)}${v.conductor?` · 👤 ${esc(v.conductor)}`:""}</div><small class="muted">Últimos 30 días: ${money(v.gasto_30d)} · ${fmtKm(v.km_30d)}${v.costo_km_30d?` · ${money(v.costo_km_30d)} por km`:""}${v.precio_litro_ult?` · última carga ${money(v.precio_litro_ult)}/L`:""}${v.presupuesto_mes?` · presupuesto ${money(v.presupuesto_mes)}/mes`:""}</small></div></div>
    ${v.alertas.length?`<div style="margin-top:10px">${v.alertas.map(a=>`<div><span class="chip ${a.nivel}">${a.nivel==="bad"?"Vencido":"Atención"}</span> ${esc(a.texto)}</div>`).join("")}</div>`:""}
    <h3 style="margin-top:14px">Mantenimiento preventivo</h3><div class="tbl"><table><thead><tr><th>Plan</th><th>Cada</th><th>Último</th><th>Próximo</th><th></th></tr></thead><tbody>
    ${v.planes.map(p=>`<tr><td>${esc(p.nombre)}</td><td><small>${p.cada_km?fmtKm(p.cada_km):""}${p.cada_km&&p.cada_dias?" o ":""}${p.cada_dias?p.cada_dias+" días":""}</small></td><td><small>${p.ultima_fecha?fechaCorta(p.ultima_fecha):"—"}${p.ultimo_km?"<br>"+fmtKm(p.ultimo_km):""}</small></td>
      <td><span class="chip ${p.estado==="vencido"?"bad":p.estado==="proximo"?"warn":"ok"}">${p.proxKm!=null?fmtKm(p.proxKm):""}${p.proxKm!=null&&p.proxFecha?" / ":""}${p.proxFecha?fechaCorta(p.proxFecha):""}</span></td>
      <td>${can("mantenimiento")?`<button class="link" data-pe="${p.id}">Editar</button>`:""}</td></tr>`).join("")||'<tr><td colspan="5" class="muted">Sin planes.</td></tr>'}</tbody></table></div>
    ${can("mantenimiento")?`<button class="sec" id="dpn" style="margin-top:6px">+ Agregar plan</button>`:""}
    <h3 style="margin-top:14px">Documentos</h3><div class="tbl"><table>${doc(esc(DOC1()),v.soat_vence,v.docs.soat)}${doc(esc(DOC2()),v.itv_vence,v.docs.itv)}${doc("Seguro",v.seguro_vence,v.docs.seguro)}${v.conductor?doc("Licencia de "+esc(v.conductor),v.licencia_vence,v.docs.licencia):""}</table></div>
    <h3 style="margin-top:14px">Llantas y batería</h3><div id="dact"><p class="muted">Cargando…</p></div>
    <div class="acts">${can("vehiculos")?`<button class="sec" id="ded">Editar vehículo</button>`:""}<button class="sec" id="dqr">🏷️ Imprimir QR</button><button class="sec" id="dhi">Historial</button>${can("registrar")?`<button id="dre">➕ Registrar</button>`:""}<button class="sec" id="dx">Cerrar</button></div>`, B=>{
    pintarFotos(B); B.querySelector("#dx").onclick=closeDlg; B.querySelector("#dqr").onclick=()=>etiquetaQR(v); pintarActivos(B,v);
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
      <div class="field"><label>Kilometraje actual${v?" (corregir si está mal)":""}</label><input id="vkm" inputmode="numeric" value="${v?Math.round(v.km_actual):""}"></div></div>
    <div class="row"><div class="field"><label>Conductor asignado</label><select id="vco"><option value="">Sin conductor</option>${COND.filter(c=>c.activo).map(c=>`<option value="${c.id}" ${c.id===v?.conductor_id?"selected":""}>${esc(c.nombre)}</option>`).join("")}</select></div>
      <div class="field"><label>Estado</label><select id="ves">${[["activo","Activo"],["taller","En taller"],["baja","Dado de baja"]].map(([k,t])=>`<option value="${k}" ${k===(v?.estado||"activo")?"selected":""}>${t}</option>`).join("")}</select></div></div>
    <div class="row"><div class="field"><label>${esc(DOC1())} vence</label><input type="date" id="vso" value="${v?.soat_vence||""}"></div><div class="field"><label>${esc(DOC2())} vence</label><input type="date" id="vit" value="${v?.itv_vence||""}"></div><div class="field"><label>Seguro vence</label><input type="date" id="vse" value="${v?.seguro_vence||""}"></div></div>
    <div class="row"><div class="field"><label>Presupuesto mensual (${esc(EMP.moneda)}, vacío = sin límite)</label><input id="vpr" inputmode="decimal" value="${v?.presupuesto_mes||""}" placeholder="Ej: 3500"></div></div>
    ${fotoCampo("vf","Foto del vehículo")}<div class="field"><label>Notas</label><textarea id="vn">${esc(v?.notas||"")}</textarea></div>
    ${v?"":'<p class="muted">Se crean planes de mantenimiento de ejemplo (aceite, filtro de aire, llantas, frenos) desde el kilometraje actual. Ajústalos después.</p>'}
    <div class="err" id="ve"></div><div class="acts"><button class="sec" id="vx">Cancelar</button><button id="vok">Guardar</button></div>`, B=>{
    enlazarFoto(B,"vf",d=>foto=d); B.querySelector("#vx").onclick=closeDlg;
    B.querySelector("#vok").onclick=async()=>{ try{ await api("vehiculos",{body:{id:v?.id,placa:val(B,"#vp"),sucursal_id:+(val(B,"#vs")||v?.sucursal_id||SUC),marca:val(B,"#vma"),modelo:val(B,"#vmo"),anio:val(B,"#van"),tipo:val(B,"#vt"),combustible:val(B,"#vc"),
        tanque_l:val(B,"#vta").replace(",","."),rendimiento_esp:val(B,"#vre").replace(",","."),km_actual:val(B,"#vkm"),conductor_id:val(B,"#vco"),estado:val(B,"#ves"),soat_vence:val(B,"#vso"),itv_vence:val(B,"#vit"),seguro_vence:val(B,"#vse"),notas:val(B,"#vn"),presupuesto_mes:val(B,"#vpr").replace(",","."),foto}});
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
async function viewMantenimiento(){ await cargarVeh(); const ord={vencido:0,proximo:1,sin_registro:2,ok:3}; const pre=PRESEL||{}; PRESEL=null;
  const todas=VEH.filter(v=>v.estado!=="baja").flatMap(v=>v.planes.map(p=>({v,p}))).sort((a,b)=>ord[a.p.estado]-ord[b.p.estado]||(a.p.faltaKm??1e9)-(b.p.faltaKm??1e9));
  $("main").innerHTML=`<h2>Mantenimiento preventivo</h2><p class="muted">Todos los planes de la flota, primero los vencidos. Los planes se configuran en cada vehículo.</p>
    <div class="toolbar">${SUCS.length>1?`<div><label>Parqueo</label><select id="mp"><option value="">Todos</option>${SUCS.map(s=>`<option value="${s.id}" ${s.id===pre.sucursal_id?"selected":""}>${esc(s.nombre)}</option>`).join("")}</select></div>`:""}
      <div><label>Estado</label><select id="me"><option value="">Todos</option><option value="vencido">Vencidos</option><option value="proximo">Próximos</option><option value="pend">Vencidos y próximos</option><option value="ok">Al día</option></select></div>
      <div><label>Plan</label><select id="mpl"><option value="">Todos</option>${[...new Set(todas.map(x=>x.p.nombre))].sort().map(n=>`<option>${esc(n)}</option>`).join("")}</select></div>
      <div class="grow"><label>Buscar</label><input id="mq" placeholder="Placa, marca o conductor"></div></div>
    <div id="mres" class="muted" style="margin:-4px 0 8px"></div><div class="card tbl"><table><thead><tr><th>Vehículo</th>${SUCS.length>1?"<th>Parqueo</th>":""}<th>Plan</th><th>Km actual</th><th>Próximo</th><th>Estado</th><th></th></tr></thead><tbody id="mrows"></tbody></table></div>`;
  const pintar=()=>{ const sp=+($("mp")?.value||0), es=$("me").value, pl=$("mpl").value, q=$("mq").value.toLowerCase();
    const filas=todas.filter(({v,p})=>(!sp||v.sucursal_id===sp)&&(!es||(es==="pend"?(p.estado==="vencido"||p.estado==="proximo"):p.estado===es))&&(!pl||p.nombre===pl)&&(!q||(v.placa+" "+v.marca+" "+v.modelo+" "+(v.conductor||"")).toLowerCase().includes(q)));
    const nv=filas.filter(x=>x.p.estado==="vencido").length, np=filas.filter(x=>x.p.estado==="proximo").length;
    $("mres").innerHTML=`${filas.length} plan${filas.length===1?"":"es"} de ${new Set(filas.map(x=>x.v.id)).size} vehículo${new Set(filas.map(x=>x.v.id)).size===1?"":"s"}${nv?` · <span class="chip bad">${nv} vencido${nv>1?"s":""}</span>`:""}${np?` · <span class="chip warn">${np} próximo${np>1?"s":""}</span>`:""}`;
    $("mrows").innerHTML=filas.map(({v,p})=>`<tr><td><b>${esc(v.placa)}</b><br><small class="muted">${esc([v.marca,v.modelo].filter(Boolean).join(" "))}</small></td>${SUCS.length>1?`<td>${esc(v.sucursal)}</td>`:""}<td>${esc(p.nombre)}</td><td>${fmtKm(v.km_actual)}</td><td><small>${p.proxKm!=null?fmtKm(p.proxKm):""}${p.proxKm!=null&&p.proxFecha?"<br>":""}${p.proxFecha?fechaCorta(p.proxFecha):""}</small></td>
      <td><span class="chip ${p.estado==="vencido"?"bad":p.estado==="proximo"?"warn":"ok"}">${p.estado==="vencido"?"Vencido":p.estado==="proximo"?"Próximo":"Al día"}</span><br><small class="muted">${p.faltaKm!=null?(p.faltaKm<=0?`pasado ${fmtKm(-p.faltaKm)}`:`faltan ${fmtKm(p.faltaKm)}`):""}${p.faltaDias!=null?` · ${p.faltaDias<=0?`hace ${-p.faltaDias} d`:`${p.faltaDias} d`}`:""}</small></td>
      <td>${can("mantenimiento")?`<button class="sec" data-r="${v.id}:${p.id}">Registrar</button>`:""}</td></tr>`).join("")||`<tr><td colspan="7" class="muted">Ningún plan coincide con el filtro.</td></tr>`;
    $("mrows").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{ const [vi,pi]=b.dataset.r.split(":").map(Number); PRESEL={vehiculo_id:vi,tipo:"mantenimiento",plan_id:pi}; go("registrar"); }); };
  ["#mp","#me","#mpl"].forEach(s=>{ const e=$("main").querySelector(s); if(e) e.onchange=pintar; }); $("mq").oninput=pintar; pintar(); }

// ===================== Historial =====================
async function viewHistorial(){ await cargarVeh(); await cargarProv(); await cargarCond(); const pre=PRESEL||{}; PRESEL=null; const rep=can("reportes");
  $("main").innerHTML=`<h2>Historial</h2>${rep?"":'<p class="muted">Ves los registros que hiciste tú. Puedes corregirlos hasta 24 horas después.</p>'}<div class="toolbar">${SUCS.length>1?`<div><label>Parqueo</label><select id="hs"><option value="">Todos</option>${SUCS.map(s=>`<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></div>`:""}<div><label>Vehículo</label><select id="hv"><option value="">Todos</option>${VEH.map(v=>`<option value="${v.id}" ${v.id===pre.vehiculo_id?"selected":""}>${esc(v.placa)}</option>`).join("")}</select></div>
    <div><label>Tipo</label><select id="ht"><option value="">Todos</option>${Object.entries(TIPOS_EV).map(([k,[i,t]])=>`<option value="${k}">${i} ${t}</option>`).join("")}</select></div>
    <div><label>Desde</label><input type="date" id="hd" value="${daysAgo(30)}"></div><div><label>Hasta</label><input type="date" id="hh" value="${today()}"></div><button class="sec" id="hgo">Ver</button><button class="sec" id="hcsv">⬇️ CSV</button></div>
    <div class="card tbl"><table><thead><tr><th>Fecha</th><th>Vehículo</th><th>Tipo</th><th>Detalle</th><th class="n">Km</th><th class="n">Monto</th></tr></thead><tbody id="hrows"></tbody></table><div id="hmas" style="text-align:center;margin-top:10px"></div></div>`;
  let EV=[], pag=0;
  const filtro=()=>`sucursal_id=${$("hs")?.value||""}&vehiculo_id=${$("hv").value}&tipo=${$("ht").value}&desde=${$("hd").value}&hasta=${$("hh").value}`;
  const fila=e=>`<tr class="click" data-id="${e.id}" style="${e.anulado?"opacity:.5;text-decoration:line-through":""}"><td>${fechaHora(e.fecha)}</td><td><b>${esc(e.placa)}</b></td><td>${TIPOS_EV[e.tipo][0]} ${TIPOS_EV[e.tipo][1]}</td>
      <td><small>${e.tipo==="combustible"?`${fmtN(e.litros)} L${e.monto&&e.litros?` · ${fmtN(e.monto/e.litros)}/L`:""}${e.rendimiento?` · <b>${fmtN(e.rendimiento)} km/l</b>`:""}`:esc(e.plan||e.categoria||e.detalle||"")}${e.proveedor?` · ${esc(e.proveedor)}`:""}</small>${e.alerta?`<br><span class="chip warn">${esc(e.alerta)}</span>`:""}</td>
      <td class="n">${e.km!=null?fmtQ(Math.round(e.km)):""}</td><td class="n">${e.monto?money(e.monto):""}</td></tr>`;
  const load=async masPag=>{ if(!masPag){ pag=0; EV=[]; } const j=await api(`eventos?${filtro()}&pagina=${pag}`); EV=EV.concat(j.eventos);
    $("hrows").innerHTML=EV.map(fila).join("")||'<tr><td colspan="6" class="muted">Sin registros.</td></tr>';
    $("hmas").innerHTML=j.mas?`<button class="sec" id="hmasb">Cargar más</button>`:(EV.length>200?`<small class="muted">${EV.length} registros</small>`:"");
    const mb=$("hmasb"); if(mb) mb.onclick=()=>{ pag++; load(true).catch(e=>toast(e.message)); };
    $("hrows").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>detalleEvento(EV.find(x=>x.id==tr.dataset.id))); };
  const detalleEvento=e=>{ const propio=e.usuario_id===USER.id&&Date.now()-new Date(String(e.creado).replace(" ","T")+"Z")<24*3600e3, puedeEditar=!e.anulado&&(rep||propio);
    dialog(`<h3>${TIPOS_EV[e.tipo][0]} ${TIPOS_EV[e.tipo][1]} · ${esc(e.placa)}</h3><p class="muted">${fechaHora(e.fecha)} · ${esc(e.usuario||"")}${e.conductor?` · Conductor: ${esc(e.conductor)}`:""}</p>
      <div class="tbl"><table>${[["Kilometraje",e.km!=null?fmtKm(e.km):""],["Litros",e.litros?fmtN(e.litros):""],["Precio por litro",e.litros&&e.monto?money(e.monto/e.litros):""],["Rendimiento",e.rendimiento?fmtN(e.rendimiento)+" km/l":""],["Monto",e.monto?money(e.monto):""],["Plan",e.plan||""],["Tipo de gasto",e.categoria||""],["Proveedor",e.proveedor||""],["N° factura",e.factura||""],["Conductor",e.conductor||""],["Detalle",e.detalle||""],["Alerta",e.alerta||""]].filter(x=>x[1]).map(([a,b])=>`<tr><td>${a}</td><td>${esc(b)}</td></tr>`).join("")}</table></div>
      <div class="row" style="margin-top:10px">${[e.foto1,e.foto2].filter(Boolean).map(k=>`<img data-k="${esc(k)}" alt="Foto" style="max-width:100%;border-radius:8px">`).join("")}</div>
      <div class="acts">${rep&&!e.anulado?`<button class="danger" id="han" style="margin-right:auto">Anular</button>`:""}${puedeEditar?`<button class="sec" id="hed">✏️ Corregir</button>`:""}<button id="hx">Cerrar</button></div>`, B=>{ pintarFotos(B); B.querySelector("#hx").onclick=closeDlg;
      const ed=B.querySelector("#hed"); if(ed) ed.onclick=()=>editarEvento(e);
      const an=B.querySelector("#han"); if(an) an.onclick=async()=>{ const m=await pregunta({titulo:"Anular registro",texto:"El registro queda tachado y se recalculan el kilometraje y el rendimiento del vehículo.",input:"Motivo de la anulación",ok:"Anular",peligro:true});
        if(m===null) return; if(!m) return toast("Escribe el motivo para anular"); try{ await api("eventos",{body:{id:e.id,anular:true,motivo:m}}); closeDlg(); toast("Registro anulado"); load(); }catch(x){ toast(x.message); } }; }); };
  const editarEvento=e=>{ const t=e.tipo, f=(id,l,v,extra="")=>`<div class="field"><label>${l}</label><input id="${id}" value="${esc(v??"")}" ${extra}></div>`;
    dialog(`<h3>✏️ Corregir ${TIPOS_EV[t][1].toLowerCase()} · ${esc(e.placa)}</h3><div class="row">${f("ek","Kilometraje"+(["combustible","kilometraje"].includes(t)?" *":""),e.km!=null?Math.round(e.km):"",'inputmode="numeric"')}
      ${t==="combustible"?f("el","Litros *",e.litros,'inputmode="decimal"'):""}${t!=="kilometraje"?f("em",`Monto (${esc(EMP.moneda)})`,e.monto||"",'inputmode="decimal"'):""}</div>
      ${t==="combustible"?`<label class="check"><input type="checkbox" id="ell" ${e.lleno?"checked":""}> Tanque lleno</label>`:""}
      <div class="row">${f("ef","Fecha",String(e.fecha).slice(0,10),`type="date" max="${today()}"`)}${t==="gasto"?f("ec","Tipo de gasto",e.categoria):t==="kilometraje"?"":comboHTML("ep",ETIQ_PROV[TIPO_PROV[t]][0],provDe(TIPO_PROV[t]).length)}</div>
      ${t==="gasto"?comboHTML("ep","Proveedor",provDe("proveedor").length):""}${f("ed","Detalle",e.detalle)}
      <div class="row">${t!=="kilometraje"?f("efa","N° de factura",e.factura||""):""}<div class="field"><label>Conductor (quién manejaba)</label>${selCond("eco",e.conductor_id||null)}</div></div>
      <p class="muted">Al guardar se recalculan el kilometraje actual del vehículo, el rendimiento de las cargas y la fecha del último mantenimiento.</p>
      <div class="err" id="ee"></div><div class="acts"><button class="sec" id="ex">Cancelar</button><button id="eok">Guardar</button></div>`, B=>{
      B.querySelector("#ex").onclick=()=>detalleEvento(e);
      const tp=TIPO_PROV[t], CB=B.querySelector("#ep")?combo(B,"ep",provDe(tp),{valor:e.proveedor||"",etiq:ETIQ_PROV[tp][2],plural:ETIQ_PROV[tp][1],nuevo:puedeProv()?n=>nuevoProv(tp,n):null}):null;
      B.querySelector("#eok").onclick=async()=>{ const pv=CB?CB.get():{proveedor:""}; if(pv.error) return B.querySelector("#ee").textContent=pv.error;
        try{ await api("eventos",{body:{id:e.id,editar:true,km:val(B,"#ek").replace(",","."),litros:val(B,"#el").replace(",","."),monto:val(B,"#em").replace(",","."),lleno:B.querySelector("#ell")?B.querySelector("#ell").checked:true,fecha:val(B,"#ef"),proveedor:pv.proveedor,proveedor_id:pv.proveedor_id||null,categoria:val(B,"#ec"),detalle:val(B,"#ed"),factura:val(B,"#efa"),conductor_id:val(B,"#eco")}});
        closeDlg(); toast("Registro corregido"); load(); }catch(x){ B.querySelector("#ee").textContent=x.message; } }; }); };
  $("hgo").onclick=()=>load().catch(e=>toast(e.message)); ["#hs","#hv","#ht"].forEach(s=>{ const e=$("main").querySelector(s); if(e) e.onchange=$("hgo").onclick; });
  $("hcsv").onclick=async()=>{ try{ const j=await api(`eventos?${filtro()}&csv=1`); const h=["Fecha","Placa","Tipo","Km","Litros","Precio/L","km/l","Monto","Plan","Categoría","Proveedor","Detalle","Conductor","Registró","Alerta","Anulado"];
      const c=s=>'"'+String(s??"").replace(/"/g,'""')+'"'; const csv=[h.join(";"),...j.eventos.map(e=>[fechaHora(e.fecha),e.placa,TIPOS_EV[e.tipo][1],e.km!=null?Math.round(e.km):"",e.litros||"",e.litros&&e.monto?(e.monto/e.litros).toFixed(2):"",e.rendimiento||"",e.monto||"",e.plan||"",e.categoria||"",e.proveedor||"",e.detalle||"",e.conductor||"",e.usuario||"",e.alerta||"",e.anulado?"Sí":""].map(c).join(";"))].join("\n");
      descargar(csv,`historial_${$("hd").value}_${$("hh").value}.csv`); if(j.mas) toast("Se descargaron los primeros 5000 registros. Acorta el rango de fechas para ver el resto."); }catch(e){ toast(e.message); } };
  await load(); }

// ===================== Reportes =====================
async function viewReportes(){
  $("main").innerHTML=`<h2>Reportes de costos</h2><div class="toolbar"><div><label>Desde</label><input type="date" id="rd" value="${daysAgo(29)}"></div><div><label>Hasta</label><input type="date" id="rh" value="${today()}"></div>
    ${SUCS.length>1?`<div><label>Parqueo</label><select id="rs"><option value="">Todos</option>${SUCS.map(s=>`<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></div>`:""}<button class="sec" id="rgo">Ver</button><button class="sec" id="rcsv">Descargar CSV</button><button class="sec" id="rcont" title="Todos los registros del período con proveedor, N° de factura y monto, listos para contabilidad">📒 Exportar contable</button></div><div id="rout"></div>`;
  let J=null;
  const load=async()=>{ const rs=$("rs")?.value||""; J=await api(`reportes?desde=${$("rd").value}&hasta=${$("rh").value}${rs?"&sucursal_id="+rs:""}`);
    const T=J.vehiculos.reduce((a,v)=>({total:a.total+v.total,comb:a.comb+v.combustible,km:a.km+(v.km||0),l:a.l+v.litros}),{total:0,comb:0,km:0,l:0});
    $("rout").innerHTML=`<div class="kpis"><div class="card kpi"><div class="v num">${money(T.total)}</div><div class="l">Gasto total</div></div><div class="card kpi"><div class="v num">${money(T.comb)}</div><div class="l">Combustible (${fmtN(T.l,0)} L)</div></div>
      <div class="card kpi"><div class="v">${fmtKm(T.km)}</div><div class="l">Recorrido registrado</div></div><div class="card kpi"><div class="v num">${T.km?money(T.total/T.km):"—"}</div><div class="l">Costo por km</div></div></div>
      <div class="card tbl"><h3>Por vehículo</h3><table><thead><tr><th>Vehículo</th><th class="n">Km</th><th class="n">Litros</th><th class="n">km/l</th><th class="n">Combustible</th><th class="n">Mantenim.</th><th class="n">Lavados</th><th class="n">Otros</th><th class="n">Total</th><th class="n">Bs/km</th></tr></thead><tbody>
      ${J.vehiculos.map(v=>`<tr><td><b>${esc(v.placa)}</b>${v.alertas?` <span class="chip warn">${v.alertas} alertas</span>`:""}</td><td class="n">${fmtQ(Math.round(v.km||0))}</td><td class="n">${fmtN(v.litros,0)}</td>
        <td class="n">${v.rendimiento?`<span class="${v.rendimiento_esp&&v.rendimiento<v.rendimiento_esp*.85?"err":""}">${fmtN(v.rendimiento)}</span>`:"—"}</td><td class="n">${money(v.combustible)}</td><td class="n">${money(v.mantenimiento)}</td><td class="n">${money(v.lavado)}</td><td class="n">${money(v.gastos)}</td>
        <td class="n"><b>${money(v.total)}</b></td><td class="n">${v.km?fmtN(v.total/v.km):"—"}</td></tr>`).join("")||'<tr><td colspan="10" class="muted">Sin datos en este período.</td></tr>'}</tbody></table></div>
      ${J.conductores?.length?`<div class="card tbl" style="margin-top:12px"><h3>Por conductor <small class="muted">(quién manejaba en cada registro)</small></h3><table><thead><tr><th>Conductor</th><th class="n">Registros</th><th class="n">Vehículos</th><th class="n">Litros</th><th class="n">km/l</th><th class="n">Combustible</th><th class="n">Multas</th><th class="n">Total</th><th>Consumo</th></tr></thead><tbody>
      ${J.conductores.map(c=>`<tr><td><b>${esc(c.nombre)}</b></td><td class="n">${c.registros}</td><td class="n">${c.vehiculos}</td><td class="n">${fmtN(c.litros,0)}</td><td class="n">${c.rendimiento?fmtN(c.rendimiento):"—"}</td><td class="n">${money(c.combustible)}</td><td class="n">${money(c.multas)}</td><td class="n"><b>${money(c.total)}</b></td><td>${c.consumo_alto?`<span class="chip warn">${c.consumo_alto} ${c.consumo_alto>1?"cargas":"carga"} con consumo alto</span>`:'<span class="chip ok">Normal</span>'}</td></tr>`).join("")}</tbody></table></div>`:""}
      <div class="row" style="align-items:flex-start;margin-top:12px"><div class="card tbl"><h3>Por tipo</h3><table>${J.tipos.map(t=>`<tr><td>${TIPOS_EV[t.tipo][0]} ${TIPOS_EV[t.tipo][1]}</td><td class="n">${t.cantidad}</td><td class="n">${money(t.total)}</td></tr>`).join("")||'<tr><td class="muted">Sin datos</td></tr>'}</table></div>
      <div class="card tbl"><h3>Por mes</h3><table>${J.meses.map(m=>`<tr><td>${esc(m.mes)}</td><td class="n">${money(m.total)}</td><td class="n muted">comb. ${money(m.combustible)}</td></tr>`).join("")||'<tr><td class="muted">Sin datos</td></tr>'}</table></div></div>`; };
  $("rgo").onclick=()=>load().catch(e=>toast(e.message));
  $("rcsv").onclick=()=>{ if(!J) return; const h=["Placa","Km","Litros","km/l","Combustible","Mantenimiento","Lavados","Otros","Total"];
    const csv=[h.join(";"),...J.vehiculos.map(v=>[v.placa,Math.round(v.km||0),v.litros,v.rendimiento?.toFixed(2)||"",v.combustible,v.mantenimiento,v.lavado,v.gastos,v.total].join(";"))].join("\n");
    descargar(csv,`flota_${$("rd").value}_${$("rh").value}.csv`); };
  $("rcont").onclick=async()=>{ try{ const j=await api(`eventos?csv=1&desde=${$("rd").value}&hasta=${$("rh").value}`); const c=x=>`"${String(x??"").replace(/"/g,'""')}"`;
    const csv=[["Fecha","Tipo","Placa","Parqueo","Proveedor","N° factura","Categoría / plan","Detalle","Km","Litros",`Monto (${EMP.moneda})`,"Conductor","Registró"].map(c).join(";"),
      ...j.eventos.filter(e=>!e.anulado).map(e=>[fechaHora(e.fecha).split(",")[0],TIPOS_EV[e.tipo][1],e.placa,e.sucursal,e.proveedor,e.factura,e.plan||e.categoria,e.detalle,e.km!=null?Math.round(e.km):"",e.litros||"",e.monto||0,e.conductor,e.usuario].map(c).join(";"))].join("\n");
    descargar(csv,`contable_${$("rd").value}_${$("rh").value}.csv`); if(j.mas) toast("El período tiene más de 5000 registros: acórtalo para exportar todo"); }catch(e){ toast(e.message); } };
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

// ===================== Proveedores =====================
async function viewProveedores(){ await cargarProv(); let tp=PRESEL?.tipo_prov||"taller"; PRESEL=null;
  $("main").innerHTML=`<h2>Proveedores</h2><p class="muted">Talleres, estaciones de servicio y lavaderos de la empresa. Mientras un tipo tenga proveedores, al registrar solo se puede elegir de esta lista.</p>
    <div class="toolbar"><div class="toolbar" id="ptip" style="margin:0">${Object.keys(ETIQ_PROV).map(t=>`<button data-t="${t}">${ETIQ_PROV[t][1]}</button>`).join("")}</div><span style="flex:1"></span>
      <button class="sec" id="pimp" title="Crea un proveedor por cada nombre que ya aparece en el historial">⤓ Importar del historial</button><button id="pnew">+ Nuevo</button></div><div id="plist"></div>`;
  const pintar=()=>{ $("ptip").querySelectorAll("[data-t]").forEach(b=>b.className=b.dataset.t===tp?"":"sec"); const l=PROV.filter(p=>p.tipo===tp);
    $("plist").innerHTML=`<div class="card tbl"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Nota</th><th class="n">Registros</th></tr></thead><tbody>${l.map(p=>`<tr class="click" data-id="${p.id}" style="${p.activo?"":"opacity:.5"}"><td><b>${esc(p.nombre)}</b>${p.activo?"":' <span class="chip">inactivo</span>'}</td><td>${esc(p.telefono)}</td><td><small>${esc(p.nota)}</small></td><td class="n">${p.usos||0}</td></tr>`).join("")
      ||`<tr><td colspan="4" class="muted">Aún no hay ${ETIQ_PROV[tp][1].toLowerCase()}. Mientras esta lista esté vacía, en Registrar se escribe el nombre a mano.</td></tr>`}</tbody></table></div>`;
    $("plist").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>form(PROV.find(p=>p.id==tr.dataset.id))); };
  const form=p=>dialog(`<h3>${p?"Editar":"Nuevo"} proveedor</h3><div class="row"><div class="field"><label>Tipo</label><select id="pt">${Object.keys(ETIQ_PROV).map(t=>`<option value="${t}" ${(p?p.tipo:tp)===t?"selected":""}>${ETIQ_PROV[t][0]}</option>`).join("")}</select></div><div class="field"><label>Nombre *</label><input id="pn" value="${esc(p?.nombre||"")}"></div></div>
    <div class="row"><div class="field"><label>Teléfono</label><input id="pf" value="${esc(p?.telefono||"")}"></div><div class="field"><label>Nota</label><input id="po" value="${esc(p?.nota||"")}" placeholder="Dirección, contacto, horario…"></div></div>
    ${p?`<label class="check"><input type="checkbox" id="pa" ${p.activo?"checked":""}> Activo (si lo desactivas ya no aparece al registrar)</label>`:""}<div class="err" id="pe"></div><div class="acts"><button class="sec" id="px">Cancelar</button><button id="pok">Guardar</button></div>`, B=>{
    B.querySelector("#px").onclick=closeDlg;
    B.querySelector("#pok").onclick=async()=>{ try{ await api("proveedores",{body:{id:p?.id,tipo:val(B,"#pt"),nombre:val(B,"#pn"),telefono:val(B,"#pf"),nota:val(B,"#po"),activo:p?B.querySelector("#pa").checked:true}}); closeDlg(); toast("Guardado"); tp=val(B,"#pt"); await cargarProv(); pintar(); }
      catch(e){ B.querySelector("#pe").textContent=e.message; } }; });
  $("ptip").querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{ tp=b.dataset.t; pintar(); });
  $("pnew").onclick=()=>form(null);
  $("pimp").onclick=async()=>{ if(!await confirmar("Se creará un proveedor por cada taller, estación o lavadero que ya aparece en los registros y todavía no está en la lista. ¿Continuar?",{ok:"Importar"})) return;
    try{ const r=await api("proveedores",{body:{importar:true}}); toast(r.importados?`Se agregaron ${r.importados} a la lista`:"No había nombres nuevos que importar"); await cargarProv(); pintar(); }catch(e){ toast(e.message); } };
  pintar(); }

// ===================== Llantas y batería =====================
async function pintarActivos(B,v){ const box=B.querySelector("#dact"); if(!box) return; let A=[]; try{ A=(await api("activos?vehiculo_id="+v.id)).activos; }catch(e){ box.innerHTML=`<p class="muted">${esc(e.message)}</p>`; return; }
  const act=A.filter(a=>a.estado!=="retirado"), ret=A.filter(a=>a.estado==="retirado"), adm=puedeProv();
  const fila=a=>{ const col=a.estado_vida==="vencido"?"var(--bad)":a.estado_vida==="proximo"?"var(--warn)":"var(--accent)";
    return `<div style="padding:6px 0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><b>${a.tipo==="llanta"?"🛞":"🔋"} ${esc(a.posicion||(a.tipo==="llanta"?"Llanta":"Batería"))}</b> <small class="muted">${esc([a.marca,a.detalle].filter(Boolean).join(" "))}</small>
      <br><small class="muted">Desde ${fechaCorta(a.fecha_instalacion)} · ${fmtKm(a.km_recorrido)} recorridos${a.vida_km?` de ${fmtKm(a.vida_km)}`:""}${a.vida_meses?` · ${a.meses} de ${a.vida_meses} meses`:""}${a.costo?` · ${money(a.costo)}`:""}</small></div>
      <div style="text-align:right;flex:none"><b style="color:${col}">${a.pct}%</b>${adm?`<br><button class="link" data-ae="${a.id}">Editar</button><button class="link" data-ar="${a.id}">Retirar</button>`:""}</div></div>
      ${a.vida_km||a.vida_meses?`<div style="background:var(--bg);border-radius:6px;height:8px;overflow:hidden;margin-top:4px"><div style="height:100%;width:${Math.min(100,a.pct)}%;background:${col}"></div></div>`:""}</div>`; };
  box.innerHTML=`${act.map(fila).join("")||'<p class="muted">Sin llantas ni batería registradas.</p>'}${ret.length?`<details style="margin-top:6px"><summary class="muted">Retirados (${ret.length})</summary>${ret.map(a=>`<div><small>${a.tipo==="llanta"?"🛞":"🔋"} ${esc(a.posicion||a.tipo)} ${esc(a.marca)} · ${fmtKm(a.km_recorrido)} · retirado ${fechaCorta(a.fecha_retiro)}${a.motivo_retiro?" · "+esc(a.motivo_retiro):""}</small></div>`).join("")}</details>`:""}
    ${adm?`<div style="margin-top:6px"><button class="sec" id="dan">+ Llanta o batería</button></div>`:""}`;
  const an=box.querySelector("#dan"); if(an) an.onclick=()=>activoForm(v,null);
  box.querySelectorAll("[data-ae]").forEach(b=>b.onclick=()=>activoForm(v,A.find(a=>a.id==b.dataset.ae)));
  box.querySelectorAll("[data-ar]").forEach(b=>b.onclick=()=>retirarActivo(v,A.find(a=>a.id==b.dataset.ar))); }
function activoForm(v,a){ const POS=["Delantera izq.","Delantera der.","Trasera izq.","Trasera der.","Trasera izq. interior","Trasera der. interior","Repuesto"];
  dialog(`<h3>${a?"Editar":"Instalar"} llanta o batería · ${esc(v.placa)}</h3><div class="row"><div class="field"><label>Tipo</label><select id="at"><option value="llanta" ${a?.tipo!=="bateria"?"selected":""}>Llanta</option><option value="bateria" ${a?.tipo==="bateria"?"selected":""}>Batería</option></select></div>
    <div class="field"><label>Posición</label><input id="ap" list="apl" value="${esc(a?.posicion||"")}" placeholder="Ej: Delantera izq."><datalist id="apl">${POS.map(p=>`<option value="${p}">`).join("")}</datalist></div></div>
    <div class="row"><div class="field"><label>Marca</label><input id="am" value="${esc(a?.marca||"")}"></div><div class="field"><label>Medida / modelo / serie</label><input id="ad" value="${esc(a?.detalle||"")}" placeholder="Ej: 265/65 R17"></div></div>
    <div class="row"><div class="field"><label>Fecha de instalación</label><input type="date" id="af" value="${a?.fecha_instalacion||today()}" max="${today()}"></div><div class="field"><label>Km del vehículo al instalar</label><input id="ak" inputmode="numeric" value="${a?Math.round(a.km_instalacion):Math.round(v.km_actual)}"></div><div class="field"><label>Costo (${esc(EMP.moneda)})</label><input id="ac" inputmode="decimal" value="${a?.costo||""}"></div></div>
    <div class="row"><div class="field"><label>Vida útil (km)</label><input id="avk" inputmode="numeric" value="${a?a.vida_km||"":"50000"}"></div><div class="field"><label>Vida útil (meses)</label><input id="avm" inputmode="numeric" value="${a?a.vida_meses||"":"36"}"></div></div>
    ${a?"":`<label class="check"><input type="checkbox" id="ag" checked> Registrar el costo como gasto del vehículo</label><div class="row" style="margin-top:8px"><div class="field"><label>Proveedor</label><input id="apr"></div><div class="field"><label>N° de factura</label><input id="afa"></div></div>`}
    <div class="field"><label>Nota</label><input id="an" value="${esc(a?.nota||"")}"></div><div class="err" id="ae"></div><div class="acts"><button class="sec" id="ax">Cancelar</button><button id="aok">Guardar</button></div>`, B=>{
    B.querySelector("#ax").onclick=()=>vehiculoDetalle(v.id);
    B.querySelector("#aok").onclick=async()=>{ try{ const r=await api("activos",{body:{id:a?.id,vehiculo_id:v.id,tipo:val(B,"#at"),posicion:val(B,"#ap"),marca:val(B,"#am"),detalle:val(B,"#ad"),fecha_instalacion:val(B,"#af"),km_instalacion:val(B,"#ak"),costo:val(B,"#ac").replace(",","."),vida_km:val(B,"#avk"),vida_meses:val(B,"#avm"),nota:val(B,"#an"),
        registrar_gasto:a?false:B.querySelector("#ag").checked,proveedor:val(B,"#apr"),factura:val(B,"#afa")}}); toast(r.gasto?"Guardado y registrado como gasto del vehículo":"Guardado"); await cargarVeh(); vehiculoDetalle(v.id); }
      catch(e){ B.querySelector("#ae").textContent=e.message; } }; }); }
async function retirarActivo(v,a){ const m=await pregunta({titulo:`Retirar ${a.tipo==="llanta"?"llanta":"batería"} ${a.posicion||""}`,texto:`Se tomará el kilometraje actual del vehículo (${fmtKm(v.km_actual)}) como km de retiro.`,input:"Motivo (desgaste, pinchazo, falla…)",ok:"Retirar"}); if(m===null) return;
  try{ await api("activos",{body:{id:a.id,retirar:true,motivo:m}}); toast("Retirada"); await cargarVeh(); vehiculoDetalle(v.id); }catch(e){ toast(e.message); } }

// ===================== Repuestos =====================
async function viewRepuestos(){ await cargarVeh(); let J=await api("repuestos"), q="";
  $("main").innerHTML=`<h2>Repuestos</h2><div class="toolbar"><div class="grow"><label>Buscar</label><input id="rq" placeholder="Nombre o código"></div><label class="check" style="margin-bottom:8px"><input type="checkbox" id="rmin"> Solo bajo mínimo</label><button id="rnew">+ Nuevo repuesto</button></div>
    <p class="muted">Una <b>salida</b> con vehículo registra el gasto en ese vehículo (categoría Repuesto). Cuando el stock llega al mínimo aparece en el Dashboard y en el recordatorio diario.</p><div id="rlist"></div>`;
  const pintar=()=>{ const l=J.repuestos.filter(r=>(!$("rmin").checked||(r.activo&&r.minimo>0&&r.stock<=r.minimo))&&(!q||(r.nombre+" "+r.codigo).toLowerCase().includes(q)));
    $("rlist").innerHTML=`<div class="card tbl"><table><thead><tr><th>Repuesto</th><th>Código</th><th class="n">Stock</th><th class="n">Mínimo</th><th class="n">Costo unit.</th><th class="n">Valor</th><th></th></tr></thead><tbody>${l.map(r=>{ const bajo=r.activo&&r.minimo>0&&r.stock<=r.minimo;
      return `<tr style="${r.activo?"":"opacity:.5"}"><td><b class="click" data-h="${r.id}" style="cursor:pointer" title="Ver movimientos">${esc(r.nombre)}</b>${r.activo?"":' <span class="chip">inactivo</span>'}</td><td><small>${esc(r.codigo)}</small></td><td class="n"><span class="chip ${bajo?(r.stock<=0?"bad":"warn"):"ok"}">${fmtQ(r.stock)} ${esc(r.unidad)}</span></td><td class="n">${fmtQ(r.minimo)}</td><td class="n">${money(r.costo)}</td><td class="n">${money(r.stock*r.costo)}</td>
        <td style="white-space:nowrap"><button class="link" data-in="${r.id}">⬇ Entrada</button><button class="link" data-out="${r.id}">⬆ Salida</button><button class="link" data-ed="${r.id}">Editar</button></td></tr>`; }).join("")||'<tr><td colspan="7" class="muted">Sin repuestos.</td></tr>'}</tbody></table></div>
      <p class="muted">Valor del inventario: <b>${money(J.repuestos.filter(r=>r.activo).reduce((a,r)=>a+r.stock*r.costo,0))}</b></p>`;
    $("rlist").querySelectorAll("[data-ed]").forEach(b=>b.onclick=()=>form(J.repuestos.find(r=>r.id==b.dataset.ed)));
    $("rlist").querySelectorAll("[data-in]").forEach(b=>b.onclick=()=>mov(J.repuestos.find(r=>r.id==b.dataset.in),"entrada"));
    $("rlist").querySelectorAll("[data-out]").forEach(b=>b.onclick=()=>mov(J.repuestos.find(r=>r.id==b.dataset.out),"salida"));
    $("rlist").querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>hist(J.repuestos.find(r=>r.id==b.dataset.h))); };
  const recargar=async()=>{ J=await api("repuestos"); pintar(); };
  const form=r=>dialog(`<h3>${r?"Editar":"Nuevo"} repuesto</h3><div class="row"><div class="field"><label>Nombre *</label><input id="pn" value="${esc(r?.nombre||"")}"></div><div class="field"><label>Código</label><input id="pc" value="${esc(r?.codigo||"")}"></div></div>
    <div class="row"><div class="field"><label>Unidad</label><input id="pu" list="pul" value="${esc(r?.unidad||"unidad")}"><datalist id="pul"><option value="unidad"><option value="litro"><option value="juego"><option value="par"><option value="metro"></datalist></div><div class="field"><label>Stock mínimo</label><input id="pm" inputmode="decimal" value="${r?.minimo||""}"></div><div class="field"><label>Costo unitario (${esc(EMP.moneda)})</label><input id="pco" inputmode="decimal" value="${r?.costo||""}"></div></div>
    ${r?`<label class="check"><input type="checkbox" id="pa" ${r.activo?"checked":""}> Activo</label>`:`<div class="field"><label>Stock inicial</label><input id="ps" inputmode="decimal" value="0"></div>`}<div class="err" id="pe"></div><div class="acts"><button class="sec" id="px">Cancelar</button><button id="pok">Guardar</button></div>`, B=>{
    B.querySelector("#px").onclick=closeDlg;
    B.querySelector("#pok").onclick=async()=>{ try{ await api("repuestos",{body:{id:r?.id,nombre:val(B,"#pn"),codigo:val(B,"#pc"),unidad:val(B,"#pu"),minimo:val(B,"#pm").replace(",","."),costo:val(B,"#pco").replace(",","."),stock:val(B,"#ps").replace(",","."),activo:r?B.querySelector("#pa").checked:true}}); closeDlg(); toast("Guardado"); recargar(); }
      catch(e){ B.querySelector("#pe").textContent=e.message; } }; });
  const mov=(r,tipo)=>dialog(`<h3>${tipo==="entrada"?"⬇ Entrada":"⬆ Salida"} · ${esc(r.nombre)}</h3><p class="muted">Stock actual: <b>${fmtQ(r.stock)} ${esc(r.unidad)}</b></p>
    <div class="row"><div class="field"><label>Cantidad *</label><input id="mc" inputmode="decimal"></div><div class="field"><label>Costo unitario (${esc(EMP.moneda)})</label><input id="mco" inputmode="decimal" value="${r.costo||""}"></div></div>
    ${tipo==="salida"?`<div class="field"><label>Vehículo (registra el gasto en su historial)</label><select id="mv"><option value="">Sin vehículo (uso general)</option>${VEH.filter(v=>v.estado!=="baja").map(v=>`<option value="${v.id}">${esc(v.placa)} · ${esc(v.marca)} ${esc(v.modelo)}</option>`).join("")}</select></div>`:""}
    <div class="field"><label>Nota</label><input id="mn" placeholder="${tipo==="entrada"?"Proveedor, factura…":"Trabajo realizado…"}"></div><div class="err" id="me"></div><div class="acts"><button class="sec" id="mx">Cancelar</button><button id="mok">Guardar</button></div>`, B=>{
    B.querySelector("#mx").onclick=closeDlg;
    B.querySelector("#mok").onclick=async()=>{ try{ const j=await api("repuestos",{body:{movimiento:{repuesto_id:r.id,tipo,cantidad:val(B,"#mc").replace(",","."),costo:val(B,"#mco").replace(",","."),vehiculo_id:val(B,"#mv")||null,nota:val(B,"#mn")}}}); closeDlg(); toast(`Stock: ${fmtQ(j.stock)} ${r.unidad}${j.evento_id?" · gasto registrado en el vehículo":""}`); recargar(); }
      catch(e){ B.querySelector("#me").textContent=e.message; } }; });
  const hist=async r=>{ const j=await api("repuestos?movimientos="+r.id);
    dialog(`<h3>${esc(r.nombre)} · movimientos</h3><div class="tbl"><table><thead><tr><th>Fecha</th><th>Tipo</th><th class="n">Cantidad</th><th>Vehículo</th><th>Nota</th><th>Por</th></tr></thead><tbody>${j.movimientos.map(m=>`<tr><td>${fechaHora(m.fecha)}</td><td>${m.tipo}</td><td class="n">${m.tipo==="salida"?"-":"+"}${fmtQ(Math.abs(m.cantidad))}</td><td>${esc(m.placa||"")}</td><td><small>${esc(m.nota||"")}</small></td><td><small>${esc(m.usuario||"")}</small></td></tr>`).join("")||'<tr><td colspan="6" class="muted">Sin movimientos.</td></tr>'}</tbody></table></div><div class="acts"><button id="hx">Cerrar</button></div>`, B=>{ B.querySelector("#hx").onclick=closeDlg; }); };
  $("rq").oninput=()=>{ q=$("rq").value.toLowerCase(); pintar(); }; $("rmin").onchange=pintar; $("rnew").onclick=()=>form(null); pintar(); }

// ===================== Ficha pública por QR (sin usuario) =====================
async function fichaPublica(cod){ show("vPub"); const B=$("pubBody"); B.innerHTML='<p class="muted">Cargando…</p>';
  const irLogin=()=>{ show("vLogin"); $("lgUser").focus(); };
  try{ const j=await api("publico?v="+encodeURIComponent(cod)); const v=j.vehiculo, chip=e=>`<span class="chip ${e==="vencido"?"bad":e==="proximo"?"warn":"ok"}">${e==="vencido"?"Vencido":e==="proximo"?"Próximo":"Al día"}</span>`;
    B.innerHTML=`<div class="muted">${esc(j.empresa)}</div><h2 style="margin:4px 0">${esc(v.placa)}</h2><div class="muted">${esc([v.marca,v.modelo,v.anio,v.tipo].filter(Boolean).join(" · "))}${v.combustible?" · "+esc(v.combustible):""}</div><div>${fmtKm(v.km_actual)}${v.conductor?` · 👤 ${esc(v.conductor)}`:""}</div>
      <h3 style="margin-top:14px">Mantenimiento preventivo</h3><div class="tbl"><table><thead><tr><th>Plan</th><th>Último</th><th>Próximo</th><th></th></tr></thead><tbody>${j.planes.map(p=>`<tr><td>${esc(p.nombre)}</td><td><small>${p.ultima_fecha?fechaCorta(p.ultima_fecha):"—"}${p.ultimo_km?"<br>"+fmtKm(p.ultimo_km):""}</small></td><td><small>${p.proxKm!=null?fmtKm(p.proxKm):""}${p.proxKm!=null&&p.proxFecha?" / ":""}${p.proxFecha?fechaCorta(p.proxFecha):""}</small></td><td>${chip(p.estado)}</td></tr>`).join("")||'<tr><td colspan="4" class="muted">Sin planes.</td></tr>'}</tbody></table></div>
      ${j.documentos.length?`<h3 style="margin-top:14px">Documentos</h3><div class="tbl"><table>${j.documentos.map(d=>`<tr><td>${esc(d.nombre)}</td><td>${fechaCorta(d.fecha)}</td><td>${chip(d.estado)}</td></tr>`).join("")}</table></div>`:""}
      <h3 style="margin-top:14px">Últimos mantenimientos</h3><div class="tbl"><table>${j.mantenimientos.map(m=>`<tr><td>${fechaCorta(m.fecha)}</td><td>${esc(m.plan||m.detalle||"Correctivo")}</td><td><small>${esc(m.proveedor||"")}</small></td><td class="n">${m.km!=null?fmtKm(m.km):""}</td></tr>`).join("")||'<tr><td class="muted">Sin mantenimientos registrados.</td></tr>'}</table></div>
      <div class="acts" style="justify-content:flex-start">${j.whatsapp?`<a class="btn sec" href="https://wa.me/${String(j.whatsapp).length===8?"591"+j.whatsapp:j.whatsapp}" target="_blank" rel="noopener">💬 Contactar a la empresa</a>`:""}<button id="pubLogin">Ingresar para registrar</button></div>`;
    $("pubLogin").onclick=irLogin; }
  catch(e){ B.innerHTML=`<p class="err">${esc(e.message)}</p><div class="acts" style="justify-content:flex-start"><button id="pubLogin">Ingresar</button></div>`; $("pubLogin").onclick=irLogin; } }

// ===================== Empresa =====================
async function viewConfig(){ const P=USER.plan||{}; const PA={BO:"Bolivia",PE:"Perú",AR:"Argentina",CL:"Chile",CO:"Colombia",EC:"Ecuador",PY:"Paraguay",UY:"Uruguay",MX:"México",OT:"Otro país"};
  const PRE={BO:["Bs",-4,"SOAT","Inspección técnica"],PE:["S/",-5,"SOAT","Revisión técnica"],AR:["$",-3,"Seguro obligatorio","VTV"],CL:["$",-4,"SOAP","Revisión técnica"],CO:["$",-5,"SOAT","Revisión técnico-mecánica"],EC:["$",-5,"SPPAT","Revisión vehicular"],PY:["Gs",-4,"Seguro obligatorio","Inspección técnica"],UY:["$",-3,"SOA","Inspección técnica"],MX:["$",-6,"Seguro obligatorio","Verificación vehicular"],OT:["$",0,"Seguro obligatorio","Inspección técnica"]};
  $("main").innerHTML=`<h2>Datos de la empresa</h2><div class="card" style="max-width:640px">
    <div class="field"><label>Nombre</label><input id="cn" value="${esc(EMP.nombre)}"></div>
    <div class="row"><div class="field"><label>WhatsApp</label><input id="cw" inputmode="tel" value="${esc(EMP.whatsapp||"")}"></div><div class="field"><label>Correo de contacto</label><input id="ce" type="email" value="${esc(EMP.email||"")}"></div></div>
    <div class="field"><label>Dirección</label><input id="cd" value="${esc(EMP.direccion||"")}"></div>
    <h3>País, moneda y documentos</h3>
    <div class="row"><div class="field"><label>País</label><select id="cp">${Object.entries(PA).map(([k,n])=>`<option value="${k}" ${k===(EMP.pais||"BO")?"selected":""}>${n}</option>`).join("")}</select></div><div class="field"><label>Moneda</label><input id="cm" value="${esc(EMP.moneda)}"></div><div class="field"><label>Zona horaria (horas respecto a UTC)</label><input id="ctz" inputmode="numeric" value="${EMP.tz??-4}"></div></div>
    <div class="row"><div class="field"><label>Documento obligatorio 1</label><input id="cd1" value="${esc(EMP.doc1||"SOAT")}"></div><div class="field"><label>Documento obligatorio 2</label><input id="cd2" value="${esc(EMP.doc2||"Inspección técnica")}"></div></div>
    <p class="muted">Al cambiar el país se proponen la moneda, la zona horaria y los nombres de los documentos; puedes ajustarlos.</p>
    <h3>Control</h3>
    <div class="row"><div class="field"><label>Alertar si el rendimiento cae más de (%)</label><input id="ctc" inputmode="numeric" value="${EMP.tolerancia_consumo}"></div><div class="field"><label>Guardar fotos durante (días)</label><input id="cr" inputmode="numeric" value="${EMP.retencion_fotos}"></div></div>
    <label class="check"><input type="checkbox" id="cfo" ${EMP.foto_obligatoria?"checked":""}> Exigir foto de la factura en combustible y mantenimiento</label>
    <label class="check" style="margin-top:6px"><input type="checkbox" id="cfp" ${EMP.ficha_publica!==0?"checked":""}> Ficha pública del vehículo al escanear su QR sin usuario (talleres ven planes y documentos, nunca costos)</label>
    <h3 style="margin-top:14px">Recordatorio diario por correo</h3>
    <div class="field"><label>Correo(s) que reciben el resumen cada mañana</label><input id="cea" placeholder="jefe@empresa.com, gerencia@empresa.com" value="${esc(EMP.email_avisos||"")}"></div>
    <p class="muted">Mantenimientos vencidos y próximos, documentos por vencer, presupuesto superado y repuestos bajo mínimo. Guarda primero y luego envía una prueba.</p>
    <div class="acts" style="justify-content:flex-start"><button id="cok">Guardar</button><button class="sec" id="cprueba">✉️ Enviar prueba ahora</button><button class="sec" id="cver">Ver resumen de hoy</button></div><div id="cenv"></div></div>
    <div class="card" style="max-width:640px;margin-top:12px"><h3>Tu plan: ${esc(P.nombre||"")}</h3><p>Vence: <b>${esc(EMP.vence||"sin vencimiento")}</b></p><p class="muted">Hasta ${P.vehiculos??"ilimitados"} vehículos, ${P.sucursales??"ilimitados"} parqueos y ${P.usuarios??"ilimitados"} usuarios.</p></div>`;
  $("cp").onchange=()=>{ const p=PRE[$("cp").value]; if(!p) return; $("cm").value=p[0]; $("ctz").value=p[1]; $("cd1").value=p[2]; $("cd2").value=p[3]; };
  $("cok").onclick=async()=>{ try{ EMP=(await api("config",{body:{nombre:$("cn").value,whatsapp:$("cw").value,email:$("ce").value,moneda:$("cm").value,direccion:$("cd").value,tolerancia_consumo:$("ctc").value,retencion_fotos:$("cr").value,pais:$("cp").value,tz:$("ctz").value,doc1:$("cd1").value,doc2:$("cd2").value,
      foto_obligatoria:$("cfo").checked,ficha_publica:$("cfp").checked,email_avisos:$("cea").value}})).empresa; USER.empresa=EMP; ls.set("ag-user",JSON.stringify(USER));
    $("brand").textContent=EMP.nombre; toast("Guardado"); }catch(e){ toast(e.message); } };
  const probar=async enviar=>{ $("cenv").innerHTML='<p class="muted">Generando…</p>'; try{ const j=await api("recordatorios",{body:{probar:true,enviar}});
    $("cenv").innerHTML=`<div class="card" style="margin-top:10px;background:var(--bg)">${enviar?`<p>${j.enviado?`✅ Enviado a ${esc(j.correo)}`:`⚠️ No se envió: ${esc(j.error||"")}`}</p>`:""}<pre style="white-space:pre-wrap;font:inherit;margin:0">${esc(j.texto)}</pre></div>`; }catch(e){ $("cenv").innerHTML=`<p class="err">${esc(e.message)}</p>`; } };
  $("cprueba").onclick=()=>probar(true); $("cver").onclick=()=>probar(false); }
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
  repuestos:[["#rnew","Repuestos","Stock con mínimo. Las salidas con vehículo entran como gasto de ese vehículo y lo que baja del mínimo aparece en el Dashboard."]],
  proveedores:[["#pnew","Proveedores","Talleres, estaciones de servicio y lavaderos. Al registrar, el conductor solo puede elegir uno de esta lista con buscador."],["#pimp","Importar del historial","Si ya venías registrando, crea la lista con los nombres que ya usaste."]],
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

// ===================== Sin conexión: cola de registros =====================
// Los registros que no se pudieron enviar quedan en este equipo y se reintentan al volver la señal.
const colaKey=()=>`ag-cola-${USER?.id}`;
const cola={get:()=>{ try{ return JSON.parse(ls.get(colaKey())||"[]"); }catch(e){ return []; } }, set:a=>ls.set(colaKey(),JSON.stringify(a))};
function encolar(body){ const a=cola.get(), it={...body,_t:Date.now()}; a.push(it);
  if(!cola.set(a)){ it.foto1=it.foto2=null; if(!cola.set(a)) return false; toast("Sin espacio para las fotos: el registro se guardó sin fotos"); }
  pintarCola(); return true; }
let ENVIANDO=false;
async function enviarCola(manual){ if(ENVIANDO||!USER||USER.super) return; const a=cola.get(); if(!a.length) return;
  if(!navigator.onLine){ if(manual) toast("Todavía no hay conexión"); return; }
  ENVIANDO=true; const resto=[]; let ok=0;
  for(let i=0;i<a.length;i++){ if(a[i]._err){ resto.push(a[i]); continue; } const {_t,_err,...body}=a[i];
    try{ await api("eventos",{body}); ok++; }
    catch(e){ if(e.offline){ resto.push(...a.slice(i)); break; } resto.push({...a[i],_err:e.message}); } }
  cola.set(resto); ENVIANDO=false; pintarCola();
  if(ok){ toast(`Se enviaron ${ok} registro${ok>1?"s":""} pendiente${ok>1?"s":""}`); if(CUR) go(CUR); }
  else if(manual&&resto.some(x=>x._err)) toast("Hay registros con error: revísalos en Ver"); }
function pintarCola(){ let b=$("colaBar"); if(!b){ b=document.createElement("div"); b.id="colaBar"; $("main").before(b); } const a=USER&&!USER.super?cola.get():[], errs=a.filter(x=>x._err).length;
  b.innerHTML=a.length?`<div style="max-width:1200px;margin:12px auto 0;padding:0 16px"><div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-color:var(--warn);background:var(--warn-soft);color:var(--warn);font-weight:600;padding:10px 14px">📶 ${a.length} registro${a.length>1?"s":""} pendiente${a.length>1?"s":""} de enviar${errs?` (${errs} con error)`:""}<span style="flex:1"></span><button class="sec" id="colaVer">Ver</button><button class="sec" id="colaEnv">Reintentar</button></div></div>`:"";
  const v=$("colaVer"); if(v) v.onclick=verCola; const en=$("colaEnv"); if(en) en.onclick=()=>enviarCola(true); }
function verCola(){ const a=cola.get();
  dialog(`<h3>📶 Registros pendientes</h3><p class="muted">Se guardaron en este equipo porque no había conexión. Se envían solos cuando vuelve la señal. Los que tienen error se envían con "Enviar igual" o se descartan.</p>
    <div class="tbl"><table>${a.map((x,i)=>{ const v=VEH.find(y=>y.id===x.vehiculo_id); return `<tr><td>${TIPOS_EV[x.tipo]?.[0]||""} <b>${esc(v?.placa||"#"+x.vehiculo_id)}</b> ${TIPOS_EV[x.tipo]?.[1]||""}<br><small class="muted">${new Date(x._t).toLocaleString("es-BO")}${x.km?` · ${x.km} km`:""}${x.monto?` · ${money(x.monto)}`:""}${x.foto1||x.foto2?" · 📷":""}</small>${x._err?`<br><span class="chip bad">${esc(x._err)}</span>`:""}</td>
      <td class="right" style="white-space:nowrap">${x._err?`<button class="sec" data-f="${i}">Enviar igual</button> `:""}<button class="link" data-d="${i}">Descartar</button></td></tr>`; }).join("")||'<tr><td class="muted">Nada pendiente.</td></tr>'}</table></div><div class="acts"><button id="cx">Cerrar</button></div>`, B=>{
    B.querySelector("#cx").onclick=closeDlg;
    B.querySelectorAll("[data-d]").forEach(b=>b.onclick=async()=>{ if(!await confirmar("¿Descartar este registro? No se enviará.",{ok:"Descartar",peligro:true})) return; const q=cola.get(); q.splice(+b.dataset.d,1); cola.set(q); pintarCola(); verCola(); });
    B.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{ const q=cola.get(), it=q[+b.dataset.f]; it.confirmar_km=true; delete it._err; cola.set(q); closeDlg(); enviarCola(true); }); }); }
addEventListener("online",()=>enviarCola(false));
if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});

boot();
