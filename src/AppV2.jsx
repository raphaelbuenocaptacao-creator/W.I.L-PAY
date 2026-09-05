import React,{useEffect,useMemo,useState}from'react';
import{neon}from'./lib/aureonClient';

const ADMIN_EMAIL='admin@wilpay.com.br';
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+Number(n||0));return x.toISOString().slice(0,10)};
const addHours=(d,n)=>new Date(new Date(d).getTime()+Number(n||0)*3600000).toISOString();
const fmtDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const fmtDateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const grade=s=>{const n=Number(s||0);return n>=850?'A':n>=700?'B':n>=550?'C':n>=400?'D':'E'};
const gradeText=s=>({A:'Excelente',B:'Muito bom',C:'Em evolução',D:'Atenção',E:'Inicial'})[grade(s)];
const activeStatuses=['EM_ANALISE','APROVADO_AGUARDANDO_PIX','PIX_ENVIADO','ATIVO'];
const defaults={id:1,min_amount:100,max_amount:10000,default_interest_rate:12,payout_sla_hours:24};
const blank={name:'Novo cliente',cpf:'',phone:'',pix_key:'',score:500,member_since:new Date().toISOString()};

function Logo(){return <div className="brandmark">W</div>}

function Auth({onReady}){
  const[mode,setMode]=useState('login');
  const[form,setForm]=useState({name:'',email:'',password:''});
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const admin=form.email.trim().toLowerCase()===ADMIN_EMAIL;
  async function submit(e){
    e.preventDefault();setBusy(true);setError('');
    try{
      const r=mode==='register'
        ?await neon.auth.signUp.email({name:form.name,email:form.email,password:form.password})
        :await neon.auth.signIn.email({email:form.email,password:form.password});
      if(r.error)throw new Error(r.error.message);
      await onReady();
    }catch(e){setError(e.message||'Não foi possível entrar.')}finally{setBusy(false)}
  }
  return <div className="auth-page"><div className="auth-hero"><Logo/><h1>W.I.L PAY</h1><p>Crédito direto, análise simples e acompanhamento em tempo real.</p></div><form className="auth-card" onSubmit={submit}><small>{admin?'CENTRAL ADMINISTRATIVA':'ACESSO W.I.L'}</small><h2>{mode==='login'?'Entrar':'Criar conta'}</h2>{!admin&&<div className="seg"><button type="button" className={mode==='login'?'on':''} onClick={()=>setMode('login')}>Entrar</button><button type="button" className={mode==='register'?'on':''} onClick={()=>setMode('register')}>Criar conta</button></div>}{mode==='register'&&!admin&&<label>Nome<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}<label>E-mail<input required type="email" value={form.email} onChange={e=>{const email=e.target.value;setForm({...form,email});if(email.trim().toLowerCase()===ADMIN_EMAIL)setMode('login')}}/></label><label>Senha<input required type="password" minLength="10" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Aguarde...':admin?'Entrar na Central':mode==='login'?'Entrar':'Começar agora'}</button><p className="safe">Conta protegida pela Aureon Base.</p></form></div>
}

export default function App(){
  const[user,setUser]=useState(null),[loading,setLoading]=useState(true);
  async function session(){const s=await neon.auth.getSession();setUser(s.data?.user||null);setLoading(false)}
  useEffect(()=>{session()},[]);
  if(loading)return <div className="splash"><Logo/><b>W.I.L PAY</b></div>;
  if(!user)return <Auth onReady={session}/>;
  return user.email?.toLowerCase()===ADMIN_EMAIL?<AdminApp authUser={user}/>:<ClientApp authUser={user}/>;
}

function Shell({admin,email,onSignOut,children}){
  return <div className="app"><header className="app-header"><div className="head-row"><div className="brand"><Logo/><div><b>W.I.L PAY</b><small>{admin?'ADMINISTRADOR':email}</small></div></div><button className="ghost" onClick={onSignOut}>Sair</button></div><div className="headline"><small>{admin?'CENTRAL W.I.L':'CRÉDITO SEM ENROLAÇÃO'}</small><h1>{admin?'Acompanhe cada etapa.':'Responda. Envie. Acompanhe.'}</h1><p>{admin?'Análise, documentos, PIX, liberação e cobrança em uma única visão.':'Um fluxo rápido: questionário, documentos, análise e PIX somente depois da aprovação.'}</p></div></header>{children}</div>
}

function ScoreCard({score=500}){
  const g=grade(score);
  return <section className="score-card"><div><small>W.I.L SCORE</small><h2>{score}<span>/1000</span></h2><p>{gradeText(score)}</p></div><div className={`grade grade-${g}`}>{g}</div><div className="score-line"><i style={{width:`${clamp(score,1,1000)/10}%`}}/></div><div className="grade-scale"><span>E</span><span>D</span><span>C</span><span>B</span><span>A</span></div></section>
}

function statusLabel(status){return ({EM_ANALISE:'Em análise',APROVADO_AGUARDANDO_PIX:'Aprovado · envie o PIX',PIX_ENVIADO:'PIX enviado · aguardando liberação',ATIVO:'Crédito liberado',RECUSADO:'Não aprovado',PAGO:'Quitado'})[status]||'Começar';}
function stepOf(status){return ({EM_ANALISE:2,APROVADO_AGUARDANDO_PIX:3,PIX_ENVIADO:4,ATIVO:5,PAGO:6,RECUSADO:0})[status]||1}

function FlowSteps({status}){
  const step=stepOf(status),items=['Questionário','Documentos','Análise','PIX','Liberação','Pagamento'];
  return <div className="flow-steps">{items.map((t,i)=><div className={step>i?'done':step===i?'current':''} key={t}><b>{step>i?'✓':i+1}</b><span>{t}</span></div>)}</div>
}

function ClientApp({authUser}){
  const[tab,setTab]=useState('inicio'),[profile,setProfile]=useState({...blank,name:authUser.name||authUser.email}),[loans,setLoans]=useState([]),[payments,setPayments]=useState([]),[docs,setDocs]=useState([]),[settings,setSettings]=useState(defaults),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[pix,setPix]=useState('');
  const current=loans[0];
  async function load(){
    setBusy(true);
    try{
      let p=await neon.from('wilpay_profiles').select('*').eq('auth_uid',authUser.id).limit(1),row=p.data?.[0];
      if(!row){const i=await neon.from('wilpay_profiles').insert({auth_uid:authUser.id,email:authUser.email,name:authUser.name||authUser.email,score:500,member_since:new Date().toISOString()}).select();row=i.data?.[0]||blank}
      setProfile(row);
      const[l,pa,d,s]=await Promise.all([
        neon.from('wilpay_loans').select('*').eq('auth_uid',authUser.id).order('requested_at',{ascending:false}),
        neon.from('wilpay_payments').select('*').eq('auth_uid',authUser.id).order('due_date'),
        neon.from('wilpay_documents').select('*').eq('auth_uid',authUser.id).order('created_at',{ascending:false}),
        neon.from('wilpay_settings').select('*').eq('id',1).limit(1)
      ]);
      setLoans(l.data||[]);setPayments(pa.data||[]);setDocs(d.data||[]);if(s.data?.[0])setSettings({...defaults,...s.data[0]});
    }finally{setBusy(false)}
  }
  useEffect(()=>{load()},[]);
  async function sendPix(){
    if(!current||!pix.trim())return;
    setBusy(true);const now=new Date().toISOString(),deadline=addHours(now,settings.payout_sla_hours||24);
    const r=await neon.from('wilpay_loans').update({pix_key:pix.trim(),pix_submitted_at:now,payout_deadline_at:deadline,status:'PIX_ENVIADO'}).eq('id',current.id).select();
    if(!r.error){await neon.from('wilpay_profiles').update({pix_key:pix.trim(),updated_at:now}).eq('auth_uid',authUser.id);setNotice(`PIX enviado. Prazo de liberação: até ${fmtDateTime(deadline)}.`);await load()}
    setBusy(false);
  }
  async function signOut(){await neon.auth.signOut();location.reload()}
  const receipt=docs.find(d=>d.loan_id===current?.id&&d.doc_type==='COMPROVANTE_PAGAMENTO');
  const canApply=!loans.some(x=>activeStatuses.includes(x.status));
  return <Shell email={authUser.email} onSignOut={signOut}><main className="client-main">{notice&&<div className="notice">{notice}</div>}{tab==='inicio'&&<><ScoreCard score={profile.score}/><FlowSteps status={current?.status}/>{current?<section className="status-card"><small>STATUS ATUAL</small><h2>{statusLabel(current.status)}</h2><p>Solicitação #{current.id} · {brl(current.principal)}</p>{current.status==='APROVADO_AGUARDANDO_PIX'&&<div className="pix-box"><h3>Crédito aprovado</h3><p>Agora informe a chave PIX que receberá o valor.</p><input placeholder="CPF, celular, e-mail ou chave aleatória" value={pix} onChange={e=>setPix(e.target.value)}/><button className="primary" disabled={busy||!pix.trim()} onClick={sendPix}>Enviar PIX para o administrador</button></div>}{current.status==='PIX_ENVIADO'&&<div className="deadline"><b>PIX recebido</b><span>Prazo informado para pagamento: {fmtDateTime(current.payout_deadline_at)}</span></div>}{current.status==='ATIVO'&&<div className="released"><b>Valor liberado</b><span>Pagamento em 2x, de 15 em 15 dias.</span>{receipt&&<a href={receipt.data_url} target="_blank" rel="noreferrer">Ver comprovante da liberação</a>}</div>}{current.status==='RECUSADO'&&<button className="secondary" onClick={()=>setTab('solicitar')}>Fazer nova solicitação</button>}</section>:<section className="start-card"><small>COMECE AQUI</small><h2>Descubra seu crédito em poucos passos.</h2><p>Você só informa o PIX depois que a análise for aprovada.</p><button className="primary" onClick={()=>setTab('solicitar')}>Solicitar análise</button></section>}<div className="quick-grid"><button onClick={()=>setTab('pagamentos')}><b>Pagamentos</b><small>2 parcelas e datas</small></button><button onClick={()=>setTab('perfil')}><b>Meu cadastro</b><small>Dados pessoais</small></button></div></>}{tab==='solicitar'&&<ApplicationWizard authUser={authUser} profile={profile} settings={settings} canApply={canApply} onDone={async()=>{setTab('inicio');await load()}} setNotice={setNotice}/>} {tab==='pagamentos'&&<Payments payments={payments}/>} {tab==='perfil'&&<Profile profile={profile} authUser={authUser} onSaved={async()=>{setNotice('Cadastro atualizado.');await load()}}/>}</main><nav className="bottom-nav">{[['inicio','Início'],['solicitar','Solicitar'],['pagamentos','Pagamentos'],['perfil','Perfil']].map(([id,t])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{t}</button>)}</nav></Shell>
}

function ApplicationWizard({authUser,profile,settings,canApply,onDone,setNotice}){
  const[step,setStep]=useState(0),[busy,setBusy]=useState(false),[fileError,setFileError]=useState('');
  const[a,setA]=useState({amount:Math.max(Number(settings.min_amount||100),1000),purpose:'',income_type:'',monthly_income:'',income_time:'',open_debts:''});
  const[files,setFiles]=useState({documento:null,residencia:null,selfie:null});
  const questions=[
    {key:'amount',title:'Quanto você precisa?',render:<><div className="money-big">{brl(a.amount)}</div><input type="range" min={settings.min_amount||100} max={settings.max_amount||10000} step="100" value={a.amount} onChange={e=>setA({...a,amount:+e.target.value})}/></>},
    {key:'purpose',title:'Para que você pretende usar o crédito?',options:['Emergência','Organizar contas','Compra pessoal','Negócio / trabalho','Outro']},
    {key:'income_type',title:'Qual é sua principal fonte de renda?',options:['CLT','Autônomo','Empresário','Aposentadoria / benefício','Outra']},
    {key:'monthly_income',title:'Qual sua renda mensal aproximada?',render:<input className="big-input" type="number" min="0" placeholder="Ex.: 3500" value={a.monthly_income} onChange={e=>setA({...a,monthly_income:e.target.value})}/>},
    {key:'income_time',title:'Há quanto tempo você recebe dessa fonte?',options:['Menos de 3 meses','3 a 6 meses','6 a 12 meses','Mais de 12 meses']},
    {key:'open_debts',title:'Você possui parcelas ou empréstimos em aberto?',options:['Não','Sim']}
  ];
  const q=questions[Math.min(step,questions.length-1)];
  const valid=()=>q.key==='amount'?Number(a.amount)>0:String(a[q.key]||'').trim().length>0;
  function choose(v){setA({...a,[q.key]:v});setTimeout(()=>setStep(s=>Math.min(s+1,questions.length)),120)}
  function readFile(key,file){
    setFileError('');if(!file)return;
    if(file.size>3*1024*1024){setFileError('Cada arquivo deve ter no máximo 3 MB.');return}
    if(!['image/jpeg','image/png','application/pdf'].includes(file.type)){setFileError('Envie JPG, PNG ou PDF.');return}
    const reader=new FileReader();reader.onload=()=>setFiles(x=>({...x,[key]:{name:file.name,type:file.type,size:file.size,data_url:reader.result}}));reader.readAsDataURL(file);
  }
  async function submit(){
    if(!canApply){setNotice('Você já possui uma análise ou crédito em andamento.');return}
    if(!files.documento||!files.residencia||!files.selfie){setFileError('Envie os 3 documentos para continuar.');return}
    setBusy(true);const now=new Date().toISOString(),rate=Number(settings.default_interest_rate||12),total=Number(a.amount)*(1+rate/100);
    const l=await neon.from('wilpay_loans').insert({auth_uid:authUser.id,principal:Number(a.amount),total_amount:Number(total.toFixed(2)),interest_rate:rate,status:'EM_ANALISE',repayment_type:'2X_QUINZENAL',installment_count:2,term_days:15,requested_at:now,answers:a}).select();
    if(l.error||!l.data?.[0]){setFileError(l.error?.message||'Não foi possível enviar a análise.');setBusy(false);return}
    const loan=l.data[0];
    for(const[key,doc]of Object.entries(files))await neon.from('wilpay_documents').insert({auth_uid:authUser.id,loan_id:loan.id,doc_type:key==='documento'?'DOCUMENTO_FOTO':key==='residencia'?'COMPROVANTE_RESIDENCIA':'SELFIE_DOCUMENTO',file_name:doc.name,mime_type:doc.type,size:doc.size,data_url:doc.data_url,created_at:now}).select();
    setNotice('Documentos enviados. Sua análise já está na fila do administrador.');setBusy(false);await onDone();
  }
  if(!canApply)return <section className="wizard"><small>SOLICITAÇÃO</small><h2>Você já tem uma etapa em andamento.</h2><p>Conclua a solicitação atual antes de iniciar outra.</p></section>;
  if(step<questions.length)return <section className="wizard"><div className="wizard-top"><span>PERGUNTA {step+1} DE {questions.length}</span><b>{Math.round(((step+1)/questions.length)*100)}%</b></div><div className="progress"><i style={{width:`${((step+1)/questions.length)*100}%`}}/></div><h2>{q.title}</h2>{q.render||<div className="option-list">{q.options.map(o=><button key={o} className={a[q.key]===o?'selected':''} onClick={()=>choose(o)}>{o}</button>)}</div>}{q.render&&<div className="wizard-actions">{step>0&&<button className="secondary" onClick={()=>setStep(step-1)}>Voltar</button>}<button className="primary" disabled={!valid()} onClick={()=>setStep(step+1)}>Continuar</button></div>}{!q.render&&step>0&&<button className="back-link" onClick={()=>setStep(step-1)}>← Voltar</button>}</section>;
  return <section className="wizard"><small>DOCUMENTOS</small><h2>Última etapa antes da análise.</h2><p>Envie somente os documentos essenciais. O PIX será solicitado apenas se você for aprovado.</p><div className="doc-grid"><DocUpload title="Documento com foto" hint="RG ou CNH" file={files.documento} onFile={f=>readFile('documento',f)}/><DocUpload title="Comprovante de residência" hint="Conta recente ou documento equivalente" file={files.residencia} onFile={f=>readFile('residencia',f)}/><DocUpload title="Selfie com o documento" hint="Foto nítida, rosto e documento visíveis" file={files.selfie} onFile={f=>readFile('selfie',f)}/></div>{fileError&&<div className="error">{fileError}</div>}<div className="review-mini"><b>Resumo</b><span>Valor solicitado: {brl(a.amount)}</span><span>Pagamento se aprovado: 2x de 15 em 15 dias</span><span>Juros atual da análise: {Number(settings.default_interest_rate||12)}%</span></div><div className="wizard-actions"><button className="secondary" onClick={()=>setStep(questions.length-1)}>Voltar</button><button className="primary" disabled={busy} onClick={submit}>{busy?'Enviando...':'Pedir análise'}</button></div></section>
}

function DocUpload({title,hint,file,onFile}){return <label className={file?'doc-upload uploaded':'doc-upload'}><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>onFile(e.target.files?.[0])}/><b>{file?'✓ '+title:title}</b><small>{file?file.name:hint}</small><span>{file?'Trocar arquivo':'Adicionar documento'}</span></label>}

function Payments({payments}){return <section className="panel"><small>PAGAMENTOS</small><h2>Suas parcelas</h2><p className="sub">O padrão W.I.L Pay é sempre 2 parcelas, com 15 dias entre elas.</p>{payments.length?payments.map(p=><article className="payment-row" key={p.id}><div><b>Parcela {p.installment_number}/2</b><small>Vencimento {fmtDate(p.due_date)}</small></div><div><strong>{brl(p.amount)}</strong><em>{String(p.status||'PENDENTE').replaceAll('_',' ')}</em></div></article>):<div className="empty">As datas aparecem aqui depois da liberação do crédito.</div>}</section>}

function Profile({profile,authUser,onSaved}){
  const[f,setF]=useState(profile),[busy,setBusy]=useState(false);useEffect(()=>setF(profile),[profile]);
  async function save(){setBusy(true);const r=await neon.from('wilpay_profiles').update({name:f.name,cpf:f.cpf,phone:f.phone,updated_at:new Date().toISOString()}).eq('auth_uid',authUser.id).select();setBusy(false);if(!r.error)onSaved()}
  return <section className="panel"><small>MEU CADASTRO</small><h2>Dados essenciais</h2>{[['Nome','name'],['CPF','cpf'],['Telefone','phone']].map(([l,k])=><label className="field" key={k}>{l}<input value={f[k]||''} onChange={e=>setF({...f,[k]:e.target.value})}/></label>)}<p className="sub">O PIX não fica exposto aqui antes da aprovação. Ele é solicitado na etapa certa.</p><button className="primary" disabled={busy} onClick={save}>{busy?'Salvando...':'Salvar'}</button></section>
}

function AdminApp({authUser}){
  const[profiles,setProfiles]=useState([]),[loans,setLoans]=useState([]),[payments,setPayments]=useState([]),[docs,setDocs]=useState([]),[settings,setSettings]=useState(defaults),[section,setSection]=useState('painel'),[selected,setSelected]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState({}),[scoreDraft,setScoreDraft]=useState({});
  async function load(){
    setBusy(true);const[p,l,pa,d,s]=await Promise.all([neon.from('wilpay_profiles').select('*').order('created_at',{ascending:false}),neon.from('wilpay_loans').select('*').order('requested_at',{ascending:false}),neon.from('wilpay_payments').select('*').order('due_date'),neon.from('wilpay_documents').select('*').order('created_at',{ascending:false}),neon.from('wilpay_settings').select('*').eq('id',1).limit(1)]);setProfiles(p.data||[]);setLoans(l.data||[]);setPayments(pa.data||[]);setDocs(d.data||[]);if(s.data?.[0])setSettings({...defaults,...s.data[0]});setBusy(false)
  }
  useEffect(()=>{load()},[]);
  const pending=loans.filter(x=>x.status==='EM_ANALISE'),awaitPix=loans.filter(x=>x.status==='APROVADO_AGUARDANDO_PIX'),toPay=loans.filter(x=>x.status==='PIX_ENVIADO'),active=loans.filter(x=>x.status==='ATIVO');
  const totalLent=loans.filter(x=>['ATIVO','PAGO'].includes(x.status)).reduce((a,x)=>a+Number(x.principal||0),0),open=payments.filter(x=>x.status==='PENDENTE').reduce((a,x)=>a+Number(x.amount||0),0);
  function profileOf(uid){return profiles.find(p=>p.auth_uid===uid)||{name:'Cliente',score:500}}
  function docsOf(id){return docs.filter(d=>String(d.loan_id)===String(id))}
  async function approve(l){setBusy(true);const r=await neon.from('wilpay_loans').update({status:'APROVADO_AGUARDANDO_PIX',approved_at:new Date().toISOString(),interest_rate:Number(settings.default_interest_rate||12),repayment_type:'2X_QUINZENAL',installment_count:2,term_days:15}).eq('id',l.id).select();if(!r.error)setNotice('Aprovado. O cliente já pode informar o PIX.');setSelected(null);await load();setBusy(false)}
  async function reject(l){if(!confirm('Recusar esta solicitação?'))return;await neon.from('wilpay_loans').update({status:'RECUSADO',rejected_at:new Date().toISOString()}).eq('id',l.id);setNotice('Solicitação recusada.');setSelected(null);load()}
  async function deleteApplication(l){if(!confirm('Excluir esta solicitação e todos os documentos ligados a ela?'))return;setBusy(true);await neon.from('wilpay_documents').delete().eq('loan_id',l.id);await neon.from('wilpay_payments').delete().eq('loan_id',l.id);await neon.from('wilpay_loans').delete().eq('id',l.id);setNotice('Solicitação excluída.');setSelected(null);await load();setBusy(false)}
  function readReceipt(loanId,file){if(!file)return;if(file.size>3*1024*1024){setNotice('Comprovante deve ter no máximo 3 MB.');return}const reader=new FileReader();reader.onload=()=>setReceipt(x=>({...x,[loanId]:{name:file.name,type:file.type,size:file.size,data_url:reader.result}}));reader.readAsDataURL(file)}
  async function confirmPayout(l){
    const file=receipt[l.id];if(!file){setNotice('Adicione o comprovante do PIX antes de confirmar.');return}
    setBusy(true);const now=new Date().toISOString(),rate=Number(l.interest_rate||settings.default_interest_rate||12),total=Number(l.principal)*(1+rate/100),part=Number((total/2).toFixed(2));
    await neon.from('wilpay_documents').insert({auth_uid:l.auth_uid,loan_id:l.id,doc_type:'COMPROVANTE_PAGAMENTO',file_name:file.name,mime_type:file.type,size:file.size,data_url:file.data_url,created_at:now}).select();
    const up=await neon.from('wilpay_loans').update({status:'ATIVO',paid_out_at:now,total_amount:Number(total.toFixed(2)),repayment_type:'2X_QUINZENAL',installment_count:2,term_days:15}).eq('id',l.id).select();
    if(!up.error){const old=await neon.from('wilpay_payments').select('*').eq('loan_id',l.id);if(!old.data?.length)await neon.from('wilpay_payments').insert([{loan_id:l.id,auth_uid:l.auth_uid,installment_number:1,amount:part,due_date:addDays(now,15),status:'PENDENTE'},{loan_id:l.id,auth_uid:l.auth_uid,installment_number:2,amount:Number((total-part).toFixed(2)),due_date:addDays(now,30),status:'PENDENTE'}]).select();setNotice('Liberação confirmada. Parcelas criadas para +15 e +30 dias.');setReceipt(x=>({...x,[l.id]:null}));await load()}
    setBusy(false);
  }
  async function markReceived(p){
    if(p.status!=='PENDENTE')return;setBusy(true);const today=new Date();today.setHours(23,59,59,999);const due=new Date(String(p.due_date).slice(0,10)+'T23:59:59');const late=today>due,status=late?'PAGO_ATRASADO':'PAGO_NO_PRAZO';await neon.from('wilpay_payments').update({status,paid_at:new Date().toISOString()}).eq('id',p.id);
    const loanPays=payments.filter(x=>String(x.loan_id)===String(p.loan_id)).map(x=>x.id===p.id?{...x,status}:x),done=loanPays.length===2&&loanPays.every(x=>String(x.status).startsWith('PAGO'));
    if(done)await neon.from('wilpay_loans').update({status:'PAGO',paid_at:new Date().toISOString()}).eq('id',p.loan_id);
    const prof=profileOf(p.auth_uid),delta=late?-120:80,bonus=done?100:0,newScore=clamp(Number(prof.score||500)+delta+bonus,1,1000);await neon.from('wilpay_profiles').update({score:newScore,updated_at:new Date().toISOString()}).eq('auth_uid',p.auth_uid);await neon.from('wilpay_score_events').insert({auth_uid:p.auth_uid,loan_id:p.loan_id,payment_id:p.id,points:delta+bonus,reason:late?'Pagamento após o vencimento':done?'Pagamento no prazo + ciclo quitado':'Pagamento no prazo',created_at:new Date().toISOString()});setNotice(`Pagamento recebido. Score agora: ${grade(newScore)} · ${newScore} pontos.`);await load();setBusy(false)
  }
  async function saveScore(p){const n=clamp(scoreDraft[p.auth_uid]??p.score,1,1000);await neon.from('wilpay_profiles').update({score:n,updated_at:new Date().toISOString()}).eq('auth_uid',p.auth_uid);await neon.from('wilpay_score_events').insert({auth_uid:p.auth_uid,points:n-Number(p.score||500),reason:'Ajuste manual do administrador',created_at:new Date().toISOString()});setNotice(`Score de ${p.name} atualizado para ${grade(n)} · ${n}.`);load()}
  async function deleteClient(p){if(!confirm(`Excluir os dados de ${p.name}? Solicitações, documentos, pagamentos e histórico serão removidos.`))return;setBusy(true);for(const c of ['wilpay_documents','wilpay_payments','wilpay_loans','wilpay_score_events','wilpay_location_history','wilpay_location_consents'])await neon.from(c).delete().eq('auth_uid',p.auth_uid);await neon.from('wilpay_profiles').delete().eq('auth_uid',p.auth_uid);setNotice('Dados do cliente excluídos do W.I.L Pay.');await load();setBusy(false)}
  async function saveSettings(){let found=await neon.from('wilpay_settings').select('*').eq('id',1).limit(1);const payload={...settings,id:1,updated_at:new Date().toISOString()};const r=found.data?.[0]?await neon.from('wilpay_settings').update(payload).eq('id',1).select():await neon.from('wilpay_settings').insert(payload).select();setNotice(r.error?r.error.message:'Regras atualizadas.');if(!r.error)load()}
  async function signOut(){await neon.auth.signOut();location.reload()}
  const selectedLoan=loans.find(x=>x.id===selected),selectedDocs=selectedLoan?docsOf(selectedLoan.id):[];
  return <Shell admin email={authUser.email} onSignOut={signOut}><main className="admin-main">{notice&&<div className="notice">{notice}</div>}<div className="admin-tabs">{[['painel','Painel'],['analises',`Análises ${pending.length}`],['liberacoes',`Liberar ${toPay.length}`],['clientes','Clientes'],['pagamentos','Recebimentos'],['regras','Regras']].map(([id,t])=><button key={id} className={section===id?'on':''} onClick={()=>setSection(id)}>{t}</button>)}</div>{section==='painel'&&<><section className="kpis"><article><small>EM ANÁLISE</small><b>{pending.length}</b></article><article><small>AGUARDANDO PIX</small><b>{awaitPix.length}</b></article><article><small>PARA LIBERAR</small><b>{toPay.length}</b></article><article><small>CRÉDITO ATIVO</small><b>{active.length}</b></article><article><small>EMPRESTADO</small><b>{brl(totalLent)}</b></article><article><small>A RECEBER</small><b>{brl(open)}</b></article></section><section className="panel"><small>FLUXO OPERACIONAL</small><h2>Fila rápida</h2><div className="pipeline"><button onClick={()=>setSection('analises')}><b>{pending.length}</b><span>Analisar</span></button><button onClick={()=>setSection('liberacoes')}><b>{toPay.length}</b><span>Pagar PIX</span></button><button onClick={()=>setSection('pagamentos')}><b>{payments.filter(x=>x.status==='PENDENTE').length}</b><span>Receber</span></button></div></section></>}{section==='analises'&&<section className="panel"><small>ANÁLISES</small><h2>Solicitações com documentos</h2>{pending.length?pending.map(l=><article className="admin-row" key={l.id}><div><b>{profileOf(l.auth_uid).name}</b><small>{brl(l.principal)} · Score {grade(profileOf(l.auth_uid).score)} · {profileOf(l.auth_uid).score} pts</small></div><div><button onClick={()=>setSelected(l.id)}>Abrir análise</button><button className="danger" onClick={()=>deleteApplication(l)}>Excluir</button></div></article>):<div className="empty">Nenhuma análise pendente.</div>}{selectedLoan&&selectedLoan.status==='EM_ANALISE'&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelected(null)}>×</button><small>ANÁLISE #{selectedLoan.id}</small><h2>{profileOf(selectedLoan.auth_uid).name}</h2><div className="score-inline"><span className={`grade grade-${grade(profileOf(selectedLoan.auth_uid).score)}`}>{grade(profileOf(selectedLoan.auth_uid).score)}</span><b>{profileOf(selectedLoan.auth_uid).score} pontos</b></div><div className="answers">{Object.entries(selectedLoan.answers||{}).map(([k,v])=><span key={k}><small>{({amount:'Valor',purpose:'Finalidade',income_type:'Fonte de renda',monthly_income:'Renda mensal',income_time:'Tempo de renda',open_debts:'Parcelas em aberto'})[k]||k}</small><b>{k==='amount'||k==='monthly_income'?brl(v):String(v)}</b></span>)}</div><div className="doc-links">{selectedDocs.filter(d=>d.doc_type!=='COMPROVANTE_PAGAMENTO').map(d=><a key={d.id} href={d.data_url} target="_blank" rel="noreferrer">{d.doc_type.replaceAll('_',' ')} · ver arquivo</a>)}</div><div className="modal-actions"><button className="danger" disabled={busy} onClick={()=>reject(selectedLoan)}>Recusar</button><button className="primary" disabled={busy} onClick={()=>approve(selectedLoan)}>Aprovar e pedir PIX</button></div></div></div>}</section>}{section==='liberacoes'&&<section className="panel"><small>LIBERAÇÕES PIX</small><h2>Clientes aprovados</h2>{toPay.length?toPay.map(l=><article className="payout-card" key={l.id}><div className="payout-top"><div><b>{profileOf(l.auth_uid).name}</b><small>{brl(l.principal)} · Score {grade(profileOf(l.auth_uid).score)} · {profileOf(l.auth_uid).score} pts</small></div><Deadline deadline={l.payout_deadline_at}/></div><div className="pix-copy"><small>CHAVE PIX</small><b>{l.pix_key}</b><button onClick={()=>navigator.clipboard?.writeText(l.pix_key)}>Copiar</button></div><label className="receipt-upload">Comprovante da transferência<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>readReceipt(l.id,e.target.files?.[0])}/><span>{receipt[l.id]?.name||'Adicionar comprovante'}</span></label><button className="primary" disabled={busy||!receipt[l.id]} onClick={()=>confirmPayout(l)}>Confirmar pagamento e gerar 2 parcelas</button></article>):<div className="empty">Nenhum PIX aguardando liberação.</div>}</section>}{section==='clientes'&&<section className="panel"><small>CLIENTES</small><h2>Score por cliente</h2><div className="score-legend"><span>A 850–1000</span><span>B 700–849</span><span>C 550–699</span><span>D 400–549</span><span>E 1–399</span></div>{profiles.map(p=><article className="client-row" key={p.auth_uid}><div className={`grade grade-${grade(p.score)}`}>{grade(p.score)}</div><div className="client-info"><b>{p.name}</b><small>{p.email}</small><strong>{p.score||500} pontos · {gradeText(p.score)}</strong></div><div className="score-edit"><input type="number" min="1" max="1000" value={scoreDraft[p.auth_uid]??p.score??500} onChange={e=>setScoreDraft({...scoreDraft,[p.auth_uid]:e.target.value})}/><button onClick={()=>saveScore(p)}>Salvar score</button><button className="danger" onClick={()=>deleteClient(p)}>Excluir cliente</button></div></article>)}</section>}{section==='pagamentos'&&<section className="panel"><small>RECEBIMENTOS</small><h2>Parcelas pendentes</h2><p className="sub">Ao confirmar, o sistema verifica sozinho se está no prazo e atualiza pontos + faixa A/B/C/D/E.</p>{payments.filter(p=>p.status==='PENDENTE').length?payments.filter(p=>p.status==='PENDENTE').map(p=><article className="payment-admin" key={p.id}><div><b>{profileOf(p.auth_uid).name}</b><small>Parcela {p.installment_number}/2 · vence {fmtDate(p.due_date)}</small></div><strong>{brl(p.amount)}</strong><button className="primary small" disabled={busy} onClick={()=>markReceived(p)}>Confirmar recebimento</button></article>):<div className="empty">Nenhuma parcela pendente.</div>}</section>}{section==='regras'&&<section className="panel"><small>REGRAS</small><h2>Configuração objetiva</h2><div className="settings-grid"><label>Crédito mínimo<input type="number" value={settings.min_amount} onChange={e=>setSettings({...settings,min_amount:+e.target.value})}/></label><label>Crédito máximo<input type="number" value={settings.max_amount} onChange={e=>setSettings({...settings,max_amount:+e.target.value})}/></label><label>Juros padrão (%)<input type="number" step="0.01" value={settings.default_interest_rate} onChange={e=>setSettings({...settings,default_interest_rate:+e.target.value})}/></label><label>Prazo do ADM para pagar (horas)<input type="number" min="1" max="168" value={settings.payout_sla_hours} onChange={e=>setSettings({...settings,payout_sla_hours:+e.target.value})}/></label></div><div className="fixed-rule"><b>Pagamento do cliente</b><span>FIXO: 2 parcelas · 1ª em 15 dias · 2ª em 30 dias</span></div><button className="primary" onClick={saveSettings}>Salvar regras</button></section>}</main></Shell>
}

function Deadline({deadline}){const ms=new Date(deadline)-new Date(),hours=Math.max(0,Math.ceil(ms/3600000)),expired=ms<0;return <div className={expired?'deadline-badge expired':'deadline-badge'}><small>{expired?'PRAZO VENCIDO':'TEMPO RESTANTE'}</small><b>{expired?'0h':`${hours}h`}</b><span>{fmtDateTime(deadline)}</span></div>}
