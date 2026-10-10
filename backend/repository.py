"""Mock data boundary. Replace these readers with real calendar/task connectors."""
from copy import deepcopy

WORK = [
    dict(id='w1', title='Build Project Copilot prototype', minutes=120, priority=True, deadline=1080, earliest=540, meta='High priority · Due today'),
    dict(id='w2', title='Finish client strategy proposal', minutes=90, priority=False, deadline=1080, earliest=540, meta='Due tomorrow · 90 min'),
    dict(id='w3', title='Review Maya’s design updates', minutes=20, priority=True, deadline=780, earliest=540, meta='Before 1 PM · 20 min'),
    dict(id='w4', title='Reply to the engineering team', minutes=15, priority=False, deadline=1080, earliest=540, meta='This week · 15 min'),
]
HOME = [
    dict(id='h1', title='Pick up groceries', minutes=20, priority=False, deadline=1080, earliest=990, meta='On the way home · 20 min'),
    dict(id='h2', title='Pay electricity bill', minutes=5, priority=True, deadline=1080, earliest=540, meta='Due today · 5 min'),
    dict(id='h3', title='Book annual dentist visit', minutes=10, priority=False, deadline=1080, earliest=540, meta='This week · 10 min'),
]
CALENDAR = [
    dict(id='c1', title='Team standup', start=540, end=570, kind='calendar'),
    dict(id='lunch', title='Lunch & a little fresh air', start=720, end=780, kind='break'),
    dict(id='c2', title='Design review with Maya', start=780, end=825, kind='calendar'),
    dict(id='c3', title='Coffee with Jamie', start=960, end=990, kind='calendar'),
]


def get_context(day: str):
    """Times are local minutes from midnight on the requested day."""
    return {"calendar":deepcopy(CALENDAR), "work":deepcopy(WORK), "home":deepcopy(HOME)}
