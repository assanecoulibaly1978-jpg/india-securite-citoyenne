"""Regression checks against actual downloaded primary documents (stdlib unittest)."""
import importlib.util
import json
import re
import unittest
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pharmacies_collector', ROOT / 'scripts/refresh_pharmacies.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class PharmacyDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'data/pharmacies.json').read_text())
        cls.rows = cls.data['records']
        cls.manifest = json.loads((collector.EVIDENCE / 'primary-manifest.json').read_text())

    def row(self, city, name):
        return next(r for r in self.rows if r['city'] == city and r['name'] == name)

    def test_schema_unique_ids_and_primary_provenance(self):
        collector.validate(self.data)
        self.assertEqual(len(self.rows), 396)
        self.assertEqual(len(set(r['id'] for r in self.rows)), 396)
        self.assertTrue(all(p['confidence'] == 'primary' for r in self.rows for p in r['duty_periods']))

    def test_inventory_each_selected_pdf_page(self):
        # Counts independently reviewed from the original complete PDF pages.
        expected = {'unppci-994.pdf': {1:29, 2:32, 3:18, 4:31, 5:31, 6:18, 13:7},
                    'unppci-995.pdf': {1:23, 2:12, 3:38, 4:14, 5:11, 6:19,
                                       7:24, 8:13, 9:38, 10:13, 11:11, 12:18}}
        total = 0
        for doc in self.manifest['documents']:
            records, check = collector.parse_pdf(doc, date(2026,11,9), date(2026,11,15))
            actual = dict(Counter(p['source_page'] for r in records for p in r['duty_periods']))
            self.assertEqual(actual, expected[doc['file']])
            total += len(records)
        self.assertEqual(total, 400)

    def test_periods_not_clipped_to_civil_week(self):
        counts = Counter((p['start'], p['end']) for r in self.rows for p in r['duty_periods'])
        self.assertEqual(counts, {('2026-11-07','2026-11-13'):196,
                                  ('2026-11-14','2026-11-20'):197,
                                  ('2026-11-07','2026-11-14'):3,
                                  ('2026-11-14','2026-11-21'):3,
                                  ('2026-11-09','2026-11-15'):1})

    def test_exceptional_local_rotations(self):
        oume = self.row('OUME', 'PHCIE D’OUME')
        self.assertEqual(oume['duty_periods'][0]['start'], '2026-11-09')
        self.assertEqual(oume['duty_periods'][0]['end'], '2026-11-15')
        azaguie = self.row('AZAGUIE', 'PHCIE REINE DES ANGES')
        self.assertEqual(azaguie['duty_periods'][0]['end'], '2026-11-14')
        manuella = self.row('GAGNOA', 'PHCIE MANUELLA')
        self.assertIn('DIMANCHE 07H30-13H00', manuella['duty_periods'][0]['hours_note'])

    def test_nonstandard_pharmacy_record_starts(self):
        for city, name in [('ABOBO','PHCIE SAFIR'), ('COCODY','PHCIE DIVINE ONCTION'),
                           ('TREICHVILLE','PHCIE DU PALAIS DES SPORTS (NLLE)'),
                           ('YOPOUGON','PHCIE DE L’AUTOROUTE (GDE)'), ('BINGERVILLE','ST SYLVESTRE')]:
            r = self.row(city, name)
            self.assertNotRegex(r['address'] or '', r'PHCIE|MME|MLLE|\bTEL\.')
            self.assertTrue(r['callable_phones'])

    def test_phone_newline_does_not_absorb_street_number(self):
        analya = self.row('COCODY', 'PHCIE ANALYA')
        self.assertIn('07 08 95 19 25', analya['phones'])
        self.assertTrue(analya['address'].startswith('400 M'))
        ste_anne = self.row('PLATEAU', 'PHCIE STE ANNE')
        self.assertIn('07 05 92 27 90', ste_anne['phones'])
        self.assertTrue(ste_anne['address'].startswith('1 RUE'))

    def test_no_old_number_repair_or_invented_coordinates(self):
        garahio = self.row('GAGNOA', 'PHCIE DE GARAHIO')
        self.assertEqual(garahio['phones'], ['32 77 10 56'])
        self.assertEqual(garahio['callable_phones'], [])
        for r in self.rows:
            self.assertIsNone(r['lat'])
            self.assertIsNone(r['lon'])
            self.assertTrue(all(re.fullmatch(r'\+225(?:01|05|07|25|27)\d{8}', p) for p in r['callable_phones']))

    def test_coverage_counts_match_records(self):
        c = self.data['coverage']
        self.assertEqual(c['record_count'], len(self.rows))
        self.assertEqual(c['raw_duty_entries'], sum(len(r['duty_periods']) for r in self.rows))
        self.assertEqual(c['address_count'], sum(bool(r['address']) for r in self.rows))
        self.assertEqual(c['callable_phone_record_count'], sum(bool(r['callable_phones']) for r in self.rows))
        self.assertEqual(sum(c['locality_counts'].values()), len(self.rows))
        self.assertTrue(c['not_exhaustive_national_directory'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
