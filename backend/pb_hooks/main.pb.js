/// <reference path="../pb_data/types.d.ts" />

// A message may only be edited by its author. The update rule already enforces
// that, but the API should not allow moving a message to another conversation
// or attributing it to another author.
onRecordUpdateRequest((e) => {
  const original = e.record.original();
  if (
    original &&
    (original.get("conversation") !== e.record.get("conversation") ||
      original.get("author") !== e.record.get("author"))
  ) {
    throw new BadRequestError(
      "A message's conversation and author cannot be changed.",
    );
  }

  e.next();
}, "messages");

// Keep the denormalised conversation summary in sync with its newest message.
// The hook runtime evaluates each handler separately, so the lookup is inlined
// instead of being shared through a module-level helper.
onRecordAfterCreateSuccess((e) => {
  try {
    const conversationId = e.record.get("conversation");
    const conversation = e.app.findRecordById("conversations", conversationId);
    const latest = e.app.findRecordsByFilter(
      "messages",
      "conversation = {:conversation}",
      "-created",
      1,
      0,
      { conversation: conversationId },
    );

    if (latest.length > 0) {
      const last = latest[0];
      conversation.set("last_message_preview", last.get("body"));
      conversation.set("last_message_at", last.get("created"));
      conversation.set("last_message_author", last.get("author"));
    } else {
      conversation.set("last_message_preview", "");
      conversation.set("last_message_at", "");
      conversation.set("last_message_author", "");
    }

    e.app.save(conversation);
  } catch (error) {
    console.error("failed to update conversation summary", error);
  }

  e.next();
}, "messages");

// Editing a message can change the conversation preview when it is the newest
// message, so refresh the summary from the newest row.
onRecordAfterUpdateSuccess((e) => {
  try {
    const conversationId = e.record.get("conversation");
    const conversation = e.app.findRecordById("conversations", conversationId);
    const latest = e.app.findRecordsByFilter(
      "messages",
      "conversation = {:conversation}",
      "-created",
      1,
      0,
      { conversation: conversationId },
    );

    if (latest.length > 0) {
      const last = latest[0];
      conversation.set("last_message_preview", last.get("body"));
      conversation.set("last_message_at", last.get("created"));
      conversation.set("last_message_author", last.get("author"));
    } else {
      conversation.set("last_message_preview", "");
      conversation.set("last_message_at", "");
      conversation.set("last_message_author", "");
    }

    e.app.save(conversation);
  } catch (error) {
    console.error("failed to refresh conversation summary", error);
  }

  e.next();
}, "messages");

onRecordAfterDeleteSuccess((e) => {
  try {
    const conversationId = e.record.get("conversation");
    const conversation = e.app.findRecordById("conversations", conversationId);
    const latest = e.app.findRecordsByFilter(
      "messages",
      "conversation = {:conversation}",
      "-created",
      1,
      0,
      { conversation: conversationId },
    );

    if (latest.length > 0) {
      const last = latest[0];
      conversation.set("last_message_preview", last.get("body"));
      conversation.set("last_message_at", last.get("created"));
      conversation.set("last_message_author", last.get("author"));
    } else {
      conversation.set("last_message_preview", "");
      conversation.set("last_message_at", "");
      conversation.set("last_message_author", "");
    }

    e.app.save(conversation);
  } catch (error) {
    // Deleting a conversation cascades to its messages; the conversation is
    // already gone in that case, so there is nothing left to refresh.
    console.error("failed to refresh conversation summary", error);
  }

  e.next();
}, "messages");

// Typing rows are heartbeats. Remove abandoned ones so the collection does not
// grow forever if a client closes without clearing its indicator.
cronAdd("typing_cleanup", "*/2 * * * *", () => {
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000)
      .toISOString()
      .replace("T", " ");
    const stale = $app.findRecordsByFilter(
      "typing_indicators",
      "last_seen < {:cutoff}",
      "",
      200,
      0,
      { cutoff },
    );

    for (const record of stale) {
      $app.delete(record);
    }
  } catch (error) {
    console.error("failed to clean up typing indicators", error);
  }
});
