#!/usr/bin/env python3
"""Extract the original UNPPCI November 2026 duty PDFs, not example records.

Dependency: python -m pip install pypdf
Usage: python scripts/refresh_pharmacies.py [--offline] [--require-live]
Default: live retrieval, falling back to SHA-256-verified original evidence on
origin failure. Cached retrieval dates are NEVER advanced. --offline reproduces
exactly the downloaded evidence. --require-live forbids that fallback.

Scope is explicitly November 2026; this is not a guessed perpetual weekly feed.
For another month, discover and verify its original UNPPCI article/documents.
The UNPPCI site may require a real browser. To refresh blocked downloads, fetch
both manifest URLs in a browser, replace PDFs AND manifest retrieval timestamps
and hashes only after validating original bytes, then run --offline.
No geocoding is performed; geographic coordinates remain null.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import unicodedata
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/pharmacy'
PRIMARY_ARTICLE = 'https://unppci.org/?p=articles&id=303'
LABEL = 'UNPPCI — tour de garde de novembre 2026'
MONTHS = {'OCTOBRE': 10, 'NOVEMBRE': 11, 'DECEMBRE': 12}
PERIOD_RE = re.compile(r'(?:SAMEDI|LUNDI)\s+(\d{1,2})\s*(OCTOBRE|NOVEMBRE|DECEMBRE)?\s+AU\s+(?:VENDREDI|SAMEDI|DIMANCHE)\s+(\d{1,2})\s+(OCTOBRE|NOVEMBRE|DECEMBRE)')
START_RE = re.compile(r'\b(?:PHCIE|PHARMACIE)\s+|^ST SYLVESTRE\s*/')
PHONE_RE = re.compile(r'(?<!\d)(?:\+225[ \u00a0]*)?\d(?:[ \u00a0]*\d){7,9}(?![ \u00a0]*\d)')
CALLABLE_RE = re.compile(r'(?:01|05|07|25|27)\d{8}')
AREA_HEADINGS = {
    'ABOBO': 'ABOBO', 'ABOBO PK 18': 'ABOBO', 'ANYAMA': 'ANYAMA',
    'ALEPE / MONTEZO / BROFODOUME': 'ALEPE / MONTEZO / BROFODOUME',
    'ADJAME CENTRE': 'ADJAME', 'ATTECOUBE': 'ATTECOUBE', 'WILLIAMSVILLE': 'ADJAME',
    'BINGERVILLE': 'BINGERVILLE', 'ZONE AKOUEDO – PALMERAIE EXTENSION – ABATTA': 'COCODY',
    'RIVIERA': 'COCODY', 'COCODY': 'COCODY', 'II PLATEAUX': 'COCODY',
    'MARCORY NORD': 'MARCORY', 'ANOUMABO': 'MARCORY', 'MARCORY SUD': 'MARCORY',
    'CENTRE': 'PORT BOUET', 'VRIDI': 'PORT BOUET', 'ADJOUFFOU /GONZAQ/ ANANI': 'PORT BOUET',
    'ABOBODOUME/ LOCODJORO': 'ATTECOUBE', 'ALLOKOI PK 23': 'ALLOKOI PK 23', 'YOPOUGON': 'YOPOUGON',
}


def now():
    return datetime.now(timezone.utc).isoformat()


def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z0-9]', '', s)


def period(text):
    match = PERIOD_RE.search(text)
    if not match:
        return None
    a, m1, b, m2 = match.groups()
    return (date(2026, MONTHS[m1 or m2], int(a)), date(2026, MONTHS[m2], int(b)))


def intersects(p, first, last):
    return p and p[0] <= last and p[1] >= first


def callable_phone(raw):
    digits = re.sub(r'\s', '', raw)
    if digits.startswith('+225'):
        digits = digits[4:]
    return '+225' + digits if CALLABLE_RE.fullmatch(digits) else None


def load_documents(args):
    manifest_path = EVIDENCE / 'primary-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    statuses = []
    for doc in manifest['documents']:
        path = EVIDENCE / doc['file']
        error = None
        fetched = False
        if not args.offline:
            try:
                req = Request(doc['url'], headers={'User-Agent': 'Mozilla/5.0 (compatible; CitizenDirectory/1.0)'})
                with urlopen(req, timeout=30) as response:
                    data = response.read()
                if not data.startswith(b'%PDF-'):
                    raise ValueError('Response is not a PDF')
                reader = PdfReader(io.BytesIO(data))
                if len(reader.pages) != doc['pages']:
                    raise ValueError('PDF page count changed; review source before replacing evidence')
                path.write_bytes(data)
                doc.update(sha256=hashlib.sha256(data).hexdigest(), retrieved_at=now())
                fetched = True
            except Exception as exc:
                error = str(exc)
                if args.require_live:
                    raise RuntimeError(f"Live retrieval failed: {doc['url']}: {error}") from exc
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != doc['sha256']:
            raise ValueError(f'Missing or changed evidence: {path}')
        statuses.append({'url': doc['url'], 'mode': 'live' if fetched else 'verified-original-evidence', 'error': error})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest, statuses


def parse_pdf(doc, first, last):
    reader = PdfReader(EVIDENCE / doc['file'])
    if len(reader.pages) != doc['pages']:
        raise ValueError('PDF page count does not match evidence manifest')
    interior = doc['file'] == 'unppci-994.pdf'
    all_records, checks, texts = [], [], []
    for page_index, page in enumerate(reader.pages, start=1):
        text = page.extract_text(extraction_mode='layout')
        texts.append(text)
        weekly = period(text)
        # Last interior page contains explicitly dated exceptional local rotations.
        exceptional = interior and 'SOUS SECTION AZAGUIE' in text
        if not exceptional and not intersects(weekly, first, last):
            continue
        current_period = None if exceptional else weekly
        city, area, hours = None, None, None
        block = None
        page_count = 0
        expected_count = 0

        def flush():
            nonlocal block, page_count
            if block is None:
                return
            first_line = block['lines'][0]
            content = '\n'.join(block['lines'])
            block = None
            if not intersects(current_period, first, last):
                return
            if not city:
                raise ValueError(f'No locality on page {page_index}: {content}')
            name = re.split(r'/|\s*[-–]\s*TEL\b', first_line, maxsplit=1)[0].strip()
            tel = re.search(r'\bTEL\s*[.:：]?\s*', content)
            if not tel:
                raise ValueError(f'Missing telephone marker: {content}')
            # Never retain the pharmacist personal name between pharmacy and TEL.
            tail = content[tel.end():]
            phones = [m.group().strip() for m in PHONE_RE.finditer(tail)]
            # Address begins after the initial sequence of phone fields. Preserve
            # eight-digit phones as raw, but never expand them to ten digits.
            address_tail = tail
            while True:
                address_tail = address_tail.lstrip(' /.,;–-\n\r\t')
                m = PHONE_RE.match(address_tail)
                if not m:
                    # Abbreviated alternate endings such as '/33 82' are not phones.
                    short = re.match(r'(?:\d{2}\s+\d{2})(?=\s*/|\s+[A-Z])|\d{2}\s*/', address_tail)
                    if short:
                        address_tail = address_tail[short.end():]
                        continue
                    break
                address_tail = address_tail[m.end():]
            address = clean(address_tail.strip(' /.,;–-\n\r\t')) or None
            notes = ['Planning publié, ouverture effective non vérifiée : appeler avant de se déplacer.']
            if hours:
                notes.append(hours)
            if not address:
                notes.append('Adresse précise non indiquée dans le document primaire.')
            invalid = [p for p in phones if not callable_phone(p)]
            if invalid:
                notes.append('Numéro(s) non converti(s) en lien appel : format ancien ou préfixe non validé : ' + ' / '.join(invalid))
            item = {
                'category': 'pharmacy', 'name': name, 'city': city, 'address': address,
                'lat': None, 'lon': None, 'phones': list(dict.fromkeys(phones)),
                'callable_phones': list(dict.fromkeys(c for p in phones if (c := callable_phone(p)))),
                'source_url': doc['url'], 'source_label': LABEL, 'source_kind': 'professional',
                'retrieved_at': doc['retrieved_at'], 'source_updated_at': '2026-11-04',
                'duty_periods': [{'start': current_period[0].isoformat(), 'end': current_period[1].isoformat(),
                                  'source_url': doc['url'], 'source_label': LABEL, 'confidence': 'primary',
                                  'source_page': page_index, 'hours_note': hours}],
                'location_precision': 'address' if address else 'city',
                'location_source_url': doc['url'] if address else None,
                'notes': notes, 'area': area,
                'evidence': [{'file': 'data/evidence/pharmacy/' + doc['file'], 'page': page_index}],
            }
            all_records.append(item)
            page_count += 1

        for raw_line in text.splitlines():
            line = clean(raw_line)
            if not line:
                continue
            if line.startswith(('TOUR DE GARDE', 'SEMAINE DU')):
                continue
            if exceptional:
                if line.startswith('SOUS SECTION'):
                    flush()
                    city = line.removeprefix('SOUS SECTION').strip().removeprefix('DE ').strip()
                    area = city
                    continue
                p = period(line)
                if p:
                    flush()
                    current_period = p
                    hours = 'Rotation locale : dates de début et de fin reproduites telles que publiées ; heure de relève non précisée.'
                    # A local rotation can start on the same line as the pharmacy.
                    if not START_RE.search(line):
                        continue
            if line.upper().startswith('PERMANENCE'):
                flush()
                hours = line
                continue
            if not interior:
                if line.startswith('SECTION '):
                    flush()
                    section = re.sub(r'^SECTION\s+(?:D[’\x27]|DE\s+|DU\s+)', '', line).strip()
                    city, area = section, section
                    continue
                if line in AREA_HEADINGS:
                    flush()
                    city, area = AREA_HEADINGS[line], line
                    continue
            match = START_RE.search(line)
            if match:
                # A real pharmacy starts a line (optionally after a locality or
                # sector). Street directions merely mentioning one are not rows.
                prefix = line[:match.start()].strip()
                locality_prefix = interior and ((not raw_line.startswith(' ') and len(prefix) <= 25) or (exceptional and period(line) is not None))
                if prefix and not (locality_prefix or re.fullmatch(r'Secteur\s+\d+', prefix)):
                    if block is not None:
                        block['lines'].append(line)
                    continue
                flush()
                if interior and not exceptional and prefix:
                    if len(prefix) > 25:
                        raise ValueError(f'Unexpected locality prefix: {prefix}')
                    city, area = prefix, prefix
                    hours = 'PERMANENCE 24H/24H (sauf restriction locale précisée)'
                if intersects(current_period, first, last):
                    expected_count += 1
                block = {'lines': [line[match.start():]]}
            elif re.fullmatch(r'Secteur\s+\d+', line):
                flush()
            elif block is not None:
                block['lines'].append(line)
        flush()
        if page_count != expected_count:
            raise ValueError(f'Extraction incomplete on page {page_index}: {page_count}/{expected_count}')
        checks.append({'page': page_index, 'expected_records': expected_count, 'extracted_records': page_count})
    (EVIDENCE / doc['file'].replace('.pdf', '.txt')).write_text('\n\f\n'.join(texts))
    return all_records, {'url': doc['url'], 'total_pdf_pages': len(reader.pages), 'selected_pages': checks}


def merge_records(records):
    merged = {}
    for r in records:
        key = norm(r['city']) + ':' + norm(r['name'])
        if key not in merged:
            r['id'] = 'pharmacy-' + hashlib.sha256(key.encode()).hexdigest()[:20]
            merged[key] = r
        else:
            previous = merged[key]
            for field in ['phones', 'callable_phones', 'evidence', 'notes']:
                for value in r[field]:
                    if value not in previous[field]:
                        previous[field].append(value)
            for duty in r['duty_periods']:
                if duty not in previous['duty_periods']:
                    previous['duty_periods'].append(duty)
            if not previous['address'] and r['address']:
                for field in ['address', 'location_precision', 'location_source_url']:
                    previous[field] = r[field]
    return sorted(merged.values(), key=lambda r: (norm(r['city']), norm(r['name'])))


def validate(data):
    records = data['records']
    assert records and len(records) == len({r['id'] for r in records})
    for r in records:
        assert r['category'] == 'pharmacy' and r['city'] and r['name']
        assert not re.search(r'/\s*(?:M\.|MME|PROF)', r['name'])
        assert r['lat'] is None and r['lon'] is None
        assert r['duty_periods']
        for phone in r['callable_phones']:
            assert re.fullmatch(r'\+225(?:01|05|07|25|27)\d{8}', phone)
        for p in r['duty_periods']:
            assert p['start'] <= p['end'] and p['confidence'] == 'primary'
    assert data['coverage']['record_count'] == len(records)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--week-start', default='2026-11-09')
    ap.add_argument('--week-end', default='2026-11-15')
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--require-live', action='store_true')
    args = ap.parse_args()
    first, last = date.fromisoformat(args.week_start), date.fromisoformat(args.week_end)
    if first > last or first < date(2026, 11, 1) or last > date(2026, 11, 30):
        ap.error('This verified collector only covers November 2026; review primary sources for another month.')
    if args.offline and args.require_live:
        ap.error('--offline and --require-live are incompatible')
    manifest, retrieval = load_documents(args)
    raw, checks = [], []
    for doc in manifest['documents']:
        items, check = parse_pdf(doc, first, last)
        raw.extend(items)
        checks.append(check)
    records = merge_records(raw)
    counts = Counter((p['start'], p['end']) for r in records for p in r['duty_periods'])
    coverage = {
        'requested_week': {'start': first.isoformat(), 'end': last.isoformat()},
        'country': "Côte d’Ivoire", 'record_count': len(records), 'raw_duty_entries': len(raw),
        'deduplicated_entries': len(raw) - len(records),
        'period_counts': [{'start': a, 'end': b, 'entries': n} for (a, b), n in sorted(counts.items())],
        'locality_counts': dict(sorted(Counter(r['city'] for r in records).items())),
        'address_count': sum(bool(r['address']) for r in records),
        'coordinate_count': 0, 'phone_record_count': sum(bool(r['phones']) for r in records),
        'callable_phone_record_count': sum(bool(r['callable_phones']) for r in records),
        'source_extraction_checks': checks, 'retrieval': retrieval,
        'not_exhaustive_national_directory': True,
        'warnings': [
            'Semaine civile demandée, et non période de garde : les rotations restent inchangées.',
            'Couverture des deux PDF UNPPCI publiés pour novembre, pas garantie de couverture de toute officine ivoirienne.',
            'Azaguié et Bondoukou : rotations samedi–samedi ; Oumé : lundi–dimanche.',
            'Heure de relève non publiée : ne pas interpréter les dates partagées comme double ouverture garantie.',
            'Certaines permanences locales ont des horaires restreints (voir notes, notamment Manuella à Gagnoa).',
            'Aucun point GPS de pharmacie vérifié ; aucune coordonnée de centre-ville substituée.',
            'Téléphones anciens conservés sans réparation ; préfixes non validés exclus des liens appel.',
            'Appeler avant déplacement ; ni horaires ni disponibilité effective vérifiés par appel.',
        ],
    }
    sources = [{'url': PRIMARY_ARTICLE, 'label': LABEL, 'kind': 'professional',
                'retrieved_at': manifest['retrieved_at'], 'source_updated_at': '2026-11-04',
                'notes': 'Article primaire consulté dans un navigateur ; les deux documents complets sont conservés.'}]
    sources.extend({'url': d['url'], 'label': LABEL + (' — intérieur' if '994' in d['file'] else ' — Abidjan et environs'),
                    'kind': 'professional', 'retrieved_at': d['retrieved_at'], 'sha256': d['sha256'],
                    'evidence_file': 'data/evidence/pharmacy/' + d['file']} for d in manifest['documents'])
    data = {'records': records, 'sources': sources, 'coverage': coverage}
    validate(data)
    out = ROOT / 'data/pharmacies.json'
    temporary = out.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(out)
    print(json.dumps(coverage, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
