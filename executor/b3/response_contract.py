"""Offline response validation only: no HTTP, OAuth, key loading or dispatch.

OpenAI-compatible envelope is a candidate contract, not a verified Nous invoice.
Call only from a trusted server adapter after an actual dispatch has been claimed.
"""
from budget import BudgetError, integer


def validate_response(body, expected_model):
    if not isinstance(body, dict) or body.get("model") != expected_model:
        raise BudgetError("MODEL_UNVERIFIED")
    usage = body.get("usage")
    if not isinstance(usage, dict):
        raise BudgetError("USAGE_UNVERIFIED")
    inputs = integer(usage.get("prompt_tokens"), "INPUT_USAGE")
    outputs = integer(usage.get("completion_tokens"), "OUTPUT_USAGE")
    total = integer(usage.get("total_tokens"), "TOTAL_USAGE")
    if total != inputs + outputs:
        raise BudgetError("USAGE_INCONSISTENT")
    details = usage.get("completion_tokens_details")
    if details is not None:
        if not isinstance(details, dict):
            raise BudgetError("USAGE_UNVERIFIED")
        if "reasoning_tokens" in details:
            reasoning = integer(details["reasoning_tokens"], "REASONING_USAGE")
            if reasoning > outputs:
                raise BudgetError("USAGE_INCONSISTENT")
            # Reasoning is a breakdown of completion_tokens, never added twice.
    choices = body.get("choices")
    if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
        raise BudgetError("OUTPUT_UNVERIFIED")
    choice = choices[0]
    message = choice.get("message")
    if not isinstance(message, dict):
        raise BudgetError("OUTPUT_UNVERIFIED")
    content = message.get("content")
    if content is not None and not isinstance(content, str):
        raise BudgetError("OUTPUT_UNVERIFIED")
    complete = choice.get("finish_reason") == "stop" and bool(content and content.strip()) and not message.get("tool_calls") and not message.get("function_call")
    # Never expose hidden reasoning_content or remote metadata in the result.
    return {"input_tokens": inputs, "output_tokens": outputs,
            "complete": complete, "text": content if complete else None}


def reconcile_response(ledger, job_id, call_id, body):
    """Account observed usage; incompleteness does not mean zero provider charge.

    This function is not an authenticated endpoint and must never accept client
    submitted usage. Production still needs verified Nous billing semantics.
    """
    expected = ledger.snapshot(job_id)["policy"]["model"]
    try:
        result = validate_response(body, expected)
    except BudgetError:
        ledger.uncertain(job_id, call_id)
        raise
    ledger.settle(job_id, call_id, result["input_tokens"], result["output_tokens"])
    return result
