(function(){
"use strict";
/* WEN Sales Lab, M1 test build. Week 1 logic ported from prototype v4.
   Curriculum text is NOT in this file: it is fetched after sign-in from the content table. */
var CFG=window.SL_CONFIG;
function netFetch(){var f=window.__slFetch||window.fetch.bind(window);return f.apply(null,arguments);} /* test seam: lets the test suite simulate a dropped connection */
var sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"},global:{fetch:netFetch}});
var FLAGS={};
var S=null,CONTENT={},ME=null,PHASE="boot",ERR="",route="#/";
var SYNC={version:0,bk:{},timer:null,busy:false,again:false,status:"idle",lastSaved:null,retry:0,note:"",token:null,poll:null};
var AUTH={step:"email",email:"",code:"",pw:"",msg:"",busy:false,cool:0,tm:null};
var UI={versions:null,toast:"",toastTm:null,pending:false};
/* ---------- M3: server-side access check, framed use, session care ---------- */
var ENDED=false,LAST_ACCESS=Date.now();
var FRAMED=false;try{FRAMED=window.top!==window.self;}catch(e){FRAMED=true;}
var STORAGE_OK=true;try{localStorage.setItem("wsl_t","1");localStorage.removeItem("wsl_t");}catch(e){STORAGE_OK=false;}
async function accessCall(body){
 try{
  var tok=null;try{var g=await sb.auth.getSession();tok=g.data&&g.data.session?g.data.session.access_token:null;}catch(e){}
  var h={"Content-Type":"application/json",apikey:CFG.key};if(tok)h.Authorization="Bearer "+tok;
  var r=await netFetch(CFG.url+"/functions/v1/access-check",{method:"POST",headers:h,body:JSON.stringify(body)});
  var j=null;try{j=await r.json();}catch(e){}
  return {s:r.status,j:j};
 }catch(e){return {s:0,j:null};}
}
/* Only "yes" lets a code be sent. When the check itself cannot be reached ("unknown"), only an address this device has already verified
   as a member in the last 60 days may continue, so members are not locked out by an outage but strangers cannot trigger an email. */
function okMap(){try{return JSON.parse(localStorage.getItem("wsl_ok")||"{}")||{};}catch(e){return {};}}
function rememberOk(em){try{var m=okMap(),n=Date.now();Object.keys(m).forEach(function(k){if(n-m[k]>60*86400000)delete m[k];});m[em]=n;localStorage.setItem("wsl_ok",JSON.stringify(m));}catch(e){}}
function isRememberedOk(em){var t=okMap()[em];return !!t&&Date.now()-t<60*86400000;}
async function precheckEmail(em){
 var r=await accessCall({action:"precheck",email:em});
 if(r.s===429)return "slow";
 if(r.s===200&&r.j){if(r.j.allowed===true){rememberOk(em);return "yes";}return r.j.reason==="unavailable"?"down":"no";}
 return isRememberedOk(em)?"yes":"down";
}
/* Re-checks that the signed-in person still has access. Returns false only when we are sure it has ended. */
async function stillHasAccess(){
 var r=await accessCall({action:"recheck"});LAST_ACCESS=Date.now();
 if(r.s===200&&r.j&&r.j.active===false&&!r.j.unavailable)return false;
 return true;
}
async function periodicAccess(){
 if(PHASE!=="app"||Date.now()-LAST_ACCESS<5*60*1000)return;
 if(!(await stillHasAccess())){
  try{if(S&&changedKeys().length)await flush();}catch(e){}
  ENDED=true;clearInterval(SYNC.poll);PHASE="noaccess";render();
 }
}
setInterval(periodicAccess,15*60*1000);
document.addEventListener("visibilitychange",function(){if(!document.hidden&&Date.now()-LAST_ACCESS>30*60*1000)periodicAccess();});
async function signOutAll(){
 try{if(S&&changedKeys().length)await flush();}catch(e){}
 clearInterval(SYNC.poll);clearMirror();
 await sb.auth.signOut({scope:"global"});
}

function clone(o){return JSON.parse(JSON.stringify(o));}
function keysOf(o){var m={};Object.keys(o).forEach(function(k){m[k]=JSON.stringify(o[k]);});return m;}
function changedKeys(){var out=[];if(!S)return out;Object.keys(S).forEach(function(k){if(SYNC.bk[k]!==JSON.stringify(S[k]))out.push(k);});return out;}
function blank(){return {week:1,steps:{},plan:"own",focus:{product:"",format:"",price:"",currency:"GBP",freq:"",where:"",url:"",problem:"",outcome:"",inc:[],incd:{disc:"",comm:""}},cdraft:{name:"",link:""},cmsg:"",base:{orders:{s:"",v:""},revenue:{s:"",v:""},partner:{s:"",v:""},hours:"",comfort:0,confidence:0},buyer:{who:"",buys:[],places:[]},types:[],cands:[],sketch:{},decision:"",remind:{weekly:true,steps:false},fitIndex:0,newType:"",nextId:1,refl:"",w2:{steps:{},quiz1:[],quiz1done:false,hardest:[],pre:[],q4:{},practiceDone:false,practice:[],stuck:[],dec:"",comfort2:"",openedAt:"",cur:0,feel:[],diff:[]},out:{},w3:{steps:{},quiz:{},dismiss:{},pre:[],learn:[],feel:[],ready:[],unclear:[],chg:[],dec:""},col:clone(W3DEF),w4:W4DEF(),rv:RVDEF(),past:[],chk:CHKDEF(),et:ETDEF(),em:EMDEF(),sts:STSDEF(),fyb:FYBDEF()};}
function normalise(st){var b=blank(),o=Object.assign({},b,st||{});["focus","cdraft","base","buyer","remind"].forEach(function(k){o[k]=Object.assign({},b[k],(st||{})[k]||{});});o.focus.incd=Object.assign({},b.focus.incd,o.focus.incd||{});return fybfix(stsfix(emfix(etfix(d5fix(rvfix(w4fix(w3fix(w2fix(o)))))))));}

/* ---------- local mirror: survives a closed tab or a dropped connection ---------- */
function mirrorKey(){return ME?"wsl_mirror_"+ME.id:null;}
function writeMirror(){try{var k=mirrorKey();if(k&&S)localStorage.setItem(k,JSON.stringify({state:S,version:SYNC.version,bk:SYNC.bk,at:Date.now()}));}catch(e){}}
function readMirror(){try{var k=mirrorKey();var r=k&&localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;}}
function clearMirror(){try{var k=mirrorKey();if(k)localStorage.removeItem(k);}catch(e){}}

/* ---------- saving ---------- */
function pad(n){return (n<10?"0":"")+n;}
function pillHtml(){
 var s=SYNC.status,t,c="ok";
 if(s==="saving"){t="Saving...";c="info";}
 else if(s==="offline"){t="Not saved yet. Your changes are kept on this device and will save when the connection returns.";c="warn";}
 else if(s==="error"){t="Couldn’t save. Retrying.";c="warn";}
 else{t=SYNC.lastSaved?"Saved at "+pad(SYNC.lastSaved.getHours())+":"+pad(SYNC.lastSaved.getMinutes()):"Saved";}
 return '<div id="savepill" class="pill '+c+'" role="status" aria-live="polite">'+t+(SYNC.note&&s!=="offline"?' &middot; '+esc(SYNC.note):'')+'</div>';
}
function setStatus(s,note){SYNC.status=s;if(note!==undefined)SYNC.note=note;var e=document.getElementById("savepill");if(e)e.outerHTML=pillHtml();}
function save(){if(!S||PHASE!=="app")return;writeMirror();schedule();}
function schedule(){if(!S||PHASE!=="app")return;clearTimeout(SYNC.timer);if(changedKeys().length){if(SYNC.status!=="offline")setStatus("saving");SYNC.timer=setTimeout(flush,700);}else if(SYNC.status==="saving")setStatus("saved");}
function isNoAccess(e){return e&&(e.code==="42501"||/not_entitled/.test(e.message||""));}
function isNoSession(e){return e&&(e.code==="28000"||/not_signed_in|JWT|jwt/.test(e.message||""));}
async function flush(){
 if(!S||PHASE!=="app")return;
 if(SYNC.busy){SYNC.again=true;return;}
 if(!changedKeys().length){setStatus("saved");return;}
 SYNC.busy=true;setStatus("saving");
 var snap=clone(S),exp=SYNC.version,force=false,failed=false;
 try{
  for(var tries=0;tries<5;tries++){
   var r=await sb.rpc("save_state",{p_state:snap,p_expected:exp,p_force:force});
   if(r.error)throw r.error;
   var d=r.data;
   if(d.ok){SYNC.version=d.version;SYNC.bk=keysOf(snap);SYNC.lastSaved=new Date();SYNC.retry=0;SYNC.note="";break;}
   /* another tab or device saved first: keep their changes, then put ours on top, key by key */
   var sv=normalise(d.state),mine=Object.keys(snap).filter(function(k){return SYNC.bk[k]!==JSON.stringify(snap[k]);});
   var live=Object.keys(S).filter(function(k){return JSON.stringify(S[k])!==JSON.stringify(snap[k]);});
   var merged=clone(sv);mine.forEach(function(k){merged[k]=snap[k];});live.forEach(function(k){merged[k]=S[k];});
   S=merged;SYNC.bk=keysOf(sv);SYNC.version=d.version;snap=clone(S);exp=d.version;force=true;
   SYNC.note="Combined with changes from another tab or device";toast("We combined your changes with ones saved from another tab or device. The earlier version is kept under Earlier saved versions.");
   writeMirror();renderSafe();
  }
 }catch(e){
  failed=true;
  if(isNoAccess(e)){ENDED=true;PHASE="noaccess";SYNC.busy=false;render();return;}
  if(isNoSession(e)){var rf=await sb.auth.refreshSession();if(rf.error||!rf.data.session){PHASE="signin";AUTH.msg="Your session ended. Please sign in again. Your changes are kept on this device.";SYNC.busy=false;render();return;}}
  var off=(typeof navigator!=="undefined"&&navigator.onLine===false)||/fetch|network|Failed|load/i.test(String(e&&e.message));
  setStatus(off?"offline":"error");
  clearTimeout(SYNC.timer);SYNC.timer=setTimeout(flush,Math.min(30000,2000*Math.pow(2,SYNC.retry++)));
 }
 SYNC.busy=false;
 if(failed)return;
 if(SYNC.again||changedKeys().length){SYNC.again=false;schedule();}else setStatus("saved");
}
function pageHide(){
 if(!S||PHASE!=="app"||!SYNC.token)return;
 writeMirror();if(!changedKeys().length)return;
 try{netFetch(CFG.url+"/rest/v1/rpc/save_state",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json",apikey:CFG.key,Authorization:"Bearer "+SYNC.token},body:JSON.stringify({p_state:S,p_expected:SYNC.version,p_force:false})});}catch(e){}
}
window.addEventListener("pagehide",pageHide);
document.addEventListener("visibilitychange",function(){if(document.hidden)pageHide();else checkRemote();});
window.addEventListener("online",function(){if(S&&changedKeys().length)flush();});

/* ---------- picking up changes made in another tab or device ---------- */
function toast(m){UI.toast=m;clearTimeout(UI.toastTm);UI.toastTm=setTimeout(function(){UI.toast="";var e=document.getElementById("toast");if(e)e.remove();},9000);}
function renderSafe(){var a=document.activeElement;if(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")){UI.pending=true;return;}render();}
document.addEventListener("focusout",function(){if(UI.pending){UI.pending=false;setTimeout(render,0);}});
async function checkRemote(){
 if(PHASE!=="app"||document.hidden||SYNC.busy||changedKeys().length)return;
 var r=await sb.rpc("get_version");if(r.error||r.data<=SYNC.version)return;
 var g=await sb.rpc("get_state");if(g.error)return;
 if(changedKeys().length)return;
 S=normalise(g.data.state);SYNC.version=g.data.version;SYNC.bk=keysOf(S);writeMirror();
 toast("Updated with changes saved from another tab or device.");renderSafe();
}

/* ---------- loading after sign-in ---------- */
async function loadAll(){
 PHASE="loading";render();
 var u=await sb.auth.getUser();
 if(u.error||!u.data.user){PHASE="signin";render();return;}
 ME={id:u.data.user.id,email:u.data.user.email,admin:false};
 var ad=await sb.rpc("is_admin");ME.admin=!ad.error&&ad.data===true;
 var r=await sb.rpc("get_state");
 if(r.error&&isNoAccess(r.error)){var rc=await accessCall({action:"recheck"});LAST_ACCESS=Date.now();if(rc.j&&rc.j.active===true)r=await sb.rpc("get_state");}
 ENDED=false;
 if(r.error){
  if(isNoAccess(r.error)&&ME.admin){PHASE="adminonly";route="#/admin";render();adminLoad();return;}
  if(isNoAccess(r.error)){PHASE="noaccess";render();return;}
  if(isNoSession(r.error)){PHASE="signin";render();return;}
  ERR=r.error.message;PHASE="error";render();return;
 }
 rememberOk((ME.email||"").toLowerCase());
 var sv=normalise(r.data.state);SYNC.version=r.data.version;SYNC.bk=keysOf(sv);S=sv;SYNC.note="";
 var m=readMirror();
 if(m&&m.state&&m.bk){
  var un=Object.keys(m.state).filter(function(k){return m.bk[k]!==JSON.stringify(m.state[k]);});
  un.forEach(function(k){S[k]=m.state[k];});
  if(un.length)SYNC.note="Restored changes that were not yet saved from this device";
 }
 var c=await sb.from("content").select("key,body");
 CONTENT={};if(!c.error&&c.data)c.data.forEach(function(x){CONTENT[x.key]=x.body;});
 var fl=await sb.rpc("get_flags");FLAGS=(!fl.error&&fl.data)?fl.data:{};
 await sprLoad();
 if(FLAGS.community===true){comPeek();comHomePeek(true);}
 PHASE="app";route=location.hash||"#/";if(!/^#\//.test(route))route="#/";
 render();
 clearInterval(SYNC.poll);SYNC.poll=setInterval(checkRemote,20000);
 if(changedKeys().length)flush();else setStatus("saved");
}
function LC(k){return CONTENT[k]||'<p class="mute">This part of the lesson could not be loaded. Please refresh the page.</p>';}
function glance(w,n){var g=CONTENT["w"+w+".guide"];if(!g)return "";try{g=JSON.parse(g);}catch(e){return "";}var x=g[n-1];if(!x)return "";return '<div class="glance"><p><strong>What you will do:</strong> '+esc(x[0])+'</p><p><strong>Why it matters:</strong> '+esc(x[1])+'</p><p><strong>What happens next:</strong> '+esc(x[2])+'</p></div>';}

var STEPS=[
 {n:1,t:"Pick your focus product and record where you are now",m:40,b:"Nothing. This is the start."},
 {n:2,t:"Learn what makes a partner worth approaching, then describe your buyer",m:45,b:"Step 1 (your product)."},
 {n:3,t:"Find candidates",m:50,b:"Step 2 (your buyer and partner types)."},
 {n:4,t:"Fit check",m:55,b:"Step 3 (your candidate list). You can also add candidates here."},
 {n:5,t:"Choose your shortlist",m:35,b:"Step 4 (fit scores)."},
 {n:6,t:"Sketch what you could offer",m:30,b:"Step 5 (your shortlist)."},
 {n:7,t:"Review Week 1 and decide what's next",m:15,b:"Steps 1 to 6, though you can review at any point."}
];
var TYPES=[["next","Sells something next to mine"],["teaches","Teaches the same buyer"],["host","Hosts the buyer's community or list"],["service","Serves the buyer with a service"],["tool","A tool the buyer uses"],["known","Someone I already know"]];
var BUYS=["Related templates or tools","Courses or coaching","Newsletters","Podcasts","Software or apps","Books or guides"];
var PLACES=["Newsletters","YouTube","Instagram or TikTok","Online groups or communities","Podcasts","Marketplaces like Etsy"];
var OVERLAP=["Different price point","Different format or stage","Different audience segment","We could bundle","Other"];
var REASONS=["Clearly the same buyer","Their audience already buys similar things","A warm contact","Open to working with others","Small but active","Easy to offer them something"];
var GAIN=["Saves them time","A new resource for their audience","Extra income through a commission","Content for their channel","Other"];
var MEAS=["A unique link","A discount code","Buyers tell us where they heard","Other"];
var Q=[
 ["q1","Same buyer","Do they serve the same buyer as you, not just the same topic?",[["No",0],["Partly",1],["Yes",2]]],
 ["q2","Next door","Do they sell or teach something that goes with yours, rather than competes?",[["It overlaps",0],["It goes alongside",1]]],
 ["q3","Active audience","Is there recent activity and real conversation?",[["No",0],["Yes",1]]],
 ["q4","Buyers","Do they or their audience buy things, or ask where to find things like yours?",[["No",0],["Yes",1]]],
 ["q5","Reachable","Do they seem open to working with others, and is it realistic to reach them?",[["No",0],["Yes",1]]],
 ["q6","Something to offer","Can you name one specific thing you could offer them or their audience?",[["No",0],["Yes",1]]]
];
var FORMATS=[["download","A digital download"],["sub","A membership or subscription"],["course","A course or programme"],["software","Software or an app"],["service","A service"],["physical","A physical product"],["other","Something else"]];
var FREQ=[["once","One-off"],["monthly","Monthly"],["yearly","Yearly"],["session","Per session or project"],["varies","It varies"]];
var FREQDEF={download:"once",sub:"monthly",course:"once",software:"monthly",service:"session",physical:"once",other:""};
var FMTP={download:"a digital download",sub:"a membership",course:"a course",software:"a web app",service:"a service",physical:"a physical product",other:""};
var INCENT=[["free","A free copy or free access to try"],["disc","A discount code for their audience"],["trial","A longer free trial"],["comm","A commission on sales they send"],["give","A shared giveaway"]];
var INCDET={disc:"What discount? For example: 15% off the first three months",comm:"What commission? For example: 20% of each sale"};
var ASK=["A mention to their audience","An introduction","A guest slot","A shared link","A short chat first"];
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
function setPath(p,v){var a=p.split("."),o=S;for(var i=0;i<a.length-1;i++){o=o[a[i]];}o[a[a.length-1]]=v;save();}
function getPath(p){var a=p.split("."),o=S;for(var i=0;i<a.length;i++){o=o[a[i]];}return o;}
function chipsHtml(path,opts,max){var cur=getPath(path)||[];return '<div class="row">'+opts.map(function(o){var v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return '<button type="button" class="chip" aria-pressed="'+(cur.indexOf(v)>-1)+'" data-a="chip" data-path="'+path+'" data-val="'+esc(v)+'" data-max="'+(max||99)+'">'+esc(l)+'</button>';}).join("")+'</div>';}
function cChips(c,field,opts){var cur=c[field]||[];return '<div class="row">'+opts.map(function(o){return '<button type="button" class="chip sm" aria-pressed="'+(cur.indexOf(o)>-1)+'" data-a="cchip" data-id="'+c.id+'" data-f="'+field+'" data-val="'+esc(o)+'">'+esc(o)+'</button>';}).join("")+'</div>';}
function sChips(id,field,opts){var sk=S.sketch[id]||{};var cur=sk[field]||[];return '<div class="row">'+opts.map(function(o){var v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return '<button type="button" class="chip sm" aria-pressed="'+(cur.indexOf(v)>-1)+'" data-a="schip" data-id="'+id+'" data-f="'+field+'" data-val="'+esc(v)+'">'+esc(l)+'</button>';}).join("")+'</div>';}
function typeLabel(t){for(var i=0;i<TYPES.length;i++){if(TYPES[i][0]===t)return TYPES[i][1];}return "";}
function complete(c){return Q.every(function(q){return c.fit&&c.fit[q[0]]!=null;});}
function scoreOf(c){var s=0;Q.forEach(function(q){if(c.fit&&c.fit[q[0]]!=null)s+=c.fit[q[0]];});return s;}
function labelOf(c){if(c.fit&&c.fit.q1===0)return {t:"Not a fit",c:"bad"};if(!complete(c))return {t:"In progress",c:"info"};var s=scoreOf(c);if(s>=6)return {t:"Strong fit",c:"ok"};if(s>=4)return {t:"Worth considering",c:"info"};return {t:"Weak fit",c:"warn"};}
function shortlisted(){return S.cands.filter(function(c){return c.short;});}
function byScore(a,b){return scoreOf(b)-scoreOf(a);}
function mins(L){return L.reduce(function(a,s){return a+s.m;},0);}
function hm(m){var h=Math.floor(m/60),r=m%60;return (h?h+" hr ":"")+(r?r+" min":"");}
function sym(c){return {GBP:"£",USD:"$",EUR:"€",CAD:"CA$",AUD:"A$"}[c]||(c+" ");}
function lc(s){s=String(s||"").trim().replace(/[.]+$/,"");return s.replace(/^[A-Z](?![A-Z])/,function(x){return x.toLowerCase();});}
function joinAnd(a){return a.length<2?(a[0]||""):a.slice(0,-1).join(", ")+" and "+a[a.length-1];}
function priceText(){var f=S.focus;if(!f.price&&f.freq!=="varies")return "";var p=f.price?sym(f.currency)+f.price:"";if(f.freq==="varies")return p?"from "+p+", depending on the option":"";var t={once:"(one-off)",monthly:"a month",yearly:"a year",session:"per session or project"}[f.freq]||"";return (p+" "+t).trim();}
function incKeys(){var f=S.focus.format;return INCENT.filter(function(i){return i[0]!=="trial"||/sub|software|course/.test(f);});}
function numField(label,key){var o=S.base[key];var h='<label>'+label+'</label><div class="row"><select data-bind="base.'+key+'.s" aria-label="'+esc(label)+'" style="max-width:200px"><option value="">Choose</option><option value="value"'+(o.s==="value"?" selected":"")+'>A number</option><option value="zero"'+(o.s==="zero"?" selected":"")+'>0</option><option value="unknown"'+(o.s==="unknown"?" selected":"")+'>I don\'t know</option></select>';if(o.s==="value")h+='<input type="number" data-bind="base.'+key+'.v" value="'+esc(o.v)+'" style="max-width:140px" aria-label="'+esc(label)+' number">';h+='</div>';return h;}
function scale(path,label){var cur=getPath(path);var h='<label>'+label+'</label><div class="row">';for(var i=1;i<=5;i++){h+='<button type="button" class="chip" aria-pressed="'+(cur===i)+'" data-a="num" data-path="'+path+'" data-val="'+i+'">'+i+'</button>';}return h+'</div>';}
function check(){
 var sl=shortlisted();if(!sl.length)return null;
 function all(f){return sl.every(f);}function any(f){return sl.some(f);}
 var types={};sl.forEach(function(c){types[c.type]=1;});var tn=Object.keys(types).length;
 return [["Buyer overlap",all(function(c){return c.fit.q1===2;})?2:1],["Reasons given",all(function(c){return (c.reasons||[]).length>0;})?2:(any(function(c){return (c.reasons||[]).length>0;})?1:0)],["Next door",all(function(c){return c.fit.q2===1;})?2:(all(function(c){return c.fit.q2===1||(c.overlapWhy||[]).length>0;})?1:0)],["Reachable",all(function(c){return c.fit.q5===1;})?2:(any(function(c){return c.fit.q5===1;})?1:0)],["Range",tn>=2&&types.known?2:(tn>=2?1:0)]];
}
function shell(n,body){
 var s=STEPS[n-1],dn=S.steps[n];
 var h='<a class="back" href="#/sprint" data-wk="1">&larr; My Sprint</a><h1>Week 1 &middot; Step '+n+' of 7</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p>'+glance(1,n)+'<p class="mute">You will need: '+esc(s.b)+' Everything saves automatically, so you can stop and come back any time.</p>';
 h+=body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="done" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<7?'<a class="btn ghost" href="#/step/'+(n+1)+'">Next step &rarr;</a>':'<a class="btn ghost" href="#/sprint" data-wk="1">Back to My Sprint</a>')+'</div>';
 return h;
}
function doneCount(){return STEPS.filter(function(s){return S.steps[s.n];}).length;}
function nextStep(){for(var i=0;i<STEPS.length;i++){if(!S.steps[STEPS[i].n])return STEPS[i];}return null;}
function week1Done(){return doneCount()===7||S.decision==="ready";}
function planCard(L){
 var h='<div class="card"><h2>Plan your sessions</h2><p class="mute">Do the steps at your own pace. Combine them into two or three sessions if that suits your week. The order is recommended, not enforced.</p><div class="row">';
 [["own","At my own pace"],["two","Two sessions"],["three","Three sessions"]].forEach(function(p){h+='<button type="button" class="chip" aria-pressed="'+(S.plan===p[0])+'" data-a="plan" data-val="'+p[0]+'">'+p[1]+'</button>';});
 return h+'</div>'+groupsHtml(L,S.plan)+'</div>';
}
function groupsHtml(L,plan,off){
 var groups={own:[[1],[2],[3],[4],[5],[6],[7]],two:[[1,2,3],[4,5,6,7]],three:[[1,2],[3,4],[5,6,7]]}[plan];
 if(L.length===6)groups={own:[[1],[2],[3],[4],[5],[6]],two:[[1,2,3],[4,5,6]],three:[[1,2],[3],[4,5,6]]}[plan];
 return '<div style="margin-top:10px">'+groups.map(function(g,i){var t=g.reduce(function(a,n){return a+L[n-1].m;},0);return '<div class="crow"><span>'+(plan==="own"?"":'Session '+(i+1)+': ')+'Step'+(g.length>1?'s ':' ')+g.join(", ")+'</span><span class="mute">'+hm(t)+'</span></div>';}).join("")+'</div>';
}
function remindCard(){return '<div class="card"><h2>Reminders</h2><div class="row"><button type="button" class="chip" aria-pressed="'+S.remind.weekly+'" data-a="remind" data-k="weekly">Weekly reminder (default)</button><button type="button" class="chip" aria-pressed="'+S.remind.steps+'" data-a="remind" data-k="steps">Add reminders for individual steps</button></div><p class="mute">Your preference is saved. Reminders are not sent in this test build.</p></div>';}
function helpCard(){return '<div class="card"><h2>Need help?</h2><p><strong>A question</strong> about the programme: we reply within two working days.<br><strong>Can\'t get in, or something broke:</strong> use the urgent route and we\'ll look at it first.</p></div>';}
function toggle(arr,v,max){var i=arr.indexOf(v);if(i>-1)arr.splice(i,1);else if(arr.length<max)arr.push(v);}
function snapFields(){var m={},els=document.querySelectorAll("#app input[id],#app textarea[id],#app select[id]");for(var i=0;i<els.length;i++){var e=els[i];if(e.type==="file"||e.dataset.bind||e.dataset.sk||e.dataset.col||e.dataset.resv||e.dataset.out)continue;m[e.id]=e.value;}return m;}
function restoreFields(m){for(var id in m){var e=document.getElementById(id);if(e&&e.tagName!=="SELECT"&&!e.value&&m[id])e.value=m[id];}}
function step1(){
 var f=S.focus,h=LC("w1s1.lesson");
 h+='<div class="card"><h2>Your focus product</h2><label for="fp">What is it called?</label><input id="fp" type="text" data-bind="focus.product" value="'+esc(f.product)+'" placeholder="For example: Money Map">';
 h+='<label>What kind of product is it?</label><div class="row">'+FORMATS.map(function(x){return '<button type="button" class="chip" aria-pressed="'+(f.format===x[0])+'" data-a="ffmt" data-val="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>';
 if(f.format){
  h+='<label>How do customers pay?</label><div class="row">'+FREQ.map(function(x){return '<button type="button" class="chip" aria-pressed="'+(f.freq===x[0])+'" data-a="ffreq" data-val="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>';
  h+='<div class="row"><div style="flex:1;min-width:120px"><label for="pr">'+(f.freq==="varies"?"Starting price (optional)":"Price")+'</label><input id="pr" type="number" data-bind="focus.price" value="'+esc(f.price)+'"></div><div style="flex:1;min-width:120px"><label for="cu">Currency</label><select id="cu" data-bind="focus.currency">'+["GBP","USD","EUR","CAD","AUD"].map(function(c){return '<option'+(f.currency===c?" selected":"")+'>'+c+'</option>';}).join("")+'</select></div></div>';
 }else h+='<p class="mute">Choose a kind of product and a few more questions appear.</p>';
 h+='<label for="wh">Where is it sold?</label><input id="wh" type="text" data-bind="focus.where" value="'+esc(f.where)+'" placeholder="For example: Etsy, my own site"><label for="ur">A link to it (optional)</label><input id="ur" type="text" data-bind="focus.url" value="'+esc(f.url)+'" placeholder="https://"><p class="mute">If you add a link, it can go in your first email so the partner can see it. Leave it blank if you would rather not.</p></div>';
 if(f.product&&f.format){
  h+='<div class="card"><h2>Help your messages sound specific</h2><p class="mute">Two short sentences make the biggest difference. Nothing here is shared with anyone.</p>';
  h+='<label for="pb">What problem does it solve for your buyer?</label><p class="mute" style="margin:2px 0 6px">In your own words, as you would explain it to a friend. For example: they do not know how much is safe to spend, so every late invoice feels like a crisis.</p><input id="pb" type="text" data-bind="focus.problem" value="'+esc(f.problem)+'" placeholder="Their problem, in your words">';
  h+='<label for="oc">What does your buyer get from it?</label><p class="mute" style="margin:2px 0 6px">The result or benefit, in your own words. For example: a simple monthly money plan and a clear view of what is safe to spend.</p><input id="oc" type="text" data-bind="focus.outcome" value="'+esc(f.outcome)+'" placeholder="What they get, in your words">';
  h+='<label>Is there anything you would be happy to offer a partner or their audience? (optional)</label><div class="row">'+incKeys().map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(f.inc.indexOf(x[0])>-1)+'" data-a="finc" data-val="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>';
  ["disc","comm"].forEach(function(k){if(f.inc.indexOf(k)>-1)h+='<label for="id'+k+'">'+INCDET[k].split(". ")[0]+'?</label><input id="id'+k+'" type="text" data-bind="focus.incd.'+k+'" value="'+esc(f.incd[k])+'" placeholder="'+esc(INCDET[k].split("For example: ")[1])+'">';});
  h+='<div class="note info"><strong>You stay in control.</strong> Nothing is offered in a message unless you have listed it here and then chosen it for that specific partner. If you leave this blank, your messages simply propose the collaboration.</div></div>';
  var pl=productLine();
  h+='<div class="card"><h2>Your product at a glance</h2><p class="mute">This is what the Message Builder will work from. Change anything above and it updates.</p><div class="note ok" id="glance" aria-live="polite">'+productDetailsHtml()+'</div>'+(S.buyer.who?'':'<p class="mute">You will describe your buyer in step 2, and it will be added here.</p>')+'</div>';
 }
 h+='<div class="card"><h2>Where you are now</h2><p class="mute">Last 30 days, for this product.</p>'+numField("Orders","orders")+numField("Revenue","revenue")+numField("Sales that came from someone else sending you buyers","partner")+'<label for="hr">Hours a week you can really give</label><input id="hr" type="number" data-bind="base.hours" value="'+esc(S.base.hours)+'" style="max-width:140px">'+scale("base.comfort","How comfortable are you contacting people you don\'t know? (1 = not at all, 5 = very)")+scale("base.confidence","Optional: how confident are you that you can find the right partner? (1 to 5)")+'</div>';
 var unk=[["orders","Orders"],["revenue","Revenue"],["partner","Partner-sourced sales"]].filter(function(k){return S.base[k[0]].s==="unknown";});
 if(unk.length)h+='<div class="note info">Marked "I don\'t know": '+unk.map(function(k){return k[1];}).join(", ")+'. You can fill these in later if you find out.</div>';
 return shell(1,h);
}
function step2(){
 var h=LC("w1s2.lesson");
 h+=LC("w1s2.ex_2");
 h+='<div class="card"><h2>Your buyer</h2><label for="bw">Who buys this? One sentence.</label><input id="bw" type="text" data-bind="buyer.who" value="'+esc(S.buyer.who)+'" placeholder="For example: women running a small business on their own"><label>What else do they buy or follow? (choose any)</label>'+chipsHtml("buyer.buys",BUYS)+'<label>Where do they spend time? (choose any)</label>'+chipsHtml("buyer.places",PLACES)+'</div>';
 h+='<div class="card"><h2>Partner types to look for</h2><p class="mute">Choose up to three. These steer the suggestions in the next step.</p>'+chipsHtml("types",TYPES,3)+'<div class="note info"><strong>Warm start.</strong> If reaching out to strangers feels daunting, begin with someone you already know. A warm contact makes next week\'s first message easier. They still need to pass the same fit check, so choose someone who genuinely reaches your buyer.</div></div>';
 return shell(2,h);
}
function step3(){
 var h=LC("w1s3.lesson")+LC("w1s3.finding");
 h+='<div class="note warn"><strong>Guardrails.</strong> Public pages only. No private contact details, so keep emails and phone numbers in your own email, not here. Don\'t contact anyone this week. Follow each platform\'s rules.</div>';
 h+=findHelpHtml();
 h+='<div class="card"><h2>Add a candidate</h2><p class="mute">Add only people you have checked: they exist, their public link works, and their audience looks like your buyer.</p><label for="cn">Name of the business or creator</label><input id="cn" type="text" data-bind="cdraft.name" value="'+esc(S.cdraft.name)+'" placeholder="Name"><label for="cl">Link to their public page</label><input id="cl" type="text" data-bind="cdraft.link" value="'+esc(S.cdraft.link)+'" placeholder="https://"><label>Type</label><div class="row">'+TYPES.map(function(t){return '<button type="button" class="chip sm" aria-pressed="'+(S.newType===t[0])+'" data-a="newtype" data-val="'+t[0]+'">'+t[1]+'</button>';}).join("")+'</div>'+(S.cmsg?'<div class="note warn" role="alert">'+esc(S.cmsg)+'</div>':'')+'<p><button type="button" class="btn" data-a="addc">Add candidate</button></p></div>';
 var n=S.cands.length;
 h+='<div class="card"><h2>Your candidates ('+n+')</h2><p class="mute">A small number of relevant, checked partners is the goal. Five to eight is a good result, and three is enough to move on. Do not pad the list.</p>';
 if(!n)h+='<p class="mute">None yet. Tap "Week 1 example" at the top to see how it looks filled in.</p>';
 S.cands.forEach(function(c){h+='<div class="crow"><span><strong>'+esc(c.name)+'</strong><br><span class="mute">'+esc(typeLabel(c.type))+(c.link?" &middot; "+esc(c.link):"")+'</span></span><button type="button" class="chip sm" data-a="delc" data-id="'+c.id+'">Remove</button></div>';});
 var types={};S.cands.forEach(function(c){types[c.type]=1;});
 if(n>=3&&Object.keys(types).length===1)h+='<div class="note info">All your candidates are one type. Two ideas: look at the places your buyer follows or subscribes to, and think of someone you already know.</div>';
 return shell(3,h+'</div>');
}
function step4(){
 var h=LC("w1s4.lesson");
 if(!S.cands.length)return shell(4,h+'<div class="note info">You haven\'t added any candidates yet. Add some in step 3,.</div>');
 if(S.fitIndex>=S.cands.length)S.fitIndex=0;
 var c=S.cands[S.fitIndex],lab=labelOf(c);
 h+='<div class="row" style="margin:8px 0">'+S.cands.map(function(x,i){return '<button type="button" class="chip sm" aria-pressed="'+(i===S.fitIndex)+'" data-a="fitgo" data-i="'+i+'" title="'+esc(x.name)+'">'+(i+1)+(complete(x)?" &#10003;":"")+'</button>';}).join("")+'</div>';
 h+='<div class="card"><p class="mute">Candidate '+(S.fitIndex+1)+' of '+S.cands.length+'</p><h2>'+esc(c.name)+'</h2><p class="mute">'+esc(typeLabel(c.type))+(c.type==="known"?" &middot; a warm contact. They go through the same checks.":"")+'</p>';
 Q.forEach(function(q,i){h+='<div class="q"><strong>'+(i+1)+'. '+q[1]+'.</strong> '+q[2]+'<div class="row">'+q[3].map(function(o){return '<button type="button" class="chip" aria-pressed="'+(c.fit[q[0]]===o[1])+'" data-a="fit" data-id="'+c.id+'" data-q="'+q[0]+'" data-v="'+o[1]+'">'+o[0]+'</button>';}).join("")+'</div></div>';});
 if(c.fit.q1===0)h+='<div class="note bad"><strong>Not a fit:</strong> they don\'t reach your buyer. This one can stay in your list but can\'t go on your shortlist.</div>';
 if(c.fit.q2===0){h+='<div class="note warn"><strong>Overlap.</strong> Overlapping offers can still work, for example if their product is a different price point, format or stage. They may be less keen to promote you, so it helps to have a reason. What makes this worth it? (optional)</div>'+cChips(c,"overlapWhy",OVERLAP);}
 h+='<div class="note '+lab.c+'" aria-live="polite" style="margin-top:14px"><span class="score">Score '+scoreOf(c)+' of 7</span> &middot; '+lab.t+(lab.t==="Weak fit"?". We would suggest skipping this one, but it is your call.":(lab.t==="In progress"?". Answer all six to see the label.":"."))+'</div>';
 h+='<div class="row" style="margin-top:12px"><button type="button" class="chip" aria-pressed="'+(!!c.parked)+'" data-a="park" data-id="'+c.id+'">Not sure yet, park this one</button></div>';
 h+='<div class="row" style="margin-top:14px;justify-content:space-between"><button type="button" class="btn ghost" data-a="fitnav" data-d="-1">&larr; Previous</button><button type="button" class="btn" data-a="fitnav" data-d="1">Next candidate &rarr;</button></div></div>';
 return shell(4,h);
}
function step5(){
 var h=LC("w1s5.lesson");
 var pool=S.cands.filter(function(c){return complete(c)&&!c.parked;}).sort(byScore),sel=shortlisted().length;
 if(!pool.length)return shell(5,h+'<div class="note info">No scored candidates yet. Finish the fit check in step 4 first. Parked candidates don\'t appear here.</div>');
 h+='<div class="card"><h2>Your scored candidates</h2><p class="mute">Highest scores first. Choose up to five. '+sel+' chosen.</p>';
 pool.forEach(function(c){var l=labelOf(c),nf=c.fit.q1===0,full=!c.short&&sel>=5;
  h+='<div class="crow"><span><strong>'+esc(c.name)+'</strong><br><span class="mute">Score '+scoreOf(c)+' of 7 &middot; '+l.t+((c.overlapWhy&&c.overlapWhy.length)?' &middot; overlap noted: '+esc(c.overlapWhy.join(", ")):'')+'</span></span><button type="button" class="chip" aria-pressed="'+(!!c.short)+'" data-a="short" data-id="'+c.id+'"'+((nf||full)?" disabled":"")+'>'+(nf?"Not a fit":(c.short?"On my shortlist":"Add to shortlist"))+'</button></div>';
  if(c.short){h+='<div style="margin:-2px 0 10px 8px"><span class="mute">Why this one? (tap any)</span>'+cChips(c,"reasons",REASONS);
   if(c.fit.q2===0&&!(c.overlapWhy&&c.overlapWhy.length))h+='<div class="note warn">This one overlaps with what you sell and you haven\'t said why it still makes sense. You can go ahead, or add a reason in step 4.</div>';
   if(l.t==="Weak fit")h+='<div class="note warn">This is a weak fit on score. You can keep it if you have a good reason.</div>';
   h+='</div>';}
 });
 if(sel===0)h+='<div class="note info">Nothing chosen yet.</div>';
 if(sel>0&&sel<3)h+='<div class="note info">A smaller pool gives you fewer chances to test your approach and see what works. You can go ahead, or add more candidates first.</div>';
 return shell(5,h+'</div>');
}
function step6(){
 var h=LC("w1s6.lesson");
 var top=shortlisted().sort(byScore).slice(0,2);
 if(!top.length)return shell(6,h+'<div class="note info">Choose at least one partner on your shortlist in step 5, then come back here.</div>');
 var inc=incKeys().filter(function(x){return S.focus.inc.indexOf(x[0])>-1;});
 top.forEach(function(c){var sk=S.sketch[c.id]||{};
  h+='<div class="card"><h2>'+esc(c.name)+'</h2><p class="mute">Tap what fits. Add a line only if you want to.</p><label>What I would suggest (choose one)</label>'+sChips(c.id,"ask",ASK)+'<label>What I would offer (optional)</label>';
  if(inc.length)h+=sChips(c.id,"offer",inc);
  else h+='<p class="mute">You have not listed anything you are willing to offer in your product profile, so a message would propose the collaboration only. That is a perfectly good place to start. <a href="#/step/1">Add something in step 1</a> if you want to.</p>';
  h+='<label>What they gain</label>'+sChips(c.id,"gain",GAIN)+'<label>How we would tell whether it worked</label>'+sChips(c.id,"measure",MEAS)+'<label for="n'+c.id+'">Optional note</label><input id="n'+c.id+'" type="text" data-sk="'+c.id+'" value="'+esc(sk.note||"")+'">';
  var money=(sk.gain||[]).indexOf("Extra income through a commission")>-1||(sk.offer||[]).indexOf("comm")>-1;
  var checks=[[(sk.ask||[]).length===1,"You have chosen one small thing to suggest"],[(sk.gain||[]).length>0,"They clearly gain something"],[(sk.measure||[]).length>0,"You can measure it"]];
  h+='<div class="note info" aria-live="polite">'+checks.map(function(k){return (k[0]?"&#10003; ":"&#9744; ")+k[1];}).join("<br>")+'</div>';
  if(money)h+='<div class="note warn">A commission is involved, so plan a clear disclosure line when you share it.</div>';
  h+='</div>';});
 return shell(6,h+'<p class="mute">These choices carry into the Sales Message Builder in Week 2, so you won\'t have to enter them again. You will see and approve them there before any draft is made.</p>');
}
function step7(){
 var sl=shortlisted().sort(byScore),b=S.base;
 function nv(o){return o.s==="value"?o.v:(o.s==="zero"?"0":(o.s==="unknown"?"I don't know":"not set"));}
 var h='<div class="card"><h2>Your Week 1 summary</h2><p><strong>Focus product:</strong> '+esc(S.focus.product?productLine():"not set")+(S.focus.where?" Sold on: "+esc(S.focus.where)+".":"")+'</p><p><strong>Where you started:</strong> orders '+esc(nv(b.orders))+', revenue '+esc(nv(b.revenue))+', partner-sourced sales '+esc(nv(b.partner))+'.</p><p><strong>Candidates:</strong> '+S.cands.length+' found, '+S.cands.filter(complete).length+' scored.</p><p><strong>Shortlist ('+sl.length+'):</strong></p>';
 if(sl.length){h+='<ul>'+sl.map(function(c){return '<li>'+esc(c.name)+' &middot; score '+scoreOf(c)+'/7'+((c.reasons||[]).length?" &middot; "+esc(c.reasons.join(", ")):"")+'</li>';}).join("")+'</ul>';}else h+='<p class="mute">Nobody yet.</p>';
 var ck=check();
 if(ck){var tot=ck.reduce(function(a,r){return a+r[1];},0);h+='<h3>Your Week 1 skill check (automatic)</h3><p class="mute">A learning indicator, not a grade. You\'ll compare it with Week 4.</p>'+ck.map(function(r){return '<div class="crow"><span>'+r[0]+'</span><span class="score">'+r[1]+' of 2</span></div>';}).join("")+'<p><strong>Total '+tot+' of 10</strong></p>';}
 h+='</div><div class="card"><h2>What\'s next?</h2>';
 [["ready","Ready for Week 2"],["more","I\'d like to add more candidates first"],["change","I want to change product or partner type"],["help","I\'d like help in the group session"]].forEach(function(o){h+='<p><button type="button" class="chip" aria-pressed="'+(S.decision===o[0])+'" data-a="dec" data-val="'+o[0]+'">'+o[1]+'</button></p>';});
 if(S.decision==="ready"&&!sl.length)h+='<div class="note warn">Week 2 needs at least one partner to talk to. Add one to your shortlist, or choose "add more candidates".</div>';
 if(S.decision==="ready"&&sl.length>0&&sl.length<3)h+='<div class="note info">With a smaller pool you\'ll have fewer chances to test your approach. That\'s fine. You can add partners as you go.</div>';
 if(S.decision==="ready"&&sl.length>=1)h+='<div class="note ok"><strong>Week 1 is complete.</strong> Week 2 is now open on My Sprint. Weeks 3 and 4 are not part of this test build. Your Week 1 work stays saved.</div>';
 h+='</div><div class="card"><h2>Optional: what surprised you this week?</h2><textarea rows="3" style="min-height:80px" data-bind="refl" aria-label="What surprised you this week (optional)" placeholder="Skip this if you like"></textarea></div>';
 return shell(7,h);
}
function productLine(){var f=S.focus,fm=FMTP[f.format]||"",buyer=(S.buyer.who||"").trim(),pt=priceText();return (f.product||"Your product")+(fm?" · "+fm:"")+(buyer?" · for "+buyer:"")+(pt?" · "+pt:"");}
function productDetailsHtml(){var f=S.focus,fm=FMTP[f.format]||"",pt=priceText(),buyer=(S.buyer.who||"").trim();var h='<strong>'+esc(f.product||"Your product")+'</strong>'+(fm?' &middot; '+esc(fm):'')+(pt?' &middot; '+esc(pt):'')+(buyer?'<br>For: '+esc(buyer):'');if((f.problem||"").trim())h+='<br>The problem it solves: '+esc(f.problem.trim());if((f.outcome||"").trim())h+='<br>What customers get: '+esc(f.outcome.trim());return h;}
function findPromptText(){var f=S.focus,t=LC("w1s3.prompt"),b=S.buyer||{};
function line(label,arr){return arr&&arr.length?label+arr.join(", ")+".\n":"";}
var fmt=FMTP[f.format]||"",pt=priceText();
var map={product:(f.product||"").trim()||"[your product]",format:fmt?" ("+fmt+")":"",price:pt?", priced at "+pt:"",
problem:(f.problem||"").trim()?"The problem it solves for my buyer: "+f.problem.trim()+"\n":"",
outcome:(f.outcome||"").trim()?"What my buyer gets from it: "+f.outcome.trim()+"\n":"",
buyer:(b.who||"").trim()||"[describe your buyer in step 2]",
buys:line("Other things they buy or follow: ",b.buys),places:line("Places they spend time: ",b.places),
types:(S.types&&S.types.length)?S.types.map(typeLabel).join("; "):"anyone who fits, including people who sell something next to mine"};
Object.keys(map).forEach(function(k){t=t.split("{"+k+"}").join(map[k]);});
return t;}
function findHelpHtml(){var missing=!(S.focus.product||"").trim()||!(S.buyer.who||"").trim();
return '<div class="card"><h2>Stuck? Ask an AI tool to help you search</h2><p>Copy this into ChatGPT, Claude or any AI tool you already use. It has been filled in from your own answers in steps 1 and 2, so you do not have to type anything again. It asks for a few strong suggestions rather than a long list. If you want more, run it again.</p>'+(missing?'<div class="note info">Some of it is blank because steps 1 or 2 are not finished yet. Fill those in and this updates by itself.</div>':'')+'<textarea readonly rows="9" id="findprompt" aria-label="Prompt to copy into your AI tool" style="font-size:14px">'+esc(findPromptText())+'</textarea><p><button type="button" class="btn" data-a="copyprompt">Copy this prompt</button> <span class="mute" id="copymsg" aria-live="polite"></span></p><div class="note warn"><strong>Check everything it gives you.</strong> AI tools sometimes make up names or links. Before you add anyone to your candidate list below, check three things: the business or creator really exists, the public link opens and goes where it says, and the people who follow them look like your buyer. If you cannot confirm all three, leave them out. Never paste customer details or anyone\'s private information into the AI tool.</div></div>';}
/* ---------- account screens ---------- */
function friendly(e){var m=String((e&&e.message)||"");
 if(/signups? not allowed|otp_disabled/i.test(m)||(e&&e.code==="otp_disabled"))return "We couldn’t set up your sign-in just now. Please try again in a minute, or email us at "+SUPPORT_EMAIL+".";
 if(/rate|seconds|too many|limit/i.test(m))return "Please wait a minute before asking for another code.";
 if(/not authorized|authorised/i.test(m))return "This test build can only email approved addresses. Please use the test sign-in below, or ask for your address to be added.";
 if(/expired|invalid|token/i.test(m))return "That code didn’t work. It may have expired. Please check it or ask for a new one.";
 if(/fetch|network/i.test(m))return "We couldn’t reach the server. Check your connection and try again.";
 return "Something went wrong. Please try again.";}
function signinHtml(){
 var h='<div class="card" style="max-width:460px;margin:24px auto"><img class="signlogo" src="logo-160.png" alt="WEN" width="72" height="72"><h1>Sign in to the Sales Lab</h1>';
 if(AUTH.msg)h+='<div class="note info" role="status">'+esc(AUTH.msg)+'</div>';
 if(FRAMED)h+='<div class="note info" role="status">You’re viewing the Sales Lab inside another page. '+(STORAGE_OK?'If signing in doesn’t stay, ':'Your browser is blocking sign-in here, so ')+'<a href="'+esc(location.href.split("#")[0])+'" target="_blank" rel="noopener">open the Sales Lab on its own page</a> (opens in a new tab).</div>';
 if(AUTH.step==="email"){
  h+='<p>Enter the email address you joined with. We’ll email you a sign-in code and a link.</p><label for="em">Email address</label><input id="em" type="email" inputmode="email" autocomplete="email" data-auth="email" value="'+esc(AUTH.email)+'"><p><button type="button" class="btn" data-a="sendcode"'+(AUTH.busy||AUTH.cool>0?" disabled":"")+'>'+(AUTH.busy?"Sending...":(AUTH.cool>0?"Wait "+AUTH.cool+"s":"Email me a code"))+'</button></p>';
 }else{
  h+='<p>We sent a code to <strong>'+esc(AUTH.email)+'</strong>. Enter the code, or open the link in the same email on this device.</p><label for="cd">Code from the email</label><input id="cd" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" data-auth="code" value="'+esc(AUTH.code)+'" style="max-width:200px;font-size:22px;letter-spacing:4px"><p><button type="button" class="btn" data-a="verify"'+(AUTH.busy?" disabled":"")+'>'+(AUTH.busy?"Checking...":"Sign in")+'</button> <button type="button" class="btn ghost" data-a="sendcode"'+(AUTH.busy||AUTH.cool>0?" disabled":"")+'>'+(AUTH.cool>0?"Resend in "+AUTH.cool+"s":"Send a new code")+'</button></p><p class="mute"><button type="button" class="chip sm" data-a="changeemail">Use a different email</button></p><details><summary class="mute">Can’t sign in?</summary><p class="mute">Check your spam folder, make sure you’re using the email you joined with, and try the code rather than the link if you opened the email on a different device or browser.</p></details>';
 }
 if(CFG.testMode)h+='<details style="margin-top:16px"><summary class="mute">Test sign-in (fictional accounts only)</summary><label for="tp">Password</label><input id="tp" type="password" autocomplete="current-password" data-auth="pw" value="'+esc(AUTH.pw)+'"><p><button type="button" class="btn ghost" data-a="pwlogin">Test sign-in</button></p><p class="mute">Uses the email entered above. Only in the test build.</p></details>';
 h+='<p class="mute" style="margin-top:16px">Trouble signing in? <a href="'+mailtoHref("Sales Lab sign-in help","Hi, I'm having trouble signing in to the Sales Lab.\n")+'">Email '+SUPPORT_EMAIL+'</a>.</p>';
 return h+'</div>';
}
/* M2 fix (12 Nov 2026): every "contact us" must give a real way to contact WEN */
var SUPPORT_EMAIL="hello@thewomensentrepreneurialnetwork.com";
function mailtoHref(subject,body){return "mailto:"+SUPPORT_EMAIL+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);}
function supportStepLine(){var m=(route||"").match(/^#\/step\/([1-7])$/),m2=(route||"").match(/^#\/w2\/([1-6])$/);if(m)return "Week 1, step "+m[1]+": "+STEPS[+m[1]-1].t;if(m2)return "Week 2, step "+m2[1]+": "+STEPS2[+m2[1]-1].t;return "";}
function helpCard(){
 var stepLine=supportStepLine();
 return '<div class="card"><span class="ci" aria-hidden="true">'+ICO.chat+'</span><h2>Need help?</h2><p>We’re here to help you make progress with your Sales Lab sprint.</p>'
  +'<p>Have a question or something not working? Email us and include the step you’re working on. We aim to respond within two working days.</p>'
  +'<p><a class="btn" href="'+mailtoHref("Sales Lab help","Hi, I need help with the Sales Lab.\n\nThe step I'm working on: "+stepLine+"\nMy question or what isn't working: \n")+'">Email WEN support</a></p>'
  +'<p class="mute">Or write to '+SUPPORT_EMAIL+'.</p>'
  +(FLAGS.community===true?'<h3>Community questions and problems</h3><p>Billing, account and technical problems go to support by email, not the community. Email WEN support and we aim to reply within two working days. It helps if you include:</p><ul><li>the step you were on</li><li>what you expected to happen</li><li>what actually happened</li><li>a screenshot, if you can</li></ul>':'')
  +'</div>';
}
function noaccessHtml(){
 if(ENDED)return '<div class="card" style="max-width:520px;margin:24px auto"><h1>Your Sales Lab access has ended</h1><p>You’re signed in as <strong>'+esc(ME?ME.email:"")+'</strong>, but that membership no longer shows as active.</p><p>Your saved work has not been deleted. If you think this is a mistake, <a href="'+mailtoHref("Sales Lab access ended","Hi, my Sales Lab access has ended and I think it shouldn't have.\n\nThe email I signed in with: "+(ME?ME.email:"")+"\n")+'">email us at '+SUPPORT_EMAIL+'</a> and we’ll sort it out. We reply to access problems first.</p><p><button type="button" class="btn" data-a="signout">Sign out</button></p></div>';
 return noaccessFirstHtml();
}
function noaccessFirstHtml(){return '<div class="card" style="max-width:520px;margin:24px auto"><h1>We can’t find your membership</h1><p>You’re signed in as <strong>'+esc(ME?ME.email:"")+'</strong>, but that address isn’t on the Sales Lab access list.</p><p>Membership is checked against the email you purchased with. If you used a different address, sign out and try that one. If you think this is a mistake, <a href="'+mailtoHref("Sales Lab access problem","Hi, I can't get into the Sales Lab.\n\nThe email I signed in with: "+(ME?ME.email:"")+"\nThe email I bought with (if different): \n")+'">email us at '+SUPPORT_EMAIL+'</a> and we’ll sort it out. We reply to access problems first.</p><p><button type="button" class="btn" data-a="signout">Sign out</button></p></div>';}
function errorHtml(){return '<div class="card" style="max-width:520px;margin:24px auto"><h1>Something went wrong</h1><p>We couldn’t load your sprint. Your work is safe. Please try again.</p><p class="mute">'+esc(ERR)+'</p><p><button type="button" class="btn" data-a="retryload">Try again</button> <button type="button" class="btn ghost" data-a="signout">Sign out</button></p></div>';}
function loadingHtml(){return '<div class="card" style="max-width:420px;margin:40px auto;text-align:center"><p>Loading...</p></div>';}
async function sendCode(){
 var em=(AUTH.email||"").trim().toLowerCase();
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){AUTH.msg="Please enter a valid email address.";render();return;}
 AUTH.email=em;AUTH.busy=true;AUTH.msg="";render();
 var pc=await precheckEmail(em);
 if(pc==="no"||pc==="slow"||pc==="down"){
  AUTH.busy=false;
  AUTH.msg=pc==="no"?"We can’t find a Sales Lab membership for that email address. Please check it is the one you joined with, or email us at "+SUPPORT_EMAIL+" and we’ll help."
   :(pc==="slow"?"That’s a lot of tries in a row. Please wait a few minutes and try again.":"We can’t check your membership just now. Please try again in a few minutes, or email us at "+SUPPORT_EMAIL+".");
  render();return;
 }
 var r=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});
 AUTH.busy=false;
 if(r.error){AUTH.msg=friendly(r.error);}else{AUTH.step="code";AUTH.msg="Code sent. It can take a minute to arrive. Only the code in the newest email works, so please use that one.";startCool();}
 render();
}
function coolLeft(){try{var u=+localStorage.getItem("wsl_cool")||0;return Math.max(0,Math.ceil((u-Date.now())/1000));}catch(e){return 0;}}
function startCool(keep){if(!keep){try{localStorage.setItem("wsl_cool",String(Date.now()+60000));}catch(e){}}AUTH.cool=keep?coolLeft():60;clearInterval(AUTH.tm);AUTH.tm=setInterval(function(){AUTH.cool--;if(AUTH.cool<=0){AUTH.cool=0;clearInterval(AUTH.tm);}if(PHASE==="signin"){var b=document.querySelectorAll('[data-a=sendcode]');b.forEach(function(x){x.disabled=AUTH.cool>0;x.textContent=AUTH.cool>0?(AUTH.step==="email"?"Wait "+AUTH.cool+"s":"Resend in "+AUTH.cool+"s"):(AUTH.step==="email"?"Email me a code":"Send a new code");});}},1000);}
async function verifyCode(){
 var c=(AUTH.code||"").replace(/\D/g,"");if(c.length<6||c.length>10){AUTH.msg="Please enter the code from the email (6 to 10 digits).";render();return;}
 AUTH.busy=true;AUTH.msg="";render();
 var r=await sb.auth.verifyOtp({email:AUTH.email,token:c,type:"email"});
 AUTH.busy=false;
 if(r.error){AUTH.msg=friendly(r.error);render();return;}
 AUTH.code="";AUTH.pw="";
}
async function pwLogin(){
 AUTH.busy=true;AUTH.msg="";render();
 var r=await sb.auth.signInWithPassword({email:(AUTH.email||"").trim().toLowerCase(),password:AUTH.pw});
 AUTH.busy=false;
 if(r.error){AUTH.msg="That test sign-in didn’t work.";render();return;}
 AUTH.pw="";
}
async function signOut(){
 try{if(S&&changedKeys().length)await flush();}catch(e){}
 clearInterval(SYNC.poll);clearMirror();
 await sb.auth.signOut();
}
/* ---------- admin tools (M2 slice B). Shows access and save times only, never a member's work ---------- */
var ADMIN={members:null,flags:null,busy:false,err:""};
var FLAGLABEL={ai_drafts:"AI drafts",reminders:"Reminders",exports:"Download my data"};
function adminTop(){return '<div class="topbar"><span class="mute">Signed in as '+esc(ME?ME.email:"")+'</span><button type="button" class="btn ghost" data-a="signout">Sign out</button></div>'+(UI.toast?'<div id="toast" class="note info" role="status">'+esc(UI.toast)+'</div>':'');}
async function adminLoad(){
 ADMIN.busy=true;ADMIN.err="";
 var m=await sb.rpc("admin_list_members"),f=await sb.rpc("admin_list_flags"),hh=await sb.rpc("admin_health"),ao=await sb.rpc("admin_access_overview"),au=await sb.rpc("admin_list_entitlement_audit",{p_limit:30});
 await adminComLoad();
 ADMIN.busy=false;ADMIN.health=hh.error?null:hh.data;ADMIN.access=ao.error?null:ao.data;ADMIN.audit=au.error?null:au.data;
 if(m.error||f.error){ADMIN.err=(m.error||f.error).message||"error";ADMIN.members=[];ADMIN.flags=[];}
 else{ADMIN.members=m.data||[];ADMIN.flags=f.data||[];}
 renderSafe();
}
function adminHtml(){
 var h='';
 if(PHASE==="app")h+='<a class="back" href="#/">&larr; Home</a>';
 h+='<h1>Admin</h1><p class="mute">You can see who has access and when they last saved. You cannot see anyone\'s work here.</p>';
 if(ADMIN.err)h+='<div class="note bad" role="status">Couldn’t load the admin tools. '+esc(ADMIN.err)+'</div>';
 if(!ADMIN.members)return h+'<p class="mute">Loading...</p>';
 h+=adminHealthHtml();
 h+=adminAccessHtml();
 h+=adminCommunityCard();
 h+=adminModHtml();
 h+=adminDataHtml();
 h+=adminContentHtml();
 h+=adminAuditHtml();
 h+='<div class="card"><h2>Members</h2>';
 if(!ADMIN.members.length)h+='<p class="mute">No one is on the access list yet.</p>';
 h+=ADMIN.members.map(function(m){
  var when=m.last_saved?new Date(m.last_saved).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"never";
  return '<div class="crow"><span><strong>'+esc(m.email)+'</strong><br><span class="mute">'+(m.has_work?'Has saved work, last saved '+esc(when):'No saved work yet')+(m.note?' &middot; '+esc(m.note):'')+'</span></span>'
   +'<span class="row"><span class="pill '+(m.active?'ok':'warn')+'">'+(m.active?'Access on':'Access off')+'</span>'
   +'<button type="button" class="chip sm" data-a="adminent" data-email="'+esc(m.email)+'" data-on="'+(m.active?'0':'1')+'" aria-label="'+(m.active?'Turn access off for ':'Turn access on for ')+esc(m.email)+'">'+(m.active?'Turn off':'Turn on')+'</button></span></div>';
 }).join('');
 h+='<h3>Give someone access</h3><label for="adm-email">Email address</label><input id="adm-email" type="email" inputmode="email" autocomplete="off"><p><button type="button" class="btn" data-a="adminadd">Give access</button></p></div>';
 h+='<div class="card"><h2>Switches</h2><p class="mute">Switching something off takes effect the next time a member opens the Sales Lab.</p>';
 h+=(ADMIN.flags||[]).map(function(f){
  var nm=FLAGLABEL[f.key]||f.key;
  return '<div class="crow"><span><strong>'+esc(nm)+'</strong><br><span class="mute">'+esc(f.note||"")+'</span></span><span class="row"><span class="pill '+(f.enabled?'ok':'warn')+'">'+(f.enabled?'On':'Off')+'</span>'
   +'<button type="button" class="chip sm" data-a="adminflag" data-key="'+esc(f.key)+'" data-on="'+(f.enabled?'0':'1')+'" aria-label="'+(f.enabled?'Switch off ':'Switch on ')+esc(nm)+'">'+(f.enabled?'Switch off':'Switch on')+'</button></span></div>';
 }).join('');
 return h+'</div>';
}
async function adminComLoad(){
 var c=await Promise.all([sb.rpc("admin_community_counts"),sb.rpc("admin_community_held"),sb.rpc("admin_community_queue",{p_state:"open",p_limit:30}),sb.rpc("admin_community_restrictions"),sb.rpc("admin_community_log",{p_limit:15}),sb.rpc("admin_community_list_prompts"),sb.rpc("admin_community_list_events"),sb.rpc("admin_community_hotseat",{p_state:null})]);
 var dd0=await sb.rpc("admin_community_data");ADMIN.cdata=dd0.error?null:dd0.data;
 ADMIN.com=c.some(function(x){return x.error;})?null:{counts:c[0].data,held:c[1].data,reports:c[2].data,restr:c[3].data,log:c[4].data,prompts:c[5].data,events:c[6].data,hotseat:c[7].data};
}
function adminContentHtml(){
 var C=ADMIN.com;if(!C)return "";
 var EP=ADMIN.editPrompt||{},EE=ADMIN.editEvent||{};
 var monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));var mondayStr=monday.getFullYear()+"-"+pad(monday.getMonth()+1)+"-"+pad(monday.getDate());
 var h='<div class="card"><h2>Weekly accountability prompt</h2><p class="mute">You write it and publish it. Nothing publishes by itself. Members see the latest published prompt whose week has started, pinned at the top of the community.</p>';
 h+='<label for="ap-week">Week starting (Monday)</label><input id="ap-week" type="date" value="'+esc(EP.week_start||mondayStr)+'"><label for="ap-title">Title</label><input id="ap-title" type="text" maxlength="120" value="'+esc(EP.title||"")+'"><label for="ap-body">Prompt</label><textarea id="ap-body" class="com" maxlength="2000" style="min-height:100px">'+esc(EP.body||"")+'</textarea>';
 h+='<label class="row" style="margin-top:8px;gap:8px"><input id="ap-pub" type="checkbox"'+(EP.published?' checked':'')+'> <span>Publish to members</span></label><p class="row"><button type="button" class="btn" data-a="ac-saveprompt">Save prompt</button>'+(ADMIN.editPrompt?'<button type="button" class="btn ghost" data-a="ac-clearprompt">New prompt</button>':'')+'</p>';
 h+=C.prompts.length?C.prompts.map(function(x){return '<div class="crow"><span><strong>'+esc(x.title)+'</strong><br><span class="mute">Week of '+esc(x.week_start)+' &middot; '+(x.published?'Published':'Draft')+'</span></span><span class="row"><button type="button" class="chip sm" data-a="ac-editprompt" data-id="'+x.id+'">Edit</button><button type="button" class="chip sm" data-a="ac-delprompt" data-id="'+x.id+'">Delete</button></span></div>';}).join(""):'<p class="mute">No prompts yet.</p>';
 h+='</div>';
 h+='<div class="card"><h2>Coaching sessions and announcements</h2><p class="mute">Joining details show to members once you publish. A replay link needs the member’s consent ticked.</p>';
 h+='<label for="ae-kind">Type</label><select id="ae-kind"><option value="session"'+(EE.kind==="announcement"?'':' selected')+'>Coaching session</option><option value="announcement"'+(EE.kind==="announcement"?' selected':'')+'>Announcement</option></select>';
 h+='<label for="ae-title">Title</label><input id="ae-title" type="text" maxlength="120" value="'+esc(EE.title||"")+'"><label for="ae-body">Details (optional)</label><textarea id="ae-body" class="com" maxlength="3000" style="min-height:90px">'+esc(EE.body||"")+'</textarea>';
 h+='<label for="ae-start">Date and time (sessions)</label><input id="ae-start" type="datetime-local" value="'+esc(EE.starts_local||"")+'"><label for="ae-join">How to join (sessions)</label><input id="ae-join" type="text" maxlength="500" value="'+esc(EE.join_info||"")+'">';
 h+='<label for="ae-replay">Replay link (https only, optional)</label><input id="ae-replay" type="text" maxlength="500" value="'+esc(EE.replay_url||"")+'"><label class="row" style="margin-top:8px;gap:8px"><input id="ae-consent" type="checkbox"'+(EE.replay_consent?' checked':'')+'> <span>I have the hot-seat member’s consent to share this replay</span></label>';
 h+='<label class="row" style="margin-top:8px;gap:8px"><input id="ae-pub" type="checkbox"'+(EE.published?' checked':'')+'> <span>Publish to members</span></label><p class="row"><button type="button" class="btn" data-a="ac-saveevent">Save</button>'+(ADMIN.editEvent?'<button type="button" class="btn ghost" data-a="ac-clearevent">New item</button>':'')+'</p>';
 h+=C.events.length?C.events.map(function(x){return '<div class="crow"><span><strong>'+esc(x.title)+'</strong><br><span class="mute">'+(x.kind==="session"?'Session':'Announcement')+(x.starts_at?' &middot; '+esc(comWhen(x.starts_at)):'')+' &middot; '+(x.published?'Published':'Draft')+(x.replay_url?' &middot; replay'+(x.replay_consent?' (consent)':' (NO consent)'):'')+'</span></span><span class="row"><button type="button" class="chip sm" data-a="ac-editevent" data-id="'+x.id+'">Edit</button><button type="button" class="chip sm" data-a="ac-delevent" data-id="'+x.id+'">Delete</button></span></div>';}).join(""):'<p class="mute">Nothing yet.</p>';
 h+='</div>';
 var HS=C.hotseat||[],cnt={aw:0,re:0,ap:0,ov:0};HS.forEach(function(x){if(x.stage==="awaiting")cnt.aw++;if(x.stage==="responded")cnt.re++;if(x.review==="approaching")cnt.ap++;if(x.review==="overdue")cnt.ov++;});
 h+='<div class="card"><h2>Hot-seat questions (private)</h2><p class="mute">Only administrators can read these. Members see their own. Questions are never deleted just because they are old: unresolved ones are flagged from 150 days and again from 180 days. The 90 day deletion period (when approved) starts only when you mark a question resolved.</p>';
 h+='<p class="mute"><strong>'+cnt.aw+'</strong> awaiting a first response &middot; <strong>'+cnt.re+'</strong> responded but not resolved &middot; <strong>'+cnt.ap+'</strong> approaching 180 days &middot; <strong>'+cnt.ov+'</strong> past 180 days</p>';
 var STAGE={awaiting:["Awaiting first response","warn"],responded:["Responded, not resolved","info"],resolved:["Resolved","ok"]};
 h+=HS.length?HS.map(function(x){
  var sg=STAGE[x.stage]||STAGE.awaiting,rv=x.review==="overdue"?'<span class="pill warn">Past 180 days: needs a decision</span> ':(x.review==="approaching"?'<span class="pill warn">Approaching 180 days</span> ':"");
  var btns=x.stage==="awaiting"?[["seen","Mark responded"],["done","Mark resolved"]]:(x.stage==="responded"?[["done","Mark resolved"],["new","Move back to awaiting"]]:[["seen","Reopen"]]);
  return '<div class="crow" style="display:block"><p>'+esc(x.question)+'</p><p class="cmeta"><span class="pill '+sg[1]+'">'+esc(sg[0])+'</span> '+rv+esc(x.name||"")+' &middot; '+esc(x.email||"")+' &middot; sent '+esc(comWhen(x.created_at))+' ('+x.age_days+' day'+(x.age_days===1?'':'s')+' ago) &middot; '+(x.consent_replay?'replay OK':'no replay consent')+(x.stage==="resolved"?' &middot; resolved '+esc(comWhen(x.resolved_at))+(x.resolved_by?' by '+esc(x.resolved_by):''):'')+'</p><p class="row">'+btns.map(function(b){return '<button type="button" class="chip sm" data-a="ac-hs" data-id="'+x.id+'" data-state="'+b[0]+'">'+b[1]+'</button>';}).join("")+'</p></div>';
 }).join(""):'<p class="mute">No questions yet.</p>';
 return h+'</div>';
}
function adminDataHtml(){
 var D=ADMIN.cdata;if(!D)return '<div class="card"><h2>Community data</h2><div class="note warn" role="status">Couldn’t load the community data tools.</div></div>';
 var h='<div class="card"><h2>Community data</h2><p class="mute">Backups, restore, member data requests and retention. Nothing here runs by itself except the nightly backup. Photograph files are not in the backup: members re-upload their photo after a restore.</p>';
 h+='<h3>Community backups</h3>';
 h+=D.backups.length?D.backups.map(function(b){var c=b.counts||{};return '<div class="crow"><span><strong>#'+b.id+'</strong> '+esc(b.kind)+'<br><span class="mute">'+esc(comWhen(b.taken_at))+' &middot; '+(c.posts||0)+' posts, '+(c.replies||0)+' replies, '+(c.profiles||0)+' profiles</span></span></div>';}).join(""):'<p class="mute">No community backup yet. The first one runs at 03:10 UTC.</p>';
 h+='<p><button type="button" class="btn ghost" data-a="ac-cbackup">Take a backup now</button></p>';
 h+='<label for="ac-rid">Restore from backup number</label><input id="ac-rid" type="number" min="1" inputmode="numeric" placeholder="For example '+(D.backups.length?D.backups[0].id:'1')+'">';
 h+='<label for="ac-rmode">Restore type</label><select id="ac-rmode"><option value="missing">Add back anything missing (safest, keeps newer posts)</option><option value="full">Full rebuild (replaces everything with that backup)</option></select>';
 h+='<label for="ac-rconfirm">Type RESTORE COMMUNITY to confirm</label><input id="ac-rconfirm" type="text" autocomplete="off"><p class="mute">A safety backup is taken first. Deleted posts and erased members never come back.</p><p><button type="button" class="btn ghost" data-a="ac-restore">Restore</button></p>';
 h+='<h3>Leftover photo files</h3><p class="mute">'+D.orphans.length+' file'+(D.orphans.length===1?'':'s')+' that no profile points to.</p>'+(D.orphans.length?'<p><button type="button" class="btn ghost" data-a="ac-orphans">Delete leftover photo files</button></p>':'');
 h+='<h3>Member data requests</h3><label for="ac-exemail">Download a member’s community data (for a data request)</label><input id="ac-exemail" type="email" autocomplete="off" placeholder="Their email address"><p><button type="button" class="btn ghost" data-a="ac-export">Download their data</button></p>';
 h+='<label for="ac-dmemail">Delete a lapsed member’s community data</label><input id="ac-dmemail" type="email" autocomplete="off" placeholder="Their email address (access must have ended)"><label for="ac-dmconfirm">Type DELETE MEMBER COMMUNITY DATA to confirm</label><input id="ac-dmconfirm" type="text" autocomplete="off"><p class="mute">This cannot be undone. Their posts that others replied to stay as empty “post deleted” notes.</p><p><button type="button" class="btn ghost" data-a="ac-delmember">Delete their community data</button></p>';
 h+='<h3>Reports under a legal hold</h3><p class="mute">Saved report text is normally deleted. Keep a copy only if it is genuinely needed for an unresolved investigation, a legal obligation or a legal claim. Give a reason and a review date. Holds are visible to administrators only and flagged in the Health check when due.</p>';
 h+=(D.holds||[]).length?D.holds.map(function(x){return '<div class="crow"><span><strong>Report #'+x.id+'</strong><br><span class="mute">'+esc(x.reason||"")+' &middot; review by '+esc(x.review_by||"")+'</span></span><button type="button" class="chip sm" data-a="ac-release" data-id="'+x.id+'">Release hold</button></div>';}).join(""):'<p class="mute">No holds.</p>';
 h+='<label for="ac-holdid">Report number</label><input id="ac-holdid" type="number" min="1" inputmode="numeric"><label for="ac-holdwhy">Reason</label><input id="ac-holdwhy" type="text" maxlength="200"><label for="ac-holddate">Review by</label><input id="ac-holddate" type="date"><p><button type="button" class="btn ghost" data-a="ac-hold">Place hold</button></p>';
 var R=D.retention||{rules:[],would_affect_now:{}};
 h+='<h3>Retention rules (proposed, waiting for approval)</h3><p class="mute">No rule is approved until you approve it, and nothing is deleted automatically. “Would affect now” shows what a run would change today.</p>';
 h+=R.rules.map(function(x){var n=(R.would_affect_now||{})[x.key]||0;return '<div class="crow" style="display:block"><p><strong>'+esc(x.what)+'</strong></p><p class="mute">'+x.days+' days &middot; would affect now: '+n+' &middot; '+(x.approved?'<span class="pill ok">Approved</span>':'<span class="pill warn">Not approved</span>')+'</p>'+(x.note?'<p class="mute">'+esc(x.note)+'</p>':'')+'<p><button type="button" class="chip sm" data-a="ac-approve" data-key="'+esc(x.key)+'" data-on="'+(x.approved?'0':'1')+'">'+(x.approved?'Withdraw approval':'Approve this rule')+'</button></p></div>';}).join("");
 var any=R.rules.some(function(x){return x.approved;});
 h+='<label for="ac-retconfirm">Type RUN COMMUNITY RETENTION to run the approved rules now</label><input id="ac-retconfirm" type="text" autocomplete="off"><p><button type="button" class="btn ghost" data-a="ac-retrun"'+(any?'':' disabled')+'>Run approved rules</button></p>';
 return h+'</div>';
}
function adminRestrictPanel(){
 var h="",D=ADMIN.rdraft,L=ADMIN.liftDraft;
 if(D){
  var pv=D.pv,kind=pv.item_kind==="reply"?"reply":"post";
  if(pv.blocked){h+='<div class="note warn" role="alert"><p><strong>Cannot restrict.</strong> '+esc(COMERR[pv.blocked]||"This member cannot be restricted.")+'</p><p><button type="button" class="btn ghost" data-a="ac-rcancel">Close</button></p></div>';}
  else if(pv.already_restricted){h+='<div class="note warn" role="alert"><p><strong>'+esc(pv.display_name||"This member")+'</strong> is already restricted.</p><p><button type="button" class="btn ghost" data-a="ac-rcancel">Close</button></p></div>';}
  else{
   h+='<div class="note bad" role="alertdialog" aria-label="Confirm restriction"><p><strong>Restrict '+esc(pv.display_name)+'?</strong></p>';
   h+=pv.via_report?'<p>You are restricting <strong>'+esc(pv.display_name)+'</strong>, the person who <strong>wrote</strong> the reported '+kind+' &ldquo;'+esc(pv.item_title||"")+'&rdquo;. This is <strong>not</strong> the person who sent the report.</p>':'<p>You are restricting <strong>'+esc(pv.display_name)+'</strong>, the person who wrote this '+kind+': &ldquo;'+esc(pv.item_title||"")+'&rdquo;.</p>';
   h+='<p>They will be able to read and report, but not post or reply. You can lift this later.</p><label for="ac-rwhy">Reason for the restriction (5 to 200 characters, private to administrators)</label><input id="ac-rwhy" type="text" maxlength="200" autocomplete="off" aria-describedby="ac-rerr">'+(D.err?'<p class="note bad" id="ac-rerr" role="alert">'+esc(D.err)+'</p>':'')+'<p class="row"><button type="button" class="btn" data-a="ac-rconfirm2">Yes, restrict '+esc(pv.display_name)+'</button><button type="button" class="btn ghost" data-a="ac-rcancel">Cancel</button></p></div>';
  }
 }
 if(L){h+='<div class="note warn" role="alertdialog" aria-label="Confirm lifting a restriction"><p><strong>Lift the restriction on '+esc(L.name)+'?</strong></p><p>They will be able to post and reply again.</p><label for="ac-lwhy">Reason for lifting (5 to 200 characters)</label><input id="ac-lwhy" type="text" maxlength="200" autocomplete="off" aria-describedby="ac-lerr">'+(L.err?'<p class="note bad" id="ac-lerr" role="alert">'+esc(L.err)+'</p>':'')+'<p class="row"><button type="button" class="btn" data-a="ac-lconfirm">Yes, lift it</button><button type="button" class="btn ghost" data-a="ac-lcancel">Cancel</button></p></div>';}
 return h;
}
function adminModHtml(){
 var C=ADMIN.com;if(!C)return '<div class="card"><h2>Community moderation</h2><div class="note warn" role="status">Couldn’t load the moderation tools.</div></div>';
 var h='<div class="card"><h2>Community moderation</h2><p class="mute">'+C.counts.open_reports+' open report'+(C.counts.open_reports===1?'':'s')+' &middot; '+C.counts.held+' waiting for approval &middot; '+C.counts.restricted+' restricted &middot; '+(C.counts.hotseat_new||0)+' new hot-seat question'+((C.counts.hotseat_new||0)===1?'':'s')+'. Reports never hide anything by themselves.</p>';
 h+=adminRestrictPanel();
 h+='<h3>Waiting for approval (links from new members, and any risky link)</h3>';
 h+=C.held.length?C.held.map(function(x){return '<div class="crow" style="display:block"><p><strong>'+esc(x.title||"Reply")+'</strong> &middot; '+esc(x.author||"")+' &middot; '+esc(comWhen(x.created_at))+((x.link_flags&&x.link_flags.length)?' &middot; <span class="pill warn">'+esc(x.link_flags.join(", ").replace(/_/g," "))+'</span>':'')+'</p><p class="com-body">'+comLink(x.body)+'</p><p class="row"><button type="button" class="chip sm" data-a="ac-mod" data-t="'+x.type+'" data-id="'+x.id+'" data-act="approve">Approve</button><button type="button" class="chip sm" data-a="ac-mod" data-t="'+x.type+'" data-id="'+x.id+'" data-act="hide">Hide</button><button type="button" class="chip sm" data-a="ac-mod" data-t="'+x.type+'" data-id="'+x.id+'" data-act="remove">Remove</button><button type="button" class="chip sm" data-a="ac-rpreview" data-src="'+x.type+'" data-id="'+x.id+'">Restrict this member</button><a class="chip sm" href="#/community/post/'+x.post_id+'">Open</a></p></div>';}).join(""):'<p class="mute">Nothing waiting.</p>';
 h+='<h3>Open reports</h3>';
 h+=C.reports.length?C.reports.map(function(x){return '<div class="crow" style="display:block"><p><strong>'+esc(x.target_type==="post"?"Post":"Reply")+'</strong> by '+esc(x.author||"")+' &middot; reported by '+esc(x.reporter||"")+' &middot; '+esc(comWhen(x.created_at))+' &middot; now '+esc(x.current_status||"gone")+'</p>'+(x.reason?'<p>“'+esc(x.reason)+'”</p>':'')+'<p class="mute com-body">'+esc(x.snapshot)+'</p><p class="row"><button type="button" class="chip sm" data-a="ac-resolve" data-id="'+x.id+'" data-act="keep">Keep</button><button type="button" class="chip sm" data-a="ac-resolve" data-id="'+x.id+'" data-act="hide">Hide</button><button type="button" class="chip sm" data-a="ac-resolve" data-id="'+x.id+'" data-act="remove">Remove</button><button type="button" class="chip sm" data-a="ac-rpreview" data-src="report" data-id="'+x.id+'">Restrict the reported member</button><a class="chip sm" href="#/community/post/'+x.post_id+'">Open</a></p></div>';}).join(""):'<p class="mute">No open reports.</p>';
 h+='<h3>Restricted members</h3>';
 h+=C.restr.length?C.restr.map(function(x){return '<div class="crow"><span><strong>'+esc(x.name||"No community name")+'</strong><br><span class="mute">'+esc(x.email)+(x.reason?' &middot; '+esc(x.reason):'')+'<br>Restricted '+esc(comWhen(x.restricted_at))+(x.set_by?' by '+esc(x.set_by):'')+'</span></span><button type="button" class="chip sm" data-a="ac-liftopen" data-ref="'+esc(x.ref)+'" data-name="'+esc(x.name||"this member")+'">Lift restriction</button></div>';}).join(""):'<p class="mute">No one is restricted.</p>';
 h+='<label for="ac-email">Restrict a member (they can read and report but not post)</label><input id="ac-email" type="email" autocomplete="off" placeholder="Their email address"><label for="ac-why">Reason (private)</label><input id="ac-why" type="text" maxlength="200"><p><button type="button" class="btn ghost" data-a="ac-restrict">Restrict</button></p>';
 h+='<label for="ac-pemail">Remove a member’s photo (if it breaks the guidelines)</label><input id="ac-pemail" type="email" autocomplete="off" placeholder="Their email address"><p><button type="button" class="btn ghost" data-a="ac-rmphoto">Remove their photo</button></p>';
 h+='<h3>Recent moderation actions</h3>';
 h+=C.log.length?C.log.map(function(x){return '<div class="crow"><span><strong>'+esc(x.action)+'</strong> '+esc(x.target_type||"")+(x.target_id?' #'+x.target_id:'')+(x.member?' &middot; '+esc(x.member):'')+'<br><span class="mute">'+esc(comWhen(x.at))+(x.note?' &middot; '+esc(x.note):'')+'</span></span></div>';}).join(""):'<p class="mute">Nothing yet.</p>';
 return h+'</div>';
}
async function adminComAct(a,d){
 var r;
 if(a==="ac-saveprompt"){r=await comCall("admin_community_save_prompt",{p_week:document.getElementById("ap-week").value,p_title:document.getElementById("ap-title").value,p_body:document.getElementById("ap-body").value,p_publish:!!document.getElementById("ap-pub").checked});if(!(r&&r.err))ADMIN.editPrompt=null;}
 else if(a==="ac-editprompt"){ADMIN.editPrompt=(ADMIN.com.prompts||[]).filter(function(x){return x.id===+d.id;})[0]||null;renderSafe();return;}
 else if(a==="ac-clearprompt"){ADMIN.editPrompt=null;renderSafe();return;}
 else if(a==="ac-delprompt"){if(!confirm("Delete this prompt?"))return;r=await comCall("admin_community_delete_prompt",{p_id:+d.id});}
 else if(a==="ac-saveevent"){
  var st=document.getElementById("ae-start").value,iso=st?new Date(st).toISOString():null;
  r=await comCall("admin_community_save_event",{p_id:ADMIN.editEvent?ADMIN.editEvent.id:null,p_kind:document.getElementById("ae-kind").value,p_title:document.getElementById("ae-title").value,p_body:document.getElementById("ae-body").value,p_starts:iso,p_join_info:document.getElementById("ae-join").value,p_replay_url:document.getElementById("ae-replay").value,p_replay_consent:!!document.getElementById("ae-consent").checked,p_publish:!!document.getElementById("ae-pub").checked});
  if(!(r&&r.err))ADMIN.editEvent=null;
 }
 else if(a==="ac-editevent"){var ee=(ADMIN.com.events||[]).filter(function(x){return x.id===+d.id;})[0];if(ee){ee=Object.assign({},ee);if(ee.starts_at){var dd=new Date(ee.starts_at);ee.starts_local=dd.getFullYear()+"-"+pad(dd.getMonth()+1)+"-"+pad(dd.getDate())+"T"+pad(dd.getHours())+":"+pad(dd.getMinutes());}}ADMIN.editEvent=ee||null;renderSafe();return;}
 else if(a==="ac-clearevent"){ADMIN.editEvent=null;renderSafe();return;}
 else if(a==="ac-delevent"){if(!confirm("Delete this item?"))return;r=await comCall("admin_community_delete_event",{p_id:+d.id});}
 else if(a==="ac-hs"){if(d.state==="done"&&!window.confirm("Mark this question as resolved? This is recorded with your name and the time, and starts the 90 day period before it can be deleted (once that rule is approved)."))return;r=await comCall("admin_community_hotseat_set",{p_id:+d.id,p_state:d.state});}
 if(a==="ac-mod")r=await comCall("admin_community_moderate",{p_type:d.t,p_id:+d.id,p_action:d.act,p_note:null});
 else if(a==="ac-resolve")r=await comCall("admin_community_resolve_report",{p_report_id:+d.id,p_action:d.act,p_note:null});
 else if(a==="ac-restrict"){var em=(document.getElementById("ac-email").value||"").trim();if(!em){toast("Please type an email address first.");return;}r=await comCall("admin_community_restrict",{p_email:em,p_restricted:true,p_reason:(document.getElementById("ac-why").value||"")});}
 else if(a==="ac-rmphoto"){var pe=(document.getElementById("ac-pemail").value||"").trim();if(!pe){toast("Please type an email address first.");return;}r=await comCall("admin_community_remove_photo",{p_email:pe});if(r&&r.data&&r.data.path){try{await sb.storage.from("community-photos").remove([r.data.path]);}catch(e){}}}
 else if(a==="ac-rpreview"){
  var pr=await comCall("admin_community_restrict_preview",{p_source:d.src,p_id:+d.id});
  if(pr.err){toast(pr.err);return;}
  ADMIN.liftDraft=null;ADMIN.rdraft={src:d.src,id:+d.id,pv:pr.data};renderSafe();return;
 }
 else if(a==="ac-rcancel"){ADMIN.rdraft=null;renderSafe();return;}
 else if(a==="ac-rconfirm2"){
  var D2=ADMIN.rdraft;if(!D2)return;var why=(document.getElementById("ac-rwhy").value||"").trim();
  if(why.length<5||why.length>200){D2.err=COMERR.reason_required;render();var re1=document.getElementById("ac-rwhy");if(re1)re1.focus();return;}
  D2.err="";
  r=await comCall("admin_community_restrict_item",{p_source:D2.src,p_id:D2.id,p_expected_name:D2.pv.display_name,p_reason:why});
  if(r&&r.err){D2.err=r.err;render();return;}
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  ADMIN.rdraft=null;
 }
 else if(a==="ac-liftopen"){ADMIN.rdraft=null;ADMIN.liftDraft={ref:d.ref,name:d.name};renderSafe();return;}
 else if(a==="ac-lcancel"){ADMIN.liftDraft=null;renderSafe();return;}
 else if(a==="ac-lconfirm"){
  var L2=ADMIN.liftDraft;if(!L2)return;var lw=(document.getElementById("ac-lwhy").value||"").trim();
  if(lw.length<5||lw.length>200){L2.err=COMERR.reason_required;render();var re2=document.getElementById("ac-lwhy");if(re2)re2.focus();return;}
  L2.err="";
  r=await comCall("admin_community_lift_restriction",{p_ref:L2.ref,p_reason:lw});
  if(r&&r.err){L2.err=r.err;render();return;}
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  ADMIN.liftDraft=null;
 }
 else if(a==="ac-hold"){
  var hid=+(document.getElementById("ac-holdid").value||0),hw=(document.getElementById("ac-holdwhy").value||"").trim(),hd=document.getElementById("ac-holddate").value||null;
  if(!hid){toast("Please type a report number.");return;}
  r=await comCall("admin_community_set_report_hold",{p_id:hid,p_hold:true,p_reason:hw,p_review_by:hd});
 }
 else if(a==="ac-release"){if(!window.confirm("Release this hold? The saved text becomes eligible for deletion under the normal rules."))return;r=await comCall("admin_community_set_report_hold",{p_id:+d.id,p_hold:false,p_reason:null,p_review_by:null});}
 else if(a==="ac-cbackup"){r=await comCall("admin_community_backup_now");}
 else if(a==="ac-restore"){
  var rid=+(document.getElementById("ac-rid").value||0),rm=document.getElementById("ac-rmode").value,rc=(document.getElementById("ac-rconfirm").value||"").trim();
  if(!rid){toast("Please type a backup number.");return;}
  if(!window.confirm("Restore the community from backup #"+rid+" ("+(rm==="full"?"full rebuild":"add back missing")+")? A safety backup is taken first."))return;
  r=await comCall("admin_community_restore",{p_run:rid,p_mode:rm,p_confirm:rc});
 }
 else if(a==="ac-orphans"){
  var orp=(ADMIN.cdata&&ADMIN.cdata.orphans)||[];if(!orp.length){toast("No leftover files.");return;}
  if(!window.confirm("Delete "+orp.length+" leftover photo file(s)? This cannot be undone."))return;
  var ro=await sb.storage.from("community-photos").remove(orp);r=ro.error?{err:"Couldn’t remove the files. Please try again."}:{data:1};
 }
 else if(a==="ac-export"){
  var xe=(document.getElementById("ac-exemail").value||"").trim();if(!xe){toast("Please type an email address first.");return;}
  var rx=await comCall("admin_community_export_member",{p_email:xe});
  if(rx.err){toast(rx.err);return;}
  comDownload("community-data-export.json",rx.data);toast("Downloaded.");await adminComLoad();renderSafe();return;
 }
 else if(a==="ac-delmember"){
  var dm=(document.getElementById("ac-dmemail").value||"").trim(),dc=(document.getElementById("ac-dmconfirm").value||"").trim();
  if(!dm){toast("Please type an email address first.");return;}
  if(!window.confirm("Permanently delete the community data of "+dm+"? This cannot be undone."))return;
  r=await comCall("admin_community_delete_member",{p_email:dm,p_confirm:dc});
  if(r&&r.data&&r.data.photo_path){try{await sb.storage.from("community-photos").remove([r.data.photo_path]);}catch(e){}}
 }
 else if(a==="ac-approve"){
  var on=d.on==="1";if(!window.confirm(on?"Approve this retention rule? When it is run, matching data will be permanently deleted or anonymised.":"Withdraw approval for this rule?"))return;
  r=await comCall("admin_community_set_retention",{p_key:d.key,p_days:null,p_approved:on});
 }
 else if(a==="ac-retrun"){
  var tc=(document.getElementById("ac-retconfirm").value||"").trim();
  if(!window.confirm("Run all approved retention rules now? Matching data will be permanently deleted or anonymised."))return;
  r=await comCall("admin_community_retention_run",{p_confirm:tc});
  if(r&&r.data&&r.data.photo_paths&&r.data.photo_paths.length){try{await sb.storage.from("community-photos").remove(r.data.photo_paths);}catch(e){}}
 }
 else if(a==="ac-unrestrict")r=await comCall("admin_community_restrict",{p_email:d.email,p_restricted:false,p_reason:null});
 if(r&&r.err)toast(r.err);else toast("Done.");
 await adminComLoad();renderSafe();
}
function adminCommunityCard(){
 var fl=(ADMIN.flags||[]).filter(function(f){return f.key==="community";})[0];
 return '<div class="card"><h2>Community</h2><p class="mute">The community is '+(fl&&fl.enabled?'<strong>on</strong>':'<strong>off</strong>')+' for members (see Switches below). You can open it here as WEN staff to read, moderate and post.</p><p><a class="btn" href="#/community">Open the community as WEN staff</a></p></div>';
}
function adminAccessHtml(){
 var A=ADMIN.access,h='<div class="card"><h2>Access checks</h2>';
 if(!A)return h+'<div class="note warn" role="status">Couldn’t load the access summary.</div></div>';
 var when=A.last_check?new Date(A.last_check).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"never";
 h+='<p class="mute">Added by you: '+(A.manual_active||0)+' with access. From Simvoly: '+(A.simvoly_active||0)+' with access, '+(A.simvoly_ended||0)+' ended.<br>Last check: '+esc(when)+'. Checks in the last day: '+(A.checks_last_day||0)+'.</p>';
 if(A.simvoly_stale>0)h+='<div class="note warn" role="status"><strong>Worth a look: </strong>'+A.simvoly_stale+' Simvoly member(s) have not been re-checked for over 3 days.</div>';
 if(A.simvoly_errors>0)h+='<div class="note warn" role="status"><strong>Worth a look: </strong>'+A.simvoly_errors+' Simvoly check(s) could not be completed. Access was left as it was.</div>';
 h+='<h3>Check one address with Simvoly</h3><p class="mute">Needs the Simvoly address and key to be saved, but does NOT switch live checking on and changes nothing. Shows the shape of Simvoly’s answer (field names and group numbers), never names or addresses.</p><label for="adm-probe">Email address</label><input id="adm-probe" type="email" autocomplete="off"><p><button type="button" class="btn ghost" data-a="adminprobe">Check this address</button></p>'+(ADMIN.probe?'<pre class="mute" style="white-space:pre-wrap">'+esc(ADMIN.probe)+'</pre>':'');
 h+='<p><button type="button" class="btn ghost" data-a="adminsweep"'+(ADMIN.sweeping?" disabled":"")+'>'+(ADMIN.sweeping?"Checking...":"Re-check Simvoly access now")+'</button></p></div>';
 return h;
}
var AUDITLABEL={granted:"Access given",switched_on:"Access switched on",switched_off:"Access switched off",added_off:"Added with access off",removed_entry:"Entry removed",baseline:"Starting point"};
function adminAuditHtml(){
 var A=ADMIN.audit,h='<div class="card"><h2>Access history</h2><p class="mute">Every time access is given or taken away, by you or by the Simvoly check. Latest 30.</p>';
 if(!A)return h+'<div class="note warn" role="status">Couldn’t load the access history.</div></div>';
 if(!A.length)return h+'<p class="mute">Nothing recorded yet.</p></div>';
 return h+A.map(function(x){
  var when=new Date(x.at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  var by=x.actor==="simvoly-check"?"Simvoly check":(x.actor==="baseline"?"existing entry":(x.actor==="database"?"database":x.actor));
  return '<div class="crow"><span><strong>'+esc(x.email)+'</strong><br><span class="mute">'+esc(AUDITLABEL[x.action]||x.action)+' &middot; '+esc(x.source||"")+' &middot; by '+esc(by)+' &middot; '+esc(when)+'</span></span></div>';
 }).join('')+'</div>';
}
async function adminProbe(){
 var el=document.getElementById("adm-probe"),em=el?el.value.trim():"";
 if(!em){toast("Please type an email address first.");return;}
 var r=await accessCall({action:"probe",email:em});
 ADMIN.probe=(r.s===200&&r.j)?JSON.stringify(r.j,null,1):"Couldn’t run the check (status "+r.s+"). Nothing was changed.";
 render();
}
async function adminSweep(){
 ADMIN.sweeping=true;render();
 var r=await accessCall({action:"sweep",hours:1});
 ADMIN.sweeping=false;
 if(r.s===200&&r.j)toast(r.j.note?r.j.note+".":"Checked "+r.j.checked+", ended "+r.j.ended+", could not check "+r.j.errors+".");
 else toast("Couldn’t run the check. Nothing was changed.");
 adminLoad();
}
function adminHealthHtml(){
 var H=ADMIN.health,h='<div class="card"><h2>Health check</h2>';
 if(!H)return h+'<div class="note warn" role="status">Couldn’t run the health check.</div></div>';
 var al=H.alerts||[];
 if(!al.length)h+='<div class="note ok" role="status"><strong>Everything looks fine.</strong></div>';
 else h+=al.map(function(a){return '<div class="note '+(a.level==="bad"?"bad":(a.level==="warn"?"warn":"info"))+'" role="status"><strong>'+(a.level==="bad"?"Needs attention: ":(a.level==="warn"?"Worth a look: ":"Note: "))+'</strong>'+esc(a.text)+'</div>';}).join("");
 var b=H.backups||{},m=H.members||{},r=H.reminders_last_7_days||{};
 var when=b.last_scheduled_at?new Date(b.last_scheduled_at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"none yet";
 var cm=H.community||{},cwhen=cm.last_backup_at?new Date(cm.last_backup_at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"none yet";
 h+='<p class="mute">Last nightly backup: '+esc(when)+'.<br>People with access: '+(m.access_on||0)+'. People with saved work: '+(m.with_saved_work||0)+'.<br>Reminder emails in the last 7 days: '+(r.sent||0)+' sent, '+(r.dry_run||0)+' trial runs, '+(r.failed||0)+' failed.<br>Community: last backup '+esc(cwhen)+'. Leftover photo files: '+(cm.leftover_photo_files||0)+'. Retention rules waiting for approval: '+(cm.retention_rules_not_approved||0)+'.'+(H.hotseat?'<br>Hot-seat questions: '+H.hotseat.awaiting_first_response+' awaiting a first response, '+H.hotseat.responded_not_resolved+' responded but not resolved, '+H.hotseat.approaching_180_days+' approaching 180 days, '+H.hotseat.past_180_days+' past 180 days.':'')+'</p></div>';
 return h;
}
async function adminSetAccess(email,on){
 if(!window.confirm(on?("Give "+email+" access to the Sales Lab?"):("Turn off access for "+email+"? They won’t be able to open the Sales Lab until you turn it back on. Their saved work is kept.")))return;
 var r=await sb.rpc("admin_set_entitlement",{p_email:email,p_active:on,p_note:null});
 if(r.error){toast("That didn’t work. Nothing was changed.");render();return;}
 toast(on?("Access turned on for "+email+"."):("Access turned off for "+email+"."));await adminLoad();
}
async function adminAddMember(){
 var el=document.getElementById("adm-email"),em=el?el.value.trim().toLowerCase():"";
 if(!em||em.indexOf("@")<1||em.indexOf(" ")>-1){toast("Please enter a full email address.");render();return;}
 if(!window.confirm("Give "+em+" access to the Sales Lab?"))return;
 var r=await sb.rpc("admin_set_entitlement",{p_email:em,p_active:true,p_note:"Added by admin"});
 if(r.error){toast("That didn’t work. Nothing was changed.");render();return;}
 toast("Access given to "+em+".");await adminLoad();
}
async function adminSetFlag(key,on){
 var nm=FLAGLABEL[key]||key;
 if(!window.confirm((on?"Switch on ":"Switch off ")+nm+"?"))return;
 var r=await sb.rpc("admin_set_flag",{p_key:key,p_enabled:on});
 if(r.error){toast("That didn’t work. Nothing was changed.");render();return;}
 toast(nm+" is now "+(on?"on.":"off."));await adminLoad();
}
async function exportData(){
 if(changedKeys().length){try{await flush();}catch(e){}}
 var r=await sb.rpc("export_my_data");
 if(r.error){toast(/feature_off/.test(r.error.message||"")?"Downloading your data is switched off at the moment.":"Couldn’t prepare your download. Please try again.");render();return;}
 var d=new Date(),name="wen-sales-lab-my-data-"+d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+".json";
 var blob=new Blob([JSON.stringify(r.data,null,2)],{type:"application/json"}),a=document.createElement("a");
 a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
 setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
 toast("Your download has been prepared: "+name);render();
}
async function deleteData(){
 var t=window.prompt("This permanently deletes all your saved Sales Lab work, including earlier versions. It can’t be undone. To go ahead, type DELETE MY DATA exactly.");
 if(t===null)return;
 if(t!=="DELETE MY DATA"){toast("Nothing was deleted. The words didn’t match.");render();return;}
 var r=await sb.rpc("delete_my_data",{p_confirm:"DELETE MY DATA"});
 if(r.error){toast("Couldn’t delete your work. Nothing was changed. Please try again.");render();return;}
 clearInterval(SYNC.poll);clearMirror();S=null;
 await sb.auth.signOut();
 AUTH.msg="Your saved work has been deleted. You can sign in again to start fresh.";render();
}
function verSummary(st){
 var x=normalise(st&&typeof st==="object"?st:{}),c=Array.isArray(x.cands)?x.cands:[],s1=(x.steps&&typeof x.steps==="object")?x.steps:{},sh=c.filter(function(k){return k&&k.short;}).length,d1=STEPS.filter(function(k){return s1[k.n];}).length,d2=STEPS2.filter(function(k){return x.w2.steps[k.n];}).length;
 var sent=Object.keys(x.out||{}).filter(function(k){return x.out[k]&&x.out[k].status==="sent";}).length;
 var t=c.length+" partner"+(c.length===1?"":"s")+" found, "+sh+" on your shortlist, "+d1+" of 7 Week 1 steps done";
 if(d2||sent)t+=", "+d2+" of 6 Week 2 steps done, "+sent+" message"+(sent===1?"":"s")+" sent";
 return t;
}
async function showVersions(){
 var r=await sb.from("state_history").select("id,version,saved_at,state").order("id",{ascending:false}).limit(8);
 if(!r.error&&r.data){UI.versions=r.data.map(function(v){return {id:v.id,version:v.version,saved_at:v.saved_at,sum:verSummary(v.state)};});}
 else{var r2=await sb.rpc("list_versions");UI.versions=r2.error?[]:r2.data;}
 render();
}
async function restoreVersion(id){
 var vv=(UI.versions||[]).filter(function(x){return x.id==id;})[0];
 if(!confirm("Restore the version saved on "+(vv?new Date(vv.saved_at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"that date")+(vv&&vv.sum?" ("+vv.sum+")":"")+"? Your current version is kept too, so you can switch back."))return;
 if(changedKeys().length)await flush();
 var r=await sb.rpc("restore_version",{p_id:+id,p_expected:SYNC.version});
 if(r.error){toast("Couldn’t restore that version.");render();return;}
 if(r.data.conflict){toast("Changed elsewhere just now. Please try again.");await checkRemote();render();return;}
 S=normalise(r.data.state);SYNC.version=r.data.version;SYNC.bk=keysOf(S);writeMirror();UI.versions=null;toast("Restored. Your previous version is kept under Earlier saved versions.");render();
}

/* ---------- dashboard ---------- */
function home1(){
 var d=doneCount(),ns=nextStep(),left=STEPS.filter(function(s){return !S.steps[s.n];}).reduce(function(a,s){return a+s.m;},0);
 var h="";
 if(ns){
  h+='<div class="hero"><div class="kicker">'+(d===0?"Start here":"Your next step")+'</div><h2>Step '+ns.n+': '+esc(ns.t)+'</h2><p>About '+ns.m+' minutes. '+(d===0?"You can stop at any time and come back. Everything saves as you go.":"Pick up where you left off.")+'</p><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/7*100)+'%"></i></div><p style="font-size:14px">'+d+' of 7 steps done &middot; about '+hm(left)+' left</p><a class="btn" href="#/step/'+ns.n+'">'+(d===0?"Start step 1":"Continue with step "+ns.n)+' &rarr;</a></div>';
 }else{
  h+='<div class="hero"><div class="kicker">Week 1 complete</div><h2>Well done, Week 1 is finished</h2><p>All seven steps are done. Week 2 is open from the Week 2 tab, and your Week 1 work stays saved.</p></div>';
 }
 var GROUPS={1:["g1","Get set up"],3:["g2","Find your partners"],6:["g3","Make your offer"]};
 h+='<div class="card"><h2>The seven steps</h2>'+STEPS.map(function(s){var dn=S.steps[s.n],isNext=ns&&ns.n===s.n,gp=s.n<3?"g1":(s.n<6?"g2":"g3"),gh=GROUPS[s.n]?'<h3 class="grp '+GROUPS[s.n][0]+'l">'+GROUPS[s.n][1]+'</h3>':"";return gh+'<a class="step '+gp+(dn?" done":"")+(isNext?" next":"")+'" href="#/step/'+s.n+'"><span class="n">'+(dn?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(dn?"Done":(isNext?"Next":"Open"))+'</span></a>';}).join("")+'<p class="mute">Total about '+hm(mins(STEPS))+'. Do them in the order that suits you.</p></div>';
 h+=sprintGlance();
 h+=planCard(STEPS).replace("<h2>Plan your sessions</h2>","<h2>Plan your sessions (optional)</h2>");
 return h+remindCard()+helpCard();
}
/* M2 slice D: a short "so far" summary, and reminder choices with a day picker */
function sprintGlance(){
 if(!doneCount()&&!S.cands.length)return "";
 var b=S.base||{},have=b.orders&&b.orders.s&&b.revenue&&b.revenue.s&&b.partner&&b.partner.s;
 return '<div class="card"><h2>Your sprint so far</h2><div class="tiles">'
  +'<div class="tile"><span class="ti" aria-hidden="true">'+ICO.people+'</span><b>'+S.cands.length+'</b><span>Partners found</span></div>'
  +'<div class="tile"><span class="ti" aria-hidden="true">'+ICO.star+'</span><b>'+shortlisted().length+'</b><span>On your shortlist</span></div>'
  +'<div class="tile"><span class="ti" aria-hidden="true">'+ICO.chart+'</span><b aria-hidden="true">'+(have?"&#10003;":"&ndash;")+'</b><span>Starting numbers<span class="sr">: '+(have?"recorded":"not recorded yet")+'</span></span></div>'
  +'</div></div>';
}
var ICO={
 people:'<svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><circle cx="9" cy="8" r="3.5" fill="currentColor"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0z" fill="currentColor"/><circle cx="17" cy="9" r="2.6" fill="currentColor"/><path d="M16 14.2a5.2 5.2 0 0 1 5.5 5.8h-4.3a8 8 0 0 0-1.2-4.2z" fill="currentColor"/></svg>',
 star:'<svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>',
 chart:'<svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><path d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z" fill="currentColor"/></svg>',
 bell:'<svg viewBox="0 0 24 24" width="20" height="20" focusable="false"><path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21z" fill="currentColor"/></svg>',
 chat:'<svg viewBox="0 0 24 24" width="20" height="20" focusable="false"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" fill="currentColor"/></svg>'
};
function remindCard(){
 var r=S.remind||{},day=(r.day==null||r.day==="")?"1":String(r.day);
 var days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 var h='<div class="card"><span class="ci" aria-hidden="true">'+ICO.bell+'</span><h2>Reminders</h2><div class="row"><button type="button" class="chip" aria-pressed="'+!!r.weekly+'" data-a="remind" data-k="weekly">Weekly reminder (default)</button></div>'; /* individual step reminders are hidden until they exist (Jen, 12 Nov 2026) */
 if(r.weekly)h+='<label for="rday">Day for your weekly reminder</label><select id="rday" data-bind="remind.day" style="max-width:220px">'+days.map(function(n,i){return '<option value="'+i+'"'+(String(i)===day?" selected":"")+'>'+n+'</option>';}).join("")+'</select>';
 return h+rvRemindNote()+'<p class="mute">Your choices are saved. The weekly email is not sent in this test build.</p></div>';
}
function topbar(){return '<div class="topbar"><span class="mute">Signed in as '+esc(ME?ME.email:"")+'</span>'+pillHtml()+'</div>'+(UI.toast?'<div id="toast" class="note info" role="status">'+esc(UI.toast)+'</div>':'');}
function home(){
 var wk=(S.week===4&&week3Done()&&week2Done()&&week1Done())?4:((S.week===3||S.week===4)&&week2Done()&&week1Done())?3:((S.week===2||S.week===3||S.week===4)&&week1Done()?2:1);
 var h='<h1>My Sprint</h1><p class="mute">Partnership-to-Sales &middot; Week '+wk+' of 4</p>'+sprintBar(true)+'<p><a class="link" href="#/experiments">See all six experiments, and the sales check</a></p>';
 h+='<div class="tabs"><button type="button" class="chip" aria-pressed="'+(wk===1)+'" data-a="w2-week" data-val="1">Week 1'+(week1Done()?' &#10003;':'')+'</button><button type="button" class="chip" aria-pressed="'+(wk===2)+'" data-a="w2-week" data-val="2"'+(week1Done()?'':' disabled title="Opens when you finish Week 1"')+'>Week 2</button><button type="button" class="chip" aria-pressed="'+(wk===3)+'" data-a="w3-week" data-val="3"'+(week2Done()&&week1Done()?'':' disabled title="Opens when you finish Week 2"')+'>Week 3</button><button type="button" class="chip" aria-pressed="'+(wk===4)+'" data-a="w4-week" data-val="4"'+(week3Done()&&week2Done()&&week1Done()?'':' disabled title="Opens when you finish Week 3"')+'>Week 4</button></div>';
 if(!week1Done())h+='<p class="mute">Week 2 opens when you finish Week 1 (choose "Ready for Week 2" in the last step).</p>';
 if(wk===1)h+=w2Banner();
 if(S.focus.product&&S.focus.format)h+='<div class="note ok"><strong>Your product:</strong> '+esc(productLine())+'</div>';
 if(wk===4)h+=home4();else if(wk===3){h+=home3();if(week3Done())h+='<div class="note ok"><strong>Week 4 is open.</strong> This is where you run it, record your numbers and read the result honestly. <button type="button" class="btn" data-a="w4-week" data-val="4">Open Week 4</button></div>';}else if(wk===2){h+=home2();if(week2Done())h+='<div class="note ok"><strong>Week 3 is open.</strong> This is where you turn replies into one small collaboration proposal. <button type="button" class="btn" data-a="w3-week" data-val="3">Open Week 3</button></div>';}else{if(week1Done())h+='<div class="note ok"><strong>Week 2 is open.</strong> This is where you write to the partners you chose, and send the messages yourself. <button type="button" class="btn" data-a="w2-week" data-val="2">Open Week 2</button></div>';h+=home1();}
 return h;
}
/* ---------- keyboard and screen reader helpers (Group A) ---------- */
function a11ySig(e){
 var a=document.getElementById("app");
 if(!e||!a||e===a||!a.contains(e)||e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.tagName==="SELECT")return null;
 var d=e.dataset||{},k=Object.keys(d).sort().map(function(x){return x+"="+d[x];}).join("|");
 return e.tagName+"|"+(e.id||"")+"|"+k+"|"+(k||e.id?"":(e.getAttribute("href")||e.textContent.slice(0,30)));
}
function a11yFind(sig){
 var els=document.getElementById("app").querySelectorAll(sig.split("|")[0].toLowerCase());
 for(var i=0;i<els.length;i++){if(a11ySig(els[i])===sig)return els[i];}
 return null;
}
function a11yGroups(){
 var rows=document.querySelectorAll("#app .row");
 for(var i=0;i<rows.length;i++){
  var r=rows[i];
  if(r.getAttribute("role")||!r.querySelector("button.chip[aria-pressed]"))continue;
  var t="",p=r.previousElementSibling,par=r.parentNode;
  if(p&&p.tagName==="LABEL")t=p.textContent;
  else if(par.classList&&par.classList.contains("q")){
   var c=par.cloneNode(true),cr=c.querySelectorAll(".row");
   for(var k=0;k<cr.length;k++)cr[k].parentNode.removeChild(cr[k]);
   t=c.textContent;
  }else if(r.querySelector("button[data-a=fitgo]"))t="Choose a candidate";
  t=t.replace(/\s+/g," ").trim();
  if(!t)continue;
  var card=r.closest(".card"),hd=card?card.querySelector("h2,h3"):null;
  if(hd&&hd.textContent&&t.indexOf(hd.textContent)<0&&!r.querySelector("button[data-a=fitgo]"))t+=" ("+hd.textContent.trim()+")";
  r.setAttribute("role","group");r.setAttribute("aria-label",t);
 }
 var fg=document.querySelectorAll("#app button[data-a=fitgo][title]");
 for(var j=0;j<fg.length;j++)fg[j].setAttribute("aria-label","Candidate "+fg[j].textContent.replace(/\s+/g," ").trim()+": "+fg[j].getAttribute("title"));
}
function render(){
 var y=window.scrollY,html,sig=a11ySig(document.activeElement),vk=PHASE+"|"+(PHASE==="signin"?AUTH.step:"")+"|"+route;
 if(PHASE==="boot"||PHASE==="loading")html=loadingHtml();
 else if(PHASE==="signin")html=signinHtml();
 else if(PHASE==="noaccess")html=noaccessHtml();
 else if(PHASE==="error")html=errorHtml();
 else if(PHASE==="adminonly"){if(/^#\/community/.test(route))html=adminTop()+communityHtml();else{route="#/admin";html=adminTop()+adminHtml();}}
 else{
  var m=(route||"#/").match(/^#\/step\/(\d)/),m2=(route||"#/").match(/^#\/w2\/([1-6])$/),m3=(route||"#/").match(/^#\/w3\/([1-6])$/),m4=(route||"#/").match(/^#\/w4\/([1-6])$/);
  if(route==="#/admin"&&ME&&ME.admin){html=adminHtml();if(!ADMIN.members&&!ADMIN.busy)adminLoad();}
  else if(/^#\/community/.test(route)&&FLAGS.community===true)html=communityHtml();
  else if(etBlockP())html=etBlockHtml();else if(m2&&week1Done())html=[0,w2s1,w2s2,w2s3,w2s4,w2s5,w2s6][+m2[1]]();else if(m3&&week2Done())html=[0,w3s1,w3s2,w3s3,w3s4,w3s5,w3s6][+m3[1]]();else if(m4&&week3Done())html=[0,w4s1,w4s2,w4s3,w4s4,w4s5,w4s6][+m4[1]]();else if(m&&+m[1]>=1&&+m[1]<=7)html=[0,step1,step2,step3,step4,step5,step6,step7][+m[1]]();else if(route==="#/sprint")html=home();else if(route==="#/experiments")html=experimentsPage();else if(route==="#/results")html=resultsPage();else if(route==="#/review")html=reviewPage();else if(/^#\/etsy(\/w[1-4])?(\/[1-6])?$/.test(route))html=etRoute();else if(/^#\/email(\/w[1-4])?(\/[1-5])?$/.test(route))html=emRoute();else if(/^#\/show(\/w[1-4])?(\/[1-5])?$/.test(route))html=stsRoute();else if(/^#\/find(\/w[1-4])?(\/[1-5])?$/.test(route))html=fybRoute();else if(route==="#/profile")html=profilePage();else if(route==="#/help")html=helpPage();else html=homeHub();
  html=rHead(html);
 }
 var keep=snapFields();document.getElementById("app").innerHTML=html;restoreFields(keep);try{rEnhance();}catch(e){}try{shellNav();}catch(e){}try{comPhotoFill();}catch(e){}
 if(PHASE==="app"||PHASE==="adminonly"){if(/^#\/community/.test(route)&&(FLAGS.community===true||PHASE==="adminonly")){if(COM.loadedFor!==route){COM.loadedFor=route;comLeave();setTimeout(comEnter,0);}}else COM.loadedFor="";}
 if(PHASE==="app"){var r=document.querySelector("[data-bind=refl]");if(r)r.value=S.refl||"";}
 a11yGroups();
 if(vk!==UI.vk){
  /* a new screen: move focus to its heading so keyboard and screen reader users start at the top */
  UI.vk=vk;var h1=document.querySelector("#app h1"),cd=PHASE==="signin"&&AUTH.step!=="email"?document.getElementById("cd"):null;
  if(cd){try{cd.focus({preventScroll:true});}catch(e){}}
  else if(h1){h1.setAttribute("tabindex","-1");try{h1.focus({preventScroll:true});}catch(e){}}
 }else if(sig){
  /* the same screen redrawn (a chip was pressed): put focus back on the same control */
  var again=a11yFind(sig);if(again){if(again.tagName==="H1")again.setAttribute("tabindex","-1");try{again.focus({preventScroll:true});}catch(e){}}
 }
 /* messages that appear after a redraw are not announced by screen readers on their own, so say them in a standing live region */
 var say=(PHASE==="signin"&&AUTH.msg)?AUTH.msg:(UI.toast||"");
 if(say&&say!==UI.said){var lr=document.getElementById("srlive");if(lr){lr.textContent="";setTimeout(function(){lr.textContent=say;},50);}}
 UI.said=say;
 window.scrollTo(0,y);
}

/* ---------- M4: Week 2, the first real contact (14 Nov 2026). Template based: no AI, nothing is ever sent by the app. ---------- */
var STEPS2=[
 {n:1,t:"Learn what makes a first message get a reply",m:35,b:"Your Week 1 shortlist."},
 {n:2,t:"Draft your first message with the Message Builder",m:50,b:"Your Week 1 offer sketch (it pre-fills the builder)."},
 {n:3,t:"Pre-send check, send, and log it",m:45,b:"A draft from step 2."},
 {n:4,t:"Learn how to read and answer replies",m:30,b:"Nothing. You can do it while you wait."},
 {n:5,t:"Follow up once, then log what happened",m:45,b:"A sent message. Follow-ups open about five days after sending."},
 {n:6,t:"Review Week 2 and decide what's next",m:15,b:"Whatever you've done so far."}
];
var W2CH=[["email","Email"],["dm","Direct message"],["form","Contact form"],["person","In person"]];
var W2TONES=[["warm","Warm"],["brief","Brief"],["formal","A bit more formal"]];
var W2REPLIES=[["yes","Yes or tell me more"],["maybe","Maybe later"],["no","No"],["noreply","No reply yet"]];
var W2FUV=["A short extra idea","A useful link","A quick example"];
var W2PRE=[["a","I chose this partner for a reason I can state"],["b","The message is personal to them, not copied to others"],["c","It has no private details about anyone"],["d","I am using a normal way to reach them"],["e","If I will earn money from this, I have said so"]];
var W2STUCK=[["nerv","I felt nervous"],["write","I wasn't sure what to write"],["partner","I couldn't find the right partner"],["time","I ran out of time"]];
var W2COLLAB={
 "A mention to their audience":["a short mention to your audience","a short mention to your audience. I would write the wording and supply the link, so it would only take you a few minutes"],
 "An introduction":["an introduction to anyone in your network who might find it useful","an introduction to anyone in your network who might find it useful. I would write a short note you could forward, so it takes you almost no effort"],
 "A guest slot":["a guest slot for your audience","a guest slot, where I would share one short, practical piece with your audience"],
 "A shared link":["sharing a link to it with a line about who it is for","sharing a link to it with a line about who it is for. I would write the line, so you do not have to"],
 "A short chat first":["a short chat first, to see whether it would suit your audience","a short chat first, just to see whether it would be useful to your audience at all"]
};
var W2REL={known:"You know the people I am trying to help, so I wanted to ask you first.",teaches:"Your audience already comes to you to learn about this, so it felt like a natural fit.",host:"Your community is full of the people I made it for, so it felt like a natural fit.",next:"Your customers are at a stage right next to where mine are, so it felt like a natural fit.",service:"You already help the same people, so it felt like a natural fit.",tool:"The people who use your tool are the people I made this for, so it felt like a natural fit."};
var W2GAIN={"Saves them time":"it could save you time","A new resource for their audience":"it gives your audience a useful new resource at no cost to you","Content for their channel":"it gives you something fresh to share with your audience","Other":"it should be genuinely useful to your audience"};
var W2CONTR=[["I would","I'd"],["I have","I've"],["It is","It's"],["it is","it's"],["is not","isn't"],["do not","don't"],["I am","I'm"],["would not","wouldn't"]];
var W2DEF={channel:"",noticed:"",tone:"warm",draft:"",prevDraft:"",v:0,status:"",sentAt:"",reply:"",repliedAt:"",answered:false,ans:"",fuSent:false,fuAt:"",fuDraft:"",fuValue:[],judge:{},name:"",ackAsk:false};
var W2OUTKEYS={draft:1,noticed:1,ans:1,fuDraft:1};

/* ===== W2 LOGIC START: pure rules, checked by dev/m4_logic_tests.js ===== */
function nowMs(){return window.__slNow||Date.now();}
function ymd(ms){var d=new Date(ms);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function parseYmd(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||""));return m?new Date(+m[1],+m[2]-1,+m[3]).getTime():null;}
function addDays(s,n){var t=parseYmd(s);if(t==null)return "";var d=new Date(t);d.setDate(d.getDate()+n);return ymd(d.getTime());}
function today(){return ymd(nowMs());}
function dayLab(s){var t=parseYmd(s);if(t==null)return "";return new Date(t).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});}
function w2J(k){var v=CONTENT[k];if(!v)return null;try{return JSON.parse(v);}catch(e){return null;}}
function w2Nm(c){return (String((c&&c.name)||"").replace(/\s*\(.*$/,"").replace(/,.*$/,"").trim())||"them";}
function w2Cand(id){var c=cand(id);if(c)return c;var o=(S.out||{})[id]||{};return {id:+id,name:o.name||"Partner",type:"host",short:false};}
function O(c){return (S.out&&S.out[c.id])||W2DEF;}
function OW(c){var o=S.out[c.id];if(!o){o=clone(W2DEF);o.name=w2Nm(c);S.out[c.id]=o;}return o;}
function w2Words(t){var b=String(t||"").replace(/^Subject:.*$/m,"").trim();return b?b.split(/\s+/).length:0;}
function w2Limit(ch){return {email:180,dm:95,form:120,person:9999}[ch]||180;}
function w2Suggest(c){
 if(c.type==="known")return ["person","You know them, so an in-person chat or a short direct message will feel most natural."];
 if(c.type==="teaches")return ["dm","Creators often prefer a short, friendly direct message to a formal email."];
 if(c.type==="host")return ["email","Newsletter and community hosts usually publish an address for enquiries, and a clear email suits them."];
 if(c.type==="next")return ["form","Shops often route partnership enquiries through a contact form, so keep it clear and brief."];
 if(c.type==="tool")return ["form","Tools usually have a partnerships or contact form."];
 return ["email","An email to a published address usually works for a service provider."];
}
function w2Offered(c){var sk=S.sketch[c.id]||{};return (sk.offer||[]).filter(function(k){return S.focus.inc.indexOf(k)>-1;});}
function w2IncPhrases(c,sh){var f=S.focus,out=[];w2Offered(c).forEach(function(k){var dt=lc(f.incd[k]||"");
 if(k==="free")out.push(sh?"a free copy":"a free copy or free access, so you can try it yourself first");
 else if(k==="disc")out.push("a discount for your audience"+(dt?" ("+dt+")":""));
 else if(k==="trial")out.push("a longer free trial for your audience");
 else if(k==="comm")out.push("a commission on any sales that come through your link"+(dt?" ("+dt+")":""));
 else if(k==="give")out.push("a giveaway we could run together");});return out;}
function w2GainText(sk,n){var g=(sk.gain||[]).map(function(k){return W2GAIN[k];}).filter(Boolean).slice(0,n||2);return g.length?joinAnd(g):"it should be genuinely useful to your audience";}
function w2Pieces(c){
 var f=S.focus,sk=S.sketch[c.id]||{},o=O(c);
 var pn=f.product||"my product",fmtp=FMTP[f.format]||"",buyer=lc(S.buyer.who),problem=lc(f.problem),outcome=lc(f.outcome),pt=priceText();
 var ask=(sk.ask||[])[0]||"",cl=W2COLLAB[ask]||null,incs=w2IncPhrases(c);
 var P={name:w2Nm(c),pn:pn,n:(o.noticed||"").trim(),person:c.type==="known",
  intro:"I make "+pn+(fmtp?", "+fmtp:"")+(buyer?" for "+buyer:"")+".",
  solves:problem?(buyer?"Many of them":"Many of its customers")+" struggle with "+problem+".":"",
  gets:outcome?"After using it, they "+outcome+".":"",
  cost:pt?"It costs "+pt+".":"",
  url:(f.url||"").trim(),rel:W2REL[c.type]||W2REL.host,
  collabShort:cl?cl[0]:"",collabLong:cl?cl[1]:"",incText:joinAnd(incs),incTextS:joinAnd(w2IncPhrases(c,true)),
  gain:w2GainText(sk),gain1:w2GainText(sk,1),introS:"I make "+pn+(fmtp?", "+fmtp:"")+".",comm:w2Offered(c).indexOf("comm")>-1,link:(sk.measure||[]).indexOf("A unique link")>-1};
 return P;
}
function w2Greet(P,tone){var who=P.person?P.name:"there";return tone==="formal"?(P.person?"Dear "+P.name+",":"Dear "+P.name+" team,"):"Hi "+who+",";}
function w2Sign(tone){return tone==="formal"?"Kind regards,\n[Your name]":(tone==="brief"?"Thanks,\n[Your name]":"Warmly,\n[Your name]");}
function w2Contract(t,tone){if(tone==="formal")return t;W2CONTR.forEach(function(p){t=t.split(p[0]).join(p[1]);});return t;}
function w2Outline(P,n){return "Conversation outline (no script, just a guide)\n\n1. Opener: say what you noticed. \"I really enjoyed "+n+".\"\n2. Why them: "+P.rel+"\n3. What it is: "+P.intro+(P.gets?" "+P.gets:"")+"\n   What is in it for them: "+P.gain+"."+"\n4. What you would like to suggest: "+(P.collabLong||"[choose the collaboration you want to suggest]")+(P.incText?"\n5. What you would offer: "+P.incText+(P.comm?" (and say clearly that it earns you a commission)":""):"")+"\n"+(P.incText?"6":"5")+". An easy way out: \"No worries at all if it's not the right fit.\"\n\nAfterwards, offer to send a short note so they have it in writing. Listen more than you pitch.";}
function w2Compose(c,o,v,brief){
 var P=w2Pieces(c),g=w2Greet(P,o.tone),n=P.n||"[something specific you noticed]",s=w2Sign(o.tone),ch=o.channel,b=!!brief||o.tone==="brief";
 var cap=function(x){return x.charAt(0).toUpperCase()+x.slice(1);};
 if(ch==="person")return w2Outline(P,n);
 var like=["I really enjoyed "+n+".",cap(n)+" stuck with me.","I have been following your work, and "+n+" was spot on."][v%3];
 var open=["I would love to propose ","I wondered about ","Here is what I had in mind: "][v%3];
 var prop=P.collabLong?open+P.collabLong+".":"[Choose the collaboration you want to suggest.]";
 var propS=P.collabShort?"I wondered about "+P.collabShort:"[your suggestion]";
 var disc=P.comm?" If you do share it, please say clearly that it earns you a commission, so your audience can trust it.":"";
 var inc=P.incText?" To make it worthwhile, I would offer "+P.incText+"."+disc:"";
 var incS=P.incText?", with "+P.incText:"";
 var gainS=cap(P.gain)+".",gain1S=cap(P.gain1)+".";
 var meas=P.link?" I would give you a link only your audience uses, so we can both see what happens.":"";
 var t;
 if(ch==="dm"){
  var dmEnd=" "+propS+incS+(P.comm?" (please say clearly that it earns you a commission)":"")+". Would you be open to that? No pressure at all if it is not a fit.";
  t=g+" "+like+" "+P.intro+" "+P.rel+" "+gainS+dmEnd;
  if(b||w2Words(t)>w2Limit("dm"))t=g+" "+like+" "+P.intro+" "+gainS+dmEnd;
  if(w2Words(t)>w2Limit("dm"))t=g+" "+like+" "+P.intro+" "+gain1S+dmEnd;
  if(w2Words(t)>w2Limit("dm"))t=g+" "+like+" "+P.introS+" "+gain1S+dmEnd;
  if(w2Words(t)>w2Limit("dm")){var dmEndS=" "+propS+(P.incTextS?", with "+P.incTextS:"")+(P.comm?" (please say clearly that it earns you a commission)":"")+". Would you be open to that? No pressure at all if it is not a fit.";t=g+" I enjoyed "+n+". "+P.introS+" "+gain1S+dmEndS;}
 }else if(ch==="form"){
  var fEnd=" Would you be open to that? No problem at all if it is not a fit. Thank you for your time.",fHead="Hello, I am [Your name]. "+like+" "+P.intro;
  var fTry=[fHead+(P.gets&&!b?" "+P.gets:"")+" "+P.rel+" "+gainS+" "+prop+inc+fEnd,fHead+" "+P.rel+" "+gainS+" "+prop+inc+fEnd,fHead+" "+gainS+" "+prop+inc+fEnd,fHead+" "+gainS+" "+propS+incS+"."+fEnd,"Hello, I am [Your name]. I enjoyed "+n+". "+P.introS+" "+gain1S+" "+propS+(P.incTextS?", with "+P.incTextS:"")+(P.comm?" (please say clearly that it earns you a commission)":"")+"."+fEnd];
  t=fTry[0];for(var fi=1;fi<fTry.length&&w2Words(t)>w2Limit("form");fi++)t=fTry[fi];
 }else{
  var subj=["Something that might help your audience","An idea for your readers","Could "+P.pn+" help your audience?"][v%3];
  if(b)t="Subject: "+subj+"\n\n"+g+"\n\n"+like+" "+P.intro+" "+P.rel+" "+gainS+" "+prop+inc+"\n\nWould you be open to that? No pressure at all if it is not a fit.\n\n"+s;
  else{
   var eTop="Subject: "+subj+"\n\n"+g+"\n\n"+like+" "+P.intro,eEnd="\n\n"+P.rel+" "+gainS+" "+prop+inc+meas+"\n\nWould you be open to that? No worries at all if it is not the right fit.\n\n"+s,eUrl=(P.url?" You can see it here: "+P.url:"");
   var eTry=[eTop+(P.solves?" "+P.solves:"")+(P.gets?" "+P.gets:"")+(P.cost?" "+P.cost:"")+eUrl+eEnd,eTop+(P.gets?" "+P.gets:"")+(P.cost?" "+P.cost:"")+eUrl+eEnd,eTop+(P.cost?" "+P.cost:"")+eUrl+eEnd,eTop+eUrl+eEnd,eTop+eEnd,eTop+"\n\n"+gainS+" "+prop+inc+"\n\nWould you be open to that? No worries at all if it is not the right fit.\n\n"+s,eTop+"\n\n"+gainS+" "+propS+incS+"."+"\n\nWould you be open to that? No worries at all if it is not the right fit.\n\n"+s];
   t=eTry[0];for(var ei=1;ei<eTry.length&&w2Words(t)>w2Limit("email");ei++)t=eTry[ei];
  }
 }
 return w2Contract(t,o.tone);
}
/* Safeguards: things that must not go out without the member knowing. They are separate from the six learning ticks. */
function w2Guard(c){return w2GuardText(O(c).draft,c);}
function w2GuardText(draft,c){
 var t=String(draft||""),low=t.toLowerCase(),res=[],f=S.focus,off=w2Offered(c);
 if(!t.trim())return res;
 if(/\[[^\]]{2,}\]/.test(t))res.push({k:"placeholder",t:"There is still text in [square brackets] to fill in or remove, such as your name or what you noticed."});
 var l2=low.replace(/feel free/g,"");
 var unl=[];
 if((/\bfree (copy|access|trial|gift|download|sample|template|month|week|session)/.test(l2)||/\bfor free\b/.test(l2)||/\bcomplimentary\b/.test(l2))&&off.indexOf("free")<0&&off.indexOf("trial")<0)unl.push("a free copy or free access");
 if(/(discount|% off|percent off|voucher|promo code|coupon|money off)/.test(l2)&&off.indexOf("disc")<0)unl.push("a discount");
 if(/(commission|affiliate|revenue share|kickback)/.test(l2)&&off.indexOf("comm")<0)unl.push("a commission");
 if(/giveaway/.test(l2)&&off.indexOf("give")<0)unl.push("a giveaway");
 var allowed=(priceText()+" "+(f.incd.disc||"")+" "+(f.incd.comm||"")).replace(/\s+/g,"");
 var amts=(t.match(/[£$€]\s?\d[\d.,]*/g)||[]).map(function(x){return x.replace(/\s+/g,"");});
 if(amts.some(function(x){return allowed.indexOf(x)<0;}))unl.push("an amount of money that is not in your product details");
 var pcts=(t.match(/\d+(\.\d+)?\s?%/g)||[]).map(function(x){return x.replace(/\s+/g,"");});
 if(pcts.some(function(x){return allowed.indexOf(x)<0;}))unl.push("a percentage you have not listed");
 if(unl.length)res.push({k:"offer",t:"Your message mentions "+joinAnd(unl)+", which you have not chosen to offer this partner. Remove it, or add it to your offer in Week 1 so it is yours to promise."});
 if(/(guarantee|guaranteed|proven|best[- ]?sell|number one|#1|thousands of|everyone loves|customers say|reviews say|testimonial|rated |sold out|\d+\s?(x|times) more|(make|earn|earned|made)\s+(an extra\s+)?[£$€]?\d|passive income|double your|triple your|\d+%\s+(more|increase|growth|boost))/.test(l2))res.push({k:"claims",t:"It makes a claim about results, income, sales or what other people say. Only keep it if it is true and you can show it."});
 if(/(only today|today only|last chance|hurry|don't miss|act now|limited (time|spots|places|offer)|offer ends|expires|before it's gone|before it is gone|\d+\s+(spots|places) left|reply (by|before)|need an answer)/.test(l2))res.push({k:"urgency",t:"It uses urgency or pressure. Calm and honest earns more trust, so take it out."});
 if(/(commission|affiliate|revenue share)/.test(l2)&&!/(say clearly|open about|disclos|make clear|state clearly|be clear that|transparent|tell your audience|say so|says so)/.test(l2))res.push({k:"disclosure",t:"Money is involved, so add a clear line saying that a commission is paid, and ask them to be open about it with their audience."});
 if(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t)||/(\+?\d[\d\s()-]{9,}\d)/.test(t))res.push({k:"private",t:"There is an email address or phone number in the message. Only keep it if it is your own business contact."});
 Object.keys(S.out||{}).forEach(function(id){if(id==c.id)return;var x=S.out[id];if(x&&x.draft&&x.draft.trim().length>40&&x.draft.trim()===t.trim())res.push({k:"copy",t:"This message is word for word the same as the one for "+(x.name||"another partner")+". Make each message personal to the person you are writing to."});});
 return res;
}
function w2Pitch(c){
 var o=O(c),t=o.draft||"",low=t.toLowerCase(),res=[];
 var nw=(o.noticed||"").toLowerCase().split(/[^a-z0-9']+/).filter(function(w){return w.length>3;});
 var hit=nw.filter(function(w){return low.indexOf(w)>-1;}).length;
 var spec=nw.length>=3&&hit>=Math.min(3,nw.length)&&(o.noticed||"").trim().length>0;
 res.push({k:"A specific reason for choosing them",ok:spec,looked:"Whether your own \"what I noticed\" line appears in the message.",tip:"Add something real you noticed about their work. Specific beats flattering."});
 var iA=low.search(/(would you|could you|are you open|be open to|might you|consider|happy to chat|quick chat|be of interest)/),iG=low.search(/(your (audience|readers|community|followers|customers|listeners|people)|for you\b|you'd|you could|saves? you)/);
 res.push({k:"Their benefit comes before your ask",ok:iG>-1&&(iA<0||iG<iA),looked:"Whether something in it for them appears before the ask.",tip:"Say what they or their audience gain before you ask for anything."});
 var asks=t.split(/[.!?]+/).filter(function(s){return /(would you|could you|are you open|be open to|might you|would it be|be of interest|would [a-z ]+ be something)/i.test(s);}).length,qm=(t.match(/\?/g)||[]).length;
 res.push({k:"One clear, small ask",ok:asks>=1&&asks<=1&&qm<=2,looked:"How many separate requests the message makes.",tip:asks<1?"Add one clear, small ask.":"Keep to one ask. Choose the most useful and drop the rest."});
 res.push({k:"An easy way out",ok:/(no worries|no pressure|no problem|totally fine|completely fine|if it's not|if it is not|not the right fit|understand if)/.test(low),looked:"Whether the message makes it easy to say no.",tip:"Add a warm line like \"No worries at all if it's not a fit\"."});
 var wc=w2Words(t),lim=w2Limit(o.channel),formal=/(dear |kind regards|yours sincerely)/.test(low),styleBad=(o.channel==="dm"&&formal);
 res.push({k:"The right length and style for this channel",ok:(o.channel==="person"||wc<=lim)&&!styleBad&&wc>0,looked:"Length against this channel's guide ("+(o.channel==="person"?"no limit":lim+" words")+") and whether the style suits it. You have "+wc+" words.",tip:styleBad?"A direct message should feel conversational, so drop the formal wording.":"Trim it. Cut anything that isn't the reason, the benefit or the ask."});
 var bad=w2Guard(c).some(function(g){return g.k==="offer"||g.k==="claims"||g.k==="urgency";});
 res.push({k:"Honest and free of pressure",ok:t.length>0&&!bad,looked:"Whether there is false urgency, big promises, income claims, or an offer you have not chosen.",tip:"Remove urgency and promises you can't back up. Calm and honest earns more trust."});
 return res;
}
function w2PitchScore(c){return w2Pitch(c).filter(function(i){return i.ok;}).length;}
function w2Sent(){var out=[];Object.keys(S.out||{}).forEach(function(id){var o=S.out[id];if(o&&o.status==="sent")out.push({id:+id,o:o,c:w2Cand(id),name:o.name||w2Nm(w2Cand(id))});});out.sort(function(a,b){return a.o.sentAt<b.o.sentAt?-1:(a.o.sentAt>b.o.sentAt?1:a.id-b.id);});return out;}
function w2Pending(){return w2Sent().filter(function(e){return !e.o.fuSent&&(!e.o.reply||e.o.reply==="noreply");});}
function w2FuOpens(o){return addDays(o.sentAt,5);}
function w2Due(e,now){return w2FuOpens(e.o)<=(now||today());}
function w2End(){return S.w2.openedAt?addDays(S.w2.openedAt,7):"";}
function w2Late(d){var e=w2End();return !!e&&d>e;}
function w2NeedsAnswer(){return w2Sent().filter(function(e){return e.o.reply==="yes"&&!e.o.answered;});}
function w2Waiting(now){
 var p=w2Pending();if(!p.length)return null;
 if(p.some(function(e){return w2Due(e,now);}))return null;
 var next=p.map(function(e){return {e:e,d:w2FuOpens(e.o)};}).sort(function(a,b){return a.d<b.d?-1:1;})[0];
 return "Waiting for replies. The follow-up with "+next.e.name+" opens on "+dayLab(next.d)+(w2Late(next.d)?". That falls in Week 3 and carries forward automatically, so you have not fallen behind.":".");
}
function w2Issues(c){
 var iss=w2Guard(c).map(function(g){return g.t;}),o=O(c);
 if((S.w2.pre||[]).length<W2PRE.length)iss.push("The pre-send checklist is not fully ticked yet.");
 if(!(o.draft||"").trim()&&o.channel!=="person")iss.push("There is no draft yet. You can still log that you sent something you wrote yourself.");
 return iss;
}
function w2Rec(){
 var sent=w2Sent(),replied=sent.filter(function(e){var r=e.o.reply;return r&&r!=="noreply";}),yes=sent.filter(function(e){return e.o.reply==="yes";}),maybe=sent.filter(function(e){return e.o.reply==="maybe";});
 if(!sent.length)return {c:"info",t:"Nothing sent yet",b:"That is okay. Tell us what got in the way and we will point you to the right help. Starting with a warm contact, or practising with a friend, often makes the first one easier."};
 if(yes.length)return {c:"ok",t:"Recommended: shape a small collaboration in Week 3",b:"You have at least one partner who said yes or asked for more. Week 3 helps you agree a small, specific collaboration with them."};
 if(maybe.length)return {c:"info",t:"Keep the door open and message your next partner",b:"A \"maybe later\" is a soft yes. Set a check-back reminder, and use what you have learned for your next message."};
 if(replied.length)return {c:"info",t:"Learn from the replies, then try another partner",b:"A polite no is useful information. Change one thing, such as the opening observation, the ask or the partner type, and try the next partner."};
 if(sent.length<3)return {c:"info",t:"Too early to judge",b:"With only "+sent.length+" message"+(sent.length>1?"s":"")+" sent and no replies yet, there is not enough to learn from. Wait for the follow-up window, then change one thing and try another partner."};
 return {c:"warn",t:"No replies yet. Check before sending more",b:"Look at your Pitch Check ticks and your partners' fit scores before sending more. Quality and fit come first."};
}
function w2FuDraft(c){
 var o=O(c),P=w2Pieces(c),v=(o.fuValue||[])[0]||"A short extra idea",extra={"A short extra idea":"one more thought for your audience: [add one true, specific tip about "+P.pn+"]","A useful link":"a link that may help your audience: [paste the link]","A quick example":"a quick example of how someone might use "+P.pn+": [add a real example you are happy to share]"}[v]||"[something useful]";
 return w2Greet(P,o.tone)+" following up on my earlier message. I wanted to add "+extra+". No worries at all if it is not a fit.";
}
function w2AnswerDraft(c){
 var o=O(c),P=w2Pieces(c),g=w2Greet(P,o.tone);
 if(o.reply==="yes")return g+" thank you, that is great to hear. Would a short chat this week suit you, so we can agree the details? Whatever works for you is fine.";
 if(o.reply==="maybe")return g+" thanks for letting me know, that is completely fine. Would it be okay if I check back in a month or two?";
 return g+" thank you for letting me know. I appreciate you taking the time, and I wish you all the best.";
}
/* ===== W2 LOGIC END ===== */

function w2Touch(){if(S&&S.w2&&!S.w2.openedAt){S.w2.openedAt=today();save();}}
function w2Chips(path,opts,max){return chipsHtml(path,opts,max);}
function shell2(n,body){
 var s=STEPS2[n-1],dn=S.w2.steps[n];
 var h='<a class="back" href="#/sprint" data-a="w2-week" data-val="2">&larr; My Sprint</a><h1>Week 2 &middot; Step '+n+' of 6</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p>'+glance(2,n)+'<p class="mute">You will need: '+esc(s.b)+' Everything saves automatically. Do the steps in any order that suits you.</p>';
 h+=body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="w2-done" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<6?'<a class="btn ghost" href="#/w2/'+(n+1)+'">Next step &rarr;</a>':'<a class="btn ghost" href="#/sprint" data-a="w2-week" data-val="2">Back to My Sprint</a>')+'</div>';
 return h;
}
function w2Stuck(inStep){
 if(w2Sent().length)return "";
 if(!inStep&&!(S.w2.openedAt&&dayDiffS(S.w2.openedAt,today())>=3))return "";
 var h='<div class="card"><h2>Haven\'t sent your first message yet?</h2><p class="mute">That is completely normal. What got in the way? (optional)</p>'+w2Chips("w2.stuck",W2STUCK,1);
 var s=(S.w2.stuck||[])[0],help=w2J("w2.stuck");
 if(s&&help&&help[s])h+='<div class="note ok">'+esc(help[s])+'</div>';
 return h+'</div>';
}
function dayDiffS(a,b){var x=parseYmd(a),y=parseYmd(b);return (x==null||y==null)?0:Math.round((y-x)/864e5);}
function w2NextAction(){
 var ans=w2NeedsAnswer()[0];if(ans)return {t:"Answer "+ans.name+"'s reply",link:"#/w2/5"};
 var due=w2Pending().filter(function(e){return w2Due(e);})[0];if(due)return {t:"Follow up with "+due.name,link:"#/w2/5"};
 for(var i=0;i<STEPS2.length;i++){var n=STEPS2[i].n;if(!S.w2.steps[n]){if(n===5&&w2Waiting())continue;return {t:"Step "+n+": "+STEPS2[i].t,link:"#/w2/"+n,m:STEPS2[i].m};}}
 return {t:"Open your Week 2 review",link:"#/w2/6"};
}
function w2CarryCard(){
 var p=w2Pending(),ans=w2NeedsAnswer();
 if(!ans.length&&!p.length)return "";
 var h='<div class="card"><h2>Carrying into Week 3</h2><p class="mute">Anything still open moves forward automatically. You have not fallen behind. Week 3 is not part of this test build yet, and your records stay saved.</p>';
 ans.forEach(function(e){h+='<div class="crow"><span>Answer '+esc(e.name)+'</span><span class="mute">Reply needs an answer</span></div>';});
 p.forEach(function(e){var d=w2FuOpens(e.o);h+='<div class="crow"><span>Follow up with '+esc(e.name)+'</span><span class="mute">'+(d<=today()?'Due now':'Opens '+esc(dayLab(d)))+'</span></div>';});
 return h+'</div>';
}
function w2Banner(){
 var ans=w2NeedsAnswer()[0],due=w2Pending().filter(function(e){return w2Due(e);})[0],wl=w2Waiting();
 if(ans)return '<div class="note info"><strong>Next action:</strong> answer '+esc(ans.name)+'\'s reply. <a href="#/w2/5">Open</a></div>';
 if(due)return '<div class="note info"><strong>Next action:</strong> follow up with '+esc(due.name)+'. <a href="#/w2/5">Open</a></div>';
 if(wl)return '<div class="note info">&#9203; '+esc(wl)+'</div>';
 return "";
}
function home2(){
 w2Touch();
 var d2=STEPS2.filter(function(s){return S.w2.steps[s.n];}).length,na=w2NextAction(),wl=w2Waiting();
 var left=STEPS2.filter(function(s){return !S.w2.steps[s.n];}).reduce(function(a,s){return a+s.m;},0);
 var h='<div class="card"><div class="row" style="justify-content:space-between"><strong>'+d2+' of 6 steps done</strong><span class="mute">About '+hm(left)+' left</span></div><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d2/6*100)+'%"></i></div>';
 if(wl)h+='<div class="note info" style="margin-top:12px"><strong>&#9203; '+esc(wl)+'</strong><br>Nothing to do right now. If you like, learn about replies in step 4 while you wait.</div>';
 h+='<h3>Your next action</h3><p><strong>'+esc(na.t)+'</strong>'+(na.m?' <span class="tag">'+na.m+' min</span>':'')+'</p><a class="btn" href="'+na.link+'">Continue</a></div>';
 h+=w2Stuck(false)+w2CarryCard();
 h+=planCard(STEPS2);
 h+='<div class="card"><h2>The six steps</h2>'+STEPS2.map(function(s){var dn=S.w2.steps[s.n];return '<a class="step'+(dn?' done':'')+'" href="#/w2/'+s.n+'"><span class="n">'+(dn?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min &middot; builds on: '+esc(s.b)+'</span></span><span class="mute">'+(dn?"Done":"Open")+'</span></a>';}).join("")+'<p class="mute">Total about '+hm(mins(STEPS2))+', with waiting time between sending and following up. Nothing is sent by this app: you send every message yourself.</p></div>';
 return h+remindCard()+helpCard();
}
function w2s1(){
 w2Touch();
 var ck=w2J("w2s1.check"),h=LC("w2s1.lesson")+LC("w2s1.ex");
 h+='<div class="card"><h2>Quick check</h2>';
 if(ck){
  h+='<p>'+esc(ck.prompt)+'</p>'+w2Chips("w2.quiz1",ck.parts)+'<p><button type="button" class="btn ghost" data-a="w2-mark1">Check my answer</button></p>';
  if(S.w2.quiz1done){var q=S.w2.quiz1,ok=ck.right.every(function(r){return q.indexOf(r)>-1;})&&q.length===ck.right.length;h+='<div class="note '+(ok?"ok":"info")+'" aria-live="polite">'+esc((ok?ck.yes:ck.no)+ck.explain)+'</div>';}
 }else h+='<p class="mute">This check could not be loaded. Please refresh the page.</p>';
 h+='<label>Which part do you find hardest to write? (optional)</label>'+w2Chips("w2.hardest",[["why","The opening observation"],["what","Explaining my product"],["gain","What's in it for them"],["ask","The ask"]],1)+'</div>';
 return shell2(1,h);
}
function w2Practice(){
 var h='<div class="card"><h2>Optional: practise with a friend first <span class="tag">optional</span></h2><p>Nervous about your first message? Try it out loud on someone you trust. <strong>It prepares you. Your real messages are what count.</strong></p><ol><li>Read your draft aloud to a friend, or record yourself on your phone.</li><li>Ask them: Is it clear what I am offering? Would you reply? What would you change?</li></ol>'+w2Chips("w2.practice",[["clear","It was clear"],["reply","They'd reply"],["change","They'd change something"]]);
 h+='<p><button type="button" class="chip" aria-pressed="'+!!S.w2.practiceDone+'" data-a="w2-prac">I\'ve practised</button></p>';
 if(S.w2.practiceDone)h+='<div class="note ok">Nice. Make any changes you noted, then send a real one when you are ready.</div>';
 return h+'</div>';
}
function w2Proposal(c){
 var sk=S.sketch[c.id]||{},inc=incKeys().filter(function(x){return S.focus.inc.indexOf(x[0])>-1;}),P=w2Pieces(c);
 var h='<div class="card"><h2>3. What you are proposing</h2><p class="mute">Check this carefully. The message will only say what is ticked here, and nothing is added that you have not chosen.</p>';
 h+='<label>The collaboration you would like to suggest (choose one)</label>'+sChips(c.id,"ask",ASK);
 h+='<label>Anything you are happy to offer? (optional)</label>';
 if(inc.length)h+=sChips(c.id,"offer",inc);
 else h+='<p class="mute">You have not listed anything you are willing to offer in your product details, so this message will propose the collaboration only. <a href="#/step/1">Add something in Week 1, step 1</a> if you want to.</p>';
 h+='<div class="note '+(P.collabShort?'info':'warn')+'" aria-live="polite"><strong>This message will:</strong> '+(P.collabShort?'suggest '+esc(P.collabShort)+'.':'not suggest anything yet. Choose a collaboration above.')+' '+(P.incText?'It will offer '+esc(P.incText)+'.':'It will not offer any discount, commission or freebie.')+'</div>';
 var miss=[];if(!S.focus.problem)miss.push("what problem it solves");if(!S.focus.outcome)miss.push("what customers get");if(!S.buyer.who)miss.push("who your buyer is");
 if(miss.length)h+='<div class="note info">Your draft will be more specific if you add '+miss.join(", ")+'. <a href="#/step/1">Add it to your product details</a>.</div>';
 return h+'</div>';
}
function w2PitchHtml(c){
 var o=O(c),it=w2Pitch(c),ok=it.filter(function(i){return i.ok;}).length;
 var h='<h3 style="margin-top:0">Pitch Check <span class="tag">learning tool, not a grade</span></h3><p class="mute">'+ok+' of 6 look good. '+w2Words(o.draft)+' words'+(o.channel&&o.channel!=="person"?' (guide: under '+w2Limit(o.channel)+')':'')+'.</p>';
 it.forEach(function(i){h+='<div class="pk">'+(i.ok?"&#10003; ":"&#9744; ")+'<strong>'+esc(i.k)+'</strong><br><span class="mute">What we looked at: '+esc(i.looked)+'</span>'+(i.ok?"":'<br>'+esc(i.tip))+'</div>';});
 var g=w2Guard(c);
 if(g.length)h+='<div class="note warn" role="status"><strong>Check before you send</strong><ul style="margin:6px 0 0 18px;padding:0">'+g.map(function(x){return '<li>'+esc(x.t)+'</li>';}).join("")+'</ul></div>';
 h+='<div class="note info"><strong>What this check can\'t do.</strong> It follows simple rules about structure and tone. It can\'t tell whether this is genuinely relevant to them or good for both of you. That part is your judgement:</div>';
 [["j1","Would their audience genuinely find this useful?"],["j2","Is it clear what's in it for them, not just for you?"],["j3","Would I be glad to receive this message?"]].forEach(function(q){var v=(o.judge||{})[q[0]];h+='<div class="q"><span>'+q[1]+'</span><div class="row"><button type="button" class="chip sm" aria-pressed="'+(v==="yes")+'" data-a="w2-judge" data-id="'+c.id+'" data-k="'+q[0]+'" data-v="yes">Yes</button><button type="button" class="chip sm" aria-pressed="'+(v==="unsure")+'" data-a="w2-judge" data-id="'+c.id+'" data-k="'+q[0]+'" data-v="unsure">Not sure</button></div></div>';});
 if(Object.keys(o.judge||{}).some(function(k){return o.judge[k]==="unsure";}))h+='<div class="note warn">If you are not sure, it may be worth changing the offer or choosing a different partner before you send. A message that is only good for you will not land.</div>';
 return h;
}
function w2Refresh(c){var b=document.getElementById("pitchbox");if(b)b.innerHTML=w2PitchHtml(c);}
function w2s2(){
 w2Touch();
 var sl=shortlisted().sort(byScore);
 var h=LC("w2s2.lesson");
 if(!sl.length)return shell2(2,h+'<div class="note info">You need a shortlisted partner first. Choose one in <a href="#/step/5">Week 1, step 5</a>, then come back here.</div>');
 var cur=cand(S.w2.cur);
 if(!cur||!cur.short){cur=(S.base.comfort&&S.base.comfort<=2?(sl.filter(function(c){return c.type==="known";})[0]||sl[0]):sl[0]);}
 var c=cur,o=O(c),sug=w2Suggest(c);
 h+='<div class="card"><h2>1. Who is it for?</h2><div class="row">'+sl.map(function(x){var ox=S.out[x.id];return '<button type="button" class="chip" aria-pressed="'+(x.id===c.id)+'" data-a="w2-bsel" data-id="'+x.id+'">'+esc(w2Nm(x))+(ox&&ox.status==="sent"?" &#10003;":"")+'</button>';}).join("")+'</div>';
 if(S.base.comfort&&S.base.comfort<=2)h+='<p class="mute">You said you feel less comfortable contacting people, so someone you know is listed first.</p>';
 h+='</div>';
 var gl=w2J("w2.channels")||{};
 h+='<div class="card"><h2>2. How will you reach them?</h2><div class="row">'+W2CH.map(function(ch){return '<button type="button" class="chip" aria-pressed="'+(o.channel===ch[0])+'" data-a="w2-ch" data-id="'+c.id+'" data-v="'+ch[0]+'">'+ch[1]+(sug[0]===ch[0]?" &#9733;":"")+'</button>';}).join("")+'</div><div class="note info"><strong>Suggested for '+esc(w2Nm(c))+':</strong> '+esc(sug[1])+' Choose what feels right for you and them.</div>';
 if(gl[o.channel])h+='<div class="note ok">'+gl[o.channel]+'</div>';
 h+='</div>';
 h+=w2Proposal(c);
 h+='<div class="card"><h2>4. One specific thing you noticed</h2><p class="mute">This is what makes it personal. Something real about their work.</p><div class="row" id="nstarts"'+(o.noticed?' style="display:none"':'')+'>'+[["your recent post about ","A recent post or issue"],["your product, ","A product they sell"],["the question your audience keeps asking about ","Something their audience asks"]].map(function(x){return '<button type="button" class="chip sm" data-a="w2-nstart" data-id="'+c.id+'" data-v="'+esc(x[0])+'">'+x[1]+'</button>';}).join("")+'</div><input type="text" maxlength="300" data-out="noticed" data-oid="'+c.id+'" aria-label="One specific thing you noticed" value="'+esc(o.noticed)+'" placeholder="For example: your recent issue on invoicing a first client" style="margin-top:8px"><label>Tone</label><div class="row">'+W2TONES.map(function(t){return '<button type="button" class="chip sm" aria-pressed="'+(o.tone===t[0])+'" data-a="w2-tone" data-id="'+c.id+'" data-v="'+t[0]+'">'+t[1]+'</button>';}).join("")+'</div></div>';
 h+=w2Practice();
 var hasAsk=!!((S.sketch[c.id]||{}).ask||[]).length;
 h+='<div class="card"><h2>5. Make your draft</h2><p class="mute">This fills a template from your own details. It is not AI, and it adds nothing you have not chosen.</p><div class="row"><button type="button" class="btn" data-a="w2-gen" data-id="'+c.id+'"'+(!o.channel||!hasAsk?" disabled":"")+'>'+(o.draft?"Make another version":"Make my draft")+'</button>'+(o.draft&&o.channel!=="person"?'<button type="button" class="btn ghost" data-a="w2-short" data-id="'+c.id+'">Make it shorter</button>':'')+'</div>';
 if(!o.channel)h+='<p class="mute">Choose how you will reach them first.</p>';else if(!hasAsk)h+='<p class="mute">Choose the collaboration you want to suggest in section 3 first.</p>';
 h+='</div>';
 h+='<div class="two"><div class="card"><h2>Your draft</h2><p class="mute">Read it aloud and change anything that does not sound like you. Nothing is sent from here.</p><textarea maxlength="4000" data-out="draft" data-oid="'+c.id+'" aria-label="Your draft message" placeholder="Your draft appears here. You can also type your own.">'+esc(o.draft)+'</textarea><p class="row"><button type="button" class="chip" data-a="w2-copy">Copy</button>'+(o.prevDraft&&o.prevDraft!==o.draft?'<button type="button" class="chip" data-a="w2-restore" data-id="'+c.id+'">Switch back to my previous draft</button>':'')+'</p></div><div class="card" id="pitchbox" aria-live="polite">'+w2PitchHtml(c)+'</div></div>';
 return shell2(2,h);
}
function w2s3(){
 w2Touch();
 var sl=shortlisted().sort(byScore),h=LC("w2s3.lesson");
 h+='<div class="card"><h2>Pre-send check</h2><p class="mute">Tap each when it is true.</p>'+w2Chips("w2.pre",W2PRE)+'</div>';
 h+=LC("w2s3.contact");
 var ids={},rows=[];sl.forEach(function(c){ids[c.id]=1;rows.push(c);});
 Object.keys(S.out||{}).forEach(function(id){if(!ids[id]&&S.out[id]&&S.out[id].status==="sent")rows.push(w2Cand(id));});
 h+='<div class="card"><h2>Your outreach</h2>';
 if(!rows.length)h+='<p class="mute">No shortlisted partners yet. Choose some in <a href="#/step/5">Week 1, step 5</a>.</p>';
 rows.forEach(function(c){var o=O(c),st=o.status,chn=W2CH.filter(function(x){return x[0]===o.channel;})[0];
  h+='<div class="crow"><span><strong>'+esc(w2Nm(c))+'</strong><br><span class="mute">'+(chn?chn[1]:"No channel chosen")+(o.draft?" &middot; draft ready (Pitch Check "+w2PitchScore(c)+" of 6)":" &middot; no draft yet")+'</span></span><span class="row">';
  if(st==="sent")h+='<span class="tag">'+(o.channel==="person"?"Spoke to them":"Sent")+' on '+esc(dayLab(o.sentAt))+'</span><button type="button" class="chip sm" data-a="w2-unsend" data-id="'+c.id+'">Undo</button>';
  else if(!o.draft&&o.channel!=="person")h+='<a class="chip sm" href="#/w2/2" data-a="w2-bsel" data-id="'+c.id+'">Draft it</a><button type="button" class="chip sm" data-a="w2-sent" data-id="'+c.id+'">I sent my own</button>';
  else h+='<button type="button" class="chip sm" aria-pressed="'+(st==="scheduled")+'" data-a="w2-sched" data-id="'+c.id+'">Scheduled</button><button type="button" class="btn" style="min-height:38px;padding:6px 12px" data-a="w2-sent" data-id="'+c.id+'">I '+(o.channel==="person"?"spoke to them":"sent it")+'</button>';
  h+='</span></div>';
  if(o.ackAsk&&st!=="sent"){var iss=w2Issues(c);h+='<div class="note warn" role="status"><strong>Before you log this</strong> (your call, nothing is blocked):<ul style="margin:6px 0 0 18px;padding:0">'+iss.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><p><button type="button" class="btn" data-a="w2-sent" data-id="'+c.id+'">I have checked, log it anyway</button></p></div>';}
  if(st==="sent"){h+='<p class="mute" style="margin:-2px 0 8px 8px">Follow-up opens '+esc(dayLab(w2FuOpens(o)))+(w2Late(w2FuOpens(o))?'. That falls in Week 3 and carries forward automatically.':'.')+' <label style="display:inline">Sent on <input type="date" data-out="sentAt" data-oid="'+c.id+'" value="'+esc(o.sentAt)+'" max="'+today()+'" aria-label="Date sent" style="width:auto;display:inline-block"></label></p>';}
 });
 h+='</div>';
 if(w2Sent().length)h+='<div class="card"><h2>How did sending feel? (optional)</h2>'+w2Chips("w2.feel",[["easy","Easy"],["nerv","Nervous but done"],["hard","Harder than expected"]],1)+'</div>';
 else h+=w2Stuck(true);
 var wl=w2Waiting();if(wl)h+='<div class="note info">&#9203; '+esc(wl)+'</div>';
 return shell2(3,h);
}
function w2s4(){
 var h=LC("w2s4.lesson"),Qs=w2J("w2s4.quiz")||[];
 h+='<div class="card"><h2>Quick practice: what would you do?</h2>';
 if(!Qs.length)h+='<p class="mute">The practice could not be loaded. Please refresh the page.</p>';
 Qs.forEach(function(q){var sel=S.w2.q4[q[0]];h+='<div class="q"><strong>'+esc(q[1])+'</strong><div class="row" style="flex-direction:column;align-items:stretch">'+q[2].map(function(o){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(sel===o[0])+'" data-a="w2-q4" data-q="'+esc(q[0])+'" data-v="'+esc(o[0])+'">'+esc(o[1])+'</button>';}).join("")+'</div>';
  if(sel)h+='<div class="note '+(sel===q[3]?"ok":"info")+'" aria-live="polite">'+(sel===q[3]?"Good choice. ":"Not quite. ")+esc(q[4])+'</div>';h+='</div>';});
 return shell2(4,h+'</div>');
}
function w2s5(){
 w2Touch();
 var sl=w2Sent(),h=LC("w2s5.lesson");
 if(!sl.length){h+='<div class="note info">Nothing sent yet. When you have sent a message in step 3, it shows up here with its follow-up date.</div>';h+=w2Stuck(true);return shell2(5,h);}
 sl.forEach(function(e){var c=e.c,o=e.o,op=w2FuOpens(o),due=w2Due(e),chn=W2CH.filter(function(x){return x[0]===o.channel;})[0];
  h+='<div class="card"><h2>'+esc(e.name)+'</h2><p class="mute">'+(o.channel==="person"?"Spoke to them":"Sent")+' on '+esc(dayLab(o.sentAt))+(chn?'. '+chn[1]+'.':'.')+'</p><label>What happened?</label><div class="row">'+W2REPLIES.map(function(r){return '<button type="button" class="chip sm" aria-pressed="'+((o.reply||"noreply")===r[0])+'" data-a="w2-reply" data-id="'+c.id+'" data-v="'+r[0]+'">'+r[1]+'</button>';}).join("")+'</div>';
  if(o.reply==="yes"||o.reply==="maybe"||o.reply==="no"){h+='<h3>A reply draft you can edit</h3><textarea maxlength="4000" style="min-height:110px" data-out="ans" data-oid="'+c.id+'" aria-label="Reply draft">'+esc(o.ans||w2AnswerDraft(c))+'</textarea><p><button type="button" class="chip sm" aria-pressed="'+!!o.answered+'" data-a="w2-answered" data-id="'+c.id+'">I have answered</button></p>';}
  else if(o.fuSent){h+='<div class="note ok">Follow-up sent on '+esc(dayLab(o.fuAt))+'. Nothing more to do unless they reply. No reply is common, and it rarely means your idea was poor.</div>';}
  else if(!due){h+='<div class="note info">&#9203; Waiting. The follow-up opens on <strong>'+esc(dayLab(op))+'</strong>'+(w2Late(op)?'. That is in Week 3 and it carries forward automatically.':'.')+' Nothing to do until then.</div>';}
  else{h+='<div class="note warn">The follow-up is due. Add one new piece of value rather than "just checking in".</div><label>What will you add?</label><div class="row">'+W2FUV.map(function(f){return '<button type="button" class="chip sm" aria-pressed="'+((o.fuValue||[])[0]===f)+'" data-a="w2-fuv" data-id="'+c.id+'" data-v="'+esc(f)+'">'+f+'</button>';}).join("")+'</div><textarea maxlength="4000" style="min-height:120px;margin-top:8px" data-out="fuDraft" data-oid="'+c.id+'" aria-label="Follow-up draft">'+esc(o.fuDraft||w2FuDraft(c))+'</textarea><p class="mute">Replace anything in [square brackets] with something true and specific before you send. Nothing is sent from here.</p><p><button type="button" class="btn" data-a="w2-fusent" data-id="'+c.id+'">I sent the follow-up</button></p>';}
  h+='</div>';});
 h+='<div class="card"><h2>What do you think made the difference? (optional)</h2>'+w2Chips("w2.diff",[["why","The opening observation"],["gain","The offer"],["ask","The ask"],["partner","The partner choice"],["time","Timing"],["unsure","I am not sure"]],1)+'</div>';
 return shell2(5,h);
}
function w2s6(){
 w2Touch();
 var sl=shortlisted(),sent=w2Sent(),replied=sent.filter(function(e){var r=e.o.reply;return r&&r!=="noreply";}),opp=sent.filter(function(e){return e.o.reply==="yes";}),maybe=sent.filter(function(e){return e.o.reply==="maybe";}),fu=sent.filter(function(e){return e.o.fuSent;});
 var dr=sl.filter(function(c){return O(c).draft;}),avg=dr.length?Math.round(dr.reduce(function(a,c){return a+w2PitchScore(c);},0)/dr.length*10)/10:null;
 var h=LC("w2s6.lesson")+'<div class="card"><h2>Your Week 2 summary</h2><div class="row"><div class="stat"><b>'+sent.length+'</b>Messages sent</div><div class="stat"><b>'+replied.length+'</b>Replies received</div><div class="stat"><b>'+opp.length+'</b>Opportunities created</div></div>';
 h+='<p style="margin-top:10px">Follow-ups sent: '+fu.length+'. "Maybe later" replies: '+maybe.length+'.'+(avg!==null?' Average Pitch Check: '+avg+' of 6 (a learning indicator, not a grade).':'')+'</p>';
 if(sent.length&&sent.length<10)h+='<div class="note info">This is a small sample. It tells you what happened, not what will always happen, so we show counts, not percentages.</div>';
 var p=w2Pending(),na=w2NeedsAnswer();
 if(p.length||na.length){h+='<h3>Carrying into Week 3</h3>';na.forEach(function(e){h+='<div class="crow"><span>Answer '+esc(e.name)+'</span><span class="mute">Reply needs an answer</span></div>';});p.forEach(function(e){var d=w2FuOpens(e.o);h+='<div class="crow"><span>Follow up with '+esc(e.name)+'</span><span class="mute">'+(d<=today()?"Due now":"Opens "+esc(dayLab(d)))+'</span></div>';});}
 h+='</div>';
 var rec=w2Rec();
 h+='<div class="card"><h2>Recommended next step</h2><div class="note '+rec.c+'"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div>';
 if(!sent.length)h+=w2Stuck(true);
 h+='<h3>Your decision</h3>';
 [["ready","Ready for Week 3"],["another","I would like to message another partner first"],["change","I want to change my approach"],["help","I would like help in the group session"],["notready","I am not ready to contact anyone yet"]].forEach(function(o){h+='<p><button type="button" class="chip" aria-pressed="'+(S.w2.dec===o[0])+'" data-a="w2-dec" data-val="'+o[0]+'">'+o[1]+'</button></p>';});
 if(S.w2.dec==="notready")h+=LC("w2.notready");
 h+='<label>Optional: how do you feel about contacting people now, compared with Week 1?</label>'+w2Chips("w2.comfort2",[["more","More comfortable"],["same","About the same"],["less","Less comfortable"]],1)+'</div>';
 h+='<div class="note info"><strong>Week 3 is next.</strong> Anything still open, like follow-ups and replies, carries forward automatically and stays saved. You can come back to Week 2 at any time.</div>';
 return shell2(6,h);
}
function w2Log(c){var o=OW(c);o.status="sent";o.sentAt=today();o.ackAsk=false;o.name=w2Nm(c);}
async function w2Copy(t){
 var ta=document.querySelector("textarea[data-out=draft]");
 function ok(){t.textContent="Copied";}
 function manual(){if(ta){ta.focus();ta.select();}t.textContent="Select all and copy by hand";}
 try{if(navigator.clipboard&&navigator.clipboard.writeText&&ta){await navigator.clipboard.writeText(ta.value);ok();}else manual();}catch(e){manual();}
}
function w2Action(a,d,t){
 var c,o,keep=false;
 if(a==="w2-week"){S.week=+d.val===2&&week1Done()?2:1;route="#/sprint";save();window.scrollTo(0,0);}
 else if(a==="w2-done"){S.w2.steps[d.n]=!S.w2.steps[d.n];save();}
 else if(a==="w2-mark1"){S.w2.quiz1done=true;save();}
 else if(a==="w2-prac"){S.w2.practiceDone=!S.w2.practiceDone;save();}
 else if(a==="w2-bsel"){S.w2.cur=+d.id;save();if(t.tagName==="A"){route="#/w2/2";window.scrollTo(0,0);}}
 else if(a==="w2-ch"){OW(w2Cand(d.id)).channel=d.v;save();}
 else if(a==="w2-tone"){OW(w2Cand(d.id)).tone=d.v;save();}
 else if(a==="w2-nstart"){o=OW(w2Cand(d.id));if(!(o.noticed||"").trim())o.noticed=d.v;save();}
 else if(a==="w2-gen"||a==="w2-short"){c=w2Cand(d.id);o=OW(c);if((o.draft||"").trim()&&o.draft!==o.prevDraft)o.prevDraft=o.draft;o.v=(a==="w2-gen"&&o.draft)?(o.v||0)+1:(o.v||0);o.draft=w2Compose(c,o,o.v,a==="w2-short");o.ackAsk=false;save();}
 else if(a==="w2-judge"){o=OW(w2Cand(d.id));o.judge=o.judge||{};o.judge[d.k]=(o.judge[d.k]===d.v)?"":d.v;save();}
 else if(a==="w2-copy"){w2Copy(t);return;}
 else if(a==="w2-restore"){o=OW(w2Cand(d.id));var rt=o.draft;o.draft=o.prevDraft;o.prevDraft=rt;save();}
 else if(a==="w2-sched"){o=OW(w2Cand(d.id));if(o.status!=="sent")o.status=(o.status==="scheduled"?"":"scheduled");save();}
 else if(a==="w2-sent"){c=w2Cand(d.id);o=OW(c);if(w2Issues(c).length&&!o.ackAsk){o.ackAsk=true;save();}else{w2Log(c);save();}}
 else if(a==="w2-unsend"){o=OW(w2Cand(d.id));o.status="";o.sentAt="";o.reply="";o.repliedAt="";o.fuSent=false;o.fuAt="";o.answered=false;o.ackAsk=false;save();}
 else if(a==="w2-reply"){o=OW(w2Cand(d.id));o.reply=d.v==="noreply"?"":d.v;o.repliedAt=o.reply?today():"";o.answered=false;save();}
 else if(a==="w2-answered"){o=OW(w2Cand(d.id));o.answered=!o.answered;save();}
 else if(a==="w2-fuv"){o=OW(w2Cand(d.id));o.fuValue=[d.v];o.fuDraft="";save();}
 else if(a==="w2-fusent"){o=OW(w2Cand(d.id));o.fuSent=true;o.fuAt=today();save();}
 else if(a==="w2-q4"){S.w2.q4[d.q]=d.v;save();}
 else if(a==="w2-dec"){S.w2.dec=S.w2.dec===d.val?"":d.val;save();}
 else return;
 render();
}
function w2Input(t){
 var k=t.dataset.out;if(!W2OUTKEYS[k])return;
 var c=w2Cand(t.dataset.oid),o=OW(c);o[k]=t.value;
 if(k==="draft"||k==="noticed")o.ackAsk=false;
 if(k==="noticed"){var nr=document.getElementById("nstarts");if(nr)nr.style.display=t.value.trim()?"none":"";}
 save();
 if(k==="draft"||k==="noticed")w2Refresh(c);
}
function w2DateChange(t){
 var v=String(t.value||""),c=w2Cand(t.dataset.oid),o=OW(c);
 if(parseYmd(v)!=null&&v<=today()){o.sentAt=v;save();}
 render();
}
function w2fix(o){
 var b=blank(),w=(o.w2&&typeof o.w2==="object"&&!Array.isArray(o.w2))?o.w2:{},r=clone(b.w2);
 Object.keys(r).forEach(function(k){if(w[k]!==undefined&&w[k]!==null&&typeof w[k]===typeof r[k]&&Array.isArray(w[k])===Array.isArray(r[k]))r[k]=w[k];});
 o.w2=r;
 var out=(o.out&&typeof o.out==="object"&&!Array.isArray(o.out))?o.out:{},fixed={};
 Object.keys(out).forEach(function(id){var x=out[id];if(!x||typeof x!=="object"||Array.isArray(x))return;var n=clone(W2DEF);Object.keys(n).forEach(function(k){if(x[k]!==undefined&&x[k]!==null&&typeof x[k]===typeof n[k]&&Array.isArray(x[k])===Array.isArray(n[k]))n[k]=x[k];});fixed[id]=n;});
 o.out=fixed;
 return o;
}

/* ---------- M5a: Week 3, from replies to one small collaboration (template based, nothing is ever sent by the app) ---------- */
var STEPS3=[
 {n:1,t:"Learn what a small collaboration can look like",m:30,b:"Nothing. Read it while you wait for replies."},
 {n:2,t:"Deal with what is carried forward from Week 2",m:40,b:"Your Week 2 messages and replies."},
 {n:3,t:"Shape one collaboration and draft your proposal",m:50,b:"A partner (ideally one who replied) and your Week 1 sketch."},
 {n:4,t:"Pre-send check, send your proposal, log it",m:30,b:"A proposal draft from step 3."},
 {n:5,t:"Set up how you will measure it, and prepare",m:45,b:"Step 4. Full preparation waits until a partner shows real interest."},
 {n:6,t:"Review Week 3 and decide what is next",m:25,b:"Whatever you have done so far."}
];
var W3OPTS=[
 {k:"mention",t:"Product mention or referral",tier:"Quick",prep:30,del:15,what:"They mention your product to their audience, with your link.",light:""},
 {k:"swap",t:"Audience swap",tier:"Quick",prep:45,del:30,what:"You each mention the other to your own audiences.",light:""},
 {k:"resource",t:"Shared resource",tier:"Involved",prep:120,del:30,what:"A short checklist or template made for their audience.",light:"Lighter version: a one page checklist, or adapt something you already have."},
 {k:"guest",t:"Guest newsletter or blog contribution",tier:"Involved",prep:150,del:30,what:"You write one short piece for their newsletter or blog.",light:"Lighter version: a 300 word tip instead of a full article."},
 {k:"live",t:"Joint LIVE session or Q&A",tier:"Involved",prep:120,del:60,what:"A short live chat or Q&A together.",light:"Lighter version: three prepared questions, 20 minutes, inside their existing group."}
];
var W3ASK=[["yesno","A quick yes or no on the idea"],["chat","A short chat to agree the details"],["date","A date that suits them"]];
var W3ASKP={yesno:"a quick yes or no on this idea",chat:"a short chat to agree the details",date:"a date that suits you"};
var W3MEAS=[["link","A link only this partner uses"],["code","A code only this partner's audience gets"],["ask","A short question: how did you hear about this?"],["count","A simple count of replies and questions"]];
var W3MEASP={link:"a link only your audience uses",code:"a code just for your audience",ask:"a quick question asking how people heard about it",count:"a simple count of replies and questions"};
var W3PRE=[["a","The idea gives their audience something real"],["b","I am asking for one thing"],["c","If money, a commission, a free product or a swap is involved, I have said so"],["d","I have not made claims I cannot back up"],["e","I am using a normal way to reach them, and writing to them personally"],["f","They can easily say no or ask for something different"]];
var W3REPLY=[["agreed","Agreed"],["changes","Wants changes"],["maybe","Maybe later"],["no","No"],["noreply","No reply yet"]];
var W3CHG=[["opening","The opening observation"],["offer","The offer"],["ask","The ask"],["channel","The channel"],["partner","The type of partner"],["none","Nothing yet"]];
var W3MSET=[["a","I know what I will count (clicks, replies, enquiries or orders)"],["b","I have created the link or code in my own tools, and tested it"],["c","The partner knows what I will count, and I will share it back"],["d","I have written down the start date and the end date"]];
var W3PATHN={agreed:"Collaboration agreed",waiting:"Proposal sent, waiting",changes:"Partner wants changes",closed:"Maybe later or no",replies:"Replies, no agreement yet",none:"Messages sent, no replies yet",notyet:"Not yet contacted anyone"};
var W3DEF={pid:0,opt:"",simp:false,gets:"",each:"",ask:"",meas:"",channel:"",tone:"warm",draft:"",prevDraft:"",v:0,status:"",sentAt:"",reply:"",repliedAt:"",note:"",runStart:"",runEnd:"",assets:[],ackAsk:false,name:""};
var W3KEYS={draft:1,gets:1,each:1,note:1};

/* ===== W3 LOGIC START: pure rules, checked by dev/m5a_logic_tests.js ===== */
function CL(){return S.col||W3DEF;}
function w3Opt(k){for(var i=0;i<W3OPTS.length;i++){if(W3OPTS[i].k===k)return W3OPTS[i];}return null;}
function w3Fmt(m){return m>=60?(Math.floor(m/60)+" hr"+(m%60?" "+(m%60)+" min":"")):m+" min";}
function w3Effort(c){var o=w3Opt(c.opt);if(!o)return null;var p=o.prep,d=o.del;if(c.simp&&o.light){p=Math.round(p*0.5);d=Math.round(d*0.6);}return {prep:p,del:d,tot:p+d};}
function week2Done(){return STEPS2.filter(function(s){return S.w2.steps[s.n];}).length===6||S.w2.dec==="ready";}
function w3Pick(){
 var yes=w2Sent().filter(function(e){return e.o.reply==="yes";})[0];if(yes)return yes.id;
 var sl=shortlisted().sort(byScore),known=sl.filter(function(x){return x.type==="known";})[0];
 if(known)return known.id;return sl[0]?sl[0].id:0;
}
function w3Money(c){var p=c.pid?w2Cand(c.pid):null,off=p?w2Offered(p):[];return c.opt==="swap"||off.indexOf("comm")>-1||off.indexOf("free")>-1||off.indexOf("disc")>-1||off.indexOf("trial")>-1||off.indexOf("give")>-1;}
function w3Suggest(c){var p=c.pid?w2Cand(c.pid):null;if(!p)return "";var inc=w2IncPhrases(p,true);return inc.length?joinAnd(inc):"";}
function w3Compose(c){
 var p=c.pid?w2Cand(c.pid):{id:0,name:"Partner",type:"host"},o=O(p),replied=o.reply==="yes"||o.reply==="maybe";
 var P={person:p.type==="known",name:w2Nm(p)},g=w2Greet(P,c.tone),s=w2Sign(c.tone),ch=c.channel,pn=S.focus.product||"my product";
 var gets=(c.gets||"").trim()||"[what their audience gets]",each=(c.each||"").trim()||"[what we each do]",ask=W3ASKP[c.ask]||"[your one ask]",meas=W3MEASP[c.meas]||"[how we will both see whether it worked]";
 var disc=w3Money(c)?" If it goes ahead, please say clearly that "+(c.opt==="swap"?"we are mentioning each other":"something is being offered or exchanged")+", so your audience can trust it.":"";
 var intro=replied?"Thanks for getting back to me.":"I wanted to share one small idea.";
 var out="Be open about the way out: it is completely fine to say no, change any part of it, or suggest something different.";
 var t;
 if(ch==="person")return "Conversation outline (no script, just a guide)\n\n1. Say thanks, and that you have one small idea.\n2. What their audience gets: "+gets+"\n3. What you each do: "+each+"\n4. What you are asking for: "+ask+"\n5. How you will both see whether it worked: "+meas+"\n6. Leave it open: it is fine to say no or change any of it."+(disc?"\n7. Say clearly if anything is being offered or exchanged.":"")+"\n\nAfterwards, offer to send a short note so you both have it in writing.";
 if(ch==="dm")t=g+" "+intro+" One small idea about "+pn+": what your audience gets is "+gets+", and "+each+". Could I ask for "+ask+"? We could both see how it went with "+meas+"."+disc+" No pressure at all, and I am happy to change any part of it.";
 else if(ch==="form")t="Hello, I am [Your name]. "+intro+" Here is one small idea about "+pn+". What your audience gets: "+gets+". What we each do: "+each+". What I am asking for: "+ask+". We could both see whether it worked with "+meas+"."+disc+" It is completely fine to say no or suggest something different. Thank you for your time.";
 else t="Subject: A small idea for your audience\n\n"+g+"\n\n"+intro+" Here is one small idea about "+pn+".\n\nWhat your audience gets: "+gets+".\nWhat we each do: "+each+".\nWhat I am asking for: "+ask+".\nHow we would both see whether it worked: "+meas+"."+disc+"\n\n"+out+"\n\n"+s;
 return w2Contract(t,c.tone);
}
function w3Guard(c){var p=c.pid?w2Cand(c.pid):{id:0,name:"Partner",type:"host"};return w2GuardText(c.draft,p);}
function w3Pitch(c){
 var t=c.draft||"",low=t.toLowerCase(),res=[],g=w3Guard(c);
 var gw=(c.gets||"").toLowerCase().split(/[^a-z0-9']+/).filter(function(w){return w.length>3;}),gh=gw.filter(function(w){return low.indexOf(w)>-1;}).length,iG=low.search(/what your audience gets|your audience gets|for your audience/),iA=low.search(/i am asking|i'm asking|could i ask/);
 res.push({k:"Their audience's gain is clear and comes first",ok:(c.gets||"").trim().length>0&&gh>=Math.min(2,gw.length)&&iG>-1&&(iA<0||iG<iA),looked:"Whether what their audience gets is stated before the ask.",tip:"Say what their audience gets before you ask for anything."});
 res.push({k:"What each of us does is stated",ok:(c.each||"").trim().length>0&&(low.indexOf(((c.each||"").toLowerCase().split(/[^a-z0-9']+/).filter(function(w){return w.length>3;})[0])||"@@")>-1||/we each do/.test(low)),looked:"Whether each side's part is written down.",tip:"Add two short lines: what you do and what they do."});
 var asks=(low.match(/i am asking|i'm asking|could i ask/g)||[]).length;
 res.push({k:"One clear ask",ok:asks===1&&!!W3ASKP[c.ask],looked:"How many separate requests the proposal makes.",tip:asks<1?"Choose the one thing you are asking for.":"Keep to one ask."});
 res.push({k:"The way to measure it is stated",ok:!!W3MEASP[c.meas]&&low.indexOf(W3MEASP[c.meas])>-1,looked:"Whether you both know how you will see whether it worked.",tip:"Pick one simple measure and say it in the proposal."});
 res.push({k:"An easy way out or an alternative",ok:/(no pressure|say no|change any part|suggest something different|happy to change)/.test(low),looked:"Whether the partner can easily say no or ask for something else.",tip:"Add a line that makes it easy to say no or change it."});
 var bad=g.some(function(x){return x.k==="offer"||x.k==="claims"||x.k==="urgency";});
 res.push({k:"Honest and free of pressure",ok:t.length>0&&!bad,looked:"Whether there is pressure, big promises, income claims, or an offer you have not chosen.",tip:"Remove urgency and promises you cannot back up."});
 return res;
}
function w3PitchScore(c){return w3Pitch(c).filter(function(i){return i.ok;}).length;}
function w3Issues(c){var iss=w3Guard(c).map(function(x){return x.t;});if((S.w3.pre||[]).length<W3PRE.length)iss.push("The pre-send checklist is not fully ticked yet.");if(!(c.draft||"").trim())iss.push("There is no proposal draft yet.");return iss;}
function w3Carry(){
 var d=S.w3.dismiss||{},ans=w2NeedsAnswer().filter(function(e){return !d[e.id];}),pend=w2Pending().filter(function(e){return !d[e.id];});
 return {answer:ans,due:pend.filter(function(e){return w2Due(e);}),notDue:pend.filter(function(e){return !w2Due(e);}),maybe:w2Sent().filter(function(e){return e.o.reply==="maybe"&&!d[e.id];})};
}
function w3Path(){
 var c=CL(),sent=w2Sent();
 if(c.reply==="agreed")return "agreed";
 if(c.status==="proposed"){if(c.reply==="changes")return "changes";if(c.reply==="maybe"||c.reply==="no")return "closed";return "waiting";}
 if(!sent.length)return "notyet";
 return sent.some(function(e){return e.o.reply==="yes"||e.o.reply==="maybe"||e.o.reply==="no";})?"replies":"none";
}
function w3Rec(){
 var k=w3Path(),n=w2Sent().length;
 if(k==="agreed")return {c:"ok",t:"Recommended: run it in Week 4",b:"A collaboration is agreed. Week 4 helps you run it and record what happens. Your dates and your measure are already set."};
 if(k==="waiting")return {c:"info",t:"Carry your proposal into Week 4",b:"Your proposal is out and waiting. Prepare lightly, message another partner if you would like a second chance, and note the date you will check back."};
 if(k==="changes")return {c:"info",t:"Adjust it once, then send the revised version",b:"They would like some changes. Adjust the canvas once, send the revised proposal, and carry on."};
 if(k==="closed")return {c:"info",t:"Thank them, then choose your next partner",b:"A maybe later or a no is a normal result. Thank them, and choose the next partner on your shortlist using what you have learned."};
 if(k==="replies")return {c:"info",t:"Shape one small proposal with the partner who replied",b:"You have replies but no proposal out yet. One small collaboration is enough."};
 if(k==="none"&&n>=3)return {c:"warn",t:"No replies yet. Check before sending more",b:"Look at your Pitch Check ticks and your partners' fit scores before sending more. Quality and fit come first."};
 if(k==="none")return {c:"info",t:"Too early to judge",b:"There is not enough yet to learn from. Wait for the follow-up window, then change one thing and try another partner."};
 return {c:"info",t:"Nothing sent yet",b:"That is okay. Tell us what got in the way and we will point you to the right help. Starting with someone you know, or practising with a friend, often makes the first one easier."};
}
function w3NextAction(){
 var cr=w3Carry();
 if(cr.answer[0])return {t:"Answer "+cr.answer[0].name+"'s reply",link:"#/w3/2"};
 if(cr.due[0])return {t:"Follow up with "+cr.due[0].name,link:"#/w3/2"};
 var k=w3Path();
 if(k==="waiting")return {t:"Waiting for a reply to your proposal. Nothing to do yet.",link:"#/w3/5",wait:true};
 if(k==="notyet")return {t:"Send one message to someone you know",link:"#/w2/2"};
 for(var i=0;i<STEPS3.length;i++){var n=STEPS3[i].n;if(!S.w3.steps[n])return {t:"Step "+n+": "+STEPS3[i].t,link:"#/w3/"+n,m:STEPS3[i].m};}
 return {t:"Open your Week 3 review",link:"#/w3/6"};
}
/* ===== W3 LOGIC END ===== */

function shell3(n,body){
 var s=STEPS3[n-1],dn=S.w3.steps[n];
 var h='<a class="back" href="#/sprint" data-a="w3-week" data-val="3">&larr; My Sprint</a><h1>Week 3 &middot; Step '+n+' of 6</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p>'+glance(3,n)+'<p class="mute">You will need: '+esc(s.b)+' Everything saves automatically. Do the steps in any order that suits you.</p>';
 h+=body+'<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="w3-done" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<6?'<a class="btn ghost" href="#/w3/'+(n+1)+'">Next step &rarr;</a>':'<a class="btn ghost" href="#/sprint" data-a="w3-week" data-val="3">Back to My Sprint</a>')+'</div>';
 return h;
}
function w3Chip(path,opts,max){return chipsHtml(path,opts,max);}
function w3SetChips(field,opts){var c=CL();return '<div class="row">'+opts.map(function(o){return '<button type="button" class="chip" aria-pressed="'+(c[field]===o[0])+'" data-a="w3-set" data-f="'+field+'" data-v="'+esc(o[0])+'">'+esc(o[1])+'</button>';}).join("")+'</div>';}
function home3(){
 var d=STEPS3.filter(function(s){return S.w3.steps[s.n];}).length,na=w3NextAction(),left=STEPS3.filter(function(s){return !S.w3.steps[s.n];}).reduce(function(a,s){return a+s.m;},0);
 var h='<div class="card"><div class="row" style="justify-content:space-between"><strong>'+d+' of 6 steps done</strong><span class="mute">About '+hm(left)+' left</span></div><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/6*100)+'%"></i></div>';
 h+='<div class="note info" style="margin-top:12px"><strong>Where you are:</strong> '+W3PATHN[w3Path()]+'. Your steps and suggestions adapt to this.</div>';
 h+='<h3>Your next action</h3><p><strong>'+esc(na.t)+'</strong>'+(na.m?' <span class="tag">'+na.m+' min</span>':'')+'</p><a class="btn'+(na.wait?' ghost':'')+'" href="'+na.link+'">'+(na.wait?'Open':'Continue')+'</a></div>';
 h+=planCard(STEPS3);
 h+='<div class="card"><h2>The six steps</h2>'+STEPS3.map(function(s){var dn=S.w3.steps[s.n];return '<a class="step'+(dn?' done':'')+'" href="#/w3/'+s.n+'"><span class="n">'+(dn?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min &middot; builds on: '+esc(s.b)+'</span></span><span class="mute">'+(dn?"Done":"Open")+'</span></a>';}).join("")+'<p class="mute">Total about '+hm(mins(STEPS3))+'. Nothing is sent by this app: you send every message yourself.</p></div>';
 return h+remindCard()+helpCard();
}
function w3s1(){
 var ck=w2J("w3s1.check"),h=LC("w3s1.lesson");
 h+='<div class="card"><h2>The five options</h2>'+W3OPTS.map(function(o){return '<div class="crow" style="display:block"><p style="margin:0"><strong>'+esc(o.t)+'</strong> <span class="tag">'+o.tier+'</span></p><p class="mute" style="margin:2px 0">'+esc(o.what)+' About '+w3Fmt(o.prep+o.del)+' for you.'+(o.light?' '+esc(o.light):'')+'</p></div>';}).join("")+'</div>';
 h+=LC("w3s1.ex");
 h+='<div class="card"><h2>Quick check: which option fits?</h2>';
 if(ck){ck.forEach(function(q){var sel=S.w3.quiz[q.id];h+='<div class="q"><strong>'+esc(q.p)+'</strong><div class="row">'+W3OPTS.map(function(o){return '<button type="button" class="chip sm" aria-pressed="'+(sel===o.k)+'" data-a="w3-quiz" data-q="'+esc(q.id)+'" data-v="'+o.k+'">'+esc(o.t)+'</button>';}).join("")+'</div>';if(sel)h+='<div class="note '+(sel===q.best?"ok":"info")+'" aria-live="polite">'+(sel===q.best?"Good choice. ":"Another could work. ")+esc(q.why)+'</div>';h+='</div>';});}
 else h+='<p class="mute">This check could not be loaded. Please refresh the page.</p>';
 h+='<label>Which option feels realistic for you? (optional)</label>'+w3Chip("w3.learn",W3OPTS.map(function(o){return [o.k,o.t];}),1)+'</div>';
 return shell3(1,h);
}
function w3s2(){
 var cr=w3Carry(),h=LC("w3s2.lesson"),any=cr.answer.length+cr.due.length+cr.notDue.length+cr.maybe.length;
 if(!w2Sent().length){h+='<div class="card"><h2>Start here</h2><p>You have not sent a first message yet, and that is okay. Choose one person you already know, use the Week 2 Message Builder, and send it. Your Week 3 simply starts a little later. You are not behind, and nothing is locked.</p><p><a class="btn" href="#/w2/2">Open the Message Builder</a></p></div>';return shell3(2,h);}
 if(!any)h+='<div class="note ok">Nothing is waiting from Week 2. You can go straight to step 3.</div>';
 var card=function(e,kind){var o=e.o;return '<div class="card"><h2>'+esc(e.name)+'</h2>'+kind+'<p class="row"><button type="button" class="chip sm" data-a="w3-dismiss" data-id="'+e.id+'">I would rather leave this one</button></p></div>';};
 cr.answer.forEach(function(e){h+=card(e,'<p>They replied: <strong>'+(e.o.reply==="yes"?"yes or tell me more":e.o.reply)+'</strong>. A short answer keeps things moving.</p><p class="row"><a class="btn" href="#/w2/5">Open the reply draft</a><button type="button" class="chip" data-a="w2-answered" data-id="'+e.id+'">I have answered</button></p>');});
 cr.due.forEach(function(e){h+=card(e,'<p>The follow-up window has opened. One short follow-up that adds something useful is plenty.</p><p class="row"><a class="btn" href="#/w2/5">Open the follow-up draft</a><button type="button" class="chip" data-a="w2-fusent" data-id="'+e.id+'">I sent the follow-up</button></p>');});
 cr.notDue.forEach(function(e){h+=card(e,'<p class="mute">The follow-up opens on '+esc(dayLab(w2FuOpens(e.o)))+'. Nothing to do until then.</p>');});
 cr.maybe.forEach(function(e){h+=card(e,'<p class="mute">They said maybe later. A gentle check back around '+esc(dayLab(addDays(e.o.repliedAt||today(),30)))+' is plenty.</p>');});
 h+='<div class="card"><h2>What do you think made the difference? (optional)</h2>'+w3Chip("w2.diff",[["why","The opening observation"],["gain","The offer"],["ask","The ask"],["partner","The partner choice"],["time","Timing"],["unsure","I am not sure"]],1)+'<div class="note info">This is a small sample. It tells you what happened, not what will always happen.</div></div>';
 return shell3(2,h);
}
function w3Refresh(){var b=document.getElementById("pitch3");if(b)b.innerHTML=w3PitchHtml();}
function w3PitchHtml(){
 var c=CL(),it=w3Pitch(c),ok=it.filter(function(i){return i.ok;}).length,g=w3Guard(c);
 var h='<h3 style="margin-top:0">Proposal Check <span class="tag">learning tool, not a grade</span></h3><p class="mute">'+ok+' of 6 look good. '+w2Words(c.draft)+' words.</p>';
 it.forEach(function(i){h+='<div class="pk">'+(i.ok?"&#10003; ":"&#9744; ")+'<strong>'+esc(i.k)+'</strong><br><span class="mute">What we looked at: '+esc(i.looked)+'</span>'+(i.ok?"":'<br>'+esc(i.tip))+'</div>';});
 if(g.length)h+='<div class="note warn" role="status"><strong>Check before you send</strong><ul style="margin:6px 0 0 18px;padding:0">'+g.map(function(x){return '<li>'+esc(x.t)+'</li>';}).join("")+'</ul></div>';
 return h+'<div class="note info"><strong>What this check can\'t do.</strong> It follows simple rules about structure and tone. It cannot tell whether this is genuinely good for both of you. That is your judgement.</div>';
}
function w3s3(){
 var c=CL(),sl=shortlisted().sort(byScore),ids={},rows=[];sl.forEach(function(x){ids[x.id]=1;rows.push(x);});
 Object.keys(S.out||{}).forEach(function(id){if(!ids[id]&&S.out[id]&&S.out[id].status==="sent")rows.push(w2Cand(id));});
 var h=LC("w3s3.lesson");
 if(!rows.length)return shell3(3,h+'<div class="note info">You need a partner first. Choose one in <a href="#/step/5">Week 1, step 5</a>, or send a first message in <a href="#/w2/2">Week 2</a>.</div>');
 var pid=c.pid||w3Pick(),p=w2Cand(pid),o=w3Opt(c.opt),ef=w3Effort(c);
 h+='<div class="card"><h2>1. Who is it for?</h2><p class="mute">Only one collaboration is needed. A partner who replied is a good start.</p><div class="row">'+rows.map(function(x){var ox=O(x);return '<button type="button" class="chip" aria-pressed="'+(x.id==pid)+'" data-a="w3-pid" data-id="'+x.id+'">'+esc(w2Nm(x))+(ox.reply==="yes"?" (replied)":"")+'</button>';}).join("")+'</div></div>';
 h+='<div class="card"><h2>2. Choose the smallest option that could teach you something</h2><div class="row">'+W3OPTS.map(function(x){return '<button type="button" class="chip" aria-pressed="'+(c.opt===x.k)+'" data-a="w3-set" data-f="opt" data-v="'+x.k+'">'+esc(x.t)+' ('+x.tier+')</button>';}).join("")+'</div>';
 if(o){h+='<div class="note info"><strong>'+esc(o.t)+':</strong> '+esc(o.what)+'</div>'+(o.light?'<p class="row"><button type="button" class="chip" aria-pressed="'+!!c.simp+'" data-a="w3-simp">Use the lighter version</button></p><p class="mute">'+esc(o.light)+'</p>':'');
  h+='<div class="note '+(ef.tot>180?"warn":"ok")+'">About '+w3Fmt(ef.prep)+' to prepare and '+w3Fmt(ef.del)+' to deliver, so about '+w3Fmt(ef.tot)+' of your 3 to 5 hours a week.'+(ef.tot>180?' That is a lot for one week. Consider a lighter option or the lighter version.':'')+'</div>';}
 h+='</div>';
 var sug=w3Suggest(c.pid?c:{pid:pid});
 h+='<div class="card"><h2>3. The four boxes</h2><p class="mute">Keep each one short. Nothing is added that you have not written or chosen.</p><label>What their audience gets</label><textarea maxlength="500" style="min-height:70px" data-col="gets" aria-label="What their audience gets" placeholder="For example: a free copy for your readers to try">'+esc(c.gets)+'</textarea>'+(sug&&!(c.gets||"").trim()?'<p class="row"><button type="button" class="chip sm" data-a="w3-fill" data-v="gets">Use what I chose in Week 1: '+esc(sug)+'</button></p>':'')+'<label>What we each do</label><textarea maxlength="500" style="min-height:70px" data-col="each" aria-label="What we each do" placeholder="Two short lines: what you do, and what they do">'+esc(c.each)+'</textarea><label>What I am asking for (one thing)</label>'+w3SetChips("ask",W3ASK)+'<label>How we will both see whether it worked</label>'+w3SetChips("meas",W3MEAS)+'<p class="mute">The Sales Lab does not create links or codes for you. You make them in your own tools.</p></div>';
 h+='<div class="card"><h2>4. How will you reach them?</h2><div class="row">'+W2CH.map(function(ch){return '<button type="button" class="chip" aria-pressed="'+(c.channel===ch[0])+'" data-a="w3-set" data-f="channel" data-v="'+ch[0]+'">'+ch[1]+'</button>';}).join("")+'</div><label>Tone</label><div class="row">'+W2TONES.map(function(t){return '<button type="button" class="chip sm" aria-pressed="'+(c.tone===t[0])+'" data-a="w3-set" data-f="tone" data-v="'+t[0]+'">'+t[1]+'</button>';}).join("")+'</div></div>';
 var ready=c.opt&&c.ask&&c.meas&&c.channel;
 h+='<div class="card"><h2>5. Make your proposal</h2><p class="mute">This fills a template from your own words. It is not AI.</p><button type="button" class="btn" data-a="w3-gen"'+(ready?'':' disabled')+'>'+(c.draft?"Make another version":"Make my proposal")+'</button>'+(ready?'':'<p class="mute">Choose an option, one ask, one measure and a channel first.</p>')+'</div>';
 h+='<div class="two"><div class="card"><h2>Your proposal</h2><p class="mute">Read it aloud and change anything that does not sound like you. Nothing is sent from here.</p><textarea maxlength="4000" data-col="draft" aria-label="Your proposal" placeholder="Your proposal appears here.">'+esc(c.draft)+'</textarea><p class="row"><button type="button" class="chip" data-a="w3-copy">Copy</button>'+(c.prevDraft&&c.prevDraft!==c.draft?'<button type="button" class="chip" data-a="w3-restore">Switch back to my previous draft</button>':'')+'</p></div><div class="card" id="pitch3" aria-live="polite">'+w3PitchHtml()+'</div></div>';
 return shell3(3,h);
}
function w3s4(){
 var c=CL(),h=LC("w3s4.lesson");
 h+='<div class="card"><h2>Pre-send check</h2><p class="mute">Tap each when it is true.</p>'+w3Chip("w3.pre",W3PRE)+'</div>'+LC("w2s3.contact");
 var p=c.pid?w2Cand(c.pid):null;
 h+='<div class="card"><h2>Your proposal</h2>';
 if(!(c.draft||"").trim()&&c.status!=="proposed")h+='<p class="mute">No proposal yet. <a href="#/w3/3">Shape one in step 3</a>, or log one you wrote yourself.</p>';
 if(p){h+='<div class="crow"><span><strong>'+esc(w2Nm(p))+'</strong><br><span class="mute">'+(c.opt?esc(w3Opt(c.opt).t):"No option chosen")+(c.draft?" &middot; Proposal Check "+w3PitchScore(c)+" of 6":"")+'</span></span><span class="row">';
  if(c.status==="proposed")h+='<span class="tag">Sent on '+esc(dayLab(c.sentAt))+'</span><button type="button" class="chip sm" data-a="w3-unsend">Undo</button>';
  else h+='<button type="button" class="btn" style="min-height:38px;padding:6px 12px" data-a="w3-sent">I '+(c.channel==="person"?"spoke to them":"sent it")+'</button>';
  h+='</span></div>';}
 if(c.ackAsk&&c.status!=="proposed"){var iss=w3Issues(c);h+='<div class="note warn" role="status"><strong>Before you log this</strong> (your call, nothing is blocked):<ul style="margin:6px 0 0 18px;padding:0">'+iss.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><p><button type="button" class="btn" data-a="w3-sent">I have checked, log it anyway</button></p></div>';}
 h+='</div>';
 if(c.status==="proposed"){
  h+='<div class="card"><h2>What happened?</h2><div class="row">'+W3REPLY.map(function(r){return '<button type="button" class="chip" aria-pressed="'+((c.reply||"noreply")===r[0])+'" data-a="w3-reply" data-v="'+r[0]+'">'+r[1]+'</button>';}).join("")+'</div><p class="mute">"No reply yet" is never turned into a no. A reply is only ever logged by you.</p>';
  if(c.reply==="agreed")h+='<label>Your own note of what was agreed</label><textarea maxlength="800" style="min-height:90px" data-col="note" aria-label="What was agreed">'+esc(c.note)+'</textarea><p class="mute">This is your own note. The Sales Lab is not a contract and does not witness agreements.</p>';
  h+='</div>';
 }
 h+='<div class="card"><h2>How did sending feel? (optional)</h2>'+w3Chip("w3.feel",[["easy","Easy"],["nerv","Nervous but done"],["hard","Harder than expected"]],1)+'</div>';
 return shell3(4,h);
}
function w3s5(){
 var c=CL(),o=w3Opt(c.opt),assets=w2J("w3.assets")||{},list=(o&&assets[o.k])||[],h=LC("w3s5.lesson");
 if(c.status!=="proposed"&&c.reply!=="agreed")h+='<div class="note info">Keep this light until a partner shows real interest. A brief outline is enough for now.</div>';
 h+='<div class="card"><h2>Assets for '+(o?esc(o.t):"your collaboration")+'</h2>';
 if(!o)h+='<p class="mute">Choose an option in <a href="#/w3/3">step 3</a> and the checklist appears here.</p>';
 else if(!list.length)h+='<p class="mute">This checklist could not be loaded. Please refresh the page.</p>';
 else h+='<div class="row" style="flex-direction:column;align-items:stretch">'+list.map(function(x,i){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+((c.assets||[]).indexOf(String(i))>-1)+'" data-a="w3-asset" data-v="'+i+'">'+esc(x)+'</button>';}).join("")+'</div>';
 h+='</div><div class="card"><h2>Set up your measure</h2><p class="mute">You make any link or code in your own tools. Tick each when it is true.</p>'+w3Chip("w3.ready",W3MSET)+'<div class="row"><div style="flex:1;min-width:150px"><label>Start date</label><input type="date" data-col="runStart" value="'+esc(c.runStart)+'" aria-label="Run window start date"></div><div style="flex:1;min-width:150px"><label>End date</label><input type="date" data-col="runEnd" value="'+esc(c.runEnd)+'" aria-label="Run window end date"></div></div>'+(c.runStart&&c.runEnd&&c.runEnd<c.runStart?'<div class="note warn">The end date is before the start date.</div>':'')+'</div>';
 var rd=[[!!c.meas,"A measure is chosen"],[(c.assets||[]).length>0,"Some assets are drafted"],[!!(c.runStart&&c.runEnd&&c.runEnd>=c.runStart),"The dates are set"]];
 h+='<div class="card"><h2>Ready check</h2>'+rd.map(function(r){return '<p style="margin:4px 0">'+(r[0]?"&#10003; ":"&#9744; ")+esc(r[1])+'</p>';}).join("")+'<p class="mute">Ticks mean ready, not graded.</p></div>';
 h+='<div class="card"><h2>What is still unclear? (optional)</h2>'+w3Chip("w3.unclear",[["measure","How to measure it"],["assets","What to prepare"],["dates","The dates"],["partner","What the partner needs"]],1)+'</div>';
 return shell3(5,h);
}
function w3s6(){
 var c=CL(),sent=w2Sent(),replied=sent.filter(function(e){return e.o.reply&&e.o.reply!=="noreply";}).length,answered=sent.filter(function(e){return e.o.answered;}).length,fu=sent.filter(function(e){return e.o.fuSent;}).length;
 var prop=c.status==="proposed"?1:0,agreed=c.reply==="agreed"?1:0,msgs=sent.length+prop;
 var h=LC("w3s6.lesson")+'<div class="card"><h2>Your Week 3 summary</h2><p class="mute">Three different things, kept apart: what you did, what came back, and what it created.</p><div class="row"><div class="stat"><b>'+msgs+'</b>Messages sent</div><div class="stat"><b>'+(replied+(c.reply&&c.reply!=="noreply"?1:0))+'</b>Responses received</div><div class="stat"><b>'+agreed+'</b>Opportunities created</div></div><p style="margin-top:10px">Replies answered: '+answered+'. Follow-ups sent: '+fu+'. Proposals sent: '+prop+'. Proposal status: '+(prop?esc((W3REPLY.filter(function(r){return r[0]===(c.reply||"noreply");})[0]||[0,"No reply yet"])[1]):"not sent yet")+'.</p>'+(msgs&&msgs<10?'<div class="note info">This is a small sample. It tells you what happened, not what will always happen, so we show counts, not percentages.</div>':'')+'</div>';
 var rec=w3Rec();
 h+='<div class="card"><h2>Recommended next step</h2><div class="note '+rec.c+'"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div>';
 h+='<h3>Change one thing (optional)</h3><p class="mute">One change at a time keeps the learning readable.</p>'+w3Chip("w3.chg",W3CHG,1);
 h+='<h3>Your decision</h3>';[["ready","Ready for Week 4"],["another","I would like to approach another partner first"],["change","I want to change my approach"],["help","I would like help in the group session"]].forEach(function(x){h+='<p><button type="button" class="chip" aria-pressed="'+(S.w3.dec===x[0])+'" data-a="w3-dec" data-val="'+x[0]+'">'+x[1]+'</button></p>';});
 h+='</div><div class="note info"><strong>Week 4 is next.</strong> Your proposal, dates and notes stay saved and carry forward.</div>';
 return shell3(6,h);
}
function w3Action(a,d,t){
 var c=S.col,k;
 if(a==="w3-week"){S.week=(+d.val===3&&week2Done())?3:S.week;route="#/sprint";save();window.scrollTo(0,0);}
 else if(a==="w3-done"){S.w3.steps[d.n]=!S.w3.steps[d.n];save();}
 else if(a==="w3-quiz"){S.w3.quiz[d.q]=d.v;save();}
 else if(a==="w3-dismiss"){S.w3.dismiss[d.id]=true;save();}
 else if(a==="w3-pid"){c.pid=+d.id;c.name=w2Nm(w2Cand(d.id));c.ackAsk=false;save();}
 else if(a==="w3-set"){if(!c.pid){c.pid=w3Pick();c.name=w2Nm(w2Cand(c.pid));}c[d.f]=c[d.f]===d.v&&(d.f==="ask"||d.f==="meas")?"":d.v;if(d.f==="opt")c.simp=false;c.ackAsk=false;save();}
 else if(a==="w3-simp"){c.simp=!c.simp;save();}
 else if(a==="w3-fill"){if(!c.pid){c.pid=w3Pick();c.name=w2Nm(w2Cand(c.pid));}c.gets=w3Suggest({pid:c.pid});save();}
 else if(a==="w3-gen"){if(!c.pid){c.pid=w3Pick();c.name=w2Nm(w2Cand(c.pid));}if((c.draft||"").trim()&&c.draft!==c.prevDraft)c.prevDraft=c.draft;c.draft=w3Compose(c);c.v=(c.v||0)+1;c.ackAsk=false;save();}
 else if(a==="w3-copy"){var ta=document.querySelector("textarea[data-col=draft]");try{if(navigator.clipboard&&ta){navigator.clipboard.writeText(ta.value);t.textContent="Copied";}else{ta.select();t.textContent="Select all and copy by hand";}}catch(e){t.textContent="Select all and copy by hand";}return;}
 else if(a==="w3-restore"){k=c.draft;c.draft=c.prevDraft;c.prevDraft=k;save();}
 else if(a==="w3-sent"){if(w3Issues(c).length&&!c.ackAsk){c.ackAsk=true;save();}else{c.status="proposed";c.sentAt=today();c.ackAsk=false;c.name=c.name||w2Nm(w2Cand(c.pid));save();}}
 else if(a==="w3-unsend"){c.status="";c.sentAt="";c.reply="";c.repliedAt="";c.ackAsk=false;save();}
 else if(a==="w3-reply"){c.reply=d.v==="noreply"?"":d.v;c.repliedAt=c.reply?today():"";save();}
 else if(a==="w3-asset"){var cur=c.assets||[],i=cur.indexOf(d.v);if(i>-1)cur.splice(i,1);else cur.push(d.v);c.assets=cur;save();}
 else if(a==="w3-dec"){S.w3.dec=S.w3.dec===d.val?"":d.val;save();}
 else return;
 render();
}
function w3Input(t){var k=t.dataset.col;if(!W3KEYS[k])return;S.col[k]=t.value;if(k==="draft")S.col.ackAsk=false;save();if(k==="draft")w3Refresh();}
function w3DateChange(t){var k=t.dataset.col,v=String(t.value||"");if((k==="runStart"||k==="runEnd")&&(v===""||parseYmd(v)!=null)){S.col[k]=v;save();}render();}
function w3fix(o){
 var b=blank(),w=(o.w3&&typeof o.w3==="object"&&!Array.isArray(o.w3))?o.w3:{},r=clone(b.w3);
 Object.keys(r).forEach(function(k){if(w[k]!==undefined&&w[k]!==null&&typeof w[k]===typeof r[k]&&Array.isArray(w[k])===Array.isArray(r[k]))r[k]=w[k];});o.w3=r;
 var c=(o.col&&typeof o.col==="object"&&!Array.isArray(o.col))?o.col:{},n=clone(W3DEF);
 Object.keys(n).forEach(function(k){if(c[k]!==undefined&&c[k]!==null&&typeof c[k]===typeof n[k]&&Array.isArray(c[k])===Array.isArray(n[k]))n[k]=c[k];});o.col=n;
 return o;
}

/* ---------- M5b: Week 4, run it, record numbers, read the result honestly (template based, nothing is ever sent by the app) ---------- */
var STEPS4=[
 {n:1,t:"Learn how to read a small result",m:20,b:"Nothing. A short lesson and a quick check."},
 {n:2,t:"Run the collaboration, or take the next best action",m:80,b:"Your Week 3 proposal, if you have one."},
 {n:3,t:"Record your numbers",m:30,b:"Whatever you can see in your own tools."},
 {n:4,t:"See your results and your evidence verdict",m:30,b:"The numbers from step 3."},
 {n:5,t:"Look back at your own work",m:30,b:"Your Week 1, 2 and 3 work."},
 {n:6,t:"Decide what is next",m:40,b:"Your results and your verdict."}
];
var W4RUN=[["a","My assets are ready"],["b","The partner knows the dates"],["c","My link or code is live, and I tested it"],["d","I have written down what I will count"],["e","I have a thank-you ready to send afterwards"]];
var W4HOW=[["plan","It went to plan"],["small","Smaller than I hoped"],["changed","The partner changed it"],["wrong","Something went wrong"]];
var W4RAN=[["yes","Yes, it ran"],["notyet","Not yet"],["no","It did not happen"]];
var W4SAW=[["clicks","Clicks"],["orders","Orders"],["buyers","Who the buyers were"],["found","How people found me"],["none","Nothing, I could see it all"]];
var W4OVER=[["one","One order"],["quiet","One quiet week"],["clicks","Lots of clicks"],["replies","Polite replies"]];
var W4MATCH=[["yes","Yes"],["bit","A bit different"],["not","Not really"]];
var W4PD=[["repeat","Repeat"],["adjust","Adjust and try again"],["pause","Pause"],["stop","Stop with this partner"]];
var W4RD=[["carry","Carry on with partnerships"],["newlist","Try partnerships again with a different shortlist"],["other","Take what I learned to a different experiment"],["pause","Pause and think"]];
var W4NUM={clicks:"Link clicks",orders:"Orders using your link or code",value:"Order value",enq:"Enquiries or questions",hours:"Time spent (hours)"};
var W4MAXLOG=20;
var W4TXT={say:1,wrong:1,thanks:1,matchnote:1};
var W4VS={"":1,value:1,zero:1,unknown:1};
var W4DEF=function(){return {steps:{},q:{},over:[],runchk:[],how:[],ran:"",saw:[],say:"",wrong:"",thanks:"",res:{clicks:{s:"",v:""},orders:{s:"",v:""},value:{s:"",v:""},enq:{s:"",v:""},hours:{s:"",v:""}},hist:[],match:[],matchnote:"",conf:[],cap:[],pdec:{},rdec:"",dec:""};};

/* ===== W4 LOGIC START: pure rules, checked by dev/m5b_logic_tests.js (the 15 approved verdict cases) ===== */
var VMIN_CLICKS=20,VMIN_PARTNERS=3;
function vstate(o){if(!o||!o.s||o.s==="unknown")return "unk";if(o.s==="zero")return "zero";if(o.s==="value"){if(o.v===""||o.v==null)return "unk";var n=+o.v;if(isNaN(n))return "unk";return n===0?"zero":(n>0?"pos":"unk");}return "unk";}
function vclean(a){return a.filter(function(x){return x;});}
function vmk(label,cls,rule,why,limits,next){return {label:label,cls:cls,rule:rule,why:vclean(why),limits:vclean(limits),next:vclean(next)};}
var VORDER=[
 ["R1","No outreach completed","Insufficient evidence"],
 ["R2","A sale is recorded (orders above zero)","Promising, with cautious wording"],
 ["R3","Orders confirmed zero and at least "+VMIN_CLICKS+" clicks seen","Traffic but no sales"],
 ["R4","Orders confirmed zero, but fewer than "+VMIN_CLICKS+" clicks or clicks not visible","Insufficient evidence"],
 ["R5","Something ran or was clicked, but the number of orders is unknown","Mixed or unclear"],
 ["R6","A yes reply, an agreed collaboration or an enquiry, with no sales recorded","Interest not yet converted"],
 ["R7","At least "+VMIN_PARTNERS+" partners contacted and two or more polite refusals and no yes, or no replies at all after follow-ups and a week or more of waiting","Approach needs reviewing"],
 ["R8","Anything else (still waiting, soft maybe-later replies, too little to read)","Insufficient evidence"]
];
function w4Verdict(i){
 var cs=vstate(i.clicks),os=vstate(i.orders),es=vstate(i.enq),cn=cs==="pos"?+i.clicks.v:0,res=i.yes+i.maybe+i.no;
 var small="One sprint with a few partners is a small sample. It shows what happened, not what will always happen.";
 if(i.partners===0)return vmk("Insufficient evidence","info","R1",["No outreach has been completed yet, so there is nothing to read."],["This says nothing about whether the approach works, because it has not been tried."],["Send one message to a partner you already know. One is enough to start learning."]);
 if(os==="pos")return vmk("Promising","ok","R2",["You recorded "+i.orders.v+" sale"+(+i.orders.v===1?"":"s")+" linked to this work."+(cs==="pos"?" About "+cn+" people clicked through.":""),(es==="pos"?"You also had "+i.enq.v+" enquir"+(+i.enq.v===1?"y":"ies")+".":"")],[small,"One sale can be luck or timing, so treat it as encouraging, not proven.",cs==="unk"?"You could not see clicks, so how traffic led to the sale is uncertain.":"",(i.yes===0&&i.no>=2)?"Other partners declined, so the signals point in different directions.":(i.no>=2?"Other partners declined, so the signals point in different directions.":"")],["Run the same idea with a second partner, or repeat with this one, then compare the two results."]);
 if(os==="zero"&&cs==="pos"&&cn>=VMIN_CLICKS)return vmk("Traffic but no sales","warn","R3",["About "+cn+" people clicked through, and you confirmed zero orders."],["This tells you people arrived but did not buy. It does not show why.","The partner’s audience may simply not have been ready to buy, or the offer may not have matched what they wanted."],["Look at what people saw when they landed: the page, the price and the offer.","Check the fit before blaming the partner. Did their audience match your buyer?"]);
 if(os==="zero"&&(i.ran||cs!=="unk"))return vmk("Insufficient evidence","info","R4",["You confirmed zero orders, but "+(cs==="pos"?"only "+cn+" people clicked through":"you could not see how many people came")+"."],["Too few visits to judge whether the offer converts.",small],["Try again with a bigger or warmer audience, or a second partner, before drawing a conclusion."]);
 if((i.ran||cs==="pos"||es==="pos")&&os==="unk")return vmk("Mixed or unclear","warn","R5",[(i.ran?"The collaboration ran.":""),(cs==="pos"?"About "+cn+" people clicked through.":""),(es==="pos"?"You had "+i.enq.v+" enquir"+(+i.enq.v===1?"y":"ies")+".":""),"The number of orders is not visible to you yet."],["Without the order number we can’t say whether anything sold.","Please don’t read the missing number as zero. It is unknown."],["Check your store or checkout for orders that used your link or code, and enter them if you find any.","Next time, set up one visible way to count orders before the collaboration starts."]);
 if(i.yes>=1||i.agreed||es==="pos")return vmk("Interest not yet converted","ok","R6",[(i.yes>=1?i.yes+" partner"+(i.yes===1?"":"s")+" said yes or asked for more.":""),(i.agreed?"A collaboration was agreed.":""),(es==="pos"?"You had "+i.enq.v+" enquir"+(+i.enq.v===1?"y":"ies")+".":""),"No sales are recorded yet."],["Interest is not the same as a sale. It is a promising sign, not proof.","Polite refusals and “maybe later” replies are not counted as interest.",small],[i.agreed?"Run the collaboration and record your numbers, even if they are small.":"Turn the interest into one small, specific proposal."]);
 if(i.partners>=VMIN_PARTNERS&&i.no>=2&&i.yes===0&&!i.agreed)return vmk("Approach needs reviewing","warn","R7",[i.no+" of "+i.partners+" partners politely said no, and none said yes."],["Polite refusals are useful information. They don’t show your whole approach is wrong.","Your sample is small, so look for patterns, not verdicts."],["Read the reasons they gave, if any.","Change one thing, such as the partner type, the offer or the ask, and try the next partner."]);
 if(i.partners>=VMIN_PARTNERS&&res===0&&i.fuSent>=i.partners&&i.daysSinceSend>=7)return vmk("Approach needs reviewing","warn","R7",[i.partners+" partners contacted, follow-ups sent, and no replies after a week or more."],["Silence has many causes: busy inboxes, the wrong contact route or timing.","It does not mean the idea is bad."],["Review who you contacted and how you asked. Is each partner’s audience really your buyer?","Try a different channel, or a warm contact, before changing the offer."]);
 return vmk("Insufficient evidence","info","R8",[(res===0?"Messages have gone out and no replies have come in yet.":""),(i.maybe>0&&i.yes===0?i.maybe+" partner"+(i.maybe===1?"":"s")+" said “maybe later”, which is a soft answer.":""),"There is not enough yet to read."],[small,"No reply yet is unknown, not a no."],[res===0?"Wait for the follow-up window, send one helpful follow-up, then decide.":"Keep the door open with the “maybe later” partners and message your next partner."]);
}
function w4DaysAgo(s,ref){var a=parseYmd(s),b=parseYmd(ref||today());if(a==null||b==null)return 0;return Math.max(0,Math.round((b-a)/86400000));}
function w4Inputs(asOf,resOv){
 var sent=w2Sent(),c=S.col||{},ids={},yes=0,maybe=0,no=0,nor=0,fu=0,minAgo=null,r=resOv||S.w4.res,n=0;
 sent.forEach(function(e){
  if(asOf&&e.o.sentAt>asOf)return;
  ids[e.id]=1;n++;var rp=e.o.reply;if(asOf&&e.o.repliedAt&&e.o.repliedAt>asOf)rp="";
  if(rp==="yes")yes++;else if(rp==="maybe")maybe++;else if(rp==="no")no++;else nor++;
  if(e.o.fuSent&&!(asOf&&e.o.fuAt&&e.o.fuAt>asOf))fu++;
  var d=w4DaysAgo(e.o.sentAt,asOf);if(minAgo===null||d<minAgo)minAgo=d;
 });
 var partners=n,cOk=c.status==="proposed"&&c.pid&&(!asOf||c.sentAt<=asOf),cRep=c.reply;
 if(asOf&&c.repliedAt&&c.repliedAt>asOf)cRep="";
 if(cOk&&!ids[c.pid]){partners++;if(cRep==="maybe")maybe++;else if(cRep==="no")no++;else if(cRep==="agreed")yes++;else nor++;var d2=w4DaysAgo(c.sentAt,asOf);if(minAgo===null||d2<minAgo)minAgo=d2;}
 return {partners:partners,msgs:partners,yes:yes,maybe:maybe,no:no,noreply:nor,fuSent:fu,agreed:!!(cOk&&cRep==="agreed"),ran:S.w4.ran==="yes",clicks:r.clicks,orders:r.orders,enq:r.enq,daysSinceSend:minAgo||0};
}
function w4Rec(v){
 var l=v.label,w=(S.focus.where||""),etsy=/etsy/i.test(w),low=(S.base&&S.base.comfort&&S.base.comfort<=2),t,b,f,x="";
 if(l==="Promising"){t="Repeat Partnership-to-Sales with a second partner";b="You recorded a sale. A second, similar collaboration shows whether it was luck or a pattern.";f="Choose the next partner on your shortlist and use the same small option.";}
 else if(l==="Traffic but no sales"){t="Improve the offer or page, then repeat";b="People arrived but did not buy, so the weak point is probably after the click.";f="Look at your page, price and offer through a buyer's eyes, change one thing, then repeat.";x=etsy?"If it stalls again, the Etsy Sales Bottleneck experiment looks at exactly this. It is open now.":"If it stalls again, the Email-to-Sale experiment tests the offer with a list you already have. It is open now.";}
 else if(l==="Interest not yet converted"){t="Repeat Partnership-to-Sales and turn the interest into a run";b="There is real interest. The next job is to turn it into a small, specific collaboration.";f="Send the proposal or run what was agreed, and record your numbers.";}
 else if(l==="Mixed or unclear"){t="Repeat once, with one visible way to count orders";b="Some of what happened is not visible to you, so there is not yet a clear read.";f="Check your store for orders that used your link or code, enter them, then decide.";}
 else if(l==="Approach needs reviewing"){t="Change one thing, then try again";b="The pattern points to reviewing who you contact and how you ask, not to giving up.";f="Choose one change (partner type, offer or ask) and try the next partner.";x="If your buyer is hard to reach this way, Find Your Buyers may be a better next experiment. It is open now.";}
 else{t="Make first contact, or repeat with another partner";b="There is not enough evidence yet to choose a direction, which is normal after one sprint.";f=v.rule==="R1"?"Send one message to a partner you already know.":"Message the next partner and wait for the follow-up window.";}
 if(low)x=(x?x+" ":"")+"You said contacting people felt hard. Bring this to the group session and choose the gentlest next step.";
 var bs={"Promising":"You recorded at least one sale linked to this work.","Traffic but no sales":"You confirmed zero orders after people clicked through.","Interest not yet converted":"At least one partner showed real interest, with no sales recorded yet.","Mixed or unclear":"Some of what happened is not visible to you, so the evidence is incomplete.","Approach needs reviewing":"Several partners declined, or did not reply after follow-ups.","Insufficient evidence":"There is not enough recorded yet to read."};
 var as={"Promising":"We are assuming the sale came from this partnership rather than other activity. Your numbers cannot prove that.","Traffic but no sales":"We are assuming the page and offer, rather than the partner, are the weak point. Your numbers cannot confirm that.","Interest not yet converted":"We are assuming the interest is genuine. A yes is encouraging but it is not a sale.","Mixed or unclear":"We are assuming nothing sold, or that something did. We cannot tell which until you can see the orders.","Approach needs reviewing":"We are assuming the approach, rather than timing or busy inboxes, is the cause. That is a guess.","Insufficient evidence":"We are not assuming anything yet. One sprint is a small sample."};
 return {t:t,b:b,first:f,basis:bs[l]||"",assume:as[l]||"",extra:x,provisional:!!(S.col&&S.col.runEnd&&S.col.runEnd>=today()&&S.w4.ran!=="no")};
}
function week3Done(){return STEPS3.filter(function(s){return S.w3.steps[s.n];}).length===6||S.w3.dec==="ready";}
function w4NextAction(){
 var c=CL(),pt=w3Path();
 if(pt==="agreed"&&S.w4.ran!=="yes"&&c.runStart&&c.runStart<=today()&&(!c.runEnd||c.runEnd>=today()))return {t:"Your run window is open. Record how it is going",link:"#/w4/2"};
 for(var i=0;i<STEPS4.length;i++){var n=STEPS4[i].n;if(!S.w4.steps[n])return {t:"Step "+n+": "+STEPS4[i].t,link:"#/w4/"+n,m:STEPS4[i].m};}
 return {t:"Open your results",link:"#/w4/4"};
}
function w4Clean(k,v){var s=String(v==null?"":v).replace(/[^0-9.]/g,"");var p=s.split(".");if(p.length>1)s=p[0]+"."+p.slice(1).join("").slice(0,2);if(s.length>9)s=s.slice(0,9);return s;}
function w4Val(o,money){var st=vstate(o);if(st==="unk")return "Not seen";if(st==="zero")return "0 (confirmed)";return (money?sym(S.focus.currency):"")+o.v;}
function w4Ctr(){var sent=w2Sent(),c=S.col||{},p=(c.status==="proposed"?1:0),rep=sent.filter(function(e){return e.o.reply&&e.o.reply!=="noreply";}).length+((c.reply&&c.reply!=="noreply"&&!(c.pid&&sent.some(function(e){return e.id===c.pid;})))?1:0);return {msgs:sent.length+((c.status==="proposed"&&c.pid&&!sent.some(function(e){return e.id===c.pid;}))?1:0),prop:p,resp:rep,opp:c.reply==="agreed"?1:0};}
/* ===== W4 LOGIC END ===== */

function shell4(n,body){
 var s=STEPS4[n-1],dn=S.w4.steps[n];
 var h='<a class="back" href="#/sprint" data-a="w4-week" data-val="4">&larr; My Sprint</a><h1>Week 4 &middot; Step '+n+' of 6</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p>'+glance(4,n)+'<p class="mute">You will need: '+esc(s.b)+' Everything saves automatically. Do the steps in any order that suits you.</p>';
 h+=body+'<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="w4-done" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<6?'<a class="btn ghost" href="#/w4/'+(n+1)+'">Next step &rarr;</a>':'<a class="btn ghost" href="#/sprint" data-a="w4-week" data-val="4">Back to My Sprint</a>')+'</div>';
 return h;
}
function w4Chips(field,opts,max){var cur=S.w4[field]||[];return '<div class="row">'+opts.map(function(o){return '<button type="button" class="chip" aria-pressed="'+(cur.indexOf(o[0])>-1)+'" data-a="chip" data-path="w4.'+field+'" data-val="'+esc(o[0])+'" data-max="'+(max||99)+'">'+esc(o[1])+'</button>';}).join("")+'</div>';}
function home4(){
 var d=STEPS4.filter(function(s){return S.w4.steps[s.n];}).length,na=w4NextAction(),left=STEPS4.filter(function(s){return !S.w4.steps[s.n];}).reduce(function(a,s){return a+s.m;},0),c=CL();
 var h='<div class="card"><div class="row" style="justify-content:space-between"><strong>'+d+' of 6 steps done</strong><span class="mute">About '+hm(left)+' left</span></div><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/6*100)+'%"></i></div>';
 h+='<div class="note info" style="margin-top:12px"><strong>Where you are:</strong> '+W3PATHN[w3Path()]+'.'+(c.runEnd?' Your run window ends on '+esc(dayLab(c.runEnd))+'.':'')+'</div>';
 h+='<h3>Your next action</h3><p><strong>'+esc(na.t)+'</strong>'+(na.m?' <span class="tag">'+na.m+' min</span>':'')+'</p><a class="btn" href="'+na.link+'">Continue</a></div>';
 h+='<div class="card"><h2>Day 30 review</h2><p class="mute">'+esc(rvClock())+'. Look back, see what the evidence suggests and choose what is next.</p><p><a class="btn ghost" href="#/review">Open my Day 30 review</a></p></div>'+planCard(STEPS4);
 h+='<div class="card"><h2>The six steps</h2>'+STEPS4.map(function(s){var dn=S.w4.steps[s.n];return '<a class="step'+(dn?' done':'')+'" href="#/w4/'+s.n+'"><span class="n">'+(dn?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min &middot; builds on: '+esc(s.b)+'</span></span><span class="mute">'+(dn?"Done":"Open")+'</span></a>';}).join("")+'<p class="mute">Total about '+hm(mins(STEPS4))+'. Step 2 can stretch over several days because a collaboration has its own timetable. Nothing is sent by this app.</p></div>';
 return h+remindCard()+helpCard();
}
function w4s1(){
 var ck=w2J("w4s1.check"),h=LC("w4s1.lesson")+LC("w4s1.ex");
 h+='<div class="card"><h2>Quick check: what is the honest reading?</h2>';
 if(ck){ck.forEach(function(q){var sel=S.w4.q[q.id];h+='<div class="q"><strong>'+esc(q.p)+'</strong><div class="row" style="flex-direction:column;align-items:stretch">'+q.opts.map(function(o){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(sel===o[0])+'" data-a="w4-q" data-q="'+esc(q.id)+'" data-v="'+esc(o[0])+'">'+esc(o[1])+'</button>';}).join("")+'</div>';if(sel)h+='<div class="note '+(sel===q.best?"ok":"info")+'" aria-live="polite">'+(sel===q.best?"Good read. ":"Have another look. ")+esc(q.why)+'</div>';h+='</div>';});}
 else h+='<p class="mute">This check could not be loaded. Please refresh the page.</p>';
 h+='<label>Which would you be most tempted to over-read? (optional)</label>'+w4Chips("over",W4OVER,1)+'</div>';
 return shell4(1,h);
}
function w4Days(c){if(!c.runStart||!c.runEnd)return "";var t=today();if(t<c.runStart)return "Your run window opens on "+dayLab(c.runStart)+". Nothing to do until then.";if(t>c.runEnd)return "Your run window ended on "+dayLab(c.runEnd)+". Record your final numbers when you are ready.";var d=Math.max(0,Math.round((parseYmd(c.runEnd)-parseYmd(t))/86400000));return "Run window: "+(d===0?"it ends today":d+" day"+(d===1?"":"s")+" left")+". Final numbers are due by "+dayLab(c.runEnd)+". No rush, and nothing is lost if it takes longer.";}
function w4Thanks(){var c=CL(),p=c.pid?w2Cand(c.pid):null,nm=p?w2Nm(p):"there",pn=S.focus.product||"my product";return w2Contract("Hi "+nm+",\n\nThank you for taking part in this small idea about "+pn+". Whatever the numbers turn out to be, I learned something useful from it, and I am grateful for your time. If it would help you, I am happy to share what I saw.\n\nThank you again,\n[Your name]",c.tone||"warm");}
function w4s2(){
 var c=CL(),pt=w3Path(),h="";
 if(pt==="agreed"){
  h+=LC("w4s2.run");
  h+='<div class="card"><h2>Your run checklist</h2><p class="mute">Built from your Week 3 plan. Tick each when it is true.</p>'+w4Chips("runchk",W4RUN)+'<p class="mute">'+esc(w4Days(c)||"Set your start and end dates in Week 3, step 5.")+'</p>';
  h+='<label>Did the collaboration run?</label><div class="row">'+W4RAN.map(function(r){return '<button type="button" class="chip" aria-pressed="'+(S.w4.ran===r[0])+'" data-a="w4-ran" data-v="'+r[0]+'">'+r[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="card"><h2>How did it go?</h2>'+w4Chips("how",W4HOW,1);
  if(S.w4.how.indexOf("wrong")>-1)h+='<label>What happened? (only if you want to say)</label><textarea maxlength="800" style="min-height:80px" data-w4="wrong" aria-label="What went wrong">'+esc(S.w4.wrong)+'</textarea><div class="note info">That is okay. Something going wrong is useful information. Note it, thank your partner, and read what you can in step 4.</div>';
  h+='</div><div class="card"><h2>A thank-you for your partner</h2><p class="mute">Send it afterwards, whatever happened. You send it yourself.</p><p><button type="button" class="btn ghost" data-a="w4-thanks">'+(S.w4.thanks?"Make it again":"Make a thank-you")+'</button></p><textarea maxlength="2000" style="min-height:140px" data-w4="thanks" aria-label="Thank-you draft">'+esc(S.w4.thanks)+'</textarea></div>';
 } else if(pt==="waiting"||pt==="changes"){
  h+='<div class="card"><h2>Your proposal is out</h2><p>You sent it on '+esc(dayLab(c.sentAt))+'. A short, helpful follow-up after about five days is plenty, and then it is fine to wait. You can also approach another partner while you wait. Both are fine.</p><p><a class="btn ghost" href="#/w3/4">Update your proposal log</a> <a class="btn ghost" href="#/w2/2">Message another partner</a></p></div>';
 } else if(pt==="replies"||pt==="closed"){
  h+='<div class="card"><h2>Read what the conversations taught you</h2><p>There is no collaboration to run yet, and that is fine. Look at the replies you have, change one thing, and try another partner. A smaller option, such as a simple mention, is often easier to say yes to.</p><p><a class="btn ghost" href="#/w3/3">Shape a smaller proposal</a></p></div>';
 } else {
  h+='<div class="card"><h2>A first contact, then learn</h2><p>Not much contact has been made yet, and that is not a failure. This week is about one warm message, then reading what comes back. Practising with a friend first is a good way in.</p><p><a class="btn" href="#/w2/2">Open the Message Builder</a></p></div>';
 }
 h+='<div class="card"><h2>How is it feeling?</h2>'+w4Chips("feel",[["smooth","Smoothly"],["worried","A bit worried"],["hand","I need a hand"]],1)+'</div>';
 return shell4(2,h);
}
function w4NumRow(k,money){
 var o=S.w4.res[k],st=o.s,lab=W4NUM[k]+(money?" ("+sym(S.focus.currency).trim()+")":"");
 var opts=k==="hours"?[["value","A number"],["unknown","I am not sure"]]:[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
 return '<div class="q"><strong>'+esc(lab)+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(st===x[0])+'" data-a="w4-vs" data-k="'+k+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(st==="value"?'<input type="text" inputmode="decimal" maxlength="12" data-w4="'+k+'" value="'+esc(o.v)+'" aria-label="'+esc(lab)+'" style="max-width:160px">':'')+'<p class="mute" style="margin:2px 0 0">'+(st==="unknown"?"Stored as unknown. It is never turned into zero.":(st==="zero"?"Confirmed zero.":(st==="value"?"":"Not recorded yet.")))+'</p></div>';
}
function w4s3(){
 var ct=w4Ctr(),h=LC("w4s3.lesson");
 h+=rvPostNote()+'<div class="card"><h2>Already counted for you</h2><div class="row"><div class="stat"><b>'+ct.msgs+'</b>Messages sent</div><div class="stat"><b>'+ct.resp+'</b>Responses received</div><div class="stat"><b>'+ct.opp+'</b>Collaborations agreed</div></div><p class="mute">From your Weeks 2 and 3 logs. You do not type these again.</p></div>';
 h+='<div class="card"><h2>What you can see</h2><p class="mute">Everything here is optional. If you cannot see a number, say so: unknown is kept as unknown and is never turned into zero.</p>';
 ["clicks","orders","value","enq","hours"].forEach(function(k){h+=w4NumRow(k,k==="value");});
 h+='<label>One line about what the partner or audience said (optional)</label><textarea maxlength="600" style="min-height:70px" data-w4="say" aria-label="What the partner or audience said">'+esc(S.w4.say)+'</textarea>';
 var full=S.w4.hist.length>=W4MAXLOG;h+='<p><button type="button" class="btn ghost" data-a="w4-snap"'+(full?' disabled':'')+'>'+(rvPhase()==="window"?"Save a post-sprint update":"Save a dated entry")+'</button> <span class="mute">'+S.w4.hist.length+' of '+W4MAXLOG+' saved</span></p>'+(full?'<div class="note warn">Your log is full. Nothing has been lost. Delete an older entry below to make room.</div>':'')+'</div>';
 if(S.w4.hist.length){h+='<div class="card"><h2>Your dated entries</h2><p class="mute">Each entry is a snapshot of the numbers on that day. The numbers above can always be changed. To correct an entry, delete it and save a new one.</p>'+S.w4.hist.map(function(e,i){return '<div class="crow"><span><strong>'+esc(dayLab(e.d)||e.d)+'</strong>'+rvPostTag(e.d)+'<br><span class="mute">Clicks '+esc(w4Val(e.clicks))+', orders '+esc(w4Val(e.orders))+', enquiries '+esc(w4Val(e.enq))+'</span></span><button type="button" class="chip sm" data-a="w4-hdel" data-i="'+i+'" aria-label="Delete the entry for '+esc(dayLab(e.d)||e.d)+'">Delete</button></div>';}).join("")+'</div>';}
 var chk=[["Link clicks",S.w4.res.clicks],["Orders",S.w4.res.orders],["Order value",S.w4.res.value],["Enquiries",S.w4.res.enq],["Hours",S.w4.res.hours]];
 h+='<div class="card"><h2>What is recorded, and what is not</h2>'+chk.map(function(x){var s=vstate(x[1]);return '<p style="margin:4px 0">'+(s==="unk"?(x[1].s==="unknown"?"&#9744; ":"&#9744; "):"&#10003; ")+esc(x[0])+': <strong>'+esc(x[0]==="Order value"?w4Val(x[1],true):w4Val(x[1]))+'</strong>'+(s==="unk"?' <span class="mute">('+(x[1].s==="unknown"?"unknown":"not recorded")+')</span>':'')+'</p>';}).join("")+'</div>';
 h+='<div class="card"><h2>Is there anything you could not see that you wish you could? (optional)</h2>'+w4Chips("saw",W4SAW)+'</div>';
 return shell4(3,h);
}
function w4Counts(){var c=w4Ctr();return '<div class="row"><div class="stat"><b>'+c.msgs+'</b>Messages sent</div><div class="stat"><b>'+c.resp+'</b>Responses received</div><div class="stat"><b>'+c.opp+'</b>Opportunities created</div></div>';}
function w4s4(){
 var v=w4Verdict(w4Inputs()),r=S.w4.res,ct=w4Ctr(),h=LC("w4s4.lesson");
 h+='<div class="card"><h2>1. What happened</h2>'+(ct.msgs&&ct.msgs<10?'<div class="note info">This is a small sample. We show counts, not percentages.</div>':'')+w4Counts();
 h+='<div class="row" style="margin-top:10px"><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.clicks))+'</b>Link clicks</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.orders))+'</b>Orders</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.enq))+'</b>Enquiries</div></div><p class="mute">Each number keeps its own state: seen, unknown or confirmed zero. Unknown is never shown as zero.</p></div>';
 var hrs=vstate(r.hours)==="pos"?+r.hours.v:null,val=vstate(r.value)==="pos"?+r.value.v:null,cu=sym(S.focus.currency);
 h+='<div class="card"><h2>2. What it cost you</h2><p>Time spent: <strong>'+esc(w4Val(r.hours))+(hrs!==null?" hours":"")+'</strong>.</p>'+(val!==null&&hrs!==null?'<p>Order value recorded: '+esc(cu)+val+' over '+hrs+' hours. <span class="mute">This is only a record of what happened, not a forecast.</span></p>':'<p class="mute">Value per hour is only shown when there is a real figure to divide by.</p>')+'</div>';
 h+='<div class="card"><h2>3. Your evidence verdict</h2><div class="note '+v.cls+'"><strong>'+esc(v.label)+'</strong> <span class="tag">rule '+v.rule+'</span></div><h3>The evidence</h3>'+v.why.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+'<h3>What this cannot show</h3>'+v.limits.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+'<h3>What you could try next</h3>'+v.next.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+'<p class="mute">This is advice, explained. You know your situation better than a rule does, and you are free to disagree. The thresholds behind it (such as 20 clicks or 3 partners) are provisional starting points that we will review against real results. They are not guarantees and not a measure of success.</p>';
 h+='<label>Does this match how it felt?</label><div class="row">'+W4MATCH.map(function(m){return '<button type="button" class="chip" aria-pressed="'+((S.w4.match||[]).indexOf(m[0])>-1)+'" data-a="chip" data-path="w4.match" data-val="'+m[0]+'" data-max="1">'+m[1]+'</button>';}).join("")+'</div>';
 if((S.w4.match||[])[0]==="not")h+='<textarea maxlength="800" style="min-height:70px" data-w4="matchnote" aria-label="What felt different" placeholder="What felt different? (optional)">'+esc(S.w4.matchnote)+'</textarea>';
 h+='</div>';
 return shell4(4,h);
}
function w4s5(){
 var sent=w2Sent(),dr=sent.filter(function(e){return e.o.draft;}),avg=dr.length?Math.round(dr.reduce(function(a,e){return a+w2PitchScore(e.c);},0)/dr.length*10)/10:null;
 var c=CL(),pc=(c.draft||"").trim()?w3PitchScore(c):null,sl=shortlisted().sort(byScore),top=sl[0]?scoreOf(sl[0]):null;
 var h=LC("w4s5.lesson")+'<div class="card"><h2>Your own work, side by side</h2><p class="mute">These are the ticks on your own pieces of work. They show what you do differently now. They are never a grade, and they say nothing about whether anyone replied or bought.</p>';
 h+='<div class="crow"><span>Week 1: how well your top partner fits</span><strong>'+(top!==null?top+' of 12':'Not done')+'</strong></div>';
 h+='<div class="crow"><span>Week 2: your first messages (average Pitch Check)</span><strong>'+(avg!==null?avg+' of 6':'No message drafted')+'</strong></div>';
 h+='<div class="crow"><span>Week 3: your proposal (Proposal Check)</span><strong>'+(pc!==null?pc+' of 6':'No proposal drafted')+'</strong></div>';
 h+=(avg!==null&&pc!==null?(pc>avg?'<div class="note ok">Your proposal has more ticks than your first messages did. That is you getting better at this.</div>':'<div class="note info">The ticks did not rise, and that is okay. Writing a proposal is harder than a first message. Notice what you do well and what you would change.</div>'):'<div class="note info">There is not enough to compare yet. That is fine.</div>')+'</div>';
 h+='<div class="card"><h2>How confident do you feel now, compared with Week 1?</h2>'+w4Chips("conf",[["more","More confident"],["same","About the same"],["less","Less confident"]],1)+'<p class="mute">In Week 1 you said '+(S.base.confidence?S.base.confidence+' out of 5':'nothing yet')+'.</p><label>What would you do differently next time? (optional)</label>'+w4Chips("cap",[["research","Research the partner more"],["small","Ask for something smaller"],["follow","Follow up sooner"],["measure","Set up tracking first"],["nothing","Nothing, it felt right"]])+'</div>';
 return shell4(5,h);
}
function w4s6(){
 var v=w4Verdict(w4Inputs()),rec=w4Rec(v),sent=w2Sent(),c=CL(),list=sent.map(function(e){return {id:e.id,name:e.name};});
 if(c.pid&&c.status==="proposed"&&!list.some(function(x){return x.id===c.pid;}))list.push({id:c.pid,name:c.name||w2Nm(w2Cand(c.pid))});
 var h=LC("w4s6.lesson");
 h+='<div class="card"><h2>For each partner</h2>'+(list.length?list.map(function(p){return '<div class="q"><strong>'+esc(p.name)+'</strong><div class="row">'+W4PD.map(function(d){return '<button type="button" class="chip sm" aria-pressed="'+(S.w4.pdec[p.id]===d[0])+'" data-a="w4-pd" data-id="'+p.id+'" data-v="'+d[0]+'">'+d[1]+'</button>';}).join("")+'</div></div>';}).join(""):'<p class="mute">No partners to decide on yet.</p>')+'</div>';
 h+='<div class="card"><h2>For the route</h2>'+W4RD.map(function(d){return '<p><button type="button" class="chip" aria-pressed="'+(S.w4.rdec===d[0])+'" data-a="w4-rd" data-v="'+d[0]+'">'+d[1]+'</button></p>';}).join("")+'</div>';
 h+='<div class="card"><h2>Your sprint-end recommendation</h2><div class="note '+(v.cls==="warn"?"info":v.cls)+'"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div><p><strong>First small action:</strong> '+esc(rec.first)+'</p>'+(rec.extra?'<p>'+esc(rec.extra)+'</p>':'')+(rec.provisional?'<div class="note info">Your collaboration is still running, so this is provisional. It will be updated when you record your final numbers.</div>':'')+'<p class="mute">Based on your verdict ('+esc(v.label)+'), your comfort and your time. It is not a promise of results.</p></div>';
 h+='<div class="card"><h2>Next: your Day 30 review</h2><p>Look back at where you started, see what the evidence suggests and choose what to focus on. Feedback is optional. Everything you record stays saved.</p><p><a class="btn" href="#/review">Open my Day 30 review</a></p></div>';
 return shell4(6,h);
}
function w4Action(a,d,t){
 var W=S.w4,k;
 if(a==="w4-week"){S.week=(+d.val===4&&week3Done())?4:S.week;route="#/sprint";save();window.scrollTo(0,0);}
 else if(a==="w4-done"){W.steps[d.n]=!W.steps[d.n];save();}
 else if(a==="w4-q"){W.q[d.q]=d.v;save();}
 else if(a==="w4-ran"){W.ran=W.ran===d.v?"":d.v;save();}
 else if(a==="w4-vs"){if(!W.res[d.k]||!W4VS[d.v])return;W.res[d.k].s=W.res[d.k].s===d.v?"":d.v;if(W.res[d.k].s!=="value")W.res[d.k].v="";save();}
 else if(a==="w4-thanks"){W.thanks=w4Thanks();save();}
 else if(a==="w4-snap"){if(W.hist.length>=W4MAXLOG)return;var e={d:today()};["clicks","orders","value","enq","hours"].forEach(function(x){e[x]={s:W.res[x].s,v:W.res[x].v};});W.hist.push(e);save();}
 else if(a==="w4-hdel"){var ix=+d.i;if(ix>=0&&ix<W.hist.length){W.hist.splice(ix,1);save();}}
 else if(a==="w4-pd"){if(!W4PDK[d.v])return;W.pdec[d.id]=W.pdec[d.id]===d.v?"":d.v;save();}
 else if(a==="w4-rd"){W.rdec=W.rdec===d.v?"":d.v;save();}
 else return;
 render();
}
var W4PDK={repeat:1,adjust:1,pause:1,stop:1};
function w4Input(t){
 var k=t.dataset.w4,W=S.w4;
 if(W.res[k]&&W.res[k].s==="value"){var c=w4Clean(k,t.value);W.res[k].v=c;if(c!==t.value)t.value=c;save();return;}
 if(W4TXT[k]){W[k]=t.value;save();}
}
function w4fix(o){
 var b=W4DEF(),w=(o.w4&&typeof o.w4==="object"&&!Array.isArray(o.w4))?o.w4:{},r=b;
 Object.keys(b).forEach(function(k){if(k==="res"||k==="hist"||k==="pdec")return;if(w[k]!==undefined&&w[k]!==null&&typeof w[k]===typeof b[k]&&Array.isArray(w[k])===Array.isArray(b[k]))r[k]=w[k];});
 var wr=(w.res&&typeof w.res==="object"&&!Array.isArray(w.res))?w.res:{};
 Object.keys(b.res).forEach(function(k){var x=wr[k];if(x&&typeof x==="object"&&typeof x.s==="string"&&W4VS[x.s]&&typeof x.v==="string")r.res[k]={s:x.s,v:w4Clean(k,x.v)};});
 r.hist=[];if(Array.isArray(w.hist))w.hist.slice(-20).forEach(function(e){if(!e||typeof e!=="object"||typeof e.d!=="string")return;var n={d:e.d};Object.keys(b.res).forEach(function(k){var x=e[k];n[k]=(x&&typeof x.s==="string"&&W4VS[x.s]&&typeof x.v==="string")?{s:x.s,v:w4Clean(k,x.v)}:{s:"",v:""};});r.hist.push(n);});
 r.pdec={};if(w.pdec&&typeof w.pdec==="object"&&!Array.isArray(w.pdec))Object.keys(w.pdec).forEach(function(id){if(W4PDK[w.pdec[id]])r.pdec[id]=w.pdec[id];});
 o.w4=r;return o;
}

/* ---------- M5c: Day 30 review, 14 day update window, Results tab, optional feedback, separate permissions ---------- */
var RVMAX=20;
var RVDIS=[["very","Very disappointed"],["some","Somewhat disappointed"],["not","Not disappointed"],["unsure","Not sure"]];
var RVMISS=[["next","The guidance on what to do next"],["builder","The Message Builder"],["checks","The checks on my messages"],["results","Reading my results"],["none","Not sure"]];
var RVDEF=function(){return {start:"",done:false,at:"",snap:null,upd:[],fb:{learned:"",miss:[],dis:[]},testi:{want:"",text:"",contact:false,at:"",wd:"",hist:[]},consent:{anon:false,at:"",wd:"",hist:[]}};};

/* ===== RV LOGIC START: pure rules, checked by dev/m5c_logic_tests.js ===== */
function rvHistWords(o){var h=(o&&o.hist)||[];if(!h.length)return "";return " History: "+h.map(function(x){return (x.a==="given"?"given on ":"withdrawn on ")+dayLab(x.d);}).join(", ")+".";}
function rvSnapWords(s){if(!s)return "";var w=s.label+".";if(s.kind==="update")return w;if(s.prov)return "Provisional reading when saved: "+s.label+".";if(s.late)return "Saved late. "+w+" You had no dated entry on or before Day 30, so this uses the numbers recorded when you saved.";return "Day 30 position: "+w+(s.asOf?" Numbers as dated "+dayLab(s.asOf)+".":"");}
function rvWorked(){
 var sent=w2Sent(),c=CL(),r=S.w4.res,out=[],resp=sent.filter(function(e){return e.o.reply&&e.o.reply!=="noreply";}).length,yes=sent.filter(function(e){return e.o.reply==="yes";}).length;
 var dr=sent.filter(function(e){return e.o.draft;}),avg=dr.length?dr.reduce(function(a,e){return a+w2PitchScore(e.c);},0)/dr.length:null;
 if(sent.length)out.push("You sent "+sent.length+" message"+(sent.length===1?"":"s")+" to real partners. That is the hardest part, and you did it.");
 if(resp)out.push(resp+" partner"+(resp===1?"":"s")+" replied"+(yes?", and "+yes+" said yes or asked for more":"")+".");
 if(avg!==null&&avg>=4)out.push("Your messages ticked most of the Pitch Check items (about "+Math.round(avg*10)/10+" of 6).");
 if(c.status==="proposed")out.push("You sent a collaboration proposal.");
 if(c.reply==="agreed")out.push("A partner agreed to a collaboration.");
 if(S.w4.ran==="yes")out.push("The collaboration ran.");
 if(vstate(r.orders)==="pos")out.push("You recorded "+r.orders.v+" sale"+(+r.orders.v===1?"":"s")+" linked to this work.");
 if(vstate(r.enq)==="pos")out.push("You had "+r.enq.v+" enquir"+(+r.enq.v===1?"y":"ies")+".");
 if(!out.length){var sl=shortlisted().length;if(sl)out.push("You found and shortlisted "+sl+" partner"+(sl===1?"":"s")+" who could reach your buyer.");out.push("You now have a clear first step to take, and evidence to learn from.");}
 return out;
}
function rvProg(){return [["Week 1",STEPS.filter(function(s){return S.steps[s.n];}).length,7],["Week 2",STEPS2.filter(function(s){return S.w2.steps[s.n];}).length,6],["Week 3",STEPS3.filter(function(s){return S.w3.steps[s.n];}).length,6],["Week 4",STEPS4.filter(function(s){return S.w4.steps[s.n];}).length,6]];}
function rvCanUpdate(){return S.rv.done&&rvPhase()==="window";}
function rvCmp(){
 var b=S.base,r=S.w4.res;
 return [["Orders",nvTxt(b.orders),w4Val(r.orders)],["Revenue or order value",nvTxt(b.revenue,true),w4Val(r.value,true)],["Time spent (hours)",(b.hours?b.hours:"Not set"),w4Val(r.hours)]];
}
/* ===== RV LOGIC END ===== */

function rvChips(path,opts,max){return chipsHtml(path,opts,max);}
function reviewPage(){
 var v=w4Verdict(w4Inputs()),rec=w4Rec(v),ph=rvPhase(),prov=ph==="during"||rec.provisional,h='<a class="back" href="#/results">&larr; Results</a><h1>Your Day 30 review</h1><p class="mute">Partnership-to-Sales. A look at where you started, what you did, what the evidence suggests, and what to focus on next.</p>';
 h+=sprintBar(true);
 h+='<div class="card"><h2>1. Where you started, and where you are now</h2><p class="mute">Your starting numbers cover the 30 days before your sprint. Your sprint numbers cover this sprint only. We show them side by side and we do not label the difference as better or worse, because the two are not like for like.</p>';
 rvCmp().forEach(function(x){h+='<div class="crow" style="display:block"><p style="margin:0"><strong>'+esc(x[0])+'</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(x[1])+'. This sprint: '+esc(x[2])+'.</p></div>';});
 h+='<p class="mute">Confidence in Week 1: '+(S.base.confidence?S.base.confidence+' out of 5':'not set')+'. Now: '+(S.w4.conf[0]==="more"?"more confident":(S.w4.conf[0]==="same"?"about the same":(S.w4.conf[0]==="less"?"less confident":"not said")))+'.</p></div>';
 var c=w4Ctr();
 h+='<div class="card"><h2>2. What you did</h2>'+w4Counts()+'<p style="margin-top:10px">Steps completed: '+rvProg().map(function(p){return p[0]+" "+p[1]+" of "+p[2];}).join(", ")+'.</p><div class="note info">You do not need to have finished every step. Anything unfinished stays saved and you can come back to it. Messages sent, responses received and opportunities created are kept apart.</div></div>';
 h+='<div class="card"><h2>3. What the evidence suggests</h2><div class="note '+v.cls+'"><strong>'+(prov?"Provisional reading: ":"")+esc(v.label)+'</strong> <span class="tag">rule '+v.rule+'</span></div>';
 h+='<h3>What worked</h3>'+rvWorked().map(function(x){return '<p style="margin:4px 0">&#10003; '+esc(x)+'</p>';}).join("");
 h+='<h3>What remains uncertain</h3>'+v.limits.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+'<p style="margin:4px 0">This is a reading, not a verdict. The thresholds behind it are provisional starting points, not guarantees.</p>';
 h+='<h3>What to focus on next</h3><div class="note info"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div><p><strong>First small action:</strong> '+esc(rec.first)+'</p>'+(rec.extra?'<p>'+esc(rec.extra)+'</p>':'');
 if(vstate(S.w4.res.orders)!=="pos")h+='<div class="note ok">No sale yet is a normal result for a first sprint. It tells you something about the idea, the partner or the timing, and you now know what to change.</div>';
 h+='</div>';
 h+='<div class="card"><h2>4. Complete your review</h2>';
 if(ph==="notstarted")h+='<p class="mute">Your review is available once your sprint has started.</p>';
 else if(!S.rv.done)h+='<p class="mute">'+(ph==="during"?"You can complete your review now. It will be marked provisional, and you can save the final Day 30 version after Day 30.":(ph==="window"?"Saving now records your Day 30 position from your dated entries. It does not change your update window.":"Your update window has ended. You can still save a late review, which records your Day 30 position from your dated entries."))+'</p><button type="button" class="btn" data-a="rv-done">Save my Day 30 review</button>';
 else h+='<div class="note ok"><strong>Saved on '+esc(dayLab(S.rv.at))+'.</strong> '+esc(rvSnapWords(S.rv.snap))+'</div>'+((S.rv.snap&&S.rv.snap.prov&&ph!=="during")?'<div class="note info">This was saved before Day 30, so it is provisional. You can save the final Day 30 version now. It will not change your update window.</div><p><button type="button" class="btn" data-a="rv-final">Save the final Day 30 version</button></p>':'')+'<p><button type="button" class="btn ghost" data-a="rv-undo">Undo, I want to change it</button></p>';
 h+='</div>';
 h+='<div class="card"><h2>5. Results that arrive after Day 30</h2><p>Your sprint ends on Day 30 and stays that way. If a result arrives later, you can add it for 14 days after Day 30, and your sprint record updates without extending the sprint.</p>';
 if(!S.rv.done)h+='<p class="mute">Save your Day 30 review first, then you can add later results here.</p>';
 else if(ph==="during")h+='<p class="mute">The update window opens on Day 31 ('+esc(dayLab(rvWinStart()))+') and runs to Day 44 ('+esc(dayLab(rvEnd()))+').</p>';
 else if(ph==="window")h+='<p class="mute">Open from Day 31 to Day 44 (until '+esc(dayLab(rvEnd()))+'). Record new numbers in <a href="'+xaW4()+'">Week 4, step '+xaW4Step()+'</a>, then add them to your record as a post-sprint update.</p>'+((S.rv.snap&&S.rv.snap.prov)?'<p class="mute">Save the final Day 30 version above first.</p>':'<p><button type="button" class="btn" data-a="rv-upd"'+(S.rv.upd.length>=RVMAX?' disabled':'')+'>Add a post-sprint update</button></p>');
 else h+='<div class="note info">The update window closed on '+esc(dayLab(rvEnd()))+'. Your sprint record is kept as it is. You can still change your own numbers, but they no longer update the sprint record.</div>';
 if(S.rv.upd.length)h+='<h3>Post-sprint updates</h3>'+S.rv.upd.map(function(u){return rvUpdRow(u,rvExp());}).join("");
 h+='</div>';
 h+=fbCard();
 var T=S.rv.testi;
 h+='<div class="card"><h2>Sharing your experience <span class="tag">optional, off by default</span></h2><p class="mute">Some members like to share a few words. It is your choice, and saying no changes nothing. This is separate from the feedback above.</p>'+'<div class="row"><button type="button" class="chip" aria-pressed="'+(T.want==="yes")+'" data-a="rv-testi" data-v="yes">I would like to write a few words</button><button type="button" class="chip" aria-pressed="'+(T.want==="no")+'" data-a="rv-testi" data-v="no">Not for me</button></div>';
 if(T.want==="yes")h+='<label for="rvt">Your words (stays private)</label><textarea id="rvt" maxlength="1500" style="min-height:100px" data-rv="ttext">'+esc(T.text)+'</textarea><div class="note info">What you write stays private and is not used anywhere unless you give permission below. We would always send you the exact wording to approve first.</div>';
 h+='<h3>Permission to contact you about using it</h3><p><button type="button" class="chip" aria-pressed="'+!!T.contact+'" data-a="rv-contact">'+(T.contact?"&#10003; ":"")+'You may contact me about using my words as a testimonial</button></p>'+(T.contact?'<div class="note ok">Thank you. Nothing is used unless you reply yes to the exact wording, and being contacted does not mean anything will be published. You can tap again at any time to withdraw. Given on '+esc(dayLab(T.at))+'.'+rvHistWords(T)+'</div>':'<div class="note info">Not ticked, so we will not contact you about it.'+rvHistWords(T)+'</div>')+'</div>';
 var C=S.rv.consent;
 h+='<div class="card"><h2>Helping us improve the programme <span class="tag">optional, off by default</span></h2><p class="mute">This is separate from sharing your story. You can say no and nothing changes, and you can withdraw it later.</p><p><button type="button" class="chip" aria-pressed="'+!!C.anon+'" data-a="rv-anon">'+(C.anon?"&#10003; ":"")+'You may use my results, without my name, to improve the programme</button></p>'+(C.anon?'<div class="note ok">Thank you. Given on '+esc(dayLab(C.at))+'. Tap again to withdraw.'+rvHistWords(C)+'</div>':(C.wd?'<div class="note info">'+rvHistWords(C)+'</div>':''))+'<div class="note warn">Draft wording. It will be checked against UK data protection requirements (what we collect, why, how long we keep it and how you withdraw) before any real use.</div></div>';
 h+='<div class="card"><h2>Your record</h2><p class="mute">You can download your data or delete it from <a href="#/profile">Profile</a>.</p></div>'+helpCard();
 return h;
}
function resultsPage(){
 var b=S.base,sent=w2Sent(),ct=w4Ctr(),r=S.w4.res,c=CL(),started=sent.length||week1Done();
 var h='<h1>Results</h1><p class="mute">Your numbers, what they show, and what you learned. Counts, not percentages, while samples are small.</p>';
 h+='<div class="card"><h2>Where you started</h2><p class="mute">The last 30 days before your sprint, from Week 1, step 1. "I don\'t know" stays unknown. It is never turned into zero.</p><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.orders))+'</b>Orders</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.revenue,true))+'</b>Revenue</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.partner))+'</b>Sales from partners</div></div></div>';
 h+='<div class="card"><h2>Your sprint so far</h2><p class="mute">'+esc(rvClock())+'</p>';
 if(started){h+=w4Counts();if(c.status==="proposed")h+='<p style="margin-top:10px">Collaboration: '+esc(W3PATHN[w3Path()])+'.</p>';
  var any=["clicks","orders","value","enq","hours"].some(function(k){return !!r[k].s;});
  if(any)h+='<div class="row" style="margin-top:6px"><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.clicks))+'</b>Link clicks</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.orders))+'</b>Orders</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.value,true))+'</b>Order value</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.enq))+'</b>Enquiries</div></div><p class="mute">Each number keeps its own state: seen, unknown or confirmed zero.</p>';
  else h+='<p class="mute">No Week 4 numbers recorded yet. You can add them in <a href="#/w4/3">Week 4, step 3</a>.</p>';
  var v=w4Verdict(w4Inputs());h+='<div class="note '+v.cls+'" style="margin-top:10px"><strong>'+(rvPhase()==="during"?"Provisional reading: ":"")+esc(v.label)+'</strong> <span class="tag">rule '+v.rule+'</span><br>'+esc(v.why[0]||"")+'</div>';
 } else h+='<p class="mute">This starts in Week 2, once you have finished Week 1 and sent your first message.</p>';
 h+='</div>';
 if(S.w4.hist.length)h+='<div class="card"><h2>Your results log</h2><p class="mute">Dated entries you saved in Week 4.</p>'+S.w4.hist.slice().reverse().slice(0,6).map(function(e){return '<div class="crow"><span><strong>'+esc(dayLab(e.d)||e.d)+'</strong><br><span class="mute">Clicks '+esc(w4Val(e.clicks))+', orders '+esc(w4Val(e.orders))+', enquiries '+esc(w4Val(e.enq))+'</span></span></div>';}).join("")+(S.w4.hist.length>6?'<p class="mute">Showing the latest 6 of '+S.w4.hist.length+'. All are kept.</p>':'')+'</div>';
 var learn=[];
 if(S.w2.diff.length)learn.push("What you think made the difference: "+S.w2.diff.join(", "));
 if(S.w4.cap.length)learn.push("What you would do differently: "+S.w4.cap.join(", "));
 if(S.w4.saw.length&&S.w4.saw.indexOf("none")<0)learn.push("What you could not see: "+S.w4.saw.join(", "));
 h+='<div class="card"><h2>What you have learned</h2>'+(learn.length?learn.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join(""):'<p class="mute">Your own notes and choices from Weeks 2 to 4 appear here as you go.</p>')+(started?rvWorked().slice(0,3).map(function(x){return '<p style="margin:4px 0">&#10003; '+esc(x)+'</p>';}).join(""):'')+'</div>';
 h+='<div class="card"><h2>Day 30 review</h2>'+(S.rv.done?'<p>Saved on '+esc(dayLab(S.rv.at))+': '+esc(S.rv.snap?S.rv.snap.label:"")+'.</p>':'<p class="mute">'+(started?"Look back at your sprint, see what the evidence suggests, and choose what to focus on next. You can open it at any time.":"Available once your sprint has started.")+'</p>')+'<p><a class="btn'+(S.rv.done?' ghost':'')+'" href="#/review">'+(S.rv.done?"Open my review":"Open my Day 30 review")+'</a></p></div>';
 h+='<div class="card"><h2>Past sprints</h2>'+rvPastHtml()+'</div>';
 return h;
}
function rvHist(o,ev){var d=today();if(ev==="given")o.at=d;else o.wd=d;o.hist=o.hist||[];if(o.hist.length<50)o.hist.push({a:ev,d:d});}
function rvAction(a,d,t){
 var R=S.rv;
 if(a==="rv-done"||a==="rv-final"){
  if(rvPhase()==="notstarted")return;
  if(a==="rv-done"&&R.done)return;
  if(a==="rv-final"&&!(R.done&&R.snap&&R.snap.prov&&rvPhase()!=="during"))return;
  R.snap=rvSnap("day30");R.done=true;R.at=today();save();
 }
 else if(a==="rv-undo"){R.done=false;R.at="";R.snap=null;save();}
 else if(a==="rv-upd"){if(!rvCanUpdate()||(R.snap&&R.snap.prov))return;var u=rvSnap("update");if(R.upd.length&&R.upd[R.upd.length-1].at===u.at)R.upd[R.upd.length-1]=u;else if(R.upd.length>=RVMAX)return;else R.upd.push(u);save();}
 else if(a==="rv-testi"){R.testi.want=R.testi.want===d.v?"":d.v;save();}
 else if(a==="rv-contact"){R.testi.contact=!R.testi.contact;rvHist(R.testi,R.testi.contact?"given":"withdrawn");save();}
 else if(a==="rv-anon"){R.consent.anon=!R.consent.anon;rvHist(R.consent,R.consent.anon?"given":"withdrawn");save();}
 else return;
 render();
}
function rvInput(t){var k=t.dataset.rv,R=S.rv;if(k==="learned"){fbDraft().learned=t.value.slice(0,1200);}else if(k==="ttext"){R.testi.text=t.value;save();}}
function rvDateChange(t){var v=String(t.value||"");if(v===""||(parseYmd(v)!=null&&v<=today())){S.rv.start=v;save();}render();}
function rvCleanHist(h){var o=[];if(Array.isArray(h))h.slice(0,50).forEach(function(x){if(x&&typeof x==="object"&&(x.a==="given"||x.a==="withdrawn")&&typeof x.d==="string"&&parseYmd(x.d)!=null)o.push({a:x.a,d:x.d});});return o;}
function rvfix(o){
 var b=RVDEF(),w=(o.rv&&typeof o.rv==="object"&&!Array.isArray(o.rv))?o.rv:{},r=b;
 var ok=function(x,y){return x!==undefined&&x!==null&&typeof x===typeof y&&Array.isArray(x)===Array.isArray(y);};
 if(typeof w.start==="string"&&(w.start===""||parseYmd(w.start)!=null))r.start=w.start;
 if(typeof w.done==="boolean")r.done=w.done;if(typeof w.at==="string"&&(w.at===""||parseYmd(w.at)!=null))r.at=w.at;
 var cleanSnap=function(s){if(!s||typeof s!=="object"||Array.isArray(s)||typeof s.label!=="string"||typeof s.at!=="string"||typeof s.rule!=="string")return null;var x={at:s.at.slice(0,10),label:s.label.slice(0,40),rule:s.rule.slice(0,4),ctr:{msgs:0,resp:0,opp:0},res:{},kind:(s.kind==="update"?"update":"day30"),asOf:(typeof s.asOf==="string"&&parseYmd(s.asOf)!=null?s.asOf:""),late:s.late===true,prov:s.prov===true};if(s.ctr&&typeof s.ctr==="object")["msgs","resp","opp"].forEach(function(k){x.ctr[k]=(typeof s.ctr[k]==="number"&&isFinite(s.ctr[k]))?s.ctr[k]:0;});["clicks","orders","value","enq","hours"].forEach(function(k){var y=s.res&&s.res[k];x.res[k]=(y&&typeof y.s==="string"&&W4VS[y.s]&&typeof y.v==="string")?{s:y.s,v:w4Clean(k,y.v)}:{s:"",v:""};});return x;};
 r.snap=cleanSnap(w.snap);if(!r.snap&&r.done){r.done=false;r.at="";}
 r.upd=[];if(Array.isArray(w.upd))w.upd.slice(-RVMAX).forEach(function(u){var c=cleanSnap(u);if(c)r.upd.push(c);});
 if(w.fb&&typeof w.fb==="object"&&!Array.isArray(w.fb)){if(typeof w.fb.learned==="string")r.fb.learned=w.fb.learned.slice(0,1200);if(Array.isArray(w.fb.miss))r.fb.miss=w.fb.miss.filter(function(x){return typeof x==="string";}).slice(0,8);if(Array.isArray(w.fb.dis))r.fb.dis=w.fb.dis.filter(function(x){return typeof x==="string";}).slice(0,1);}
 if(w.testi&&typeof w.testi==="object"&&!Array.isArray(w.testi)){var T=w.testi;if(T.want==="yes"||T.want==="no"||T.want==="")r.testi.want=T.want;if(typeof T.text==="string")r.testi.text=T.text.slice(0,1500);if(typeof T.contact==="boolean")r.testi.contact=T.contact;r.testi.hist=rvCleanHist(T.hist);["at","wd"].forEach(function(k){if(typeof T[k]==="string"&&(T[k]===""||parseYmd(T[k])!=null))r.testi[k]=T[k];});}
 if(w.consent&&typeof w.consent==="object"&&!Array.isArray(w.consent)){var C=w.consent;if(typeof C.anon==="boolean")r.consent.anon=C.anon;r.consent.hist=rvCleanHist(C.hist);["at","wd"].forEach(function(k){if(typeof C[k]==="string"&&(C[k]===""||parseYmd(C[k])!=null))r.consent[k]=C[k];});}
 o.rv=r;return o;
}

/* ---------- M5d: explicit sprint start (server record), one clock, Day 31 to 44 window, sales check and experiment chooser ---------- */
var SPR={loaded:false,err:"",serverDay:"",serverNow:"",sprints:[],feedback:{}};
var CHKQ=[
 ["where","Where do people buy from you today?",[["etsy","Etsy"],["ownsite","My own website or shop"],["market","Another marketplace"],["social","Social media or direct messages"],["notyet","I am not selling yet"]]],
 ["aud","Do you have an audience today?",[["none","Not really"],["small","A small one"],["some","A good size"]]],
 ["list","Do you have an email list?",[["none","No"],["small","A small one"],["yes","Yes"]]],
 ["bot","What feels like the biggest bottleneck?",[["findit","Few people find my product"],["nosales","People visit but do not buy"],["noaud","I have no audience yet"],["unsure","I am not sure"]]],
 ["reach","How do you feel about contacting people directly?",[["low","Nervous"],["ok","Okay"],["high","Comfortable"]]],
 ["cam","How do you feel about being on camera or live?",[["no","Not for me"],["some","Maybe"],["yes","Happy to"]]]
];
var CHKALLOWED={where:{etsy:1,ownsite:1,market:1,social:1,notyet:1},aud:{none:1,small:1,some:1},list:{none:1,small:1,yes:1},reach:{low:1,ok:1,high:1},cam:{no:1,some:1,yes:1},bot:{findit:1,nosales:1,noaud:1,unsure:1}};
var CHKDEF=function(){return {done:false,at:"",q:{where:"",aud:"",list:"",reach:"",cam:"",bot:""}};};
var EXPOPEN={part:true};
var SPRMSG={sprint_active:"You already have a sprint running. You can start your next one once it has finished.",not_entitled:"Your membership does not currently allow starting a sprint.",experiment_not_available:"That experiment is not open yet.",bad_day:"That date is not allowed.",not_signed_in:"Please sign in again.",undo_window_over:"The 24 hour undo period has passed.",work_logged:"Undo is not available once you have logged messages, a proposal or results.",correction_window_over:"The 3 day correction period has passed. Please contact support if the date is wrong.",already_corrected:"You have already used your one correction. Please contact support.",bad_reason:"Please choose a reason.",repeat_sprint:"Undo is not available for a repeat sprint. Please contact support if it was a mistake."};

/* ===== SPRINT CLOCK LOGIC START: pure rules, checked by dev/m5d_logic_tests.js ===== */
function rvCur(){var a=SPR.sprints||[];return a.length?a[a.length-1]:null;}
function rvStart(){var c=rvCur();return c?c.start_day:"";}
function rvDay(){var c=rvCur();if(!c)return 0;var a=parseYmd(c.start_day),b=parseYmd(today());if(a==null||b==null)return 0;return Math.max(1,Math.floor((b-a)/86400000)+1);}
function rvDay30(){return rvCur()?addDays(rvStart(),29):"";}
function rvWinStart(){return rvCur()?addDays(rvStart(),30):"";}
function rvEnd(){return rvCur()?addDays(rvStart(),43):"";}
function rvPhase(){if(!rvCur())return "notstarted";var t=today();if(t<=rvDay30())return "during";if(t<=rvEnd())return "window";return "closed";}
function rvClock(){var p=rvPhase();if(p==="notstarted")return "Sprint not started. Your 30 days begin only when you choose.";if(p==="during")return "Day "+rvDay()+" of 30";if(p==="window")return "Sprint complete. Results update window open until "+dayLab(rvEnd())+" (Day 44)";return "Sprint complete. Update window closed on "+dayLab(rvEnd());}
function rvDay30Res(){var d30=rvDay30(),best=null;S.w4.hist.forEach(function(e){if(e.d<=d30&&(!best||e.d>=best.d))best=e;});return best;}
function rvSnap(kind){
 var ph=rvPhase(),asOf=null,res=S.w4.res,late=false,prov=false,eff="";
 if(kind==="day30"){
  if(ph==="during")prov=true;
  else{asOf=rvDay30();var b=rvDay30Res();if(b){res=b;eff=b.d;}else late=true;}
 }
 var inp=w4Inputs(asOf,res),v=w4Verdict(inp),x={};
 ["clicks","orders","value","enq","hours"].forEach(function(k){x[k]={s:res[k]?res[k].s:"",v:res[k]?res[k].v:""};});
 return {at:today(),label:v.label,rule:v.rule,ctr:{msgs:inp.msgs,resp:inp.yes+inp.maybe+inp.no,opp:inp.agreed?1:0},res:x,kind:kind==="day30"?"day30":"update",asOf:eff,late:late,prov:prov};
}
function rvPostTag(d){return (rvCur()&&d>rvDay30())?' <span class="tag">post-sprint update</span>':'';}
function rvPostNote(){
 var p=rvPhase();
 if(p==="window")return '<div class="note info"><strong>Your sprint ended on Day 30 ('+esc(dayLab(rvDay30()))+').</strong> Numbers you save now are post-sprint updates. They are kept separate from your Day 30 position, and you can add them until '+esc(dayLab(rvEnd()))+'.</div>';
 if(p==="closed")return '<div class="note info">Your update window closed on '+esc(dayLab(rvEnd()))+'. You can still keep your own numbers here, but they no longer update your sprint record.</div>';
 return "";
}
function sprHasWork(){
 var any=Object.keys(S.out||{}).some(function(k){return S.out[k]&&S.out[k].status==="sent";});
 if(any||(S.col&&S.col.status==="proposed"))return true;
 return Object.keys(S.w4.res).some(function(k){return !!S.w4.res[k].s;});
}
function sprHours(){var c=rvCur();if(!c)return 9999;var t=Date.parse(c.started_at);if(isNaN(t))return 9999;return (nowMs()-t)/3600000;}
function sprCanUndo(){var c=rvCur();return !!c&&rvPhase()==="during"&&(SPR.sprints||[]).length===1&&sprHours()<=24&&!sprHasWork();}
function sprCanCorrect(){var c=rvCur();return !!c&&rvPhase()==="during"&&sprHours()<=72&&(!c.corrections||c.corrections.length===0);}
function chkWhere(){
 var q=S.chk.q.where;if(q)return {v:q,src:"answer"};
 var w=String(S.focus.where||"").toLowerCase();if(!w.trim())return {v:"",src:""};
 var v="";
 if(/etsy/.test(w))v="etsy";
 else if(/not (yet )?(selling|live)|haven.?t (started|launched)|planning/.test(w))v="notyet";
 else if(/amazon|gumroad|teachable|ebay|payhip|skillshare|udemy|marketplace|depop|creative market/.test(w))v="market";
 else if(/instagram|tiktok|facebook|social|dm|pinterest|youtube/.test(w))v="social";
 else if(/shopify|squarespace|wix|woo|website|site|own|simvoly|store|shop/.test(w))v="ownsite";
 return {v:v,src:v?"details":""};
}
/* Revised scoring (fit first, availability never affects the score). Weights: where you sell, existing assets and the bottleneck carry the score. Comfort questions change a score by at most one point and never rule an experiment out. */
function chkRec(){
 var q=S.chk.q,W=chkWhere(),wh=W.v,answered=0;
 ["aud","list","bot","reach","cam"].forEach(function(k){if(q[k])answered++;});if(wh)answered++;
 var sc={part:0,etsy:0,email:0,show:0,find:0,live:0},ev={part:[],etsy:[],email:[],show:[],find:[],live:[]},no={part:"",etsy:"",email:"",show:"",find:"",live:""};
 var add=function(k,n,t){sc[k]+=n;ev[k].push(t);},nudge=function(k,n,t){sc[k]+=n;ev[k].push(t);};
 var src=W.src==="details"?" (from your product details)":"";
 /* Etsy Sales Bottleneck: needs a live Etsy listing */
 if(wh==="etsy"){add("etsy",4,"You sell on Etsy"+src+".");if(q.bot==="nosales")add("etsy",3,"You said people visit but do not buy.");else if(q.bot==="findit")add("etsy",2,"You said few people find your product.");else if(q.bot==="unsure")add("etsy",1,"You are not sure what is wrong, which is exactly what its diagnosis step is for.");}
 else if(wh)no.etsy="It needs a live Etsy listing, and you said you sell elsewhere or are not selling yet.";
 /* Email-to-Sale: needs an email list */
 if(q.list==="yes"){add("email",4,"You have an email list.");if(q.bot==="nosales")add("email",2,"You said people visit but do not buy.");}
 else if(q.list==="small"){add("email",2,"You have a small email list.");if(q.bot==="nosales")add("email",1,"You said people visit but do not buy.");}
 else if(q.list==="none")no.email="It needs an email list of people who agreed to hear from you, and you said you do not have one yet.";
 /* LIVE Sales: needs an audience */
 if(q.aud==="some"){add("live",3,"You have a good sized audience.");if(q.bot==="nosales")add("live",1,"You said people visit but do not buy, and live selling lets people ask questions.");}
 else if(q.aud==="small"){add("live",1,"You have a small audience.");}
 else if(q.aud==="none")no.live="It needs an audience to sell to, and you said you do not have one yet.";
 if(q.cam==="yes"&&sc.live>0)nudge("live",1,"You are happy to be on camera.");else if(q.cam==="no"&&sc.live>0)nudge("live",-1,"Being on camera is not for you, which makes this harder.");
 /* Show-to-Sell: shows the product in use */
 if(wh==="ownsite"||wh==="social"||wh==="market"){add("show",1,"You sell through "+(wh==="social"?"social media or messages":(wh==="ownsite"?"your own site":"a marketplace"))+src+", where a clear demo can help.");}
 if(q.bot==="nosales")add("show",2,"You said people visit but do not buy, and a demo shows buyers what they get.");
 if(q.bot==="findit")add("show",1,"You said few people find your product, and short demos are shareable.");
 if(q.aud==="small"||q.aud==="some")add("show",1,"You have an audience to show it to.");
 if(sc.show>0&&q.cam==="yes")nudge("show",1,"You are happy to be on camera.");else if(sc.show>0&&q.cam==="no")nudge("show",-1,"Being on camera is not for you, but screen demos and photos can work.");
 /* Find Your Buyers: works from nothing */
 if(q.aud==="none")add("find",2,"You have no audience of your own yet.");
 if(q.bot==="noaud")add("find",3,"You said you have no audience yet.");
 else if(q.bot==="findit")add("find",2,"You said few people find your product.");
 if(wh==="notyet")add("find",1,"You are not selling yet, so knowing where your buyers already spend time comes first.");
 /* Partnership-to-Sales: borrows other people's audiences */
 if(q.aud==="none")add("part",2,"You have no audience of your own, and partners already have one.");
 else if(q.aud==="small")add("part",1,"Your audience is small, and partners can widen it.");
 if(q.bot==="noaud")add("part",2,"You said you have no audience yet.");
 else if(q.bot==="findit")add("part",2,"You said few people find your product.");
 if(sc.part>0&&(q.reach==="ok"||q.reach==="high"))nudge("part",1,"You are okay contacting people directly.");else if(sc.part>0&&q.reach==="low")ev.part.push("Contacting people feels nervous. The experiment starts with one warm contact, so this is a gentle first step.");
 var AS={part:"We are assuming you can think of a few people who reach your buyer.",etsy:"We are assuming your listing is live and you can see its numbers.",email:"We are assuming the people on your list agreed to hear from you.",show:"We are assuming your product is easy to show in use.",find:"We are assuming your buyers gather in places you can join.",live:"We are assuming you have LIVE access on TikTok or YouTube."};
 var list=EXPX.map(function(x){var k=x[0];return {key:k,name:x[1],score:no[k]?0:Math.max(0,sc[k]),evidence:ev[k],assume:AS[k],open:!!EXPOPEN[k],unsuitable:!!no[k],why:no[k]};});
 var el=list.filter(function(x){return !x.unsuitable;}).sort(function(a,b){return b.score-a.score;}),top=el[0],second=el[1],strength,leaders;
 if(!top||top.score<3){strength="weak";leaders=el.filter(function(x){return x.score>0;}).slice(0,3);}
 else{var tie=el.filter(function(x){return x.score===top.score;});if(tie.length>1){strength="tied";leaders=tie;}else if(top.score>=5&&top.score-second.score>=2){strength="strong";leaders=[top];}else if(top.score-second.score>=1){strength="good";leaders=[top];}else{strength="tied";leaders=[top];}}
 return {strength:strength,leaders:leaders,top:leaders[0]||null,list:el.concat(list.filter(function(x){return x.unsuitable;})),answered:answered};
}
/* ===== SPRINT CLOCK LOGIC END ===== */

function sprFmtDay(d){return d?dayLab(d):"";}
function sprintBar(full){
 if(!SPR.loaded)return '<div class="note warn" role="status">We could not check your sprint start just now, so the clock is not shown. Please refresh the page. Nothing has been changed.</div>';
 var ph=rvPhase(),cur=rvCur(),pn=pastOpenNote(),err=UI.sprErr?'<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>':'';
 if(!full)return '<div class="note info"><strong>'+esc(rvClock())+'</strong>'+(ph==="notstarted"?' <a href="#/sprint">My Sprint</a>':'')+'</div>'+pn;
 var h=pn+'<div class="card"><h2>Your 30-day sprint</h2><p><strong>'+esc(rvClock())+'</strong></p>'+err;
 if(ph==="notstarted"){
  h+='<p class="mute">Browsing, the sales check, choosing an experiment and preparing do not start the clock. It starts only when you press the button below.</p>'+sprConfirm("Start my 30-day sprint");
 }else{
  h+='<p class="mute">Day 1 was '+esc(sprFmtDay(rvStart()))+'. Day 30 is '+esc(sprFmtDay(rvDay30()))+'. The results update window runs from Day 31 to Day 44 ('+esc(sprFmtDay(rvEnd()))+').</p>';
  if(cur.corrections&&cur.corrections.length)h+='<p class="mute">Your start date was corrected once, from '+esc(sprFmtDay(cur.corrections[0].from))+'. The original is kept on record.</p>';
  if(sprCanUndo())h+='<p><button type="button" class="chip" data-a="spr-undo">I started by mistake, undo</button> <span class="mute">Available for 24 hours, only before you log any messages or results.</span></p>';
  if(sprCanCorrect()){
   h+='<p><button type="button" class="chip" data-a="spr-corr-open" aria-expanded="'+!!(UI.sprCorr&&UI.sprCorr.open)+'">I actually began earlier</button></p>';
   if(UI.sprCorr&&UI.sprCorr.open)h+='<div class="note info"><label for="spc">The day you really began</label><input id="spc" type="date" data-spr="cday" value="'+esc(UI.sprCorr.day||"")+'" max="'+esc(rvStart())+'" min="'+esc(addDays(rvStart(),-7))+'" style="max-width:200px"><label for="spr">Reason</label><select id="spr" data-spr="creason"><option value="started_earlier"'+(UI.sprCorr.reason==="started_earlier"?" selected":"")+'>I began earlier</option><option value="misclick"'+(UI.sprCorr.reason==="misclick"?" selected":"")+'>I pressed it too late</option><option value="other"'+(UI.sprCorr.reason==="other"?" selected":"")+'>Something else</option></select><p class="mute">You can do this once, within 3 days, and not more than 7 days earlier. Your original date is kept on record. After that, please contact support.</p><p><button type="button" class="btn" data-a="spr-corr-go">Correct my start date</button></p></div>';
  }
 }
 return h+'</div>';
}
function sprConfirm(label){
 var again=rvPhase()!=="notstarted";
 if(UI.sprBusy)return '<p class="mute">Starting...</p>';
 if(!UI.sprConf)return '<p><button type="button" class="btn" data-a="spr-ask">'+esc(label)+'</button></p>';
 return '<div class="note ok" role="alertdialog" aria-label="Confirm starting your sprint"><p><strong>Begin Day 1 today ('+esc(dayLab(today()))+')?</strong></p><p>Day 30 would be '+esc(dayLab(addDays(today(),29)))+'. You can finish early, but you cannot pause the clock. After Day 30 you will have 14 more days to add late results, which does not extend your sprint.'+(again?' Your current sprint will be saved to Past sprints, and your outreach and results will start fresh.':'')+' If you press this by mistake, you can undo it within 24 hours before logging any messages or results.</p><p class="row"><button type="button" class="btn" data-a="spr-go">Yes, start Day 1 today</button><button type="button" class="btn ghost" data-a="spr-cancel">Not yet</button></p></div>';
}
async function sprLoad(){
 var r=await sb.rpc("sprint_status");
 if(r.error){SPR.err=r.error.message||"error";SPR.loaded=false;return false;}
 var fb={};var f=await sb.rpc("get_sprint_feedback");if(!f.error&&Array.isArray(f.data))f.data.forEach(function(x){fb[x.sprint_id]=x;});
 SPR={loaded:true,err:"",serverDay:r.data.server_day,serverNow:r.data.server_now,sprints:r.data.sprints||[],feedback:fb};
 await fbMigrate();return true;
}
function sprMsg(m){m=String(m||"");for(var k in SPRMSG){if(m.indexOf(k)>-1)return SPRMSG[k];}return "Something went wrong, and nothing was changed. Please try again.";}
function sprArchive(prev){
 var snap=S.rv.snap,auto=false;
 if(!snap){snap=rvSnap("day30");auto=true;}
 var inp=w4Inputs(),c=w4Ctr(),b0=S.base||{};
 var e={exp:"partnership",sid:prev.id,start:prev.start_day,archivedAt:today(),label:snap.label,rule:snap.rule,review:!!S.rv.done,auto:auto,ctr:{msgs:c.msgs,resp:c.resp,opp:c.opp},res:clone(S.w4.res),hist:S.w4.hist.slice(0,20),snap:snap,upd:S.rv.upd.slice(0,20),
  inp:{partners:inp.partners,msgs:inp.msgs,yes:inp.yes,maybe:inp.maybe,no:inp.no,noreply:inp.noreply,fuSent:inp.fuSent,agreed:inp.agreed,ran:inp.ran,daysSinceSend:inp.daysSinceSend},
  partners:(S.cands||[]).slice(0,12).map(function(x){return String(x.name||"").slice(0,60);}),
  base:{orders:clone(b0.orders||{s:"",v:""}),revenue:clone(b0.revenue||{s:"",v:""}),partner:clone(b0.partner||{s:"",v:""})},
  steps:{w1:STEPS.filter(function(s){return S.steps[s.n];}).length,w2:STEPS2.filter(function(s){return S.w2.steps[s.n];}).length,w3:STEPS3.filter(function(s){return S.w3.steps[s.n];}).length,w4:STEPS4.filter(function(s){return S.w4.steps[s.n];}).length}};
 S.past=(S.past||[]);if(S.past.length>=10)S.past.shift();S.past.push(e);
 /* the new experiment starts with its own answers and completion status. Only the business profile, offer and buyer carry forward. */
 var b=blank(),keep={testi:S.rv.testi,consent:S.rv.consent};
 S.steps={};S.decision="";S.cands=[];S.sketch={};S.nextId=1;S.base=b.base;S.refl="";S.types=b.types;S.cdraft=b.cdraft;S.cmsg="";S.fitIndex=0;S.newType="";
 S.w2=b.w2;S.out={};S.w3=b.w3;S.col=clone(W3DEF);S.w4=W4DEF();S.rv=RVDEF();S.rv.testi=keep.testi;S.rv.consent=keep.consent;S.week=1;
}
async function sprGo(){
 if(UI.sprBusy)return;UI.sprBusy=true;UI.sprErr="";render();
 var prev=rvCur(),ph=rvPhase();
 var r=await sb.rpc("start_sprint",{p_experiment:"partnership",p_day:today()});
 UI.sprBusy=false;UI.sprConf=false;
 if(r.error){UI.sprErr=sprMsg(r.error.message);render();return;}
 if(prev&&(ph==="window"||ph==="closed"))sprArchive(prev);
 await sprLoad();
 save();toast("Day 1 begins today. Good luck.");render();
}
async function sprUndo(){
 var c=rvCur();if(!c||!sprCanUndo())return;
 var r=await sb.rpc("undo_sprint_start",{p_id:c.id});
 if(r.error){UI.sprErr=sprMsg(r.error.message);render();return;}
 UI.sprErr="";await sprLoad();toast("Your sprint start was undone. The clock has not started.");render();
}
async function sprCorrect(){
 var c=rvCur(),x=UI.sprCorr||{};if(!c||!sprCanCorrect())return;
 if(!x.day||parseYmd(x.day)==null){UI.sprErr="Please choose the day you really began.";render();return;}
 var r=await sb.rpc("correct_sprint_start",{p_id:c.id,p_new_day:x.day,p_reason:x.reason||"started_earlier"});
 if(r.error){UI.sprErr=sprMsg(r.error.message);render();return;}
 UI.sprErr="";UI.sprCorr=null;await sprLoad();toast("Your start date was corrected. The original is kept on record.");render();
}
function sprAction(a,d,t){
 if(a==="spr-ask"){UI.sprConf=true;UI.sprErr="";render();}
 else if(a==="spr-cancel"){UI.sprConf=false;render();}
 else if(a==="spr-go"){sprGo();}
 else if(a==="spr-undo"){sprUndo();}
 else if(a==="spr-corr-open"){UI.sprCorr=(UI.sprCorr&&UI.sprCorr.open)?null:{open:true,day:"",reason:"started_earlier"};render();}
 else if(a==="spr-corr-go"){sprCorrect();}
 else if(a==="chk-set"){if(CHKALLOWED[d.q]&&CHKALLOWED[d.q][d.v]){S.chk.q[d.q]=S.chk.q[d.q]===d.v?"":d.v;S.chk.done=false;save();render();}}
 else if(a==="chk-run"){S.chk.done=true;S.chk.at=today();save();render();}
 else if(a==="fb-miss"){var dm=fbDraft(),ix=dm.miss.indexOf(d.v);if(ix>-1)dm.miss.splice(ix,1);else if(dm.miss.length<8)dm.miss.push(d.v);render();}
 else if(a==="fb-dis"){var dd=fbDraft();dd.dis=dd.dis===d.v?"":d.v;render();}
 else if(a==="fb-save"){fbSave();}
 else if(a==="fb-del"){fbDelete();}
 else if(a==="chk-redo"){S.chk.done=false;save();render();}
}
function sprInputChange(t){var k=t.dataset.spr;UI.sprCorr=UI.sprCorr||{open:true,day:"",reason:"started_earlier"};if(k==="cday")UI.sprCorr.day=String(t.value||"");else if(k==="creason")UI.sprCorr.reason=String(t.value||"started_earlier");}
function rvRemindNote(){
 if(rvPhase()==="notstarted")return '<p class="mute">Sprint reminders begin when you start your sprint.</p>';
 var s=rvStart();return '<p class="mute">Your sprint reminders follow your start date: around Day 7 ('+esc(dayLab(addDays(s,6)))+'), Day 14, Day 21, Day 28, Day 30 ('+esc(dayLab(rvDay30()))+') and the end of your update window ('+esc(dayLab(rvEnd()))+'). Monthly group coaching stays on its shared schedule.</p>';
}
function chkLine(x){return '<p style="margin:4px 0"><strong>'+esc(x.name)+'</strong> <span class="tag">'+(x.open?"open now":"coming soon, not open yet")+'</span></p>'+(x.evidence.length?x.evidence.slice(0,3).map(function(y){return '<p style="margin:2px 0 2px 12px">&#10003; '+esc(y)+'</p>';}).join(""):"")+'<p class="mute" style="margin:2px 0 8px 12px">'+esc(x.assume)+'</p>';}
function chkCard(){
 var h='<div class="card"><h2>A short sales check</h2><p class="mute">Six quick questions. Your answers stay private and only shape a suggestion. You can skip any of them, and you can choose any experiment that is open. You do not have to follow it.</p>';
 CHKQ.forEach(function(q){var cur=q[0]==="where"?(chkWhere().v||""):S.chk.q[q[0]];h+='<div class="q"><strong>'+esc(q[1])+'</strong>'+(q[0]==="where"&&!S.chk.q.where&&cur?'<span class="mute"> (filled from your product details, change it if it is wrong)</span>':'')+'<div class="row">'+q[2].map(function(o){return '<button type="button" class="chip sm" aria-pressed="'+(cur===o[0])+'" data-a="chk-set" data-q="'+q[0]+'" data-v="'+o[0]+'">'+esc(o[1])+'</button>';}).join("")+'</div></div>';});
 h+=S.chk.done?'<p><button type="button" class="btn ghost" data-a="chk-redo">Change my answers</button></p>':'<p><button type="button" class="btn" data-a="chk-run">Show my suggestion</button></p>';
 h+='</div>';
 if(S.chk.done){
  var r=chkRec(),L=r.leaders;
  if(r.strength==="strong"||r.strength==="good"){
   var t=L[0],alt=r.list.filter(function(x){return x.key!==t.key&&!x.unsuitable&&x.score>0;}).slice(0,2);
   h+='<div class="card" style="border-color:var(--acc)"><h2>Our suggestion: '+esc(t.name)+'</h2><p><span class="tag">'+(r.strength==="strong"?"strong fit":"good fit")+'</span></p><h3>What you told us</h3>'+t.evidence.map(function(x){return '<p style="margin:4px 0">&#10003; '+esc(x)+'</p>';}).join("")+'<h3>What we are assuming</h3><p style="margin:4px 0">'+esc(t.assume)+'</p>';
   h+=t.open?'<p><strong>This experiment is open now.</strong></p>':'<div class="note info"><strong>Coming soon, and not open yet.</strong> You cannot start it today. Another experiment that is open now may still suit you, and you are free to choose it.</div>';
   if(alt.length)h+='<h3>Other good options</h3>'+alt.map(chkLine).join("");
  }else if(r.strength==="tied"){
   h+='<div class="card" style="border-color:var(--acc)"><h2>Two or more experiments fit about equally</h2><p>Your answers do not point to a single best experiment, so we are not choosing one for you. Here is how they compare. Pick the one that feels right, or change your answers above.</p>'+L.map(chkLine).join("");
  }else{
   h+='<div class="card" style="border-color:var(--acc)"><h2>We do not have enough to suggest one experiment yet</h2><p>'+(r.answered<2?"You have answered very little, so any suggestion would be a guess. ":"Your answers do not clearly favour any experiment. ")+'More answers will help, and you can also choose any experiment that is open without a suggestion.</p>'+(L.length?'<h3>The closest matches so far</h3>'+L.map(chkLine).join(""):"");
  }
  var un=r.list.filter(function(x){return x.unsuitable;});
  if(un.length)h+='<h3>Less suited right now</h3>'+un.map(function(x){return '<p style="margin:4px 0"><strong>'+esc(x.name)+'</strong>: '+esc(x.why)+'</p>';}).join("");
  h+='<p class="mute">This is advice, not a rule. Open experiments are marked, and you are free to choose a different one.</p></div>';
 }
 return h;
}
function experimentsPage(){
 var ph=rvPhase(),h='<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Experiments</h1><p class="mute">Six experiments, four weeks each, about 3 to 5 hours a week. You run one sprint at a time, and you choose when the next one starts. Nothing starts automatically.</p>'+sprintBar(false);
 h+='<div class="note warn"><strong>Temporary test limitation.</strong> In this test build only Partnership-to-Sales can be started. The other five will become available as they are built. You will always be able to choose any experiment that is open.</div>';
 if(UI.sprErr&&ph==="notstarted")h+='<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>';
 h+=chkCard()+'<div class="xgrid">';
 EXPX.forEach(function(x,i){
  var cur=x[0]==="part";
  h+='<div class="xp"><div class="xh2"><span class="xi'+((x[0]==="show"||x[0]==="live")?' dk':'')+'" style="background:'+x[5]+'">'+x[6]+'</span><div><div class="xk">Experiment '+(i+1)+'</div><div class="xt">'+esc(x[1])+'</div></div></div><p class="xs">'+esc(x[2])+'</p><div class="xo"><b>Your outcome</b><span>'+esc(x[3])+'</span></div><div class="xm">4 weeks &middot; 3 to 5 hours a week &middot; Best for: '+esc(x[4])+'</div>';
  if(!cur)h+='<div class="xm"><strong>Coming soon.</strong> Not open yet, so it cannot be started.</div>';
  else if(!SPR.loaded)h+='<div class="xm">We could not check your sprint just now. Please refresh the page.</div>';
  else if(ph==="during")h+='<div class="xm"><strong>Your current experiment.</strong> '+esc(rvClock())+'. Find it under <a href="#/sprint">My Sprint</a>. You can start your next sprint after Day 30.</div>';
  else h+=(ph==="notstarted"?'<div class="xm">Ready when you are. Your 30 days begin only when you press the button.</div>':'<div class="xm">Your last sprint is complete. You can choose when to start another, and it will not start by itself.</div>')+sprConfirm(ph==="notstarted"?"Start my 30-day sprint":"Start another sprint");
  h+='</div>';
 });
 return h+'</div>';
}
function d5fix(o){
 var okd=function(x){return (typeof x==="string"&&(x===""||parseYmd(x)!=null))?x:"";},st=function(x,n){return typeof x==="string"?x.slice(0,n):"";},nm=function(x){return (typeof x==="number"&&isFinite(x)&&x>=0&&x<100000)?Math.floor(x):0;};
 var past=[];if(Array.isArray(o.past))o.past.slice(-10).forEach(function(x){
  if(!x||typeof x!=="object"||Array.isArray(x))return;
  var w4t=w4fix({w4:{res:x.res,hist:x.hist}}).w4,rvt=rvfix({rv:{snap:x.snap,upd:x.upd,done:!!x.snap}}).rv,fb=(x.fb&&typeof x.fb==="object")?x.fb:{};
  var ip=(x.inp&&typeof x.inp==="object")?x.inp:{},bs=(x.base&&typeof x.base==="object")?x.base:{},w1t=w4fix({w4:{res:{orders:bs.orders,value:bs.revenue,enq:bs.partner}}}).w4.res;
  past.push({exp:"partnership",sid:nm(x.sid),auto:x.auto===true,inp:{partners:nm(ip.partners),msgs:nm(ip.msgs),yes:nm(ip.yes),maybe:nm(ip.maybe),no:nm(ip.no),noreply:nm(ip.noreply),fuSent:nm(ip.fuSent),agreed:ip.agreed===true,ran:ip.ran===true,daysSinceSend:nm(ip.daysSinceSend)},partners:Array.isArray(x.partners)?x.partners.filter(function(y){return typeof y==="string";}).slice(0,12).map(function(y){return y.slice(0,60);}):[],base:{orders:w1t.orders,revenue:w1t.value,partner:w1t.enq},start:okd(x.start),archivedAt:okd(x.archivedAt),label:st(x.label,40),rule:st(x.rule,4),review:x.review===true,ctr:{msgs:nm(x.ctr&&x.ctr.msgs),resp:nm(x.ctr&&x.ctr.resp),opp:nm(x.ctr&&x.ctr.opp)},res:w4t.res,hist:w4t.hist,snap:rvt.snap,upd:rvt.upd,fb:{learned:st(fb.learned,1200),miss:Array.isArray(fb.miss)?fb.miss.filter(function(y){return typeof y==="string";}).slice(0,8):[]},steps:{w1:nm(x.steps&&x.steps.w1),w2:nm(x.steps&&x.steps.w2),w3:nm(x.steps&&x.steps.w3),w4:nm(x.steps&&x.steps.w4)}});
 });
 o.past=past;
 var c=(o.chk&&typeof o.chk==="object"&&!Array.isArray(o.chk))?o.chk:{},n=CHKDEF();
 n.done=c.done===true;n.at=okd(c.at);
 Object.keys(n.q).forEach(function(k){var v=c.q&&c.q[k];if(typeof v==="string"&&CHKALLOWED[k][v])n.q[k]=v;});
 o.chk=n;return o;
}

function pastWinOpen(p){return !!(p&&p.start&&today()>addDays(p.start,29)&&today()<=addDays(p.start,43));}
function pastEndDay(p){return addDays(p.start,43);}
function puDraft(){if(!UI.pu)UI.pu={i:-1,res:{clicks:{s:"",v:""},orders:{s:"",v:""},value:{s:"",v:""},enq:{s:"",v:""},hours:{s:"",v:""}}};return UI.pu;}
function puRow(k,money){
 var o=puDraft().res[k],opts=k==="hours"?[["value","A number"],["unknown","I am not sure"]]:[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
 return '<div class="q"><strong>'+esc(W4NUM[k]+(money?" ("+sym(S.focus.currency).trim()+")":""))+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="pu-vs" data-k="'+k+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="12" data-pu="'+k+'" value="'+esc(o.v)+'" aria-label="'+esc(W4NUM[k])+'" style="max-width:160px">':'')+'</div>';
}
function rvPastHtml(){
 var rows=[];
 (S.past||[]).forEach(function(p,i){
  var open=pastWinOpen(p),h='<div class="card" style="box-shadow:none;border:1px solid var(--line)"><p style="margin:0"><strong>'+esc(xaNameOf(p.exp))+'</strong> <span class="tag">Day 30 position: '+esc(p.label||"Not reviewed")+'</span></p><p class="mute" style="margin:2px 0 6px">Started '+esc(dayLab(p.start))+'.'+(p.auto?' Your Day 30 position was recorded automatically from your dated entries when you started your next sprint.':'')+'</p>';
  h+=pastSummary(p);(p.upd||[]).forEach(function(u){h+=rvUpdRow(u,p.exp);});
  if(open){
   h+='<div class="note info">The update window for this earlier sprint is open until '+esc(dayLab(pastEndDay(p)))+'. Results you add here belong to this sprint only. They do not change your current sprint or your Day 30 position.</div>';
   if(p.exp==="etsy"){h+=etPastLate(p,i);}else if(p.exp==="email"){h+=emPastLate(p,i);}else if(p.exp==="show"){h+=stsPastLate(p,i);}else if(p.exp==="find"){h+=fybPastLate(p,i);}else if(UI.pu&&UI.pu.i===i){var d=puDraft();h+=['clicks','orders','value','enq','hours'].map(function(k){return puRow(k,k==="value");}).join("")+'<p class="row"><button type="button" class="btn" data-a="pu-save">Save as a post-sprint update</button><button type="button" class="btn ghost" data-a="pu-cancel">Cancel</button></p>';}
   else h+='<p><button type="button" class="btn ghost" data-a="pu-open" data-i="'+i+'">Add a late result to this sprint</button></p>';
  } else if(today()>pastEndDay(p))h+='<p class="mute">The update window for this sprint closed on '+esc(dayLab(pastEndDay(p)))+'.</p>';
  rows.push(h+'</div>');
 });
 if(S.rv.done&&S.rv.snap)rows.push('<div class="crow"><span><strong>'+esc(xaName())+'</strong><br><span class="mute">Started '+esc(dayLab(rvStart()))+'. Current sprint</span></span><span class="tag">'+esc(S.rv.snap.label)+'</span></div>');
 return rows.length?rows.join(""):'<p class="mute">Your first sprint will appear here once you save your Day 30 review.</p>';
}
function pastOpenNote(){
 var o=(S.past||[]).filter(pastWinOpen)[0];
 return o?'<div class="note info"><strong>Your earlier sprint is still in its update window</strong> (until '+esc(dayLab(pastEndDay(o)))+'). Add late results under <a href="#/results">Results</a>, Past sprints. This does not affect your new sprint.</div>':"";
}
function puAction(a,d,t){
 var u=puDraft();
 if(a==="pu-open"){var i=+d.i;if(!(S.past||[])[i]||!pastWinOpen(S.past[i]))return;UI.pu=null;u=puDraft();u.i=i;render();}
 else if(a==="pu-cancel"){UI.pu=null;render();}
 else if(a==="pu-vs"){if(!u.res[d.k]||!W4VS[d.v])return;u.res[d.k].s=u.res[d.k].s===d.v?"":d.v;if(u.res[d.k].s!=="value")u.res[d.k].v="";render();}
 else if(a==="pu-save"){
  var p=(S.past||[])[u.i];if(!p||!pastWinOpen(p))return;
  var any=Object.keys(u.res).some(function(k){return !!u.res[k].s;});if(!any)return;
  var res={};Object.keys(u.res).forEach(function(k){res[k]={s:u.res[k].s,v:u.res[k].s==="value"?w4Clean(k,u.res[k].v):""};});
  var v=w4Verdict(Object.assign({},p.inp,{clicks:res.clicks,orders:res.orders,enq:res.enq}));
  var e={at:today(),label:v.label,rule:v.rule,ctr:p.ctr,res:res,kind:"update",asOf:"",late:false,prov:false};
  p.upd=p.upd||[];if(p.upd.length&&p.upd[p.upd.length-1].at===e.at)p.upd[p.upd.length-1]=e;else if(p.upd.length<RVMAX)p.upd.push(e);else return;
  UI.pu=null;save();render();
 }
}
function puInput(t){var k=t.dataset.pu,u=puDraft();if(u.res[k]&&u.res[k].s==="value"){var c=w4Clean(k,t.value);u.res[k].v=c;if(c!==t.value)t.value=c;}}

/* ---------- feedback in its own table (design and development only: no deletion job, no retention setting) ---------- */
function fbDraft(){
 var c=rvCur(),sv=(c&&SPR.feedback&&SPR.feedback[c.id])||null;
 if(!UI.fbd||UI.fbd.sid!==(c?c.id:0))UI.fbd={sid:c?c.id:0,learned:sv?sv.learned:"",miss:sv?(sv.miss||[]).slice():[],dis:sv?(sv.dis||""):"",busy:false,msg:""};
 return UI.fbd;
}
function fbCard(){
 var c=rvCur();
 if(!c)return '<div class="card"><h2>Tell us how it went <span class="tag">optional</span></h2><p class="mute">Available once your sprint has started.</p></div>';
 var d=fbDraft(),sv=SPR.feedback&&SPR.feedback[c.id];
 var h='<div class="card"><h2>Tell us how it went <span class="tag">optional</span></h2><p class="mute">You can skip all of this. Your answers are private, kept separately from your sprint work, and read by the WEN team to improve the programme. They are not shared publicly. You can delete them at any time.</p><label for="rvl">What did you learn, or find most useful?</label><textarea id="rvl" maxlength="1200" style="min-height:80px" data-rv="learned" placeholder="A sentence or two is plenty">'+esc(d.learned)+'</textarea><label>What would you miss most if it disappeared?</label><div class="row">'+RVMISS.map(function(o){return '<button type="button" class="chip" aria-pressed="'+(d.miss.indexOf(o[0])>-1)+'" data-a="fb-miss" data-v="'+o[0]+'">'+esc(o[1])+'</button>';}).join("")+'</div><label>How would you feel if the Sales Lab disappeared?</label><div class="row">'+RVDIS.map(function(o){return '<button type="button" class="chip" aria-pressed="'+(d.dis===o[0])+'" data-a="fb-dis" data-v="'+o[0]+'">'+esc(o[1])+'</button>';}).join("")+'</div>';
 h+='<p class="row"><button type="button" class="btn" data-a="fb-save"'+(d.busy?' disabled':'')+'>'+(sv?"Update my feedback":"Save my feedback")+'</button>'+(sv?'<button type="button" class="btn ghost" data-a="fb-del">Delete my feedback</button>':'')+'</p>'+(d.msg?'<div class="note ok" role="status">'+esc(d.msg)+'</div>':'')+(sv?'<p class="mute">Saved on '+esc(dayLab(String(sv.submitted_at).slice(0,10)))+'.</p>':'')+'</div>';
 return h;
}
async function fbSave(){
 var c=rvCur(),d=fbDraft();if(!c||d.busy)return;
 d.busy=true;d.msg="";render();
 var r=await sb.rpc("save_sprint_feedback",{p_sprint_id:c.id,p_learned:d.learned,p_miss:d.miss,p_dis:d.dis});
 d.busy=false;
 if(r.error){d.msg="We could not save that just now. Nothing was lost on this page, please try again.";render();return;}
 await sprLoad();var d2=fbDraft();d2.msg="Thank you. Your feedback is saved.";render();
}
async function fbDelete(){
 var c=rvCur();if(!c)return;
 var r=await sb.rpc("delete_sprint_feedback",{p_sprint_id:c.id});
 if(r.error){fbDraft().msg="We could not delete that just now. Please try again.";render();return;}
 await sprLoad();UI.fbd=null;fbDraft().msg="Your feedback has been deleted.";render();
}
async function fbMigrate(){
 /* feedback written before it had its own table lives in saved work: move it across once, then clear it from saved work */
 var c=rvCur(),f=S&&S.rv&&S.rv.fb;
 if(!c||!f||!(f.learned||(f.miss&&f.miss.length)||(f.dis&&f.dis.length)))return;
 if(SPR.feedback&&SPR.feedback[c.id])return;
 var r=await sb.rpc("save_sprint_feedback",{p_sprint_id:c.id,p_learned:f.learned||"",p_miss:(f.miss||[]).slice(0,8),p_dis:(f.dis&&f.dis[0])||""});
 if(!r.error){S.rv.fb={learned:"",miss:[],dis:[]};save();var g=await sb.rpc("get_sprint_feedback");if(!g.error&&Array.isArray(g.data)){SPR.feedback={};g.data.forEach(function(x){SPR.feedback[x.sprint_id]=x;});}}
}

/* ---------- Etsy Sales Bottleneck, slice E1: Week 1 (diagnose). Preview only: reachable at #/etsy/N, not linked, not startable by members. ---------- */
var ETSTEPS=[
 {n:1,t:"Learn what Etsy Stats can and cannot tell you",m:30,b:"Nothing. A short lesson and a quick check."},
 {n:2,t:"Do you have a live listing? Gather your starting numbers",m:50,b:"Your Etsy Stats page, for the last 30 days."},
 {n:3,t:"See what to look at first",m:25,b:"The numbers from step 2."},
 {n:4,t:"Keyword worksheet",m:50,b:"A few minutes of your own Etsy searching."},
 {n:5,t:"Save the original and choose your listing",m:30,b:"Your listing open in Etsy."},
 {n:6,t:"Week 1 review",m:15,b:"Whatever you have done so far."}
];
var ETNUM=[["shopVisits","Shop visits"],["shopOrders","Shop orders"],["shopConv","Shop conversion rate (as Etsy shows it, a percentage)"],["shopRev","Shop revenue"],["views","Listing views (this listing)"],["favs","Listing favourites (this listing)"],["lorders","Listing orders (this listing)"],["lrev","Listing revenue (this listing)"]];
var ETMONEY={shopRev:1,lrev:1};
var ETVS={"":1,value:1,zero:1,unknown:1};
var ETQUIZ=[["a","One shopper searches, opens your listing, then opens five of your other listings. How does Etsy count that?",[["a1","Six visits"],["a2","One visit and six listing views"],["a3","Six orders"]],"a2","Etsy counts it as one visit (one browsing session) and six listing views."],["b","Etsy shows conversion rate for your shop. Can you work out a conversion rate for one listing by dividing its orders by its views?",[["b1","Yes, that is Etsy's conversion rate"],["b2","No, views and visits are different things, and Etsy does not show a listing conversion rate"],["b3","Yes, but only for digital products"]],"b2","Etsy defines conversion rate as orders divided by shop visits. Listing views are not visits, so orders divided by views would be a different, misleading number."]];
var ETDEF=function(){var n={};ETNUM.forEach(function(x){n[x[0]]={s:"",v:""};});return {live:"",steps:{},quiz:{},base:{from:"",to:"",n:n},lst:{name:"",ref:"",chosen:""},locked:false,lockedAt:"",hist:[],orig:{title:"",tags:"",image:"",price:"",desc:""},kw:{terms:"",short:""},dec:"",note:"",steps2:{},ticks:{},chg:{type:"",grp:"",what:"",before:"",after:"",why:"",date:"",n:14,rconf:"",rcert:""},rh:[],cm:null,dec2:"",wl:[],cf:[],nid:1,st3:{},st4:{},fx:"",nx:"",dec3:"",dec4:"",prep:{live:"",stats:false,listing:""},res:{b:{views:{s:"",v:""},favs:{s:"",v:""},lorders:{s:"",v:""},rev:{s:"",v:""},sv:{s:"",v:""}},a:{views:{s:"",v:""},favs:{s:"",v:""},lorders:{s:"",v:""},rev:{s:"",v:""},sv:{s:"",v:""}},bAt:"",aAt:"",spb:"",spa:""}};};
var ETTXT={name:1,ref:1,title:1,tags:1,image:1,price:1,desc:1,terms:1,short:1,note:1};

/* ===== ETSY E1 LOGIC START: pure rules, checked by dev/etsy_e1_tests.js ===== */
function etDays(){var b=S.et.base,a=parseYmd(b.from),c=parseYmd(b.to);if(a==null||c==null||c<a)return 0;return Math.round((c-a)/86400000)+1;}
function etPrompt(b){
 b=b||S.et.base;var n=b.n,v=vstate(n.shopVisits),c=vstate(n.shopConv),days=etDays();
 if(b.from&&b.to&&days===0)return {k:"dates",t:"Check your dates",b:"The end date is before the start date. Etsy's date picker lets you choose both, and it is worth using the same dates here.",need:["the dates"]};
 if(v==="unk")return {k:"collect",t:"Collect your shop visits first",b:"We cannot say what to look at first without your shop visits. Open Stats in Shop Manager, choose the last 30 days and read the Visits figure. If you cannot see it, that is fine, and it is recorded as unknown. Please do not guess.",need:["shop visits"]};
 if(v==="zero")return {k:"low",t:"No visits recorded",b:"You confirmed zero shop visits in this period. That is a sign to look at discoverability first, but there is nothing here to compare yet. Keyword work in step 4 is the useful next step.",need:[]};
 var vis=+n.shopVisits.v;
 if(vis<100)return {k:"low",t:"Too few visits to read much into",b:"With about "+vis+" shop visits the numbers move around a lot, so treat anything here as a prompt, not a finding. Numbers like these often make sellers look at discoverability first (titles, tags and keywords), but a short period can be misleading.",need:[]};
 if(c==="unk")return {k:"need-conv",t:"One more number would help",b:"You have "+vis+" shop visits. Etsy shows a shop conversion rate (orders divided by visits) on the same page. Add it if you can see it. If you cannot, that is fine.",need:["shop conversion rate"]};
 var cr=+(c==="zero"?0:n.shopConv.v);
 if(cr<1)return {k:"conv",t:"A prompt to look at what visitors see",b:"With "+vis+" shop visits and a conversion rate of "+cr+" percent, sellers often look first at what shoppers see once they arrive (lead image, description, price). This is a prompt, not a diagnosis, and one period of numbers cannot show why.",need:[]};
 return {k:"none",t:"No strong prompt from these numbers",b:"With "+vis+" shop visits and a conversion rate of "+cr+" percent, these numbers do not point clearly one way. Use your own judgement about your listing, and the keyword worksheet, to choose what to look at.",need:[]};
}
function etListingNote(){
 var n=S.et.base.n,v=vstate(n.views),o=vstate(n.lorders);
 if(v==="unk"&&o==="unk")return "";
 return "This listing had "+(v==="unk"?"an unknown number of":n.views.v||"0")+" views and "+(o==="unk"?"an unknown number of":(o==="zero"?"0":n.lorders.v))+" orders. We show them as separate counts. Etsy does not give a conversion rate for a single listing, and views are not visits, so we do not divide one by the other.";
}
function etLiveMode(){return S.et.live==="no"?"prepare":(S.et.live==="yes"?"measure":"ask");}
function etUse(){
 var E=S.et;if(E.locked)return {ok:false,why:"locked"};
 var n=String(E.lst.name||"").trim();if(!n)return {ok:false,why:"empty"};
 if(n===E.lst.chosen)return {ok:true};
 var had=E.lst.chosen;E.lst.chosen=n;E.lst.name=n;if(E.hist.length<50)E.hist.push({d:today(),a:had?"changed":"selected",name:n});
 return {ok:true};
}
function etCommit(){var E=S.et;if(E.locked||!E.lst.chosen)return false;E.locked=true;E.lockedAt=today();E.lst.name=E.lst.chosen;if(E.hist.length<50)E.hist.push({d:today(),a:"locked",name:E.lst.chosen});return true;}
function etDone(){return ETSTEPS.filter(function(s){return S.et.steps[s.n];}).length;}
/* ===== ETSY E1 LOGIC END ===== */

function etShell(n,body){
 var s=ETSTEPS[n-1],dn=S.et.steps[n];
 var h='<a class="back" href="#/etsy/1">&larr; Etsy Sales Bottleneck, Week 1</a>'+etBn()+'<h1>Week 1 &middot; Step '+n+' of 6</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p><p class="mute">You will need: '+esc(s.b)+' Everything saves automatically.</p>'+body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="et-done" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<6?'<a class="btn ghost" href="#/etsy/'+(n+1)+'">Next step &rarr;</a>':'')+'</div>';
 return h;
}
function etNumRow(k){
 var o=S.et.base.n[k],lab=ETNUM.filter(function(x){return x[0]===k;})[0][1]+(ETMONEY[k]?" ("+sym(S.focus.currency).trim()+")":""),opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
 return '<div class="q"><strong>'+esc(lab)+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="et-vs" data-k="'+k+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="12" data-et="n:'+k+'" value="'+esc(o.v)+'" aria-label="'+esc(lab)+'" style="max-width:160px">':'')+'</div>';
}
function etHome(){
 var d=etDone(),h='<h1>Etsy Sales Bottleneck</h1>'+etBn()+'<p class="mute">Week 1 of 4: Diagnose. Use your own Etsy numbers to see what to look at first. Nothing here starts your sprint clock, and nothing is sent anywhere.</p>';
 h+='<div class="card"><strong>'+d+' of 6 steps done</strong><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/6*100)+'%"></i></div></div>';
 if(etLiveMode()==="prepare")h+='<div class="note info"><strong>You are in preparation mode.</strong> You said you do not have a live listing yet, so this week helps you get ready. Measuring starts once a listing is live.</div>';
 h+='<div class="card"><h2>The six steps</h2>'+ETSTEPS.map(function(s){var dn=S.et.steps[s.n];return '<a class="step'+(dn?' done':'')+'" href="#/etsy/'+s.n+'"><span class="n">'+(dn?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(dn?"Done":"Open")+'</span></a>';}).join("")+'</div>';
 return h;
}
function ets1(){
 var h=LC("et1s1.lesson")+LC("et1s1.stats");
 h+='<div class="card"><h2>Quick check</h2>';
 ETQUIZ.forEach(function(q){var sel=S.et.quiz[q[0]];h+='<div class="q"><strong>'+esc(q[1])+'</strong><div class="row" style="flex-direction:column;align-items:stretch">'+q[2].map(function(o){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(sel===o[0])+'" data-a="et-q" data-q="'+q[0]+'" data-v="'+o[0]+'">'+esc(o[1])+'</button>';}).join("")+'</div>'+(sel?'<div class="note '+(sel===q[3]?"ok":"info")+'" aria-live="polite">'+(sel===q[3]?"Good. ":"Have another look. ")+esc(q[4])+'</div>':'')+'</div>';});
 return etShell(1,h+'</div>');
}
function ets2(){
 var h=LC("et1s2.lesson"),E=S.et;
 h+='<div class="card"><h2>Do you have a live Etsy listing?</h2><div class="row"><button type="button" class="chip" aria-pressed="'+(E.live==="yes")+'" data-a="et-live" data-v="yes">Yes</button><button type="button" class="chip" aria-pressed="'+(E.live==="no")+'" data-a="et-live" data-v="no">Not yet</button></div>';
 if(E.live==="no")h+='<div class="note info">That is fine. This week turns into preparation: keywords, a listing plan and a publish checklist. We will not ask you for numbers that do not exist yet. You can keep preparing, or look at another experiment that suits you. <a href="#/experiments">See the experiments</a>. Nothing starts your sprint clock.</div>';
 h+='</div>';
 if(E.live==="yes"){
  h+='<div class="card"><h2>Your diagnostic baseline</h2><p class="mute">This is the <strong>previous 30 days before your sprint</strong>, if Etsy has them. It is used only to decide what to look at first. It is <strong>not</strong> the "before" in your later comparison. If your shop is newer, use the days you have.</p><div class="row"><div style="flex:1;min-width:150px"><label>From</label><input type="date" data-et="from" value="'+esc(E.base.from)+'" aria-label="Baseline start date"></div><div style="flex:1;min-width:150px"><label>To</label><input type="date" data-et="to" value="'+esc(E.base.to)+'" aria-label="Baseline end date"></div></div>'+(etDays()?'<p class="mute">'+etDays()+' days.</p>':'')+'<p class="mute">Shop numbers are on the Stats page. Listing numbers are on the listing list further down it. Etsy only shows active listings there. Choose the same dates in Etsy. Visits update a few times a day, so end your dates yesterday or earlier.</p>';
  ETNUM.forEach(function(x){h+=etNumRow(x[0]);});
  return etShell(2,h+'</div>');
 }
 return etShell(2,h);
}
function ets3(){
 var E=S.et,h=LC("et1s3.lesson");
 if(etLiveMode()==="prepare")return etShell(3,h+'<div class="note info">There are no numbers to read yet. When your listing is live, come back to step 2.</div>');
 var p=etPrompt(),cls={low:"info",conv:"info",none:"info",collect:"warn",dates:"warn","need-conv":"info"}[p.k]||"info";
 h+='<div class="card"><h2>What to look at first</h2><div class="note '+cls+'"><strong>'+esc(p.t)+'</strong><br>'+esc(p.b)+'</div>';
 var ln=etListingNote();if(ln)h+='<p>'+esc(ln)+'</p>';
 h+='<div class="note info"><strong>How to read this.</strong> The starting points (about 100 shop visits and about 1 percent conversion) are provisional prompts for you to interpret. They are not rules and they are not a diagnosis. They use shop visits and the shop conversion rate Etsy gives you, never a mix of views and visits.</div><label>Does this match what you expected? (optional)</label>'+chipsHtml("et.quiz.match",[["yes","Yes"],["bit","A bit different"],["not","Not really"]],1)+'</div>';
 return etShell(3,h);
}
function ets4(){
 var h=LC("et1s4.lesson")+'<div class="card"><h2>Your keyword worksheet</h2><p class="mute">Write the words a buyer would type to find your product, one per line. Aim for about 20. Then copy your best 8 below.</p><label for="etkw">Buyer search terms</label><textarea id="etkw" maxlength="2000" style="min-height:140px" data-et="terms" placeholder="One search phrase per line">'+esc(S.et.kw.terms)+'</textarea><label for="etks">My shortlist of 8</label><textarea id="etks" maxlength="800" style="min-height:90px" data-et="short">'+esc(S.et.kw.short)+'</textarea><p class="mute">'+(S.et.kw.terms.split("\n").filter(function(x){return x.trim();}).length)+' terms, '+(S.et.kw.short.split("\n").filter(function(x){return x.trim();}).length)+' on your shortlist. Etsy search advice comes from Etsy and from sellers, not from controlled studies, so treat it as a place to start.</p></div>';
 return etShell(4,h);
}
function ets5(){
 var E=S.et,h=LC("et1s5.lesson");
 h+='<div class="card"><h2>Your focus listing</h2><p class="mute">One listing per sprint. You can change your mind now. Once you commit to a change in Week 2, the listing is locked and its history is kept.</p>';
 if(E.locked)h+='<div class="note info"><strong>Locked on '+esc(dayLab(E.lockedAt))+'.</strong> Your focus listing is "'+esc(E.lst.chosen)+'". The original reference is kept with its history below.</div>';
 else h+=(E.lst.chosen?'<p>Chosen: <strong>'+esc(E.lst.chosen)+'</strong></p>':"")+'<label for="etn">Listing name</label><input id="etn" type="text" maxlength="120" data-et="name" value="'+esc(E.lst.name)+'" placeholder="For example: Monthly budget planner"><label for="etr">Listing link or number (optional)</label><input id="etr" type="text" maxlength="200" data-et="ref" value="'+esc(E.lst.ref)+'"><p><button type="button" class="btn ghost" data-a="et-use">'+(E.lst.chosen?"Use this listing instead":"Use this listing")+'</button></p>';
 if(E.hist.length)h+='<h3>History</h3>'+E.hist.map(function(x){return '<p style="margin:3px 0" class="mute">'+esc(dayLab(x.d))+': '+esc(x.a)+' "'+esc(x.name)+'"</p>';}).join("");
 h+='</div><div class="card"><h2>Save the original</h2><p class="mute">Copy what the listing says today, so any later change can be judged fairly.</p>';
 [["title","Title"],["tags","Tags"],["image","Lead image (a short description)"],["price","Price"],["desc","First lines of the description"]].forEach(function(x){h+='<label for="et_'+x[0]+'">'+x[1]+'</label><textarea id="et_'+x[0]+'" maxlength="600" style="min-height:'+(x[0]==="desc"?"90":"50")+'px" data-et="'+x[0]+'"'+(E.locked?' readonly':'')+'>'+esc(E.orig[x[0]])+'</textarea>';});
 return etShell(5,h+'</div>');
}
function ets6(){
 var E=S.et,h=LC("et1s6.lesson"),p=etPrompt();
 h+='<div class="card"><h2>Your Week 1 summary</h2><div class="crow"><span>Live listing</span><strong>'+(E.live==="yes"?"Yes":(E.live==="no"?"Not yet":"Not said"))+'</strong></div><div class="crow"><span>Starting numbers</span><strong>'+(etLiveMode()==="prepare"?"Preparing":(ETNUM.some(function(x){return !!E.base.n[x[0]].s;})?"Recorded":"Not recorded yet"))+'</strong></div><div class="crow"><span>Focus listing</span><strong>'+esc(E.lst.chosen||"Not chosen")+'</strong></div><div class="crow"><span>Keyword shortlist</span><strong>'+E.kw.short.split("\n").filter(function(x){return x.trim();}).length+' terms</strong></div>';
 if(etLiveMode()!=="prepare")h+='<div class="note info"><strong>What to look at first:</strong> '+esc(p.t)+'</div>';
 h+='<h3>Your decision</h3>';[["next","Ready for Week 2"],["list","I want to choose a different listing first"],["numbers","I need to find more numbers first"],["help","I would like help in the group session"]].forEach(function(x){h+='<p><button type="button" class="chip" aria-pressed="'+(E.dec===x[0])+'" data-a="et-dec" data-v="'+x[0]+'">'+x[1]+'</button></p>';});
 h+='</div><div class="note info"><strong>Week 2 is a preview.</strong> <a href="#/etsy/w2">Open the Week 2 preview</a>. Weeks 3 and 4 are previews too.</div>';
 return etShell(6,h);
}
function etAction(a,d,t){
 var E=S.et;
 if(a==="et-done"){E.steps[d.n]=!E.steps[d.n];save();}
 else if(a==="et-q"){E.quiz[d.q]=d.v;save();}
 else if(a==="et-live"){E.live=E.live===d.v?"":d.v;save();}
 else if(a==="et-vs"){if(!E.base.n[d.k]||!ETVS[d.v])return;E.base.n[d.k].s=E.base.n[d.k].s===d.v?"":d.v;if(E.base.n[d.k].s!=="value")E.base.n[d.k].v="";save();}
 else if(a==="et-dec"){E.dec=E.dec===d.v?"":d.v;save();}
 else if(a==="et-use"){var u=etUse();if(!u.ok)return;save();}
 else if(a==="et-commit"){if(!etCommit())return;save();}
 else return;
 render();
}
function etInput(t){
 var k=t.dataset.et,E=S.et;
 if(k.indexOf("c:")===0){et2Input(t);return;}
 if(k.indexOf("l:")===0||k.indexOf("f:")===0||k.indexOf("r:")===0){et3Input(t);return;}
 if(k.indexOf("p:")===0){et4Input(t);return;}
 if(k.indexOf("n:")===0){var f=k.slice(2),o=E.base.n[f];if(o&&o.s==="value"){var c=w4Clean(f,t.value);o.v=c;if(c!==t.value)t.value=c;save();}return;}
 if(k==="name"||k==="ref"){if(!E.locked){E.lst[k]=t.value.slice(0,k==="name"?120:200);save();}return;}
 if((k==="from"||k==="to")){var v=String(t.value||"");if(v===""||parseYmd(v)!=null){E.base[k]=v;save();}return;}
 if(k==="terms"||k==="short"){E.kw[k]=t.value.slice(0,k==="terms"?2000:800);save();return;}
 if(!E.locked&&(k==="title"||k==="tags"||k==="image"||k==="price"||k==="desc")){E.orig[k]=t.value.slice(0,600);save();}
}
function etfix(o){
 var b=ETDEF(),w=(o.et&&typeof o.et==="object"&&!Array.isArray(o.et))?o.et:{},r=b,ok=function(x){return typeof x==="string";};
 if(w.live==="yes"||w.live==="no")r.live=w.live;
 if(w.steps&&typeof w.steps==="object"&&!Array.isArray(w.steps))Object.keys(w.steps).forEach(function(k){if(/^[1-6]$/.test(k)&&w.steps[k]===true)r.steps[k]=true;});
 if(w.quiz&&typeof w.quiz==="object"&&!Array.isArray(w.quiz))["a","b","match"].forEach(function(k){if(ok(w.quiz[k])&&w.quiz[k].length<=3)r.quiz[k]=w.quiz[k];});
 if(w.base&&typeof w.base==="object"){["from","to"].forEach(function(k){if(ok(w.base[k])&&(w.base[k]===""||parseYmd(w.base[k])!=null))r.base[k]=w.base[k];});
  ETNUM.forEach(function(x){var y=w.base.n&&w.base.n[x[0]];if(y&&typeof y==="object"&&ok(y.s)&&ETVS[y.s]&&ok(y.v))r.base.n[x[0]]={s:y.s,v:w4Clean(x[0],y.v)};});}
 if(w.lst&&typeof w.lst==="object"){if(ok(w.lst.name))r.lst.name=w.lst.name.slice(0,120);if(ok(w.lst.ref))r.lst.ref=w.lst.ref.slice(0,200);if(ok(w.lst.chosen))r.lst.chosen=w.lst.chosen.slice(0,120);}
 if(w.locked===true&&r.lst.chosen&&ok(w.lockedAt)&&parseYmd(w.lockedAt)!=null){r.locked=true;r.lockedAt=w.lockedAt;}
 if(Array.isArray(w.hist))w.hist.slice(0,50).forEach(function(x){if(x&&typeof x==="object"&&ok(x.d)&&parseYmd(x.d)!=null&&(x.a==="selected"||x.a==="changed"||x.a==="locked")&&ok(x.name))r.hist.push({d:x.d,a:x.a,name:x.name.slice(0,120)});});
 if(w.orig&&typeof w.orig==="object")["title","tags","image","price","desc"].forEach(function(k){if(ok(w.orig[k]))r.orig[k]=w.orig[k].slice(0,600);});
 if(w.kw&&typeof w.kw==="object"){if(ok(w.kw.terms))r.kw.terms=w.kw.terms.slice(0,2000);if(ok(w.kw.short))r.kw.short=w.kw.short.slice(0,800);}
 if(["next","list","numbers","help"].indexOf(w.dec)>-1)r.dec=w.dec;
 et2fix(w,r);
 et3fix(w,r);
 et4fix(w,r);
 o.et=r;return o;
}

/* ---------- Etsy Sales Bottleneck, slice E2: Week 2 (change one thing). Preview only: reachable at #/etsy/w2 and #/etsy/w2/1..6, not startable by members. ---------- */
var ET2STEPS=[
 {n:1,t:"Choose the one thing to change",m:35,b:"Your Week 1 numbers and keyword worksheet."},
 {n:2,t:"Plan your change, before and after",m:40,b:"Your listing open in Etsy."},
 {n:3,t:"Pre-change check",m:20,b:"Nothing. Six quick ticks."},
 {n:4,t:"Choose your windows and change date",m:20,b:"Etsy's date selector, to match the dates."},
 {n:5,t:"Make the change, then commit",m:30,b:"Your listing open in Etsy."},
 {n:6,t:"Week 2 review",m:15,b:"Whatever you have done so far."}
];
var ETCHG=[
 {k:"title",l:"Title",g:"vis",d:"The words buyers search for, in the order they read them."},
 {k:"tags",l:"Tags",g:"vis",d:"The tag slots on your listing."},
 {k:"image",l:"Lead image",g:"conv",d:"The first photo shoppers see in search and on the listing."},
 {k:"desc",l:"First lines of the description",g:"conv",d:"What shoppers read first once they arrive."},
 {k:"other",l:"Something else, one thing only",g:"",d:"You choose whether it is about being found or about what shoppers see."}
];
var ETGRP={vis:{l:"Being found",m:"Listing views",n:"Listing views are the count that shows whether more people are opening this listing."},conv:{l:"What shoppers see",m:"Listing orders and favourites, as separate counts",n:"Orders and favourites are read as separate counts. They are never divided by views."}};
var ETTICKS=[
 ["one","I am changing one thing on this listing, and only one."],
 ["price","I will not change the price, start a sale or promotion, or change my ad settings while the windows run."],
 ["saved","I have saved how the listing looks today."],
 ["numbers","I have recorded my Week 1 numbers, or said which ones I cannot see."],
 ["date","I will note the exact date the change goes live."],
 ["proof","I understand that one listing, before and after, is a small and noisy comparison. It is not proof."]
];
var ETBACK=3;
var ET2TXT={what:1,before:1,after:1,why:1};
var ET2DEC=["next","wait","help"];
var ETCERT=[["sure","I'm sure of the date."],["approx","I'm fairly sure. It could be a day or two different."],["unsure","I'm not sure when I made the change."]];
function etCertOk(v){return v==="sure"||v==="approx"||v==="unsure";}
function etRh(a,c){var E=S.et;if(E.rh.length<30)E.rh.push({at:today(),d:E.chg.date,a:a,c:c||""});}

/* ===== ETSY E2 LOGIC START: pure rules, checked by dev/etsy_e2_tests.js ===== */
function etDaysBetween(a,b){var x=parseYmd(a),y=parseYmd(b);if(x==null||y==null)return 0;return Math.round((y-x)/86400000);}
function etWin(date,n){var t=parseYmd(date);n=+n;if(t==null||n!==Math.floor(n)||n<7||n>14)return null;return {n:n,bFrom:addDays(date,-n),bTo:addDays(date,-1),aFrom:date,aTo:addDays(date,n-1),readOn:addDays(date,n)};}
function etWinCheck(date,n){
 var r={ok:false,w:null,why:"",t:"",b:"",prov:false,overlap:false,maxN:0,sprint:false,retro:false,gap:0},w;
 if(!date){r.why="nodate";r.t="Choose the change date";r.b="Enter the date the change went live in Etsy.";return r;}
 if(parseYmd(date)==null){r.why="baddate";r.t="That date is not valid";r.b="Use the date picker.";return r;}
 w=etWin(date,n);
 if(!w){r.why="badn";r.t="Choose a window length";r.b="Between 7 and 14 days.";return r;}
 var tod=today();
 if(date>tod){r.why="future";r.t="The change date cannot be in the future";r.b="Make the change in Etsy first. Then come back and record the date it went live.";return r;}
 if(date<addDays(tod,-ETBACK)){r.retro=true;r.gap=etDaysBetween(date,tod);}
 if(rvCur()){
  r.sprint=true;
  if(date<rvStart()){r.why="beforestart";r.t="That date is before your sprint began";r.b="Your sprint began on "+dayLab(rvStart())+". The change date cannot be earlier.";return r;}
  var e=rvEnd();
  if(w.aTo>e){var mx=etDaysBetween(date,e)+1;r.maxN=mx>14?14:mx;r.why="toolate";r.t="That window runs past the end of your sprint";r.b="Your "+w.n+" day after-window would end on "+dayLab(w.aTo)+", which is after your update window closes on "+dayLab(e)+"."+(mx>=7?" A window of "+mx+" days or fewer fits.":" There are fewer than 7 days left, so this change cannot be read within this sprint. You can plan it for your next sprint.");return r;}
  if(w.aTo>rvDay30())r.prov=true;
 }
 var bs=S.et.base;
 if(bs.from&&bs.to&&parseYmd(bs.from)!=null&&parseYmd(bs.to)!=null&&bs.to>=w.bFrom&&bs.from<=w.bTo)r.overlap=true;
 r.ok=true;r.w=w;return r;
}
function etChgGrp(){var c=S.et.chg,x=ETCHG.filter(function(o){return o.k===c.type;})[0];if(!x)return "";return x.g||(c.grp==="vis"||c.grp==="conv"?c.grp:"");}
function etSuggest(){
 if(etLiveMode()==="prepare")return {grp:"",t:"You are preparing, so there is nothing to suggest yet",b:"Your numbers will help you choose once your listing is live. You can read ahead in the meantime."};
 var p=etPrompt();
 if(p.k==="low")return {grp:"vis",t:"A place to start: being found",b:"Numbers like yours often make sellers look first at how easily the listing is found, which is the title and tags. This is a prompt, not a diagnosis. The choice is yours."};
 if(p.k==="conv")return {grp:"conv",t:"A place to start: what shoppers see",b:"Numbers like yours often make sellers look first at what shoppers see once they arrive, such as the lead image and the first lines of the description. This is a prompt, not a diagnosis. The choice is yours."};
 return {grp:"",t:"Your numbers do not point clearly one way",b:"Use your own judgement about the listing, and your keyword worksheet, to choose. Any one of these is a reasonable place to start."};
}
function etReady(){
 var E=S.et,c=E.chg,m=[];
 if(E.cm)return {ok:false,done:true,miss:[],wc:null};
 if(E.live!=="yes")m.push("A live listing (Week 1, step 2). Without one there is nothing to measure yet.");
 if(!E.lst.chosen)m.push("Your focus listing (Week 1, step 5)");
 if(!c.type)m.push("The one thing you will change (Week 2, step 1)");
 else if(!etChgGrp())m.push("Whether the change is about being found or about what shoppers see (step 1)");
 if(!String(c.what).trim())m.push("A few words on exactly what you are changing (step 1)");
 if(!String(c.before).trim())m.push("How it looks now (step 2)");
 if(!String(c.after).trim())m.push("How it will look after (step 2)");
 if(ETTICKS.some(function(x){return E.ticks[x[0]]!==true;}))m.push("All six checks ticked (step 3)");
 var wc=etWinCheck(c.date,c.n);if(!wc.ok)m.push("A valid change date and window (step 4): "+wc.t);
 else if(wc.retro&&(c.rconf!==c.date||!etCertOk(c.rcert)))m.push("Confirm the actual change date, and say how sure you are of it, because you are recording it more than "+ETBACK+" days after it happened (step 4)");
 return {ok:m.length===0,done:false,miss:m,wc:wc};
}
function etCommitChange(){
 var E=S.et,r=etReady();if(!r.ok)return false;
 if(!E.locked&&!etCommit())return false;
 var c=E.chg;
 E.cm={at:today(),type:c.type,grp:etChgGrp(),what:String(c.what).trim().slice(0,160),before:c.before,after:c.after,why:c.why,date:c.date,n:r.wc.w.n,prov:r.wc.prov,retro:r.wc.retro===true,gap:r.wc.retro?r.wc.gap:0,conf:r.wc.retro?c.rconf:"",cert:r.wc.retro?c.rcert:"",rh:r.wc.retro?E.rh.slice(0,30).map(function(x){return {at:x.at,d:x.d,a:x.a,c:x.c};}):[]};
 return true;
}
function et2Done(){return ET2STEPS.filter(function(s){return S.et.steps2[s.n];}).length;}
/* ===== ETSY E2 LOGIC END ===== */

function et2Shell(n,body){
 var s=ET2STEPS[n-1],dn=S.et.steps2[n];
 var h='<a class="back" href="#/etsy/w2">&larr; Etsy Sales Bottleneck, Week 2</a>'+etBn()+'<h1>Week 2 &middot; Step '+n+' of 6</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p><p class="mute">You will need: '+esc(s.b)+' Everything saves automatically.</p>'+body;
 if(S.et.cm&&n<6)h+='<div class="note info"><strong>This change is committed.</strong> It was committed on '+esc(dayLab(S.et.cm.at))+' and is locked, so the comparison stays fair.</div>';
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="et2-done" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<6?'<a class="btn ghost" href="#/etsy/w2/'+(n+1)+'">Next step &rarr;</a>':'')+'</div>';
 return h;
}
function et2Card(){return '<div class="card"><h2>Week 2: Change one thing</h2><p class="mute">Preview only. Choose one change, plan it, check yourself, set your windows and commit. Nothing here starts your sprint clock.</p><a class="btn ghost" href="#/etsy/w2">Open the Week 2 preview</a></div>';}
function et2Home(){
 var d=et2Done(),E=S.et,h='<a class="back" href="#/etsy">&larr; Etsy Sales Bottleneck, Week 1</a><h1>Etsy Sales Bottleneck</h1>'+etBn()+'<p class="mute">Week 2 of 4: Change one thing. Choose one change that fits what you saw, make it, and commit with its date. Nothing here starts your sprint clock, and nothing is sent anywhere.</p>';
 h+='<div class="card"><strong>'+d+' of 6 steps done</strong><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/6*100)+'%"></i></div></div>';
 if(E.cm)h+=et2Log();
 else if(etLiveMode()==="prepare")h+='<div class="note info"><strong>You are in preparation mode.</strong> You said you do not have a live listing yet. You can plan a change now, but it cannot be committed until a listing is live.</div>';
 h+='<div class="card"><h2>The six steps</h2>'+ET2STEPS.map(function(s){var dn=E.steps2[s.n];return '<a class="step'+(dn?' done':'')+'" href="#/etsy/w2/'+s.n+'"><span class="n">'+(dn?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(dn?"Done":"Open")+'</span></a>';}).join("")+'</div>';
 return h;
}
function et2Log(){
 var m=S.et.cm;if(!m)return "";
 var w=etWin(m.date,m.n),x=ETCHG.filter(function(o){return o.k===m.type;})[0];
 var h='<div class="card"><h2>Change log</h2><p class="mute">Committed on '+esc(dayLab(m.at))+'. This record is locked.</p>'+(m.retro?'<div class="note warn"><strong>Recorded retrospectively.</strong> This change was recorded '+m.gap+' days after the date the member gave. The member confirmed that date ('+esc((ETCERT.filter(function(x){return x[0]===m.cert;})[0]||["",""])[1].toLowerCase())+'). Recording after the event reduces confidence in the comparison, so any result will be read with extra care.</div>':'');
 h+='<div class="crow"><span>What</span><strong>'+esc(m.what)+'</strong></div><div class="crow"><span>Kind of change</span><strong>'+esc(x?x.l:"")+' ('+esc((ETGRP[m.grp]||{}).l||"")+')</strong></div><div class="crow"><span>Listing</span><strong>'+esc(S.et.lst.chosen)+'</strong></div><div class="crow"><span>Recorded on</span><strong>'+esc(dayLab(m.at))+'</strong></div><div class="crow"><span>Change went live (as the member says)</span><strong>'+esc(dayLab(m.date))+(m.retro?' <span class="tag">recorded retrospectively</span>':'')+'</strong></div>';
 if(w)h+='<div class="crow"><span>Before-window</span><strong>'+esc(dayLab(w.bFrom))+' to '+esc(dayLab(w.bTo))+' ('+w.n+' days)</strong></div><div class="crow"><span>After-window</span><strong>'+esc(dayLab(w.aFrom))+' to '+esc(dayLab(w.aTo))+' ('+w.n+' days)</strong></div><div class="crow"><span>Read the numbers from</span><strong>'+esc(dayLab(w.readOn))+'</strong></div>';
 h+='<h3>Before</h3><p style="white-space:pre-wrap">'+esc(m.before)+'</p><h3>After</h3><p style="white-space:pre-wrap">'+esc(m.after)+'</p>'+(m.why?'<h3>Why</h3><p>'+esc(m.why)+'</p>':'');
 if(m.retro&&m.rh&&m.rh.length)h+='<h3>Confirmation history</h3>'+m.rh.map(function(x){return '<p class="mute" style="margin:3px 0">'+esc(dayLab(x.at))+': '+esc(x.a)+(x.c?' ('+esc(x.c)+')':'')+' for '+esc(dayLab(x.d))+'</p>';}).join("");
 if(m.prov)h+='<div class="note info">Your after-window runs past Day 30. Your Day 30 review will be marked provisional, and the rest is recorded as late outcomes in your 14 day update window.</div>';
 return h+'</div>';
}
function et2s1(){
 var E=S.et,c=E.chg,lk=!!E.cm,h=LC("et2s1.lesson"),sg=etSuggest();
 h+='<div class="card"><h2>What your Week 1 numbers suggest</h2><div class="note info"><strong>'+esc(sg.t)+'</strong><br>'+esc(sg.b)+'</div></div>';
 h+='<div class="card"><h2>Your one change</h2>';
 ETCHG.forEach(function(o){h+='<p><button type="button" class="chip" style="text-align:left;border-radius:10px"'+(lk?' disabled':'')+' aria-pressed="'+(c.type===o.k)+'" data-a="et2-chg" data-v="'+o.k+'"><strong>'+esc(o.l)+'</strong><br><span class="mute">'+esc(o.d)+'</span></button></p>';});
 if(c.type==="other")h+='<label>This change is about</label><div class="row">'+["vis","conv"].map(function(g){return '<button type="button" class="chip"'+(lk?' disabled':'')+' aria-pressed="'+(c.grp===g)+'" data-a="et2-grp" data-v="'+g+'">'+ETGRP[g].l+'</button>';}).join("")+'</div>';
 var g=etChgGrp();
 if(g)h+='<div class="note info"><strong>What we will look at: '+esc(ETGRP[g].m)+'.</strong> '+esc(ETGRP[g].n)+'</div>';
 h+='<label for="etwh">In a few words, exactly what will you change?</label><input id="etwh" type="text" maxlength="160" data-et="c:what" value="'+esc(c.what)+'"'+(lk?' readonly':'')+' placeholder="For example: the first five words of the title">';
 return et2Shell(1,h+'</div>');
}
function et2s2(){
 var E=S.et,c=E.chg,lk=!!E.cm,h=LC("et2s2.lesson"),x=ETCHG.filter(function(o){return o.k===c.type;})[0];
 if(!c.type)return et2Shell(2,h+'<div class="note warn">Choose your one change in step 1 first. <a href="#/etsy/w2/1">Go to step 1</a></div>');
 var sv=(c.type!=="other"&&E.orig[c.type])?E.orig[c.type]:"";
 h+='<div class="card"><h2>Plan: '+esc(x.l)+'</h2><label for="etbf">How it looks now</label><textarea id="etbf" maxlength="600" style="min-height:90px" data-et="c:before"'+(lk?' readonly':'')+'>'+esc(c.before)+'</textarea>';
 if(!lk&&sv&&c.before!==sv)h+='<p><button type="button" class="btn ghost" data-a="et2-copy">Copy from the original I saved in Week 1</button></p>';
 if(!lk&&!sv&&c.type!=="other")h+='<p class="mute">You have not saved this part of the original yet. You can type it here, or save it in Week 1, step 5.</p>';
 h+='<label for="etaf">How it will look after</label><textarea id="etaf" maxlength="600" style="min-height:90px" data-et="c:after"'+(lk?' readonly':'')+'>'+esc(c.after)+'</textarea><label for="etwy">One sentence on why you think it will help (optional)</label><textarea id="etwy" maxlength="600" style="min-height:60px" data-et="c:why"'+(lk?' readonly':'')+'>'+esc(c.why)+'</textarea><p class="mute">Write this before you make the change. It keeps you honest later, because the story cannot be adjusted to fit the result.</p></div>';
 return et2Shell(2,h);
}
function et2s3(){
 var E=S.et,lk=!!E.cm,h=LC("et2s3.lesson");
 h+='<div class="card"><h2>Six checks</h2><p class="mute">These are promises that protect your comparison. Tick each one when it is true.</p>';
 ETTICKS.forEach(function(t){h+='<p><button type="button" class="chip" style="text-align:left;border-radius:10px"'+(lk?' disabled':'')+' aria-pressed="'+(E.ticks[t[0]]===true)+'" data-a="et2-tick" data-k="'+t[0]+'">'+esc(t[1])+'</button></p>';});
 var n=ETTICKS.filter(function(t){return E.ticks[t[0]]===true;}).length;
 h+='<p><strong>'+n+' of 6 ticked.</strong></p></div>';
 return et2Shell(3,h);
}
function et2s4(){
 var E=S.et,c=E.chg,lk=!!E.cm,h=LC("et2s4.lesson"),wc=etWinCheck(c.date,c.n);
 h+='<div class="card"><h2>Your windows</h2><label for="etdt">The date the change went live in Etsy</label><div class="row"><input id="etdt" type="date" data-et="c:date" value="'+esc(c.date)+'" max="'+esc(today())+'"'+(lk?' readonly':'')+' style="max-width:200px">'+(lk?'':'<button type="button" class="chip" data-a="et2-today">Today</button>')+'</div>';
 h+='<label>How many days in each window? (7 to 14)</label><div class="row">'+[7,8,9,10,11,12,13,14].map(function(v){return '<button type="button" class="chip sm"'+(lk?' disabled':'')+' aria-pressed="'+(+c.n===v)+'" data-a="et2-n" data-v="'+v+'">'+v+'</button>';}).join("")+'</div>';
 var w=wc.w||etWin(c.date,c.n);
 if(w){
  h+='<div class="crow"><span>Before-window</span><strong>'+esc(dayLab(w.bFrom))+' to '+esc(dayLab(w.bTo))+'</strong></div><div class="crow"><span>After-window</span><strong>'+esc(dayLab(w.aFrom))+' to '+esc(dayLab(w.aTo))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(w.readOn))+'</strong></div><p class="mute">Both windows are '+w.n+' days. In Etsy, choose these exact dates in the date selector, and look at the numbers from the date above, not earlier, so the last day has settled.</p>';
 }
 if(!wc.ok)h+='<div class="note '+(wc.why==="nodate"||wc.why==="badn"?"info":"warn")+'"><strong>'+esc(wc.t)+'.</strong> '+esc(wc.b)+'</div>';
 else{
  if(wc.retro){var cf=c.rconf===c.date;h+='<div class="note warn"><strong>You are recording this change '+wc.gap+' days after it happened.</strong> That is allowed, and it will be labelled "recorded retrospectively". It reduces confidence in the comparison, because some of what happened next may already be known. We recommend recording a change within '+ETBACK+' days. Please check the date, and confirm it is the day the change really went live.</div><p><button type="button" class="chip" style="text-align:left;border-radius:10px"'+(lk?' disabled':'')+' aria-pressed="'+cf+'" data-a="et2-rconf">I confirm the change went live on '+esc(dayLab(c.date))+'.</button></p><label>How sure are you of that date?</label>'+ETCERT.map(function(x){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px"'+(lk?' disabled':'')+' aria-pressed="'+(c.rcert===x[0])+'" data-a="et2-rcert" data-v="'+x[0]+'">'+x[1]+'</button></p>';}).join("")+(c.rcert==="unsure"?'<div class="note info">That is fine. We will still record it. Your result will be read as unclear, because without a reliable date the two measurement periods cannot be established.</div>':(c.rcert==="approx"?'<div class="note info">We will record that you are fairly sure. Your result is read from the figures, with lower confidence.</div>':''));}
  if(wc.prov)h+='<div class="note info"><strong>Your after-window runs past Day 30.</strong> That is allowed. Your Day 30 review will be marked provisional, and the remaining days are recorded as late outcomes in your 14 day update window. Your sprint is not extended.</div>';
  if(wc.overlap)h+='<div class="note info">Your before-window overlaps the 30 days you used for your Week 1 starting numbers. That is fine, but do not count the same days twice when you say what changed.</div>';
  if(!wc.sprint)h+='<p class="mute">Your sprint has not started, so these dates are not checked against it.</p>';
 }
 return et2Shell(4,h+'</div>');
}
function et2s5(){
 var E=S.et,h=LC("et2s5.lesson"),r=etReady();
 if(E.cm)return et2Shell(5,h+et2Log());
 h+='<div class="card"><h2>Ready to commit?</h2>';
 if(r.ok)h+='<div class="note ok"><strong>Everything is in place.</strong> Make the change in Etsy first if you have not already, so the date you recorded is true.</div>';
 else h+='<div class="note warn"><strong>Not quite yet. Still needed:</strong><ul>'+r.miss.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 if(UI.etc&&r.ok)h+='<div class="note info" aria-live="polite"><strong>Commit this change and lock it?</strong>'+(r.wc&&r.wc.retro?' It will be labelled as recorded retrospectively.':'')+' Your listing, your plan and your dates will be locked and dated. You will not be able to edit them. A second change to this listing while the windows run would make the result harder to read.</div><div class="row"><button type="button" class="btn" data-a="et2-commit">Yes, commit and lock</button><button type="button" class="btn ghost" data-a="et2-cancel">Not yet</button></div>';
 else h+='<p><button type="button" class="btn"'+(r.ok?'':' disabled')+' data-a="et2-confirm">Commit this change</button></p>';
 return et2Shell(5,h+'</div>');
}
function et2s6(){
 var E=S.et,h=LC("et2s6.lesson");
 h+='<div class="card"><h2>Your Week 2 summary</h2><div class="crow"><span>Your one change</span><strong>'+esc(E.chg.what||"Not chosen")+'</strong></div><div class="crow"><span>Checks ticked</span><strong>'+ETTICKS.filter(function(t){return E.ticks[t[0]]===true;}).length+' of 6</strong></div><div class="crow"><span>Committed</span><strong>'+(E.cm?"Yes, on "+esc(dayLab(E.cm.at)):"Not yet")+'</strong></div>';
 h+='<h3>Your decision</h3>';[["next","Ready to watch and log in Week 3"],["wait","I have not made the change yet"],["help","I would like help in the group session"]].forEach(function(x){h+='<p><button type="button" class="chip" aria-pressed="'+(E.dec2===x[0])+'" data-a="et2-dec" data-v="'+x[0]+'">'+x[1]+'</button></p>';});
 h+='</div>';
 if(E.cm)h+=et2Log();
 h+='<div class="note info"><strong>Weeks 3 and 4 are previews.</strong> <a href="#/etsy/w3">Week 3</a> and <a href="#/etsy/w4">Week 4</a>. Nothing here is open to members yet.</div>';
 return et2Shell(6,h);
}
function et2Action(a,d){
 var E=S.et,c=E.chg,lk=!!E.cm;
 if(a==="et2-done"){if(!/^[1-6]$/.test(String(d.n)))return;E.steps2[d.n]=!E.steps2[d.n];save();}
 else if(a==="et2-dec"){if(ET2DEC.indexOf(d.v)<0)return;E.dec2=E.dec2===d.v?"":d.v;save();}
 else if(lk){return;}
 else if(a==="et2-chg"){if(!ETCHG.some(function(o){return o.k===d.v;}))return;c.type=c.type===d.v?"":d.v;if(c.type!=="other")c.grp="";save();}
 else if(a==="et2-grp"){if(c.type!=="other"||(d.v!=="vis"&&d.v!=="conv"))return;c.grp=c.grp===d.v?"":d.v;save();}
 else if(a==="et2-tick"){if(!ETTICKS.some(function(t){return t[0]===d.k;}))return;if(E.ticks[d.k])delete E.ticks[d.k];else E.ticks[d.k]=true;save();}
 else if(a==="et2-n"){var v=+d.v;if(v!==Math.floor(v)||v<7||v>14)return;c.n=v;save();}
 else if(a==="et2-today"){c.date=today();save();}
 else if(a==="et2-rconf"){var wk=etWinCheck(c.date,c.n);if(!wk.ok||!wk.retro)return;if(c.rconf===c.date){c.rconf="";etRh("withdrawn",c.rcert);}else{c.rconf=c.date;etRh("confirmed",c.rcert);}save();}
 else if(a==="et2-rcert"){var wr=etWinCheck(c.date,c.n);if(!wr.ok||!wr.retro||!etCertOk(d.v)||c.rcert===d.v)return;c.rcert=d.v;etRh("certainty",d.v);save();}
 else if(a==="et2-copy"){var sv=(c.type!=="other")?E.orig[c.type]:"";if(!sv)return;c.before=String(sv).slice(0,600);save();}
 else if(a==="et2-confirm"){if(!etReady().ok)return;UI.etc=true;}
 else if(a==="et2-cancel"){UI.etc=false;}
 else if(a==="et2-commit"){if(!UI.etc)return;UI.etc=false;if(!etCommitChange())return;save();}
 else return;
 render();
}
function et2Input(t){
 var E=S.et,f=String(t.dataset.et).slice(2);if(E.cm)return;
 if(f==="date"){var v=String(t.value||"");if(v===""||parseYmd(v)!=null){if(E.chg.rconf&&E.chg.rconf!==v){E.chg.rconf="";etRh("cancelled by a change of date",E.chg.rcert);}E.chg.date=v;save();render();}return;}
 if(ET2TXT[f]){E.chg[f]=t.value.slice(0,f==="what"?160:600);save();}
}
function etRhFix(a){
 var out=[];if(!Array.isArray(a))return out;
 a.slice(0,30).forEach(function(x){if(x&&typeof x==="object"&&typeof x.at==="string"&&parseYmd(x.at)!=null&&typeof x.d==="string"&&parseYmd(x.d)!=null&&["confirmed","withdrawn","certainty","cancelled by a change of date"].indexOf(x.a)>-1)out.push({at:x.at,d:x.d,a:x.a,c:etCertOk(x.c)?x.c:""});});
 return out;
}
function et2fix(w,r){
 r.rh=etRhFix(w.rh);
 var ok=function(x){return typeof x==="string";};
 if(w.steps2&&typeof w.steps2==="object"&&!Array.isArray(w.steps2))Object.keys(w.steps2).forEach(function(k){if(/^[1-6]$/.test(k)&&w.steps2[k]===true)r.steps2[k]=true;});
 if(w.ticks&&typeof w.ticks==="object"&&!Array.isArray(w.ticks))ETTICKS.forEach(function(t){if(w.ticks[t[0]]===true)r.ticks[t[0]]=true;});
 var c=w.chg;
 if(c&&typeof c==="object"&&!Array.isArray(c)){
  if(ok(c.type)&&ETCHG.some(function(o){return o.k===c.type;}))r.chg.type=c.type;
  if(r.chg.type==="other"&&(c.grp==="vis"||c.grp==="conv"))r.chg.grp=c.grp;
  ["what","before","after","why"].forEach(function(k){if(ok(c[k]))r.chg[k]=c[k].slice(0,k==="what"?160:600);});
  if(ok(c.date)&&(c.date===""||parseYmd(c.date)!=null))r.chg.date=c.date;
  if(typeof c.n==="number"&&c.n===Math.floor(c.n)&&c.n>=7&&c.n<=14)r.chg.n=c.n;
  if(ok(c.rconf)&&c.rconf!==""&&parseYmd(c.rconf)!=null)r.chg.rconf=c.rconf;
  if(etCertOk(c.rcert))r.chg.rcert=c.rcert;
 }
 var m=w.cm;
 if(m&&typeof m==="object"&&!Array.isArray(m)&&r.locked&&r.lst.chosen&&ok(m.at)&&parseYmd(m.at)!=null&&ok(m.date)&&parseYmd(m.date)!=null&&ok(m.type)&&ETCHG.some(function(o){return o.k===m.type;})&&typeof m.n==="number"&&m.n===Math.floor(m.n)&&m.n>=7&&m.n<=14){
  var g=(ETCHG.filter(function(o){return o.k===m.type;})[0].g)||(m.grp==="vis"||m.grp==="conv"?m.grp:"");
  if(g)r.cm={at:m.at,type:m.type,grp:g,what:ok(m.what)?m.what.slice(0,160):"",before:ok(m.before)?m.before.slice(0,600):"",after:ok(m.after)?m.after.slice(0,600):"",why:ok(m.why)?m.why.slice(0,600):"",date:m.date,n:m.n,prov:m.prov===true,retro:m.retro===true,gap:(m.retro===true&&typeof m.gap==="number"&&m.gap>0&&m.gap<=3650&&m.gap===Math.floor(m.gap))?m.gap:0,conf:(m.retro===true&&ok(m.conf)&&parseYmd(m.conf)!=null)?m.conf:"",cert:(m.retro===true&&etCertOk(m.cert))?m.cert:"",rh:etRhFix(m.retro===true?m.rh:[])};
  if(r.cm&&r.cm.retro&&(!r.cm.gap||r.cm.conf!==r.cm.date||!etCertOk(r.cm.cert)))r.cm=null;
 }
 if(ET2DEC.indexOf(w.dec2)>-1)r.dec2=w.dec2;
}

/* ---------- Etsy Sales Bottleneck, slice E3: Weeks 3 and 4 (hold and watch, read the result). Preview only: #/etsy/w3[/1-6] and #/etsy/w4[/1-6]. Not startable by members. ---------- */
var ET3STEPS=[
 {n:1,t:"Hold steady and resist extra changes",m:15,b:"Nothing. A short read."},
 {n:2,t:"Weekly log",m:20,b:"Your Etsy Stats for this listing."},
 {n:3,t:"Confounders: what else could explain the numbers?",m:20,b:"Anything you remember changing or happening."},
 {n:4,t:"Correct only if something is clearly broken",m:15,b:"Your listing open in Etsy."},
 {n:5,t:"Where your windows stand",m:10,b:"Nothing."},
 {n:6,t:"Week 3 review",m:15,b:"Whatever you have done so far."}
];
var ET4STEPS=[
 {n:1,t:"Learn how to read a small result",m:25,b:"Nothing. A short lesson."},
 {n:2,t:"Is your after-window finished?",m:10,b:"Your window dates."},
 {n:3,t:"Record your before and after numbers",m:35,b:"Etsy Stats for the two windows."},
 {n:4,t:"Your evidence verdict",m:20,b:"The numbers from step 3."},
 {n:5,t:"Decide what is next",m:20,b:"Your verdict."},
 {n:6,t:"Week 4 review",m:15,b:"Whatever you have done so far."}
];
var ETCONF=[
 ["price","I changed the price",1],["sale","I ran a sale or promotion",1],["ads","I changed an ad setting, or Etsy ran Offsite Ads differently",1],
 ["unpub","The listing was unpublished, expired or relisted",1],["second","I made a second change to this listing",1],
 ["season","A major seasonal or holiday period",1],["shop","A shop-wide change (shop name, policies, banner, shipping)",1],
 ["ext","A post, mention or press that sent unusual traffic",1],["other","Something else",0]
];
var ETNEXT=[["keep","Keep the change"],["revert","Go back to the original"],["refine","Refine the same change"],["second","Try a second change in a new sprint"],["unsure","I am not sure yet"]];
var ETMINWIN=20;
var ETCONFWIN=50;
var ETSMALLORD=5;
var ETSPIKE=[["","No, my views were fairly steady"],["spike","A one-off spike (a post, a feature, a mention) brought a lot of the views"],["uneven","Very uneven, and I cannot say why"]];
var ETRATIO=3;
var ETRES=["views","favs","lorders","rev","sv"];
ETMONEY.rev=1;
var ETRESL={views:"Listing views",favs:"Listing favourites",lorders:"Listing orders",rev:"Listing revenue (optional)",sv:"Shop visits (shop level, context only, optional)"};
var ETKEY=["views","lorders"];

/* ===== ETSY E3 LOGIC START: pure rules, checked by dev/etsy_e3_tests.js ===== */
function etVs(o){return vstate(o);}
function etCmWin(){var m=S.et.cm;return m?etWin(m.date,m.n):null;}
function etNextId(){var E=S.et,n=+E.nid||1;E.nid=n+1;return n;}
function etConfKind(k){return ETCONF.filter(function(x){return x[0]===k;})[0]||null;}
function etConfMajor(c){var x=etConfKind(c.k);if(!x)return false;return c.k==="other"?c.maj===true:true;}
function etWdAt(c,asOf){return !!c.wd&&(!asOf||c.wd<=asOf);}
function etConfs(asOf){
 var E=S.et,w=etCmWin(),r={major:[],minor:[],outside:[]};
 E.cf.forEach(function(c){
  if(etWdAt(c,asOf))return;
  if(asOf&&c.at>asOf)return;
  if(!w||c.d<w.bFrom||c.d>w.aTo){r.outside.push(c);return;}
  (etConfMajor(c)?r.major:r.minor).push(c);
 });
 return r;
}
function etPhase(asOf){
 var E=S.et,w=etCmWin(),t=asOf||today();
 if(!E.cm||!w)return {k:"none"};
 if(t<=w.aTo)return {k:"during",day:Math.max(1,etDaysBetween(w.aFrom,t)+1),of:w.n,left:etDaysBetween(t,w.aTo),w:w};
 return {k:"ready",w:w};
}
function etNums(asOf){
 var E=S.et,out={b:{},a:{},spb:"",spa:""};
 ["b","a"].forEach(function(sc){
  var at=E.res[sc+"At"],known=!(asOf&&(!at||at>asOf));
  ETRES.forEach(function(k){var o=E.res[sc][k];out[sc][k]=known?{s:o.s,v:o.v}:{s:"",v:""};});
  out["sp"+sc]=known?(E.res["sp"+sc]==="spike"||E.res["sp"+sc]==="uneven"?E.res["sp"+sc]:""):"";
 });
 return out;
}
function etN(o){var s=vstate(o);return s==="pos"?+o.v:(s==="zero"?0:null);}
function etFmt(o,money){var s=vstate(o),c=money?sym(S.focus.currency):"";return s==="pos"?c+String(+o.v):(s==="zero"?c+"0 (confirmed)":"not seen");}
function fin0(v){v.conf="none";return v;}
function etVerdict(asOf){
 var E=S.et,cm=E.cm,small="Before and after on one listing is a small, noisy comparison. It shows what happened, not what will always happen.";
 if(!cm)return fin0(vmk("Insufficient evidence","info","E1",["No change has been committed yet, so there is nothing to compare."],["This says nothing about your listing, because nothing has been tested."],["Finish Week 2 and commit one change."]));
 var w=etWin(cm.date,cm.n),ph=etPhase(asOf);
 if(ph.k==="during")return fin0(vmk("Insufficient evidence","info","E2",["Your "+cm.n+" day after-window runs until "+dayLab(w.aTo)+(ph.left>0?", so there are "+ph.left+" more day"+(ph.left===1?"":"s")+" to go.":".")],["A result read before the window has finished would be a guess."],["Wait until "+dayLab(w.readOn)+", then record your numbers. Resist extra changes meanwhile."]));
 var nm=etNums(asOf),miss=[];
 ETKEY.forEach(function(k){["b","a"].forEach(function(sc){if(etN(nm[sc][k])===null)miss.push(ETRESL[k].toLowerCase()+" for the "+(sc==="b"?"before":"after")+"-window");});});
 if(miss.length)return fin0(vmk("Mixed or unclear","warn","E3",["These numbers are not recorded yet: "+miss.join(", ")+"."],["Without them the two windows cannot be compared. A number you could not see is kept as unknown. It is never read as zero."],["Open Etsy Stats for the exact window dates and fill in what you can see. If a number cannot be seen, that is fine, and the result stays unclear."]));
 var bv=etN(nm.b.views),av=etN(nm.a.views),bo=etN(nm.b.lorders),ao=etN(nm.a.lorders),bf=etN(nm.b.favs),af=etN(nm.a.favs);
 var nums="Listing views: "+bv+" before, "+av+" after. Listing orders: "+bo+" before, "+ao+" after."+((bf!==null&&af!==null)?" Favourites: "+bf+" before, "+af+" after.":"");
 var fin=function(v,c){v.conf=c;return v;};
 if(bv<ETMINWIN||av<ETMINWIN){
  var sh=[];if(bv<ETMINWIN)sh.push("your before-window had "+bv+" listing view"+(bv===1?"":"s"));if(av<ETMINWIN)sh.push("your after-window had "+av);
  return fin(vmk("Insufficient evidence","info","E4",[nums,"Too few views to read: "+sh.join(" and ")+"."],["At least "+ETMINWIN+" listing views are needed in each window before a change can be read. With fewer, a few views either way change the picture completely.","The two windows are checked separately. A large count in one window cannot make up for a very small count in the other.","These figures ("+ETMINWIN+" in each window to read anything, about "+ETCONFWIN+" in each for a confident reading) are provisional starting points that will be reviewed against real results."],["Collect for longer, or work on being found first (title, tags, keywords), then repeat with a longer window."]),"none");
 }
 var cf=etConfs(asOf),retro=cm.retro===true,unsure=retro&&cm.cert==="unsure",cav=etCaveats(bv,av,bo,ao,cm,nm.spb,nm.spa);
 var visX=cm.grp==="vis",movedX=visX?(av>bv):(ao>bo||(ao===bo&&bf!==null&&af!==null&&af>bf)),uneven=nm.spb==="uneven"||nm.spa==="uneven",spikeBoth=nm.spb==="spike"&&nm.spa==="spike",spikeFlatters=nm.spa==="spike"&&movedX&&ao>=bo,sp=(uneven||spikeBoth||spikeFlatters);
 if(cf.major.length||unsure||sp){
  var why=[nums];
  if(cf.major.length)why.push("You logged "+cf.major.length+" major thing"+(cf.major.length===1?"":"s")+" inside your windows that could also explain the numbers: "+cf.major.map(function(c){return (etConfKind(c.k)||["","?"])[1].toLowerCase();}).join("; ")+".");
  if(unsure)why.push("The change was recorded "+cm.gap+" days after the date given, and you said you are not sure when you made it, so the two measurement periods cannot be established reliably.");
  if(uneven)why.push("You said views in the "+(nm.spb==="uneven"&&nm.spa==="uneven"?"before-window and the after-window were":(nm.spb==="uneven"?"before-window were":"after-window were"))+" very unevenly spread and you cannot say why, so the two windows may not be comparable.");
  if(spikeBoth)why.push("You said a one-off spike in traffic fell in both windows, so neither total shows a steady level.");
  else if(spikeFlatters)why.push("You said a one-off spike in traffic fell in the after-window. That could account for the rise by itself, so the gain cannot be put down to your change.");
  return fin(vmk("Mixed or unclear","warn","E5",why,["Because "+(cf.major.length?"something else changed or happened":(unsure?"the measurement periods cannot be established reliably":(uneven?"the views were very unevenly spread":"a one-off spike could explain the movement")))+", the numbers cannot be put down to your change alone. Even if they moved the right way, this would not be called promising.",small].concat(cav.lines),["Write down what happened and when. If a spike had a known cause (a post, a feature, a mention), log it in Week 3, step 3. If you want a cleaner answer, repeat once things are steady and record the change on the day you make it."]),"unclear");
 }
 var vis=cm.grp==="vis",viewsUp=av>bv,ordersNoFall=ao>=bo,favsUp=(bf!==null&&af!==null&&af>bf);
 var moved=vis?viewsUp:(ao>bo||(ao===bo&&favsUp));
 if(moved&&ordersNoFall)return fin(vmk("Promising","ok","E6",[nums,vis?"The count you were aiming at, listing views, went up, and orders did not fall.":"The counts you were aiming at, orders and favourites, moved the right way, and orders did not fall."],[small,"What you can see is an improvement in the numbers. That is not the same as proof that your change caused it. Nothing else was logged, but timing, trends and luck can still move numbers.","This is encouraging. It is not proof."].concat(cav.lines),["Keep the change for now and see whether it holds in the next sprint. If you can, try a second, different change and compare again."]),cav.conf);
 if(viewsUp&&ao<=bo)return fin(vmk("Traffic but no sales","warn","E7",[nums,"More people opened your listing, but orders did not rise."],["This shows people arrived. It does not show why they did not buy.",small].concat(cav.lines),["Look at what shoppers see once they arrive: the lead image, the first lines of the description, and how the price is shown. Change one of those next."]),cav.conf);
 if(!moved&&cav.conf==="limited")return fin(vmk("Insufficient evidence","info","E8",[nums,vis?"Listing views were about the same, or lower ("+bv+" before, "+av+" after). With this few views, that is within what chance alone could produce.":"Neither orders nor favourites went up ("+bo+" and "+ao+" orders). With this few views, that is within what chance alone could produce."],["This does not mean your change made no difference. There were too few views to tell, so the evidence is limited.",small].concat(cav.lines),["Collect for longer and repeat with a longer window. Keep your notes, and only choose a different change once you have more views to read."]),"limited");
 if(!moved)return fin(vmk("Approach needs reviewing","warn","E8",[nums,vis?"Listing views did not go up over a full equal window.":"Neither orders nor favourites went up over a full equal window."],["This does not mean the idea is wrong. One change on one listing, over a short window, is only one try.",small].concat(cav.lines),["Try a different variable next, such as "+(vis?"the lead image":"the title or tags")+". Change one thing again, and record it on the day."]),cav.conf);
 return fin(vmk("Insufficient evidence","info","E9",[nums],["The numbers do not point clearly one way.",small].concat(cav.lines),["Keep your notes and try again with a longer window."]),cav.conf);
}
function etCaveats(bv,av,bo,ao,cm,spb,spa){
 var mn=Math.min(bv,av),mx=Math.max(bv,av),lines=[],conf="fair";
 if(mn<ETCONFWIN){conf="limited";lines.push("Your smaller window had "+mn+" listing views. Below about "+ETCONFWIN+" in a window, a few views either way can change the picture, so this is too limited to support a confident conclusion. Treat it as a hint.");
  if(mn>0&&mx>=ETRATIO*mn)lines.push("One window had more than "+ETRATIO+" times the views of the other. Because the windows are equal in length that is part of the result, but a small starting count can make a big change look bigger than it is.");}
 if(bo<ETSMALLORD&&ao<ETSMALLORD){if(conf==="fair")conf="lower";lines.push("Orders are very small counts ("+bo+" before, "+ao+" after). A difference of one or two orders is well within chance.");}
 if(cm&&cm.retro===true&&cm.cert!=="unsure"){if(conf==="fair")conf="lower";lines.push("This change was recorded retrospectively, "+cm.gap+" days after the date given"+(cm.cert==="approx"?", and the member is fairly sure of it but it could be a day or two different":"")+". You had already seen some of what followed, so confidence is lower.");}
 if(spb==="spike"||spa==="spike"){if(conf==="fair")conf="lower";lines.push("You flagged a one-off spike in traffic in the "+(spb==="spike"&&spa==="spike"?"before-window and the after-window":(spb==="spike"?"before-window":"after-window"))+". An unusual burst of traffic with a known cause is not a fault in your approach. It can distort a window total, so the result is read with extra care."+(spb==="spike"&&spa!=="spike"?" A spike before your change would, if anything, make your gain look smaller, so it does not stop a reading.":""));}
 return {conf:conf,lines:lines};
}
function etSnap(kind){
 var cm=S.et.cm,asOf=null,late=false,prov=false,eff="";
 if(kind==="day30"&&rvCur()){
  if(rvPhase()==="during")prov=true;else asOf=rvDay30();
 }
 if(asOf){var w=cm?etWin(cm.date,cm.n):null;if(w&&w.aTo>asOf)prov=true;
  var E=S.et;if(E.res.aAt&&E.res.aAt>asOf)late=true;}
 var v=etVerdict(asOf||null);
 return {at:today(),label:v.label,rule:v.rule,kind:kind==="day30"?"day30":"update",asOf:asOf||"",late:late,prov:prov||v.rule==="E2"};
}
function et3Entry(d){var E=S.et,cm=E.cm;if(!cm)return {ok:false,why:"nocm"};if(!d||parseYmd(d)==null)return {ok:false,why:"baddate"};if(d>today())return {ok:false,why:"future"};if(d<cm.date)return {ok:false,why:"beforechange"};return {ok:true};}
function et3ConfDate(d){var E=S.et,w=etCmWin();if(!w)return {ok:false,why:"nocm"};if(!d||parseYmd(d)==null)return {ok:false,why:"baddate"};if(d>today())return {ok:false,why:"future"};if(d<w.bFrom)return {ok:false,why:"early"};return {ok:true};}
function et3AddLog(){
 var E=S.et,u=UI.etl||{},e=et3Entry(u.d||today());if(!e.ok)return false;
 var any=ETRES.some(function(k){return u[k]&&vstate(u[k])!=="unk";}),note=String(u.note||"").trim();
 if(!any&&!note)return false;if(E.wl.length>=60)return false;
 var en={id:etNextId(),d:u.d||today(),at:today(),note:note.slice(0,300),wd:""};
 ETRES.forEach(function(k){var o=u[k]||{s:"",v:""};en[k]={s:o.s,v:o.s==="value"?w4Clean(k,o.v):""};});
 E.wl.push(en);UI.etl=null;return true;
}
function et3AddConf(){
 var E=S.et,u=UI.etf||{},e=et3ConfDate(u.d||today());if(!e.ok)return false;
 if(!etConfKind(u.k))return false;if(E.cf.length>=60)return false;
 if(u.k==="other"&&u.maj!==true&&u.maj!==false)return false;
 E.cf.push({id:etNextId(),d:u.d||today(),at:today(),k:u.k,maj:u.k==="other"?u.maj===true:true,note:String(u.note||"").trim().slice(0,300),wd:""});
 UI.etf=null;return true;
}
function etRecNums(){var E=S.et;return ["b","a"].some(function(sc){return ETRES.some(function(k){return !!E.res[sc][k].s;});});}
function et3Done(){return ET3STEPS.filter(function(s){return S.et.st3[s.n];}).length;}
function et4Done(){return ET4STEPS.filter(function(s){return S.et.st4[s.n];}).length;}
/* ===== ETSY E3 LOGIC END ===== */

function et3Shell(wk,n,body){
 var E=S.et,st=wk===3?ET3STEPS:ET4STEPS,s=st[n-1],dn=(wk===3?E.st3:E.st4)[n],base="#/etsy/w"+wk;
 var h='<a class="back" href="'+base+'">&larr; Etsy Sales Bottleneck, Week '+wk+'</a>'+etBn()+'<h1>Week '+wk+' &middot; Step '+n+' of 6</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p><p class="mute">You will need: '+esc(s.b)+' Everything saves automatically.</p>'+body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="et3-done" data-w="'+wk+'" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<6?'<a class="btn ghost" href="'+base+'/'+(n+1)+'">Next step &rarr;</a>':'')+'</div>';
 return h;
}
function et3NoCm(){return '<div class="note warn"><strong>No change is committed yet.</strong> Week 2 finishes with committing one change. <a href="#/etsy/w2/5">Go to Week 2, step 5</a></div>';}
function et3Card(){return '<div class="card"><h2>Weeks 3 and 4: Hold, then read</h2><p class="mute">Preview only. A weekly log, confounders, your before-and-after numbers and your evidence verdict. Nothing here starts your sprint clock.</p><div class="row"><a class="btn ghost" href="#/etsy/w3">Week 3 preview</a><a class="btn ghost" href="#/etsy/w4">Week 4 preview</a></div></div>';}
function et3Window(){
 var ph=etPhase(),w=ph.w;
 if(ph.k==="none")return et3NoCm();
 var h='<div class="card"><h2>Where your windows stand</h2><div class="crow"><span>Your change</span><strong>'+esc(S.et.cm.what)+'</strong></div><div class="crow"><span>Before-window</span><strong>'+esc(dayLab(w.bFrom))+' to '+esc(dayLab(w.bTo))+'</strong></div><div class="crow"><span>After-window</span><strong>'+esc(dayLab(w.aFrom))+' to '+esc(dayLab(w.aTo))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(w.readOn))+'</strong></div>';
 h+=ph.k==="during"?'<div class="note info"><strong>Day '+ph.day+' of '+ph.of+' of your after-window.</strong> '+(ph.left>0?ph.left+' more day'+(ph.left===1?'':'s')+' to go.':'Today is the last day.')+' Please do not read your numbers as a result yet.</div>':'<div class="note ok"><strong>Your after-window is finished.</strong> You can record your numbers in Week 4, step 3.</div>';
 if(rvCur()&&w.aTo>rvDay30())h+='<div class="note info">Your after-window runs past Day 30, so your Day 30 position will be provisional, and the rest is recorded as a post-sprint update until '+esc(dayLab(rvEnd()))+'.</div>';
 return h+'</div>';
}
function et3Num(sc,k,lab){
 lab=lab+(ETMONEY[k]?" ("+sym(S.focus.currency).trim()+")":"");
 var E=S.et,o=sc==="l"?((UI.etl&&UI.etl[k])||{s:"",v:""}):E.res[sc][k];
 var opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
 return '<div class="q"><strong>'+esc(lab)+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="et3-vs" data-sc="'+sc+'" data-k="'+k+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-et="'+(sc==="l"?"l:":"r:"+sc+".")+k+'" value="'+esc(o.v)+'" aria-label="'+esc(lab)+'" style="max-width:160px">':'')+'</div>';
}
function et3Home(wk){
 var E=S.et,st=wk===3?ET3STEPS:ET4STEPS,d=wk===3?et3Done():et4Done(),dn=wk===3?E.st3:E.st4,base="#/etsy/w"+wk;
 var h='<a class="back" href="#/etsy/w2">&larr; Etsy Sales Bottleneck, Week 2</a><h1>Etsy Sales Bottleneck</h1>'+etBn()+'<p class="mute">'+(wk===3?'Week 3 of 4: Hold and watch. Leave the change alone, keep a simple log, and note anything else that could explain the numbers.':'Week 4 of 4: Read the result. Record your before and after numbers, see your evidence verdict and decide what is next.')+' Nothing here starts your sprint clock.</p>';
 h+='<div class="card"><strong>'+d+' of 6 steps done</strong><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/6*100)+'%"></i></div></div>';
 if(!E.cm)h+=et3NoCm();
 h+='<div class="card"><h2>The six steps</h2>'+st.map(function(s){var x=dn[s.n];return '<a class="step'+(x?' done':'')+'" href="'+base+'/'+s.n+'"><span class="n">'+(x?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(x?"Done":"Open")+'</span></a>';}).join("")+'</div>';
 return h;
}
function et3h1(){return et3Home(3);}
function et4h(){return et3Home(4);}
function et3s1(){
 var E=S.et,h=LC("et3s1.lesson");
 if(E.cm)h+='<div class="card"><h2>Your committed change</h2><div class="crow"><span>What</span><strong>'+esc(E.cm.what)+'</strong></div><div class="crow"><span>Went live</span><strong>'+esc(dayLab(E.cm.date))+'</strong></div></div>';else h+=et3NoCm();
 return et3Shell(3,1,h+et3Window());
}
function et3LogHtml(){
 var E=S.et,h="";
 if(!E.wl.length)return '<p class="mute">Nothing logged yet.</p>';
 E.wl.slice().sort(function(a,b){return a.d<b.d?-1:(a.d>b.d?1:a.id-b.id);}).forEach(function(en){
  var wd=!!en.wd;
  h+='<div class="crow" style="display:block'+(wd?';opacity:.6':'')+'"><p><strong>'+esc(dayLab(en.d))+'</strong>'+(en.d>(rvCur()?rvDay30():"9999")?' <span class="tag">post-sprint update</span>':'')+(wd?' <span class="tag">withdrawn '+esc(dayLab(en.wd))+'</span>':'')+'</p><p>'+ETRES.filter(function(k){return en[k]&&en[k].s;}).map(function(k){return esc(ETRESL[k].replace(" (shop level, context only, optional)","").replace(" (optional)",""))+': '+esc(etFmt(en[k],k==="rev"));}).join(' &middot; ')+'</p>'+(en.note?'<p style="white-space:pre-wrap">'+esc(en.note)+'</p>':'')+(wd?'':'<p><button type="button" class="chip sm" data-a="et3-lwd" data-id="'+en.id+'">Withdraw this entry</button></p>')+'</div>';
 });
 return h;
}
function et3s2(){
 var E=S.et,h=LC("et3s2.lesson");
 if(!E.cm)return et3Shell(3,2,h+et3NoCm());
 var u=UI.etl||{};
 h+='<div class="card"><h2>Add a log entry</h2><p class="mute">These are your own notes on how the listing is going. They are not used to work out your verdict. Your verdict uses the two windows in Week 4.</p><label for="etld">Date of the numbers (not before '+esc(dayLab(E.cm.date))+')</label><input id="etld" type="date" data-et="l:d" value="'+esc(u.d||today())+'" max="'+esc(today())+'" min="'+esc(E.cm.date)+'" style="max-width:200px">';
 ["views","favs","lorders","rev"].forEach(function(k){h+=et3Num("l",k,ETRESL[k]);});
 h+='<label for="etln">A note (optional)</label><textarea id="etln" maxlength="300" data-et="l:note" style="min-height:60px">'+esc(u.note||"")+'</textarea><p><button type="button" class="btn ghost" data-a="et3-ladd">Add to my log</button></p></div><div class="card"><h2>Your log</h2>'+et3LogHtml()+'</div>';
 return et3Shell(3,2,h);
}
function et3ConfHtml(){
 var E=S.et,h="";
 if(!E.cf.length)return '<p class="mute">Nothing logged. That is a fine answer if nothing changed.</p>';
 E.cf.slice().sort(function(a,b){return a.d<b.d?-1:(a.d>b.d?1:a.id-b.id);}).forEach(function(c){
  var w=etCmWin(),inw=w&&c.d>=w.bFrom&&c.d<=w.aTo,mj=etConfMajor(c),wd=!!c.wd,k=etConfKind(c.k);
  h+='<div class="crow" style="display:block'+(wd?';opacity:.6':'')+'"><p><strong>'+esc(dayLab(c.d))+'</strong>: '+esc(k?k[1]:"")+' <span class="tag">'+(mj?"major":"minor")+'</span>'+(inw?'':' <span class="tag">outside your windows, not counted</span>')+(wd?' <span class="tag">withdrawn '+esc(dayLab(c.wd))+'</span>':'')+'</p>'+(c.note?'<p style="white-space:pre-wrap">'+esc(c.note)+'</p>':'')+(wd?'':'<p><button type="button" class="chip sm" data-a="et3-fwd" data-id="'+c.id+'">Withdraw this entry</button></p>')+'</div>';
 });
 return h;
}
function et3s3(){
 var E=S.et,h=LC("et3s3.lesson");
 if(!E.cm)return et3Shell(3,3,h+et3NoCm());
 var u=UI.etf||{},w=etCmWin();
 h+='<div class="card"><h2>Log something that could also explain your numbers</h2><label for="etfd">Date it happened (from '+esc(dayLab(w.bFrom))+' to today)</label><input id="etfd" type="date" data-et="f:d" value="'+esc(u.d||today())+'" max="'+esc(today())+'" min="'+esc(w.bFrom)+'" style="max-width:200px"><label>What happened?</label>';
 ETCONF.forEach(function(x){h+='<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(u.k===x[0])+'" data-a="et3-fk" data-v="'+x[0]+'">'+esc(x[1])+'</button></p>';});
 if(u.k==="other")h+='<label>Could this change your numbers a lot?</label><div class="row"><button type="button" class="chip" aria-pressed="'+(u.maj===true)+'" data-a="et3-fmaj" data-v="yes">Yes, it could</button><button type="button" class="chip" aria-pressed="'+(u.maj===false)+'" data-a="et3-fmaj" data-v="no">Probably not</button></div>';
 h+='<label for="etfn">A note (optional)</label><textarea id="etfn" maxlength="300" data-et="f:note" style="min-height:60px">'+esc(u.note||"")+'</textarea><p><button type="button" class="btn ghost" data-a="et3-fadd">Add to my list</button></p></div>';
 var c=etConfs();
 h+='<div class="card"><h2>Your list</h2><p><strong>'+c.major.length+' major, '+c.minor.length+' minor</strong> inside your windows.</p>'+et3ConfHtml()+'</div>';
 return et3Shell(3,3,h);
}
function et3s4(){
 var E=S.et,h=LC("et3s4.lesson");
 h+='<div class="card"><h2>Your decision</h2>';
 [["leave","Nothing is broken. I will leave the listing as it is."],["fixed","Something was clearly broken and I corrected it. I have logged it as a second change."]].forEach(function(x){h+='<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(E.fx===x[0])+'" data-a="et3-fx" data-v="'+x[0]+'">'+x[1]+'</button></p>';});
 if(E.fx==="fixed"){var has=E.cf.some(function(c){return c.k==="second"&&!c.wd;});h+=has?'<div class="note ok">A second change is logged.</div>':'<div class="note warn"><strong>Please log it.</strong> Add "I made a second change to this listing" in <a href="#/etsy/w3/3">step 3</a>, with the date, so your result is read with the right care.</div>';}
 return et3Shell(3,4,h+'</div>');
}
function et3s5(){return et3Shell(3,5,LC("et3s5.lesson")+et3Window());}
function et3s6(){
 var E=S.et,h=LC("et3s6.lesson"),c=etConfs();
 h+='<div class="card"><h2>Your Week 3 summary</h2><div class="crow"><span>Log entries</span><strong>'+E.wl.filter(function(x){return !x.wd;}).length+'</strong></div><div class="crow"><span>Things that could explain the numbers</span><strong>'+c.major.length+' major, '+c.minor.length+' minor</strong></div><div class="crow"><span>Corrections</span><strong>'+(E.fx==="fixed"?"One, logged":(E.fx==="leave"?"None":"Not said"))+'</strong></div><h3>Your decision</h3>';
 [["next","Ready to read my result in Week 4"],["wait","My after-window is not finished yet"],["help","I would like help in the group session"]].forEach(function(x){h+='<p><button type="button" class="chip" aria-pressed="'+(E.dec3===x[0])+'" data-a="et3-dec" data-w="3" data-v="'+x[0]+'">'+x[1]+'</button></p>';});
 return et3Shell(3,6,h+'</div>');
}
function et4s1(){return et3Shell(4,1,LC("et4s1.lesson")+LC("et4s1.examples"));}
function et4s2(){return et3Shell(4,2,LC("et4s2.lesson")+et3Window());}
function et4s3(){
 var E=S.et,h=LC("et4s3.lesson"),w=etCmWin();
 if(!E.cm)return et3Shell(4,3,h+et3NoCm());
 var ph=etPhase();
 if(ph.k==="during")h+='<div class="note info"><strong>Your after-window is not finished.</strong> You can enter the before-window now, and the after-window from '+esc(dayLab(w.readOn))+'.</div>';
 h+=rvCur()?rvPostNote():'';
 [["b","Before-window",w.bFrom,w.bTo],["a","After-window",w.aFrom,w.aTo]].forEach(function(x){
  h+='<div class="card"><h2>'+x[1]+': '+esc(dayLab(x[2]))+' to '+esc(dayLab(x[3]))+'</h2><p class="mute">Choose exactly these dates in Etsy Stats. Listing numbers come from the listing list, and Etsy only shows active listings there.</p>';
  ETRES.forEach(function(k){h+=et3Num(x[0],k,ETRESL[k]);});
  h+='<label>Were the views in this window fairly steady?</label>'+ETSPIKE.map(function(o){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+((E.res["sp"+x[0]]||"")===o[0])+'" data-a="et3-sp" data-sc="'+x[0]+'" data-v="'+o[0]+'">'+o[1]+'</button></p>';}).join("");
  if(E.res["sp"+x[0]]==="spike")h+='<div class="note info">If you know the cause, please log it as "A post, mention or press that sent unusual traffic" in <a href="#/etsy/w3/3">Week 3, step 3</a>.</div>';
  var at=E.res[x[0]+"At"];if(at)h+='<p class="mute">Last saved '+esc(dayLab(at))+rvPostTag(at)+'.</p>';
  h+='</div>';
 });
 return et3Shell(4,3,h);
}
function et4s4(){
 var E=S.et,h=LC("et4s4.lesson");
 if(!E.cm)return et3Shell(4,4,h+et3NoCm());
 var v=etVerdict(),sn=etSnap("update");
 h+='<div class="card"><h2>Your evidence verdict</h2><div class="note '+v.cls+'"><strong>'+esc(v.label)+'</strong> <span class="tag">rule '+esc(v.rule)+'</span></div>';
 if(sn.late||(rvCur()&&rvPhase()==="window"&&E.res.aAt>rvDay30()))h+='<p><span class="tag">post-sprint update</span></p>';
  var cl={limited:"Limited. Too limited to support a confident conclusion.",lower:"Lower than usual. See the notes below.",fair:"Fair for a small before-and-after.",unclear:"Unclear.",none:""}[v.conf||"none"];
 if(cl)h+='<p><strong>How much confidence?</strong> <span class="tag">'+esc(cl)+'</span></p>';
 h+='<h3>What the numbers show</h3><ul>'+v.why.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>What they cannot show</h3><ul>'+v.limits.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>A reasonable next step</h3><ul>'+v.next.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 var c=etConfs();
 h+='<div class="card"><h2>What was considered</h2><div class="crow"><span>Major things logged inside your windows</span><strong>'+c.major.length+'</strong></div><div class="crow"><span>Minor things</span><strong>'+c.minor.length+'</strong></div><div class="crow"><span>Provisional settings used</span><strong>At least '+ETMINWIN+' listing views in each window to read a result, and about '+ETCONFWIN+' in each to remove the low-view caution</strong></div><p class="mute">These two figures are provisional testing assumptions. About '+ETCONFWIN+' is not proof of reliability and not a validated benchmark.</p><div class="crow"><span>Recorded</span><strong>'+(E.cm.retro?"retrospectively ("+esc((ETCERT.filter(function(x){return x[0]===E.cm.cert;})[0]||["",""])[1].toLowerCase())+")":"on the day or within 3 days")+'</strong></div></div>';
 if(rvCur()){var s30=etSnap("day30");h+='<div class="card"><h2>Your Day 30 position</h2><p><strong>'+esc(s30.label)+'</strong> '+(s30.prov?'<span class="tag">provisional</span>':'')+(s30.late?' <span class="tag">numbers saved after Day 30</span>':'')+'</p><p class="mute">This is what your numbers said on Day 30. Anything saved later is kept as a post-sprint update.</p></div>';}
 return et3Shell(4,4,h);
}
function et4s5(){
 var E=S.et,h=LC("et4s5.lesson"),v=etVerdict();
 h+='<div class="card"><h2>Your verdict was: '+esc(v.label)+'</h2><h3>What would you like to do?</h3>';
 ETNEXT.forEach(function(x){h+='<p><button type="button" class="chip" aria-pressed="'+(E.nx===x[0])+'" data-a="et3-nx" data-v="'+x[0]+'">'+x[1]+'</button></p>';});
 return et3Shell(4,5,h+'</div>');
}
function et4s6(){
 var E=S.et,h=LC("et4s6.lesson"),v=etVerdict(),nx=ETNEXT.filter(function(x){return x[0]===E.nx;})[0];
 h+='<div class="card"><h2>Your Week 4 summary</h2><div class="crow"><span>Your change</span><strong>'+esc(E.cm?E.cm.what:"None committed")+'</strong></div><div class="crow"><span>Evidence verdict</span><strong>'+esc(v.label)+'</strong></div><div class="crow"><span>Your decision</span><strong>'+esc(nx?nx[1]:"Not chosen")+'</strong></div><h3>Anything else?</h3>';
 [["done","I am done with this experiment for now"],["help","I would like help in the group session"]].forEach(function(x){h+='<p><button type="button" class="chip" aria-pressed="'+(E.dec4===x[0])+'" data-a="et3-dec" data-w="4" data-v="'+x[0]+'">'+x[1]+'</button></p>';});
 h+='</div><div class="note info"><strong>The Day 30 review and Results pages for Etsy are wired in during slice E4.</strong> This is the third slice of the experiment, shown for review.</div>';
 return et3Shell(4,6,h);
}
function et3Action(a,d){
 var E=S.et,u;
 if(a==="et3-done"){var st=+d.w===3?E.st3:(+d.w===4?E.st4:null);if(!st||!/^[1-6]$/.test(String(d.n)))return;st[d.n]=!st[d.n];save();}
 else if(a==="et3-dec"){if(+d.w===3&&["next","wait","help"].indexOf(d.v)>-1)E.dec3=E.dec3===d.v?"":d.v;else if(+d.w===4&&["done","help"].indexOf(d.v)>-1)E.dec4=E.dec4===d.v?"":d.v;else return;save();}
 else if(a==="et3-fx"){if(d.v!=="leave"&&d.v!=="fixed")return;E.fx=E.fx===d.v?"":d.v;save();}
 else if(a==="et3-nx"){if(!ETNEXT.some(function(x){return x[0]===d.v;}))return;E.nx=E.nx===d.v?"":d.v;save();}
 else if(a==="et3-vs"){
  if(!E.cm||!ETVS[d.v]||d.v==="")return;
  if(d.sc==="l"){if(ETRES.indexOf(d.k)<0)return;UI.etl=UI.etl||{};var o=UI.etl[d.k]||{s:"",v:""};o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";UI.etl[d.k]=o;}
  else if(d.sc==="b"||d.sc==="a"){if(ETRES.indexOf(d.k)<0)return;var q=E.res[d.sc][d.k];q.s=q.s===d.v?"":d.v;if(q.s!=="value")q.v="";E.res[d.sc+"At"]=today();save();}
  else return;
 }
 else if(a==="et3-ladd"){if(!et3AddLog())return;save();}
 else if(a==="et3-lwd"){var l=E.wl.filter(function(x){return x.id===+d.id;})[0];if(!l||l.wd)return;l.wd=today();save();}
 else if(a==="et3-sp"){if(!E.cm||(d.sc!=="b"&&d.sc!=="a")||(d.v!==""&&d.v!=="spike"&&d.v!=="uneven"))return;E.res["sp"+d.sc]=E.res["sp"+d.sc]===d.v?"":d.v;E.res[d.sc+"At"]=today();save();}
 else if(a==="et3-fk"){if(!etConfKind(d.v))return;UI.etf=UI.etf||{};UI.etf.k=UI.etf.k===d.v?"":d.v;if(UI.etf.k!=="other")delete UI.etf.maj;}
 else if(a==="et3-fmaj"){UI.etf=UI.etf||{};if(UI.etf.k!=="other"||(d.v!=="yes"&&d.v!=="no"))return;UI.etf.maj=d.v==="yes";}
 else if(a==="et3-fadd"){if(!E.cm||!et3AddConf())return;save();}
 else if(a==="et3-fwd"){var c=E.cf.filter(function(x){return x.id===+d.id;})[0];if(!c||c.wd)return;c.wd=today();save();}
 else return;
 render();
}
function et3Input(t){
 var E=S.et,k=String(t.dataset.et),p=k.slice(0,2),f=k.slice(2);
 if(p==="l:"){
  if(f==="d"){var v=String(t.value||"");UI.etl=UI.etl||{};if(v===""||parseYmd(v)!=null)UI.etl.d=v;return;}
  if(f==="note"){UI.etl=UI.etl||{};UI.etl.note=t.value.slice(0,300);return;}
  if(ETRES.indexOf(f)>-1){UI.etl=UI.etl||{};var o=UI.etl[f];if(o&&o.s==="value"){var c=w4Clean(f,t.value);o.v=c;if(c!==t.value)t.value=c;}}
  return;
 }
 if(p==="f:"){UI.etf=UI.etf||{};if(f==="d"){var v2=String(t.value||"");if(v2===""||parseYmd(v2)!=null)UI.etf.d=v2;}else if(f==="note")UI.etf.note=t.value.slice(0,300);return;}
 if(p==="r:"){
  if(!E.cm)return;var m=/^(b|a)\.(views|favs|lorders|rev|sv)$/.exec(f);if(!m)return;
  var q=E.res[m[1]][m[2]];if(q.s!=="value")return;var cl=w4Clean(m[2],t.value);q.v=cl;if(cl!==t.value)t.value=cl;E.res[m[1]+"At"]=today();save();
 }
}
function et3fix(w,r){
 var ok=function(x){return typeof x==="string";},isObj=function(x){return x&&typeof x==="object"&&!Array.isArray(x);};
 ["st3","st4"].forEach(function(k){if(isObj(w[k]))Object.keys(w[k]).forEach(function(n){if(/^[1-6]$/.test(n)&&w[k][n]===true)r[k][n]=true;});});
 var vsOk=function(y){return isObj(y)&&ok(y.s)&&ETVS[y.s]&&ok(y.v);};
 if(isObj(w.res)){
  ["b","a"].forEach(function(sc){if(isObj(w.res[sc]))ETRES.forEach(function(k){var y=w.res[sc][k];if(vsOk(y))r.res[sc][k]={s:y.s,v:y.s==="value"?w4Clean(k,y.v):""};});
   var at=w.res[sc+"At"];if(ok(at)&&parseYmd(at)!=null)r.res[sc+"At"]=at;r.res["sp"+sc]=(w.res["sp"+sc]==="spike"||w.res["sp"+sc]==="uneven")?w.res["sp"+sc]:(w.res["sp"+sc]===true?"uneven":"");});
 }
 var maxId=0;
 if(Array.isArray(w.wl))w.wl.slice(0,60).forEach(function(x){
  if(!isObj(x)||typeof x.id!=="number"||x.id!==Math.floor(x.id)||x.id<1||x.id>100000||!ok(x.d)||parseYmd(x.d)==null||!ok(x.at)||parseYmd(x.at)==null)return;
  var en={id:x.id,d:x.d,at:x.at,note:ok(x.note)?x.note.slice(0,300):"",wd:(ok(x.wd)&&parseYmd(x.wd)!=null)?x.wd:""};
  ETRES.forEach(function(k){var y=x[k];en[k]=vsOk(y)?{s:y.s,v:y.s==="value"?w4Clean(k,y.v):""}:{s:"",v:""};});
  if(x.id>maxId)maxId=x.id;r.wl.push(en);
 });
 if(Array.isArray(w.cf))w.cf.slice(0,60).forEach(function(x){
  if(!isObj(x)||typeof x.id!=="number"||x.id!==Math.floor(x.id)||x.id<1||x.id>100000||!ok(x.d)||parseYmd(x.d)==null||!ok(x.at)||parseYmd(x.at)==null||!ok(x.k)||!etConfKind(x.k))return;
  if(x.k==="other"&&typeof x.maj!=="boolean")return;
  if(x.id>maxId)maxId=x.id;
  r.cf.push({id:x.id,d:x.d,at:x.at,k:x.k,maj:x.k==="other"?x.maj===true:true,note:ok(x.note)?x.note.slice(0,300):"",wd:(ok(x.wd)&&parseYmd(x.wd)!=null)?x.wd:""});
 });
 var seen={};r.wl=r.wl.filter(function(x){if(seen["l"+x.id])return false;seen["l"+x.id]=1;return true;});r.cf=r.cf.filter(function(x){if(seen["c"+x.id]||seen["l"+x.id])return false;seen["c"+x.id]=1;return true;});
 r.nid=Math.max(maxId+1,(typeof w.nid==="number"&&w.nid===Math.floor(w.nid)&&w.nid>0&&w.nid<=100001)?w.nid:1);
 if(w.fx==="leave"||w.fx==="fixed")r.fx=w.fx;
 if(ETNEXT.some(function(x){return x[0]===w.nx;}))r.nx=w.nx;
 if(["next","wait","help"].indexOf(w.dec3)>-1)r.dec3=w.dec3;
 if(["done","help"].indexOf(w.dec4)>-1)r.dec4=w.dec4;
}
function etRouteInner(){
 var m=/^#\/etsy(?:\/(w[1-4]))?(?:\/([1-6]))?$/.exec(route)||[],n=+(m[2]||0),wk=m[1]||"";
 if(wk==="w1")return n?[0,ets1,ets2,ets3,ets4,ets5,ets6][n]():etHome();
 if(wk==="w2")return [et2Home,et2s1,et2s2,et2s3,et2s4,et2s5,et2s6][n]();
 if(wk==="w3")return [et3h1,et3s1,et3s2,et3s3,et3s4,et3s5,et3s6][n]();
 if(wk==="w4")return [et4h,et4s1,et4s2,et4s3,et4s4,et4s5,et4s6][n]();
 return n?[0,ets1,ets2,ets3,ets4,ets5,ets6][n]():etHome()+et2Card()+et3Card();
}

/* ---------- E4: Etsy Sales Bottleneck inside the shared sprint (the experiment adapter). ----------
   The shared pages (Home, My Sprint, Results, Day 30 review, Past sprints, the chooser) keep their own code.
   This module tells them what is specific to the Etsy experiment, and for Partnership-to-Sales it simply points
   back at the functions that were already there. Wrappers capture the earlier definition and fall through to it
   unless the sprint in progress is an Etsy one. */
var EXPKEY={partnership:"part",etsy:"etsy"};
function xaNameOf(e){return e==="etsy"?"Etsy Sales Bottleneck":(e==="email"?"Email-to-Sale":(e==="show"?"Show-to-Sell":(e==="find"?"Find Your Buyers":"Partnership-to-Sales")));}
function pastSummary(p){return p.exp==="etsy"?etPastSummary(p):(p.exp==="email"?emPastSummary(p):(p.exp==="show"?stsPastSummary(p):(p.exp==="find"?fybPastSummary(p):"")));}
EXPOPEN.etsy=true;
var ETWKT=["Diagnose","Change one thing","Hold and watch","Read the result"];
var ETTOTAL=24;
function rvExp(){var c=rvCur();return c&&c.experiment==="etsy"?"etsy":"partnership";}
function etActive(){var c=rvCur();return !!c&&c.experiment==="etsy";}
function etBn(){return etActive()?"":'<span class="tag" role="note">Preview only. Not open to members yet.</span>';}
function xaName(){return rvExp()==="etsy"?"Etsy Sales Bottleneck":"Partnership-to-Sales";}
function xaTotal(){return rvExp()==="etsy"?ETTOTAL:25;}
function xaW4(){return rvExp()==="etsy"?"#/etsy/w4/3":"#/w4/3";}
function xaW4Step(){return 3;}
function etWith(obj,fn){var keep=S.et;S.et=obj;try{return fn();}finally{S.et=keep;}}

/* ===== ETSY E4 LOGIC START: pure rules, checked by dev/etsy_e4_tests.js ===== */
function etPrepReady(){var p=S.et.prep;return p.live==="yes"&&p.stats===true;}
function etStepsOf(i){return [ETSTEPS,ET2STEPS,ET3STEPS,ET4STEPS][i];}
function etDOf(i){var E=S.et;return [E.steps,E.steps2,E.st3,E.st4][i]||{};}
function etWeekDone(i){
 var E=S.et,L=etStepsOf(i),D=etDOf(i);
 return L.every(function(s){return D[s.n];})||[E.dec==="next",E.dec2==="next",E.dec3==="next",E.dec4==="done"][i];
}
function etCurWeek(){for(var i=0;i<4;i++){if(!etWeekDone(i))return i+1;}return 4;}
function etWeekBase(w){return w===1?"#/etsy/":"#/etsy/w"+w+"/";}
function etStepCount(){var n=0;for(var i=0;i<4;i++)n+=rCount(etStepsOf(i),etDOf(i));return n;}
function etWeeks(){
 var cur=etCurWeek(),out=[];
 for(var i=0;i<4;i++){
  var L=etStepsOf(i),D=etDOf(i),n=rCount(L,D),tot=L.length,st=(i+1<cur)?"done":(i+1===cur?"now":"later"),first=0;
  if(st==="now"){for(var j=0;j<tot;j++){if(!D[L[j].n]){first=L[j].n;break;}}}
  out.push({n:i+1,title:ETWKT[i],L:L,D:D,done:n,total:tot,state:st,open:i===0||etWeekDone(i-1),first:first,
   status:st==="later"?"Opens when you finish Week "+i:(st==="done"&&n===tot?"Done":n+" of "+tot+" steps done")});
 }
 return out;
}
function etHasWork(){
 var E=S.et;
 if(E.cm||E.wl.length||E.cf.length)return true;
 return ["b","a"].some(function(sc){return ETRES.some(function(k){return !!E.res[sc][k].s;});});
}
function etFresh(prep){var e=ETDEF();if(prep)e.prep=prep;return e;}
function etStart(){
 var prep=S.et.prep;S.et=etFresh(prep);S.et.live=(prep&&prep.live==="yes")?"yes":"";
 var pl=String((prep&&prep.listing)||"").trim(),pn=String(S.focus.product||"").trim();if(pl)S.et.lst.name=pl.slice(0,120);else if(pn)S.et.lst.name=pn.slice(0,120);
}
function etPrepPrefilled(){var E=S.et,pl=String(E.prep.listing||"").trim();return !!pl&&!E.lst.chosen&&E.lst.name===pl.slice(0,120);}
function etProfilePrefilled(){var E=S.et,pn=String(S.focus.product||"").trim();return !!pn&&!E.lst.chosen&&E.lst.name===pn.slice(0,120);}
function etResetP(){
 var b=blank(),keep={testi:S.rv.testi,consent:S.rv.consent};
 S.steps={};S.decision="";S.cands=[];S.sketch={};S.nextId=1;S.base=b.base;S.refl="";S.types=b.types;S.cdraft=b.cdraft;S.cmsg="";S.fitIndex=0;S.newType="";
 S.w2=b.w2;S.out={};S.w3=b.w3;S.col=clone(W3DEF);S.w4=W4DEF();S.rv=RVDEF();S.rv.testi=keep.testi;S.rv.consent=keep.consent;S.week=1;
}
function etArchive(prev){
 var snap=S.rv.snap,auto=false;
 if(!snap){snap=etSnap("day30");auto=true;}
 var e={exp:"etsy",sid:prev.id,start:prev.start_day,archivedAt:today(),label:snap.label,rule:snap.rule,review:!!S.rv.done,auto:auto,snap:snap,upd:S.rv.upd.slice(0,20),etx:clone(S.et)};
 S.past=(S.past||[]);if(S.past.length>=10)S.past.shift();S.past.push(e);
}
function etPastFix(x){
 var okd=function(y){return (typeof y==="string"&&(y===""||parseYmd(y)!=null))?y:"";},st=function(y,n){return typeof y==="string"?y.slice(0,n):"";},nm=function(y){return (typeof y==="number"&&isFinite(y)&&y>=0&&y<100000)?Math.floor(y):0;};
 var rvt=rvfix({rv:{snap:x.snap,upd:x.upd,done:!!x.snap}}).rv;
 return {exp:"etsy",sid:nm(x.sid),auto:x.auto===true,start:okd(x.start),archivedAt:okd(x.archivedAt),label:st(x.label,40),rule:st(x.rule,4),review:x.review===true,snap:rvt.snap,upd:rvt.upd,etx:etfix({et:x.etx}).et};
}
/* Recommendations: evidence and assumption are always shown apart. Nothing defaults to another experiment. */
function etRec(v){
 var l=v.label,r=v.rule,t,b,f,x="",bs,as;
 if(l==="Promising"){t="Keep the change, then test a second one";b="Your numbers moved the right way. A second, different change on the same listing, in a new Etsy sprint, shows whether this was a pattern.";f="Choose a variable you have not changed yet (title, tags, lead image or the first lines of the description).";bs="The count you were aiming at moved the right way and orders did not fall.";as="We are assuming your change, not something else, caused it. Your numbers cannot prove that.";}
 else if(l==="Traffic but no sales"){t="Try a change to what shoppers see";b="More people opened your listing but orders did not rise, so the next place to look is what they see once they arrive.";f="Choose one of the lead image, the first lines of the description, or how the price is shown, and change only that.";bs="Listing views went up and listing orders did not.";as="We are assuming the page, not the price or the product itself, is the weak point. Your numbers cannot confirm that.";}
 else if(l==="Approach needs reviewing"){t="Try a different variable next";b="Your aimed-at count did not move over a full equal window. That is one try, not the end of the idea.";f="Change a different variable in a new Etsy sprint, and record it on the day you make it.";x="If traffic is the real constraint, Partnership-to-Sales is open now and can bring visitors. Find Your Buyers is open now too.";bs="Neither of the counts you were aiming at went up, with enough views to read.";as="We are assuming the variable you changed was the right one to test. A different one may behave differently.";}
 else if(l==="Mixed or unclear"){t="Repeat once, with steady conditions";b="Something else changed, or the date or numbers could not be established, so your change cannot be told apart from the rest.";f=r==="E3"?"Record the missing numbers from Etsy Stats for your two windows.":"Write down what else happened and when, then repeat with steady conditions and an on-the-day record.";bs=r==="E3"?"Some key numbers are not recorded.":"Something else could explain the movement, or the dates are uncertain.";as="We are assuming nothing else needed to be considered. If something else mattered, please log it.";}
 else{t=(r==="E4"||r==="E8")?"Collect for longer":"Wait for your window, then record your numbers";b=(r==="E4"||r==="E8")?"There were too few views to read a result. That says nothing about your change, only that the numbers are small.":"Your result cannot be read yet.";f=(r==="E1")?"Finish Week 2 and commit one change.":(r==="E2"?"Resist extra changes, and come back once your after-window has finished.":"Repeat with a longer window, or work on being found first (title, tags, keywords).");x=(r==="E4"||r==="E8")?"Partnership-to-Sales is open now and can bring visits while your listing is quiet. You are free to choose it, or to choose another experiment when more open.":"";bs=(r==="E4"||r==="E8")?"There were fewer views than the provisional minimum, or the evidence is limited.":"There is not enough yet to read.";as="We are assuming the numbers will be steadier with a longer window.";}
 return {t:t,b:b,first:f,extra:x,basis:bs,assume:as,provisional:rvPhase()==="during"||r==="E2"};
}
function rvUpdRow(u,exp){
 if(exp==="etsy"||exp==="email"||exp==="show"||exp==="find")return '<div class="crow"><span><strong>'+esc(dayLab(u.at))+'</strong> <span class="tag">post-sprint update</span><br><span class="mute">'+(exp==="etsy"?"Etsy":(exp==="show"?"Show-to-Sell":(exp==="find"?"Find Your Buyers":"Email")))+' evidence reading updated</span></span><span class="tag">'+esc(u.label)+'</span></div>';
 return '<div class="crow"><span><strong>'+esc(dayLab(u.at))+'</strong> <span class="tag">post-sprint update</span><br><span class="mute">Orders '+esc(w4Val(u.res.orders))+', clicks '+esc(w4Val(u.res.clicks))+'</span></span><span class="tag">'+esc(u.label)+'</span></div>';
}
/* ===== ETSY E4 LOGIC END ===== */

/* --- wrappers: Etsy where the sprint is Etsy, the earlier behaviour everywhere else --- */
var _sprHasWork=sprHasWork;sprHasWork=function(){return rvExp()==="etsy"?etHasWork():_sprHasWork();};
var _rvSnap=rvSnap;rvSnap=function(k){return rvExp()==="etsy"?etSnap(k):_rvSnap(k);};
var _sprArchive=sprArchive;
sprArchive=function(prev){
 if(prev&&prev.experiment==="etsy"){etArchive(prev);etResetP();}
 else if(prev&&prev.experiment==="email"){emArchive(prev);etResetP();}
 else if(prev&&prev.experiment==="show"){stsArchive(prev);etResetP();}
 else if(prev&&prev.experiment==="find"){fybArchive(prev);etResetP();}
 else{_sprArchive(prev);}
 S.et=etFresh(S.et.prep);S.em=emFresh(S.em.prep);S.sts=stsFresh(S.sts.prep);S.fyb=fybFresh(S.fyb.prep);
};
var _d5fix=d5fix;
d5fix=function(o){
 var src=Array.isArray(o.past)?o.past.slice(-10):[],out=[];
 src.forEach(function(x){
  if(x&&typeof x==="object"&&!Array.isArray(x)&&x.exp==="etsy"){out.push(etPastFix(x));}
  else if(x&&typeof x==="object"&&!Array.isArray(x)&&x.exp==="email"){out.push(emPastFix(x));}
  else if(x&&typeof x==="object"&&!Array.isArray(x)&&x.exp==="show"){out.push(stsPastFix(x));}
  else if(x&&typeof x==="object"&&!Array.isArray(x)&&x.exp==="find"){out.push(fybPastFix(x));}
  else{var t=_d5fix({past:[x]});if(t.past.length)out.push(t.past[0]);}
 });
 var r=_d5fix(o);r.past=out.slice(-10);return r;
};
var _tabOf=tabOf;tabOf=function(r){r=r||"#/";if(/^#\/etsy(\/|$)/.test(r)&&etActive())return "sprint";return _tabOf(r);};
var _sprConfirm=sprConfirm;
sprConfirm=function(label){if(typeof UI.sprConf==="string"){var s=UI.sprConf;UI.sprConf=false;var r=_sprConfirm(label);UI.sprConf=s;return r;}return _sprConfirm(label);};
var _rWeeks=rWeeks;rWeeks=function(){return etActive()?etWeeks():_rWeeks();};
var _rTrack=rTrack;
rTrack=function(){
 if(!etActive())return _rTrack();
 return '<div class="rweeks">'+etWeeks().map(function(w){
  var inner='<small>Week '+w.n+'</small><b>'+esc(w.title)+'</b>'+rBars(w)+'<em>'+esc(w.status)+'</em>';
  return w.open?'<a class="rwk '+w.state+'" href="#/etsy/w'+w.n+'">'+inner+'</a>':'<div class="rwk later">'+inner+'</div>';
 }).join("")+'</div>';
};
var _rNext=rNext;
rNext=function(){
 if(!(etActive()&&(SPR.loaded?rvPhase():"during")==="during"))return _rNext();
 var wk=etCurWeek(),W=etWeeks()[wk-1],base=etWeekBase(wk),first=W.first;
 if(!first)return {k:"Your next step",t:"Open your results",d:"You have finished every step. Your results, your evidence reading and your Day 30 review are in one place.",link:"#/results",b:"Open my results"};
 var s=W.L[first-1];
 return {k:"Your next step",t:s.t,d:"You will need: "+s.b+" Everything saves as you go.",m:s.m,link:base+first,b:"Continue Week "+wk+", step "+first,w:wk,n:first};
};
var _rHomeList=rHomeList;
rHomeList=function(nx){
 var ph=SPR.loaded?rvPhase():"during";
 if(!etActive()||ph!=="during")return _rHomeList(nx);
 var W=etWeeks()[etCurWeek()-1];
 return '<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,etWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
};
var _rSoFar=rSoFar;
rSoFar=function(){
 if(!etActive())return _rSoFar();
 var E=S.et,h='<div class="card"><h2>Your sprint so far</h2>';
 if(!etStepCount()&&!E.cm)return h+'<p class="mute">Your numbers appear here once you begin. What you did, what came back and what sold are always kept apart.</p></div>';
 h+='<div class="tiles"><div class="tile"><b>'+etStepCount()+'</b><span>Steps done</span></div><div class="tile"><b aria-hidden="true">'+(E.cm?"&#10003;":"&ndash;")+'</b><span>Change committed<span class="sr">: '+(E.cm?"yes":"not yet")+'</span></span></div><div class="tile"><b>'+E.wl.filter(function(x){return !x.wd;}).length+'</b><span>Log entries</span></div></div>';
 return h+'<p><a class="link" href="#/results">Open your results</a></p></div>';
};
var _home=home;home=function(){return etActive()?etMySprint():_home();};
var _resultsPage=resultsPage;resultsPage=function(){return etActive()?etResultsPage():_resultsPage();};
var _reviewPage=reviewPage;
reviewPage=function(){
 if(!etActive())return _reviewPage();
 var tail=_reviewPage(),i=tail.indexOf('<div class="card"><h2>4. Complete your review</h2>');
 return etReviewHead()+(i>-1?tail.slice(i):"");
};
var _ets5=ets5;
ets5=function(){var h=_ets5();if(etPrepPrefilled())h=h.replace('<label for="etn">','<p class="mute">Carried over from your preparation. Please check it, and change it if it is not the listing you mean.</p><label for="etn">');else if(etProfilePrefilled())h=h.replace('<label for="etn">','<p class="mute">Pre-filled from your product details. Please check it, and change it if it is not the listing you mean.</p><label for="etn">');return h;};

/* --- the chooser: two open experiments, each started only by its own button --- */
function sprConfirmX(key,label){
 var again=rvPhase()!=="notstarted";
 if(UI.sprBusy)return '<p class="mute">Starting...</p>';
 if(UI.sprConf!==key)return '<p><button type="button" class="btn" data-a="spr-askx" data-x="'+key+'">'+esc(label)+'</button></p>';
 return '<div class="note ok" role="alertdialog" aria-label="Confirm starting your sprint"><p><strong>Begin Day 1 today ('+esc(dayLab(today()))+')?</strong></p><p>Day 30 would be '+esc(dayLab(addDays(today(),29)))+'. You can finish early, but you cannot pause the clock. After Day 30 you will have 14 more days to add late results, which does not extend your sprint.'+(again?' Your current sprint will be saved to Past sprints, and your activity and results will start fresh. Only your business, offer and buyer details carry forward.':'')+' If you press this by mistake, you can undo it within 24 hours before logging any messages or results.</p><p class="row"><button type="button" class="btn" data-a="spr-gox" data-x="'+key+'">Yes, start Day 1 today</button><button type="button" class="btn ghost" data-a="spr-cancel">Not yet</button></p></div>';
}
experimentsPage=function(){
 var ph=rvPhase(),cx=EXPKEY[rvExp()],h='<h1>Experiments</h1><p class="mute">Six experiments, four weeks each, about 3 to 5 hours a week. You run one sprint at a time, and you choose when the next one starts. Nothing starts automatically.</p>'+sprintBar(false);
 if(UI.sprErr&&ph==="notstarted")h+='<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>';
 function card(x,i){
  var open=!!EXPOPEN[x[0]],c='<li class="rxc '+(open?"open":"soon")+'"><div class="rxg">'+rSvg("-50 -50 100 100",rExpG(x[0],open,open))+'</div><div class="rxb"><p class="rxk">Experiment '+(i+1)+'</p><h2>'+esc(x[1])+'</h2><p class="rxs">'+esc(x[2])+'</p><div class="rxo"><b>Your outcome</b><span>'+esc(x[3])+'</span></div><p class="rxm">4 weeks &middot; 3 to 5 hours a week &middot; Best for: '+esc(x[4])+'</p>';
  if(!open)return c+'<p class="rxm"><strong>Coming soon.</strong> Not open yet, so it cannot be started.</p></div></li>';
  if(!SPR.loaded)return c+'<p class="rxm">We could not check your sprint just now. Please refresh the page.</p></div></li>';
  if(ph==="during"){c+=cx===x[0]?'<p class="rxm"><strong>Your current experiment.</strong> '+esc(rvClock())+'. Find it under <a href="#/sprint">My Sprint</a>. You can start your next sprint after Day 30.</p>':'<p class="rxm">You already have a sprint running. You can start this one after Day 30.</p>';return c+'</div></li>';}
  var key=x[0]==="etsy"?"etsy":(x[0]==="email"?"email":(x[0]==="show"?"show":(x[0]==="find"?"find":"partnership"))),label=ph==="notstarted"?"Start my 30-day sprint":"Start another sprint";
  if(key==="etsy"&&!etPrepReady())return c+'<p class="rxm"><strong>Prepare first.</strong> This experiment needs a live Etsy listing that you can measure. Your 30 days do not start until you have one and press start yourself.</p><p><a class="btn ghost" href="#/etsy">Prepare for the Etsy experiment</a></p></div></li>';
  if(key==="email"&&!emPrepReady())return c+'<p class="rxm"><strong>Prepare first.</strong> This experiment needs a list of people who agreed to hear from you, and a tool to send from. Your 30 days do not start until you are ready and press start yourself.</p><p><a class="btn ghost" href="#/email">Prepare for Email-to-Sale</a></p></div></li>';
  if(key==="show"&&!stsPrepReady())return c+'<p class="rxm"><strong>Prepare first.</strong> This experiment needs a product people can buy that you can show in use, and somewhere of your own to publish. Your 30 days do not start until you are ready and press start yourself.</p><p><a class="btn ghost" href="#/show">Prepare for Show-to-Sell</a></p></div></li>';
  if(key==="find"&&!fybPrepReady())return c+'<p class="rxm"><strong>Prepare first.</strong> This experiment needs a clear idea of who your buyer is, and being happy to take part in conversations as yourself. Your 30 days do not start until you are ready and press start yourself.</p><p><a class="btn ghost" href="#/find">Prepare for Find Your Buyers</a></p></div></li>';
  c+=(ph==="notstarted"?'<p class="rxm">Ready when you are. Your 30 days begin only when you press the button.</p>':'<p class="rxm">Your last sprint is complete. You can choose when to start another, and it will not start by itself.</p>')+sprConfirmX(key,label);
  return c+'</div></li>';
 }
 var open="",rest="";EXPX.forEach(function(x,i){if(EXPOPEN[x[0]])open+=card(x,i);else rest+=card(x,i);});
 var first=ph==="notstarted"&&!(S.chk&&S.chk.done);if(first)h+='<div class="rchk">'+chkCard()+'</div>';h+='<ul class="rxgrid">'+open+'</ul>';
 h+='<div class="note warn"><strong>Temporary test limitation.</strong> In this test build Partnership-to-Sales, the Etsy Sales Bottleneck, Email-to-Sale, Show-to-Sell and Find Your Buyers can be started. LIVE Sales will become available when it is built. You will always be able to choose any experiment that is open.</div>';
 if(!first)h+='<div class="rchk">'+chkCard()+'</div>';
 return h+'<ul class="rxgrid">'+rest+'</ul>';
};
var _sprAction=sprAction;
sprAction=function(a,d,t){
 if(a==="spr-askx"){if(d.x!=="etsy"&&d.x!=="partnership"&&d.x!=="email"&&d.x!=="show"&&d.x!=="find")return;UI.sprConf=d.x;UI.sprErr="";render();}
 else if(a==="spr-gox"){UI.sprX=d.x==="etsy"?"etsy":(d.x==="email"?"email":(d.x==="show"?"show":(d.x==="find"?"find":"partnership")));sprGo();}
 else if(a==="spr-go"){UI.sprX="partnership";sprGo();}
 else _sprAction(a,d,t);
};
sprGo=async function(){
 if(UI.sprBusy)return;
 var key=UI.sprX==="etsy"?"etsy":(UI.sprX==="email"?"email":(UI.sprX==="show"?"show":(UI.sprX==="find"?"find":"partnership")));
 if(key==="etsy"&&!etPrepReady()){UI.sprConf=false;UI.sprErr="Please finish the Etsy preparation checklist first.";render();return;}
 if(key==="email"&&!emPrepReady()){UI.sprConf=false;UI.sprErr="Please finish the Email-to-Sale preparation checklist first.";render();return;}
 if(key==="show"&&!stsPrepReady()){UI.sprConf=false;UI.sprErr="Please finish the Show-to-Sell preparation checklist first.";render();return;}
 if(key==="find"&&!fybPrepReady()){UI.sprConf=false;UI.sprErr="Please finish the Find Your Buyers preparation checklist first.";render();return;}
 UI.sprBusy=true;UI.sprErr="";render();
 var prev=rvCur(),ph=rvPhase();
 var r=await sb.rpc("start_sprint",{p_experiment:key,p_day:today()});
 UI.sprBusy=false;UI.sprConf=false;
 if(r.error){UI.sprErr=sprMsg(r.error.message);render();return;}
 if(prev&&(ph==="window"||ph==="closed"))sprArchive(prev);
 if(key==="etsy")etStart();if(key==="email")emStart();if(key==="show")stsStart();if(key==="find")fybStart();
 await sprLoad();
 save();toast("Day 1 begins today. Good luck.");render();
};

/* --- preparation: guidance and a checklist. It never starts the clock, never counts as experiment activity --- */
function etPrep(){
 var P=S.et.prep,ph=SPR.loaded?rvPhase():"",ready=etPrepReady();
 var h='<a class="back" href="#/experiments">&larr; Experiments</a><h1>Prepare for the Etsy experiment</h1><p class="mute">Get ready first. Nothing on this page starts your 30 days, and nothing here counts as completed experiment activity.</p>';
 h+='<div class="card"><h2>What the experiment is</h2><p>Over four weeks you use your own Etsy numbers to see whether your listing has a visibility problem or a conversion problem, make one deliberate change, and read the result honestly. It needs a live Etsy listing, because everything is measured from your Etsy Stats.</p></div>';
 h+='<div class="card"><h2>The four weeks, in plain words</h2><ol>'+ETWKT.map(function(t,i){return '<li><strong>Week '+(i+1)+': '+esc(t)+'.</strong> '+esc(ETWKD[i])+'</li>';}).join("")+'</ol><p class="mute">About 3 to 5 hours a week. You can read ahead, and you can go at your own pace inside each week.</p></div>';
 h+='<div class="card"><h2>What you need before it can start</h2><p><strong>Is your listing live?</strong></p><div class="row"><button type="button" class="chip" aria-pressed="'+(P.live==="yes")+'" data-a="et4-live" data-v="yes">Yes, it is live</button><button type="button" class="chip" aria-pressed="'+(P.live==="no")+'" data-a="et4-live" data-v="no">Not yet</button></div>';
 h+='<label for="etpl">The listing you plan to focus on (optional)</label><input id="etpl" type="text" maxlength="120" data-et="p:listing" value="'+esc(P.listing||"")+'" placeholder="For example: Monthly budget planner"><p class="mute">This is carried into your sprint, where you check it and choose it in Week 1.</p><p style="margin-top:12px"><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(P.stats===true)+'" data-a="et4-stats">I can open Shop Manager, then Stats, and see this listing\'s views, favourites and orders.</button></p>';
 if(P.live==="no")h+='<div class="note info"><strong>That is fine, and there is a lot you can do first.</strong> Get your listing live, then come back. While you wait you can think about the words a buyer would type to find your product, and which one listing you most want to focus on. Your 30 days will not start until your listing is live and you choose to begin.</div>';
 h+='<p class="mute">The sprint starts only when you press the start button yourself. About 3 to 5 hours a week for four weeks.</p></div>';
 if(!SPR.loaded)h+='<div class="note warn" role="status">We could not check your sprint just now. Please refresh the page.</div>';
 else if(etActive())h+='<div class="note ok">You are already on this experiment. <a href="#/sprint">Open My Sprint</a>.</div>';
 else if(ph==="during")h+='<div class="note info">You already have a sprint running. You can start the Etsy experiment after Day 30, if you wish.</div>';
 else if(ready){
  h+='<div class="card"><h2>Ready when you are</h2><p>Your listing is live and you can see its numbers.</p>'+(UI.sprErr?'<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>':'')+sprConfirmX("etsy",ph==="notstarted"?"Start my 30-day sprint":"Start another sprint")+'</div>';
 }else h+='<div class="note info"><strong>Not ready to start yet.</strong> Both of these are needed: your listing is live, and you can see its Stats. Tick them above when they are true.</div>';
 h+='<div class="card"><h2>Another experiment may suit you better right now</h2><p>You are always free to choose a different experiment.</p><p><strong>Partnership-to-Sales</strong> <span class="tag">open now</span><br><span class="mute">It does not need a listing. It borrows other people\'s audiences to bring your product to new buyers.</span></p><p class="mute">Email-to-Sale, Show-to-Sell and Find Your Buyers are open now too. LIVE Sales is coming soon, and is not open yet.</p><p><a class="btn ghost" href="#/experiments">See the experiments, and the sales check</a></p></div>';
 return h;
}
function et4Input(t){if(String(t.dataset.et)==="p:listing"){S.et.prep.listing=String(t.value||"").slice(0,120);save();}}
function et4Action(a,d){
 var P=S.et.prep;
 if(a==="et4-live"){if(d.v!=="yes"&&d.v!=="no")return;P.live=P.live===d.v?"":d.v;if(P.live!=="yes")P.stats=false;save();}
 else if(a==="et4-stats"){if(P.live!=="yes")return;P.stats=!P.stats;save();}
 else return;
 render();
}
var ETWKD=["Understand your numbers and choose your listing.","Choose one change, plan it, and commit.","Leave it alone, keep a simple log, and note anything else that could matter.","Record your numbers, read the result, and decide what is next."];
function etRoute(){
 var m=/^#\/etsy(?:\/(w[1-4]))?(?:\/([1-6]))?$/.exec(route)||[],wk=m[1]||"",n=+(m[2]||0);
 if(!etActive())return etPrep();
 if(!wk&&!n)return etMySprint();
 var w=wk?+wk.slice(1):1;
 if(w>1&&!etWeekDone(w-2))return '<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Week '+w+' is not open yet</h1><div class="note info">Week '+w+' opens when you finish Week '+(w-1)+'. <a href="'+(w===2?"#/etsy/w1":"#/etsy/w"+(w-1))+'">Go to Week '+(w-1)+'</a></div>';
 return etRouteInner();
}
function etBlockP(){return etActive()&&/^#\/(step\/[1-7]|w[234]\/[1-6])$/.test(route||"");}
function etBlockHtml(){return '<a class="back" href="#/sprint">&larr; My Sprint</a><h1>This is your Etsy sprint</h1><p class="mute">Partnership-to-Sales pages are not part of the sprint you are on. They are not changed or lost.</p><div class="note info">You can run Partnership-to-Sales as your next sprint, after Day 30. <a href="#/sprint">Back to My Sprint</a></div>';}

/* --- My Sprint --- */
function etMySprint(){
 var wk=etCurWeek(),E=S.et,W=etWeeks()[wk-1];
 var h='<h1>My Sprint</h1><p class="mute">Etsy Sales Bottleneck &middot; Week '+wk+' of 4</p>'+sprintBar(true);
 h+='<div class="tabs rwpick">'+etWeeks().map(function(w){
  var g=rSvg("-50 -50 100 100",rWeekG(w.n,w.open,"#fff"));
  return w.open?'<a class="chip rwb" aria-pressed="'+(w.n===wk)+'" href="#/etsy/w'+w.n+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+(w.state==="done"?' &#10003;':'')+'</a>':'<button type="button" class="chip rwb" disabled title="Opens when you finish Week '+(w.n-1)+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+'</button>';
 }).join("")+'</div>';
 h+='<p class="mute"><strong>This week:</strong> '+esc(ETWKD[wk-1])+'</p>';if(wk===1)h+='<p class="mute">Week 2 opens when you finish Week 1 (choose "Ready for Week 2" in the last step).</p>';
 var pn=String(S.focus.product||"").trim();if(pn)h+='<div class="note ok"><strong>Your product:</strong> '+esc(pn)+'</div>';
 if(E.lst.chosen)h+='<div class="note ok"><strong>Your focus listing:</strong> '+esc(E.lst.chosen)+(E.locked?' <span class="tag">locked</span>':'')+'</div>';
 h+='<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,etWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
 return h+'<p class="mute"><a href="#/experiments">See all six experiments, and the sales check</a></p>';
}

/* --- Results --- */
function etPair(k){var E=S.et;return etFmt(E.res.b[k],k==="rev")+" &rarr; "+etFmt(E.res.a[k],k==="rev");}
function etResultsPage(){
 var E=S.et,v=etVerdict(),ph=rvPhase(),started=etStepCount()>0||!!E.cm,h='<div class="phd"><h1>Results</h1><p class="mute">Your numbers, what they show, and what you learned. Counts, not percentages, while samples are small.</p>';
 if(started){
  h+='<div class="rtally"><div><h3>You did</h3><p><b>'+etStepCount()+'</b>Steps done</p><p><b>'+(E.cm?"1":"0")+'</b>Change committed</p><p><b>'+E.wl.filter(function(x){return !x.wd;}).length+'</b>Log entries</p></div>'
   +'<div><h3>Came back</h3><p><b>'+etPair("views")+'</b>Listing views, before to after</p><p><b>'+etPair("favs")+'</b>Listing favourites, before to after</p></div>'
   +'<div><h3>Sold</h3><p><b>'+etPair("lorders")+'</b>Listing orders, before to after</p><p><b>'+etPair("rev")+'</b>Listing revenue, before to after</p></div></div>';
 }
 h+='</div><!--/phd--><div class="rcols"><div>';
 var n=E.base.n;
 h+='<div class="card"><h2>Where you started</h2><p class="mute">The diagnostic baseline from Week 1: the 30 days before your sprint, where Etsy had them. It is not your before-window. "I can\'t see this" stays unknown and is never turned into zero.</p><h3>Your shop (shop level)</h3><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(nvTxt(n.shopVisits))+'</b>Visits</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(n.shopOrders))+'</b>Orders</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(n.shopRev,true))+'</b>Revenue</div></div><h3>Your focus listing (listing level)</h3><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(nvTxt(n.views))+'</b>Views</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(n.favs))+'</b>Favourites</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(n.lorders))+'</b>Orders</div></div><p class="mute">Shop numbers and listing numbers are never added or compared with each other.</p></div>';
 h+='<div class="card"><h2>Your sprint so far</h2><p class="mute">'+esc(rvClock())+'</p>';
 if(E.cm){var w=etWin(E.cm.date,E.cm.n);h+='<p>Your change: <strong>'+esc(E.cm.what)+'</strong>, which went live on '+esc(dayLab(E.cm.date))+(E.cm.retro?' <span class="tag">recorded retrospectively</span>':'')+'.</p>'+(w?'<p class="mute">Before-window '+esc(dayLab(w.bFrom))+' to '+esc(dayLab(w.bTo))+'. After-window '+esc(dayLab(w.aFrom))+' to '+esc(dayLab(w.aTo))+'.</p>':'');}
 else h+='<p class="mute">No change is committed yet. You commit one in <a href="#/etsy/w2/5">Week 2, step 5</a>.</p>';
 if(!etRecNums())h+='<p class="mute">No before and after numbers recorded yet. You can add them in <a href="#/etsy/w4/3">Week 4, step 3</a>.</p>';
 h+='</div>';
 if(started){h+='<section class="rpnl gold rread"><small>What the evidence suggests</small><h2>'+(ph==="during"&&v.rule!=="E2"?"Provisional reading: ":"")+esc(v.label)+'</h2><p>'+esc(v.why[0]||"")+'</p><p class="mute">A reading, not a verdict. An improvement you can see is not proof that your change caused it. <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</p></section>';}
 h+='</div><div class="rside">';
 h+='<div class="card"><h2>Day 30 review</h2>'+(S.rv.done?'<p>Saved on '+esc(dayLab(S.rv.at))+': '+esc(S.rv.snap?S.rv.snap.label:"")+'.</p>':'<p class="mute">'+(started?"Look back at your sprint, see what the evidence suggests, and choose what to focus on next. You can open it at any time.":"Available once your sprint has started.")+'</p>')+'<p><a class="btn'+(S.rv.done?' ghost':'')+'" href="#/review">'+(S.rv.done?"Open my Day 30 review":"Open my Day 30 review")+'</a></p></div>';
 if(E.wl.length)h+='<div class="card"><h2>Your weekly log</h2><p class="mute">Your own dated notes from Week 3.</p>'+E.wl.filter(function(x){return !x.wd;}).slice(-6).reverse().map(function(e){return '<div class="crow"><span><strong>'+esc(dayLab(e.d))+'</strong><br><span class="mute">Views '+esc(etFmt(e.views))+', favourites '+esc(etFmt(e.favs))+', orders '+esc(etFmt(e.lorders))+'</span></span></div>';}).join("")+'</div>';
 var c=etConfs(),learn=[];
 if(E.cf.length)learn.push("Things that could also explain your numbers: "+c.major.length+" major, "+c.minor.length+" minor");
 if(E.nx){var nxt=ETNEXT.filter(function(x){return x[0]===E.nx;})[0];if(nxt)learn.push("What you decided next: "+nxt[1]);}
 h+='<div class="card"><h2>What you have learned</h2>'+(learn.length?learn.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join(""):'<p class="mute">Your own notes and choices from Weeks 2 to 4 appear here as you go.</p>')+'</div>';
 h+='<div class="card"><h2>Past sprints</h2>'+rvPastHtml()+'</div>';
 return h+'</div></div>';
}

/* --- Day 30 review: the Etsy head, then the shared tail (complete, late results, feedback, consent, record) --- */
function etReviewHead(){
 var E=S.et,v=etVerdict(),rec=etRec(v),ph=rvPhase(),prov=ph==="during"||rec.provisional,n=E.base.n;
 var h='<a class="back" href="#/results">&larr; Results</a><h1>Your Day 30 review</h1><p class="mute">Etsy Sales Bottleneck. A look at where you started, what you did, what the evidence suggests, and what to focus on next.</p>'+sprintBar(true);
 h+='<div class="card"><h2>1. Where you started, and where you are now</h2><p class="mute">Your diagnostic baseline is the 30 days before your sprint. Your before-window and after-window are equal periods either side of your change. We show them side by side and we do not label the difference as better or worse, because the periods are not like for like.</p>';
 [["views","Listing views",false],["lorders","Listing orders",false],["rev","Listing revenue",true]].forEach(function(x){
  var base=x[0]==="views"?n.views:(x[0]==="lorders"?n.lorders:n.lrev);
  h+='<div class="crow" style="display:block"><p style="margin:0"><strong>'+esc(x[1])+'</strong></p><p class="mute" style="margin:2px 0 8px">Baseline (30 days): '+esc(etFmt(base,x[2]))+'. Before-window: '+esc(etFmt(E.res.b[x[0]],x[2]))+'. After-window: '+esc(etFmt(E.res.a[x[0]],x[2]))+'.</p></div>';
 });
 h+='<p class="mute">Shop visits and shop figures are shop level. They are never added to or compared with listing figures.</p></div>';
 h+='<div class="card"><h2>2. What you did</h2><p>Steps completed: '+ETWKT.map(function(t,i){return "Week "+(i+1)+" "+rCount(etStepsOf(i),etDOf(i))+" of "+etStepsOf(i).length;}).join(", ")+'.</p>'+(E.cm?'<p>You committed one change on '+esc(dayLab(E.cm.at))+': <strong>'+esc(E.cm.what)+'</strong>'+(E.cm.retro?' <span class="tag">recorded retrospectively</span>':'')+'.</p>':'<p>No change committed yet.</p>')+'<p>Log entries: '+E.wl.filter(function(x){return !x.wd;}).length+'. Confounders logged: '+E.cf.filter(function(x){return !x.wd;}).length+'.</p><div class="note info">You do not need to have finished every step. Anything unfinished stays saved and you can come back to it.</div></div>';
 h+='<div class="card"><h2>3. What the evidence suggests</h2><div class="note '+v.cls+'"><strong>'+(prov?"Provisional reading: ":"")+esc(v.label)+'</strong> <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</div>';
 h+='<h3>What the numbers show</h3>'+v.why.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("");
 h+='<h3>What remains uncertain</h3>'+v.limits.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+'<p style="margin:4px 0">This is a reading, not a verdict. The thresholds behind it are provisional starting points, not guarantees.</p>';
 h+='<h3>What to focus on next</h3><div class="note info"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div><p><strong>First small action:</strong> '+esc(rec.first)+'</p>'+(rec.extra?'<p>'+esc(rec.extra)+'</p>':'')+'<p class="mute"><strong>Evidence:</strong> '+esc(rec.basis)+'</p><p class="mute"><strong>Assumption:</strong> '+esc(rec.assume)+'</p></div>';
 return h;
}

/* --- Past sprints: late Etsy numbers for an earlier sprint, kept apart from the current one --- */
function etPastSummary(p){
 if(p.exp!=="etsy"||!p.etx)return "";
 var x=p.etx,cm=x.cm,h="";
 if(cm)h+='<p class="mute" style="margin:2px 0 6px">Change: '+esc(cm.what)+', which went live on '+esc(dayLab(cm.date))+(cm.retro?' (recorded retrospectively)':'')+'. Before and after, views '+etWith(x,function(){return etPair("views");})+', orders '+etWith(x,function(){return etPair("lorders");})+'.</p>';
 else h+='<p class="mute" style="margin:2px 0 6px">No change was committed in this sprint.</p>';
 return h;
}
function pueDraft(){if(!UI.pue)UI.pue={i:-1,res:{b:{views:{s:"",v:""},favs:{s:"",v:""},lorders:{s:"",v:""},rev:{s:"",v:""}},a:{views:{s:"",v:""},favs:{s:"",v:""},lorders:{s:"",v:""},rev:{s:"",v:""}}}};return UI.pue;}
function etPastLate(p,i){
 if(!(UI.pue&&UI.pue.i===i))return '<p><button type="button" class="btn ghost" data-a="pue-open" data-i="'+i+'">Add late Etsy numbers to this sprint</button></p>';
 var u=pueDraft(),h='<p class="mute">Add what you can now see for this earlier sprint. They belong to this sprint only, and do not change your current sprint or the Day 30 position. Leave anything you do not want to change.</p>';
 [["b","Before-window"],["a","After-window"]].forEach(function(w){
  h+='<h3>'+w[1]+'</h3>';
  ["views","favs","lorders","rev"].forEach(function(k){
   var o=u.res[w[0]][k],opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
   h+='<div class="q"><strong>'+esc(ETRESL[k]+(ETMONEY[k]?" ("+sym(S.focus.currency).trim()+")":""))+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="pue-vs" data-sc="'+w[0]+'" data-k="'+k+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-pue="'+w[0]+'.'+k+'" value="'+esc(o.v)+'" aria-label="'+esc(ETRESL[k])+'" style="max-width:160px">':'')+'</div>';
  });
 });
 return h+'<p class="row"><button type="button" class="btn" data-a="pue-save">Save as a post-sprint update</button><button type="button" class="btn ghost" data-a="pue-cancel">Cancel</button></p>';
}
function puEAction(a,d){
 var u=UI.pue||null;
 if(a==="pue-open"){var i=+d.i,p=(S.past||[])[i];if(!p||p.exp!=="etsy"||!p.etx||!pastWinOpen(p))return;UI.pue=null;u=pueDraft();u.i=i;}
 else if(a==="pue-cancel"){UI.pue=null;}
 else if(a==="pue-vs"){u=pueDraft();if((d.sc!=="b"&&d.sc!=="a")||ETRES.indexOf(d.k)<0||d.k==="sv"||!ETVS[d.v]||d.v==="")return;var o=u.res[d.sc][d.k];if(!o)return;o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";}
 else if(a==="pue-save"){
  if(!u)return;
  var p2=(S.past||[])[u.i];if(!p2||p2.exp!=="etsy"||!p2.etx||!pastWinOpen(p2))return;
  var any=false;["b","a"].forEach(function(sc){Object.keys(u.res[sc]).forEach(function(k){var o=u.res[sc][k];if(o.s){any=true;p2.etx.res[sc][k]={s:o.s,v:o.s==="value"?w4Clean(k,o.v):""};}});});
  if(!any)return;
  ["b","a"].forEach(function(sc){if(Object.keys(u.res[sc]).some(function(k){return !!u.res[sc][k].s;}))p2.etx.res[sc+"At"]=today();});
  var v=etWith(p2.etx,function(){return etVerdict();});
  var e={at:today(),label:v.label,rule:v.rule,ctr:{msgs:0,resp:0,opp:0},res:{},kind:"update",asOf:"",late:false,prov:false};
  p2.upd=p2.upd||[];if(p2.upd.length&&p2.upd[p2.upd.length-1].at===e.at)p2.upd[p2.upd.length-1]=e;else if(p2.upd.length<RVMAX)p2.upd.push(e);else return;
  UI.pue=null;save();
 }
 else return;
 render();
}
function puEInput(t){var u=pueDraft(),m=/^(b|a)\.(views|favs|lorders|rev)$/.exec(String(t.dataset.pue));if(!m)return;var o=u.res[m[1]][m[2]];if(o&&o.s==="value"){var c=w4Clean(m[2],t.value);o.v=c;if(c!==t.value)t.value=c;}}

function et4fix(w,r){var p=w.prep;if(p&&typeof p==="object"&&!Array.isArray(p)){if(p.live==="yes"||p.live==="no")r.prep.live=p.live;if(p.stats===true&&r.prep.live==="yes")r.prep.stats=true;if(typeof p.listing==="string")r.prep.listing=p.listing.slice(0,120);}}

/* ---------- Email-to-Sale: turn an existing, consented email list into sales with one three email sequence. ----------
   Built on the shared sprint (clock, Home, My Sprint, Results, Day 30 review, update window, Past sprints) through the same
   experiment adapter as the Etsy experiment. One measurable experiment: a three email sequence, tracked clicks, orders and revenue. */
var EMSTEPS=[
 [{n:1,t:"How a small list turns into sales",m:25,b:"Nothing. A short lesson and a quick check."},
  {n:2,t:"Your list and where you start",m:30,b:"Your email tool, for the list size and the last 30 days."},
  {n:3,t:"Check your list before you email",m:20,b:"Five honest yes or no answers."},
  {n:4,t:"Choose one offer, and how you will count orders",m:30,b:"The one product, and a link or code you can track."},
  {n:5,t:"Week 1 review",m:15,b:"Whatever you have done so far."}],
 [{n:1,t:"How three emails work together",m:20,b:"Nothing. A short lesson."},
  {n:2,t:"Write email 1: the invitation",m:40,b:"Your offer from Week 1."},
  {n:3,t:"Write email 2: the reason to act",m:35,b:"Your offer, and one true story or result."},
  {n:4,t:"Write email 3: the last reminder",m:30,b:"Your offer, and a real deadline."},
  {n:5,t:"Pre-send check, schedule and commit",m:30,b:"Your three drafts, open in your email tool."}],
 [{n:1,t:"Send, then hold steady",m:15,b:"Nothing. A short read."},
  {n:2,t:"Send log",m:20,b:"Your email tool, for the send dates and recipient counts."},
  {n:3,t:"What else could explain the numbers?",m:20,b:"Anything you remember changing or happening."},
  {n:4,t:"Week 3 review",m:15,b:"Whatever you have done so far."}],
 [{n:1,t:"How to read a small email result",m:25,b:"Nothing. A short lesson."},
  {n:2,t:"Record your numbers",m:35,b:"Your email tool, and your orders for the tracked link or code."},
  {n:3,t:"Your evidence verdict",m:20,b:"The numbers from step 2."},
  {n:4,t:"Decide what is next",m:25,b:"Your verdict."}]
];
var EMWKT=["Prepare","Write and schedule","Send and watch","Read the result"];
var EMWKD=["Get your list, your offer and how you will count orders ready.","Write three short emails and schedule them.","Send them, leave things alone, and note anything else that could matter.","Record your numbers, read the result, and decide what is next."];
var EMTOTAL=18;
var EMMINRECIP=20,EMCONFRECIP=100,EMMINCLICKS=10,EMSMALLORD=3,EMTAIL=7;
var EMCK=[["agreed","Everyone on this list agreed to hear from me by email."],["source","I know where each person's address came from."],["unsub","Every email I send has a working unsubscribe link, and my name or business is clear."],["nobought","I did not buy, rent or scrape this list."],["unsubd","I will not email anyone who has already unsubscribed or asked me to stop."]];
var EMTICKS=[["agreed","My list check in Week 1 is still true."],["ident","Each email says who it is from and has a working unsubscribe link."],["ask","Each email asks for one thing."],["track","I have tested the tracked link or code, and it works."],["plan","I will send all three on my scheduled dates and change nothing else about the offer in between."],["proof","I understand one sequence to one list is a small test and not proof."]];
var EMCONF=[["price","I changed the price"],["promo","I ran another promotion or sale, or sent another offer to the same people"],["list","My list changed a lot (cleaned, imported or grew quickly)"],["partner","Another business or a partner mailed my list or promoted the same offer"],["ads","I ran ads or posts for the same offer"],["season","A major seasonal or holiday period"],["ext","A post, mention or press that sent unusual traffic"],["other","Something else"]];
var EMNEXT=[["repeat","Repeat the same sequence to a new group"],["improve","Improve one thing and send again"],["pause","Pause, and work on my list first"],["other","Take what I learned to a different experiment"],["unsure","I am not sure yet"]];
var EMS=(function(){
 var s=function(n){return {t:"s",n:n};},v={t:"v"},b={t:"b"},d={t:"d"},e=function(a){return {t:"e",v:a};};
 var yn=e(["","yes","no","unsure"]);
 var mail={t:"o",f:{subj:s(100),hook:s(400),val:s(600),ask:s(300),ps:s(300)}};
 return {t:"o",f:{
  prep:{t:"o",f:{list:e(["","yes","no"]),tool:b}},
  steps:{t:"m",k:/^[1-5]$/,i:b},steps2:{t:"m",k:/^[1-5]$/,i:b},st3:{t:"m",k:/^[1-4]$/,i:b},st4:{t:"m",k:/^[1-4]$/,i:b},
  dec:e(["","next"]),dec2:e(["","next"]),dec3:e(["","next"]),dec4:e(["","done"]),
  ls:{t:"o",f:{size:v,src:e(["","signup","freebie","customers","event","other"]),last:d,sent30:v,orders30:v,rev30:v}},
  ck:{t:"o",f:{agreed:yn,source:yn,unsub:yn,nobought:yn,unsubd:yn}},
  of:{t:"o",f:{product:s(120),who:s(200),goal:s(200),trk:e(["","link","code","none"]),ref:s(200)}},
  mk:{t:"a",n:3,i:mail},
  ticks:{t:"m",k:/^(agreed|ident|ask|track|plan|proof)$/,i:b},
  sch:{t:"a",n:3,i:d},
  cm:{t:"c"},
  sd:{t:"a",n:3,i:{t:"o",f:{d:d,n:v}}},
  cf:{t:"a",n:60,i:{t:"o",f:{id:{t:"n"},d:d,at:d,k:e(EMCONF.map(function(x){return x[0];})),maj:b,note:s(300),wd:d}}},
  nid:{t:"n"},
  res:{t:"o",f:{clicks:v,orders:v,rev:v,unsub:v,compl:v,at:d}},
  nx:e(["","repeat","improve","pause","other","unsure"])
 }};
})();
function emDef(n){
 if(n.t==="o"){var o={};Object.keys(n.f).forEach(function(k){o[k]=emDef(n.f[k]);});return o;}
 if(n.t==="a"){var a=[];if(n.n===3){for(var i=0;i<3;i++)a.push(emDef(n.i));}return a;}
 if(n.t==="m")return {};if(n.t==="s"||n.t==="d")return "";if(n.t==="b")return false;if(n.t==="e")return "";if(n.t==="v")return {s:"",v:""};if(n.t==="n")return 1;if(n.t==="c")return null;return null;
}
function emClean(n,x,dflt){
 var ok=function(y){return typeof y==="string";};
 if(n.t==="s")return ok(x)?x.slice(0,n.n):dflt;
 if(n.t==="d")return (ok(x)&&(x===""||parseYmd(x)!=null))?x:dflt;
 if(n.t==="b")return x===true;
 if(n.t==="e")return (ok(x)&&n.v.indexOf(x)>-1)?x:dflt;
 if(n.t==="n")return (typeof x==="number"&&x===Math.floor(x)&&x>0&&x<=100001)?x:dflt;
 if(n.t==="v"){if(x&&typeof x==="object"&&!Array.isArray(x)&&ok(x.s)&&ETVS[x.s]&&ok(x.v))return {s:x.s,v:x.s==="value"?w4Clean("n",x.v):""};return dflt;}
 if(n.t==="o"){var o=(x&&typeof x==="object"&&!Array.isArray(x))?x:{},r={};Object.keys(n.f).forEach(function(k){r[k]=emClean(n.f[k],o[k],dflt&&dflt[k]!==undefined?dflt[k]:emDef(n.f[k]));});return r;}
 if(n.t==="m"){var m={};if(x&&typeof x==="object"&&!Array.isArray(x))Object.keys(x).forEach(function(k){if(n.k.test(k)&&x[k]===true)m[k]=true;});return m;}
 if(n.t==="a"){var a=[];if(Array.isArray(x)){x.slice(0,n.n).forEach(function(y,i){a.push(emClean(n.i,y,emDef(n.i)));});}
  if(n.n===3){while(a.length<3)a.push(emDef(n.i));}return a;}
 return dflt;
}
function EMDEF(){return emDef(EMS);}
function emfix(o){
 var w=(o.em&&typeof o.em==="object"&&!Array.isArray(o.em))?o.em:{},r=emClean(EMS,w,EMDEF());
 // the confounder list: unique ids, only valid entries, "other" keeps its own severity
 var seen={},maxId=0;r.cf=(Array.isArray(w.cf)?w.cf.slice(0,60):[]).filter(function(x){return x&&typeof x==="object"&&typeof x.id==="number"&&x.id===Math.floor(x.id)&&x.id>0&&x.id<=100000&&typeof x.d==="string"&&parseYmd(x.d)!=null&&typeof x.at==="string"&&parseYmd(x.at)!=null&&EMCONF.some(function(c){return c[0]===x.k;})&&!seen[x.id]&&(seen[x.id]=1);}).map(function(x){if(x.id>maxId)maxId=x.id;return {id:x.id,d:x.d,at:x.at,k:x.k,maj:x.k==="other"?x.maj===true:true,note:typeof x.note==="string"?x.note.slice(0,300):"",wd:(typeof x.wd==="string"&&parseYmd(x.wd)!=null)?x.wd:""};});
 r.nid=Math.max(maxId+1,(typeof w.nid==="number"&&w.nid===Math.floor(w.nid)&&w.nid>0&&w.nid<=100001)?w.nid:1);
 // the committed plan: needs three valid distinct ascending dates, a commit date, and ticks all done
 var c=w.cm;r.cm=null;
 if(c&&typeof c==="object"&&!Array.isArray(c)&&typeof c.at==="string"&&parseYmd(c.at)!=null&&Array.isArray(c.sch)&&c.sch.length===3&&c.sch.every(function(x){return typeof x==="string"&&parseYmd(x)!=null;})&&c.sch[0]<c.sch[1]&&c.sch[1]<c.sch[2]){
  r.cm={at:c.at,sch:c.sch.slice(0,3),mk:(Array.isArray(c.mk)?c.mk:[]).slice(0,3).map(function(m){return emClean(EMS.f.mk.i,m,emDef(EMS.f.mk.i));}),trk:EMS.f.of.f.trk.v.indexOf(c.trk)>-1?c.trk:"",ref:typeof c.ref==="string"?c.ref.slice(0,200):"",what:typeof c.what==="string"?c.what.slice(0,200):""};
  while(r.cm.mk.length<3)r.cm.mk.push(emDef(EMS.f.mk.i));
 }
 o.em=r;return o;
}
/* ===== EMAIL LOGIC START: pure rules, checked by dev/email_e5_tests.js ===== */
function emVs(o){return vstate(o);}
function emN(o){var s=vstate(o);return s==="pos"?+o.v:(s==="zero"?0:null);}
function emFmt(o,money){var s=vstate(o),c=money?sym(S.focus.currency):"";return s==="pos"?c+String(+o.v):(s==="zero"?c+"0 (confirmed)":"not seen");}
function emActive(){var c=rvCur();return !!c&&c.experiment==="email";}
function emPrepReady(){var p=S.em.prep;return p.list==="yes"&&p.tool===true;}
function emStepsOf(i){return EMSTEPS[i];}
function emDOf(i){var E=S.em;return [E.steps,E.steps2,E.st3,E.st4][i]||{};}
function emWeekDone(i){var E=S.em,L=emStepsOf(i),D=emDOf(i);return L.every(function(s){return D[s.n];})||[E.dec==="next",E.dec2==="next",E.dec3==="next",E.dec4==="done"][i];}
function emCurWeek(){for(var i=0;i<4;i++){if(!emWeekDone(i))return i+1;}return 4;}
function emWeekBase(w){return w===1?"#/email/":"#/email/w"+w+"/";}
function emStepCount(){var n=0;for(var i=0;i<4;i++)n+=rCount(emStepsOf(i),emDOf(i));return n;}
function emWeeks(){
 var cur=emCurWeek(),out=[];
 for(var i=0;i<4;i++){
  var L=emStepsOf(i),D=emDOf(i),n=rCount(L,D),tot=L.length,st=(i+1<cur)?"done":(i+1===cur?"now":"later"),first=0;
  if(st==="now"){for(var j=0;j<tot;j++){if(!D[L[j].n]){first=L[j].n;break;}}}
  out.push({n:i+1,title:EMWKT[i],L:L,D:D,done:n,total:tot,state:st,open:i===0||emWeekDone(i-1),first:first,status:st==="later"?"Opens when you finish Week "+i:(st==="done"&&n===tot?"Done":n+" of "+tot+" steps done")});
 }
 return out;
}
function emListCheck(){
 var c=S.em.ck,vals=EMCK.map(function(x){return c[x[0]];});
 if(vals.every(function(v){return v==="yes";}))return {k:"ready",t:"You answered yes to all five",b:"This is based only on what you told us. It is not confirmation that your list or your emails meet the law, and the Sales Lab does not check your list. Please keep your answers true while you send."};
 if(vals.some(function(v){return v==="no";}))return {k:"no",t:"Do not email this list yet",b:"At least one answer is no. Only email people who agreed to hear from you, who know where their address came from, who can unsubscribe, and who have not asked you to stop. Fix that first. You can choose another experiment in the meantime."};
 if(vals.some(function(v){return v==="";}))return {k:"open",t:"Answer all five",b:"Every one needs an honest yes, no or not sure."};
 return {k:"unsure",t:"Find out before you send",b:"At least one answer is not sure. Please find out first, for example by checking where the list came from. This is general guidance, not legal advice."};
}
function emDays(a,b){var x=parseYmd(a),y=parseYmd(b);if(x==null||y==null)return 0;return Math.round((y-x)/86400000);}
function emSchCheck(sch,at){
 var r={ok:false,why:"",t:"",b:""},tod=at||today();
 if(!Array.isArray(sch)||sch.length!==3||sch.some(function(x){return !x||parseYmd(x)==null;})){r.why="missing";r.t="Choose three send dates";r.b="One for each email.";return r;}
 if(sch[0]<tod){r.why="past";r.t="The first send date has passed";r.b="Choose today or a day ahead, so the plan is made before the sending.";return r;}
 if(!(sch[0]<sch[1]&&sch[1]<sch[2])){r.why="order";r.t="The dates must be in order";r.b="Email 1, then 2, then 3, each on a later day.";return r;}
 if(emDays(sch[0],sch[1])<2||emDays(sch[1],sch[2])<2){r.why="gap";r.t="Leave at least two days between emails";r.b="Closer than that is hard to tell apart and tires your readers.";return r;}
 var w={from:sch[0],to:addDays(sch[2],EMTAIL),readOn:addDays(sch[2],EMTAIL+1)};r.w=w;
 if(rvCur()){
  if(sch[0]<rvStart()){r.why="beforestart";r.t="That is before your sprint began";r.b="Your sprint began on "+dayLab(rvStart())+".";return r;}
  if(w.to>rvEnd()){r.why="toolate";r.t="That runs past the end of your update window";r.b="Your sequence and the "+EMTAIL+" days of watching afterwards would end on "+dayLab(w.to)+", after your update window closes on "+dayLab(rvEnd())+". Send sooner, or plan it for your next sprint.";return r;}
  if(w.to>rvDay30())r.prov=true;
 }
 r.ok=true;return r;
}
function emDraftCheck(m){
 var txt=[m.hook,m.val,m.ask].join(" ").trim(),words=txt?txt.split(/\s+/).length:0,issues=[];
 if(!m.subj.trim())issues.push("It needs a subject line.");else if(m.subj.length>60)issues.push("The subject line is long. Under about 60 characters shows in full on a phone.");
 if(m.subj&&m.subj===m.subj.toUpperCase()&&/[A-Z]{4}/.test(m.subj))issues.push("Avoid writing the subject line in capitals.");
 if(!m.ask.trim())issues.push("It needs one clear ask.");
 if(words<30)issues.push("It is very short. A few more sentences help the reader decide.");else if(words>250)issues.push("It is long for one ask. Under about 200 words is easier to read.");
 if(/(guarantee|get rich|earn \$|earn £|100% (safe|sure))/i.test(txt))issues.push("Avoid promises you cannot keep, such as guarantees or income claims.");
 return {words:words,issues:issues,ok:issues.length===0};
}
function emCompose(m){var p=[];if(m.hook.trim())p.push(m.hook.trim());if(m.val.trim())p.push(m.val.trim());if(m.ask.trim())p.push(m.ask.trim());if(m.ps.trim())p.push("P.S. "+m.ps.trim());return p.join("\n\n");}
function emReady(){
 var E=S.em,m=[];
 if(E.cm)return {ok:false,done:true,miss:[]};
 if(emListCheck().k!=="ready")m.push("Your list check answers are not all yes yet (Week 1, step 3)");
 if(!E.of.product.trim())m.push("The one offer (Week 1, step 4)");
 if(!E.of.trk)m.push("How you will count orders (Week 1, step 4)");
 [0,1,2].forEach(function(i){var c=emDraftCheck(E.mk[i]);if(!E.mk[i].subj.trim()||!E.mk[i].ask.trim()||!(E.mk[i].hook.trim()||E.mk[i].val.trim()))m.push("Email "+(i+1)+" needs a subject, some words and one ask (Week 2, step "+(i+2)+")");});
 if(EMTICKS.some(function(x){return E.ticks[x[0]]!==true;}))m.push("All six checks ticked (step 5)");
 var sc=emSchCheck(E.sch);if(!sc.ok)m.push("Valid send dates (step 5): "+sc.t);
 return {ok:m.length===0,done:false,miss:m,sc:sc};
}
function emCommit(){
 var E=S.em,r=emReady();if(!r.ok)return false;
 E.cm={at:today(),sch:E.sch.slice(0,3),mk:E.mk.map(function(m){return {subj:m.subj,hook:m.hook,val:m.val,ask:m.ask,ps:m.ps};}),trk:E.of.trk,ref:E.of.ref,what:E.of.product.trim().slice(0,200)};
 return true;
}
function emSent(){return S.em.sd.filter(function(x){return !!x.d;});}
function emWin(){
 var E=S.em;if(!E.cm)return null;var sd=emSent();
 var last=sd.length?sd.map(function(x){return x.d;}).sort().slice(-1)[0]:E.cm.sch[2],first=sd.length?sd.map(function(x){return x.d;}).sort()[0]:E.cm.sch[0];
 return {from:first,to:addDays(last,EMTAIL),readOn:addDays(last,EMTAIL+1),allSent:sd.length===3};
}
function emConfKind(k){return EMCONF.filter(function(x){return x[0]===k;})[0]||null;}
function emConfMajor(c){return c.k==="other"?c.maj===true:!!emConfKind(c.k);}
function emConfs(asOf){
 var E=S.em,w=emWin(),r={major:[],minor:[],outside:[]};
 E.cf.forEach(function(c){
  if(c.wd&&(!asOf||c.wd<=asOf))return;if(asOf&&c.at>asOf)return;
  var lo=E.cm?addDays(E.cm.sch[0],-7):"";
  if(!w||c.d<lo||c.d>w.to){r.outside.push(c);return;}
  (emConfMajor(c)?r.major:r.minor).push(c);
 });
 return r;
}
function emNums(asOf){
 var E=S.em,known=!(asOf&&(!E.res.at||E.res.at>asOf)),o={};
 ["clicks","orders","rev","unsub","compl"].forEach(function(k){o[k]=known?{s:E.res[k].s,v:E.res[k].v}:{s:"",v:""};});
 return o;
}
function emRecip(){var n=emSent().map(function(x){return emN(x.n);});if(n.length<3||n.some(function(x){return x===null;}))return null;return Math.min.apply(null,n);}
function emVerdict(asOf){
 var E=S.em,cm=E.cm,small="One sequence to one list is a small test. It shows what happened, not what will always happen.";
 var fin=function(v,c){v.conf=c;return v;};
 if(!cm)return fin(vmk("Insufficient evidence","info","M1",["No sequence is scheduled yet, so there is nothing to read."],["This says nothing about your list or your offer, because nothing has been tested."],["Finish Week 2 and commit your three emails."]),"none");
 var w=emWin(),t=asOf||today();
 if(!w.allSent||t<w.readOn)return fin(vmk("Insufficient evidence","info","M2",[w.allSent?"Your three emails have gone out, and people can still respond until "+dayLab(w.to)+".":"Not all three emails are logged as sent yet."],["A result read before people have had time to respond would be a guess."],[w.allSent?"Wait until "+dayLab(w.readOn)+", then record your numbers.":"Send the rest of your sequence and log each send. Resist changing the offer meanwhile."]),"none");
 var nm=emNums(asOf),clicks=emN(nm.clicks),orders=emN(nm.orders),rc=emRecip();
 if(clicks===null||orders===null||rc===null||cm.trk==="none"){
  var why=[];if(clicks===null)why.push("Clicks are not recorded.");if(orders===null)why.push("Orders are not recorded.");if(rc===null)why.push("A recipient count is missing from your send log.");if(cm.trk==="none")why.push("You said you could not track orders to these emails.");
  return fin(vmk("Mixed or unclear","warn","M3",why,["Without these the sequence cannot be read. A number you could not see is kept as unknown, and is never read as zero.","If orders cannot be traced to the emails, we cannot say whether they brought any."],["Record what you can see in your email tool and your orders. For next time, use a link or a code that only this sequence uses."]),"unclear");
 }
 var nums="Sent to at least "+rc+" people each time. Tracked clicks: "+clicks+". Orders: "+orders+".";
 if(rc<EMMINRECIP)return fin(vmk("Insufficient evidence","info","M4",[nums,"Fewer than "+EMMINRECIP+" people received at least one of the emails."],["That list is too small to read a result from. A few people either way changes everything.","The minimum used, "+EMMINRECIP+" recipients, and about "+EMCONFRECIP+" for a confident reading, are provisional starting points that will be reviewed against real results."],["Grow your list a little first, or repeat to a larger group."]),"none");
 var cf=emConfs(asOf),cav=emCaveats(rc,orders,nm);
 if(cf.major.length){
  return fin(vmk("Mixed or unclear","warn","M5",[nums,"You logged "+cf.major.length+" major thing"+(cf.major.length===1?"":"s")+" around your sequence that could also explain the numbers: "+cf.major.map(function(c){return (emConfKind(c.k)||["","?"])[1].toLowerCase();}).join("; ")+"."],["Because something else changed or happened, the numbers cannot be put down to your sequence alone. Even with orders, this would not be called promising.",small].concat(cav.lines),["Write down what happened and when. For a cleaner answer, send again with nothing else changing."]),"unclear");
 }
 if(orders>0)return fin(vmk("Promising","ok","M6",[nums],["What you can see is orders after your sequence. That is not the same as proof that your emails caused them. Some of these people may have bought anyway.",small,"This is encouraging. It is not proof."].concat(cav.lines),["Repeat to a new group, or improve one thing and send again, and compare."]),cav.conf);
 if(clicks>=EMMINCLICKS)return fin(vmk("Traffic but no sales","warn","M7",[nums,"People clicked through, and you confirmed no orders."],["This shows interest reached your page. It does not show why nobody bought.",small].concat(cav.lines),["Look at what people saw after clicking: the page, the price and the offer. Change one of those, then send again."]),cav.conf);
 if(rc<EMCONFRECIP)return fin(vmk("Insufficient evidence","info","M8",[nums,"With a list this size, few clicks and no orders are within what chance could produce."],["This does not mean your emails or your offer did not work. There were too few people to tell, so the evidence is limited.",small].concat(cav.lines),["Repeat to a larger group, or improve one thing and send again, before deciding anything."]),"limited");
 return fin(vmk("Approach needs reviewing","warn","M8",[nums,"Few people clicked and nobody ordered, from a list of a reasonable size."],["This does not mean the idea is wrong. One sequence is one try.",small].concat(cav.lines),["Try changing one thing next: the subject lines, the offer, or who you send to."]),cav.conf);
}
function emCaveats(rc,orders,nm){
 var lines=[],conf="fair";
 if(rc<EMCONFRECIP){conf="limited";lines.push("Your list was about "+rc+" people. Below about "+EMCONFRECIP+" recipients, a few people either way can change the picture, so this is too limited to support a confident conclusion. Treat it as a hint.");}
 if(orders<EMSMALLORD&&orders>0){if(conf==="fair")conf="lower";lines.push("Orders are a very small count ("+orders+"). One or two orders are well within chance.");}
 var u=emN(nm.unsub),c=emN(nm.compl);
 if(c!==null&&c>0)lines.push("You recorded "+c+" spam complaint"+(c===1?"":"s")+". Please review whether everyone on your list really agreed to hear from you before you send again.");
 if(u!==null&&u>0)lines.push("You recorded "+u+" unsubscribe"+(u===1?"":"s")+". That is normal and healthy. It is counted apart from sales.");
 return {conf:conf,lines:lines};
}
function emSnap(kind){
 var asOf=null,late=false,prov=false;
 if(kind==="day30"&&rvCur()){if(rvPhase()==="during")prov=true;else asOf=rvDay30();}
 if(asOf){var w=emWin();if(w&&w.to>asOf)prov=true;if(S.em.res.at&&S.em.res.at>asOf)late=true;}
 var v=emVerdict(asOf||null);
 return {at:today(),label:v.label,rule:v.rule,ctr:{msgs:0,resp:0,opp:0},res:{},kind:kind==="day30"?"day30":"update",asOf:asOf||"",late:late,prov:prov||v.rule==="M2"};
}
function emHasWork(){var E=S.em;return !!E.cm||E.sd.some(function(x){return !!x.d;})||E.cf.length>0||["clicks","orders","rev","unsub","compl"].some(function(k){return !!E.res[k].s;});}
function emFresh(prep){var e=EMDEF();if(prep)e.prep=prep;return e;}
function emStart(){var prep=S.em.prep;S.em=emFresh(prep);var pn=String(S.focus.product||"").trim();if(pn)S.em.of.product=pn.slice(0,120);}
function emRec(v){
 var l=v.label,r=v.rule,t,b,f,x="",bs,as;
 if(l==="Promising"){t="Repeat it to a new group, then compare";b="Orders came after your sequence. Sending the same three emails to a new group shows whether it was a pattern.";f="Pick a fresh group from your list who did not get this sequence, and use the same link or code.";bs="Orders were recorded after the sequence, with no major confounder logged.";as="We are assuming your emails, not something else, led to those orders. Your numbers cannot prove that.";}
 else if(l==="Traffic but no sales"){t="Improve what people see after the click";b="People clicked, so the emails did their job. The next place to look is the page, the price or the offer.";f="Choose one of the page, the price or how the offer is described, change only that, and send again.";bs="Tracked clicks reached the threshold and no orders were confirmed.";as="We are assuming the page and offer, rather than the emails, are the weak point. Your numbers cannot confirm that.";}
 else if(l==="Approach needs reviewing"){t="Change one thing, then send again";b="Few people clicked from a list of a reasonable size. That is one try, not the end of the idea.";f="Change one thing: the subject lines, the offer, or who you send to.";x="If your list is the constraint, Partnership-to-Sales is open now and can widen who you reach. Find Your Buyers is open now too.";bs="Few clicks and no orders from a list of at least "+EMCONFRECIP+" people.";as="We are assuming the subject lines and offer were what to change. Your list may simply not be ready to buy.";}
 else if(l==="Mixed or unclear"){t="Send again with steady conditions";b="Something else changed, or the numbers could not be traced to your sequence, so it cannot be read cleanly.";f=r==="M3"?"Record the missing numbers, and use a link or code only this sequence uses next time.":"Write down what else happened, then send again with nothing else changing.";bs=r==="M3"?"Some key numbers or the tracking were missing.":"Something else could explain the numbers.";as="We are assuming nothing else needed to be considered. If something did, please log it.";}
 else{t=(r==="M4"||r==="M8")?"Reach more people first":"Wait for your sequence to finish";b=(r==="M4"||r==="M8")?"There were too few people to read a result. That says nothing about your emails, only that the numbers are small.":"Your result cannot be read yet.";f=(r==="M1")?"Finish Week 2 and commit your three emails.":(r==="M2"?"Send the rest, log each send, and come back after the watching period.":"Repeat to a larger group before deciding anything.");x=(r==="M4"||r==="M8")?"Partnership-to-Sales is open now and can widen who you reach. You are free to choose it, or another experiment when more open.":"";bs=(r==="M4"||r==="M8")?"The list was smaller than the provisional minimum, or the evidence is limited.":"There is not enough yet to read.";as="We are assuming a larger group will give a steadier picture.";}
 return {t:t,b:b,first:f,extra:x,basis:bs,assume:as,provisional:rvPhase()==="during"||r==="M2"};
}
/* ===== EMAIL LOGIC END ===== */

/* --- screens --- */
function emShell(wk,n,body){
 var E=S.em,st=emStepsOf(wk-1),s=st[n-1],dn=emDOf(wk-1)[n],base="#/email/w"+wk;
 var h='<a class="back" href="'+base+'">&larr; Email-to-Sale, Week '+wk+'</a><h1>Week '+wk+' &middot; Step '+n+' of '+st.length+'</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p><p class="mute">You will need: '+esc(s.b)+' Everything saves automatically.</p>'+body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="em-done" data-w="'+wk+'" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<st.length?'<a class="btn ghost" href="'+(wk===1?"#/email/w1/":"#/email/w"+wk+"/")+(n+1)+'">Next step &rarr;</a>':'')+'</div>';
 return h;
}
function emNumRow(path,lab,o,money){
 var opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
 return '<div class="q"><strong>'+esc(lab+(money?" ("+sym(S.focus.currency).trim()+")":""))+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="em-vs" data-p="'+path+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-em="n:'+path+'" value="'+esc(o.v)+'" aria-label="'+esc(lab)+'" style="max-width:160px">':'')+'</div>';
}
function emGet(path){
 var p=String(path).split("."),o=S.em;for(var i=0;i<p.length;i++){if(o==null)return null;o=o[/^\d$/.test(p[i])?+p[i]:p[i]];}return o;
}
var EMVSPATH=/^(ls\.(size|sent30|orders30|rev30)|sd\.[0-2]\.n|res\.(clicks|orders|rev|unsub|compl))$/;
function emHome(wk){
 wk=wk||1;var E=S.em,st=emStepsOf(wk-1),d=rCount(st,emDOf(wk-1)),dn=emDOf(wk-1),base=emWeekBase(wk);
 var h='<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Email-to-Sale</h1><p class="mute">Week '+wk+' of 4: '+esc(EMWKT[wk-1])+'. '+esc(EMWKD[wk-1])+'</p><div class="card"><strong>'+d+' of '+st.length+' steps done</strong><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/st.length*100)+'%"></i></div></div>';
 h+='<div class="card"><h2>The steps</h2>'+st.map(function(s){var x=dn[s.n];return '<a class="step'+(x?' done':'')+'" href="'+base+s.n+'"><span class="n">'+(x?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(x?"Done":"Open")+'</span></a>';}).join("")+'</div>';
 return h;
}
function em1s1(){
 return emShell(1,1,LC("em1s1.lesson")+'<div class="card"><h2>Quick check</h2>'+EMQUIZ.map(function(q){var sel=S.em.quizq?S.em.quizq[q[0]]:"";return '<div class="q"><strong>'+esc(q[1])+'</strong><div class="row" style="flex-direction:column;align-items:stretch">'+q[2].map(function(o){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(UI.emq&&UI.emq[q[0]]===o[0])+'" data-a="em-q" data-q="'+q[0]+'" data-v="'+o[0]+'">'+esc(o[1])+'</button>';}).join("")+'</div>'+(UI.emq&&UI.emq[q[0]]?'<div class="note '+(UI.emq[q[0]]===q[3]?"ok":"info")+'" aria-live="polite">'+(UI.emq[q[0]]===q[3]?"Good. ":"Have another look. ")+esc(q[4])+'</div>':'')+'</div>';}).join("")+'</div>');
}
var EMQUIZ=[["a","You have a small list of 60 people who all agreed to hear from you. Is it big enough to learn from?",[["a1","No, lists under 1,000 are useless"],["a2","Yes, as a first small test, as long as you treat the result as a hint"],["a3","Only if you buy more addresses"]],"a2","A small, consented list is a good place to learn. Just read the result as a hint, not proof. Never buy addresses."],["b","Which is the best single thing to ask for in each email?",[["b1","Three different things, so there is something for everyone"],["b2","One clear thing"],["b3","Nothing, just be friendly"]],"b2","One clear ask per email makes it easy to act, and easy to count."]];
function em1s2(){
 var E=S.em,h=LC("em1s2.lesson")+'<div class="card"><h2>Your list</h2>'+emNumRow("ls.size","People on the list you would email",E.ls.size);
 h+='<label>How did most of these people join?</label><div class="row">'+[["signup","A sign-up form"],["freebie","A free download"],["customers","They bought from me"],["event","An event or class"],["other","Another way"]].map(function(x){return '<button type="button" class="chip" aria-pressed="'+(E.ls.src===x[0])+'" data-a="em-src" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>';
 h+='<label for="emlast">The last time you emailed this list (optional)</label><input id="emlast" type="date" data-em="ls.last" value="'+esc(E.ls.last)+'" max="'+esc(today())+'" style="max-width:200px"></div>';
 h+='<div class="card"><h2>Where you start (the last 30 days)</h2><p class="mute">This is your starting point. If you cannot see a number, say so, and it is kept as unknown. It is never read as zero.</p>'+emNumRow("ls.sent30","Emails you sent to this list",E.ls.sent30)+emNumRow("ls.orders30","Orders you can trace to emails",E.ls.orders30)+emNumRow("ls.rev30","Revenue you can trace to emails",E.ls.rev30,true)+'</div>';
 return emShell(1,2,h);
}
function em1s3(){
 var E=S.em,h=LC("em1s3.lesson")+'<div class="card"><h2>Five honest questions</h2>';
 EMCK.forEach(function(x){h+='<div class="q"><strong>'+esc(x[1])+'</strong><div class="row">'+[["yes","Yes"],["no","No"],["unsure","Not sure"]].map(function(o){return '<button type="button" class="chip sm" aria-pressed="'+(E.ck[x[0]]===o[0])+'" data-a="em-ck" data-k="'+x[0]+'" data-v="'+o[0]+'">'+o[1]+'</button>';}).join("")+'</div></div>';});
 var r=emListCheck();h+='<div class="note '+(r.k==="ready"?"ok":(r.k==="open"?"info":"warn"))+'"><strong>'+esc(r.t)+'.</strong> '+esc(r.b)+'</div><p class="mute">This is general guidance, not legal advice, and answering yes is not confirmation that you meet the law. The rules about emailing people are in the Privacy and Electronic Communications Regulations and UK GDPR. The Sales Lab never sends emails for you: you send from your own tool.</p><div class="note warn">Draft wording. It will be checked against UK data protection and e-privacy requirements before launch.</div></div>';
 return emShell(1,3,h);
}
function em1s4(){
 var E=S.em,h=LC("em1s4.lesson")+'<div class="card"><h2>Your one offer</h2><label for="emp">What are you inviting people to buy?</label><input id="emp" type="text" maxlength="120" data-em="of.product" value="'+esc(E.of.product)+'">'+(String(S.focus.product||"").trim()&&E.of.product===String(S.focus.product).trim().slice(0,120)?'<p class="mute">Pre-filled from your product details. Please check it.</p>':'')+'<label for="emw">Who on your list is it for?</label><input id="emw" type="text" maxlength="200" data-em="of.who" value="'+esc(E.of.who)+'" placeholder="For example: everyone who downloaded the free planner"><label for="emg">What do you hope happens, in a sentence?</label><input id="emg" type="text" maxlength="200" data-em="of.goal" value="'+esc(E.of.goal)+'"></div>';
 h+='<div class="card"><h2>How will you count orders?</h2><div class="row" style="flex-direction:column;align-items:stretch">'+[["link","A link that only this sequence uses"],["code","A discount or order code that only this sequence uses"],["none","I cannot track it yet"]].map(function(x){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(E.of.trk===x[0])+'" data-a="em-trk" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>';
 if(E.of.trk==="none")h+='<div class="note warn">That is honest, and it means your result will be read as unclear, because orders cannot be traced to the emails. A link or a code takes a few minutes to set up.</div>';
 else if(E.of.trk)h+='<label for="emr">The link or code (optional, only you see this)</label><input id="emr" type="text" maxlength="200" data-em="of.ref" value="'+esc(E.of.ref)+'">';
 return emShell(1,4,h+'</div>');
}
function emSummary1(){
 var E=S.em,r=emListCheck();
 return '<div class="card"><h2>Your Week 1 summary</h2><div class="crow"><span>List size</span><strong>'+esc(emFmt(E.ls.size))+'</strong></div><div class="crow"><span>List check</span><strong>'+esc(r.t)+'</strong></div><div class="crow"><span>Your offer</span><strong>'+esc(E.of.product||"Not chosen")+'</strong></div><div class="crow"><span>Counting orders</span><strong>'+esc({link:"A link",code:"A code",none:"Not yet"}[E.of.trk]||"Not chosen")+'</strong></div><h3>Your decision</h3>'+[["next","Ready for Week 2"]].map(function(x){return '<p><button type="button" class="chip" aria-pressed="'+(E.dec===x[0])+'" data-a="em-dec" data-w="1" data-v="'+x[0]+'">'+x[1]+'</button></p>';}).join("")+'</div>';
}
function em1s5(){return emShell(1,5,LC("em1s5.lesson")+emSummary1());}
function em2s1(){return emShell(2,1,LC("em2s1.lesson"));}
function emDraft(i,wk,n){
 var E=S.em,m=E.mk[i],lk=!!E.cm,c=emDraftCheck(m),pre=EMDRAFTHINT[i];
 var h=LC("em2s"+(i+2)+".lesson")+'<div class="card"><h2>Email '+(i+1)+'</h2><label for="emS'+i+'">Subject line</label><input id="emS'+i+'" type="text" maxlength="100" data-em="mk.'+i+'.subj" value="'+esc(m.subj)+'"'+(lk?' readonly':'')+'><label for="emH'+i+'">The opening: a line that sounds like you</label><textarea id="emH'+i+'" maxlength="400" style="min-height:70px" data-em="mk.'+i+'.hook"'+(lk?' readonly':'')+' placeholder="'+esc(pre[0])+'">'+esc(m.hook)+'</textarea><label for="emV'+i+'">The useful part</label><textarea id="emV'+i+'" maxlength="600" style="min-height:90px" data-em="mk.'+i+'.val"'+(lk?' readonly':'')+' placeholder="'+esc(pre[1])+'">'+esc(m.val)+'</textarea><label for="emA'+i+'">The one ask</label><textarea id="emA'+i+'" maxlength="300" style="min-height:60px" data-em="mk.'+i+'.ask"'+(lk?' readonly':'')+' placeholder="'+esc(pre[2])+'">'+esc(m.ask)+'</textarea><label for="emP'+i+'">A P.S. (optional)</label><input id="emP'+i+'" type="text" maxlength="300" data-em="mk.'+i+'.ps" value="'+esc(m.ps)+'"'+(lk?' readonly':'')+'></div>';
 h+='<div class="card"><h2>Your email, as it will read</h2><p><strong>'+esc(m.subj||"(no subject yet)")+'</strong></p><p style="white-space:pre-wrap">'+esc(emCompose(m)||"Start writing above.")+'</p><p class="mute">'+c.words+' words. Remember to add your tracked link or code, and the unsubscribe link your email tool provides.</p>'+(c.issues.length?'<div class="note info"><strong>Worth another look:</strong><ul>'+c.issues.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>':(m.subj||m.ask?'<div class="note ok">That reads well for one email.</div>':''))+'</div>';
 return emShell(wk,n,h);
}
var EMDRAFTHINT=[["Hi, it has been a while. I have been working on something I think you will like.","Say what it is, who it is for, and one result or reason it helps.","Invite them to look, using your tracked link."],["Last week I shared something. Here is why I made it.","One true story or result that shows why it is worth their time.","Invite them again, with the tracked link."],["This closes on [a real date].","A short reminder of what they get, and the real deadline or limit.","A final invitation with the tracked link."]];
function em2s2(){return emDraft(0,2,2);}
function em2s3(){return emDraft(1,2,3);}
function em2s4(){return emDraft(2,2,4);}
function em2s5(){
 var E=S.em,lk=!!E.cm,h=LC("em2s5.lesson");
 if(lk)return emShell(2,5,h+emPlanLog());
 h+='<div class="card"><h2>Six checks</h2><p class="mute">Tick each one when it is true.</p>'+EMTICKS.map(function(t){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(E.ticks[t[0]]===true)+'" data-a="em-tick" data-k="'+t[0]+'">'+esc(t[1])+'</button></p>';}).join("")+'<p><strong>'+EMTICKS.filter(function(t){return E.ticks[t[0]]===true;}).length+' of 6 ticked.</strong></p></div>';
 h+='<div class="card"><h2>When will you send each one?</h2>'+[0,1,2].map(function(i){return '<label for="emD'+i+'">Email '+(i+1)+'</label><input id="emD'+i+'" type="date" data-em="sch.'+i+'" value="'+esc(E.sch[i])+'" min="'+esc(today())+'" style="max-width:200px">';}).join("");
 var sc=emSchCheck(E.sch);
 if(sc.ok){h+='<div class="crow"><span>You will be watching until</span><strong>'+esc(dayLab(sc.w.to))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(sc.w.readOn))+'</strong></div>';if(sc.prov)h+='<div class="note info">Your watching period runs past Day 30, so your Day 30 position will be provisional, and the rest is recorded as a post-sprint update in your 14 day update window.</div>';}
 else if(E.sch.some(function(x){return !!x;}))h+='<div class="note '+(sc.why==="missing"?"info":"warn")+'"><strong>'+esc(sc.t)+'.</strong> '+esc(sc.b)+'</div>';
 h+='</div>';
 var r=emReady();
 h+='<div class="card"><h2>Ready to commit?</h2>';
 if(r.ok)h+='<div class="note ok"><strong>Everything is in place.</strong></div>';else h+='<div class="note warn"><strong>Not quite yet. Still needed:</strong><ul>'+r.miss.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 if(UI.emc&&r.ok)h+='<div class="note info" aria-live="polite"><strong>Commit and lock your plan?</strong> Your three emails, your offer, how you will count orders and your dates will be locked and dated.</div><div class="row"><button type="button" class="btn" data-a="em-commit">Yes, commit and lock</button><button type="button" class="btn ghost" data-a="em-cancel">Not yet</button></div>';
 else h+='<p><button type="button" class="btn"'+(r.ok?'':' disabled')+' data-a="em-confirm">Commit my plan</button></p>';
 return emShell(2,5,h+'</div>');
}
function emPlanLog(){
 var E=S.em,c=E.cm;if(!c)return "";
 return '<div class="card"><h2>Your plan</h2><p class="mute">Committed on '+esc(dayLab(c.at))+'. This record is locked.</p><div class="crow"><span>Offer</span><strong>'+esc(c.what)+'</strong></div><div class="crow"><span>Counting orders</span><strong>'+esc({link:"A link",code:"A code",none:"Not yet"}[c.trk]||"")+'</strong></div>'+c.sch.map(function(d,i){return '<div class="crow"><span>Email '+(i+1)+'</span><strong>'+esc(dayLab(d))+(c.mk[i].subj?': '+esc(c.mk[i].subj):'')+'</strong></div>';}).join("")+'</div>';
}
function emStatus(){
 var E=S.em,w=emWin();if(!E.cm)return '<div class="note warn"><strong>No plan is committed yet.</strong> Week 2 finishes with committing your three emails. <a href="#/email/w2/5">Go to Week 2, step 5</a></div>';
 var sd=emSent().length;
 return '<div class="card"><h2>Where you are</h2><div class="crow"><span>Emails logged as sent</span><strong>'+sd+' of 3</strong></div><div class="crow"><span>Watching until</span><strong>'+esc(dayLab(w.to))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(w.readOn))+'</strong></div>'+(w.allSent&&today()<w.readOn?'<div class="note info">All three have gone out. People can still respond, so please do not read your numbers as a result yet.</div>':'')+(rvCur()&&w.to>rvDay30()?'<div class="note info">Your watching period runs past Day 30, so your Day 30 position will be provisional, and the rest is recorded as a post-sprint update until '+esc(dayLab(rvEnd()))+'.</div>':'')+'</div>';
}
function em3s1(){return emShell(3,1,LC("em3s1.lesson")+emPlanLog()+emStatus());}
function em3s2(){
 var E=S.em,h=LC("em3s2.lesson");
 if(!E.cm)return emShell(3,2,h+emStatus());
 h+='<div class="card"><h2>Your send log</h2><p class="mute">Record each email when it goes out. The date cannot be before you committed, or in the future.</p>';
 [0,1,2].forEach(function(i){var x=E.sd[i];h+='<h3>Email '+(i+1)+(E.cm.mk[i].subj?': '+esc(E.cm.mk[i].subj):'')+'</h3><p class="mute">Planned for '+esc(dayLab(E.cm.sch[i]))+'.</p><label for="emsd'+i+'">The day you sent it</label><input id="emsd'+i+'" type="date" data-em="sd.'+i+'.d" value="'+esc(x.d)+'" min="'+esc(E.cm.at)+'" max="'+esc(today())+'" style="max-width:200px">'+(x.d?emNumRow("sd."+i+".n","How many people it went to",x.n):'');});
 return emShell(3,2,h+'</div>'+emStatus());
}
function emConfHtml(){
 var E=S.em,h="";if(!E.cf.length)return '<p class="mute">Nothing logged. That is a fine answer if nothing changed.</p>';
 E.cf.slice().sort(function(a,b){return a.d<b.d?-1:(a.d>b.d?1:a.id-b.id);}).forEach(function(c){var w=emWin(),inw=w&&E.cm&&c.d>=addDays(E.cm.sch[0],-7)&&c.d<=w.to,mj=emConfMajor(c),wd=!!c.wd,k=emConfKind(c.k);h+='<div class="crow" style="display:block'+(wd?';opacity:.6':'')+'"><p><strong>'+esc(dayLab(c.d))+'</strong>: '+esc(k?k[1]:"")+' <span class="tag">'+(mj?"major":"minor")+'</span>'+(inw?'':' <span class="tag">outside your window, not counted</span>')+(wd?' <span class="tag">withdrawn '+esc(dayLab(c.wd))+'</span>':'')+'</p>'+(c.note?'<p style="white-space:pre-wrap">'+esc(c.note)+'</p>':'')+(wd?'':'<p><button type="button" class="chip sm" data-a="em-fwd" data-id="'+c.id+'">Withdraw this entry</button></p>')+'</div>';});
 return h;
}
function em3s3(){
 var E=S.em,h=LC("em3s3.lesson");if(!E.cm)return emShell(3,3,h+emStatus());
 var u=UI.emf||{};
 h+='<div class="card"><h2>Log something that could also explain your numbers</h2><label for="emfd">The day it happened</label><input id="emfd" type="date" data-em="f:d" value="'+esc(u.d||today())+'" max="'+esc(today())+'" min="'+esc(addDays(E.cm.sch[0],-7))+'" style="max-width:200px">'+EMCONF.map(function(x){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(u.k===x[0])+'" data-a="em-fk" data-v="'+x[0]+'">'+esc(x[1])+'</button></p>';}).join("");
 if(u.k==="other")h+='<label>Could this change your numbers a lot?</label><div class="row"><button type="button" class="chip" aria-pressed="'+(u.maj===true)+'" data-a="em-fmaj" data-v="yes">Yes, it could</button><button type="button" class="chip" aria-pressed="'+(u.maj===false)+'" data-a="em-fmaj" data-v="no">Probably not</button></div>';
 h+='<label for="emfn">A note (optional)</label><textarea id="emfn" maxlength="300" data-em="f:note" style="min-height:60px">'+esc(u.note||"")+'</textarea><p><button type="button" class="btn ghost" data-a="em-fadd">Add to my list</button></p></div>';
 var c=emConfs();h+='<div class="card"><h2>Your list</h2><p><strong>'+c.major.length+' major, '+c.minor.length+' minor</strong> around your sequence.</p>'+emConfHtml()+'</div>';
 return emShell(3,3,h);
}
function em3s4(){
 var E=S.em;return emShell(3,4,LC("em3s4.lesson")+'<div class="card"><h2>Your Week 3 summary</h2><div class="crow"><span>Emails logged as sent</span><strong>'+emSent().length+' of 3</strong></div><div class="crow"><span>Things that could explain the numbers</span><strong>'+(function(){var c=emConfs();return c.major.length+" major, "+c.minor.length+" minor";})()+'</strong></div><h3>Your decision</h3>'+[["next","Ready to read my result in Week 4"]].map(function(x){return '<p><button type="button" class="chip" aria-pressed="'+(E.dec3===x[0])+'" data-a="em-dec" data-w="3" data-v="'+x[0]+'">'+x[1]+'</button></p>';}).join("")+'</div>');
}
function em4s1(){return emShell(4,1,LC("em4s1.lesson")+LC("em4s1.examples"));}
function em4s2(){
 var E=S.em,h=LC("em4s2.lesson");if(!E.cm)return emShell(4,2,h+emStatus());
 h+=rvCur()?rvPostNote():'';
 h+='<div class="card"><h2>Your numbers for the whole sequence</h2><p class="mute">Count from your first send to '+esc(dayLab(emWin().to))+'. Use the link or code only this sequence uses. Unsubscribes and complaints are counted apart from sales.</p>'+emNumRow("res.clicks","Tracked clicks",E.res.clicks)+emNumRow("res.orders","Orders from your link or code",E.res.orders)+emNumRow("res.rev","Revenue from those orders",E.res.rev,true)+emNumRow("res.unsub","Unsubscribes",E.res.unsub)+emNumRow("res.compl","Spam complaints (if your tool shows them)",E.res.compl);
 if(E.res.at)h+='<p class="mute">Last saved '+esc(dayLab(E.res.at))+(rvCur()&&E.res.at>rvDay30()?' <span class="tag">post-sprint update</span>':'')+'.</p>';
 return emShell(4,2,h+'</div>');
}
function em4s3(){
 var E=S.em,h=LC("em4s3.lesson");if(!E.cm)return emShell(4,3,h+emStatus());
 var v=emVerdict(),cl={limited:"Limited. Too limited to support a confident conclusion.",lower:"Lower than usual. See the notes below.",fair:"Fair for a small test.",unclear:"Unclear.",none:""}[v.conf||"none"];
 h+='<div class="card"><h2>Your evidence verdict</h2><div class="note '+v.cls+'"><strong>'+esc(v.label)+'</strong> <span class="tag">rule '+esc(v.rule)+'</span></div>'+(cl?'<p><strong>How much confidence?</strong> <span class="tag">'+esc(cl)+'</span></p>':'')+'<h3>What the numbers show</h3><ul>'+v.why.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>What they cannot show</h3><ul>'+v.limits.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>A reasonable next step</h3><ul>'+v.next.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 h+='<div class="card"><h2>What was considered</h2><div class="crow"><span>Smallest group an email went to</span><strong>'+(emRecip()===null?"not recorded":emRecip())+'</strong></div><div class="crow"><span>Major things logged</span><strong>'+emConfs().major.length+'</strong></div><div class="crow"><span>Provisional settings used</span><strong>At least '+EMMINRECIP+' recipients to read a result, about '+EMCONFRECIP+' for a confident reading</strong></div><p class="mute">These are provisional testing assumptions, not proof of reliability and not a validated benchmark.</p></div>';
 return emShell(4,3,h);
}
function em4s4(){
 var E=S.em,v=emVerdict(),h=LC("em4s4.lesson")+'<div class="card"><h2>Your verdict was: '+esc(v.label)+'</h2><h3>What would you like to do?</h3>'+EMNEXT.map(function(x){return '<p><button type="button" class="chip" aria-pressed="'+(E.nx===x[0])+'" data-a="em-nx" data-v="'+x[0]+'">'+x[1]+'</button></p>';}).join("")+'<h3>Anything else?</h3>'+[["done","I am done with this experiment for now"]].map(function(x){return '<p><button type="button" class="chip" aria-pressed="'+(E.dec4===x[0])+'" data-a="em-dec" data-w="4" data-v="'+x[0]+'">'+x[1]+'</button></p>';}).join("")+'</div>';
 return emShell(4,4,h);
}
function emBlockedNote(){return '<div class="note info">Weeks open in order. Finish the week before it first.</div>';}
function emRouteInner(){
 var m=/^#\/email(?:\/(w[1-4]))?(?:\/([1-5]))?$/.exec(route)||[],n=+(m[2]||0),wk=m[1]?+m[1].slice(1):(n?1:0);
 if(!wk)return emHome(1);
 if(!n)return emHome(wk);
 var F=[null,[0,em1s1,em1s2,em1s3,em1s4,em1s5],[0,em2s1,em2s2,em2s3,em2s4,em2s5],[0,em3s1,em3s2,em3s3,em3s4],[0,em4s1,em4s2,em4s3,em4s4]];
 return F[wk][n]?F[wk][n]():emHome(wk);
}
function emRoute(){
 var m=/^#\/email(?:\/(w[1-4]))?(?:\/([1-5]))?$/.exec(route)||[],wk=m[1]||"",n=+(m[2]||0);
 if(!emActive())return emPrep();
 if(!wk&&!n)return emMySprint();
 var w=wk?+wk.slice(1):1;
 if(w>1&&!emWeekDone(w-2))return '<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Week '+w+' is not open yet</h1><div class="note info">Week '+w+' opens when you finish Week '+(w-1)+'. <a href="#/email/w'+(w-1)+'">Go to Week '+(w-1)+'</a></div>';
 return emRouteInner();
}
function emPrep(){
 var P=S.em.prep,ph=SPR.loaded?rvPhase():"",ready=emPrepReady();
 var h='<a class="back" href="#/experiments">&larr; Experiments</a><h1>Prepare for Email-to-Sale</h1><p class="mute">Get ready first. Nothing on this page starts your 30 days, and nothing here counts as completed experiment activity.</p>';
 h+='<div class="card"><h2>What the experiment is</h2><p>Over four weeks you write a three email sequence for people who already agreed to hear from you. You send it from your own email tool, and count what comes back from a link or code only this sequence uses. You read the result honestly, and decide what is next. The Sales Lab never sends emails for you.</p></div>';
 h+='<div class="card"><h2>The four weeks, in plain words</h2><ol>'+EMWKT.map(function(t,i){return '<li><strong>Week '+(i+1)+': '+esc(t)+'.</strong> '+esc(EMWKD[i])+'</li>';}).join("")+'</ol><p class="mute">About 3 to 5 hours a week. You can read ahead, and you can go at your own pace inside each week.</p></div>';
 h+='<div class="card"><h2>What you need before it can start</h2><p><strong>Do you have an email list of people who agreed to hear from you?</strong></p><div class="row"><button type="button" class="chip" aria-pressed="'+(P.list==="yes")+'" data-a="em-plist" data-v="yes">Yes</button><button type="button" class="chip" aria-pressed="'+(P.list==="no")+'" data-a="em-plist" data-v="no">Not yet</button></div><p style="margin-top:12px"><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(P.tool===true)+'" data-a="em-ptool">I have an email tool I can send from, and it adds an unsubscribe link.</button></p>';
 if(P.list==="no")h+='<div class="note info"><strong>That is fine.</strong> Only email people who agreed to hear from you. A free download or a sign-up form on your own site is the usual way to build one. Come back when you have a list. Your 30 days will not start until then, and you choose when to begin.</div>';
 h+='<p class="mute">The sprint starts only when you press the start button yourself.</p></div>';
 if(!SPR.loaded)h+='<div class="note warn" role="status">We could not check your sprint just now. Please refresh the page.</div>';
 else if(emActive())h+='<div class="note ok">You are already on this experiment. <a href="#/sprint">Open My Sprint</a>.</div>';
 else if(ph==="during")h+='<div class="note info">You already have a sprint running. You can start Email-to-Sale after Day 30, if you wish.</div>';
 else if(ready)h+='<div class="card"><h2>Ready when you are</h2><p>You have a list and a tool. You will check the list properly in Week 1.</p>'+(UI.sprErr?'<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>':'')+sprConfirmX("email",ph==="notstarted"?"Start my 30-day sprint":"Start another sprint")+'</div>';
 else h+='<div class="note info"><strong>Not ready to start yet.</strong> Both are needed: a list of people who agreed to hear from you, and a tool to send from.</div>';
 h+='<div class="card"><h2>Another experiment may suit you better right now</h2><p>You are always free to choose a different experiment.</p><p><strong>Partnership-to-Sales</strong> <span class="tag">open now</span><br><span class="mute">It does not need a list. It borrows other people\'s audiences.</span></p><p><strong>Etsy Sales Bottleneck</strong> <span class="tag">open now</span><br><span class="mute">For sellers with a live Etsy listing.</span></p><p><strong>Show-to-Sell</strong> <span class="tag">open now</span><br><span class="mute">For products that are easy to show in use.</span></p><p><strong>Find Your Buyers</strong> <span class="tag">open now</span><br><span class="mute">For finding where your buyers already spend time, with no audience of your own needed.</span></p><p class="mute">LIVE Sales is coming soon, and is not open yet.</p><p><a class="btn ghost" href="#/experiments">See the experiments, and the sales check</a></p></div>';
 return h;
}
function emMySprint(){
 var wk=emCurWeek(),W=emWeeks()[wk-1];
 var h='<h1>My Sprint</h1><p class="mute">Email-to-Sale &middot; Week '+wk+' of 4</p>'+sprintBar(true);
 h+='<div class="tabs rwpick">'+emWeeks().map(function(w){var g=rSvg("-50 -50 100 100",rWeekG(w.n,w.open,"#fff"));return w.open?'<a class="chip rwb" aria-pressed="'+(w.n===wk)+'" href="#/email/w'+w.n+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+(w.state==="done"?' &#10003;':'')+'</a>':'<button type="button" class="chip rwb" disabled title="Opens when you finish Week '+(w.n-1)+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+'</button>';}).join("")+'</div>';
 h+='<p class="mute"><strong>This week:</strong> '+esc(EMWKD[wk-1])+'</p>'+(wk===1?'<p class="mute">Week 2 opens when you finish Week 1 (choose "Ready for Week 2" in the last step).</p>':'');
 var pn=String(S.focus.product||"").trim();if(pn)h+='<div class="note ok"><strong>Your product:</strong> '+esc(pn)+'</div>';
 h+='<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,emWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
 return h+'<p class="mute"><a href="#/experiments">See all six experiments, and the sales check</a></p>';
}
function emPair(o,money){return emFmt(o,money);}
function emResultsPage(){
 var E=S.em,v=emVerdict(),ph=rvPhase(),started=emStepCount()>0||!!E.cm,sd=emSent().length,h='<div class="phd"><h1>Results</h1><p class="mute">Your numbers, what they show, and what you learned. Counts, not percentages, while samples are small.</p>';
 if(started)h+='<div class="rtally"><div><h3>You did</h3><p><b>'+emStepCount()+'</b>Steps done</p><p><b>'+sd+' of 3</b>Emails sent</p><p><b>'+(E.cm?"1":"0")+'</b>Plan committed</p></div><div><h3>Came back</h3><p><b>'+esc(emFmt(E.res.clicks))+'</b>Tracked clicks</p><p><b>'+esc(emFmt(E.res.unsub))+'</b>Unsubscribes</p><p><b>'+esc(emFmt(E.res.compl))+'</b>Spam complaints</p></div><div><h3>Sold</h3><p><b>'+esc(emFmt(E.res.orders))+'</b>Orders from your link or code</p><p><b>'+esc(emFmt(E.res.rev,true))+'</b>Revenue from those orders</p></div></div>';
 h+='</div><!--/phd--><div class="rcols"><div>';
 h+='<div class="card"><h2>Where you started</h2><p class="mute">The last 30 days before your sprint, from Week 1, step 2. "I can\'t see this" stays unknown and is never turned into zero.</p><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(emFmt(E.ls.size))+'</b>People on your list</div><div class="tile"><b style="font-size:20px">'+esc(emFmt(E.ls.sent30))+'</b>Emails sent</div><div class="tile"><b style="font-size:20px">'+esc(emFmt(E.ls.orders30))+'</b>Orders from email</div></div><p class="mute">Revenue from email: '+esc(emFmt(E.ls.rev30,true))+'.</p></div>';
 h+='<div class="card"><h2>Your sprint so far</h2><p class="mute">'+esc(rvClock())+'</p>';
 if(E.cm){var w=emWin();h+='<p>Your sequence: <strong>'+esc(E.cm.what)+'</strong>, '+sd+' of 3 sent.</p>'+(w?'<p class="mute">Watching until '+esc(dayLab(w.to))+'. Read your numbers from '+esc(dayLab(w.readOn))+'.</p>':'');}
 else h+='<p class="mute">No plan is committed yet. You commit it in <a href="#/email/w2/5">Week 2, step 5</a>.</p>';
 h+='</div>';
 if(started)h+='<section class="rpnl gold rread"><small>What the evidence suggests</small><h2>'+(ph==="during"&&v.rule!=="M2"?"Provisional reading: ":"")+esc(v.label)+'</h2><p>'+esc(v.why[0]||"")+'</p><p class="mute">A reading, not a verdict. An improvement you can see is not proof that your emails caused it. <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</p></section>';
 h+='</div><div class="rside"><div class="card"><h2>Day 30 review</h2>'+(S.rv.done?'<p>Saved on '+esc(dayLab(S.rv.at))+': '+esc(S.rv.snap?S.rv.snap.label:"")+'.</p>':'<p class="mute">'+(started?"Look back at your sprint, see what the evidence suggests, and choose what to focus on next. You can open it at any time.":"Available once your sprint has started.")+'</p>')+'<p><a class="btn'+(S.rv.done?' ghost':'')+'" href="#/review">Open my Day 30 review</a></p></div>';
 var c=emConfs(),learn=[];if(E.cf.length)learn.push("Things that could also explain your numbers: "+c.major.length+" major, "+c.minor.length+" minor");
 if(E.nx){var nx=EMNEXT.filter(function(x){return x[0]===E.nx;})[0];if(nx)learn.push("What you decided next: "+nx[1]);}
 h+='<div class="card"><h2>What you have learned</h2>'+(learn.length?learn.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join(""):'<p class="mute">Your own notes and choices from Weeks 2 to 4 appear here as you go.</p>')+'</div><div class="card"><h2>Past sprints</h2>'+rvPastHtml()+'</div>';
 return h+'</div></div>';
}
function emReviewHead(){
 var E=S.em,v=emVerdict(),rec=emRec(v),ph=rvPhase(),prov=ph==="during"||rec.provisional,sd=emSent().length;
 var h='<a class="back" href="#/results">&larr; Results</a><h1>Your Day 30 review</h1><p class="mute">Email-to-Sale. A look at where you started, what you did, what the evidence suggests, and what to focus on next.</p>'+sprintBar(true);
 h+='<div class="card"><h2>1. Where you started, and where you are now</h2><p class="mute">Your starting numbers are the 30 days before your sprint. Your sequence numbers cover this sequence only. We show them side by side and we do not label the difference as better or worse, because the two are not like for like.</p><div class="crow" style="display:block"><p style="margin:0"><strong>Orders from email</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(emFmt(E.ls.orders30))+'. This sequence: '+esc(emFmt(E.res.orders))+'.</p></div><div class="crow" style="display:block"><p style="margin:0"><strong>Revenue from email</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(emFmt(E.ls.rev30,true))+'. This sequence: '+esc(emFmt(E.res.rev,true))+'.</p></div></div>';
 h+='<div class="card"><h2>2. What you did</h2><p>Steps completed: '+EMWKT.map(function(t,i){return "Week "+(i+1)+" "+rCount(emStepsOf(i),emDOf(i))+" of "+emStepsOf(i).length;}).join(", ")+'.</p><p>Emails sent: '+sd+' of 3. Unsubscribes and complaints are kept apart from sales.</p><div class="note info">You do not need to have finished every step. Anything unfinished stays saved and you can come back to it.</div></div>';
 h+='<div class="card"><h2>3. What the evidence suggests</h2><div class="note '+v.cls+'"><strong>'+(prov?"Provisional reading: ":"")+esc(v.label)+'</strong> <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</div><h3>What the numbers show</h3>'+v.why.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+'<h3>What remains uncertain</h3>'+v.limits.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+'<p style="margin:4px 0">This is a reading, not a verdict. The thresholds behind it are provisional starting points, not guarantees.</p><h3>What to focus on next</h3><div class="note info"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div><p><strong>First small action:</strong> '+esc(rec.first)+'</p>'+(rec.extra?'<p>'+esc(rec.extra)+'</p>':'')+'<p class="mute"><strong>Evidence:</strong> '+esc(rec.basis)+'</p><p class="mute"><strong>Assumption:</strong> '+esc(rec.assume)+'</p></div>';
 return h;
}
function emPastSummary(p){
 if(p.exp!=="email"||!p.emx)return "";
 var x=p.emx,keep=S.em;S.em=x;var h;try{var w=emWin();h=x.cm?'<p class="mute" style="margin:2px 0 6px">Sequence: '+esc(x.cm.what)+', '+emSent().length+' of 3 sent. Tracked clicks '+esc(emFmt(x.res.clicks))+', orders '+esc(emFmt(x.res.orders))+'.</p>':'<p class="mute" style="margin:2px 0 6px">No sequence was committed in this sprint.</p>';}finally{S.em=keep;}
 return h;
}
function emPastFix(x){
 var okd=function(y){return (typeof y==="string"&&(y===""||parseYmd(y)!=null))?y:"";},st=function(y,n){return typeof y==="string"?y.slice(0,n):"";},nm=function(y){return (typeof y==="number"&&isFinite(y)&&y>=0&&y<100000)?Math.floor(y):0;};
 var rvt=rvfix({rv:{snap:x.snap,upd:x.upd,done:!!x.snap}}).rv;
 return {exp:"email",sid:nm(x.sid),auto:x.auto===true,start:okd(x.start),archivedAt:okd(x.archivedAt),label:st(x.label,40),rule:st(x.rule,4),review:x.review===true,snap:rvt.snap,upd:rvt.upd,emx:emfix({em:x.emx}).em};
}
function emArchive(prev){
 var snap=S.rv.snap,auto=false;if(!snap){snap=emSnap("day30");auto=true;}
 var e={exp:"email",sid:prev.id,start:prev.start_day,archivedAt:today(),label:snap.label,rule:snap.rule,review:!!S.rv.done,auto:auto,snap:snap,upd:S.rv.upd.slice(0,20),emx:clone(S.em)};
 S.past=(S.past||[]);if(S.past.length>=10)S.past.shift();S.past.push(e);
}
function pumDraft(){if(!UI.pum)UI.pum={i:-1,res:{clicks:{s:"",v:""},orders:{s:"",v:""},rev:{s:"",v:""},unsub:{s:"",v:""},compl:{s:"",v:""}}};return UI.pum;}
function emPastLate(p,i){
 if(!(UI.pum&&UI.pum.i===i))return '<p><button type="button" class="btn ghost" data-a="pum-open" data-i="'+i+'">Add late email numbers to this sprint</button></p>';
 var u=pumDraft(),h='<p class="mute">Add what you can now see for this earlier sprint. They belong to this sprint only, and do not change your current sprint or the Day 30 position. Leave anything you do not want to change.</p>';
 [["clicks","Tracked clicks"],["orders","Orders from your link or code"],["rev","Revenue from those orders"],["unsub","Unsubscribes"],["compl","Spam complaints"]].forEach(function(k){var o=u.res[k[0]],opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];h+='<div class="q"><strong>'+esc(k[1]+(k[0]==="rev"?" ("+sym(S.focus.currency).trim()+")":""))+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="pum-vs" data-k="'+k[0]+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-pum="'+k[0]+'" value="'+esc(o.v)+'" aria-label="'+esc(k[1])+'" style="max-width:160px">':'')+'</div>';});
 return h+'<p class="row"><button type="button" class="btn" data-a="pum-save">Save as a post-sprint update</button><button type="button" class="btn ghost" data-a="pum-cancel">Cancel</button></p>';
}
function pumAction(a,d){
 var u=UI.pum||null;
 if(a==="pum-open"){var i=+d.i,p=(S.past||[])[i];if(!p||p.exp!=="email"||!p.emx||!pastWinOpen(p))return;UI.pum=null;u=pumDraft();u.i=i;}
 else if(a==="pum-cancel"){UI.pum=null;}
 else if(a==="pum-vs"){u=pumDraft();if(!u.res[d.k]||!ETVS[d.v]||d.v==="")return;var o=u.res[d.k];o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";}
 else if(a==="pum-save"){
  if(!u)return;var p2=(S.past||[])[u.i];if(!p2||p2.exp!=="email"||!p2.emx||!pastWinOpen(p2))return;
  var any=false;Object.keys(u.res).forEach(function(k){var o=u.res[k];if(o.s){any=true;p2.emx.res[k]={s:o.s,v:o.s==="value"?w4Clean(k,o.v):""};}});
  if(!any)return;p2.emx.res.at=today();
  var keep=S.em;S.em=p2.emx;var v;try{v=emVerdict();}finally{S.em=keep;}
  var e={at:today(),label:v.label,rule:v.rule,ctr:{msgs:0,resp:0,opp:0},res:{},kind:"update",asOf:"",late:false,prov:false};
  p2.upd=p2.upd||[];if(p2.upd.length&&p2.upd[p2.upd.length-1].at===e.at)p2.upd[p2.upd.length-1]=e;else if(p2.upd.length<RVMAX)p2.upd.push(e);else return;
  UI.pum=null;save();
 }
 else return;
 render();
}
function pumInput(t){var u=pumDraft(),k=String(t.dataset.pum),o=u.res[k];if(o&&o.s==="value"){var c=w4Clean(k,t.value);o.v=c;if(c!==t.value)t.value=c;}}

/* --- actions and input --- */
function emSetPath(path,val){
 var p=String(path).split("."),o=S.em;for(var i=0;i<p.length-1;i++){o=o[/^\d$/.test(p[i])?+p[i]:p[i]];if(o==null)return false;}
 o[/^\d$/.test(p[p.length-1])?+p[p.length-1]:p[p.length-1]]=val;return true;
}
var EMTXT=/^(of\.(product|who|goal|ref)|mk\.[0-2]\.(subj|hook|val|ask|ps))$/;
function emAddConf(){
 var E=S.em,u=UI.emf||{};if(!E.cm||E.cf.length>=60)return false;
 var d=u.d||today();if(parseYmd(d)==null||d>today()||d<addDays(E.cm.sch[0],-7))return false;
 if(!emConfKind(u.k))return false;if(u.k==="other"&&u.maj!==true&&u.maj!==false)return false;
 E.cf.push({id:E.nid++,d:d,at:today(),k:u.k,maj:u.k==="other"?u.maj===true:true,note:String(u.note||"").trim().slice(0,300),wd:""});UI.emf=null;return true;
}
function emLogDate(i,v){
 var E=S.em;if(!E.cm||!(i>=0&&i<3))return false;
 if(v===""){E.sd[i].d="";E.sd[i].n={s:"",v:""};return true;}
 if(parseYmd(v)==null||v>today()||v<E.cm.at)return false;
 if(rvCur()&&v<rvStart())return false;
 E.sd[i].d=v;return true;
}
function emAction(a,d){
 var E=S.em;
 if(a==="em-done"){var st=[E.steps,E.steps2,E.st3,E.st4][(+d.w)-1];if(!st||!/^[1-5]$/.test(String(d.n))||+d.n>EMSTEPS[(+d.w)-1].length)return;st[d.n]=!st[d.n];save();}
 else if(a==="em-dec"){var w=+d.w;if(w===1&&d.v==="next")E.dec=E.dec===d.v?"":d.v;else if(w===2&&d.v==="next")E.dec2=E.dec2===d.v?"":d.v;else if(w===3&&d.v==="next")E.dec3=E.dec3===d.v?"":d.v;else if(w===4&&d.v==="done")E.dec4=E.dec4===d.v?"":d.v;else return;save();}
 else if(a==="em-q"){UI.emq=UI.emq||{};UI.emq[d.q]=d.v;}
 else if(a==="em-src"){if(EMS.f.ls.f.src.v.indexOf(d.v)<0||d.v==="")return;E.ls.src=E.ls.src===d.v?"":d.v;save();}
 else if(a==="em-ck"){if(!EMCK.some(function(x){return x[0]===d.k;})||["yes","no","unsure"].indexOf(d.v)<0)return;E.ck[d.k]=E.ck[d.k]===d.v?"":d.v;save();}
 else if(a==="em-trk"){if(["link","code","none"].indexOf(d.v)<0||E.cm)return;E.of.trk=E.of.trk===d.v?"":d.v;save();}
 else if(a==="em-vs"){if(!EMVSPATH.test(String(d.p))||!ETVS[d.v]||d.v==="")return;if(/^sd\./.test(d.p)&&!E.cm)return;if(/^res\./.test(d.p)&&!E.cm)return;var o=emGet(d.p);if(!o)return;o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";if(/^res\./.test(d.p))E.res.at=today();save();}
 else if(a==="em-tick"){if(E.cm||!EMTICKS.some(function(t){return t[0]===d.k;}))return;if(E.ticks[d.k])delete E.ticks[d.k];else E.ticks[d.k]=true;save();}
 else if(a==="em-confirm"){if(!emReady().ok)return;UI.emc=true;}
 else if(a==="em-cancel"){UI.emc=false;}
 else if(a==="em-commit"){if(!UI.emc)return;UI.emc=false;if(!emCommit())return;save();}
 else if(a==="em-fk"){if(!emConfKind(d.v))return;UI.emf=UI.emf||{};UI.emf.k=UI.emf.k===d.v?"":d.v;if(UI.emf.k!=="other")delete UI.emf.maj;}
 else if(a==="em-fmaj"){UI.emf=UI.emf||{};if(UI.emf.k!=="other"||(d.v!=="yes"&&d.v!=="no"))return;UI.emf.maj=d.v==="yes";}
 else if(a==="em-fadd"){if(!emAddConf())return;save();}
 else if(a==="em-fwd"){var c=E.cf.filter(function(x){return x.id===+d.id;})[0];if(!c||c.wd)return;c.wd=today();save();}
 else if(a==="em-nx"){if(!EMNEXT.some(function(x){return x[0]===d.v;}))return;E.nx=E.nx===d.v?"":d.v;save();}
 else if(a==="em-plist"){if(d.v!=="yes"&&d.v!=="no")return;E.prep.list=E.prep.list===d.v?"":d.v;if(E.prep.list!=="yes")E.prep.tool=false;save();}
 else if(a==="em-ptool"){if(E.prep.list!=="yes")return;E.prep.tool=!E.prep.tool;save();}
 else return;
 render();
}
function emInput(t){
 var E=S.em,k=String(t.dataset.em);
 if(k==="f:d"){var v=String(t.value||"");UI.emf=UI.emf||{};if(v===""||parseYmd(v)!=null)UI.emf.d=v;return;}
 if(k==="f:note"){UI.emf=UI.emf||{};UI.emf.note=t.value.slice(0,300);return;}
 if(k.indexOf("n:")===0){var p=k.slice(2);if(!EMVSPATH.test(p))return;var o=emGet(p);if(o&&o.s==="value"){var c=w4Clean("n",t.value);o.v=c;if(c!==t.value)t.value=c;if(/^res\./.test(p)&&E.cm)E.res.at=today();save();}return;}
 if(E.cm&&(/^(of|mk)\./.test(k)||/^sch\./.test(k)))return;
 if(EMTXT.test(k)){var n=/ps$|ask$/.test(k)?300:(/subj$/.test(k)?100:(/hook$/.test(k)?400:(/val$/.test(k)?600:200)));if(/^of\.(product)$/.test(k))n=120;emSetPath(k,String(t.value).slice(0,n));save();return;}
 if(/^sch\.[0-2]$/.test(k)){var dv=String(t.value||"");if(dv===""||parseYmd(dv)!=null){emSetPath(k,dv);save();render();}return;}
 if(k==="ls.last"){var lv=String(t.value||"");if(lv===""||(parseYmd(lv)!=null&&lv<=today())){E.ls.last=lv;save();}return;}
 var m=/^sd\.([0-2])\.d$/.exec(k);if(m){if(emLogDate(+m[1],String(t.value||""))){save();render();}return;}
}

/* --- the experiment adapter, for Email-to-Sale (outer wrappers: Email first, then Etsy, then Partnership) --- */
EXPKEY.email="email";EXPOPEN.email=true;
var _rvExp5=rvExp;rvExp=function(){return emActive()?"email":_rvExp5();};
var _xaName5=xaName;xaName=function(){return emActive()?"Email-to-Sale":_xaName5();};
var _xaTotal5=xaTotal;xaTotal=function(){return emActive()?EMTOTAL:_xaTotal5();};
var _xaW45=xaW4;xaW4=function(){return emActive()?"#/email/w4/2":_xaW45();};
var _xaW4S5=xaW4Step;xaW4Step=function(){return emActive()?2:_xaW4S5();};
var _sprHasWork5=sprHasWork;sprHasWork=function(){return emActive()?emHasWork():_sprHasWork5();};
var _rvSnap5=rvSnap;rvSnap=function(k){return emActive()?emSnap(k):_rvSnap5(k);};
var _tabOf5=tabOf;tabOf=function(r){r=r||"#/";if(/^#\/email(\/|$)/.test(r))return emActive()?"sprint":"exp";return _tabOf5(r);};
var _rWeeks5=rWeeks;rWeeks=function(){return emActive()?emWeeks():_rWeeks5();};
var _rTrack5=rTrack;
rTrack=function(){
 if(!emActive())return _rTrack5();
 return '<div class="rweeks">'+emWeeks().map(function(w){var inner='<small>Week '+w.n+'</small><b>'+esc(w.title)+'</b>'+rBars(w)+'<em>'+esc(w.status)+'</em>';return w.open?'<a class="rwk '+w.state+'" href="#/email/w'+w.n+'">'+inner+'</a>':'<div class="rwk later">'+inner+'</div>';}).join("")+'</div>';
};
var _rNext5=rNext;
rNext=function(){
 if(!(emActive()&&(SPR.loaded?rvPhase():"during")==="during"))return _rNext5();
 var wk=emCurWeek(),W=emWeeks()[wk-1],first=W.first;
 if(!first)return {k:"Your next step",t:"Open your results",d:"You have finished every step. Your results, your evidence reading and your Day 30 review are in one place.",link:"#/results",b:"Open my results"};
 var s=W.L[first-1];
 return {k:"Your next step",t:s.t,d:"You will need: "+s.b+" Everything saves as you go.",m:s.m,link:emWeekBase(wk)+first,b:"Continue Week "+wk+", step "+first,w:wk,n:first};
};
var _rHomeList5=rHomeList;
rHomeList=function(nx){
 var ph=SPR.loaded?rvPhase():"during";
 if(!emActive()||ph!=="during")return _rHomeList5(nx);
 var W=emWeeks()[emCurWeek()-1];
 return '<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,emWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
};
var _rSoFar5=rSoFar;
rSoFar=function(){
 if(!emActive())return _rSoFar5();
 var E=S.em,h='<div class="card"><h2>Your sprint so far</h2>';
 if(!emStepCount()&&!E.cm)return h+'<p class="mute">Your numbers appear here once you begin. What you did, what came back and what sold are always kept apart.</p></div>';
 h+='<div class="tiles"><div class="tile"><b>'+emStepCount()+'</b><span>Steps done</span></div><div class="tile"><b>'+emSent().length+' of 3</b><span>Emails sent</span></div><div class="tile"><b aria-hidden="true">'+(E.cm?"&#10003;":"&ndash;")+'</b><span>Plan committed<span class="sr">: '+(E.cm?"yes":"not yet")+'</span></span></div></div>';
 return h+'<p><a class="link" href="#/results">Open your results</a></p></div>';
};
var _home5=home;home=function(){return emActive()?emMySprint():_home5();};
var _resultsPage5=resultsPage;resultsPage=function(){return emActive()?emResultsPage():_resultsPage5();};
var _reviewPage5=reviewPage;
reviewPage=function(){
 if(!emActive())return _reviewPage5();
 var tail=_reviewPage5(),i=tail.indexOf('<div class="card"><h2>4. Complete your review</h2>');
 return emReviewHead()+(i>-1?tail.slice(i):"");
};
var _etBlockP5=etBlockP;etBlockP=function(){return emActive()?/^#\/(step\/[1-7]|w[234]\/[1-6])$/.test(route||""):_etBlockP5();};
var _etBlockHtml5=etBlockHtml;etBlockHtml=function(){return emActive()?_etBlockHtml5().replace("This is your Etsy sprint","This is your email sprint"):_etBlockHtml5();};

/* ---------- Show-to-Sell: show your product in use, with three short demos, and see which demo sells. ----------
   Built on the shared sprint (clock, Home, My Sprint, Results, Day 30 review, update window, Past sprints) through the same
   experiment adapter as the Etsy and Email experiments. One measurable experiment: three demos of one product, published in
   one place, each with its own way of counting sales. The app never posts or publishes anything for the member. */
var STSSTEPS=[
 [{n:1,t:"How showing your product in use helps people buy",m:20,b:"Nothing. A short lesson and a quick check."},
  {n:2,t:"Your product and where you start",m:25,b:"Your shop or payment tool, for the last 30 days."},
  {n:3,t:"Choose one place to show your demos",m:20,b:"The one place where your buyers already look."},
  {n:4,t:"Decide how you will count a sale for each demo",m:30,b:"A link or a code for each demo, so each sale can be traced."},
  {n:5,t:"Week 1 review",m:15,b:"Whatever you have done so far."}],
 [{n:1,t:"What makes a short demo work",m:20,b:"Nothing. A short lesson."},
  {n:2,t:"Plan demo 1",m:40,b:"Your product, and one thing to show."},
  {n:3,t:"Plan demo 2",m:35,b:"Your product, and a different thing to show."},
  {n:4,t:"Plan demo 3",m:35,b:"Your product, and a third thing to show."},
  {n:5,t:"Final checks, publish dates and commit",m:30,b:"Your three demos, made and ready to publish."}],
 [{n:1,t:"Publish, then hold steady",m:15,b:"Nothing. A short read."},
  {n:2,t:"Publish log",m:20,b:"The day each demo went out."},
  {n:3,t:"What else could explain the numbers?",m:20,b:"Anything you remember changing or happening."},
  {n:4,t:"Week 3 review",m:15,b:"Whatever you have done so far."}],
 [{n:1,t:"How to read three small results side by side",m:25,b:"Nothing. A short lesson."},
  {n:2,t:"Record your numbers for each demo",m:35,b:"The place you published, and your orders for each link or code."},
  {n:3,t:"Which demo sold? Your evidence verdict",m:20,b:"The numbers from step 2."},
  {n:4,t:"Decide what is next",m:25,b:"Your verdict."}]
];
var STSWKT=["Prepare","Plan and make","Publish and watch","Read the result"];
var STSWKD=["Get your product, the place you will show it and how you will count sales ready.","Plan and make three short demos, each showing one thing.","Publish them, leave things alone, and note anything else that could matter.","Record your numbers for each demo, read which one sold, and decide what is next."];
var STSTOTAL=18;
/* Provisional testing settings, kept in one place so they can be changed after review against real results. They are not
   validated industry benchmarks and not guarantees. minViews is the least needed to describe a result at all; confViews is where
   a reading becomes steadier. Neither is strong evidence by itself. */
var STSCFG={minViews:50,confViews:300,minClicks:10,smallOrders:3,leadOrders:3,leadGap:2,watchDays:7,unevenViews:2,unevenDays:1.5};
var STSK=["views","clicks","orders","rev"];
var STSCH=[["tiktok","TikTok"],["insta","Instagram"],["youtube","YouTube"],["facebook","Facebook"],["pinterest","Pinterest"],["shop","My shop or product page"],["other","Somewhere else"]];
var STSFMT=[["video","A short video"],["photos","Photos or a carousel"],["screen","A screen recording"],["before","A real before and after"]];
var STSIN=[["people","Another person (their face or voice)"],["place","Someone else's home, shop or private place"],["music","Music or sound I did not make"],["brand","Another brand's logo, product or content"]];
var STSTRK=[["link","A different link for each demo"],["code","A different code for each demo"],["ask","I will ask each buyer which demo they saw"],["none","I cannot track it yet"]];
var STSTRKL={link:"A link for each demo",code:"A code for each demo",ask:"Asking each buyer",none:"Not yet"};
var STSTICKS=[["claims","Each demo shows only what the product really does. Nothing is staged to look better than it is, and there are no promises I cannot keep."],["perm","I have permission for every person, private place, piece of music or other brand that appears."],["track","I have set up how I will count sales for each demo, and tested it."],["same","All three demos offer the same product at the same price."],["plan","I will publish all three in the same place on my chosen dates, and change nothing else in between."],["proof","I understand three demos is a small test and not proof."]];
var STSCONF=[["price","I changed the price"],["promo","I ran a sale or another promotion"],["boost","I paid to boost or advertise one of the demos"],["extra","I published other posts about the same product"],["partner","Someone else shared or reposted one of the demos"],["stock","The product was out of stock, or the page was not working"],["season","A major seasonal or holiday period"],["ext","A mention or press that sent unusual traffic"],["other","Something else"]];
var STSNEXT=[["more","Make more demos like the one with the most orders"],["repeat","Run the same three again, to see if it repeats"],["improve","Change one thing and try three new demos"],["page","Work on my page, price or offer first"],["other","Take what I learned to a different experiment"],["unsure","I am not sure yet"]];
var STSS=(function(){
 var s=function(n){return {t:"s",n:n};},v={t:"v"},b={t:"b"},d={t:"d"},e=function(a){return {t:"e",v:a};};
 var demo={t:"o",f:{one:s(120),fmt:e([""].concat(STSFMT.map(function(x){return x[0];}))),hook:s(200),shown:s(500),ask:s(200),inn:{t:"m",k:/^(people|place|music|brand)$/,i:b},perm:b}};
 return {t:"o",f:{
  prep:{t:"o",f:{prod:e(["","yes","no"]),place:b}},
  steps:{t:"m",k:/^[1-5]$/,i:b},steps2:{t:"m",k:/^[1-5]$/,i:b},st3:{t:"m",k:/^[1-4]$/,i:b},st4:{t:"m",k:/^[1-4]$/,i:b},
  dec:e(["","next"]),dec2:e(["","next"]),dec3:e(["","next"]),dec4:e(["","done"]),
  pr:{t:"o",f:{product:s(120),who:s(200)}},
  bl:{t:"o",f:{orders30:v,rev30:v,posts30:v}},
  wh:{t:"o",f:{ch:e([""].concat(STSCH.map(function(x){return x[0];}))),name:s(120),aud:v}},
  tk:{t:"o",f:{trk:e(["","link","code","ask","none"]),refs:{t:"a",n:3,i:s(200)}}},
  dm:{t:"a",n:3,i:demo},
  ticks:{t:"m",k:/^(claims|perm|track|same|plan|proof)$/,i:b},
  sch:{t:"a",n:3,i:d},
  cm:{t:"c"},
  pb:{t:"a",n:3,i:{t:"o",f:{d:d}}},
  cf:{t:"a",n:60,i:{t:"o",f:{id:{t:"n"},d:d,at:d,k:e(STSCONF.map(function(x){return x[0];})),maj:b,note:s(300),wd:d}}},
  nid:{t:"n"},
  res:{t:"o",f:{d:{t:"a",n:3,i:{t:"o",f:{views:v,clicks:v,orders:v,rev:v}}},at:d}},
  nx:e([""].concat(STSNEXT.map(function(x){return x[0];})))
 }};
})();
function STSDEF(){return emDef(STSS);}
function stsDemoClean(m){return emClean(STSS.f.dm.i,m,emDef(STSS.f.dm.i));}
function stsfix(o){
 var w=(o.sts&&typeof o.sts==="object"&&!Array.isArray(o.sts))?o.sts:{},r=emClean(STSS,w,STSDEF());
 // the confounder list: unique ids, only valid entries, "other" keeps its own severity
 var seen={},maxId=0;r.cf=(Array.isArray(w.cf)?w.cf.slice(0,60):[]).filter(function(x){return x&&typeof x==="object"&&typeof x.id==="number"&&x.id===Math.floor(x.id)&&x.id>0&&x.id<=100000&&typeof x.d==="string"&&parseYmd(x.d)!=null&&typeof x.at==="string"&&parseYmd(x.at)!=null&&STSCONF.some(function(c){return c[0]===x.k;})&&!seen[x.id]&&(seen[x.id]=1);}).map(function(x){if(x.id>maxId)maxId=x.id;return {id:x.id,d:x.d,at:x.at,k:x.k,maj:x.k==="other"?x.maj===true:true,note:typeof x.note==="string"?x.note.slice(0,300):"",wd:(typeof x.wd==="string"&&parseYmd(x.wd)!=null)?x.wd:""};});
 r.nid=Math.max(maxId+1,(typeof w.nid==="number"&&w.nid===Math.floor(w.nid)&&w.nid>0&&w.nid<=100001)?w.nid:1);
 // the committed plan: needs three valid publish dates in order, each on a later day, and a commit date
 var c=w.cm;r.cm=null;
 if(c&&typeof c==="object"&&!Array.isArray(c)&&typeof c.at==="string"&&parseYmd(c.at)!=null&&Array.isArray(c.sch)&&c.sch.length===3&&c.sch.every(function(x){return typeof x==="string"&&parseYmd(x)!=null;})&&c.sch[0]<c.sch[1]&&c.sch[1]<c.sch[2]){
  var st=function(y,n){return typeof y==="string"?y.slice(0,n):"";};
  r.cm={at:c.at,sch:c.sch.slice(0,3),dm:(Array.isArray(c.dm)?c.dm:[]).slice(0,3).map(stsDemoClean),trk:STSS.f.tk.f.trk.v.indexOf(c.trk)>-1?c.trk:"",refs:(Array.isArray(c.refs)?c.refs:[]).slice(0,3).map(function(x){return st(x,200);}),what:st(c.what,200),where:st(c.where,200)};
  while(r.cm.dm.length<3)r.cm.dm.push(stsDemoClean(null));
  while(r.cm.refs.length<3)r.cm.refs.push("");
 }
 o.sts=r;return o;
}
/* ===== SHOW LOGIC START: pure rules, checked by dev/show_e6_tests.js ===== */
function stsN(o){var s=vstate(o);return s==="pos"?+o.v:(s==="zero"?0:null);}
function stsFmt(o,money){var s=vstate(o),c=money?sym(S.focus.currency):"";return s==="pos"?c+String(+o.v):(s==="zero"?c+"0 (confirmed)":"not seen");}
function stsActive(){var c=rvCur();return !!c&&c.experiment==="show";}
function stsPrepReady(){var p=S.sts.prep;return p.prod==="yes"&&p.place===true;}
function stsStepsOf(i){return STSSTEPS[i];}
function stsDOf(i){var E=S.sts;return [E.steps,E.steps2,E.st3,E.st4][i]||{};}
function stsWeekDone(i){var E=S.sts,L=stsStepsOf(i),D=stsDOf(i);return L.every(function(s){return D[s.n];})||[E.dec==="next",E.dec2==="next",E.dec3==="next",E.dec4==="done"][i];}
function stsCurWeek(){for(var i=0;i<4;i++){if(!stsWeekDone(i))return i+1;}return 4;}
function stsWeekBase(w){return w===1?"#/show/":"#/show/w"+w+"/";}
function stsStepCount(){var n=0;for(var i=0;i<4;i++)n+=rCount(stsStepsOf(i),stsDOf(i));return n;}
function stsWeeks(){
 var cur=stsCurWeek(),out=[];
 for(var i=0;i<4;i++){
  var L=stsStepsOf(i),D=stsDOf(i),n=rCount(L,D),tot=L.length,st=(i+1<cur)?"done":(i+1===cur?"now":"later"),first=0;
  if(st==="now"){for(var j=0;j<tot;j++){if(!D[L[j].n]){first=L[j].n;break;}}}
  out.push({n:i+1,title:STSWKT[i],L:L,D:D,done:n,total:tot,state:st,open:i===0||stsWeekDone(i-1),first:first,status:st==="later"?"Opens when you finish Week "+i:(st==="done"&&n===tot?"Done":n+" of "+tot+" steps done")});
 }
 return out;
}
function stsChLabel(k){var c=STSCH.filter(function(x){return x[0]===k;})[0];return c?c[1]:"";}
function stsWhere(){var W=S.sts.wh,l=stsChLabel(W.ch);if(!l)return "";return (l+(W.name.trim()?": "+W.name.trim():"")).slice(0,200);}
function stsDays(a,b){var x=parseYmd(a),y=parseYmd(b);if(x==null||y==null)return 0;return Math.round((y-x)/86400000);}
function stsSchCheck(sch,at){
 var r={ok:false,why:"",t:"",b:""},tod=at||today();
 if(!Array.isArray(sch)||sch.length!==3||sch.some(function(x){return !x||parseYmd(x)==null;})){r.why="missing";r.t="Choose three publish dates";r.b="One for each demo.";return r;}
 if(sch[0]<tod){r.why="past";r.t="The first publish date has passed";r.b="Choose today or a day ahead, so the plan is made before the publishing.";return r;}
 if(!(sch[0]<sch[1]&&sch[1]<sch[2])){r.why="order";r.t="The dates must be in order";r.b="Demo 1, then 2, then 3, each on a later day, so each demo has a day of its own.";return r;}
 var w={from:sch[0],to:addDays(sch[2],STSCFG.watchDays),readOn:addDays(sch[2],STSCFG.watchDays+1)};r.w=w;
 if(rvCur()){
  if(sch[0]<rvStart()){r.why="beforestart";r.t="That is before your sprint began";r.b="Your sprint began on "+dayLab(rvStart())+".";return r;}
  if(w.to>rvEnd()){r.why="toolate";r.t="That runs past the end of your update window";r.b="Your three demos and the "+STSCFG.watchDays+" days of watching afterwards would end on "+dayLab(w.to)+", after your update window closes on "+dayLab(rvEnd())+". Publish sooner, or plan it for your next sprint.";return r;}
  if(w.to>rvDay30())r.prov=true;
 }
 if(stsDays(sch[0],w.to)+1>=STSCFG.unevenDays*(STSCFG.watchDays+1))r.uneven=true;
 r.ok=true;return r;
}
function stsDemoCheck(m){
 var txt=[m.hook,m.shown,m.ask].join(" ").trim(),words=txt?txt.split(/\s+/).length:0,issues=[],notes=[];
 if(!m.one.trim())issues.push("Say the one thing this demo shows.");
 else if(/(\band\b|&|\+|,|;)/i.test(m.one))issues.push("That reads like more than one thing. One thing per demo keeps the comparison clear.");
 if(!(m.hook.trim()||m.shown.trim()))issues.push("Describe what people will see.");
 if(!m.ask.trim())issues.push("It needs one clear ask, such as where to buy.");
 if(words>0&&words<12)issues.push("It is very short. A little more detail makes it easier to film or photograph.");else if(words>180)issues.push("It is long for a short demo. Aim to show one thing in under about a minute.");
 if(/(guarantee|get rich|earn \$|earn £|100% (safe|sure)|cures?\b|miracle|risk[- ]free|best in the world|everyone loves|never fails|instant results)/i.test([m.one,txt].join(" ")))issues.push("Avoid promises you cannot keep, such as guarantees, cures or income claims. Show only what the product really does.");
 if(Object.keys(m.inn).length&&m.perm!==true)issues.push("Something in this demo needs permission. Tick the permission box once you have it, or leave that thing out.");
 if(m.fmt==="before")notes.push("A before and after must be real, of this product, and not edited to look better than it is.");
 return {words:words,issues:issues,notes:notes,ok:issues.length===0};
}
function stsDemoFilled(m){return !!(m.one.trim()&&m.ask.trim()&&(m.hook.trim()||m.shown.trim()));}
function stsReady(){
 var E=S.sts,m=[];
 if(E.cm)return {ok:false,done:true,miss:[]};
 if(!E.pr.product.trim())m.push("The one product you are showing (Week 1, step 2)");
 if(!E.wh.ch)m.push("The one place you will publish (Week 1, step 3)");
 if(!E.tk.trk)m.push("How you will count a sale for each demo (Week 1, step 4)");
 if(E.tk.trk==="link"||E.tk.trk==="code"){var rf=E.tk.refs.map(function(x){return x.trim().toLowerCase();}).filter(function(x){return !!x;});if(rf.some(function(x,i){return rf.indexOf(x)!==i;}))m.push("Each demo needs its own link or code, and two are the same (Week 1, step 4)");}
 [0,1,2].forEach(function(i){
  if(!stsDemoFilled(E.dm[i]))m.push("Demo "+(i+1)+" needs the one thing it shows, what people will see and one ask (Week 2, step "+(i+2)+")");
  else if(Object.keys(E.dm[i].inn).length&&E.dm[i].perm!==true)m.push("Demo "+(i+1)+" shows something that needs permission, and it is not confirmed yet (Week 2, step "+(i+2)+")");
 });
 var ones=E.dm.map(function(x){return x.one.trim().toLowerCase();}).filter(function(x){return !!x;});
 if(ones.some(function(x,i){return ones.indexOf(x)!==i;}))m.push("Each demo should show a different thing, and two are the same (Week 2)");
 if(STSTICKS.some(function(x){return E.ticks[x[0]]!==true;}))m.push("All six checks ticked (step 5)");
 var sc=stsSchCheck(E.sch);if(!sc.ok)m.push("Valid publish dates (step 5): "+sc.t);
 return {ok:m.length===0,done:false,miss:m,sc:sc};
}
function stsCommit(){
 var E=S.sts,r=stsReady();if(!r.ok)return false;
 E.cm={at:today(),sch:E.sch.slice(0,3),dm:E.dm.map(function(m){return stsDemoClean(clone(m));}),trk:E.tk.trk,refs:E.tk.refs.slice(0,3),what:E.pr.product.trim().slice(0,200),where:stsWhere()};
 return true;
}
function stsOut(){return S.sts.pb.filter(function(x){return !!x.d;});}
function stsWin(){
 var E=S.sts;if(!E.cm)return null;var pd=stsOut().map(function(x){return x.d;}).sort();
 var last=pd.length?pd[pd.length-1]:E.cm.sch[2],first=pd.length?pd[0]:E.cm.sch[0];
 var to=addDays(last,STSCFG.watchDays);
 return {from:first,to:to,readOn:addDays(last,STSCFG.watchDays+1),allOut:pd.length===3,spread:stsDays(first,last),days:E.pb.map(function(x){return x.d?stsDays(x.d,to)+1:null;})};
}
/* how long each demo was out by the end of the watching period. Demos go out on different days, so this is never exactly equal. */
function stsExposure(){
 var w=stsWin();if(!w||!w.allOut)return null;var d=w.days,mx=Math.max.apply(null,d),mn=Math.min.apply(null,d);
 return {days:d,max:mx,min:mn,uneven:mx>=STSCFG.unevenDays*mn};
}
function stsConfKind(k){return STSCONF.filter(function(x){return x[0]===k;})[0]||null;}
function stsConfMajor(c){return c.k==="other"?c.maj===true:!!stsConfKind(c.k);}
function stsConfs(asOf){
 var E=S.sts,w=stsWin(),r={major:[],minor:[],outside:[]};
 E.cf.forEach(function(c){
  if(c.wd&&(!asOf||c.wd<=asOf))return;if(asOf&&c.at>asOf)return;
  var lo=E.cm?addDays(E.cm.sch[0],-7):"";
  if(!w||c.d<lo||c.d>w.to){r.outside.push(c);return;}
  (stsConfMajor(c)?r.major:r.minor).push(c);
 });
 return r;
}
function stsNums(asOf){
 var E=S.sts,known=!(asOf&&(!E.res.at||E.res.at>asOf));
 return [0,1,2].map(function(i){var o={};STSK.forEach(function(k){var x=E.res.d[i][k];o[k]=known?{s:x.s,v:x.v}:{s:"",v:""};});return o;});
}
function stsSum(nm,k){var n=0,c=0;nm.forEach(function(x){var y=stsN(x[k]);if(y!==null){n+=y;c++;}});return {n:Math.round(n*100)/100,k:c};}
function stsFmtSum(s,money){var c=money?sym(S.focus.currency):"";if(s.k===0)return "not seen";if(s.k===3)return s.n===0?c+"0 (confirmed)":c+String(s.n);return c+String(s.n)+" from "+s.k+" of 3 demos";}
function stsList(a){return a[0]+", "+a[1]+" and "+a[2];}
function stsDemoName(i){var c=S.sts.cm,o=c&&c.dm[i]?c.dm[i].one.trim():"";return "Demo "+(i+1)+(o?" ("+o+")":"");}
/* which demo sold: a plain comparison of three small counts. A demo is only called ahead when its lead is more than chance alone would easily give. */
function stsCompare(nm){
 var o=nm.map(function(x){return stsN(x.orders);});
 if(o.some(function(x){return x===null;}))return {kind:"unknown",lead:-1,orders:o,line:"Orders are not recorded for every demo, so the three cannot be compared yet."};
 var top=Math.max.apply(null,o),tot=o[0]+o[1]+o[2];
 if(tot===0)return {kind:"none",lead:-1,orders:o,line:"No demo has an order recorded, so there is no difference between them to read."};
 var lead=[0,1,2].filter(function(i){return o[i]===top;}),rest=o.slice().sort(function(a,b){return b-a;}),second=rest[1];
 if(lead.length>1)return {kind:"tie",lead:-1,orders:o,line:(lead.length===3?"All three demos":"Demos "+(lead[0]+1)+" and "+(lead[1]+1))+" had the same number of orders ("+top+" each), so no demo is ahead."};
 var others=[0,1,2].filter(function(i){return i!==lead[0];}).map(function(i){return o[i];});
 if(top>=STSCFG.leadOrders&&top-second>=STSCFG.leadGap)return {kind:"clear",lead:lead[0],orders:o,line:stsDemoName(lead[0])+" had the most orders: "+top+", against "+others[0]+" and "+others[1]+"."};
 return {kind:"ahead",lead:lead[0],orders:o,line:stsDemoName(lead[0])+" had the most orders ("+top+", against "+others[0]+" and "+others[1]+"), but the counts are too small and too close to say it is really ahead."};
}
function stsCaveats(nm,od){
 var E=S.sts,lines=[],conf="fair",vs=nm.map(function(x){return stsN(x.views);}),minV=Math.min.apply(null,vs),maxV=Math.max.apply(null,vs),ex=stsExposure(),uneven=false;
 if(minV<STSCFG.confViews){conf="limited";lines.push("At least one demo was seen fewer than about "+STSCFG.confViews+" times. With views this low, a few people either way can change the picture, so this is too limited to support a confident conclusion. Treat it as a hint.");}
 if(od>0&&od<STSCFG.smallOrders){if(conf==="fair")conf="lower";lines.push("Orders are a very small count ("+od+" in total). One or two orders are well within chance.");}
 if(minV>0&&maxV>=STSCFG.unevenViews*minV){uneven=true;if(conf==="fair")conf="lower";lines.push("Your demos were seen by very different numbers of people (from "+minV+" to "+maxV+" views), so their orders are not like for like.");}
 if(ex&&ex.uneven){uneven=true;if(conf==="fair")conf="lower";lines.push("Your demos were out for "+stsList(ex.days)+" days by the end of the watching period. The one that was out longest had much more time to be seen and to sell, so their orders are not like for like.");}
 else if(ex)lines.push("Your demos were published on different days, so they were out for "+stsList(ex.days)+" days by the end of the watching period. That is close, but it is not exactly the same chance to be seen.");
 if(E.cm&&E.cm.trk==="ask"){if(conf==="fair")conf="lower";lines.push("You counted sales by asking buyers which demo they saw. Memory is not exact, so treat the split between demos as a rough guide.");}
 return {conf:conf,lines:lines,uneven:uneven};
}
function stsVerdict(asOf){
 var E=S.sts,cm=E.cm,small="Three demos in one place is a small test. It shows what happened, not what will always happen.";
 var fin=function(v,c,cmp){v.conf=c;v.cmp=cmp||null;v.strength=c==="fair"?"There is enough here to describe what happened, and it is a fair first reading for a small test. It is still not strong evidence.":((c==="limited"||c==="lower")?"There is enough here to describe what happened. There is not enough to draw a firm conclusion.":(v.rule==="S4"?"There is not yet enough here to describe a result.":""));return v;};
 if(!cm)return fin(vmk("Insufficient evidence","info","S1",["No demos are planned and committed yet, so there is nothing to read."],["This says nothing about your product or your demos, because nothing has been tested."],["Finish Week 2 and commit your three demos."]),"none");
 var w=stsWin(),t=asOf||today();
 if(!w.allOut||t<w.readOn)return fin(vmk("Insufficient evidence","info","S2",[w.allOut?"Your three demos are out, and people can still respond until "+dayLab(w.to)+".":"Not all three demos are logged as published yet."],["A result read before people have had time to respond would be a guess."],[w.allOut?"Wait until "+dayLab(w.readOn)+", then record your numbers.":"Publish the rest of your demos and log each one. Resist changing the offer meanwhile."]),"none");
 var nm=stsNums(asOf),vw=stsSum(nm,"views"),od=stsSum(nm,"orders"),ck=stsSum(nm,"clicks"),cmp=stsCompare(nm);
 if(vw.k<3||od.k<3||cm.trk==="none"){
  var why=[];if(od.k<3)why.push("Orders are not recorded for every demo.");if(vw.k<3)why.push("Views are not recorded for every demo.");if(cm.trk==="none")why.push("You said you could not track which demo a sale came from.");
  return fin(vmk("Mixed or unclear","warn","S3",why,["Without these the three demos cannot be compared. A number you could not see is kept as unknown, and is never read as zero.","If a sale cannot be traced to a demo, we cannot say which demo sold."],["Record what you can see for each demo. For next time, give each demo a link or a code that only it uses."]),"unclear",cmp);
 }
 var vs=nm.map(function(x){return stsN(x.views);}),os=cmp.orders,minV=Math.min.apply(null,vs);
 var nums="Views: "+stsList(vs)+". Orders: "+stsList(os)+"."+(ck.k===3?" Clicks: "+stsList(nm.map(function(x){return stsN(x.clicks);}))+".":"");
 if(minV<STSCFG.minViews)return fin(vmk("Insufficient evidence","info","S4",[nums,"At least one demo was seen fewer than "+STSCFG.minViews+" times."],["That is too few views to compare three demos. A few people either way changes everything.","The settings used are provisional starting points that will be reviewed against real results: "+STSCFG.minViews+" views for each demo is the least needed to describe a result, and about "+STSCFG.confViews+" is where a reading becomes steadier. Neither is strong evidence by itself."],["Leave the demos up for longer, or show them where more of your buyers will see them, before deciding anything."]),"none",cmp);
 var cf=stsConfs(asOf),cav=stsCaveats(nm,od.n);
 if(cf.major.length){
  return fin(vmk("Mixed or unclear","warn","S5",[nums,"You logged "+cf.major.length+" major thing"+(cf.major.length===1?"":"s")+" around your demos that could also explain the numbers: "+cf.major.map(function(c){return (stsConfKind(c.k)||["","?"])[1].toLowerCase();}).join("; ")+"."],["Because something else changed or happened, the numbers cannot be put down to your demos alone. Even with orders, this would not be called promising.",small].concat(cav.lines),["Write down what happened and when. For a cleaner answer, run three demos again with nothing else changing."]),"unclear",cmp);
 }
 if(od.n>0){
  var nx=cmp.kind==="clear"?"Make one or two more demos that show the same thing as "+stsDemoName(cmp.lead)+", and see whether they sell too.":"Run the same three again, or the closest two, to see whether one pulls ahead.";
  var obs=[];
  if(cmp.kind==="clear")obs.push("Demo "+(cmp.lead+1)+" had more orders in this test. That describes what happened. It is not proof that this demo is better, or that it caused the extra orders.");
  if(cmp.kind==="tie"&&cav.uneven)obs.push("The same number of orders does not mean these demos did equally well, because they did not have the same chance to be seen.");
  return fin(vmk("Promising","ok","S6",[nums,cmp.line],["What you can see is orders after your demos. That is not the same as proof that a demo caused them. Some of these people may have bought anyway.",small,"This is encouraging. It is not proof."].concat(obs,cav.lines),[nx]),cav.conf,cmp);
 }
 if(ck.n>=STSCFG.minClicks)return fin(vmk("Traffic but no sales","warn","S7",[nums,"People clicked through from your demos, and you confirmed no orders."],["This shows the demos brought interest to your page. It does not show why nobody bought.",small].concat(cav.lines),["Look at what people saw after clicking: the page, the price and the offer. Change one of those, then show it again."]),cav.conf,cmp);
 if(minV<STSCFG.confViews)return fin(vmk("Insufficient evidence","info","S8",[nums,"With views this low, "+(ck.k===3?"few clicks and no orders":"no orders")+" are within what chance could produce."],["This does not mean your demos or your product did not work. Too few people saw them to tell, so the evidence is limited.",small].concat(cav.lines),["Show the demos to more people, or change one thing and try again, before deciding anything."]),"limited",cmp);
 return fin(vmk("Approach needs reviewing","warn","S8",[nums,ck.k===3?"Plenty of people saw the demos, few clicked and nobody ordered.":"Plenty of people saw the demos and nobody ordered. Clicks were not recorded for every demo."],["This does not mean the idea is wrong. Three demos is one try.",small].concat(cav.lines),["Try changing one thing next: what you show, how the demo opens, or where you publish."]),cav.conf,cmp);
}
function stsSnap(kind){
 var asOf=null,late=false,prov=false;
 if(kind==="day30"&&rvCur()){if(rvPhase()==="during")prov=true;else asOf=rvDay30();}
 if(asOf){var w=stsWin();if(w&&w.to>asOf)prov=true;if(S.sts.res.at&&S.sts.res.at>asOf)late=true;}
 var v=stsVerdict(asOf||null);
 return {at:today(),label:v.label,rule:v.rule,ctr:{msgs:0,resp:0,opp:0},res:{},kind:kind==="day30"?"day30":"update",asOf:asOf||"",late:late,prov:prov||v.rule==="S2"};
}
function stsHasRes(){return S.sts.res.d.some(function(x){return STSK.some(function(k){return !!x[k].s;});});}
function stsHasWork(){var E=S.sts;return !!E.cm||E.pb.some(function(x){return !!x.d;})||E.cf.length>0||stsHasRes();}
function stsFresh(prep){var e=STSDEF();if(prep)e.prep=prep;return e;}
function stsStart(){var prep=S.sts.prep;S.sts=stsFresh(prep);var pn=String(S.focus.product||"").trim();if(pn)S.sts.pr.product=pn.slice(0,120);}
function stsRec(v){
 var l=v.label,r=v.rule,t,b,f,x="",bs,as,ck=v.cmp?v.cmp.kind:"";
 if(l==="Promising"){
  if(ck==="clear"){t="Make another demo like the one with the most orders, then compare";b="One demo had more orders than the other two in this test. Showing the same thing again is how you find out whether it happens again.";f="Plan one new demo that shows the same thing in a slightly different way, with its own link or code.";bs="Orders were recorded, one demo led by more than the provisional margin, and no major confounder was logged.";as="We are assuming what that demo showed, not its timing or luck, led to those orders. Your numbers cannot prove that.";}
  else{t="Run them again before picking a favourite";b="Orders came after your demos, but no demo is clearly ahead. A second round shows whether one pulls away.";f="Publish the same three again, or the closest two, each with its own link or code.";bs="Orders were recorded with no major confounder logged, and the demos were too close to separate.";as="We are assuming your demos, not something else, led to those orders. Your numbers cannot prove that.";}
 }
 else if(l==="Traffic but no sales"){t="Improve what people see after the click";b="People clicked, so the demos did their job. The next place to look is the page, the price or the offer.";f="Choose one of the page, the price or how the offer is described, change only that, and show it again.";bs="Clicks reached the provisional threshold and no orders were confirmed.";as="We are assuming the page and offer, not the demos, are the weak point. Your numbers cannot confirm that.";}
 else if(l==="Approach needs reviewing"){t="Change one thing, then show it again";b="Plenty of people saw the demos and few acted. That is one try, not the end of the idea.";f="Change one thing: what you show, how the demo opens, or where you publish.";x="If reaching the right people is the constraint, Partnership-to-Sales is open now and can widen who sees your product. Find Your Buyers is open now too.";bs="No orders and few recorded clicks, with at least "+STSCFG.confViews+" views for each demo.";as="We are assuming the demos, not the audience, were what to change. The people who saw them may simply not be your buyers.";}
 else if(l==="Mixed or unclear"){t=r==="S3"?"Fill the gaps, then read it again":"Run it again with steady conditions";b="Something else changed, or a sale could not be traced to a demo, so the three cannot be compared cleanly.";f=r==="S3"?"Record the missing numbers, and give each demo its own link or code next time.":"Write down what else happened, then publish three demos again with nothing else changing.";bs=r==="S3"?"Some key numbers or the tracking were missing.":"Something else could explain the numbers.";as="We are assuming nothing else needed to be considered. If something did, please log it.";}
 else{t=(r==="S4"||r==="S8")?"Reach more people first":"Wait for your demos to finish";b=(r==="S4"||r==="S8")?"Too few people saw the demos to read a result. That says nothing about your demos, only that the numbers are small.":"Your result cannot be read yet.";f=(r==="S1")?"Finish Week 2 and commit your three demos.":(r==="S2"?"Publish the rest, log each one, and come back after the watching period.":"Leave the demos up for longer, or show them where more of your buyers look.");x=(r==="S4"||r==="S8")?"Partnership-to-Sales is open now and can widen who sees your product. You are free to choose it, or another experiment that is open.":"";bs=(r==="S4"||r==="S8")?"Views were below the provisional minimum, or the evidence is limited.":"There is not enough yet to read.";as="We are assuming more views will give a steadier picture.";}
 return {t:t,b:b,first:f,extra:x,basis:bs,assume:as,provisional:rvPhase()==="during"||r==="S2"};
}
/* ===== SHOW LOGIC END ===== */

/* --- screens --- */
function stsShell(wk,n,body){
 var st=stsStepsOf(wk-1),s=st[n-1],dn=stsDOf(wk-1)[n],base="#/show/w"+wk;
 var h='<a class="back" href="'+base+'">&larr; Show-to-Sell, Week '+wk+'</a><h1>Week '+wk+' &middot; Step '+n+' of '+st.length+'</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p><p class="mute">You will need: '+esc(s.b)+' Everything saves automatically.</p>'+body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="sts-done" data-w="'+wk+'" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<st.length?'<a class="btn ghost" href="#/show/w'+wk+'/'+(n+1)+'">Next step &rarr;</a>':'')+'</div>';
 return h;
}
function stsNumRow(path,lab,o,money){
 var opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
 return '<div class="q"><strong>'+esc(lab+(money?" ("+sym(S.focus.currency).trim()+")":""))+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="sts-vs" data-p="'+path+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-sts="n:'+path+'" value="'+esc(o.v)+'" aria-label="'+esc(lab)+'" style="max-width:160px">':'')+'</div>';
}
function stsGet(path){
 var p=String(path).split("."),o=S.sts;for(var i=0;i<p.length;i++){if(o==null)return null;o=o[/^\d$/.test(p[i])?+p[i]:p[i]];}return o;
}
var STSVSPATH=/^(bl\.(orders30|rev30|posts30)|wh\.aud|res\.d\.[0-2]\.(views|clicks|orders|rev))$/;
function stsHome(wk){
 wk=wk||1;var st=stsStepsOf(wk-1),d=rCount(st,stsDOf(wk-1)),dn=stsDOf(wk-1),base=stsWeekBase(wk);
 var h='<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Show-to-Sell</h1><p class="mute">Week '+wk+' of 4: '+esc(STSWKT[wk-1])+'. '+esc(STSWKD[wk-1])+'</p><div class="card"><strong>'+d+' of '+st.length+' steps done</strong><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/st.length*100)+'%"></i></div></div>';
 h+='<div class="card"><h2>The steps</h2>'+st.map(function(s){var x=dn[s.n];return '<a class="step'+(x?' done':'')+'" href="'+base+s.n+'"><span class="n">'+(x?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(x?"Done":"Open")+'</span></a>';}).join("")+'</div>';
 return h;
}
var STSQUIZ=[["a","You have three ideas for a demo. What is the fairest way to find out which one sells?",[["a1","Put all three ideas into one long video"],["a2","Make three short demos, each showing one thing, each with its own link or code"],["a3","Post one, and guess about the other two"]],"a2","One thing per demo, and a separate way of counting sales for each, is what lets you compare them."],["b","Your demo makes the product look better than it really is. What happens?",[["b1","More sales, with no downside"],["b2","Buyers feel misled, and it can break advertising rules"],["b3","Nothing, everyone does it"]],"b2","Show only what the product really does. An honest demo sells to people who will be glad they bought."]];
function sts1s1(){
 return stsShell(1,1,LC("sts1s1.lesson")+'<div class="card"><h2>Quick check</h2>'+STSQUIZ.map(function(q){return '<div class="q"><strong>'+esc(q[1])+'</strong><div class="row" style="flex-direction:column;align-items:stretch">'+q[2].map(function(o){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(UI.stsq&&UI.stsq[q[0]]===o[0])+'" data-a="sts-q" data-q="'+q[0]+'" data-v="'+o[0]+'">'+esc(o[1])+'</button>';}).join("")+'</div>'+(UI.stsq&&UI.stsq[q[0]]?'<div class="note '+(UI.stsq[q[0]]===q[3]?"ok":"info")+'" aria-live="polite">'+(UI.stsq[q[0]]===q[3]?"Good. ":"Have another look. ")+esc(q[4])+'</div>':'')+'</div>';}).join("")+'</div>');
}
function sts1s2(){
 var E=S.sts,lk=!!E.cm,h=LC("sts1s2.lesson")+'<div class="card"><h2>The one product you will show</h2><label for="stsp">Which product?</label><input id="stsp" type="text" maxlength="120" data-sts="pr.product" value="'+esc(E.pr.product)+'"'+(lk?' readonly':'')+'>'+(String(S.focus.product||"").trim()&&E.pr.product===String(S.focus.product).trim().slice(0,120)?'<p class="mute">Pre-filled from your product details. Please check it.</p>':'')+'<label for="stsw">Who is it for?</label><input id="stsw" type="text" maxlength="200" data-sts="pr.who" value="'+esc(E.pr.who)+'" placeholder="For example: new freelancers who want a simple budget"></div>';
 h+='<div class="card"><h2>Where you start (the last 30 days)</h2><p class="mute">This is your starting point for this product. If you cannot see a number, say so, and it is kept as unknown. It is never read as zero.</p>'+stsNumRow("bl.orders30","Orders for this product",E.bl.orders30)+stsNumRow("bl.rev30","Revenue from this product",E.bl.rev30,true)+stsNumRow("bl.posts30","Times you showed or posted about this product",E.bl.posts30)+'</div>';
 return stsShell(1,2,h);
}
function sts1s3(){
 var E=S.sts,lk=!!E.cm,h=LC("sts1s3.lesson")+'<div class="card"><h2>The one place</h2><p class="mute">All three demos go in the same place, so the only thing that differs is what each demo shows.</p><div class="row">'+STSCH.map(function(x){return '<button type="button" class="chip" aria-pressed="'+(E.wh.ch===x[0])+'" data-a="sts-ch" data-v="'+x[0]+'"'+(lk?' disabled':'')+'>'+esc(x[1])+'</button>';}).join("")+'</div><label for="stsn">Your account or page name there (optional, only you see this)</label><input id="stsn" type="text" maxlength="120" data-sts="wh.name" value="'+esc(E.wh.name)+'"'+(lk?' readonly':'')+'>'+stsNumRow("wh.aud","People who follow you or visit there now (optional)",E.wh.aud)+'<p class="mute">The Sales Lab never posts or publishes anything for you. You publish from your own account.</p></div>';
 return stsShell(1,3,h);
}
function sts1s4(){
 var E=S.sts,lk=!!E.cm,h=LC("sts1s4.lesson")+'<div class="card"><h2>How will you count a sale for each demo?</h2><div class="row" style="flex-direction:column;align-items:stretch">'+STSTRK.map(function(x){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(E.tk.trk===x[0])+'" data-a="sts-trk" data-v="'+x[0]+'"'+(lk?' disabled':'')+'>'+esc(x[1])+'</button>';}).join("")+'</div>';
 if(E.tk.trk==="none")h+='<div class="note warn">That is honest, and it means your result will be read as unclear, because a sale cannot be traced to a demo. A link or a code for each demo takes a few minutes to set up.</div>';
 else if(E.tk.trk==="ask")h+='<div class="note info">That can work for a small number of orders. Memory is not exact, so your result will be read with a little more care.</div>';
 else if(E.tk.trk)h+=[0,1,2].map(function(i){return '<label for="stsr'+i+'">Demo '+(i+1)+': its '+(E.tk.trk==="link"?"link":"code")+' (optional, only you see this)</label><input id="stsr'+i+'" type="text" maxlength="200" data-sts="tk.refs.'+i+'" value="'+esc(E.tk.refs[i])+'"'+(lk?' readonly':'')+'>';}).join("")+'<p class="mute">Each demo needs a different one. If two are the same, their sales cannot be told apart.</p>';
 return stsShell(1,4,h+'</div>');
}
function stsSummary1(){
 var E=S.sts;
 return '<div class="card"><h2>Your Week 1 summary</h2><div class="crow"><span>Your product</span><strong>'+esc(E.pr.product||"Not chosen")+'</strong></div><div class="crow"><span>Where you will show it</span><strong>'+esc(stsWhere()||"Not chosen")+'</strong></div><div class="crow"><span>Counting sales</span><strong>'+esc(STSTRKL[E.tk.trk]||"Not chosen")+'</strong></div><div class="crow"><span>Orders in the last 30 days</span><strong>'+esc(stsFmt(E.bl.orders30))+'</strong></div><h3>Your decision</h3><p><button type="button" class="chip" aria-pressed="'+(E.dec==="next")+'" data-a="sts-dec" data-w="1" data-v="next">Ready for Week 2</button></p></div>';
}
function sts1s5(){return stsShell(1,5,LC("sts1s5.lesson")+stsSummary1());}
function sts2s1(){return stsShell(2,1,LC("sts2s1.lesson"));}
var STSDEMOHINT=[["How it works","Start with the product already in your hands or on the screen.","Show it being used, start to finish, in real time or close to it."],["The result it gives","Start with the finished result.","Show what the buyer ends up with, then how the product got them there."],["One question people ask","Start with the question, in their words.","Answer it by showing, not telling."]];
function stsDemo(i,wk,n){
 var E=S.sts,m=E.dm[i],lk=!!E.cm,c=stsDemoCheck(m),pre=STSDEMOHINT[i],ro=lk?' readonly':'',di=lk?' disabled':'';
 var h=LC("sts2s"+(i+2)+".lesson")+'<div class="card"><h2>Demo '+(i+1)+'</h2><label for="stsO'+i+'">The one thing this demo shows</label><input id="stsO'+i+'" type="text" maxlength="120" data-sts="dm.'+i+'.one" value="'+esc(m.one)+'"'+ro+' placeholder="'+esc(pre[0])+'"><label>What kind of demo is it?</label><div class="row">'+STSFMT.map(function(x){return '<button type="button" class="chip" aria-pressed="'+(m.fmt===x[0])+'" data-a="sts-fmt" data-i="'+i+'" data-v="'+x[0]+'"'+di+'>'+esc(x[1])+'</button>';}).join("")+'</div><label for="stsH'+i+'">How it opens: the first thing people see or read</label><textarea id="stsH'+i+'" maxlength="200" style="min-height:60px" data-sts="dm.'+i+'.hook"'+ro+' placeholder="'+esc(pre[1])+'">'+esc(m.hook)+'</textarea><label for="stsV'+i+'">What people will see, step by step</label><textarea id="stsV'+i+'" maxlength="500" style="min-height:90px" data-sts="dm.'+i+'.shown"'+ro+' placeholder="'+esc(pre[2])+'">'+esc(m.shown)+'</textarea><label for="stsA'+i+'">The one ask</label><textarea id="stsA'+i+'" maxlength="200" style="min-height:50px" data-sts="dm.'+i+'.ask"'+ro+' placeholder="For example: tap the link to get yours.">'+esc(m.ask)+'</textarea></div>';
 h+='<div class="card"><h2>Does anything else appear in it?</h2><p class="mute">Tick anything that will be seen or heard, apart from you and your own product.</p>'+STSIN.map(function(x){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(m.inn[x[0]]===true)+'" data-a="sts-in" data-i="'+i+'" data-k="'+x[0]+'"'+di+'>'+esc(x[1])+'</button></p>';}).join("");
 if(Object.keys(m.inn).length)h+='<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(m.perm===true)+'" data-a="sts-perm" data-i="'+i+'"'+di+'>I have permission for each of these, or the right to use it.</button></p><p class="mute">Ask before you film or photograph someone, and use music the platform allows for business use. This is general guidance, not legal advice.</p>';
 else h+='<p class="mute">Nothing ticked. That is fine if it is only you and your product.</p>';
 h+='</div><div class="card"><h2>Script check</h2><p class="mute">'+c.words+' words planned.</p>'+(c.issues.length?'<div class="note info"><strong>Worth another look:</strong><ul>'+c.issues.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>':(stsDemoFilled(m)?'<div class="note ok">That reads well for one short demo.</div>':''))+c.notes.map(function(x){return '<div class="note info">'+esc(x)+'</div>';}).join("")+'<p class="mute">This check only looks for common problems in your words. It cannot see your demo, and it is not confirmation that the demo meets advertising rules.</p></div>';
 return stsShell(wk,n,h);
}
function sts2s2(){return stsDemo(0,2,2);}
function sts2s3(){return stsDemo(1,2,3);}
function sts2s4(){return stsDemo(2,2,4);}
function sts2s5(){
 var E=S.sts,lk=!!E.cm,h=LC("sts2s5.lesson");
 if(lk)return stsShell(2,5,h+stsPlanLog());
 h+='<div class="card"><h2>Six checks</h2><p class="mute">Tick each one when it is true.</p>'+STSTICKS.map(function(t){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(E.ticks[t[0]]===true)+'" data-a="sts-tick" data-k="'+t[0]+'">'+esc(t[1])+'</button></p>';}).join("")+'<p><strong>'+STSTICKS.filter(function(t){return E.ticks[t[0]]===true;}).length+' of 6 ticked.</strong></p></div>';
 h+='<div class="card"><h2>When will you publish each one?</h2>'+[0,1,2].map(function(i){return '<label for="stsD'+i+'">Demo '+(i+1)+(E.dm[i].one.trim()?': '+esc(E.dm[i].one.trim()):'')+'</label><input id="stsD'+i+'" type="date" data-sts="sch.'+i+'" value="'+esc(E.sch[i])+'" min="'+esc(today())+'" style="max-width:200px">';}).join("");
 var sc=stsSchCheck(E.sch);
 if(sc.ok){h+='<div class="crow"><span>You will be watching until</span><strong>'+esc(dayLab(sc.w.to))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(sc.w.readOn))+'</strong></div>';if(sc.uneven)h+='<div class="note info">Your first demo would be out for much longer than your last one, so it would have more time to be seen. Publishing them closer together makes the comparison fairer.</div>';if(sc.prov)h+='<div class="note info">Your watching period runs past Day 30, so your Day 30 position will be provisional, and the rest is recorded as a post-sprint update in your 14 day update window.</div>';}
 else if(E.sch.some(function(x){return !!x;}))h+='<div class="note '+(sc.why==="missing"?"info":"warn")+'"><strong>'+esc(sc.t)+'.</strong> '+esc(sc.b)+'</div>';
 h+='</div>';
 var r=stsReady();
 h+='<div class="card"><h2>Ready to commit?</h2>';
 if(r.ok)h+='<div class="note ok"><strong>Everything is in place.</strong></div>';else h+='<div class="note warn"><strong>Not quite yet. Still needed:</strong><ul>'+r.miss.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 if(UI.stsc&&r.ok)h+='<div class="note info" aria-live="polite"><strong>Commit and lock your plan?</strong> Your three demos, your product, the place, how you will count sales and your dates will be locked and dated.</div><div class="row"><button type="button" class="btn" data-a="sts-commit">Yes, commit and lock</button><button type="button" class="btn ghost" data-a="sts-cancel">Not yet</button></div>';
 else h+='<p><button type="button" class="btn"'+(r.ok?'':' disabled')+' data-a="sts-confirm">Commit my plan</button></p>';
 return stsShell(2,5,h+'</div>');
}
function stsPlanLog(){
 var c=S.sts.cm;if(!c)return "";
 return '<div class="card"><h2>Your plan</h2><p class="mute">Committed on '+esc(dayLab(c.at))+'. This record is locked.</p><div class="crow"><span>Product</span><strong>'+esc(c.what)+'</strong></div><div class="crow"><span>Where</span><strong>'+esc(c.where)+'</strong></div><div class="crow"><span>Counting sales</span><strong>'+esc(STSTRKL[c.trk]||"")+'</strong></div>'+c.sch.map(function(d,i){return '<div class="crow"><span>Demo '+(i+1)+'</span><strong>'+esc(dayLab(d))+(c.dm[i].one?': '+esc(c.dm[i].one):'')+'</strong></div>';}).join("")+'</div>';
}
function stsStatus(){
 var E=S.sts,w=stsWin();if(!E.cm)return '<div class="note warn"><strong>No plan is committed yet.</strong> Week 2 finishes with committing your three demos. <a href="#/show/w2/5">Go to Week 2, step 5</a></div>';
 var n=stsOut().length;
 return '<div class="card"><h2>Where you are</h2><div class="crow"><span>Demos logged as published</span><strong>'+n+' of 3</strong></div><div class="crow"><span>Watching until</span><strong>'+esc(dayLab(w.to))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(w.readOn))+'</strong></div>'+(w.allOut&&today()<w.readOn?'<div class="note info">All three are out. People can still respond, so please do not read your numbers as a result yet.</div>':'')+(rvCur()&&w.to>rvDay30()?'<div class="note info">Your watching period runs past Day 30, so your Day 30 position will be provisional, and the rest is recorded as a post-sprint update until '+esc(dayLab(rvEnd()))+'.</div>':'')+'</div>';
}
function sts3s1(){return stsShell(3,1,LC("sts3s1.lesson")+stsPlanLog()+stsStatus());}
function sts3s2(){
 var E=S.sts,h=LC("sts3s2.lesson");
 if(!E.cm)return stsShell(3,2,h+stsStatus());
 h+='<div class="card"><h2>Your publish log</h2><p class="mute">Record each demo when it goes out. The date cannot be before you committed, or in the future. You publish from your own account. The Sales Lab never posts for you.</p>';
 [0,1,2].forEach(function(i){var x=E.pb[i];h+='<h3>Demo '+(i+1)+(E.cm.dm[i].one?': '+esc(E.cm.dm[i].one):'')+'</h3><p class="mute">Planned for '+esc(dayLab(E.cm.sch[i]))+'.</p><label for="stspb'+i+'">The day you published it</label><input id="stspb'+i+'" type="date" data-sts="pb.'+i+'.d" value="'+esc(x.d)+'" min="'+esc(E.cm.at)+'" max="'+esc(today())+'" style="max-width:200px">';});
 return stsShell(3,2,h+'</div>'+stsStatus());
}
function stsConfHtml(){
 var E=S.sts,h="";if(!E.cf.length)return '<p class="mute">Nothing logged. That is a fine answer if nothing changed.</p>';
 E.cf.slice().sort(function(a,b){return a.d<b.d?-1:(a.d>b.d?1:a.id-b.id);}).forEach(function(c){var w=stsWin(),inw=w&&E.cm&&c.d>=addDays(E.cm.sch[0],-7)&&c.d<=w.to,mj=stsConfMajor(c),wd=!!c.wd,k=stsConfKind(c.k);h+='<div class="crow" style="display:block'+(wd?';opacity:.6':'')+'"><p><strong>'+esc(dayLab(c.d))+'</strong>: '+esc(k?k[1]:"")+' <span class="tag">'+(mj?"major":"minor")+'</span>'+(inw?'':' <span class="tag">outside your window, not counted</span>')+(wd?' <span class="tag">withdrawn '+esc(dayLab(c.wd))+'</span>':'')+'</p>'+(c.note?'<p style="white-space:pre-wrap">'+esc(c.note)+'</p>':'')+(wd?'':'<p><button type="button" class="chip sm" data-a="sts-fwd" data-id="'+c.id+'">Withdraw this entry</button></p>')+'</div>';});
 return h;
}
function sts3s3(){
 var E=S.sts,h=LC("sts3s3.lesson");if(!E.cm)return stsShell(3,3,h+stsStatus());
 var u=UI.stsf||{};
 h+='<div class="card"><h2>Log something that could also explain your numbers</h2><label for="stsfd">The day it happened</label><input id="stsfd" type="date" data-sts="f:d" value="'+esc(u.d||today())+'" max="'+esc(today())+'" min="'+esc(addDays(E.cm.sch[0],-7))+'" style="max-width:200px">'+STSCONF.map(function(x){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(u.k===x[0])+'" data-a="sts-fk" data-v="'+x[0]+'">'+esc(x[1])+'</button></p>';}).join("");
 if(u.k==="other")h+='<label>Could this change your numbers a lot?</label><div class="row"><button type="button" class="chip" aria-pressed="'+(u.maj===true)+'" data-a="sts-fmaj" data-v="yes">Yes, it could</button><button type="button" class="chip" aria-pressed="'+(u.maj===false)+'" data-a="sts-fmaj" data-v="no">Probably not</button></div>';
 h+='<label for="stsfn">A note (optional)</label><textarea id="stsfn" maxlength="300" data-sts="f:note" style="min-height:60px">'+esc(u.note||"")+'</textarea><p><button type="button" class="btn ghost" data-a="sts-fadd">Add to my list</button></p></div>';
 var c=stsConfs();h+='<div class="card"><h2>Your list</h2><p><strong>'+c.major.length+' major, '+c.minor.length+' minor</strong> around your demos.</p>'+stsConfHtml()+'</div>';
 return stsShell(3,3,h);
}
function sts3s4(){
 var E=S.sts;return stsShell(3,4,LC("sts3s4.lesson")+'<div class="card"><h2>Your Week 3 summary</h2><div class="crow"><span>Demos logged as published</span><strong>'+stsOut().length+' of 3</strong></div><div class="crow"><span>Things that could explain the numbers</span><strong>'+(function(){var c=stsConfs();return c.major.length+" major, "+c.minor.length+" minor";})()+'</strong></div><h3>Your decision</h3><p><button type="button" class="chip" aria-pressed="'+(E.dec3==="next")+'" data-a="sts-dec" data-w="3" data-v="next">Ready to read my result in Week 4</button></p></div>');
}
function sts4s1(){return stsShell(4,1,LC("sts4s1.lesson")+LC("sts4s1.examples"));}
function sts4s2(){
 var E=S.sts,h=LC("sts4s2.lesson");if(!E.cm)return stsShell(4,2,h+stsStatus());
 h+=rvCur()?rvPostNote():'';
 h+='<div class="card"><h2>Your numbers, demo by demo</h2><p class="mute">Count each demo from the day it went out to '+esc(dayLab(stsWin().to))+'. Use the link or code that only that demo uses. If you cannot see a number, say so. It is kept as unknown and never read as zero.</p>';
 [0,1,2].forEach(function(i){var x=E.res.d[i],p="res.d."+i+".";h+='<h3>Demo '+(i+1)+(E.cm.dm[i].one?': '+esc(E.cm.dm[i].one):'')+'</h3>'+stsNumRow(p+"views","Views",x.views)+stsNumRow(p+"clicks","Clicks on its link (if you can see them)",x.clicks)+stsNumRow(p+"orders","Orders from its link or code",x.orders)+stsNumRow(p+"rev","Revenue from those orders",x.rev,true);});
 if(E.res.at)h+='<p class="mute">Last saved '+esc(dayLab(E.res.at))+(rvCur()&&E.res.at>rvDay30()?' <span class="tag">post-sprint update</span>':'')+'.</p>';
 return stsShell(4,2,h+'</div>');
}
function stsDemoRows(nm){
 var c=S.sts.cm;
 return [0,1,2].map(function(i){var x=nm[i],o=c&&c.dm[i]?c.dm[i].one:"";return '<div class="crow" style="display:block"><p style="margin:0"><strong>Demo '+(i+1)+(o?': '+esc(o):'')+'</strong></p><p class="mute" style="margin:2px 0 8px">Views '+esc(stsFmt(x.views))+'. Clicks '+esc(stsFmt(x.clicks))+'. Orders '+esc(stsFmt(x.orders))+'. Revenue '+esc(stsFmt(x.rev,true))+'.</p></div>';}).join("");
}
function sts4s3(){
 var E=S.sts,h=LC("sts4s3.lesson");if(!E.cm)return stsShell(4,3,h+stsStatus());
 var v=stsVerdict(),cl={limited:"Limited. Too limited to support a confident conclusion.",lower:"Lower than usual. See the notes below.",fair:"Fair for a small test.",unclear:"Unclear.",none:""}[v.conf||"none"];
 h+='<div class="card"><h2>Your evidence verdict</h2><div class="note '+v.cls+'"><strong>'+esc(v.label)+'</strong> <span class="tag">rule '+esc(v.rule)+'</span></div>'+(cl?'<p><strong>How much confidence?</strong> <span class="tag">'+esc(cl)+'</span></p>':'')+(v.strength?'<p>'+esc(v.strength)+'</p>':'')+'<h3>What the numbers show</h3><ul>'+v.why.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>What they cannot show</h3><ul>'+v.limits.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>A reasonable next step</h3><ul>'+v.next.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 h+='<div class="card"><h2>Which demo sold?</h2><p>'+esc(v.cmp?v.cmp.line:"Your three demos cannot be compared yet.")+'</p>'+stsDemoRows(stsNums())+'<p class="mute">Counts, not percentages. With numbers this small, a percentage would look more exact than it is.</p></div>';
 h+='<div class="card"><h2>What was considered</h2><div class="crow"><span>Major things logged</span><strong>'+stsConfs().major.length+'</strong></div><div class="crow"><span>Provisional settings used</span><strong>At least '+STSCFG.minViews+' views for each demo to describe a result, about '+STSCFG.confViews+' for a steadier reading, '+STSCFG.minClicks+' clicks before "Traffic but no sales", and at least '+STSCFG.leadOrders+' orders with '+STSCFG.leadGap+' more than the next before a demo is described as ahead</strong></div>'+(function(){var x=stsExposure();return x?'<div class="crow"><span>Days each demo was out</span><strong>'+esc(stsList(x.days))+'</strong></div>':'';})()+'<p class="mute">These are provisional testing assumptions, not proof of reliability and not a validated benchmark. Having enough to describe a result is not the same as strong evidence. Being ahead describes what happened in this test. It does not show that a demo is better, or that it caused the orders.</p></div>';
 return stsShell(4,3,h);
}
function sts4s4(){
 var E=S.sts,v=stsVerdict(),h=LC("sts4s4.lesson")+'<div class="card"><h2>Your verdict was: '+esc(v.label)+'</h2><h3>What would you like to do?</h3>'+STSNEXT.map(function(x){return '<p><button type="button" class="chip" aria-pressed="'+(E.nx===x[0])+'" data-a="sts-nx" data-v="'+x[0]+'">'+x[1]+'</button></p>';}).join("")+'<h3>Anything else?</h3><p><button type="button" class="chip" aria-pressed="'+(E.dec4==="done")+'" data-a="sts-dec" data-w="4" data-v="done">I am done with this experiment for now</button></p></div>';
 return stsShell(4,4,h);
}
var STSROUTE=/^#\/show(?:\/(w[1-4]))?(?:\/([1-5]))?$/;
function stsRouteInner(){
 var m=STSROUTE.exec(route)||[],n=+(m[2]||0),wk=m[1]?+m[1].slice(1):(n?1:0);
 if(!wk)return stsHome(1);
 if(!n)return stsHome(wk);
 var F=[null,[0,sts1s1,sts1s2,sts1s3,sts1s4,sts1s5],[0,sts2s1,sts2s2,sts2s3,sts2s4,sts2s5],[0,sts3s1,sts3s2,sts3s3,sts3s4],[0,sts4s1,sts4s2,sts4s3,sts4s4]];
 return F[wk][n]?F[wk][n]():stsHome(wk);
}
function stsRoute(){
 var m=STSROUTE.exec(route)||[],wk=m[1]||"",n=+(m[2]||0);
 if(!stsActive())return stsPrep();
 if(!wk&&!n)return stsMySprint();
 var w=wk?+wk.slice(1):1;
 if(w>1&&!stsWeekDone(w-2))return '<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Week '+w+' is not open yet</h1><div class="note info">Week '+w+' opens when you finish Week '+(w-1)+'. <a href="#/show/w'+(w-1)+'">Go to Week '+(w-1)+'</a></div>';
 return stsRouteInner();
}
function stsPrep(){
 var P=S.sts.prep,ph=SPR.loaded?rvPhase():"",ready=stsPrepReady();
 var h='<a class="back" href="#/experiments">&larr; Experiments</a><h1>Prepare for Show-to-Sell</h1><p class="mute">Get ready first. Nothing on this page starts your 30 days, and nothing here counts as completed experiment activity.</p>';
 h+='<div class="card"><h2>What the experiment is</h2><p>Over four weeks you make three short demos of one product in use. Each demo shows one thing, and each has its own link or code. You publish them yourself, in one place, and count what each one brings. You read the result honestly, and decide what is next. The Sales Lab never posts or publishes anything for you.</p></div>';
 h+='<div class="card"><h2>The four weeks, in plain words</h2><ol>'+STSWKT.map(function(t,i){return '<li><strong>Week '+(i+1)+': '+esc(t)+'.</strong> '+esc(STSWKD[i])+'</li>';}).join("")+'</ol><p class="mute">About 3 to 5 hours a week. You can read ahead, and you can go at your own pace inside each week.</p></div>';
 h+='<div class="card"><h2>What you need before it can start</h2><p><strong>Do you have a product that people can buy today, and that you can show in use?</strong></p><div class="row"><button type="button" class="chip" aria-pressed="'+(P.prod==="yes")+'" data-a="sts-pprod" data-v="yes">Yes</button><button type="button" class="chip" aria-pressed="'+(P.prod==="no")+'" data-a="sts-pprod" data-v="no">Not yet</button></div><p style="margin-top:12px"><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(P.place===true)+'" data-a="sts-pplace">I have somewhere of my own to publish a demo, such as a social account or my shop page.</button></p>';
 if(P.prod==="no")h+='<div class="note info"><strong>That is fine.</strong> A demo needs something people can buy once they have seen it. Come back when your product is on sale. Your 30 days will not start until then, and you choose when to begin.</div>';
 h+='<p class="mute">You do not need to be on camera. Hands, a screen recording or photos can all show a product in use. The sprint starts only when you press the start button yourself.</p></div>';
 if(!SPR.loaded)h+='<div class="note warn" role="status">We could not check your sprint just now. Please refresh the page.</div>';
 else if(stsActive())h+='<div class="note ok">You are already on this experiment. <a href="#/sprint">Open My Sprint</a>.</div>';
 else if(ph==="during")h+='<div class="note info">You already have a sprint running. You can start Show-to-Sell after Day 30, if you wish.</div>';
 else if(ready)h+='<div class="card"><h2>Ready when you are</h2><p>You have a product to show and a place to show it. You will choose the details in Week 1.</p>'+(UI.sprErr?'<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>':'')+sprConfirmX("show",ph==="notstarted"?"Start my 30-day sprint":"Start another sprint")+'</div>';
 else h+='<div class="note info"><strong>Not ready to start yet.</strong> Both are needed: a product people can buy that you can show in use, and somewhere of your own to publish.</div>';
 h+='<div class="card"><h2>Another experiment may suit you better right now</h2><p>You are always free to choose a different experiment.</p><p><strong>Partnership-to-Sales</strong> <span class="tag">open now</span><br><span class="mute">It borrows other people\'s audiences, so you do not need your own.</span></p><p><strong>Etsy Sales Bottleneck</strong> <span class="tag">open now</span><br><span class="mute">For sellers with a live Etsy listing.</span></p><p><strong>Email-to-Sale</strong> <span class="tag">open now</span><br><span class="mute">For anyone with a list of people who agreed to hear from them.</span></p><p><strong>Find Your Buyers</strong> <span class="tag">open now</span><br><span class="mute">For finding where your buyers already spend time, with no audience of your own needed.</span></p><p class="mute">LIVE Sales is coming soon, and is not open yet.</p><p><a class="btn ghost" href="#/experiments">See the experiments, and the sales check</a></p></div>';
 return h;
}
function stsMySprint(){
 var wk=stsCurWeek(),W=stsWeeks()[wk-1];
 var h='<h1>My Sprint</h1><p class="mute">Show-to-Sell &middot; Week '+wk+' of 4</p>'+sprintBar(true);
 h+='<div class="tabs rwpick">'+stsWeeks().map(function(w){var g=rSvg("-50 -50 100 100",rWeekG(w.n,w.open,"#fff"));return w.open?'<a class="chip rwb" aria-pressed="'+(w.n===wk)+'" href="#/show/w'+w.n+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+(w.state==="done"?' &#10003;':'')+'</a>':'<button type="button" class="chip rwb" disabled title="Opens when you finish Week '+(w.n-1)+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+'</button>';}).join("")+'</div>';
 h+='<p class="mute"><strong>This week:</strong> '+esc(STSWKD[wk-1])+'</p>'+(wk===1?'<p class="mute">Week 2 opens when you finish Week 1 (choose "Ready for Week 2" in the last step).</p>':'');
 var pn=String(S.focus.product||"").trim();if(pn)h+='<div class="note ok"><strong>Your product:</strong> '+esc(pn)+'</div>';
 h+='<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,stsWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
 return h+'<p class="mute"><a href="#/experiments">See all six experiments, and the sales check</a></p>';
}
function stsResultsPage(){
 var E=S.sts,v=stsVerdict(),ph=rvPhase(),started=stsStepCount()>0||!!E.cm,n=stsOut().length,nm=stsNums(),h='<div class="phd"><h1>Results</h1><p class="mute">Your numbers, what they show, and what you learned. Counts, not percentages, while samples are small.</p>';
 if(started)h+='<div class="rtally"><div><h3>You did</h3><p><b>'+stsStepCount()+'</b>Steps done</p><p><b>'+n+' of 3</b>Demos published</p><p><b>'+(E.cm?"1":"0")+'</b>Plan committed</p></div><div><h3>Came back</h3><p><b>'+esc(stsFmtSum(stsSum(nm,"views")))+'</b>Views of your demos</p><p><b>'+esc(stsFmtSum(stsSum(nm,"clicks")))+'</b>Clicks on your links</p></div><div><h3>Sold</h3><p><b>'+esc(stsFmtSum(stsSum(nm,"orders")))+'</b>Orders from your demos</p><p><b>'+esc(stsFmtSum(stsSum(nm,"rev"),true))+'</b>Revenue from those orders</p></div></div>';
 h+='</div><!--/phd--><div class="rcols"><div>';
 h+='<div class="card"><h2>Where you started</h2><p class="mute">The last 30 days before your sprint, from Week 1, step 2. "I can\'t see this" stays unknown and is never turned into zero.</p><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(stsFmt(E.bl.orders30))+'</b>Orders for this product</div><div class="tile"><b style="font-size:20px">'+esc(stsFmt(E.bl.rev30,true))+'</b>Revenue</div><div class="tile"><b style="font-size:20px">'+esc(stsFmt(E.bl.posts30))+'</b>Times you showed it</div></div></div>';
 h+='<div class="card"><h2>Your sprint so far</h2><p class="mute">'+esc(rvClock())+'</p>';
 if(E.cm){var w=stsWin();h+='<p>Your demos: <strong>'+esc(E.cm.what)+'</strong>, '+n+' of 3 published'+(E.cm.where?' ('+esc(E.cm.where)+')':'')+'.</p>'+(w?'<p class="mute">Watching until '+esc(dayLab(w.to))+'. Read your numbers from '+esc(dayLab(w.readOn))+'.</p>':'')+'<h3>Demo by demo</h3>'+stsDemoRows(nm);}
 else h+='<p class="mute">No plan is committed yet. You commit it in <a href="#/show/w2/5">Week 2, step 5</a>.</p>';
 h+='</div>';
 if(started)h+='<section class="rpnl gold rread"><small>What the evidence suggests</small><h2>'+(ph==="during"&&v.rule!=="S2"?"Provisional reading: ":"")+esc(v.label)+'</h2><p>'+esc(v.why[0]||"")+'</p>'+(v.cmp&&v.rule!=="S3"&&v.cmp.kind!=="unknown"?'<p>'+esc(v.cmp.line)+'</p>':'')+''+(v.strength?'<p>'+esc(v.strength)+'</p>':'')+'<p class="mute">A reading, not a verdict. Orders you can see after a demo are not proof that the demo caused them. <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</p></section>';
 h+='</div><div class="rside"><div class="card"><h2>Day 30 review</h2>'+(S.rv.done?'<p>Saved on '+esc(dayLab(S.rv.at))+': '+esc(S.rv.snap?S.rv.snap.label:"")+'.</p>':'<p class="mute">'+(started?"Look back at your sprint, see what the evidence suggests, and choose what to focus on next. You can open it at any time.":"Available once your sprint has started.")+'</p>')+'<p><a class="btn'+(S.rv.done?' ghost':'')+'" href="#/review">Open my Day 30 review</a></p></div>';
 var c=stsConfs(),learn=[];if(E.cf.length)learn.push("Things that could also explain your numbers: "+c.major.length+" major, "+c.minor.length+" minor");
 if(E.nx){var nx=STSNEXT.filter(function(x){return x[0]===E.nx;})[0];if(nx)learn.push("What you decided next: "+nx[1]);}
 h+='<div class="card"><h2>What you have learned</h2>'+(learn.length?learn.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join(""):'<p class="mute">Your own notes and choices from Weeks 2 to 4 appear here as you go.</p>')+'</div><div class="card"><h2>Past sprints</h2>'+rvPastHtml()+'</div>';
 return h+'</div></div>';
}
function stsReviewHead(){
 var E=S.sts,v=stsVerdict(),rec=stsRec(v),ph=rvPhase(),prov=ph==="during"||rec.provisional,n=stsOut().length,nm=stsNums();
 var h='<a class="back" href="#/results">&larr; Results</a><h1>Your Day 30 review</h1><p class="mute">Show-to-Sell. A look at where you started, what you did, what the evidence suggests, and what to focus on next.</p>'+sprintBar(true);
 h+='<div class="card"><h2>1. Where you started, and where you are now</h2><p class="mute">Your starting numbers are the 30 days before your sprint. Your demo numbers cover these three demos only. We show them side by side and we do not label the difference as better or worse, because the two are not like for like.</p><div class="crow" style="display:block"><p style="margin:0"><strong>Orders for this product</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(stsFmt(E.bl.orders30))+'. From your three demos: '+esc(stsFmtSum(stsSum(nm,"orders")))+'.</p></div><div class="crow" style="display:block"><p style="margin:0"><strong>Revenue from this product</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(stsFmt(E.bl.rev30,true))+'. From your three demos: '+esc(stsFmtSum(stsSum(nm,"rev"),true))+'.</p></div></div>';
 h+='<div class="card"><h2>2. What you did</h2><p>Steps completed: '+STSWKT.map(function(t,i){return "Week "+(i+1)+" "+rCount(stsStepsOf(i),stsDOf(i))+" of "+stsStepsOf(i).length;}).join(", ")+'.</p><p>Demos published: '+n+' of 3.</p><div class="note info">You do not need to have finished every step. Anything unfinished stays saved and you can come back to it.</div></div>';
 h+='<div class="card"><h2>3. What the evidence suggests</h2><div class="note '+v.cls+'"><strong>'+(prov?"Provisional reading: ":"")+esc(v.label)+'</strong> <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</div><h3>What the numbers show</h3>'+v.why.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+(E.cm?stsDemoRows(nm):'')+'<h3>What remains uncertain</h3>'+v.limits.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+''+(v.strength?'<p style="margin:4px 0">'+esc(v.strength)+'</p>':'')+'<p style="margin:4px 0">This is a reading, not a verdict. The thresholds behind it are provisional starting points, not guarantees.</p><h3>What to focus on next</h3><div class="note info"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div><p><strong>First small action:</strong> '+esc(rec.first)+'</p>'+(rec.extra?'<p>'+esc(rec.extra)+'</p>':'')+'<p class="mute"><strong>Evidence:</strong> '+esc(rec.basis)+'</p><p class="mute"><strong>Assumption:</strong> '+esc(rec.assume)+'</p></div>';
 return h;
}
function stsPastSummary(p){
 if(p.exp!=="show"||!p.stx)return "";
 var x=p.stx,keep=S.sts;S.sts=x;var h;try{var nm=stsNums();h=x.cm?'<p class="mute" style="margin:2px 0 6px">Demos: '+esc(x.cm.what)+', '+stsOut().length+' of 3 published. Orders by demo: '+esc(stsList(nm.map(function(y){return stsFmt(y.orders);})))+'.</p>':'<p class="mute" style="margin:2px 0 6px">No demos were committed in this sprint.</p>';}finally{S.sts=keep;}
 return h;
}
function stsPastFix(x){
 var okd=function(y){return (typeof y==="string"&&(y===""||parseYmd(y)!=null))?y:"";},st=function(y,n){return typeof y==="string"?y.slice(0,n):"";},nm=function(y){return (typeof y==="number"&&isFinite(y)&&y>=0&&y<100000)?Math.floor(y):0;};
 var rvt=rvfix({rv:{snap:x.snap,upd:x.upd,done:!!x.snap}}).rv;
 return {exp:"show",sid:nm(x.sid),auto:x.auto===true,start:okd(x.start),archivedAt:okd(x.archivedAt),label:st(x.label,40),rule:st(x.rule,4),review:x.review===true,snap:rvt.snap,upd:rvt.upd,stx:stsfix({sts:x.stx}).sts};
}
function stsArchive(prev){
 var snap=S.rv.snap,auto=false;if(!snap){snap=stsSnap("day30");auto=true;}
 var e={exp:"show",sid:prev.id,start:prev.start_day,archivedAt:today(),label:snap.label,rule:snap.rule,review:!!S.rv.done,auto:auto,snap:snap,upd:S.rv.upd.slice(0,20),stx:clone(S.sts)};
 S.past=(S.past||[]);if(S.past.length>=10)S.past.shift();S.past.push(e);
}
var PUSK=[["views","Views"],["clicks","Clicks on its link"],["orders","Orders from its link or code"],["rev","Revenue from those orders"]];
function pusDraft(){if(!UI.pus)UI.pus={i:-1,d:[0,1,2].map(function(){var o={};STSK.forEach(function(k){o[k]={s:"",v:""};});return o;})};return UI.pus;}
function stsPastLate(p,i){
 if(!(UI.pus&&UI.pus.i===i))return '<p><button type="button" class="btn ghost" data-a="pus-open" data-i="'+i+'">Add late demo numbers to this sprint</button></p>';
 var u=pusDraft(),opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]],h='<p class="mute">Add what you can now see for this earlier sprint. They belong to this sprint only, and do not change your current sprint or the Day 30 position. Leave anything you do not want to change.</p>';
 [0,1,2].forEach(function(n){var one=p.stx&&p.stx.cm&&p.stx.cm.dm[n]?p.stx.cm.dm[n].one:"";h+='<h3>Demo '+(n+1)+(one?': '+esc(one):'')+'</h3>';PUSK.forEach(function(k){var o=u.d[n][k[0]],lab=k[1]+(k[0]==="rev"?" ("+sym(S.focus.currency).trim()+")":"");h+='<div class="q"><strong>'+esc(lab)+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="pus-vs" data-n="'+n+'" data-k="'+k[0]+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-pus="'+n+'.'+k[0]+'" value="'+esc(o.v)+'" aria-label="'+esc("Demo "+(n+1)+": "+k[1])+'" style="max-width:160px">':'')+'</div>';});});
 return h+'<p class="row"><button type="button" class="btn" data-a="pus-save">Save as a post-sprint update</button><button type="button" class="btn ghost" data-a="pus-cancel">Cancel</button></p>';
}
function pusAction(a,d){
 var u=UI.pus||null;
 if(a==="pus-open"){var i=+d.i,p=(S.past||[])[i];if(!p||p.exp!=="show"||!p.stx||!pastWinOpen(p))return;UI.pus=null;u=pusDraft();u.i=i;}
 else if(a==="pus-cancel"){UI.pus=null;}
 else if(a==="pus-vs"){u=pusDraft();var n=+d.n;if(!(n===0||n===1||n===2)||STSK.indexOf(d.k)<0||!ETVS[d.v]||d.v==="")return;var o=u.d[n][d.k];o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";}
 else if(a==="pus-save"){
  if(!u)return;var p2=(S.past||[])[u.i];if(!p2||p2.exp!=="show"||!p2.stx||!pastWinOpen(p2))return;
  var any=false;u.d.forEach(function(x,n2){STSK.forEach(function(k){var o2=x[k];if(o2.s){any=true;p2.stx.res.d[n2][k]={s:o2.s,v:o2.s==="value"?w4Clean(k,o2.v):""};}});});
  if(!any)return;p2.stx.res.at=today();
  var keep=S.sts;S.sts=p2.stx;var v;try{v=stsVerdict();}finally{S.sts=keep;}
  var e={at:today(),label:v.label,rule:v.rule,ctr:{msgs:0,resp:0,opp:0},res:{},kind:"update",asOf:"",late:false,prov:false};
  p2.upd=p2.upd||[];if(p2.upd.length&&p2.upd[p2.upd.length-1].at===e.at)p2.upd[p2.upd.length-1]=e;else if(p2.upd.length<RVMAX)p2.upd.push(e);else return;
  UI.pus=null;save();
 }
 else return;
 render();
}
function pusInput(t){var u=pusDraft(),m=/^([0-2])\.(views|clicks|orders|rev)$/.exec(String(t.dataset.pus));if(!m)return;var o=u.d[+m[1]][m[2]];if(o&&o.s==="value"){var c=w4Clean(m[2],t.value);o.v=c;if(c!==t.value)t.value=c;}}

/* --- actions and input --- */
function stsSetPath(path,val){
 var p=String(path).split("."),o=S.sts;for(var i=0;i<p.length-1;i++){o=o[/^\d$/.test(p[i])?+p[i]:p[i]];if(o==null)return false;}
 o[/^\d$/.test(p[p.length-1])?+p[p.length-1]:p[p.length-1]]=val;return true;
}
var STSTXT=[[/^pr\.product$/,120],[/^pr\.who$/,200],[/^wh\.name$/,120],[/^tk\.refs\.[0-2]$/,200],[/^dm\.[0-2]\.one$/,120],[/^dm\.[0-2]\.hook$/,200],[/^dm\.[0-2]\.shown$/,500],[/^dm\.[0-2]\.ask$/,200]];
function stsAddConf(){
 var E=S.sts,u=UI.stsf||{};if(!E.cm||E.cf.length>=60)return false;
 var d=u.d||today();if(parseYmd(d)==null||d>today()||d<addDays(E.cm.sch[0],-7))return false;
 if(!stsConfKind(u.k))return false;if(u.k==="other"&&u.maj!==true&&u.maj!==false)return false;
 E.cf.push({id:E.nid++,d:d,at:today(),k:u.k,maj:u.k==="other"?u.maj===true:true,note:String(u.note||"").trim().slice(0,300),wd:""});UI.stsf=null;return true;
}
function stsLogDate(i,v){
 var E=S.sts;if(!E.cm||!(i>=0&&i<3))return false;
 if(v===""){E.pb[i].d="";return true;}
 if(parseYmd(v)==null||v>today()||v<E.cm.at)return false;
 if(rvCur()&&v<rvStart())return false;
 E.pb[i].d=v;return true;
}
function stsAction(a,d){
 var E=S.sts,i=+d.i,di=(i===0||i===1||i===2);
 if(a==="sts-done"){var st=[E.steps,E.steps2,E.st3,E.st4][(+d.w)-1];if(!st||!/^[1-5]$/.test(String(d.n))||+d.n>STSSTEPS[(+d.w)-1].length)return;st[d.n]=!st[d.n];save();}
 else if(a==="sts-dec"){var w=+d.w;if(w===1&&d.v==="next")E.dec=E.dec===d.v?"":d.v;else if(w===2&&d.v==="next")E.dec2=E.dec2===d.v?"":d.v;else if(w===3&&d.v==="next")E.dec3=E.dec3===d.v?"":d.v;else if(w===4&&d.v==="done")E.dec4=E.dec4===d.v?"":d.v;else return;save();}
 else if(a==="sts-q"){UI.stsq=UI.stsq||{};UI.stsq[d.q]=d.v;}
 else if(a==="sts-ch"){if(E.cm||!stsChLabel(d.v))return;E.wh.ch=E.wh.ch===d.v?"":d.v;save();}
 else if(a==="sts-trk"){if(["link","code","ask","none"].indexOf(d.v)<0||E.cm)return;E.tk.trk=E.tk.trk===d.v?"":d.v;save();}
 else if(a==="sts-fmt"){if(E.cm||!di||!STSFMT.some(function(x){return x[0]===d.v;}))return;E.dm[i].fmt=E.dm[i].fmt===d.v?"":d.v;save();}
 else if(a==="sts-in"){if(E.cm||!di||!STSIN.some(function(x){return x[0]===d.k;}))return;if(E.dm[i].inn[d.k])delete E.dm[i].inn[d.k];else E.dm[i].inn[d.k]=true;if(!Object.keys(E.dm[i].inn).length)E.dm[i].perm=false;save();}
 else if(a==="sts-perm"){if(E.cm||!di||!Object.keys(E.dm[i].inn).length)return;E.dm[i].perm=!E.dm[i].perm;save();}
 else if(a==="sts-vs"){if(!STSVSPATH.test(String(d.p))||!ETVS[d.v]||d.v==="")return;if(/^res\./.test(d.p)&&!E.cm)return;var o=stsGet(d.p);if(!o)return;o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";if(/^res\./.test(d.p))E.res.at=today();save();}
 else if(a==="sts-tick"){if(E.cm||!STSTICKS.some(function(t){return t[0]===d.k;}))return;if(E.ticks[d.k])delete E.ticks[d.k];else E.ticks[d.k]=true;save();}
 else if(a==="sts-confirm"){if(!stsReady().ok)return;UI.stsc=true;}
 else if(a==="sts-cancel"){UI.stsc=false;}
 else if(a==="sts-commit"){if(!UI.stsc)return;UI.stsc=false;if(!stsCommit())return;save();}
 else if(a==="sts-fk"){if(!stsConfKind(d.v))return;UI.stsf=UI.stsf||{};UI.stsf.k=UI.stsf.k===d.v?"":d.v;if(UI.stsf.k!=="other")delete UI.stsf.maj;}
 else if(a==="sts-fmaj"){UI.stsf=UI.stsf||{};if(UI.stsf.k!=="other"||(d.v!=="yes"&&d.v!=="no"))return;UI.stsf.maj=d.v==="yes";}
 else if(a==="sts-fadd"){if(!stsAddConf())return;save();}
 else if(a==="sts-fwd"){var c=E.cf.filter(function(x){return x.id===+d.id;})[0];if(!c||c.wd)return;c.wd=today();save();}
 else if(a==="sts-nx"){if(!STSNEXT.some(function(x){return x[0]===d.v;}))return;E.nx=E.nx===d.v?"":d.v;save();}
 else if(a==="sts-pprod"){if(d.v!=="yes"&&d.v!=="no")return;E.prep.prod=E.prep.prod===d.v?"":d.v;if(E.prep.prod!=="yes")E.prep.place=false;save();}
 else if(a==="sts-pplace"){if(E.prep.prod!=="yes")return;E.prep.place=!E.prep.place;save();}
 else return;
 render();
}
function stsInput(t){
 var E=S.sts,k=String(t.dataset.sts);
 if(k==="f:d"){var v=String(t.value||"");UI.stsf=UI.stsf||{};if(v===""||parseYmd(v)!=null)UI.stsf.d=v;return;}
 if(k==="f:note"){UI.stsf=UI.stsf||{};UI.stsf.note=String(t.value||"").slice(0,300);return;}
 if(k.indexOf("n:")===0){var p=k.slice(2);if(!STSVSPATH.test(p))return;if(/^res\./.test(p)&&!E.cm)return;var o=stsGet(p);if(o&&o.s==="value"){var c=w4Clean("n",t.value);o.v=c;if(c!==t.value)t.value=c;if(/^res\./.test(p))E.res.at=today();save();}return;}
 if(E.cm&&/^(pr|wh|tk|dm|sch)\./.test(k))return;
 var tx=STSTXT.filter(function(x){return x[0].test(k);})[0];
 if(tx){stsSetPath(k,String(t.value).slice(0,tx[1]));save();return;}
 if(/^sch\.[0-2]$/.test(k)){var dv=String(t.value||"");if(dv===""||parseYmd(dv)!=null){stsSetPath(k,dv);save();render();}return;}
 var m=/^pb\.([0-2])\.d$/.exec(k);if(m){if(stsLogDate(+m[1],String(t.value||""))){save();render();}return;}
}

/* --- the experiment adapter, for Show-to-Sell (outer wrappers: Show first, then Email, then Etsy, then Partnership) --- */
EXPKEY.show="show";EXPOPEN.show=true;
var _rvExp6=rvExp;rvExp=function(){return stsActive()?"show":_rvExp6();};
var _xaName6=xaName;xaName=function(){return stsActive()?"Show-to-Sell":_xaName6();};
var _xaTotal6=xaTotal;xaTotal=function(){return stsActive()?STSTOTAL:_xaTotal6();};
var _xaW46=xaW4;xaW4=function(){return stsActive()?"#/show/w4/2":_xaW46();};
var _xaW4S6=xaW4Step;xaW4Step=function(){return stsActive()?2:_xaW4S6();};
var _sprHasWork6=sprHasWork;sprHasWork=function(){return stsActive()?stsHasWork():_sprHasWork6();};
var _rvSnap6=rvSnap;rvSnap=function(k){return stsActive()?stsSnap(k):_rvSnap6(k);};
var _tabOf6=tabOf;tabOf=function(r){r=r||"#/";if(/^#\/show(\/|$)/.test(r))return stsActive()?"sprint":"exp";return _tabOf6(r);};
var _rWeeks6=rWeeks;rWeeks=function(){return stsActive()?stsWeeks():_rWeeks6();};
var _rTrack6=rTrack;
rTrack=function(){
 if(!stsActive())return _rTrack6();
 return '<div class="rweeks">'+stsWeeks().map(function(w){var inner='<small>Week '+w.n+'</small><b>'+esc(w.title)+'</b>'+rBars(w)+'<em>'+esc(w.status)+'</em>';return w.open?'<a class="rwk '+w.state+'" href="#/show/w'+w.n+'">'+inner+'</a>':'<div class="rwk later">'+inner+'</div>';}).join("")+'</div>';
};
var _rNext6=rNext;
rNext=function(){
 if(!(stsActive()&&(SPR.loaded?rvPhase():"during")==="during"))return _rNext6();
 var wk=stsCurWeek(),W=stsWeeks()[wk-1],first=W.first;
 if(!first)return {k:"Your next step",t:"Open your results",d:"You have finished every step. Your results, your evidence reading and your Day 30 review are in one place.",link:"#/results",b:"Open my results"};
 var s=W.L[first-1];
 return {k:"Your next step",t:s.t,d:"You will need: "+s.b+" Everything saves as you go.",m:s.m,link:stsWeekBase(wk)+first,b:"Continue Week "+wk+", step "+first,w:wk,n:first};
};
var _rHomeList6=rHomeList;
rHomeList=function(nx){
 var ph=SPR.loaded?rvPhase():"during";
 if(!stsActive()||ph!=="during")return _rHomeList6(nx);
 var W=stsWeeks()[stsCurWeek()-1];
 return '<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,stsWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
};
var _rSoFar6=rSoFar;
rSoFar=function(){
 if(!stsActive())return _rSoFar6();
 var E=S.sts,h='<div class="card"><h2>Your sprint so far</h2>';
 if(!stsStepCount()&&!E.cm)return h+'<p class="mute">Your numbers appear here once you begin. What you did, what came back and what sold are always kept apart.</p></div>';
 h+='<div class="tiles"><div class="tile"><b>'+stsStepCount()+'</b><span>Steps done</span></div><div class="tile"><b>'+stsOut().length+' of 3</b><span>Demos published</span></div><div class="tile"><b aria-hidden="true">'+(E.cm?"&#10003;":"&ndash;")+'</b><span>Plan committed<span class="sr">: '+(E.cm?"yes":"not yet")+'</span></span></div></div>';
 return h+'<p><a class="link" href="#/results">Open your results</a></p></div>';
};
var _home6=home;home=function(){return stsActive()?stsMySprint():_home6();};
var _resultsPage6=resultsPage;resultsPage=function(){return stsActive()?stsResultsPage():_resultsPage6();};
var _reviewPage6=reviewPage;
reviewPage=function(){
 if(!stsActive())return _reviewPage6();
 var tail=_reviewPage6(),i=tail.indexOf('<div class="card"><h2>4. Complete your review</h2>');
 return stsReviewHead()+(i>-1?tail.slice(i):"");
};
var _etBlockP6=etBlockP;etBlockP=function(){return stsActive()?/^#\/(step\/[1-7]|w[234]\/[1-6])$/.test(route||""):_etBlockP6();};
var _etBlockHtml6=etBlockHtml;etBlockHtml=function(){return stsActive()?_etBlockHtml6().replace("This is your Etsy sprint","This is your Show-to-Sell sprint"):_etBlockHtml6();};

/* ---------- Find Your Buyers: find where your buyers already spend time, take part helpfully, and count what it brings. ----------
   Built on the shared sprint (clock, Home, My Sprint, Results, Day 30 review, update window, Past sprints) through the same
   experiment adapter as the other experiments. One measurable experiment: up to three places, a planned run of helpful
   contributions made by the member as themselves, and a count of responses, visits, enquiries and orders for each place.
   No unsolicited private messages, no copy-and-paste promotion, each place's own rules come first. The app never posts,
   comments or sends anything for the member. */
var FYBSTEPS=[
 [{n:1,t:"How taking part where your buyers already are leads to sales",m:20,b:"Nothing. A short lesson and a quick check."},
  {n:2,t:"Your buyer and where you start",m:25,b:"Your shop or payment tool, for the last 30 days."},
  {n:3,t:"Map the places your buyers already spend time",m:40,b:"Time to look around. You are only looking, not posting."},
  {n:4,t:"Read each place's rules and choose up to three",m:30,b:"The rules or guidelines page of each place."},
  {n:5,t:"Week 1 review",m:15,b:"Whatever you have done so far."}],
 [{n:1,t:"What a helpful contribution looks like",m:20,b:"Nothing. A short lesson."},
  {n:2,t:"Listen first",m:40,b:"Your chosen places. Read, do not post yet."},
  {n:3,t:"Draft three helpful contributions",m:45,b:"What you heard people asking."},
  {n:4,t:"How people will find you, and how you will count",m:25,b:"Your profile in each place, and a link or code."},
  {n:5,t:"Final checks, your plan and commit",m:25,b:"Your drafts and your chosen places."}],
 [{n:1,t:"Take part, then hold steady",m:15,b:"Nothing. A short read."},
  {n:2,t:"Contribution log",m:20,b:"What you posted, and where."},
  {n:3,t:"What else could explain the numbers?",m:20,b:"Anything you remember changing or happening."},
  {n:4,t:"Week 3 review",m:15,b:"Whatever you have done so far."}],
 [{n:1,t:"How to read a small result from taking part",m:25,b:"Nothing. A short lesson."},
  {n:2,t:"Record your numbers for each place",m:35,b:"Each place, and your orders for your link or code."},
  {n:3,t:"Your evidence verdict",m:20,b:"The numbers from step 2."},
  {n:4,t:"Decide what is next",m:25,b:"Your verdict."}]
];
var FYBWKT=["Map","Listen and prepare","Take part and watch","Read the result"];
var FYBWKD=["Find where your buyers already spend time, read the rules, and choose up to three places.","Listen first, draft helpful contributions, and set up how you will be found and counted.","Take part as yourself, leave things steady, and note anything else that could matter.","Record your numbers for each place, read the result, and decide what is next."];
var FYBTOTAL=18;
/* Provisional testing settings, kept in one place so they can be changed after review against real results. They are not
   validated industry benchmarks and not guarantees. minContrib is the least needed to describe a result at all; confContrib is
   where a reading becomes steadier. Neither is strong evidence by itself. */
var FYBCFG={minContrib:5,confContrib:12,minVisits:10,smallOrders:3,watchDays:7,minDays:7,maxDays:21,unevenContrib:2,maxPlaces:3};
var FYBK=["resp","visits","enq","orders","rev"];
var FYBKL={resp:"Replies or reactions to what you contributed",visits:"Visits to your profile or link from there",enq:"People who asked about your product",orders:"Orders you can trace to this place",rev:"Revenue from those orders"};
var FYBKIND=[["group","An online group or community"],["forum","A forum or question site"],["social","Comments and conversations on social media"],["local","A local group, market or event"],["other","Somewhere else"]];
var FYBTALK=[["yes","Yes, often"],["some","Sometimes"],["no","Not really"]];
var FYBRULES=[["links","Members may share their own links when it is relevant"],["mention","I may say what I do when asked or when relevant, but no links"],["nopromo","No promotion of any kind"],["unsure","I could not find the rules"]];
var FYBRULEL={links:"Links allowed when relevant",mention:"Mentions only, no links",nopromo:"No promotion",unsure:"Rules not found"};
var FYBHAS=[["none","No. It only helps"],["mention","It mentions my product, with no link"],["link","It includes a link"]];
var FYBTRK=[["link","A link that only this experiment uses"],["code","A code that only this experiment uses"],["ask","I will ask each buyer how they found me"],["none","I cannot track it yet"]];
var FYBTRKL={link:"A link",code:"A code",ask:"Asking each buyer",none:"Not yet"};
var FYBGOAL=["5","8","12"];
var FYBTICKS=[["rules","I have read the rules of each place I chose, and I will follow them."],["helpful","Every contribution will be useful to the people reading it, even if nobody buys."],["nodm","I will not send private messages to people who have not asked me to."],["honest","When I mention my product, I will say plainly that it is mine."],["nocopy","I will not paste the same message into several places."],["proof","I understand a few weeks of taking part is a small test and not proof."]];
var FYBLK=[["answer","An answer to someone's question"],["comment","A helpful comment"],["post","A post of my own"],["asked","A reply to someone who asked about my product"]];
var FYBLM=[["none","No"],["asked","Yes, because someone asked"],["allowed","Yes, the rules allow it and it was relevant"]];
var FYBCONF=[["price","I changed the price"],["promo","I ran a sale or another promotion"],["ads","I ran ads or posted about the product elsewhere"],["partner","Someone else recommended or shared my product"],["removed","A contribution was removed, or I was asked to stop"],["stock","The product was out of stock, or the page was not working"],["season","A major seasonal or holiday period"],["ext","A mention or press that sent unusual traffic"],["other","Something else"]];
var FYBNEXT=[["keep","Keep taking part in the place that responded"],["newplace","Try a different place"],["newkind","Try a different kind of contribution"],["page","Work on my page, price or offer first"],["other","Take what I learned to a different experiment"],["unsure","I am not sure yet"]];
var FYBS=(function(){
 var s=function(n){return {t:"s",n:n};},v={t:"v"},b={t:"b"},d={t:"d"},e=function(a){return {t:"e",v:a};},ks=function(a){return [""].concat(a.map(function(x){return x[0];}));};
 return {t:"o",f:{
  prep:{t:"o",f:{buyer:e(["","yes","no"]),place:b}},
  steps:{t:"m",k:/^[1-5]$/,i:b},steps2:{t:"m",k:/^[1-5]$/,i:b},st3:{t:"m",k:/^[1-4]$/,i:b},st4:{t:"m",k:/^[1-4]$/,i:b},
  dec:e(["","next"]),dec2:e(["","next"]),dec3:e(["","next"]),dec4:e(["","done"]),
  pr:{t:"o",f:{product:s(120),buyer:s(200),problem:s(200)}},
  bl:{t:"o",f:{enq30:v,orders30:v,rev30:v}},
  pl:{t:"a",n:6,i:{t:"o",f:{id:{t:"n"},name:s(80),kind:e(ks(FYBKIND)),talk:e(ks(FYBTALK)),rules:e(ks(FYBRULES)),heard:s(300),pick:b}}},
  pid:{t:"n"},
  dr:{t:"a",n:3,i:{t:"o",f:{p:s(3),about:s(120),text:s(600),has:e(ks(FYBHAS))}}},
  tk:{t:"o",f:{trk:e(["","link","code","ask","none"]),ref:s(200),bio:s(200)}},
  ticks:{t:"m",k:/^(rules|helpful|nodm|honest|nocopy|proof)$/,i:b},
  tg:e([""].concat(FYBGOAL)),
  per:{t:"o",f:{from:d,to:d}},
  cm:{t:"c"},
  lg:{t:"a",n:40,i:{t:"o",f:{id:{t:"n"},d:d,at:d,p:s(3),k:e(ks(FYBLK)),m:e(ks(FYBLM)),note:s(200),wd:d}}},
  lid:{t:"n"},
  cf:{t:"a",n:60,i:{t:"o",f:{id:{t:"n"},d:d,at:d,k:e(FYBCONF.map(function(x){return x[0];})),maj:b,note:s(300),wd:d}}},
  nid:{t:"n"},
  res:{t:"o",f:{d:{t:"a",n:3,i:{t:"o",f:{resp:v,visits:v,enq:v,orders:v,rev:v}}},at:d}},
  nx:e(ks(FYBNEXT))
 }};
})();
function FYBDEF(){return emDef(FYBS);}
function fybIdOk(x){return typeof x==="number"&&x===Math.floor(x)&&x>0&&x<=100000;}
function fybUniq(list,ok){var seen={},mx=0,out=[];(Array.isArray(list)?list:[]).forEach(function(x){if(x&&typeof x==="object"&&fybIdOk(x.id)&&!seen[x.id]&&(!ok||ok(x))){seen[x.id]=1;if(x.id>mx)mx=x.id;out.push(x);}});return {list:out,max:mx};}
function fybNext(w,mx){return Math.max(mx+1,(typeof w==="number"&&w===Math.floor(w)&&w>0&&w<=100001)?w:1);}
function fybfix(o){
 var w=(o.fyb&&typeof o.fyb==="object"&&!Array.isArray(o.fyb))?o.fyb:{},r=emClean(FYBS,w,FYBDEF()),isd=function(y){return typeof y==="string"&&parseYmd(y)!=null;},st=function(y,n){return typeof y==="string"?y.slice(0,n):"";};
 // places: unique ids, at most six, at most three chosen, and a place can only be chosen once its rules are known
 var u=fybUniq(Array.isArray(w.pl)?w.pl.slice(0,60):[]),picks=0;u.list=u.list.slice(0,6);u.max=u.list.reduce(function(a,x){return Math.max(a,x.id);},0);
 r.pl=u.list.map(function(x){var c=emClean(FYBS.f.pl.i,x,emDef(FYBS.f.pl.i));c.id=x.id;if(c.pick&&(!fybRuleKnown(c.rules)||picks>=FYBCFG.maxPlaces))c.pick=false;if(c.pick)picks++;return c;});
 r.pid=fybNext(w.pid,u.max);
 // the contribution log: unique ids, valid dates and kinds only
 var lu=fybUniq(Array.isArray(w.lg)?w.lg.slice(0,40):[],function(x){return isd(x.d)&&isd(x.at)&&FYBLK.some(function(k){return k[0]===x.k;})&&/^\d{1,3}$/.test(String(x.p));});
 r.lg=lu.list.map(function(x){return {id:x.id,d:x.d,at:x.at,p:String(x.p),k:x.k,m:FYBLM.some(function(k){return k[0]===x.m;})?x.m:"none",note:st(x.note,200),wd:isd(x.wd)?x.wd:""};});
 r.lid=fybNext(w.lid,lu.max);
 var cu=fybUniq(Array.isArray(w.cf)?w.cf.slice(0,60):[],function(x){return isd(x.d)&&isd(x.at)&&FYBCONF.some(function(c){return c[0]===x.k;});});
 r.cf=cu.list.map(function(x){return {id:x.id,d:x.d,at:x.at,k:x.k,maj:x.k==="other"?x.maj===true:true,note:st(x.note,300),wd:isd(x.wd)?x.wd:""};});
 r.nid=fybNext(w.nid,cu.max);
 // the committed plan: a commit date, a period in order, and one to three places whose rules were known
 var c=w.cm;r.cm=null;
 if(c&&typeof c==="object"&&!Array.isArray(c)&&isd(c.at)&&isd(c.from)&&isd(c.to)&&c.from<=c.to&&Array.isArray(c.places)){
  var pu=fybUniq(c.places.slice(0,30),function(x){return fybRuleKnown(x.rules);});pu.list=pu.list.slice(0,3);
  if(pu.list.length>=1)r.cm={at:c.at,from:c.from,to:c.to,places:pu.list.map(function(x){return {id:x.id,name:st(x.name,80),kind:FYBS.f.pl.i.f.kind.v.indexOf(x.kind)>-1?x.kind:"",rules:x.rules};}),trk:FYBS.f.tk.f.trk.v.indexOf(c.trk)>-1?c.trk:"",ref:st(c.ref,200),tg:FYBGOAL.indexOf(c.tg)>-1?c.tg:"",what:st(c.what,200)};
 }
 o.fyb=r;return o;
}
/* ===== FIND LOGIC START: pure rules, checked by dev/find_e7_tests.js ===== */
function fybN(o){var s=vstate(o);return s==="pos"?+o.v:(s==="zero"?0:null);}
function fybFmt(o,money){var s=vstate(o),c=money?sym(S.focus.currency):"";return s==="pos"?c+String(+o.v):(s==="zero"?c+"0 (confirmed)":"not seen");}
function fybRuleKnown(r){return r==="links"||r==="mention"||r==="nopromo";}
function fybActive(){var c=rvCur();return !!c&&c.experiment==="find";}
function fybPrepReady(){var p=S.fyb.prep;return p.buyer==="yes"&&p.place===true;}
function fybStepsOf(i){return FYBSTEPS[i];}
function fybDOf(i){var E=S.fyb;return [E.steps,E.steps2,E.st3,E.st4][i]||{};}
function fybWeekDone(i){var E=S.fyb,L=fybStepsOf(i),D=fybDOf(i);return L.every(function(s){return D[s.n];})||[E.dec==="next",E.dec2==="next",E.dec3==="next",E.dec4==="done"][i];}
function fybCurWeek(){for(var i=0;i<4;i++){if(!fybWeekDone(i))return i+1;}return 4;}
function fybWeekBase(w){return w===1?"#/find/":"#/find/w"+w+"/";}
function fybStepCount(){var n=0;for(var i=0;i<4;i++)n+=rCount(fybStepsOf(i),fybDOf(i));return n;}
function fybWeeks(){
 var cur=fybCurWeek(),out=[];
 for(var i=0;i<4;i++){
  var L=fybStepsOf(i),D=fybDOf(i),n=rCount(L,D),tot=L.length,st=(i+1<cur)?"done":(i+1===cur?"now":"later"),first=0;
  if(st==="now"){for(var j=0;j<tot;j++){if(!D[L[j].n]){first=L[j].n;break;}}}
  out.push({n:i+1,title:FYBWKT[i],L:L,D:D,done:n,total:tot,state:st,open:i===0||fybWeekDone(i-1),first:first,status:st==="later"?"Opens when you finish Week "+i:(st==="done"&&n===tot?"Done":n+" of "+tot+" steps done")});
 }
 return out;
}
function fybPlace(id){return S.fyb.pl.filter(function(x){return String(x.id)===String(id);})[0]||null;}
function fybPicked(){return S.fyb.pl.filter(function(x){return x.pick;});}
/* the places the plan is about: the committed ones once committed, otherwise the ones chosen so far */
function fybPlan(){var c=S.fyb.cm;return c?c.places:fybPicked().map(function(x){return {id:x.id,name:x.name,kind:x.kind,rules:x.rules};});}
function fybPlanPlace(id){return fybPlan().filter(function(x){return String(x.id)===String(id);})[0]||null;}
function fybDays(a,b){var x=parseYmd(a),y=parseYmd(b);if(x==null||y==null)return 0;return Math.round((y-x)/86400000);}
function fybList(a){return a.length===1?String(a[0]):(a.slice(0,-1).join(", ")+" and "+a[a.length-1]);}
function fybPerCheck(per,at){
 var r={ok:false,why:"",t:"",b:""},tod=at||today(),f=per&&per.from,t=per&&per.to;
 if(!f||!t||parseYmd(f)==null||parseYmd(t)==null){r.why="missing";r.t="Choose a first day and a last day";r.b="The days you will take part between.";return r;}
 if(f<tod){r.why="past";r.t="The first day has passed";r.b="Choose today or a day ahead, so the plan is made before you take part.";return r;}
 var n=fybDays(f,t)+1;
 if(n<FYBCFG.minDays){r.why="short";r.t="Give yourself at least "+FYBCFG.minDays+" days";r.b="Taking part a little over several days is more natural, and more welcome, than a burst in one day.";return r;}
 if(n>FYBCFG.maxDays){r.why="long";r.t="Keep it to "+FYBCFG.maxDays+" days or fewer";r.b="A shorter period keeps this to one clear test inside your sprint.";return r;}
 var w={from:f,to:addDays(t,FYBCFG.watchDays),readOn:addDays(t,FYBCFG.watchDays+1),days:n};r.w=w;
 if(rvCur()){
  if(f<rvStart()){r.why="beforestart";r.t="That is before your sprint began";r.b="Your sprint began on "+dayLab(rvStart())+".";return r;}
  if(w.to>rvEnd()){r.why="toolate";r.t="That runs past the end of your update window";r.b="Your contribution period and the "+FYBCFG.watchDays+" days of watching afterwards would end on "+dayLab(w.to)+", after your update window closes on "+dayLab(rvEnd())+". Choose earlier days, or plan it for your next sprint.";return r;}
  if(w.to>rvDay30())r.prov=true;
 }
 r.ok=true;return r;
}
function fybHas(m){return /(https?:\/\/|www\.)/i.test(m.text)?"link":(m.has||"none");}
/* a draft contribution: "issues" are worth another look; "blocks" would break the place's own rules and stop the plan */
function fybDraftCheck(m){
 var txt=m.text.trim(),words=txt?txt.split(/\s+/).length:0,issues=[],blocks=[],notes=[],p=m.p?fybPlanPlace(m.p):null,has=fybHas(m);
 if(!m.about.trim())issues.push("Say which question or need this answers.");
 if(!txt)issues.push("Write the contribution.");
 if(!p)issues.push("Choose which of your places it is for.");
 if(words>0&&words<15)issues.push("It is very short. A fuller answer is more useful to the person reading.");else if(words>220)issues.push("It is long. Most people read a short, direct answer.");
 if(/(buy now|dm me|message me|inbox me|check out my|link in (my )?bio|limited time|special offer|use (my )?code|click here|don't miss)/i.test(txt))issues.push("Part of this reads like a pitch. Lead with help, and let people come to you.");
 if(txt.length>20&&txt===txt.toUpperCase()&&/[A-Z]{4}/.test(txt))issues.push("Avoid writing in capitals.");
 if(/(guarantee|get rich|earn \$|earn £|100% (safe|sure)|cures?\b|miracle|risk[- ]free|never fails|instant results)/i.test(txt))issues.push("Avoid promises you cannot keep, such as guarantees, cures or income claims.");
 if(p&&has==="link"&&p.rules!=="links")blocks.push("This place does not allow links. Take the link out, or use it somewhere that allows links.");
 if(p&&has!=="none"&&p.rules==="nopromo")blocks.push("This place allows no promotion. Keep this contribution purely helpful, with no mention of your product.");
 if(has!=="none"&&!blocks.length)notes.push("When you mention your product, say plainly that it is yours.");
 return {words:words,issues:issues,blocks:blocks,notes:notes,has:has,ok:issues.length===0&&blocks.length===0};
}
function fybDraftFilled(m){return !!(m.about.trim()&&m.text.trim()&&fybPlanPlace(m.p));}
function fybReady(){
 var E=S.fyb,m=[];
 if(E.cm)return {ok:false,done:true,miss:[]};
 if(!E.pr.product.trim())m.push("The one product you hope people will find (Week 1, step 2)");
 var pk=fybPicked();
 if(!pk.length)m.push("At least one place chosen, with its rules read (Week 1, step 4)");
 if(pk.some(function(x){return !x.name.trim();}))m.push("A name for each chosen place (Week 1, step 3)");
 if(!E.tk.trk)m.push("How you will count orders (Week 2, step 4)");
 var filled=E.dr.filter(fybDraftFilled);
 if(filled.length<2)m.push("At least two drafted contributions, each with what it answers, its words and its place (Week 2, step 3)");
 E.dr.forEach(function(d,i){if(fybDraftFilled(d)){var c=fybDraftCheck(d);if(c.blocks.length)m.push("Draft "+(i+1)+" would break a place's rules: "+c.blocks[0]+" (Week 2, step 3)");}});
 var tx=filled.map(function(x){return x.text.trim().toLowerCase().replace(/\s+/g," ");});
 if(tx.some(function(x,i){return tx.indexOf(x)!==i;}))m.push("Two drafts are the same words. Write each one for its own place and question (Week 2, step 3)");
 if(FYBTICKS.some(function(x){return E.ticks[x[0]]!==true;}))m.push("All six checks ticked (step 5)");
 if(!E.tg)m.push("About how many contributions you plan to make (step 5)");
 var pc=fybPerCheck(E.per);if(!pc.ok)m.push("Valid days to take part (step 5): "+pc.t);
 return {ok:m.length===0,done:false,miss:m,pc:pc};
}
function fybCommit(){
 var E=S.fyb,r=fybReady();if(!r.ok)return false;
 E.cm={at:today(),from:E.per.from,to:E.per.to,places:fybPicked().slice(0,FYBCFG.maxPlaces).map(function(x){return {id:x.id,name:x.name.trim().slice(0,80),kind:x.kind,rules:x.rules};}),trk:E.tk.trk,ref:E.tk.ref,tg:E.tg,what:E.pr.product.trim().slice(0,200)};
 return true;
}
function fybLog(asOf){return S.fyb.lg.filter(function(x){if(x.wd&&(!asOf||x.wd<=asOf))return false;if(asOf&&x.at>asOf)return false;return !!fybPlanPlace(x.p);});}
function fybCounts(asOf){var L=fybLog(asOf);return fybPlan().map(function(p){return L.filter(function(x){return String(x.p)===String(p.id);}).length;});}
function fybWin(){
 var E=S.fyb;if(!E.cm)return null;var ds=fybLog().map(function(x){return x.d;}).sort(),last=ds.length&&ds[ds.length-1]>E.cm.to?ds[ds.length-1]:E.cm.to;
 return {from:E.cm.from,to:addDays(last,FYBCFG.watchDays),readOn:addDays(last,FYBCFG.watchDays+1),last:last,n:ds.length};
}
function fybConfKind(k){return FYBCONF.filter(function(x){return x[0]===k;})[0]||null;}
function fybConfMajor(c){return c.k==="other"?c.maj===true:!!fybConfKind(c.k);}
function fybConfs(asOf){
 var E=S.fyb,w=fybWin(),r={major:[],minor:[],outside:[]};
 E.cf.forEach(function(c){
  if(c.wd&&(!asOf||c.wd<=asOf))return;if(asOf&&c.at>asOf)return;
  var lo=E.cm?addDays(E.cm.from,-7):"";
  if(!w||c.d<lo||c.d>w.to){r.outside.push(c);return;}
  (fybConfMajor(c)?r.major:r.minor).push(c);
 });
 return r;
}
function fybNums(asOf){
 var E=S.fyb,known=!(asOf&&(!E.res.at||E.res.at>asOf));
 return fybPlan().map(function(p,i){var o={};FYBK.forEach(function(k){var x=E.res.d[i][k];o[k]=known?{s:x.s,v:x.v}:{s:"",v:""};});return o;});
}
function fybSum(nm,k){var n=0,c=0;nm.forEach(function(x){var y=fybN(x[k]);if(y!==null){n+=y;c++;}});return {n:Math.round(n*100)/100,k:c,of:nm.length};}
function fybFmtSum(s,money){var c=money?sym(S.focus.currency):"";if(s.k===0)return "not seen";if(s.k===s.of)return s.n===0?c+"0 (confirmed)":c+String(s.n);return c+String(s.n)+" from "+s.k+" of "+s.of+" places";}
/* what each place brought, as counts side by side. This describes what happened. It never says a place is better. */
function fybCompare(nm,cnt){
 var P=fybPlan(),o=nm.map(function(x){return fybN(x.orders);});
 if(o.some(function(x){return x===null;}))return {kind:"unknown",line:"Orders are not recorded for every place, so the places cannot be set side by side yet.",uneven:false};
 var mx=Math.max.apply(null,cnt),mn=Math.min.apply(null,cnt),uneven=P.length>1&&(mn===0?mx>0:mx>=FYBCFG.unevenContrib*mn);
 var parts=P.map(function(p,i){return (p.name||"Place "+(i+1))+": "+cnt[i]+" contribution"+(cnt[i]===1?"":"s")+", "+o[i]+" order"+(o[i]===1?"":"s");});
 return {kind:P.length>1?"many":"one",line:parts.join(". ")+".",uneven:uneven,orders:o};
}
function fybCaveats(nm,od,cnt,cmp){
 var E=S.fyb,lines=[],conf="fair",tot=cnt.reduce(function(a,b){return a+b;},0);
 if(tot<FYBCFG.confContrib){conf="limited";lines.push("You made "+tot+" contribution"+(tot===1?"":"s")+". Below about "+FYBCFG.confContrib+", a few people either way can change the picture, so this is too limited to support a confident conclusion. Treat it as a hint.");}
 if(od>0&&od<FYBCFG.smallOrders){if(conf==="fair")conf="lower";lines.push("Orders are a very small count ("+od+" in total). One or two orders are well within chance.");}
 if(cmp.uneven){if(conf==="fair")conf="lower";lines.push("You contributed different amounts in each place ("+fybList(cnt)+"), so the places did not have the same chance to respond. Their numbers are not like for like, and equal orders would not mean the places did equally well.");}
 else if(cmp.kind==="many")lines.push("The places are different sizes and you took part on different days, so they never have exactly the same chance to respond.");
 if(E.cm&&E.cm.trk==="ask"){if(conf==="fair")conf="lower";lines.push("You counted orders by asking buyers how they found you. Memory is not exact, so treat the split between places as a rough guide.");}
 return {conf:conf,lines:lines};
}
function fybVerdict(asOf){
 var E=S.fyb,cm=E.cm,small="A few weeks of taking part in a few places is a small test. It shows what happened, not what will always happen.";
 var fin=function(v,c,cmp){v.conf=c;v.cmp=cmp||null;v.strength=c==="fair"?"There is enough here to describe what happened, and it is a fair first reading for a small test. It is still not strong evidence.":((c==="limited"||c==="lower")?"There is enough here to describe what happened. There is not enough to draw a firm conclusion.":(v.rule==="F4"?"There is not yet enough here to describe a result.":""));return v;};
 if(!cm)return fin(vmk("Insufficient evidence","info","F1",["No plan is committed yet, so there is nothing to read."],["This says nothing about your product or your buyers, because nothing has been tested."],["Finish Week 2 and commit your plan."]),"none");
 var w=fybWin(),t=asOf||today(),cnt=fybCounts(asOf),tot=cnt.reduce(function(a,b){return a+b;},0);
 if(t<w.readOn)return fin(vmk("Insufficient evidence","info","F2",[t<=cm.to?"Your contribution period runs until "+dayLab(cm.to)+". You have logged "+tot+" contribution"+(tot===1?"":"s")+" so far.":"Your contribution period has finished, and people can still respond until "+dayLab(w.to)+"."],["A result read before people have had time to respond would be a guess."],[t<=cm.to?"Keep taking part as planned, and log each contribution.":"Wait until "+dayLab(w.readOn)+", then record your numbers."]),"none");
 if(tot===0)return fin(vmk("Insufficient evidence","info","F2",["No contributions are logged, so there is nothing to read."],["This says nothing about your product or these places, because nothing was tried."],["If you did take part, add it to your contribution log. If not, that is fine. You can plan it again in your next sprint."]),"none");
 var nm=fybNums(asOf),od=fybSum(nm,"orders"),en=fybSum(nm,"enq"),vi=fybSum(nm,"visits"),cmp=fybCompare(nm,cnt);
 if(od.k<od.of||en.k<en.of||cm.trk==="none"){
  var why=[];if(od.k<od.of)why.push("Orders are not recorded for every place.");if(en.k<en.of)why.push("The number of people who asked about your product is not recorded for every place.");if(cm.trk==="none")why.push("You said you could not track where an order came from.");
  return fin(vmk("Mixed or unclear","warn","F3",why,["Without these the result cannot be read. A number you could not see is kept as unknown, and is never read as zero.","If an order cannot be traced to where the buyer found you, we cannot say whether taking part brought it."],["Record what you can see for each place. For next time, use a link or a code that only this experiment uses."]),"unclear",cmp);
 }
 var nums="Contributions: "+tot+" across "+cnt.length+" place"+(cnt.length===1?"":"s")+". People who asked about your product: "+en.n+". Orders: "+od.n+"."+(vi.k===vi.of?" Visits: "+vi.n+".":"");
 if(tot<FYBCFG.minContrib)return fin(vmk("Insufficient evidence","info","F4",[nums,"Fewer than "+FYBCFG.minContrib+" contributions were made."],["That is too little taking part to describe a result. A few people either way changes everything.","The settings used are provisional starting points that will be reviewed against real results: "+FYBCFG.minContrib+" contributions is the least needed to describe a result, and about "+FYBCFG.confContrib+" is where a reading becomes steadier. Neither is strong evidence by itself."],["Take part a little longer in the same places before deciding anything."]),"none",cmp);
 var cf=fybConfs(asOf),cav=fybCaveats(nm,od.n,cnt,cmp);
 if(cf.major.length){
  return fin(vmk("Mixed or unclear","warn","F5",[nums,"You logged "+cf.major.length+" major thing"+(cf.major.length===1?"":"s")+" in this period that could also explain the numbers: "+cf.major.map(function(c){return (fybConfKind(c.k)||["","?"])[1].toLowerCase();}).join("; ")+"."],["Because something else changed or happened, the numbers cannot be put down to your taking part alone. Even with orders, this would not be called promising.",small].concat(cav.lines),["Write down what happened and when. For a cleaner answer, take part again with nothing else changing."]),"unclear",cmp);
 }
 if(od.n>0)return fin(vmk("Promising","ok","F6",[nums,cmp.line],["What you can see is orders after you took part. That is not the same as proof that taking part caused them. Some of these people may have bought anyway.",small,"This is encouraging. It is not proof."].concat(cmp.kind==="many"?["The counts for each place describe what happened in this test. They do not show that one place is better than another."]:[],cav.lines),["Keep taking part in the same helpful way where people responded, and see whether it happens again."]),cav.conf,cmp);
 if(en.n>0||vi.n>=FYBCFG.minVisits)return fin(vmk("Traffic but no sales","warn","F7",[nums,en.n>0?"People asked about your product, and you confirmed no orders.":"People came to look, and you confirmed no orders."],["This shows taking part brought interest. It does not show why nobody bought.",small].concat(cav.lines),[en.n>0?"Look at what happened after people asked: how you answered, the page, the price and the offer. Change one of those.":"Look at what people saw when they arrived: your profile, the page, the price and the offer. Change one of those."]),cav.conf,cmp);
 if(tot<FYBCFG.confContrib)return fin(vmk("Insufficient evidence","info","F8",[nums,"With this little taking part, no enquiries and no orders are within what chance could produce."],["This does not mean these places or your contributions did not work. There was too little to tell, so the evidence is limited.",small].concat(cav.lines),["Take part a little longer, or try one more place, before deciding anything."]),"limited",cmp);
 return fin(vmk("Approach needs reviewing","warn","F8",[nums,"You took part steadily, and nobody asked about your product or ordered."],["This does not mean the idea is wrong. A few weeks in a few places is one try.",small].concat(cav.lines),["Try changing one thing next: the place, the kind of contribution, or what your profile says about you."]),cav.conf,cmp);
}
function fybSnap(kind){
 var asOf=null,late=false,prov=false;
 if(kind==="day30"&&rvCur()){if(rvPhase()==="during")prov=true;else asOf=rvDay30();}
 if(asOf){var w=fybWin();if(w&&w.to>asOf)prov=true;if(S.fyb.res.at&&S.fyb.res.at>asOf)late=true;}
 var v=fybVerdict(asOf||null);
 return {at:today(),label:v.label,rule:v.rule,ctr:{msgs:0,resp:0,opp:0},res:{},kind:kind==="day30"?"day30":"update",asOf:asOf||"",late:late,prov:prov||(v.rule==="F2"&&!!S.fyb.cm&&(asOf||today())<fybWin().readOn)};
}
function fybHasRes(){return S.fyb.res.d.some(function(x){return FYBK.some(function(k){return !!x[k].s;});});}
function fybHasWork(){var E=S.fyb;return !!E.cm||E.lg.length>0||E.cf.length>0||fybHasRes();}
function fybFresh(prep){var e=FYBDEF();if(prep)e.prep=prep;return e;}
function fybStart(){var prep=S.fyb.prep;S.fyb=fybFresh(prep);var pn=String(S.focus.product||"").trim();if(pn)S.fyb.pr.product=pn.slice(0,120);var bw=String((S.buyer&&S.buyer.who)||"").trim();if(bw)S.fyb.pr.buyer=bw.slice(0,200);}
function fybRec(v){
 var l=v.label,r=v.rule,t,b,f,x="",bs,as;
 if(l==="Promising"){t="Keep taking part where people responded";b="Orders came after you took part. Carrying on in the same helpful way shows whether it happens again.";f="Choose the place where people responded, and plan the same number of helpful contributions there.";bs="Orders were recorded after you took part, with no major confounder logged.";as="We are assuming taking part, not something else, led to those orders. Your numbers cannot prove that.";}
 else if(l==="Traffic but no sales"){t="Improve what people find when they come to you";b="Taking part brought interest, so that part did its job. The next place to look is what people see next.";f="Choose one of your profile, your page, the price or how the offer is described, and change only that.";bs="People asked about your product or visited, and no orders were confirmed.";as="We are assuming what people saw next, not the places you chose, is the weak point. Your numbers cannot confirm that.";}
 else if(l==="Approach needs reviewing"){t="Change one thing, then take part again";b="You took part steadily and nobody asked or ordered. That is one try, not the end of the idea.";f="Change one thing: the place, the kind of contribution, or what your profile says about you.";x="If you would rather be introduced than build up slowly, Partnership-to-Sales is open now. You are free to choose it, or any other experiment that is open.";bs="No enquiries and no orders, with at least "+FYBCFG.confContrib+" contributions.";as="We are assuming your buyers are in the places you chose. They may gather somewhere else.";}
 else if(l==="Mixed or unclear"){t=r==="F3"?"Fill the gaps, then read it again":"Take part again with steady conditions";b="Something else changed, or an order could not be traced, so the result cannot be read cleanly.";f=r==="F3"?"Record the missing numbers, and use a link or code only this experiment uses next time.":"Write down what else happened, then take part again with nothing else changing.";bs=r==="F3"?"Some key numbers or the tracking were missing.":"Something else could explain the numbers.";as="We are assuming nothing else needed to be considered. If something did, please log it.";}
 else{t=(r==="F4"||r==="F8")?"Take part a little longer first":"Wait for your contribution period to finish";b=(r==="F4"||r==="F8")?"There was too little taking part to read a result. That says nothing about the places or your contributions, only that the numbers are small.":"Your result cannot be read yet.";f=(r==="F1")?"Finish Week 2 and commit your plan.":(r==="F2"?"Take part as planned, log each contribution, and come back after the watching period.":"Make a few more helpful contributions in the same places.");bs=(r==="F4"||r==="F8")?"Contributions were below the provisional minimum, or the evidence is limited.":"There is not enough yet to read.";as="We are assuming more taking part will give a steadier picture.";}
 return {t:t,b:b,first:f,extra:x,basis:bs,assume:as,provisional:rvPhase()==="during"||(r==="F2"&&!!S.fyb.cm)};
}
/* ===== FIND LOGIC END ===== */

/* --- screens --- */
function fybShell(wk,n,body){
 var st=fybStepsOf(wk-1),s=st[n-1],dn=fybDOf(wk-1)[n],base="#/find/w"+wk;
 var h='<a class="back" href="'+base+'">&larr; Find Your Buyers, Week '+wk+'</a><h1>Week '+wk+' &middot; Step '+n+' of '+st.length+'</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p><p class="mute">You will need: '+esc(s.b)+' Everything saves automatically.</p>'+body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="fyb-done" data-w="'+wk+'" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<st.length?'<a class="btn ghost" href="#/find/w'+wk+'/'+(n+1)+'">Next step &rarr;</a>':'')+'</div>';
 return h;
}
function fybNumRow(path,lab,o,money){
 var opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]];
 return '<div class="q"><strong>'+esc(lab+(money?" ("+sym(S.focus.currency).trim()+")":""))+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="fyb-vs" data-p="'+path+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-fyb="n:'+path+'" value="'+esc(o.v)+'" aria-label="'+esc(lab)+'" style="max-width:160px">':'')+'</div>';
}
function fybGet(path){var p=String(path).split("."),o=S.fyb;for(var i=0;i<p.length;i++){if(o==null)return null;o=o[/^\d$/.test(p[i])?+p[i]:p[i]];}return o;}
var FYBVSPATH=/^(bl\.(enq30|orders30|rev30)|res\.d\.[0-2]\.(resp|visits|enq|orders|rev))$/;
function fybChips(a,list,cur,extra,dis){return list.map(function(x){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(cur===x[0])+'" data-a="'+a+'" data-v="'+x[0]+'"'+(extra||'')+(dis?' disabled':'')+'>'+esc(x[1])+'</button>';}).join("");}
function fybHome(wk){
 wk=wk||1;var st=fybStepsOf(wk-1),d=rCount(st,fybDOf(wk-1)),dn=fybDOf(wk-1),base=fybWeekBase(wk);
 var h='<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Find Your Buyers</h1><p class="mute">Week '+wk+' of 4: '+esc(FYBWKT[wk-1])+'. '+esc(FYBWKD[wk-1])+'</p><div class="card"><strong>'+d+' of '+st.length+' steps done</strong><div class="bar" aria-hidden="true"><i style="width:'+Math.round(d/st.length*100)+'%"></i></div></div>';
 h+='<div class="card"><h2>The steps</h2>'+st.map(function(s){var x=dn[s.n];return '<a class="step'+(x?' done':'')+'" href="'+base+s.n+'"><span class="n">'+(x?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(x?"Done":"Open")+'</span></a>';}).join("")+'</div>';
 return h;
}
var FYBQUIZ=[["a","You find a busy group where your buyers ask questions. What is the best first move?",[["a1","Post your product link straight away"],["a2","Read the rules, listen for a while, then answer a question helpfully"],["a3","Message every member privately"]],"a2","Read the rules and listen first. A helpful answer earns attention. A link dropped in cold, or a private message nobody asked for, loses it."],["b","Someone you have never spoken to has not asked you anything. Should you message them privately about your product?",[["b1","Yes, it is the quickest way"],["b2","No. Only reply privately when someone has asked you to"],["b3","Yes, if you copy the same message to lots of people"]],"b2","Unasked private messages feel like spam, and many places ban them. Let people come to you."]];
function fyb1s1(){
 return fybShell(1,1,LC("fyb1s1.lesson")+'<div class="card"><h2>Quick check</h2>'+FYBQUIZ.map(function(q){return '<div class="q"><strong>'+esc(q[1])+'</strong><div class="row" style="flex-direction:column;align-items:stretch">'+q[2].map(function(o){return '<button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(UI.fybq&&UI.fybq[q[0]]===o[0])+'" data-a="fyb-q" data-q="'+q[0]+'" data-v="'+o[0]+'">'+esc(o[1])+'</button>';}).join("")+'</div>'+(UI.fybq&&UI.fybq[q[0]]?'<div class="note '+(UI.fybq[q[0]]===q[3]?"ok":"info")+'" aria-live="polite">'+(UI.fybq[q[0]]===q[3]?"Good. ":"Have another look. ")+esc(q[4])+'</div>':'')+'</div>';}).join("")+'</div>');
}
function fyb1s2(){
 var E=S.fyb,ro=E.cm?' readonly':'',h=LC("fyb1s2.lesson")+'<div class="card"><h2>Your product and your buyer</h2><label for="fybp">The one product you hope people will find</label><input id="fybp" type="text" maxlength="120" data-fyb="pr.product" value="'+esc(E.pr.product)+'"'+ro+'>'+(String(S.focus.product||"").trim()&&E.pr.product===String(S.focus.product).trim().slice(0,120)?'<p class="mute">Pre-filled from your product details. Please check it.</p>':'')+'<label for="fybb">Who is your buyer?</label><input id="fybb" type="text" maxlength="200" data-fyb="pr.buyer" value="'+esc(E.pr.buyer)+'" placeholder="For example: women in their first year of freelancing"><label for="fybq">What are they trying to sort out, in their own words?</label><input id="fybq" type="text" maxlength="200" data-fyb="pr.problem" value="'+esc(E.pr.problem)+'" placeholder="For example: how much can I safely spend this month?"></div>';
 h+='<div class="card"><h2>Where you start (the last 30 days)</h2><p class="mute">This is your starting point. If you cannot see a number, say so, and it is kept as unknown. It is never read as zero.</p>'+fybNumRow("bl.enq30","People who asked about this product",E.bl.enq30)+fybNumRow("bl.orders30","Orders for this product",E.bl.orders30)+fybNumRow("bl.rev30","Revenue from this product",E.bl.rev30,true)+'</div>';
 return fybShell(1,2,h);
}
function fybPlaceCard(p,i){
 var lk=!!S.fyb.cm,ro=lk?' readonly':'',x=' data-id="'+p.id+'"';
 var h='<div class="card"><h2>Place '+(i+1)+(p.name.trim()?': '+esc(p.name.trim()):'')+'</h2><label for="fybn'+p.id+'">Its name</label><input id="fybn'+p.id+'" type="text" maxlength="80" data-fyb="pl:'+p.id+':name" value="'+esc(p.name)+'"'+ro+' placeholder="For example: First-Year Freelancers group"><label>What kind of place is it?</label><div class="row">'+FYBKIND.map(function(k){return '<button type="button" class="chip" aria-pressed="'+(p.kind===k[0])+'" data-a="fyb-kind" data-v="'+k[0]+'"'+x+(lk?' disabled':'')+'>'+esc(k[1])+'</button>';}).join("")+'</div><label>Do people there talk about the thing your product helps with?</label><div class="row">'+FYBTALK.map(function(k){return '<button type="button" class="chip" aria-pressed="'+(p.talk===k[0])+'" data-a="fyb-talk" data-v="'+k[0]+'"'+x+(lk?' disabled':'')+'>'+esc(k[1])+'</button>';}).join("")+'</div>';
 if(p.talk==="no")h+='<div class="note info">If your buyers do not talk about this there, it may not be the place to start.</div>';
 if(!lk)h+='<p><button type="button" class="chip sm" data-a="fyb-pdel"'+x+'>Remove this place</button></p>';
 return h+'</div>';
}
function fyb1s3(){
 var E=S.fyb,h=LC("fyb1s3.lesson");
 h+=E.pl.map(fybPlaceCard).join("");
 if(!E.cm)h+='<div class="card">'+(E.pl.length<6?'<p><button type="button" class="btn ghost" data-a="fyb-padd">Add a place</button></p><p class="mute">'+E.pl.length+' of 6. Three or four is plenty. You will choose up to three in the next step.</p>':'<p class="mute">That is six places, which is the most you can list. You will choose up to three in the next step.</p>')+'</div>';
 return fybShell(1,3,h+'<p class="mute">You are only looking at this stage. Please do not post anything yet.</p>');
}
function fyb1s4(){
 var E=S.fyb,lk=!!E.cm,h=LC("fyb1s4.lesson");
 if(!E.pl.length)return fybShell(1,4,h+'<div class="note info">Add your places in <a href="#/find/w1/3">step 3</a> first.</div>');
 E.pl.forEach(function(p,i){
  var x=' data-id="'+p.id+'"',known=fybRuleKnown(p.rules);
  h+='<div class="card"><h2>'+esc(p.name.trim()||"Place "+(i+1))+'</h2><label>What do its rules say about members mentioning their own work?</label><div class="row" style="flex-direction:column;align-items:stretch">'+fybChips("fyb-rules",FYBRULES,p.rules,x,lk)+'</div>';
  if(p.rules==="unsure")h+='<div class="note warn"><strong>Find out before you take part.</strong> Look for a rules, guidelines or pinned post, or ask the people who run it. Until you know the rules, this place cannot be chosen.</div>';
  if(p.rules==="nopromo")h+='<div class="note info">You can still take part here. Be useful, never mention your product, and let your profile do the introducing.</div>';
  h+='<p><button type="button" class="chip" aria-pressed="'+(p.pick===true)+'" data-a="fyb-pick"'+x+((lk||(!known&&!p.pick))?' disabled':'')+'>'+(p.pick?"Chosen for this experiment":"Choose this place")+'</button></p></div>';
 });
 h+='<div class="card"><p><strong>'+fybPicked().length+' of '+FYBCFG.maxPlaces+' chosen.</strong></p><p class="mute">Each place sets its own rules, and its rules come first. This is general guidance, not legal advice. The Sales Lab never posts, comments or sends messages for you.</p></div>';
 return fybShell(1,4,h);
}
function fybSummary1(){
 var E=S.fyb,pk=fybPicked();
 return '<div class="card"><h2>Your Week 1 summary</h2><div class="crow"><span>Your product</span><strong>'+esc(E.pr.product||"Not chosen")+'</strong></div><div class="crow"><span>Places you listed</span><strong>'+E.pl.length+'</strong></div><div class="crow"><span>Places you chose</span><strong>'+(pk.length?esc(pk.map(function(x){return x.name.trim()||"Unnamed";}).join(", ")):"None yet")+'</strong></div><div class="crow"><span>Orders in the last 30 days</span><strong>'+esc(fybFmt(E.bl.orders30))+'</strong></div><h3>Your decision</h3><p><button type="button" class="chip" aria-pressed="'+(E.dec==="next")+'" data-a="fyb-dec" data-w="1" data-v="next">Ready for Week 2</button></p></div>';
}
function fyb1s5(){return fybShell(1,5,LC("fyb1s5.lesson")+fybSummary1());}
function fyb2s1(){return fybShell(2,1,LC("fyb2s1.lesson"));}
function fyb2s2(){
 var E=S.fyb,pk=fybPicked(),h=LC("fyb2s2.lesson");
 if(!pk.length)return fybShell(2,2,h+'<div class="note info">Choose your places in <a href="#/find/w1/4">Week 1, step 4</a> first.</div>');
 pk.forEach(function(p){h+='<div class="card"><h2>'+esc(p.name.trim()||"Your place")+'</h2><label for="fybh'+p.id+'">What are people there asking or struggling with? Use their words.</label><textarea id="fybh'+p.id+'" maxlength="300" style="min-height:80px" data-fyb="pl:'+p.id+':heard" placeholder="For example: several people asked how to budget when income changes every month.">'+esc(p.heard)+'</textarea></div>';});
 return fybShell(2,2,h+'<p class="mute">You are still only reading. Nothing needs posting yet.</p>');
}
function fyb2s3(){
 var E=S.fyb,lk=!!E.cm,pl=fybPlan(),h=LC("fyb2s3.lesson");
 if(!pl.length)return fybShell(2,3,h+'<div class="note info">Choose your places in <a href="#/find/w1/4">Week 1, step 4</a> first.</div>');
 E.dr.forEach(function(m,i){
  var c=fybDraftCheck(m),ro=lk?' readonly':'',x=' data-i="'+i+'"';
  h+='<div class="card"><h2>Draft '+(i+1)+'</h2><label>Which place is it for?</label><div class="row">'+pl.map(function(p){return '<button type="button" class="chip" aria-pressed="'+(String(m.p)===String(p.id))+'" data-a="fyb-dp" data-v="'+p.id+'"'+x+(lk?' disabled':'')+'>'+esc(p.name||"Unnamed")+'</button>';}).join("")+'</div><label for="fyba'+i+'">The question or need it answers</label><input id="fyba'+i+'" type="text" maxlength="120" data-fyb="dr.'+i+'.about" value="'+esc(m.about)+'"'+ro+'><label for="fybt'+i+'">Your contribution</label><textarea id="fybt'+i+'" maxlength="600" style="min-height:110px" data-fyb="dr.'+i+'.text"'+ro+' placeholder="Answer the question fully, as you would for a friend.">'+esc(m.text)+'</textarea><label>Does it mention your product?</label><div class="row" style="flex-direction:column;align-items:stretch">'+fybChips("fyb-has",FYBHAS,m.has||"",x,lk)+'</div>';
  if(c.blocks.length)h+='<div class="note warn"><strong>This would break the place\'s rules:</strong><ul>'+c.blocks.map(function(y){return '<li>'+esc(y)+'</li>';}).join("")+'</ul></div>';
  if(c.issues.length&&(m.about||m.text||m.p))h+='<div class="note info"><strong>Worth another look:</strong><ul>'+c.issues.map(function(y){return '<li>'+esc(y)+'</li>';}).join("")+'</ul></div>';
  else if(c.ok&&fybDraftFilled(m))h+='<div class="note ok">That reads as helpful first.</div>';
  h+=c.notes.map(function(y){return '<div class="note info">'+esc(y)+'</div>';}).join("")+'<p class="mute">'+c.words+' words.'+(c.has!=="none"&&!m.has?' A link was found in the words.':'')+'</p></div>';
 });
 return fybShell(2,3,h+'<p class="mute">Two drafts are enough to commit. These are starting points: adapt each one to the real conversation, and never paste the same words into several places. This check only looks for common problems. It is not confirmation that a contribution meets a place\'s rules.</p>');
}
function fyb2s4(){
 var E=S.fyb,lk=!!E.cm,h=LC("fyb2s4.lesson")+'<div class="card"><h2>How people will find you</h2><label for="fybbio">What your profile says about what you do (optional)</label><input id="fybbio" type="text" maxlength="200" data-fyb="tk.bio" value="'+esc(E.tk.bio)+'"'+(lk?' readonly':'')+' placeholder="For example: I make simple budget planners for freelancers."><p class="mute">In most places your profile is where people look once you have been helpful. Keep it honest and clear.</p></div>';
 h+='<div class="card"><h2>How will you count orders?</h2><div class="row" style="flex-direction:column;align-items:stretch">'+fybChips("fyb-trk",FYBTRK,E.tk.trk,"",lk)+'</div>';
 if(E.tk.trk==="none")h+='<div class="note warn">That is honest, and it means your result will be read as unclear, because an order cannot be traced to where the buyer found you. A link or a code takes a few minutes to set up.</div>';
 else if(E.tk.trk==="ask")h+='<div class="note info">That can work for a small number of orders. Memory is not exact, so your result will be read with a little more care.</div>';
 else if(E.tk.trk)h+='<label for="fybr">The link or code (optional, only you see this)</label><input id="fybr" type="text" maxlength="200" data-fyb="tk.ref" value="'+esc(E.tk.ref)+'"'+(lk?' readonly':'')+'>';
 return fybShell(2,4,h+'</div>');
}
function fyb2s5(){
 var E=S.fyb,lk=!!E.cm,h=LC("fyb2s5.lesson");
 if(lk)return fybShell(2,5,h+fybPlanLog());
 h+='<div class="card"><h2>Six checks</h2><p class="mute">Tick each one when it is true.</p>'+FYBTICKS.map(function(t){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(E.ticks[t[0]]===true)+'" data-a="fyb-tick" data-k="'+t[0]+'">'+esc(t[1])+'</button></p>';}).join("")+'<p><strong>'+FYBTICKS.filter(function(t){return E.ticks[t[0]]===true;}).length+' of 6 ticked.</strong></p></div>';
 h+='<div class="card"><h2>Your plan</h2><label>About how many helpful contributions will you make?</label><div class="row">'+FYBGOAL.map(function(g){return '<button type="button" class="chip" aria-pressed="'+(E.tg===g)+'" data-a="fyb-tg" data-v="'+g+'">About '+g+'</button>';}).join("")+'</div><p class="mute">A few good ones spread over several days are better than many in one day.</p><label for="fybf">The first day you will take part</label><input id="fybf" type="date" data-fyb="per.from" value="'+esc(E.per.from)+'" min="'+esc(today())+'" style="max-width:200px"><label for="fybto">The last day</label><input id="fybto" type="date" data-fyb="per.to" value="'+esc(E.per.to)+'" min="'+esc(today())+'" style="max-width:200px">';
 var pc=fybPerCheck(E.per);
 if(pc.ok){h+='<div class="crow"><span>Days you will be taking part</span><strong>'+pc.w.days+'</strong></div><div class="crow"><span>You will be watching until</span><strong>'+esc(dayLab(pc.w.to))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(pc.w.readOn))+'</strong></div>';if(pc.prov)h+='<div class="note info">Your watching period runs past Day 30, so your Day 30 position will be provisional, and the rest is recorded as a post-sprint update in your 14 day update window.</div>';}
 else if(E.per.from||E.per.to)h+='<div class="note '+(pc.why==="missing"?"info":"warn")+'"><strong>'+esc(pc.t)+'.</strong> '+esc(pc.b)+'</div>';
 h+='</div>';
 var r=fybReady();
 h+='<div class="card"><h2>Ready to commit?</h2>';
 if(r.ok)h+='<div class="note ok"><strong>Everything is in place.</strong></div>';else h+='<div class="note warn"><strong>Not quite yet. Still needed:</strong><ul>'+r.miss.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 if(UI.fybc&&r.ok)h+='<div class="note info" aria-live="polite"><strong>Commit and lock your plan?</strong> Your places, how you will count orders, your target and your days will be locked and dated. Your drafts stay yours to adapt.</div><div class="row"><button type="button" class="btn" data-a="fyb-commit">Yes, commit and lock</button><button type="button" class="btn ghost" data-a="fyb-cancel">Not yet</button></div>';
 else h+='<p><button type="button" class="btn"'+(r.ok?'':' disabled')+' data-a="fyb-confirm">Commit my plan</button></p>';
 return fybShell(2,5,h+'</div>');
}
function fybPlanLog(){
 var c=S.fyb.cm;if(!c)return "";
 return '<div class="card"><h2>Your plan</h2><p class="mute">Committed on '+esc(dayLab(c.at))+'. This record is locked.</p><div class="crow"><span>Product</span><strong>'+esc(c.what)+'</strong></div>'+c.places.map(function(p,i){return '<div class="crow"><span>Place '+(i+1)+'</span><strong>'+esc(p.name)+' <span class="tag">'+esc(FYBRULEL[p.rules]||"")+'</span></strong></div>';}).join("")+'<div class="crow"><span>Taking part</span><strong>'+esc(dayLab(c.from))+' to '+esc(dayLab(c.to))+', about '+esc(c.tg)+' contributions</strong></div><div class="crow"><span>Counting orders</span><strong>'+esc(FYBTRKL[c.trk]||"")+'</strong></div></div>';
}
function fybStatus(){
 var E=S.fyb,w=fybWin();if(!E.cm)return '<div class="note warn"><strong>No plan is committed yet.</strong> Week 2 finishes with committing your plan. <a href="#/find/w2/5">Go to Week 2, step 5</a></div>';
 var cnt=fybCounts(),tot=cnt.reduce(function(a,b){return a+b;},0);
 return '<div class="card"><h2>Where you are</h2><div class="crow"><span>Contributions logged</span><strong>'+tot+' of about '+esc(E.cm.tg)+'</strong></div>'+E.cm.places.map(function(p,i){return '<div class="crow"><span>'+esc(p.name)+'</span><strong>'+cnt[i]+'</strong></div>';}).join("")+'<div class="crow"><span>Watching until</span><strong>'+esc(dayLab(w.to))+'</strong></div><div class="crow"><span>Read your numbers from</span><strong>'+esc(dayLab(w.readOn))+'</strong></div>'+(today()>E.cm.to&&today()<w.readOn?'<div class="note info">Your contribution period has finished. People can still respond, so please do not read your numbers as a result yet.</div>':'')+(rvCur()&&w.to>rvDay30()?'<div class="note info">Your watching period runs past Day 30, so your Day 30 position will be provisional, and the rest is recorded as a post-sprint update until '+esc(dayLab(rvEnd()))+'.</div>':'')+'</div>';
}
function fyb3s1(){return fybShell(3,1,LC("fyb3s1.lesson")+fybPlanLog()+fybStatus());}
function fybLogHtml(){
 var E=S.fyb;if(!E.lg.length)return '<p class="mute">Nothing logged yet.</p>';
 return E.lg.slice().sort(function(a,b){return a.d<b.d?-1:(a.d>b.d?1:a.id-b.id);}).map(function(x){var p=fybPlanPlace(x.p),k=FYBLK.filter(function(y){return y[0]===x.k;})[0],wd=!!x.wd;return '<div class="crow" style="display:block'+(wd?';opacity:.6':'')+'"><p><strong>'+esc(dayLab(x.d))+'</strong>: '+esc(k?k[1]:"")+' in '+esc(p?p.name:"a place no longer in your plan")+(x.m!=="none"?' <span class="tag">mentioned my product</span>':'')+(wd?' <span class="tag">withdrawn '+esc(dayLab(x.wd))+'</span>':'')+'</p>'+(x.note?'<p style="white-space:pre-wrap">'+esc(x.note)+'</p>':'')+(wd?'':'<p><button type="button" class="chip sm" data-a="fyb-lwd" data-id="'+x.id+'">Withdraw this entry</button></p>')+'</div>';}).join("");
}
function fyb3s2(){
 var E=S.fyb,h=LC("fyb3s2.lesson");
 if(!E.cm)return fybShell(3,2,h+fybStatus());
 var u=UI.fybl||{},p=u.p?fybPlanPlace(u.p):null;
 h+='<div class="card"><h2>Log a contribution</h2><p class="mute">Record each one after you have posted it yourself. The Sales Lab never posts for you.</p><label for="fybld">The day</label><input id="fybld" type="date" data-fyb="l:d" value="'+esc(u.d||today())+'" min="'+esc(E.cm.at)+'" max="'+esc(today())+'" style="max-width:200px"><label>Where</label><div class="row">'+E.cm.places.map(function(x){return '<button type="button" class="chip" aria-pressed="'+(String(u.p)===String(x.id))+'" data-a="fyb-lp" data-v="'+x.id+'">'+esc(x.name)+'</button>';}).join("")+'</div><label>What it was</label><div class="row" style="flex-direction:column;align-items:stretch">'+fybChips("fyb-lk",FYBLK,u.k||"")+'</div><label>Did it mention your product?</label><div class="row" style="flex-direction:column;align-items:stretch">'+fybChips("fyb-lm",FYBLM,u.m||"")+'</div>';
 if(p&&p.rules==="nopromo"&&u.m==="allowed")h+='<div class="note warn"><strong>This place allows no promotion.</strong> If you mentioned your product there without being asked, consider editing or removing it, and log it under "What else could explain the numbers?" if it was removed.</div>';
 h+='<label for="fybln">A note (optional)</label><textarea id="fybln" maxlength="200" data-fyb="l:note" style="min-height:50px">'+esc(u.note||"")+'</textarea><p><button type="button" class="btn ghost" data-a="fyb-ladd">Add to my log</button></p></div>';
 h+='<div class="card"><h2>Your log</h2>'+fybLogHtml()+'</div>';
 return fybShell(3,2,h+fybStatus());
}
function fybConfHtml(){
 var E=S.fyb,h="";if(!E.cf.length)return '<p class="mute">Nothing logged. That is a fine answer if nothing changed.</p>';
 E.cf.slice().sort(function(a,b){return a.d<b.d?-1:(a.d>b.d?1:a.id-b.id);}).forEach(function(c){var w=fybWin(),inw=w&&E.cm&&c.d>=addDays(E.cm.from,-7)&&c.d<=w.to,mj=fybConfMajor(c),wd=!!c.wd,k=fybConfKind(c.k);h+='<div class="crow" style="display:block'+(wd?';opacity:.6':'')+'"><p><strong>'+esc(dayLab(c.d))+'</strong>: '+esc(k?k[1]:"")+' <span class="tag">'+(mj?"major":"minor")+'</span>'+(inw?'':' <span class="tag">outside your window, not counted</span>')+(wd?' <span class="tag">withdrawn '+esc(dayLab(c.wd))+'</span>':'')+'</p>'+(c.note?'<p style="white-space:pre-wrap">'+esc(c.note)+'</p>':'')+(wd?'':'<p><button type="button" class="chip sm" data-a="fyb-fwd" data-id="'+c.id+'">Withdraw this entry</button></p>')+'</div>';});
 return h;
}
function fyb3s3(){
 var E=S.fyb,h=LC("fyb3s3.lesson");if(!E.cm)return fybShell(3,3,h+fybStatus());
 var u=UI.fybf||{};
 h+='<div class="card"><h2>Log something that could also explain your numbers</h2><label for="fybfd">The day it happened</label><input id="fybfd" type="date" data-fyb="f:d" value="'+esc(u.d||today())+'" max="'+esc(today())+'" min="'+esc(addDays(E.cm.from,-7))+'" style="max-width:200px">'+FYBCONF.map(function(x){return '<p><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(u.k===x[0])+'" data-a="fyb-fk" data-v="'+x[0]+'">'+esc(x[1])+'</button></p>';}).join("");
 if(u.k==="other")h+='<label>Could this change your numbers a lot?</label><div class="row"><button type="button" class="chip" aria-pressed="'+(u.maj===true)+'" data-a="fyb-fmaj" data-v="yes">Yes, it could</button><button type="button" class="chip" aria-pressed="'+(u.maj===false)+'" data-a="fyb-fmaj" data-v="no">Probably not</button></div>';
 h+='<label for="fybfn">A note (optional)</label><textarea id="fybfn" maxlength="300" data-fyb="f:note" style="min-height:60px">'+esc(u.note||"")+'</textarea><p><button type="button" class="btn ghost" data-a="fyb-fadd">Add to my list</button></p></div>';
 var c=fybConfs();h+='<div class="card"><h2>Your list</h2><p><strong>'+c.major.length+' major, '+c.minor.length+' minor</strong> in this period.</p>'+fybConfHtml()+'</div>';
 return fybShell(3,3,h);
}
function fyb3s4(){
 var E=S.fyb,tot=fybCounts().reduce(function(a,b){return a+b;},0);
 return fybShell(3,4,LC("fyb3s4.lesson")+'<div class="card"><h2>Your Week 3 summary</h2><div class="crow"><span>Contributions logged</span><strong>'+tot+'</strong></div><div class="crow"><span>Things that could explain the numbers</span><strong>'+(function(){var c=fybConfs();return c.major.length+" major, "+c.minor.length+" minor";})()+'</strong></div><h3>Your decision</h3><p><button type="button" class="chip" aria-pressed="'+(E.dec3==="next")+'" data-a="fyb-dec" data-w="3" data-v="next">Ready to read my result in Week 4</button></p></div>');
}
function fyb4s1(){return fybShell(4,1,LC("fyb4s1.lesson")+LC("fyb4s1.examples"));}
function fyb4s2(){
 var E=S.fyb,h=LC("fyb4s2.lesson");if(!E.cm)return fybShell(4,2,h+fybStatus());
 h+=rvCur()?rvPostNote():'';
 h+='<div class="card"><h2>Your numbers, place by place</h2><p class="mute">Count from your first contribution to '+esc(dayLab(fybWin().to))+'. If you cannot see a number, say so. It is kept as unknown and never read as zero.</p>';
 E.cm.places.forEach(function(p,i){var x=E.res.d[i],pp="res.d."+i+".";h+='<h3>'+esc(p.name)+'</h3>'+FYBK.map(function(k){return fybNumRow(pp+k,FYBKL[k],x[k],k==="rev");}).join("");});
 if(E.res.at)h+='<p class="mute">Last saved '+esc(dayLab(E.res.at))+(rvCur()&&E.res.at>rvDay30()?' <span class="tag">post-sprint update</span>':'')+'.</p>';
 return fybShell(4,2,h+'</div>');
}
function fybPlaceRows(nm,cnt){
 return fybPlan().map(function(p,i){var x=nm[i];return '<div class="crow" style="display:block"><p style="margin:0"><strong>'+esc(p.name||"Place "+(i+1))+'</strong></p><p class="mute" style="margin:2px 0 8px">Contributions '+cnt[i]+'. Replies or reactions '+esc(fybFmt(x.resp))+'. Visits '+esc(fybFmt(x.visits))+'. Asked about your product '+esc(fybFmt(x.enq))+'. Orders '+esc(fybFmt(x.orders))+'. Revenue '+esc(fybFmt(x.rev,true))+'.</p></div>';}).join("");
}
function fyb4s3(){
 var E=S.fyb,h=LC("fyb4s3.lesson");if(!E.cm)return fybShell(4,3,h+fybStatus());
 var v=fybVerdict(),cl={limited:"Limited. Too limited to support a confident conclusion.",lower:"Lower than usual. See the notes below.",fair:"Fair for a small test.",unclear:"Unclear.",none:""}[v.conf||"none"];
 h+='<div class="card"><h2>Your evidence verdict</h2><div class="note '+v.cls+'"><strong>'+esc(v.label)+'</strong> <span class="tag">rule '+esc(v.rule)+'</span></div>'+(cl?'<p><strong>How much confidence?</strong> <span class="tag">'+esc(cl)+'</span></p>':'')+(v.strength?'<p>'+esc(v.strength)+'</p>':'')+'<h3>What the numbers show</h3><ul>'+v.why.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>What they cannot show</h3><ul>'+v.limits.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul><h3>A reasonable next step</h3><ul>'+v.next.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';
 h+='<div class="card"><h2>Place by place</h2>'+fybPlaceRows(fybNums(),fybCounts())+'<p class="mute">Counts, not percentages. With numbers this small, a percentage would look more exact than it is. These counts describe what happened. They do not show that one place is better than another.</p></div>';
 h+='<div class="card"><h2>What was considered</h2><div class="crow"><span>Major things logged</span><strong>'+fybConfs().major.length+'</strong></div><div class="crow"><span>Provisional settings used</span><strong>At least '+FYBCFG.minContrib+' contributions to describe a result, about '+FYBCFG.confContrib+' for a steadier reading, and '+FYBCFG.minVisits+' visits or one enquiry before "Traffic but no sales"</strong></div><p class="mute">These are provisional testing assumptions, not proof of reliability and not a validated benchmark. Having enough to describe a result is not the same as strong evidence.</p></div>';
 return fybShell(4,3,h);
}
function fyb4s4(){
 var E=S.fyb,v=fybVerdict(),h=LC("fyb4s4.lesson")+'<div class="card"><h2>Your verdict was: '+esc(v.label)+'</h2><h3>What would you like to do?</h3>'+FYBNEXT.map(function(x){return '<p><button type="button" class="chip" aria-pressed="'+(E.nx===x[0])+'" data-a="fyb-nx" data-v="'+x[0]+'">'+x[1]+'</button></p>';}).join("")+'<h3>Anything else?</h3><p><button type="button" class="chip" aria-pressed="'+(E.dec4==="done")+'" data-a="fyb-dec" data-w="4" data-v="done">I am done with this experiment for now</button></p></div>';
 return fybShell(4,4,h);
}
var FYBROUTE=/^#\/find(?:\/(w[1-4]))?(?:\/([1-5]))?$/;
function fybRouteInner(){
 var m=FYBROUTE.exec(route)||[],n=+(m[2]||0),wk=m[1]?+m[1].slice(1):(n?1:0);
 if(!wk)return fybHome(1);
 if(!n)return fybHome(wk);
 var F=[null,[0,fyb1s1,fyb1s2,fyb1s3,fyb1s4,fyb1s5],[0,fyb2s1,fyb2s2,fyb2s3,fyb2s4,fyb2s5],[0,fyb3s1,fyb3s2,fyb3s3,fyb3s4],[0,fyb4s1,fyb4s2,fyb4s3,fyb4s4]];
 return F[wk][n]?F[wk][n]():fybHome(wk);
}
function fybRoute(){
 var m=FYBROUTE.exec(route)||[],wk=m[1]||"",n=+(m[2]||0);
 if(!fybActive())return fybPrep();
 if(!wk&&!n)return fybMySprint();
 var w=wk?+wk.slice(1):1;
 if(w>1&&!fybWeekDone(w-2))return '<a class="back" href="#/sprint">&larr; My Sprint</a><h1>Week '+w+' is not open yet</h1><div class="note info">Week '+w+' opens when you finish Week '+(w-1)+'. <a href="#/find/w'+(w-1)+'">Go to Week '+(w-1)+'</a></div>';
 return fybRouteInner();
}
function fybPrep(){
 var P=S.fyb.prep,ph=SPR.loaded?rvPhase():"",ready=fybPrepReady();
 var h='<a class="back" href="#/experiments">&larr; Experiments</a><h1>Prepare for Find Your Buyers</h1><p class="mute">Get ready first. Nothing on this page starts your 30 days, and nothing here counts as completed experiment activity.</p>';
 h+='<div class="card"><h2>What the experiment is</h2><p>Over four weeks you find up to three places where your buyers already spend time. You read each place\'s rules, listen, and then take part as yourself by being useful. You count what comes back: replies, visits, people who ask about your product, and orders. You read the result honestly, and decide what is next.</p><p>There is no cold messaging and no copy-and-paste promotion. The Sales Lab never posts, comments or sends messages for you.</p></div>';
 h+='<div class="card"><h2>The four weeks, in plain words</h2><ol>'+FYBWKT.map(function(t,i){return '<li><strong>Week '+(i+1)+': '+esc(t)+'.</strong> '+esc(FYBWKD[i])+'</li>';}).join("")+'</ol><p class="mute">About 3 to 5 hours a week. You can read ahead, and you can go at your own pace inside each week.</p></div>';
 h+='<div class="card"><h2>What you need before it can start</h2><p><strong>Can you describe who your buyer is, and what they are trying to sort out?</strong></p><div class="row"><button type="button" class="chip" aria-pressed="'+(P.buyer==="yes")+'" data-a="fyb-pbuyer" data-v="yes">Yes</button><button type="button" class="chip" aria-pressed="'+(P.buyer==="no")+'" data-a="fyb-pbuyer" data-v="no">Not yet</button></div><p style="margin-top:12px"><button type="button" class="chip" style="text-align:left;border-radius:10px" aria-pressed="'+(P.place===true)+'" data-a="fyb-pplace">I am happy to take part in a group, forum or conversation as myself, under my own name or business name.</button></p>';
 if(P.buyer==="no")h+='<div class="note info"><strong>That is fine.</strong> Knowing who your buyer is comes first, because it tells you where to look. Your profile has a place for it. Come back when you can describe them. Your 30 days will not start until then, and you choose when to begin.</div>';
 h+='<p class="mute">You do not need an audience of your own. The sprint starts only when you press the start button yourself.</p></div>';
 if(!SPR.loaded)h+='<div class="note warn" role="status">We could not check your sprint just now. Please refresh the page.</div>';
 else if(fybActive())h+='<div class="note ok">You are already on this experiment. <a href="#/sprint">Open My Sprint</a>.</div>';
 else if(ph==="during")h+='<div class="note info">You already have a sprint running. You can start Find Your Buyers after Day 30, if you wish.</div>';
 else if(ready)h+='<div class="card"><h2>Ready when you are</h2><p>You know who you are looking for. You will find and choose the places in Week 1.</p>'+(UI.sprErr?'<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>':'')+sprConfirmX("find",ph==="notstarted"?"Start my 30-day sprint":"Start another sprint")+'</div>';
 else h+='<div class="note info"><strong>Not ready to start yet.</strong> Both are needed: a clear idea of who your buyer is, and being happy to take part as yourself.</div>';
 h+='<div class="card"><h2>Another experiment may suit you better right now</h2><p>You are always free to choose a different experiment.</p><p><strong>Partnership-to-Sales</strong> <span class="tag">open now</span><br><span class="mute">Other people who reach your buyer introduce your product.</span></p><p><strong>Etsy Sales Bottleneck</strong> <span class="tag">open now</span><br><span class="mute">For sellers with a live Etsy listing.</span></p><p><strong>Email-to-Sale</strong> <span class="tag">open now</span><br><span class="mute">For anyone with a list of people who agreed to hear from them.</span></p><p><strong>Show-to-Sell</strong> <span class="tag">open now</span><br><span class="mute">For products that are easy to show in use.</span></p><p class="mute">LIVE Sales is coming soon, and is not open yet.</p><p><a class="btn ghost" href="#/experiments">See the experiments, and the sales check</a></p></div>';
 return h;
}
function fybMySprint(){
 var wk=fybCurWeek(),W=fybWeeks()[wk-1];
 var h='<h1>My Sprint</h1><p class="mute">Find Your Buyers &middot; Week '+wk+' of 4</p>'+sprintBar(true);
 h+='<div class="tabs rwpick">'+fybWeeks().map(function(w){var g=rSvg("-50 -50 100 100",rWeekG(w.n,w.open,"#fff"));return w.open?'<a class="chip rwb" aria-pressed="'+(w.n===wk)+'" href="#/find/w'+w.n+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+(w.state==="done"?' &#10003;':'')+'</a>':'<button type="button" class="chip rwb" disabled title="Opens when you finish Week '+(w.n-1)+'">'+g+'<b>'+esc(w.title)+'</b>Week '+w.n+'</button>';}).join("")+'</div>';
 h+='<p class="mute"><strong>This week:</strong> '+esc(FYBWKD[wk-1])+'</p>'+(wk===1?'<p class="mute">Week 2 opens when you finish Week 1 (choose "Ready for Week 2" in the last step).</p>':'');
 var pn=String(S.focus.product||"").trim();if(pn)h+='<div class="note ok"><strong>Your product:</strong> '+esc(pn)+'</div>';
 h+='<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,fybWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
 return h+'<p class="mute"><a href="#/experiments">See all six experiments, and the sales check</a></p>';
}
function fybResultsPage(){
 var E=S.fyb,v=fybVerdict(),ph=rvPhase(),started=fybStepCount()>0||!!E.cm,nm=fybNums(),cnt=fybCounts(),tot=cnt.reduce(function(a,b){return a+b;},0),h='<div class="phd"><h1>Results</h1><p class="mute">Your numbers, what they show, and what you learned. Counts, not percentages, while samples are small.</p>';
 if(started)h+='<div class="rtally"><div><h3>You did</h3><p><b>'+fybStepCount()+'</b>Steps done</p><p><b>'+tot+'</b>Contributions made</p><p><b>'+(E.cm?E.cm.places.length:fybPicked().length)+'</b>Places chosen</p></div><div><h3>Came back</h3><p><b>'+esc(fybFmtSum(fybSum(nm,"resp")))+'</b>Replies or reactions</p><p><b>'+esc(fybFmtSum(fybSum(nm,"visits")))+'</b>Visits to your profile or link</p><p><b>'+esc(fybFmtSum(fybSum(nm,"enq")))+'</b>People who asked about your product</p></div><div><h3>Sold</h3><p><b>'+esc(fybFmtSum(fybSum(nm,"orders")))+'</b>Orders you can trace</p><p><b>'+esc(fybFmtSum(fybSum(nm,"rev"),true))+'</b>Revenue from those orders</p></div></div>';
 h+='</div><!--/phd--><div class="rcols"><div>';
 h+='<div class="card"><h2>Where you started</h2><p class="mute">The last 30 days before your sprint, from Week 1, step 2. "I can\'t see this" stays unknown and is never turned into zero.</p><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(fybFmt(E.bl.enq30))+'</b>People who asked</div><div class="tile"><b style="font-size:20px">'+esc(fybFmt(E.bl.orders30))+'</b>Orders for this product</div><div class="tile"><b style="font-size:20px">'+esc(fybFmt(E.bl.rev30,true))+'</b>Revenue</div></div></div>';
 h+='<div class="card"><h2>Your sprint so far</h2><p class="mute">'+esc(rvClock())+'</p>';
 if(E.cm){var w=fybWin();h+='<p>Taking part for <strong>'+esc(E.cm.what)+'</strong> in '+E.cm.places.length+' place'+(E.cm.places.length===1?'':'s')+', '+tot+' of about '+esc(E.cm.tg)+' contributions made.</p><p class="mute">Watching until '+esc(dayLab(w.to))+'. Read your numbers from '+esc(dayLab(w.readOn))+'.</p><h3>Place by place</h3>'+fybPlaceRows(nm,cnt);}
 else h+='<p class="mute">No plan is committed yet. You commit it in <a href="#/find/w2/5">Week 2, step 5</a>.</p>';
 h+='</div>';
 if(started)h+='<section class="rpnl gold rread"><small>What the evidence suggests</small><h2>'+(ph==="during"&&v.rule!=="F2"?"Provisional reading: ":"")+esc(v.label)+'</h2><p>'+esc(v.why[0]||"")+'</p>'+(v.strength?'<p>'+esc(v.strength)+'</p>':'')+'<p class="mute">A reading, not a verdict. Orders you can see after taking part are not proof that taking part caused them. <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</p></section>';
 h+='</div><div class="rside"><div class="card"><h2>Day 30 review</h2>'+(S.rv.done?'<p>Saved on '+esc(dayLab(S.rv.at))+': '+esc(S.rv.snap?S.rv.snap.label:"")+'.</p>':'<p class="mute">'+(started?"Look back at your sprint, see what the evidence suggests, and choose what to focus on next. You can open it at any time.":"Available once your sprint has started.")+'</p>')+'<p><a class="btn'+(S.rv.done?' ghost':'')+'" href="#/review">Open my Day 30 review</a></p></div>';
 var c=fybConfs(),learn=[];E.pl.forEach(function(p){if(p.pick&&p.heard.trim())learn.push("What you heard in "+(p.name.trim()||"a place")+": "+p.heard.trim());});
 if(E.cf.length)learn.push("Things that could also explain your numbers: "+c.major.length+" major, "+c.minor.length+" minor");
 if(E.nx){var nx=FYBNEXT.filter(function(x){return x[0]===E.nx;})[0];if(nx)learn.push("What you decided next: "+nx[1]);}
 h+='<div class="card"><h2>What you have learned</h2>'+(learn.length?learn.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join(""):'<p class="mute">Your own notes and choices from Weeks 2 to 4 appear here as you go.</p>')+'</div><div class="card"><h2>Past sprints</h2>'+rvPastHtml()+'</div>';
 return h+'</div></div>';
}
function fybReviewHead(){
 var E=S.fyb,v=fybVerdict(),rec=fybRec(v),ph=rvPhase(),prov=ph==="during"||rec.provisional,nm=fybNums(),cnt=fybCounts(),tot=cnt.reduce(function(a,b){return a+b;},0);
 var h='<a class="back" href="#/results">&larr; Results</a><h1>Your Day 30 review</h1><p class="mute">Find Your Buyers. A look at where you started, what you did, what the evidence suggests, and what to focus on next.</p>'+sprintBar(true);
 h+='<div class="card"><h2>1. Where you started, and where you are now</h2><p class="mute">Your starting numbers are the 30 days before your sprint. Your numbers from taking part cover these places only. We show them side by side and we do not label the difference as better or worse, because the two are not like for like.</p><div class="crow" style="display:block"><p style="margin:0"><strong>People who asked about this product</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(fybFmt(E.bl.enq30))+'. From taking part: '+esc(fybFmtSum(fybSum(nm,"enq")))+'.</p></div><div class="crow" style="display:block"><p style="margin:0"><strong>Orders for this product</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(fybFmt(E.bl.orders30))+'. From taking part: '+esc(fybFmtSum(fybSum(nm,"orders")))+'.</p></div><div class="crow" style="display:block"><p style="margin:0"><strong>Revenue from this product</strong></p><p class="mute" style="margin:2px 0 8px">Before: '+esc(fybFmt(E.bl.rev30,true))+'. From taking part: '+esc(fybFmtSum(fybSum(nm,"rev"),true))+'.</p></div></div>';
 h+='<div class="card"><h2>2. What you did</h2><p>Steps completed: '+FYBWKT.map(function(t,i){return "Week "+(i+1)+" "+rCount(fybStepsOf(i),fybDOf(i))+" of "+fybStepsOf(i).length;}).join(", ")+'.</p><p>Places listed: '+E.pl.length+'. Places chosen: '+fybPlan().length+'. Contributions made: '+tot+'.</p><div class="note info">You do not need to have finished every step. Anything unfinished stays saved and you can come back to it.</div></div>';
 h+='<div class="card"><h2>3. What the evidence suggests</h2><div class="note '+v.cls+'"><strong>'+(prov?"Provisional reading: ":"")+esc(v.label)+'</strong> <span class="tag">rule '+v.rule+'</span>'+(v.conf&&v.conf!=="none"?' <span class="tag">confidence: '+esc(v.conf)+'</span>':'')+'</div><h3>What the numbers show</h3>'+v.why.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+(E.cm?fybPlaceRows(nm,cnt):'')+'<h3>What remains uncertain</h3>'+v.limits.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join("")+(v.strength?'<p style="margin:4px 0">'+esc(v.strength)+'</p>':'')+'<p style="margin:4px 0">This is a reading, not a verdict. The thresholds behind it are provisional starting points, not guarantees.</p><h3>What to focus on next</h3><div class="note info"><strong>'+esc(rec.t)+'</strong><br>'+esc(rec.b)+'</div><p><strong>First small action:</strong> '+esc(rec.first)+'</p>'+(rec.extra?'<p>'+esc(rec.extra)+'</p>':'')+'<p class="mute"><strong>Evidence:</strong> '+esc(rec.basis)+'</p><p class="mute"><strong>Assumption:</strong> '+esc(rec.assume)+'</p></div>';
 return h;
}
function fybWith(x,fn){var keep=S.fyb;S.fyb=x;try{return fn();}finally{S.fyb=keep;}}
function fybPastSummary(p){
 if(p.exp!=="find"||!p.fyx)return "";
 return fybWith(p.fyx,function(){var x=S.fyb;if(!x.cm)return '<p class="mute" style="margin:2px 0 6px">No plan was committed in this sprint.</p>';var nm=fybNums(),tot=fybCounts().reduce(function(a,b){return a+b;},0);return '<p class="mute" style="margin:2px 0 6px">Taking part: '+esc(x.cm.what)+', '+tot+' contribution'+(tot===1?'':'s')+' in '+x.cm.places.length+' place'+(x.cm.places.length===1?'':'s')+'. Asked about your product '+esc(fybFmtSum(fybSum(nm,"enq")))+', orders '+esc(fybFmtSum(fybSum(nm,"orders")))+'.</p>';});
}
function fybPastFix(x){
 var okd=function(y){return (typeof y==="string"&&(y===""||parseYmd(y)!=null))?y:"";},st=function(y,n){return typeof y==="string"?y.slice(0,n):"";},nm=function(y){return (typeof y==="number"&&isFinite(y)&&y>=0&&y<100000)?Math.floor(y):0;};
 var rvt=rvfix({rv:{snap:x.snap,upd:x.upd,done:!!x.snap}}).rv;
 return {exp:"find",sid:nm(x.sid),auto:x.auto===true,start:okd(x.start),archivedAt:okd(x.archivedAt),label:st(x.label,40),rule:st(x.rule,4),review:x.review===true,snap:rvt.snap,upd:rvt.upd,fyx:fybfix({fyb:x.fyx}).fyb};
}
function fybArchive(prev){
 var snap=S.rv.snap,auto=false;if(!snap){snap=fybSnap("day30");auto=true;}
 var e={exp:"find",sid:prev.id,start:prev.start_day,archivedAt:today(),label:snap.label,rule:snap.rule,review:!!S.rv.done,auto:auto,snap:snap,upd:S.rv.upd.slice(0,20),fyx:clone(S.fyb)};
 S.past=(S.past||[]);if(S.past.length>=10)S.past.shift();S.past.push(e);
}
function pufDraft(){if(!UI.puf)UI.puf={i:-1,d:[0,1,2].map(function(){var o={};FYBK.forEach(function(k){o[k]={s:"",v:""};});return o;})};return UI.puf;}
function fybPastLate(p,i){
 if(!(p.fyx&&p.fyx.cm))return "";
 if(!(UI.puf&&UI.puf.i===i))return '<p><button type="button" class="btn ghost" data-a="puf-open" data-i="'+i+'">Add late numbers to this sprint</button></p>';
 var u=pufDraft(),opts=[["value","A number"],["zero","Zero, I checked"],["unknown","I can't see this"]],h='<p class="mute">Add what you can now see for this earlier sprint. They belong to this sprint only, and do not change your current sprint or the Day 30 position. Leave anything you do not want to change.</p>';
 p.fyx.cm.places.forEach(function(pl,n){h+='<h3>'+esc(pl.name)+'</h3>';FYBK.forEach(function(k){var o=u.d[n][k],lab=FYBKL[k]+(k==="rev"?" ("+sym(S.focus.currency).trim()+")":"");h+='<div class="q"><strong>'+esc(lab)+'</strong><div class="row">'+opts.map(function(x){return '<button type="button" class="chip sm" aria-pressed="'+(o.s===x[0])+'" data-a="puf-vs" data-n="'+n+'" data-k="'+k+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>'+(o.s==="value"?'<input type="text" inputmode="decimal" maxlength="9" data-puf="'+n+'.'+k+'" value="'+esc(o.v)+'" aria-label="'+esc(pl.name+": "+FYBKL[k])+'" style="max-width:160px">':'')+'</div>';});});
 return h+'<p class="row"><button type="button" class="btn" data-a="puf-save">Save as a post-sprint update</button><button type="button" class="btn ghost" data-a="puf-cancel">Cancel</button></p>';
}
function pufOk(p){return !!(p&&p.exp==="find"&&p.fyx&&p.fyx.cm&&pastWinOpen(p));}
function pufAction(a,d){
 var u=UI.puf||null;
 if(a==="puf-open"){var i=+d.i,p=(S.past||[])[i];if(!pufOk(p))return;UI.puf=null;u=pufDraft();u.i=i;}
 else if(a==="puf-cancel"){UI.puf=null;}
 else if(a==="puf-vs"){u=pufDraft();var n=+d.n;if(!(n===0||n===1||n===2)||FYBK.indexOf(d.k)<0||!ETVS[d.v]||d.v==="")return;var o=u.d[n][d.k];o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";}
 else if(a==="puf-save"){
  if(!u)return;var p2=(S.past||[])[u.i];if(!pufOk(p2))return;
  var any=false,np=p2.fyx.cm.places.length;u.d.forEach(function(x,n2){if(n2>=np)return;FYBK.forEach(function(k){var o2=x[k];if(o2.s){any=true;p2.fyx.res.d[n2][k]={s:o2.s,v:o2.s==="value"?w4Clean(k,o2.v):""};}});});
  if(!any)return;p2.fyx.res.at=today();
  var v=fybWith(p2.fyx,function(){return fybVerdict();});
  var e={at:today(),label:v.label,rule:v.rule,ctr:{msgs:0,resp:0,opp:0},res:{},kind:"update",asOf:"",late:false,prov:false};
  p2.upd=p2.upd||[];if(p2.upd.length&&p2.upd[p2.upd.length-1].at===e.at)p2.upd[p2.upd.length-1]=e;else if(p2.upd.length<RVMAX)p2.upd.push(e);else return;
  UI.puf=null;save();
 }
 else return;
 render();
}
function pufInput(t){var u=pufDraft(),m=/^([0-2])\.(resp|visits|enq|orders|rev)$/.exec(String(t.dataset.puf));if(!m)return;var o=u.d[+m[1]][m[2]];if(o&&o.s==="value"){var c=w4Clean(m[2],t.value);o.v=c;if(c!==t.value)t.value=c;}}

/* --- actions and input --- */
function fybSetPath(path,val){
 var p=String(path).split("."),o=S.fyb;for(var i=0;i<p.length-1;i++){o=o[/^\d$/.test(p[i])?+p[i]:p[i]];if(o==null)return false;}
 o[/^\d$/.test(p[p.length-1])?+p[p.length-1]:p[p.length-1]]=val;return true;
}
var FYBTXT=[[/^pr\.product$/,120],[/^pr\.buyer$/,200],[/^pr\.problem$/,200],[/^dr\.[0-2]\.about$/,120],[/^dr\.[0-2]\.text$/,600],[/^tk\.ref$/,200],[/^tk\.bio$/,200]];
var FYBLOCKED=/^(pr\.product|dr\.|tk\.|per\.)/;
function fybAddPlace(){var E=S.fyb;if(E.cm||E.pl.length>=6)return false;var p=emDef(FYBS.f.pl.i);p.id=E.pid++;E.pl.push(p);return true;}
function fybAddLog(){
 var E=S.fyb,u=UI.fybl||{};if(!E.cm||E.lg.length>=40)return false;
 var d=u.d||today();if(parseYmd(d)==null||d>today()||d<E.cm.at)return false;if(rvCur()&&d<rvStart())return false;
 if(!E.cm.places.some(function(x){return String(x.id)===String(u.p);}))return false;
 if(!FYBLK.some(function(x){return x[0]===u.k;}))return false;if(!FYBLM.some(function(x){return x[0]===u.m;}))return false;
 E.lg.push({id:E.lid++,d:d,at:today(),p:String(u.p),k:u.k,m:u.m,note:String(u.note||"").trim().slice(0,200),wd:""});UI.fybl=null;return true;
}
function fybAddConf(){
 var E=S.fyb,u=UI.fybf||{};if(!E.cm||E.cf.length>=60)return false;
 var d=u.d||today();if(parseYmd(d)==null||d>today()||d<addDays(E.cm.from,-7))return false;
 if(!fybConfKind(u.k))return false;if(u.k==="other"&&u.maj!==true&&u.maj!==false)return false;
 E.cf.push({id:E.nid++,d:d,at:today(),k:u.k,maj:u.k==="other"?u.maj===true:true,note:String(u.note||"").trim().slice(0,300),wd:""});UI.fybf=null;return true;
}
function fybAction(a,d){
 var E=S.fyb,i=+d.i,di=(i===0||i===1||i===2),p=d.id!==undefined?fybPlace(d.id):null,has=function(L,v){return L.some(function(x){return x[0]===v;});};
 if(a==="fyb-done"){var st=[E.steps,E.steps2,E.st3,E.st4][(+d.w)-1];if(!st||!/^[1-5]$/.test(String(d.n))||+d.n>FYBSTEPS[(+d.w)-1].length)return;st[d.n]=!st[d.n];save();}
 else if(a==="fyb-dec"){var w=+d.w;if(w===1&&d.v==="next")E.dec=E.dec===d.v?"":d.v;else if(w===2&&d.v==="next")E.dec2=E.dec2===d.v?"":d.v;else if(w===3&&d.v==="next")E.dec3=E.dec3===d.v?"":d.v;else if(w===4&&d.v==="done")E.dec4=E.dec4===d.v?"":d.v;else return;save();}
 else if(a==="fyb-q"){UI.fybq=UI.fybq||{};UI.fybq[d.q]=d.v;}
 else if(a==="fyb-padd"){if(!fybAddPlace())return;save();}
 else if(a==="fyb-pdel"){if(E.cm||!p)return;E.pl=E.pl.filter(function(x){return x!==p;});E.dr.forEach(function(x){if(String(x.p)===String(p.id))x.p="";});save();}
 else if(a==="fyb-kind"){if(E.cm||!p||!has(FYBKIND,d.v))return;p.kind=p.kind===d.v?"":d.v;save();}
 else if(a==="fyb-talk"){if(E.cm||!p||!has(FYBTALK,d.v))return;p.talk=p.talk===d.v?"":d.v;save();}
 else if(a==="fyb-rules"){if(E.cm||!p||!has(FYBRULES,d.v))return;p.rules=p.rules===d.v?"":d.v;if(!fybRuleKnown(p.rules))p.pick=false;save();}
 else if(a==="fyb-pick"){if(E.cm||!p)return;if(p.pick)p.pick=false;else{if(!fybRuleKnown(p.rules)||fybPicked().length>=FYBCFG.maxPlaces)return;p.pick=true;}if(!p.pick)E.dr.forEach(function(x){if(String(x.p)===String(p.id))x.p="";});save();}
 else if(a==="fyb-dp"){if(E.cm||!di||!fybPlanPlace(d.v))return;E.dr[i].p=String(E.dr[i].p)===String(d.v)?"":String(d.v);save();}
 else if(a==="fyb-has"){if(E.cm||!di||!has(FYBHAS,d.v))return;E.dr[i].has=E.dr[i].has===d.v?"":d.v;save();}
 else if(a==="fyb-trk"){if(E.cm||["link","code","ask","none"].indexOf(d.v)<0)return;E.tk.trk=E.tk.trk===d.v?"":d.v;save();}
 else if(a==="fyb-tg"){if(E.cm||FYBGOAL.indexOf(d.v)<0)return;E.tg=E.tg===d.v?"":d.v;save();}
 else if(a==="fyb-vs"){if(!FYBVSPATH.test(String(d.p))||!ETVS[d.v]||d.v==="")return;var mm=/^res\.d\.([0-2])\./.exec(d.p);if(mm&&(!E.cm||+mm[1]>=E.cm.places.length))return;var o=fybGet(d.p);if(!o)return;o.s=o.s===d.v?"":d.v;if(o.s!=="value")o.v="";if(mm)E.res.at=today();save();}
 else if(a==="fyb-tick"){if(E.cm||!has(FYBTICKS,d.k))return;if(E.ticks[d.k])delete E.ticks[d.k];else E.ticks[d.k]=true;save();}
 else if(a==="fyb-confirm"){if(!fybReady().ok)return;UI.fybc=true;}
 else if(a==="fyb-cancel"){UI.fybc=false;}
 else if(a==="fyb-commit"){if(!UI.fybc)return;UI.fybc=false;if(!fybCommit())return;save();}
 else if(a==="fyb-lp"){if(!E.cm||!fybPlanPlace(d.v))return;UI.fybl=UI.fybl||{};UI.fybl.p=String(UI.fybl.p)===String(d.v)?"":String(d.v);}
 else if(a==="fyb-lk"){if(!has(FYBLK,d.v))return;UI.fybl=UI.fybl||{};UI.fybl.k=UI.fybl.k===d.v?"":d.v;}
 else if(a==="fyb-lm"){if(!has(FYBLM,d.v))return;UI.fybl=UI.fybl||{};UI.fybl.m=UI.fybl.m===d.v?"":d.v;}
 else if(a==="fyb-ladd"){if(!fybAddLog())return;save();}
 else if(a==="fyb-lwd"){var l=E.lg.filter(function(x){return x.id===+d.id;})[0];if(!l||l.wd)return;l.wd=today();save();}
 else if(a==="fyb-fk"){if(!fybConfKind(d.v))return;UI.fybf=UI.fybf||{};UI.fybf.k=UI.fybf.k===d.v?"":d.v;if(UI.fybf.k!=="other")delete UI.fybf.maj;}
 else if(a==="fyb-fmaj"){UI.fybf=UI.fybf||{};if(UI.fybf.k!=="other"||(d.v!=="yes"&&d.v!=="no"))return;UI.fybf.maj=d.v==="yes";}
 else if(a==="fyb-fadd"){if(!fybAddConf())return;save();}
 else if(a==="fyb-fwd"){var c=E.cf.filter(function(x){return x.id===+d.id;})[0];if(!c||c.wd)return;c.wd=today();save();}
 else if(a==="fyb-nx"){if(!has(FYBNEXT,d.v))return;E.nx=E.nx===d.v?"":d.v;save();}
 else if(a==="fyb-pbuyer"){if(d.v!=="yes"&&d.v!=="no")return;E.prep.buyer=E.prep.buyer===d.v?"":d.v;if(E.prep.buyer!=="yes")E.prep.place=false;save();}
 else if(a==="fyb-pplace"){if(E.prep.buyer!=="yes")return;E.prep.place=!E.prep.place;save();}
 else return;
 render();
}
function fybInput(t){
 var E=S.fyb,k=String(t.dataset.fyb),val=String(t.value==null?"":t.value);
 if(k==="f:d"){UI.fybf=UI.fybf||{};if(val===""||parseYmd(val)!=null)UI.fybf.d=val;return;}
 if(k==="f:note"){UI.fybf=UI.fybf||{};UI.fybf.note=val.slice(0,300);return;}
 if(k==="l:d"){UI.fybl=UI.fybl||{};if(val===""||parseYmd(val)!=null)UI.fybl.d=val;return;}
 if(k==="l:note"){UI.fybl=UI.fybl||{};UI.fybl.note=val.slice(0,200);return;}
 if(k.indexOf("n:")===0){var p=k.slice(2);if(!FYBVSPATH.test(p))return;var mm=/^res\.d\.([0-2])\./.exec(p);if(mm&&(!E.cm||+mm[1]>=E.cm.places.length))return;var o=fybGet(p);if(o&&o.s==="value"){var c=w4Clean("n",val);o.v=c;if(c!==t.value)t.value=c;if(mm)E.res.at=today();save();}return;}
 var pm=/^pl:(\d{1,6}):(name|heard)$/.exec(k);
 if(pm){var pl=fybPlace(pm[1]);if(!pl)return;if(pm[2]==="name"){if(E.cm)return;pl.name=val.slice(0,80);}else pl.heard=val.slice(0,300);save();return;}
 if(E.cm&&FYBLOCKED.test(k))return;
 var tx=FYBTXT.filter(function(x){return x[0].test(k);})[0];
 if(tx){fybSetPath(k,val.slice(0,tx[1]));save();return;}
 if(k==="per.from"||k==="per.to"){if(val===""||parseYmd(val)!=null){fybSetPath(k,val);save();render();}return;}
}

/* --- the experiment adapter, for Find Your Buyers (outer wrappers: Find first, then Show, Email, Etsy and Partnership) --- */
EXPKEY.find="find";EXPOPEN.find=true;
var _rvExp7=rvExp;rvExp=function(){return fybActive()?"find":_rvExp7();};
var _xaName7=xaName;xaName=function(){return fybActive()?"Find Your Buyers":_xaName7();};
var _xaTotal7=xaTotal;xaTotal=function(){return fybActive()?FYBTOTAL:_xaTotal7();};
var _xaW47=xaW4;xaW4=function(){return fybActive()?"#/find/w4/2":_xaW47();};
var _xaW4S7=xaW4Step;xaW4Step=function(){return fybActive()?2:_xaW4S7();};
var _sprHasWork7=sprHasWork;sprHasWork=function(){return fybActive()?fybHasWork():_sprHasWork7();};
var _rvSnap7=rvSnap;rvSnap=function(k){return fybActive()?fybSnap(k):_rvSnap7(k);};
var _tabOf7=tabOf;tabOf=function(r){r=r||"#/";if(/^#\/find(\/|$)/.test(r))return fybActive()?"sprint":"exp";return _tabOf7(r);};
var _rWeeks7=rWeeks;rWeeks=function(){return fybActive()?fybWeeks():_rWeeks7();};
var _rTrack7=rTrack;
rTrack=function(){
 if(!fybActive())return _rTrack7();
 return '<div class="rweeks">'+fybWeeks().map(function(w){var inner='<small>Week '+w.n+'</small><b>'+esc(w.title)+'</b>'+rBars(w)+'<em>'+esc(w.status)+'</em>';return w.open?'<a class="rwk '+w.state+'" href="#/find/w'+w.n+'">'+inner+'</a>':'<div class="rwk later">'+inner+'</div>';}).join("")+'</div>';
};
var _rNext7=rNext;
rNext=function(){
 if(!(fybActive()&&(SPR.loaded?rvPhase():"during")==="during"))return _rNext7();
 var wk=fybCurWeek(),W=fybWeeks()[wk-1],first=W.first;
 if(!first)return {k:"Your next step",t:"Open your results",d:"You have finished every step. Your results, your evidence reading and your Day 30 review are in one place.",link:"#/results",b:"Open my results"};
 var s=W.L[first-1];
 return {k:"Your next step",t:s.t,d:"You will need: "+s.b+" Everything saves as you go.",m:s.m,link:fybWeekBase(wk)+first,b:"Continue Week "+wk+", step "+first,w:wk,n:first};
};
var _rHomeList7=rHomeList;
rHomeList=function(nx){
 var ph=SPR.loaded?rvPhase():"during";
 if(!fybActive()||ph!=="during")return _rHomeList7(nx);
 var W=fybWeeks()[fybCurWeek()-1];
 return '<div class="card"><h2>Week '+W.n+': '+esc(W.title)+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,fybWeekBase(W.n)+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
};
var _rSoFar7=rSoFar;
rSoFar=function(){
 if(!fybActive())return _rSoFar7();
 var E=S.fyb,h='<div class="card"><h2>Your sprint so far</h2>';
 if(!fybStepCount()&&!E.cm)return h+'<p class="mute">Your numbers appear here once you begin. What you did, what came back and what sold are always kept apart.</p></div>';
 h+='<div class="tiles"><div class="tile"><b>'+fybStepCount()+'</b><span>Steps done</span></div><div class="tile"><b>'+fybCounts().reduce(function(a,b){return a+b;},0)+'</b><span>Contributions made</span></div><div class="tile"><b aria-hidden="true">'+(E.cm?"&#10003;":"&ndash;")+'</b><span>Plan committed<span class="sr">: '+(E.cm?"yes":"not yet")+'</span></span></div></div>';
 return h+'<p><a class="link" href="#/results">Open your results</a></p></div>';
};
var _home7=home;home=function(){return fybActive()?fybMySprint():_home7();};
var _resultsPage7=resultsPage;resultsPage=function(){return fybActive()?fybResultsPage():_resultsPage7();};
var _reviewPage7=reviewPage;
reviewPage=function(){
 if(!fybActive())return _reviewPage7();
 var tail=_reviewPage7(),i=tail.indexOf('<div class="card"><h2>4. Complete your review</h2>');
 return fybReviewHead()+(i>-1?tail.slice(i):"");
};
var _etBlockP7=etBlockP;etBlockP=function(){return fybActive()?/^#\/(step\/[1-7]|w[234]\/[1-6])$/.test(route||""):_etBlockP7();};
var _etBlockHtml7=etBlockHtml;etBlockHtml=function(){return fybActive()?_etBlockHtml7().replace("This is your Etsy sprint","This is your Find Your Buyers sprint"):_etBlockHtml7();};

/* ---------- H2: Home and Help brought into line with the approved hybrid design (15 Nov 2026). ----------
   The hybrid prototype (wen-sales-lab-design/full/h) is the agreed reference. This adds what Home and the navigation were missing:
   the coaching panel names the next session and its date (also required by the Master Build Blueprint: "next coaching date"),
   the community panel shows the latest post, a short "Lately" list of the member's own recent activity, and a Help and support page
   linked from the top bar. All community data comes from calls that already exist; nothing new is stored. */
var HOMEC={at:0,busy:false,ev:null,post:null};
async function comHomePeek(force){
 if(FLAGS.community!==true||HOMEC.busy)return;
 if(!force&&HOMEC.at&&Date.now()-HOMEC.at<60000)return;
 HOMEC.busy=true;
 try{
  var s=await comCall("community_summary");if(s.data)COM.sum=s.data;
  var ev=await comCall("community_events");HOMEC.ev=ev.data||null;
  var p=await comCall("community_list_posts",{p_category:null,p_query:null,p_before:null,p_limit:5});HOMEC.post=(Array.isArray(p.data)?p.data.filter(homeQuotable)[0]:null)||null;
  HOMEC.at=Date.now();
 }catch(e){}
 HOMEC.busy=false;
 if((route||"#/")==="#/"||route==="")renderSafe();
}
function homeNextSession(){var E=HOMEC.ev;return (E&&Array.isArray(E.upcoming)&&E.upcoming.length)?E.upcoming[0]:null;}
function homeCoachPanel(){
 var u=homeNextSession(),h='<section class="rpnl gold">'+rRing()+'<small>Group coaching</small>';
 if(u)h+='<h2>'+esc(u.title||"Group coaching")+'</h2>'+(u.starts_at?'<p><strong>'+esc(comDateTime(u.starts_at))+'</strong></p>':'');
 else h+='<h2>The next session, and your hot-seat question</h2><p>'+(HOMEC.at?'No session is scheduled yet. We’ll post the next one in Coaching.':'Monthly group coaching, and a private way to ask for your message or proposal to be looked at.')+'</p>';
 return h+'<p><a class="btn ghost" href="#/community/coaching">Session details and hot-seat questions</a></p></section>';
}
/* only a published post is ever quoted on Home: never one that is held, hidden, removed or deleted, even the member's own */
function homeQuotable(p){return !!(p&&typeof p==="object"&&typeof p.title==="string"&&p.title&&["deleted","held","hidden","removed"].indexOf(p.status)<0);}
function homeComPanel(){
 var s=COM.sum,n=s?(s.new_posts||0):0,rp=s?(s.replies_to_me||0):0,p=HOMEC.post;
 var h='<section class="rpnl blush"><small>In the community'+comDot()+'</small>';
 if(homeQuotable(p)){var who=typeof p.author==="string"?p.author:"";h+='<p class="voice q">“'+esc(p.title)+'”</p><p>'+(who?esc(who)+(p.author_staff?' (WEN team)':'')+', in ':'In ')+esc(comCatName(p.category))+'.</p>';}
 else h+='<h2>Ask questions, share wins, keep each other accountable</h2>';
 if(n||rp)h+='<p><strong>'+(n?n+' new post'+(n===1?'':'s'):'')+(n&&rp?' and ':'')+(rp?rp+' repl'+(rp===1?'y':'ies')+' to your posts':'')+'</strong> since you last looked.</p>';
 return h+'<p><a class="btn ghost" href="#/community">Open the community</a></p></section>';
}
/* the member's own recent activity, newest first. Only things the app already holds with a date. Never anyone else's activity. */
function homeLatelyItems(){
 var L=[],t=today(),add=function(d,txt){if(typeof d==="string"&&parseYmd(d.slice(0,10))!=null&&d.slice(0,10)<=t)L.push([d.slice(0,10),txt]);};
 try{
  var c=rvCur();if(c&&c.start_day)add(c.start_day,"Started your 30-day sprint: "+xaNameOf(c.experiment==="etsy"||c.experiment==="email"||c.experiment==="show"||c.experiment==="find"?c.experiment:"partnership"));
  if(S.rv&&S.rv.done&&S.rv.at)add(S.rv.at,"Saved your Day 30 review");
  (S.rv&&S.rv.upd||[]).forEach(function(u){add(u.at,"Added a post-sprint update");});
  (S.past||[]).forEach(function(p){add(p.archivedAt,"Your "+xaNameOf(p.exp)+" sprint moved to Past sprints");});
  var nm=function(id){var cd=(S.cands||[]).filter(function(x){return String(x.id)===String(id);})[0];return cd&&cd.name?cd.name:"a partner";};
  Object.keys(S.out||{}).forEach(function(id){var o=S.out[id];if(!o)return;add(o.sentAt,"Sent a message to "+nm(id));add(o.repliedAt,"Recorded a reply from "+nm(id));add(o.fuAt,"Sent a follow-up to "+nm(id));});
  if(S.et&&S.et.cm){add(S.et.cm.at,"Committed your Etsy change");add(S.et.res&&S.et.res.aAt,"Recorded your Etsy numbers");}
  if(S.em&&S.em.cm){add(S.em.cm.at,"Committed your three emails");(S.em.sd||[]).forEach(function(x,i){add(x.d,"Sent email "+(i+1));});add(S.em.res&&S.em.res.at,"Recorded your email numbers");}
  if(S.sts&&S.sts.cm){add(S.sts.cm.at,"Committed your three demos");(S.sts.pb||[]).forEach(function(x,i){add(x.d,"Published demo "+(i+1));});add(S.sts.res&&S.sts.res.at,"Recorded your demo numbers");}
  if(S.fyb&&S.fyb.cm){add(S.fyb.cm.at,"Committed your plan to find your buyers");var seen={};(S.fyb.lg||[]).forEach(function(x){if(x.wd)return;var pl=fybPlanPlace(x.p),k=x.d+"|"+x.p;if(seen[k])return;seen[k]=1;add(x.d,"Took part in "+(pl?pl.name:"one of your places"));});add(S.fyb.res&&S.fyb.res.at,"Recorded your numbers");}
 }catch(e){}
 L.sort(function(a,b){return a[0]<b[0]?1:(a[0]>b[0]?-1:0);});
 var out=[],dup={};L.forEach(function(x){var k=x[0]+x[1];if(!dup[k]){dup[k]=1;out.push(x);}});
 return out.slice(0,4);
}
function homeWhen(d){var n=Math.round((parseYmd(today())-parseYmd(d))/86400000);if(n<=0)return "Today";if(n===1)return "Yesterday";if(n<7)return new Date(parseYmd(d)).toLocaleDateString("en-GB",{weekday:"long"});return dayLab(d);}
function homeLately(){
 var L=homeLatelyItems();
 return '<div class="card"><h2>Lately</h2>'+(L.length?'<ol class="lately">'+L.map(function(x){return '<li><span>'+esc(homeWhen(x[0]))+'</span><span>'+esc(x[1])+'</span></li>';}).join("")+'</ol>':'<p class="mute">Nothing yet. What you do appears here, newest first.</p>')+'</div>';
}
function helpPage(){
 var line=supportStepLine();
 var h='<h1>Help and support</h1><p class="mute">Two ways to reach the WEN team, and answers to the questions the sprint clock raises most.</p><div class="rcols"><div>';
 h+='<div class="card"><h2>A question about the programme</h2><p>We reply within two working days. It helps to include the step you are working on.</p><p><a class="btn" href="'+mailtoHref("Sales Lab help","Hi, I need help with the Sales Lab.\n\nThe step I'm working on: "+line+"\nMy question: \n")+'">Email WEN support</a></p></div>';
 h+='<div class="card"><h2>Can’t get in, or something broke</h2><p>Use the urgent route and we’ll look at it first. Please say what you expected to happen, what happened instead, and add a screenshot if you can.</p><p><a class="btn" href="'+mailtoHref("Sales Lab: urgent, something is not working","Hi, something is not working in the Sales Lab.\n\nWhat I expected: \nWhat happened: \n")+'">Use the urgent route</a></p></div>';
 h+='<div class="card"><h2>Stuck on the work itself</h2>'+(FLAGS.community===true?'<p>Ask other members in the <a href="#/community">community</a>, or send a private <a href="#/community/coaching">hot-seat question</a> for the next coaching session.</p>':'<p>Email WEN support with the step you are on, and we’ll help you find a way forward.</p>')+'<p class="mute">Billing, account and technical problems go to support by email, not the community.</p></div>';
 h+='</div><div class="rside"><div class="card"><h2>About the 30 days</h2><dl class="faq"><dt>Can I pause my sprint?</dt><dd>No. You can finish early, but you cannot pause the clock.</dd><dt>I pressed start by mistake.</dt><dd>You can undo it within 24 hours, before you log any messages or results.</dd><dt>I really began a few days earlier.</dt><dd>You can correct your start date once, within 3 days, and not more than 7 days earlier.</dd><dt>A sale arrived after Day 30.</dt><dd>Add it as a late result in the 14 days after Day 30. It does not extend your sprint.</dd></dl><p class="mute">Or write to '+esc(SUPPORT_EMAIL)+'.</p></div></div></div>';
 return h;
}
var HOMECSS='#mnav .nhelp{color:var(--on,#0F2A2D);text-decoration:none;font-weight:600;font-size:15px;margin-left:22px;margin-right:14px;padding:6px 2px;border-bottom:2px solid transparent;flex:none}#mnav .nhelp[aria-current=page]{border-bottom-color:currentColor}'
+'@media(max-width:820px){#mnav .nhelp{margin-left:auto}}'
+'ol.lately{list-style:none;margin:0;padding:0}ol.lately li{display:flex;gap:14px;padding:8px 0;border-top:1px solid rgba(15,42,45,.12)}ol.lately li:first-child{border-top:0}ol.lately li span:first-child{flex:0 0 92px;color:#4a5a5c;font-size:14px}'
+'dl.faq dt{font-weight:600;margin-top:12px}dl.faq dt:first-child{margin-top:0}dl.faq dd{margin:4px 0 0}.rpnl .voice.q{font-size:20px;line-height:1.3;margin:6px 0}';
(function(){try{var st=document.createElement("style");st.textContent=HOMECSS;(document.head||document.body).appendChild(st);}catch(e){}})();

/* ---------- H1: navigation shell (14 Nov 2026). Home, My Sprint, Experiments, Results, Community (when switched on), Profile. ---------- */
var NAVI={
 home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>',
 sprint:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z"/></svg>',
 exp:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2v6l-5 9a3 3 0 0 0 2.6 4.5h10.8A3 3 0 0 0 20 17l-5-9V2zm2 2h2v5.2l1 1.8h-4l1-1.8z"/></svg>',
 res:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 11v4h2v-4zm4-6v10h2V8zm4 3v7h2v-7z"/></svg>',
 comm:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z"/></svg>',
 profile:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0z"/></svg>'
};
var EXPX=[
 ["part","Partnership-to-Sales","Get other people who reach your buyer to recommend your product.","A shortlist of partners that fit, real messages sent, and a small collaboration tested, with the sales it brings.","No audience yet, or comfortable contacting people","#00C2CB",'<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.6"/><path d="M2 20a6 6 0 0 1 12 0zm11 0a5 5 0 0 1 9 0z"/></svg>'],
 ["etsy","Etsy Sales Bottleneck","Find out whether your listing has a visibility or a conversion problem, then fix one thing.","A clear diagnosis of your listing and one tested change, with before and after numbers.","Sellers with a live Etsy listing","#F2C21D",'<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>'],
 ["email","Email-to-Sale","Turn a relevant list into sales with a three email sequence.","A three email sequence sent to a relevant list, with clicks, orders and revenue measured.","Anyone with a small opted-in list","#FCE9EC",'<svg viewBox="0 0 24 24"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7L4 7v2l8 5 8-5V7z"/></svg>'],
 ["show","Show-to-Sell","Show your product in use and see which demo sells.","Three short demos published, and a clear view of which one sells.","Products that are easy to show in use","#967E61",'<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm6 4v8l7-4z"/></svg>'],
 ["find","Find Your Buyers","Find where your buyers already spend time and join the conversation.","A map of where your buyers spend time, and a first set of helpful contributions that bring visitors.","Starting with no audience","#DDF6F7",'<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>'],
 ["live","LIVE Sales","Sell live on TikTok or YouTube, step by step.","Two to four live sessions run, a repeatable run sheet, and orders traced to them.","People happy on camera with LIVE access","#4a4a4a",'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8l1.4-1.4a7 7 0 0 1 0-10zm12.8 0-1.4 1.4a7 7 0 0 1 0 10l1.4 1.4a9 9 0 0 0 0-12.8z"/></svg>']
];
var SHELLCSS='#mnav{display:none}'
+'body.hasnav #mnav{display:flex;align-items:center;gap:26px;padding:14px clamp(18px,4.5vw,64px);background:var(--band,#00C2CB);color:var(--on,#0F2A2D)}'
+'body[data-area=res]{--band:#0F2A2D;--on:#EEF0ED}body[data-area=comm]{--band:#FCE9EC}body[data-area=coach]{--band:#F2C21D}body[data-area=profile]{--band:#E2E7E3}'
+'#mnav .nmark{display:flex;align-items:center;gap:10px;font:400 20px/1 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.01em;text-decoration:none;color:inherit}'
+'#mnav .nmark img{width:48px;height:48px;border-radius:50%;background:#fff;padding:2px;flex:none}'
+'#mnav .nlinks{display:flex;gap:26px;margin-left:auto}'
+'#mnav .nlinks a{color:inherit;text-decoration:none;font-weight:500;padding:6px 0 4px;border-bottom:3px solid transparent;position:relative}'
+'#mnav .nlinks a[aria-current=page],#mnav .nlinks a:hover{border-bottom-color:currentColor}#mnav .nlinks a[aria-current=page]{font-weight:600}'
+'#mnav .nme{width:40px;height:40px;border-radius:50%;background:var(--on,#0F2A2D);color:var(--band,#00C2CB);display:grid;place-items:center;font:600 15px/1 "Bricolage Grotesque",system-ui,sans-serif;text-decoration:none;flex:none}'
+'#mnav .nme[aria-current=page]{box-shadow:0 0 0 3px var(--band,#00C2CB),0 0 0 6px var(--on,#0F2A2D)}'
+'#mnav :focus-visible{outline:3px solid currentColor;outline-offset:3px}'
+'#mnav .com-dot{position:absolute;top:2px;right:-14px;margin:0}'
+'@media(max-width:820px){body.hasnav main{padding-bottom:96px}body.hasnav #mnav{justify-content:space-between;padding-top:10px;padding-bottom:10px}'
+'#mnav .nlinks{position:fixed;left:0;right:0;bottom:0;z-index:20;gap:0;margin:0;background:#0F2A2D;padding-bottom:env(safe-area-inset-bottom,0)}'
+'#mnav .nlinks a{flex:1;min-width:0;text-align:center;color:#EEF0ED;font-size:13px;padding:17px 1px 15px;border-bottom:0;border-top:4px solid transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
+'#mnav .nlinks a[aria-current=page],#mnav .nlinks a:hover{border-top-color:#F2C21D}#mnav .nlinks a[aria-current=page]{font-weight:700}'
+'#mnav .nlinks a:focus-visible{outline-color:#F2C21D;outline-offset:-4px}#mnav .com-dot{top:8px;right:calc(50% - 34px)}}'
+'.xgrid{display:grid;grid-template-columns:1fr;gap:0 40px}@media(min-width:900px){.xgrid{grid-template-columns:1fr 1fr}}'
+'.xp{background:transparent;color:var(--ink);border-top:3px solid var(--ink);border-radius:0;padding:20px 0 22px;margin:0}.xh2{display:flex;gap:14px;align-items:center;margin-bottom:8px}'
+'.xk{font:600 14px "Instrument Sans",system-ui,sans-serif;letter-spacing:0;text-transform:none;color:var(--mute)}.xt{font:600 26px/1.15 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.01em;color:var(--ink);margin:2px 0 0}'
+'.xs{color:var(--ink);margin:0 0 12px;font-size:17px;max-width:none}.xo{background:#fff;border-left:7px solid #00C2CB;border-radius:0;padding:12px 16px;margin:8px 0}.xo b{display:block;color:var(--mute);font:600 14px "Instrument Sans",system-ui,sans-serif;letter-spacing:0;text-transform:none;margin-bottom:3px}.xo span{color:var(--ink);font:400 16px/1.45 "Instrument Sans",system-ui,sans-serif}'
+'.xm{color:var(--mute);font-size:15px;margin:8px 0 0;max-width:none}.xi{display:flex;width:54px;height:54px;border-radius:50%;border:2px solid var(--ink);align-items:center;justify-content:center;flex:none}.xi svg{width:28px;height:28px;fill:#000}.xi.dk svg{fill:#fff}'
+'.btn.teal{background:#F2C21D;color:#0F2A2D}.xp .btn{display:block;text-align:center;margin-top:14px}'
+'@media(max-width:480px){.tabs{flex-wrap:nowrap;gap:6px}.tabs .chip{flex:1 1 0;min-width:0;white-space:nowrap;padding:8px 4px;font-size:13.5px;text-align:center}}';
function effRoute(){var r=route||"#/";if(/^#\/community/.test(r)&&FLAGS.community!==true)return "#/";return r;}
/* R1 navigation (14 Nov 2026): Home, Sprint, Results, then Community and Coaching while the community switch is on. Experiments sits under Sprint; Profile is the initial at the top right. */
function tabsFor(){var t=[["home","Home","#/"],["sprint","Sprint","#/sprint"],["exp","Experiments","#/experiments"],["res","Results","#/results"]];if(FLAGS.community===true){t.push(["comm","Community","#/community"]);t.push(["coach","Coaching","#/community/coaching"]);}return t;}
function tabOf(r){r=r||"#/";if(r==="#/sprint"||/^#\/(step|w2|w3|w4)\/\d$/.test(r))return "sprint";if(r==="#/experiments"||/^#\/etsy/.test(r))return "exp";if(r==="#/results"||r==="#/review")return "res";if(r==="#/community/coaching")return "coach";if(/^#\/community/.test(r))return "comm";if(r==="#/profile")return "profile";if(r==="#/help")return "help";return "home";}
function navHtml(){var cur=tabOf(effRoute());return '<a class="nmark" href="#/"><img src="logo-160.png" alt="WEN" width="48" height="48"><span>Sales Lab</span></a><div class="nlinks">'+tabsFor().map(function(t){return '<a href="'+t[2]+'"'+(t[0]===cur?' aria-current="page"':'')+'><span>'+t[1]+'</span>'+(t[0]==="comm"?comDot():'')+'</a>';}).join("")+'</div><a class="nhelp" href="#/help"'+(cur==="help"?' aria-current="page"':'')+'>Help</a><a class="nme" href="#/profile" aria-label="Your profile"'+(cur==="profile"?' aria-current="page"':'')+'>'+esc(String((ME&&ME.email)||"?").charAt(0).toUpperCase())+'</a>';}
function shellNav(){
 var show=PHASE==="app"&&route!=="#/admin";
 if(!document.getElementById("shellcss")){var st=document.createElement("style");st.id="shellcss";st.textContent=SHELLCSS;document.head.appendChild(st);}
 var nv=document.getElementById("mnav");
 if(!nv){nv=document.createElement("nav");nv.id="mnav";nv.setAttribute("aria-label","Main");var mn=document.getElementById("app");if(mn&&mn.parentNode&&mn.parentNode.insertBefore)mn.parentNode.insertBefore(nv,mn);else document.body.appendChild(nv);}
 nv.innerHTML=show?navHtml():"";
 document.body.classList.toggle("hasnav",show);
 try{document.body.setAttribute("data-area",show?tabOf(effRoute()):"");}catch(e){}
 var bn=document.querySelector(".banner");if(bn)document.documentElement.style.setProperty("--bh",bn.offsetHeight+"px");
}
function heroHtml(kick,title,text,pct,line,href,label){return '<div class="hero"><div class="kicker">'+esc(kick)+'</div><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p>'+(pct!=null?'<div class="bar" aria-hidden="true"><i style="width:'+pct+'%"></i></div><p style="font-size:14px">'+line+'</p>':'')+'<a class="btn" href="'+href+'">'+label+'</a></div>';}
function homeHub(){
 var h='<h1>Home</h1><p class="mute">Your Sales Lab sprint: Partnership-to-Sales</p>'+sprintBar(false);
 if(!doneCount()&&!S.cands.length&&!(S.focus.product||"").trim())h+='<div class="card"><h2>Welcome to the Sales Lab</h2><p>In this test build you will run Partnership-to-Sales: four weeks, about 3 to 5 hours a week, to get other people who reach your buyer to recommend your product. Go at your own pace. Everything saves as you go, and your next step is always on this page.</p></div>';
 if(!week1Done()){
  var ns=nextStep(),d=doneCount(),left=STEPS.filter(function(x){return !S.steps[x.n];}).reduce(function(a,x){return a+x.m;},0);
  h+=heroHtml(d===0?"Start here":"Your next step","Step "+ns.n+": "+ns.t,"About "+ns.m+" minutes. "+(d===0?"You can stop at any time and come back. Everything saves as you go.":"Pick up where you left off."),Math.round(d/7*100),d+" of 7 steps done &middot; about "+hm(left)+" left","#/step/"+ns.n,(d===0?"Start step ":"Continue with step ")+ns.n+" &rarr;");
 }else{
  var d2=STEPS2.filter(function(x){return S.w2.steps[x.n];}).length,na=w2NextAction(),left2=STEPS2.filter(function(x){return !S.w2.steps[x.n];}).reduce(function(a,x){return a+x.m;},0);
  if(d2>=6)h+=heroHtml("Week 2 complete","Well done, Week 2 is finished","Anything still open, like follow-ups and replies, carries forward. Weeks 3 and 4 are not part of this test build yet.",null,"","#/sprint","Open My Sprint &rarr;");
  else h+=heroHtml("Week 2: your next step",na.t,na.m?"About "+na.m+" minutes. Pick up where you left off.":"Pick up where you left off.",Math.round(d2/6*100),d2+" of 6 steps done &middot; about "+hm(left2)+" left",na.link,"Continue &rarr;");
  h+=w2Banner();
 }
 h+=sprintGlance();
 if(FLAGS.community===true)h+=comHomeCard();
 return h+helpCard();
}
function experimentsPageOld(){
 var h='<h1>Experiments</h1><p class="mute">Six experiments, four weeks each, about 3 to 5 hours a week. You run one at a time.</p><div class="note warn"><strong>Temporary test limitation.</strong> In this test build only Partnership-to-Sales is open. In the full Sales Lab you will complete a short sales check, see an explained recommendation, and choose any of the six experiments. You will not be required to start with Partnership-to-Sales.</div><div class="xgrid">';
 EXPX.forEach(function(x,i){
  var cur=x[0]==="part";
  h+='<div class="xp"><div class="xh2"><span class="xi'+((x[0]==="show"||x[0]==="live")?' dk':'')+'" style="background:'+x[5]+'">'+x[6]+'</span><div><div class="xk">Experiment '+(i+1)+'</div><div class="xt">'+esc(x[1])+'</div></div></div><p class="xs">'+esc(x[2])+'</p><div class="xo"><b>Your outcome</b><span>'+esc(x[3])+'</span></div><div class="xm">4 weeks &middot; 3 to 5 hours a week &middot; Best for: '+esc(x[4])+'</div>';
  h+=cur?'<div class="xm">Open in this test build. Your progress: '+(week1Done()?"Week 2":"Week 1")+' of 4. Find it under <a href="#/sprint">My Sprint</a>.</div>':'<div class="xm"><strong>Coming soon.</strong> Not open in this test build.</div>';
  h+='</div>';
 });
 return h+'</div>';
}
function nvTxt(o,money){o=o||{};if(o.s==="value"&&String(o.v||"").trim()!=="")return (money?sym(S.focus.currency):"")+o.v;if(o.s==="zero")return (money?sym(S.focus.currency):"")+"0";if(o.s==="unknown")return "I don't know";return "Not set";}
function resultsPageOld(){
 var b=S.base,sent=w2Sent(),replies=sent.filter(function(e){return e.o.reply&&e.o.reply!=="noreply";}).length,due=w2Pending().filter(function(e){return w2Due(e);}).length;
 var h='<h1>Results</h1><p class="mute">Your numbers, and what they show.</p>';
 h+='<div class="card"><h2>Where you started</h2><p class="mute">The last 30 days before your sprint, from Week 1, step 1. "I don\'t know" stays unknown. It is never turned into zero.</p><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.orders))+'</b>Orders</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.revenue,true))+'</b>Revenue</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.partner))+'</b>Sales from partners</div></div><p><a class="btn ghost" href="#/step/1">Update my starting numbers</a></p></div>';
 h+='<div class="card"><h2>Your outreach so far</h2>';
 if(sent.length||week1Done())h+='<div class="tiles"><div class="tile"><span class="ti" aria-hidden="true">'+ICO.people+'</span><b>'+sent.length+'</b>Messages sent</div><div class="tile"><span class="ti" aria-hidden="true">'+ICO.chat+'</span><b>'+replies+'</b>Replies</div><div class="tile"><span class="ti" aria-hidden="true">'+ICO.bell+'</span><b>'+due+'</b>Follow-ups due</div></div><p class="mute">From your Week 2 outreach list. "No reply yet" is never counted as a no.</p>';
 else h+='<p class="mute">This starts in Week 2, once you have finished Week 1 and sent your first message.</p>';
 h+='</div><div class="card"><h2>Coming next</h2><p>The weekly results log (reach, enquiries, orders, revenue and costs), your Day 30 review, and your past sprints are not part of this test build yet. They will appear here.</p></div>';
 return h;
}
function profilePage(){
 var h='<h1>Profile</h1><p class="mute">Your account, reminders and data in one place.</p>';
 h+='<div class="card"><h2>Your account</h2><p>Signed in as <strong>'+esc(ME?ME.email:"")+'</strong>.</p><p class="row"><button type="button" class="btn ghost" data-a="signout">Sign out</button> <button type="button" class="btn ghost" data-a="signoutall">Sign out of all devices</button></p>'+(FRAMED?'<p class="mute"><a href="'+esc(location.href.split("#")[0])+'" target="_blank" rel="noopener">Open the Sales Lab on its own page</a></p>':'')+'</div>';
 if(FLAGS.community===true)h+='<div class="card"><h2>Community profile</h2><p class="mute">Your display name, short bio and optional photo in the community.</p><p><a class="btn ghost" href="#/community/me">Open my community profile</a></p></div>';
 h+=remindCard();
 h+='<div class="card"><h2>Your data</h2><p class="mute">Your work belongs to you. You can download a copy at any time, or delete it.</p><div class="row">'+(FLAGS.exports===false?'<p class="mute">Downloading your data is switched off at the moment.</p>':'<button type="button" class="btn ghost" data-a="exportdata">Download my data</button>')+'<button type="button" class="btn ghost" data-a="deletedata">Delete my saved work</button></div></div>';
 h+='<div class="card"><h2>Earlier saved versions</h2><p class="mute">Your work saves automatically. If something was overwritten by mistake, for example from another tab or device, you can bring an earlier version back.</p>';
 if(UI.versions===null)h+='<button type="button" class="chip" data-a="showversions">Show earlier versions</button>';
 else if(!UI.versions.length)h+='<p class="mute">No earlier versions yet.</p>';
 else h+='<p class="mute"><strong>Your current work:</strong> '+esc(verSummary(S))+'</p>'+UI.versions.slice(0,8).map(function(v){var d=new Date(v.saved_at);return '<div class="crow" style="display:block"><p style="margin:0"><strong>'+d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})+' at '+pad(d.getHours())+':'+pad(d.getMinutes())+'</strong></p><p class="mute" style="margin:2px 0 8px">'+(v.sum?esc(v.sum):"A summary is not available for this version.")+'</p><button type="button" class="chip sm" data-a="restorev" data-id="'+v.id+'">Restore this version</button></div>';}).join("");
 h+='</div>'+helpCard();
 if(ME&&ME.admin)h+='<div class="card"><h2>Admin</h2><p class="mute">Manage who has access and the on and off switches.</p><p><a class="btn ghost" href="#/admin">Open admin tools</a></p></div>';
 return h;
}

/* ---------- R2 redesign (14 Nov 2026): Home, page headers in the colour band, Experiments page. ----------
   Presentation only, with one approved fix: Home now follows the member into Weeks 3 and 4 and past Day 30
   (it used to say those weeks were not built). Every rule it shows comes from the existing functions:
   nextStep, w2NextAction, w3NextAction, w4NextAction, rvPhase, rvDay, rvClock, weekNDone, sprConfirm, chkCard.
   homeHub and experimentsPage below replace the earlier versions of the same name further up this file. */
var RC={ink:"#0F2A2D",teal:"#00C2CB",gold:"#F2C21D",coral:"#E4572E",pink:"#F6B8C1",off:"#C9D3D0",paper:"#EEF0ED",grey:"#9FB0AD"};
var RWK=["Find your partners","The first real contact","One small collaboration","Run it and read the result"];
function rSvg(vb,inner,c){return '<svg class="'+(c||"")+'" viewBox="'+vb+'" aria-hidden="true" focusable="false">'+inner+'</svg>';}
function rWeekG(n,on,hole){
 var t=on?RC.teal:RC.off,s=on?RC.gold:RC.off,r=on?RC.coral:RC.off,d=on?RC.ink:RC.grey;
 if(n===1)return '<circle r="42" fill="'+t+'"/><circle r="26" fill="'+(hole||RC.paper)+'"/><circle r="11" fill="'+d+'"/>';
 if(n===2)return '<rect x="-46" y="-32" width="92" height="64" rx="6" fill="'+s+'"/><path d="M-46 -26 0 8 46 -26" fill="none" stroke="'+d+'" stroke-width="6" stroke-linejoin="round"/>';
 if(n===3)return '<circle cx="-19" r="32" fill="'+r+'"/><circle cx="19" r="32" fill="'+t+'" style="mix-blend-mode:multiply"/>';
 return '<rect x="-42" y="6" width="24" height="36" fill="'+d+'"/><rect x="-12" y="-18" width="24" height="60" fill="'+t+'"/><rect x="18" y="-42" width="24" height="84" fill="'+s+'"/>';
}
function rExpG(k,on,dark){
 var t=on?RC.teal:RC.off,s=on?RC.gold:RC.off,r=on?RC.coral:RC.off,d=on?(dark?"#EEF0ED":RC.ink):RC.grey;
 if(k==="part")return '<circle cx="-19" r="32" fill="'+r+'"/><circle cx="19" r="32" fill="'+t+'"'+(dark?' fill-opacity=".85"':' style="mix-blend-mode:multiply"')+'/>';
 if(k==="etsy")return '<circle cx="-8" cy="-8" r="30" fill="none" stroke="'+s+'" stroke-width="12"/><path d="M16 16 42 42" stroke="'+d+'" stroke-width="12" stroke-linecap="round"/>';
 if(k==="email")return '<rect x="-46" y="-32" width="92" height="64" rx="6" fill="'+s+'"/><path d="M-46 -26 0 8 46 -26" fill="none" stroke="'+d+'" stroke-width="6" stroke-linejoin="round"/>';
 if(k==="show")return '<rect x="-44" y="-34" width="88" height="68" rx="8" fill="'+d+'"/><path d="M-12 -18 20 0 -12 18z" fill="'+s+'"/>';
 if(k==="find")return '<path d="M0 46C-30 10 -34 -6 -34 -14a34 34 0 0 1 68 0c0 8 -4 24 -34 60z" fill="'+r+'"/><circle cy="-14" r="13" fill="#fff"/>';
 return '<circle r="44" fill="none" stroke="'+t+'" stroke-width="8"/><circle r="27" fill="none" stroke="'+s+'" stroke-width="8"/><circle r="11" fill="'+r+'"/>';
}
function rRing(){var c=[RC.teal,RC.ink,RC.coral,"#fff",RC.teal,RC.pink,RC.ink],h="";for(var i=0;i<7;i++){var an=i/7*6.283-1.57;h+='<circle cx="'+(150+78*Math.cos(an)).toFixed(1)+'" cy="'+(110+78*Math.sin(an)).toFixed(1)+'" r="24" fill="'+c[i]+'"/>';}return rSvg("0 0 300 220",h,"rcorner");}
function rShort(){if(!SPR.loaded)return "";var p=rvPhase();return p==="notstarted"?"Not started yet":(p==="during"?"Day "+rvDay()+" of 30":"Sprint complete");}
function rDays(){
 if(!SPR.loaded)return "";
 var p=rvPhase(),d=rvDay(),h='<ol class="rdays" aria-label="'+esc(rShort())+'">';
 for(var i=1;i<=30;i++){var c=p==="notstarted"?"":(p!=="during"?"p":(i<d?"p":(i===d?"t":"")));h+='<li class="'+c+'"'+(c==="t"?' aria-current="true"':'')+'>'+i+'</li>';}
 return h+'</ol>';
}
function rDates(){
 if(!SPR.loaded)return "";
 if(rvPhase()==="during")return "Day 1 was "+dayLab(rvStart())+". Day 30 is "+dayLab(rvDay30())+".";
 return rvClock();
}
function rCount(L,D){return L.filter(function(s){return D&&D[s.n];}).length;}
function rWeeks(){
 var L=[STEPS,STEPS2,STEPS3,STEPS4],D=[S.steps,(S.w2||{}).steps,(S.w3||{}).steps,(S.w4||{}).steps];
 var w1=week1Done(),w2=w1&&week2Done(),w3=w2&&week3Done(),open=[true,w1,w2,w3],cur=w3?4:(w2?3:(w1?2:1)),out=[];
 for(var i=0;i<4;i++){
  var n=rCount(L[i],D[i]),tot=L[i].length,st=(i+1<cur)?"done":(i+1===cur?"now":"later"),first=0;
  if(st==="now"){for(var j=0;j<tot;j++){if(!(D[i]&&D[i][L[i][j].n])){first=L[i][j].n;break;}}}
  out.push({n:i+1,title:RWK[i],L:L[i],D:D[i]||{},done:n,total:tot,state:st,open:open[i],first:first,
   status:st==="later"?"Opens when you finish Week "+i:(st==="done"&&n===tot?"Done":n+" of "+tot+" steps done")});
 }
 return out;
}
function rWeekAct(n){return n<=2?"w2-week":(n===3?"w3-week":"w4-week");}
function rBars(w){return '<span class="rbars" aria-hidden="true">'+w.L.map(function(s){return '<i class="'+(w.D[s.n]?"d":(w.first===s.n?"n":""))+'"></i>';}).join("")+'</span>';}
function rTrack(){
 return '<div class="rweeks">'+rWeeks().map(function(w){
  var inner='<small>Week '+w.n+'</small><b>'+RWK[w.n-1]+'</b>'+rBars(w)+'<em>'+w.status+'</em>';
  return w.open?'<a class="rwk '+w.state+'" href="#/sprint" data-a="'+rWeekAct(w.n)+'" data-val="'+w.n+'">'+inner+'</a>':'<div class="rwk later">'+inner+'</div>';
 }).join("")+'</div>';
}
function rGuide(w,n){var g=CONTENT["w"+w+".guide"];if(!g)return "";try{g=JSON.parse(g);}catch(e){return "";}return (g[n-1]&&g[n-1][0])||"";}
function rNext(){
 var ph=SPR.loaded?rvPhase():"during",fresh=!doneCount()&&!S.cands.length&&!(S.focus.product||"").trim();
 if(ph==="notstarted"&&fresh&&!(S.chk&&S.chk.done))return {k:"Start here",t:"Take the six-question sales check",d:"Six quick questions, about five minutes, and no figures needed. Your answers suggest which experiment fits where you sell and what feels stuck. You are free to choose your own.",m:5,link:"#/experiments",b:"Take the sales check",skip:true};
 if(ph==="window"||ph==="closed"){
  if(!S.rv.done)return {k:"Your sprint is complete",t:"Save your Day 30 review",d:"Look back at where you started, what you did and what the evidence suggests. It records your Day 30 position.",link:"#/review",b:"Open my Day 30 review"};
  return {k:"When you are ready",t:"Choose your next experiment",d:"Your business details carry forward. Nothing starts until you press start, and you can take a break first.",m:5,link:"#/experiments",b:"See the experiments"};
 }
 var w,na;
 if(!week1Done()){var ns=nextStep();w=1;na=ns?{t:"Step "+ns.n+": "+ns.t,m:ns.m,link:"#/step/"+ns.n}:{t:"Step 7: "+STEPS[6].t,m:STEPS[6].m,link:"#/step/7"};}
 else if(!week2Done()){w=2;na=w2NextAction();}
 else if(!week3Done()){w=3;na=w3NextAction();}
 else{w=4;na=w4NextAction();}
 var m=/^Step (\d+): ([\s\S]*)$/.exec(na.t),n=m?+m[1]:0;
 return {k:fresh?"Start here":"Your next step",t:m?m[2]:na.t,d:(n&&rGuide(w,n))||(na.wait?"Nothing to do right now. You can look ahead while you wait.":"Pick up where you left off. Everything saves as you go."),m:na.m,link:na.link,b:n?(fresh?"Start":"Continue")+" Week "+w+", step "+n:(na.wait?"Open":"Continue"),w:w,n:n};
}
function rStepRow(n,t,link,meta,cls){return '<a class="step'+(cls?" "+cls:"")+'" href="'+link+'"><span class="n">'+(cls==="done"?"&#10003;":n)+'</span><span class="t"><span class="tt">'+esc(t)+'</span></span><span class="mute">'+meta+'</span></a>';}
function rHomeList(nx){
 var ph=SPR.loaded?rvPhase():"during";
 if(nx.link==="#/experiments"&&ph==="notstarted")return '<div class="card"><h2>Before your sprint</h2>'+rStepRow(1,"Take the sales check","#/experiments","5 min","next")+rStepRow(2,"Choose your experiment","#/experiments","5 min")+rStepRow(3,"Start your 30 days when you are ready","#/sprint","")+'<p class="mute">Browsing and preparing do not start your 30 days. You can also go straight to <a href="#/step/1">Week 1, step 1</a>.</p></div>';
 if(ph==="window"||ph==="closed")return '<div class="card"><h2>After your sprint</h2>'+rStepRow(1,S.rv.done?"Day 30 review saved":"Save your Day 30 review","#/review",S.rv.done?"Done":"",S.rv.done?"done":"next")+rStepRow(2,"Add any late results","#/review",ph==="window"?"until "+dayLab(rvEnd()):"Window closed")+rStepRow(3,"Choose your next experiment","#/experiments","5 min",S.rv.done?"next":"")+'</div>';
 var W=rWeeks().filter(function(x){return x.state==="now";})[0],base=W.n===1?"#/step/":"#/w"+W.n+"/";
 return '<div class="card"><h2>Week '+W.n+': '+W.title+'</h2>'+W.L.map(function(s){var dn=W.D[s.n];return rStepRow(s.n,s.t,base+s.n,dn?"Done":s.m+" min",dn?"done":(W.first===s.n?"next":""));}).join("")+'</div>';
}
function rXRow(){
 var ph=SPR.loaded?rvPhase():"";
 return '<ul class="rxrow">'+EXPX.map(function(x){var open=!!EXPOPEN[x[0]];return '<li class="'+(open?"open":"soon")+'">'+rSvg("-50 -50 100 100",rExpG(x[0],open))+'<b>'+esc(x[1])+'</b><span>'+(open?(ph==="during"&&EXPKEY[rvExp()]===x[0]?"Your current experiment":"Open now"):"Coming soon")+'</span></li>';}).join("")+'</ul><p><a class="link" href="#/experiments">See all six experiments</a></p>';
}
function rSoFar(){
 var b=S.base||{},have=b.orders&&b.orders.s&&b.revenue&&b.revenue.s&&b.partner&&b.partner.s,h='<div class="card"><h2>Your sprint so far</h2>';
 if(!doneCount()&&!S.cands.length)return h+'<p class="mute">Your numbers appear here once you begin. What you did, what came back and what sold are always kept apart.</p></div>';
 if(week1Done()){var c=w4Ctr();h+='<div class="tiles"><div class="tile"><b>'+c.msgs+'</b><span>Messages sent</span></div><div class="tile"><b>'+c.resp+'</b><span>Responses received</span></div><div class="tile"><b>'+c.opp+'</b><span>Opportunities created</span></div></div>';}
 else h+='<div class="tiles"><div class="tile"><b>'+S.cands.length+'</b><span>Partners found</span></div><div class="tile"><b>'+shortlisted().length+'</b><span>On your shortlist</span></div><div class="tile"><b aria-hidden="true">'+(have?"&#10003;":"&ndash;")+'</b><span>Starting numbers<span class="sr">: '+(have?"recorded":"not recorded yet")+'</span></span></div></div>';
 return h+'<p><a class="link" href="#/results">Open your results</a></p></div>';
}
function homeHub(){
 var nx=rNext(),fresh=nx.k==="Start here",ph=SPR.loaded?rvPhase():"",done=rWeeks().reduce(function(a,w){return a+w.done;},0),tt=esc(nx.t);
 var h='<div class="phd rh"><div class="rgrid"><div><p class="hello"><span class="voice">'+(fresh?"Welcome to the Sales Lab.":(ph==="window"||ph==="closed"?"You finished a sprint.":"Good to see you."))+'</span><span class="when">'+esc(rShort())+'</span></p><h1>'+tt+(/[.?!]$/.test(nx.t)?"":".")+'</h1></div>'
  +'<div class="rpanel"><small>'+esc(nx.k)+'</small><p>'+esc(nx.d)+'</p><a class="btn" href="'+nx.link+'">'+esc(nx.b)+'</a>'+(nx.m?'<span class="mins">About '+hm(nx.m)+'</span>':'')+(nx.skip?'<p class="rskip"><a href="#/step/1">Skip for now and start Week 1, step 1</a></p>':'')+'</div></div>'+rDays()+'<p class="rdates">'+esc(rDates())+'</p></div><!--/phd-->';
 if(!SPR.loaded)h+=sprintBar(false);
 h+=pastOpenNote();
 h+='<section class="rtrack"><h2>'+(done?done+' of '+xaTotal()+' steps done in '+xaName():xaName()+': '+xaTotal()+' steps across four weeks')+'</h2>'+rTrack()+'</section>';
 h+='<div class="rcols"><div>'+rHomeList(nx)+(etActive()?'':(week1Done()?w2Banner():''))+'<div class="card"><h2>Experiments</h2>'+rXRow()+'</div></div><div class="rside">'+rSoFar();
 if(FLAGS.community===true){h+=homeCoachPanel()+homeComPanel();comHomePeek(false);}
 h+=homeLately();
 return h+'</div></div>'+helpCard();
}
function experimentsPage(){
 var ph=rvPhase(),h='<h1>Experiments</h1><p class="mute">Six experiments, four weeks each, about 3 to 5 hours a week. You run one sprint at a time, and you choose when the next one starts. Nothing starts automatically.</p>'+sprintBar(false);
 if(UI.sprErr&&ph==="notstarted")h+='<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>';
 function card(x,i){
  var cur=x[0]==="part",c='<li class="rxc '+(cur?"open":"soon")+'"><div class="rxg">'+rSvg("-50 -50 100 100",rExpG(x[0],cur,cur))+'</div><div class="rxb"><p class="rxk">Experiment '+(i+1)+'</p><h2>'+esc(x[1])+'</h2><p class="rxs">'+esc(x[2])+'</p><div class="rxo"><b>Your outcome</b><span>'+esc(x[3])+'</span></div><p class="rxm">4 weeks &middot; 3 to 5 hours a week &middot; Best for: '+esc(x[4])+'</p>';
  if(!cur)c+='<p class="rxm"><strong>Coming soon.</strong> Not open yet, so it cannot be started.</p>';
  else if(!SPR.loaded)c+='<p class="rxm">We could not check your sprint just now. Please refresh the page.</p>';
  else if(ph==="during")c+='<p class="rxm"><strong>Your current experiment.</strong> '+esc(rvClock())+'. Find it under <a href="#/sprint">My Sprint</a>. You can start your next sprint after Day 30.</p>';
  else c+=(ph==="notstarted"?'<p class="rxm">Ready when you are. Your 30 days begin only when you press the button.</p>':'<p class="rxm">Your last sprint is complete. You can choose when to start another, and it will not start by itself.</p>')+sprConfirm(ph==="notstarted"?"Start my 30-day sprint":"Start another sprint");
  return c+'</div></li>';
 }
 var open="",rest="";EXPX.forEach(function(x,i){if(x[0]==="part")open+=card(x,i);else rest+=card(x,i);});
 var first=ph==="notstarted"&&!(S.chk&&S.chk.done);if(first)h+='<div class="rchk">'+chkCard()+'</div>';h+='<ul class="rxgrid">'+open+'</ul>';
 h+='<div class="note warn"><strong>Temporary test limitation.</strong> In this test build only Partnership-to-Sales can be started. The other five will become available as they are built. You will always be able to choose any experiment that is open.</div>';
 if(!first)h+='<div class="rchk">'+chkCard()+'</div>';
 return h+'<ul class="rxgrid">'+rest+'</ul>';
}
/* Page headers move into the colour band. This only rearranges what a page already returned:
   an optional back link, the h1 and an optional intro line. Step pages get their real title as the heading. */
function rHead(html){
 var area=tabOf(effRoute());
 if(area==="coach")html=html.replace("<h1>Community</h1>","<h1>Coaching and events</h1>");
 var cut=html.indexOf("<!--/phd-->");
 if(cut>-1)return html.slice(0,cut)+topbar()+html.slice(cut+11);
 html=html.replace(/<h1>((?:Week \d|Etsy)[^<]*?) &middot; (Step \d of \d)<\/h1><p><strong>([\s\S]*?)<\/strong> <span class="tag">([\s\S]*?)<\/span><\/p>/,function(all,wk,st,title,mins){return '<p class="hello"><span class="voice">'+wk+', '+st.charAt(0).toLowerCase()+st.slice(1)+'</span><span class="when">'+mins.charAt(0).toUpperCase()+mins.slice(1)+'</span></p><h1>'+title+'</h1>';});
 var m=/^((?:<a class="back"[^>]*>[\s\S]*?<\/a>)?(?:<span class="tag" role="note">[\s\S]*?<\/span>)?(?:<p class="hello">[\s\S]*?<\/p>)?<h1>[\s\S]*?<\/h1>(?:<span class="tag" role="note">[\s\S]*?<\/span>)?(?:<p class="mute">[\s\S]*?<\/p>)?)/.exec(html);
 if(!m)return topbar()+html;
 var extra=(area==="sprint"&&route==="#/sprint")?rDays()+'<p class="rdates">'+esc(rDates())+'</p>':"";
 return '<div class="phd">'+m[1]+extra+'</div>'+topbar()+html.slice(m[1].length);
}

/* ---------- R3 redesign (14 Nov 2026): My Sprint, the week picker, step pages and lessons. ----------
   Presentation only. sprintBar and home below replace the earlier versions of the same name; every sentence,
   button, data-a action and rule is carried over unchanged. rEnhance only restyles lesson text after it is drawn. */
function sprintBar(full){
 if(!SPR.loaded)return '<div class="note warn" role="status">We could not check your sprint start just now, so the clock is not shown. Please refresh the page. Nothing has been changed.</div>';
 var ph=rvPhase(),cur=rvCur(),pn=pastOpenNote(),err=UI.sprErr?'<div class="note warn" role="alert">'+esc(UI.sprErr)+'</div>':'';
 if(!full)return '<div class="note info"><strong>'+esc(rvClock())+'</strong>'+(ph==="notstarted"?' <a href="#/sprint">My Sprint</a>':'')+'</div>'+pn;
 if(ph==="notstarted")return pn+'<div class="card rstart"><h2>Your 30-day sprint</h2><p><strong>'+esc(rvClock())+'</strong></p>'+err+'<p class="mute">Browsing, the sales check, choosing an experiment and preparing do not start the clock. It starts only when you press the button below.</p>'+sprConfirm("Start my 30-day sprint")+'</div>';
 var open=!!(UI.sprErr||(UI.sprCorr&&UI.sprCorr.open));
 var h=pn+'<details class="radmin"'+(open?' open':'')+'><summary>Your 30-day sprint: '+esc(rvClock())+'. Dates and corrections</summary>'+err;
 h+='<p class="mute">Day 1 was '+esc(sprFmtDay(rvStart()))+'. Day 30 is '+esc(sprFmtDay(rvDay30()))+'. The results update window runs from Day 31 to Day 44 ('+esc(sprFmtDay(rvEnd()))+').</p>';
 if(cur.corrections&&cur.corrections.length)h+='<p class="mute">Your start date was corrected once, from '+esc(sprFmtDay(cur.corrections[0].from))+'. The original is kept on record.</p>';
 if(sprCanUndo())h+='<p><button type="button" class="chip" data-a="spr-undo">I started by mistake, undo</button> <span class="mute">Available for 24 hours, only before you log any messages or results.</span></p>';
 if(sprCanCorrect()){
  h+='<p><button type="button" class="chip" data-a="spr-corr-open" aria-expanded="'+!!(UI.sprCorr&&UI.sprCorr.open)+'">I actually began earlier</button></p>';
  if(UI.sprCorr&&UI.sprCorr.open)h+='<div class="note info"><label for="spc">The day you really began</label><input id="spc" type="date" data-spr="cday" value="'+esc(UI.sprCorr.day||"")+'" max="'+esc(rvStart())+'" min="'+esc(addDays(rvStart(),-7))+'" style="max-width:200px"><label for="spr">Reason</label><select id="spr" data-spr="creason"><option value="started_earlier"'+(UI.sprCorr.reason==="started_earlier"?" selected":"")+'>I began earlier</option><option value="misclick"'+(UI.sprCorr.reason==="misclick"?" selected":"")+'>I pressed it too late</option><option value="other"'+(UI.sprCorr.reason==="other"?" selected":"")+'>Something else</option></select><p class="mute">You can do this once, within 3 days, and not more than 7 days earlier. Your original date is kept on record. After that, please contact support.</p><p><button type="button" class="btn" data-a="spr-corr-go">Correct my start date</button></p></div>';
 }
 return h+'</details>';
}
function rWeekBtn(n,wk,act,ok,why){
 return '<button type="button" class="chip rwb" aria-pressed="'+(wk===n)+'" data-a="'+act+'" data-val="'+n+'"'+(ok?'':' disabled title="'+why+'"')+'>'+rSvg("-50 -50 100 100",rWeekG(n,ok,"#fff"))+'<b>'+RWK[n-1]+'</b>Week '+n+(n===1&&week1Done()?' &#10003;':'')+'</button>';
}
function home(){
 var wk=(S.week===4&&week3Done()&&week2Done()&&week1Done())?4:((S.week===3||S.week===4)&&week2Done()&&week1Done())?3:((S.week===2||S.week===3||S.week===4)&&week1Done()?2:1);
 var h='<h1>My Sprint</h1><p class="mute">Partnership-to-Sales &middot; Week '+wk+' of 4</p>'+sprintBar(true);
 h+='<div class="tabs rwpick">'+rWeekBtn(1,wk,"w2-week",true,"")+rWeekBtn(2,wk,"w2-week",week1Done(),"Opens when you finish Week 1")+rWeekBtn(3,wk,"w3-week",week2Done()&&week1Done(),"Opens when you finish Week 2")+rWeekBtn(4,wk,"w4-week",week3Done()&&week2Done()&&week1Done(),"Opens when you finish Week 3")+'</div>';
 if(!week1Done())h+='<p class="mute">Week 2 opens when you finish Week 1 (choose "Ready for Week 2" in the last step).</p>';
 if(wk===1)h+=w2Banner();
 if(S.focus.product&&S.focus.format)h+='<div class="note ok"><strong>Your product:</strong> '+esc(productLine())+'</div>';
 if(wk===4)h+=home4();else if(wk===3){h+=home3();if(week3Done())h+='<div class="note ok"><strong>Week 4 is open.</strong> This is where you run it, record your numbers and read the result honestly. <button type="button" class="btn" data-a="w4-week" data-val="4">Open Week 4</button></div>';}else if(wk===2){h+=home2();if(week2Done())h+='<div class="note ok"><strong>Week 3 is open.</strong> This is where you turn replies into one small collaboration proposal. <button type="button" class="btn" data-a="w3-week" data-val="3">Open Week 3</button></div>';}else{if(week1Done())h+='<div class="note ok"><strong>Week 2 is open.</strong> This is where you write to the partners you chose, and send the messages yourself. <button type="button" class="btn" data-a="w2-week" data-val="2">Open Week 2</button></div>';h+=home1();}
 return h+'<p class="mute"><a href="#/experiments">See all six experiments, and the sales check</a></p>';
}
/* Lessons arrive from the content table as paragraphs that begin "1. Why them." and so on. This gives each
   numbered part its own colour marker. It changes no wording and runs after every draw. */
function rEnhance(){
 var C=["#00C2CB","#F2C21D","#E4572E","#0F2A2D","#F6B8C1"],ps=document.querySelectorAll("#app .lesson p");
 for(var i=0;i<ps.length;i++){
  var p=ps[i],st=p.firstElementChild;
  if(!st||st.tagName!=="STRONG"||p.firstChild!==st||p.className)continue;
  var m=/^(\d)\.\s+([\s\S]+)$/.exec(st.textContent);
  if(!m)continue;
  var n=+m[1],b=document.createElement("span");
  b.className="rpn";b.textContent=n;b.style.background=C[(n-1)%5];if((n-1)%5===3)b.style.color="#fff";
  st.textContent=m[2];p.className="rlp";p.insertBefore(b,st);
 }
}

/* ---------- R4 to R6 redesign (14 Nov 2026): Results, Community, Coaching, and the remaining screens. ----------
   Presentation only. resultsPage and rHead below replace the earlier versions of the same name. Every number comes
   from the same functions as before (w4Ctr, w4Val, w4Verdict, nvTxt, rvPastHtml), and no wording about results changes. */
function resultsPage(){
 var b=S.base,sent=w2Sent(),ct=w4Ctr(),r=S.w4.res,c=CL(),started=sent.length||week1Done();
 var h='<div class="phd"><h1>Results</h1><p class="mute">Your numbers, what they show, and what you learned. Counts, not percentages, while samples are small.</p>';
 if(started){
  var sold=vstate(r.orders)!=="unk"||vstate(r.value)!=="unk";
  h+='<div class="rtally"><div><h3>You did</h3><p><b>'+ct.msgs+'</b>Messages sent</p>'+(ct.prop?'<p><b>'+ct.prop+'</b>Proposal sent</p>':'')+'</div><div><h3>Came back</h3><p><b>'+ct.resp+'</b>Responses received</p><p><b>'+ct.opp+'</b>Opportunities created</p></div><div><h3>Sold</h3>'+(sold?'<p><b>'+esc(w4Val(r.orders))+'</b>Orders</p><p><b>'+esc(w4Val(r.value,true))+'</b>Order value</p>':'<p class="none">No sale recorded yet</p>')+'</div></div>';
 }
 h+='</div><!--/phd--><div class="rcols"><div>';
 h+='<div class="card"><h2>Where you started</h2><p class="mute">The last 30 days before your sprint, from Week 1, step 1. "I don\'t know" stays unknown. It is never turned into zero.</p><div class="tiles"><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.orders))+'</b>Orders</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.revenue,true))+'</b>Revenue</div><div class="tile"><b style="font-size:20px">'+esc(nvTxt(b.partner))+'</b>Sales from partners</div></div></div>';
 h+='<div class="card"><h2>Your sprint so far</h2><p class="mute">'+esc(rvClock())+'</p>';
 if(started){
  if(c.status==="proposed")h+='<p style="margin-top:10px">Collaboration: '+esc(W3PATHN[w3Path()])+'.</p>';
  var any=["clicks","orders","value","enq","hours"].some(function(k){return !!r[k].s;});
  if(any)h+='<div class="row" style="margin-top:6px"><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.clicks))+'</b>Link clicks</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.orders))+'</b>Orders</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.value,true))+'</b>Order value</div><div class="stat"><b style="font-size:18px">'+esc(w4Val(r.enq))+'</b>Enquiries</div></div><p class="mute">Each number keeps its own state: seen, unknown or confirmed zero.</p>';
  else h+='<p class="mute">No Week 4 numbers recorded yet. You can add them in <a href="#/w4/3">Week 4, step 3</a>.</p>';
 } else h+='<p class="mute">This starts in Week 2, once you have finished Week 1 and sent your first message.</p>';
 h+='</div>';
 if(started){var v=w4Verdict(w4Inputs());h+='<section class="rpnl gold rread"><small>What the evidence suggests</small><h2>'+(rvPhase()==="during"?"Provisional reading: ":"")+esc(v.label)+'</h2><p>'+esc(v.why[0]||"")+'</p><p class="mute">A reading, not a verdict. <span class="tag">rule '+v.rule+'</span></p></section>';}
 h+='</div><div class="rside">';
 h+='<div class="card"><h2>Day 30 review</h2>'+(S.rv.done?'<p>Saved on '+esc(dayLab(S.rv.at))+': '+esc(S.rv.snap?S.rv.snap.label:"")+'.</p>':'<p class="mute">'+(started?"Look back at your sprint, see what the evidence suggests, and choose what to focus on next. You can open it at any time.":"Available once your sprint has started.")+'</p>')+'<p><a class="btn'+(S.rv.done?' ghost':'')+'" href="#/review">'+(S.rv.done?"Open my review":"Open my Day 30 review")+'</a></p></div>';
 if(S.w4.hist.length)h+='<div class="card"><h2>Your results log</h2><p class="mute">Dated entries you saved in Week 4.</p>'+S.w4.hist.slice().reverse().slice(0,6).map(function(e){return '<div class="crow"><span><strong>'+esc(dayLab(e.d)||e.d)+'</strong><br><span class="mute">Clicks '+esc(w4Val(e.clicks))+', orders '+esc(w4Val(e.orders))+', enquiries '+esc(w4Val(e.enq))+'</span></span></div>';}).join("")+(S.w4.hist.length>6?'<p class="mute">Showing the latest 6 of '+S.w4.hist.length+'. All are kept.</p>':'')+'</div>';
 var learn=[];
 if(S.w2.diff.length)learn.push("What you think made the difference: "+S.w2.diff.join(", "));
 if(S.w4.cap.length)learn.push("What you would do differently: "+S.w4.cap.join(", "));
 if(S.w4.saw.length&&S.w4.saw.indexOf("none")<0)learn.push("What you could not see: "+S.w4.saw.join(", "));
 h+='<div class="card"><h2>What you have learned</h2>'+(learn.length?learn.map(function(x){return '<p style="margin:4px 0">'+esc(x)+'</p>';}).join(""):'<p class="mute">Your own notes and choices from Weeks 2 to 4 appear here as you go.</p>')+(started?rvWorked().slice(0,3).map(function(x){return '<p style="margin:4px 0">&#10003; '+esc(x)+'</p>';}).join(""):'')+'</div>';
 h+='<div class="card"><h2>Past sprints</h2>'+rvPastHtml()+'</div>';
 return h+'</div></div>';
}
/* rHead, extended: a community post has its title inside the first card, so lift it into the band as well. */
function rHead(html){
 var area=tabOf(effRoute());
 if(area==="coach")html=html.replace("<h1>Community</h1>","<h1>Coaching and events</h1>");
 var cut=html.indexOf("<!--/phd-->");
 if(cut>-1)return html.slice(0,cut)+topbar()+html.slice(cut+11);
 html=html.replace(/<h1>((?:Week \d|Etsy)[^<]*?) &middot; (Step \d of \d)<\/h1><p><strong>([\s\S]*?)<\/strong> <span class="tag">([\s\S]*?)<\/span><\/p>/,function(all,wk,st,title,mins){return '<p class="hello"><span class="voice">'+wk+', '+st.charAt(0).toLowerCase()+st.slice(1)+'</span><span class="when">'+mins.charAt(0).toUpperCase()+mins.slice(1)+'</span></p><h1>'+title+'</h1>';});
 var p=/^(<a class="back"[^>]*>[\s\S]*?<\/a>)((?:<div class="note[^"]*"[^>]*>(?:(?!<\/div>)[\s\S])*<\/div>)*)<div class="card"><h1>([\s\S]*?)<\/h1>/.exec(html);
 if(p)return '<div class="phd">'+p[1]+'<h1>'+p[3]+'</h1></div>'+topbar()+p[2]+'<div class="card rpostc">'+html.slice(p[0].length);
 var m=/^((?:<a class="back"[^>]*>[\s\S]*?<\/a>)?(?:<span class="tag" role="note">[\s\S]*?<\/span>)?(?:<p class="hello">[\s\S]*?<\/p>)?<h1>[\s\S]*?<\/h1>(?:<span class="tag" role="note">[\s\S]*?<\/span>)?(?:<p class="mute">[\s\S]*?<\/p>)?)/.exec(html);
 if(!m)return topbar()+html;
 var extra=(area==="sprint"&&route==="#/sprint")?rDays()+'<p class="rdates">'+esc(rDates())+'</p>':"";
 return '<div class="phd">'+m[1]+extra+'</div>'+topbar()+html.slice(m[1].length);
}

/* ---------- events ---------- */
document.addEventListener("click",function(e){
 var lk=e.target.closest("a[href^='#/']");
 if(lk&&!lk.dataset.a){e.preventDefault();if(PHASE!=="app"&&!(PHASE==="adminonly"&&/^#\/(admin|community)/.test(lk.getAttribute("href"))))return;route=lk.getAttribute("href");try{history.replaceState(null,"",location.pathname+location.search+route);}catch(x){}window.scrollTo(0,0);render();return;}
 var t=e.target.closest("[data-a]");if(!t||t.disabled)return;var a=t.dataset.a,d=t.dataset;
 if(a.indexOf("c-")===0){comAction(a,t);return;}
 if(a==="sendcode"){sendCode();return;}
 if(a==="verify"){verifyCode();return;}
 if(a==="pwlogin"){pwLogin();return;}
 if(a==="changeemail"){AUTH.step="email";AUTH.msg="";AUTH.code="";render();return;}
 if(a==="signout"){signOut();return;}
 if(a==="signoutall"){signOutAll();return;}
 if(a.indexOf("ac-")===0){adminComAct(a,d);return;}
 if(a==="adminsweep"){adminSweep();return;}
 if(a==="adminprobe"){adminProbe();return;}
 if(a==="retryload"){loadAll();return;}
 if(a==="adminent"){adminSetAccess(d.email,d.on==="1");return;}
 if(a==="adminadd"){adminAddMember();return;}
 if(a==="adminflag"){adminSetFlag(d.key,d.on==="1");return;}
 if(PHASE!=="app")return;
 if(a.indexOf("w2-")===0){w2Action(a,d,t);return;}
 if(a.indexOf("w3-")===0){w3Action(a,d,t);return;}
 if(a.indexOf("w4-")===0){w4Action(a,d,t);return;}
 if(a.indexOf("rv-")===0){rvAction(a,d,t);return;}
 if(a.indexOf("spr-")===0||a.indexOf("chk-")===0||a.indexOf("fb-")===0){sprAction(a,d,t);return;}
 if(a.indexOf("pu-")===0){puAction(a,d,t);return;}
 if(a.indexOf("et2-")===0){et2Action(a,d);return;}
 if(a.indexOf("et3-")===0){et3Action(a,d);return;}
 if(a.indexOf("et4-")===0){et4Action(a,d);return;}
 if(a.indexOf("pue-")===0){puEAction(a,d);return;}
 if(a.indexOf("pum-")===0){pumAction(a,d);return;}
 if(a.indexOf("em-")===0){emAction(a,d);return;}
 if(a.indexOf("pus-")===0){pusAction(a,d);return;}
 if(a.indexOf("sts-")===0){stsAction(a,d);return;}
 if(a.indexOf("puf-")===0){pufAction(a,d);return;}
 if(a.indexOf("fyb-")===0){fybAction(a,d);return;}
 if(a.indexOf("et-")===0){etAction(a,d,t);return;}
 if(a==="copyprompt"){var ta=document.getElementById("findprompt"),mg=document.getElementById("copymsg");function ok(){if(mg)mg.textContent="Copied. Now paste it into your AI tool.";}function manual(){if(ta){ta.focus();ta.select();}if(mg)mg.textContent="Select all and copy it by hand (it is selected for you).";}try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(ta.value).then(ok,manual);}else{manual();}}catch(x){manual();}return;}
 if(a==="showversions"){showVersions();return;}
 if(a==="exportdata"){exportData();return;}
 if(a==="deletedata"){deleteData();return;}
 if(a==="restorev"){restoreVersion(d.id);return;}
 var f=S.focus;
 if(a==="ffmt"){if(f.format!==d.val){var wasDef=!f.freq||f.freq===(FREQDEF[f.format]||"");f.format=d.val;if(wasDef)f.freq=FREQDEF[d.val]||f.freq;var ks=incKeys().map(function(x){return x[0];});f.inc=f.inc.filter(function(k){return ks.indexOf(k)>-1;});}save();}
 else if(a==="ffreq"){f.freq=(f.freq===d.val?"":d.val);save();}
 else if(a==="finc"){var i=f.inc.indexOf(d.val);if(i>-1)f.inc.splice(i,1);else f.inc.push(d.val);save();}
 else if(a==="schip"&&d.f==="ask"){S.sketch[d.id]=S.sketch[d.id]||{};var sk0=S.sketch[d.id];sk0.ask=(sk0.ask&&sk0.ask[0]===d.val)?[]:[d.val];save();}
 else if(a==="chip"){var arr=getPath(d.path);toggle(arr,d.val,+d.max);save();}
 else if(a==="num"){setPath(d.path,getPath(d.path)===+d.val?0:+d.val);}
 else if(a==="plan"){S.plan=d.val;save();}
 else if(a==="done"){S.steps[d.n]=!S.steps[d.n];save();}
 else if(a==="remind"){S.remind[d.k]=!S.remind[d.k];save();}
 else if(a==="newtype"){S.newType=d.val;S.cmsg="";save();}
 else if(a==="addc"){var nmv=(S.cdraft.name||"").trim(),lk2=(S.cdraft.link||"").trim();if(!nmv){S.cmsg="Add a name first.";}else if(!S.newType){S.cmsg="Choose a type first.";}else{S.cands.push({id:S.nextId++,name:nmv,link:lk2,type:S.newType,fit:{q1:null,q2:null,q3:null,q4:null,q5:null,q6:null},reasons:[],overlapWhy:[],parked:false,short:false});S.cdraft={name:"",link:""};S.newType="";S.cmsg="";}save();}
 else if(a==="delc"){S.cands=S.cands.filter(function(c){return c.id!=d.id;});save();}
 else if(a==="fit"){var c=cand(d.id);c.fit[d.q]=(c.fit[d.q]===+d.v)?null:+d.v;if(c.fit.q1===0)c.short=false;save();}
 else if(a==="cchip"){var c2=cand(d.id);c2[d.f]=c2[d.f]||[];toggle(c2[d.f],d.val,99);save();}
 else if(a==="park"){var c3=cand(d.id);c3.parked=!c3.parked;if(c3.parked)c3.short=false;save();}
 else if(a==="fitnav"){S.fitIndex=(S.fitIndex+ +d.d+S.cands.length)%S.cands.length;save();}
 else if(a==="fitgo"){S.fitIndex=+d.i;save();}
 else if(a==="short"){var c4=cand(d.id);if(c4.short)c4.short=false;else if(shortlisted().length<5&&c4.fit.q1!==0)c4.short=true;save();}
 else if(a==="schip"){S.sketch[d.id]=S.sketch[d.id]||{};var sk=S.sketch[d.id];sk[d.f]=sk[d.f]||[];toggle(sk[d.f],d.val,99);save();}
 else if(a==="dec"){S.decision=d.val;save();}
 else return;
 render();
});
function cand(id){for(var i=0;i<S.cands.length;i++){if(S.cands[i].id==id)return S.cands[i];}return null;}
document.addEventListener("input",function(e){
 var t=e.target;
 if(t.dataset.auth){AUTH[t.dataset.auth]=t.value;return;}
 if(PHASE!=="app")return;
 if(t.dataset.bind){var p=t.dataset.bind;if(p==="refl"){S.refl=t.value;save();return;}setPath(p,t.value);var gl=document.getElementById("glance");if(gl)gl.innerHTML=productDetailsHtml();}
 else if(t.dataset.out){w2Input(t);}
 else if(t.dataset.col){w3Input(t);}
 else if(t.dataset.w4){w4Input(t);}
 else if(t.dataset.rv){rvInput(t);}
 else if(t.dataset.pu){puInput(t);}
 else if(t.dataset.et){etInput(t);}
 else if(t.dataset.pue){puEInput(t);}
 else if(t.dataset.pum){pumInput(t);}
 else if(t.dataset.em){emInput(t);}
 else if(t.dataset.pus){pusInput(t);}
 else if(t.dataset.sts){stsInput(t);}
 else if(t.dataset.puf){pufInput(t);}
 else if(t.dataset.fyb){fybInput(t);}
 else if(t.dataset.sk){S.sketch[t.dataset.sk]=S.sketch[t.dataset.sk]||{};S.sketch[t.dataset.sk].note=t.value;save();}
});
document.addEventListener("keydown",function(e){if(e.key==="Enter"&&PHASE==="signin"&&e.target.dataset&&e.target.dataset.auth){e.preventDefault();if(e.target.dataset.auth==="email")sendCode();else if(e.target.dataset.auth==="code")verifyCode();else if(e.target.dataset.auth==="pw")pwLogin();}});
document.addEventListener("change",function(e){var t=e.target;if(PHASE==="app"&&t.tagName==="SELECT"&&t.dataset.bind){setPath(t.dataset.bind,t.value);render();}});
document.addEventListener("change",function(e){var t=e.target;if(PHASE==="app"&&t&&t.dataset&&t.dataset.out==="sentAt")w2DateChange(t);else if(PHASE==="app"&&t&&t.dataset&&(t.dataset.col==="runStart"||t.dataset.col==="runEnd"))w3DateChange(t);else if(PHASE==="app"&&t&&t.dataset&&t.dataset.spr)sprInputChange(t);});
window.addEventListener("hashchange",function(){if(PHASE!=="app"&&!(PHASE==="adminonly"&&/^#\/(admin|community)/.test(location.hash||"")))return;route=location.hash||"#/";render();});

/* ---------- Community (M3C-b). Shown only while the community switch is ON. Text only, escaped, never run as HTML. ---------- */
var COM={sum:null,prof:null,posts:null,more:false,cat:null,q:"",view:null,people:null,busy:false,err:"",ok:"",loadedFor:"",editing:null,confirm:"",lastVisit:null,seen:false};
var COMCAT=[["general","General Discussion"],["accountability","Weekly Accountability"],["wins","Wins and Lessons"],["coaching","Coaching and Events"]];
function comCatName(k){for(var i=0;i<COMCAT.length;i++)if(COMCAT[i][0]===k)return COMCAT[i][1];return k;}
var COMERR={
 need_profile:"Please choose your community name first.",bad_title:"A title needs 3 to 120 characters.",bad_body:"Please write something (up to the length limit).",
 bad_bio:"Your short bio can be up to 280 characters.",contains_email:"Please leave email addresses out, to keep everyone's details private.",
 name_taken:"That name is already in use. Please choose another.",name_cooldown:"You can change your name once every 7 days.",
 name_mismatch:"The member behind this item has changed. Please close this box and try again.",reason_required:"Please type a reason of 5 to 200 characters before pressing the button.",no_member:"This content no longer has a member (Former member), so there is no one to restrict.",not_active_member:"This member’s access has ended, so there is nothing to restrict.",already_restricted:"This member is already restricted.",cannot_restrict_admin:"Administrator accounts cannot be restricted.",hold_needs_reason_and_review_date:"A legal hold needs a reason and a review date within a year.",no_rule_approved:"No retention rule has been approved yet, so nothing was deleted.",still_a_member:"That person still has access. Members delete their own data from their profile.",is_admin_account:"That is an administrator account.",no_such_backup:"That backup is no longer available.",bad_mode:"Please choose a restore type.",
 photo_choose:"Please choose a photo first.",photo_type:"Please choose a JPEG, PNG or WebP photo.",photo_size:"That photo is too large. Please choose one under 5 MB.",photo_unreadable:"We couldn't read that photo. Please try a different one.",photo_failed:"Your photo didn't upload. Please try again.",photo_missing:"Your photo didn't upload. Please try again.",
 bad_name_reserved:"That name isn't available. Names that look like WEN staff or administrators aren't allowed.",
 bad_name_characters:"Use letters, numbers, spaces, apostrophes, full stops and hyphens only.",bad_name_length:"Names need 2 to 40 characters.",
 bad_name_looks_like_link:"A name can't look like a web address.",rate_limited:"You're posting quickly. Please wait a little and try again.",
 restricted:"Your posting is paused. Email WEN support if you have questions.",feature_off:"The community isn't open right now.",
 not_found:"That post or reply isn't available any more.",bad_query:"Search words need 2 to 60 characters.",not_confirmed:"Please type the confirmation words exactly.",staff_profile_only:"Administrators post with the WEN staff profile.",not_admin:"Only an administrator can do that.",already_reported:"You have already reported this. Thank you.",cannot_report_own:"You can't report your own post.",report_limit:"You've sent a lot of reports today. Please email WEN support if something is urgent.",duplicate:"You've already posted that.",too_many_links:"Please use fewer links in one post.",too_many_held:"You have posts waiting for review. Please wait until they have been checked.",unsafe_link:"That link can't be shared here because it hides or disguises where it goes (for example an IP address, or a web address with a username in it). Please share the ordinary web address instead.",too_many_questions:"You have several questions waiting. Please wait until the WEN team has looked at them, or withdraw one.",consent_required:"Please confirm you have the member's consent before adding a replay link.",bad_replay_url:"A replay link must start with https://",bad_question:"Please write a little more (5 to 1500 characters).",bad_week:"Please choose a week.",bad_kind:"Please choose session or announcement.",bad_join:"Joining details can be up to 500 characters.",not_allowed_now:"That isn't possible for this item right now.",already_deleted:"The author already deleted this.",cannot_restrict_admin:"An administrator can't be restricted.",bad_action:"That action isn't available."};
function comMsg(e){var m=String((e&&e.message)||"");for(var k in COMERR){if(m.indexOf(k)>-1)return COMERR[k];}return "Something went wrong. Please try again.";}
async function comCall(fn,args){try{var r=await sb.rpc(fn,args||{});if(r.error)return {err:comMsg(r.error)};return {data:r.data};}catch(e){return {err:"We couldn't reach the server. Check your connection and try again."};}}
function comWhen(t){var d=new Date(t);return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})+" at "+pad(d.getHours())+":"+pad(d.getMinutes());}
function comLink(t){
 var s=esc(t);
 s=s.replace(/(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])/g,function(u){return '<a href="'+u+'" target="_blank" rel="noopener nofollow ugc" referrerpolicy="no-referrer">'+u+'</a>';});
 s=s.replace(/(^|[\s(])(www\.[^\s<]*[^\s<.,;:!?)\]'"])/g,function(m,p,u){return p+'<a href="https://'+u+'" target="_blank" rel="noopener nofollow ugc" referrerpolicy="no-referrer">'+u+'</a>';});
 return s.replace(/\n/g,"<br>");
}
function comStepLabel(){var n=0;STEPS.forEach(function(s){if(S.steps[s.n]&&s.n>n)n=s.n;});return n>=1&&n<=7?"Week 1, step "+n+" done":"";}
function comIsNew(iso){return !!COM.lastVisit?new Date(iso)>new Date(COM.lastVisit):true;}
function comDownload(name,obj){var b=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});var u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove();},800);}
var PH={cache:{}};
function comAvatar(photo,big){return photo?'<img class="av'+(big?' big':'')+'" data-ph="'+esc(String(photo))+'" alt="" width="'+(big?80:28)+'" height="'+(big?80:28)+'" hidden>':"";}
function comPhotoUrl(photo){
 if(!PH.cache[photo]){PH.cache[photo]=(async function(){try{var r=await sb.storage.from("community-photos").download(String(photo).split(":")[0]+".jpg");if(r.error||!r.data)return null;return URL.createObjectURL(r.data);}catch(e){return null;}})();}
 return PH.cache[photo];
}
function comPhotoFill(){
 var l=document.querySelectorAll("img[data-ph]");
 for(var i=0;i<l.length;i++){(function(el){comPhotoUrl(el.getAttribute("data-ph")).then(function(u){if(u&&document.body.contains(el)){el.src=u;el.hidden=false;}});})(l[i]);}
}
function comPhotoClear(){for(var k in PH.cache){try{PH.cache[k].then(function(u){if(u)URL.revokeObjectURL(u);});}catch(e){}}PH.cache={};}
function comAuthor(name,staff,photo){return comAvatar(photo)+esc(name||"Former member")+(staff?' <span class="pill ok">WEN team</span>':"");}
function comDot(){var s=COM.sum;return s&&((s.new_posts||0)+(s.replies_to_me||0)>0)?'<span class="com-dot" role="img" aria-label="New in the community"></span>':'';}
async function comPeek(){var r=await comCall("community_summary");if(r.data){COM.sum=r.data;renderSafe();}}
function comHomeCard(){
 var s=COM.sum,n=s?(s.new_posts||0):0,rp=s?(s.replies_to_me||0):0;
 var h='<div class="card"><h2>Community'+comDot()+'</h2><p class="mute">A friendly space for Sales Lab members to ask questions, share wins and keep each other accountable.</p>';
 if(n||rp)h+='<p><strong>'+(n?n+' new post'+(n===1?'':'s'):'')+(n&&rp?' and ':'')+(rp?rp+' repl'+(rp===1?'y':'ies')+' to your posts':'')+'</strong> since you last looked.</p>';
 return h+'<p><a class="btn" href="#/community">Open the community</a></p></div>';
}
function comNav(on){
 return '<a class="back" href="'+(PHASE==="adminonly"?"#/admin":"#/")+'">&larr; '+(PHASE==="adminonly"?"Admin":"Home")+'</a><h1>Community</h1><div class="row" role="navigation" aria-label="Community sections">'
  +[["#/community","Discussions","d"],["#/community/coaching","Coaching and events","c"],["#/community/people","People","p"],["#/community/guidelines","Guidelines","g"],["#/community/me","Your profile","m"]].map(function(x){return '<a class="chip" href="'+x[0]+'" aria-pressed="'+(on===x[2])+'">'+x[1]+'</a>';}).join("")+'</div>'
  +(COM.err?'<div class="note bad" role="alert">'+esc(COM.err)+'</div>':"")+(COM.ok?'<div class="note ok" role="status">'+esc(COM.ok)+'</div>':"");
}
function comStaffForm(){
 var p=COM.prof&&COM.prof.exists?COM.prof:{display_name:"Jen | WEN Founder",bio:""};
 var h='<div class="card"><h2>Your WEN staff profile</h2><p class="mute">You post here as WEN staff, with a "WEN team" marker, using your administrator access. You do not need a membership entry. Members cannot use this kind of name.</p>';
 h+='<label for="c-name">Staff display name</label><input id="c-name" type="text" maxlength="40" value="'+esc(p.display_name)+'"><label for="c-bio">Short bio (optional)</label><textarea id="c-bio" class="com" maxlength="280" style="min-height:90px">'+esc(p.bio||"")+'</textarea>';
 return h+'<p><button type="button" class="btn" data-a="c-savestaff"'+(COM.busy?' disabled':'')+'>Save staff profile</button></p></div>';
}
function comProfileForm(first){
 if(COM.prof&&COM.prof.staff_capable)return comStaffForm();
 var p=COM.prof&&COM.prof.exists?COM.prof:{display_name:"",bio:""};
 var h='<div class="card"><h2>'+(first?'Choose your community name':'Your community profile')+'</h2>';
 h+='<p class="mute">'+(first?'Before you post, choose the name other members will see. ':'')+'Your first name on its own is fine. Your email address is never shown to anyone.</p>';
 h+='<label for="c-name">Name</label><input id="c-name" type="text" maxlength="40" autocomplete="nickname" value="'+esc(p.display_name)+'"'+(p.exists&&p.can_change_name===false?' aria-describedby="c-namehelp"':'')+'>';
 h+='<p class="mute" id="c-namehelp">Names must be different from everyone else’s, and can’t imitate WEN, administrators or other members.'+(COM.prof&&COM.prof.exists?(COM.prof.can_change_name?' You can change your name once every 7 days.':' You can change your name again from '+esc(comWhen(COM.prof.name_change_allowed_from))+'.'):'')+'</p>';
 h+='<label for="c-bio">Short bio (optional)</label><textarea id="c-bio" class="com" maxlength="280" style="min-height:90px">'+esc(p.bio||"")+'</textarea>';
 h+='<p><button type="button" class="btn" data-a="c-saveprofile"'+(COM.busy?' disabled':'')+'>'+(first?'Save and continue':'Save profile')+'</button></p></div>';
 return h;
}
function comPostCard(p){
 var h='<a class="card post" href="#/community/post/'+p.id+'"><h2>'+esc(p.title)+'</h2><p class="cmeta">';
 h+='<span class="tag">'+esc(comCatName(p.category))+'</span> ';
 if(p.status==="deleted")h+='<span class="tag">Post deleted</span> ';
 else{if(p.status==="held"&&p.mine)h+='<span class="pill warn">Waiting for review</span> ';else if(p.status==="held")h+='<span class="pill warn">Held</span> ';if(p.status==="hidden"||p.status==="removed")h+='<span class="pill warn">'+(p.mine&&p.status==="hidden"?'Hidden by the WEN team':(p.status==="hidden"?'Hidden':'Removed'))+'</span> ';if(!p.mine&&comIsNew(p.created_at))h+='<span class="pill new">NEW</span> ';}
 if(p.edited_at&&p.status!=="deleted")h+='<span class="tag">edited</span> ';
 h+='</p>';
 if(p.status!=="deleted"&&p.step_reached)h+='<p class="cmeta"><strong>'+esc(p.step_reached)+'</strong></p>';
 if(p.status!=="deleted"&&p.excerpt)h+='<p>'+esc(p.excerpt)+(p.excerpt.length>=240?'…':'')+'</p>';
 h+='<p class="cmeta">'+(p.status==="deleted"?"":comAuthor(p.author,p.author_staff,p.author_photo)+' &middot; ')+esc(comWhen(p.created_at))+' &middot; '+(p.reply_count||0)+' repl'+((p.reply_count||0)===1?'y':'ies')+'</p></a>';
 return h;
}
function comListHtml(){
 var h=comNav("d");
 if(COM.prof&&!COM.prof.exists)return h+comProfileForm(true);
 h+='<div class="card"><div class="row"><a class="btn" href="#/community/new">Write a new post</a></div>';
 h+='<div class="row" style="margin-top:12px" role="group" aria-label="Filter by category"><button type="button" class="chip" aria-pressed="'+(!COM.cat)+'" data-a="c-cat" data-cat="">All</button>'
  +COMCAT.map(function(c){return '<button type="button" class="chip" aria-pressed="'+(COM.cat===c[0])+'" data-a="c-cat" data-cat="'+c[0]+'">'+c[1]+'</button>';}).join("")+'</div>';
 h+='<label for="c-q" style="margin-top:12px">Search the community</label><div class="row"><input id="c-q" type="text" maxlength="60" style="flex:1;min-width:160px" value="'+esc(COM.q)+'" placeholder="A word or two"><button type="button" class="btn ghost" data-a="c-search">Search</button>'+(COM.q?'<button type="button" class="chip" data-a="c-clear">Clear</button>':'')+'</div></div>';
 if(COM.prompt&&(!COM.cat||COM.cat==="accountability")&&!COM.q)h+='<div class="card prompt"><p class="cmeta"><span class="pill info">Pinned</span> This week’s accountability prompt</p><h2>'+esc(COM.prompt.title)+'</h2><p class="com-body">'+comLink(COM.prompt.body)+'</p><p><button type="button" class="btn" data-a="c-useprompt">Share your check-in</button></p></div>';
 if(COM.posts===null)return h+'<p class="mute" role="status">Loading...</p>';
 if(!COM.posts.length)h+='<div class="card"><p>'+(COM.q?'Nothing matched “'+esc(COM.q)+'”.':'No posts here yet. Be the first to say hello.')+'</p></div>';
 else h+=COM.posts.map(comPostCard).join("");
 if(COM.more)h+='<p><button type="button" class="btn ghost" data-a="c-more"'+(COM.busy?' disabled':'')+'>Show older posts</button></p>';
 h+='<p class="mute">Be kind, and keep other people’s private details private. Billing, account and technical problems go to <a href="'+mailtoHref("Sales Lab help","Hi, I need help with the Sales Lab.\n")+'">WEN support by email</a>, not here. <a href="#/community/guidelines">Community guidelines</a>.</p>';
 return h;
}
function comNewHtml(){
 var h='<a class="back" href="#/community">&larr; Community</a><h1>Write a post</h1>'+(COM.err?'<div class="note bad" role="alert">'+esc(COM.err)+'</div>':"");
 if(COM.prof&&!COM.prof.exists)return h+comProfileForm(true);
 var step=comStepLabel(),cat=(COM.draft&&COM.draft.cat)||COM.preset||"general";
 h+='<div class="card"><label for="c-cat">Category</label><select id="c-cat" data-a="c-draftcat">'+COMCAT.map(function(c){return '<option value="'+c[0]+'"'+(cat===c[0]?' selected':'')+'>'+c[1]+'</option>';}).join("")+'</select>';
 h+='<label for="c-title">Title</label><input id="c-title" type="text" maxlength="120" value="'+esc((COM.draft&&COM.draft.title)||"")+'">';
 h+='<label for="c-body">Your post</label><textarea id="c-body" class="com" maxlength="5000">'+esc((COM.draft&&COM.draft.body)||"")+'</textarea>';
 if(cat==="accountability"){
  h+=step?'<label class="row" style="margin-top:10px;gap:8px"><input id="c-step" type="checkbox"'+((COM.draft&&COM.draft.step)?' checked':'')+'> <span>Show how far I’ve got: <strong>'+esc(step)+'</strong></span></label><p class="mute">Only that one line is shared. Your sprint notes and numbers stay private.</p>'
   :'<p class="mute">Mark a sprint step done and you can choose to show how far you’ve got. Only that one line would be shared.</p>';
 }
 h+='<p class="mute">Please don’t include email addresses or private sales figures. Share ordinary web addresses (not shortened ones). Links from new members, and any link that looks risky, are checked by the WEN team before they appear. <a href="#/community/guidelines">Community guidelines</a>.</p>';
 h+='<p class="row"><button type="button" class="btn" data-a="c-savepost"'+(COM.busy?' disabled':'')+'>'+(COM.busy?'Posting...':'Post')+'</button><a class="btn ghost" href="#/community">Cancel</a></p></div>';
 return h;
}
function comIsStaff(){return !!(COM.prof&&COM.prof.staff_capable);}
function comTools(type,x){
 if(x.status==="deleted")return "";
 var h="";
 if(comIsStaff()){
  var acts=x.status==="held"?[["approve","Approve"],["hide","Hide"],["remove","Remove"]]:(x.status==="visible"?[["hide","Hide"],["remove","Remove"]]:[["restore","Restore"]]);
  h+='<p class="row" aria-label="Moderation"><span class="mute">Moderate:</span> '+acts.map(function(a){return '<button type="button" class="chip sm" data-a="c-mod" data-t="'+type+'" data-id="'+x.id+'" data-act="'+a[0]+'">'+a[1]+'</button>';}).join("")+'</p>';
 }else if(!x.mine&&x.status==="visible"){
  if(COM.reporting&&COM.reporting.type===type&&COM.reporting.id===x.id)h+='<div class="com-report"><label for="c-reason">What is the concern? (optional)</label><textarea id="c-reason" class="com" maxlength="500" style="min-height:80px"></textarea><p class="mute">The post stays visible while the WEN team looks at it. Please don’t include email addresses.</p><p class="row"><button type="button" class="btn" data-a="c-sendreport">Send report</button><button type="button" class="btn ghost" data-a="c-cancelreport">Cancel</button></p></div>';
  else h+='<p><button type="button" class="chip sm" data-a="c-report" data-t="'+type+'" data-id="'+x.id+'">Report</button></p>';
 }
 return h;
}
function comReplyHtml(r){
 var h='<div class="com-reply"'+(r.status==="deleted"?'':'')+'>';
 if(r.status==="deleted")return h+'<p class="mute">Reply deleted</p></div>';
 if(COM.editing&&COM.editing.type==="reply"&&COM.editing.id===r.id){
  return h+'<label for="c-edit">Edit your reply</label><textarea id="c-edit" class="com" maxlength="3000">'+esc(r.body)+'</textarea><p class="row"><button type="button" class="btn" data-a="c-saveedit">Save</button><button type="button" class="btn ghost" data-a="c-canceledit">Cancel</button></p></div>';
 }
 h+='<p class="cmeta"><strong>'+comAuthor(r.author,r.author_staff,r.author_photo)+'</strong> &middot; '+esc(comWhen(r.created_at))+(r.edited_at?' &middot; edited':'')+(r.mine&&r.status==="held"?' &middot; <span class="pill warn">Waiting for review</span>':'')+'</p>';
 h+='<p class="com-body">'+comLink(r.body)+'</p>';
 if(r.mine&&r.status==="hidden")h+='<div class="note warn" role="status">This reply has been hidden by the WEN team and is not currently visible to other members. Please contact support if you have any questions.</div>';
 if(r.mine)h+='<p class="row">'+(r.status==="visible"||r.status==="held"?'<button type="button" class="chip sm" data-a="c-editreply" data-id="'+r.id+'">Edit</button>':'')+'<button type="button" class="chip sm" data-a="c-delreply" data-id="'+r.id+'">'+(COM.confirm==="r"+r.id?'Tap again to delete':'Delete')+'</button></p>';
 h+=comTools('reply',r);
 return h+'</div>';
}
function comPostHtml(){
 var p=COM.view,h='<a class="back" href="#/community">&larr; Community</a>'+(COM.err?'<div class="note bad" role="alert">'+esc(COM.err)+'</div>':"")+(COM.ok?'<div class="note ok" role="status">'+esc(COM.ok)+'</div>':"");
 if(p===null)return h+'<p class="mute" role="status">Loading...</p>';
 if(p===false)return h+'<div class="card"><h1>Not available</h1><p>That post isn’t available any more.</p><p><a class="btn" href="#/community">Back to the community</a></p></div>';
 if(COM.editing&&COM.editing.type==="post"){
  return h+'<div class="card"><h1>Edit your post</h1><label for="c-title">Title</label><input id="c-title" type="text" maxlength="120" value="'+esc(p.title)+'"><label for="c-body">Your post</label><textarea id="c-body" class="com" maxlength="5000">'+esc(p.body)+'</textarea><p class="row"><button type="button" class="btn" data-a="c-saveedit">Save</button><button type="button" class="btn ghost" data-a="c-canceledit">Cancel</button></p></div>';
 }
 h+='<div class="card"><h1>'+esc(p.status==="deleted"?"Post deleted":p.title)+'</h1><p class="cmeta"><span class="tag">'+esc(comCatName(p.category))+'</span> ';
 if(p.status!=="deleted")h+=comAuthor(p.author,p.author_staff,p.author_photo)+' &middot; ';
 h+=esc(comWhen(p.created_at))+(p.edited_at&&p.status!=="deleted"?' &middot; edited':'')+'</p>';
 if(p.mine&&p.status==="held")h+='<div class="note warn" role="status">This post has a link, so Jen checks it first. Only you can see it until then.</div>';
 if(p.status==="hidden"||p.status==="removed")h+='<div class="note warn" role="status">'+(p.mine?'This post has been hidden by the WEN team and is not currently visible to other members. Please contact support if you have any questions. <a href="'+mailtoHref("Question about a hidden post","Hi, my post titled: "+p.title+". It has been hidden and I have a question.\n")+'">Email WEN support</a>.':'This post is '+p.status+'. Only administrators can see it.')+'</div>';
 if(p.step_reached&&p.status!=="deleted")h+='<p><strong>'+esc(p.step_reached)+'</strong></p>';
 h+=p.status==="deleted"?'<p class="mute">The author deleted this post. Replies below are kept.</p>':'<p class="com-body">'+comLink(p.body)+'</p>';
 h+=comTools('post',p);
 if(p.mine&&p.status!=="deleted")h+='<p class="row">'+(p.status==="visible"||p.status==="held"?'<button type="button" class="chip sm" data-a="c-editpost">Edit</button>':'')+'<button type="button" class="chip sm" data-a="c-delpost">'+(COM.confirm==="p"?'Tap again to delete':'Delete')+'</button></p>';
 h+='</div><h2>'+(p.replies.filter(function(r){return r.status!=="deleted";}).length)+' repl'+(p.replies.filter(function(r){return r.status!=="deleted";}).length===1?'y':'ies')+'</h2>';
 if(p.replies.length)h+='<div class="card">'+p.replies.map(comReplyHtml).join("")+'</div>';
 if(p.status==="visible"){
  if(COM.prof&&!COM.prof.exists)h+='<div class="card"><p>To reply, please <a href="#/community/me">choose your community name</a> first.</p></div>';
  else h+='<div class="card"><label for="c-reply">Write a reply</label><textarea id="c-reply" class="com" maxlength="3000"></textarea><p><button type="button" class="btn" data-a="c-savereply"'+(COM.busy?' disabled':'')+'>'+(COM.busy?'Sending...':'Reply')+'</button></p></div>';
 }
 return h;
}
function comPeopleHtml(){
 var h=comNav("p")+'<p class="mute">People who have posted or replied. Only a name and a short bio are shown.</p>';
 if(COM.people===null)return h+'<p class="mute" role="status">Loading...</p>';
 if(!COM.people.length)return h+'<div class="card"><p>No one has posted yet.</p></div>';
 return h+COM.people.map(function(x){return '<div class="card"><h2>'+comAuthor(x.name,x.staff,x.photo)+'</h2>'+(x.bio?'<p>'+esc(x.bio)+'</p>':'<p class="mute">No bio yet.</p>')+'</div>';}).join("");
}
function comPhotoCard(){
 var p=COM.prof;
 var h='<div class="card"><h2>Profile photo (optional)</h2>';
 h+='<p class="mute">A photo is optional. It shows next to your name, only to Sales Lab members. Please use a photo of yourself or your brand. It disappears from the community if your membership ends, and you can remove it any time.</p>';
 h+=p.photo?'<p>'+comAvatar(p.photo,true)+'</p>':'<p class="mute">You haven’t added a photo.</p>';
 h+='<label for="c-photo">Choose a photo (JPEG, PNG or WebP, up to 5 MB)</label><input id="c-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="c-photohelp">';
 h+='<p class="mute" id="c-photohelp">We shrink it to a small square and remove any hidden information such as location.</p>';
 h+='<p class="row"><button type="button" class="btn" data-a="c-photoupload"'+(COM.busy?' disabled':'')+'>'+(p.photo?'Replace photo':'Upload photo')+'</button>'+(p.photo?'<button type="button" class="btn ghost" data-a="c-photoremove"'+(COM.busy?' disabled':'')+'>'+(COM.confirm==="ph"?'Tap again to remove':'Remove photo')+'</button>':'')+'</p></div>';
 return h;
}
async function comMakeSquare(file){
 var bmp=null;
 try{bmp=await createImageBitmap(file,{imageOrientation:"from-image"});}catch(e){
  bmp=await new Promise(function(res,rej){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){URL.revokeObjectURL(u);res(im);};im.onerror=function(){URL.revokeObjectURL(u);rej(new Error("bad_image"));};im.src=u;});
 }
 var w=bmp.width,h=bmp.height;if(!w||!h)throw new Error("bad_image");
 var side=Math.min(w,h),sx=(w-side)/2,sy=(h-side)/2,c=document.createElement("canvas");c.width=256;c.height=256;
 var x=c.getContext("2d");x.fillStyle="#ffffff";x.fillRect(0,0,256,256);x.drawImage(bmp,sx,sy,side,side,0,0,256,256);
 var q=[0.85,0.7,0.5];
 for(var i=0;i<q.length;i++){
  var b=await new Promise(function(res){c.toBlob(res,"image/jpeg",q[i]);});
  if(b&&b.size<=150000)return b;
 }
 throw new Error("too_big");
}
function comPhotoErr(e){var m=String((e&&e.message)||"");if(/bad_image|too_big|verify/.test(m))return COMERR.photo_unreadable;return COMERR.photo_failed;}
async function comPhotoUpload(){
 var inp=document.getElementById("c-photo"),f=inp&&inp.files&&inp.files[0];
 COM.err="";COM.ok="";
 if(!f){COM.err=COMERR.photo_choose;renderSafe();return;}
 if(["image/jpeg","image/png","image/webp"].indexOf(f.type)<0){COM.err=COMERR.photo_type;renderSafe();return;}
 if(f.size>5*1024*1024){COM.err=COMERR.photo_size;renderSafe();return;}
 COM.busy=true;render();
 try{
  var blob=await comMakeSquare(f);
  var pr=await comCall("community_photo_prepare");if(pr.err)throw {message:"x",custom:pr.err};
  var up=await sb.storage.from("community-photos").upload(pr.data.path,blob,{contentType:"image/jpeg",upsert:true,cacheControl:"3600"});
  if(up.error)throw new Error("upload");
  var vr=await sb.functions.invoke("community-photos",{body:{}});
  if(vr.error)throw new Error("verify");
  var cf=await comCall("community_photo_confirm");if(cf.err)throw {message:"x",custom:cf.err};
  COM.prof=Object.assign({},COM.prof,{photo:cf.data.photo});COM.ok="Your photo has been saved.";
 }catch(e){COM.err=e&&e.custom?e.custom:comPhotoErr(e);}
 COM.busy=false;renderSafe();
}
async function comPhotoRemoveOwn(silent){
 var key=COM.prof&&COM.prof.photo?String(COM.prof.photo).split(":")[0]:null;
 if(key){try{await sb.storage.from("community-photos").remove([key+".jpg"]);}catch(e){}}
 var r=await comCall("community_photo_remove");
 if(!silent){if(r.err)COM.err=r.err;else{COM.prof=Object.assign({},COM.prof,{photo:null});COM.ok="Your photo has been removed.";}}
 return r;
}
function comMeHtml(){
 var h=comNav("m")+comProfileForm(!(COM.prof&&COM.prof.exists));
 if(COM.prof&&COM.prof.staff_capable)return h;
 if(COM.prof&&COM.prof.exists)h+=comPhotoCard();
 h+='<div class="card"><h2>Download my community data</h2><p>You can download a copy of what the community holds about you: your profile, posts, replies, hot-seat questions, reports you sent, and any moderation actions on your content. It does not include other members’ details. Your photo is not in the file; you can see and remove it above.</p><p><button type="button" class="btn ghost" data-a="c-export"'+(COM.busy?' disabled':'')+'>Download my data (JSON)</button></p></div>';
 h+='<div class="card"><h2>Delete my community data</h2><p>If you stop being a member, your name is simply hidden and your posts stay as “Former member”. <strong>Nothing is deleted when a membership ends.</strong></p><p>If you want everything you wrote in the community removed, you can do that here. Your posts and replies are deleted (a post that others replied to stays as an empty “post deleted” note so their replies are kept), and your community profile is removed. Your Sales Lab sprint work is not affected.</p><p class="mute">Your copies in our backups are removed too, and we keep a short list of deleted item numbers (never the words) so deleted items cannot come back if we ever restore from a backup. Your photo file is deleted. A copy of your content may remain in the hosting provider’s own backups until they expire.</p>';
 h+='<label for="c-del">Type DELETE MY COMMUNITY DATA to confirm</label><input id="c-del" type="text" autocomplete="off"><p><button type="button" class="btn ghost" data-a="c-deletemydata"'+(COM.busy?' disabled':'')+'>Delete my community data</button></p></div>';
 return h;
}
var GUIDE_FINAL=false;
var GUIDE=[
 ["h", "Welcome to the WEN Sales Lab Community"],
 ["p", "I’m so pleased you’re here!"],
 ["p", "This community is a private space for women who are working towards the same goal: getting their offers in front of the right people and making more consistent sales."],
 ["p", "You might be working on a completely different sales experiment from someone else, but there’s plenty we can learn from one another."],
 ["p", "I created this space so we can ask questions, share experiences, celebrate progress and support each other along the way."],
 ["p", "There’s no pressure to post. You’re equally welcome to read, learn and contribute whenever you feel comfortable."],
 ["h", "1. Be kind and supportive"],
 ["p", "We’re all at different stages of our business journeys."],
 ["p", "Please treat other members with kindness, respect and encouragement. Share constructive advice, be open to different perspectives and remember that what works for one business might not work for another."],
 ["p", "We can disagree without being unkind."],
 ["h", "2. Share your experiences and progress"],
 ["p", "I’d love you to share what you’re working on, what you’ve tried, what’s worked and what hasn’t."],
 ["p", "Your wins don’t have to be financial. Completing a difficult task, finding a potential customer or gaining clarity about your next step are all worth celebrating."],
 ["p", "You never have to share your revenue, sales figures or other private business information. The Sales Lab won’t automatically publish your tracker data."],
 ["h", "3. Respect everyone’s privacy"],
 ["p", "Please don’t share another person’s private information, customer details, confidential conversations or personal messages without permission."],
 ["p", "For your own protection, avoid sharing personal contact details such as email addresses, telephone numbers and home addresses."],
 ["p", "What members share here should be treated with respect and confidentiality. However, please remember that other members can read your posts, so only share information you’re comfortable disclosing within the community."],
 ["h", "4. Keep conversations relevant"],
 ["p", "You’re welcome to share links to your products, websites or other useful resources when they genuinely contribute to a discussion."],
 ["p", "Please avoid unsolicited promotions, repeated advertising or posting links simply to generate traffic."],
 ["p", "For everyone’s safety, some links may be held for review before appearing in the community."],
 ["h", "5. Your community profile"],
 ["p", "You can choose a display name, add a short bio and upload a profile photograph if you’d like."],
 ["p", "Using just your first name is absolutely fine."],
 ["p", "Your email address isn’t displayed to other members."],
 ["p", "Please don’t use names that impersonate another member or suggest you officially represent WEN."],
 ["p", "You can make an initial display-name change, after which a seven-day waiting period applies between changes."],
 ["h", "6. Weekly accountability"],
 ["p", "Each week, I’ll share a check-in to help you reflect on your progress."],
 ["p", "I’ll encourage you to think about three things:"],
 ["l", ["What did you test?", "What happened?", "What will you do next?"]],
 ["p", "Participation is completely optional."],
 ["p", "The important thing is that you’re taking action and learning what moves your business forward."],
 ["h", "7. Reporting concerns"],
 ["p", "If you see something inappropriate or concerning, please use the Report button."],
 ["p", "The WEN team will review reports and take appropriate action where necessary."],
 ["p", "If something is urgent or involves a serious safety or privacy concern, please contact WEN Support directly."],
 ["p", "We may hide or remove content or restrict access where community guidelines have been breached."],
 ["h", "8. Getting help"],
 ["p", "For technical difficulties, billing queries or account problems, please email:"],
 ["e", "hello@thewomensentrepreneurialnetwork.com"],
 ["p", "Tell us what you were trying to do, what happened and, if possible, include a screenshot."],
 ["p", "We aim to respond to routine support enquiries within two working days."],
 ["p", "For general questions about your sales experiments, you’re welcome to start a community discussion. Remember that community participation doesn’t include unlimited individual coaching or guaranteed personal responses."],
 ["h", "9. Leaving the community"],
 ["p", "If your Sales Lab membership ends, your previous contributions may remain visible under the name “Former member”, without your public profile details."],
 ["p", "You can request deletion of your community contributions through your account. Deletion is handled according to our privacy and data-retention policy, including any applicable backup-retention periods."],
 ["h", "10. Let’s make this a supportive space"],
 ["p", "Above all, I want this community to be somewhere you feel comfortable asking questions, trying new things and sharing your progress."],
 ["p", "We don’t need everything to be perfect. We just need to keep learning, taking action and moving forward."],
 ["p", "I’m looking forward to seeing what you achieve!"],
 ["p", "Jen"]
];
function comGuidelinesHtml(){
 var h=comNav("g");
 if(comIsStaff()&&!GUIDE_FINAL)h+='<div class="note warn" role="status"><strong>Draft wording.</strong> Members will see this text only after the final UK GDPR and retention review. The same wording is in the Sales Experiments folder.</div>';
 h+='<div class="card">'+GUIDE.map(function(x){if(x[0]==="h")return '<h2>'+esc(x[1])+'</h2>';if(x[0]==="l")return '<ul>'+x[1].map(function(i){return '<li>'+esc(i)+'</li>';}).join("")+'</ul>';if(x[0]==="e")return '<p><a href="mailto:'+esc(x[1])+'">'+esc(x[1])+'</a></p>';return '<p>'+esc(x[1])+'</p>';}).join("")+'</div>';
 return h;
}
function comDateTime(t){var d=new Date(t);return d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})+" at "+pad(d.getHours())+":"+pad(d.getMinutes());}
function comCoachingHtml(){
 var h=comNav("c"),E=COM.events;
 if(E===null||E===undefined)return h+'<p class="mute" role="status">Loading...</p>';
 h+='<div class="card rnext"><h2>Next session</h2>';
 if(E.upcoming&&E.upcoming.length){var u=E.upcoming[0];h+='<p><strong>'+esc(u.title)+'</strong></p>'+(u.starts_at?'<p>'+esc(comDateTime(u.starts_at))+'</p>':'')+(u.body?'<p class="com-body">'+comLink(u.body)+'</p>':'')+(u.join_info?'<p class="com-body"><strong>How to join:</strong> '+comLink(u.join_info)+'</p>':'');if(E.upcoming.length>1)h+='<p class="mute">Also coming up: '+E.upcoming.slice(1).map(function(x){return esc(x.title)+(x.starts_at?' ('+esc(comWhen(x.starts_at))+')':'');}).join(", ")+'.</p>';}
 else h+='<p class="mute">No session is scheduled yet. We’ll post the next one here.</p>';
 h+='</div>';
 h+='<div class="card rhot"><h2>Ask a hot-seat question</h2><p class="mute">Want a question looked at in a coaching session? Write it here. <strong>Only you and the WEN team can see it.</strong> It does not appear in the community.</p>';
 h+='<label for="c-hs">Your question</label><textarea id="c-hs" class="com" maxlength="1500" style="min-height:110px"></textarea>';
 h+='<label class="row" style="margin-top:10px;gap:8px"><input id="c-hsc" type="checkbox"> <span>If you pick my question, it’s okay to share the replay of my session with other members.</span></label>';
 h+='<p class="mute">You can leave this unticked. Please don’t include email addresses or private customer details.</p>';
 h+='<p><button type="button" class="btn" data-a="c-sendhotseat"'+(COM.busy?' disabled':'')+'>Send my question</button></p>';
 if(COM.myhs&&COM.myhs.length)h+='<h3>Your questions</h3>'+COM.myhs.map(function(x){return '<div class="crow" style="display:block"><p>'+esc(x.question)+'</p><p class="cmeta">'+esc(comWhen(x.created_at))+' &middot; '+(x.state==="new"?"Waiting":x.state==="seen"?"Seen by the WEN team":"Done")+(x.consent_replay?' &middot; replay OK':'')+'</p>'+(x.state==="new"?'<p><button type="button" class="chip sm" data-a="c-withdrawhs" data-id="'+x.id+'">Withdraw</button></p>':'')+'</div>';}).join("");
 h+='</div>';
 h+='<div class="card"><h2>Announcements</h2>'+((E.announcements&&E.announcements.length)?E.announcements.map(function(a){return '<div class="com-reply"><p><strong>'+esc(a.title)+'</strong> <span class="cmeta">'+esc(comWhen(a.created_at))+'</span></p>'+(a.body?'<p class="com-body">'+comLink(a.body)+'</p>':'')+'</div>';}).join(""):'<p class="mute">Nothing new.</p>')+'</div>';
 h+='<div class="card"><h2>Replays</h2>'+((E.replays&&E.replays.length)?E.replays.map(function(r){return '<p><a href="'+esc(r.replay_url)+'" target="_blank" rel="noopener nofollow" referrerpolicy="no-referrer">'+esc(r.title)+'</a>'+(r.starts_at?' <span class="cmeta">'+esc(comWhen(r.starts_at))+'</span>':'')+'</p>';}).join("")+'<p class="mute">Replays are only shared with the member’s consent.</p>':'<p class="mute">No replays yet.</p>')+'</div>';
 return h;
}
function communityHtml(){
 var r=route;
 if(r==="#/community/coaching")return comCoachingHtml();
 if(r==="#/community/guidelines")return comGuidelinesHtml();
 if(r==="#/community/new")return comNewHtml();
 if(r==="#/community/people")return comPeopleHtml();
 if(r==="#/community/me")return comMeHtml();
 if(/^#\/community\/post\/\d+/.test(r))return comPostHtml();
 return comListHtml();
}
async function comLoadProfile(){var r=await comCall("community_my_profile");if(r.data)COM.prof=r.data;else if(r.err)COM.err=r.err;}
async function comLoadList(append){
 COM.busy=true;
 var before=append&&COM.posts&&COM.posts.length?COM.posts[COM.posts.length-1].id:null;
 var r=await comCall("community_list_posts",{p_category:COM.cat,p_query:COM.q||null,p_before:before,p_limit:20});
 COM.busy=false;
 if(r.err){COM.err=r.err;COM.posts=COM.posts||[];}
 else{COM.err="";COM.posts=append?(COM.posts||[]).concat(r.data):r.data;COM.more=r.data.length>=20;}
 renderSafe();
}
async function comEnter(){
 COM.err="";COM.ok=COM.ok||"";
 var r=route;
 if(!COM.prof)await comLoadProfile();
 if(r==="#/community"||r==="#/community/"){
  var s=await comCall("community_summary");if(s.data){COM.sum=s.data;COM.lastVisit=s.data.last_visit;}
  COM.posts=null;var pr0=await comCall("community_current_prompt");COM.prompt=pr0.data||null;await comLoadList(false);
  if(s.data&&!COM.seen){COM.seen=true;comCall("community_mark_visited").then(function(){COM.sum=Object.assign({},COM.sum,{new_posts:0,replies_to_me:0});});}
 }else if(r==="#/community/people"){COM.people=null;var p=await comCall("community_people");COM.people=p.data||[];if(p.err)COM.err=p.err;renderSafe();}
 else if(r==="#/community/coaching"){COM.events=null;COM.myhs=null;var ev=await comCall("community_events");COM.events=ev.data||{upcoming:[],announcements:[],replays:[]};if(ev.err)COM.err=ev.err;var mh=await comCall("community_my_hotseat");COM.myhs=mh.data||[];renderSafe();}
 else if(r==="#/community/guidelines"){renderSafe();}
 else if(/^#\/community\/post\/(\d+)/.test(r)){COM.view=null;var id=+r.match(/post\/(\d+)/)[1];var g=await comCall("community_get_post",{p_id:id});COM.view=g.data||false;renderSafe();}
 else renderSafe();
}
function comLeave(){if(route!=="#/community/new")COM.preset=null;COM.reporting=null;COM.err="";if(COM.keepOk)COM.keepOk=false;else COM.ok="";COM.editing=null;COM.confirm="";COM.draft=null;COM.seen=false;}
async function comAction(a,t){
 var d=t.dataset;
 if(a==="c-cat"){COM.cat=d.cat||null;COM.posts=null;render();comLoadList(false);return;}
 if(a==="c-search"){var q=(document.getElementById("c-q").value||"").trim();if(q&&q.length<2){COM.err=COMERR.bad_query;render();return;}COM.q=q;COM.posts=null;COM.err="";render();comLoadList(false);return;}
 if(a==="c-clear"){COM.q="";COM.posts=null;render();comLoadList(false);return;}
 if(a==="c-more"){comLoadList(true);return;}
 if(a==="c-draftcat"){return;}
 if(a==="c-export"){COM.err="";var re=await comCall("community_export_my_data");if(re.err){COM.err=re.err;}else{comDownload("wen-sales-lab-community-data.json",re.data);COM.ok="Your data has been downloaded.";}renderSafe();return;}
 if(a==="c-photoupload"){comPhotoUpload();return;}
 if(a==="c-photoremove"){
  if(COM.confirm!=="ph"){COM.confirm="ph";render();return;}
  COM.confirm="";COM.busy=true;COM.err="";COM.ok="";render();await comPhotoRemoveOwn(false);COM.busy=false;renderSafe();return;
 }
 if(a==="c-saveprofile"){
  COM.busy=true;COM.err="";COM.ok="";render();
  var r=await comCall("community_set_profile",{p_display_name:(document.getElementById("c-name").value||""),p_bio:(document.getElementById("c-bio").value||"")});
  COM.busy=false;
  if(r.err){COM.err=r.err;}else{COM.prof=r.data;COM.ok="Saved.";if(/^#\/community\/?$/.test(route)){}}
  renderSafe();return;
 }
 if(a==="c-useprompt"){COM.preset="accountability";location.hash="#/community/new";return;}
 if(a==="c-sendhotseat"){
  var hq=document.getElementById("c-hs").value||"",hc=!!document.getElementById("c-hsc").checked;
  COM.busy=true;COM.err="";render();
  var rh=await comCall("community_hotseat_submit",{p_question:hq,p_consent:hc});
  COM.busy=false;
  if(rh.err){COM.err=rh.err;}else{COM.ok="Thank you. Your question has gone to the WEN team. Only you and the team can see it.";var mh2=await comCall("community_my_hotseat");COM.myhs=mh2.data||[];}
  renderSafe();return;
 }
 if(a==="c-withdrawhs"){var rw=await comCall("community_hotseat_withdraw",{p_id:+d.id});if(rw.err)COM.err=rw.err;else{COM.ok="Your question was withdrawn.";}var mh3=await comCall("community_my_hotseat");COM.myhs=mh3.data||[];renderSafe();return;}
 if(a==="c-report"){COM.reporting={type:d.t,id:+d.id};COM.err="";render();return;}
 if(a==="c-cancelreport"){COM.reporting=null;render();return;}
 if(a==="c-sendreport"){
  var rr=COM.reporting,rs0=await comCall("community_report",{p_type:rr.type,p_id:rr.id,p_reason:(document.getElementById("c-reason").value||"")});
  if(rs0.err){COM.err=rs0.err;COM.reporting=null;}else{COM.ok="Thank you for letting us know. The WEN team will review your report.";COM.reporting=null;COM.err="";}
  renderSafe();return;
 }
 if(a==="c-mod"){
  var rm=await comCall("admin_community_moderate",{p_type:d.t,p_id:+d.id,p_action:d.act,p_note:null});
  if(rm.err){COM.err=rm.err;renderSafe();return;}
  COM.err="";COM.ok="Done: "+d.act+".";var gm=await comCall("community_get_post",{p_id:COM.view.id});COM.view=gm.data||COM.view;renderSafe();return;
 }
 if(a==="c-savestaff"){
  COM.busy=true;COM.err="";COM.ok="";render();
  var rs=await comCall("admin_community_set_staff_profile",{p_display_name:(document.getElementById("c-name").value||""),p_bio:(document.getElementById("c-bio").value||"")});
  COM.busy=false;if(rs.err){COM.err=rs.err;}else{COM.ok="Staff profile saved.";await comLoadProfile();}
  renderSafe();return;
 }
 if(a==="c-savepost"){
  var title=document.getElementById("c-title").value,body=document.getElementById("c-body").value,cat=document.getElementById("c-cat").value,st=document.getElementById("c-step");
  COM.draft={cat:cat,title:title,body:body,step:st&&st.checked};
  COM.busy=true;COM.err="";render();
  var r2=await comCall("community_create_post",{p_category:cat,p_title:title,p_body:body,p_step_reached:(cat==="accountability"&&st&&st.checked)?comStepLabel():null});
  COM.busy=false;
  if(r2.err){COM.err=r2.err;renderSafe();return;}
  COM.draft=null;COM.keepOk=true;COM.ok=r2.data.status==="held"?"Thanks. Your post has a link, so Jen will check it before it appears.":"Your post is live.";
  COM.posts=null;location.hash="#/community/post/"+r2.data.id;return;
 }
 if(a==="c-savereply"){
  var body2=document.getElementById("c-reply").value;COM.busy=true;COM.err="";render();
  var pid=COM.view&&COM.view.id;var r3=await comCall("community_create_reply",{p_post_id:pid,p_body:body2});
  COM.busy=false;if(r3.err){COM.err=r3.err;renderSafe();return;}
  COM.ok=r3.data.status==="held"?"Thanks. Your reply has a link, so Jen will check it before it appears.":"Reply added.";
  var g=await comCall("community_get_post",{p_id:pid});COM.view=g.data||COM.view;renderSafe();return;
 }
 if(a==="c-editpost"){COM.editing={type:"post"};COM.err="";render();return;}
 if(a==="c-editreply"){COM.editing={type:"reply",id:+d.id};COM.err="";render();return;}
 if(a==="c-canceledit"){COM.editing=null;COM.err="";render();return;}
 if(a==="c-saveedit"){
  var e=COM.editing,pid2=COM.view.id,r4;
  if(e.type==="post")r4=await comCall("community_edit_post",{p_id:pid2,p_title:document.getElementById("c-title").value,p_body:document.getElementById("c-body").value});
  else r4=await comCall("community_edit_reply",{p_id:e.id,p_body:document.getElementById("c-edit").value});
  if(r4.err){COM.err=r4.err;render();return;}
  COM.editing=null;COM.err="";COM.ok="Saved.";var g2=await comCall("community_get_post",{p_id:pid2});COM.view=g2.data||COM.view;renderSafe();return;
 }
 if(a==="c-delpost"||a==="c-delreply"){
  var key=a==="c-delpost"?"p":"r"+d.id;
  if(COM.confirm!==key){COM.confirm=key;render();return;}
  COM.confirm="";var pid3=COM.view.id;
  var r5=a==="c-delpost"?await comCall("community_delete_post",{p_id:pid3}):await comCall("community_delete_reply",{p_id:+d.id});
  if(r5.err){COM.err=r5.err;render();return;}
  COM.ok=a==="c-delpost"?"Your post was deleted.":"Your reply was deleted.";
  var g3=await comCall("community_get_post",{p_id:pid3});COM.view=g3.data||false;renderSafe();return;
 }
 if(a==="c-deletemydata"){
  COM.busy=true;COM.err="";render();
  if(COM.prof&&COM.prof.photo){await comPhotoRemoveOwn(true);}
  var r6=await comCall("community_delete_my_data",{p_confirm:(document.getElementById("c-del").value||"").trim()});
  COM.busy=false;
  if(r6.err){COM.err=r6.err;renderSafe();return;}
  if(r6.data&&r6.data.photo_path){try{await sb.storage.from("community-photos").remove([r6.data.photo_path]);}catch(e){}}
  COM.prof={exists:false};COM.posts=null;COM.view=null;COM.sum=null;COM.ok="Your community data has been deleted.";renderSafe();return;
 }
}
document.addEventListener("keydown",function(e){if(e.key==="Enter"&&PHASE==="app"&&e.target&&e.target.id==="c-q"){e.preventDefault();var b=document.querySelector('[data-a="c-search"]');if(b)b.click();}});
function comReset(){comPhotoClear();COM.sum=null;COM.prof=null;COM.posts=null;COM.view=null;COM.people=null;COM.loadedFor="";COM.keepOk=false;comLeave();}
document.addEventListener("change",function(e){var t=e.target;if(PHASE==="app"&&t&&t.id==="c-cat"&&route==="#/community/new"){var st=document.getElementById("c-step");COM.draft={cat:t.value,title:(document.getElementById("c-title")||{}).value||"",body:(document.getElementById("c-body")||{}).value||"",step:st&&st.checked};render();}});

/* test seam: the automatic tests read the Week 2 rules through this; nothing happens unless a test sets window.__slExpose */
if(window.__slExpose){try{window.__slExpose({setCom:function(v){for(var k in v)COM[k]=v[k];},setState:function(v){S=v;},getState:function(){return S;},setContent:function(c){CONTENT=c;},blank:blank,normalise:normalise,w2fix:w2fix,w2Compose:w2Compose,w2Guard:w2Guard,w2Pitch:w2Pitch,w2PitchScore:w2PitchScore,w2Rec:w2Rec,w2Sent:w2Sent,w2Pending:w2Pending,w2Waiting:w2Waiting,w2Issues:w2Issues,w2FuOpens:w2FuOpens,w2Due:w2Due,w2NeedsAnswer:w2NeedsAnswer,w2FuDraft:w2FuDraft,w2AnswerDraft:w2AnswerDraft,w2Action:w2Action,w2Input:w2Input,O:O,OW:OW,addDays:addDays,ymd:ymd,parseYmd:parseYmd,today:today,week1Done:week1Done,home:home,home2:home2,w2s1:w2s1,w2s2:w2s2,w2s3:w2s3,w2s4:w2s4,w2s5:w2s5,w2s6:w2s6,esc:esc,w2Suggest:w2Suggest,homeHub:homeHub,experimentsPage:experimentsPage,resultsPage:resultsPage,profilePage:profilePage,tabsFor:tabsFor,tabOf:tabOf,navHtml:navHtml,effRoute:effRoute,setRoute:function(r){route=r;},setFlags:function(f){FLAGS=f;},setMe:function(m){ME=m;},setPhase:function(p){PHASE=p;},shellNav:shellNav,render:render,home3:home3,home4:home4,etPrompt:etPrompt,etListingNote:etListingNote,etLiveMode:etLiveMode,etUse:etUse,etCommit:etCommit,etDays:etDays,etAction:etAction,etInput:etInput,etfix:etfix,etHome:etHome,ets1:ets1,ets2:ets2,ets3:ets3,ets4:ets4,ets5:ets5,ets6:ets6,etWin:etWin,etWinCheck:etWinCheck,etChgGrp:etChgGrp,etSuggest:etSuggest,etReady:etReady,etCommitChange:etCommitChange,et2Done:et2Done,et2Action:et2Action,et2Input:et2Input,et2Home:et2Home,et2s1:et2s1,et2s2:et2s2,et2s3:et2s3,et2s4:et2s4,et2s5:et2s5,et2s6:et2s6,et2Log:et2Log,etRoute:etRoute,etDaysBetween:etDaysBetween,rvExp:rvExp,etActive:etActive,etBn:etBn,etPrepReady:etPrepReady,etPrep:etPrep,et4Action:et4Action,etRoute:etRoute,etWeeks:etWeeks,etWeekDone:etWeekDone,etCurWeek:etCurWeek,etStepCount:etStepCount,etHasWork:etHasWork,etStart:etStart,etFresh:etFresh,etArchive:etArchive,etResetP:etResetP,etPastFix:etPastFix,etRec:etRec,etMySprint:etMySprint,etResultsPage:etResultsPage,etReviewHead:etReviewHead,etPastLate:etPastLate,puEAction:puEAction,puEInput:puEInput,etPastSummary:etPastSummary,etWith:etWith,sprArchive:sprArchive,sprGo:sprGo,sprConfirmX:sprConfirmX,sprAction:sprAction,sprHasWork:sprHasWork,rvSnap:rvSnap,rWeeks:rWeeks,rTrack:rTrack,rNext:rNext,rHomeList:rHomeList,rSoFar:rSoFar,etBlockP:etBlockP,etBlockHtml:etBlockHtml,xaName:xaName,xaTotal:xaTotal,et4Input:et4Input,fybActive:fybActive,fybPrepReady:fybPrepReady,fybPrep:fybPrep,fybRoute:fybRoute,fybWeeks:fybWeeks,fybWeekDone:fybWeekDone,fybCurWeek:fybCurWeek,fybStepCount:fybStepCount,fybHasWork:fybHasWork,fybStart:fybStart,fybFresh:fybFresh,fybArchive:fybArchive,fybPastFix:fybPastFix,fybRec:fybRec,fybMySprint:fybMySprint,fybResultsPage:fybResultsPage,fybReviewHead:fybReviewHead,fybPastLate:fybPastLate,pufAction:pufAction,pufInput:pufInput,fybPastSummary:fybPastSummary,fybAction:fybAction,fybInput:fybInput,fybfix:fybfix,fybVerdict:fybVerdict,fybSnap:fybSnap,fybPerCheck:fybPerCheck,fybDraftCheck:fybDraftCheck,fybReady:fybReady,fybCommit:fybCommit,fybLog:fybLog,fybCounts:fybCounts,fybWin:fybWin,fybConfs:fybConfs,fybNums:fybNums,fybSum:fybSum,fybFmtSum:fybFmtSum,fybCompare:fybCompare,fybCaveats:fybCaveats,fybRouteInner:fybRouteInner,fybHome:fybHome,fybPicked:fybPicked,fybPlan:fybPlan,fyb1s1:fyb1s1,fyb1s2:fyb1s2,fyb1s3:fyb1s3,fyb1s4:fyb1s4,fyb1s5:fyb1s5,fyb2s1:fyb2s1,fyb2s2:fyb2s2,fyb2s3:fyb2s3,fyb2s4:fyb2s4,fyb2s5:fyb2s5,fyb3s1:fyb3s1,fyb3s2:fyb3s2,fyb3s3:fyb3s3,fyb3s4:fyb3s4,fyb4s1:fyb4s1,fyb4s2:fyb4s2,fyb4s3:fyb4s3,fyb4s4:fyb4s4,fybAddPlace:fybAddPlace,fybAddLog:fybAddLog,fybAddConf:fybAddConf,FYBCFG:FYBCFG,homeCoachPanel:homeCoachPanel,homeComPanel:homeComPanel,homeLately:homeLately,homeLatelyItems:homeLatelyItems,homeWhen:homeWhen,helpPage:helpPage,comHomePeek:comHomePeek,HOMEC:HOMEC,stsActive:stsActive,stsPrepReady:stsPrepReady,stsPrep:stsPrep,stsRoute:stsRoute,stsWeeks:stsWeeks,stsWeekDone:stsWeekDone,stsCurWeek:stsCurWeek,stsStepCount:stsStepCount,stsHasWork:stsHasWork,stsStart:stsStart,stsFresh:stsFresh,stsArchive:stsArchive,stsPastFix:stsPastFix,stsRec:stsRec,stsMySprint:stsMySprint,stsResultsPage:stsResultsPage,stsReviewHead:stsReviewHead,stsPastLate:stsPastLate,pusAction:pusAction,pusInput:pusInput,stsPastSummary:stsPastSummary,stsAction:stsAction,stsInput:stsInput,stsfix:stsfix,stsVerdict:stsVerdict,stsSnap:stsSnap,stsSchCheck:stsSchCheck,stsDemoCheck:stsDemoCheck,stsReady:stsReady,stsCommit:stsCommit,stsOut:stsOut,stsWin:stsWin,stsConfs:stsConfs,stsNums:stsNums,stsSum:stsSum,stsFmtSum:stsFmtSum,stsCompare:stsCompare,stsCaveats:stsCaveats,stsRouteInner:stsRouteInner,stsHome:stsHome,stsWhere:stsWhere,sts1s1:sts1s1,sts1s2:sts1s2,sts1s3:sts1s3,sts1s4:sts1s4,sts1s5:sts1s5,sts2s1:sts2s1,sts2s2:sts2s2,sts2s3:sts2s3,sts2s4:sts2s4,sts2s5:sts2s5,sts3s1:sts3s1,sts3s2:sts3s2,sts3s3:sts3s3,sts3s4:sts3s4,sts4s1:sts4s1,sts4s2:sts4s2,sts4s3:sts4s3,sts4s4:sts4s4,stsLogDate:stsLogDate,stsAddConf:stsAddConf,stsExposure:stsExposure,STSCFG:STSCFG,emActive:emActive,emPrepReady:emPrepReady,emPrep:emPrep,emRoute:emRoute,emWeeks:emWeeks,emWeekDone:emWeekDone,emCurWeek:emCurWeek,emStepCount:emStepCount,emHasWork:emHasWork,emStart:emStart,emFresh:emFresh,emArchive:emArchive,emPastFix:emPastFix,emRec:emRec,emMySprint:emMySprint,emResultsPage:emResultsPage,emReviewHead:emReviewHead,emPastLate:emPastLate,pumAction:pumAction,pumInput:pumInput,emPastSummary:emPastSummary,emAction:emAction,emInput:emInput,emfix:emfix,emVerdict:emVerdict,emSnap:emSnap,emListCheck:emListCheck,emSchCheck:emSchCheck,emDraftCheck:emDraftCheck,emCompose:emCompose,emReady:emReady,emCommit:emCommit,emSent:emSent,emWin:emWin,emConfs:emConfs,emRecip:emRecip,emCaveats:emCaveats,emRouteInner:emRouteInner,emHome:emHome,em1s1:em1s1,em1s2:em1s2,em1s3:em1s3,em1s4:em1s4,em1s5:em1s5,em2s1:em2s1,em2s2:em2s2,em2s3:em2s3,em2s4:em2s4,em2s5:em2s5,em3s1:em3s1,em3s2:em3s2,em3s3:em3s3,em3s4:em3s4,em4s1:em4s1,em4s2:em4s2,em4s3:em4s3,em4s4:em4s4,emLogDate:emLogDate,emAddConf:emAddConf,xaNameOf:xaNameOf,pastSummary:pastSummary,etPrepPrefilled:etPrepPrefilled,setSb:function(x){sb=x;},getSPR:function(){return SPR;},etVerdict:etVerdict,etSnap:etSnap,etConfs:etConfs,etPhase:etPhase,etNums:etNums,et3AddLog:et3AddLog,et3AddConf:et3AddConf,et3Action:et3Action,et3Input:et3Input,et3Done:et3Done,et4Done:et4Done,et3h1:et3h1,et4h:et4h,et3s1:et3s1,et3s2:et3s2,et3s3:et3s3,et3s4:et3s4,et3s5:et3s5,et3s6:et3s6,et4s1:et4s1,et4s2:et4s2,et4s3:et4s3,et4s4:et4s4,et4s5:et4s5,et4s6:et4s6,et3Entry:et3Entry,et3ConfDate:et3ConfDate,etConfMajor:etConfMajor,etRecNums:etRecNums,etCmWin:etCmWin,etCaveats:etCaveats,puAction:puAction,pastWinOpen:pastWinOpen,rvPastHtml:rvPastHtml,fbCard:fbCard,fbDraft:fbDraft,setFeedback:function(m){SPR.feedback=m||{};},setSprints:function(a){SPR={loaded:true,err:"",serverDay:"",serverNow:"",sprints:a||[],feedback:{}};},setSprintsFailed:function(){SPR={loaded:false,err:"x",serverDay:"",serverNow:"",sprints:[]};},getUI:function(){return UI;},chkRec:chkRec,sprHasWork:sprHasWork,sprCanUndo:sprCanUndo,sprCanCorrect:sprCanCorrect,rvWinStart:rvWinStart,d5fix:d5fix,sprArchive:sprArchive,sprintBar:sprintBar,sprAction:sprAction,rvRemindNote:rvRemindNote,remindCard:remindCard,rvDay30Res:rvDay30Res,rvPostNote:rvPostNote,rvCleanHist:rvCleanHist,reviewPage:reviewPage,rvAction:rvAction,rvInput:rvInput,rvfix:rvfix,rvPhase:rvPhase,rvDay:rvDay,rvStart:rvStart,rvDay30:rvDay30,rvEnd:rvEnd,rvClock:rvClock,rvWorked:rvWorked,rvSnap:rvSnap,rvCanUpdate:rvCanUpdate,w4s1:w4s1,w4s2:w4s2,w4s3:w4s3,w4s4:w4s4,w4s5:w4s5,w4s6:w4s6,w4Input:w4Input,w4Action:w4Action,w4Verdict:w4Verdict,w4Inputs:w4Inputs,w4Rec:w4Rec,w4NextAction:w4NextAction,week3Done:week3Done,w4Counts:w4Ctr,w4fix:w4fix,VORDER:VORDER,w3s1:w3s1,w3s2:w3s2,w3s3:w3s3,w3s4:w3s4,w3s5:w3s5,w3s6:w3s6,w3Input:w3Input,w3Opt:w3Opt,w3Suggest:w3Suggest,w2Cand:w2Cand,w3Compose:w3Compose,w3Pitch:w3Pitch,w3PitchScore:w3PitchScore,w3Guard:w3Guard,w3Rec:w3Rec,w3Path:w3Path,w3Effort:w3Effort,w3Carry:w3Carry,w3NextAction:w3NextAction,w3Issues:w3Issues,w3fix:w3fix,w3Action:w3Action,w3Money:w3Money,w3Pick:w3Pick,week2Done:week2Done,STEPS3:STEPS3,W3OPTS:W3OPTS,verSummary:verSummary,supportStepLine:supportStepLine,helpCard:helpCard,setVersions:function(v){UI.versions=v;}});}catch(e){}}
/* ---------- start ---------- */
sb.auth.onAuthStateChange(function(ev,sess){
 SYNC.token=sess?sess.access_token:null;
 if(ev==="SIGNED_OUT"){comReset();S=null;ME=null;CONTENT={};ADMIN.members=null;ADMIN.flags=null;PHASE="signin";AUTH.step="email";AUTH.code="";UI.versions=null;render();}
 else if(ev==="SIGNED_IN"&&PHASE!=="app"&&PHASE!=="loading"){setTimeout(loadAll,0);}
});
(async function boot(){
 var hp=location.hash||"";if(/error_description/.test(hp)||/error=/.test(location.search)){AUTH.msg="That sign-in link didn’t work here. It may have expired or been opened in a different browser. Please use the code from the same email instead.";}
 var s=await sb.auth.getSession();
 if(!(s.data&&s.data.session)&&/[?&]code=/.test(location.search)){AUTH.msg="That link can only sign you in on the device where you asked for it. Please ask for a new code and type it in here.";try{history.replaceState(null,"",location.pathname+(location.hash||""));}catch(e){}}
 if(s.data&&s.data.session){SYNC.token=s.data.session.access_token;loadAll();}
 else{PHASE="signin";if(coolLeft()>0)startCool(true);render();}
})();

})();
