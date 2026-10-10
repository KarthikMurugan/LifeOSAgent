from datetime import date

from langchain.tools import tool

from backend.repository import get_context


@tool
def get_calendar() -> list[dict]:
    """Get today's calendar events.

    Start and end times are local minutes after midnight.
    """
    context = get_context(date.today().isoformat())
    return context["calendar"]


@tool
def get_work_tasks() -> list[dict]:
    """Get today's work tasks, durations, priorities and deadlines."""
    return get_context(date.today().isoformat())["work"]


@tool
def get_home_tasks() -> list[dict]:
    """Get today's home tasks, durations and scheduling constraints."""
    return get_context(date.today().isoformat())["home"]