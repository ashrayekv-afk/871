/* Shared, numeric-only interface contract. No names, filenames, DOB or report pixels. */
(function(root){'use strict';
const F=[
{key:'A',label:'A · ARC',name:'Anterior radius',unit:'mm',decimals:2,low:2.5,high:12.5},
{key:'B',label:'B · PRC',name:'Posterior radius',unit:'mm',decimals:2,low:2.5,high:12.5},
{key:'C',label:'C · Thinnest',name:'Minimum pachymetry',unit:'µm',decimals:0,low:200,high:800},
{key:'Kmax',label:'Kmax',name:'Maximum keratometry',unit:'D',decimals:1,low:20,high:100},
{key:'BAD_D',label:'BAD-D',name:'Belin–Ambrósio deviation',unit:'',decimals:2,low:-5,high:60},
{key:'ARTmax',label:'ARTmax',name:'Relational thickness',unit:'',decimals:1,low:1,high:1000}];
const finite=v=>typeof v!=='boolean'&&v!==null&&v!==undefined&&['string','number'].includes(typeof v)&&String(v).trim()!==''&&Number.isFinite(Number(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function blank(eye){return {eye,enabled:eye==='OD',mode:'baseline',age:'',first:{},latest:{},interval_days:'',scan_quality:{first:'unknown',latest:'unknown'},treatment:'unknown',verified:false,landmarks:{},context:{},history:[],demo:false};}
function imported(p){const clean=root.NKPIImport.sanitize(p),paired=clean.mode==='longitudinal',scans=paired?clean.baseline:clean.eyes;return Object.keys(scans).map(eye=>{const meta=clean.display_by_eye?.[eye]||{};return {...blank(eye),enabled:true,mode:clean.mode,age:clean.age,first:scans[eye],latest:paired?clean.followup[eye]:{},interval_days:paired?clean.interval_days_by_eye[eye]:'',scan_quality:{first:meta.first_quality||'unknown',latest:meta.latest_quality||'unknown'},landmarks:meta.landmarks||{},history:meta.history||[],verified:true};});}
function payload(c){return {eye:c.eye,mode:c.mode,age:c.age,first:Object.fromEntries(F.map(f=>[f.key,c.first[f.key]??''])),latest:c.mode==='longitudinal'?Object.fromEntries(F.map(f=>[f.key,c.latest[f.key]??''])):null,interval_days:c.mode==='longitudinal'?c.interval_days:null,scan_quality:c.scan_quality,treatment:c.treatment,verified:c.verified,landmarks:c.landmarks,context:c.context,history:c.history||[],demo:c.demo};}
const api={features:F,finite,esc,blank,imported,payload};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NKPI=api;
})(typeof window!=='undefined'?window:globalThis);

/* Independently verify model rows/explanations against the current submitted snapshot. */
(function(root){'use strict';
const S = typeof module!=='undefined'&&module.exports ? module.exports : root.NKPI;
function stable(o){if(Array.isArray(o))return '['+o.map(stable).join(',')+']';if(o&&typeof o==='object')return '{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+stable(o[k])).join(',')+'}';return JSON.stringify(o);}
const numeric = v=>S.finite(v)?Number(v):null;
function canonical(c){const paired=c.mode==='longitudinal',values=v=>Object.fromEntries(S.features.map(f=>[f.key,numeric(v?.[f.key])])),q=c.scan_quality||{},quality=v=>['ok','warning','unknown'].includes(q[v])?q[v]:'unknown';let coords=null;const keys=['thin_x','thin_y','kmax_x','kmax_y'];if(c.landmarks?.verified===true&&keys.every(k=>S.finite(c.landmarks[k])&&Math.abs(Number(c.landmarks[k]))<=6))coords=Object.fromEntries(keys.map(k=>[k,Number(c.landmarks[k])]));return {eye:c.eye,mode:c.mode,age:numeric(c.age),first:values(c.first),latest:paired?values(c.latest):null,interval_days:paired&&S.finite(c.interval_days)&&Number(c.interval_days)>=1&&Number(c.interval_days)<=36525&&Number.isInteger(Number(c.interval_days))?Number(c.interval_days):null,scan_quality:Object.fromEntries((paired?['first','latest']:['first']).map(v=>[v,quality(v)])),verified:c.verified===true,treatment:['untreated','treated','unknown'].includes(c.treatment)?c.treatment:'unknown',context:Object.fromEntries(['lenses','rubbing','vision'].map(k=>[k,c.context?.[k]===true])),demo:c.demo===true,landmarks:coords,history:paired?history(c.history,c.eye,numeric(c.interval_days)):[]};}
function history(raw,eye,days){
 if(raw==null)return [];
 if(!Array.isArray(raw)||raw.length>40)throw new Error('Invalid additional history');
 const rows=raw.map(r=>{
  if(!r||r.eye!==eye||r.verified!==true||r.quality!=='ok'||!Number.isFinite(days)||typeof r.day!=='number'||!Number.isInteger(r.day)||r.day<0||r.day>days)throw new Error('Invalid additional scan');
  const values={};for(const f of S.features){const v=r.values?.[f.key];if(typeof v!=='number'||!Number.isFinite(v)||v<f.low||v>f.high)throw new Error('Invalid additional values');values[f.key]=v;}
  return {eye,day:r.day,values,quality:'ok',verified:true};
 });
 const keys=['A','B','C','Kmax','BAD_D','ARTmax'];
 return [...new Map(rows.map(r=>[stable(r),r])).values()].sort((a,b)=>a.day-b.day||keys.reduce((d,k)=>d||a.values[k]-b.values[k],0));
}
function verifyEvidence(r,config){
 const p=r.evidence;
 if(!p||p.eye!==r.eye||p.input_sha256!==r.input_sha256||p.model_sha256!==config.sha256||p.version!==config.version||p.research_only!==true||p.calibrated!==false||!['ready','unavailable'].includes(p.status))throw new Error('Observed evidence snapshot mismatch');
 if(p.status==='unavailable'){if('structural_count' in p)throw new Error('Unavailable evidence has a count');return true;}
 if(r.case.mode!=='longitudinal'||!r.case.verified||r.case.treatment==='treated'||p.interval_days!==r.case.interval_days||p.visits<2||!Number.isInteger(p.visits)||p.scans<p.visits)throw new Error('Invalid observed evidence eligibility');
 if(!Array.isArray(p.domains)||p.domains.length!==3||stable(p.domains.map(d=>d.key))!==stable(['anterior','posterior','pachymetric'])||p.domains.some(d=>typeof d.signal!=='boolean'||!Number.isFinite(d.z))||p.structural_count!==p.domains.filter(d=>d.signal).length)throw new Error('Invalid structural evidence');
 if(!Array.isArray(p.rows)||p.rows.length!==6||new Set(p.rows.map(x=>x.key)).size!==6)throw new Error('Invalid evidence rows');
 for(const f of S.features){const row=p.rows.find(x=>x.key===f.key);if(!row||row.first!==r.case.first[f.key]||row.latest!==r.case.latest[f.key]||Math.abs(row.change-(row.latest-row.first))>1e-9||![row.annual_rate,row.annual_se,row.reference_pair_limit,row.z].every(Number.isFinite)||row.annual_se<=0||row.reference_pair_limit<=0)throw new Error('Observed measurements do not match');const direction=['A','B','C','ARTmax'].includes(f.key)?-1:1;if(Math.abs(row.z-direction*row.annual_rate/row.annual_se)>1e-8)throw new Error('Evidence rate mismatch');}
 const groups=[['A','Kmax'],['B'],['C','ARTmax']];
 p.domains.forEach((d,i)=>{const z=groups[i].reduce((sum,k)=>sum+p.rows.find(r=>r.key===k).z,0)/groups[i].length;if(stable(d.components)!==stable(groups[i])||Math.abs(d.z-z)>1e-8||!Number.isFinite(d.adjusted_tail)||d.adjusted_tail<0||d.adjusted_tail>1||d.signal!==(d.adjusted_tail<.05))throw new Error('Domain evidence mismatch');});
 return true;
}
function baselineScore(c,values,config){
 const terms=config.features.map((name,i)=>{const spec=config.feature_spec[name],value=spec.source==='age'?c.age:values[spec.key];return (value*(spec.direction??1)-config.center[i])/config.scale[i]*config.coefficients[i];});
 const z=config.intercept+terms.reduce((s,v)=>s+v,0);return z>=0?100/(1+Math.exp(-z)):100*Math.exp(z)/(1+Math.exp(z));
}
function forecastProbability(values,config){
 const z=config.intercept+config.features.reduce((sum,k,i)=>sum+(values[k]-config.scaler_mean[i])/config.scaler_scale[i]*config.coef[i],0);
 return z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));
}
function verifyForecast(r,config){
 const f=r.baseline_outlook?.forecast,a=config.forecast,fail=()=>{throw new Error('Experimental forecast snapshot or calculation mismatch');},same=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<1e-9;
 const ready=r.status==='ready'&&!!r.prediction&&r.case.mode==='baseline';
 if(!f||f.horizon_months!==12)fail();
 if(!ready){if(f.status!=='unavailable'||f.probability!==null||'effects' in f)fail();return true;}
 if(!a||f.status!==config.forecast_status||f.version!==a.version||f.eye!==r.eye||f.input_sha256!==r.input_sha256||f.model_sha256!==a.sha256||f.clinical_release!==false||f.population_risk_calibration!==false||f.endpoint!=='at_least_two_of_four_numerical_domains'||f.predictor_reference!=='selected_baseline_scan'||f.assumption_treatment!==r.case.treatment||f.assumption_scan_quality!==r.case.scan_quality.first)fail();
 const values={age_baseline:r.case.age,...Object.fromEntries(S.features.map(v=>['baseline_'+v.key,r.case.first[v.key]])),log_interval_years:0};
 if(stable(f.feature_values)!==stable(values)||!same(f.probability,forecastProbability(values,a))||f.probability<0||f.probability>1)fail();
 const names=a.features.slice(0,-1),outside=names.filter(k=>values[k]<a.feature_stats[k].min||values[k]>a.feature_stats[k].max);
 if(stable(f.outside_training_ranges)!==stable(outside)||f.extrapolated!==!!outside.length||!Array.isArray(f.effects)||f.effects.length!==7||new Set(f.effects.map(e=>e.feature)).size!==7)fail();
 let previous=Infinity;
 for(const e of f.effects){if(!names.includes(e.feature))fail();const ref=a.feature_stats[e.feature].median,q=forecastProbability({...values,[e.feature]:ref},a),effect=100*(f.probability-q),key=e.feature==='age_baseline'?'age':e.feature.replace('baseline_','');
  if(e.key!==key||e.value!==values[e.feature]||e.reference!==ref||!same(e.probability_at_reference,q)||!same(e.effect_pp,effect)||Math.abs(e.effect_pp)>previous+1e-9)fail();previous=Math.abs(e.effect_pp);
 }
 return true;
}

function verifyBaseline(r,config){
 const p=r.baseline_outlook,fail=()=>{throw new Error('Baseline outlook does not match this calculation');};
 const same=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
 if(!p||p.eye!==r.eye||p.input_sha256!==r.input_sha256||p.model_sha256!==r.model_sha256||p.version!==config.version||p.research_only!==true||p.calibrated!==false)fail();
 verifyForecast(r,config);
 const ready=r.status==='ready'&&!!r.prediction&&r.case.mode==='baseline';
 if(!ready){if(p.status!=='unavailable'||'current_nkpi' in p||'rows' in p||'score_low' in p)fail();return true;}
 if(p.status!=='ready'||!r.case.verified||r.case.treatment==='treated'||r.case.scan_quality.first==='warning'||p.age_fixed!==r.case.age||p.scan_quality!==r.case.scan_quality.first||p.treatment!==r.case.treatment||!same(p.current_nkpi,r.prediction.nkpi)||!same(p.current_nkpi,baselineScore(r.case,r.case.first,config)))fail();
 if(!Array.isArray(p.rows)||p.rows.length!==6||new Set(p.rows.map(v=>v.key)).size!==6||!Array.isArray(p.top_contributors)||stable(p.top_contributors)!==stable(r.prediction.effects.slice(0,3))||p.within_training_ranges!==!r.prediction.outside_range.length||stable(p.outside_training_ranges)!==stable(r.prediction.outside_range))fail();
 const down={...r.case.first},up={...r.case.first};let previous=Infinity;
 for(const row of p.rows){const f=S.features.find(v=>v.key===row.key);if(!f)fail();let d=config.reference_pair_limits[f.key];if(f.key==='Kmax')for(const band of config.kmax_bands)if(row.value>=band.minimum)d=Math.max(d,band.limit);
  const v=r.case.first[f.key],lo=Math.max(f.low,v-d),hi=Math.min(f.high,v+d),a=baselineScore(r.case,{...r.case.first,[f.key]:lo},config),b=baselineScore(r.case,{...r.case.first,[f.key]:hi},config),shift=Math.max(Math.abs(a-p.current_nkpi),Math.abs(b-p.current_nkpi));
  if(row.value!==v||row.reference_pair_limit!==d||!same(row.input_low,lo)||!same(row.input_high,hi)||!same(row.score_at_low,a)||!same(row.score_at_high,b)||!same(row.score_low,Math.min(a,b))||!same(row.score_high,Math.max(a,b))||!same(row.maximum_shift,shift)||row.clipped!==(lo!==v-d||hi!==v+d)||row.maximum_shift>previous+1e-8)fail();previous=row.maximum_shift;
  const i=config.features.indexOf('baseline_'+f.key),positive=config.coefficients[i]*(config.feature_spec['baseline_'+f.key].direction??1)>=0;down[f.key]=positive?lo:hi;up[f.key]=positive?hi:lo;
 }
 if(!same(p.score_low,baselineScore(r.case,down,config))||!same(p.score_high,baselineScore(r.case,up,config))||p.score_low>p.current_nkpi+1e-8||p.score_high<p.current_nkpi-1e-8||p.largest_sensitivity!==p.rows[0].key||p.clipped!==p.rows.some(v=>v.clipped))fail();return true;
}

function expectedFeatures(c,specs){return Object.fromEntries(Object.entries(specs).map(([name,s])=>{let v;if(s.source==='age')v=c.age;else if(s.source==='interval_years')v=c.interval_days/(s.days_per_year||365.2425);else if(s.source==='change')v=c.latest[s.key]-c.first[s.key];else if(['first','latest'].includes(s.source))v=c[s.source][s.key];else throw new Error('Unknown feature mapping');return [name,v*(s.direction??1)];}));}

function verify(c,r,config){if(!r||r.eye!==c.eye||r.case?.eye!==c.eye)throw new Error('Eye/result mismatch');if(stable(canonical(c))!==stable(r.case))throw new Error('Input/result snapshot mismatch');if(r.model_sha256!==config.models[c.mode].sha256)throw new Error('Unexpected model version');if(config.evidence)verifyEvidence(r,config.evidence);if(config.baseline_outlook)verifyBaseline(r,config.baseline_outlook);if(!r.prediction){if(r.status!=='held')throw new Error('Missing score status');return true;}if(r.status!=='ready'||!Number.isFinite(r.prediction.nkpi)||r.prediction.nkpi<0||r.prediction.nkpi>100)throw new Error('Invalid score');const expected=expectedFeatures(r.case,config.feature_specs[c.mode]),effects=r.prediction.effects;if(!Array.isArray(effects)||effects.length!==Object.keys(expected).length||new Set(effects.map(e=>e.feature)).size!==effects.length)throw new Error('Incomplete explanation');for(const e of effects){if(!(e.feature in expected)||!Number.isFinite(e.value)||Math.abs(e.value-expected[e.feature])>1e-9)throw new Error('Input/explanation mismatch: '+e.feature);const ref=config.references[c.mode][e.feature];if(!ref||!Number.isFinite(e.reference)||Math.abs(e.reference-ref.median)>1e-10||!Number.isFinite(e.effect))throw new Error('Training median/effect mismatch: '+e.feature);}const impact=r.impact_audit;if(impact?.cohort?.eyes!==config.models[c.mode].n_eyes||impact?.cohort?.patients!==config.models[c.mode].n_patients)throw new Error('Training cohort metadata mismatch');if(!impact||!Array.isArray(impact.rows)||impact.rows.length!==effects.length||new Set(impact.rows.map(a=>a.feature)).size!==effects.length)throw new Error('Incomplete ranked impact audit');for(const a of impact.rows){const e=effects.find(e=>e.feature===a.feature),spec=config.feature_specs[c.mode][a.feature];if(!spec||a.source!==spec.source||a.key!==spec.key||a.direction!==(spec.direction??1))throw new Error('Ranked feature mapping mismatch');if(!e||!Number.isFinite(a.difference_from_median)||Math.abs(a.difference_from_median-(a.value-a.reference))>1e-9||!Number.isFinite(a.value)||!Number.isFinite(a.reference)||!Number.isFinite(a.effect_points)||!Number.isFinite(a.nkpi_at_median)||Math.abs(a.value-e.value)>1e-9||Math.abs(a.reference-e.reference)>1e-10||Math.abs(a.effect_points-e.effect)>1e-9||Math.abs(a.nkpi_at_median-(r.prediction.nkpi-e.effect))>1e-9)throw new Error('Ranked impact/result mismatch');}return true;}
Object.assign(S,{stable,canonical,expectedFeatures,verify,verifyEvidence,verifyBaseline,baselineScore,verifyForecast,forecastProbability,history});
})(typeof window!=='undefined'?window:globalThis);
