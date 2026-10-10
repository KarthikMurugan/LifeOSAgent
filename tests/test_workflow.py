from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path/'checkpoints.sqlite')) as client:
        yield client

def plan(client, **kwargs):
    response = client.post('/api/plan', json={'date':'2026-10-08', **kwargs})
    assert response.status_code == 200, response.text
    return response.json()

def test_full_workflow_and_static_frontend(client):
    for source, count in [('calendar',4), ('work',4), ('home',3)]:
        response = client.get('/api/'+source)
        assert response.status_code == 200
        assert len(response.json()['items']) == count
    result = plan(client)
    assert len(result['blocks']) == 7
    assert result['conflicts'] == result['deferred'] == []
    assert len(result['activity']) == 5
    assert result['run_count'] == 1
    assert 'Context retrieved' == result['activity'][0]['title']
    for i, block in enumerate(result['blocks']):
        for other in result['calendar'] + result['blocks'][i+1:]:
            assert max(block['start'],other['start']) >= min(block['end'],other['end'])
    assert next(b for b in result['blocks'] if b['id']=='w3')['end'] <= 780
    assert next(b for b in result['blocks'] if b['id']=='h1')['start'] >= 990
    assert client.get('/').status_code == 200
    assert './api.js' in client.get('/app.js').text
    assert client.get('/api.js').status_code == 200

def test_nested_calendar_conflicts_and_capacity(client):
    events = [dict(id='a',title='Workshop',start=540,end=1080),dict(id='b',title='Standup',start=600,end=630),dict(id='c',title='Review',start=640,end=670)]
    result = plan(client, calendar=events)
    assert {(c['first'],c['second']) for c in result['conflicts']} == {('a','b'),('a','c')}
    assert result['blocks'] == []
    assert len(result['deferred']) == 7
    assert result['calendar'] == [{**e,'kind':'calendar'} for e in events]
    assert 'need your attention' in result['summary']

def test_completed_tasks_replanning_and_thread_isolation(client):
    thread = str(uuid4())
    first = plan(client, thread_id=thread)
    second = plan(client, thread_id=thread, completed_ids=['w1','h2'])
    assert first['run_count'] == 1 and second['run_count'] == 2
    assert {'w1','h2'}.isdisjoint(b['id'] for b in second['blocks'])
    assert plan(client)['run_count'] == 1
    saved = client.get('/api/plan/'+thread).json()
    assert saved['run_count'] == 2
    assert saved['request']['completed_ids'] == ['w1','h2']

def test_checkpoint_survives_restart(tmp_path):
    path=tmp_path/'persistent.sqlite'
    thread=str(uuid4())
    with TestClient(create_app(path)) as first:
        plan(first, thread_id=thread, calendar=[],work=[],home=[])
    with TestClient(create_app(path)) as second:
        assert second.get('/api/plan/'+thread).json()['run_count'] == 1
        result=plan(second,thread_id=thread)
        assert result['run_count'] == 2
        assert len(result['blocks']) == 7  # Prior overrides cannot leak into a new request.

def test_short_window_defers_and_touching_events_do_not_conflict(client):
    result=plan(client,day_start=540,day_end=570,calendar=[dict(id='a',title='A',start=570,end=600),dict(id='b',title='B',start=600,end=630)])
    assert not result['conflicts']
    assert result['deferred']
    assert all(b['start']>=540 and b['end']<=570 for b in result['blocks'])

@pytest.mark.parametrize('payload',[
    {'timezone':'Bad/Timezone'}, {'date':'not-a-date'}, {'day_start':900,'day_end':800},
    {'calendar':[dict(id='a',title='Bad',start=600,end=590)]},
    {'work':[dict(id='w',title='Bad',minutes=-3)]},
    {'thread_id':'bad-id'},
    {'home':[dict(id='w1',title='Collision with default work task',minutes=10)]},
    {'work':[dict(id='w',title='One',minutes=10),dict(id='w',title='Two',minutes=10)]},
])
def test_invalid_inputs(client,payload):
    assert client.post('/api/plan',json=payload).status_code == 422

def test_unknown_session_and_source(client):
    assert client.get('/api/plan/'+str(uuid4())).status_code == 404
    assert client.get('/api/unknown').status_code == 404
