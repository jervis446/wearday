"""Builds the Wearday website into ../docs from _layout.html and pages/*.html.

Each page starts with a header block:
<!--
title: Page title
description: One sentence
-->
Optional `head:` / `scripts:` blocks go in <!--head ... head--> and <!--scripts ... scripts-->.
Run: python3 site/build.py
"""
import datetime
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
OUT = ROOT.parent / 'docs'
layout = (ROOT / '_layout.html').read_text()
assets = b''.join(p.read_bytes() for p in sorted([*(OUT / 'assets').glob('*.js'), *(OUT / 'assets').glob('*.css')]))
version = hashlib.sha1(assets).hexdigest()[:8]

for src in sorted((ROOT / 'pages').glob('*.html')):
    text = src.read_text()
    meta_m = re.match(r'\s*<!--(.*?)-->', text, re.S)
    meta = dict(line.split(':', 1) for line in meta_m.group(1).strip().splitlines()) if meta_m else {}
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    body = text[meta_m.end():] if meta_m else text
    head = re.search(r'<!--head(.*?)head-->', body, re.S)
    scripts = re.search(r'<!--scripts(.*?)scripts-->', body, re.S)
    body = re.sub(r'<!--(head|scripts).*?(head|scripts)-->', '', body, flags=re.S)
    path = '' if src.name == 'index.html' else src.name
    html = (layout.replace('{{title}}', meta.get('title', 'Wearday'))
            .replace('{{description}}', meta.get('description', ''))
            .replace('{{path}}', path)
            .replace('{{year}}', str(datetime.date.today().year))
            .replace('{{head}}', head.group(1).strip() if head else '')
            .replace('{{scripts}}', scripts.group(1).strip() if scripts else '')
            .replace('{{content}}', body.strip())
            .replace('{{version}}', version))
    (OUT / src.name).write_text(html)
    print('built', src.name)
