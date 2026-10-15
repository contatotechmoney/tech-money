const form=document.querySelector('#interest-form');
const feedback=document.querySelector('#form-feedback');
const submit=document.querySelector('#submit-interest');
form.addEventListener('submit',async event=>{
 event.preventDefault();feedback.textContent='';feedback.classList.remove('error');
 if(!form.reportValidity())return;
 const data=new FormData(form);
 submit.disabled=true;submit.textContent='Salvando seu interesse…';
 try{
  const response=await fetch('/api/interesse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:String(data.get('name')||''),email:String(data.get('email')||''),interest:String(data.get('interest')||''),contactConsent:data.get('contactConsent')==='on',marketingOptIn:data.get('marketingOptIn')==='on',website:String(data.get('website')||'')}),signal:AbortSignal.timeout(25000)});
  const result=await response.json();
  if(!response.ok||result.accepted!==true)throw new Error(result.error||'Não foi possível confirmar o cadastro. Tente novamente.');
  feedback.textContent='Seu interesse foi registrado. A Tech Money poderá entrar em contato pelo e-mail informado. Se você já se cadastrou, mantivemos seu registro anterior.';
  form.reset();
 }catch(error){feedback.classList.add('error');feedback.textContent=error.name==='TimeoutError'?'A confirmação demorou mais que o esperado. Seus dados continuam no formulário; tente novamente.':error.message||'Não foi possível salvar agora. Tente novamente.';}
 finally{submit.disabled=false;submit.innerHTML='Registrar meu interesse <span aria-hidden="true">↗</span>';feedback.focus();}
});
