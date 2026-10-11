// Personal entries stay in this browser. Only explicitly added movement tasks
// leave this module through planningTasks(), never sleep, mood or reflections.
const KEY='dayglow-wellness-v1';
const WALK_ID='wellness-walk';
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function createWellness({navigate,onChange,toast}) {
 let records={};let added=false,busy=false,tab='Overview';
 try{const parsed=JSON.parse(localStorage.getItem(KEY)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))records=parsed;}catch{}
 function entry(){const r=records[day()];return r&&typeof r==='object'?r:{}}
 const section=document.createElement('section');section.id='wellness-view';section.hidden=true;
 document.querySelector('#workspace-panels').before(section);
 function persist(patch){records[day()]={...entry(),...patch};try{localStorage.setItem(KEY,JSON.stringify(records));return true;}catch{toast('This browser could not save your entry. Please check available storage.');return false;}}
 function walkMarkup(){return `<div class="wellness-row"><div><span class="wellness-caption">Movement · Today</span><h2>A little fresh air.</h2><p>Take a 20-minute walk.</p></div><div class="wellness-actions"><button type="button" data-wellness="add" ${busy||added||entry().walkDone?'disabled':''}>${added?'Added to my day':'Add to my day'}</button><button type="button" data-wellness="done" ${busy?'disabled':''}>${entry().walkDone?'Undo completion':'Done'}</button></div></div><p class="wellness-status" data-walk-status role="status"></p>`;}
 function render(){
 section.innerHTML=`<div class="wellness-tabs" role="group" aria-label="Wellness areas">${['Overview','Movement','Rest','Mind','Nutrition','Care'].map(t=>`<button type="button" data-area="${t}" aria-pressed="${tab===t}">${t}</button>`).join('')}</div><div class="wellness-content"></div><p class="wellness-privacy">Sleep, mood and reflection entries are saved in this browser only and are not sent to Copilot. Anyone using this browser profile may access them.</p><button type="button" class="wellness-link" data-wellness="clear">Delete wellness entries from this browser</button><p class="wellness-status" id="wellness-feedback" role="status"></p>`;
 const content=section.querySelector('.wellness-content');
 if(['Overview','Movement'].includes(tab))content.insertAdjacentHTML('beforeend',`<div class="card wellness-panel">${walkMarkup()}<p class="wellness-caption">Adding a walk includes it in your next plan. Existing commitments stay fixed.</p></div>`);
 if(['Overview','Rest'].includes(tab))content.insertAdjacentHTML('beforeend',`<div class="card wellness-panel"><h2>Rest & recovery</h2><p>Notice your rhythm, at your pace.</p><form data-wellness-form="sleep"><label for="sleep-hours">Last night’s sleep, in hours</label><div class="wellness-field"><input id="sleep-hours" name="hours" type="number" min="0" max="24" step="0.25" required><button type="submit">Save sleep</button></div></form><p class="wellness-status" data-sleep-status role="status"></p></div>`);
 if(['Overview','Mind'].includes(tab))content.insertAdjacentHTML('beforeend',`<div class="card wellness-panel"><h2>How are you feeling?</h2><p>An optional moment to check in.</p><form data-wellness-form="mind"><label for="wellness-mood">Mood</label><select id="wellness-mood" name="mood"><option value="">Choose a mood (optional)</option>${['Low','Flat','Okay','Good','Great'].map(m=>`<option>${m}</option>`).join('')}</select><label for="wellness-reflection">What helped you feel grounded today?</label><textarea id="wellness-reflection" name="reflection" maxlength="2000" rows="3" placeholder="A small moment I appreciated…"></textarea><button type="submit">Save check-in</button></form><p class="wellness-status" data-mind-status role="status"></p></div>`);
 if(tab==='Nutrition')content.innerHTML=`<div class="card wellness-panel"><h2>Small everyday routines</h2><label class="wellness-check"><input type="checkbox" data-record="water">Bring water on my walk</label><label class="wellness-check"><input type="checkbox" data-record="meal">Plan a meal for today</label><p>Keep grocery shopping with your existing home tasks.</p><button type="button" data-wellness="home">Open Home tasks</button></div>`;
 if(tab==='Care')content.innerHTML=`<div class="card wellness-panel"><h2>Care, without the mental clutter.</h2><p>Your dentist booking is already in Home. Manage it there to keep one shared task.</p><button type="button" data-wellness="home">View care & home tasks</button></div>`;
 const r=entry();for(const el of [section])el.querySelectorAll('[data-walk-status]').forEach(p=>p.textContent=r.walkDone?'Walk completed for today.':added?'Walk added. Select Plan my day to schedule it.':'');
 const sleep=section.querySelector('#sleep-hours');if(sleep){sleep.value=Number.isFinite(r.sleep)?r.sleep:'';section.querySelector('[data-sleep-status]').textContent=Number.isFinite(r.sleep)?`Saved: ${r.sleep} hours for last night.`:'';}
 const mood=section.querySelector('#wellness-mood');if(mood){mood.value=['Low','Flat','Okay','Good','Great'].includes(r.mood)?r.mood:'';section.querySelector('#wellness-reflection').value=typeof r.reflection==='string'?r.reflection:'';section.querySelector('[data-mind-status]').textContent=r.mindSaved?'Check-in saved in this browser.':'';}
 section.querySelectorAll('[data-record]').forEach(el=>el.checked=r[el.dataset.record]===true);
 }
 function feedback(text){section.querySelector('#wellness-feedback').textContent=text;}
 for(const host of [section]){
 host.addEventListener('click',e=>{const area=e.target.closest('[data-area]');if(area){tab=area.dataset.area;render();return;}const b=e.target.closest('[data-wellness]');if(!b)return;switch(b.dataset.wellness){case 'open':navigate('wellness');break;case 'home':navigate('home');break;case 'add':if(busy)return;added=true;onChange();render();toast('Walk added. Plan your day to find a time for it.');break;case 'done':if(busy)return;if(persist({walkDone:!entry().walkDone})){onChange();render();toast('Walk updated. Replan to update your calendar.');}break;case 'clear':try{localStorage.removeItem(KEY);records={};onChange();render();feedback('Wellness entries deleted from this browser.');}catch{feedback('Unable to delete entries. Please check your browser settings.');}break;}});
 host.addEventListener('submit',e=>{e.preventDefault();const f=e.target;if(!f.reportValidity())return;if(f.dataset.wellnessForm==='sleep'){const hours=Number(f.elements.hours.value);if(!Number.isFinite(hours)||hours<0||hours>24)return;if(persist({sleep:hours}))render();}else if(f.dataset.wellnessForm==='mind'){if(persist({mood:f.elements.mood.value,reflection:f.elements.reflection.value.trim(),mindSaved:true}))render();}});
 host.addEventListener('change',e=>{if(e.target.matches('[data-record]'))persist({[e.target.dataset.record]:e.target.checked});});
 }
 render();return {
 show(view){section.hidden=view!=='wellness';},
 setBusy(value){busy=value;for(const host of [section])host.querySelectorAll('[data-wellness=add],[data-wellness=done]').forEach(b=>b.disabled=busy||(b.dataset.wellness==='add'&&(added||entry().walkDone)));},
 planningTasks(){return added?[{id:WALK_ID,title:'Take a 20-minute walk',minutes:20,priority:false,earliest:540,deadline:1080,meta:'Wellness · 20 min'}]:[];},
 completedIds(){return entry().walkDone?[WALK_ID]:[];},
 };
}
