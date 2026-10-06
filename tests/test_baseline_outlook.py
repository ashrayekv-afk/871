"""Deterministic stress-test checks; these are not clinical validation."""
import copy
import itertools
import json
import math
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from nkpi.service import calculate,configuration
from nkpi.assessment import infer, model, FEATURES


def example(eye='OD'):
    return dict(eye=eye,mode='baseline',age=24,verified=True,treatment='untreated',
                scan_quality={'first':'ok'},first=dict(A=7.2,B=5.8,C=480,Kmax=52,BAD_D=4,ARTmax=230))


def result(c):
    return calculate({'eyes':[c]},include_pdf=False)['eyes'][c['eye']]


class BaselineTests(unittest.TestCase):
    def test_one_at_a_time_matches_independent_logit(self):
        r=result(example());p=r['baseline_outlook'];m=model('baseline')
        self.assertEqual(p['status'],'ready');self.assertEqual(p['current_nkpi'],r['prediction']['nkpi'])
        self.assertEqual(p['input_sha256'],r['input_sha256']);self.assertEqual(p['model_sha256'],r['model_sha256'])
        z=math.log(p['current_nkpi']/(100-p['current_nkpi']))
        for row in p['rows']:
            i=m['features'].index('baseline_'+row['key'])
            for side in ('low','high'):
                changed=z+(row['input_'+side]-row['value'])*m['coefficients'][i]/m['scale'][i]
                self.assertAlmostEqual(row['score_at_'+side],100/(1+math.exp(-changed)),places=11)
        self.assertEqual(p['top_contributors'],r['prediction']['effects'][:3])

    def test_envelope_equals_all_64_corners(self):
        for c in (example(),dict(example(),age=72)):
            p=result(c)['baseline_outlook'];scores=[]
            for sides in itertools.product(('input_low','input_high'),repeat=6):
                other=copy.deepcopy(c)
                for row,side in zip(p['rows'],sides):other['first'][row['key']]=row[side]
                scores.append(infer(other)['nkpi'])
            self.assertEqual(p['score_low'],min(scores));self.assertEqual(p['score_high'],max(scores))
            self.assertLessEqual(p['score_low'],p['current_nkpi']);self.assertGreaterEqual(p['score_high'],p['current_nkpi'])

    def test_bilateral_isolation(self):
        od,os=example(),example('OS');os['first']['ARTmax']=50
        both=calculate({'eyes':[od,os]},include_pdf=False)['eyes']
        self.assertEqual(both['OD'],result(od));self.assertEqual(both['OS'],result(os))
        self.assertNotEqual(both['OD']['baseline_outlook']['current_nkpi'],both['OS']['baseline_outlook']['current_nkpi'])

    def test_held_and_longitudinal_do_not_produce_baseline_numbers(self):
        cases=[]
        for field,value in [('verified',False),('treatment','treated'),('age',12),('scan_quality',{'first':'warning'})]:
            c=example();c[field]=value;cases.append(c)
        c=example();c['first']['A']=None;cases.append(c)
        c=example();c.update(mode='longitudinal',latest=copy.deepcopy(c['first']),interval_days=180);cases.append(c)
        for c in cases:
            p=result(c)['baseline_outlook'];self.assertEqual(p['status'],'unavailable')
            self.assertNotIn('current_nkpi',p);self.assertNotIn('rows',p);self.assertIsNone(p['forecast']['probability'])

    def test_unknown_context_not_mislabelled(self):
        c=example();c.update(treatment='unknown',scan_quality={'first':'unknown'})
        p=result(c)['baseline_outlook'];self.assertEqual(p['scan_quality'],'unknown');self.assertEqual(p['treatment'],'unknown')

    def test_clipping_respects_calculator_bounds(self):
        for extremum in ['low','high']:
            c=example();c['first']={f['key']:f[extremum] for f in FEATURES};p=result(c)['baseline_outlook']
            self.assertTrue(p['clipped'])
            for row in p['rows']:
                f=next(f for f in FEATURES if f['key']==row['key'])
                self.assertGreaterEqual(row['input_low'],f['low']);self.assertLessEqual(row['input_high'],f['high'])

    def test_kmax_reference_bands(self):
        for k,expected in [(48.199,.926),(48.2,1.33),(53.899,1.33),(53.9,1.62)]:
            c=example();c['first']['Kmax']=k
            row=next(v for v in result(c)['baseline_outlook']['rows'] if v['key']=='Kmax')
            self.assertEqual(row['reference_pair_limit'],expected)

    def test_snapshot_changes_when_inputs_change(self):
        c=example();a=result(c);c['first']['C']-=1;b=result(c)
        self.assertNotEqual(a['baseline_outlook']['input_sha256'],b['baseline_outlook']['input_sha256'])
        self.assertNotEqual(a['baseline_outlook']['current_nkpi'],b['baseline_outlook']['current_nkpi'])

    def test_forecast_uses_baseline_only_no_age_projection_or_unapproved_data(self):
        c=example();c.update(patient_name='PRIVATE_SENTINEL',outcome=1,interval_days=3650,latest={f['key']:0 for f in FEATURES})
        r=result(c);p=r['baseline_outlook']
        self.assertEqual(p['age_fixed'],24);self.assertEqual(p,result(example())['baseline_outlook'])
        self.assertEqual(p['forecast']['status'],'experimental_ready')
        self.assertEqual(p['forecast']['horizon_months'],12)
        self.assertGreater(p['forecast']['probability'],0)
        self.assertFalse(p['forecast']['clinical_release'])
        self.assertEqual(p['forecast']['feature_values']['log_interval_years'],0)
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(r));self.assertNotIn('probability',p)
        self.assertFalse(configuration()['baseline_outlook']['calibrated'])

    def test_zero_coefficient_never_changes_score(self):
        # Separately checks sorting at a zero effect rather than requiring any frozen coefficient to be zero.
        from unittest.mock import patch
        m=copy.deepcopy(model('baseline'));m['coefficients'][m['features'].index('baseline_C')]=0
        with patch('nkpi.assessment.model',return_value=m),patch('nkpi.baseline_outlook.model',return_value=m):
            from nkpi.assessment import assess_eye
            from nkpi.baseline_outlook import analyze
            from nkpi.service import fingerprint
            r=assess_eye(example());r['model_sha256']=r['model']['sha256']
            p=analyze(r,fingerprint(r['case']));row=next(v for v in p['rows'] if v['key']=='C')
            self.assertEqual(row['maximum_shift'],0)


class ForecastTests(unittest.TestCase):
    def test_known_trained_fixture_and_separate_score(self):
        c=example();c['first']=dict(A=7.2,B=5.8,C=500,Kmax=47.2,BAD_D=2.4,ARTmax=310)
        r=result(c);f=r['baseline_outlook']['forecast']
        self.assertAlmostEqual(f['probability'],0.2948005728874254,places=12)
        self.assertNotAlmostEqual(100*f['probability'],r['prediction']['nkpi'],places=1)
        self.assertEqual(f['input_sha256'],r['input_sha256']);self.assertEqual(f['eye'],'OD')
        self.assertFalse(f['population_risk_calibration'])

    def test_independent_linear_predictor_and_feature_responses(self):
        from nkpi.baseline_outlook import forecast_artifact
        a,_=forecast_artifact();c=example();f=result(c)['baseline_outlook']['forecast']
        x=[f['feature_values'][k] for k in a['features']]
        z=a['intercept']+sum((v-u)/s*b for v,u,s,b in zip(x,a['scaler_mean'],a['scaler_scale'],a['coef']))
        self.assertAlmostEqual(f['probability'],1/(1+math.exp(-z)),places=13)
        for i,key in enumerate(['age','A','B','C','BAD_D','ARTmax','Kmax']):
            other=copy.deepcopy(c)
            if key=='age':other[key]+=1
            else:other['first'][key]+=0.1
            g=result(other)['baseline_outlook']['forecast'];self.assertNotEqual(g['probability'],f['probability'])
            delta=(1 if key=='age' else 0.1)*a['coef'][i]/a['scaler_scale'][i]
            self.assertAlmostEqual(math.log(g['probability']/(1-g['probability']))-z,delta,places=11)

    def test_extrapolation_is_flagged_not_silently_clipped(self):
        c=example();c['age']=95
        f=result(c)['baseline_outlook']['forecast'];self.assertTrue(f['extrapolated']);self.assertIn('age_baseline',f['outside_training_ranges'])
        self.assertEqual(f['feature_values']['age_baseline'],95)
        self.assertTrue(0<f['probability']<1)

    def test_forecast_effects_are_own_model_not_nkpi(self):
        from nkpi.baseline_outlook import forecast_probability,forecast_artifact
        a,_=forecast_artifact();f=result(example())['baseline_outlook']['forecast']
        self.assertEqual(len(f['effects']),7)
        for e in f['effects']:
            v=dict(f['feature_values']);v[e['feature']]=e['reference'];q=forecast_probability([v[k] for k in a['features']])
            self.assertAlmostEqual(e['effect_pp'],100*(f['probability']-q),places=12)

    def test_forecast_checksum_rejects_corruption(self):
        import tempfile
        from unittest.mock import patch
        from nkpi import baseline_outlook as b
        original=b.FORECAST_PATH
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'bad.json';p.write_bytes(original.read_bytes()+b' ');p.with_suffix('.sha256').write_text(original.with_suffix('.sha256').read_text())
            b.forecast_artifact.cache_clear()
            try:
                with patch.object(b,'FORECAST_PATH',p):
                    with self.assertRaises(ValueError):b.forecast_artifact()
            finally:b.forecast_artifact.cache_clear()
        self.assertEqual(b.forecast_artifact()[0]['training_eyes'],232)


if __name__=='__main__':unittest.main()
