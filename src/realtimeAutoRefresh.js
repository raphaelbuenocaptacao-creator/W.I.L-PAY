const API='https://aureonbase.vercel.app';
const PROJECT='wilpay';
const TOKEN_KEY='wilpay_aureon_access';
const TOPIC='wilpay-data';

const nativeFetch=globalThis.fetch?.bind(globalThis);
let cursor=null;
let lastLocalWrite=0;
let pendingRemoteChange=false;
let reloading=false;

function accessToken(){
  try{return globalThis.localStorage?.getItem(TOKEN_KEY)||''}catch{return ''}
}

function isAdminView(){
  const text=globalThis.document?.body?.innerText||'';
  return text.includes('ADMINISTRADOR')||text.includes('CENTRAL W.I.L');
}

function isEditing(){
  const el=globalThis.document?.activeElement;
  return Boolean(el&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName));
}

async function publishChange(method,url){
  const token=accessToken();
  if(!token||!nativeFetch)return;
  try{
    const collection=String(url).split(`/v1/projects/${PROJECT}/data/`)[1]?.split(/[/?#]/)[0]||'data';
    await nativeFetch(`${API}/api/projects/${PROJECT}/realtime/publish`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({
        topic:TOPIC,
        event_type:`${collection}.${String(method).toLowerCase()}`,
        payload:{collection,changed_at:new Date().toISOString()}
      })
    });
  }catch{
    // Realtime enhancement must never block the financial flow.
  }
}

if(nativeFetch){
  globalThis.fetch=async(input,init={})=>{
    const response=await nativeFetch(input,init);
    try{
      const url=typeof input==='string'?input:input?.url||'';
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      const isWilpayWrite=url.includes(`${API}/v1/projects/${PROJECT}/data/`)&&['POST','PUT','DELETE'].includes(method);
      if(response.ok&&isWilpayWrite){
        lastLocalWrite=Date.now();
        publishChange(method,url);
      }
    }catch{
      // Never interfere with the original request.
    }
    return response;
  };
}

async function pollRealtime(){
  if(!nativeFetch||reloading)return;
  const token=accessToken();
  if(!token)return;
  try{
    const after=cursor===null?0:cursor;
    const response=await nativeFetch(`${API}/api/projects/${PROJECT}/realtime/events?after=${after}&limit=100&topic=${TOPIC}`,{
      headers:{Authorization:`Bearer ${token}`}
    });
    if(!response.ok)return;
    const data=await response.json();
    const events=Array.isArray(data?.events)?data.events:[];
    const next=Number(data?.next_cursor||after);

    if(cursor===null){
      cursor=next;
      return;
    }

    cursor=next;
    if(events.length&&Date.now()-lastLocalWrite>4000)pendingRemoteChange=true;

    if(pendingRemoteChange&&isAdminView()&&!isEditing()&&globalThis.document?.visibilityState==='visible'){
      pendingRemoteChange=false;
      reloading=true;
      globalThis.location.reload();
    }
  }catch{
    // A temporary realtime outage must not affect normal usage.
  }
}

if(typeof globalThis.window!=='undefined'){
  globalThis.setInterval(pollRealtime,1500);
  globalThis.window.addEventListener('focus',pollRealtime);
  globalThis.document?.addEventListener('visibilitychange',()=>{
    if(globalThis.document.visibilityState==='visible')pollRealtime();
  });
}
