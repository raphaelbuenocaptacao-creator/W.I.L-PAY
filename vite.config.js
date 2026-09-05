import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const wilPayEnhancements={
  name:'wil-pay-enhancements',
  enforce:'pre',
  transform(code,id){
    if(id.includes('/src/App.jsx')||id.includes('\\src\\App.jsx')){
      return code.replace(/const ADMIN_EMAIL='[^']+';/,"const ADMIN_EMAIL='admin@wilpay.com.br';");
    }
    if(id.includes('/src/AppV3.jsx')||id.includes('\\src\\AppV3.jsx')){
      return code.replace(
        '<i><em style={{width:`${progress}%`}}/></div><section className="panel wallet-table-wrap">',
        '<i><em style={{width:`${progress}%`}}/></i></div><section className="panel wallet-table-wrap">'
      );
    }
    if(!(id.includes('/src/AppV2.jsx')||id.includes('\\src\\AppV2.jsx')))return null;
    let out=code;

    out=out.replace(
      "COMPROVANTE_PAGAMENTO:'Comprovante da liberação'",
      "COMPROVANTE_PAGAMENTO:'Comprovante da liberação',GARANTIA_FOTO_1:'Garantia · foto 1',GARANTIA_FOTO_2:'Garantia · foto 2',GARANTIA_FOTO_3:'Garantia · foto 3'"
    );

    out=out.replace(
      "const[files,setFiles]=useState({documento:null,residencia:null,selfie:null});",
      "const[files,setFiles]=useState({documento:null,residencia:null,selfie:null});const[collateral,setCollateral]=useState({description:'',value:'',photo1:null,photo2:null,photo3:null});const collateralRequired=Number(a.amount)>1000;"
    );

    out=out.replace(
      "async function captureLocation(){",
      "function readCollateral(key,file){setFileError('');if(!file)return;if(file.size>3*1024*1024){setFileError('Cada foto da garantia deve ter no máximo 3 MB.');return}if(!['image/jpeg','image/png'].includes(file.type)){setFileError('As fotos da garantia devem ser JPG ou PNG.');return}const reader=new FileReader();reader.onload=()=>setCollateral(x=>({...x,[key]:{name:file.name,type:file.type,size:file.size,data_url:reader.result}}));reader.readAsDataURL(file)}async function captureLocation(){"
    );

    out=out.replace(
      "if(!locationAccepted||!locationPoint){setFileError('Autorize e confirme sua localização antes de pedir análise.');return}",
      "if(collateralRequired&&(!collateral.description.trim()||!Number(collateral.value)||!collateral.photo1||!collateral.photo2||!collateral.photo3)){setFileError('Acima de R$ 1.000 é obrigatório informar a garantia, o valor estimado e enviar 3 fotos.');return}if(!locationAccepted||!locationPoint){setFileError('Autorize e confirme sua localização antes de pedir análise.');return}"
    );

    out=out.replace(
      "answers:a,location_required:true",
      "answers:a,location_required:true,collateral_required:collateralRequired,collateral_description:collateralRequired?collateral.description:'',collateral_declared_value:collateralRequired?Number(collateral.value||0):0"
    );

    out=out.replace(
      "for(const[key,doc]of Object.entries(files))await neon.from('wilpay_documents').insert({auth_uid:authUser.id,loan_id:loan.id,doc_type:key==='documento'?'DOCUMENTO_FOTO':key==='residencia'?'COMPROVANTE_RESIDENCIA':'SELFIE_DOCUMENTO',file_name:doc.name,mime_type:doc.type,size:doc.size,data_url:doc.data_url,created_at:now}).select();",
      "for(const[key,doc]of Object.entries(files))await neon.from('wilpay_documents').insert({auth_uid:authUser.id,loan_id:loan.id,doc_type:key==='documento'?'DOCUMENTO_FOTO':key==='residencia'?'COMPROVANTE_RESIDENCIA':'SELFIE_DOCUMENTO',file_name:doc.name,mime_type:doc.type,size:doc.size,data_url:doc.data_url,created_at:now}).select();if(collateralRequired){for(const[key,doc]of [['GARANTIA_FOTO_1',collateral.photo1],['GARANTIA_FOTO_2',collateral.photo2],['GARANTIA_FOTO_3',collateral.photo3]])await neon.from('wilpay_documents').insert({auth_uid:authUser.id,loan_id:loan.id,doc_type:key,file_name:doc.name,mime_type:doc.type,size:doc.size,data_url:doc.data_url,created_at:now}).select();}"
    );

    out=out.replace(
      "onClick={()=>setStage('location')}>Continuar para localização",
      "onClick={()=>setStage(collateralRequired?'collateral':'location')}>Continuar"
    );

    out=out.replace(
      "return <section className=\"wizard\"><small>LOCALIZAÇÃO OBRIGATÓRIA</small>",
      "if(stage==='collateral')return <section className=\"wizard collateral-step\"><small>GARANTIA OBRIGATÓRIA</small><h2>Pedido acima de R$ 1.000.</h2><p>Para esse valor, envie 3 fotos da garantia. O administrador avaliará a garantia e definirá o valor que poderá ser liberado.</p><label className=\"field\">Descrição da garantia<input placeholder=\"Ex.: notebook, celular, TV...\" value={collateral.description} onChange={e=>setCollateral({...collateral,description:e.target.value})}/></label><label className=\"field\">Valor estimado da garantia<input type=\"number\" min=\"1\" placeholder=\"Ex.: 2500\" value={collateral.value} onChange={e=>setCollateral({...collateral,value:e.target.value})}/></label><div className=\"doc-grid\"><DocUpload title=\"Foto 1 da garantia\" hint=\"Frente / visão geral\" file={collateral.photo1} onFile={f=>readCollateral('photo1',f)}/><DocUpload title=\"Foto 2 da garantia\" hint=\"Lateral / detalhes\" file={collateral.photo2} onFile={f=>readCollateral('photo2',f)}/><DocUpload title=\"Foto 3 da garantia\" hint=\"Outra visão / identificação\" file={collateral.photo3} onFile={f=>readCollateral('photo3',f)}/></div><div className=\"guarantee-warning\"><b>Importante</b><span>O crédito só poderá ser liberado depois que a garantia estiver fisicamente nas mãos do administrador.</span></div>{fileError&&<div className=\"error\">{fileError}</div>}<div className=\"wizard-actions\"><button className=\"secondary\" onClick={()=>setStage('documents')}>Voltar</button><button className=\"primary\" disabled={!collateral.description.trim()||!Number(collateral.value)||!collateral.photo1||!collateral.photo2||!collateral.photo3} onClick={()=>setStage('location')}>Continuar para localização</button></div></section>;return <section className=\"wizard\"><small>LOCALIZAÇÃO OBRIGATÓRIA</small>"
    );

    out=out.replace(
      "<button className=\"secondary\" onClick={()=>setStage('documents')}>Voltar</button><button className=\"primary\" disabled={busy||!locationPoint}",
      "<button className=\"secondary\" onClick={()=>setStage(collateralRequired?'collateral':'documents')}>Voltar</button><button className=\"primary\" disabled={busy||!locationPoint}"
    );

    out=out.replace(
      "async function approve(l){setBusy(true);const r=await neon.from('wilpay_loans').update({status:'APROVADO_AGUARDANDO_PIX',approved_at:new Date().toISOString(),interest_rate:Number(settings.default_interest_rate||12),repayment_type:'2X_QUINZENAL',installment_count:2,term_days:15}).eq('id',l.id).select();if(!r.error)setNotice('Aprovado. O cliente já pode informar o PIX.');setSelected(null);await load();setBusy(false)}",
      "async function approve(l){let approved=Number(l.principal||0);if(l.collateral_required){const typed=prompt(`Valor solicitado: ${brl(l.principal)}\\nGarantia informada: ${brl(l.collateral_declared_value)}\\nDigite o valor que você deseja liberar:`,String(l.principal||''));if(typed===null)return;approved=clamp(Number(String(typed).replace(/[^0-9.,]/g,'').replace(',','.')),100,Number(l.principal||0));if(!approved){setNotice('Informe um valor válido para aprovação.');return}}setBusy(true);const r=await neon.from('wilpay_loans').update({principal:approved,approved_principal:approved,status:'APROVADO_AGUARDANDO_PIX',approved_at:new Date().toISOString(),interest_rate:Number(settings.default_interest_rate||12),repayment_type:'2X_QUINZENAL',installment_count:2,term_days:15}).eq('id',l.id).select();if(!r.error)setNotice(l.collateral_required?`Aprovado em ${brl(approved)}. Aguarde o PIX e receba a garantia em mãos antes de liberar.`:'Aprovado. O cliente já pode informar o PIX.');setSelected(null);await load();setBusy(false)}async function receiveCollateral(l){if(!confirm('Confirma que a garantia física já está em suas mãos?'))return;setBusy(true);const r=await neon.from('wilpay_loans').update({collateral_received_at:new Date().toISOString(),collateral_received_by:ADMIN_EMAIL}).eq('id',l.id).select();setNotice(r.error?r.error.message:'Garantia recebida em mãos. A liberação financeira está habilitada.');await load();setBusy(false)}"
    );

    out=out.replace(
      "async function confirmPayout(l){const file=receipt[l.id];",
      "async function confirmPayout(l){if(l.collateral_required&&!l.collateral_received_at){setNotice('Para valores acima de R$ 1.000, receba a garantia em mãos antes de liberar o dinheiro.');return}const file=receipt[l.id];"
    );

    out=out.replace(
      "<label className=\"receipt-upload\">Comprovante da transferência",
      "{l.collateral_required&&<div className={l.collateral_received_at?'guarantee-status ok':'guarantee-status'}><small>GARANTIA FÍSICA</small><b>{l.collateral_received_at?'✓ Recebida em mãos':'Aguardando entrega ao administrador'}</b><span>{l.collateral_description} · valor informado {brl(l.collateral_declared_value)}</span>{!l.collateral_received_at&&<button className=\"secondary\" onClick={()=>receiveCollateral(l)}>Confirmar garantia recebida em mãos</button>}</div>}<label className=\"receipt-upload\">Comprovante da transferência"
    );

    out=out.replace(
      "disabled={busy||!receipt[l.id]} onClick={()=>confirmPayout(l)}",
      "disabled={busy||!receipt[l.id]||(l.collateral_required&&!l.collateral_received_at)} onClick={()=>confirmPayout(l)}"
    );

    out=out.replace(
      "<h3>Documentos</h3><div className=\"doc-preview-grid\">",
      "{loan.collateral_required&&<><h3>Garantia</h3><div className=\"guarantee-summary\"><span><small>Descrição</small><b>{loan.collateral_description||'—'}</b></span><span><small>Valor informado</small><b>{brl(loan.collateral_declared_value)}</b></span><span><small>Status físico</small><b>{loan.collateral_received_at?'Recebida em mãos':'Ainda não recebida'}</b></span></div></>}<h3>Documentos e fotos</h3><div className=\"doc-preview-grid\">"
    );

    return out;
  }
};

export default defineConfig({plugins:[wilPayEnhancements,react()],base:'./'});
