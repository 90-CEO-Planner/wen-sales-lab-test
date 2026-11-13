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
function blank(){return {week:1,steps:{},plan:"own",focus:{product:"",format:"",price:"",currency:"GBP",freq:"",where:"",url:"",problem:"",outcome:"",inc:[],incd:{disc:"",comm:""}},cdraft:{name:"",link:""},cmsg:"",base:{orders:{s:"",v:""},revenue:{s:"",v:""},partner:{s:"",v:""},hours:"",comfort:0,confidence:0},buyer:{who:"",buys:[],places:[]},types:[],cands:[],sketch:{},decision:"",remind:{weekly:true,steps:false},fitIndex:0,newType:"",nextId:1,refl:""};}
function normalise(st){var b=blank(),o=Object.assign({},b,st||{});["focus","cdraft","base","buyer","remind"].forEach(function(k){o[k]=Object.assign({},b[k],(st||{})[k]||{});});o.focus.incd=Object.assign({},b.focus.incd,o.focus.incd||{});return o;}

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
 var h='<a class="back" href="#/" data-wk="1">&larr; My Sprint</a><h1>Week 1 &middot; Step '+n+' of 7</h1><p><strong>'+esc(s.t)+'</strong> <span class="tag">about '+s.m+' min</span></p>'+glance(1,n)+'<p class="mute">You will need: '+esc(s.b)+' Everything saves automatically, so you can stop and come back any time.</p>';
 h+=body;
 h+='<div class="card row" style="justify-content:space-between"><button type="button" class="btn'+(dn?" ghost":"")+'" data-a="done" data-n="'+n+'">'+(dn?"Marked done (tap to undo)":"Mark this step done")+'</button>'+(n<7?'<a class="btn ghost" href="#/step/'+(n+1)+'">Next step &rarr;</a>':'<a class="btn ghost" href="#/" data-wk="1">Back to My Sprint</a>')+'</div>';
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
 if(S.decision==="ready"&&sl.length>=1)h+='<div class="note ok"><strong>Week 1 is complete.</strong> Weeks 2 to 4 are not part of this test build. Your Week 1 work stays saved.</div>';
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
 if(PHASE==="app")h+='<a class="back" href="#/">&larr; My Sprint</a>';
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
 h+='<div class="card"><h2>Hot-seat questions (private)</h2><p class="mute">Only you can read these. Members see their own.</p>';
 h+=C.hotseat.length?C.hotseat.map(function(x){return '<div class="crow" style="display:block"><p>'+esc(x.question)+'</p><p class="cmeta">'+esc(x.name||"")+' &middot; '+esc(x.email||"")+' &middot; '+esc(comWhen(x.created_at))+' &middot; '+(x.consent_replay?'replay OK':'no replay consent')+' &middot; <strong>'+esc(x.state)+'</strong></p><p class="row">'+["new","seen","done"].map(function(st){return '<button type="button" class="chip sm" aria-pressed="'+(x.state===st)+'" data-a="ac-hs" data-id="'+x.id+'" data-state="'+st+'">'+st.charAt(0).toUpperCase()+st.slice(1)+'</button>';}).join("")+'</p></div>';}).join(""):'<p class="mute">No questions yet.</p>';
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
function adminModHtml(){
 var C=ADMIN.com;if(!C)return '<div class="card"><h2>Community moderation</h2><div class="note warn" role="status">Couldn’t load the moderation tools.</div></div>';
 var h='<div class="card"><h2>Community moderation</h2><p class="mute">'+C.counts.open_reports+' open report'+(C.counts.open_reports===1?'':'s')+' &middot; '+C.counts.held+' waiting for approval &middot; '+C.counts.restricted+' restricted &middot; '+(C.counts.hotseat_new||0)+' new hot-seat question'+((C.counts.hotseat_new||0)===1?'':'s')+'. Reports never hide anything by themselves.</p>';
 h+='<h3>Waiting for approval (links from new members, and any risky link)</h3>';
 h+=C.held.length?C.held.map(function(x){return '<div class="crow" style="display:block"><p><strong>'+esc(x.title||"Reply")+'</strong> &middot; '+esc(x.author||"")+' &middot; '+esc(comWhen(x.created_at))+((x.link_flags&&x.link_flags.length)?' &middot; <span class="pill warn">'+esc(x.link_flags.join(", ").replace(/_/g," "))+'</span>':'')+'</p><p class="com-body">'+comLink(x.body)+'</p><p class="row"><button type="button" class="chip sm" data-a="ac-mod" data-t="'+x.type+'" data-id="'+x.id+'" data-act="approve">Approve</button><button type="button" class="chip sm" data-a="ac-mod" data-t="'+x.type+'" data-id="'+x.id+'" data-act="hide">Hide</button><button type="button" class="chip sm" data-a="ac-mod" data-t="'+x.type+'" data-id="'+x.id+'" data-act="remove">Remove</button><a class="chip sm" href="#/community/post/'+x.post_id+'">Open</a></p></div>';}).join(""):'<p class="mute">Nothing waiting.</p>';
 h+='<h3>Open reports</h3>';
 h+=C.reports.length?C.reports.map(function(x){return '<div class="crow" style="display:block"><p><strong>'+esc(x.target_type==="post"?"Post":"Reply")+'</strong> by '+esc(x.author||"")+' &middot; reported by '+esc(x.reporter||"")+' &middot; '+esc(comWhen(x.created_at))+' &middot; now '+esc(x.current_status||"gone")+'</p>'+(x.reason?'<p>“'+esc(x.reason)+'”</p>':'')+'<p class="mute com-body">'+esc(x.snapshot)+'</p><p class="row"><button type="button" class="chip sm" data-a="ac-resolve" data-id="'+x.id+'" data-act="keep">Keep</button><button type="button" class="chip sm" data-a="ac-resolve" data-id="'+x.id+'" data-act="hide">Hide</button><button type="button" class="chip sm" data-a="ac-resolve" data-id="'+x.id+'" data-act="remove">Remove</button><a class="chip sm" href="#/community/post/'+x.post_id+'">Open</a></p></div>';}).join(""):'<p class="mute">No open reports.</p>';
 h+='<h3>Restricted members</h3>';
 h+=C.restr.length?C.restr.map(function(x){return '<div class="crow"><span><strong>'+esc(x.name||"No community name")+'</strong><br><span class="mute">'+esc(x.email)+(x.reason?' &middot; '+esc(x.reason):'')+'</span></span><button type="button" class="chip sm" data-a="ac-unrestrict" data-email="'+esc(x.email)+'">Lift</button></div>';}).join(""):'<p class="mute">No one is restricted.</p>';
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
 else if(a==="ac-hs"){r=await comCall("admin_community_hotseat_set",{p_id:+d.id,p_state:d.state});}
 if(a==="ac-mod")r=await comCall("admin_community_moderate",{p_type:d.t,p_id:+d.id,p_action:d.act,p_note:null});
 else if(a==="ac-resolve")r=await comCall("admin_community_resolve_report",{p_report_id:+d.id,p_action:d.act,p_note:null});
 else if(a==="ac-restrict"){var em=(document.getElementById("ac-email").value||"").trim();if(!em){toast("Please type an email address first.");return;}r=await comCall("admin_community_restrict",{p_email:em,p_restricted:true,p_reason:(document.getElementById("ac-why").value||"")});}
 else if(a==="ac-rmphoto"){var pe=(document.getElementById("ac-pemail").value||"").trim();if(!pe){toast("Please type an email address first.");return;}r=await comCall("admin_community_remove_photo",{p_email:pe});if(r&&r.data&&r.data.path){try{await sb.storage.from("community-photos").remove([r.data.path]);}catch(e){}}}
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
 h+='<p class="mute">Last nightly backup: '+esc(when)+'.<br>People with access: '+(m.access_on||0)+'. People with saved work: '+(m.with_saved_work||0)+'.<br>Reminder emails in the last 7 days: '+(r.sent||0)+' sent, '+(r.dry_run||0)+' trial runs, '+(r.failed||0)+' failed.<br>Community: last backup '+esc(cwhen)+'. Leftover photo files: '+(cm.leftover_photo_files||0)+'. Retention rules waiting for approval: '+(cm.retention_rules_not_approved||0)+'.</p></div>';
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
  h+='<div class="hero"><div class="kicker">Week 1 complete</div><h2>Well done, Week 1 is finished</h2><p>All seven steps are done. Weeks 2 to 4 are not part of this test build, and your Week 1 work stays saved.</p></div>';
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
 var h='<h1>My Sprint</h1><p class="mute">Partnership-to-Sales &middot; Week 1 of 4</p>';
 h+='<div class="tabs"><button type="button" class="chip" aria-pressed="true">Week 1'+(week1Done()?' &#10003;':'')+'</button><button type="button" class="chip" disabled>Week 2</button><button type="button" class="chip" disabled>Week 3</button><button type="button" class="chip" disabled>Week 4</button></div>';
 if(S.focus.product&&S.focus.format)h+='<div class="note ok"><strong>Your product:</strong> '+esc(productLine())+'</div>';
 h+=home1();
 h+='<div class="card"><h2>Your account</h2><p>Signed in as <strong>'+esc(ME?ME.email:"")+'</strong>.</p><p class="row"><button type="button" class="btn ghost" data-a="signout">Sign out</button> <button type="button" class="btn ghost" data-a="signoutall">Sign out of all devices</button></p>'+(FRAMED?'<p class="mute"><a href="'+esc(location.href.split("#")[0])+'" target="_blank" rel="noopener">Open the Sales Lab on its own page</a></p>':'')+'</div>';
 if(FLAGS.community===true)h+=comHomeCard();
 if(ME&&ME.admin)h+='<div class="card"><h2>Admin</h2><p class="mute">Manage who has access and the on and off switches.</p><p><a class="btn ghost" href="#/admin">Open admin tools</a></p></div>';
 h+='<div class="card"><h2>Your data</h2><p class="mute">Your work belongs to you. You can download a copy at any time, or delete it.</p><div class="row">'+(FLAGS.exports===false?'<p class="mute">Downloading your data is switched off at the moment.</p>':'<button type="button" class="btn ghost" data-a="exportdata">Download my data</button>')+'<button type="button" class="btn ghost" data-a="deletedata">Delete my saved work</button></div></div>';
 h+='<div class="card"><h2>Earlier saved versions</h2><p class="mute">Your work saves automatically. If something was overwritten by mistake, for example from another tab or device, you can bring an earlier version back.</p>';
 if(UI.versions===null)h+='<button type="button" class="chip" data-a="showversions">Show earlier versions</button>';
 else if(!UI.versions.length)h+='<p class="mute">No earlier versions yet.</p>';
 else h+=UI.versions.slice(0,8).map(function(v){var d=new Date(v.saved_at);return '<div class="crow"><span>'+d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})+' at '+pad(d.getHours())+':'+pad(d.getMinutes())+'</span><button type="button" class="chip sm" data-a="restorev" data-id="'+v.id+'">Restore</button></div>';}).join("");
 return h+'</div>';
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
  var m=(route||"#/").match(/^#\/step\/(\d)/);
  if(route==="#/admin"&&ME&&ME.admin){html=adminHtml();if(!ADMIN.members&&!ADMIN.busy)adminLoad();}
  else if(/^#\/community/.test(route)&&FLAGS.community===true)html=communityHtml();
  else if(m&&+m[1]>=1&&+m[1]<=7)html=[0,step1,step2,step3,step4,step5,step6,step7][+m[1]]();else html=home();
  html=topbar()+html;
 }
 var keep=snapFields();document.getElementById("app").innerHTML=html;restoreFields(keep);try{comPhotoFill();}catch(e){}
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
 else if(t.dataset.sk){S.sketch[t.dataset.sk]=S.sketch[t.dataset.sk]||{};S.sketch[t.dataset.sk].note=t.value;save();}
});
document.addEventListener("keydown",function(e){if(e.key==="Enter"&&PHASE==="signin"&&e.target.dataset&&e.target.dataset.auth){e.preventDefault();if(e.target.dataset.auth==="email")sendCode();else if(e.target.dataset.auth==="code")verifyCode();else if(e.target.dataset.auth==="pw")pwLogin();}});
document.addEventListener("change",function(e){var t=e.target;if(PHASE==="app"&&t.tagName==="SELECT"&&t.dataset.bind){setPath(t.dataset.bind,t.value);render();}});
window.addEventListener("hashchange",function(){if(PHASE!=="app"&&!(PHASE==="adminonly"&&/^#\/(admin|community)/.test(location.hash||"")))return;route=location.hash||"#/";render();});

/* ---------- Community (M3C-b). Shown only while the community switch is ON. Text only, escaped, never run as HTML. ---------- */
var COM={sum:null,prof:null,posts:null,more:false,cat:null,q:"",view:null,people:null,busy:false,err:"",ok:"",loadedFor:"",editing:null,confirm:"",lastVisit:null,seen:false};
var COMCAT=[["general","General Discussion"],["accountability","Weekly Accountability"],["wins","Wins and Lessons"],["coaching","Coaching and Events"]];
function comCatName(k){for(var i=0;i<COMCAT.length;i++)if(COMCAT[i][0]===k)return COMCAT[i][1];return k;}
var COMERR={
 need_profile:"Please choose your community name first.",bad_title:"A title needs 3 to 120 characters.",bad_body:"Please write something (up to the length limit).",
 bad_bio:"Your short bio can be up to 280 characters.",contains_email:"Please leave email addresses out, to keep everyone's details private.",
 name_taken:"That name is already in use. Please choose another.",name_cooldown:"You can change your name once every 7 days.",
 hold_needs_reason_and_review_date:"A legal hold needs a reason and a review date within a year.",no_rule_approved:"No retention rule has been approved yet, so nothing was deleted.",still_a_member:"That person still has access. Members delete their own data from their profile.",is_admin_account:"That is an administrator account.",no_such_backup:"That backup is no longer available.",bad_mode:"Please choose a restore type.",
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
 return '<a class="back" href="'+(PHASE==="adminonly"?"#/admin":"#/")+'">&larr; '+(PHASE==="adminonly"?"Admin":"My Sprint")+'</a><h1>Community</h1><div class="row" role="navigation" aria-label="Community sections">'
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
