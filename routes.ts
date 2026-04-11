import { createBrowserRouter } from "react-router";
import Root from "./components/Root";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { LoginScreen } from "./components/LoginScreen";
import { OTPScreen } from "./components/OTPScreen";
import { HomeScreen } from "./components/HomeScreen";
import { TontineDetailsScreen } from "./components/TontineDetailsScreen";
import { SavingsGoalScreen } from "./components/SavingsGoalScreen";
import { SolidarityTontineScreen } from "./components/SolidarityTontineScreen";
import { GroupChatScreen } from "./components/GroupChatScreen";
import { AdminManagementScreen } from "./components/AdminManagementScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { CreateSavingsScreen } from "./components/CreateSavingsScreen";
import { CreateClassicTontineScreen } from "./components/CreateClassicTontineScreen";
import { CreateSolidarityTontineScreen } from "./components/CreateSolidarityTontineScreen";
import { CreatePersonalGoalScreen } from "./components/CreatePersonalGoalScreen";
import { TontineConfigurationScreen } from "./components/TontineConfigurationScreen";
import { MakeDepositScreen } from "./components/MakeDepositScreen";
import { CreateAssociationFundScreen } from "./components/CreateAssociationFundScreen";
import { DepositToAccountScreen } from "./components/DepositToAccountScreen";
import { AddToSavingsScreen } from "./components/AddToSavingsScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: WelcomeScreen },
      { path: "login", Component: LoginScreen },
      { path: "otp", Component: OTPScreen },
      { path: "home", Component: HomeScreen },
      { path: "tontine", Component: TontineDetailsScreen },
      { path: "savings", Component: SavingsGoalScreen },
      { path: "solidarity", Component: SolidarityTontineScreen },
      { path: "chat", Component: GroupChatScreen },
      { path: "admin", Component: AdminManagementScreen },
      { path: "profile", Component: ProfileScreen },
      { path: "create-savings", Component: CreateSavingsScreen },
      { path: "create-classic-tontine", Component: CreateClassicTontineScreen },
      { path: "create-solidarity-tontine", Component: CreateSolidarityTontineScreen },
      { path: "create-personal-goal", Component: CreatePersonalGoalScreen },
      { path: "configure-tontine", Component: TontineConfigurationScreen },
      { path: "make-deposit", Component: MakeDepositScreen },
      { path: "create-association-fund", Component: CreateAssociationFundScreen },
      { path: "deposit-to-account", Component: DepositToAccountScreen },
      { path: "add-to-savings", Component: AddToSavingsScreen },
    ],
  },
]);