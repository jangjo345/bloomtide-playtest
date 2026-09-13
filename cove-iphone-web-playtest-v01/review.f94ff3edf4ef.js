import {ReviewStore,validateRecord} from "./store.b6f3dae76aef.js";
import {measureCanvas} from "./measure.4b97894ada38.js";
const $=id=>document.getElementById(id), store=new ReviewStore(), build=window.COVE_BUILD;
let selected=null,initialJson=null,instance=null,ready=false,booting=false,lockHeld=false,failed=false,pending=null,writing=false,writeTimer=null,returning=false,stage="저장 공간 확인",lastSave=0;
if(new URLSearchParams(location.search).has("measure"))measureCanvas($("unity-canvas"),()=>ready&&!suspended());
function suspended(){return document.hidden || innerHeight>innerWidth || failed || returning;}
function notifyPause(){if(instance&&ready)instance.SendMessage("CoveWebReview","SetSuspended",suspended()?"1":"0");}
function showError(message,retrySave=false){failed=true;$("error-message").textContent=message;$("error").hidden=false;$("retry").hidden=!retrySave;notifyPause();}
function layout(){const v=window.visualViewport;$("world").style.height=v?`calc(${v.height}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`:"";$("rotate").hidden=innerWidth>=innerHeight;notifyPause();}
function setStage(text){stage=text;$("stage").textContent=text;}
async function enter(){
  const preflightTimer=setTimeout(()=>showError("브라우저 저장 공간의 응답이 없습니다. 플레이를 시작하지 않았습니다. 시작 화면에서 다시 시도해 주세요."),15000);
  if(!isSecureContext || !navigator.locks || !window.indexedDB){clearTimeout(preflightTimer);showError("이 환경에서는 안전한 검토 저장을 사용할 수 없습니다. Safari 일반 탭의 HTTPS 검토 링크로 열어 주세요.");return;}
  if(window.top!==window.self){clearTimeout(preflightTimer);showError("검토 링크를 Safari에서 직접 열어 주세요. 삽입 화면에서는 저장을 시작하지 않습니다.");return;}
  navigator.locks.request("Bloomtide.Cove.Review.V01.writer",{ifAvailable:true},async lock=>{
    if(!lock){clearTimeout(preflightTimer);showError("다른 탭에서 이 검토본을 열고 있습니다. 그 탭을 닫은 뒤 여기서 시작 화면을 다시 열어 주세요.");return;}
    lockHeld=true;
    try{
      await store.open();
      const records=(await store.list()).sort((a,b)=>b.updated-a.updated);
      clearTimeout(preflightTimer);if(failed)return;
      for(const r of records){const o=document.createElement("option");o.value=r.id;o.textContent=new Date(r.created).toLocaleString("ko-KR")+" 시작 · "+(r.json?new Date(r.updated).toLocaleString("ko-KR")+" 저장":"아직 플레이하지 않은 기록");$("slots").append(o);}
      $("slots").hidden=!records.length;$("resume").disabled=!records.length;$("new").disabled=false;
      $("entry-state").textContent=records.length?"이어할 기록을 고르거나 새로 시작하세요.":"이어할 기록이 아직 없습니다. 처음부터 시작할 수 있어요.";
    }catch(e){clearTimeout(preflightTimer);showError("저장 공간을 준비하지 못했습니다. 플레이를 시작하지 않았습니다. "+e.message);}
    // Keep ownership through tab suspension; browser releases it on actual close/crash.
    await new Promise(()=>{});
  }).catch(e=>showError("검토 탭 보호를 시작하지 못했습니다. "+e.message));
}
async function boot(isNew){
  if(booting||!lockHeld||failed)return;booting=true;$("new").disabled=true;$("resume").disabled=true;
  const timer=setTimeout(()=>{if(!ready)showError("실행 준비 응답이 오래 걸리고 있습니다. 마지막 단계: "+stage+". 연결을 확인하고 시작 화면에서 재시도하세요.");},180000);
  try{
    selected=isNew?await store.create():await store.get($("slots").value);
    validateRecord(selected);
    initialJson=selected.json;
    $("entry").hidden=true;$("loading").hidden=false;setStage("게임 로더 다운로드");
    await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=build.loader;s.onload=resolve;s.onerror=()=>reject(new Error("로더 파일 요청 실패"));document.head.append(s);});
    setStage("게임 파일 다운로드 · 압축 해제는 브라우저가 처리합니다");
    instance=await createUnityInstance($("unity-canvas"),{dataUrl:build.data,frameworkUrl:build.framework,codeUrl:build.wasm,streamingAssetsUrl:"StreamingAssets",companyName:build.company,productName:build.product,productVersion:build.version,devicePixelRatio:Math.min(devicePixelRatio,1.5),cacheControl:()=>"no-store"},p=>{if(p<.9){$("progress").value=p; }else{$("progress").removeAttribute("value");setStage("다운로드 후 WebAssembly·마을 실행 준비");}});
    while(!ready&&!failed)await new Promise(resolve=>setTimeout(resolve,50));
    clearTimeout(timer);if(failed){notifyPause();return;}
    $("loading").hidden=true;$("menu").hidden=false;$("unity-canvas").focus();notifyPause();
  }catch(e){clearTimeout(timer);showError(stage+" 실패 · "+e.message);}
}
function queueWrite(json){if(!lockHeld||!selected)throw new Error("검토 저장이 준비되지 않았습니다.");pending=json;$("status").textContent="저장 중…";if(!writing&&!failed)void flush();}
async function flush(){
  if(writing||pending===null)return;writing=true;const json=pending;pending=null;
  // Timeout is an uncertain result: stop writes and preserve the page, never overlap transactions.
  writeTimer=setTimeout(()=>showError("저장 완료 응답을 기다리고 있습니다. 이 탭을 유지해 주세요."),15000);
  try{selected=await store.save(selected,json);lastSave=Date.now();writing=false;clearTimeout(writeTimer);document.body.dataset.checkpoint=JSON.stringify({slot:selected.id,revision:selected.revision,bytes:json.length,utc:new Date(lastSave).toISOString()});if(pending!==null&&!failed){void flush();return;}$("status").textContent="이 브라우저에 저장됨 · "+new Date(lastSave).toLocaleTimeString("ko-KR");if(returning&&!failed)location.reload();}
  catch(e){writing=false;clearTimeout(writeTimer);if(pending===null)pending=json;showError("저장하지 못해 플레이를 멈췄습니다. 이 탭을 유지하고 저장을 다시 시도해 주세요. "+e.message,true);}
}
window.CoveReview={
  profile:()=>selected?.id||"",
  read:()=>{if(!selected||!lockHeld)throw new Error("검토 기록 읽기 미완료");return initialJson||"";},
  write:queueWrite,
  signal:(kind,text)=>{if(kind==="fatal")showError(text);if(kind==="ready"){ready=true;notifyPause();}if(kind==="menu")returnToStart();}
};
function returnToStart(){returning=true;notifyPause();if(!writing&&pending===null&&!failed)location.reload();}
$("new").onclick=()=>boot(true);$("resume").onclick=()=>boot(false);$("menu").onclick=returnToStart;
$("retry").onclick=async()=>{failed=false;$("error").hidden=true;await flush();notifyPause();};
$("reload").onclick=()=>{if((writing||pending!==null)&&!confirm("아직 저장되지 않은 진행은 사라질 수 있습니다. 마지막으로 저장된 기록을 보존하고 시작 화면으로 돌아갈까요?"))return;location.reload();};
document.addEventListener("visibilitychange",notifyPause);addEventListener("pagehide",notifyPause);
addEventListener("pageshow",e=>{if(e.persisted)location.reload();});
addEventListener("resize",()=>{layout();if(instance&&ready)instance.SendMessage("CoveWebReview","ResetPointers","");});visualViewport?.addEventListener("resize",layout);addEventListener("blur",()=>{if(instance&&ready)instance.SendMessage("CoveWebReview","ResetPointers","");});
$("unity-canvas").addEventListener("touchmove",e=>e.preventDefault(),{passive:false});
$("unity-canvas").addEventListener("touchcancel",()=>{if(instance&&ready)instance.SendMessage("CoveWebReview","ResetPointers","");});
$("unity-canvas").addEventListener("contextmenu",e=>e.preventDefault());
$("unity-canvas").addEventListener("webglcontextlost",e=>{e.preventDefault();showError("그래픽 실행이 중단됐습니다. 마지막 저장을 유지하고 시작 화면에서 다시 열어 주세요.");});
layout();void enter();
