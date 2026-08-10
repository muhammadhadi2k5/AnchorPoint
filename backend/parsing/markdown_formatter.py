import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

from core.rate_limit_guard import raise_on_quota_exceeded

load_dotenv()

MODEL_NAME = "gemini-3.5-flash-lite"  # same model already used everywhere else in this app

SYSTEM_INSTRUCTION = (
    "You convert raw extracted document text into clean, well-structured markdown. Preserve "
    "every piece of information exactly as given, do not add, remove, or reinterpret anything. "
    "Section titles (short, standalone, usually shouty-cased lines like COMPOSITION or "
    "DOSAGE AND ADMINISTRATION) must become real markdown headers (## Title) on their own line, "
    "never bold text glued onto the sentence that follows it. Use bold only for genuinely inline "
    "emphasis within a sentence, not for headers. Format lists and tables where the structure is "
    "clear from the text. Respond with the markdown only, no commentary."
)



class MarkdownFormatter:

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")

        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=60000),
        )

    def format(self, raw_text):
        try:
            response = self.client.models.generate_content(
                model=MODEL_NAME,
                contents=raw_text,
                config=types.GenerateContentConfig(system_instruction=SYSTEM_INSTRUCTION),
            )
            return response.text
        except errors.APIError as e:
            # own name so a parse job hitting quota reads differently in the logs than chat or eval
            raise_on_quota_exceeded(e, "parse")
