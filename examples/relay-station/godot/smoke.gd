extends SceneTree

const Client = preload("res://client.gd")
var client: Node

func _initialize() -> void:
	call_deferred("verify")

func require(condition: bool, message: String) -> bool:
	if not condition:
		push_error(message)
		quit(1)
	return condition

func verify() -> void:
	client = Client.new()
	root.add_child(client)
	client.state_changed.connect(mutate_observer_copy)
	if OS.get_environment("RELAY_URL").is_empty():
		client.base_url = "http://127.0.0.1:4339"
	var response: Dictionary = await client.send_api("/state")
	if not require(not response.has("error"), "Start the deterministic test host before running smoke.gd."):
		return
	response = await client.command("/reset")
	if not require(not response.has("error"), "Could not reset test host."):
		return
	var initial: Dictionary = client.snapshot.state.duplicate(true)
	if not require(initial.battery == 5, "A state observer must not mutate the client's canonical snapshot."):
		return
	response = await client.command("/propose", {"intent": "Run the deterministic native client fixture."})
	if not require(not response.has("error") and client.snapshot.proposal.plan.status == "ready", "Fixture proposal failed."):
		return
	response = await client.command("/accept", {"proposalId": client.snapshot.proposal.id})
	if not require(not response.has("error") and client.snapshot.state == initial, "Acceptance must execute nothing."):
		return
	response = await client.execute_next()
	if not require(not response.has("error") and client.snapshot.receipts.size() == 1, "First execution failed."):
		return
	var checkpoint: Dictionary = client.snapshot.duplicate(true)
	response = await client.retry_last_step()
	if not require(not response.has("error") and response.execution.replayed and client.snapshot == checkpoint, "Retry must replay exactly once."):
		return
	response = await client.command("/load", {"checkpoint": checkpoint})
	if not require(not response.has("error") and client.snapshot.branchId != checkpoint.branchId and client.snapshot.state == checkpoint.state, "Restore must preserve state on a new branch."):
		return
	response = await client.retry_last_step()
	if not require(response.has("error") and response.error.code == "STALE_BRANCH", "A command from the restored-away branch must fail."):
		return
	while not client.active_plan().is_empty():
		response = await client.execute_next()
		if not require(not response.has("error"), "An accepted action failed."):
			return
	var state: Dictionary = client.snapshot.state
	if not require(state.battery == 2 and state.heat == 2 and state.metal == 2 and state.transmitted == ["north", "east"] and client.snapshot.receipts.size() == 11, "Unexpected final station state."):
		return
	var final_snapshot: Dictionary = client.snapshot.duplicate(true)
	response = await client.retry_last_step()
	if not require(not response.has("error") and response.execution.replayed and client.snapshot == final_snapshot, "Final retry changed state."):
		return
	client.snapshot.plans = [{"status": "active", "nextStep": "invalid", "stepIds": []}]
	response = await client.execute_next()
	if not require(response.has("error") and response.error.code == "INVALID_RESPONSE", "A malformed step index must fail without a runtime error."):
		return
	print("GODOT_SMOKE_OK " + JSON.stringify({"engine": Engine.get_version_info().string, "receipts": 11, "acceptanceHasNoEffects": true, "exactRetry": true, "restore": true, "oldBranchRejected": true}))
	quit(0)

func mutate_observer_copy(snapshot: Dictionary) -> void:
	snapshot.state.battery = -100
