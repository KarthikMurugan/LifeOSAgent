"""Exercise the actual agent/tool/checkpoint loop without requiring Ollama."""
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from backend import agent_service
from backend.main import create_app


class ControlledModel(BaseChatModel):
    mode: str = 'normal'

    @property
    def _llm_type(self):
        return 'controlled-agent-api-test'

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        if self.mode == 'unavailable':
            raise OSError('Test model is unavailable')
        last = messages[-1]
        if self.mode == 'refuse':
            answer = AIMessage(content='A plan is ready without a tool.')
        elif isinstance(last, ToolMessage):
            answer = AIMessage(content=last.content)
        elif isinstance(last, HumanMessage) and 'plan my day' in last.content.lower():
            answer = AIMessage(content='', tool_calls=[{
                'name': 'build_day_plan', 'args': {}, 'id': f'call-{len(messages)}',
            }])
        elif isinstance(last, HumanMessage) and last.content == 'Get work tasks':
            answer = AIMessage(content='', tool_calls=[{
                'name': 'get_work_tasks', 'args': {}, 'id': f'call-{len(messages)}',
            }])
        else:
            history = [m for m in messages if isinstance(m, ToolMessage)]
            answer = AIMessage(content=history[-1].content if history else 'No previous plan')
        return ChatResult(generations=[ChatGeneration(message=answer)])


@pytest.fixture(autouse=True)
def controlled_model(monkeypatch):
    monkeypatch.setattr(agent_service, 'ChatOllama', lambda **kwargs: ControlledModel())


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / 'checkpoints.sqlite')) as client:
        yield client


def test_planning_followup_replan_and_isolation(client):
    payload = {'thread_id': str(uuid4()), 'date': '2026-10-10'}
    first = client.post('/api/agent/plan', json=payload)
    assert first.status_code == 200, first.text
    plan = first.json()['plan']
    assert len(plan['blocks']) == 7
    assert plan['run_count'] == 1
    followup = client.post('/api/chat', json={**payload, 'message': 'Explain previous schedule'})
    assert followup.status_code == 200
    assert followup.json()['plan'] is None
    remembered = json.loads(followup.json()['reply'])['blocks']
    assert [{k: v for k, v in b.items() if k != 'time'} for b in remembered] == plan['blocks']
    assert next(b for b in remembered if b['id'] == 'h1')['time'] == '4:30 PM–4:50 PM'
    isolated = client.post('/api/chat', json={'message': 'Explain previous schedule'})
    assert isolated.json() == {'reply': 'No previous plan', 'plan': None}
    replan = client.post('/api/agent/plan', json={**payload, 'completed_ids': ['w1']})
    assert replan.status_code == 200
    assert replan.json()['plan']['run_count'] == 2
    assert len(replan.json()['plan']['blocks']) == 6
    assert all(b['id'] != 'w1' for b in replan.json()['plan']['blocks'])


def test_agent_history_survives_restart(tmp_path):
    path = tmp_path / 'persistent.sqlite'
    payload = {'thread_id': str(uuid4())}
    with TestClient(create_app(path)) as first:
        saved = first.post('/api/agent/plan', json=payload).json()['plan']
    with TestClient(create_app(path)) as second:
        response = second.post('/api/chat', json={**payload, 'message': 'Explain previous schedule'})
        assert response.status_code == 200
        remembered = json.loads(response.json()['reply'])['blocks']
        assert [{k: v for k, v in b.items() if k != 'time'} for b in remembered] == saved['blocks']
        assert response.json()['plan'] is None


def test_fresh_tool_data_uses_overrides_and_completion(client):
    payload = {'thread_id': str(uuid4()), 'message': 'Get work tasks'}
    first = client.post('/api/chat', json=payload)
    assert len(json.loads(first.json()['reply'])) == 4
    custom = {'id': 'custom', 'title': 'Custom task', 'minutes': 10}
    second = client.post('/api/chat', json={**payload, 'work': [custom]})
    assert [t['id'] for t in json.loads(second.json()['reply'])] == ['custom']
    third = client.post('/api/chat', json={**payload, 'completed_ids': ['w1']})
    assert len(json.loads(third.json()['reply'])) == 3
    assert all(t['id'] != 'w1' for t in json.loads(third.json()['reply']))


def test_conflicts_and_deferrals_from_real_scheduler(client):
    response = client.post('/api/agent/plan', json={'calendar': [
        {'id': 'full-day', 'title': 'Workshop', 'start': 540, 'end': 1080},
        {'id': 'overlap', 'title': 'Meeting', 'start': 600, 'end': 630},
    ]})
    assert response.status_code == 200
    plan = response.json()['plan']
    assert len(plan['conflicts']) == 1
    assert not plan['blocks']
    assert len(plan['deferred']) == 7


@pytest.mark.parametrize('mode', ['refuse', 'unavailable'])
def test_agent_failure_returns_502(client, monkeypatch, mode):
    monkeypatch.setattr(agent_service, 'ChatOllama', lambda **kwargs: ControlledModel(mode=mode))
    response = client.post('/api/agent/plan', json={})
    assert response.status_code == 502
    assert response.json()['detail'] == 'The local agent could not complete this request.'


@pytest.mark.parametrize('payload', [
    {'message': ''}, {'message': 'x' * 2001},
    {'message': 'Hi', 'timezone': 'Bad/Timezone'},
    {'message': 'Hi', 'thread_id': 'invalid'},
])
def test_chat_request_validation(client, payload):
    assert client.post('/api/chat', json=payload).status_code == 422
