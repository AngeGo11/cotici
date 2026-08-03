// Écran mocké/non branché — masqué tant que l'API n'est pas connectée, voir todolist.md
// (SolidarityScreen.tsx affichait des montants et un historique d'aide codés en dur ;
// aucune route active n'y menait, mais la route est neutralisée par prudence).
import { Redirect } from 'expo-router';

export default function SolidarityRedirect() {
  return <Redirect href="/(tabs)/tontine" />;
}
