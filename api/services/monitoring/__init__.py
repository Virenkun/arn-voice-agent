"""Live call monitoring.

Lets an org member listen to (and, in Phase 2, speak into) an in-progress
call. The call's pipecat pipeline runs in-process in whichever uvicorn worker
owns the call's WebSocket, but a monitor's browser WebSocket may land on a
different worker — so all monitor<->call traffic is bridged over Redis pub/sub
keyed by ``workflow_run_id`` (see ``monitor_protocol``). The call-side lives in
``MonitorBridge``; the monitor-side (one per browser connection) in
``MonitorSession``.
"""
