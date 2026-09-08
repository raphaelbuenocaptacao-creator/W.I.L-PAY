import React,{useState}from'react';
import{openWilpayAttachmentForCurrentSession}from'../lib/wilpayAttachmentViewerSession.js';

export default function WilpayAttachmentLink({record,children='Abrir documento',className=''}){
  const[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function open(e){
    e.preventDefault();
    if(!record||busy)return;
    setBusy(true);setError('');
    try{await openWilpayAttachmentForCurrentSession(record)}catch(err){setError(err?.message||'Não foi possível abrir este arquivo.')}finally{setBusy(false)}
  }
  return <span className="wilpay-attachment-link-wrap"><button type="button" className={className||'link-btn'} disabled={busy||!record} onClick={open}>{busy?'Abrindo...':children}</button>{error&&<small role="alert" className="error">{error}</small>}</span>;
}
