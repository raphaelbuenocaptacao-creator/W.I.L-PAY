const API='https://aureonbase.vercel.app';
const PROJECT='wilpay';
const ACCESS='wilpay_aureon_access';
const REFRESH='wilpay_aureon_refresh';
let accessToken=localStorage.getItem(ACCESS)||'';
let refreshToken=localStorage.getItem(REFRESH)||'';
let currentUser=null;

function persist(data={}){if(data.access_token){accessToken=data.access_token;localStorage.setItem(ACCESS,accessToken)}if(data.refresh_token){refreshToken=data.refresh_token;localStorage.setItem(REFRESH,refreshToken)}}
function clear(){accessToken='';refreshToken='';currentUser=null;localStorage.removeItem(ACCESS);localStorage.removeItem(REFRESH)}
async function raw(path,options={},token=accessToken){return fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}})}
async function request(path,options={},retry=true){let r=await raw(path,options);if(r.status===401&&retry&&refreshToken&&path!='/auth/refresh'){const q=await raw('/auth/refresh',{method:'POST',body:JSON.stringify({refresh_token:refreshToken})},'');if(q.ok){persist(await q.json());r=await raw(path,options)}else clear()}if(r.status===204)return null;const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(data.error||`HTTP ${r.status}`);e.status=r.status;e.code=data.error;e.details=data;throw e}return data}
async function sessionUser(){if(!accessToken&&!refreshToken)return null;try{const me=await request('/me');currentUser={id:me.id,email:me.email,name:me.name||me.email,is_superadmin:!!me.is_superadmin};return currentUser}catch{clear();return null}}

const tableToCollection=t=>String(t).replace(/^wilpay_/, '');
const flatten=r=>{const data=r?.data||{};return {...data,id:data.id??r.id,created_at:data.created_at||r.created_at,updated_at:data.updated_at||r.updated_at,_record_id:r.id,_owner_user_id:r.owner_user_id}};
const clean=o=>{const x={...o};delete x._record_id;delete x._owner_user_id;return x};

class Builder{
  constructor(table,operation='select',payload=null){this.collection=tableToCollection(table);this.operation=operation;this.payload=payload;this.filters=[];this.sort=null;this.take=null;this.wantSelect=false}
  select(){this.wantSelect=true;return this}
  eq(field,value){this.filters.push([field,value]);return this}
  order(field,{ascending=true}={}){this.sort={field,ascending};return this}
  limit(n){this.take=Number(n);return this}
  then(resolve,reject){this.execute().then(resolve,reject)}
  matches(row){return this.filters.every(([k,v])=>String(row?.[k]??'')===String(v??''))}
  shape(rows){let out=rows.map(flatten).filter(x=>this.matches(x));if(this.sort){const{field,ascending}=this.sort;out.sort((a,b)=>{const av=a?.[field],bv=b?.[field];const an=Date.parse(av),bn=Date.parse(bv);const cmp=Number.isNaN(an)||Number.isNaN(bn)?String(av??'').localeCompare(String(bv??'')):an-bn;return ascending?cmp:-cmp})}if(Number.isFinite(this.take))out=out.slice(0,this.take);return out}
  async list(){const rows=await request(`/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}?limit=500`);return this.shape(rows)}
  async execute(){try{
    if(this.operation==='select')return{data:await this.list(),error:null};
    if(this.operation==='insert'){
      const inputs=Array.isArray(this.payload)?this.payload:[this.payload],saved=[];
      for(const item of inputs){const body={data:clean(item)};if(item?.auth_uid)body.owner_user_id=item.auth_uid;const r=await request(`/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}`,{method:'POST',body:JSON.stringify(body)});saved.push(flatten(r))}
      return{data:this.wantSelect?saved:null,error:null};
    }
    if(this.operation==='update'){
      const existing=await this.list(),saved=[];
      for(const row of existing){const merged=clean({...row,...this.payload});const r=await request(`/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}/${encodeURIComponent(row._record_id)}`,{method:'PUT',body:JSON.stringify({data:merged})});saved.push(flatten(r))}
      return{data:this.wantSelect?saved:null,error:null};
    }
    if(this.operation==='delete'){
      const existing=await this.list();for(const row of existing)await request(`/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}/${encodeURIComponent(row._record_id)}`,{method:'DELETE'});return{data:null,error:null};
    }
    return{data:null,error:{message:'Operação inválida'}};
  }catch(e){return{data:null,error:{message:e.message,code:e.code,status:e.status}}}
}

export const neon={
  auth:{
    getSession:async()=>({data:{user:await sessionUser()},error:null}),
    signUp:{email:async({name,email,password})=>{try{const d=await request('/auth/register',{method:'POST',body:JSON.stringify({email:String(email).trim().toLowerCase(),password,project_slug:PROJECT})},false);persist(d);currentUser={id:d.user.id,email:d.user.email,name:name||d.user.email};if(name){const b=new Builder('wilpay_profiles','insert',{auth_uid:d.user.id,email:d.user.email,name,score:300,member_since:new Date().toISOString()});await b.execute()}return{data:{user:currentUser},error:null}}catch(e){return{data:null,error:{message:e.code==='email_already_exists'?'Este e-mail já possui conta.':e.message}}}}},
    signIn:{email:async({email,password})=>{try{const d=await request('/auth/login',{method:'POST',body:JSON.stringify({email:String(email).trim().toLowerCase(),password})},false);persist(d);currentUser={id:d.user.id,email:d.user.email,name:d.user.email,is_superadmin:!!d.user.is_superadmin};const access=await request(`/projects/${PROJECT}/access`).catch(()=>null);if(!access?.project)throw new Error('Usuário sem acesso ao W.I.L Pay.');return{data:{user:currentUser},error:null}}catch(e){clear();return{data:null,error:{message:e.code==='invalid_credentials'?'E-mail ou senha inválidos.':e.message}}}}},
    signOut:async()=>{try{if(accessToken)await request('/auth/logout',{method:'POST',body:JSON.stringify({refresh_token:refreshToken})},false)}catch{}finally{clear()}},
  },
  from(table){return{select:()=>new Builder(table,'select'),insert:p=>new Builder(table,'insert',p),update:p=>new Builder(table,'update',p),delete:()=>new Builder(table,'delete')}}
};
