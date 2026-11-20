"""Speech transcription prompt, ported 1:1 from the former Node GeminiClient.transcribeAudio.

tests/fixtures/transcribe/prompt.golden.txt is the exact prompt the Node code sent;
tests/test_transcribe_prompt.py compares against it. To change the wording on purpose, bump
PROMPT_VERSION and regenerate the fixture in the same change.
"""

PROMPT_VERSION = "transcribe_v1_node_parity"


def build_prompt() -> str:
    """The prompt has no inputs: the audio clip is the input and is sent alongside it."""
    return """You are an accurate multilingual speech-to-text transcriber for the FitOnus health app.
Transcribe the speech in this audio clip into text.
RULES:
1. Accurately support English, Tamil (தமிழ் script), and Tanglish (Tamil written phonetically in English script, e.g. "inniku leg workout mudichiten", "two dosai and sambar sapten").
2. Output your response STRICTLY as a VALID JSON object matching:
{
  "transcript": "Exact transcription of the spoken words",
  "detectedLanguage": "en | ta | tanglish"
}
Do not include any explanation or extra text outside the JSON object."""
