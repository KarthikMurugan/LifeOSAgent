from pathlib import Path
from threading import RLock
from uuid import NAMESPACE_URL, uuid5

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_ollama import ChatOllama
from langgraph.checkpoint.sqlite import SqliteSaver

from backend.main import PlanRequest
from backend.planner import build_graph
from backend.tools import (
    get_calendar,
    get_home_tasks,
    get_work_tasks,
)


def main():
    # A file-backed database survives restarting this script.
    database = (
        Path(__file__).resolve().parent
        / "data"
        / "agent-checkpoints.sqlite"
    )
    database.parent.mkdir(parents=True, exist_ok=True)

    session = input("Session name [learning-session]: ").strip()
    session = session or "learning-session"

    request = PlanRequest(
        thread_id=uuid5(NAMESPACE_URL, f"dayglow:{session}")
    )
    planner_database = database.parent / "planner-checkpoints.sqlite"
    planner_lock = RLock()
    captured = {}

    config = {
        "configurable": {"thread_id": session},
        "recursion_limit": 12,
    }

    model = ChatOllama(
        model="qwen3:8b",
        temperature=0,
        num_ctx=8192,
    )

    with (
        SqliteSaver.from_conn_string(str(database)) as memory,
        SqliteSaver.from_conn_string(str(planner_database)) as planner_memory,
    ):
        planner = build_graph(planner_memory)

        @tool
        def build_day_plan() -> dict:
            """Build today's schedule using calendar, work and home data.

            Preserve commitments and report conflicts and deferred tasks.
            Times are local minutes after midnight.
            """
            with planner_lock:
                state = planner.invoke(
                    {"request": request.model_dump(mode="json")},
                    config={
                        "configurable": {
                            "thread_id": str(request.thread_id)
                        }
                    },
                )

            plan = {
                "summary": state["summary"],
                "calendar": state["context"]["calendar"],
                "blocks": state["blocks"],
                "conflicts": state["conflicts"],
                "deferred": state["deferred"],
                "activity": state["activity"],
            }
            captured["plan"] = plan
            return plan

        agent = create_agent(
            model=model,
            tools=[
                get_calendar,
                get_work_tasks,
                get_home_tasks,
                build_day_plan,
            ],
            checkpointer=memory,
            system_prompt=(
                f"You are Dayglow. The current planning date is {request.date}. "
                "Use the appropriate tool for current calendar, work or home data. "
                "Never invent tasks or events. "
                "For a new plan or replan, always call build_day_plan. "
                "Explain the returned schedule without inventing time slots. "
                "Mention conflicts and deferred tasks. "
                "For explanations of a previous plan, use conversation history. "
                "The scheduler uses deadlines, priority and available time; "
                "it does not currently apply personal preferences. "
                "You cannot change tasks or calendar events. "
                "Convert minutes after midnight to readable clock times. "
                "Keep answers concise."
            ),
        )

        print("Type /bye to exit.")

        while True:
            user_message = input("\nYou: ").strip()

            if user_message == "/bye":
                break

            if not user_message:
                continue

            captured.clear()
            result = agent.invoke(
                {
                    "messages": [
                        {"role": "user", "content": user_message}
                    ]
                },
                config=config,
            )

            print("\nDayglow:", result["messages"][-1].content)

            if "plan" in captured:
                plan = captured["plan"]
                print(
                    "Planning tool executed:",
                    len(plan["blocks"]),
                    "tasks scheduled;",
                    len(plan["conflicts"]),
                    "calendar conflicts.",
                )

            snapshot = agent.get_state(config)
            print(
                "Saved messages:",
                len(snapshot.values.get("messages", [])),
            )


if __name__ == "__main__":
    main()
