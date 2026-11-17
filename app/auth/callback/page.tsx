import { AuthShell } from "@/app/_c/AuthShell";
import { Callback } from "./Callback";

export const metadata = { title: "RunBabyRun" };
export default function CallbackPage() {
  return <AuthShell title="One moment"><Callback /></AuthShell>;
}
