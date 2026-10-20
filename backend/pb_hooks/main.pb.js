/// <reference path="../pb_data/types.d.ts" />

// Keep the conversation summary in sync whenever a message is created.
// Runs for API requests and for records created server-side (seed script).
onRecordAfterCreateSuccess((e) => {
  try {
    const conversation = e.app.findRecordById(
      "conversations",
      e.record.get("conversation"),
    );

    conversation.set("last_message_preview", e.record.get("body"));
    conversation.set("last_message_at", e.record.get("created"));
    conversation.set("last_message_author", e.record.get("author"));

    e.app.save(conversation);
  } catch (error) {
    console.error("failed to update conversation summary", error);
  }

  e.next();
}, "messages");

// Recompute the summary when a message is deleted.
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
    console.error("failed to refresh conversation summary", error);
  }

  e.next();
}, "messages");
