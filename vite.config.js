import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const wilPayAdminIdentity={
  name:'wil-pay-admin-identity',
  enforce:'pre',
  transform(code,id){
    if(id.includes('/src/App.jsx')||id.includes('\\src\\App.jsx')){
      return code.replace(/const ADMIN_EMAIL='[^']+';/,"const ADMIN_EMAIL='admin@wilpay.com.br';");
    }
    return null;
  }
};

export default defineConfig({plugins:[wilPayAdminIdentity,react()],base:'./'});
