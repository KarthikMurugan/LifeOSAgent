import {dayglowAPI} from './api.js?v=today-calendar-2';
const state={tasks:{work:[],home:[]},completed:new Set(),planned:false,lastPlan:null,busy:false};
const threadId=sessionStorage.getItem('dayglow-thread')||crypto.randomUUID();
sessionStorage.setItem('dayglow-thread',threadId);
const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const now=new Date();
function localDate(){const today=new Date();return [today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-')}
function planningInput(){return {thread_id:threadId,date:localDate(),timezone,completed_ids:[...state.completed]}}
const todaySummary=document.createElement('p');todaySummary.id='today-summary';todaySummary.hidden=true;todaySummary.setAttribute('role','status');
const summaryIcon=document.createElement('span');summaryIcon.setAttribute('aria-hidden','true');
const summaryText=document.createElement('span');todaySummary.append(summaryIcon,summaryText);
document.querySelector('#workspace-panels').before(todaySummary);
function updateTodaySummary(plan){
 const count=plan.blocks.length;const conflicts=plan.conflicts||[];const deferred=plan.deferred||[];
 summaryIcon.textContent=conflicts.length?'⚠':'✓';
 summaryText.textContent=`${count} ${count===1?'task':'tasks'} planned around your commitments.`;
 if(conflicts.length)summaryText.textContent+=' '+conflicts.map(c=>c.description).join(' ');
 if(deferred.length)summaryText.textContent+=` ${deferred.length} ${deferred.length===1?'task needs':'tasks need'} another time slot.`;
}
export const agentService={
 async planDay(){return dayglowAPI.plan(planningInput())},
 async chat(text){return dayglowAPI.chat({...planningInput(),message:text})}
};
function setBusy(busy,planning=false){
 state.busy=busy;
 const button=document.querySelector('#plan');button.disabled=busy;button.setAttribute('aria-busy',String(busy));
 button.textContent=busy?(planning?'✳  Planning your day…':'✳  Working with your copilot…'):(state.planned?'✳  Replan my day':'✳  Plan my day');
 document.querySelector('#chat').setAttribute('aria-busy',String(busy));
 document.querySelectorAll('#chat button,#prompt,[data-prompt],input[data-id]').forEach(el=>el.disabled=busy);
 document.querySelector('.assistant .online').textContent=busy?'● Thinking…':'● Ready';
}
function applyPlan(plan){
 if(!plan||!Array.isArray(plan.blocks)||!Array.isArray(plan.calendar)||!Array.isArray(plan.activity))throw new Error('The agent returned an incomplete plan. Please try again.');
 const firstPlan=!state.planned;
 state.planned=true;state.lastPlan=plan;
 updateTodaySummary(plan);
 document.querySelector('#insight').textContent=plan.summary;
 renderSchedule([...plan.calendar,...plan.blocks]);
 document.querySelector('#activity').replaceChildren();
 for(const step of plan.activity)activity(step.title,step.detail);
 selectView(document.body.dataset.view||'all',false);
 if(firstPlan&&document.body.dataset.view==='all'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  document.querySelector('#workspace-panels').animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});
 }
}
function failureText(error){return error.name==='TimeoutError'?'The local model took too long. It may still finish on the backend; reload to check the saved plan before trying again.':error.message}
function clock(minutes){return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')}
function renderSchedule(events){
 const box=document.querySelector('#schedule');box.replaceChildren();
 for(const item of [...events].sort((a,b)=>a.start-b.start)){
  const row=document.createElement('div');row.className='slot';
  const time=document.createElement('time');time.textContent=clock(item.start);
  const event=document.createElement('div');event.className='event '+(item.kind==='calendar'?'blue-event':item.kind==='break'?'break-event':'focus-event');
  const content=document.createElement('div');const title=document.createElement('b');title.textContent=item.title;
  const detail=document.createElement('small');detail.textContent=clock(item.start)+'–'+clock(item.end)+' · '+(item.kind==='calendar'?'Calendar':item.kind==='break'?'Break':item.kind==='home'?'Home task':'Work task');
  content.append(title,detail);event.append(content);row.append(time,event);box.append(row);
 }
}
async function loadContext(){
 setBusy(true);
 try{
  const [work,home,calendar]=await Promise.all(['work','home','calendar'].map(source=>dayglowAPI.context(source)));
  state.tasks={work:work.items,home:home.items};renderTasks();renderSchedule(calendar.items);
  document.querySelector('#activity').replaceChildren();activity('Ready to plan','Calendar, work and home data loaded from the backend');
  document.querySelector('.sync').textContent='Sample data · connected';
  document.querySelector('.date-chip').textContent=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(now);
  document.querySelector('.calendar .card-head .muted').textContent=timezone.replaceAll('_',' ');
  try{
   const saved=await dayglowAPI.saved(threadId);
   if(saved.request.date===localDate()){
    state.completed=new Set(saved.request.completed_ids);renderTasks();
    applyPlan({...saved,calendar:saved.context.calendar});
    message(saved.summary);
   }
  }catch(error){if(error.status!==404)toast('Previous plan could not be restored. You can plan again.');}
 }catch(error){toast('Start the Dayglow backend to load your tasks.');document.querySelector('#insight').textContent='Service unavailable. Start the FastAPI backend and reload.';}
 finally{setBusy(false);}
}
let toastTimer;function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500)}
function renderTasks(){
 for(const group of ['work','home']){
  const box=document.querySelector('#'+group+'-tasks');box.replaceChildren();
  for(const task of state.tasks[group]){
   const label=document.createElement('label');label.className='task '+(state.completed.has(task.id)?'done':'');
   const input=document.createElement('input');input.type='checkbox';input.dataset.id=task.id;input.checked=state.completed.has(task.id);input.disabled=state.busy;
   const content=document.createElement('div');const title=document.createElement('b');title.textContent=task.title;
   const meta=document.createElement('small');meta.className=task.priority?'priority':'';meta.textContent=task.meta;
   content.append(title,meta);label.append(input,content);box.append(label);
  }
 }
 document.querySelector('[data-view=all] small').textContent=String([...state.tasks.work,...state.tasks.home].filter(t=>!state.completed.has(t.id)).length);
}
function message(text,role='bot'){const el=document.createElement('div');el.className='message '+role;el.textContent=text;const small=document.createElement('small');small.textContent=(role==='bot'?'Dayglow':'You')+' · just now';el.append(small);const box=document.querySelector('#messages');box.append(el);box.scrollTop=box.scrollHeight}
function activity(title,detail){const item=document.createElement('div');item.className='activity-item';const icon=document.createElement('span');icon.textContent='✓';const content=document.createElement('div');const b=document.createElement('b');b.textContent=title;const p=document.createElement('p');p.textContent=detail;const small=document.createElement('small');small.textContent='Just now';content.append(b,p,small);item.append(icon,content);document.querySelector('#activity').prepend(item)}
async function planDay(){
 if(state.busy)throw new Error('Your copilot is already working.');
 setBusy(true,true);
 try{
  const response=await agentService.planDay();applyPlan(response.plan);message(response.reply||response.plan.summary);
  selectView('all');
  if(matchMedia('(max-width: 760px)').matches)requestAnimationFrame(()=>todaySummary.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));
  return response.plan;
 }catch(error){message('Unable to plan your day. '+failureText(error));toast('Could not complete the plan. Check Ollama and try again.');throw error;}
 finally{setBusy(false);}
}
async function send(text){
 if(state.busy){toast('Your copilot is still working. Please wait.');return;}
 message(text,'user');setBusy(true);
 try{
  const response=await agentService.chat(text);
  if(response.plan)applyPlan(response.plan);
  message(response.reply||response.plan?.summary||'Your copilot returned an empty response. Please try again.');
  return response;
 }catch(error){message('Unable to reach your copilot. '+failureText(error));toast('Check Ollama and try again.');}
 finally{setBusy(false);}
}
document.querySelector('#plan').addEventListener('click',()=>planDay().catch(()=>{}));document.addEventListener('change',e=>{if(e.target.matches('[data-id]')){e.target.checked?state.completed.add(e.target.dataset.id):state.completed.delete(e.target.dataset.id);renderTasks();toast(e.target.checked?'One less thing on your mind.':'Task moved back to your priorities.')}});document.querySelector('#chat').addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#prompt');const value=input.value.trim();if(value){send(value);input.value=''}});document.querySelectorAll('[data-prompt]').forEach(btn=>btn.addEventListener('click',()=>send(btn.dataset.prompt)));document.querySelectorAll('[data-rec]').forEach(btn=>btn.addEventListener('click',()=>{message(btn.dataset.rec);activity('Downtime suggestion selected',btn.querySelector('b').textContent);toast('Added to your copilot conversation.')}));const titles={all:'Today, in balance.',calendar:'Make time for what matters.',work:'Your work, in focus.',home:'A little order at home.',entertainment:'Make room for you.',copilot:'Your copilot.'};
function selectView(view,updateHash=true){
 document.body.dataset.view=view;
 document.body.dataset.planned=String(state.planned);
 todaySummary.hidden=view!=='all'||!state.planned;
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')});
 document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===view;b.classList.toggle('selected',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 document.querySelectorAll('[data-section]').forEach(s=>s.hidden=view==='all'?(s.dataset.section!=='calendar'||!state.planned):s.dataset.section!==view);
 document.querySelector('.task-grid').hidden=!['work','home'].includes(view);
 document.querySelector('.dashboard').hidden=view==='entertainment'||(view==='all'&&!state.planned);
 document.querySelector('.right-column').hidden=view!=='copilot';
 document.querySelector('.downtime').hidden=view!=='entertainment';
 document.querySelector('.calendar .card-head h2').textContent=view==='all'?'Your day at a glance':'Schedule';
 document.querySelector('#workspace-panels').setAttribute('aria-label',view==='all'?'Today':view[0].toUpperCase()+view.slice(1));
 document.querySelector('#view-title').textContent=titles[view];
 document.querySelector('.topbar>div:first-child').lastChild.textContent=view==='all'?'Today':view[0].toUpperCase()+view.slice(1);
 if(updateHash)history.replaceState(null,'','#'+(view==='all'?'today':view));
}
document.querySelectorAll('[data-view],[data-tab]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.tab||b.dataset.view)));
const initial=location.hash.slice(1);selectView(Object.hasOwn(titles,initial)?initial:'all',false);
renderTasks();
renderSchedule([]);document.querySelector('#activity').replaceChildren();
loadContext();
const dateLabel=document.querySelector('.greeting .eyebrow');if(dateLabel)dateLabel.textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(new Date()).toUpperCase();
if(navigator.modelContext){navigator.modelContext.registerTool({name:'plan_day',description:'Prepare a daily plan using the Ollama agent and FastAPI LangGraph planner.',inputSchema:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:JSON.stringify(await planDay())}]})});}
