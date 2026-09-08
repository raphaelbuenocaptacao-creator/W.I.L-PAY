import React from 'react';
import AppV3 from './AppV3';

function WhatsAppShareButton(){
  function shareOnWhatsApp(){
    const url=window.location.href;
    const message=`Conheça o W.I.L PAY — crédito direto, simples e digital.\n\nAcesse aqui: ${url}`;
    const shareUrl=`https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(shareUrl,'_blank','noopener,noreferrer');
  }

  return <button
    type="button"
    onClick={shareOnWhatsApp}
    aria-label="Compartilhar W.I.L PAY no WhatsApp"
    title="Compartilhar no WhatsApp"
    style={{
      position:'fixed',
      right:'18px',
      bottom:'84px',
      zIndex:9999,
      border:'0',
      borderRadius:'999px',
      padding:'13px 18px',
      background:'#25D366',
      color:'#fff',
      fontWeight:800,
      fontSize:'14px',
      boxShadow:'0 10px 28px rgba(0,0,0,.28)',
      cursor:'pointer',
      display:'flex',
      alignItems:'center',
      gap:'8px'
    }}
  >
    <span aria-hidden="true" style={{fontSize:'19px'}}>↗</span>
    WhatsApp
  </button>
}

export default function AppV4(){
  return <>
    <AppV3/>
    <WhatsAppShareButton/>
  </>;
}
