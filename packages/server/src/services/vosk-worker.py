import base64
import json
import sys
import time
from typing import Dict, Any


SESSION_IDLE_TTL_SECONDS = 300


def merge_text(base: str, extra: str) -> str:
    base = (base or "").strip()
    extra = (extra or "").strip()
    if not base:
        return extra
    if not extra:
        return base
    return f"{base}\n{extra}"


def main() -> int:
    if len(sys.argv) < 2:
        print(
            json.dumps({"type": "error", "message": "missing-model-path"}), flush=True
        )
        return 1

    model_path = sys.argv[1]

    try:
        from vosk import KaldiRecognizer, Model, SetLogLevel  # type: ignore
    except Exception as exc:  # pragma: no cover
        print(
            json.dumps({"type": "error", "message": f"vosk-import-failed: {exc}"}),
            flush=True,
        )
        return 1

    try:
        SetLogLevel(-1)
        model = Model(model_path)
    except Exception as exc:  # pragma: no cover
        print(
            json.dumps({"type": "error", "message": f"vosk-model-load-failed: {exc}"}),
            flush=True,
        )
        return 1

    sessions: Dict[str, Dict[str, Any]] = {}
    print(json.dumps({"type": "ready"}), flush=True)

    def cleanup_idle_sessions() -> None:
        now = time.time()
        expired_ids = [
            session_id
            for session_id, session in sessions.items()
            if now - float(session.get("updated_at") or 0) > SESSION_IDLE_TTL_SECONDS
        ]
        for session_id in expired_ids:
            sessions.pop(session_id, None)

    for raw_line in sys.stdin:
        cleanup_idle_sessions()
        line = raw_line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
        except Exception as exc:
            print(
                json.dumps({"type": "error", "message": f"invalid-json: {exc}"}),
                flush=True,
            )
            continue

        request_id = payload.get("id")
        session_id = payload.get("sessionId")
        sample_rate = int(payload.get("sampleRate") or 16000)
        finalize = bool(payload.get("final"))
        audio_b64 = payload.get("audio") or ""

        if not request_id or not session_id:
            print(
                json.dumps(
                    {
                        "type": "response",
                        "id": request_id,
                        "error": "missing-request-id-or-session-id",
                    }
                ),
                flush=True,
            )
            continue

        try:
            session = sessions.get(session_id)
            if session is None:
                recognizer = KaldiRecognizer(model, sample_rate)
                recognizer.SetWords(True)
                session = {
                    "recognizer": recognizer,
                    "committed": "",
                    "updated_at": time.time(),
                }
                sessions[session_id] = session

            recognizer = session["recognizer"]
            committed = session["committed"]
            session["updated_at"] = time.time()

            if audio_b64:
                audio_bytes = base64.b64decode(audio_b64)
                if recognizer.AcceptWaveform(audio_bytes):
                    result = json.loads(recognizer.Result() or "{}")
                    committed = merge_text(committed, result.get("text", ""))
                    session["committed"] = committed

            partial_text = ""
            if finalize:
                final_result = json.loads(recognizer.FinalResult() or "{}")
                committed = merge_text(committed, final_result.get("text", ""))
                sessions.pop(session_id, None)
                response_text = committed
            else:
                partial_result = json.loads(recognizer.PartialResult() or "{}")
                partial_text = (partial_result.get("partial") or "").strip()
                response_text = merge_text(committed, partial_text)

            print(
                json.dumps(
                    {
                        "type": "response",
                        "id": request_id,
                        "sessionId": session_id,
                        "transcript": response_text,
                        "final": finalize,
                    }
                ),
                flush=True,
            )
        except Exception as exc:
            sessions.pop(session_id, None)
            print(
                json.dumps(
                    {
                        "type": "response",
                        "id": request_id,
                        "sessionId": session_id,
                        "error": f"transcription-failed: {exc}",
                    }
                ),
                flush=True,
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
