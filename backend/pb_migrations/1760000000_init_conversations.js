/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const conversations = new Collection({
      type: "base",
      name: "conversations",
      listRule: "created_by = @request.auth.id || participants.id ?= @request.auth.id",
      viewRule: "created_by = @request.auth.id || participants.id ?= @request.auth.id",
      createRule: '@request.auth.id != "" && created_by = @request.auth.id',
      updateRule: "created_by = @request.auth.id",
      deleteRule: "created_by = @request.auth.id",
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
          name: "title",
          type: "text",
          required: true,
          max: 120,
        },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["direct", "team", "group"],
        },
        {
          name: "created_by",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        {
          name: "participants",
          type: "relation",
          required: true,
          minSelect: 1,
          maxSelect: 100,
          collectionId: users.id,
          cascadeDelete: false,
        },
        {
          name: "last_message_preview",
          type: "text",
          max: 200,
        },
        {
          name: "last_message_at",
          type: "date",
        },
        {
          name: "last_message_author",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
      ],
      indexes: [
        "CREATE INDEX idx_conversations_last_message_at ON conversations (last_message_at)",
      ],
    });

    app.save(conversations);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("conversations"));
  },
);
