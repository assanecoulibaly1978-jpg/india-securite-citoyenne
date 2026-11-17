"""Regression checks for the collected national public-stations directory."""
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

class DirectoryTests(unittest.TestCase):
    def test_phone_normalizer_never_upgrades_legacy_or_malformed_numbers(self):
        p = ROOT / 'scripts/refresh_directory.py'
        self.assertTrue(p.exists(), 'refresh script must exist')
        spec = importlib.util.spec_from_file_location('directory_refresh', p)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.callable_phones(['(+225) 21 30 11 19', '180', '27 22 22 47 18 65', '01 61 11 00']), [])
        self.assertEqual(module.callable_phones(['27 21 30 11 19', '+225 01 41 12 11 11']), ['+2252721301119', '+2250141121111'])

    def test_go_city_is_locality_not_street_and_duplicate_bassam_is_merged(self):
        data=json.loads((ROOT/'data/directory.json').read_text())
        rows=[r for r in data['records'] if r['category']=='gendarmerie' and 'bon berger' in r['address'].lower()]
        self.assertEqual(len(rows),1,'official and GO listing describe the same public brigade')
        self.assertEqual(rows[0]['city'],'Grand-Bassam')
        self.assertIsNotNone(rows[0]['lat'])
        self.assertTrue(rows[0]['callable_phones'])

    def test_directory_has_evidenced_points_valid_phones_and_exact_counts(self):
        p = ROOT / 'data/directory.json'
        self.assertTrue(p.exists(), 'a real collected directory must exist')
        data = json.loads(p.read_text())
        rows = data['records']
        self.assertGreater(len(rows), 150)
        self.assertEqual(len(rows), len({r['id'] for r in rows}))
        self.assertFalse(data['coverage']['exhaustive'])
        self.assertEqual(data['coverage']['total'], len(rows))
        for category in ('police', 'gendarmerie', 'fire'):
            self.assertEqual(data['coverage']['counts'][category], sum(r['category'] == category for r in rows))
            self.assertGreater(data['coverage']['counts'][category], 5)
        for r in rows:
            self.assertTrue(r['source_url'].startswith('https://'))
            self.assertTrue(r['sources'])
            self.assertTrue(r['retrieved_at'].endswith('Z'))
            self.assertIsInstance(r['duty_periods'], list)
            for p in r['callable_phones']:
                self.assertRegex(p, r'^\+225(?:01|05|07|21|25|27)\d{8}$')
                self.assertIn(p[4:], [re.sub(r'\D', '', n).removeprefix('225') for n in r['phones']])
            if r['lat'] is not None:
                self.assertIsNotNone(r['lon'])
                self.assertEqual(r['location_precision'], 'point')
                self.assertTrue(r['location_source_url'])
                self.assertTrue(any(s['url'] == r['location_source_url'] for s in r['sources']))
                self.assertTrue(4 < r['lat'] < 11)
                self.assertTrue(-9 < r['lon'] < -2)
            else:
                self.assertIsNone(r['lon'])
                self.assertNotEqual(r['location_precision'], 'point')
        for s in data['sources']:
            self.assertTrue((ROOT / s['evidence_file']).exists())

if __name__ == '__main__':
    unittest.main()
