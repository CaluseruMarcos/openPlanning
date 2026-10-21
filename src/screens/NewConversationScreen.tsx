import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../components/Avatar";
import { EmptyState, LoadingInline } from "../components/Feedback";
import { Header } from "../components/Header";
import { styles } from "../styles";
import type { Person } from "../types";

export function NewConversationScreen({
  me,
  people,
  loading,
  busy,
  onBack,
  onPick,
}: {
  me: Person;
  people: Person[];
  loading: boolean;
  busy: boolean;
  onBack: () => void;
  onPick: (person: Person) => void;
}) {
  const insets = useSafeAreaInsets();
  const available = people.filter((person) => person.id !== me.id);

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <Header title="New message" onBack={onBack} />
      {busy ? (
        <LoadingInline label="Creating conversation…" />
      ) : (
        <FlatList
          data={available}
          keyExtractor={(person) => person.id}
          contentContainerStyle={styles.newMessageContent}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionLabel}>TO</Text>
              <Text style={styles.newMessageHint}>
                Choose a person to message.
              </Text>
              {loading ? <LoadingInline label="Loading people…" /> : null}
            </View>
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                title="No teammates yet"
                body="Create another account or run the seed script to start a conversation."
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${item.name}`}
              onPress={() => onPick(item)}
              style={({ pressed }) => [
                styles.personRow,
                pressed && styles.pressed,
              ]}
            >
              <Avatar person={item} size={42} />
              <View style={styles.flex}>
                <Text style={styles.personName}>{item.name}</Text>
                <Text style={styles.personHint}>Direct message</Text>
              </View>
              <Text style={styles.sheetChevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
