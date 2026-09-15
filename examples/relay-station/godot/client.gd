extends Node
## Thin HTTP/JSON client. Canonical rules execute in the installed Node SDK host.
signal state_changed(snapshot: Dictionary)
signal busy_changed(value: bool)

var base_url: String = "http://127.0.0.1:4330"
var snapshot: Dictionary = {}
var busy: bool = false
var http: HTTPRequest
var last_step_command: Dictionary = {}

func _ready() -> void:
	http = HTTPRequest.new()
	http.timeout = 250.0
	http.body_size_limit = 2097152
	http.max_redirects = 0
	add_child(http)
	var configured: String = OS.get_environment("RELAY_URL")
	if not configured.is_empty():
		base_url = configured.trim_suffix("/")

func guard() -> Dictionary:
	return {"branchId": snapshot.get("branchId", ""), "expectedRevision": snapshot.get("revision", -1)}

func send_api(path: String, payload: Variant = null) -> Dictionary:
	if busy:
		return {"error": {"code": "CLIENT_BUSY", "message": "Wait for the pending request."}}
	busy = true
	busy_changed.emit(true)
	var method: HTTPClient.Method = HTTPClient.METHOD_GET if payload == null else HTTPClient.METHOD_POST
	var data: String = "" if payload == null else JSON.stringify(payload)
	var start_error: Error = http.request(base_url + path, PackedStringArray(["Content-Type: application/json"]), method, data)
	if start_error != OK:
		return finish({"error": {"code": "CONNECTION_START", "message": error_string(start_error)}})
	var result: Array = await http.request_completed
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return finish({"error": {"code": "CONNECTION_FAILED", "message": "Request failed or timed out. Read fresh state before retrying. Result: %s" % result[0]}})
	var parser: JSON = JSON.new()
	var parse_error: Error = parser.parse(result[3].get_string_from_utf8())
	if parse_error != OK or not parser.data is Dictionary:
		return finish({"error": {"code": "INVALID_RESPONSE", "message": "The host returned invalid JSON."}})
	var response: Dictionary = parser.data
	if response.has("snapshot"):
		if not response.snapshot is Dictionary:
			return finish({"error": {"code": "INVALID_RESPONSE", "message": "The host snapshot must be a JSON object."}})
		snapshot = response.snapshot.duplicate(true)
		state_changed.emit(snapshot.duplicate(true))
	if int(result[1]) >= 400 and not response.has("error"):
		response.error = {"code": "HTTP_ERROR", "message": "Host returned HTTP %s" % result[1]}
	return finish(response)

func finish(response: Dictionary) -> Dictionary:
	busy = false
	busy_changed.emit(false)
	return response

func command(path: String, fields: Dictionary = {}) -> Dictionary:
	if snapshot.is_empty():
		return {"error": {"code": "NO_STATE", "message": "Read station state first."}}
	var payload: Dictionary = guard()
	payload.merge(fields, true)
	return await send_api(path, payload)

func active_plan() -> Dictionary:
	for plan in snapshot.get("plans", []):
		if plan is Dictionary and plan.get("status") == "active":
			return plan.duplicate(true)
	return {}

func execute_next() -> Dictionary:
	if busy:
		return {"error": {"code": "CLIENT_BUSY", "message": "Wait for the pending request."}}
	var plan: Dictionary = active_plan()
	if plan.is_empty():
		return {"error": {"code": "NO_ACTIVE_PLAN", "message": "Accept a ready plan first."}}
	var index: Variant = plan.get("nextStep")
	var step_ids: Variant = plan.get("stepIds")
	if not (index is int or index is float) or not step_ids is Array:
		return {"error": {"code": "INVALID_RESPONSE", "message": "The active plan has no valid step index."}}
	if not is_finite(float(index)) or float(index) != floor(float(index)) or index < 0 or index >= step_ids.size() or not step_ids[int(index)] is String or not plan.get("id") is String:
		return {"error": {"code": "INVALID_RESPONSE", "message": "The active plan has no valid next step."}}
	last_step_command = guard()
	last_step_command.merge({"planId": plan.id, "stepId": step_ids[int(index)]})
	return await send_api("/step", last_step_command.duplicate(true))

func retry_last_step() -> Dictionary:
	if last_step_command.is_empty():
		return {"error": {"code": "NO_PREVIOUS_STEP", "message": "No previous step command."}}
	return await send_api("/step", last_step_command.duplicate(true))
