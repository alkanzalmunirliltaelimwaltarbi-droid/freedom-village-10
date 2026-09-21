
const C=window.FV_CONFIG||{};
const S={token:localStorage.getItem("fv_session")||"",role:localStorage.getItem("fv_role")||"",name:localStorage.getItem("fv_name")||"",data:null,adminTab:"overview"};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function toast(m){const e=$("#toast");e.textContent=m;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,3200)}
function busy(v){$("#loading").hidden=!v}
async function rpc(fn,body={}){
  if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)throw Error("إعداد الاتصال السحابي غير مكتمل");
  const r=await fetch(C.SUPABASE_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{"Content-Type":"application/json","apikey":C.SUPABASE_ANON_KEY,"Authorization":"Bearer "+C.SUPABASE_ANON_KEY},body:JSON.stringify(body)});
  const t=await r.text(); let j; try{j=t?JSON.parse(t):null}catch{j=t}
  if(!r.ok)throw Error(j?.message||j?.hint||j?.error_description||"تعذر الاتصال بالخادم");
  return j;
}
function show(id){$$(".screen").forEach(x=>x.classList.remove("active"));const e=$("#"+id);if(e){e.classList.add("active");window.scrollTo({top:0,behavior:"smooth"})}}
function fmtDate(d){return new Intl.DateTimeFormat("ar-SY",{weekday:"long",year:"numeric",month:"long",day:"numeric"}).format(d)}
function hijri(d){try{return new Intl.DateTimeFormat("ar-SA-u-ca-islamic",{year:"numeric",month:"long",day:"numeric"}).format(d)}catch{return ""}}
function updateClock(){const d=new Date();$("#clock").textContent=d.toLocaleTimeString("ar-SY");$("#gregDate").textContent=fmtDate(d);$("#hijriDate").textContent=hijri(d);nextPrayer()}
setInterval(updateClock,1000); updateClock();

function setSession(j){
  S.token=j.token||"";S.role=j.role||"user";S.name=j.display_name||"المستخدم";
  localStorage.setItem("fv_session",S.token);localStorage.setItem("fv_role",S.role);localStorage.setItem("fv_name",S.name);
}
function clearSession(){S.token="";S.role="";S.name="";S.data=null;localStorage.removeItem("fv_session");localStorage.removeItem("fv_role");localStorage.removeItem("fv_name")}
async function login(code){
  busy(true);
  try{const j=await rpc("login_by_code",{p_code:code.trim()});if(!j?.token)throw Error("رمز الدخول غير صحيح");setSession(j);await openApp()}
  catch(e){toast(e.message||"تعذر تسجيل الدخول")}
  finally{busy(false)}
}
async function openApp(){
  $("#loginView").hidden=true;$("#appView").hidden=false;$("#welcomeName").textContent=S.name;
  const admin=S.role==="admin";$("#admin").hidden=!admin;$("#moreAdmin").hidden=!admin;
  await sync();
}
async function sync(){
  busy(true);
  try{S.data=await rpc("app_bootstrap",{p_token:S.token});renderAll();toast("تمت المزامنة بنجاح")}
  catch(e){if(/جلسة|session|token|unauthorized/i.test(e.message)){clearSession();$("#appView").hidden=true;$("#loginView").hidden=false}toast(e.message||"تعذر المزامنة")}
  finally{busy(false)}
}
function arr(k){return Array.isArray(S.data?.[k])?S.data[k]:[]}
function renderAll(){
  renderHome();renderNews();renderPrayer();renderServices();renderEmergency();renderComplaints();renderSuggestions();renderEvents();renderDirectory();
  if(S.role==="admin"){renderAdmin()}
}
function renderHome(){
  const p=S.data?.prayer||null,n=arr("news").slice(0,4);
  $("#newsPreview").innerHTML=n.length?n.map(x=>`<div class="item"><h4>${esc(x.title)}</h4><p>${esc(x.body||"")}</p></div>`).join(""):`<p class="muted">لا توجد إعلانات مدخلة حالياً.</p>`;
  $("#homeStats").innerHTML=[["📢","الإعلانات",arr("news").length],["🧾","الخدمات",arr("services").length],["📅","الفعاليات",arr("events").length]].map(x=>`<div class="card"><div class="eyebrow">${x[0]} ${x[1]}</div><strong style="font-size:1.8rem">${x[2]}</strong></div>`).join("");
  $("#prayerCard").innerHTML=prayerHtml(p);
}
function prayerHtml(p){
 if(!p)return `<p class="muted">لم يتم إدخال أوقات الصلاة بعد.</p>`;
 const names=[["الفجر",p.fajr],["الشروق",p.sunrise],["الظهر",p.dhuhr],["العصر",p.asr],["المغرب",p.maghrib],["العشاء",p.isha]];
 return `<div class="prayer-grid">${names.map(x=>`<div class="prayer"><b>${x[0]}</b><span>${esc(x[1]||"--:--")}</span></div>`).join("")}</div><div class="next-prayer" id="nextPrayer">جارٍ حساب الصلاة التالية...</div>${p.note?`<p class="meta">${esc(p.note)}</p>`:""}`;
}
function nextPrayer(){
 const p=S.data?.prayer;if(!p)return;
 const list=[["الفجر",p.fajr],["الظهر",p.dhuhr],["العصر",p.asr],["المغرب",p.maghrib],["العشاء",p.isha]].filter(x=>/^\d{1,2}:\d{2}$/.test(x[1]||""));
 if(!list.length)return;
 const now=new Date(),mins=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
 let nxt=list.find(x=>{const [h,m]=x[1].split(":").map(Number);return h*60+m>mins});
 if(!nxt)nxt=[list[0][0],list[0][1],true];
 const [h,m]=nxt[1].split(":").map(Number),target=new Date(now);target.setHours(h,m,0,0);if(nxt[2])target.setDate(target.getDate()+1);
 const sec=Math.max(0,Math.floor((target-now)/1000)),hh=Math.floor(sec/3600),mm=Math.floor(sec%3600/60),ss=sec%60;
 const e=$("#nextPrayer");if(e)e.innerHTML=`الصلاة التالية: <b>${esc(nxt[0])}</b> — ${esc(nxt[1])} <span class="meta">بعد ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}</span>`;
}
function renderNews(){$("#newsList").innerHTML=arr("news").map(x=>`<article class="item"><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p><div class="meta">${esc(x.created_at||"")}</div></article>`).join("")||`<div class="card muted">لا توجد بيانات.</div>`}
function renderPrayer(){$("#prayerFull").innerHTML=prayerHtml(S.data?.prayer)}
function renderServices(){$("#servicesList").innerHTML=arr("services").map(x=>`<article class="card service-card"><div class="service-icon">${esc(x.icon||"🛠️")}</div><h3>${esc(x.title)}</h3><p>${esc(x.body||"")}</p></article>`).join("")||`<div class="card">لا توجد خدمات مدخلة حالياً.</div>`}
function renderEmergency(){$("#emergencyList").innerHTML=arr("emergency").map(x=>`<article class="card emergency"><h3>${esc(x.title)}</h3><p>${esc(x.body||"")}</p>${x.phone?`<a href="tel:${esc(x.phone)}">اتصال: ${esc(x.phone)}</a>`:""}</article>`).join("")||`<div class="card">لا توجد أرقام مدخلة حالياً.</div>`}
function renderEvents(){$("#eventsList").innerHTML=arr("events").map(x=>`<article class="item"><h3>${esc(x.title)}</h3><p>${esc(x.body||"")}</p><div class="meta">${esc(x.event_date||"")} ${esc(x.event_time||"")}</div></article>`).join("")||`<div class="card">لا توجد فعاليات.</div>`}
function renderDirectory(){$("#directoryList").innerHTML=arr("directory").map(x=>`<article class="card emergency"><h3>${esc(x.title)}</h3><p>${esc(x.body||"")}</p>${x.phone?`<a href="tel:${esc(x.phone)}">☎ ${esc(x.phone)}</a>`:""}</article>`).join("")||`<div class="card">لا توجد بيانات.</div>`}
function statusClass(s){return String(s||"new").replace(/\s/g,"_")}
function renderComplaints(){
 const a=arr("my_complaints");
 $("#myComplaints").innerHTML=a.length?a.map(x=>`<article class="item"><div style="display:flex;justify-content:space-between;gap:10px"><h3>${esc(x.title)}</h3><span class="status ${statusClass(x.status)}">${esc(x.status_label||x.status)}</span></div><p>${esc(x.body)}</p><div class="meta">رقم المرجع: ${esc(x.ref_no)} · ${esc(x.created_at)}</div></article>`).join(""):`<div class="card muted">لا توجد شكاوى مرسلة.</div>`;
}
function renderSuggestions(){
 const a=arr("my_suggestions");
 $("#mySuggestions").innerHTML=a.length?a.map(x=>`<article class="item"><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p><div class="meta">${esc(x.status_label||x.status)} · ${esc(x.created_at)}</div></article>`).join(""):`<div class="card muted">لا توجد مقترحات مرسلة.</div>`;
}
function adminTabs(){
 return [["overview","الرئيسية"],["content","المحتوى"],["prayer","الصلاة"],["complaints","الشكاوى"],["suggestions","المقترحات"],["users","المستخدمون"],["settings","الإعدادات"]];
}
function renderAdmin(){
 $("#adminStats").innerHTML=[["👤","المستخدمون",S.data?.stats?.users??0],["⚑","الشكاوى",S.data?.stats?.complaints??0],["💡","المقترحات",S.data?.stats?.suggestions??0],["📢","الأخبار",arr("news").length],["🛠️","الخدمات",arr("services").length],["📅","الفعاليات",arr("events").length]].map(x=>`<div class="card"><div class="eyebrow">${x[0]} ${x[1]}</div><strong style="font-size:1.6rem">${x[2]}</strong></div>`).join("");
 $("#adminTabs").innerHTML=adminTabs().map(x=>`<button class="${S.adminTab===x[0]?"active":""}" data-admin="${x[0]}">${x[1]}</button>`).join("");
 renderAdminPanel();
}
function renderAdminPanel(){
 const p=$("#adminPanel");
 if(S.adminTab==="overview"){p.innerHTML=`<div class="card"><h3>حالة النظام</h3><p>الاتصال السحابي فعال، والبيانات المعروضة مصدرها قاعدة Supabase. جميع بيانات القرية قابلة للإدخال من لوحة الإدارة ولا توجد بيانات تجريبية مفروضة.</p><p class="meta">المشرف الحالي: ${esc(S.name)}</p></div>`;return}
 if(S.adminTab==="content"){p.innerHTML=contentAdmin();return}
 if(S.adminTab==="prayer"){p.innerHTML=prayerAdmin();return}
 if(S.adminTab==="complaints"){p.innerHTML=complaintsAdmin();return}
 if(S.adminTab==="suggestions"){p.innerHTML=suggestionsAdmin();return}
 if(S.adminTab==="users"){p.innerHTML=usersAdmin();return}
 if(S.adminTab==="settings"){p.innerHTML=settingsAdmin();return}
}
function contentAdmin(){
 const sections=[
 ["news","الأخبار والإعلانات","title","body"],["services","الخدمات","title","body"],["emergency","الطوارئ","title","body"],["events","الفعاليات","title","body"],["directory","دليل القرية","title","body"]];
 let out=`<div class="stack">`;
 for(const [k,label,a,b] of sections){
  out+=`<div class="card"><h3>${label}</h3><form class="admin-form" data-add="${k}"><input name="${a}" placeholder="العنوان" required><textarea name="${b}" placeholder="التفاصيل" required></textarea>${k==="services"?'<input name="icon" placeholder="رمز/أيقونة اختيارية">':""}${k==="emergency"||k==="directory"?'<input name="phone" placeholder="رقم الهاتف (اختياري)">':""}${k==="events"?'<div class="row"><input name="event_date" type="date" required><input name="event_time" type="time"></div>':""}<button class="primary">إضافة</button></form><div class="stack">${arr(k).map(x=>`<div class="item"><b>${esc(x.title)}</b><p>${esc(x.body||"")}</p><button class="danger" data-delete="${k}" data-id="${esc(x.id)}">حذف</button></div>`).join("")}</div></div>`;
 }
 return out+"</div>";
}
function prayerAdmin(){
 const p=S.data?.prayer||{};
 return `<div class="card"><h3>إدخال أوقات الصلاة</h3><form id="prayerForm" class="admin-form"><div class="row"><input name="fajr" type="time" value="${esc(p.fajr||"")}"><input name="sunrise" type="time" value="${esc(p.sunrise||"")}"></div><div class="row"><input name="dhuhr" type="time" value="${esc(p.dhuhr||"")}"><input name="asr" type="time" value="${esc(p.asr||"")}"></div><div class="row"><input name="maghrib" type="time" value="${esc(p.maghrib||"")}"><input name="isha" type="time" value="${esc(p.isha||"")}"></div><textarea name="note" placeholder="ملاحظة">${esc(p.note||"")}</textarea><button class="primary">حفظ أوقات الصلاة</button></form></div>`;
}
function complaintsAdmin(){
 return `<div class="card table-wrap"><table class="table"><thead><tr><th>المرجع</th><th>العنوان</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>${arr("complaints").map(x=>`<tr><td>${esc(x.ref_no)}</td><td>${esc(x.title)}</td><td><select data-status="complaint" data-id="${esc(x.id)}"><option value="new" ${x.status==="new"?"selected":""}>جديدة</option><option value="under_review" ${x.status==="under_review"?"selected":""}>قيد المراجعة</option><option value="processing" ${x.status==="processing"?"selected":""}>قيد المعالجة</option><option value="resolved" ${x.status==="resolved"?"selected":""}>تم الحل</option><option value="closed" ${x.status==="closed"?"selected":""}>مغلقة</option></select></td><td>${esc(x.created_at)}</td><td><button class="secondary" data-save-status="complaint" data-id="${esc(x.id)}">حفظ</button></td></tr>`).join("")||`<tr><td colspan="5">لا توجد شكاوى.</td></tr>`}</tbody></table></div>`;
}
function suggestionsAdmin(){
 return `<div class="card table-wrap"><table class="table"><thead><tr><th>العنوان</th><th>المقترح</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>${arr("suggestions").map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.body)}</td><td><select data-status="suggestion" data-id="${esc(x.id)}"><option value="new" ${x.status==="new"?"selected":""}>جديد</option><option value="reviewed" ${x.status==="reviewed"?"selected":""}>تمت المراجعة</option><option value="accepted" ${x.status==="accepted"?"selected":""}>مقبول</option><option value="rejected" ${x.status==="rejected"?"selected":""}>مرفوض</option></select></td><td>${esc(x.created_at)}</td><td><button class="secondary" data-save-status="suggestion" data-id="${esc(x.id)}">حفظ</button></td></tr>`).join("")||`<tr><td colspan="5">لا توجد مقترحات.</td></tr>`}</tbody></table></div>`;
}
function usersAdmin(){return `<div class="card"><h3>المستخدمون</h3><p>عدد الحسابات النشطة: <b>${S.data?.stats?.users??0}</b></p><p class="muted">رمز المستخدم العام يدار من قاعدة البيانات. لا يتم عرض رموز الدخول السرية في الواجهة.</p></div>`}
function settingsAdmin(){return `<div class="card"><h3>إعدادات المنصة</h3><p>يمكن إضافة إعدادات مستقبلية من خلال قاعدة البيانات. لا توجد بيانات تجريبية افتراضية في المحتوى.</p><div class="meta">آخر مزامنة: ${new Date().toLocaleString("ar-SY")}</div></div>`}

async function submitRpc(fn,body,msg="تم الحفظ"){
 busy(true);try{await rpc(fn,{p_token:S.token,...body});toast(msg);await sync()}catch(e){toast(e.message)}finally{busy(false)}
}
$("#loginForm").addEventListener("submit",e=>{e.preventDefault();login($("#accessCode").value)});
$("#logoutBtn").onclick=()=>{clearSession();$("#appView").hidden=true;$("#loginView").hidden=false;$("#accessCode").value=""};
$("#syncBtn").onclick=sync;
$("#bottomNav").addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(!b)return;const id=b.dataset.go;if(id==="more"){$("#moreSheet").hidden=false;return}show(id);$$(".bottom-nav button").forEach(x=>x.classList.toggle("active",x===b))});
$("#moreSheet").addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(!b)return;$("#moreSheet").hidden=true;show(b.dataset.go)});
$("#adminTabs").addEventListener("click",e=>{const b=e.target.closest("[data-admin]");if(!b)return;S.adminTab=b.dataset.admin;renderAdmin()});
$("#complaintForm").addEventListener("submit",async e=>{e.preventDefault();await submitRpc("create_complaint",{p_title:$("#complaintTitle").value.trim(),p_body:$("#complaintBody").value.trim()},"تم إرسال الشكوى");e.target.reset()});
$("#suggestionForm").addEventListener("submit",async e=>{e.preventDefault();await submitRpc("create_suggestion",{p_title:$("#suggestionTitle").value.trim(),p_body:$("#suggestionBody").value.trim()},"تم إرسال المقترح");e.target.reset()});
$("#adminPanel").addEventListener("submit",async e=>{
 if(e.target.matches("[data-add]")){e.preventDefault();const f=new FormData(e.target),k=e.target.dataset.add;const obj={};f.forEach((v,key)=>obj["p_"+key]=v);obj.p_section=k;await submitRpc("admin_add_content",obj,"تمت إضافة البيانات");}
 if(e.target.id==="prayerForm"){e.preventDefault();const f=new FormData(e.target),o={};f.forEach((v,k)=>o["p_"+k]=v);await submitRpc("admin_save_prayer",o,"تم حفظ أوقات الصلاة")}
});
$("#adminPanel").addEventListener("click",async e=>{
 const d=e.target.closest("[data-delete]");if(d){if(!confirm("هل تريد حذف هذا العنصر؟"))return;await submitRpc("admin_delete_content",{p_section:d.dataset.delete,p_id:d.dataset.id},"تم الحذف")}
 const s=e.target.closest("[data-save-status]");if(s){const sel=$(`[data-status="${s.dataset.saveStatus}"][data-id="${s.dataset.id}"]`);await submitRpc(s.dataset.saveStatus==="complaint"?"admin_update_complaint":"admin_update_suggestion",{p_id:s.dataset.id,p_status:sel.value},"تم تحديث الحالة")}
});

let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").hidden=false});
$("#installBtn").onclick=async()=>{if(!deferredPrompt){toast("افتح الموقع في Chrome مباشرة؛ إذا كان الجهاز يدعم تثبيت PWA سيظهر خيار تثبيت التطبيق.");return}deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("#installBtn").hidden=true};
window.addEventListener("appinstalled",()=>toast("تم تثبيت التطبيق بنجاح"));

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
if(S.token)openApp().catch(()=>{clearSession();$("#appView").hidden=true;$("#loginView").hidden=false});
