"""Exploratory domain-endpoint development, NOT a clinical forecasting release.

Run reconstruct_source.py first. Input rows remain private. Only aggregate
validation and model coefficients are suitable for the public code package.
The outcome uses follow-up measurements; predictors never use them.
"""
from pathlib import Path
from decimal import Decimal as D
import argparse, json, hashlib
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss

KEYS = ['A', 'B', 'C', 'BAD_D', 'ARTmax', 'Kmax']
SEEDS = [2718, 3141, 1618]
CS = [.01, .1, 1., 10.]

def domains(row):
    a = {k: D(str(row['baseline_'+k])) for k in KEYS}
    b = {k: D(str(row['latest_'+k])) for k in KEYS}
    return [a['A']-b['A'] > D('.106') or b['Kmax']-a['Kmax'] > 1,
            a['B']-b['B'] > D('.085'),
            100*(a['C']-b['C']) > 2*a['C'] or a['ARTmax']-b['ARTmax'] > D('44.24'),
            b['BAD_D']-a['BAD_D'] > D('.42')]

def design(frame, kind):
    t = np.log(frame.interval_years.to_numpy())[:, None]
    if kind == 'interval_only': return t
    x = frame[['age_baseline']+['baseline_'+k for k in KEYS]].to_numpy()
    return np.column_stack([x,t])

def learner(c):
    return make_pipeline(StandardScaler(), LogisticRegression(C=c, max_iter=3000, solver='lbfgs'))

def select_fit(x,y,g,seed):
    folds=list(StratifiedGroupKFold(3,shuffle=True,random_state=seed).split(x,y,g))
    losses=[]
    for c in CS:
        p=np.zeros(len(y))
        for tr,va in folds:
            assert not set(g[tr]) & set(g[va])
            p[va]=learner(c).fit(x[tr],y[tr]).predict_proba(x[va])[:,1]
        losses.append(brier_score_loss(y,p))
    c=CS[int(np.argmin(losses))]
    return learner(c).fit(x,y),c

def metrics(y,p):
    p=np.clip(p,1e-6,1-1e-6)
    z=np.log(p/(1-p)).reshape(-1,1)
    # Calibration slope is a descriptive OOF diagnostic, never a post-hoc
    # correction applied to those same held-out predictions.
    cal=LogisticRegression(C=1e6,max_iter=3000).fit(z,y)
    return {'eyes':len(y),'events':int(sum(y)), 'auc':float(roc_auc_score(y,p)),
            'brier':float(brier_score_loss(y,p)), 'log_loss':float(log_loss(y,p)),
            'observed_fraction':float(np.mean(y)), 'mean_prediction':float(np.mean(p)),
            'calibration_intercept':float(cal.intercept_[0]),
            'calibration_slope':float(cal.coef_[0,0])}

def bootstrap(y,p,reference,groups):
    rng=np.random.default_rng(20260929);unique=np.unique(groups);index={g:np.where(groups==g)[0] for g in unique}
    auc=[];skill=[]
    for _ in range(1500):
        ix=np.concatenate([index[g] for g in rng.choice(unique,len(unique),replace=True)])
        if len(np.unique(y[ix]))<2:continue
        auc.append(roc_auc_score(y[ix],p[ix]))
        skill.append(brier_score_loss(y[ix],reference[ix])-brier_score_loss(y[ix],p[ix]))
    return {'auc_95_percentile':np.percentile(auc,[2.5,97.5]).tolist(),
            'brier_improvement_over_prevalence_95_percentile':np.percentile(skill,[2.5,97.5]).tolist(),
            'note':'Patient-cluster bootstrap of fixed averaged OOF predictions; does not refit or capture all model-development uncertainty.'}

def evaluate(frame, label, output, private):
    y=frame.event.to_numpy(dtype=int);g=frame.patient_id.to_numpy()
    predictions={k:[] for k in ['candidate','interval_only','prevalence']};selection=[]
    for seed in SEEDS:
        outer=list(StratifiedGroupKFold(5,shuffle=True,random_state=seed).split(frame,y,g))
        run={k:np.zeros(len(y)) for k in predictions}
        for fold,(tr,va) in enumerate(outer):
            assert not set(g[tr]) & set(g[va])
            run['prevalence'][va]=np.mean(y[tr])
            for kind in ['candidate','interval_only']:
                x=design(frame,kind)
                fitted,c=select_fit(x[tr],y[tr],g[tr],seed+fold)
                run[kind][va]=fitted.predict_proba(x[va])[:,1]
                selection.append({'seed':seed,'fold':fold,'kind':kind,'C':c,'test_eyes':len(va),'test_patients':len(np.unique(g[va]))})
        for kind in run: predictions[kind].append(run[kind])
    means={k:np.mean(v,axis=0) for k,v in predictions.items()}
    result={'eyes':len(frame),'patients':frame.patient_id.nunique(),'events':int(sum(y)),
            'domain_counts':frame.domain_count.value_counts().sort_index().to_dict(),
            'interval_days':{'min':float(frame.interval_years.min()*365.2425),'median':float(frame.interval_years.median()*365.2425),'max':float(frame.interval_years.max()*365.2425)},
            'metrics':{k:metrics(y,p) for k,p in means.items()},
            'each_repeat':{k:[metrics(y,p) for p in ps] for k,ps in predictions.items()},
            'bootstrap':bootstrap(y,means['candidate'],means['prevalence'],g),'selection':selection}
    near=frame.interval_years.between(4/12,8/12).to_numpy()
    if near.sum() and not near.all():result['near_six_months_held_out']={k:metrics(y[near],p[near]) for k,p in means.items()}
    final,c=select_fit(design(frame,'candidate'),y,g,2718)
    scaler=final.named_steps['standardscaler'];lr=final.named_steps['logisticregression']
    artifact={'version':'0.1.0-exploratory','status':'not_released_for_patient_forecasting',
              'target':'At least 2 of 4 fixed domains crossed at recorded follow-up relative to first scan',
              'predictor_reference':'first scan only; no observed slope predictors',
              'features':['age_baseline']+['baseline_'+k for k in KEYS]+['log_interval_years'],
              'scaler_mean':scaler.mean_.tolist(),'scaler_scale':scaler.scale_.tolist(),
              'coef':lr.coef_[0].tolist(),'intercept':float(lr.intercept_[0]),'C':c,
              'training_eyes':len(frame),'training_patients':int(frame.patient_id.nunique()),
              'external_validation':False,'population_risk_calibration':False,
              'third_visit_validation':False,'source_workbook_sha256':'60bd4895f669fa55bd4e7e37266c66a52497f250847869185dfa1424bfa882be'}
    (output/(label+'_candidate.json')).write_text(json.dumps(artifact,indent=2)+'\n')
    frame[['patient_id','eye','event']].assign(**{k:p for k,p in means.items()}).to_csv(private/(label+'_oof.csv'),index=False)
    return result

def run(source,output,private):
    output.mkdir(parents=True,exist_ok=True);private.mkdir(parents=True,exist_ok=True)
    raw=pd.read_csv(source)
    adult=raw[raw.age_baseline.between(18,50)].copy()
    frame=adult[adult.interval_years.between(90/365.2425,5)].copy()
    frame['domain_count']=[sum(domains(r)) for r in frame.to_dict('records')];frame['event']=frame.domain_count>=2
    near=frame[frame.interval_years.between(4/12,8/12)].copy()
    report={'protocol':'protocol.json','complete_pairs_before_age_interval':len(raw),
            'pairs_age_18_50_before_interval':len(adult),'excluded_under_90_days':int((adult.interval_years<90/365.2425).sum()),
            'excluded_over_5_years':int((adult.interval_years>5).sum()),
            'third_measurement_timepoints_in_workbook':0,
            'primary':evaluate(frame,'variable_interval',output,private),
            'direct_4_to_8_months':evaluate(near,'near_six_months',output,private)}
    report['clinical_release']=False
    report['reasons']=['No third scan to validate latest-plus-observed-trend forecasts.',
        'Only 43 eyes / 27 patients have complete eligible 4-8 month pairs; this is an approximate window, not exact six-month follow-up.',
        'Outcome-selected CXL/control cohort; clinical population absolute risk cannot be inferred from its sample proportion.',
        'Quality, treatment timing and source transcription still require a study-level audit; a numerical endpoint is not adjudicated clinical progression.']
    (output/'domain_outlook_validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:{n:v for n,v in report[k].items() if n in ['eyes','patients','events','metrics','bootstrap','near_six_months_held_out']} for k in ['primary','direct_4_to_8_months']},indent=2))



def build_baseline_demo(source, output, private):
    """v8.2 experimental all-adult baseline demo; not a clinical release.

    Recipe specified before this fit: same nested-grouped ridge procedure;
    broaden baseline age eligibility to 18-100; retain 90-day to 5-year visits;
    fixed requested horizon 12 months; audit 9-15-month endpoint subset without
    selecting the model or changing thresholds from that subset's performance.
    """
    output.parent.mkdir(parents=True,exist_ok=True);private.mkdir(parents=True,exist_ok=True)
    raw=pd.read_csv(source)
    required=['patient_id','eye','age_baseline','interval_years']+['baseline_'+k for k in KEYS]+['latest_'+k for k in KEYS]
    if raw[required].isna().any().any():raise ValueError('Demo training requires complete parsed pairs.')
    if raw[['patient_id','eye']].duplicated().any():raise ValueError('Duplicate eye pairs require source reconciliation.')
    frame=raw[raw.age_baseline.between(18,100)&raw.interval_years.between(90/365.2425,5)].copy()
    frame['domain_count']=[sum(domains(r)) for r in frame.to_dict('records')];frame['event']=frame.domain_count>=2
    tmp=private/'aggregate';tmp.mkdir(exist_ok=True)
    validation=evaluate(frame,'adult_baseline',tmp,private)
    fitted=json.loads((tmp/'adult_baseline_candidate.json').read_text())
    oof=pd.read_csv(private/'adult_baseline_oof.csv')
    # evaluate() preserves source frame order in its OOF export.
    assert oof.patient_id.astype(str).tolist()==frame.patient_id.astype(str).tolist()
    near=frame.interval_years.between(9/12,15/12).to_numpy()
    near_validation={'window_months':[9,15],'eyes':int(near.sum()),'patients':int(frame.loc[near,'patient_id'].nunique()),'events':int(frame.loc[near,'event'].sum()),
        'note':'Post-fit descriptive subset of held-out predictions at the actual observed intervals, not exact 12-month validation.'}
    if len(np.unique(frame.event.to_numpy()[near]))==2:
        near_validation['metrics']={k:metrics(frame.event.to_numpy()[near].astype(int),oof[k].to_numpy()[near]) for k in ['candidate','interval_only','prevalence']}
    names=fitted['features'];x=design(frame,'candidate')
    stats={name:{'min':float(x[:,i].min()),'max':float(x[:,i].max()),'median':float(np.median(x[:,i]))} for i,name in enumerate(names)}
    artifact={**fitted,'version':'0.2.0-baseline-research-demo','status':'experimental_demo_only','horizon_months':12,
        'source_paired_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'selection_rule':'Complete parsed adults age 18-100; interval 90 days to 5 years; no CXL-label-based relabelling.',
        'label':'Model-estimated numerical threshold crossing at a 12-month scan',
        'feature_stats':stats,'validation':validation,'near_twelve_months':near_validation,
        'calibrated_clinical_probability':False,'clinical_release':False,
        'domain_rules':[{'key':'anterior','label':'Anterior curvature','rule':'ARC decrease >0.106 mm OR Kmax increase >1 D'},
                        {'key':'posterior','label':'Posterior curvature','rule':'PRC decrease >0.085 mm'},
                        {'key':'pachymetric','label':'Pachymetric','rule':'Thinnest decrease >2% OR ARTmax decrease >44.24'},
                        {'key':'composite','label':'Composite deviation','rule':'BAD-D increase >0.42'}],
        'limitations':['Selected CXL/control cohort; sample response is not population-calibrated patient risk.',
                       'Numerical outcome is not independently adjudicated clinical progression.',
                       'Variable follow-up and incomplete treatment/quality audit; no exact first-crossing time.',
                       'Forecast assumes comparable untreated scans; no CXL treatment benefit is estimated.',
                       'Internal validation only; no external fixed-horizon validation.']}
    output.write_text(json.dumps(artifact,indent=2)+'\n')
    print(json.dumps({'artifact':str(output),'eyes':len(frame),'patients':frame.patient_id.nunique(),'events':int(frame.event.sum()),'selected_C':fitted['C'],'metrics':validation['metrics'],'near_12_months':near_validation},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--paired',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--private-out',type=Path,required=True);p.add_argument('--baseline-demo',action='store_true');a=p.parse_args()
    if a.baseline_demo:build_baseline_demo(a.paired,a.out/'baseline_forecast_demo.json',a.private_out)
    else:run(a.paired,a.out,a.private_out)
