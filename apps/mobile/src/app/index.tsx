import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="small">Moshomo</ThemedText>
          <ThemedText type="small">Employee app</ThemedText>
        </View>

        <ThemedView style={styles.heroSection}>
          <ThemedText type="title" style={styles.title}>
            Your shifts, leave, and workforce assistant in one place.
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Moshomo helps employees see upcoming work, request time off, and ask
            Pori simple workforce questions.
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          {['Next shift', 'Leave balance', 'Ask Pori'].map((item) => (
            <ThemedText key={item}>{item}</ThemedText>
          ))}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'stretch',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
  },
  heroSection: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    flex: 1,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'left',
  },
  subtitle: {
    lineHeight: 24,
  },
  stepContainer: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.two,
  },
});
