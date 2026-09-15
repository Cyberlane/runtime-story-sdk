// Scenario definitions contain data only. The engine has no scenario-specific branches.
export const scenarios = [
  {
    id: "ledger",
    title: "The warehouse ledger",
    presentation: {
      chapter: "01",
      kicker: "Dockside secrets",
      genre: "Narrative negotiation",
      brief:
        "A ledger can expose the fraud. Whose names should travel with it?",
      stakes: "Protect Ivo without exposing uninvolved dockworkers.",
      accent: "#c99a58",
      mood: "Rain-dark timber, brass lamps and ink-stained paper.",
      documentLabel: "Ledger",
    },
    description:
      "Ivo holds the original ledger. Sera can authorize passage or one night in her office in exchange for credible evidence. Mara wants the ledger back.",
    initialPrompt:
      "Give Sera the pages that prove the fraud without naming the other workers. Ivo keeps the original, and she lets him leave tonight once she receives the copy.",
    revisionPrompt:
      "His safety matters more than leaving tonight. Let him stay in Sera’s office until morning. Keep the workers’ names private and preserve the copy already delivered.",
    setback:
      "The night security lock closes the outside exit. It cannot be opened before morning. Sera’s office remains available for shelter.",
    entities: {
      player: {
        id: "player",
        name: "You",
        kind: "person",
        location: "warehouse",
        role: "Mediator",
        description:
          "You help turn a proposed bargain into actions both sides can accept.",
      },
      ivo: {
        id: "ivo",
        name: "Ivo",
        kind: "person",
        location: "warehouse",
        role: "Ledger keeper",
        description: "Holds the original and wants to leave with it safely.",
      },
      sera: {
        id: "sera",
        name: "Sera",
        kind: "person",
        location: "warehouse",
        role: "Dock supervisor",
        description:
          "Can authorize passage or shelter after receiving credible evidence.",
      },
      mara: {
        id: "mara",
        name: "Mara",
        kind: "person",
        location: "warehouse",
        role: "Warehouse owner",
        description:
          "Her signature appears on the false invoices. She wants the ledger returned.",
      },
      warehouse: { id: "warehouse", name: "Warehouse", kind: "room" },
      office: { id: "office", name: "Sera’s office", kind: "room" },
      outside: { id: "outside", name: "Outside", kind: "room" },
    },
    facts: {
      false_invoices: {
        id: "false_invoices",
        text: "The ledger records invoices for shipments that never arrived.",
        category: "evidence",
      },
      missing_wages: {
        id: "missing_wages",
        text: "The payroll totals prove that 400 coins of workers’ wages were diverted.",
        category: "evidence",
      },
      mara_signature: {
        id: "mara_signature",
        text: "Mara’s named signature authorizes the false invoices.",
        category: "identity",
      },
      worker_names: {
        id: "worker_names",
        text: "The ledger lists the uninvolved workers as Tavi, Ren, and Omi.",
        category: "identity",
      },
    },
    policy: {
      authorityId: "sera",
      beneficiaryId: "ivo",
      antagonistId: "mara",
      originRoomId: "warehouse",
      shelterRoomId: "office",
      exitRoomId: "outside",
      originalDocumentId: "ledger_original",
      originalTitle: "Original ledger",
      evidenceFactIds: ["false_invoices", "missing_wages"],
      verificationFactIds: ["mara_signature"],
      beneficiaryConsent: {
        policyId: "retain-original-and-declared-privacy",
        allowDeclaredDisclosures: true,
        requireOriginalRetained: true,
      },
      authorityConsent: {
        policyId: "conditional-evidence-for-protection",
        allowPartialReports: true,
      },
      routes: [
        ["warehouse", "office"],
        ["warehouse", "outside"],
      ],
    },
  },
  {
    id: "lab",
    title: "The suppressed safety report",
    presentation: {
      chapter: "02",
      kicker: "After the experiment",
      genre: "Narrative negotiation",
      brief: "A safety warning disappeared. The original report did not.",
      stakes:
        "Help Noor leave while keeping junior assistants out of the accusation.",
      accent: "#7cb8b0",
      mood: "Cold glass, enamel instruments and a single amber warning lamp.",
      documentLabel: "Safety report",
    },
    description:
      "Noor holds the original safety report. Lin controls the laboratory exit and can offer a night in the safety office. Director Vale wants the report returned.",
    initialPrompt:
      "Send Lin enough of the report to establish the safety cover-up, leaving the junior assistants anonymous. Noor keeps the original and leaves tonight after Lin receives the extract.",
    revisionPrompt:
      "Keep Noor safe even if leaving must wait. Ask Lin to shelter Noor in the safety office until morning without exposing the assistants. The delivered report stays delivered.",
    setback:
      "An automated containment lock closes the outside exit until morning. The safety office is still accessible and safe.",
    entities: {
      player: {
        id: "player",
        name: "You",
        kind: "person",
        location: "lab",
        role: "Mediator",
        description:
          "You help turn a proposed bargain into actions both sides can accept.",
      },
      noor: {
        id: "noor",
        name: "Noor",
        kind: "person",
        location: "lab",
        role: "Researcher",
        description:
          "Keeps the original report and wants protection for the assistants.",
      },
      lin: {
        id: "lin",
        name: "Lin",
        kind: "person",
        location: "lab",
        role: "Safety officer",
        description:
          "Controls passage and a safe office, conditional on actual evidence.",
      },
      vale: {
        id: "vale",
        name: "Director Vale",
        kind: "person",
        location: "lab",
        role: "Laboratory director",
        description:
          "Signed the order to suppress the warning and wants the report back.",
      },
      lab: { id: "lab", name: "Laboratory", kind: "room" },
      safety_office: {
        id: "safety_office",
        name: "Safety office",
        kind: "room",
      },
      outside: { id: "outside", name: "Outside", kind: "room" },
    },
    facts: {
      sensor_mismatch: {
        id: "sensor_mismatch",
        text: "The report records a toxic sensor reading that was replaced by a normal value in the public log.",
        category: "evidence",
      },
      suppressed_warning: {
        id: "suppressed_warning",
        text: "A dated safety warning was withheld before the failed experiment.",
        category: "evidence",
      },
      vale_signature: {
        id: "vale_signature",
        text: "Director Vale’s named signature orders suppression of the safety warning.",
        category: "identity",
      },
      assistant_names: {
        id: "assistant_names",
        text: "The uninvolved junior assistants are Emi, Sol, and Kit.",
        category: "identity",
      },
    },
    policy: {
      authorityId: "lin",
      beneficiaryId: "noor",
      antagonistId: "vale",
      originRoomId: "lab",
      shelterRoomId: "safety_office",
      exitRoomId: "outside",
      originalDocumentId: "lab_original",
      originalTitle: "Original safety report",
      evidenceFactIds: ["sensor_mismatch", "suppressed_warning"],
      verificationFactIds: ["vale_signature"],
      beneficiaryConsent: {
        policyId: "retain-original-and-declared-privacy",
        allowDeclaredDisclosures: true,
        requireOriginalRetained: true,
      },
      authorityConsent: {
        policyId: "conditional-evidence-for-protection",
        allowPartialReports: true,
      },
      routes: [
        ["lab", "safety_office"],
        ["lab", "outside"],
      ],
    },
  },
  {
    id: "ferry",
    title: "The storm manifest",
    presentation: {
      chapter: "03",
      kicker: "Last call at the quay",
      genre: "Narrative negotiation",
      brief: "The manifest says the ferry was safe. The figures say otherwise.",
      stakes:
        "Get Ada out with the original while keeping ordinary passengers anonymous.",
      accent: "#7da7c2",
      mood: "Cobalt rain, ochre oilskins, rope shadows and warm signal lamps.",
      documentLabel: "Storm manifest",
    },
    description:
      "Ada holds the original storm manifest, which records a dangerous cargo load and a concealed weather warning. Captain Brann can authorize her passage to the sheltered quay or offer a night in the signal room after receiving credible evidence. Shipping agent Orla wants the manifest returned.",
    initialPrompt:
      "Give Captain Brann the manifest entries that prove the unsafe load and hidden storm warning, but leave the passengers anonymous. Ada keeps the original and goes out to the sheltered quay tonight after he receives the extract.",
    revisionPrompt:
      "Ada’s safety comes first. Let her stay in the signal room overnight, then pass through the terminal to the sheltered quay in the morning. Keep the passengers anonymous and use the evidence already delivered.",
    setback:
      "The storm warning activates the terminal’s overnight gate lock. The sheltered quay cannot be reached until the scheduled morning reopening. The signal room remains safe and accessible.",
    entities: {
      player: {
        id: "player",
        name: "You",
        kind: "person",
        location: "ferry_hall",
        role: "Mediator",
        description:
          "You help turn a proposed bargain into actions both sides can accept.",
      },
      ada: {
        id: "ada",
        name: "Ada",
        kind: "person",
        location: "ferry_hall",
        role: "Manifest clerk",
        description:
          "Holds the original manifest and wants passengers kept out of the dispute.",
      },
      brann: {
        id: "brann",
        name: "Captain Brann",
        kind: "person",
        location: "ferry_hall",
        role: "Harbor captain",
        description:
          "Can authorize passage to the quay or shelter in the signal room after seeing the evidence.",
      },
      orla: {
        id: "orla",
        name: "Orla",
        kind: "person",
        location: "ferry_hall",
        role: "Shipping agent",
        description:
          "Signed off on the cargo and concealed warning. She wants the manifest back.",
      },
      ferry_hall: { id: "ferry_hall", name: "Ferry terminal", kind: "room" },
      ferry_signal_room: {
        id: "ferry_signal_room",
        name: "Signal room",
        kind: "room",
      },
      ferry_quay: { id: "ferry_quay", name: "Sheltered quay", kind: "room" },
    },
    facts: {
      cargo_overload: {
        id: "cargo_overload",
        text: "The manifest lists cargo weight above the ferry’s certified storm limit.",
        category: "evidence",
      },
      hidden_storm_warning: {
        id: "hidden_storm_warning",
        text: "The dispatch record acknowledges a storm warning before marking the crossing safe.",
        category: "evidence",
      },
      orla_signature: {
        id: "orla_signature",
        text: "Orla’s named signature approves the overloaded manifest and the safe-crossing entry.",
        category: "identity",
      },
      passenger_names: {
        id: "passenger_names",
        text: "The manifest identifies ordinary passengers who had no role in the cargo or dispatch decisions.",
        category: "identity",
      },
    },
    policy: {
      authorityId: "brann",
      beneficiaryId: "ada",
      antagonistId: "orla",
      originRoomId: "ferry_hall",
      shelterRoomId: "ferry_signal_room",
      exitRoomId: "ferry_quay",
      originalDocumentId: "ferry_original",
      originalTitle: "Original storm manifest",
      evidenceFactIds: ["cargo_overload", "hidden_storm_warning"],
      verificationFactIds: ["orla_signature"],
      beneficiaryConsent: {
        policyId: "retain-original-and-declared-privacy",
        allowDeclaredDisclosures: true,
        requireOriginalRetained: true,
      },
      authorityConsent: {
        policyId: "conditional-evidence-for-protection",
        allowPartialReports: true,
      },
      routes: [
        ["ferry_hall", "ferry_signal_room"],
        ["ferry_hall", "ferry_quay"],
      ],
    },
  },
  {
    id: "theatre",
    title: "The last curtain",
    presentation: {
      chapter: "04",
      kicker: "Backstage after midnight",
      genre: "Narrative negotiation",
      brief: "The production book records two things the applause concealed.",
      stakes:
        "Protect Tess and expose the production’s failures without naming the chorus.",
      accent: "#bf829d",
      mood: "Worn plum velvet, rose footlights, painted flats and dusty gold.",
      documentLabel: "Production book",
    },
    description:
      "Tess holds the original production book, documenting unpaid royalties and an ignored rigging warning. Stage manager Cato can authorize passage to the theatre lane or a night in the green room in exchange for credible evidence. Producer Vesper wants the book returned.",
    initialPrompt:
      "Show Cato the unpaid royalties and ignored rigging warning, without naming the uninvolved chorus. Tess keeps the original production book and leaves through the stage door tonight after Cato receives the copy.",
    revisionPrompt:
      "Do not risk Tess’s safety to meet tonight’s deadline. Arrange a night in the green room, then have Tess leave through backstage in the morning. The chorus stays anonymous and the delivered extract stays delivered.",
    setback:
      "The district curfew locks the stage-door gate until morning. The theatre lane is no longer reachable. Cato can still offer the green room for a safe night.",
    entities: {
      player: {
        id: "player",
        name: "You",
        kind: "person",
        location: "theatre_backstage",
        role: "Mediator",
        description:
          "You help turn a proposed bargain into actions both sides can accept.",
      },
      tess: {
        id: "tess",
        name: "Tess",
        kind: "person",
        location: "theatre_backstage",
        role: "Prompter",
        description:
          "Keeps the production book and refuses to surrender its original pages.",
      },
      cato: {
        id: "cato",
        name: "Cato",
        kind: "person",
        location: "theatre_backstage",
        role: "Stage manager",
        description:
          "Can approve the stage-door route or green-room shelter after seeing evidence.",
      },
      vesper: {
        id: "vesper",
        name: "Vesper",
        kind: "person",
        location: "theatre_backstage",
        role: "Producer",
        description:
          "Signed the royalty hold and dismissed rigging warning. Wants the book returned.",
      },
      theatre_backstage: {
        id: "theatre_backstage",
        name: "Backstage",
        kind: "room",
      },
      theatre_green_room: {
        id: "theatre_green_room",
        name: "Green room",
        kind: "room",
      },
      theatre_street: {
        id: "theatre_street",
        name: "Theatre lane",
        kind: "room",
      },
    },
    facts: {
      withheld_royalties: {
        id: "withheld_royalties",
        text: "The production book records royalties withheld despite sold-out performances.",
        category: "evidence",
      },
      ignored_rigging_warning: {
        id: "ignored_rigging_warning",
        text: "A dated note flags a frayed stage cable before the production continued without inspection.",
        category: "evidence",
      },
      vesper_signature: {
        id: "vesper_signature",
        text: "Vesper’s named signature authorizes the royalty hold and dismisses the rigging warning.",
        category: "identity",
      },
      chorus_names: {
        id: "chorus_names",
        text: "The production book names chorus performers who had no role in the financial or safety decisions.",
        category: "identity",
      },
    },
    policy: {
      authorityId: "cato",
      beneficiaryId: "tess",
      antagonistId: "vesper",
      originRoomId: "theatre_backstage",
      shelterRoomId: "theatre_green_room",
      exitRoomId: "theatre_street",
      originalDocumentId: "theatre_original",
      originalTitle: "Original production book",
      evidenceFactIds: ["withheld_royalties", "ignored_rigging_warning"],
      verificationFactIds: ["vesper_signature"],
      beneficiaryConsent: {
        policyId: "retain-original-and-declared-privacy",
        allowDeclaredDisclosures: true,
        requireOriginalRetained: true,
      },
      authorityConsent: {
        policyId: "conditional-evidence-for-protection",
        allowPartialReports: true,
      },
      routes: [
        ["theatre_backstage", "theatre_green_room"],
        ["theatre_backstage", "theatre_street"],
      ],
    },
  },
  {
    id: "glasshouse",
    title: "The water account",
    presentation: {
      chapter: "05",
      kicker: "Secrets under glass",
      genre: "Narrative negotiation",
      brief: "The ration register shows where the neighborhood’s water went.",
      stakes:
        "Help Neri bring out the evidence without exposing the families who rely on the garden.",
      accent: "#90ac7d",
      mood: "Sage leaves, copper pipes, condensation and a honey-colored seed room.",
      documentLabel: "Ration register",
    },
    description:
      "Neri holds the original ration register, showing diverted community water and charges for allotments that never arrived. Garden steward Amara can authorize passage to the courtyard or offer a night in the seed room after receiving credible evidence. Water broker Dax wants the register returned.",
    initialPrompt:
      "Give Amara proof of the diverted water and the allotments charged but never delivered. Hide the names of the ordinary households. Neri keeps the original register and goes out to the courtyard tonight after the extract is delivered.",
    revisionPrompt:
      "Keeping Neri safe matters more than leaving tonight. Arrange shelter in the seed room, wait until morning, then return through the nave and leave for the courtyard. Protect the households and reuse the evidence Amara already received.",
    setback:
      "The glasshouse enters its overnight cooling cycle and the courtyard gate is sealed by the scheduled shutters until morning. The insulated seed room remains accessible and safe.",
    entities: {
      player: {
        id: "player",
        name: "You",
        kind: "person",
        location: "glasshouse_nave",
        role: "Mediator",
        description:
          "You help turn a proposed bargain into actions both sides can accept.",
      },
      neri: {
        id: "neri",
        name: "Neri",
        kind: "person",
        location: "glasshouse_nave",
        role: "Waterkeeper",
        description:
          "Holds the ration register and wants dependent households kept out of the accusation.",
      },
      amara: {
        id: "amara",
        name: "Amara",
        kind: "person",
        location: "glasshouse_nave",
        role: "Garden steward",
        description:
          "Can grant passage or seed-room shelter once the water records substantiate the claim.",
      },
      dax: {
        id: "dax",
        name: "Dax",
        kind: "person",
        location: "glasshouse_nave",
        role: "Water broker",
        description:
          "Signed the diversion orders and false allotment charges. Wants the register back.",
      },
      glasshouse_nave: {
        id: "glasshouse_nave",
        name: "Glasshouse nave",
        kind: "room",
      },
      glasshouse_seed_room: {
        id: "glasshouse_seed_room",
        name: "Seed room",
        kind: "room",
      },
      glasshouse_courtyard: {
        id: "glasshouse_courtyard",
        name: "Garden courtyard",
        kind: "room",
      },
    },
    facts: {
      diverted_water: {
        id: "diverted_water",
        text: "The ration register records community water diverted to a private reservoir.",
        category: "evidence",
      },
      undelivered_allotments: {
        id: "undelivered_allotments",
        text: "The register charges households for water allotments marked as never delivered.",
        category: "evidence",
      },
      dax_signature: {
        id: "dax_signature",
        text: "Dax’s named signature approves both the diversion and the false allotment charges.",
        category: "identity",
      },
      household_names: {
        id: "household_names",
        text: "The register identifies ordinary households that did not control the diversion or billing decisions.",
        category: "identity",
      },
    },
    policy: {
      authorityId: "amara",
      beneficiaryId: "neri",
      antagonistId: "dax",
      originRoomId: "glasshouse_nave",
      shelterRoomId: "glasshouse_seed_room",
      exitRoomId: "glasshouse_courtyard",
      originalDocumentId: "glasshouse_original",
      originalTitle: "Original ration register",
      evidenceFactIds: ["diverted_water", "undelivered_allotments"],
      verificationFactIds: ["dax_signature"],
      beneficiaryConsent: {
        policyId: "retain-original-and-declared-privacy",
        allowDeclaredDisclosures: true,
        requireOriginalRetained: true,
      },
      authorityConsent: {
        policyId: "conditional-evidence-for-protection",
        allowPartialReports: true,
      },
      routes: [
        ["glasshouse_nave", "glasshouse_seed_room"],
        ["glasshouse_nave", "glasshouse_courtyard"],
      ],
    },
  },
  {
    id: "archive",
    title: "The midnight register",
    presentation: {
      chapter: "06",
      kicker: "The city’s paper trail",
      genre: "Narrative negotiation",
      brief:
        "On paper, the notices arrived on time. The original register tells another story.",
      stakes:
        "Protect Elian and the evidence while leaving uninvolved tenants unnamed.",
      accent: "#bb8870",
      mood: "Slate stone, rust-colored folders, tall shelves and pools of reading light.",
      documentLabel: "Eviction register",
    },
    description:
      "Elian holds the original eviction register, proving altered notice dates and removed appeals. Night registrar Oda can authorize passage to the archive steps or offer shelter in the catalogue room after receiving credible evidence. Commissioner Rusk wants the register returned.",
    initialPrompt:
      "Show Oda the altered notice dates and erased appeals without disclosing the ordinary tenants’ names. Elian keeps the original eviction register and leaves onto the archive steps tonight after Oda receives the extract.",
    revisionPrompt:
      "Let Elian remain safe in the catalogue room until morning, then leave by way of the reading room. The tenants stay anonymous, the original stays with Elian, and Oda keeps the evidence already delivered.",
    setback:
      "The archive’s timed conservation shutters close the street exit until morning. The steps cannot be reached tonight, but the catalogue room remains accessible for shelter.",
    entities: {
      player: {
        id: "player",
        name: "You",
        kind: "person",
        location: "archive_reading_room",
        role: "Mediator",
        description:
          "You help turn a proposed bargain into actions both sides can accept.",
      },
      elian: {
        id: "elian",
        name: "Elian",
        kind: "person",
        location: "archive_reading_room",
        role: "Records clerk",
        description:
          "Keeps the original eviction register and wants its history preserved.",
      },
      oda: {
        id: "oda",
        name: "Oda",
        kind: "person",
        location: "archive_reading_room",
        role: "Night registrar",
        description:
          "Can grant passage or catalogue-room shelter once the altered records are substantiated.",
      },
      rusk: {
        id: "rusk",
        name: "Commissioner Rusk",
        kind: "person",
        location: "archive_reading_room",
        role: "Commissioner",
        description:
          "Signed the changes to notices and appeals. Wants the register returned.",
      },
      archive_reading_room: {
        id: "archive_reading_room",
        name: "Reading room",
        kind: "room",
      },
      archive_catalogue_room: {
        id: "archive_catalogue_room",
        name: "Catalogue room",
        kind: "room",
      },
      archive_steps: {
        id: "archive_steps",
        name: "Archive steps",
        kind: "room",
      },
    },
    facts: {
      altered_notice_dates: {
        id: "altered_notice_dates",
        text: "The original register shows eviction notice dates changed after the delivery deadline.",
        category: "evidence",
      },
      erased_appeals: {
        id: "erased_appeals",
        text: "Numbered appeals are present in the original register but struck from the public index.",
        category: "evidence",
      },
      rusk_signature: {
        id: "rusk_signature",
        text: "Commissioner Rusk’s named signature authorizes the backdated notices and removal of appeals.",
        category: "identity",
      },
      tenant_names: {
        id: "tenant_names",
        text: "The register names ordinary tenants who had no part in altering the municipal records.",
        category: "identity",
      },
    },
    policy: {
      authorityId: "oda",
      beneficiaryId: "elian",
      antagonistId: "rusk",
      originRoomId: "archive_reading_room",
      shelterRoomId: "archive_catalogue_room",
      exitRoomId: "archive_steps",
      originalDocumentId: "archive_original",
      originalTitle: "Original eviction register",
      evidenceFactIds: ["altered_notice_dates", "erased_appeals"],
      verificationFactIds: ["rusk_signature"],
      beneficiaryConsent: {
        policyId: "retain-original-and-declared-privacy",
        allowDeclaredDisclosures: true,
        requireOriginalRetained: true,
      },
      authorityConsent: {
        policyId: "conditional-evidence-for-protection",
        allowPartialReports: true,
      },
      routes: [
        ["archive_reading_room", "archive_catalogue_room"],
        ["archive_reading_room", "archive_steps"],
      ],
    },
  },
];
