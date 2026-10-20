/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // Signed-in users can discover each other so they can start a conversation.
    // Emails stay hidden because emailVisibility is false by default.
    users.listRule = '@request.auth.id != ""';
    users.viewRule = '@request.auth.id != ""';

    const name = users.fields.getByName("name");
    if (name) {
      name.required = true;
      name.max = 80;
    }

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";

    const name = users.fields.getByName("name");
    if (name) {
      name.required = false;
    }

    app.save(users);
  },
);
