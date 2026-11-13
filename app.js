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
function blank(){return {week:1,steps:{},plan:"own",focus:{product:"",format:"",price:"",currency:"GBP",freq:"",where:"",url:"",problem:"",outcome:"",inc:[],incd:{disc:"",comm:""}},cdraft:{name:"",link:""},cmsg:"",base:{orders:{s:"",v:""},revenue:{s:"",v:""},partner:{s:"",v:""},hours:"",comfort:0,confidence:0},buyer:{who:"",buys:[],places:[]},types:[],cands:[],sketch:{},decision:"",remind:{weekly:true,steps:false},fitIndex:0,newType:"",nextId:1,refl:"",w2:{steps:{},quiz1:[],quiz1done:false,hardest:[],pre:[],q4:{},practiceDone:false,practice:[],stuck:[],dec:"",comfort2:"",openedAt:"",cur:0,feel:[],diff:[]},out:{}};}
function normalise(st){var b=blank(),o=Object.assign({},b,st||{});["focus","cdraft","base","buyer","remind"].forEach(function(k){o[k]=Object.assign({},b[k],(st||{})[k]||{});});o.focus.incd=Object.assign({},b.focus.incd,o.focus.incd||{});return w2fix(o);}

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
 if(FLAGS.community===true)comPeek();
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
function helpCard(){
 var ns=nextStep(),stepLine=ns?("Step "+ns.n+": "+ns.t):"";
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
async function showVersions(){var r=await sb.rpc("list_versions");UI.versions=r.error?[]:r.data;render();}
async function restoreVersion(id){
 if(!confirm("Restore this earlier version? Your current version is kept too, so you can switch back."))return;
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
 return h+'<p class="mute">Your choices are saved. The weekly email is not sent in this test build.</p></div>';
}
function topbar(){return '<div class="topbar"><span class="mute">Signed in as '+esc(ME?ME.email:"")+'</span>'+pillHtml()+'</div>'+(UI.toast?'<div id="toast" class="note info" role="status">'+esc(UI.toast)+'</div>':'');}
function home(){
 var wk=(S.week===2&&week1Done())?2:1;
 var h='<h1>My Sprint</h1><p class="mute">Partnership-to-Sales &middot; Week '+wk+' of 4</p>';
 h+='<div class="tabs"><button type="button" class="chip" aria-pressed="'+(wk===1)+'" data-a="w2-week" data-val="1">Week 1'+(week1Done()?' &#10003;':'')+'</button><button type="button" class="chip" aria-pressed="'+(wk===2)+'" data-a="w2-week" data-val="2"'+(week1Done()?'':' disabled title="Opens when you finish Week 1"')+'>Week 2</button><button type="button" class="chip" disabled>Week 3</button><button type="button" class="chip" disabled>Week 4</button></div>';
 if(!week1Done())h+='<p class="mute">Week 2 opens when you finish Week 1 (choose "Ready for Week 2" in the last step).</p>';
 if(wk===1)h+=w2Banner();
 if(S.focus.product&&S.focus.format)h+='<div class="note ok"><strong>Your product:</strong> '+esc(productLine())+'</div>';
 if(wk===2)h+=home2();else{if(week1Done())h+='<div class="note ok"><strong>Week 2 is open.</strong> This is where you write to the partners you chose, and send the messages yourself. <button type="button" class="btn" data-a="w2-week" data-val="2">Open Week 2</button></div>';h+=home1();}
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
  var m=(route||"#/").match(/^#\/step\/(\d)/),m2=(route||"#/").match(/^#\/w2\/([1-6])$/);
  if(route==="#/admin"&&ME&&ME.admin){html=adminHtml();if(!ADMIN.members&&!ADMIN.busy)adminLoad();}
  else if(/^#\/community/.test(route)&&FLAGS.community===true)html=communityHtml();
  else if(m2&&week1Done())html=[0,w2s1,w2s2,w2s3,w2s4,w2s5,w2s6][+m2[1]]();else if(m&&+m[1]>=1&&+m[1]<=7)html=[0,step1,step2,step3,step4,step5,step6,step7][+m[1]]();else if(route==="#/sprint")html=home();else if(route==="#/experiments")html=experimentsPage();else if(route==="#/results")html=resultsPage();else if(route==="#/profile")html=profilePage();else html=homeHub();
  html=topbar()+html;
 }
 var keep=snapFields();document.getElementById("app").innerHTML=html;restoreFields(keep);try{shellNav();}catch(e){}try{comPhotoFill();}catch(e){}
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
function w2Guard(c){
 var o=O(c),t=String(o.draft||""),low=t.toLowerCase(),res=[],f=S.focus,off=w2Offered(c);
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
 h+='<div class="note info"><strong>Week 3 is next, and it is not part of this test build yet.</strong> Anything still open, like follow-ups and replies, carries forward automatically and stays saved. You can come back to Week 2 at any time.</div>';
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
var SHELLCSS='body.hasnav main{padding-bottom:96px}#mnav{display:none}'
+'body.hasnav #mnav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:20;background:#fff;border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom,0)}'
+'#mnav a{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px 9px;font:600 11px "Open Sans",system-ui,sans-serif;color:var(--mute);text-decoration:none;position:relative}'
+'#mnav a span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mnav svg{width:22px;height:22px;fill:currentColor}'
+'#mnav a[aria-current=page]{color:#000;font-weight:700;box-shadow:inset 0 3px 0 var(--acc)}#mnav a:focus-visible{outline:3px solid #000;outline-offset:-3px}'
+'#mnav .com-dot{position:absolute;top:6px;right:calc(50% - 20px);margin:0}'
+'@media(min-width:900px){body.hasnav #mnav{top:var(--bh,40px);bottom:0;right:auto;width:228px;flex-direction:column;gap:4px;padding:16px 12px;border-top:0;border-right:1px solid var(--line);background:#FBF9F6}'
+'#mnav a{flex:none;flex-direction:row;gap:12px;padding:11px 12px;border-radius:10px;font-size:15px;color:#333}#mnav a[aria-current=page]{background:#000;color:#fff;box-shadow:none}#mnav .com-dot{position:static;margin-left:auto}'
+'body.hasnav main{margin:0 0 0 228px;max-width:none;padding:20px 32px 56px}body.hasnav main>*{max-width:980px}}'
+'.xgrid{display:grid;grid-template-columns:1fr;gap:0 16px}@media(min-width:900px){.xgrid{grid-template-columns:1fr 1fr}}'
+'.xp{background:#111;color:#fff;border-radius:20px;padding:22px 20px 20px;margin:12px 0}.xh2{display:flex;gap:14px;align-items:center;margin-bottom:8px}'
+'.xk{font:700 12px Montserrat,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#fff}.xt{font:700 22px/1.25 Poppins,system-ui,sans-serif;color:#fff;margin:2px 0 0}'
+'.xs{color:#F5F2EE;margin:0 0 12px;font-size:16px;max-width:none}.xo{background:#000;border-left:4px solid #00C2CB;border-radius:8px;padding:12px 14px;margin:8px 0}.xo b{display:block;color:#00C2CB;font:700 11px Montserrat,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px}.xo span{color:#fff;font:400 14px/1.4 "Open Sans",system-ui,sans-serif}'
+'.xm{color:#cfc7bb;font-size:13px;margin:8px 0 0;max-width:none}.xi{display:flex;width:54px;height:54px;border-radius:50%;border:2px solid #fff;align-items:center;justify-content:center;flex:none}.xi svg{width:28px;height:28px;fill:#000}.xi.dk svg{fill:#fff}'
+'.btn.teal{background:#00C2CB;color:#000;border-color:#00C2CB}.btn.teal:hover{background:#00AEB6}.xp .btn{display:block;text-align:center;margin-top:14px}';
function effRoute(){var r=route||"#/";if(/^#\/community/.test(r)&&FLAGS.community!==true)return "#/";return r;}
function tabsFor(){var t=[["home","Home","#/"],["sprint","My Sprint","#/sprint"],["exp","Experiments","#/experiments"],["res","Results","#/results"]];if(FLAGS.community===true)t.push(["comm","Community","#/community"]);t.push(["profile","Profile","#/profile"]);return t;}
function tabOf(r){r=r||"#/";if(r==="#/sprint"||/^#\/(step|w2)\/\d$/.test(r))return "sprint";if(r==="#/experiments")return "exp";if(r==="#/results")return "res";if(/^#\/community/.test(r))return "comm";if(r==="#/profile")return "profile";return "home";}
function navHtml(){var cur=tabOf(effRoute());return tabsFor().map(function(t){return '<a href="'+t[2]+'"'+(t[0]===cur?' aria-current="page"':'')+'>'+NAVI[t[0]]+'<span>'+t[1]+'</span>'+(t[0]==="comm"?comDot():'')+'</a>';}).join("");}
function shellNav(){
 var show=PHASE==="app"&&route!=="#/admin";
 if(!document.getElementById("shellcss")){var st=document.createElement("style");st.id="shellcss";st.textContent=SHELLCSS;document.head.appendChild(st);}
 var nv=document.getElementById("mnav");
 if(!nv){nv=document.createElement("nav");nv.id="mnav";nv.setAttribute("aria-label","Main");document.body.appendChild(nv);}
 nv.innerHTML=show?navHtml():"";
 document.body.classList.toggle("hasnav",show);
 var bn=document.querySelector(".banner");if(bn)document.documentElement.style.setProperty("--bh",bn.offsetHeight+"px");
}
function heroHtml(kick,title,text,pct,line,href,label){return '<div class="hero"><div class="kicker">'+esc(kick)+'</div><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p>'+(pct!=null?'<div class="bar" aria-hidden="true"><i style="width:'+pct+'%"></i></div><p style="font-size:14px">'+line+'</p>':'')+'<a class="btn" href="'+href+'">'+label+'</a></div>';}
function homeHub(){
 var h='<h1>Home</h1><p class="mute">Your Sales Lab sprint: Partnership-to-Sales</p>';
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
function experimentsPage(){
 var h='<h1>Experiments</h1><p class="mute">Six experiments, four weeks each, about 3 to 5 hours a week. You run one at a time.</p><div class="note warn"><strong>Temporary test limitation.</strong> In this test build only Partnership-to-Sales is open. In the full Sales Lab you will complete a short sales check, see an explained recommendation, and choose any of the six experiments. You will not be required to start with Partnership-to-Sales.</div><div class="xgrid">';
 EXPX.forEach(function(x,i){
  var cur=x[0]==="part";
  h+='<div class="xp"><div class="xh2"><span class="xi'+((x[0]==="show"||x[0]==="live")?' dk':'')+'" style="background:'+x[5]+'">'+x[6]+'</span><div><div class="xk">Experiment '+(i+1)+'</div><div class="xt">'+esc(x[1])+'</div></div></div><p class="xs">'+esc(x[2])+'</p><div class="xo"><b>Your outcome</b><span>'+esc(x[3])+'</span></div><div class="xm">4 weeks &middot; 3 to 5 hours a week &middot; Best for: '+esc(x[4])+'</div>';
  h+=cur?'<div class="xm">Open in this test build. Your progress: '+(week1Done()?"Week 2":"Week 1")+' of 4. Find it under My Sprint.</div>':'<div class="xm"><strong>Coming soon.</strong> Not open in this test build.</div>';
  h+='</div>';
 });
 return h+'</div>';
}
function nvTxt(o,money){o=o||{};if(o.s==="value"&&String(o.v||"").trim()!=="")return (money?sym(S.focus.currency):"")+o.v;if(o.s==="zero")return (money?sym(S.focus.currency):"")+"0";if(o.s==="unknown")return "I don't know";return "Not set";}
function resultsPage(){
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
 else h+=UI.versions.slice(0,8).map(function(v){var d=new Date(v.saved_at);return '<div class="crow"><span>'+d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})+' at '+pad(d.getHours())+':'+pad(d.getMinutes())+'</span><button type="button" class="chip sm" data-a="restorev" data-id="'+v.id+'">Restore</button></div>';}).join("");
 h+='</div>'+helpCard();
 if(ME&&ME.admin)h+='<div class="card"><h2>Admin</h2><p class="mute">Manage who has access and the on and off switches.</p><p><a class="btn ghost" href="#/admin">Open admin tools</a></p></div>';
 return h;
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
 else if(t.dataset.sk){S.sketch[t.dataset.sk]=S.sketch[t.dataset.sk]||{};S.sketch[t.dataset.sk].note=t.value;save();}
});
document.addEventListener("keydown",function(e){if(e.key==="Enter"&&PHASE==="signin"&&e.target.dataset&&e.target.dataset.auth){e.preventDefault();if(e.target.dataset.auth==="email")sendCode();else if(e.target.dataset.auth==="code")verifyCode();else if(e.target.dataset.auth==="pw")pwLogin();}});
document.addEventListener("change",function(e){var t=e.target;if(PHASE==="app"&&t.tagName==="SELECT"&&t.dataset.bind){setPath(t.dataset.bind,t.value);render();}});
document.addEventListener("change",function(e){var t=e.target;if(PHASE==="app"&&t&&t.dataset&&t.dataset.out==="sentAt")w2DateChange(t);});
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
 h+='<div class="card"><h2>Next session</h2>';
 if(E.upcoming&&E.upcoming.length){var u=E.upcoming[0];h+='<p><strong>'+esc(u.title)+'</strong></p>'+(u.starts_at?'<p>'+esc(comDateTime(u.starts_at))+'</p>':'')+(u.body?'<p class="com-body">'+comLink(u.body)+'</p>':'')+(u.join_info?'<p class="com-body"><strong>How to join:</strong> '+comLink(u.join_info)+'</p>':'');if(E.upcoming.length>1)h+='<p class="mute">Also coming up: '+E.upcoming.slice(1).map(function(x){return esc(x.title)+(x.starts_at?' ('+esc(comWhen(x.starts_at))+')':'');}).join(", ")+'.</p>';}
 else h+='<p class="mute">No session is scheduled yet. We’ll post the next one here.</p>';
 h+='</div>';
 h+='<div class="card"><h2>Ask a hot-seat question</h2><p class="mute">Want a question looked at in a coaching session? Write it here. <strong>Only you and the WEN team can see it.</strong> It does not appear in the community.</p>';
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
if(window.__slExpose){try{window.__slExpose({setState:function(v){S=v;},getState:function(){return S;},setContent:function(c){CONTENT=c;},blank:blank,normalise:normalise,w2fix:w2fix,w2Compose:w2Compose,w2Guard:w2Guard,w2Pitch:w2Pitch,w2PitchScore:w2PitchScore,w2Rec:w2Rec,w2Sent:w2Sent,w2Pending:w2Pending,w2Waiting:w2Waiting,w2Issues:w2Issues,w2FuOpens:w2FuOpens,w2Due:w2Due,w2NeedsAnswer:w2NeedsAnswer,w2FuDraft:w2FuDraft,w2AnswerDraft:w2AnswerDraft,w2Action:w2Action,w2Input:w2Input,O:O,OW:OW,addDays:addDays,ymd:ymd,parseYmd:parseYmd,today:today,week1Done:week1Done,home:home,home2:home2,w2s1:w2s1,w2s2:w2s2,w2s3:w2s3,w2s4:w2s4,w2s5:w2s5,w2s6:w2s6,esc:esc,w2Suggest:w2Suggest,homeHub:homeHub,experimentsPage:experimentsPage,resultsPage:resultsPage,profilePage:profilePage,tabsFor:tabsFor,tabOf:tabOf,navHtml:navHtml,effRoute:effRoute,setRoute:function(r){route=r;},setFlags:function(f){FLAGS=f;},setMe:function(m){ME=m;},setPhase:function(p){PHASE=p;},shellNav:shellNav,render:render});}catch(e){}}
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
