from langchain_ollama import ChatOllama

model = ChatOllama(
    model="qwen3:8b",
    temperature=0,
    num_ctx=4096,
)

response = model.invoke(
    "You are Dayglow, a daily planning assistant. "
    "Reply with one short greeting."
)
print(response.content)