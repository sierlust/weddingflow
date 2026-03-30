import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Send } from 'lucide-react-native';
import { useAuth } from '../../../src/context/AuthContext';
import { chatApi, ChatMessage, Thread } from '../../../src/api/chat';

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Vandaag';
  if (d.toDateString() === yesterday.toDateString()) return 'Gisteren';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
}

// Groepeer berichten per dag
function groupByDay(messages: ChatMessage[]) {
  const groups: { day: string; items: ChatMessage[] }[] = [];
  let currentDay = '';
  // messages zijn gesorteerd oud → nieuw
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    if (day !== currentDay) {
      groups.push({ day, items: [] });
      currentDay = day;
    }
    groups[groups.length - 1].items.push(msg);
  }
  return groups;
}

// ─── Hoofd scherm ─────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const router = useRouter();
  const { id: weddingId, title: weddingTitle } = useLocalSearchParams<{ id: string; title: string }>();
  const { user } = useAuth();

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const flatRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgId = useRef<string | null>(null);

  // ── Laad thread + berichten ────────────────────────────────────────────────

  const loadMessages = useCallback(async (threadId: string, silent = false) => {
    try {
      const result = await chatApi.getMessages(threadId);
      const sorted = [...result.messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setMessages((prev) => {
        // Voeg alleen nieuwe toe om re-render te minimaliseren
        const existingIds = new Set(prev.map((m) => m.id));
        const nieuweberichten = sorted.filter((m) => !existingIds.has(m.id));
        if (!nieuweberichten.length) return prev;
        return [...prev, ...nieuweberichten];
      });
      if (sorted.length) lastMsgId.current = sorted[sorted.length - 1].id;
    } catch (e: any) {
      if (!silent) setError(e.message ?? 'Berichten laden mislukt.');
    }
  }, []);

  useEffect(() => {
    if (!weddingId) { setLoading(false); return; }

    (async () => {
      try {
        const t = await chatApi.getOrCreateThread(weddingId);
        setThread(t);
        await loadMessages(t.id);
        // Pollen elke 4 seconden
        pollRef.current = setInterval(() => loadMessages(t.id, true), 4000);
      } catch (e: any) {
        setError(e.message ?? 'Chat kon niet worden geladen.');
      } finally {
        setLoading(false);
      }
    })();

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [weddingId]);

  // Scroll naar laatste bericht
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Stuur bericht ─────────────────────────────────────────────────────────

  async function handleSend() {
    const content = input.trim();
    if (!content || !thread) return;
    setSending(true);
    setInput('');
    try {
      const msg = await chatApi.send(thread.id, content);
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch (e: any) {
      setInput(content); // herstel input bij fout
      Alert.alert('Fout', e.message ?? 'Versturen mislukt.');
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const groups = groupByDay(messages);
  // Flatten voor FlatList met dag-separators
  type ListItem =
    | { kind: 'separator'; day: string; key: string }
    | { kind: 'message'; msg: ChatMessage; key: string };

  const listData: ListItem[] = [];
  for (const g of groups) {
    listData.push({ kind: 'separator', day: g.day, key: `sep-${g.day}` });
    for (const msg of g.items) {
      listData.push({ kind: 'message', msg, key: msg.id });
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'separator') {
      return (
        <View style={s.daySeparator}>
          <View style={s.daySeparatorLine} />
          <Text style={s.daySeparatorText}>{item.day}</Text>
          <View style={s.daySeparatorLine} />
        </View>
      );
    }
    const { msg } = item;
    const isOwn = msg.senderId === user?.id;
    return (
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
        {!isOwn && (
          <View style={s.avatar}>
            <Text style={s.avatarText}>{msg.senderId.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={[s.bubbleBody, isOwn ? s.bubbleBodyOwn : s.bubbleBodyOther]}>
          <Text style={[s.bubbleText, isOwn && s.bubbleTextOwn]}>{msg.content}</Text>
          <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>{formatTime(msg.createdAt)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#8B6E6E" />
        <Text style={s.loadingText}>Chat laden...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle} numberOfLines={1}>{weddingTitle ?? 'Chat'}</Text>
          <Text style={s.headerSub}>Leveranciers groep</Text>
        </View>
      </View>

      {/* Berichten */}
      <FlatList
        ref={flatRef}
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          error
            ? <Text style={s.errorText}>{error}</Text>
            : (
              <View style={s.emptyWrap}>
                <Text style={s.emptyTitle}>Nog geen berichten</Text>
                <Text style={s.emptySub}>Stuur het eerste bericht naar de andere leveranciers.</Text>
              </View>
            )
        }
      />

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Typ een bericht..."
          placeholderTextColor="#bbb"
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!sending}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Send size={18} color="#fff" strokeWidth={2.5} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f8f8f8' },
  loadingText: { color: '#aaa', fontSize: 14 },

  header: {
    backgroundColor: '#8B6E6E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },

  list: { padding: 16, paddingBottom: 8, flexGrow: 1 },

  daySeparator: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16 },
  daySeparatorLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  daySeparatorText: { fontSize: 12, color: '#bbb', fontWeight: '500' },

  bubble: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end', gap: 8 },
  bubbleOwn: { justifyContent: 'flex-end' },
  bubbleOther: { justifyContent: 'flex-start' },

  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#d4b8b8',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  bubbleBody: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 3,
  },
  bubbleBodyOwn: { backgroundColor: '#8B6E6E', borderBottomRightRadius: 4 },
  bubbleBodyOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },

  bubbleText: { fontSize: 15, color: '#333', lineHeight: 21 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTime: { fontSize: 11, color: '#aaa', alignSelf: 'flex-end' },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.65)' },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#aaa' },
  emptySub: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingHorizontal: 32 },
  errorText: { color: '#c0392b', textAlign: 'center', marginTop: 32 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0eded',
  },
  input: {
    flex: 1,
    backgroundColor: '#f4f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    maxHeight: 120,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#8B6E6E',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#d4c5c5' },
});
