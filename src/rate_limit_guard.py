import json
from pathlib import Path
from datetime import date
from google.genai import errors


class QuotaExceededError(Exception):
    pass


class RateLimitGuard:
    #Google doesn't expose your exact free-tier limits through the API -
    #check yours at https://aistudio.google.com/rate-limit and adjust
    #daily_limit to match. This default is a conservative placeholder,
    #not an official number.
    def __init__(self, name, daily_limit=500):
        self.name = name
        self.daily_limit = daily_limit
        self.state_file = Path(f"data/.rate_limit_{name}.json")

    def _load_state(self):
        if not self.state_file.exists():
            return {"date": str(date.today()), "count": 0}

        with open(self.state_file, "r", encoding="utf-8") as f:
            state = json.load(f)

        #start a fresh count if it's a new day
        if state.get("date") != str(date.today()):
            return {"date": str(date.today()), "count": 0}

        return state

    def _save_state(self, state):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(state, f)

    #call before making an API request - refuses if this request would push
    #us over the cap. count = how many quota units this request uses (e.g.
    #Google counts each text in a batch as its own unit, not each API call)
    def check_and_increment(self, count=1):
        state = self._load_state()

        if state["count"] + count > self.daily_limit:
            raise QuotaExceededError(
                f"[{self.name}] This request ({count} unit(s)) would exceed the daily limit "
                f"({state['count']}/{self.daily_limit} used so far). Refusing to send it to "
                f"avoid exceeding the free tier. Check your real usage/limits at "
                f"https://aistudio.google.com/rate-limit"
            )

        state["count"] += count
        self._save_state(state)

    #wraps an API call: checks the local cap first, and turns Google's own
    #429 quota error into the same clear exception type if we ever hit that
    def call(self, api_function, *args, count=1, **kwargs):
        self.check_and_increment(count=count)

        try:
            return api_function(*args, **kwargs)
        except errors.APIError as e:
            if e.code == 429:
                raise QuotaExceededError(
                    f"[{self.name}] Google's API reports the quota is exceeded: {e.message}"
                ) from e
            raise
