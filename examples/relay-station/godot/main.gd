extends Control

const Client = preload("res://client.gd")
var client: Node
var status_label: Label
var resources: Label
var sector_labels: Array[Label] = []
var plan_text: RichTextLabel
var intent: TextEdit
var accept_button: Button
var step_button: Button
var buttons: Array[Button] = []

func _ready() -> void:
	client = Client.new()
	add_child(client)
	var margin: MarginContainer = MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	add_child(margin)
	var column: VBoxContainer = VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)
	var title: Label = Label.new()
	title.text = "RELAY STATION"
	title.add_theme_font_size_override("font_size", 32)
	column.add_child(title)
	var description: Label = Label.new()
	description.text = "Native Godot client · installed Runtime Story host\nRepair systems, manage heat and power, then survey and transmit selected sectors."
	column.add_child(description)
	resources = Label.new()
	resources.add_theme_font_size_override("font_size", 22)
	column.add_child(resources)
	var sectors: HBoxContainer = HBoxContainer.new()
	sectors.add_theme_constant_override("separation", 16)
	column.add_child(sectors)
	for sector in ["NORTH", "EAST", "WEST"]:
		var panel: PanelContainer = PanelContainer.new()
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		panel.custom_minimum_size.y = 80
		var label: Label = Label.new()
		label.text = sector
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		panel.add_child(label)
		sectors.add_child(panel)
		sector_labels.append(label)
	intent = TextEdit.new()
	intent.text = "Survey north and east. Transmit both. Finish with at least 2 battery, at most 2 heat, and at least 2 metal."
	intent.placeholder_text = "Which sectors should be surveyed? Which should be transmitted or kept local? Specify final battery, heat and metal reserves."
	intent.custom_minimum_size.y = 92
	column.add_child(intent)
	var commands: HBoxContainer = HBoxContainer.new()
	column.add_child(commands)
	add_button(commands, "Generate live plan", propose)
	accept_button = add_button(commands, "Accept plan", accept_plan)
	step_button = add_button(commands, "Execute next action", execute_step)
	add_button(commands, "Read current state", refresh)
	status_label = Label.new()
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.text = "Connecting to the local station host…"
	column.add_child(status_label)
	plan_text = RichTextLabel.new()
	plan_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	plan_text.selection_enabled = true
	column.add_child(plan_text)
	var saves: HBoxContainer = HBoxContainer.new()
	column.add_child(saves)
	add_button(saves, "Save checkpoint", save_checkpoint)
	add_button(saves, "Retry exact step", retry_step)
	add_button(saves, "Restore checkpoint", load_checkpoint)
	add_button(saves, "Reset station", reset_station)
	client.state_changed.connect(render_state)
	client.busy_changed.connect(set_busy)
	await refresh()

func add_button(parent: Node, title: String, callback: Callable) -> Button:
	var button: Button = Button.new()
	button.text = title
	button.pressed.connect(callback)
	parent.add_child(button)
	buttons.append(button)
	return button

func set_busy(value: bool) -> void:
	for button in buttons:
		button.disabled = value
	if not value:
		accept_button.disabled = client.snapshot.get("proposal") == null or client.snapshot.proposal.plan.status != "ready"
		step_button.disabled = client.active_plan().is_empty()

func render_state(snapshot: Dictionary) -> void:
	var state: Dictionary = snapshot.state
	resources.text = "Battery %s/12     Heat %s/8     Metal %s     Kits %s\nScanner: %s · Radio: %s" % [state.battery, state.heat, state.metal, state.kits, "ready" if state.scanner else "damaged", "ready" if state.radio else "damaged"]
	var names: Array[String] = ["north", "east", "west"]
	for index in range(names.size()):
		var sector: String = names[index]
		var sent: bool = sector in state.transmitted
		var surveyed: bool = sector in state.surveyed
		sector_labels[index].text = sector.to_upper() + "\n" + ("TRANSMITTED" if sent else "STORED LOCALLY" if surveyed else "NOT SURVEYED")
		sector_labels[index].modulate = Color("8de4d0") if sent else Color("ffe29a") if surveyed else Color.WHITE
	var accepted: Dictionary = client.active_plan()
	if accepted.is_empty() and not snapshot.plans.is_empty():
		accepted = snapshot.plans.back()
	var proposal: Variant = snapshot.get("proposal")
	var plan: Dictionary = proposal.plan if proposal != null else accepted.get("plan", {})
	var lines: PackedStringArray = PackedStringArray(["Confirmed revision %s · %s executed actions" % [snapshot.revision, snapshot.receipts.size()]])
	if not plan.is_empty():
		lines.append(plan.title + "\n" + plan.interpretation)
		if plan.terms != null:
			lines.append("Agreed outcome: " + JSON.stringify(plan.terms))
		else:
			lines.append(plan.question)
		for index in range(plan.steps.size()):
			var action: Dictionary = plan.steps[index]
			var complete: bool = proposal == null and index < int(accepted.get("nextStep", 0))
			lines.append(("✓ " if complete else "○ ") + action.action + " " + JSON.stringify(action.arguments))
		var provenance: Dictionary = proposal.provenance if proposal != null else accepted.get("provenance", {})
		lines.append("Provider: %s · Corrections: %s" % [provenance.get("model", "fixture"), provenance.get("repairCount", 0)])
	plan_text.text = "\n".join(lines)

func report(response: Dictionary) -> void:
	if response.has("error"):
		status_label.text = JSON.stringify(response.error)
	else:
		status_label.text = "Host confirmed. Acceptance alone executes nothing."

func refresh() -> void:
	report(await client.send_api("/state"))

func propose() -> void:
	status_label.text = "Waiting for a live plan. The station has not executed anything."
	report(await client.command("/propose", {"intent": intent.text}))

func accept_plan() -> void:
	report(await client.command("/accept", {"proposalId": client.snapshot.proposal.id}))

func execute_step() -> void:
	report(await client.execute_next())

func retry_step() -> void:
	report(await client.retry_last_step())

func reset_station() -> void:
	report(await client.command("/reset"))

func save_checkpoint() -> void:
	var file: FileAccess = FileAccess.open("user://relay-checkpoint.json", FileAccess.WRITE)
	if file == null:
		status_label.text = "Could not save checkpoint: " + error_string(FileAccess.get_open_error())
		return
	file.store_string(JSON.stringify(client.snapshot))
	file.close()
	status_label.text = "Saved checkpoint locally, including accepted terms and receipts."

func load_checkpoint() -> void:
	var file: FileAccess = FileAccess.open("user://relay-checkpoint.json", FileAccess.READ)
	if file == null:
		status_label.text = "Save a checkpoint first."
		return
	var checkpoint: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not checkpoint is Dictionary:
		status_label.text = "The local checkpoint is not valid JSON."
		return
	report(await client.command("/load", {"checkpoint": checkpoint}))
