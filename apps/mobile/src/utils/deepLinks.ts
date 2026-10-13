// Lineup edits happen in Sleeper's own app: Night Owl is read-only.
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';

export const sleeperAppUrl = (leagueId: string): string => `sleeper://league/${leagueId}`;
export const sleeperWebUrl = (leagueId: string): string => `https://sleeper.com/leagues/${leagueId}/team`;

/** Open a league in the Sleeper app, or on the web when the app isn't installed. */
export async function openSleeperLeague(leagueId: string): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const nativeUri = sleeperAppUrl(leagueId);
  const webFallbackUri = sleeperWebUrl(leagueId);
  try {
    const canOpen = await Linking.canOpenURL(nativeUri);
    await Linking.openURL(canOpen ? nativeUri : webFallbackUri);
  } catch {
    await Linking.openURL(webFallbackUri);
  }
}

/** A draft room on the web (the app opens drafts from its own lobby). */
export async function openSleeperDraft(draftId: string): Promise<void> {
  await Haptics.selectionAsync();
  await Linking.openURL(`https://sleeper.com/draft/nfl/${draftId}`);
}
