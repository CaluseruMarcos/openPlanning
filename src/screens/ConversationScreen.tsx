import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../components/Avatar";
import { EmptyState, LoadingInline } from "../components/Feedback";
import { Header } from "../components/Header";
import {
  firstNames,
  readCoversMessage,
  summarizeReactions,
} from "../lib/messages";
import { styles } from "../styles";
import type {
  Conversation,
  ConversationRead,
  Message,
  Person,
} from "../types";

export function ConversationScreen({
  conversation,
  me,
  loading,
  error,
  sending,
  typingNames,
  replyTo,
  editingMessage,
  reads,
  onBack,
  onSend,
  onSaveEdit,
  onCancelReply,
  onCancelEdit,
  onDetails,
  onOpenMenu,
  onAttach,
  onLongPressMessage,
  onToggleReaction,
  onTyping,
  onStopTyping,
}: {
  conversation: Conversation;
  me: Person;
  loading: boolean;
  error: string | null;
  sending: boolean;
  typingNames: string[];
  replyTo: Message | null;
  editingMessage: Message | null;
  reads: ConversationRead[];
  onBack: () => void;
  onSend: (body: string, replyToId: string | null) => Promise<boolean>;
  onSaveEdit: (messageId: string, body: string) => Promise<boolean>;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onDetails: () => void;
  onOpenMenu: () => void;
  onAttach: () => void;
  onLongPressMessage: (message: Message) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  const canSend = draft.trim().length > 0 && !sending;

  useEffect(() => {
    setDraft("");
  }, [conversation.id]);

  useEffect(() => {
    if (editingMessage) setDraft(editingMessage.body);
  }, [editingMessage?.id]);

  function changeDraft(value: string) {
    setDraft(value);
    if (value.trim().length > 0) {
      onTyping();
    } else {
      onStopTyping();
    }
  }

  async function submit() {
    if (!canSend) return;
    const body = draft.trim();

    if (editingMessage) {
      const saved = await onSaveEdit(editingMessage.id, body);
      if (saved) setDraft("");
      return;
    }

    setDraft("");
    onStopTyping();
    const sent = await onSend(body, replyTo?.id ?? null);
    if (!sent) setDraft(body);
  }

  function readersFor(message: Message): Person[] {
    return reads
      .filter(
        (read) => read.user.id !== me.id && readCoversMessage(read, message),
      )
      .map((read) => read.user);
  }

  const participantNames = conversation.participants
    .map((person) => person.name)
    .join(", ");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { paddingBottom: insets.bottom }]}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <Header
        title={conversation.title}
        onBack={onBack}
        action={{
          label: "⋯",
          onPress: onOpenMenu,
          accessibilityLabel: "Conversation options",
        }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onDetails}
        style={styles.conversationSubheader}
      >
        <Text
          style={typingNames.length > 0 ? styles.typingText : styles.subheaderText}
        >
          {typingNames.length > 0
            ? `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…`
            : `${conversation.participants.length + 1} participants`}
        </Text>
        <Text style={styles.subheaderAction}>Details ›</Text>
      </Pressable>
      <FlatList
        ref={listRef}
        style={styles.flex}
        data={conversation.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messageList,
          conversation.messages.length === 0 && styles.flex,
        ]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          loading ? (
            <LoadingInline label="Loading messages…" />
          ) : (
            <EmptyState
              title="No messages yet"
              body={
                participantNames
                  ? `This is the beginning of your conversation with ${participantNames}.`
                  : "Send the first message to start the conversation."
              }
            />
          )
        }
        renderItem={({ item }) => {
          const mine = item.author.id === me.id;
          const reactions = summarizeReactions(item.reactions, me.id);
          const readers = mine ? readersFor(item) : [];
          return (
            <View style={[styles.messageRow, mine && styles.messageRowMine]}>
              <Avatar person={item.author} size={34} />
              <View style={[styles.messageBody, mine && styles.messageBodyMine]}>
                <View style={[styles.messageMeta, mine && styles.messageMetaMine]}>
                  <Text style={styles.messageAuthor}>
                    {mine ? "You" : item.author.name}
                  </Text>
                  <Text style={styles.timestamp}>{item.createdAt}</Text>
                  {item.editedAt ? (
                    <Text
                      style={[
                        styles.editedLabel,
                        mine && styles.editedLabelMine,
                      ]}
                    >
                      edited
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Message from ${mine ? "you" : item.author.name}`}
                  accessibilityHint="Long press for message actions"
                  onLongPress={() => onLongPressMessage(item)}
                  delayLongPress={250}
                  style={[
                    styles.messageBubble,
                    mine && styles.messageBubbleMine,
                  ]}
                >
                  {item.replyTo ? (
                    <View
                      style={[
                        styles.replyQuote,
                        mine && styles.replyQuoteMine,
                      ]}
                    >
                      <Text
                        style={[
                          styles.replyQuoteAuthor,
                          mine && styles.replyQuoteAuthorMine,
                        ]}
                      >
                        {item.replyTo.author.id === me.id
                          ? "You"
                          : item.replyTo.author.name}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.replyQuoteText,
                          mine && styles.replyQuoteTextMine,
                        ]}
                      >
                        {item.replyTo.body}
                      </Text>
                    </View>
                  ) : null}
                  <Text
                    style={[
                      styles.messageText,
                      mine && styles.messageTextMine,
                    ]}
                  >
                    {item.body}
                  </Text>
                </Pressable>
                {reactions.length > 0 ? (
                  <View
                    style={[
                      styles.reactionRow,
                      mine && styles.reactionRowMine,
                    ]}
                  >
                    {reactions.map((reaction) => (
                      <Pressable
                        key={reaction.emoji}
                        accessibilityRole="button"
                        accessibilityLabel={`React with ${reaction.emoji}`}
                        onPress={() => onToggleReaction(item, reaction.emoji)}
                        style={[
                          styles.reactionChip,
                          reaction.mine && styles.reactionChipMine,
                        ]}
                      >
                        <Text style={styles.reactionChipText}>
                          {reaction.emoji} {reaction.count}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {readers.length > 0 ? (
                  <Text
                    style={[
                      styles.readReceiptText,
                      mine && styles.readReceiptTextMine,
                    ]}
                  >
                    Read by {firstNames(readers)}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}
      {editingMessage ? (
        <View style={styles.composerContext}>
          <View style={styles.flex}>
            <Text style={styles.composerContextLabel}>EDITING MESSAGE</Text>
            <Text numberOfLines={1} style={styles.composerContextText}>
              {editingMessage.body}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
            onPress={() => {
              setDraft("");
              onCancelEdit();
            }}
            hitSlop={8}
          >
            <Text style={styles.composerContextClose}>×</Text>
          </Pressable>
        </View>
      ) : replyTo ? (
        <View style={styles.composerContext}>
          <View style={styles.flex}>
            <Text style={styles.composerContextLabel}>
              REPLYING TO{" "}
              {replyTo.author.id === me.id ? "YOURSELF" : replyTo.author.name.toUpperCase()}
            </Text>
            <Text numberOfLines={1} style={styles.composerContextText}>
              {replyTo.body}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            onPress={onCancelReply}
            hitSlop={8}
          >
            <Text style={styles.composerContextClose}>×</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add attachment"
          style={styles.attachmentButton}
          onPress={onAttach}
        >
          <Text style={styles.attachmentText}>＋</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={changeDraft}
          placeholder={editingMessage ? "Edit message..." : "Write a message..."}
          placeholderTextColor="#8D919C"
          style={styles.composerInput}
          multiline
          accessibilityLabel="Message"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editingMessage ? "Save message" : "Send message"}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submit}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.sendText}>{editingMessage ? "✓" : "↑"}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
