import { Redirect } from "expo-router";

// /orders/new is the wizard's entry — always drops the user on step 1.
// The draft context (persisted) means step 1 will already have the
// customer prefilled if one was picked in a previous, uncompleted run.
export default function NewOrderIndex() {
  return <Redirect href="/(staff)/orders/new/customer" />;
}
