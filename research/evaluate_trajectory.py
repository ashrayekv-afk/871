"""Exploratory feasibility test; no treatment effect or horizon risk is fitted."""
from pathlib import Path
import json,numpy as np,pandas as pd
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
F=['A','B','C','BAD_D','ARTmax','Kmax']
d=pd.read_csv(Path(__file__).parent/'private/private_paired.csv')
original=len(d)
d=d[d.age_baseline.between(18,50)&d.interval_years.between(90/365.2425,5)].copy()
# Match the current calculator's numerical bounds at both visits.
bounds={'A':(2.5,12.5),'B':(2.5,12.5),'C':(200,800),'BAD_D':(-5,60),'ARTmax':(1,1000),'Kmax':(20,100)}
for f,(lo,hi) in bounds.items():
 d=d[d['baseline_'+f].between(lo,hi)&d['latest_'+f].between(lo,hi)]
d=d.reset_index(drop=True)
X=d[['age_baseline']+['baseline_'+f for f in F]].to_numpy();t=d.interval_years.to_numpy();y=d[['latest_'+f for f in F]].to_numpy()-d[['baseline_'+f for f in F]].to_numpy();groups=d.patient_id.to_numpy()
def fit_predict(train,test,alpha,kind):
 ix=[0] if kind=='age' else list(range(7));scale=StandardScaler().fit(X[train][:,ix]);Z=scale.transform(X[train][:,ix]);W=scale.transform(X[test][:,ix]);ys=np.maximum(np.std(y[train],axis=0),1e-8)
 m=Ridge(alpha=alpha,fit_intercept=False).fit(t[train,None]*np.c_[np.ones(len(train)),Z],y[train]/ys)
 return m.predict(t[test,None]*np.c_[np.ones(len(test)),W])*ys
out=[];predictions=[]
for repeat in range(3):
 pred=np.zeros_like(y);chosen=[]
 for fold,(tr,te) in enumerate(GroupKFold(5,shuffle=True,random_state=20260925+repeat).split(X,y,groups)):
  assert not set(groups[tr])&set(groups[te]);scores=[]
  for kind,alpha in [('none',0)]+[(k,a) for k in ['age','expanded'] for a in [1,10,100]]:
   losses=[]
   for it,iv in GroupKFold(3).split(X[tr],y[tr],groups[tr]):
    train,val=tr[it],tr[iv];p=np.zeros_like(y[val]) if kind=='none' else fit_predict(train,val,alpha,kind)
    losses.append(np.mean(((y[val]-p)/np.maximum(np.std(y[train],axis=0),1e-8))**2))
   scores.append((np.mean(losses),kind,alpha))
  _,kind,alpha=min(scores);chosen.append({'fold':fold,'model':kind,'alpha':alpha,'test_eyes':len(te)})
  if kind!='none':pred[te]=fit_predict(tr,te,alpha,kind)
 predictions.append(pred);out.append(chosen)
mean_mse=np.mean([np.mean((p-y)**2,axis=0) for p in predictions],axis=0);null_mse=np.mean(y*y,axis=0)
mean_mae=np.mean([np.mean(abs(p-y),axis=0) for p in predictions],axis=0);null_mae=np.mean(abs(y),axis=0)
summary={'design':'3 repeats of nested 5 outer / 3 inner patient-grouped CV; predict later measurement change from first scan, age and elapsed time; model selection includes persistence (zero change), age rate and expanded ridge rate models. No third scan exists to validate slope-based updates after visit two.',
'paired_before_restrictions':original,'eyes':len(d),'patients':int(d.patient_id.nunique()),'CXL_group':int(d.outcome.sum()),'control_group':int((1-d.outcome).sum()),'interval_range_years':[float(t.min()),float(t.max())], 'median_interval_years':float(np.median(t)),
'fold_selection':out,'metrics':[{'feature':f,'selected_model_RMSE':float(mean_mse[j]**.5),'persistence_RMSE':float(null_mse[j]**.5),'selected_model_MAE':float(mean_mae[j]),'persistence_MAE':float(null_mae[j]),'MSE_skill_vs_persistence':float(1-mean_mse[j]/null_mse[j])}for j,f in enumerate(F)]}
(Path(__file__).parent/'trajectory_feasibility.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
