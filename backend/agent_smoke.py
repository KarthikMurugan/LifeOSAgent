from langchain.agents import create_agent
from langchain_ollama import ChatOllama

from backend.tools import get_calendar, get_home_tasks, get_work_tasks


model = ChatOllama(
    model="qwen3:8b",
    temperature=0,
    num_ctx=4096,
)

agent = create_agent(
    model=model,
    tools=[get_calendar, get_work_tasks, get_home_tasks],
    system_prompt=(
        "You are Dayglow, a daily planning assistant. "
        "For calendar questions, call get_calendar before answering. "
        "Never invent events. "
        "Convert minutes after midnight to readable clock times. "
        "Keep your answer concise."
    ),
)

result = agent.invoke(
    {
        "messages": [
            {
                "role": "user",
                "content": "What are my work tasks for today?",
            }
        ]
    },
    config={"recursion_limit": 12},
)

for message in result["messages"]:
    message.pretty_print()