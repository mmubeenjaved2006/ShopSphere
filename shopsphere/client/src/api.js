export const API=import.meta.env.VITE_API_URL||'http://localhost:5000/api';
export async function api(path,options={}){const response=await fetch(API+path,{credentials:'include',headers:{'Content-Type':'application/json',...options.headers},...options,body:options.body&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||`Request failed (${response.status})`);return data;}
export const money=n=>'PKR '+Number(n||0).toLocaleString('en-PK');
