from threading import RLock

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_ollama import ChatOllama
from langgraph.checkpoint.sqlite import SqliteSaver

from backend.main import PlanRequest
from backend.planner import build_graph


def main():
    # Python controls the session, date and completed tasks.
    request = PlanRequest()
    captured = {}
    planner_lock = RLock()

    with SqliteSaver.from_conn_string(":memory:") as checkpointer:
        planner = build_graph(checkpointer)

        @tool
        def build_day_plan() -> dict:
            """Build today's plan using calendar, work and home data.

            Preserve fixed commitments and report conflicts or deferred
            tasks. Start and end times are minutes after midnight.
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

        model = ChatOllama(
            model="qwen3:8b",
            temperature=0,
            num_ctx=8192,
        )

        agent = create_agent(
            model=model,
            tools=[build_day_plan],
            system_prompt=(
                "You are Dayglow, a daily planning assistant. "
                "For planning requests, call build_day_plan. "
                "Explain only the returned plan. Never invent time slots. "
                "Convert minutes after midnight to readable clock times. "
                "Mention conflicts and deferred tasks when present. "
                "Do not claim to resolve conflicting calendar events. "
                "Keep your answer concise."
            ),
        )

        result = agent.invoke(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": "Plan my day and explain the schedule.",
                    }
                ]
            },
            config={"recursion_limit": 12},
        )

        for message in result["messages"]:
            message.pretty_print()

        # Verify that planning really executed.
        if "plan" not in captured:
            raise RuntimeError("The agent did not execute the planning tool.")

        plan = captured["plan"]
        print("\nScheduled tasks:", len(plan["blocks"]))
        print("Calendar conflicts:", len(plan["conflicts"]))
        print("Deferred tasks:", len(plan["deferred"]))


if __name__ == "__main__":
    main()