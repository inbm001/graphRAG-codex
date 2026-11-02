"""Document-specific, reviewable extraction. Not a general PDF parser."""
import json, re, csv, argparse
from pathlib import Path

OUT = Path('output'); OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pdf', type=Path, help='Original PDF (not distributed)')
parser.add_argument('--text-json', type=Path, default=Path('tmp/pdfs/extracted.json'))
args = parser.parse_args()
if args.pdf:
    import pdfplumber
    with pdfplumber.open(args.pdf) as document:
        pages = [dict(page=i+1, text=page.extract_text(layout=False) or '') for i, page in enumerate(document.pages)]
else:
    if not args.text_json.exists():
        parser.error('Provide --pdf PATH or --text-json PATH. See README.md.')
    pages = json.loads(args.text_json.read_text(encoding='utf-8'))
nodes, edges = [], []
def node(kind, name, page, **props):
    ident = f'n{len(nodes)+1}'
    nodes.append(dict(id=ident, label=kind, name=name, pdf_page=page, printed_page=page+308, **props))
    return ident
def edge(a, rel, b, page):
    edges.append(dict(source=a, type=rel, target=b, pdf_page=page, basis='document_structure', schema_version='budget-v1'))
root = node('Organization', '미래청년기획관', 3)
doc = node('Document', '01-미래청년기획관.pdf', 1)
dept = policy = unit = project = allocation = expense = None
account = '일반회계'
triple = re.compile(r'([\d,]+) ([\d,]+) ([△\d,]+)$')
def number(s): return int(s.replace(',', '').replace('△', '-'))
for page in pages[4:]:
    p = page['page']; lines = page['text'].splitlines()
    for i, line in enumerate(lines):
        if line.startswith('(균형발전특별회계)'): account = '균형발전특별회계'
        elif line.startswith('(일반회계)'): account = '일반회계'
        match = triple.search(line)
        if match:
            title = line[:match.start()].strip()
            if not title: title = lines[i-1].strip()
            if title == '미래청년기획관': continue
            # Two policy headings wrap in the extracted reading order.
            if title == '관)':
                title = '정책 : ' + lines[i-2] + title
            if title.startswith('부서 :'):
                dept = node('Department', title.split('담당관')[0].replace('부서 : 미래청년기획관 ', '')+'담당관', p)
                edge(root, 'HAS_DEPARTMENT', dept, p)
                policy = unit = project = None
                continue
            if title.startswith('정책 :'):
                policy = node('Policy', title.replace('정책 :', '').strip(), p)
                edge(dept, 'HAS_POLICY', policy, p)
                unit = project = None
                continue
            if title.startswith('단위 :'):
                unit = node('UnitProgram', title.replace('단위 :', '').strip(), p, account=account)
                edge(policy, 'HAS_UNIT', unit, p)
                project = None
                continue
            project = node('Project', title, p, account=account)
            edge(unit, 'HAS_PROJECT', project, p)
            edge(dept, 'RESPONSIBLE_FOR', project, p)
            a,b,c = map(number, match.groups())
            assert b-a == c, (title, a,b,c)
            for year, amount in [(2025,a),(2026,b)]:
                aid = node('BudgetAllocation', f'{title} / {year}', p, year=year, amount=amount, unit='천원', amount_krw=amount*1000, account=account)
                edge(project, 'HAS_BUDGET', aid, p); edge(aid, 'EVIDENCED_BY', doc, p)
                if year == 2026: allocation = aid
            expense = None
        m = re.match(r'^\((\d{3}-\d{3}-\d{2})\) (.+) ([\d,]+)$', line)
        if m and allocation:
            code,name,amount = m.groups()
            expense = node('ExpenseAllocation', name, p, code=code, year=2026, amount=number(amount), unit='천원')
            edge(allocation, 'HAS_EXPENSE', expense, p)
        if line.startswith('ㅇ ') and expense:
            # Merge wrapped descriptions and their following amount line.
            text = line
            j=i+1
            while '=' not in text and j<len(lines) and not lines[j].startswith(('ㅇ','(')):
                text += ' '+lines[j]; j+=1
            m = re.match(r'ㅇ (.+?) ([\d,]+)원 = (?:\(X[\d,]+\) )?([\d,]+)$', text)
            if m:
                name,won,amount = m.groups()
                assert number(won)==number(amount)*1000
                item=node('LineItem',name,p,year=2026,amount=number(amount),unit='천원',raw_text=text)
                edge(expense,'HAS_LINE_ITEM',item,p)

# Structural validation, distinct from a complete visual audit.
ids={n['id'] for n in nodes}
assert all(e['source'] in ids and e['target'] in ids for e in edges)
for n in nodes:
    rel = 'HAS_EXPENSE' if n['label']=='BudgetAllocation' and n.get('year')==2026 else 'HAS_LINE_ITEM' if n['label']=='ExpenseAllocation' else None
    if rel:
        children=[next(x for x in nodes if x['id']==e['target']) for e in edges if e['source']==n['id'] and e['type']==rel]
        assert children and sum(c['amount'] for c in children)==n['amount'], (n,children)
data=dict(schema_version='budget-v1', status='draft_document_specific', scope='Detailed project budgets and expense breakdowns, PDF pages 5-14. Aggregate overview amounts and semantic classifications excluded.', nodes=nodes, relationships=edges)
(OUT/'knowledge-graph.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
projects=[n for n in nodes if n['label']=='Project']
with (OUT/'projects.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['id','name','account','pdf_page','printed_page','2025_thousand_krw','2026_thousand_krw'])
    for n in projects:
        children=[next(x for x in nodes if x['id']==e['target']) for e in edges if e['source']==n['id'] and e['type']=='HAS_BUDGET']
        w.writerow([n['id'],n['name'],n['account'],n['pdf_page'],n['printed_page']]+[x['amount'] for x in children])
print(json.dumps({'nodes':len(nodes),'relationships':len(edges),'projects':len(projects),'line_items':sum(n['label']=='LineItem' for n in nodes)},ensure_ascii=True))
