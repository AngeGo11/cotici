import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import type { Message } from '@/types';

const initialMessages: Message[] = [
  { id: '1', type: 'system', content: '✅ Moussa a payé sa cotisation (10.000F).' },
  { id: '2', type: 'user', sender: 'Fatou K.', content: 'Parfait ! Merci Moussa 👏', time: '14:32', isMe: false },
  { id: '3', type: 'user', sender: 'Ibrahim S.', content: "J'ai bien reçu la notification", time: '14:35', isMe: false },
  { id: '4', type: 'alert', content: '⚠️ Rappel : Cotisation due demain.' },
  { id: '5', type: 'user', sender: 'Moi', content: 'Merci pour le virement !', time: '15:20', isMe: true },
  { id: '6', type: 'user', sender: 'Amadou B.', content: 'De rien 😊 Tout est ok ?', time: '15:22', isMe: false },
  { id: '7', type: 'user', sender: 'Moi', content: 'Oui parfait, merci encore', time: '15:23', isMe: true },
];

export default function ChatScreen() {
  const router = useRouter();
  const [messageText, setMessageText] = useState('');

  const renderMessage = ({ item }: { item: Message }) => {
    if (item.type === 'system') {
      return (
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }
    if (item.type === 'alert') {
      return (
        <View style={styles.alertBubble}>
          <Text style={styles.alertText}>{item.content}</Text>
        </View>
      );
    }
    if (item.isMe) {
      return (
        <View style={styles.myMessageRow}>
          <View style={styles.myBubble}>
            <Text style={styles.messageContent}>{item.content}</Text>
          </View>
          <Text style={styles.messageTime}>{item.time}</Text>
        </View>
      );
    }
    return (
      <View style={styles.otherMessageRow}>
        <Text style={styles.senderName}>{item.sender}</Text>
        <View style={styles.otherBubble}>
          <Text style={styles.messageContent}>{item.content}</Text>
        </View>
        <Text style={styles.messageTime}>{item.time}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
          <View style={styles.chatAvatar}><Feather name="users" size={24} color={Colors.white} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle} numberOfLines={1}>Tontine Entrepreneurs</Text>
            <Text style={styles.chatSubtitle}>12 Membres</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.moreButton}>
          <Feather name="more-vertical" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={initialMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputArea}>
          <TouchableOpacity style={styles.attachButton}>
            <Feather name="paperclip" size={20} color={Colors.gray[600]} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Écrire un message..."
            placeholderTextColor={Colors.gray[500]}
          />
          <TouchableOpacity style={styles.sendButton} onPress={() => setMessageText('')}>
            <Feather name="send" size={20} color={Colors.white} />
          </TouchableOpacity>
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
  moreButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  messagesList: { paddingHorizontal: Theme.spacing.page, paddingVertical: 24, gap: 12 },
  systemBubble: { alignSelf: 'center', backgroundColor: withOpacity(Colors.success, 0.1), borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: withOpacity(Colors.success, 0.2), maxWidth: '85%' },
  systemText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.success, textAlign: 'center' },
  alertBubble: { alignSelf: 'center', backgroundColor: withOpacity(Colors.brand, 0.1), borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: withOpacity(Colors.brand, 0.2), maxWidth: '85%' },
  alertText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand, textAlign: 'center' },
  myMessageRow: { alignItems: 'flex-end' },
  myBubble: { backgroundColor: Theme.screen.surface, borderRadius: 16, borderTopRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '75%', borderWidth: 1, borderColor: Colors.gray[100] },
  otherMessageRow: { alignItems: 'flex-start' },
  otherBubble: { backgroundColor: Colors.gray[100], borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '75%' },
  senderName: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4, marginLeft: 4 },
  messageContent: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[900] },
  messageTime: { fontFamily: Fonts.outfit.regular, fontSize: 11, color: Colors.gray[500], marginTop: 4 },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: Theme.spacing.page, paddingVertical: 16, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  attachButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, backgroundColor: Colors.gray[100], borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[900] },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
});
