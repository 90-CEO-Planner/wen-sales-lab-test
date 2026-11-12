(function(){
"use strict";
/* WEN Sales Lab, M1 test build. Week 1 logic ported from prototype v4.
   Curriculum text is NOT in this file: it is fetched after sign-in from the content table. */
var CFG=window.SL_CONFIG;
function netFetch(){var f=window.__slFetch||window.fetch.bind(window);return f.apply(null,arguments);} /* test seam: lets the test suite simulate a dropped connection */
var sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"},global:{fetch:netFetch}});
var S=null,CONTENT={},ME=null,PHASE="boot",ERR="",route="#/";
var SYNC={version:0,bk:{},timer:null,busy:false,again:false,status:"idle",lastSaved:null,retry:0,note:"",token:null,poll:null};
var AUTH={step:"email",email:"",code:"",pw:"",msg:"",busy:false,cool:0,tm:null};
var UI={versions:null,toast:"",toastTm:null,pending:false};

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
  if(isNoAccess(e)){PHASE="noaccess";SYNC.busy=false;render();return;}
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
 ME={id:u.data.user.id,email:u.data.user.email};
 var r=await sb.rpc("get_state");
 if(r.error){
  if(isNoAccess(r.error)){PHASE="noaccess";render();return;}
  if(isNoSession(r.error)){PHASE="signin";render();return;}
  ERR=r.error.message;PHASE="error";render();return;
 }
 var sv=normalise(r.data.state);SYNC.version=r.data.version;SYNC.bk=keysOf(sv);S=sv;SYNC.note="";
 var m=readMirror();
 if(m&&m.state&&m.bk){
  var un=Object.keys(m.state).filter(function(k){return m.bk[k]!==JSON.stringify(m.state[k]);});
  un.forEach(function(k){S[k]=m.state[k];});
  if(un.length)SYNC.note="Restored changes that were not yet saved from this device";
 }
 var c=await sb.from("content").select("key,body");
 CONTENT={};if(!c.error&&c.data)c.data.forEach(function(x){CONTENT[x.key]=x.body;});
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
function snapFields(){var m={},els=document.querySelectorAll("#app input[id],#app textarea[id],#app select[id]");for(var i=0;i<els.length;i++){var e=els[i];if(e.dataset.bind||e.dataset.sk||e.dataset.col||e.dataset.resv||e.dataset.out)continue;m[e.id]=e.value;}return m;}
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
 if(/rate|seconds|too many|limit/i.test(m))return "Please wait a minute before asking for another code.";
 if(/not authorized|authorised/i.test(m))return "This test build can only email approved addresses. Please use the test sign-in below, or ask for your address to be added.";
 if(/expired|invalid|token/i.test(m))return "That code didn’t work. It may have expired. Please check it or ask for a new one.";
 if(/fetch|network/i.test(m))return "We couldn’t reach the server. Check your connection and try again.";
 return "Something went wrong. Please try again.";}
function signinHtml(){
 var h='<div class="card" style="max-width:460px;margin:24px auto"><h1>Sign in to the Sales Lab</h1>';
 if(AUTH.msg)h+='<div class="note info" role="status">'+esc(AUTH.msg)+'</div>';
 if(AUTH.step==="email"){
  h+='<p>Enter the email address you joined with. We’ll email you a sign-in code and a link.</p><label for="em">Email address</label><input id="em" type="email" inputmode="email" autocomplete="email" data-auth="email" value="'+esc(AUTH.email)+'"><p><button type="button" class="btn" data-a="sendcode"'+(AUTH.busy||AUTH.cool>0?" disabled":"")+'>'+(AUTH.busy?"Sending...":(AUTH.cool>0?"Wait "+AUTH.cool+"s":"Email me a code"))+'</button></p>';
 }else{
  h+='<p>We sent a code to <strong>'+esc(AUTH.email)+'</strong>. Enter the code, or open the link in the same email on this device.</p><label for="cd">Code from the email</label><input id="cd" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" data-auth="code" value="'+esc(AUTH.code)+'" style="max-width:200px;font-size:22px;letter-spacing:4px"><p><button type="button" class="btn" data-a="verify"'+(AUTH.busy?" disabled":"")+'>'+(AUTH.busy?"Checking...":"Sign in")+'</button> <button type="button" class="btn ghost" data-a="sendcode"'+(AUTH.busy||AUTH.cool>0?" disabled":"")+'>'+(AUTH.cool>0?"Resend in "+AUTH.cool+"s":"Send a new code")+'</button></p><p class="mute"><button type="button" class="chip sm" data-a="changeemail">Use a different email</button></p><details><summary class="mute">Can’t sign in?</summary><p class="mute">Check your spam folder, make sure you’re using the email you joined with, and try the code rather than the link if you opened the email on a different device or browser.</p></details>';
 }
 if(CFG.testMode)h+='<details style="margin-top:16px"><summary class="mute">Test sign-in (fictional accounts only)</summary><label for="tp">Password</label><input id="tp" type="password" autocomplete="current-password" data-auth="pw" value="'+esc(AUTH.pw)+'"><p><button type="button" class="btn ghost" data-a="pwlogin">Test sign-in</button></p><p class="mute">Uses the email entered above. Only in the test build.</p></details>';
 return h+'</div>';
}
function noaccessHtml(){return '<div class="card" style="max-width:520px;margin:24px auto"><h1>We can’t find your membership</h1><p>You’re signed in as <strong>'+esc(ME?ME.email:"")+'</strong>, but that address isn’t on the Sales Lab access list.</p><p>Membership is checked against the email you purchased with. If you used a different address, sign out and try that one. If you think this is a mistake, contact us and we’ll sort it out. We reply to access problems first.</p><p><button type="button" class="btn" data-a="signout">Sign out</button></p></div>';}
function errorHtml(){return '<div class="card" style="max-width:520px;margin:24px auto"><h1>Something went wrong</h1><p>We couldn’t load your sprint. Your work is safe. Please try again.</p><p class="mute">'+esc(ERR)+'</p><p><button type="button" class="btn" data-a="retryload">Try again</button> <button type="button" class="btn ghost" data-a="signout">Sign out</button></p></div>';}
function loadingHtml(){return '<div class="card" style="max-width:420px;margin:40px auto;text-align:center"><p>Loading...</p></div>';}
async function sendCode(){
 var em=(AUTH.email||"").trim().toLowerCase();
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){AUTH.msg="Please enter a valid email address.";render();return;}
 AUTH.email=em;AUTH.busy=true;AUTH.msg="";render();
 var r=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});
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
 h+='<div class="card"><h2>The seven steps</h2>'+STEPS.map(function(s){var dn=S.steps[s.n],isNext=ns&&ns.n===s.n;return '<a class="step'+(dn?" done":"")+(isNext?" next":"")+'" href="#/step/'+s.n+'"><span class="n">'+(dn?"&#10003;":s.n)+'</span><span class="t"><span class="tt">'+esc(s.t)+'</span><br><span class="mute">'+s.m+' min</span></span><span class="mute">'+(dn?"Done":(isNext?"Next":"Open"))+'</span></a>';}).join("")+'<p class="mute">Total about '+hm(mins(STEPS))+'. Do them in the order that suits you.</p></div>';
 h+=planCard(STEPS).replace("<h2>Plan your sessions</h2>","<h2>Plan your sessions (optional)</h2>");
 return h+remindCard()+helpCard();
}
function topbar(){return '<div class="topbar"><span class="mute">Signed in as '+esc(ME?ME.email:"")+'</span>'+pillHtml()+'</div>'+(UI.toast?'<div id="toast" class="note info" role="status">'+esc(UI.toast)+'</div>':'');}
function home(){
 var h='<h1>My Sprint</h1><p class="mute">Partnership-to-Sales &middot; Week 1 of 4</p>';
 h+='<div class="tabs"><button type="button" class="chip" aria-pressed="true">Week 1'+(week1Done()?' &#10003;':'')+'</button><button type="button" class="chip" disabled>Week 2</button><button type="button" class="chip" disabled>Week 3</button><button type="button" class="chip" disabled>Week 4</button></div>';
 if(S.focus.product&&S.focus.format)h+='<div class="note ok"><strong>Your product:</strong> '+esc(productLine())+'</div>';
 h+=home1();
 h+='<div class="card"><h2>Your account</h2><p>Signed in as <strong>'+esc(ME?ME.email:"")+'</strong>.</p><p><button type="button" class="btn ghost" data-a="signout">Sign out</button></p></div>';
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
 else{
  var m=(route||"#/").match(/^#\/step\/(\d)/);
  if(m&&+m[1]>=1&&+m[1]<=7)html=[0,step1,step2,step3,step4,step5,step6,step7][+m[1]]();else html=home();
  html=topbar()+html;
 }
 var keep=snapFields();document.getElementById("app").innerHTML=html;restoreFields(keep);
 if(PHASE==="app"){var r=document.querySelector("[data-bind=refl]");if(r)r.value=S.refl||"";}
 a11yGroups();
 if(vk!==UI.vk){
  /* a new screen: move focus to its heading so keyboard and screen reader users start at the top */
  UI.vk=vk;var h1=document.querySelector("#app h1"),cd=PHASE==="signin"&&AUTH.step!=="email"?document.getElementById("cd"):null;
  if(cd){try{cd.focus({preventScroll:true});}catch(e){}}
  else if(h1){h1.setAttribute("tabindex","-1");try{h1.focus({preventScroll:true});}catch(e){}}
 }else if(sig){
  /* the same screen redrawn (a chip was pressed): put focus back on the same control */
  var again=a11yFind(sig);if(again){try{again.focus({preventScroll:true});}catch(e){}}
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
 if(lk&&!lk.dataset.a){e.preventDefault();if(PHASE!=="app")return;route=lk.getAttribute("href");try{history.replaceState(null,"",location.pathname+location.search+route);}catch(x){}window.scrollTo(0,0);render();return;}
 var t=e.target.closest("[data-a]");if(!t||t.disabled)return;var a=t.dataset.a,d=t.dataset;
 if(a==="sendcode"){sendCode();return;}
 if(a==="verify"){verifyCode();return;}
 if(a==="pwlogin"){pwLogin();return;}
 if(a==="changeemail"){AUTH.step="email";AUTH.msg="";AUTH.code="";render();return;}
 if(a==="signout"){signOut();return;}
 if(a==="retryload"){loadAll();return;}
 if(PHASE!=="app")return;
 if(a==="copyprompt"){var ta=document.getElementById("findprompt"),mg=document.getElementById("copymsg");function ok(){if(mg)mg.textContent="Copied. Now paste it into your AI tool.";}function manual(){if(ta){ta.focus();ta.select();}if(mg)mg.textContent="Select all and copy it by hand (it is selected for you).";}try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(ta.value).then(ok,manual);}else{manual();}}catch(x){manual();}return;}
 if(a==="showversions"){showVersions();return;}
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
window.addEventListener("hashchange",function(){if(PHASE!=="app")return;route=location.hash||"#/";render();});

/* ---------- start ---------- */
sb.auth.onAuthStateChange(function(ev,sess){
 SYNC.token=sess?sess.access_token:null;
 if(ev==="SIGNED_OUT"){S=null;ME=null;CONTENT={};PHASE="signin";AUTH.step="email";AUTH.code="";UI.versions=null;render();}
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
