from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from backend.repository import get_context

class PlanState(TypedDict, total=False):
    request: dict
    context: dict
    conflicts: list
    blocks: list
    deferred: list
    activity: list
    run_count: int
    summary: str

def gather(state):
    req = state['request']
    context = get_context(req['date'])
    context.update({key:req[key] for key in ['calendar','work','home'] if req.get(key) is not None})
    return dict(context=context, run_count=state.get('run_count', 0)+1, activity=[dict(title='Context retrieved', detail=f"{len(context['calendar'])} calendar blocks, {len(context['work'])} work tasks, {len(context['home'])} home tasks")])

def conflicts(state):
    events = sorted(state['context']['calendar'], key=lambda e: e['start'])
    found = []
    for i, event in enumerate(events):
        for other in events[i+1:]:
            if other['start'] >= event['end']:
                break
            found.append(dict(first=event['id'], second=other['id'], description=f"{event['title']} overlaps {other['title']}. Please resolve these commitments."))
    return dict(conflicts=found, activity=state['activity']+[dict(title='Conflicts checked', detail=f'{len(found)} calendar conflicts found')])

def schedule(state):
    req = state['request']
    busy = [(e['start'], e['end']) for e in state['context']['calendar']]
    blocks, deferred = [], []
    tasks = [dict(t, kind=group) for group in ['work', 'home'] for t in state['context'][group] if t['id'] not in req['completed_ids']]
    tasks.sort(key=lambda t: (t['deadline'], not t['priority'], t['id']))
    for task in tasks:
        start = max(req['day_start'], task['earliest'])
        limit = min(req['day_end'], task['deadline'])
        for left, right in sorted(busy):
            if right <= start:
                continue
            if start + task['minutes'] <= left:
                break
            start = max(start, right)
        if start + task['minutes'] <= limit:
            block = dict(id=task['id'], title=task['title'], start=start, end=start+task['minutes'], kind=task['kind'])
            blocks.append(block)
            busy.append((block['start'], block['end']))
        else:
            deferred.append(dict(id=task['id'], title=task['title'], reason='No uninterrupted time available before its deadline.'))
    return dict(blocks=sorted(blocks, key=lambda e:e['start']), deferred=deferred, activity=state['activity']+[dict(title='Tasks scheduled', detail=f'{len(blocks)} scheduled, {len(deferred)} deferred; existing commitments preserved')])

def validate(state):
    blocks = state['blocks']
    for i, block in enumerate(blocks):
        for other in state['context']['calendar'] + blocks[i+1:]:
            if max(block['start'], other['start']) < min(block['end'], other['end']):
                raise ValueError('Planner produced overlapping task blocks')
    return dict(activity=state['activity']+[dict(title='Plan validated', detail='Scheduled tasks fit around your commitments and deadlines')])

def summarize(state):
    summary = f"Your plan is ready: {len(state['blocks'])} tasks scheduled."
    if state['conflicts']:
        summary += f" {len(state['conflicts'])} calendar conflict(s) need your attention. " + ' '.join(c['description'] for c in state['conflicts'])
    if state['deferred']:
        summary += ' Deferred: ' + ', '.join(t['title'] for t in state['deferred']) + '.'
    return dict(summary=summary, activity=state['activity']+[dict(title='Daily plan prepared', detail=summary)])

def build_graph(checkpointer):
    graph = StateGraph(PlanState)
    nodes = [('gather_context', gather), ('detect_conflicts', conflicts), ('schedule_tasks', schedule), ('validate_plan', validate), ('summarize', summarize)]
    previous = START
    for name, function in nodes:
        graph.add_node(name, function)
        graph.add_edge(previous, name)
        previous = name
    graph.add_edge(previous, END)
    return graph.compile(checkpointer=checkpointer)
