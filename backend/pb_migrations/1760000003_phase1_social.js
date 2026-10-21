/// <reference path="../pb_data/types.d.ts" />

// Phase 1 social layer: replies, edits, reactions, read receipts and typing.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const messages = app.findCollectionByNameOrId("messages");
    const conversations = app.findCollectionByNameOrId("conversations");

    // A message can quote another message. Deleting the quoted message clears
    // the reference (ON DELETE SET NULL) instead of deleting the reply.
    messages.fields.add(
      new RelationField({
        name: "reply_to",
        type: "relation",
        required: false,
        maxSelect: 1,
        collectionId: messages.id,
        cascadeDelete: false,
      }),
      new DateField({
        name: "edited_at",
        type: "date",
        required: false,
      }),
    );

    // Only the author can edit or delete a message, and only while they are
    // still a participant of the conversation.
    messages.updateRule =
      "author = @request.auth.id && conversation.participants.id ?= @request.auth.id";
    messages.deleteRule =
      "author = @request.auth.id && conversation.participants.id ?= @request.auth.id";

    app.save(messages);

    const reactions = new Collection({
      type: "base",
      name: "message_reactions",
      listRule:
        "message.conversation.created_by = @request.auth.id || message.conversation.participants.id ?= @request.auth.id",
      viewRule:
        "message.conversation.created_by = @request.auth.id || message.conversation.participants.id ?= @request.auth.id",
      createRule:
        '@request.auth.id != "" && user = @request.auth.id && (message.conversation.created_by = @request.auth.id || message.conversation.participants.id ?= @request.auth.id)',
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        {
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
          system: true,
        },
        {
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
          system: true,
        },
        {
          name: "message",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: messages.id,
          cascadeDelete: true,
        },
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        {
          name: "emoji",
          type: "text",
          required: true,
          max: 16,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_message_reactions_unique ON message_reactions (message, user, emoji)",
        "CREATE INDEX idx_message_reactions_message ON message_reactions (message)",
      ],
    });

    app.save(reactions);

    // One row per participant per conversation holding the newest message they
    // have read. Read receipts are derived by comparing last_read_at with a
    // message's server timestamp.
    const reads = new Collection({
      type: "base",
      name: "conversation_reads",
      listRule:
        "conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id",
      viewRule:
        "conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id",
      createRule:
        '@request.auth.id != "" && user = @request.auth.id && (conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id)',
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        {
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
          system: true,
        },
        {
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
          system: true,
        },
        {
          name: "conversation",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: conversations.id,
          cascadeDelete: true,
        },
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        {
          name: "last_read_message",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: messages.id,
          cascadeDelete: false,
        },
        {
          name: "last_read_at",
          type: "date",
          required: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_conversation_reads_unique ON conversation_reads (conversation, user)",
      ],
    });

    app.save(reads);

    // Ephemeral typing heartbeats. The client only shows entries whose
    // last_seen is recent; a cron in pb_hooks removes abandoned rows.
    const typing = new Collection({
      type: "base",
      name: "typing_indicators",
      listRule:
        "conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id",
      viewRule:
        "conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id",
      createRule:
        '@request.auth.id != "" && user = @request.auth.id && (conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id)',
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        {
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
          system: true,
        },
        {
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
          system: true,
        },
        {
          name: "conversation",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: conversations.id,
          cascadeDelete: true,
        },
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        {
          name: "last_seen",
          type: "date",
          required: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_typing_indicators_unique ON typing_indicators (conversation, user)",
        "CREATE INDEX idx_typing_indicators_last_seen ON typing_indicators (last_seen)",
      ],
    });

    app.save(typing);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("typing_indicators"));
    app.delete(app.findCollectionByNameOrId("conversation_reads"));
    app.delete(app.findCollectionByNameOrId("message_reactions"));

    const messages = app.findCollectionByNameOrId("messages");
    messages.fields.removeByName("reply_to");
    messages.fields.removeByName("edited_at");
    messages.updateRule = "author = @request.auth.id";
    messages.deleteRule = "author = @request.auth.id";
    app.save(messages);
  },
);
