/* Patient-input-driven research forecast, separate from the frozen NKPI score. */
(function(root){'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./schema.js'):root.NKPI,E=S.esc;
const fmt=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
const sign=v=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1);
const name=k=>S.features.find(f=>f.key===k)?.label||'Age';
function summarize(current,result,dirty=false,config=null){
 const out={eye:current.eye,status:'unavailable',title:'Awaiting baseline values',reason:'Import or enter a single visit, verify the values, then calculate.',demo:current.demo===true};
 if(!current.enabled)return {...out,title:'Eye not included',reason:'Enable this eye to assess its baseline inputs.'};
 if(dirty)return {...out,title:'Source changed',reason:'Reimport confirmed values before reviewing baseline sensitivity.'};
 if(!result)return out;
 try{
  if(result.eye!==current.eye||S.stable(S.canonical(current))!==S.stable(result.case))throw new Error('Recalculate after changing measurements.');
  if(!config)throw new Error('Reconnect the calculator and calculate again.');
  S.verifyBaseline(result,config);
  return {...out,...result.baseline_outlook,title:result.case.mode==='longitudinal'?'Two-visit mode':result.status==='held'?'Inputs need review':'Baseline forecast',forecast_config:config.forecast,demo:result.case.demo===true};
 }catch(error){return {...out,title:'Recalculation needed',reason:error.message};}
}
function sensitivity(p,disclosureKey='',opened=false){
 const heading='<header class="bl-eye-heading"><h3>'+E(p.eye==='OD'?'OD · Right eye':'OS · Left eye')+'</h3><span class="bl-pill">'+(p.demo?'SYNTHETIC INPUTS':'SINGLE VISIT')+'</span></header>';
 if(p.status!=='ready')return '<article class="bl-eye bl-empty" data-baseline-eye="'+E(p.eye)+'">'+heading+'<h3>'+E(p.title)+'</h3><p>'+E(p.reason)+'</p></article>';
 const lead=p.rows[0],band=v=>Number(v.toFixed(0))<33?'Lower':Number(v.toFixed(0))<67?'Intermediate':'Higher',changesBand=band(p.score_low)!==band(p.score_high);
 const rows=p.rows.map(r=>{const f=S.features.find(x=>x.key===r.key);return '<tr><th>'+E(f.label)+'</th><td>'+fmt(r.value,f.decimals)+'</td><td>±'+fmt(r.reference_pair_limit,3)+(f.unit?' '+E(f.unit):'')+'</td><td>'+fmt(r.score_low)+'–'+fmt(r.score_high)+'</td></tr>';}).join('');
 return '<div class="bl-sensitivity-body">'+
 '<div class="bl-kicker">Current baseline NKPI</div><div class="bl-current">'+fmt(p.current_nkpi,0)+'<span>/ 100</span></div><p class="bl-score-caption">CXL-associated research index</p>'+
 '<div class="bl-sensitivity"><div class="bl-kicker">If the scan inputs vary</div><div class="bl-range"><strong>'+fmt(p.score_low)+'–'+fmt(p.score_high)+'</strong><span>NKPI points</span></div><div class="bl-track" role="img" aria-label="Current NKPI '+fmt(p.current_nkpi)+'; hypothetical stress-test envelope '+fmt(p.score_low)+' to '+fmt(p.score_high)+'"><span class="bl-track-span" style="left:'+p.score_low+'%;width:'+(p.score_high-p.score_low)+'%"></span><span class="bl-track-dot" style="left:'+Math.min(99,Math.max(1,p.current_nkpi))+'%"></span></div><div class="bl-axis"><span>0</span><span>100</span></div><p><b>'+ (changesBand?'Descriptive score band can change':'Same descriptive band in this test')+'</b><br>Hypothetical input variation · not a confidence interval.</p></div>'+
 '<div class="bl-priority"><span>Largest input sensitivity</span><strong>'+E(name(lead.key))+'</strong><small>Up to '+fmt(lead.maximum_shift)+' NKPI points when varied alone.</small></div>'+
 '<div class="bl-contributors"><h4>Top contributors to this NKPI</h4>'+p.top_contributors.map(e=>'<div><span>'+E(name(e.key))+'</span><b>'+sign(e.effect)+' pts</b></div>').join('')+'<p class="micro">Compared with the training median, one input at a time. These effects do not add up.</p></div>'+
 '<details class="bl-details"'+(disclosureKey?' data-disclosure="'+E(disclosureKey)+'"':'')+(opened?' open':'')+'><summary>Inspect scan sensitivity</summary><div class="table-wrap"><table><thead><tr><th>Input</th><th>Entered</th><th>Tested change</th><th>NKPI range</th></tr></thead><tbody>'+rows+'</tbody></table></div><p>The large range combines all six input extremes in the score-lowering and score-raising directions. The rows vary only one input. Age stays fixed at '+fmt(p.age_fixed)+' years.</p><p>Published same-day pair-repeatability limits set the test sizes. Correlated measurements are varied independently as a stress test; those combinations are not a predicted future cornea. Source errors, model uncertainty and actual scan quality are not quantified.</p><p>'+(p.within_training_ranges?'All seven inputs are within individual development ranges; this does not establish model reliability.':'Outside individual development ranges: '+E(p.outside_training_ranges.join(', '))+'.')+'</p><p>Scan quality: '+(p.scan_quality==='ok'?'recorded as acceptable':'unconfirmed')+' · Treatment history: '+(p.treatment==='untreated'?'recorded as untreated':'unconfirmed')+'.'+(p.clipped?' Perturbations were clipped at calculator input bounds.':'')+'</p><p>References: <a href="https://doi.org/10.1038/s41598-020-76020-6" target="_blank" rel="noopener noreferrer">Neuhann 2020</a> and <a href="https://doi.org/10.1371/journal.pone.0228992" target="_blank" rel="noopener noreferrer">Gustafsson 2020</a>. This supplement does not change NKPI.</p></details>'+
 '</div>';
}

function render(p,disclosureKey='',opened=false){
 const heading='<header class="bl-eye-heading"><h3>'+E(p.eye==='OD'?'OD · Right eye':'OS · Left eye')+'</h3><span class="bl-pill">'+(p.demo?'SYNTHETIC INPUTS':p.title==='Two-visit mode'?'TWO VISITS':'SINGLE VISIT')+'</span></header>';
 if(p.status!=='ready')return '<article class="bl-eye bl-empty" data-baseline-eye="'+E(p.eye)+'">'+heading+'<h3>'+E(p.title)+'</h3><p>'+E(p.reason)+'</p></article>';
 const f=p.forecast,c=p.forecast_config,score=100*f.probability;
 const keyLabel=k=>k==='age_baseline'?'Age':name(k.replace('baseline_',''));
 const flags=[];if(f.extrapolated)flags.push('Extrapolated inputs: '+f.outside_training_ranges.map(keyLabel).join(', '));if(f.assumption_treatment==='unknown')flags.push('Treatment history unconfirmed');if(f.assumption_scan_quality==='unknown')flags.push('Scan quality unconfirmed');
 const inputs=f.effects.map(e=>{const spec=S.features.find(v=>v.key===e.key),d=spec?.decimals??1;return '<tr><th>'+E(name(e.key))+'</th><td>'+fmt(e.value,d)+'</td><td>'+fmt(e.reference,d)+'</td><td>'+sign(e.effect_pp)+'</td></tr>';}).join('');
 return '<article class="bl-eye" data-baseline-eye="'+E(p.eye)+'">'+heading+
 '<div class="bl-forecast-hero"><div class="bl-forecast-kicker">12-month research forecast</div><div class="bl-forecast-value" data-forecast="'+E(p.eye)+'">'+fmt(score)+'<span>%</span></div><p>Model-estimated numerical progression endpoint</p><div class="bl-endpoint">≥2 of 4 domains crossing at a 12-month scan, relative to this baseline</div><span class="bl-demo-status">EXPERIMENTAL · NOT CLINICALLY VALIDATED</span></div>'+
 '<p class="bl-forecast-meaning">Calculated from this eye’s age and six baseline values. This is a selected-cohort model estimate, not calibrated clinical risk.</p>'+
 (flags.length?'<p class="bl-assumptions">'+flags.map(E).join(' · ')+'.</p>':'')+
 '<div class="bl-forecast-drivers"><h4>What influences this estimate?</h4>'+f.effects.slice(0,3).map(e=>'<div><span>'+E(name(e.key))+'</span><b>'+sign(e.effect_pp)+' pp</b></div>').join('')+'<p>Versus the training median, one input at a time. Associations are not causal or additive.</p></div>'+
 '<details class="bl-details"><summary>Forecast inputs &amp; calculation</summary><div class="table-wrap"><table><thead><tr><th>Input</th><th>This eye</th><th>Median</th><th>Effect · pp</th></tr></thead><tbody>'+inputs+'</tbody></table></div><p>The fitted regularized logistic model uses baseline age, A, B, C, BAD-D, ARTmax and Kmax. Its elapsed-time input is fixed to one year. No second visit is invented and age is not advanced.</p><p>Raw output: '+fmt(score,4)+'%. “pp” means percentage points. The forecast is a separate model from NKPI.</p><p>'+c.training_eyes+' eligible eyes / '+c.training_patients+' patients. Internal patient-grouped AUROC '+fmt(c.validation.auc,3)+'; Brier '+fmt(c.validation.brier,4)+' versus '+fmt(c.prevalence_validation.brier,4)+' for a training-fold average. Discrimination is limited.</p><p>The 9–15-month audit contains '+c.near_twelve_months.eyes+' eyes / '+c.near_twelve_months.patients+' patients. It is not exact 12-month or external validation. Sampling, measurement variability and treatment timing can bias the estimate.</p><p>Endpoint rules: '+c.domain_rules.map(d=>E(d.label)+': '+E(d.rule)+'.').join(' ')+' Each domain contributes at most once. These numerical domains overlap and are not independent biological confirmations.</p><p>This predicts the model’s threshold state at a later scan. It does not estimate when a first crossing occurs, treatment benefit, or an observed change from a single visit.</p></details>'+
 '<details class="bl-details bl-nkpi-secondary"'+(disclosureKey?' data-disclosure="'+E(disclosureKey)+'"':'')+(opened?' open':'')+'><summary>Existing NKPI &amp; input sensitivity</summary>'+sensitivity(p)+'</details>'+
 '<div class="bl-forecast-footer">Research demo · Limited predictive discrimination · Not for clinical decisions</div></article>';
}
const api={summarize,render};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NKPIBaseline=api;
})(typeof window!=='undefined'?window:globalThis);
