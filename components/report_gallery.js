/* Browser-only report gallery. Data never enter a Streamlit component value.
 * The extractor owns/revokes each object URL. Gallery only displays source pixels.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
let sets=[], selectedPage=null, zoom=1;
function localBlob(url) {
  if (typeof url!=='string' || url.length>2048 || !url.startsWith('blob:')) return false;
  try {return new URL(url).origin===window.location.origin;}catch(_){return false;}
}
function sanitize(raw) {
  if (!Array.isArray(raw) || raw.length>4) throw new Error('Invalid report selection');
  const seen=new Set();
  return raw.map(set=>{
    if (!['OD','OS'].includes(set.eye) || !['first','latest'].includes(set.visit)) throw new Error('Invalid report eye/visit');
    const slot=set.eye+':'+set.visit;
    if (seen.has(slot)) throw new Error('Repeated report eye/visit');
    seen.add(slot);
    if (!Array.isArray(set.pages) || !set.pages.length || set.pages.length>48) throw new Error('Invalid report pages');
    const ids=new Set();
    const pages=set.pages.map(p=>{
      if (!localBlob(p.url) || typeof p.id!=='string' || !/^[a-z0-9-]{1,60}$/i.test(p.id) || ids.has(p.id)) throw new Error('Invalid local report source');
      ids.add(p.id);
      return {id:p.id,url:p.url,kind:['topometric','belin','progression','report'].includes(p.kind)?p.kind:'report',label:String(p.label||'Source report').slice(0,140),map_regions:window.ReportTexture.sanitizeHints(p.map_regions)};
    });
    let surface=null,surface_notice=String(set.surface_notice||'').slice(0,500);
    if(set.surface){try{surface=window.CornealData.validate(set.surface);if(surface.eye!==set.eye||surface.visit!==set.visit)throw new Error('Numerical slot mismatch');}catch(_){surface=null;surface_notice='Numerical data did not pass the current eye/visit contract. Reference geometry is shown.';}}
    return {eye:set.eye,visit:set.visit,source_id:String(set.source_id||'').slice(0,100),note:String(set.note||'').slice(0,600),pages,surface,surface_notice};
  });
}
function current(){const [eye,visit]=$('report-slot').value.split(':');return sets.find(s=>s.eye===eye&&s.visit===visit);}
function closeDialog(){$('report-dialog').hidden=true;$('report-dialog-image').removeAttribute('src');$('report-image-wrap').hidden=false;}
function clear(message='Import a Pentacam ZIP above. Available report pages will appear here automatically after extraction. Manual scalar entry alone contains no map images.') {
  sets=[];selectedPage=null;zoom=1;closeDialog();
  $('report-slot').replaceChildren();$('report-thumbnails').replaceChildren();$('report-image').removeAttribute('src');
  $('report-content').hidden=true;$('report-empty').hidden=false;$('report-empty').textContent=message;
  $('report-title').textContent='';$('report-count').textContent='';$('report-notice').textContent='';window.dispatchEvent(new Event('nkpi:local-maps'));
}
function set(raw,notice='') {
  try {
    const checked=sanitize(raw);
    if (!checked.length){clear(notice||undefined);return;}
    const previous=$('report-slot').value, prior=current(),priorId=selectedPage?.id;
    sets=checked;
    $('report-slot').replaceChildren(...sets.map(s=>{const o=document.createElement('option');o.value=s.eye+':'+s.visit;o.textContent=s.eye+' · '+(s.visit==='first'?'First / only visit':'Later visit');return o;}));
    if ([...$('report-slot').options].some(o=>o.value===previous))$('report-slot').value=previous;
    $('report-content').hidden=false;$('report-empty').hidden=true;
    showSet(prior?.source_id===current()?.source_id?priorId:null);window.dispatchEvent(new Event('nkpi:local-maps'));
  } catch (_) {clear('Report display withheld: the source-page eye, visit or local-image association is invalid. Reimport and verify the selected studies.');}
}
function fit(){zoom=1;$('report-image').style.width='100%';$('report-image-wrap').scrollTop=0;$('report-image-wrap').scrollLeft=0;}
function select(page) {
  selectedPage=page;closeDialog();fit();
  const s=current();$('report-image').src=page.url;$('report-image').alt=s.eye+' '+s.visit+' · '+page.label+' · original report image';
  $('report-title').textContent=s.eye+' · '+(s.visit==='first'?'First / only visit':'Later visit')+' · '+page.label;
  for(const b of $('report-thumbnails').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.page===page.id));
}
function showSet(preferred) {
  const s=current();if(!s)return;
  $('report-count').textContent=s.pages.length+' source page'+(s.pages.length===1?'':'s')+' available';
  $('report-notice').textContent=s.note;
  $('report-thumbnails').replaceChildren(...s.pages.map(p=>{
    const b=document.createElement('button');b.type='button';b.className='report-thumb';b.dataset.page=p.id;b.setAttribute('aria-pressed','false');
    const img=document.createElement('img');img.src=p.url;img.alt=p.label;img.loading='lazy';img.referrerPolicy='no-referrer';
    const label=document.createElement('span');label.textContent=p.label;b.append(img,label);b.addEventListener('click',()=>select(p));return b;
  }));
  // A known map report is a useful first view. Unknown page types stay generic.
  select(s.pages.find(p=>p.id===preferred)||s.pages.find(p=>p.kind==='topometric')||s.pages.find(p=>p.kind==='belin')||s.pages[0]);
}
$('report-slot').addEventListener('change',()=>showSet(null));
$('report-enlarge').addEventListener('click',()=>{if(!selectedPage)return;$('report-dialog-title').textContent=$('report-title').textContent;$('report-dialog-image').src=selectedPage.url;$('report-image-wrap').after($('report-dialog'));$('report-image-wrap').hidden=true;$('report-dialog').hidden=false;$('report-dialog').scrollIntoView({block:'start',behavior:'smooth'});});
$('report-close').addEventListener('click',closeDialog);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('report-dialog').hidden)closeDialog();});
$('report-image').addEventListener('error',()=>{if(selectedPage)$('report-notice').textContent='This source image is no longer available in browser memory or cannot be decoded. Reimport the original ZIP. No replacement image or generated map has been substituted.';});
for(const b of document.querySelectorAll('[data-report-zoom]'))b.addEventListener('click',()=>{if(b.dataset.reportZoom==='fit'){fit();return;}zoom=Math.max(.5,Math.min(4,zoom*Number(b.dataset.reportZoom)));$('report-image').style.width=(zoom*100)+'%';});
function tab(which){const image=which==='report';for(const [name,active]of [['report',image],['surface',!image]]){$(name+'-tab').setAttribute('aria-selected',String(active));$(name+'-tab').tabIndex=active?0:-1;$(name+'-tab').classList.toggle('active',active);$(name+'-panel').hidden=!active;}
  if(!image){const frame=$('cornea-frame');requestAnimationFrame(()=>{try{frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('resize'));}catch(_){}});}
}
for(const name of ['report','surface']){$(name+'-tab').addEventListener('click',()=>tab(name));$(name+'-tab').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'report':e.key==='End'?'surface':name==='report'?'surface':'report';tab(next);$(next+'-tab').focus();}});}
tab('surface');
window.ReportGallery={set,clear,getSets(){return structuredClone(sets);},removeEye(eye){set(sets.filter(s=>s.eye!==eye));},sanitize};
})();
