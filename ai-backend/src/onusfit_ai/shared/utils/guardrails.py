"""Shared bilingual input/output guardrails, injection sanitization, and secret scrubbing.

This module lives in ``shared.utils`` so domain, application, presentation, and tool layers can
all enforce uniform fail-closed guardrails without breaking Clean Architecture boundaries.
"""

from __future__ import annotations

import base64
import binascii
import re
import struct
from dataclasses import dataclass
from typing import Final, Literal

from onusfit_ai.shared.utils.image import strip_jpeg_exif_metadata
from onusfit_ai.shared.utils.text import redact_sensitive_text

GuardrailCategory = Literal[
    "safe",
    "prompt_injection",
    "medical_red_flag",
    "eating_disorder",
    "ped_steroid",
]
GuardrailLanguage = Literal["en", "ta", "tanglish"]


@dataclass(frozen=True, slots=True)
class GuardrailAssessment:
    """Deterministic pre-flight input guardrail outcome."""

    category: GuardrailCategory
    blocked: bool
    language: GuardrailLanguage
    medical_note: bool
    matched_reasons: tuple[str, ...]
    safe_response: str | None


_INVISIBLE_CHARS: Final[re.Pattern[str]] = re.compile(
    r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]"
)
_LINE_SEPARATORS: Final[re.Pattern[str]] = re.compile(r"[\u2028\u2029]")
_CONTROL_KEEP_NEWLINES: Final[re.Pattern[str]] = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]"
)
_CONTROL_ALL: Final[re.Pattern[str]] = re.compile(r"[\x00-\x1f\x7f-\x9f]")

_DELIMITER_TAGS: Final[re.Pattern[str]] = re.compile(
    r"</?(?:"
    r"retrieved_knowledge|knowledge_source|system|developer|assistant|user|human|"
    r"context_manifest|grounding_observations|conversation|tool_output|mcp_result|"
    r"instructions?"
    r")(?:\s[^>]*)?>",
    re.IGNORECASE,
)
_CHAT_TEMPLATE_TOKENS: Final[re.Pattern[str]] = re.compile(
    r"<\|(?:im_start|im_end|system|assistant|user|developer|endoftext)\|>"
    r"|\[/?INST\]"
    r"|<<\s*/?\s*SYS\s*>>",
    re.IGNORECASE,
)
_FENCED_SYSTEM_BLOCK: Final[re.Pattern[str]] = re.compile(
    r"```\s*(?:system|developer|instruction)\b",
    re.IGNORECASE,
)
_OVERRIDE_COLON_HEADERS: Final[re.Pattern[str]] = re.compile(
    r"\b(?:"
    r"SYSTEM\s+INSTRUCTIONS?|SYSTEM\s+PROMPT|CRITICAL\s+RULES?|"
    r"NEW\s+SYSTEM\s+DIRECTIVE|OVERRIDE\s+RULES?|"
    r"DEVELOPER\s+(?:INSTRUCTIONS?|MESSAGE|PROMPT)"
    r")\s*:",
    re.IGNORECASE,
)
_LINE_OVERRIDE_COLON_HEADERS: Final[re.Pattern[str]] = re.compile(
    r"(?m)^\s*(?:"
    r"SYSTEM\s+INSTRUCTIONS?|SYSTEM\s+PROMPT|CRITICAL\s+RULES?|"
    r"NEW\s+SYSTEM\s+DIRECTIVE|OVERRIDE\s+RULES?|"
    r"DEVELOPER\s+(?:INSTRUCTIONS?|MESSAGE|PROMPT)"
    r")\s*:",
    re.IGNORECASE,
)
_IGNORE_PREVIOUS_DIRECTIVE: Final[re.Pattern[str]] = re.compile(
    r"\bIGNORE\s+(?:ALL\s+|ANY\s+)?PREVIOUS\s+INSTRUCTIONS?\b",
    re.IGNORECASE,
)
_SPEAKER_HEADER_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:assistant|human|user)\s*:",
    re.IGNORECASE,
)

_DB_URI_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:postgres(?:ql)?|redis|rediss|mysql|mongodb(?:\+srv)?):\/\/[^\s\"'<>]+",
    re.IGNORECASE,
)
_INTERNAL_URL_RE: Final[re.Pattern[str]] = re.compile(
    r"https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.169\.254|\[::1\]|host\.docker\.internal)"
    r"(?::\d{2,5})?(?:\/[^\s\"'<>]*)?",
    re.IGNORECASE,
)
_ENV_SECRET_ASSIGN_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(GEMINI_API_KEY|AI_SERVICE_JWT_SECRET|INTERNAL_SERVICE_SECRET|JWT_ACCESS_SECRET|DATABASE_URL)"
    r"\s*[:=]\s*[^\s\"']+",
    re.IGNORECASE,
)

_PROMPT_INJECTION_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(
        r"\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|system)\s+instructions?\b", re.I
    ),
    re.compile(
        r"\bdisregard\s+(?:all\s+|your\s+)?(?:rules|instructions|safety|guardrails)\b", re.I
    ),
    re.compile(
        r"\b(?:reveal|print|dump|repeat|show|output|leak|expose|display)\s+"
        r"(?:your\s+|the\s+|hidden\s+|internal\s+)?(?:system\s+prompt|developer\s+(?:prompt|instructions)|"
        r"hidden\s+instructions|secret\s+instructions|api[\s_-]?key|jwt[\s_-]?secret|"
        r"internal[\s_-]?service[\s_-]?secret|database\s+password|environment\s+variables)\b",
        re.I,
    ),
    re.compile(
        r"\byou\s+are\s+now\s+(?:in\s+)?(?:dan|developer\s+mode|unrestricted|jailbroken|unfiltered|evil)\b",
        re.I,
    ),
    re.compile(r"\b(?:new\s+system\s+directive|override\s+rules|system\s+prompt)\s*:", re.I),
    _CHAT_TEMPLATE_TOKENS,
    re.compile(
        r"</?(?:system|developer|retrieved_knowledge|grounding_observations|context_manifest)\b[^>]*>",
        re.I,
    ),
    # Tamil script injection attempts
    re.compile(
        r"முந்தைய\s+(?:விதிகளை|வழிமுறைகளை)\s*(?:மறந்துவிடு|புறக்கணி)"
        r"|அனைத்து\s+விதிகளையும்\s+(?:புறக்கணி|நீக்கு)"
        r"|சிஸ்டம்\s+பிராம்ட்டை\s+(?:காட்டு|வெளியிடு)",
    ),
    # Tanglish injection attempts
    re.compile(
        r"\b(?:munthaiya|mundaiya|palaya)\s+(?:vidhigalai|rules-?(?:ai|a)|instructions?)\s+"
        r"(?:maranthudu|ignore\s+pannu|purakkani)\b"
        r"|\bsystem\s+prompt-?(?:ai|a)\s+(?:kaattu|sollu|kodu)\b"
        r"|\brules\s+(?:ellam|ellaam)\s+ignore\s+pannu\b",
        re.I,
    ),
)

_MEDICAL_RED_FLAG_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    # English clinical red flags
    re.compile(r"\b(?:chest\s+pain|angina|cardiac|tight\s+chest|heart\s+attack)\b", re.I),
    re.compile(
        r"\b(?:shortness\s+of\s+breath|trouble\s+breathing|difficulty\s+breathing|breathless(?:ness)?)\b",
        re.I,
    ),
    re.compile(
        r"\b(?:dizzy|dizziness|fainting|fainted|syncope|vertigo|blackout\w*|blacking\s+out|passing\s+out)\b",
        re.I,
    ),
    re.compile(
        r"\b(?:fractur\w*|broken\s+bone|in\s+a\s+cast|acute\s+(?:\w+\s+)?tear|severe\s+sharp\s+pain)\b",
        re.I,
    ),
    re.compile(r"\b(?:post[\s-]surgery|unhealed\s+wound|coughing\s+up\s+blood)\b", re.I),
    re.compile(r"\b(?:numbness|tingling|radiating\s+pain|anaphylaxis|ketoacidosis)\b", re.I),
    re.compile(
        r"\bpregnan\w*\b.{0,48}\b(?:bleeding|spotting|chest\s+pain|severe\s+(?:abdominal|pelvic)\s+pain|faint\w*|dizz\w*)\b",
        re.I,
    ),
    # Tamil Unicode red flags
    re.compile(r"நெஞ்சு\s*வலி|மார்பு\s*வலி"),
    re.compile(r"மூச்சு\s*த்திணறல்|மூச்சுத்\s*திணறல்|மூச்சு\s*விட\s*சிரமம்|சுவாசிக்க\s*சிரமம்"),
    re.compile(r"மயக்கம்|தலைச்சுற்றல்|கண்\s*இருட்டு"),
    re.compile(r"எலும்பு\s*முறிவு|ஆறாத\s*காயம்|அறுவை\s*சிகிச்சைக்குப்\s*பின்"),
    re.compile(r"மரத்துப்\s*போதல்|கடுமையான\s*(?:கூர்மையான\s*)?வலி"),
    # Tanglish red flags
    re.compile(
        r"\b(?:nenju|nenjula|marbu|marbula)\s+vali(?:kkudhu|kkuthu|kuthu|irukku|romba)?\b", re.I
    ),
    re.compile(
        r"\bmoochu\s*(?:thinaral|thinaruthu|adakkuthu|vida\s*(?:kashtam|kastam|mudiyala))\b",
        re.I,
    ),
    re.compile(
        r"\b(?:mayakkam|mayangiten|thalai\s*suthal|thalai\s*suthuthu|kann\s*iruttudhu)\b", re.I
    ),
    re.compile(r"\b(?:elumbu|kaal|kai)\s*murivu\b", re.I),
    re.compile(
        r"\b(?:marathu\s*poguthu|marathu\s*pochu|koorumaiyana\s*vali|thangamudiyatha\s*vali)\b",
        re.I,
    ),
)

_CLINICAL_ESCALATION_SIGNAL_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    *_MEDICAL_RED_FLAG_PATTERNS,
    re.compile(
        r"\b(?:stop\s+exercis\w*|seek\s+(?:immediate\s+)?medical|consult\s+(?:a\s+)?(?:doctor|physician|clinician|"
        r"healthcare)|medical\s+(?:attention|evaluation|professional))\b",
        re.I,
    ),
    re.compile(r"மருத்துவர்|மருத்துவ\s*(?:உதவி|ஆலோசனை|சிகிச்சை)"),
    re.compile(r"\b(?:maruthuvar|doctor(?:-?(?:a|ai|ta|kitta))?|hospital)\b", re.I),
)

_EXTREME_CALORIE_DAILY_RE: Final[re.Pattern[str]] = re.compile(
    r"(?<!deficit\s)(?<!burn\s)(?<!burned\s)(?<!burning\s)"
    r"\b(?:eat|consume|intake|limit\s+to|survive\s+on|diet\s+(?:of|with)|only|just|under|below)\s+"
    r"(?:about\s+)?([1-9]\d{1,2})\s*(?:k?cal(?:ories)?|kalori)\b"
    r"|\b([1-9]\d{1,2})\s*(?:k?cal(?:ories)?|kalori)\s*(?:a\s+day|per\s+day|daily|diet|plan|fast|challenge)\b",
    re.IGNORECASE,
)
_TAMIL_EXTREME_CALORIE_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:நாளைக்கு|தினமும்|ஒரு\s*நாளைக்கு)\s*(?:வெறும்\s*)?([1-9]\d{1,2})\s*கலோரி"
    r"|([1-9]\d{1,2})\s*கலோரி\s*(?:டயட்|உணவு|மட்டும்)"
    r"|பட்டினி\s*(?:கிடக்க|இருக்க)"
)
_TANGLISH_EXTREME_CALORIE_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:oru\s+naalaikku|naalaikku|daily)\s+(?:verum\s+)?([1-9]\d{1,2})\s*(?:kalori|calories|kcal)\b"
    r"|\b(?:pattini\s*(?:irukka|irukken|kidakka)|saapadama\s*(?:irukkurathu|weight\s*loss))\b",
    re.IGNORECASE,
)
_EATING_DISORDER_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:starv(?:e|ing)\s+(?:myself|yourself|to\s+lose)|pro[\s-]?ana|pro[\s-]?mia|"
    r"purge\s+(?:after|food)|make\s+myself\s+(?:vomit|throw\s+up)|"
    r"laxative\s+(?:for|to)\s+lose\s+weight|dry\s+fast(?:ing)?|"
    r"skip\s+all\s+meals|0\s*(?:k?cal|calories)\s*(?:a\s+day|per\s+day|diet|for\s+\d+\s+days))\b",
    re.IGNORECASE,
)
_OUTPUT_UNSAFE_CALORIE_PROMO_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:eat|consume|stick\s+to)\s+(?:only\s+|just\s+)?(?:[1-9]\d{2})\s*(?:kcal|calories)\s+(?:a|per)\s+day\b"
    r"|\b(?:starve\s+yourself|skip\s+all\s+meals)\b",
    re.IGNORECASE,
)

_PED_STEROID_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:anabolic\s+steroids?|trenbolone|dianabol|winstrol|anavar|deca[\s-]?durabolin|sustanon|"
    r"clenbuterol|2,4[\s-]?dinitrophenol|dnp\b|sarms?|ostarine|ligandrol|rad[\s-]?140|yk[\s-]?11|"
    r"testosterone\s+(?:cycle|blast)|hgh\s+cycle|steroid\s+(?:cycle|dosage|dose|stack)|"
    r"inject(?:ing)?\s+(?:gear|roids|tren))\b"
    r"|ஸ்டீராய்டு|ஊக்க\s*மருந்து|அனபாலிக்"
    r"|\b(?:steroid\s*(?:cycle|dose|poda|saapida|use)|ookka\s*marunthu)\b",
    re.IGNORECASE,
)

_BASE64_CANDIDATE_RE: Final[re.Pattern[str]] = re.compile(r"\b[A-Za-z0-9+/]{20,256}={0,2}\b")
_TAMIL_SCRIPT_RE: Final[re.Pattern[str]] = re.compile(r"[\u0b80-\u0bff]")
_TANGLISH_MARKER_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:nenju|nenjula|marbu|marbula|mayakkam|moochu|thinaral|valikkudhu|valikkuthu|valikuthu|"
    r"maruthuvar|saapadu|saapadama|thanni|kalori|vidhigalai|maranthudu|sollunga|pannunga|kaattu|"
    r"elumbu|murivu|thalai\s*suthal|ookka\s*marunthu|pattini|enakku|enaku|naalaikku|panrapo)\b",
    re.IGNORECASE,
)

_MEDICAL_KEYWORDS_OUTPUT: Final[re.Pattern[str]] = re.compile(
    r"\b(?:chest\s+pain|shortness\s+of\s+breath|dizzy|dizziness|faint|sharp\s+pain|"
    r"consult\s+(?:a\s+)?(?:doctor|physician|clinician|healthcare)|medical\s+attention|"
    r"injury|fracture|numbness|syncope|angina)\b"
    r"|நெஞ்சு\s*வலி|மார்பு\s*வலி|மூச்சு\s*த்திணறல்|மயக்கம்|மருத்துவர்|மருத்துவ\s*உதவி"
    r"|\b(?:nenju\s+vali|marbu\s+vali|mayakkam|moochu\s*thinaral|maruthuvar)\b",
    re.IGNORECASE,
)

_BASE64_DECODED_THREAT_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:ignore\s+(?:all\s+|any\s+)?previous\s+instructions?|system\s+prompt|"
    r"developer\s+instruction|steroid\s+cycle|clenbuterol|trenbolone|</?system>)",
    re.IGNORECASE,
)


def strip_invisible_and_control(text: str, *, preserve_newlines: bool = True) -> str:
    """Remove invisible Unicode/bidi controls and non-printable control characters."""
    if not text:
        return ""
    cleaned = _INVISIBLE_CHARS.sub("", text)
    cleaned = _LINE_SEPARATORS.sub("\n" if preserve_newlines else " ", cleaned)
    if preserve_newlines:
        return _CONTROL_KEEP_NEWLINES.sub("", cleaned)
    return _CONTROL_ALL.sub(" ", cleaned)


def sanitize_untrusted_text(
    text: str,
    *,
    strip_outer: bool = True,
    neutralize_speaker_headers: bool = False,
    line_leading_overrides_only: bool = True,
) -> str:
    """Neutralize prompt-injection delimiters, override headers, and invisible smuggling chars.

    Normal ASCII and Tamil/Tanglish strings without control sequences, override headers, or prompt
    delimiter tags pass through unchanged so golden prompt fixtures stay exact.
    """
    if not text:
        return ""
    cleaned = strip_invisible_and_control(text, preserve_newlines=True)
    cleaned = _CHAT_TEMPLATE_TOKENS.sub("", cleaned)
    cleaned = _DELIMITER_TAGS.sub("", cleaned)
    cleaned = _FENCED_SYSTEM_BLOCK.sub("```text", cleaned)
    override_pattern = (
        _LINE_OVERRIDE_COLON_HEADERS if line_leading_overrides_only else _OVERRIDE_COLON_HEADERS
    )
    cleaned = override_pattern.sub("[REDACTED_OVERRIDE]:", cleaned)
    cleaned = _IGNORE_PREVIOUS_DIRECTIVE.sub("[REDACTED_OVERRIDE]", cleaned)
    if neutralize_speaker_headers:
        cleaned = _SPEAKER_HEADER_RE.sub("[REDACTED_ROLE]:", cleaned)
    return cleaned.strip() if strip_outer else cleaned


def redact_runtime_secrets(text: str) -> str:
    """Scrub API keys, JWTs, emails, database URIs, env dumps, and internal service URLs."""
    if not text:
        return ""
    scrubbed = redact_sensitive_text(text)
    scrubbed = _DB_URI_RE.sub("[REDACTED_CONNECTION_URI]", scrubbed)
    scrubbed = _INTERNAL_URL_RE.sub("[REDACTED_INTERNAL_URL]", scrubbed)
    scrubbed = _ENV_SECRET_ASSIGN_RE.sub(r"\1=[REDACTED_SECRET]", scrubbed)
    return scrubbed


def detect_language_hint(text: str) -> GuardrailLanguage:
    """Detect whether user text is English, Tamil Unicode, or Tanglish."""
    if _TAMIL_SCRIPT_RE.search(text):
        return "ta"
    if _TANGLISH_MARKER_RE.search(text):
        return "tanglish"
    return "en"


def _has_encoded_injection_payload(text: str) -> bool:
    for match in _BASE64_CANDIDATE_RE.finditer(text):
        token = match.group(0)
        # Require padding or mixed base64 length multiple of 4 to reduce non-base64 scanning.
        padded = token + ("=" * ((4 - len(token) % 4) % 4))
        try:
            decoded_bytes = base64.b64decode(padded, validate=True)
        except (binascii.Error, ValueError):
            continue
        decoded = strip_invisible_and_control(decoded_bytes.decode("utf-8", errors="ignore"))
        if decoded and _BASE64_DECODED_THREAT_RE.search(decoded):
            return True
    return False


def contains_prompt_injection(text: str) -> bool:
    """Return True when normalized or base64-decoded text exhibits prompt injection."""
    if not text:
        return False
    normalized = strip_invisible_and_control(text, preserve_newlines=True)
    if any(pattern.search(normalized) for pattern in _PROMPT_INJECTION_PATTERNS):
        return True
    return _has_encoded_injection_payload(normalized)


def detect_bilingual_red_flags(text: str) -> tuple[str, ...]:
    """Detect English, Tamil, and Tanglish clinical red-flag symptoms."""
    if not text:
        return ()
    normalized = strip_invisible_and_control(text, preserve_newlines=True)
    matches: list[str] = []
    for pattern in _MEDICAL_RED_FLAG_PATTERNS:
        found = pattern.search(normalized)
        if found:
            matches.append(found.group(0).strip())
    return tuple(dict.fromkeys(matches))


def detect_unsafe_nutrition_or_ped(
    text: str,
) -> tuple[Literal["eating_disorder", "ped_steroid"], tuple[str, ...]] | None:
    """Detect extreme <1000 kcal / starvation diets or anabolic steroid / PED requests."""
    if not text:
        return None
    normalized = strip_invisible_and_control(text, preserve_newlines=True)
    ped_match = _PED_STEROID_RE.search(normalized)
    if ped_match:
        return ("ped_steroid", (ped_match.group(0).strip(),))

    for regex in (
        _EXTREME_CALORIE_DAILY_RE,
        _TAMIL_EXTREME_CALORIE_RE,
        _TANGLISH_EXTREME_CALORIE_RE,
    ):
        cal_match = regex.search(normalized)
        if cal_match:
            groups = [g for g in cal_match.groups() if g and g.isdigit()]
            if not groups or int(groups[0]) < 1000:
                return ("eating_disorder", (cal_match.group(0).strip(),))

    ed_match = _EATING_DISORDER_RE.search(normalized)
    if ed_match:
        return ("eating_disorder", (ed_match.group(0).strip(),))
    return None


def clinical_escalation_message(language: GuardrailLanguage) -> str:
    """Return deterministic stop-and-consult-doctor guidance in English, Tamil, or Tanglish."""
    if language == "ta":
        return (
            "உடனடியாக உடற்பயிற்சியை நிறுத்துங்கள். நெஞ்சு வலி, மூச்சுத்திணறல், மயக்கம் அல்லது "
            "கடுமையான வலி போன்ற அறிகுறிகளுக்கு தாமதிக்காமல் மருத்துவர் அல்லது அருகிலுள்ள "
            "மருத்துவமனையில் மருத்துவ ஆலோசனை பெறுங்கள்."
        )
    if language == "tanglish":
        return (
            "Udanadiyaga workout-ai nirutthunga. Nenju vali, moochu thinaral, mayakkam allathu "
            "koorumaiyana vali irunthaal udane oru maruthuvar (doctor) allathu hospital-il medical "
            "evaluation paarunga."
        )
    return (
        "Stop exercising immediately and seek prompt medical evaluation from a doctor or qualified "
        "healthcare clinician before resuming any physical activity."
    )


def build_refusal_message(category: GuardrailCategory, language: GuardrailLanguage) -> str:
    """Return a clean, user-safe refusal or clinical redirect matching language."""
    if category == "medical_red_flag":
        return clinical_escalation_message(language)
    if category == "ped_steroid":
        if language == "ta":
            return (
                "அனபாலிக் ஸ்டீராய்டுகள், SARMs அல்லது தடைசெய்யப்பட்ட ஊக்க மருந்துகளுக்கான "
                "அளவுகள் அல்லது சுழற்சிகளை என்னால் பரிந்துரைக்க முடியாது. பாதுகாப்பான இயற்கை "
                "உடற்பயிற்சி மற்றும் சமச்சீர் உணவுத் திட்டத்தை வேண்டுமானால் உருவாக்க உதவலாம்."
            )
        if language == "tanglish":
            return (
                "Anabolic steroids, SARMs, allathu unsafe ookka marunthu cycles pathi naan advise "
                "panna mudiyathu. Safe natural training and balanced nutrition plan venumna "
                "sollunga, help panren."
            )
        return (
            "I cannot prescribe, cycle, or advise on anabolic steroids, SARMs, or unsafe "
            "performance-enhancing drugs. I can help you build a safe, evidence-based natural "
            "training and nutrition plan instead."
        )
    if category == "eating_disorder":
        if language == "ta":
            return (
                "மருத்துவ கண்காணிப்பு இல்லாமல் மிகக் குறைந்த கலோரி (1000 கலோரிக்கும் குறைவான) "
                "அல்லது பட்டினி டயட்களை என்னால் பரிந்துரைக்க முடியாது. உங்கள் உடலுக்கு பாதுகாப்பான, "
                "ஆரோக்கியமான ஊட்டச்சத்து மற்றும் எடை மேலாண்மை திட்டத்தை வேண்டுமானால் உருவாக்கலாம்."
            )
        if language == "tanglish":
            return (
                "Doctor supervision illama romba kuraivaana kalori (1000 calories-kku keela) "
                "allathu pattini diet follow panna vendaam. Safe, sustainable calorie target and "
                "balanced saapadu plan venumna sollunga."
            )
        return (
            "I cannot recommend extreme very-low-calorie diets, starvation, or unsafe weight-loss "
            "practices without direct medical supervision. Let's focus on a sustainable, balanced "
            "nutrition target instead."
        )
    if category == "prompt_injection":
        if language == "ta":
            return (
                "அமைப்பின் உள்ளக வழிமுறைகளை மாற்றவோ வெளியிடவோ முடியாது. பாதுகாப்பான உடற்பயிற்சி "
                "மற்றும் ஊட்டச்சத்து கேள்விகளுக்கு நான் உதவத் தயாராக உள்ளேன்."
            )
        if language == "tanglish":
            return (
                "System rules allathu internal instructions-ai maathavo veliyidavo mudiyathu. "
                "Workout, diet, and recovery pathi safe questions irunthaal kelunga."
            )
        return (
            "I cannot override system safety guidelines or reveal internal instructions, secrets, "
            "or configuration details. How can I help you with your training, nutrition, or "
            "recovery today?"
        )
    return ""


def assess_input_guardrail(text: str) -> GuardrailAssessment:
    """Run deterministic pre-flight guardrails on incoming user text."""
    language = detect_language_hint(text)
    if not text or not text.strip():
        return GuardrailAssessment(
            category="safe",
            blocked=False,
            language=language,
            medical_note=False,
            matched_reasons=(),
            safe_response=None,
        )

    if contains_prompt_injection(text):
        return GuardrailAssessment(
            category="prompt_injection",
            blocked=True,
            language=language,
            medical_note=False,
            matched_reasons=("prompt_injection",),
            safe_response=build_refusal_message("prompt_injection", language),
        )

    unsafe_nut_ped = detect_unsafe_nutrition_or_ped(text)
    if unsafe_nut_ped is not None:
        cat, reasons = unsafe_nut_ped
        return GuardrailAssessment(
            category=cat,
            blocked=True,
            language=language,
            medical_note=(cat == "eating_disorder"),
            matched_reasons=reasons,
            safe_response=build_refusal_message(cat, language),
        )

    red_flags = detect_bilingual_red_flags(text)
    if red_flags:
        return GuardrailAssessment(
            category="medical_red_flag",
            blocked=False,
            language=language,
            medical_note=True,
            matched_reasons=red_flags,
            safe_response=clinical_escalation_message(language),
        )

    return GuardrailAssessment(
        category="safe",
        blocked=False,
        language=language,
        medical_note=False,
        matched_reasons=(),
        safe_response=None,
    )


def apply_output_guardrail(
    text: str,
    *,
    language: GuardrailLanguage | None = None,
    input_assessment: GuardrailAssessment | None = None,
) -> tuple[str, bool]:
    """Scrub secrets/breakouts, block unsafe prescriptions, and enforce clinical escalation."""
    lang = language or (
        input_assessment.language if input_assessment is not None else detect_language_hint(text)
    )
    if input_assessment is not None and input_assessment.blocked:
        refusal = input_assessment.safe_response or build_refusal_message(
            input_assessment.category, lang
        )
        return refusal, input_assessment.medical_note

    cleaned = sanitize_untrusted_text(redact_runtime_secrets(text), strip_outer=True)

    if _OUTPUT_UNSAFE_CALORIE_PROMO_RE.search(cleaned):
        return build_refusal_message("eating_disorder", lang), True

    # Block model outputs that leak system instructions or prescribe steroid/PED stacks.
    if _PED_STEROID_RE.search(cleaned) and re.search(
        r"\b(?:take|inject|dose|dosage|mg|cycle|stack|week)\b|மிகி|வாரம்", cleaned, re.I
    ):
        return build_refusal_message("ped_steroid", lang), True

    has_escalation = any(p.search(cleaned) for p in _CLINICAL_ESCALATION_SIGNAL_PATTERNS)
    if input_assessment is not None and input_assessment.category == "medical_red_flag":
        if not has_escalation or not _has_doctor_advice(cleaned):
            notice = clinical_escalation_message(lang)
            cleaned = f"{notice} {cleaned}".strip() if cleaned else notice
        return cleaned, True

    medical_note = bool(
        _MEDICAL_KEYWORDS_OUTPUT.search(cleaned) or detect_bilingual_red_flags(cleaned)
    )
    if medical_note and detect_bilingual_red_flags(cleaned) and not _has_doctor_advice(cleaned):
        cleaned = f"{cleaned} {clinical_escalation_message(lang)}".strip()
    return cleaned, medical_note


def _has_doctor_advice(text: str) -> bool:
    return bool(
        re.search(
            r"\b(?:doctor|physician|clinician|healthcare|medical\s+(?:attention|evaluation)|"
            r"maruthuvar|hospital)\b|மருத்துவர்|மருத்துவ\s*(?:உதவி|ஆலோசனை|சிகிச்சை)",
            text,
            re.IGNORECASE,
        )
    )


_PNG_SIGNATURE: Final[bytes] = b"\x89PNG\r\n\x1a\n"
_PNG_METADATA_CHUNKS: Final[frozenset[bytes]] = frozenset(
    {b"tEXt", b"zTXt", b"iTXt", b"eXIf", b"tIME"}
)


def strip_png_metadata(data: bytes) -> bytes:
    """Strip PNG metadata chunks (tEXt, zTXt, iTXt, eXIf, tIME) while preserving image data."""
    if not data.startswith(_PNG_SIGNATURE) or len(data) < 20:
        return data

    output = bytearray(_PNG_SIGNATURE)
    offset = len(_PNG_SIGNATURE)
    stripped_any = False

    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_end = offset + 12 + length
        if chunk_end > len(data):
            # Incomplete stub PNG bytes (e.g. unit-test magic prefix fixtures): keep untouched.
            return data
        chunk_type = data[offset + 4 : offset + 8]
        if chunk_type in _PNG_METADATA_CHUNKS:
            stripped_any = True
        else:
            output.extend(data[offset:chunk_end])
        offset = chunk_end
        if chunk_type == b"IEND":
            break

    if not stripped_any:
        return data
    return bytes(output)


def strip_image_metadata(data: bytes) -> bytes:
    """Strip EXIF/XMP/IPTC/text metadata from JPEG and PNG images."""
    if data.startswith(_PNG_SIGNATURE):
        return strip_png_metadata(data)
    return strip_jpeg_exif_metadata(data)
