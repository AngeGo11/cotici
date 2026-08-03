import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { fetchChatMessages, sendChatMessage, type ChatMessage } from '@/shared/api';

const POLL_INTERVAL_MS = 4000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string; members?: string }>();
  const tontineId = typeof params.id === 'string' ? parseInt(params.id, 10) : NaN;
  const validId = Number.isFinite(tontineId) && tontineId > 0;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState(typeof params.name === 'string' ? params.name : 'Discussion');
  const [members, setMembers] = useState(
    typeof params.members === 'string' ? parseInt(params.members, 10) || 0 : 0,
  );
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const lastIdRef = useRef(0);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const loadInitial = useCallback(async () => {
    if (!validId) {
      setError('Tontine introuvable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetchChatMessages(tontineId);
    if (res.ok) {
      setMessages(res.data.results);
      setTitle(res.data.tontine_nom);
      setMembers(res.data.membres_actifs);
      lastIdRef.current = res.data.results.at(-1)?.id ?? 0;
      scrollToEnd();
    } else {
      setError(res.detail);
    }
    setLoading(false);
  }, [tontineId, validId, scrollToEnd]);

  const poll = useCallback(async () => {
    if (!validId) return;
    const res = await fetchChatMessages(tontineId, lastIdRef.current);
    if (res.ok && res.data.results.length > 0) {
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const fresh = res.data.results.filter((m) => !existing.has(m.id));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh];
      });
      lastIdRef.current = res.data.results.at(-1)?.id ?? lastIdRef.current;
      scrollToEnd();
    }
  }, [tontineId, validId, scrollToEnd]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!validId) return;
    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll, validId]);

  const send = useCallback(async () => {
    const text = messageText.trim();
    if (!text || sending || !validId) return;
    setSending(true);
    const res = await sendChatMessage(tontineId, text);
    setSending(false);
    if (res.ok) {
      setMessageText('');
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.data.id)) return prev;
        return [...prev, res.data];
      });
      lastIdRef.current = Math.max(lastIdRef.current, res.data.id);
      scrollToEnd();
    } else {
      setError(res.detail);
    }
  }, [messageText, sending, validId, tontineId, scrollToEnd]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.is_me) {
      return (
        <View style={styles.myMessageRow}>
          <View style={styles.myBubble}>
            <Text style={styles.myMessageContent}>{item.contenu}</Text>
          </View>
          <Text style={styles.messageTime}>{formatTime(item.date)}</Text>
        </View>
      );
    }
    return (
      <View style={styles.otherMessageRow}>
        <Text style={styles.senderName}>{item.expediteur_nom}</Text>
        <View style={styles.otherBubble}>
          <Text style={styles.messageContent}>{item.contenu}</Text>
        </View>
        <Text style={styles.messageTime}>{formatTime(item.date)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
          <View style={styles.chatAvatar}>
            <Feather name="users" size={24} color={Colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.chatSubtitle}>
              {members > 0 ? `${members} membre${members > 1 ? 's' : ''}` : 'Discussion de groupe'}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      ) : error && messages.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <AnimatedPressable style={styles.retryButton} onPress={() => void loadInitial()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Feather name="message-circle" size={26} color={Colors.gray[400]} />
              </View>
              <Text style={styles.emptyTitle}>Aucun message</Text>
              <Text style={styles.emptyText}>Lancez la discussion avec votre groupe.</Text>
            </View>
          }
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputArea}>
          <TextInput
            style={styles.textInput}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Écrire un message..."
            placeholderTextColor={Colors.gray[500]}
            multiline
            maxLength={255}
            editable={validId}
          />
          <AnimatedPressable
            style={[styles.sendButton, (!messageText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={send}
            disabled={!messageText.trim() || sending || !validId}
          >
            {sending ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Feather name="send" size={20} color={Colors.white} />
            )}
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Theme.spacing.page, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  chatAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  chatTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  chatSubtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: Theme.spacing.page },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.danger, textAlign: 'center' },
  retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: Theme.radius.pill, backgroundColor: withOpacity(Colors.brand, 0.12) },
  retryText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand },
  messagesList: { paddingHorizontal: Theme.spacing.page, paddingVertical: 24, gap: 12, flexGrow: 1 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontFamily: Fonts.outfit.semiBold, fontSize: 16, color: Colors.gray[800], marginBottom: 6 },
  emptyText: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], textAlign: 'center' },
  myMessageRow: { alignItems: 'flex-end' },
  myBubble: { backgroundColor: Colors.brand, borderRadius: 16, borderTopRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '75%' },
  otherMessageRow: { alignItems: 'flex-start' },
  otherBubble: { backgroundColor: Colors.gray[100], borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '75%' },
  senderName: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4, marginLeft: 4 },
  messageContent: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[900] },
  myMessageContent: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.white },
  messageTime: { fontFamily: Fonts.outfit.regular, fontSize: 11, color: Colors.gray[500], marginTop: 4 },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: Theme.spacing.page, paddingVertical: 16, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  textInput: { flex: 1, maxHeight: 120, backgroundColor: Colors.gray[100], borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[900] },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
});
