FROM python:3.11-alpine

RUN pip install --no-cache-dir gallery-dl requests

WORKDIR /app
COPY bot.py .

CMD ["python", "-u", "bot.py"]
