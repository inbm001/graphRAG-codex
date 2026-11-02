"""Validate references, year coverage, and checked-in sample totals."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'output/knowledge-graph.json').read_text(encoding='utf-8'))
nodes = {n['id']: n for n in data['nodes']}
edges = data['relationships']
assert len(nodes) == len(data['nodes']) == 269
assert len(edges) == 345
assert all(e['source'] in nodes and e['target'] in nodes for e in edges)
budgets = [n for n in nodes.values() if n['label'] == 'BudgetAllocation']
assert sum(n['amount'] for n in budgets if n['year'] == 2026) == 106542798
for project in (n for n in nodes.values() if n['label'] == 'Project'):
    records = [nodes[e['target']] for e in edges if e['source'] == project['id'] and e['type'] == 'HAS_BUDGET']
    assert {n['year'] for n in records} == {2025, 2026}
for n in nodes.values():
    relation = 'HAS_EXPENSE' if n['label'] == 'BudgetAllocation' and n['year'] == 2026 else 'HAS_LINE_ITEM' if n['label'] == 'ExpenseAllocation' else None
    if relation:
        children = [nodes[e['target']] for e in edges if e['source'] == n['id'] and e['type'] == relation]
        assert children and sum(c['amount'] for c in children) == n['amount'], n['id']
print('PASS: 269 nodes, 345 edges, references, year coverage, budget and expense totals')
