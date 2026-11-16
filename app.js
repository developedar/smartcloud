import { buildModel, dateLabel, fa, normalizeSource, productionDataSource } from './model.js';
const $ = id => document.getElementById(id);
const storageKey = 'hosna-height-source-production-v3';
const embedded = globalThis.HOSNA_EMBEDDED;
let config = {data_url:'./data/measurements.json',demo:false,refresh_seconds:15};
let source = {...config};
let currentModel = null, lastSignature = '', loading = false, noticeTimer;
const palettes = [
  ['#b879e8','#d3adff','#efdcff'],['#62c6ed','#b3edff','#ddf6ff'],
  ['#63cfac','#b8efd8','#dcf7e8'],['#f4cc53','#ffe78f','#fff3c7'],
  ['#f39b6c','#ffd1a9','#ffe4d6'],['#ed82b2','#ffc5df','#ffe3f1']
];
const signed = value => value == null ? '—' : `${value > 0 ? '+' : ''}${fa(Math.round(value*10)/10)}`;
function setText(id, value) {
  const element=$(id);
  if (!element.classList.contains('value')) {element.textContent=value;return;}
  const span=document.createElement('span');
  if(id==='date') {
    for (const part of value.split(/\s+/)) {
      const token=document.createElement('bdi');token.dir='rtl';token.textContent=part;span.append(token);
    }
  } else span.textContent=value;
  element.replaceChildren(span);
}
function fitValues() {
  for(const element of document.querySelectorAll('.value')) {
    element.style.fontSize='';
    const span=element.firstElementChild;
    if(!span || !element.clientWidth || !element.clientHeight)continue;
    const base=parseFloat(getComputedStyle(element).fontSize);
    const style=getComputedStyle(element);
    const width=element.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2;
    const bounds=span.getBoundingClientRect();
    const factor=Math.min(1,width/Math.max(span.scrollWidth,bounds.width,1),(element.clientHeight-2)/Math.max(bounds.height,1));
    if(factor<1)element.style.fontSize=`${Math.max(1,base*factor*.98)}px`;
  }
}
let fitFrame;
function scheduleFit(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(fitValues);}
new ResizeObserver(scheduleFit).observe(document.querySelector('.stage'));
document.fonts.ready.then(scheduleFit);
function notify(message, persistent=false) {
  clearTimeout(noticeTimer); $('notice').textContent=message; $('notice').hidden=false;
  if (!persistent) noticeTimer=setTimeout(() => $('notice').hidden=true,6500);
}
function setStatus(text, type='') { setText('status',text); $('status').className=`status-label ${type}`; }
function drawChart(records) {
  $('chart').replaceChildren(); $('chart-dates').replaceChildren();
  // Match the approved image: newest on left, older to the right, last six records.
  for (const [index,record] of records.slice(0,6).entries()) {
    const [dark,light,label]=palettes[index];
    const column=document.createElement('div'); column.className='bar-column';
    column.style.setProperty('--height',`${record.height_cm/200*100}%`);
    column.style.setProperty('--dark',dark); column.style.setProperty('--light',light);
    column.style.setProperty('--label',label); column.style.setProperty('--delay',`${index*70}ms`);
    const bar=document.createElement('button'); bar.type='button'; bar.className='bar';
    const desc=`${record.label}، قد ${fa(record.height_cm)} سانتی‌متر`;
    bar.title=desc; bar.setAttribute('aria-label',desc);
    bar.addEventListener('click',()=>notify(desc));
    const value=document.createElement('span'); value.className='bar-label'; value.textContent=fa(record.height_cm);
    column.append(bar,value); $('chart').append(column);
    const date=document.createElement('div'); date.className='chart-date';
    const parts=record.label.split(/\s+/);
    date.textContent=parts.length>=3 ? `${parts.slice(0,-1).join(' ')}\n${parts.at(-1)}` : record.label;
    $('chart-dates').append(date);
  }
}
function render(model) {
  currentModel=model;
  setText('latest',fa(model.latest?.height_cm)); setText('girl',fa(model.latest?.height_cm));
  setText('date',model.latest?.label || '—'); setText('recency',model.recency);
  $('recency').classList.toggle('long',model.recency.length>6);
  setText('previous-growth',signed(model.previousGrowth)); setText('total-growth',signed(model.totalGrowth));
  setText('father',fa(model.father)); setText('father-gap',fa(model.fatherGap));
  setText('target',fa(model.goal)); setText('flag-target',fa(model.goal));
  setText('remaining',model.remaining == null ? '—' : `${fa(model.remaining)} سانت`);
  $('progress').setAttribute('aria-valuenow',String(Math.round(model.progress)));
  $('progress').setAttribute('aria-valuetext',`${fa(model.progress)} درصد تا قد ${fa(model.goal)} سانتی‌متر`);
  requestAnimationFrame(()=>$('progress-fill').style.width=`${model.progress}%`);
  $('empty').hidden=model.records.length>0;
  drawChart(model.records);
  scheduleFit();
  setText('history-count',`${fa(model.records.length)} اندازه‌گیری${source.demo?' • داده‌های نمونه':''}`);
  $('history-body').replaceChildren();
  for (const [index,record] of model.records.entries()) {
    const tr=document.createElement('tr');
    const diff=model.records[index+1] ? record.height_cm-model.records[index+1].height_cm : null;
    for (const [i,text] of [record.label,fa(record.height_cm),signed(diff)].entries()) {
      const td=document.createElement('td'); td.textContent=text;
      if (i===2 && diff!=null) { td.dir='ltr'; td.className=diff>=0?'positive':'negative'; }
      tr.append(td);
    }
    $('history-body').append(tr);
  }
}
async function refresh(force=false) {
  if (loading) return;
  loading=true; $('refresh').setAttribute('aria-busy','true');
  if (force || !currentModel) setStatus('در حال دریافت…','loading');
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),10000);
  try {
    let data;
    if (embedded && source.demo) data=embedded.demo;
    else if (embedded && source.data_url==='./data/measurements.json') data=embedded.empty;
    else {
      const path=source.demo?'./data/demo.json':productionDataSource(source.data_url,config,location.href);
      const url=new URL(path,location.href);
      url.searchParams.set('_',String(Date.now()));
      const response=await fetch(url,{cache:'no-store',signal:controller.signal,credentials:'omit'});
      if (!response.ok) throw new Error(`دریافت فایل انجام نشد (${response.status}).`);
      data=await response.json();
    }
    const model=buildModel(data);
    const signature=JSON.stringify(data);
    if (signature!==lastSignature || force) { render(model); lastSignature=signature; }
    else {setText('recency',model.recency);$('recency').classList.toggle('long',model.recency.length>6);scheduleFit();}
    setStatus(source.demo?'داده‌های نمونه':model.records.length?'آخرین ثبت موفق':'منتظر اولین ثبت');
    $('notice').hidden=true;
    setText('source-note',source.demo?'حالت نمونه فعال است؛ این عددها واقعی نیستند.':`منبع فعلی: ${source.data_url}`);
  } catch(error) {
    setStatus('دریافت ناموفق','error');
    notify(`${error.name==='AbortError'?'دریافت داده بیش از حد طول کشید.':error.message}${currentModel?' آخرین داده دریافتی همچنان نمایش داده می‌شود.':''}`,true);
    if (!currentModel) { render(buildModel({measurements:[],next_target:{}})); setText('empty','داده‌ای دریافت نشد؛ از تنظیمات منبع داده را بررسی کن.'); }
  } finally { clearTimeout(timeout); loading=false; $('refresh').setAttribute('aria-busy','false'); }
}
function remember() { try { localStorage.setItem(storageKey,JSON.stringify(source)); } catch {} }
async function changeSource(next) {
  source={...config,...next}; remember(); lastSignature=''; currentModel=null;
  render(buildModel({measurements:[],next_target:{}}));
  $('settings-dialog').close(); await refresh(true);
}
$('settings-button').addEventListener('click',()=>{
  $('data-url').value=/^https?:/.test(source.data_url)?source.data_url:'';
  $('settings-dialog').showModal();
});
$('refresh').addEventListener('click',()=>refresh(true));
$('history-button').addEventListener('click',()=>$('history-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {const input=$('data-url').value.trim();if(!input)throw new Error('آدرس فایل JSON را وارد کن.');await changeSource({data_url:normalizeSource(input),demo:false});}
  catch(error){notify(error.message);}
});
$('demo-button').addEventListener('click',()=>changeSource({demo:true}));
$('empty-button').addEventListener('click',()=>changeSource({data_url:'./data/measurements.json',demo:false}));
try {
  if(embedded)config={...config,...embedded.config};
  else {const response=await fetch('./config.json',{cache:'no-store'}); if(response.ok)config={...config,...await response.json()};}
} catch {}
source={...config};
try {const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&typeof saved.data_url==='string'&&typeof saved.demo==='boolean')source={...config,...saved};} catch {}
await refresh(true);
setInterval(()=>{if(!document.hidden)refresh();},Math.max(10,Number(config.refresh_seconds)||15)*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
