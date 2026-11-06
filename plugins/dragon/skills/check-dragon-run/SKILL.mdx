---
name: check-dragon-run
description: Check the current status or completed standard results of an existing Helio Dragon run.
---

Use this skill when the user asks for Dragon progress, results, errors, warnings, or an existing run's status.

1. Call `get_dragon_run` with the exact `identity` used during preparation and start. The backend simulation/optimization ID is a separate value, not a substitute. If the workflow identity is unavailable, ask for it; do not guess from unrelated history.
2. Report the service's actual state, warnings, failure information, and ready artifacts. Do not invent an ETA or say a run completed unless the service says so.
3. For Assess results, retain outcome, temperature direction, caveats, grouped suggested fixes, and any valid enhancement estimate. Do not reduce the result to a pass/fail boolean.
4. For Enhance results, report quality and consistency improvements exactly as returned, including unknown values. Do not convert unknown quality to Medium or fabricate print-time savings.
5. If artifacts are ready and the user asks for them, follow `get-dragon-output`. If the run failed, explain server-provided details and do not create a replacement run without an explicit request.

Use `stop_dragon_run` only after an explicit user request to stop the identified active run.

For `STOP_REQUESTED` or `STOP_UNKNOWN`, poll with `get_dragon_run`; neither state confirms cancellation completed. Do not resend an ambiguous cancellation or create a replacement. Only `STOP_REJECTED` allows a cancellation retry with `retry_rejected: true`, after resolving the reported rejection and an explicit retry request. Finished, failed, or stopped runs need no cancellation.
