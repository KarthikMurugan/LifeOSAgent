import os
import logging
import sqlite3
from contextlib import asynccontextmanager
from datetime import date as Date
from pathlib import Path
from threading import RLock
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel, Field, model_validator, field_validator
from backend.planner import build_graph
from backend.repository import get_context
from backend.agent_service import run_agent

ROOT = Path(__file__).resolve().parent.parent
logger = logging.getLogger(__name__)

class Event(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    start: int = Field(ge=0, lt=1440)
    end: int = Field(gt=0, le=1440)
    kind: str = 'calendar'
    @model_validator(mode='after')
    def ordered(self):
        if self.end <= self.start:
            raise ValueError('Event end must follow start')
        return self

class Task(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    minutes: int = Field(gt=0, le=1440)
    priority: bool = False
    earliest: int = Field(default=540, ge=0, lt=1440)
    deadline: int = Field(default=1080, gt=0, le=1440)
    meta: str = ''
    @model_validator(mode='after')
    def ordered(self):
        if self.deadline <= self.earliest:
            raise ValueError('Deadline must follow earliest start')
        return self

class PlanRequest(BaseModel):
    thread_id: UUID = Field(default_factory=uuid4)
    date: Date = Field(default_factory=Date.today)
    timezone: str = 'America/Los_Angeles'
    day_start: int = Field(default=540, ge=0, lt=1440)
    day_end: int = Field(default=1080, gt=0, le=1440)
    completed_ids: list[str] = Field(default_factory=list, max_length=200)
    calendar: list[Event] | None = Field(default=None, max_length=200)
    work: list[Task] | None = Field(default=None, max_length=200)
    home: list[Task] | None = Field(default=None, max_length=200)
    @field_validator('timezone')
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError('Unknown timezone')
        return value
    @model_validator(mode='after')
    def valid_day(self):
        if self.day_end <= self.day_start:
            raise ValueError('Day end must follow start')
        context = get_context(str(self.date))
        for key in ['calendar','work','home']:
            items = getattr(self, key)
            if items is not None:
                context[key] = [item.model_dump() for item in items]
        ids = [item['id'] for group in context.values() for item in group]
        if len(ids) != len(set(ids)):
            raise ValueError('Calendar and task IDs must be unique across all sources')
        return self


class ChatRequest(PlanRequest):
    message: str = Field(min_length=1, max_length=2000)


def create_app(db_path=None):
    @asynccontextmanager
    async def lifespan(app):
        path = Path(db_path or os.environ.get('DAYGLOW_DB', ROOT/'backend/data/checkpoints.sqlite'))
        path.parent.mkdir(parents=True, exist_ok=True)
        agent_path = path.parent / 'api-agent-checkpoints.sqlite'
        with (
            sqlite3.connect(str(path), check_same_thread=False) as conn,
            sqlite3.connect(str(agent_path), check_same_thread=False) as agent_conn,
        ):
            app.state.graph = build_graph(SqliteSaver(conn))
            app.state.lock = RLock()
            app.state.agent_memory = SqliteSaver(agent_conn)
            app.state.agent_lock = RLock()
            yield
    app = FastAPI(title='Dayglow API', lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:4173', 'http://127.0.0.1:4173'], allow_methods=['GET','POST'], allow_headers=['Content-Type'])

    @app.get('/api/health')
    def health():
        return {'status':'ok', 'planner':'LangGraph', 'mode':'rule-based demo'}

    @app.get('/api/calendar')
    def calendar(date: Date = Query(default_factory=Date.today)):
        return {'date':str(date), 'items':get_context(str(date))['calendar'], 'source':'mock'}

    @app.get('/api/work')
    def work(date: Date = Query(default_factory=Date.today)):
        return {'date':str(date), 'items':get_context(str(date))['work'], 'source':'mock'}

    @app.get('/api/home')
    def home(date: Date = Query(default_factory=Date.today)):
        return {'date':str(date), 'items':get_context(str(date))['home'], 'source':'mock'}

    def execute_plan(request: PlanRequest):
        config = {'configurable':{'thread_id':str(request.thread_id)}}
        with app.state.lock:
            state = app.state.graph.invoke({'request':request.model_dump(mode='json')}, config)
        return {'thread_id':str(request.thread_id), 'date':str(request.date), 'timezone':request.timezone, 'run_count':state['run_count'], 'summary':state['summary'], 'blocks':state['blocks'], 'calendar':state['context']['calendar'], 'conflicts':state['conflicts'], 'deferred':state['deferred'], 'activity':state['activity']}

    @app.post('/api/plan')
    def plan(request: PlanRequest):
        return execute_plan(request)

    def call_agent(request, message, require_plan=False):
        payload = request.model_dump(mode='json', exclude={'message'})
        try:
            # This lock is separate from the scheduler lock used by tool calls.
            with app.state.agent_lock:
                return run_agent(
                    request=payload,
                    message=message,
                    memory=app.state.agent_memory,
                    make_plan=lambda: execute_plan(request),
                    require_plan=require_plan,
                )
        except Exception as exc:
            logger.exception('Local agent request failed')
            raise HTTPException(
                status_code=502,
                detail='The local agent could not complete this request.',
            ) from exc

    @app.post('/api/agent/plan')
    def agent_plan(request: PlanRequest):
        return call_agent(
            request,
            'Plan my day using the current data and explain the result.',
            require_plan=True,
        )

    @app.post('/api/chat')
    def chat(request: ChatRequest):
        return call_agent(request, request.message)

    @app.get('/api/plan/{thread_id}')
    def saved_plan(thread_id: UUID):
        with app.state.lock:
            snapshot = app.state.graph.get_state({'configurable':{'thread_id':str(thread_id)}})
        if not snapshot.values:
            raise HTTPException(404, 'No plan saved for this session')
        return snapshot.values

    app.mount('/', StaticFiles(directory=ROOT/'dist', html=True), name='frontend')
    return app

app = create_app()
