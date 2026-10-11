// Personal collections stay on this device; only explicitly selected leisure tasks enter planning.
const KEY='dayglow-life-v1';
const collections={
 goals:{title:'Goals & projects',intro:'A little progress toward the bigger picture.',placeholder:'A goal or project to work toward'},
 notes:{title:'Notes & knowledge',intro:'A home for ideas worth keeping.',placeholder:'Give your note a title',body:true},
 habits:{title:'Routines & habits',intro:'Small things, done consistently.',placeholder:'A routine or habit to build'},
 journal:{title:'Journal',intro:'Make a little room to reflect.',placeholder:'Today’s reflection',body:true},
 finance:{title:'Finance',intro:'A simple record of money in and out.',placeholder:'What was this for?',money:true},
 home:{title:'Trips & travel',intro:'Keep your next little adventure in sight.',placeholder:'Where would you like to go?',date:true}
};
const leisure=[
 {id:'watch',category:'Watch',title:'A little ocean time',description:'Settle into a nature documentary.',icon:'▣',action:'Plan my evening',minutes:45},
 {id:'listen',category:'Listen',title:'Slow Sunday sounds',description:'Make space for an acoustic playlist.',icon:'♫',action:'Plan listening time',minutes:30},
 {id:'read',category:'Read',title:'A chapter, just for you',description:'Spend a little time with your next novel.',icon:'▤',action:'Plan reading time',minutes:30},
 {id:'out',category:'Go out',title:'An evening close to home',description:'An idea for later: a sunset walk and a café.',icon:'☼',action:'Plan an outing',minutes:45}
];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function createLife({toast,onChange,discuss}){
 let data={};try{data=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
 if(typeof data!=='object'||Array.isArray(data))data={};
 for(const key of Object.keys(collections))data[key]=Array.isArray(data[key])?data[key].filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'):[];
 data.saved=Array.isArray(data.saved)?data.saved.filter(x=>leisure.some(l=>l.id===x)):[];
 let view='',filter='All',busy=false;const planned=new Set();
 const section=document.createElement('section');section.id='life-view';section.hidden=true;
 document.querySelector('#workspace-panels').before(section);
 const entertainment=document.querySelector('.downtime');
 function save(){try{localStorage.setItem(KEY,JSON.stringify(data));return true;}catch{toast('Your browser could not save this change. Keep this page open and try again.');return false;}}
 function render(){
  const config=collections[view];if(!config)return;
  const entries=data[view];
  section.innerHTML=`<div class="life-panel card"><div class="life-heading"><h2>${config.title}</h2><p>${config.intro}</p></div>
   ${config.money?`<p class="finance-total">Recorded balance · ${escape(new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(entries.reduce((sum,x)=>sum+(Number(x.amount)||0),0)))}</p><p class="life-caption">Use one currency for all entries.</p>`:''}
   <form id="life-form"><label for="life-title">${config.placeholder}</label><input id="life-title" name="title" required maxlength="160" autocomplete="off">
   ${config.body?'<label for="life-body">'+(view==='journal'?'What’s on your mind?':'Note')+'</label><textarea id="life-body" name="body" rows="4" maxlength="5000" required></textarea>':''}
   ${config.money?'<div class="life-fields"><label>Type<select name="direction"><option value="1">Income</option><option value="-1">Expense</option></select></label><label>Amount<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required></label></div>':''}
   ${config.date?'<label for="life-date">Departure date (optional)</label><input id="life-date" type="date" name="date">':''}
   <button type="submit">${config.body?'Save entry':'Add '+(view==='habits'?'habit':view==='home'?'trip':'entry')}</button></form>
   <div class="life-list" aria-label="Saved entries">${entries.length?entries.map(x=>`<article class="life-entry">
    ${['goals','habits'].includes(view)?`<label class="life-check"><input type="checkbox" data-check="${escape(x.id)}" ${view==='habits'?x.checkedDate===today()?'checked':'':x.done?'checked':''} aria-label="${escape(view==='habits'?'Complete today: '+x.title:'Complete: '+x.title)}"><span>${escape(x.title)}</span></label>`:`<h3>${escape(x.title)}</h3>`}
    ${x.body?`<p class="entry-body">${escape(x.body)}</p>`:''}${config.money?`<p>${Number(x.amount)>0?'+':''}${escape(Number(x.amount).toFixed(2))}</p>`:''}
    <small>${escape(config.date?(x.date||'Date to be decided'):view==='habits'?'Check off each day':x.created||'')}</small>
    <button class="remove-entry" data-remove="${escape(x.id)}" aria-label="Delete ${escape(x.title)}">Delete</button></article>`).join(''):'<p class="empty-state">A fresh start. Add your first entry above.</p>'}</div>
   <p class="life-caption">Saved in this browser. These entries aren’t sent to your Copilot.</p></div>`;
 }
 function renderEntertainment(){
  entertainment.innerHTML=`<div class="leisure-intro"><span class="eyebrow">Life & leisure</span><h2>Something to look forward to.</h2><p>Films, music, books and little adventures.</p></div>
   <div class="leisure-filters" role="group" aria-label="Entertainment categories">${['All','Watch','Listen','Read','Go out'].map(x=>`<button data-filter="${x}" aria-pressed="${filter===x}">${x}</button>`).join('')}</div>
   <div class="recommendations">${leisure.filter(x=>filter==='All'||x.category===filter).map(x=>`<article class="leisure-card"><span class="leisure-category">${x.category}</span><div class="leisure-art"><span aria-hidden="true">${x.icon}</span><h3>${x.title}</h3></div><p>${x.description}</p><small>${x.minutes} minutes · after 6 PM</small><div class="leisure-actions"><button data-leisure-plan="${x.id}" ${busy?'disabled':''} aria-pressed="${planned.has(x.id)}">${planned.has(x.id)?'Remove from my day':x.action}</button><button data-save="${x.id}" aria-pressed="${data.saved.includes(x.id)}">${data.saved.includes(x.id)?'Saved for downtime ✓':'Save for downtime'}</button><button data-discuss="${x.id}">Discuss with Copilot</button></div></article>`).join('')}</div>
   <p class="life-caption">Choose an activity, then select Plan my day to find an evening slot. Saved ideas stay in this browser.</p>`;
 }
 section.addEventListener('submit',e=>{
  e.preventDefault();const form=new FormData(e.target);const title=String(form.get('title')||'').trim();if(!title)return;
  const entry={id:crypto.randomUUID(),title,created:today()};
  if(collections[view].body)entry.body=String(form.get('body')||'').trim();
  if(collections[view].date)entry.date=String(form.get('date')||'');
  if(collections[view].money){entry.amount=Number(form.get('amount'))*Number(form.get('direction'));if(!Number.isFinite(entry.amount)||!entry.amount)return;}
  data[view].unshift(entry);const saved=save();render();if(saved)toast('Saved.');section.querySelector('#life-title').focus();
 });
 section.addEventListener('click',e=>{const button=e.target.closest('[data-remove]');if(!button)return;data[view]=data[view].filter(x=>x.id!==button.dataset.remove);save();render();});
 section.addEventListener('change',e=>{const id=e.target.dataset.check;if(!id)return;const entry=data[view].find(x=>x.id===id);if(view==='habits')entry.checkedDate=e.target.checked?today():null;else entry.done=e.target.checked;save();});
 entertainment.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.discuss){const item=leisure.find(x=>x.id===b.dataset.discuss);discuss(item.title+': '+item.description);}
  if(b.dataset.filter){filter=b.dataset.filter;renderEntertainment();entertainment.querySelector(`[data-filter="${filter}"]`).focus();}
  if(b.dataset.save){const id=b.dataset.save;data.saved=data.saved.includes(id)?data.saved.filter(x=>x!==id):[...data.saved,id];save();renderEntertainment();entertainment.querySelector(`[data-save="${id}"]`).focus();}
  if(b.dataset.leisurePlan&&!busy){const id=b.dataset.leisurePlan;planned.has(id)?planned.delete(id):planned.add(id);onChange();renderEntertainment();entertainment.querySelector(`[data-leisure-plan="${id}"]`).focus();toast(planned.has(id)?'Added to your priorities. Select Plan my day to schedule it.':'Removed from priorities. Replan to update your calendar.');}
 });
 renderEntertainment();
 return {
  show(next){view=next;section.hidden=!collections[view];if(collections[view]){render();if(view==='home')document.querySelector('#workspace-panels').after(section);else document.querySelector('#workspace-panels').before(section);}},
  setBusy(value){busy=value;entertainment.querySelectorAll('[data-leisure-plan]').forEach(b=>b.disabled=value);},
  planningTasks(){return leisure.filter(x=>planned.has(x.id)).map(x=>({id:'leisure-'+x.id,title:x.title,minutes:x.minutes,earliest:1080,deadline:1320,priority:false,meta:'Entertainment · '+x.minutes+' min'}));}
 };
}
