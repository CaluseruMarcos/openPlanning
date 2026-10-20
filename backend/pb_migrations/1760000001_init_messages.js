/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const conversations = app.findCollectionByNameOrId("conversations");
    const users = app.findCollectionByNameOrId("users");

    const messages = new Collection({
      type: "base",
      name: "messages",
      listRule:
        "conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id",
      viewRule:
        "conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id",
      createRule:
        '@request.auth.id != "" && author = @request.auth.id && (conversation.created_by = @request.auth.id || conversation.participants.id ?= @request.auth.id)',
      updateRule: "author = @request.auth.id",
      deleteRule: "author = @request.auth.id",
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
          name: "author",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
        {
          name: "body",
          type: "text",
          required: true,
          max: 4000,
        },
      ],
      indexes: [
        "CREATE INDEX idx_messages_conversation_created ON messages (conversation, created)",
      ],
    });

    app.save(messages);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("messages"));
  },
);
