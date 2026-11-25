FROM python:3.12-slim

WORKDIR /app

# 安裝相依套件（包含 faiss-cpu 與 fastapi）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製後端與前端靜態檔案
COPY app ./app
COPY static ./static

# 雲端平台會自動注入 PORT 環境變數，預設 8000
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]