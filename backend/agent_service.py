"""Ollama agent boundary shared by the API's planning and chat endpoints."""
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_ollama import ChatOllama

from backend.repository import get_context


def readable_block(block):
    """Give the model exact clock labels without changing the scheduler result."""
    def clock(minutes):
        hour, minute = divmod(minutes, 60)
        return f"{hour % 12 or 12}:{minute:02d} {'AM' if hour < 12 else 'PM'}"

    return {**block, "time": f"{clock(block['start'])}–{clock(block['end'])}"}


def run_agent(request, message, memory, make_plan, require_plan=False):
    # Capture only a plan generated during this invocation, never an old message.
    captured = {}
    context = get_context(request["date"])
    for source in ("calendar", "work", "home"):
        if request.get(source) is not None:
            context[source] = request[source]

    completed = set(request["completed_ids"])
    for source in ("work", "home"):
        context[source] = [
            task for task in context[source] if task["id"] not in completed
        ]

    @tool
    def get_calendar() -> list[dict]:
        """Get the requested day's calendar. Times are minutes after midnight."""
        return [readable_block(event) for event in context["calendar"]]

    @tool
    def get_work_tasks() -> list[dict]:
        """Get incomplete work tasks, durations and scheduling constraints."""
        return context["work"]

    @tool
    def get_home_tasks() -> list[dict]:
        """Get incomplete home tasks, durations and scheduling constraints."""
        return context["home"]

    @tool
    def build_day_plan() -> dict:
        """Build a schedule preserving commitments; report conflicts and deferrals."""
        plan = make_plan()
        captured["plan"] = plan
        # Omit verbose activity records from model context; the API retains them.
        return {
            "date": plan["date"],
            "summary": plan["summary"],
            "calendar": [readable_block(event) for event in plan["calendar"]],
            "blocks": [readable_block(block) for block in plan["blocks"]],
            "conflicts": plan["conflicts"],
            "deferred": plan["deferred"],
        }

    model = ChatOllama(model="qwen3:8b", temperature=0, num_ctx=8192)
    agent = create_agent(
        model=model,
        tools=[get_calendar, get_work_tasks, get_home_tasks, build_day_plan],
        checkpointer=memory,
        system_prompt=(
            f"You are Dayglow. Planning date: {request['date']}. "
            f"Timezone: {request['timezone']}. "
            f"Completed task IDs: {request['completed_ids']}. "
            "Use tools for current calendar and task information. "
            "Always call build_day_plan for a new plan or replan. "
            "Explain only the schedule returned by the tool. "
            "Mention conflicts and deferred tasks. "
            "Use conversation history for follow-up explanations, "
            "but retrieve fresh data for new planning requests. "
            "The scheduler follows deadlines, priority and available time; "
            "it does not apply personal preferences. "
            "You cannot modify tasks or calendar events. "
            "Copy each event or task's time label exactly as returned by tools. "
            "Do not recalculate, move, shorten or extend any time slot. "
            "Keep answers concise."
        ),
    )
    result = agent.invoke(
        {"messages": [{"role": "user", "content": message}]},
        config={
            "configurable": {"thread_id": f"copilot:{request['thread_id']}"},
            "recursion_limit": 12,
        },
    )
    if require_plan and "plan" not in captured:
        raise RuntimeError("The agent did not execute the planning tool.")

    return {"reply": result["messages"][-1].text, "plan": captured.get("plan")}
